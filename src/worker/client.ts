import type { PaintInput, SolveResult } from '../mixing/solver';
import type { SolveRequest, SolveResponse } from './protocol';

type Listener = (outcome: { ok: true; result: SolveResult; ms: number } | { ok: false; error: string }) => void;

/**
 * Keeps at most one solve in flight. While the worker is busy, newer requests replace the queued
 * one, so dragging a colour picker never builds up a backlog of stale work.
 */
export class SolverClient {
  private readonly worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private inFlight: number | null = null;
  private queued: SolveRequest | null = null;
  private latestId = 0;

  constructor(private readonly onResult: Listener) {
    this.worker.onmessage = (e: MessageEvent<SolveResponse>) => this.handle(e.data);
    this.worker.onerror = (e) => {
      e.preventDefault();
      this.inFlight = null;
      this.queued = null;
      this.onResult({ ok: false, error: 'The mixing engine stopped unexpectedly. Reload the page to try again.' });
    };
  }

  request(paints: PaintInput[], targetHex: string, maxPaints: number): void {
    const req: SolveRequest = { id: this.nextId++, paints, targetHex, maxPaints };
    this.latestId = req.id;
    if (this.inFlight === null) this.send(req);
    else this.queued = req;
  }

  private send(req: SolveRequest) {
    this.inFlight = req.id;
    this.worker.postMessage(req);
  }

  private handle(res: SolveResponse) {
    this.inFlight = null;
    if (this.queued) {
      const next = this.queued;
      this.queued = null;
      this.send(next);
    }
    if (res.id !== this.latestId) return;
    this.onResult(res.ok ? { ok: true, result: res.result, ms: res.ms } : { ok: false, error: res.error });
  }
}
