import { rgbToHex } from '../color/convert';
import { h } from './dom';

/** Longest side images are scaled down to; plenty for colour picking and keeps memory in check. */
const MAX_SIDE = 1600;
const LOUPE_CELLS = 15;
const LOUPE_SIZE = 135;
const SAMPLE_SIZES = [
  { size: 1, label: 'Single pixel' },
  { size: 3, label: '3 × 3 average' },
  { size: 7, label: '7 × 7 average' },
] as const;

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

export interface ImagePicker {
  element: HTMLElement;
  load(file: File): Promise<void>;
}

/**
 * Load an image (file, drag-and-drop or paste), then click or tap to sample a colour.
 * Averaging happens in linear light so a 7 × 7 sample of a fine texture reads the way it looks.
 */
export function createImagePicker(onPick: (hex: string) => void): ImagePicker {
  let pixels: ImageData | null = null;
  let sampleSize: number = SAMPLE_SIZES[1].size;
  let cursor: { x: number; y: number } | null = null;
  let lastPick: { x: number; y: number } | null = null;

  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: -1 });
  const chooseButton = h('button', { type: 'button', class: 'button' }, 'Choose an image');
  chooseButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void load(file);
  });

  const error = h('p', { class: 'form-message is-error', role: 'alert' });

  const dropzone = h(
    'div',
    { class: 'dropzone' },
    h('p', {}, 'Drop a photo here or paste one from your clipboard.'),
    chooseButton,
  );

  const canvas = h('canvas', {
    class: 'image-canvas',
    tabindex: 0,
    role: 'img',
    'aria-label': 'Loaded image. Click to pick a colour, or use the arrow keys and press Enter.',
  });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const loupe = h('canvas', { class: 'loupe', width: LOUPE_SIZE, height: LOUPE_SIZE, 'aria-hidden': 'true' });
  const loupeCtx = loupe.getContext('2d')!;
  const marker = h('span', { class: 'pick-marker', 'aria-hidden': 'true' });
  const stageInner = h('div', { class: 'stage-inner' }, canvas, marker, loupe);
  const stage = h('div', { class: 'stage', hidden: true }, stageInner);

  const sizeGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Sample size' });
  for (const option of SAMPLE_SIZES) {
    const input = h('input', {
      type: 'radio',
      name: 'sample-size',
      value: option.size,
      checked: option.size === sampleSize,
    });
    input.addEventListener('change', () => {
      sampleSize = option.size;
      if (cursor) drawLoupe(cursor.x, cursor.y);
    });
    sizeGroup.append(h('label', {}, input, h('span', {}, option.label)));
  }
  const replaceButton = h('button', { type: 'button', class: 'link-button' }, 'Use another image');
  replaceButton.addEventListener('click', () => fileInput.click());
  const toolbar = h('div', { class: 'image-toolbar', hidden: true }, sizeGroup, replaceButton);

  const element = h('div', { class: 'image-picker' }, dropzone, stage, toolbar, error, fileInput);

  // Drag and drop anywhere on the picker.
  element.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    element.classList.add('is-dragging');
  });
  element.addEventListener('dragleave', (e) => {
    if (!element.contains(e.relatedTarget as Node | null)) element.classList.remove('is-dragging');
  });
  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('is-dragging');
    const file = e.dataTransfer?.files[0];
    if (file) void load(file);
  });

  async function load(file: File): Promise<void> {
    error.textContent = '';
    if (!file.type.startsWith('image/')) {
      error.textContent = `"${file.name}" isn't an image. Try a JPEG, PNG or WebP.`;
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      error.textContent = `Couldn't open "${file.name}". Try a JPEG, PNG or WebP.`;
      return;
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    cursor = null;
    lastPick = null;
    marker.hidden = true;
    loupe.hidden = true;
    dropzone.hidden = true;
    stage.hidden = false;
    toolbar.hidden = false;
  }

  /** Average colour of the sample square centred on (x, y), ignoring transparent pixels. */
  function sample(x: number, y: number): string | null {
    if (!pixels) return null;
    const half = Math.floor(sampleSize / 2);
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    for (let yy = y - half; yy <= y + half; yy++) {
      if (yy < 0 || yy >= pixels.height) continue;
      for (let xx = x - half; xx <= x + half; xx++) {
        if (xx < 0 || xx >= pixels.width) continue;
        const i = (yy * pixels.width + xx) * 4;
        const a = pixels.data[i + 3]! / 255;
        if (a === 0) continue;
        r += toLinear(pixels.data[i]!) * a;
        g += toLinear(pixels.data[i + 1]!) * a;
        b += toLinear(pixels.data[i + 2]!) * a;
        weight += a;
      }
    }
    if (weight === 0) return null;
    return rgbToHex([toSrgb(r / weight), toSrgb(g / weight), toSrgb(b / weight)]);
  }

  function imagePoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(canvas.width - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width))),
      y: Math.min(canvas.height - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height))),
    };
  }

  function placeOverlay(el: HTMLElement, x: number, y: number) {
    const rect = canvas.getBoundingClientRect();
    el.style.left = `${((x + 0.5) / canvas.width) * rect.width}px`;
    el.style.top = `${((y + 0.5) / canvas.height) * rect.height}px`;
  }

  function drawLoupe(x: number, y: number, touch = false) {
    if (!pixels) return;
    const cell = LOUPE_SIZE / LOUPE_CELLS;
    const half = Math.floor(LOUPE_CELLS / 2);
    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.fillStyle = '#808080';
    loupeCtx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    loupeCtx.drawImage(canvas, x - half, y - half, LOUPE_CELLS, LOUPE_CELLS, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
    const s = Math.floor(sampleSize / 2);
    const box = (half - s) * cell;
    loupeCtx.lineWidth = 2;
    loupeCtx.strokeStyle = '#000';
    loupeCtx.strokeRect(box - 1, box - 1, sampleSize * cell + 2, sampleSize * cell + 2);
    loupeCtx.strokeStyle = '#fff';
    loupeCtx.strokeRect(box + 1, box + 1, sampleSize * cell - 2, sampleSize * cell - 2);
    placeOverlay(loupe, x, y);
    loupe.classList.toggle('is-touch', touch);
    loupe.hidden = false;
  }

  function pick(x: number, y: number) {
    const hex = sample(x, y);
    if (!hex) {
      error.textContent = 'That spot is transparent. Pick somewhere else.';
      return;
    }
    error.textContent = '';
    lastPick = { x, y };
    placeOverlay(marker, x, y);
    marker.style.setProperty('--picked', hex);
    marker.hidden = false;
    onPick(hex);
  }

  let pressed = false;
  canvas.addEventListener('pointerdown', (e) => {
    pressed = true;
    canvas.setPointerCapture(e.pointerId);
    cursor = imagePoint(e);
    drawLoupe(cursor.x, cursor.y, e.pointerType !== 'mouse');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && !pressed) return;
    cursor = imagePoint(e);
    drawLoupe(cursor.x, cursor.y, e.pointerType !== 'mouse');
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!pressed) return;
    pressed = false;
    const p = imagePoint(e);
    cursor = p;
    pick(p.x, p.y);
    if (e.pointerType !== 'mouse') loupe.hidden = true;
  });
  canvas.addEventListener('pointercancel', () => {
    pressed = false;
    loupe.hidden = true;
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pressed) loupe.hidden = true;
  });

  canvas.addEventListener('keydown', (e) => {
    if (!pixels) return;
    const step = e.shiftKey ? 10 : 1;
    const c = cursor ?? { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) };
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      cursor = {
        x: Math.min(canvas.width - 1, Math.max(0, c.x + move[0])),
        y: Math.min(canvas.height - 1, Math.max(0, c.y + move[1])),
      };
      drawLoupe(cursor.x, cursor.y);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cursor = c;
      pick(c.x, c.y);
    }
  });
  canvas.addEventListener('focus', () => {
    const c = cursor ?? { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) };
    cursor = c;
    if (canvas.matches(':focus-visible')) drawLoupe(c.x, c.y);
  });
  canvas.addEventListener('blur', () => (loupe.hidden = true));

  // Keep overlays aligned when the layout reflows.
  new ResizeObserver(() => {
    if (!marker.hidden && lastPick) placeOverlay(marker, lastPick.x, lastPick.y);
    loupe.hidden = true;
  }).observe(canvas);

  return { element, load };
}
