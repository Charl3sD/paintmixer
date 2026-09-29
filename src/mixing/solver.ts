import { normalizeHex, type Vec3 } from '../color/convert';
import { deltaE2000 } from '../color/deltaE';
import { makePigment, mixInto, type Pigment } from './km';
import { nelderMead } from './nelderMead';
import { explainMiss, qualityOf, THRESHOLDS, type Quality } from './quality';
import { wholeParts } from './ratios';
import { BANDS, hexFromReflectance, labFromHex, labFromReflectance } from './spectral';

export const MAX_PAINTS_PER_MIX = 5;

export interface PaintInput {
  id: string;
  hex: string;
  /** Tinting strength multiplier, 1 = typical. */
  strength: number;
}

export interface RecipeComponent {
  id: string;
  /** Exact volume fraction, 0–1. */
  weight: number;
  /** Whole-number parts for practical mixing. */
  parts: number;
}

export interface Recipe {
  /** Sorted by weight, largest first. */
  components: RecipeComponent[];
  hex: string;
  lab: Vec3;
  /** ΔE2000 of the exact-ratio mix against the target. */
  deltaE: number;
  /** ΔE2000 of the whole-number-parts mix against the target. */
  partsDeltaE: number;
  quality: Quality;
}

export interface SolveResult {
  targetHex: string;
  targetLab: Vec3;
  best: Recipe;
  /** Other good recipes using different paint sets, best first. */
  alternatives: Recipe[];
  /** Why the best recipe misses the target; empty when it's close enough. */
  hints: string[];
}

export interface SolveOptions {
  /** A recipe with fewer paints wins if it is within this ΔE of the most accurate one. */
  parsimony?: number;
  alternatives?: number;
}

/** Upper bound on subsets evaluated exhaustively before switching to a beam search. */
const EXHAUSTIVE_LIMIT = 2500;
const BEAM_WIDTH = 48;
/** Subsets per size that get the full Nelder-Mead refinement. */
const REFINE_PER_SIZE = 12;
/** Weights below this are treated as "leave it out". */
const MIN_WEIGHT = 0.005;

interface Candidate {
  idx: number[];
  key: string;
  coarse: number;
  seeds: number[][];
}

interface Solution {
  idx: number[];
  weights: number[];
  deltaE: number;
}

const keyOf = (idx: readonly number[]) => idx.join(',');

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= n - (k - cur.length); i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

/** Interior points of the (m−1)-simplex: compositions of `n` into `m` positive parts. */
function compositions(m: number, n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (left: number, slots: number) => {
    if (slots === 1) {
      out.push([...cur, left].map((v) => v / n));
      return;
    }
    for (let v = 1; v <= left - (slots - 1); v++) {
      cur.push(v);
      rec(left - v, slots - 1);
      cur.pop();
    }
  };
  rec(n, m);
  return out;
}

/** Coarse starting grids per mix size; pairs get extra points near the edges for "a touch of" mixes. */
const GRIDS: number[][][] = (() => {
  const grids: number[][][] = [[], [[1]]];
  const pairT = new Set<number>([0.01, 0.02, 0.035, 0.05, 0.075]);
  for (let t = 0.1; t < 0.95; t += 0.05) pairT.add(Math.round(t * 1000) / 1000);
  for (const t of [...pairT]) pairT.add(Math.round((1 - t) * 1000) / 1000);
  grids[2] = [...pairT].sort((a, b) => a - b).map((t) => [t, 1 - t]);
  const resolution: Record<number, number> = { 3: 15, 4: 10, 5: 8 };
  for (let m = 3; m <= MAX_PAINTS_PER_MIX; m++) grids[m] = compositions(m, resolution[m]!);
  return grids;
})();

function softmax(z: readonly number[]): number[] {
  // Logit 0 is pinned to the first paint, removing the scale redundancy.
  const all = [0, ...z];
  const max = Math.max(...all);
  const e = all.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

function logits(w: readonly number[]): number[] {
  const base = Math.max(w[0]!, 1e-6);
  return w.slice(1).map((v) => Math.log(Math.max(v, 1e-6) / base));
}

class Scorer {
  private readonly buf = new Float64Array(BANDS);

  constructor(
    private readonly pigments: readonly Pigment[],
    private readonly target: Vec3,
  ) {}

  subset(idx: readonly number[]): Pigment[] {
    return idx.map((i) => this.pigments[i]!);
  }

  labOf(sub: readonly Pigment[], w: readonly number[]): Vec3 {
    return labFromReflectance(mixInto(sub, w, this.buf));
  }

  score(sub: readonly Pigment[], w: readonly number[]): number {
    return deltaE2000(this.labOf(sub, w), this.target);
  }
}

export function solve(
  paints: readonly PaintInput[],
  targetHex: string,
  maxPaints: number,
  { parsimony = 0.5, alternatives = 3 }: SolveOptions = {},
): SolveResult {
  const target = normalizeHex(targetHex);
  if (!target) throw new Error(`Invalid target colour: ${targetHex}`);
  if (paints.length === 0) throw new Error('Add at least one paint to mix with.');
  if (!Number.isInteger(maxPaints) || maxPaints < 1) throw new Error(`Invalid paints-per-mix limit: ${maxPaints}`);

  const n = paints.length;
  const k = Math.min(maxPaints, MAX_PAINTS_PER_MIX, n);
  const pigments = paints.map((p) => makePigment(p.hex, p.strength));
  const targetLab = labFromHex(target);
  const scorer = new Scorer(pigments, targetLab);

  const refined = new Map<string, Solution>();
  const bestBySize: (Solution | undefined)[] = [];
  let previousLevel: Candidate[] = [];

  let totalSubsets = 0;
  for (let m = 1; m <= k; m++) totalSubsets += choose(n, m);
  const exhaustive = totalSubsets <= EXHAUSTIVE_LIMIT;

  for (let m = 1; m <= k; m++) {
    // 1. Pick the subsets of size m to consider.
    let subsets: number[][];
    if (exhaustive || m === 1) {
      subsets = combinations(n, m);
    } else {
      const seen = new Set<string>();
      subsets = [];
      for (const parent of previousLevel.slice(0, BEAM_WIDTH)) {
        for (let j = 0; j < n; j++) {
          if (parent.idx.includes(j)) continue;
          const idx = [...parent.idx, j].sort((a, b) => a - b);
          const key = keyOf(idx);
          if (!seen.has(key)) {
            seen.add(key);
            subsets.push(idx);
          }
        }
      }
    }

    // 2. Coarse evaluation on a grid, plus seeds grown from refined smaller mixes.
    const level: Candidate[] = subsets.map((idx) => {
      const sub = scorer.subset(idx);
      const points = GRIDS[m]!.slice();
      for (let drop = 0; drop < m && m > 1; drop++) {
        const parent = refined.get(keyOf(idx.filter((_, i) => i !== drop)));
        if (!parent) continue;
        for (const touch of [0.01, 0.04]) {
          const w: number[] = [];
          let pi = 0;
          for (let i = 0; i < m; i++) w.push(i === drop ? touch : parent.weights[pi++]! * (1 - touch));
          points.push(w);
        }
      }
      const scored = points.map((w) => ({ w, d: scorer.score(sub, w) })).sort((a, b) => a.d - b.d);
      return { idx, key: keyOf(idx), coarse: scored[0]!.d, seeds: scored.slice(0, 2).map((s) => s.w) };
    });
    level.sort((a, b) => a.coarse - b.coarse);

    // 3. Refine the most promising subsets with Nelder-Mead over softmax logits.
    for (const cand of level.slice(0, REFINE_PER_SIZE)) {
      const sub = scorer.subset(cand.idx);
      let sol: Solution;
      if (m === 1) {
        sol = { idx: cand.idx, weights: [1], deltaE: cand.coarse };
      } else {
        const f = (z: readonly number[]) => scorer.score(sub, softmax(z));
        let bestZ: number[] = [];
        let bestF = Infinity;
        for (const seed of cand.seeds) {
          const r = nelderMead(f, logits(seed), { step: 0.8, tolerance: 1e-6 });
          if (r.fx < bestF) {
            bestF = r.fx;
            bestZ = r.x;
          }
        }
        sol = { idx: cand.idx, weights: softmax(bestZ), deltaE: bestF };
      }
      refined.set(cand.key, sol);
      if (!bestBySize[m] || sol.deltaE < bestBySize[m]!.deltaE) bestBySize[m] = sol;
    }
    previousLevel = level;
  }

  // 4. Drop negligible components; the smaller subset may already exist, keep whichever is better.
  const cleaned = new Map<string, Solution>();
  for (const sol of refined.values()) {
    const keep = sol.weights.map((w, i) => [w, i] as const).filter(([w]) => w >= MIN_WEIGHT);
    let s = sol;
    if (keep.length < sol.weights.length) {
      const idx = keep.map(([, i]) => sol.idx[i]!);
      const total = keep.reduce((a, [w]) => a + w, 0);
      const weights = keep.map(([w]) => w / total);
      s = { idx, weights, deltaE: scorer.score(scorer.subset(idx), weights) };
    }
    const key = keyOf(s.idx);
    const prev = cleaned.get(key);
    if (!prev || s.deltaE < prev.deltaE) cleaned.set(key, s);
  }

  const ranked = [...cleaned.values()].sort((a, b) => a.deltaE - b.deltaE);
  const mostAccurate = ranked[0]!;
  // 5. Parsimony: the fewest paints that are practically as good as the most accurate mix.
  const best =
    ranked
      .filter((s) => s.deltaE <= mostAccurate.deltaE + parsimony)
      .sort((a, b) => a.idx.length - b.idx.length || a.deltaE - b.deltaE)[0] ?? mostAccurate;

  const toRecipe = (s: Solution): Recipe => {
    const sub = scorer.subset(s.idx);
    const whole = wholeParts(sub, s.weights);
    const components = s.idx
      .map((i, j) => ({ id: paints[i]!.id, weight: s.weights[j]!, parts: whole.parts[j]! }))
      .sort((a, b) => b.weight - a.weight);
    const lab = scorer.labOf(sub, s.weights);
    const buf = new Float64Array(BANDS);
    return {
      components,
      hex: hexFromReflectance(mixInto(sub, s.weights, buf)),
      lab,
      deltaE: s.deltaE,
      partsDeltaE: deltaE2000(whole.lab, targetLab),
      quality: qualityOf(s.deltaE),
    };
  };

  const bestRecipe = toRecipe(best);
  return {
    targetHex: target,
    targetLab,
    best: bestRecipe,
    alternatives: ranked
      .filter((s) => s !== best)
      .slice(0, alternatives)
      .map(toRecipe),
    hints: bestRecipe.deltaE >= THRESHOLDS.veryClose ? explainMiss(targetLab, bestRecipe.lab) : [],
  };
}
