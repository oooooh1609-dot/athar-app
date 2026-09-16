/**
 * 360° panorama viewer.
 *
 * Drag to look, pinch or scroll to zoom, tap to drop an information point on
 * the wall. Rendering is canvas sampling rather than WebGL — see
 * src/lib/panorama.ts for why.
 *
 * Two performance decisions worth knowing before changing anything here:
 *
 *  - The source photograph is decoded once into an ImageData and reused. A
 *    360° image is commonly 8000×4000; re-reading it per frame would drop
 *    the viewer to a slideshow.
 *  - The output canvas is capped at MAX_OUT pixels wide and stretched by CSS.
 *    Sampling scales with output area, not source size, so this is the single
 *    knob that decides whether the viewer is smooth on a phone.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, Crosshair, ImageUp, Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_VIEW,
  clampFov,
  clampPitch,
  hotspotFromScreen,
  looksEquirectangular,
  projectHotspot,
  renderPanorama,
  wrapYaw,
  type Hotspot,
  type View,
} from "@/lib/panorama";

const MAX_OUT = 720;

export function PanoramaViewer() {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const outRef = useRef<ImageData | null>(null);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW });
  const frameRef = useRef(0);

  const [loaded, setLoaded] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [placing, setPlacing] = useState(false);
  const [label, setLabel] = useState("");
  const [, forceRepaint] = useState(0);

  /* ————— painting ————— */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const src = sourceRef.current;
    const out = outRef.current;
    if (!canvas || !src || !out) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderPanorama(out, src, viewRef.current);
    ctx.putImageData(out, 0, 0);
    // Hotspot overlays move with the view, so they repaint with it.
    forceRepaint((n) => n + 1);
  }, []);

  /** Coalesces input into one paint per animation frame. */
  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  /* ————— loading ————— */
  const loadFile = async (file: File) => {
    setWarning(null);
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      setWarning(t("pv.unreadable"));
      return;
    }
    if (!looksEquirectangular(bitmap.width, bitmap.height)) setWarning(t("pv.notEquirect"));

    const off = document.createElement("canvas");
    off.width = bitmap.width;
    off.height = bitmap.height;
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    octx.drawImage(bitmap, 0, 0);
    sourceRef.current = octx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = Math.min(MAX_OUT, Math.floor(canvas.clientWidth || MAX_OUT));
    const h = Math.round((w * 9) / 16);
    canvas.width = w;
    canvas.height = h;
    outRef.current = canvas.getContext("2d")!.createImageData(w, h);

    viewRef.current = { ...DEFAULT_VIEW };
    setLoaded(true);
    schedule();
  };

  /* ————— pointer handling ————— */
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(
    null,
  );
  const pinch = useRef<{ distance: number; fov: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), fov: viewRef.current.fov };
      drag.current = null;
      return;
    }
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: viewRef.current.yaw,
      pitch: viewRef.current.pitch,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (distance > 0)
        viewRef.current.fov = clampFov(pinch.current.fov * (pinch.current.distance / distance));
      schedule();
      return;
    }

    const d = drag.current;
    if (!d) return;
    const canvas = e.currentTarget;
    // Degrees per pixel follows the zoom level, so dragging feels the same
    // whether zoomed in or out.
    const perPixel = viewRef.current.fov / canvas.clientWidth;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    viewRef.current.yaw = wrapYaw(d.yaw - dx * perPixel);
    viewRef.current.pitch = clampPitch(d.pitch + dy * perPixel);
    schedule();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;

    // A tap, not a drag: place a point if the user asked to.
    if (!d || d.moved || !placing || !label.trim()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir = hotspotFromScreen(
      ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
      e.currentTarget.width,
      e.currentTarget.height,
      viewRef.current,
    );
    setHotspots((h) => [...h, { id: crypto.randomUUID(), ...dir, label: label.trim() }]);
    setLabel("");
    setPlacing(false);
  };

  const zoom = (by: number) => {
    viewRef.current.fov = clampFov(viewRef.current.fov + by);
    schedule();
  };

  const canvas = canvasRef.current;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-bold">
          <Compass className="size-4 text-muted-foreground" />
          {t("pv.title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("pv.intro")}</p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-semibold">
        <ImageUp className="size-4" />
        {t("pv.load")}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
            e.target.value = "";
          }}
        />
      </label>

      {warning && <p className="panel p-3 text-xs text-accent">{warning}</p>}

      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => zoom(e.deltaY > 0 ? 4 : -4)}
          className={`aspect-video w-full touch-none rounded-lg border border-border bg-muted ${
            placing ? "cursor-crosshair" : "cursor-grab"
          }`}
        />

        {loaded &&
          canvas &&
          hotspots.map((spot) => {
            const at = projectHotspot(spot, viewRef.current, canvas.width, canvas.height);
            if (!at) return null;
            return (
              <span
                key={spot.id}
                style={{
                  left: `${(at.x / canvas.width) * 100}%`,
                  top: `${(at.y / canvas.height) * 100}%`,
                }}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-primary/90 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"
              >
                {spot.label}
              </span>
            );
          })}

        {!loaded && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            {t("pv.empty")}
          </span>
        )}
      </div>

      {loaded && (
        <>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => zoom(6)}
              aria-label={t("pv.zoomOut")}
            >
              <Minus className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => zoom(-6)}
              aria-label={t("pv.zoomIn")}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                viewRef.current = { ...DEFAULT_VIEW };
                schedule();
              }}
            >
              {t("pv.recentre")}
            </Button>
          </div>

          <div className="panel space-y-2 p-3">
            <p className="text-sm font-semibold">{t("pv.points")}</p>
            <div className="flex gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("pv.pointLabel")}
              />
              <Button
                variant={placing ? "default" : "outline"}
                disabled={!label.trim()}
                onClick={() => setPlacing((p) => !p)}
              >
                <Crosshair className="size-4" />
              </Button>
            </div>
            {placing && <p className="text-xs text-accent">{t("pv.tapToPlace")}</p>}

            {hotspots.length > 0 && (
              <ul className="divide-y divide-border">
                {hotspots.map((spot) => (
                  <li key={spot.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate text-sm">{spot.label}</span>
                    <button
                      onClick={() => setHotspots((h) => h.filter((x) => x.id !== spot.id))}
                      aria-label={t("pv.removePoint")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <p className="panel p-3 text-xs text-muted-foreground">{t("pv.caveat")}</p>
    </div>
  );
}
