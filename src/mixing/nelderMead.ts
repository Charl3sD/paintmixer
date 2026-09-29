export interface MinimizeResult {
  x: number[];
  fx: number;
  evaluations: number;
}

/** Nelder-Mead simplex minimisation (standard coefficients) for small unconstrained problems. */
export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: readonly number[],
  { step = 0.5, maxIterations = 200 * Math.max(1, x0.length), tolerance = 1e-5 } = {},
): MinimizeResult {
  const n = x0.length;
  let evaluations = 0;
  const evalAt = (x: number[]) => {
    evaluations++;
    return f(x);
  };
  if (n === 0) return { x: [], fx: evalAt([]), evaluations };

  const pts: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i]! += step;
    pts.push(p);
  }
  const vals = pts.map(evalAt);
  const order = pts.map((_, i) => i);

  for (let iter = 0; iter < maxIterations; iter++) {
    order.sort((a, b) => vals[a]! - vals[b]!);
    const best = order[0]!;
    const worst = order[n]!;
    const second = order[n - 1]!;
    if (Math.abs(vals[worst]! - vals[best]!) < tolerance) break;

    const centroid = new Array<number>(n).fill(0);
    for (let k = 0; k < n; k++) {
      const p = pts[order[k]!]!;
      for (let i = 0; i < n; i++) centroid[i]! += p[i]! / n;
    }
    const along = (t: number) => centroid.map((c, i) => c + t * (pts[worst]![i]! - c));

    const xr = along(-1);
    const fr = evalAt(xr);
    if (fr < vals[best]!) {
      const xe = along(-2);
      const fe = evalAt(xe);
      if (fe < fr) {
        pts[worst] = xe;
        vals[worst] = fe;
      } else {
        pts[worst] = xr;
        vals[worst] = fr;
      }
    } else if (fr < vals[second]!) {
      pts[worst] = xr;
      vals[worst] = fr;
    } else {
      const outside = fr < vals[worst]!;
      const xc = along(outside ? -0.5 : 0.5);
      const fc = evalAt(xc);
      if (fc < (outside ? fr : vals[worst]!)) {
        pts[worst] = xc;
        vals[worst] = fc;
      } else {
        const bp = pts[best]!;
        for (let k = 0; k <= n; k++) {
          if (k === best) continue;
          pts[k] = pts[k]!.map((v, i) => bp[i]! + 0.5 * (v - bp[i]!));
          vals[k] = evalAt(pts[k]!);
        }
      }
    }
  }

  let bi = 0;
  for (let k = 1; k <= n; k++) if (vals[k]! < vals[bi]!) bi = k;
  return { x: pts[bi]!, fx: vals[bi]!, evaluations };
}
