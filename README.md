# Paint mixer

Tell it which paints you have, choose a colour (colour picker, hex, screen eyedropper, or click on a
photo), and it works out which of your paints to mix and in what ratio. If your paints can't reach
the colour, you get the closest possible mix, a warning, and a hint about which paint is missing.

Everything runs in the browser. There's no server and no storage beyond `localStorage`, and images never leave
the page.

## How it works

- **Pigment model.** Each paint's sRGB colour is turned into a 38-band reflectance curve
  ([spectral.js](https://github.com/rvanwijnen/spectral.js), MIT) and mixed with single-constant
  Kubelka-Munk theory, so blue + yellow makes green, not grey. Each paint has a **strength**
  (tinting strength): raise it for pigments like phthalo or black that take over a mix.
- **Solver** (`src/mixing/solver.ts`, runs in a Web Worker). It minimises the CIEDE2000 difference
  over every combination of up to *N* paints (a beam search for large palettes): a coarse simplex grid
  first, then Nelder-Mead on softmax weights. A recipe with fewer paints wins when it's within 0.5 ΔE
  of the most accurate one.
- **Ratios.** Exact percentages, plus the smallest whole-number parts (e.g. `6 : 2 : 1`) whose mix
  is within 1 ΔE of the exact ratio, and amounts for a batch size.
- **Match grades (ΔE2000).** Under 1 is exact, under 2.3 very close, under 5 close. Anything
  higher gets the "can't be matched" warning.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + production build into dist/
```

Node 20 or newer.

## Deploy on Render

The repo includes a `render.yaml` Blueprint for a free **Static Site**:

1. Push this repo to GitHub.
2. In Render, go to **New → Blueprint** and pick the repo. It builds with `npm ci && npm run build`
   and serves `dist/`.

No disk, database or environment secrets are needed.

## License

[MIT](LICENSE)
