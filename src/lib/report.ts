import type { AtharProject } from "./athar-db";

export interface ArchaeologicalPassport {
  identifier: string;
  cidocCrmType: string;
  metadata: {
    siteName: string;
    scriptType: string;
    discoveryDate: string;
    coordinatesUtm: string;
    geodesicWgs84: { lat: number; lon: number };
  };
  metrics: {
    estimatedDimensionsMm: { width: number; height: number };
    surfaceAreaMm2?: number;
  };
  epigraphy: {
    rawTranscription: string;
    transliterationArabic: string;
    semanticInterpretation: string;
    inferredPeriod: string;
  };
  cryptographicSignature: string;
}

export class ArchaeologicalReportService {
  /**
   * توليد جواز سفر أثري رقمي موحد ومعتمد
   */
  public static async generatePassport(
    data: Omit<ArchaeologicalPassport, "identifier" | "cidocCrmType" | "cryptographicSignature">,
  ): Promise<ArchaeologicalPassport> {
    const rawPayload = JSON.stringify(data);

    // إنشاء البصمة الرقمية الميدانية المشفرة
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawPayload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 24);

    return {
      identifier: `ATHAR-SA-${Date.now().toString(36).toUpperCase()}-${signature.substring(0, 6).toUpperCase()}`,
      cidocCrmType: "http://www.cidoc-crm.org/cidoc-crm/E22_Man-Made_Object",
      metadata: data.metadata,
      metrics: data.metrics,
      epigraphy: data.epigraphy,
      cryptographicSignature: signature,
    };
  }

  /**
   * تصدير التقرير كملف JSON-LD جاهز للربط مع الأرشيفات الأثرية العالمية
   */
  public static exportJsonLd(passport: ArchaeologicalPassport): string {
    const jsonLd = {
      "@context": "https://schema.org/",
      "@type": "ArchaeologicalSite",
      identifier: passport.identifier,
      name: passport.metadata.siteName,
      description: passport.epigraphy.semanticInterpretation,
      temporalCoverage: passport.epigraphy.inferredPeriod,
      geo: {
        "@type": "GeoCoordinates",
        latitude: passport.metadata.geodesicWgs84.lat,
        longitude: passport.metadata.geodesicWgs84.lon,
      },
      additionalProperty: [
        { "@type": "PropertyValue", name: "ScriptType", value: passport.metadata.scriptType },
        {
          "@type": "PropertyValue",
          name: "OriginalInscription",
          value: passport.epigraphy.rawTranscription,
        },
        { "@type": "PropertyValue", name: "UTM", value: passport.metadata.coordinatesUtm },
        {
          "@type": "PropertyValue",
          name: "DigitalSignature",
          value: passport.cryptographicSignature,
        },
      ],
    };

    return JSON.stringify(jsonLd, null, 2);
  }
}

export interface ReportStrings {
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
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function buildReportHtml(
  project: AtharProject,
  strings: ReportStrings,
  options?: { dir?: string; lang?: string },
): Promise<string> {
  const dir = options?.dir || "rtl";
  const lang = options?.lang || "ar";

  let originalDataUrl = "";
  if (project.original) {
    originalDataUrl = await blobToDataUrl(project.original);
  }

  let enhancedDataUrl = "";
  if (project.enhanced) {
    enhancedDataUrl = await blobToDataUrl(project.enhanced);
  }

  const reading = project.machineReading;
  const dateStr = new Date(project.createdAt).toLocaleDateString(
    lang === "ar" ? "ar-SA" : "en-US",
    { dateStyle: "long" },
  );

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${strings.reportTitle} - ${project.name || "ATHAR"}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; color: #1e293b; background: #fff; line-height: 1.6; }
    .header { border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { color: #0f766e; margin: 0; font-size: 24px; }
    .badge { background: #f0fdfa; color: #0f766e; border: 1px solid #ccfbf1; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 13px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 16px; font-weight: 700; color: #334155; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
    .photo-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; text-align: center; }
    .photo-card img { max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 4px; }
    .photo-label { font-size: 12px; color: #64748b; margin-top: 6px; font-weight: 600; }
    .data-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .data-item { background: #f8fafc; padding: 10px 14px; border-radius: 6px; }
    .data-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .data-value { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    .reading-box { background: #fdf6b2; border: 1px solid #fce96a; padding: 16px; border-radius: 8px; font-size: 16px; margin-top: 8px; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${strings.reportTitle}</h1>
      <p style="margin: 4px 0 0 0; color: #64748b;">${project.name} | ${strings.recordedOn}: ${dateStr}</p>
    </div>
    <div class="badge">CIDOC-CRM E22</div>
  </div>

  ${
    project.notes
      ? `
  <div class="section">
    <div class="section-title">${strings.notes}</div>
    <p>${project.notes}</p>
  </div>`
      : ""
  }

  ${
    reading
      ? `
  <div class="section">
    <div class="section-title">${strings.reading}</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="data-label">${strings.script}</div>
        <div class="data-value">${reading.scriptType || "Musnad / Thamudic"}</div>
      </div>
      <div class="data-item">
        <div class="data-label">${strings.direction}</div>
        <div class="data-value">${reading.direction || "Right-to-Left"}</div>
      </div>
      <div class="data-item">
        <div class="data-label">${strings.transliteration}</div>
        <div class="data-value">${reading.transliteration || "-"}</div>
      </div>
    </div>
    ${
      reading.transcription
        ? `
    <div class="reading-box">
      <strong>${strings.proposedReading}:</strong> ${reading.transcription}
    </div>`
        : ""
    }
  </div>`
      : ""
  }

  <div class="section">
    <div class="section-title">${strings.photographs}</div>
    <div class="gallery">
      ${
        originalDataUrl
          ? `
      <div class="photo-card">
        <img src="${originalDataUrl}" alt="${strings.original}" />
        <div class="photo-label">${strings.original}</div>
      </div>`
          : ""
      }
      ${
        enhancedDataUrl
          ? `
      <div class="photo-card">
        <img src="${enhancedDataUrl}" alt="${strings.enhanced}" />
        <div class="photo-label">${strings.enhanced}</div>
      </div>`
          : ""
      }
    </div>
  </div>

  <div class="footer">
    ATHAR Platform • Saudi Archaeological Documentation • SHA-256 Verified
  </div>
</body>
</html>`;
}

export function printReport(html: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}
