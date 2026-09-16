/**
 * On-device letter detection and the labelling loop that trains the matcher.
 *
 * Detection is real pixel work (adaptive binarisation, component labelling,
 * shape descriptors). Naming a sign is nearest-neighbour matching against
 * expert-approved labelled examples only — with too few examples the panel says
 * so instead of guessing, and unmatched signs stay "?".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ScanLine, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { glyphExemplars, glyphModel, submitGlyphLabel } from "@/lib/athar-api";
import {
  bestGuesses,
  guessLine,
  guessStrength,
  modelTransliteration,
  predictWithModel,
  type Guess,
  type ModelPrediction,
  type TrainedModel,
} from "@/lib/glyph-training";
import {
  DETECT_MAX_PIXELS,
  detectGlyphs,
  glyphThumbnail,
  type DetectedGlyph,
} from "@/lib/glyph-client";
import {
  MIN_EXAMPLES_PER_LETTER,
  MIN_SIMILARITY,
  matchGlyph,
  trainingStage,
  transliterate,
  type Candidate,
  type DatasetStats,
  type Exemplar,
  type MatchResult,
} from "@/lib/glyph-model";
import { fitScale, imageDataOf } from "@/lib/enhance-client";
import type { ScriptChoice } from "@/lib/inscription-prompt";

export const APP_VERSION = "athar-1.4";

type LabelScript = "thamudic" | "dadanitic" | "nabataean" | "other";

const STAGE_PLAN = [
  {
    n: 1,
    title: "Collect labelled examples",
    body: `Detection runs on device from the first photograph. Each letter needs ${MIN_EXAMPLES_PER_LETTER} approved examples before it can be suggested.`,
  },
  {
    n: 2,
    title: "Match single signs",
    body: "Letters that reached the example threshold are matched by shape similarity, one sign at a time.",
  },
  {
    n: 3,
    title: "Measure accuracy",
    body: "Once 12 letters are covered, an expert runs a leave-one-out check on the approved set. Below 60% the suggestions stay advisory.",
  },
  {
    n: 4,
    title: "Advisory suggestions in the reading flow",
    body: "Measured accuracy is published with the example count. It is never shown as proof of a reading.",
  },
] as const;

export type DetectorHint = {
  sequence: string;
  modelVersion: number;
  accuracy: number | null;
  letters: number;
};

export function LetterDetector({
  getCanvas,
  script,
  ready,
  onHint,
}: {
  getCanvas: () => Promise<HTMLCanvasElement>;
  script: ScriptChoice;
  ready: boolean;
  /** Offers the trained model's sequence to the reading flow as advisory input. */
  onHint?: (hint: DetectorHint | null) => void;
}) {
  const [invert, setInvert] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.25);
  const [direction, setDirection] = useState<"rtl" | "ltr">("rtl");
  const [busy, setBusy] = useState<string | null>(null);
  const [glyphs, setGlyphs] = useState<DetectedGlyph[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [exemplars, setExemplars] = useState<Exemplar[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [translit, setTranslit] = useState<Record<number, string>>({});
  const [provenance, setProvenance] = useState("");
  const [consent, setConsent] = useState(false);
  const [model, setModel] = useState<TrainedModel | null>(null);
  const [hintSent, setHintSent] = useState(false);
  const [estimate, setEstimate] = useState(false);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const labelScript: LabelScript | null =
    script === "thamudic" || script === "dadanitic" || script === "nabataean" || script === "other"
      ? script
      : null;

  useEffect(() => {
    if (!labelScript) {
      setExemplars([]);
      setStats(null);
      return;
    }
    let alive = true;
    void glyphExemplars(labelScript).then((res) => {
      if (!alive) return;
      setExemplars(res.exemplars ?? []);
      setStats(res.stats ?? null);
    });
    void glyphModel(labelScript).then((res) => {
      if (!alive) return;
      setModel(res.model ?? null);
    });
    return () => {
      alive = false;
    };
  }, [labelScript]);

  const modelPreds = useMemo<ModelPrediction[]>(
    () => glyphs.map((g) => predictWithModel(g.features, model)),
    [glyphs, model],
  );

  const modelLine = useMemo(() => modelTransliteration(modelPreds), [modelPreds]);

  // Worn-sign estimates: the closest letters regardless of the accept thresholds.
  const guesses = useMemo<Guess[][]>(
    () => (estimate ? glyphs.map((g) => bestGuesses(g.features, model, 3)) : []),
    [estimate, glyphs, model],
  );
  const estimateLine = useMemo(() => (estimate ? guessLine(guesses) : ""), [estimate, guesses]);

  const matches = useMemo<MatchResult[]>(
    () => glyphs.map((g) => matchGlyph(g.features, exemplars)),
    [glyphs, exemplars],
  );

  const run = useCallback(async () => {
    setBusy("Detecting marks on this device…");
    setInfo(null);
    try {
      const source = await getCanvas();
      const s = fitScale(source.width, source.height, DETECT_MAX_PIXELS);
      const work = document.createElement("canvas");
      work.width = Math.max(1, Math.round(source.width * s));
      work.height = Math.max(1, Math.round(source.height * s));
      work.getContext("2d")?.drawImage(source, 0, 0, work.width, work.height);

      const seg = await detectGlyphs(imageDataOf(work), {
        invert,
        k: sensitivity,
        direction,
      });
      setGlyphs(seg.glyphs);
      setThumbs(seg.glyphs.map((g) => glyphThumbnail(work, g)));
      setLabels({});
      setTranslit({});
      setHintSent(false);
      onHint?.(null);
      setInfo(
        `${seg.glyphs.length} candidate sign(s) in ${seg.lines} line(s), from ${seg.candidates} raw region(s) at ${work.width}×${work.height} px. Ink covers ${(seg.inkRatio * 100).toFixed(1)}% of the area.`,
      );

      const ov = overlayRef.current;
      if (ov) {
        const scale = Math.min(1, 640 / work.width);
        ov.width = Math.round(work.width * scale);
        ov.height = Math.round(work.height * scale);
        const ctx = ov.getContext("2d");
        if (ctx) {
          ctx.drawImage(work, 0, 0, ov.width, ov.height);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#A97C43";
          ctx.font = "12px sans-serif";
          ctx.fillStyle = "#173E36";
          seg.glyphs.forEach((g, i) => {
            ctx.strokeRect(g.x * scale, g.y * scale, g.w * scale, g.h * scale);
            ctx.fillText(String(i + 1), g.x * scale, Math.max(10, g.y * scale - 2));
          });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setBusy(null);
    }
  }, [getCanvas, invert, sensitivity, direction, onHint]);

  const line = useMemo(
    () =>
      transliterate(
        matches.map((m) => ({ state: m.state, candidates: m.candidates as Candidate[] })),
      ),
    [matches],
  );

  const submit = async (i: number) => {
    const g = glyphs[i];
    const letter = (labels[i] ?? "").trim();
    if (!g || !labelScript || !letter) return;
    if (!consent) {
      toast.error("Tick the sharing consent box before submitting a label.");
      return;
    }
    const res = await submitGlyphLabel({
      script: labelScript,
      letter,
      features: g.features,
      consent: true,
      appVersion: APP_VERSION,
      ...(translit[i]?.trim() ? { transliteration: translit[i]!.trim() } : {}),
      ...(provenance.trim() ? { provenance: provenance.trim() } : {}),
    });
    if (!res.ok) {
      toast.error(res.error ?? "Could not store the label.");
      return;
    }
    toast.success("Label queued for expert review.");
    setLabels((l) => ({ ...l, [i]: "" }));
  };

  const stage = stats ? trainingStage(stats) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-semibold">Detect letters on this device</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Adaptive local thresholding, morphological cleanup, connected-component grouping and a
          shape measurement per sign — all computed here, from the pixels of your photograph.
          Nothing is sent anywhere by this step.
        </p>

        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="glyph-invert" className="text-sm">
              Light marks on dark stone
            </Label>
            <Switch id="glyph-invert" checked={invert} onCheckedChange={setInvert} />
          </div>
          <div>
            <Label className="text-sm">Sensitivity {sensitivity.toFixed(2)}</Label>
            <Slider
              className="mt-2"
              min={0.1}
              max={0.5}
              step={0.01}
              value={[sensitivity]}
              onValueChange={(v) => setSensitivity(v[0] ?? 0.25)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sign order:</span>
            <Button
              size="sm"
              variant={direction === "rtl" ? "default" : "outline"}
              onClick={() => setDirection("rtl")}
            >
              Right to left
            </Button>
            <Button
              size="sm"
              variant={direction === "ltr" ? "default" : "outline"}
              onClick={() => setDirection("ltr")}
            >
              Left to right
            </Button>
          </div>
        </div>

        <Button
          className="mt-3 w-full"
          size="lg"
          onClick={() => void run()}
          disabled={!!busy || !ready}
        >
          <ScanLine /> {busy ? busy : "Detect letters"}
        </Button>
        {!ready && (
          <p className="mt-2 text-sm text-muted-foreground">
            Run an enhancement first — detection uses the enhanced image.
          </p>
        )}
        {info && <p className="mt-2 text-sm text-muted-foreground">{info}</p>}
        <canvas
          ref={overlayRef}
          className={`mt-3 w-full rounded-xl border border-border ${glyphs.length ? "" : "hidden"}`}
        />
      </div>

      {glyphs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-semibold">Detected signs</h3>
          {!labelScript && (
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a specific script above to match these shapes against labelled examples. With
              “Suggest script” the panel only outlines the marks.
            </p>
          )}
          {labelScript && (
            <p className="mt-1 text-sm text-muted-foreground">
              Values in brackets are raw shape similarity, not calibrated confidence. Signs with no
              close labelled example stay “?”.
            </p>
          )}

          <div className="mt-3 rounded-xl bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Trained model reading of detected order
            </p>
            {model ? (
              <>
                <p className="mt-1 break-words font-mono text-sm">{modelLine || "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Model v{model.version}, {model.letters} letter(s),{" "}
                  {model.accuracy === null
                    ? "accuracy unmeasured"
                    : `${(model.accuracy * 100).toFixed(1)}% cross-validated accuracy on approved examples`}
                  . Signs the model was not confident enough about stay “?”. This is a shape
                  hypothesis, not a transcription.
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Label htmlFor="glyph-estimate" className="text-sm">
                    Estimate worn signs (closest letters even when uncertain)
                  </Label>
                  <Switch id="glyph-estimate" checked={estimate} onCheckedChange={setEstimate} />
                </div>
                {estimate && (
                  <div className="mt-2 rounded-lg border border-border p-2">
                    <p className="break-words font-mono text-sm">{estimateLine || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Estimate only. Letters in brackets did not reach their accepted threshold, and
                      “?” means the shape resembles no trained letter. Never quote this line as a
                      reading — it is the model's closest shape, including for signs that may be too
                      worn to read at all.
                    </p>
                  </div>
                )}
                {onHint && (
                  <Button
                    size="sm"
                    variant={hintSent ? "default" : "outline"}
                    className="mt-2"
                    onClick={() => {
                      onHint({
                        sequence: modelLine,
                        modelVersion: model.version,
                        accuracy: model.accuracy,
                        letters: model.letters,
                      });
                      setHintSent(true);
                      toast.success("Sent to the reading step as advisory input.");
                    }}
                  >
                    {hintSent ? <Check /> : <Send />}{" "}
                    {hintSent ? "Attached to the reading" : "Use as a hint when reading"}
                  </Button>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No trained model is active for this script yet, so the model names nothing. It is
                built only from expert-approved examples of documented photographs.
              </p>
            )}
          </div>

          <div className="mt-3 rounded-xl bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Nearest-example transliteration (fallback)
            </p>
            <p className="mt-1 break-words font-mono text-sm">{line || "—"}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard.writeText(line);
                toast.success("Copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {glyphs.map((g, i) => {
              const m = matches[i];
              return (
                <div key={`${g.x}-${g.y}-${i}`} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-3">
                    {thumbs[i] && (
                      <img
                        src={thumbs[i]}
                        alt={`Detected sign ${i + 1}`}
                        className="size-16 shrink-0 rounded-lg border border-border bg-background object-contain"
                      />
                    )}
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">
                        Sign {i + 1} · line {g.line + 1}
                      </p>
                      <p className="text-muted-foreground">
                        {g.w}×{g.h} px · {g.endpoints} stroke end(s) · {g.junctions} junction(s) ·{" "}
                        {g.holes} enclosed area(s)
                      </p>
                      {model && (
                        <p className="mt-1">
                          Model:{" "}
                          {(() => {
                            const p = modelPreds[i];
                            if (!p || p.state === "no_model") return "no active model";
                            if (p.state === "abstain")
                              return `abstained (closest ${p.bestLetter ?? "—"} at ${p.best.toFixed(2)} similarity, below its learned threshold)`;
                            return `${p.letter}${p.transliteration ? ` / ${p.transliteration}` : ""} · similarity ${p.similarity.toFixed(2)} · margin ${p.margin.toFixed(2)}`;
                          })()}
                        </p>
                      )}
                      {estimate && guesses[i]?.length ? (
                        <p className="mt-1 text-muted-foreground">
                          Closest letters:{" "}
                          {guesses[i]!.map(
                            (c) =>
                              `${c.transliteration ?? c.letter} ${c.similarity.toFixed(2)} (${guessStrength(c.similarity)})`,
                          ).join(" · ")}
                        </p>
                      ) : null}
                      <p className="mt-1">
                        {!labelScript
                          ? "Script not selected."
                          : m?.state === "insufficient_data"
                            ? `Not enough approved examples yet (each letter needs ${MIN_EXAMPLES_PER_LETTER}).`
                            : m?.state === "no_match"
                              ? `No labelled example within the ${MIN_SIMILARITY} similarity threshold (best ${m.best.toFixed(2)}).`
                              : (m?.candidates ?? [])
                                  .map(
                                    (c) =>
                                      `${c.letter}${c.transliteration ? ` / ${c.transliteration}` : ""} [${c.similarity.toFixed(2)}]`,
                                  )
                                  .join(" · ")}
                      </p>
                    </div>
                  </div>

                  {labelScript && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Letter name"
                        value={labels[i] ?? ""}
                        onChange={(e) => setLabels((l) => ({ ...l, [i]: e.target.value }))}
                      />
                      <Input
                        placeholder="Transliteration (optional)"
                        value={translit[i] ?? ""}
                        onChange={(e) => setTranslit((l) => ({ ...l, [i]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="col-span-2"
                        disabled={!(labels[i] ?? "").trim()}
                        onClick={() => void submit(i)}
                      >
                        <Send /> Submit this label for expert review
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {labelScript && (
            <div className="mt-4 space-y-2 rounded-xl bg-muted p-3">
              <Label htmlFor="glyph-prov" className="text-sm">
                Provenance for these labels (site, publication, editor)
              </Label>
              <Input
                id="glyph-prov"
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
                placeholder="e.g. Jubbah, published as JSTham 123"
              />
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="glyph-consent" className="text-sm">
                  Share these shape measurements for expert review and the shared dataset
                </Label>
                <Switch id="glyph-consent" checked={consent} onCheckedChange={setConsent} />
              </div>
              <p className="text-xs text-muted-foreground">
                Only the numeric shape measurements and your letter name are sent — not the
                photograph. Labels stay unused until an expert approves them.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4" /> Training plan and current state
        </h3>
        {stats ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {stats.script}: {stats.approved} approved example(s), {stats.pending} awaiting review,{" "}
              {stats.letters} letter(s) started, {stats.lettersReady} ready for matching.
            </p>
            {stage && (
              <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                <p className="font-semibold">{stage.title}</p>
                <p className="mt-1 text-muted-foreground">{stage.detail}</p>
                <p className="mt-1">Next: {stage.next}</p>
              </div>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a specific script to see its dataset state.
          </p>
        )}
        <ol className="mt-3 space-y-2 text-sm">
          {STAGE_PLAN.map((s) => (
            <li
              key={s.n}
              className={`rounded-xl border p-3 ${
                stage?.stage === s.n ? "border-primary bg-tab-active" : "border-border"
              }`}
            >
              <p className="font-semibold">
                Stage {s.n} — {s.title}
              </p>
              <p className="text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          This matcher learns only by storing approved examples — there is no neural-network
          training pipeline in this app, and accuracy figures come from the measurement above, not
          from an estimate.
        </p>
      </div>
    </div>
  );
}
