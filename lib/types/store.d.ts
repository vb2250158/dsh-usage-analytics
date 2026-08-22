/**
 * Incremental analytics cache type surface (hand-written stub).
 */
import type { SessionStats } from './types.js'

/** Fold watermark for one session. */
export interface FoldWatermark {
  rev?: string
  seq: number
}

/** Options for the store constructor. */
export interface AnalyticsStoreOptions {
  persistence: {
    listSnapshots(signal?: AbortSignal): Promise<Array<{ meta: { id: string }; revision: string }>>
    readFrom(id: string, fromSeq: number, signal?: AbortSignal): Promise<{ events: unknown[] }>
  }
  dataDir: string
  logger?: { info(m: string, ...a: unknown[]): void; warn(m: string, ...a: unknown[]): void; error(m: string, ...a: unknown[]): void }
}

export declare class AnalyticsStore {
  readonly sessions: Map<string, SessionStats>
  readonly folds: Map<string, FoldWatermark>
  dirty: boolean
  constructor(options: AnalyticsStoreOptions)
  load(): Promise<void>
  refresh(options?: { force?: boolean }): Promise<{ folded: number; skipped: number; failed: number; stale: boolean }>
  snapshot(): Record<string, unknown>
  onLiveEvent(session: { id: string; header: unknown; seq?: number }, event: { type: string; seq?: number; time?: number; data?: unknown }): void
  schedulePersist(): void
  persist(): Promise<void>
  dispose(): void
}
