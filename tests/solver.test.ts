import { describe, expect, it } from 'vitest';
import { deltaE2000 } from '../src/color/deltaE';
import { makePigment, mix } from '../src/mixing/km';
import { solve, type PaintInput } from '../src/mixing/solver';
import { hexFromReflectance, labFromReflectance } from '../src/mixing/spectral';

const palette: PaintInput[] = [
  { id: 'white', hex: '#fafaf7', strength: 1 },
  { id: 'black', hex: '#1c1c1c', strength: 3 },
  { id: 'yellow', hex: '#f7d117', strength: 1 },
  { id: 'magenta', hex: '#b0206c', strength: 1 },
  { id: 'cyan', hex: '#0077b6', strength: 1 },
];

describe('solver', () => {
  it('returns a single paint when the target is one of the paints', () => {
    const r = solve(palette, '#f7d117', 3);
    expect(r.best.components).toHaveLength(1);
    expect(r.best.components[0]!.id).toBe('yellow');
    expect(r.best.deltaE).toBeLessThan(0.5);
    expect(r.best.quality).toBe('exact');
    expect(r.hints).toEqual([]);
  });

  it('recovers a known two-paint mix', () => {
    const pigs = [makePigment('#f7d117'), makePigment('#0077b6')];
    const target = hexFromReflectance(mix(pigs, [0.7, 0.3]));
    const r = solve(palette, target, 3);
    expect(r.best.deltaE).toBeLessThan(1);
    const ids = r.best.components.map((c) => c.id).sort();
    expect(ids).toEqual(['cyan', 'yellow']);
    const yellow = r.best.components.find((c) => c.id === 'yellow')!;
    expect(yellow.weight).toBeCloseTo(0.7, 1);
  });

  it('recovers a three-paint mix with a small amount of black', () => {
    const pigs = [makePigment('#fafaf7'), makePigment('#b0206c'), makePigment('#1c1c1c', 3)];
    const target = hexFromReflectance(mix(pigs, [0.6, 0.37, 0.03]));
    const r = solve(palette, target, 3);
    expect(r.best.deltaE).toBeLessThan(1);
  });

  it('warns when the palette cannot reach the target', () => {
    const r = solve(
      [
        { id: 'red', hex: '#c8102e', strength: 1 },
        { id: 'blue', hex: '#1e4fa3', strength: 1 },
        { id: 'white', hex: '#ffffff', strength: 1 },
      ],
      '#22dd22',
      3,
    );
    expect(r.best.quality).toBe('unmatched');
    expect(r.best.deltaE).toBeGreaterThan(5);
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it('respects the paints-per-mix limit', () => {
    for (const k of [1, 2, 3]) {
      const r = solve(palette, '#6b8e23', k);
      expect(r.best.components.length).toBeLessThanOrEqual(k);
      for (const alt of r.alternatives) expect(alt.components.length).toBeLessThanOrEqual(k);
    }
  });

  it('reports mix colour, weights and parts consistently', () => {
    const r = solve(palette, '#8a5a9c', 4);
    const total = r.best.components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(r.best.components.every((c) => Number.isInteger(c.parts) && c.parts >= 1)).toBe(true);
    const pigs = r.best.components.map((c) => {
      const p = palette.find((q) => q.id === c.id)!;
      return makePigment(p.hex, p.strength);
    });
    const lab = labFromReflectance(mix(pigs, r.best.components.map((c) => c.weight)));
    expect(deltaE2000(lab, r.best.lab)).toBeLessThan(1e-6);
    expect(r.best.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('falls back to a beam search for large palettes and stays fast', () => {
    const big: PaintInput[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      hex: `#${((i * 2654435761) >>> 8).toString(16).padStart(6, '0').slice(0, 6)}`,
      strength: 1,
    }));
    const t0 = performance.now();
    const r = solve(big, '#7a6a55', 5);
    expect(performance.now() - t0).toBeLessThan(8000);
    expect(r.best.components.length).toBeLessThanOrEqual(5);
  });

  it('rejects bad input', () => {
    expect(() => solve([], '#ffffff', 3)).toThrow(/at least one paint/);
    expect(() => solve(palette, 'nope', 3)).toThrow();
    expect(() => solve(palette, '#ffffff', 0)).toThrow();
  });
});
