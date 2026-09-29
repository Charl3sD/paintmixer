import { inkFor, normalizeHex } from '../color/convert';
import { MAX_PAINTS_PER_MIX } from '../mixing/solver';
import { PRESETS } from '../state/presets';
import {
  clampStrength,
  exportPalette,
  importPalette,
  LIMITS,
  newId,
  paintsFromPreset,
  ValidationError,
  type Paint,
  type Store,
} from '../state/store';
import { downloadText, h, uid } from './dom';

/** "Your paints" column: edit the palette, presets, import/export and the paints-per-mix limit. */
export function mountPalette(root: HTMLElement, store: Store): void {
  const list = h('ul', { class: 'paint-list', role: 'list' });
  const count = h('p', { class: 'paint-count' });
  const message = h('p', { class: 'form-message', role: 'status' });

  const addButton = h('button', { type: 'button', class: 'button' }, 'Add paint');
  addButton.addEventListener('click', () => {
    if (store.get().paints.length >= LIMITS.paints) {
      showMessage(`You can have up to ${LIMITS.paints} paints.`);
      return;
    }
    const paint: Paint = { id: newId(), name: 'New paint', hex: '#888888', strength: 1, enabled: true };
    store.update((s) => ({ ...s, paints: [...s.paints, paint] }));
    const row = rows.get(paint.id);
    row?.name.focus();
    row?.name.select();
  });

  const presetSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Replace palette with a starter set' },
    h('option', { value: '' }, 'Starter sets…'),
    ...PRESETS.map((p, i) => h('option', { value: String(i) }, `${p.name}: ${p.description.toLowerCase()}`)),
  );
  presetSelect.addEventListener('change', () => {
    const index = Number(presetSelect.value);
    presetSelect.value = '';
    if (!Number.isInteger(index) || !PRESETS[index]) return;
    if (!confirm(`Replace your paints with "${PRESETS[index].name}"?`)) return;
    store.update((s) => ({ ...s, paints: paintsFromPreset(index) }));
    showMessage(`Loaded ${PRESETS[index].name}.`);
  });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const paints = importPalette(await file.text());
      store.update((s) => ({ ...s, paints }));
      showMessage(`Imported ${paints.length} paint${paints.length === 1 ? '' : 's'}.`);
    } catch (err) {
      showMessage(err instanceof ValidationError ? `Couldn't import: ${err.message}` : "Couldn't read that file.", true);
    }
  });
  const importButton = h('button', { type: 'button', class: 'link-button' }, 'Import');
  importButton.addEventListener('click', () => fileInput.click());
  const exportButton = h('button', { type: 'button', class: 'link-button' }, 'Export');
  exportButton.addEventListener('click', () => downloadText('my-paints.json', exportPalette(store.get().paints)));

  const limitId = uid('limit');
  const limit = h('input', { type: 'range', id: limitId, min: 1, max: MAX_PAINTS_PER_MIX, step: 1 });
  const limitValue = h('output', { for: limitId, class: 'limit-value' });
  limit.addEventListener('input', () => store.update((s) => ({ ...s, maxPaints: Number(limit.value) })));

  root.append(
    h('h2', { id: 'paints-heading' }, 'Your paints'),
    count,
    list,
    h('div', { class: 'palette-actions' }, addButton, presetSelect),
    h('div', { class: 'palette-files' }, importButton, exportButton, fileInput),
    message,
    h(
      'div',
      { class: 'limit' },
      h('label', { for: limitId }, 'Most paints in one mix'),
      h('div', { class: 'limit-control' }, limit, limitValue),
      h('p', { class: 'hint' }, 'Fewer paints make cleaner, easier mixes.'),
    ),
    h(
      'p',
      { class: 'hint' },
      'Strength is how hard a paint tints. Raise it for pigments like phthalo or black that take over a mix; lower it for weak ones.',
    ),
  );

  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  function showMessage(text: string, isError = false) {
    message.textContent = text;
    message.classList.toggle('is-error', isError);
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message.textContent = ''), isError ? 8000 : 3000);
  }

  interface Row {
    li: HTMLLIElement;
    swatch: HTMLLabelElement;
    color: HTMLInputElement;
    name: HTMLInputElement;
    strength: HTMLInputElement;
    enabled: HTMLInputElement;
    remove: HTMLButtonElement;
  }
  const rows = new Map<string, Row>();

  const patch = (id: string, change: Partial<Paint>) =>
    store.update((s) => ({ ...s, paints: s.paints.map((p) => (p.id === id ? { ...p, ...change } : p)) }));

  function createRow(paint: Paint): Row {
    const id = paint.id;
    const colorId = uid('paint-colour');
    const color = h('input', { type: 'color', id: colorId, class: 'visually-hidden' });
    color.addEventListener('input', () => {
      const hex = normalizeHex(color.value);
      if (hex) patch(id, { hex });
    });
    const swatch = h('label', { for: colorId, class: 'paint-swatch' }, color);

    const name = h('input', { type: 'text', class: 'paint-name', maxlength: LIMITS.name, 'aria-label': 'Paint name' });
    name.addEventListener('input', () => patch(id, { name: name.value }));
    name.addEventListener('blur', () => {
      if (!name.value.trim()) patch(id, { name: 'Unnamed paint' });
    });

    const strength = h('input', {
      type: 'number',
      class: 'paint-strength',
      min: LIMITS.strength.min,
      max: LIMITS.strength.max,
      step: 0.1,
      inputmode: 'decimal',
      'aria-label': 'Strength',
      title: 'Strength',
    });
    strength.addEventListener('change', () => {
      const v = Number(strength.value);
      if (!Number.isFinite(v) || v <= 0) {
        strength.value = String(store.get().paints.find((p) => p.id === id)?.strength ?? 1);
        return;
      }
      patch(id, { strength: clampStrength(v) });
    });

    const enabled = h('input', { type: 'checkbox', class: 'paint-enabled' });
    enabled.addEventListener('change', () => patch(id, { enabled: enabled.checked }));
    const enabledLabel = h('label', { class: 'paint-use' }, enabled, h('span', {}, 'Use'));

    const remove = h('button', { type: 'button', class: 'icon-button' }, '×');
    remove.addEventListener('click', () => {
      const { paints } = store.get();
      if (paints.length <= 1) {
        showMessage('Keep at least one paint.', true);
        return;
      }
      const index = paints.findIndex((p) => p.id === id);
      store.update((s) => ({ ...s, paints: s.paints.filter((p) => p.id !== id) }));
      const next = [...rows.values()][Math.min(index, rows.size - 1)];
      (next?.remove ?? addButton).focus();
    });

    const li = h(
      'li',
      { class: 'paint' },
      swatch,
      name,
      h('label', { class: 'paint-strength-field' }, h('span', { 'aria-hidden': 'true' }, 'Strength'), strength),
      enabledLabel,
      remove,
    );
    return { li, swatch, color, name, strength, enabled, remove };
  }

  function render(paints: readonly Paint[], maxPaints: number) {
    const liveIds = new Set(paints.map((p) => p.id));
    for (const [id, row] of rows) {
      if (!liveIds.has(id)) {
        row.li.remove();
        rows.delete(id);
      }
    }
    paints.forEach((paint, index) => {
      let row = rows.get(paint.id);
      if (!row) {
        row = createRow(paint);
        rows.set(paint.id, row);
      }
      if (list.children[index] !== row.li) list.insertBefore(row.li, list.children[index] ?? null);
      // Only write values that changed, so typing and dragging aren't interrupted.
      if (row.color.value !== paint.hex) row.color.value = paint.hex;
      row.swatch.style.setProperty('--swatch', paint.hex);
      row.swatch.style.setProperty('--swatch-ink', inkFor(paint.hex));
      row.swatch.title = `${paint.hex}, click to change`;
      row.color.setAttribute('aria-label', `Colour of ${paint.name}, ${paint.hex}`);
      if (document.activeElement !== row.name && row.name.value !== paint.name) row.name.value = paint.name;
      if (document.activeElement !== row.strength && Number(row.strength.value) !== paint.strength)
        row.strength.value = String(paint.strength);
      row.enabled.checked = paint.enabled;
      row.enabled.setAttribute('aria-label', `Use ${paint.name}`);
      row.remove.setAttribute('aria-label', `Remove ${paint.name}`);
      row.li.classList.toggle('is-off', !paint.enabled);
    });

    const inUse = paints.filter((p) => p.enabled).length;
    count.textContent =
      inUse === paints.length ? `${paints.length} paints` : `${inUse} of ${paints.length} paints in use`;
    addButton.disabled = paints.length >= LIMITS.paints;
    limit.value = String(maxPaints);
    limitValue.textContent = String(maxPaints);
  }

  const initial = store.get();
  render(initial.paints, initial.maxPaints);
  store.subscribe((s, prev) => {
    if (s.paints !== prev.paints || s.maxPaints !== prev.maxPaints) render(s.paints, s.maxPaints);
  });
}
