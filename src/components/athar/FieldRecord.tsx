/**
 * Findspot and field report for one saved project.
 *
 * The coordinate default is deliberate: an unpublished site's position is
 * sensitive, so it is stored locally, never transmitted on its own, and left
 * out of a generated report unless the recorder opts in on each report.
 */

import { useState } from "react";
import { toast } from "sonner";
import { FileText, MapPin, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { saveProject, type AtharProject } from "@/lib/athar-db";
import { captureLocation, fixIsReliable, formatDms, osmUrl } from "@/lib/geo";
import { buildReportHtml, printReport, type ReportStrings } from "@/lib/report";

export function FieldRecord({
  project,
  onSaved,
}: {
  project: AtharProject;
  onSaved?: (p: AtharProject) => void;
}) {
  const { t, lang, dir } = useI18n();
  const [busy, setBusy] = useState<"geo" | "report" | null>(null);
  const [includeLocation, setIncludeLocation] = useState(false);

  const persist = async (next: AtharProject) => {
    await saveProject(next);
    onSaved?.(next);
  };

  const recordPosition = async () => {
    setBusy("geo");
    const res = await captureLocation();
    setBusy(null);
    if (!res.ok) {
      toast.error(t(`geo.${res.reason}`));
      return;
    }
    try {
      await persist({ ...project, location: res.fix });
      if (!fixIsReliable(res.fix))
        toast.warning(t("geo.weak", { m: Math.round(res.fix.accuracyM) }));
    } catch {
      toast.error(t("projects.storageUnavailable"));
    }
  };

  const removePosition = async () => {
    // `exactOptionalPropertyTypes` is on, so the key is dropped rather than
    // set to undefined.
    const { location: _dropped, ...rest } = project;
    try {
      await persist(rest as AtharProject);
    } catch {
      toast.error(t("projects.storageUnavailable"));
    }
  };

  const strings = (): ReportStrings => ({
    reportTitle: t("rp.title"),
    recordedOn: t("rp.h.recordedOn"),
    notes: t("rp.h.notes"),
    photographs: t("rp.h.photographs"),
    original: t("rp.h.original"),
    enhanced: t("rp.h.enhanced"),
    processingNote: t("rp.h.processingNote"),
    location: t("rp.h.location"),
    coordinates: t("rp.h.coordinates"),
    accuracy: t("rp.h.accuracyLabel"),
    altitude: t("rp.h.altitude"),
    locationWithheld: t("rp.h.locationWithheld"),
    measurements: t("rp.h.measurements"),
    scaleReference: t("rp.h.scaleReference"),
    measurementCaveat: t("ms.caveat"),
    reading: t("rp.h.reading"),
    script: t("rp.h.script"),
    direction: t("rp.h.direction"),
    transliteration: t("rp.h.transliteration"),
    proposedReading: t("rp.h.proposedReading"),
    meaning: t("rp.h.meaning"),
    uncertainties: t("rp.h.uncertainties"),
    alternatives: t("rp.h.alternatives"),
    machineCaveat: t("rp.h.machineCaveat"),
    corrections: t("rp.h.corrections"),
    references: t("rp.h.references"),
    page: t("rp.h.page"),
  });

  const makeReport = async () => {
    setBusy("report");
    try {
      const html = await buildReportHtml(project, strings(), {
        dir,
        lang,
        withholdLocation: !includeLocation,
      });
      const res = printReport(html);
      if (!res.ok) toast.error(res.error ?? t("rp.failed"));
    } catch {
      toast.error(t("rp.failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <section className="panel space-y-2 p-3">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <MapPin className="size-4 text-muted-foreground" />
          {t("geo.title")}
        </h4>

        {project.location ? (
          <>
            <p className="font-mono text-xs" dir="ltr">
              {formatDms(project.location)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("geo.accuracy", { m: Math.round(project.location.accuracyM) })}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={osmUrl(project.location)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm font-semibold text-primary underline"
              >
                {t("geo.openMap")}
              </a>
              <button
                onClick={removePosition}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
                {t("geo.clear")}
              </button>
            </div>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={recordPosition}
            disabled={busy !== null}
            className="w-full"
          >
            <MapPin className="me-2 size-4" />
            {busy === "geo" ? t("geo.recording") : t("geo.capture")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t("geo.privacy")}</p>
      </section>

      <section className="panel space-y-3 p-3">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <FileText className="size-4 text-muted-foreground" />
          {t("rp.title")}
        </h4>

        {project.location && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`inc-loc-${project.id}`} className="text-sm font-normal">
              {t("rp.includeLocation")}
            </Label>
            <Switch
              id={`inc-loc-${project.id}`}
              checked={includeLocation}
              onCheckedChange={setIncludeLocation}
            />
          </div>
        )}

        <Button onClick={makeReport} disabled={busy !== null} className="w-full">
          <FileText className="me-2 size-4" />
          {busy === "report" ? t("rp.building") : t("rp.build")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("rp.hint")}</p>
      </section>
    </div>
  );
}
