/**
 * Manual page straightening for the document capture mode.
 *
 * Honest boundary: there is no automatic page-edge detection here. The four
 * corners are placed by hand, and the correction is a real projective warp
 * (homography solved from the four dragged corners, inverse-mapped with
 * bilinear sampling at the photograph's own resolution). No text recognition
 * happens in this component.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Pt = { x: number; y: number };

/** Solves the 8 unknowns of the homography mapping dst -> src. */
function homography(dst: Pt[], src: Pt[]): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const d = dst[i]!;
    const s = src[i]!;
    a.push([d.x, d.y, 1, 0, 0, 0, -d.x * s.x, -d.y * s.x]);
    b.push(s.x);
    a.push([0, 0, 0, d.x, d.y, 1, -d.x * s.y, -d.y * s.y]);
    b.push(s.y);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++)
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    const p = a[col]![col]!;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / p;
      if (!f) continue;
      for (let c = col; c < 8; c++) a[r]![c] = a[r]![c]! - f * a[col]![c]!;
      b[r] = b[r]! - f * b[col]!;
    }
  }
  return a.map((row, i) => b[i]! / row[i]!);
}

function warp(img: HTMLImageElement, quad: Pt[]): string {
  const d = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  const w = Math.round(Math.max(d(quad[0]!, quad[1]!), d(quad[3]!, quad[2]!)));
  const h = Math.round(Math.max(d(quad[0]!, quad[3]!), d(quad[1]!, quad[2]!)));
  if (w < 8 || h < 8) return img.src;
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: w - 1, y: 0 },
    { x: w - 1, y: h - 1 },
    { x: 0, y: h - 1 },
  ];
  const hm = homography(dst, quad);
  if (!hm) return img.src;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hm as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return img.src;
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, src.width, src.height).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return img.src;
  const od = octx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = h6 * x + h7 * y + 1;
      const sx = (h0 * x + h1 * y + h2) / den;
      const sy = (h3 * x + h4 * y + h5) / den;
      const p = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= src.width - 1 || sy >= src.height - 1) {
        od.data[p + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const i00 = (y0 * src.width + x0) * 4 + c;
        const i10 = i00 + 4;
        const i01 = i00 + src.width * 4;
        const i11 = i01 + 4;
        od.data[p + c] =
          (sd[i00] ?? 0) * (1 - fx) * (1 - fy) +
          (sd[i10] ?? 0) * fx * (1 - fy) +
          (sd[i01] ?? 0) * (1 - fx) * fy +
          (sd[i11] ?? 0) * fx * fy;
      }
      od.data[p + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out.toDataURL("image/jpeg", 0.95);
}

export function DocumentStraighten({
  dataUrl,
  onDone,
  onSkip,
}: {
  dataUrl: string;
  onDone: (corrected: string, width: number, height: number) => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const initial: Pt[] = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const [corners, setCorners] = useState<Pt[]>(initial);
  const [busy, setBusy] = useState(false);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setSize({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = dataUrl;
  }, [dataUrl]);

  const move = (e: React.PointerEvent) => {
    const i = dragging.current;
    const box = boxRef.current;
    if (i === null || !box) return;
    const r = box.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCorners((c) => c.map((p, k) => (k === i ? { x, y } : p)));
  };

  const apply = () => {
    const im = imgRef.current;
    if (!im || !size) return;
    setBusy(true);
    // Give the browser a frame to paint the busy state before the warp.
    window.setTimeout(() => {
      const quad = corners.map((p) => ({ x: p.x * size.w, y: p.y * size.h }));
      const url = warp(im, quad);
      const probe = new Image();
      probe.onload = () => onDone(url, probe.naturalWidth, probe.naturalHeight);
      probe.src = url;
    }, 30);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black p-4 text-white">
      <h2 className="text-base font-semibold">{t("cam.doc.title")}</h2>
      <p className="mt-1 text-xs text-white/70">{t("cam.doc.note")}</p>
      <div
        ref={boxRef}
        className="relative my-3 flex-1 touch-none select-none"
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        <img ref={imgRef} src={dataUrl} alt="" className="h-full w-full object-contain" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <polygon
            points={corners.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ")}
            fill="rgba(255,255,255,0.12)"
            stroke="white"
            strokeWidth="2"
          />
        </svg>
        {corners.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${t("cam.doc.title")} ${i + 1}`}
            onPointerDown={() => (dragging.current = i)}
            className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/30"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => setCorners(initial)}>
          {t("cam.doc.reset")}
        </Button>
        <Button variant="secondary" onClick={onSkip}>
          {t("cam.doc.skip")}
        </Button>
        <Button onClick={apply} disabled={busy || !size}>
          {t("cam.doc.apply")}
        </Button>
      </div>
    </div>
  );
}
