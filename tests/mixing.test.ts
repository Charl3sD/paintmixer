import { describe, expect, it } from 'vitest';
import { labToLch } from '../src/color/convert';
import { deltaE2000 } from '../src/color/deltaE';
import { ksFromReflectance, makePigment, mix, reflectanceFromKs } from '../src/mixing/km';
import { batchAmounts, wholeParts } from '../src/mixing/ratios';
import { explainMiss, qualityOf } from '../src/mixing/quality';
import { labFromHex, labFromReflectance } from '../src/mixing/spectral';

describe('Kubelka-Munk mixing', () => {
  it('KS and reflectance are inverses, including very dark values', () => {
    for (const r of [1e-4, 0.01, 0.2, 0.5, 0.9, 1]) expect(reflectanceFromKs(ksFromReflectance(r))).toBeCloseTo(r, 10);
  });

  it('a paint mixed with itself is unchanged', () => {
    const p = makePigment('#1e4fa3');
    const lab = labFromReflectance(mix([p, p], [0.3, 0.7]));
    expect(deltaE2000(lab, labFromHex('#1e4fa3'))).toBeLessThan(0.01);
  });

  it('blue and yellow make green, not grey', () => {
    const lab = labFromReflectance(mix([makePigment('#0033cc'), makePigment('#ffdd00')], [0.5, 0.5]));
    const [, c, h] = labToLch(lab);
    expect(h).toBeGreaterThan(120);
    expect(h).toBeLessThan(200);
    expect(c).toBeGreaterThan(20);
  });

  it('adding white lightens and keeps the hue family', () => {
    const red = makePigment('#c8102e');
    const white = makePigment('#ffffff');
    const base = labToLch(labFromHex('#c8102e'));
    const tint = labToLch(labFromReflectance(mix([red, white], [0.5, 0.5])));
    expect(tint[0]).toBeGreaterThan(base[0] + 10);
    expect(Math.abs(tint[2] - base[2])).toBeLessThan(30);
  });

  it('higher tinting strength pulls the mix further toward that paint', () => {
    const white = makePigment('#ffffff');
    const weak = labFromReflectance(mix([white, makePigment('#1c1c1c', 1)], [0.8, 0.2]));
    const strong = labFromReflectance(mix([white, makePigment('#1c1c1c', 3)], [0.8, 0.2]));
    expect(strong[0]).toBeLessThan(weak[0]);
  });

  it('rejects invalid input', () => {
    expect(() => makePigment('#12')).toThrow();
    expect(() => makePigment('#ffffff', 0)).toThrow();
    expect(() => mix([makePigment('#ffffff')], [0])).toThrow();
  });
});

describe('whole-number parts', () => {
  const pigs = [makePigment('#ffffff'), makePigment('#c8102e'), makePigment('#0033cc')];

  it('finds a simple ratio when the weights are simple', () => {
    const { parts, roundingError } = wholeParts(pigs, [6 / 9, 2 / 9, 1 / 9]);
    expect(roundingError).toBeLessThanOrEqual(1);
    expect(parts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(9);
    expect(parts.every((p) => p >= 1)).toBe(true);
  });

  it('handles a single paint', () => {
    expect(wholeParts(pigs.slice(0, 1), [1]).parts).toEqual([1]);
  });

  it('splits batch amounts proportionally', () => {
    expect(batchAmounts([3, 1], 100)).toEqual([75, 25]);
    expect(batchAmounts([3, 1], 0)).toEqual([0, 0]);
  });
});

describe('match quality', () => {
  it('grades ΔE', () => {
    expect(qualityOf(0.4)).toBe('exact');
    expect(qualityOf(1.5)).toBe('very-close');
    expect(qualityOf(3)).toBe('close');
    expect(qualityOf(12)).toBe('unmatched');
  });
  it('explains a mix that is too dark and too dull', () => {
    const hints = explainMiss([80, 60, 60], [40, 10, 10]);
    expect(hints[0]).toMatch(/lighter and more vivid/);
  });
  it('explains a mix that is too light', () => {
    expect(explainMiss([30, 40, 30], [50, 40, 30])[0]).toMatch(/deeper red or a black/);
  });
});

describe('miss explanations', () => {
  it('names a brighter, purer paint when the target is both lighter and more vivid', () => {
    const hints = explainMiss([85, -70, 50], [70, -30, 20]);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatch(/lighter and more vivid.*purer green/);
  });
  it('suggests something lighter when only lightness is off', () => {
    expect(explainMiss([80, 0, 0], [60, 0, 0])[0]).toMatch(/lighter paint/);
  });
});
