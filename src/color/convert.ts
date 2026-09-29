export type Vec3 = [number, number, number];

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalises "#abc", "abc", "#AABBCC" to "#aabbcc"; returns null for anything else. */
export function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let body = m[1]!.toLowerCase();
  if (body.length === 3) body = body.replace(/./g, (c) => c + c);
  return `#${body}`;
}

export function hexToRgb(hex: string): Vec3 {
  const norm = normalizeHex(hex);
  if (!norm) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(norm.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Vec3): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** CIE XYZ → CIELAB relative to the given reference white. */
export function xyzToLab([x, y, z]: Vec3, [xn, yn, zn]: Vec3): Vec3 {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const f = (t: number) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB → LCh with hue in degrees [0, 360). */
export function labToLch([l, a, b]: Vec3): Vec3 {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [l, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

/** Relative luminance-based choice of legible text colour on top of a swatch. */
export function inkFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Vec3;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.22 ? '#1f1f1f' : '#ffffff';
}
