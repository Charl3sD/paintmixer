/// <reference lib="webworker" />
import { solve } from '../mixing/solver';
import type { SolveRequest, SolveResponse } from './protocol';

self.onmessage = (event: MessageEvent<SolveRequest>) => {
  const { id, paints, targetHex, maxPaints } = event.data;
  let response: SolveResponse;
  try {
    const t0 = performance.now();
    const result = solve(paints, targetHex, maxPaints);
    response = { id, ok: true, result, ms: performance.now() - t0 };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
