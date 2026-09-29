import { BANDS, reflectanceFromHex, xyzFromReflectance } from './spectral';

/** Smallest reflectance allowed, so pure black keeps a finite K/S. */
const R_MIN = 1e-4;

/** A paint prepared for fast mixing: its K/S curve and how strongly it tints per unit volume. */
export interface Pigment {
  /** Kubelka-Munk absorption/scattering ratio per band. */
  ks: Float64Array;
  /**
   * Concentration weight per unit of volume. Following spectral.js, it scales with the paint's
   * luminance (dark paints have enormous K/S, so this keeps them from swamping every mix) and is
   * multiplied by a user-facing tinting strength (1 = typical, >1 = strong pigment such as phthalo).
   */
  power: number;
}

export function ksFromReflectance(r: number): number {
  const c = Math.min(1, Math.max(R_MIN, r));
  return ((1 - c) * (1 - c)) / (2 * c);
}

/**
 * Inverse of ksFromReflectance. Written as 1 / (1 + KS + √(KS² + 2KS)) — algebraically equal to
 * 1 + KS − √(KS² + 2KS) but free of catastrophic cancellation for large KS.
 */
export function reflectanceFromKs(ks: number): number {
  return 1 / (1 + ks + Math.sqrt(ks * ks + 2 * ks));
}

export function makePigment(hex: string, strength = 1): Pigment {
  if (!(strength > 0) || !Number.isFinite(strength)) throw new Error(`Invalid tinting strength: ${strength}`);
  const r = reflectanceFromHex(hex);
  const ks = new Float64Array(BANDS);
  for (let i = 0; i < BANDS; i++) ks[i] = ksFromReflectance(r[i]!);
  const luminance = Math.max(1e-6, xyzFromReflectance(r)[1]);
  return { ks, power: strength * luminance };
}

/**
 * Mixes pigments by volume fraction using single-constant Kubelka-Munk theory:
 * KS_mix(λ) = Σ cᵢ·KSᵢ(λ) / Σ cᵢ with cᵢ = volumeᵢ · powerᵢ. Writes the reflectance into `out`.
 */
export function mixInto(
  pigments: readonly Pigment[],
  volumes: ArrayLike<number>,
  out: Float64Array,
): Float64Array {
  let total = 0;
  for (let p = 0; p < pigments.length; p++) total += Math.max(0, volumes[p]!) * pigments[p]!.power;
  if (!(total > 0)) throw new Error('Cannot mix: all amounts are zero');
  for (let i = 0; i < BANDS; i++) {
    let ks = 0;
    for (let p = 0; p < pigments.length; p++) {
      const pig = pigments[p]!;
      ks += Math.max(0, volumes[p]!) * pig.power * pig.ks[i]!;
    }
    out[i] = reflectanceFromKs(ks / total);
  }
  return out;
}

export function mix(pigments: readonly Pigment[], volumes: ArrayLike<number>): Float64Array {
  return mixInto(pigments, volumes, new Float64Array(BANDS));
}
