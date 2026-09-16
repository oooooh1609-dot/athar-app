/**
 * Write Inscription — separate Musnad and Thamudic keyboards built from the
 * imported alphabet pack.
 *
 * Musnad keys insert the pack's Unicode characters and are unchanged. Thamudic
 * keys come from version 3.0 of the pack: 27 glyph images supplied in AD.pdf.
 * Each key inserts an ordered glyph token referencing that one supplied image.
 * No Unicode mapping is invented for Thamudic.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  CornerDownLeft,
  Delete,
  Download,
  HelpCircle,
  Image as ImageIcon,
  Save,
  Search,
  Space as SpaceIcon,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ALPHABET_PACK,
  MUSNAD_SCRIPT,
  THAMUDIC_SCRIPT,
  lettersOf,
  packLetter,
  packSource,
  sourceImageUrl,
  tokensToText,
  tokensToTransliteration,
  type InscriptionToken,
  type PackLetter,
  type ReferenceRegion,
} from "@/lib/alphabet-pack";
import { lookupMeaning } from "@/lib/athar-api";
import { saveProject, type AtharProject } from "@/lib/athar-db";
import { logActivity } from "@/lib/activity-log";
import { useI18n } from "@/lib/i18n";
import type { ReferenceParallel } from "@/lib/inscription-prompt";

const pack = ALPHABET_PACK;

/* ------------------------------ reference crop ---------------------------- */

function RegionImage({
  region,
  height,
  className,
}: {
  region: ReferenceRegion;
  height: number;
  className?: string;
}) {
  const source = packSource(pack, region.source_id);
  const url = sourceImageUrl(source);
  const [x0, y0, x1, y1] = region.bbox_xyxy;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const scale = height / h;

  if (!url || !source) return null;
  return (
    <span
      className={`relative block overflow-hidden rounded bg-white ${className ?? ""}`}
      style={{ width: w * scale, height }}
    >
      <img
        src={url}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: "absolute",
          width: source.width * scale,
          height: source.height * scale,
          left: -x0 * scale,
          top: -y0 * scale,
          maxWidth: "none",
        }}
      />
    </span>
  );
}

/** A glyph image supplied per-letter by the pack (version 3.0 Thamudic set). */
function GlyphImage({ src, height }: { src: string; height: number }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      style={{ height, width: "auto", maxWidth: "100%" }}
      className="block object-contain"
    />
  );
}

/* --------------------------------- screen -------------------------------- */

type ScriptTab = typeof MUSNAD_SCRIPT | typeof THAMUDIC_SCRIPT;

export function WriteInscription({ initial }: { initial?: AtharProject }) {
  const { t, n, lang } = useI18n();
  const [scriptId, setScriptId] = useState<ScriptTab>(
    (initial?.composition?.scriptId as ScriptTab) ?? MUSNAD_SCRIPT,
  );

  const [direction, setDirection] = useState<"rtl" | "ltr">(
    initial?.composition?.direction ?? "rtl",
  );
  const [tokens, setTokens] = useState<InscriptionToken[]>(initial?.composition?.tokens ?? []);
  const [history, setHistory] = useState<InscriptionToken[][]>([]);
  const [name, setName] = useState(initial?.composition ? initial.name : "");
  const [showChart, setShowChart] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [meaning, setMeaning] = useState<{
    state?: string;
    ok?: boolean;
    error?: string;
    message?: string;
    parallels?: ReferenceParallel[];
    collection?: { source: string; version: string; records: number } | null;
    arabic?: "ready" | "setup_required" | "failed";
    words?: {
      token: string;
      occurrences: number;
      arabic: string | null;
      english: string | null;
      examples: {
        siglum: string;
        script: string | null;
        transliteration: string | null;
        translation: string;
        translationAr: string | null;
        url: string | null;
      }[];
    }[];
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  /**
   * Completed analyses cached by inscription revision + language, so switching
   * the interface language reuses the same reading and citations instead of
   * asking for a fresh interpretation.
   */
  type Analysis = NonNullable<typeof meaning>;
  const cache = useRef(new Map<string, Analysis>());

  const script = pack.scripts.find((s) => s.id === scriptId)!;
  const letters = useMemo(() => lettersOf(pack, scriptId), [scriptId]);
  const musnadDivider = pack.special_keys.find((k) => k.id === "musnad_divider");
  const chartCandidate = packSource(
    pack,
    scriptId === MUSNAD_SCRIPT ? "musnad_chart" : "thamudic_ad_pdf",
  );
  const chartSource = sourceImageUrl(chartCandidate) ? chartCandidate : undefined;

  const push = (next: InscriptionToken[]) => {
    setHistory((h) => [...h.slice(-49), tokens]);
    setTokens(next);
    setMeaning(null);
  };
  const add = (t: InscriptionToken) => push([...tokens, t]);
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setTokens(h[h.length - 1]!);
      return h.slice(0, -1);
    });
    setMeaning(null);
  };
  const backspace = () => tokens.length && push(tokens.slice(0, -1));

  const text = tokensToText(tokens);
  const translit = tokensToTransliteration(tokens);

  const insertLetter = (l: PackLetter) => {
    setSelectedId(l.id);
    if (l.script_id === MUSNAD_SCRIPT) {
      add({
        kind: "musnad",
        letterId: l.id,
        char: l.unicode_character ?? "",
        arabic: l.arabic_display,
        translit: l.transliteration,
      });
    } else {
      const region = l.reference_regions[0];
      add({
        kind: "thamudic",
        letterId: l.id,
        row: l.source_row ?? 0,
        arabic: l.arabic_display,
        ...(region
          ? {
              region: {
                sourceId: region.source_id,
                ...(region.source_column ? { column: region.source_column } : {}),
                bbox: region.bbox_xyxy,
              },
            }
          : {}),
        shapeChosen: true,
      });
    }
  };

  const save = async () => {
    const project: AtharProject = {
      ...(initial ?? {}),
      id: initial?.id ?? crypto.randomUUID(),
      kind: "composition",
      name: name.trim() || `Inscription ${new Date().toLocaleString()}`,
      notes: "",
      createdAt: initial?.createdAt ?? Date.now(),
      versions: initial?.versions ?? [],
      annotations: initial?.annotations ?? [],
      serverSide: false,
      consentToShare: false,
      composition: {
        scriptId,
        direction,
        tokens,
        text,
        transliteration: translit.text,
        updatedAt: Date.now(),
      },
    };
    try {
      await saveProject(project);
      toast.success(t("write.saved"));
      logActivity({
        type: "composition_saved",
        title: "Composition saved",
        details: `${project.name} (Script: ${scriptId})`,
        status: "success",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("write.saveFailed"));
    }
  };

  const download = (ext: "txt" | "json") => {
    const body =
      ext === "txt"
        ? [
            `Script: ${script.label_en}`,
            `Direction: ${direction.toUpperCase()}`,
            "",
            text,
            "",
            `Transliteration (only where the pack supplies a value): ${translit.text}`,
            translit.missing
              ? `${translit.missing} sign(s) have no reviewed transliteration value in this pack.`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : JSON.stringify(
            {
              format: "athar-inscription",
              scriptId,
              direction,
              tokens,
              text,
              transliteration: translit.text,
              pack: { format: pack.format, schema_version: pack.schema_version },
            },
            null,
            1,
          );
    const url = URL.createObjectURL(
      new Blob([body], { type: ext === "txt" ? "text/plain" : "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `athar-inscription.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Identity of the current glyph sequence; a new revision invalidates results. */
  const revision = useMemo(
    () =>
      `${scriptId}:${direction}:${tokens.map((tk) => `${tk.kind}/${"letterId" in tk ? tk.letterId : ""}`).join(",")}`,
    [scriptId, direction, tokens],
  );

  const searchMeaning = async (targetLang: typeof lang = lang) => {
    const key = `${revision}|${targetLang}`;
    const hit = cache.current.get(key);
    if (hit) {
      setMeaning(hit);
      setLookupError(null);
      return;
    }
    setSearching(true);
    setLookupError(null);
    setMeaning(null);
    try {
      const res = await lookupMeaning({
        transliteration: translit.text,
        script: scriptId === THAMUDIC_SCRIPT ? "thamudic" : "auto",
        lang: targetLang,
      });
      if (!res.ok) {
        setLookupError(res.error ?? t("write.lookupFailed"));
        return;
      }
      cache.current.set(key, res);
      setMeaning(res);
    } catch {
      setLookupError(t("write.lookupFailed"));
    } finally {
      setSearching(false);
    }
  };

  // A finished analysis follows the interface language: the same reading and the
  // same citations, re-expressed. Unsaved glyph work is untouched by this.
  const analysed = useRef(false);
  analysed.current = !!meaning || !!lookupError;
  useEffect(() => {
    if (!analysed.current) return;
    void searchMeaning(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const glosses = (meaning?.words ?? []).filter((w) => w.examples.length > 0);
  const interpretation = glosses
    .map((w) => `${w.token} — ${(lang === "ar" ? w.arabic : null) ?? w.english ?? ""}`.trim())
    .filter((line) => !line.endsWith("—"))
    .join("\n");

  return (
    <div className="space-y-4">
      {/* script selector */}
      <div className="flex gap-2">
        {pack.scripts.map((s) => (
          <Button
            key={s.id}
            variant={s.id === scriptId ? "default" : "secondary"}
            className="flex-1"
            onClick={() => setScriptId(s.id as ScriptTab)}
          >
            {s.id === MUSNAD_SCRIPT ? t("write.musnad") : t("write.thamudic")}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{script.scope}</p>

      {/* editor — the inscription keeps its own direction, set below, never the UI direction */}
      <div className="panel p-3">
        <div
          dir={direction}
          className="min-h-24 whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 text-2xl leading-relaxed"
        >
          {tokens.length === 0 ? (
            <span className="block text-base text-muted-foreground">{t("write.placeholder")}</span>
          ) : (
            tokens.map((tk, i) => {
              if (tk.kind === "newline") return <br key={i} />;
              if (tk.kind === "space") return <span key={i}> </span>;
              if (tk.kind === "unknown")
                return (
                  <span key={i} className="text-muted-foreground">
                    ?
                  </span>
                );
              if (tk.kind === "musnad")
                return (
                  <span key={i} title={tk.translit ?? ""}>
                    {tk.char}
                  </span>
                );
              return (
                <span
                  key={i}
                  className="mx-0.5 inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 align-middle text-sm"
                  title={`${t("write.sourceRow", { row: tk.row })}${tk.region?.column ? ` · ${tk.region.column}` : ""}`}
                >
                  {(() => {
                    const glyph = packLetter(pack, tk.letterId)?.glyph_image_data_uri;
                    if (glyph) return <GlyphImage src={glyph} height={22} />;
                    if (tk.region && packSource(pack, tk.region.sourceId))
                      return (
                        <RegionImage
                          region={{ source_id: tk.region.sourceId, bbox_xyxy: tk.region.bbox }}
                          height={22}
                        />
                      );
                    return (
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t("write.earlierChart")}
                      </span>
                    );
                  })()}
                  <span>
                    {tk.arabic}
                    <span className="text-muted-foreground">·{tk.row}</span>
                  </span>
                </span>
              );
            })
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Button variant="secondary" onClick={() => add({ kind: "space" })}>
            <SpaceIcon /> {t("write.space")}
          </Button>
          <Button variant="secondary" onClick={() => add({ kind: "newline" })}>
            <CornerDownLeft /> {t("write.line")}
          </Button>
          <Button variant="secondary" onClick={() => add({ kind: "unknown" })}>
            <HelpCircle /> {t("write.unknown")}
          </Button>
          {scriptId === MUSNAD_SCRIPT && musnadDivider && (
            <Button
              variant="secondary"
              onClick={() =>
                add({
                  kind: "musnad",
                  letterId: musnadDivider.id,
                  char: musnadDivider.value ?? "",
                  arabic: "",
                  translit: null,
                })
              }
            >
              {t("write.divider")}
            </Button>
          )}
          <Button variant="secondary" onClick={backspace} disabled={!tokens.length}>
            <Delete /> {t("write.delete")}
          </Button>
          <Button variant="secondary" onClick={undo} disabled={!history.length}>
            <Undo2 /> {t("write.undo")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setDirection(direction === "rtl" ? "ltr" : "rtl")}
          >
            {direction === "rtl" ? t("write.direction.rtl") : t("write.direction.ltr")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("write.directionNote")}</p>
      </div>

      {/* compact preview of the key last tapped, beside the editor */}
      <div className="panel flex items-center gap-3 p-3">
        {(() => {
          const sel = selectedId ? packLetter(pack, selectedId) : undefined;
          if (!sel)
            return <p className="text-xs text-muted-foreground">{t("write.preview.none")}</p>;
          const region = sel.reference_regions[0];
          return (
            <>
              <span
                dir="ltr"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-card"
              >
                {sel.glyph_image_data_uri ? (
                  <GlyphImage src={sel.glyph_image_data_uri} height={44} />
                ) : region ? (
                  <RegionImage region={region} height={34} />
                ) : (
                  <span className="text-2xl">{sel.unicode_character ?? "—"}</span>
                )}
              </span>
              <div className="min-w-0 text-xs">
                <p className="font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("write.preview.title")}
                </p>
                <p className="mt-0.5">
                  {t("write.preview.arabicLabel")}:{" "}
                  <span dir="rtl" className="font-semibold">
                    {sel.arabic_display}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {sel.transliteration
                    ? `${t("write.preview.translit")}: ${sel.transliteration}`
                    : `${t("write.preview.translit")}: ${t("write.preview.noTranslit")}`}
                  {sel.source_row ? ` · ${t("write.preview.row")} ${n(sel.source_row)}` : ""}
                </p>
              </div>
            </>
          );
        })()}
      </div>

      {/* keyboard */}
      <div className="panel p-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t("write.keyboard", {
            script: scriptId === MUSNAD_SCRIPT ? t("write.musnad") : t("write.thamudic"),
            count: n(letters.length),
          })}
        </h3>
        {/* keys keep chart order regardless of interface direction */}
        <div dir="ltr" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {letters.map((l) => {
            const preview = l.reference_regions[0];
            return (
              <button
                key={l.id}
                onClick={() => insertLetter(l)}
                className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-2 transition active:scale-95 hover:border-primary"
              >
                {l.glyph_image_data_uri ? (
                  <GlyphImage src={l.glyph_image_data_uri} height={34} />
                ) : preview ? (
                  <RegionImage region={preview} height={l.script_id === MUSNAD_SCRIPT ? 34 : 24} />
                ) : (
                  <span className="text-xl">{l.unicode_character ?? "—"}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {l.arabic_display}
                  {l.transliteration ? ` · ${l.transliteration}` : ` · ${l.source_row}`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {scriptId === MUSNAD_SCRIPT ? t("write.keyNote.musnad") : t("write.keyNote.thamudic")}
        </p>
      </div>

      {/* three separate fields: original inscription, transliteration, interpretation */}
      <div className="panel space-y-3 p-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("write.field.original")}
          </p>
          <p dir={direction} className="mt-1 whitespace-pre-wrap break-words text-lg">
            {text || "—"}
          </p>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("write.field.translit")}
          </p>
          <p dir="ltr" className="mt-1 break-words font-mono text-sm">
            {translit.text.trim() || "—"}
          </p>
          {translit.missing > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("write.missingSigns", { count: n(translit.missing) })}
            </p>
          )}
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("write.field.interpretation", { language: t(`lang.${lang}`) })}
          </p>
          {interpretation ? (
            <>
              <p className="mt-1 whitespace-pre-wrap text-sm">{interpretation}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("write.evidenceNote")}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("write.interpretationEmpty")}</p>
          )}
        </div>
      </div>

      {/* correspondences */}
      <div className="panel p-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t("write.correspondences")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("write.correspondencesNote")}</p>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-start">{t("write.col.arabic")}</th>
                <th className="py-1 text-start">{t("write.col.translit")}</th>
                <th className="py-1 text-start">
                  {scriptId === MUSNAD_SCRIPT ? t("write.col.unicode") : t("write.col.row")}
                </th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.id} className="border-t border-border/60">
                  <td className="py-1">{l.arabic_display}</td>
                  <td className="py-1">
                    {l.transliteration ?? (
                      <span className="text-muted-foreground">{t("write.notInPack")}</span>
                    )}
                  </td>
                  <td className="py-1 text-xs text-muted-foreground" dir="ltr">
                    {l.script_id === MUSNAD_SCRIPT
                      ? `${l.codepoint ?? ""} ${l.unicode_name ?? ""}`
                      : t("write.sourceRow", { row: l.source_row ?? 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {chartSource && (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setShowChart((v) => !v)}>
            <ImageIcon /> {showChart ? t("write.hideChart") : t("write.showChart")}
          </Button>
        )}
        {showChart && chartSource && (
          <figure className="mt-3">
            <img
              src={sourceImageUrl(chartSource)}
              alt={chartSource.description}
              className="w-full rounded-lg border border-border bg-white"
            />
            <figcaption className="mt-1 text-xs text-muted-foreground">
              {chartSource.description} {t("write.chartNote")}
            </figcaption>
          </figure>
        )}
      </div>

      {/* actions */}
      <div className="panel space-y-3 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("write.namePlaceholder")}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={save} disabled={!tokens.length}>
            <Save /> {t("write.save")}
          </Button>
          <Button variant="secondary" onClick={() => download("txt")} disabled={!tokens.length}>
            <Download /> {t("write.exportText")}
          </Button>
          <Button variant="secondary" onClick={() => download("json")} disabled={!tokens.length}>
            <Download /> {t("write.exportTokens")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              toast.success(t("write.copied"));
            }}
            disabled={!tokens.length}
          >
            <Copy /> {t("write.copy")}
          </Button>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void searchMeaning()}
          disabled={!tokens.length || searching}
        >
          <Search /> {searching ? t("write.analyzing") : t("write.analyze")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("write.searchNote")}</p>

        {lookupError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <p>{lookupError}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => void searchMeaning()}
            >
              {t("write.retryLookup")}
            </Button>
          </div>
        )}

        {(meaning || searching) && (
          <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("write.sec.original")}
              </h3>
              <p className="mt-1 break-words text-lg" dir={direction}>
                {text || "—"}
              </p>
            </section>
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("write.sec.translit")}
              </h3>
              <p className="mt-1 font-mono text-sm" dir="ltr">
                {translit.text || "—"}
              </p>
              {translit.missing > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("write.translitMissing", { count: n(translit.missing) })}
                </p>
              )}
            </section>
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("write.sec.interpretation")}
              </h3>
              {searching ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("write.analyzing")}</p>
              ) : interpretation ? (
                <p className="mt-1 whitespace-pre-line">{interpretation}</p>
              ) : (
                <p className="mt-1 text-muted-foreground">{t("write.unresolved")}</p>
              )}
            </section>
          </div>
        )}

        {meaning && (
          <div className="rounded-lg border border-border p-3 text-sm">
            {meaning.state === "matches" ? (
              <>
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("write.sec.sources")}
                </h3>
                <div className="mt-1 flex items-center gap-2 font-bold">
                  <BookOpen className="size-4" /> {t("write.similar")}
                </div>
                {meaning.collection && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {meaning.collection.source} ·{" "}
                    {t("write.records", { count: n(meaning.collection.records) })}
                  </div>
                )}
                {glosses.length > 0 && (
                  <div className="mt-2 space-y-3">
                    <div className="font-bold">{t("write.wordMeanings")}</div>
                    {meaning.arabic === "setup_required" && (
                      <p className="text-xs text-muted-foreground">{t("write.arabicSetup")}</p>
                    )}
                    {meaning.arabic === "failed" && (
                      <p className="text-xs text-muted-foreground">{t("write.arabicFailed")}</p>
                    )}
                    {glosses.map((w) => (
                      <div key={w.token} className="rounded-lg bg-muted/50 p-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono font-semibold" dir="ltr">
                            {w.token}
                          </span>
                          {w.arabic && (
                            <span dir="rtl" className="font-semibold">
                              {w.arabic}
                            </span>
                          )}
                          {w.english && (
                            <span className="text-xs text-muted-foreground">{w.english}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {t("write.occurrences", { count: n(w.occurrences) })}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-1">
                          {w.examples.map((e) => (
                            <li key={e.siglum} className="border-t border-border/60 pt-1">
                              {e.url ? (
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline underline-offset-2"
                                >
                                  {e.siglum}
                                </a>
                              ) : (
                                <span className="text-xs">{e.siglum}</span>
                              )}
                              {e.transliteration && (
                                <div className="font-mono text-xs" dir="ltr">
                                  {e.transliteration}
                                </div>
                              )}
                              <div className="text-xs" dir="ltr">
                                {e.translation}
                              </div>
                              {e.translationAr && (
                                <div dir="rtl" className="text-xs">
                                  {e.translationAr}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">{t("write.evidenceNote")}</p>
                  </div>
                )}

                <ul className="mt-2 space-y-2">
                  {meaning.parallels?.map((p) => (
                    <li key={p.siglum} className="border-t border-border/60 pt-2">
                      <div className="font-medium">
                        {p.url ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            {p.siglum}
                          </a>
                        ) : (
                          p.siglum
                        )}
                        {p.script ? ` · ${p.script}` : ""}
                      </div>
                      {p.transliteration && (
                        <div className="font-mono text-xs" dir="ltr">
                          {p.transliteration}
                        </div>
                      )}
                      {p.translation && <div className="text-xs">{p.translation}</div>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{t("write.notProof")}</p>
              </>
            ) : (
              <p>{meaning.message}</p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground" dir="rtl">
        {pack.important_ar}
      </p>
    </div>
  );
}
