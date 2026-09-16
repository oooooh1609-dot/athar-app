export interface RtiLightSample {
  lightVector: { x: number; y: number; z: number };
  imageData: ImageData;
}

export class LocalRtiPtmEngine {
  /**
   * حل مصفوفة المعاملات الستة لنظام PTM: L(u, v) = a0*u^2 + a1*v^2 + a2*u*v + a3*u + a4*v + a5
   */
  public static computePtmCoefficients(samples: RtiLightSample[]): Float32Array {
    if (samples.length < 6) {
      throw new Error("يتطلب بناء نموذج RTI ست لقطات ضوئية على الأقل");
    }

    const w = samples[0]!.imageData.width;
    const h = samples[0]!.imageData.height;
    const numPixels = w * h;
    const coefficients = new Float32Array(numPixels * 6); // 6 معاملات لكل بيكسل

    const N = samples.length;
    // بناء مصفوفة الإضاءة A (N x 6)
    const A: number[][] = [];
    for (let i = 0; i < N; i++) {
      const { x: u, y: v } = samples[i]!.lightVector;
      A.push([u * u, v * v, u * v, u, v, 1.0]);
    }

    // حساب شبه المعكوس الميداني (A^T * A)^(-1) * A^T
    const AtA = this.matrixMultiply(this.transpose(A), A);
    const invAtA = this.invert6x6(AtA);
    const pseudoInv = this.matrixMultiply(invAtA, this.transpose(A)); // 6 x N

    // استخراج المعاملات لكل بيكسل عبر دمج القنوات الضوئية
    for (let p = 0; p < numPixels; p++) {
      const byteIdx = p * 4;
      const b: number[] = new Array(N);

      for (let s = 0; s < N; s++) {
        const d = samples[s]!.imageData.data;
        // استخلاص شدة الإضاءة الناتجة
        b[s] = (d[byteIdx]! * 0.299 + d[byteIdx + 1]! * 0.587 + d[byteIdx + 2]! * 0.114) / 255.0;
      }

      // حل x = pseudoInv * b
      const coeffOffset = p * 6;
      for (let r = 0; r < 6; r++) {
        let sum = 0;
        for (let c = 0; c < N; c++) {
          sum += pseudoInv[r]![c]! * b[c]!;
        }
        coefficients[coeffOffset + r] = sum;
      }
    }

    return coefficients;
  }

  /**
   * إعادة تصيير البيكسل تحت أي زاوية ضوء افتراضية جديدة بلحظة
   */
  public static synthesizePixelLuminance(
    u: number,
    v: number,
    coeff: Float32Array,
    offset: number,
  ): number {
    return Math.max(
      0.0,
      Math.min(
        1.0,
        coeff[offset]! * u * u +
          coeff[offset + 1]! * v * v +
          coeff[offset + 2]! * u * v +
          coeff[offset + 3]! * u +
          coeff[offset + 4]! * v +
          coeff[offset + 5]!,
      ),
    );
  }

  private static transpose(m: number[][]): number[][] {
    return m[0]!.map((_, c) => m.map((r) => r[c]!));
  }

  private static matrixMultiply(a: number[][], b: number[][]): number[][] {
    const result: number[][] = [];
    for (let r = 0; r < a.length; r++) {
      result[r] = [];
      for (let c = 0; c < b[0]!.length; c++) {
        let sum = 0;
        for (let k = 0; k < a[0]!.length; k++) sum += a[r]![k]! * b[k]![c]!;
        result[r]![c] = sum;
      }
    }
    return result;
  }

  private static invert6x6(m: number[][]): number[][] {
    const n = 6;
    const aug = m.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);

    for (let i = 0; i < n; i++) {
      let pivot = aug[i]![i]!;
      if (Math.abs(pivot) < 1e-6) pivot = 1e-6;

      for (let j = 0; j < 2 * n; j++) aug[i]![j] = aug[i]![j]! / pivot;
      for (let r = 0; r < n; r++) {
        if (r !== i) {
          const factor = aug[r]![i]!;
          for (let c = 0; c < 2 * n; c++) aug[r]![c] = aug[r]![c]! - factor * aug[i]![c]!;
        }
      }
    }
    return aug.map((row) => row.slice(n));
  }
}
