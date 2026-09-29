// Minimal typings for the parts of spectral.js (MIT, Ronald van Wijnen) used here.
declare module 'spectral.js' {
  export class Color {
    constructor(value: string | number[]);
    readonly sRGB: number[];
    readonly lRGB: number[];
    readonly R: number[];
    readonly XYZ: number[];
    readonly luminance: number;
    toString(options?: { format?: 'hex' | 'rgb'; method?: 'map' | 'clip' }): string;
  }
}
