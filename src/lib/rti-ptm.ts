/**
 * Reflectance Transformation Imaging (RTI) & Polynomial Texture Mapping (PTM) Engine.
 *
 * Implements the second-order biquadratic polynomial reflectance model (Malzbender et al.):
 *   L(u, v) = a0*u^2 + a1*v^2 + a2*u*v + a3*u + a4*v + a5
 *
 * Fits 6 coefficients per RGB channel per pixel from multi-light photographic series,
 * and renders interactive dynamic relighting to expose micro-reliefs, chisel gouges,
 * and eroded peckings on rock art and epigraphic inscriptions.
 */

export type LightDirection = {
  u: number; // Projection of normalized light vector on X-axis [-1, 1]
  v: number; // Projection of normalized light vector on Y-axis [-1, 1]
};

export type PtmDataset = {
  width: number;
  height: number;
  // 6 coefficients per color channel (R, G, B) = 18 floats per pixel
  // Stored in typed Float32Array for high performance
  coefficients: Float32Array;
  lightDirections: LightDirection[];
};

/**
 * Standard radial raking light positions for a multi-light capture set of N frames.
 */
export function defaultLightDirections(count: number): LightDirection[] {
  if (count <= 1) return [{ u: 0, v: 0 }];
  const dirs: LightDirection[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count;
    // Raking light has elevation ~35 degrees (projection radius ~0.8)
    const radius = 0.82;
    dirs.push({
      u: Math.cos(angle) * radius,
      v: Math.sin(angle) * radius,
    });
  }
  return dirs;
}

/**
 * Fits a 6-coefficient PTM model from an array of ImageDatas with known light directions.
 */
export function fitPtmModel(frames: ImageData[], directions?: LightDirection[]): PtmDataset {
  const n = frames.length;
  if (n === 0) throw new Error("At least 1 frame is required for PTM fitting");

  const width = frames[0]!.width;
  const height = frames[0]!.height;
  const lights = directions && directions.length === n ? directions : defaultLightDirections(n);

  // Construct design matrix M: n x 6
  // Row k: [u^2, v^2, u*v, u, v, 1]
  const M: number[][] = [];
  for (let k = 0; k < n; k++) {
    const { u, v } = lights[k]!;
    M.push([u * u, v * v, u * v, u, v, 1]);
  }

  // Normal equations: (M^T * M) A = M^T * I => pseudo-inverse P = (M^T * M)^(-1) * M^T (6 x n)
  const pinv = pseudoInverse6xN(M);

  const pixelCount = width * height;
  // 18 coefficients per pixel (6 for R, 6 for G, 6 for B)
  const coefficients = new Float32Array(pixelCount * 18);

  const sampleI = new Float32Array(n);

  for (let p = 0; p < pixelCount; p++) {
    const byteOffset = p * 4;
    const coeffOffset = p * 18;

    // Red Channel
    for (let k = 0; k < n; k++) {
      sampleI[k] = frames[k]!.data[byteOffset]!;
    }
    for (let c = 0; c < 6; c++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += pinv[c]![k]! * sampleI[k]!;
      }
      coefficients[coeffOffset + c] = sum;
    }

    // Green Channel
    for (let k = 0; k < n; k++) {
      sampleI[k] = frames[k]!.data[byteOffset + 1]!;
    }
    for (let c = 0; c < 6; c++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += pinv[c]![k]! * sampleI[k]!;
      }
      coefficients[coeffOffset + 6 + c] = sum;
    }

    // Blue Channel
    for (let k = 0; k < n; k++) {
      sampleI[k] = frames[k]!.data[byteOffset + 2]!;
    }
    for (let c = 0; c < 6; c++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += pinv[c]![k]! * sampleI[k]!;
      }
      coefficients[coeffOffset + 12 + c] = sum;
    }
  }

  return {
    width,
    height,
    coefficients,
    lightDirections: lights,
  };
}

/**
 * Relights the surface with a virtual light vector (u, v) in [-1, 1].
 * Includes specular enhancement parameter for chisel & peck mark sharpening.
 */
export function renderRelitPtm(
  ptm: PtmDataset,
  target: ImageData,
  u: number,
  v: number,
  specularEnhance = 1.25,
) {
  const { width, height, coefficients } = ptm;
  const pixelCount = width * height;
  const out = target.data;

  // Precompute polynomial basis for current virtual light (u, v)
  const u2 = u * u;
  const v2 = v * v;
  const uv = u * v;

  for (let p = 0; p < pixelCount; p++) {
    const byteOffset = p * 4;
    const coeffOffset = p * 18;

    // R
    const r =
      coefficients[coeffOffset + 0]! * u2 +
      coefficients[coeffOffset + 1]! * v2 +
      coefficients[coeffOffset + 2]! * uv +
      coefficients[coeffOffset + 3]! * u +
      coefficients[coeffOffset + 4]! * v +
      coefficients[coeffOffset + 5]!;

    // G
    const g =
      coefficients[coeffOffset + 6]! * u2 +
      coefficients[coeffOffset + 7]! * v2 +
      coefficients[coeffOffset + 8]! * uv +
      coefficients[coeffOffset + 9]! * u +
      coefficients[coeffOffset + 10]! * v +
      coefficients[coeffOffset + 11]!;

    // B
    const b =
      coefficients[coeffOffset + 12]! * u2 +
      coefficients[coeffOffset + 13]! * v2 +
      coefficients[coeffOffset + 14]! * uv +
      coefficients[coeffOffset + 15]! * u +
      coefficients[coeffOffset + 16]! * v +
      coefficients[coeffOffset + 17]!;

    // Apply micro-contrast enhancement
    if (specularEnhance !== 1.0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      out[byteOffset] = Math.max(0, Math.min(255, lum + (r - lum) * specularEnhance));
      out[byteOffset + 1] = Math.max(0, Math.min(255, lum + (g - lum) * specularEnhance));
      out[byteOffset + 2] = Math.max(0, Math.min(255, lum + (b - lum) * specularEnhance));
    } else {
      out[byteOffset] = Math.max(0, Math.min(255, r));
      out[byteOffset + 1] = Math.max(0, Math.min(255, g));
      out[byteOffset + 2] = Math.max(0, Math.min(255, b));
    }
    out[byteOffset + 3] = 255;
  }
}

/**
 * Calculates (M^T * M + lambda*I)^(-1) * M^T with Tikhonov regularization for numerical stability.
 */
function pseudoInverse6xN(M: number[][]): number[][] {
  const n = M.length;
  const cols = 6;
  const lambda = 1e-4; // Regularization factor

  // Compute AtA = M^T * M (6x6)
  const AtA: number[][] = Array.from({ length: cols }, () => new Array(cols).fill(0));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += M[k]![i]! * M[k]![j]!;
      }
      AtA[i]![j] = sum + (i === j ? lambda : 0);
    }
  }

  // Invert 6x6 matrix using Gauss-Jordan elimination
  const invAtA = invert6x6(AtA);

  // Compute pinv = invAtA * M^T (6 x n)
  const pinv: number[][] = Array.from({ length: cols }, () => new Array(n).fill(0));
  for (let i = 0; i < cols; i++) {
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let j = 0; j < cols; j++) {
        sum += invAtA[i]![j]! * M[k]![j]!;
      }
      pinv[i]![k] = sum;
    }
  }

  return pinv;
}

function invert6x6(A: number[][]): number[][] {
  const n = 6;
  const aug: number[][] = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let i = 0; i < n; i++) {
    let pivot = aug[i]![i]!;
    if (Math.abs(pivot) < 1e-8) {
      // Find row with larger element
      let maxRow = i;
      for (let r = i + 1; r < n; r++) {
        if (Math.abs(aug[r]![i]!) > Math.abs(aug[maxRow]![i]!)) maxRow = r;
      }
      if (maxRow !== i) {
        const tmp = aug[i]!;
        aug[i] = aug[maxRow]!;
        aug[maxRow] = tmp;
        pivot = aug[i]![i]!;
      }
    }

    if (Math.abs(pivot) < 1e-12) pivot = 1e-12;

    for (let j = 0; j < 2 * n; j++) {
      aug[i]![j] /= pivot;
    }

    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = aug[r]![i]!;
        for (let j = 0; j < 2 * n; j++) {
          aug[r]![j] -= factor * aug[i]![j]!;
        }
      }
    }
  }

  return aug.map((row) => row.slice(n));
}
