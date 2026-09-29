import { normalizeHex } from '../color/convert';
import { MAX_PAINTS_PER_MIX } from '../mixing/solver';
import { PRESETS } from './presets';

export interface Paint {
  id: string;
  name: string;
  hex: string;
  /** Tinting strength multiplier, 1 = typical. */
  strength: number;
  enabled: boolean;
}

export type Unit = 'ml' | 'g' | 'drops';
export const UNITS: readonly Unit[] = ['ml', 'g', 'drops'];

export interface AppState {
  paints: Paint[];
  maxPaints: number;
  targetHex: string;
  batchAmount: number;
  batchUnit: Unit;
  /** Most recent colours picked from images, newest first. */
  recentPicks: string[];
}

export const LIMITS = {
  paints: 30,
  name: 40,
  strength: { min: 0.1, max: 10 },
  batch: { min: 0, max: 100000 },
  recentPicks: 10,
} as const;

const STORAGE_KEY = 'paint-mixer:v1';
const STATE_VERSION = 1;
const PALETTE_FILE_TAG = 'paint-mixer-palette';

export class ValidationError extends Error {}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function paintsFromPreset(index: number): Paint[] {
  const preset = PRESETS[index];
  if (!preset) throw new Error(`Unknown preset ${index}`);
  return preset.paints.map((p) => ({ ...p, id: newId(), enabled: true }));
}

export function defaultState(): AppState {
  return {
    paints: paintsFromPreset(0),
    maxPaints: 3,
    targetHex: '#6b8e23',
    batchAmount: 50,
    batchUnit: 'ml',
    recentPicks: [],
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function clampStrength(v: number): number {
  return Math.min(LIMITS.strength.max, Math.max(LIMITS.strength.min, v));
}

function parsePaint(raw: unknown, index: number): Paint {
  const where = `Paint ${index + 1}`;
  if (!isRecord(raw)) throw new ValidationError(`${where} isn't an object.`);
  const hex = typeof raw.hex === 'string' ? normalizeHex(raw.hex) : null;
  if (!hex) throw new ValidationError(`${where} needs a colour like "#1e4fa3".`);
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, LIMITS.name) : '';
  const strength = raw.strength === undefined ? 1 : Number(raw.strength);
  if (!Number.isFinite(strength) || strength <= 0) throw new ValidationError(`${where} has an invalid strength.`);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: name || hex,
    hex,
    strength: clampStrength(strength),
    enabled: raw.enabled === undefined ? true : raw.enabled !== false,
  };
}

export function parsePaints(raw: unknown): Paint[] {
  if (!Array.isArray(raw)) throw new ValidationError('Expected a list of paints.');
  if (raw.length === 0) throw new ValidationError('The palette has no paints.');
  if (raw.length > LIMITS.paints) throw new ValidationError(`A palette can hold at most ${LIMITS.paints} paints.`);
  const paints = raw.map(parsePaint);
  // Ids must be unique; regenerate duplicates rather than rejecting the file.
  const seen = new Set<string>();
  for (const p of paints) {
    if (seen.has(p.id)) p.id = newId();
    seen.add(p.id);
  }
  return paints;
}

/** Validates persisted state, falling back to defaults field by field where possible. */
export function parseState(raw: unknown): AppState {
  if (!isRecord(raw) || raw.version !== STATE_VERSION) throw new ValidationError('Unrecognised saved state.');
  const d = defaultState();
  const maxPaints = Number(raw.maxPaints);
  const batchAmount = Number(raw.batchAmount);
  return {
    paints: parsePaints(raw.paints),
    maxPaints:
      Number.isInteger(maxPaints) && maxPaints >= 1 && maxPaints <= MAX_PAINTS_PER_MIX ? maxPaints : d.maxPaints,
    targetHex: (typeof raw.targetHex === 'string' && normalizeHex(raw.targetHex)) || d.targetHex,
    batchAmount:
      Number.isFinite(batchAmount) && batchAmount >= LIMITS.batch.min && batchAmount <= LIMITS.batch.max
        ? batchAmount
        : d.batchAmount,
    batchUnit: UNITS.includes(raw.batchUnit as Unit) ? (raw.batchUnit as Unit) : d.batchUnit,
    recentPicks: Array.isArray(raw.recentPicks)
      ? raw.recentPicks
          .map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
          .filter((v): v is string => v !== null)
          .slice(0, LIMITS.recentPicks)
      : [],
  };
}

export function loadState(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): AppState {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return defaultState();
    return parseState(JSON.parse(text));
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: STATE_VERSION, ...state }));
    return storage !== undefined;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function exportPalette(paints: readonly Paint[]): string {
  return JSON.stringify(
    {
      format: PALETTE_FILE_TAG,
      version: STATE_VERSION,
      paints: paints.map(({ name, hex, strength, enabled }) => ({ name, hex, strength, enabled })),
    },
    null,
    2,
  );
}

/** Parses an exported palette file (or a bare list of paints). Throws ValidationError with a readable message. */
export function importPalette(text: string): Paint[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError("That file isn't valid JSON.");
  }
  const list = isRecord(raw) ? raw.paints : raw;
  return parsePaints(list).map((p) => ({ ...p, id: newId() }));
}

type Listener = (state: AppState, prev: AppState) => void;

export class Store {
  private state: AppState;
  private readonly listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  update(fn: (s: AppState) => AppState): void {
    const prev = this.state;
    const next = fn(prev);
    if (next === prev) return;
    this.state = next;
    for (const l of this.listeners) l(next, prev);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => saveState(this.state), 250);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
