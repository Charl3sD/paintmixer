import type { PaintInput, SolveResult } from '../mixing/solver';

export interface SolveRequest {
  id: number;
  paints: PaintInput[];
  targetHex: string;
  maxPaints: number;
}

export type SolveResponse =
  | { id: number; ok: true; result: SolveResult; ms: number }
  | { id: number; ok: false; error: string };
