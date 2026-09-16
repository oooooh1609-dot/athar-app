/**
 * Field report as a PDF.
 *
 * Built as a print-styled document and handed to the browser's own print
 * pipeline, which every platform can already turn into a PDF — "Save as PDF"
 * on desktop, "Print → PDF" in the iOS and Android share sheets. That avoids
 * adding a PDF library (~300 KB before fonts) to a bundle this app already
 * loads over field connections, and it sidesteps the harder problem such
 * libraries have with Arabic: shaping and right-to-left layout come free from
 * the browser's text engine and are frequently wrong in JS PDF writers.
 *
 * The trade is that the user passes through a print dialog rather than getting
 * a file directly. If a one-tap download becomes necessary, this module is the
 * seam to replace: everything else works against `buildReportHtml`.
 */

import type { AtharProject } from "./athar-db";
import { describe, evaluate, type MeasurementSet } from "./measure";
import { formatDecimal, formatDms, type GeoFix } from "./geo";

export type ReportStrings = {
  reportTitle: string;
  recordedOn: string;
  notes: string;
  photographs: string;
  original: string;
  enhanced: string;
  processingNote: string;
  location: string;
  coordinates: string;
  accuracy: string;
  altitude: string;
  locationWithheld: string;
  measurements: string;
  scaleReference: string;
  measurementCaveat: string;
  reading: string;
  script: string;
  direction: string;
  transliteration: string;
  proposedReading: string;
  meaning: string;
  uncertainties: string;
  alternatives: string;
  machineCaveat: string;
  corrections: string;
  references: string;
  page: string;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read the image"));
    r.readAsDataURL(blob);
  });

/**
 * Print stylesheet.
 *
 * `break-inside: avoid` on each section is what stops a photograph and its
 * caption landing on opposite pages, which is the usual failure of
 * HTML-to-print reports.
 */
const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #16130f;
  }
  h1 { font-size: 19pt; margin: 0 0 2mm; letter-spacing: .01em; }
  h2 {
    font-size: 11pt; margin: 7mm 0 2mm; padding-bottom: 1mm;
    border-bottom: .4pt solid #b9ae9c; text-transform: uppercase; letter-spacing: .12em;
  }
  .sub { color: #6b6055; font-size: 9pt; margin: 0; }
  section { break-inside: avoid; }
  figure { margin: 0 0 4mm; break-inside: avoid; }
  figure img { width: 100%; max-height: 105mm; object-fit: contain; border: .4pt solid #d6ccbb; }
  figcaption { font-size: 8.5pt; color: #6b6055; margin-top: 1mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { text-align: start; vertical-align: top; padding: 1.4mm 2mm; border-bottom: .3pt solid #e2d9c9; }
  th { width: 34%; font-weight: 600; color: #4a4238; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 9pt; }
  .caveat {
    background: #f6f1e7; border-inline-start: 1mm solid #b9975b;
    padding: 2.5mm 3mm; font-size: 9pt; color: #4a4238; margin: 2mm 0 0;
  }
  .refs { font-size: 8.5pt; color: #4a4238; padding-inline-start: 4mm; margin: 0; }
  .refs li { margin-bottom: .8mm; word-break: break-all; }
  footer { margin-top: 8mm; padding-top: 2mm; border-top: .3pt solid #d6ccbb; font-size: 8pt; color: #8a7f72; }
  @media screen { body { max-width: 190mm; margin: 8mm auto; padding: 0 6mm; } }
`;

const row = (label: string, value: string | undefined | null) =>
  value && value.trim()
    ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    : "";

function locationSection(fix: GeoFix | undefined, s: ReportStrings, withhold: boolean) {
  if (!fix) return "";
  if (withhold)
    return `<section><h2>${escapeHtml(s.location)}</h2><p class="caveat">${escapeHtml(s.locationWithheld)}</p></section>`;
  return `<section><h2>${escapeHtml(s.location)}</h2><table>
    ${row(s.coordinates, `${formatDms(fix)}  ·  ${formatDecimal(fix)}`)}
    ${row(s.accuracy, `± ${Math.round(fix.accuracyM)} m`)}
    ${fix.altitudeM === undefined ? "" : row(s.altitude, `${Math.round(fix.altitudeM)} m`)}
  </table></section>`;
}

function measurementSection(set: MeasurementSet | undefined, s: ReportStrings) {
  if (!set?.reference || set.items.length === 0) return "";
  const rows = set.items
    .map((m) => {
      const q = evaluate(m, set.reference);
      return q ? row(m.label || m.kind, describe(q, m.kind)) : "";
    })
    .join("");
  if (!rows) return "";
  return `<section><h2>${escapeHtml(s.measurements)}</h2><table>
    ${row(s.scaleReference, `${set.reference.label} — ${set.reference.realMm} mm`)}
    ${rows}
  </table><p class="caveat">${escapeHtml(s.measurementCaveat)}</p></section>`;
}

/** Assembles the whole document. Images are inlined so the file is self-contained. */
export async function buildReportHtml(
  project: AtharProject,
  s: ReportStrings,
  opts: { dir: "rtl" | "ltr"; lang: string; withholdLocation?: boolean },
): Promise<string> {
  const [original, enhanced] = await Promise.all([
    project.original ? blobToDataUrl(project.original).catch(() => null) : null,
    project.enhanced ? blobToDataUrl(project.enhanced).catch(() => null) : null,
  ]);

  const figures = [
    original
      ? `<figure><img src="${original}" alt=""><figcaption>${escapeHtml(s.original)}</figcaption></figure>`
      : "",
    enhanced
      ? `<figure><img src="${enhanced}" alt=""><figcaption>${escapeHtml(s.enhanced)}</figcaption></figure>`
      : "",
  ].filter(Boolean);

  const r = project.machineReading;
  const readingBlock = r
    ? `<section><h2>${escapeHtml(s.reading)}</h2><table>
        ${row(s.script, r.script)}
        ${row(s.direction, r.direction)}
        ${row(s.transliteration, r.transliteration)}
        ${row(s.proposedReading, r.proposedReading)}
        ${row(s.meaning, r.meaning)}
        ${row(s.uncertainties, r.uncertainties)}
        ${row(s.alternatives, r.alternatives)}
      </table>
      <p class="caveat">${escapeHtml(s.machineCaveat)}</p>
      ${
        r.references.length
          ? `<h2>${escapeHtml(s.references)}</h2><ol class="refs">${r.references
              .map((x) => `<li>${escapeHtml(x.title)} — ${escapeHtml(x.url)}</li>`)
              .join("")}</ol>`
          : ""
      }</section>`
    : "";

  const corrections = project.versions.filter((v) => v.source === "user" && v.text);
  const correctionBlock = corrections.length
    ? `<section><h2>${escapeHtml(s.corrections)}</h2><table>${corrections
        .map((v) =>
          row(
            new Date(v.createdAt).toLocaleDateString(opts.lang),
            `${v.text}${v.reason ? ` — ${v.reason}` : ""}`,
          ),
        )
        .join("")}</table></section>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(opts.lang)}" dir="${opts.dir}">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(project.name || s.reportTitle)}</title>
<style>${CSS}</style></head>
<body>
  <h1>${escapeHtml(project.name || s.reportTitle)}</h1>
  <p class="sub">${escapeHtml(s.recordedOn)} ${escapeHtml(
    new Date(project.createdAt).toLocaleString(opts.lang),
  )}</p>
  ${project.notes ? `<section><h2>${escapeHtml(s.notes)}</h2><p>${escapeHtml(project.notes)}</p></section>` : ""}
  ${
    figures.length
      ? `<section><h2>${escapeHtml(s.photographs)}</h2>
         <div class="${figures.length > 1 ? "grid" : ""}">${figures.join("")}</div>
         ${enhanced ? `<p class="caveat">${escapeHtml(s.processingNote)}</p>` : ""}</section>`
      : ""
  }
  ${locationSection(project.location, s, Boolean(opts.withholdLocation))}
  ${measurementSection(project.measurements, s)}
  ${readingBlock}
  ${correctionBlock}
  <footer>${escapeHtml(s.page)}</footer>
</body></html>`;
}

/**
 * Opens the report and triggers the print dialog.
 *
 * An iframe rather than `window.open`, because a popup blocker will silently
 * swallow the new window on mobile and the user gets nothing with no
 * explanation. The iframe is removed once printing returns.
 */
export function printReport(html: string): { ok: boolean; error?: string } {
  if (typeof document === "undefined") return { ok: false, error: "No document" };
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return { ok: false, error: "Could not prepare the report." };
  }

  doc.open();
  doc.write(html);
  doc.close();

  const go = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // Safari needs the frame alive until the dialog has been dismissed.
      setTimeout(() => frame.remove(), 60_000);
    }
  };

  // Images are data URLs, but decoding still takes a tick on a large photo.
  if (doc.readyState === "complete") setTimeout(go, 120);
  else win.addEventListener("load", () => setTimeout(go, 120), { once: true });

  return { ok: true };
}
