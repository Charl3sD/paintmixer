import type { Vec3 } from '../color/convert';
import { deltaE2000 } from '../color/deltaE';
import { BANDS, labFromReflectance } from './spectral';
import { mixInto, type Pigment } from './km';

export interface Parts {
  /** Whole-number parts aligned with the input weights; every paint gets at least one part. */
  parts: number[];
  /** ΔE2000 between the whole-number mix and the exact-ratio mix. */
  roundingError: number;
  /** CIELAB of the whole-number mix. */
  lab: Vec3;
}

/** Largest-remainder apportionment of `total` parts, guaranteeing at least one part each. */
function apportion(weights: readonly number[], total: number): number[] {
  const m = weights.length;
  const spare = total - m;
  const raw = weights.map((w) => w * spare);
  const parts = raw.map((r) => 1 + Math.floor(r));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % m, left--) parts[order[k]![1]]!++;
  return parts;
}

/**
 * Finds the smallest whole-number ratio (e.g. 6 : 2 : 1) whose mix is visually indistinguishable
 * from the exact ratio (ΔE ≤ tolerance). Falls back to the most accurate ratio up to `maxTotal`.
 */
export function wholeParts(
  pigments: readonly Pigment[],
  weights: readonly number[],
  { tolerance = 1, maxTotal = 100 } = {},
): Parts {
  const m = pigments.length;
  if (m === 0 || weights.length !== m) throw new Error('wholeParts needs one weight per pigment');
  const buf = new Float64Array(BANDS);
  const exact = labFromReflectance(mixInto(pigments, weights, buf));
  if (m === 1) return { parts: [1], roundingError: 0, lab: exact };

  const labOf = (parts: readonly number[]) => labFromReflectance(mixInto(pigments, parts, buf));
  let best: Parts | null = null;

  for (let total = m; total <= maxTotal; total++) {
    let parts = apportion(weights, total);
    let lab = labOf(parts);
    let err = deltaE2000(exact, lab);

    // Rounding in weight space isn't rounding in colour space: try moving one part between paints.
    let improved = true;
    while (improved) {
      improved = false;
      for (let from = 0; from < m; from++) {
        if (parts[from]! <= 1) continue;
        for (let to = 0; to < m; to++) {
          if (to === from) continue;
          const trial = parts.slice();
          trial[from]!--;
          trial[to]!++;
          const trialLab = labOf(trial);
          const trialErr = deltaE2000(exact, trialLab);
          if (trialErr < err - 1e-9) {
            parts = trial;
            lab = trialLab;
            err = trialErr;
            improved = true;
          }
        }
      }
    }

    if (!best || err < best.roundingError) best = { parts, roundingError: err, lab };
    if (err <= tolerance) return { parts, roundingError: err, lab };
  }
  return best!;
}

/** Splits a batch amount across whole-number parts. */
export function batchAmounts(parts: readonly number[], batch: number): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (!(batch > 0) || total <= 0) return parts.map(() => 0);
  return parts.map((p) => (p / total) * batch);
}
