/**
 * Administrator workspace for building the training corpus from openly licensed
 * inscription photographs.
 *
 * A photograph is added with its source link and licence, fetched through the
 * app, and segmented on this device by the same pixel pipeline the reading flow
 * uses. Each detected sign is then named, or explicitly marked unknown when its
 * letter cannot be identified — unknown signs are recorded but never trained on.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HelpCircle, ImagePlus, Save, ScanLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { corpusManage } from "@/lib/athar-api";
import type { CorpusImage } from "@/lib/corpus-types";
import { fitScale, imageDataOf } from "@/lib/enhance-client";
import {
  DETECT_MAX_PIXELS,
  detectGlyphs,
  glyphThumbnail,
  type DetectedGlyph,
} from "@/lib/glyph-client";

const SCRIPTS = ["thamudic", "dadanitic", "nabataean", "other"] as const;

type Draft = { letter: string; translit: string; unknown: boolean };

export function CorpusLabeller() {
  const [script, setScript] = useState<string>("thamudic");
  const [images, setImages] = useState<CorpusImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    siglum: "",
    imageUrl: "",
    sourceUrl: "",
    license: "",
    credit: "",
  });

  const [active, setActive] = useState<CorpusImage | null>(null);
  const [glyphs, setGlyphs] = useState<DetectedGlyph[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [info, setInfo] = useState<string | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async (s: string) => {
    setBusy(true);
    const res = await corpusManage({ action: "list", script: s });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not read the corpus.");
      return;
    }
    setImages(res.images ?? []);
  }, []);

  useEffect(() => {
    void load(script);
  }, [script, load]);

  const add = async () => {
    if (!form.title.trim() || !form.imageUrl.trim() || !form.license.trim()) {
      toast.error("Title, image link and licence are required.");
      return;
    }
    setBusy(true);
    const res = await corpusManage({
      action: "add",
      script,
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      license: form.license.trim(),
      ...(form.siglum.trim() ? { siglum: form.siglum.trim() } : {}),
      ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
      ...(form.credit.trim() ? { credit: form.credit.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not add that photograph.");
      return;
    }
    toast.success("Photograph added to the corpus.");
    setForm({ title: "", siglum: "", imageUrl: "", sourceUrl: "", license: "", credit: "" });
    void load(script);
  };

  const remove = async (id: string) => {
    const res = await corpusManage({ action: "delete", id });
    if (!res.ok) {
      toast.error(res.error ?? "Could not remove that photograph.");
      return;
    }
    if (active?.id === id) setActive(null);
    void load(script);
  };

  const segment = async (img: CorpusImage) => {
    setActive(img);
    setGlyphs([]);
    setThumbs([]);
    setDrafts({});
    setInfo("Fetching and segmenting the photograph…");
    try {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.src = `/api/corpus/image?id=${encodeURIComponent(img.id)}`;
      await el.decode();

      const s = fitScale(el.naturalWidth, el.naturalHeight, DETECT_MAX_PIXELS);
      const work = document.createElement("canvas");
      work.width = Math.max(1, Math.round(el.naturalWidth * s));
      work.height = Math.max(1, Math.round(el.naturalHeight * s));
      work.getContext("2d")?.drawImage(el, 0, 0, work.width, work.height);

      const seg = await detectGlyphs(imageDataOf(work), {
        invert: false,
        k: 0.25,
        direction: "rtl",
      });
      setGlyphs(seg.glyphs);
      setThumbs(seg.glyphs.map((g) => glyphThumbnail(work, g)));
      setInfo(
        `${seg.glyphs.length} candidate sign(s) in ${seg.lines} line(s) at ${work.width}×${work.height} px. Name each sign you can identify; mark the rest unknown.`,
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
          ctx.fillStyle = "#173E36";
          ctx.font = "12px sans-serif";
          seg.glyphs.forEach((g, i) => {
            ctx.strokeRect(g.x * scale, g.y * scale, g.w * scale, g.h * scale);
            ctx.fillText(String(i + 1), g.x * scale, Math.max(10, g.y * scale - 2));
          });
        }
      }
    } catch (err) {
      setInfo(null);
      toast.error(
        err instanceof Error ? err.message : "That photograph could not be fetched or read.",
      );
    }
  };

  const save = async () => {
    if (!active) return;
    const signs = glyphs
      .map((g, i) => ({ g, d: drafts[i] }))
      .filter(({ d }) => d && (d.unknown || d.letter.trim()))
      .map(({ g, d }) => ({
        letter: d!.unknown ? "unknown" : d!.letter.trim(),
        unknown: !!d!.unknown,
        features: g.features,
        bbox: { x: g.x, y: g.y, w: g.w, h: g.h },
        ...(d!.translit.trim() && !d!.unknown ? { transliteration: d!.translit.trim() } : {}),
      }));
    if (signs.length === 0) {
      toast.error("Name at least one sign, or mark signs unknown, before saving.");
      return;
    }
    setBusy(true);
    const res = await corpusManage({ action: "label", id: active.id, signs });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save these labels.");
      return;
    }
    toast.success(
      `${res.named ?? 0} letter(s) added to training, ${res.unknown ?? 0} sign(s) recorded as unknown.`,
    );
    setDrafts({});
    void load(script);
  };

  const setDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({
      ...d,
      [i]: { letter: "", translit: "", unknown: false, ...d[i], ...patch },
    }));

  return (
    <section className="panel space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold">
          <ImagePlus className="size-4" /> Documented-photograph corpus
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add only photographs you are allowed to use, with their source link and licence. Letters
          named here become the training examples of the reading model, each traceable to its
          photograph. Signs you cannot identify are recorded as unknown and are excluded from
          training.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCRIPTS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={script === s ? "default" : "outline"}
            onClick={() => setScript(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="c-title" className="text-sm">
            Title
          </Label>
          <Input
            id="c-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Thamudic B inscription, Jubbah"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-siglum" className="text-sm">
            Publication siglum (optional)
          </Label>
          <Input
            id="c-siglum"
            value={form.siglum}
            onChange={(e) => setForm((f) => ({ ...f, siglum: e.target.value }))}
            placeholder="e.g. JSTham 123"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-image" className="text-sm">
            Direct image link
          </Label>
          <Input
            id="c-image"
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            placeholder="https://…/photo.jpg"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-source" className="text-sm">
            Source page (optional)
          </Label>
          <Input
            id="c-source"
            value={form.sourceUrl}
            onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-license" className="text-sm">
            Licence
          </Label>
          <Input
            id="c-license"
            value={form.license}
            onChange={(e) => setForm((f) => ({ ...f, license: e.target.value }))}
            placeholder="e.g. CC BY-SA 4.0"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c-credit" className="text-sm">
            Credit (optional)
          </Label>
          <Input
            id="c-credit"
            value={form.credit}
            onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value }))}
            placeholder="Photographer or institution"
          />
        </div>
      </div>
      <Button onClick={() => void add()} disabled={busy}>
        <ImagePlus /> Add photograph
      </Button>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photographs stored for this script yet.</p>
      ) : (
        <div className="space-y-2">
          {images.map((img) => (
            <article key={img.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-semibold">
                {img.siglum ? `${img.siglum} · ` : ""}
                {img.title}
              </p>
              <p className="text-muted-foreground">
                {img.license}
                {img.credit ? ` · ${img.credit}` : ""} · {img.labelled_signs} letter(s) labelled,{" "}
                {img.unknown_signs} unknown
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void segment(img)}>
                  <ScanLine /> Segment and label
                </Button>
                {img.source_url && (
                  <a
                    className="text-sm underline"
                    href={img.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Source
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={() => void remove(img.id)}>
                  <Trash2 /> Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {active && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="font-semibold">
            Labelling: {active.siglum ? `${active.siglum} · ` : ""}
            {active.title}
          </p>
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          <canvas
            ref={overlayRef}
            className={`w-full rounded-xl border border-border ${glyphs.length ? "" : "hidden"}`}
          />
          {glyphs.map((g, i) => {
            const d = drafts[i];
            return (
              <div key={`${g.x}-${g.y}-${i}`} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-3">
                  {thumbs[i] && (
                    <img
                      src={thumbs[i]}
                      alt={`Sign ${i + 1}`}
                      className="size-16 shrink-0 rounded-lg border border-border bg-background object-contain"
                    />
                  )}
                  <div className="text-sm">
                    <p className="font-semibold">
                      Sign {i + 1} · line {g.line + 1}
                    </p>
                    <p className="text-muted-foreground">
                      {g.w}×{g.h} px · {g.endpoints} stroke end(s) · {g.holes} enclosed area(s)
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Letter name"
                    value={d?.letter ?? ""}
                    disabled={!!d?.unknown}
                    onChange={(e) => setDraft(i, { letter: e.target.value })}
                  />
                  <Input
                    placeholder="Transliteration (optional)"
                    value={d?.translit ?? ""}
                    disabled={!!d?.unknown}
                    onChange={(e) => setDraft(i, { translit: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant={d?.unknown ? "default" : "outline"}
                    className="col-span-2"
                    onClick={() => setDraft(i, { unknown: !d?.unknown })}
                  >
                    <HelpCircle /> {d?.unknown ? "Marked unknown" : "Mark this sign unknown"}
                  </Button>
                </div>
              </div>
            );
          })}
          {glyphs.length > 0 && (
            <Button onClick={() => void save()} disabled={busy}>
              <Save /> Save labels for this photograph
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
