import { labToLch, type Vec3 } from '../color/convert';

/** CIEDE2000 thresholds used to grade a match. */
export const THRESHOLDS = { exact: 1, veryClose: 2.3, close: 5 } as const;

export type Quality = 'exact' | 'very-close' | 'close' | 'unmatched';

export function qualityOf(deltaE: number): Quality {
  if (deltaE < THRESHOLDS.exact) return 'exact';
  if (deltaE < THRESHOLDS.veryClose) return 'very-close';
  if (deltaE < THRESHOLDS.close) return 'close';
  return 'unmatched';
}

/** Rough everyday name for a CIELAB hue angle. */
export function hueName(h: number): string {
  const deg = ((h % 360) + 360) % 360;
  if (deg < 20 || deg >= 345) return 'pink-red';
  if (deg < 50) return 'red';
  if (deg < 75) return 'orange';
  if (deg < 100) return 'yellow';
  if (deg < 135) return 'yellow-green';
  if (deg < 185) return 'green';
  if (deg < 235) return 'turquoise';
  if (deg < 290) return 'blue';
  if (deg < 320) return 'violet';
  return 'magenta';
}

/** Plain-language reasons the closest mix misses the target, most significant first. */
export function explainMiss(target: Vec3, mixed: Vec3): string[] {
  const [lt, ct, ht] = labToLch(target);
  const [lm, cm, hm] = labToLch(mixed);
  const hints: { weight: number; text: string }[] = [];

  const dL = lt - lm;
  const dC = ct - cm;
  const tooDull = dC > 5 && ct > 10;

  if (dL > 4 && tooDull) {
    // Lighter and more vivid at once: adding white would only dull it further, so name the real gap.
    hints.push({
      weight: dL + dC,
      text: `Your target is lighter and more vivid than anything these paints can make. A brighter, purer ${hueName(ht)} paint would help.`,
    });
  } else if (dL > 4) {
    hints.push({ weight: dL, text: 'The closest mix is darker than your target. A lighter paint, such as a white, would help.' });
  } else if (dL < -4) {
    hints.push({
      weight: -dL,
      text:
        ct > 10
          ? `The closest mix is lighter than your target. A deeper ${hueName(ht)} or a black would help.`
          : 'The closest mix is lighter than your target. A black or another dark paint would help.',
    });
  }

  if (tooDull && !(dL > 4)) {
    hints.push({
      weight: dC,
      text: `Your target is more vivid than anything these paints can make. A purer ${hueName(ht)} paint would help.`,
    });
  } else if (dC < -5) {
    hints.push({
      weight: -dC,
      text: 'The closest mix is more vivid than your target. A grey, black or complementary paint would tone it down.',
    });
  }

  if (ct > 8 && cm > 8) {
    let dh = Math.abs(ht - hm);
    if (dh > 180) dh = 360 - dh;
    if (dh > 12 && hueName(ht) !== hueName(hm)) {
      hints.push({
        weight: (dh / 180) * Math.min(ct, cm),
        text: `The closest mix leans ${hueName(hm)}, while your target is ${hueName(ht)}.`,
      });
    }
  }

  return hints.sort((a, b) => b.weight - a.weight).map((h) => h.text);
}
