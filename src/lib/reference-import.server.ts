/**
 * Imports published inscription records into the Athar reference library.
 *
 * Source: the official OCIANA corpus export hosted by the Oxford University
 * Research Archive (XML, 37,955 records with siglum, script, transliteration,
 * translation and the record URL). OCIANA publishes no documented public API,
 * so this is a one-off import of the published dataset, fetched server-side
 * from its official location and stored with its provenance. Records are used
 * for comparison only; a similar published inscription is never treated as a
 * verified match.
 */

export const OCIANA_COLLECTION = {
  source: "OCIANA",
  version: "OCIANA-ORA-XML",
  sourceUrl:
    "https://ora.ox.ac.uk/objects/uuid:08a60ae8-e61d-486e-9ef1-836ca71d904c/files/mc562d7869379fa3570db57cd9ed0c28c",
  landingUrl: "https://ora.ox.ac.uk/objects/uuid:08a60ae8-e61d-486e-9ef1-836ca71d904c",
  licenseNote:
    "OCIANA corpus export (37,955 records) deposited in the Oxford University Research Archive. Governed by the ORA Terms and Conditions of Use (https://ora.ox.ac.uk/terms_of_use); imported for scholarly comparison with record-level attribution and links back to the source. No open CC licence is asserted.",
} as const;

export type RefRecord = {
  source: string;
  siglum: string;
  alt_sigla: string | null;
  script: string | null;
  language: string | null;
  transliteration: string | null;
  transliteration_plain: string | null;
  translation: string | null;
  site: string | null;
  provenance_notes: string | null;
  reference: string | null;
  url: string | null;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decode(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

function field(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  const value = m ? decode(m[1] ?? "").trim() : "";
  return value.length > 0 ? value : null;
}

/** Letters only, lower-cased: the form used for letter-shape similarity search. */
export function plainForm(transliteration: string | null) {
  if (!transliteration) return null;
  const plain = transliteration
    .toLowerCase()
    .replace(/[^\p{L}\p{M} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 0 ? plain : null;
}

function toRecord(block: string): RefRecord | null {
  const siglum = field(block, "siglum");
  if (!siglum) return null;
  const transliteration = field(block, "transliteration");
  return {
    source: OCIANA_COLLECTION.source,
    siglum,
    alt_sigla: field(block, "alternativeSigla"),
    script: field(block, "script"),
    language: field(block, "language"),
    transliteration,
    transliteration_plain: plainForm(transliteration),
    translation: field(block, "translation"),
    site: field(block, "site"),
    provenance_notes: field(block, "provenanceNotes"),
    reference: field(block, "reference"),
    url: field(block, "url"),
  };
}

/**
 * Streams the published XML and yields the records in document order,
 * starting at `offset` and stopping after `limit` records so a large corpus
 * can be imported across several requests without buffering the whole file.
 */
export async function fetchRecords(
  offset: number,
  limit: number,
): Promise<{ records: RefRecord[]; nextOffset: number; done: boolean }> {
  const res = await fetch(OCIANA_COLLECTION.sourceUrl);
  if (!res.ok || !res.body)
    throw new Error(`The reference source could not be downloaded (status ${res.status}).`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const records: RefRecord[] = [];
  let buf = "";
  let index = 0;
  let done = false;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      done = true;
      break;
    }
    buf += decoder.decode(chunk.value, { stream: true });
    for (;;) {
      const start = buf.indexOf("<inscription>");
      if (start < 0) break;
      const end = buf.indexOf("</inscription>", start);
      if (end < 0) break;
      const block = buf.slice(start, end);
      buf = buf.slice(end + "</inscription>".length);
      if (index >= offset) {
        const rec = toRecord(block);
        if (rec) records.push(rec);
      }
      index += 1;
      if (records.length >= limit) break;
    }
    if (records.length >= limit) break;
  }

  await reader.cancel().catch(() => undefined);
  return { records, nextOffset: index, done: done && records.length < limit };
}
