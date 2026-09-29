import { Color } from 'spectral.js';
import { normalizeHex, xyzToLab, type Vec3 } from '../color/convert';

/** Number of spectral bands used by spectral.js (380–750 nm in 10 nm steps). */
export const BANDS = 38;

/**
 * spectral.js maps reflectance to XYZ with a D65-weighted colour-matching matrix it does not export.
 * The mapping is linear, so its columns are recovered by converting unit impulses once.
 */
const CMF: [Float64Array, Float64Array, Float64Array] = (() => {
  const rows: [Float64Array, Float64Array, Float64Array] = [
    new Float64Array(BANDS),
    new Float64Array(BANDS),
    new Float64Array(BANDS),
  ];
  for (let i = 0; i < BANDS; i++) {
    const impulse = new Array<number>(BANDS).fill(0);
    impulse[i] = 1;
    const xyz = new Color(impulse).XYZ;
    for (let c = 0; c < 3; c++) rows[c]![i] = xyz[c]!;
  }
  return rows;
})();

/** Reference white: the XYZ of a perfect sRGB white, so #ffffff maps to L* = 100. */
export const WHITE_XYZ = new Color('#ffffff').XYZ as Vec3;

export function reflectanceFromHex(hex: string): Float64Array {
  const norm = normalizeHex(hex);
  if (!norm) throw new Error(`Invalid hex colour: ${hex}`);
  return Float64Array.from(new Color(norm).R);
}

export function xyzFromReflectance(r: ArrayLike<number>): Vec3 {
  const [cx, cy, cz] = CMF;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < BANDS; i++) {
    const v = r[i]!;
    x += cx[i]! * v;
    y += cy[i]! * v;
    z += cz[i]! * v;
  }
  return [x, y, z];
}

export function labFromReflectance(r: ArrayLike<number>): Vec3 {
  return xyzToLab(xyzFromReflectance(r), WHITE_XYZ);
}

/** Displayable sRGB hex for a reflectance curve; out-of-gamut results are chroma-mapped by spectral.js. */
export function hexFromReflectance(r: ArrayLike<number>): string {
  return new Color(Array.from(r)).toString({ format: 'hex', method: 'map' }).toLowerCase();
}

export function labFromHex(hex: string): Vec3 {
  return labFromReflectance(reflectanceFromHex(hex));
}
