/**
 * Athar alphabet pack: importer + the bundled pack that shipped with the app.
 *
 * The pack is reference data only — letter inventories, transliteration values
 * where they exist, and bounding boxes into two supplied chart images. Loading a
 * pack is reference loading; it does not train any image-recognition model.
 */

import bundled from "./alphabet-pack.json";

export type PackSource = {
  id: string;
  filename: string;
  width: number;
  height: number;
  description: string;
  rights_status?: string;
  academic_review?: string;
  /** Resolved image URL for a source bundled with the app. */
  assetUrl?: string;
  /** Decoded object URL for a source imported at runtime from a data URI. */
  objectUrl?: string;
};

export type ReferenceRegion = {
  source_id: string;
  bbox_xyxy: [number, number, number, number];
  style?: string;
  source_column?: string;
  kind?: string;
  contains_multiple_shapes?: boolean;
  may_be_blank?: boolean;
  review_status?: string;
};

export type PackLetter = {
  id: string;
  script_id: string;
  source_row?: number;
  unicode_character: string | null;
  codepoint?: string;
  unicode_name?: string;
  arabic_display: string;
  transliteration: string | null;
  meaning: string | null;
  /** Supplied glyph image for this sign, when the pack ships one per letter. */
  glyph_image_data_uri?: string;
  reference_regions: ReferenceRegion[];
  keyboard_enabled: boolean;
  notes?: string;
};

export type PackScript = {
  id: string;
  label_en: string;
  letter_count: number;
  storage: string;
  display_direction: string;
  scope: string;
};

export type SpecialKey = {
  id: string;
  label: string;
  value?: string;
  action?: string;
  script?: string;
  notes?: string;
};

export type AlphabetPack = {
  format: string;
  schema_version: string;
  created?: string;
  title_ar?: string;
  important_ar?: string;
  capabilities: Record<string, boolean>;
  sources: PackSource[];
  scripts: PackScript[];
  letters: PackLetter[];
  special_keys: SpecialKey[];
  external_references: { id: string; url: string; use: string }[];
  review_queue?: string[];
  counts?: Record<string, number>;
};

const asArray = (v: unknown) => (Array.isArray(v) ? v : []);

/**
 * Validates and normalizes an `athar-alphabet-pack` JSON file. Embedded
 * `image_data_uri` sources are decoded into blob URLs so the real chart images
 * can be shown; nothing is fetched from the network.
 */
export function parseAlphabetPack(raw: unknown): AlphabetPack {
  const d = raw as Record<string, unknown>;
  if (!d || typeof d !== "object") throw new Error("Not a JSON object.");
  if (d["format"] !== "athar-alphabet-pack")
    throw new Error('Unsupported file: "format" must be "athar-alphabet-pack".');

  const sources: PackSource[] = asArray(d["sources"]).map((sItem: unknown) => {
    const s = sItem as Record<string, unknown>;
    const src: PackSource = {
      id: String(s.id),
      filename: String(s.filename ?? ""),
      width: Number(s.width) || 0,
      height: Number(s.height) || 0,
      description: String(s.description ?? ""),
      rights_status: s.rights_status as PackSource["rights_status"],
      academic_review: s.academic_review as PackSource["academic_review"],
      assetUrl: s.assetUrl as string | undefined,
    };
    if (typeof s.image_data_uri === "string" && s.image_data_uri.startsWith("data:")) {
      src.objectUrl = dataUriToObjectUrl(s.image_data_uri);
    }
    return src;
  });

  const letters: PackLetter[] = asArray(d["letters"]).map((lItem: unknown) => {
    const l = lItem as Record<string, unknown>;
    return {
      id: String(l.id),
      script_id: String(l.script_id),
      source_row: (l.source_row as number | undefined) ?? undefined,
      unicode_character: (l.unicode_character as string | null) ?? null,
      codepoint: (l.codepoint as string | undefined) ?? undefined,
      unicode_name: (l.unicode_name as string | undefined) ?? undefined,
      arabic_display: String(l.arabic_display ?? ""),
      ...(typeof l.glyph_image_data_uri === "string" && l.glyph_image_data_uri.startsWith("data:")
        ? { glyph_image_data_uri: l.glyph_image_data_uri as string }
        : {}),
      transliteration: (l.transliteration as string | null) ?? null,
      meaning: (l.meaning as string | null) ?? null,
      reference_regions: asArray(l.reference_regions).map((rItem: unknown) => {
        const r = rItem as Record<string, unknown>;
        return {
          ...r,
          bbox_xyxy: (Array.isArray(r.bbox_xyxy) ? r.bbox_xyxy : []).map(Number) as [
            number,
            number,
            number,
            number,
          ],
        };
      }),
      keyboard_enabled: l.keyboard_enabled !== false,
      notes: (l.notes as string | undefined) ?? undefined,
    };
  });

  if (letters.length === 0) throw new Error("The pack contains no letters.");

  return {
    format: d["format"],
    schema_version: String(d["schema_version"] ?? ""),
    created: d["created"],
    title_ar: d["title_ar"],
    important_ar: d["important_ar"],
    capabilities: (d["capabilities"] ?? {}) as Record<string, boolean>,
    sources,
    scripts: asArray(d["scripts"]) as PackScript[],
    letters,
    special_keys: asArray(d["special_keys"]) as SpecialKey[],
    external_references: asArray(d["external_references"]) as AlphabetPack["external_references"],
    review_queue: asArray(d["review_queue"]) as string[],
    counts: (d["counts"] ?? {}) as Record<string, number>,
  };
}

function dataUriToObjectUrl(uri: string): string {
  const [head, b64] = uri.split(",", 2);
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** The pack imported from the supplied file, bundled with the app. */
export const ALPHABET_PACK: AlphabetPack = parseAlphabetPack(bundled);

export const MUSNAD_SCRIPT = "old_south_arabian";
export const THAMUDIC_SCRIPT = "thamudic_source_table";

export const packLetter = (pack: AlphabetPack, id: string) => pack.letters.find((l) => l.id === id);

export const packSource = (pack: AlphabetPack, id: string) => pack.sources.find((s) => s.id === id);

export const sourceImageUrl = (s?: PackSource) => s?.objectUrl ?? s?.assetUrl ?? "";

export const lettersOf = (pack: AlphabetPack, scriptId: string) =>
  pack.letters.filter((l) => l.script_id === scriptId && l.keyboard_enabled);

/* ------------------------------ inscription ------------------------------ */

export type InscriptionToken =
  | {
      kind: "musnad";
      letterId: string;
      char: string;
      arabic: string;
      translit: string | null;
      uncertain?: boolean;
    }
  | {
      kind: "thamudic";
      letterId: string;
      row: number;
      arabic: string;
      /** The strip the user picked the shape from, in original source pixels. */
      region?: { sourceId: string; column?: string; bbox: [number, number, number, number] };
      /** True when the user narrowed the strip down to one chosen shape. */
      shapeChosen?: boolean;
      uncertain?: boolean;
    }
  | { kind: "space" }
  | { kind: "newline" }
  | { kind: "unknown" };

/** Human-readable line for export and for saving alongside the token list. */
export function tokensToText(tokens: InscriptionToken[]): string {
  return tokens
    .map((t) => {
      if (t.kind === "space") return " ";
      if (t.kind === "newline") return "\n";
      if (t.kind === "unknown") return "?";
      if (t.kind === "musnad") return t.char;
      return `[row ${t.row}:${t.arabic}${t.shapeChosen ? "*" : ""}]`;
    })
    .join("");
}

/** Transliteration only where the pack actually supplies a reviewed value. */
export function tokensToTransliteration(tokens: InscriptionToken[]): {
  text: string;
  missing: number;
} {
  let missing = 0;
  const text = tokens
    .map((t) => {
      if (t.kind === "space") return " ";
      if (t.kind === "newline") return "\n";
      if (t.kind === "unknown") return "?";
      if (t.kind === "musnad" && t.translit) return t.translit;
      missing++;
      return "?";
    })
    .join("");
  return { text, missing };
}
