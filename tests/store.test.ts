import { describe, expect, it } from 'vitest';
import {
  defaultState,
  exportPalette,
  importPalette,
  loadState,
  parseState,
  saveState,
  ValidationError,
} from '../src/state/store';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    raw: data,
  };
};

describe('persistence', () => {
  it('round-trips state', () => {
    const s = memory();
    const state = { ...defaultState(), maxPaints: 4, targetHex: '#123456' };
    expect(saveState(state, s)).toBe(true);
    expect(loadState(s)).toEqual(state);
  });

  it('falls back to defaults on corrupt or foreign data', () => {
    const s = memory();
    s.setItem('paint-mixer:v1', '{not json');
    expect(loadState(s).paints.length).toBeGreaterThan(0);
    s.setItem('paint-mixer:v1', JSON.stringify({ version: 99 }));
    expect(loadState(s).maxPaints).toBe(3);
    expect(loadState(undefined).paints.length).toBeGreaterThan(0);
  });

  it('repairs out-of-range fields instead of dropping the palette', () => {
    const state = parseState({
      version: 1,
      paints: [{ name: 'Blue', hex: '#00F', strength: 50 }],
      maxPaints: 99,
      targetHex: 'purple',
      batchAmount: -3,
      batchUnit: 'buckets',
      recentPicks: ['#fff', 'nope', 3],
    });
    expect(state.paints[0]).toMatchObject({ name: 'Blue', hex: '#0000ff', strength: 10, enabled: true });
    expect(state.maxPaints).toBe(3);
    expect(state.targetHex).toBe(defaultState().targetHex);
    expect(state.batchAmount).toBe(50);
    expect(state.batchUnit).toBe('ml');
    expect(state.recentPicks).toEqual(['#ffffff']);
  });
});

describe('palette files', () => {
  it('round-trips export and import with fresh ids', () => {
    const paints = defaultState().paints;
    const back = importPalette(exportPalette(paints));
    expect(back.map((p) => p.hex)).toEqual(paints.map((p) => p.hex));
    expect(back[0]!.id).not.toBe(paints[0]!.id);
  });

  it('accepts a bare list', () => {
    expect(importPalette('[{"hex":"#ff0000"}]')[0]).toMatchObject({ name: '#ff0000', strength: 1 });
  });

  it('explains what is wrong', () => {
    expect(() => importPalette('nope')).toThrow(ValidationError);
    expect(() => importPalette('[]')).toThrow(/no paints/);
    expect(() => importPalette('[{"hex":"#zz"}]')).toThrow(/Paint 1 needs a colour/);
    expect(() => importPalette(JSON.stringify(Array(31).fill({ hex: '#fff' })))).toThrow(/at most 30/);
  });
});
