/**
 * Full-screen managed camera for Athar.
 *
 * Honest boundaries kept in this file:
 * - Lens, torch, focus and exposure buttons appear only when the live track
 *   advertises them. Zoom is labelled hardware or digital; digital zoom crops
 *   the saved photograph by exactly the same factor shown on screen.
 * - The loupe, focus peaking, histogram and clipping overlays are software
 *   preview aids drawn on separate canvases. The exported JPEG is drawn from
 *   the raw video frame, so no overlay can leak into a saved photograph.
 * - Frame checks (blur / exposure / near-duplicate) come from real pixel
 *   measurements on downscaled preview frames. No coverage map or percentage
 *   is shown, because the browser gives no pose tracking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  HelpCircle,
  CheckCircle2,
  ChevronDown,
  Flashlight,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cameraSession, type CameraCapabilities } from "@/lib/camera-session";
import { DocumentStraighten } from "./DocumentStraighten";
import { useI18n } from "@/lib/i18n";
import { logActivity } from "@/lib/activity-log";

export type CaptureMode =
  "photo" | "rockart" | "inscription" | "object3d" | "surface" | "multilight" | "document";

export type CapturedPhoto = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  /** Digital-zoom factor applied by cropping, 1 when none. */
  digitalZoom: number;
  mode: CaptureMode;
  at: number;
};

const MODES: CaptureMode[] = [
  "photo",
  "rockart",
  "inscription",
  "object3d",
  "surface",
  "multilight",
  "document",
];
/** Modes that collect a set of photographs before handing them back. */
const MULTI: CaptureMode[] = ["object3d", "surface", "multilight", "inscription"];
/**
 * Modes where the camera itself travels, so a near-identical frame is a real
 * warning and automatic capture on viewpoint change makes sense. In multi-light
 * work the camera must NOT move, so those checks are deliberately disabled.
 */
const MOVING: CaptureMode[] = ["object3d", "surface"];

/* ---------- preview frame measurements ---------- */

const ANALYSIS_W = 160;

type FrameStats = {
  /** Variance of the Laplacian: higher is sharper. */
  sharpness: number;
  mean: number;
  clipped: number;
  histogram: number[];
  /** 0..1 difference against the previous accepted viewpoint. */
  change: number;
  luma: Float32Array;
  w: number;
  h: number;
};

function measure(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  reference: Float32Array | null,
): FrameStats {
  const { data } = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const luma = new Float32Array(n);
  const histogram = new Array<number>(32).fill(0);
  let sum = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const y =
      0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
    luma[i] = y;
    sum += y;
    if (y >= 250) clipped++;
    const bin = Math.min(31, (y / 8) | 0);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
  }
  // Laplacian variance over the interior.
  let lsum = 0;
  let lsq = 0;
  let count = 0;
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i;
      const v =
        4 * (luma[k] ?? 0) -
        (luma[k - 1] ?? 0) -
        (luma[k + 1] ?? 0) -
        (luma[k - w] ?? 0) -
        (luma[k + w] ?? 0);
      lsum += v;
      lsq += v * v;
      count++;
    }
  }
  const lmean = count ? lsum / count : 0;
  const sharpness = count ? lsq / count - lmean * lmean : 0;

  let change = 1;
  if (reference && reference.length === n) {
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs((luma[i] ?? 0) - (reference[i] ?? 0));
    change = Math.min(1, diff / n / 40);
  }
  return {
    sharpness,
    mean: sum / n,
    clipped: clipped / n,
    histogram,
    change,
    luma,
    w,
    h,
  };
}

export function CameraCapture({
  initialMode = "inscription",
  onDone,
  onClose,
}: {
  initialMode?: CaptureMode;
  onDone: (photos: CapturedPhoto[]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const referenceRef = useRef<Float32Array | null>(null);
  const lastAutoRef = useRef(0);

  const [state, setState] = useState(cameraSession.state);
  const [caps, setCaps] = useState<CameraCapabilities | null>(cameraSession.capabilities);
  const [errName, setErrName] = useState<string | null>(cameraSession.error);

  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [peaking, setPeaking] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [histogram, setHistogram] = useState(true);
  const [loupe, setLoupe] = useState(false);
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [advice, setAdvice] = useState<string[]>([]);
  const [grid, setGrid] = useState(false);
  const [timer, setTimer] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [help, setHelp] = useState(false);
  const [pending, setPending] = useState<CapturedPhoto | null>(null);

  const multi = MULTI.includes(mode);
  const moving = MOVING.includes(mode);
  const hardwareZoom = caps?.zoom ?? null;
  /** Digital zoom is only used when the lens itself cannot zoom. */
  const digital = !hardwareZoom;
  const maxZoom = hardwareZoom ? hardwareZoom.max : 4;
  const minZoom = hardwareZoom ? hardwareZoom.min : 1;

  /* ---------- session lifecycle ---------- */

  useEffect(
    () =>
      cameraSession.subscribe(() => {
        setState(cameraSession.state);
        setCaps(cameraSession.capabilities);
        setErrName(cameraSession.error);
      }),
    [],
  );

  const attach = useCallback(() => {
    const v = videoRef.current;
    const stream = cameraSession.liveStream;
    if (!v || !stream) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => {
      /* autoplay refused: the retry button covers this */
    });
  }, []);

  const open = useCallback(async () => {
    setZoom(1);
    setTorch(false);
    await cameraSession.start();
    attach();
  }, [attach]);

  useEffect(() => {
    void open();
    return () => cameraSession.stop();
  }, [open]);

  useEffect(() => {
    if (state === "live") attach();
  }, [state, attach]);

  // Reopen after the tab or app returns to the foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const track = cameraSession.liveStream?.getVideoTracks()[0];
      if (!track || track.readyState === "ended" || cameraSession.state !== "live") {
        void open();
      } else {
        attach();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [open, attach]);

  /* ---------- zoom ---------- */

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, next));
      setZoom(clamped);
      if (hardwareZoom) void cameraSession.applyHardwareZoom(clamped);
    },
    [hardwareZoom, maxZoom, minZoom],
  );

  // Pinch-to-zoom on the preview, tracked from raw pointers so it works in
  // installed web-app sessions where gesture events are unreliable.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const spread = () => {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return 0;
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinchStart.current = { dist: spread(), zoom };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = pinchStart.current;
    if (start && pointers.current.size === 2 && start.dist > 0) {
      applyZoom(start.zoom * (spread() / start.dist));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  /* ---------- preview analysis loop ---------- */

  useEffect(() => {
    if (state !== "live" || paused) return;
    let raf = 0;
    let stop = false;

    const tick = () => {
      if (stop) return;
      const v = videoRef.current;
      if (v && v.videoWidth) {
        if (!analysisRef.current) analysisRef.current = document.createElement("canvas");
        const c = analysisRef.current;
        const w = ANALYSIS_W;
        const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          // Match the digital-zoom crop so the measurements describe what the
          // saved photograph will contain.
          const z = digital ? zoom : 1;
          const sw = v.videoWidth / z;
          const sh = v.videoHeight / z;
          ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
          const stats = measure(ctx, w, h, referenceRef.current);
          paint(stats);
          const msgs: string[] = [];
          if (stats.sharpness < 12) msgs.push(t("cam.q.blur"));
          if (stats.clipped > 0.06) msgs.push(t("cam.q.over"));
          if (stats.mean < 45) msgs.push(t("cam.q.under"));
          if (moving && stats.change < 0.15) msgs.push(t("cam.q.dupe"));
          if (moving && stats.change > 0.75) msgs.push(t("cam.q.slow"));
          setAdvice(msgs);

          if (auto && moving && !msgs.length && Date.now() - lastAutoRef.current > 1500) {
            lastAutoRef.current = Date.now();
            void shoot(stats.luma);
          }
        }
      }
      raf = requestAnimationFrame(() => {
        window.setTimeout(tick, 180);
      });
    };

    const paint = (stats: FrameStats) => {
      const ov = overlayRef.current;
      const v = videoRef.current;
      if (ov && v) {
        ov.width = stats.w;
        ov.height = stats.h;
        const octx = ov.getContext("2d");
        if (octx) {
          octx.clearRect(0, 0, stats.w, stats.h);
          if (peaking || clipping) {
            const out = octx.createImageData(stats.w, stats.h);
            for (let j = 1; j < stats.h - 1; j++) {
              for (let i = 1; i < stats.w - 1; i++) {
                const k = j * stats.w + i;
                const p = k * 4;
                if (clipping && (stats.luma[k] ?? 0) >= 250) {
                  out.data[p] = 255;
                  out.data[p + 3] = 170;
                  continue;
                }
                if (peaking) {
                  const gx = (stats.luma[k + 1] ?? 0) - (stats.luma[k - 1] ?? 0);
                  const gy = (stats.luma[k + stats.w] ?? 0) - (stats.luma[k - stats.w] ?? 0);
                  if (Math.hypot(gx, gy) > 34) {
                    out.data[p + 1] = 255;
                    out.data[p + 2] = 120;
                    out.data[p + 3] = 200;
                  }
                }
              }
            }
            octx.putImageData(out, 0, 0);
          }
        }
      }

      const hc = histRef.current;
      if (hc && histogram) {
        hc.width = 128;
        hc.height = 44;
        const hx = hc.getContext("2d");
        if (hx) {
          hx.clearRect(0, 0, 128, 44);
          hx.fillStyle = "rgba(0,0,0,0.45)";
          hx.fillRect(0, 0, 128, 44);
          const max = Math.max(...stats.histogram, 1);
          hx.fillStyle = "rgba(255,255,255,0.9)";
          stats.histogram.forEach((val, i) => {
            const bh = (val / max) * 40;
            hx.fillRect(i * 4, 44 - bh, 3, bh);
          });
        }
      }

      const lc = loupeRef.current;
      if (lc && loupe && videoRef.current?.videoWidth) {
        const v2 = videoRef.current;
        lc.width = 132;
        lc.height = 132;
        const lx = lc.getContext("2d");
        if (lx) {
          const size = 132 / 3; // 3x magnification of the frame centre
          lx.drawImage(
            v2,
            v2.videoWidth / 2 - size / 2,
            v2.videoHeight / 2 - size / 2,
            size,
            size,
            0,
            0,
            132,
            132,
          );
        }
      }
    };

    tick();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, paused, peaking, clipping, histogram, loupe, zoom, digital, moving, auto, t]);

  /* ---------- capture ---------- */

  const shoot = useCallback(
    async (referenceLuma?: Float32Array) => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const z = digital ? zoom : 1;
      const sw = Math.round(v.videoWidth / z);
      const sh = Math.round(v.videoHeight / z);
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      // Raw video frame only: no overlay canvas is ever drawn here.
      ctx.drawImage(
        v,
        Math.round((v.videoWidth - sw) / 2),
        Math.round((v.videoHeight - sh) / 2),
        sw,
        sh,
        0,
        0,
        sw,
        sh,
      );
      const photo: CapturedPhoto = {
        id: crypto.randomUUID(),
        dataUrl: c.toDataURL("image/jpeg", 0.95),
        width: sw,
        height: sh,
        digitalZoom: z,
        mode,
        at: Date.now(),
      };
      logActivity({
        type: "photo_taken",
        title: "Photo taken",
        details: `Mode: ${mode} · ${sw}×${sh} px${z > 1 ? ` · ${z.toFixed(1)}× zoom` : ""}`,
        status: "success",
      });
      if (referenceLuma) referenceRef.current = referenceLuma;
      if (mode === "document") {
        // The page is straightened by hand before the photo leaves this screen.
        setPending(photo);
        return;
      }
      setPhotos((p) => (multi ? [...p, photo] : [photo]));
      if (!multi) onDone([photo]);
    },
    [digital, zoom, mode, multi, onDone],
  );

  const checklist = useMemo(() => {
    if (mode === "object3d") return t("cam.chk.object");
    if (mode === "surface") return t("cam.chk.surface");
    if (mode === "multilight") return t("cam.chk.multilight");
    if (mode === "inscription") return t("cam.chk.inscription");
    return null;
  }, [mode, t]);

  /** Shutter with the optional self-timer; the countdown is visible on screen. */
  const triggerShutter = useCallback(() => {
    if (timer <= 0) {
      void shoot();
      return;
    }
    setCountdown(timer);
    let left = timer;
    const id = window.setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        window.clearInterval(id);
        void shoot();
      }
    }, 1000);
  }, [timer, shoot]);

  const statusMessage =
    state === "starting"
      ? t("cam.opening")
      : state === "interrupted"
        ? t("cam.interrupted")
        : state === "error"
          ? errName === "unsupported"
            ? t("cam.unsupported")
            : errName === "NotAllowedError" || errName === "SecurityError"
              ? t("cam.denied")
              : t("cam.failed")
          : null;

  if (pending)
    return (
      <DocumentStraighten
        dataUrl={pending.dataUrl}
        onSkip={() => {
          const photo = pending;
          setPending(null);
          onDone([photo]);
        }}
        onDone={(dataUrl, width, height) => {
          const photo = { ...pending, dataUrl, width, height };
          setPending(null);
          onDone([photo]);
        }}
      />
    );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* preview */}
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={digital && zoom > 1 ? { transform: `scale(${zoom})` } : undefined}
        />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
        {histogram && (
          <canvas
            ref={histRef}
            className="pointer-events-none absolute bottom-3 left-3 rounded-md"
            aria-label={t("cam.histogram")}
          />
        )}
        {loupe && (
          <canvas
            ref={loupeRef}
            className="pointer-events-none absolute right-3 top-16 h-[132px] w-[132px] rounded-full border-2 border-white/70"
            aria-label={t("cam.loupe")}
          />
        )}

        {grid && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
          </div>
        )}
        {countdown > 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/90">
            {countdown}
          </p>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <Button size="sm" variant="secondary" onClick={onClose}>
            <X /> {t("cam.close")}
          </Button>
          <div className="flex items-start gap-2">
            <div className="max-w-[58vw] rounded-lg bg-black/55 px-3 py-2 text-xs leading-snug">
              {t(`cam.hint.${mode}`)}
            </div>
            <Button
              size="icon"
              variant="secondary"
              aria-label={t("cam.help")}
              onClick={() => setHelp(true)}
            >
              <HelpCircle />
            </Button>
          </div>
        </div>

        {help && (
          <div className="absolute inset-0 overflow-y-auto bg-black/85 p-5 text-sm leading-relaxed">
            <div className="mx-auto max-w-md space-y-3">
              <h2 className="text-base font-semibold">{t(`cam.mode.${mode}`)}</h2>
              <p>{t(`cam.help.${mode}`)}</p>
              <p className="text-xs text-white/70">{t("cam.help.general")}</p>
              <Button className="w-full" onClick={() => setHelp(false)}>
                {t("cam.help.close")}
              </Button>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
            <p className="text-sm">{statusMessage}</p>
            {state !== "starting" && errName !== "unsupported" && (
              <Button onClick={() => void open()}>
                <RefreshCw /> {t("cam.retry")}
              </Button>
            )}
          </div>
        )}

        {!statusMessage && advice.length > 0 && (
          <div className="absolute inset-x-0 bottom-24 mx-auto w-fit max-w-[90%] space-y-1 rounded-lg bg-black/60 px-3 py-2 text-center text-xs">
            {advice.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        {!statusMessage && advice.length === 0 && (
          <p className="absolute inset-x-0 bottom-24 mx-auto w-fit rounded-lg bg-black/50 px-3 py-1 text-xs">
            <CheckCircle2 className="mr-1 inline size-3" /> {t("cam.q.ok")}
          </p>
        )}
      </div>

      {/* controls */}
      <div className="space-y-3 bg-black/90 p-3">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={t("cam.mode")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                mode === m ? "bg-white text-black" : "bg-white/15 text-white"
              }`}
            >
              {t(`cam.mode.${m}`)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-[84px] text-xs text-white/70">
            {multi ? t("cam.chk.count", { n: photos.length }) : ""}
          </div>
          <button
            type="button"
            onClick={triggerShutter}
            disabled={state !== "live" || paused}
            aria-label={t("cam.shutter")}
            className="size-[68px] rounded-full border-4 border-white bg-white/25 disabled:opacity-40"
          />
          <div className="flex min-w-[84px] justify-end gap-2">
            {multi && (
              <Button size="icon" variant="secondary" onClick={() => setPaused((p) => !p)}>
                {paused ? <Play /> : <Pause />}
              </Button>
            )}
            <Button size="icon" variant="secondary" onClick={() => setDrawer((d) => !d)}>
              <ChevronDown className={drawer ? "rotate-180 transition" : "transition"} />
            </Button>
          </div>
        </div>

        {multi && photos.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p) => (
                <div key={p.id} className="relative shrink-0">
                  <img src={p.dataUrl} alt="" className="h-16 w-16 rounded object-cover" />
                  <button
                    type="button"
                    aria-label={t("cam.remove")}
                    onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                    className="absolute -right-1 -top-1 rounded-full bg-black/80 p-1"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => onDone(photos)}>
              {t("cam.use")}
            </Button>
          </div>
        )}

        {drawer && (
          <div className="space-y-4 rounded-xl bg-white/10 p-3 text-sm">
            <div>
              <Label className="text-xs">
                {t("cam.zoom")} ×{zoom.toFixed(1)} —{" "}
                {hardwareZoom ? t("cam.zoom.hw") : t("cam.zoom.digital")}
              </Label>
              <Slider
                value={[zoom]}
                min={minZoom}
                max={maxZoom}
                step={hardwareZoom?.step ?? 0.1}
                onValueChange={(v) => applyZoom(v[0] ?? 1)}
                className="my-2"
              />
            </div>

            {caps?.torch && (
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-xs">
                  <Flashlight className="size-4" /> {t("cam.torch")}
                </Label>
                <Switch
                  checked={torch}
                  onCheckedChange={(on) => {
                    setTorch(on);
                    void cameraSession.setTorch(on);
                  }}
                />
              </div>
            )}

            {(caps?.focusModes.length ?? 0) > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">{t("cam.focus")}</Label>
                {caps?.focusModes.map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant="secondary"
                    onClick={() => void cameraSession.setFocusMode(f)}
                  >
                    {f === "continuous"
                      ? t("cam.focus.auto")
                      : f === "single-shot"
                        ? t("cam.focus.single")
                        : f === "manual"
                          ? t("cam.focus.manual")
                          : f}
                  </Button>
                ))}
              </div>
            )}

            {!caps?.torch && !hardwareZoom && (caps?.focusModes.length ?? 0) <= 1 && (
              <p className="text-xs text-white/60">{t("cam.noControls")}</p>
            )}

            <div className="space-y-2 border-t border-white/15 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                {t("cam.tools")}
              </p>
              {(
                [
                  ["cam.peaking", peaking, setPeaking],
                  ["cam.clipping", clipping, setClipping],
                  ["cam.histogram", histogram, setHistogram],
                  ["cam.loupe", loupe, setLoupe],
                ] as const
              ).map(([key, val, set]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-xs">{t(key)}</Label>
                  <Switch checked={val} onCheckedChange={(v) => set(v)} />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("cam.grid")}</Label>
                <Switch checked={grid} onCheckedChange={setGrid} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t("cam.timer")}</Label>
                {[0, 3, 10].map((sec) => (
                  <Button
                    key={sec}
                    size="sm"
                    variant={timer === sec ? "default" : "secondary"}
                    onClick={() => setTimer(sec)}
                  >
                    {sec === 0 ? t("cam.timer.off") : `${sec}s`}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-white/60">{t("cam.tools.note")}</p>
            </div>

            {(moving || checklist) && (
              <div className="space-y-2 border-t border-white/15 pt-3">
                {moving && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">{t("cam.auto")}</Label>
                      <Switch checked={auto} onCheckedChange={setAuto} />
                    </div>
                    <p className="text-xs text-white/60">{t("cam.autoNote")}</p>
                  </>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  {t("cam.checklist")}
                </p>
                <p className="text-xs text-white/80">{checklist}</p>
                <p className="text-xs text-white/60">{t("cam.chk.note")}</p>
              </div>
            )}

            {caps && (
              <p className="border-t border-white/15 pt-3 text-xs text-white/50">
                {t("cam.lens")}: {caps.label || "—"} · {t("cam.res")}: {caps.width}×{caps.height}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CameraButton({
  label,
  mode,
  onPhotos,
}: {
  label?: string;
  mode?: CaptureMode;
  onPhotos: (photos: CapturedPhoto[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Camera /> {label ?? t("cam.open")}
      </Button>
      {open && (
        <CameraCapture
          {...(mode ? { initialMode: mode } : {})}
          onClose={() => setOpen(false)}
          onDone={(photos) => {
            setOpen(false);
            onPhotos(photos);
          }}
        />
      )}
    </>
  );
}
