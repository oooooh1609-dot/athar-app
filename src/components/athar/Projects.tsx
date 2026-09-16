import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, HardDrive, MapPin, PenLine, Search, Server, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteProject,
  listProjects,
  mb,
  storageEstimate,
  type AtharProject,
} from "@/lib/athar-db";
import { downloadBlob, useObjectUrl } from "@/lib/object-url";
import { FieldRecord } from "@/components/athar/FieldRecord";
import { OutboxPanel } from "@/components/athar/OutboxPanel";
import { Input } from "@/components/ui/input";
import { searchProjects } from "@/lib/search";
import { groupIntoSites, toCsv, toGeoJSON } from "@/lib/sites";
import { useI18n } from "@/lib/i18n";

export function Projects({ onOpenComposition }: { onOpenComposition?: (p: AtharProject) => void }) {
  const { t, d } = useI18n();
  const [items, setItems] = useState<AtharProject[]>([]);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      setItems(await listProjects());
      setQuota(await storageEstimate());
    } catch {
      toast.error(t("projects.storageUnavailable"));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // downloadBlob revokes the object URL once the save has had time to start.
  const download = downloadBlob;

  // Searching is cheap on a local list, but re-running it on every keystroke
  // over every field of every project is not, so it is memoised.
  const visible = useMemo(
    () => (query.trim() ? searchProjects(items, query).map((h) => h.project) : items),
    [items, query],
  );
  const sites = useMemo(() => groupIntoSites(items), [items]);
  const locatedCount = useMemo(() => items.filter((p) => p.location).length, [items]);

  const readingTxt = (p: AtharProject) => {
    const lines: string[] = [`Project: ${p.name}`, `Saved: ${new Date(p.createdAt).toISOString()}`];
    if (p.notes) lines.push(`Notes: ${p.notes}`);
    if (p.machineReading) {
      const r = p.machineReading;
      lines.push(
        "",
        "— Machine suggestion —",
        `Script: ${r.script}`,
        `Direction: ${r.direction}`,
        `Transliteration: ${r.transliteration}`,
        `Proposed reading: ${r.proposedReading}`,
        `Meaning: ${r.meaning}`,
        `Uncertain: ${r.uncertainties}`,
        `Alternatives: ${r.alternatives}`,
        ...r.references.map((x) => `- ${x.title}: ${x.url}`),
      );
    }
    for (const v of p.versions.filter((x) => x.source === "user"))
      lines.push(
        "",
        `— User correction ${new Date(v.createdAt).toISOString()} —`,
        v.text ?? "",
        v.reason ? `Reason: ${v.reason}` : "",
      );
    download(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
      `${p.name}-reading.txt`,
    );
  };

  return (
    <div className="space-y-4">
      {quota && (
        <p className="panel p-3 text-sm text-muted-foreground">
          {t("projects.storage", { used: mb(quota.usage), total: mb(quota.quota) })}
        </p>
      )}
      <OutboxPanel />

      {items.length > 0 && (
        <div className="space-y-1">
          <div className="relative">
            <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sr.placeholder")}
              className="ps-10 pe-10"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label={t("sr.clear")}
                className="absolute inset-inline-end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {query ? t("sr.results", { count: visible.length, total: items.length }) : t("sr.hint")}
          </p>
        </div>
      )}

      {locatedCount > 0 && !query && (
        <section className="panel space-y-2 p-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <MapPin className="size-4 text-muted-foreground" />
            {t("st.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("st.count", { sites: sites.length, located: locatedCount })}
          </p>
          <ul className="text-xs text-muted-foreground">
            {sites.slice(0, 5).map((site) => (
              <li key={site.id} className="truncate">
                {site.projects[0]?.name} · {site.projects.length} ·{" "}
                {t("st.spread", { m: Math.round(site.spreadM) })}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(toGeoJSON(items), null, 2)], {
                    type: "application/geo+json",
                  }),
                  "athar-sites.geojson",
                )
              }
            >
              <Download /> {t("st.exportGeojson")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                download(
                  // The BOM is what makes Excel read UTF-8 Arabic correctly.
                  new Blob(["\uFEFF", toCsv(items)], { type: "text/csv;charset=utf-8" }),
                  "athar-sites.csv",
                )
              }
            >
              <Download /> {t("st.exportCsv")}
            </Button>
          </div>
        </section>
      )}

      {items.length === 0 && (
        <p className="panel p-4 text-center text-muted-foreground">{t("projects.none")}</p>
      )}
      {items.length > 0 && visible.length === 0 && (
        <p className="panel p-4 text-center text-muted-foreground">{t("sr.none")}</p>
      )}
      {visible.map((p) => (
        <article key={p.id} className="panel space-y-3 p-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{p.name}</h3>
              <p className="text-xs text-muted-foreground">
                {p.kind === "object"
                  ? t("projects.kind.object")
                  : p.kind === "composition"
                    ? t("projects.kind.composition")
                    : t("projects.kind.image")}{" "}
                · {d(p.createdAt)}
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
              {p.serverSide ? <Server className="size-3" /> : <HardDrive className="size-3" />}
              {p.serverSide ? t("projects.onServer") : t("projects.onDevice")}
            </span>
          </header>

          {p.enhanced && <ProjectImage blob={p.enhanced} alt={`${p.name} enhanced`} />}
          {p.captures && p.captures.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("projects.capturedViews", { count: p.captures.length })}
            </p>
          )}
          {p.composition && (
            <div>
              {/* The inscription keeps its own stored direction, whatever the interface language is. */}
              <div
                dir={p.composition.direction}
                className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 text-xl"
              >
                {p.composition.text}
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">
                {p.composition.transliteration.trim() || t("projects.noTranslit")}
              </p>
            </div>
          )}
          {p.notes && <p className="text-sm">{p.notes}</p>}
          {p.exportInfo && <p className="text-xs text-muted-foreground">{p.exportInfo}</p>}

          <div className="flex flex-wrap gap-2">
            {p.enhanced && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(p.enhanced!, `${p.name}-enhanced.jpg`)}
              >
                <Download /> {t("projects.enhancedImage")}
              </Button>
            )}
            {p.original && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => download(p.original!, `${p.name}-original.jpg`)}
              >
                <Download /> {t("projects.original")}
              </Button>
            )}
            {p.composition && (
              <>
                {onOpenComposition && (
                  <Button size="sm" onClick={() => onOpenComposition(p)}>
                    <PenLine /> {t("projects.open")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(
                      new Blob(
                        [
                          `${p.composition!.text}\n\nTransliteration: ${p.composition!.transliteration}`,
                        ],
                        { type: "text/plain;charset=utf-8" },
                      ),
                      `${p.name}.txt`,
                    )
                  }
                >
                  <Download /> {t("projects.inscriptionTxt")}
                </Button>
              </>
            )}
            {(p.machineReading || p.versions.length > 0) && (
              <Button size="sm" variant="outline" onClick={() => readingTxt(p)}>
                <Download /> {t("projects.readingTxt")}
              </Button>
            )}
            {p.modelUrl && (
              <Button size="sm" asChild variant="outline">
                <a href={p.modelUrl} download>
                  <Download /> {t("projects.model")}
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                await deleteProject(p.id);
                await refresh();
              }}
            >
              <Trash2 /> {t("projects.delete")}
            </Button>
          </div>
          {p.jobId && (
            <p className="text-xs text-muted-foreground">{t("projects.jobRef", { id: p.jobId })}</p>
          )}

          {/* Findspot and field report. `refresh` re-reads from storage so the
              card shows the saved coordinates immediately. */}
          <FieldRecord project={p} onSaved={() => void refresh()} />
        </article>
      ))}
    </div>
  );
}

/**
 * One stored photograph. Separate component so its blob URL is revoked when
 * the card leaves the list instead of being re-created on every render.
 */
function ProjectImage({ blob, alt }: { blob: Blob; alt: string }) {
  const url = useObjectUrl(blob);
  if (!url) return null;
  return <img src={url} alt={alt} className="w-full rounded-lg" />;
}
