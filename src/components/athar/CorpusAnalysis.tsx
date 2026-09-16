/**
 * Analysis screen for the imported, openly licensed inscription photographs.
 *
 * The photograph is fetched through the app (so its pixels can be read),
 * segmented on this device, and every candidate sign is reported with the
 * trained model's answer, its similarity to the learned letter prototype, the
 * line it belongs to and the assumed sign order. Signs the model is not
 * confident about stay "?" — nothing here is presented as a transcription.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, ListTree, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { corpusImages, glyphModel } from "@/lib/athar-api";
import type { CorpusImage } from "@/lib/corpus-types";
import {
  DETECT_MAX_PIXELS,
  detectGlyphs,
  glyphThumbnail,
  type DetectedGlyph,
} from "@/lib/glyph-client";
import {
  modelTransliteration,
  predictWithModel,
  type ModelPrediction,
  type TrainedModel,
} from "@/lib/glyph-training";
import { fitScale, imageDataOf } from "@/lib/enhance-client";
import { useI18n } from "@/lib/i18n";

const SCRIPTS = ["thamudic", "dadanitic", "nabataean"] as const;
type Script = (typeof SCRIPTS)[number];

export function CorpusAnalysis() {
  const { t, n, d, lang } = useI18n();
  const [script, setScript] = useState<Script>("thamudic");
  const [images, setImages] = useState<CorpusImage[]>([]);
  const [selected, setSelected] = useState<CorpusImage | null>(null);
  const [model, setModel] = useState<TrainedModel | null>(null);
  const [direction, setDirection] = useState<"rtl" | "ltr">("rtl");
  const [invert, setInvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [glyphs, setGlyphs] = useState<DetectedGlyph[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [stats, setStats] = useState<{ lines: number; candidates: number; ink: number } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const [drawTick, setDrawTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setImages([]);
    setSelected(null);
    void corpusImages(script).then((res) => {
      if (!alive) return;
      setImages(res.images ?? []);
    });
    void glyphModel(script).then((res) => {
      if (!alive) return;
      setModel(res.model ?? null);
    });
    return () => {
      alive = false;
    };
  }, [script]);

  const preds = useMemo<ModelPrediction[]>(
    () => glyphs.map((g) => predictWithModel(g.features, model)),
    [glyphs, model],
  );
  const sequence = useMemo(() => modelTransliteration(preds), [preds]);
  const namedCount = preds.filter((p) => p.state === "named").length;

  // The preview canvas only exists once the report is rendered, so the outlined
  // photograph is drawn after the signs are in state.
  useEffect(() => {
    const ov = overlayRef.current;
    const work = workRef.current;
    if (!ov || !work || glyphs.length === 0) return;
    const scale = Math.min(1, 640 / work.width);
    ov.width = Math.round(work.width * scale);
    ov.height = Math.round(work.height * scale);
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(work, 0, 0, ov.width, ov.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#A97C43";
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#173E36";
    glyphs.forEach((g, i) => {
      ctx.strokeRect(g.x * scale, g.y * scale, g.w * scale, g.h * scale);
      ctx.fillText(String(i + 1), g.x * scale, Math.max(10, g.y * scale - 2));
    });
  }, [glyphs, drawTick]);

  const analyse = useCallback(
    async (img: CorpusImage) => {
      setBusy(true);
      setLoadError(null);
      setGlyphs([]);
      setThumbs([]);
      setStats(null);
      try {
        const bitmap = await loadImage(`/api/corpus/image?id=${encodeURIComponent(img.id)}`);
        const s = fitScale(bitmap.width, bitmap.height, DETECT_MAX_PIXELS);
        const work = document.createElement("canvas");
        work.width = Math.max(1, Math.round(bitmap.width * s));
        work.height = Math.max(1, Math.round(bitmap.height * s));
        work.getContext("2d")?.drawImage(bitmap, 0, 0, work.width, work.height);

        const seg = await detectGlyphs(imageDataOf(work), { invert, k: 0.25, direction });
        setGlyphs(seg.glyphs);
        setThumbs(seg.glyphs.map((g) => glyphThumbnail(work, g)));
        setStats({ lines: seg.lines, candidates: seg.candidates, ink: seg.inkRatio });

        workRef.current = work;
        setDrawTick((v) => v + 1);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("corpus.loadFailed"));
      } finally {
        setBusy(false);
      }
    },
    [direction, invert, t],
  );

  const download = () => {
    if (!selected) return;
    const report = {
      generated_at: new Date().toISOString(),
      interface_language: lang,
      image: {
        id: selected.id,
        title: selected.title,
        siglum: selected.siglum,
        script: selected.script,
        license: selected.license,
        credit: selected.credit,
        source_url: selected.source_url,
      },
      assumed_sign_order: direction,
      model: model
        ? { version: model.version, letters: model.letters, cv_accuracy: model.accuracy }
        : null,
      model_sequence: sequence,
      signs: glyphs.map((g, i) => {
        const p = preds[i];
        return {
          index: i + 1,
          line: g.line + 1,
          box: { x: g.x, y: g.y, w: g.w, h: g.h },
          state: p?.state ?? "no_model",
          letter: p?.state === "named" ? p.letter : null,
          transliteration: p?.state === "named" ? (p.transliteration ?? null) : null,
          similarity: p ? Number(similarityOf(p).toFixed(3)) : null,
        };
      }),
      disclaimer:
        "Shape hypotheses from a model trained on rendered chart glyphs. Not a scholarly transcription; unmatched signs are '?'.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `athar-analysis-${selected.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("corpus.downloaded"));
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <ListTree className="size-5 text-accent" /> {t("corpus.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("corpus.intro")}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {SCRIPTS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={script === s ? "default" : "outline"}
              onClick={() => setScript(s)}
            >
              {t(`corpus.script.${s}`)}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("corpus.order")}</span>
          <Button
            size="sm"
            variant={direction === "rtl" ? "default" : "outline"}
            onClick={() => setDirection("rtl")}
          >
            {t("corpus.order.rtl")}
          </Button>
          <Button
            size="sm"
            variant={direction === "ltr" ? "default" : "outline"}
            onClick={() => setDirection("ltr")}
          >
            {t("corpus.order.ltr")}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Label htmlFor="corpus-invert" className="text-sm">
            {t("corpus.invert")}
          </Label>
          <Switch id="corpus-invert" checked={invert} onCheckedChange={setInvert} />
        </div>

        {images.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("corpus.none")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {images.map((img) => (
              <li key={img.id}>
                <button
                  onClick={() => {
                    setSelected(img);
                    void analyse(img);
                  }}
                  disabled={busy}
                  className={`panel w-full p-3 text-start text-sm hover:border-primary ${
                    selected?.id === img.id ? "border-primary" : ""
                  }`}
                >
                  <span className="block font-semibold">{img.title}</span>
                  <span className="block text-xs text-muted-foreground" dir="ltr">
                    {img.siglum ? `${img.siglum} · ` : ""}
                    {img.license}
                    {img.credit ? ` · ${img.credit}` : ""}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("corpus.added")}: {d(img.created_at, { dateStyle: "medium" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {busy && <p className="text-sm text-muted-foreground">{t("corpus.working")}</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {selected && glyphs.length > 0 && (
        <div className="panel p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <ScanLine className="size-5 text-accent" /> {t("corpus.report")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {selected.title}
            {selected.source_url ? (
              <>
                {" — "}
                <a
                  className="underline"
                  href={selected.source_url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t("corpus.source")}
                </a>
              </>
            ) : null}
          </p>

          <canvas ref={overlayRef} className="mt-3 w-full rounded-xl border border-border" />

          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Row label={t("corpus.signs")} value={n(glyphs.length)} />
            <Row label={t("corpus.lines")} value={n(stats?.lines ?? 0)} />
            <Row label={t("corpus.named")} value={`${n(namedCount)} / ${n(glyphs.length)}`} />
            <Row
              label={t("corpus.direction")}
              value={direction === "rtl" ? t("corpus.order.rtl") : t("corpus.order.ltr")}
            />
          </dl>

          <div className="mt-3 rounded-xl bg-muted p-3">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {t("corpus.sequence")}
            </p>
            {/* Sign order belongs to the inscription, not the interface language. */}
            <p className="mt-1 font-mono text-sm break-words" dir="ltr">
              {sequence || "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {model
                ? t("corpus.modelNote", {
                    version: n(model.version),
                    letters: n(model.letters),
                    accuracy:
                      model.accuracy === null
                        ? t("corpus.unmeasured")
                        : `${(model.accuracy * 100).toFixed(1)}%`,
                  })
                : t("corpus.noModel")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("corpus.disclaimer")}</p>
          </div>

          <ol className="mt-4 space-y-2" dir="ltr">
            {glyphs.map((g, i) => {
              const p = preds[i];
              const sim = p ? similarityOf(p) : 0;
              return (
                <li
                  key={`${g.x}-${g.y}-${i}`}
                  className="flex items-start gap-3 rounded-xl border border-border p-3"
                >
                  {thumbs[i] && (
                    <img
                      src={thumbs[i]}
                      alt=""
                      className="size-14 shrink-0 rounded-lg border border-border bg-background object-contain"
                    />
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">
                      {t("corpus.sign")} {n(i + 1)} · {t("corpus.line")} {n(g.line + 1)}
                    </p>
                    <p className="font-mono">
                      {p?.state === "named"
                        ? `${p.letter}${p.transliteration ? ` / ${p.transliteration}` : ""}`
                        : "?"}
                    </p>
                    <p className="text-muted-foreground">
                      {t("corpus.similarity")}: {sim.toFixed(2)} ·{" "}
                      {p?.state === "named"
                        ? t("corpus.state.match")
                        : p?.state === "abstain"
                          ? t("corpus.state.abstain")
                          : t("corpus.state.noModel")}
                    </p>
                    <p className="text-muted-foreground">
                      {g.w}×{g.h} px
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button variant="outline" className="mt-4 w-full" onClick={download}>
            <Download /> {t("corpus.download")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Similarity to the closest learned letter, whether or not it was accepted. */
function similarityOf(p: ModelPrediction) {
  if (p.state === "named") return p.similarity;
  if (p.state === "abstain") return p.best;
  return 0;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load that photograph."));
    img.src = url;
  });
}
