/**
 * Equirectangular panorama projection.
 *
 * Renders a 360° photograph onto a flat canvas by sampling, with no WebGL and
 * no 3D library. That is a deliberate trade: three.js would be faster and
 * smoother, but it is roughly 600 KB before a single panorama loads, on an
 * app whose whole point is working on a field connection. Sampling in
 * JavaScript costs a few milliseconds a frame at a sensible canvas size and
 * costs nothing to download.
 *
 * Stitching is a different problem and is not attempted here. Joining
 * overlapping photographs into one equirectangular image needs feature
 * detection, homography estimation and multi-band blending — a project in
 * itself, and one the phone's own camera app already does well. This viewer
 * takes the finished panorama.
 */

export type View = {
  /** Degrees, 0 = centre of the source image, positive turns right. */
  yaw: number;
  /** Degrees, positive looks up. Clamped so the view cannot flip over. */
  pitch: number;
  /** Horizontal field of view in degrees. Smaller is more zoomed in. */
  fov: number;
};

export const DEFAULT_VIEW: View = { yaw: 0, pitch: 0, fov: 80 };

/** A point on the output canvas, in canvas pixels. */
export type Point2 = { x: number; y: number };

/** A direction on the sphere, in degrees. */
export type Direction = { yaw: number; pitch: number };

const MIN_FOV = 25;
const MAX_FOV = 110;
const MAX_PITCH = 85;

/** Keeps yaw in (-180, 180] so it wraps instead of growing without bound. */
export function wrapYaw(deg: number): number {
  let y = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (y === -180) y = 180;
  return y;
}

export const clampPitch = (deg: number) => Math.min(MAX_PITCH, Math.max(-MAX_PITCH, deg));
export const clampFov = (deg: number) => Math.min(MAX_FOV, Math.max(MIN_FOV, deg));

export const normaliseView = (v: View): View => ({
  yaw: wrapYaw(v.yaw),
  pitch: clampPitch(v.pitch),
  fov: clampFov(v.fov),
});

/**
 * Source pixel for one output pixel.
 *
 * Builds the ray for the output pixel under a gnomonic (rectilinear)
 * projection, rotates it by the current yaw and pitch, then converts the
 * direction to longitude and latitude and reads that point off the
 * equirectangular source.
 *
 * Returns fractional coordinates in the source image, x wrapped into range.
 */
export function samplePoint(
  outX: number,
  outY: number,
  outW: number,
  outH: number,
  view: View,
  srcW: number,
  srcH: number,
): Point2 {
  const toRad = Math.PI / 180;
  // Focal length in pixels that produces the requested horizontal field.
  const f = outW / 2 / Math.tan((view.fov * toRad) / 2);

  // Camera-space ray, +z forward.
  const dx = outX - outW / 2;
  const dy = outY - outH / 2;

  const cp = Math.cos(view.pitch * toRad);
  const sp = Math.sin(view.pitch * toRad);

  // Rotate about the horizontal axis for pitch.
  const y1 = dy * cp - f * sp;
  const z1 = dy * sp + f * cp;

  const lon = Math.atan2(dx, z1) + view.yaw * toRad;
  const lat = Math.atan2(-y1, Math.hypot(dx, z1));

  // Longitude spans the full width, latitude spans the full height.
  let x = (((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1;
  const y = Math.min(1, Math.max(0, 0.5 - lat / Math.PI));
  x *= srcW;
  return { x, y: y * srcH };
}

/**
 * Draws one frame.
 *
 * Nearest-neighbour sampling. Bilinear would be smoother but roughly triples
 * the per-pixel work, and on a photograph of a rock face the difference is
 * not visible while the frame-rate drop is.
 */
export function renderPanorama(out: ImageData, src: ImageData, view: View): void {
  const { width: ow, height: oh, data: od } = out;
  const { width: sw, height: sh, data: sd } = src;
  for (let py = 0; py < oh; py++) {
    for (let px = 0; px < ow; px++) {
      const p = samplePoint(px + 0.5, py + 0.5, ow, oh, view, sw, sh);
      const sx = Math.min(sw - 1, Math.max(0, Math.floor(p.x)));
      const sy = Math.min(sh - 1, Math.max(0, Math.floor(p.y)));
      const si = (sy * sw + sx) * 4;
      const oi = (py * ow + px) * 4;
      od[oi] = sd[si]!;
      od[oi + 1] = sd[si + 1]!;
      od[oi + 2] = sd[si + 2]!;
      od[oi + 3] = 255;
    }
  }
}

/** A marker placed on the sphere, for linking a panorama to an inscription. */
export type Hotspot = {
  id: string;
  yaw: number;
  pitch: number;
  label: string;
  /** Optional project this point refers to. */
  projectId?: string;
};

/**
 * Where a hotspot lands on screen, or null when it is behind the viewer.
 *
 * The behind-check matters: without it a point directly behind projects back
 * onto the canvas as a mirrored ghost, and the user sees a label floating
 * over the wrong part of the wall.
 */
export function projectHotspot(
  spot: Direction,
  view: View,
  outW: number,
  outH: number,
): Point2 | null {
  const toRad = Math.PI / 180;
  const f = outW / 2 / Math.tan((view.fov * toRad) / 2);

  const dLon = wrapYaw(spot.yaw - view.yaw) * toRad;
  const lat = spot.pitch * toRad;

  // Direction of the hotspot in world space.
  const wx = Math.cos(lat) * Math.sin(dLon);
  const wy = -Math.sin(lat);
  const wz = Math.cos(lat) * Math.cos(dLon);

  // Undo the viewer's pitch.
  const cp = Math.cos(-view.pitch * toRad);
  const sp = Math.sin(-view.pitch * toRad);
  const cy = wy * cp - wz * sp;
  const cz = wy * sp + wz * cp;

  if (cz <= 0.0001) return null; // behind the viewer

  return { x: outW / 2 + (wx / cz) * f, y: outH / 2 + (cy / cz) * f };
}

/** Screen position back to a direction, for placing a hotspot by tapping. */
export function hotspotFromScreen(
  outX: number,
  outY: number,
  outW: number,
  outH: number,
  view: View,
): Direction {
  const toDeg = 180 / Math.PI;
  const toRad = Math.PI / 180;
  const f = outW / 2 / Math.tan((view.fov * toRad) / 2);

  const dx = outX - outW / 2;
  const dy = outY - outH / 2;
  const cp = Math.cos(view.pitch * toRad);
  const sp = Math.sin(view.pitch * toRad);
  const y1 = dy * cp - f * sp;
  const z1 = dy * sp + f * cp;

  return {
    yaw: wrapYaw((Math.atan2(dx, z1) + view.yaw * toRad) * toDeg),
    pitch: Math.atan2(-y1, Math.hypot(dx, z1)) * toDeg,
  };
}

/**
 * Whether an image is plausibly equirectangular.
 *
 * A full 360×180 panorama is exactly 2:1. Allowing a little slack catches
 * images cropped by a few pixels without accepting an ordinary photograph,
 * which would render as a smear and look like a bug in the viewer.
 */
export const looksEquirectangular = (w: number, h: number) => h > 0 && Math.abs(w / h - 2) < 0.12;

export class CylindricalPanoramaStitcher {
  /**
   * تحويل الصورة العادية إلى إسقاط أسطواني لتعويض تقوس الدوران الميداني
   */
  public static cylindricalWarp(
    canvas: HTMLCanvasElement,
    focalLengthPx: number,
  ): HTMLCanvasElement {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const srcData = ctx.getImageData(0, 0, w, h);
    const sPixels = srcData.data;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext("2d")!;
    const outData = outCtx.createImageData(w, h);
    const dPixels = outData.data;

    const cx = w / 2;
    const cy = h / 2;
    const f = focalLengthPx;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // الإسقاط الأسطواني العكسي
        const theta = (x - cx) / f;
        const hVal = (y - cy) / f;

        const X = Math.sin(theta);
        const Y = hVal;
        const Z = Math.cos(theta);

        const srcX = Math.round(f * (X / Z) + cx);
        const srcY = Math.round(f * (Y / Z) + cy);

        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          const outIdx = (y * w + x) * 4;
          const srcIdx = (srcY * w + srcX) * 4;
          dPixels[outIdx] = sPixels[srcIdx]!;
          dPixels[outIdx + 1] = sPixels[srcIdx + 1]!;
          dPixels[outIdx + 2] = sPixels[srcIdx + 2]!;
          dPixels[outIdx + 3] = sPixels[srcIdx + 3]!;
        }
      }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * خياطة لقطتين متجاورتين لصخرة أثرية مع دمج ناعم للحواف (Linear Feather Blending)
   */
  public static stitchPair(
    leftCanvas: HTMLCanvasElement,
    rightCanvas: HTMLCanvasElement,
    overlapPercentage = 0.28,
  ): HTMLCanvasElement {
    const wL = leftCanvas.width;
    const hL = leftCanvas.height;
    const wR = rightCanvas.width;

    const overlapWidth = Math.floor(wR * overlapPercentage);
    const totalWidth = wL + wR - overlapWidth;

    const stitchedCanvas = document.createElement("canvas");
    stitchedCanvas.width = totalWidth;
    stitchedCanvas.height = hL;
    const ctx = stitchedCanvas.getContext("2d")!;

    // رسم اللوحة الأولى
    ctx.drawImage(leftCanvas, 0, 0);

    // استخراج قناة الدمج المتدرج (Feather Mask) لمنع ظهور خط فاصل بين الصورتين
    const rightCtx = rightCanvas.getContext("2d")!;
    const rightImg = rightCtx.getImageData(0, 0, wR, hL);
    const rData = rightImg.data;

    // تطبيق تدرج الشفافية على منطقة التداخل
    for (let y = 0; y < hL; y++) {
      for (let x = 0; x < overlapWidth; x++) {
        const alphaFactor = x / overlapWidth;
        const idx = (y * wR + x) * 4;
        rData[idx + 3] = Math.round(rData[idx + 3]! * alphaFactor);
      }
    }
    rightCtx.putImageData(rightImg, 0, 0);

    // رسم اللوحة الثانية فوق منطقة التداخل
    ctx.drawImage(rightCanvas, wL - overlapWidth, 0);

    return stitchedCanvas;
  }
}
