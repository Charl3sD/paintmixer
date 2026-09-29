import { inkFor } from '../color/convert';
import { batchAmounts } from '../mixing/ratios';
import type { Recipe, SolveResult } from '../mixing/solver';
import type { Quality } from '../mixing/quality';
import { LIMITS, UNITS, type Paint, type Store, type Unit } from '../state/store';
import { h, svg, uid } from './dom';

const QUALITY_TEXT: Record<Quality, string> = {
  exact: 'Exact match',
  'very-close': 'Very close match',
  close: 'Close match',
  unmatched: 'No exact match possible',
};

const DELTA_E_HELP =
  'Colour difference (CIEDE2000). Under 1 is invisible to most people, under 2.3 is hard to spot, over 5 is clearly different.';

const RING = { size: 220, r: 97, stroke: 18, inner: 80 } as const;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface RecipeView {
  showPending(): void;
  showResult(result: SolveResult): void;
  showError(message: string): void;
}

export function mountRecipe(root: HTMLElement, store: Store): RecipeView {
  let result: SolveResult | null = null;
  let selected = 0;

  const status = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const busy = h('p', { class: 'busy', 'aria-hidden': 'true' }, 'Mixing…');
  const body = h('div', { class: 'recipe-body' });

  const batchId = uid('batch');
  const batchInput = h('input', {
    type: 'number',
    id: batchId,
    class: 'batch-input',
    min: LIMITS.batch.min,
    max: LIMITS.batch.max,
    step: 'any',
    inputmode: 'decimal',
  });
  batchInput.addEventListener('input', () => {
    const v = Number(batchInput.value);
    if (batchInput.value !== '' && Number.isFinite(v) && v >= LIMITS.batch.min && v <= LIMITS.batch.max)
      store.update((s) => ({ ...s, batchAmount: v }));
  });
  const unitSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Unit' },
    ...UNITS.map((u) => h('option', { value: u }, u)),
  );
  unitSelect.addEventListener('change', () => store.update((s) => ({ ...s, batchUnit: unitSelect.value as Unit })));
  const batch = h('div', { class: 'batch' }, h('label', { for: batchId }, 'Batch size'), batchInput, unitSelect);

  root.append(h('div', { class: 'recipe-head' }, h('h2', { id: 'recipe-heading' }, 'What to mix'), busy), status, body);

  const paintById = () => new Map<string, Paint>(store.get().paints.map((p) => [p.id, p]));

  function render(animate: boolean) {
    const s = store.get();
    if (document.activeElement !== batchInput) batchInput.value = String(s.batchAmount);
    unitSelect.value = s.batchUnit;
    if (!result) return;

    const recipes = [result.best, ...result.alternatives];
    const recipe = recipes[selected] ?? result.best;
    const paints = paintById();
    const nameOf = (id: string) => paints.get(id)?.name ?? 'Removed paint';
    const hexOf = (id: string) => paints.get(id)?.hex ?? '#808080';

    const parts = recipe.components.map((c) => c.parts);
    const amounts = batchAmounts(parts, s.batchAmount);
    const single = recipe.components.length === 1;

    const rows = recipe.components.map((c, i) =>
      h(
        'li',
        { class: 'component' },
        swatchDot(hexOf(c.id)),
        h('span', { class: 'component-name' }, nameOf(c.id)),
        h('span', { class: 'component-parts' }, single ? 'all of it' : `${c.parts} ${c.parts === 1 ? 'part' : 'parts'}`),
        h('span', { class: 'component-share' }, `${(c.weight * 100).toFixed(1)}%`),
        h('span', { class: 'component-amount' }, s.batchAmount > 0 ? formatAmount(amounts[i]!, s.batchUnit) : ''),
      ),
    );

    const unmatched = recipe.quality === 'unmatched';
    const hints = selected === 0 ? result.hints : [];
    const warning = unmatched
      ? h(
          'div',
          { class: 'warning', role: 'note' },
          h('p', { class: 'warning-title' }, "Your paints can't make this colour"),
          h('p', {}, 'This is the closest mix they can get to.'),
          hints.length ? h('ul', {}, ...hints.map((t) => h('li', {}, t))) : null,
        )
      : hints.length
        ? h('div', { class: 'near-miss' }, h('p', {}, 'Why it isn’t exact'), h('ul', {}, ...hints.map((t) => h('li', {}, t))))
        : null;

    const children: (Node | null)[] = [
      disc(result.targetHex, recipe, hexOf, nameOf, animate),
      h(
        'div',
        { class: `verdict is-${recipe.quality}` },
        h('p', { class: 'verdict-title' }, QUALITY_TEXT[recipe.quality]),
        h('p', { class: 'verdict-delta', title: DELTA_E_HELP }, `Difference ${recipe.deltaE.toFixed(1)} ΔE`),
      ),
      warning,
      h(
        'p',
        { class: 'ratio' },
        single ? 'Straight from the tube' : h('span', { class: 'ratio-parts' }, parts.join(' : ')),
      ),
      h('ul', { class: 'components', role: 'list' }, ...rows),
      !single && recipe.partsDeltaE - recipe.deltaE > 0.3
        ? h(
            'p',
            { class: 'hint' },
            `Rounding to whole parts shifts the colour slightly (difference ${recipe.partsDeltaE.toFixed(1)} ΔE). Use the percentages for the closest result.`,
          )
        : null,
      batch,
      recipes.length > 1 ? alternatives(recipes, hexOf, nameOf) : null,
    ];
    body.replaceChildren(...children.filter((n): n is Node => n !== null));

    status.textContent = `${QUALITY_TEXT[recipe.quality]}. ${recipe.components
      .map((c) => (single ? nameOf(c.id) : `${c.parts} ${c.parts === 1 ? 'part' : 'parts'} ${nameOf(c.id)}`))
      .join(', ')}.`;
  }

  function alternatives(recipes: Recipe[], hexOf: (id: string) => string, nameOf: (id: string) => string) {
    return h(
      'div',
      { class: 'alternatives' },
      h('h3', {}, 'Other ways to mix it'),
      h(
        'ul',
        { role: 'list' },
        ...recipes.map((r, i) => {
          const bar = h('span', { class: 'alt-bar', 'aria-hidden': 'true' });
          for (const c of r.components) {
            const seg = h('span');
            seg.style.flexGrow = String(c.weight);
            seg.style.background = hexOf(c.id);
            bar.append(seg);
          }
          const button = h(
            'button',
            { type: 'button', class: 'alt', 'aria-pressed': String(i === selected) },
            bar,
            h('span', { class: 'alt-names' }, r.components.map((c) => nameOf(c.id)).join(', ')),
            h('span', { class: 'alt-delta', title: DELTA_E_HELP }, `${r.deltaE.toFixed(1)} ΔE`),
            i === 0 ? h('span', { class: 'alt-tag' }, 'Suggested') : null,
          );
          button.addEventListener('click', () => {
            selected = i;
            render(true);
            root.querySelector<HTMLButtonElement>('.alt[aria-pressed="true"]')?.focus();
          });
          return h('li', {}, button);
        }),
      ),
    );
  }

  store.subscribe((s, prev) => {
    if (s.batchAmount !== prev.batchAmount || s.batchUnit !== prev.batchUnit || s.paints !== prev.paints) render(false);
  });

  body.append(h('p', { class: 'empty' }, 'Mixing your first colour…'));
  render(false);

  return {
    showPending() {
      root.classList.add('is-mixing');
    },
    showResult(next) {
      root.classList.remove('is-mixing');
      result = next;
      selected = 0;
      render(true);
    },
    showError(message) {
      root.classList.remove('is-mixing');
      result = null;
      status.textContent = message;
      body.replaceChildren(h('p', { class: 'empty' }, message));
    },
  };
}

function swatchDot(hex: string) {
  const dot = h('span', { class: 'dot', 'aria-hidden': 'true' });
  dot.style.background = hex;
  return dot;
}

function formatAmount(value: number, unit: Unit): string {
  if (unit === 'drops') return `${Math.max(1, Math.round(value))} ${Math.round(value) === 1 ? 'drop' : 'drops'}`;
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${unit}`;
}

/** Split disc (target on the left, mix on the right) inside a ring of the paints in proportion. */
function disc(
  targetHex: string,
  recipe: Recipe,
  hexOf: (id: string) => string,
  nameOf: (id: string) => string,
  animate: boolean,
) {
  const { size, r, stroke, inner } = RING;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = recipe.components.length > 1 ? 3 : 0;

  const ring = svg(
    'g',
    { transform: `rotate(-90 ${c} ${c})` },
    // A hairline track peeks out either side of the segments so pale paints stay visible.
    svg('circle', { cx: c, cy: c, r, fill: 'none', 'stroke-width': stroke + 2, class: 'ring-track' }),
  );
  let offset = 0;
  const segments: [SVGCircleElement, string][] = [];
  for (const comp of recipe.components) {
    const len = Math.max(0.5, comp.weight * circumference - gap);
    const seg = svg('circle', {
      cx: c,
      cy: c,
      r,
      fill: 'none',
      stroke: hexOf(comp.id),
      'stroke-width': stroke,
      'stroke-dashoffset': -offset,
      class: 'ring-segment',
    });
    seg.append(svg('title', {}, `${nameOf(comp.id)}: ${(comp.weight * 100).toFixed(1)}%`));
    const final = `${len} ${circumference - len}`;
    seg.setAttribute('stroke-dasharray', animate && !reducedMotion() ? `0 ${circumference}` : final);
    segments.push([seg, final]);
    ring.append(seg);
    offset += comp.weight * circumference;
  }
  if (animate && !reducedMotion()) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => segments.forEach(([seg, final]) => seg.setAttribute('stroke-dasharray', final))),
    );
  }

  const half = (sweep: 0 | 1, fill: string) =>
    svg('path', { d: `M ${c} ${c - inner} A ${inner} ${inner} 0 0 ${sweep} ${c} ${c + inner} Z`, fill });

  const graphic = svg(
    'svg',
    {
      viewBox: `0 0 ${size} ${size}`,
      class: 'disc-graphic',
      role: 'img',
      'aria-label': `Your colour ${targetHex} beside the closest mix ${recipe.hex}`,
    },
    ring,
    half(0, targetHex),
    half(1, recipe.hex),
  );

  const caption = (label: string, hex: string) =>
    h('div', { class: 'disc-caption' }, h('span', {}, label), h('span', { class: 'disc-hex' }, hex));

  const wrap = h(
    'figure',
    { class: 'disc' },
    graphic,
    h('figcaption', { class: 'disc-captions' }, caption('Your colour', targetHex), caption('The mix', recipe.hex)),
  );
  wrap.style.setProperty('--target-ink', inkFor(targetHex));
  return wrap;
}
