import { describe, expect, it } from 'vitest';
import { hexToRgb, labToLch, normalizeHex, rgbToHex, xyzToLab, type Vec3 } from '../src/color/convert';
import { deltaE2000 } from '../src/color/deltaE';

describe('hex handling', () => {
  it('normalises short, long and bare hex', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('a1b2c3')).toBe('#a1b2c3');
    expect(normalizeHex(' #FFFFFF ')).toBe('#ffffff');
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '#12', '#12345', 'zzzzzz', '#1234567', 'red']) expect(normalizeHex(bad)).toBeNull();
    expect(() => hexToRgb('nope')).toThrow();
  });
  it('round-trips rgb', () => {
    expect(rgbToHex(hexToRgb('#1e4fa3'))).toBe('#1e4fa3');
    expect(rgbToHex([300, -5, 127.6])).toBe('#ff0080');
  });
});

describe('CIELAB', () => {
  const D65: Vec3 = [0.95047, 1, 1.08883];
  it('maps the white point to L*=100 and black to 0', () => {
    const [l, a, b] = xyzToLab(D65, D65);
    expect(l).toBeCloseTo(100, 6);
    expect(a).toBeCloseTo(0, 6);
    expect(b).toBeCloseTo(0, 6);
    expect(xyzToLab([0, 0, 0], D65)[0]).toBeCloseTo(0, 6);
  });
  it('converts to LCh with positive hue', () => {
    const [, c, h] = labToLch([50, 0, -10]);
    expect(c).toBeCloseTo(10);
    expect(h).toBeCloseTo(270);
  });
});

describe('CIEDE2000', () => {
  // Reference pairs from Sharma, Wu & Dalal (2005), Table 1.
  const cases: [Vec3, Vec3, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  it.each(cases)('%j vs %j = %f', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 4);
  });
  it('is zero for identical colours', () => {
    expect(deltaE2000([40, 10, -20], [40, 10, -20])).toBe(0);
  });
});
