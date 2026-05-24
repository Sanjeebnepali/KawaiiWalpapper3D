export type EngineStatus =
  | { kind: 'idle'; reason: 'no-active' | 'paused' | 'empty' | 'dnd' | 'ios' }
  | { kind: 'running'; nextChangeAt: number; intervalMs: number }
  | { kind: 'applying' };
