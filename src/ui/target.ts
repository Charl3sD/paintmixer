import { inkFor, normalizeHex } from '../color/convert';
import { LIMITS, type Store } from '../state/store';
import { h, uid } from './dom';
import { createImagePicker } from './imagePicker';

interface EyeDropperResult {
  sRGBHex: string;
}
declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<EyeDropperResult> };
  }
}

/** "Colour to match" column: a colour picker, hex entry, and picking from an image. */
export function mountTarget(root: HTMLElement, store: Store): void {
  const setTarget = (hex: string) => store.update((s) => (s.targetHex === hex ? s : { ...s, targetHex: hex }));

  // Colour picker tab
  const colorId = uid('target-colour');
  const color = h('input', { type: 'color', id: colorId, class: 'visually-hidden' });
  color.addEventListener('input', () => {
    const hex = normalizeHex(color.value);
    if (hex) setTarget(hex);
  });
  const bigSwatch = h(
    'label',
    { for: colorId, class: 'target-swatch' },
    color,
    h('span', { class: 'target-swatch-label' }, 'Click to choose a colour'),
  );

  const hexId = uid('hex');
  const hexInput = h('input', {
    type: 'text',
    id: hexId,
    class: 'hex-input',
    spellcheck: 'false',
    autocomplete: 'off',
    maxlength: 7,
    'aria-describedby': `${hexId}-error`,
  });
  const hexError = h('p', { class: 'form-message is-error', id: `${hexId}-error`, role: 'alert' });
  const commitHex = () => {
    const hex = normalizeHex(hexInput.value);
    if (!hex) {
      hexError.textContent = 'Enter a hex colour like #6b8e23.';
      hexInput.setAttribute('aria-invalid', 'true');
      return;
    }
    hexError.textContent = '';
    hexInput.removeAttribute('aria-invalid');
    setTarget(hex);
  };
  hexInput.addEventListener('change', commitHex);
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitHex();
  });

  const hexRow = h('div', { class: 'hex-row' }, h('label', { for: hexId }, 'Hex'), hexInput);
  if (window.EyeDropper) {
    const dropper = h('button', { type: 'button', class: 'button' }, 'Pick from screen');
    dropper.addEventListener('click', async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper!().open();
        const hex = normalizeHex(sRGBHex);
        if (hex) setTarget(hex);
      } catch {
        // Cancelled with Escape; nothing to do.
      }
    });
    hexRow.append(dropper);
  }
  const pickerPanel = h('div', { class: 'tab-panel' }, bigSwatch, hexRow, hexError);

  // Image tab
  const recent = h('div', { class: 'recent-picks' });
  const recentList = h('ul', { class: 'recent-list', role: 'list' });
  recent.append(h('p', { class: 'hint' }, 'Recent picks'), recentList);
  const picker = createImagePicker((hex) => {
    store.update((s) => ({
      ...s,
      targetHex: hex,
      recentPicks: [hex, ...s.recentPicks.filter((p) => p !== hex)].slice(0, LIMITS.recentPicks),
    }));
  });
  const imagePanel = h('div', { class: 'tab-panel' }, picker.element, recent);

  // Tabs
  const tabs = [
    { label: 'Colour picker', panel: pickerPanel },
    { label: 'From an image', panel: imagePanel },
  ];
  const tabList = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'How to choose a colour' });
  const tabButtons = tabs.map((tab, i) => {
    const id = uid('tab');
    const panelId = uid('tabpanel');
    tab.panel.id = panelId;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', id);
    const button = h('button', { type: 'button', role: 'tab', id, 'aria-controls': panelId }, tab.label);
    button.addEventListener('click', () => select(i));
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      select(next);
      tabButtons[next]!.focus();
    });
    tabList.append(button);
    return button;
  });
  function select(index: number) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tabButtons[i]!.setAttribute('aria-selected', String(active));
      tabButtons[i]!.tabIndex = active ? 0 : -1;
      tab.panel.hidden = !active;
    });
  }
  select(0);

  // Paste an image from anywhere on the page.
  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    select(1);
    void picker.load(file);
  });

  root.append(h('h2', { id: 'target-heading' }, 'Colour to match'), tabList, pickerPanel, imagePanel);

  function render(targetHex: string, recentPicks: readonly string[]) {
    if (color.value !== targetHex) color.value = targetHex;
    bigSwatch.style.setProperty('--swatch', targetHex);
    bigSwatch.style.setProperty('--swatch-ink', inkFor(targetHex));
    color.setAttribute('aria-label', `Colour to match, ${targetHex}`);
    if (document.activeElement !== hexInput) {
      hexInput.value = targetHex;
      hexError.textContent = '';
      hexInput.removeAttribute('aria-invalid');
    }
    recent.hidden = recentPicks.length === 0;
    recentList.replaceChildren(
      ...recentPicks.map((hex) => {
        const b = h('button', {
          type: 'button',
          class: 'recent-chip',
          'aria-label': `Use ${hex}`,
          title: hex,
          'aria-pressed': String(hex === targetHex),
        });
        b.style.setProperty('--swatch', hex);
        b.addEventListener('click', () => setTarget(hex));
        return h('li', {}, b);
      }),
    );
  }

  const s = store.get();
  render(s.targetHex, s.recentPicks);
  store.subscribe((next, prev) => {
    if (next.targetHex !== prev.targetHex || next.recentPicks !== prev.recentPicks)
      render(next.targetHex, next.recentPicks);
  });
}
