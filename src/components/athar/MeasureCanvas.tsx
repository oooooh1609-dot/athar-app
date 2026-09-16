/**
 * Measuring surface: the photograph, the scale reference, and the shapes
 * placed on top of it.
 *
 * Points are stored in the photograph's own pixel space, never in screen
 * space, so a set survives rotation of the device, a different display size,
 * and being reopened on another machine. Everything on screen is derived from
 * those coordinates at paint time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Move3d, Ruler, Shapes, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { useObjectUrl } from "@/lib/object-url";
import {
  COMMON_REFERENCES,
  describe,
  evaluate,
  referenceIsWeak,
  referenceRelativeError,
  type Measurement,
  type MeasurementKind,
  type MeasurementSet,
  type Point,
} from "@/lib/measure";

type Mode = "scale" | MeasurementKind;

const COLOURS: Record<Mode, string> = {
  scale: "#e0a458",
  length: "#3f8ea7",
  path: "#3f8ea7",
  area: "#8a6bbd",
};

export function MeasureCanvas({
  image,
  initial,
  onChange,
}: {
  image: Blob;
  initial?: MeasurementSet;
  onChange?: (set: MeasurementSet) => void;
}) {
  const { t, n } = useI18n();
  const url = useObjectUrl(image);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<HTMLImageElement | null>(null);

  const [size, setSize] = useState({ w: initial?.imageWidth ?? 0, h: initial?.imageHeight ?? 0 });
  const [mode, setMode] = useState<Mode>("scale");
  const [draft, setDraft] = useState<Point[]>([]);
  const [refMm, setRefMm] = useState(100);
  const [refLabel, setRefLabel] = useState("scale10");
  const [set, setSet] = useState<MeasurementSet>(
    initial ?? { reference: null, items: [], imageWidth: 0, imageHeight: 0 },
  );

  const publish = useCallback(
    (next: MeasurementSet) => {
      setSet(next);
      onChange?.(next);
    },
    [onChange],
  );

  /* ————— load the photograph and size the canvas to it ————— */
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      bitmapRef.current = img;
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
      setSet((s) =>
        s.imageWidth ? s : { ...s, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight },
      );
    };
    img.src = url;
    return () => {
      bitmapRef.current = null;
    };
  }, [url]);

  /* ————— paint ————— */
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = bitmapRef.current;
    if (!canvas || !img || !size.w) return;
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);
    // Line weight is tied to image size so a 6000 px photo does not get
    // hairlines and a 600 px one does not get slabs.
    const unit = Math.max(2, size.w / 500);

    const stroke = (points: Point[], colour: string, close: boolean) => {
      if (points.length === 0) return;
      ctx.lineWidth = unit;
      ctx.strokeStyle = colour;
      ctx.fillStyle = `${colour}33`;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      if (close && points.length > 2) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, unit * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = unit * 0.6;
        ctx.stroke();
      }
    };

    if (set.reference) stroke([set.reference.a, set.reference.b], COLOURS.scale, false);
    for (const m of set.items) stroke(m.points, COLOURS[m.kind], m.kind === "area");
    if (draft.length) stroke(draft, COLOURS[mode], mode === "area" && draft.length > 2);
  }, [set, draft, mode, size]);

  /* ————— pointer input ————— */
  const toImageSpace = (ev: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = ev.currentTarget.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * size.w,
      y: ((ev.clientY - rect.top) / rect.height) * size.h,
    };
  };

  const addPoint = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (!size.w) return;
    const p = toImageSpace(ev);

    if (mode === "scale") {
      const next = [...draft, p].slice(-2);
      if (next.length === 2) {
        publish({
          ...set,
          reference: { a: next[0]!, b: next[1]!, realMm: refMm, label: labelText(refLabel) },
          imageWidth: size.w,
          imageHeight: size.h,
        });
        setDraft([]);
        setMode("length");
      } else setDraft(next);
      return;
    }

    const next = [...draft, p];
    // A simple length is complete at two points; a path or an area keeps
    // collecting until the user says it is finished.
    if (mode === "length" && next.length === 2) commit(next);
    else setDraft(next);
  };

  const labelText = (key: string) =>
    COMMON_REFERENCES.some((r) => r.key === key) ? t(`ms.ref.${key}`) : t("ms.ref.custom");

  const commit = (points: Point[]) => {
    const needed = mode === "area" ? 3 : 2;
    if (points.length < needed) return;
    const item: Measurement = {
      id: crypto.randomUUID(),
      kind: mode === "scale" ? "length" : mode,
      points,
      label: `${t(`ms.tool.${mode === "scale" ? "length" : mode}`)} ${set.items.length + 1}`,
    };
    publish({ ...set, items: [...set.items, item], imageWidth: size.w, imageHeight: size.h });
    setDraft([]);
  };

  const weak = referenceIsWeak(set.reference);
  const weakPercent = n(Math.round(referenceRelativeError(set.reference) * 1000) / 10);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold">{t("ms.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("ms.intro")}</p>
      </div>

      {/* scale reference */}
      <div className="panel space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="ms-ref">{t("ms.refLabel")}</Label>
            <select
              id="ms-ref"
              value={refLabel}
              onChange={(e) => {
                setRefLabel(e.target.value);
                const found = COMMON_REFERENCES.find((r) => r.key === e.target.value);
                if (found) setRefMm(found.mm);
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              {COMMON_REFERENCES.map((r) => (
                <option key={r.key} value={r.key}>
                  {t(`ms.ref.${r.key}`)}
                </option>
              ))}
              <option value="custom">{t("ms.ref.custom")}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="ms-mm">{t("ms.knownLength")}</Label>
            <Input
              id="ms-mm"
              type="number"
              inputMode="decimal"
              min={1}
              value={refMm}
              onChange={(e) => setRefMm(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          variant={mode === "scale" ? "default" : "outline"}
          onClick={() => {
            setMode("scale");
            setDraft([]);
          }}
          className="w-full"
        >
          <Crosshair className="me-2 size-4" />
          {t("ms.setScale")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("ms.scaleHint")}</p>
        {!set.reference && <p className="text-xs font-semibold text-accent">{t("ms.noScale")}</p>}
        {weak && (
          <p className="text-xs font-semibold text-accent">
            {t("ms.weakScale", { percent: weakPercent })}
          </p>
        )}
      </div>

      {/* the photograph */}
      <canvas
        ref={canvasRef}
        onPointerDown={addPoint}
        className="w-full cursor-crosshair touch-none rounded-lg border border-border"
        // exactOptionalPropertyTypes rejects an explicit undefined here.
        style={size.w && size.h ? { aspectRatio: `${size.w} / ${size.h}` } : {}}
      />

      {/* tools */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["length", <Ruler key="l" className="size-4" />],
            ["path", <Move3d key="p" className="size-4" />],
            ["area", <Shapes key="a" className="size-4" />],
          ] as const
        ).map(([id, icon]) => (
          <Button
            key={id}
            variant={mode === id ? "default" : "outline"}
            disabled={!set.reference}
            onClick={() => {
              setMode(id);
              setDraft([]);
            }}
          >
            {icon}
            <span className="ms-2">{t(`ms.tool.${id}`)}</span>
          </Button>
        ))}
      </div>

      {draft.length > 0 && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDraft(draft.slice(0, -1))}>
            <Undo2 className="me-2 size-4" />
            {t("ms.undo")}
          </Button>
          {mode !== "scale" && mode !== "length" && (
            <Button
              onClick={() => commit(draft)}
              disabled={draft.length < (mode === "area" ? 3 : 2)}
            >
              {t("ms.finish")}
            </Button>
          )}
        </div>
      )}

      {/* results */}
      {set.items.length > 0 && (
        <ul className="panel divide-y divide-border p-0">
          {set.items.map((m) => {
            const q = evaluate(m, set.reference);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{m.label}</span>
                  <span className="block font-mono text-xs text-muted-foreground" dir="ltr">
                    {q ? describe(q, m.kind) : "—"}
                  </span>
                </span>
                <button
                  onClick={() => publish({ ...set, items: set.items.filter((x) => x.id !== m.id) })}
                  aria-label={t("ms.remove")}
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {set.items.length > 0 && (
        <Button variant="outline" onClick={() => publish({ ...set, items: [] })} className="w-full">
          {t("ms.clear")}
        </Button>
      )}

      <p className="panel p-3 text-xs text-muted-foreground">{t("ms.caveat")}</p>
    </div>
  );
}
