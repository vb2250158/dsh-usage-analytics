/** Rebuildable Skill metadata cache over DSH 0.2 read-only persistence handles. */
import type { SessionPersistence, SessionPersistenceRevision } from '@deepseek-ai/dsh-session-persistence'
import type { ScanResult, SessionStats, SkillUsage, SkillUsageRange } from './types.js'

export interface FoldWatermark {
  revision: SessionPersistenceRevision
  seq: number
}

export interface AnalyticsStoreOptions {
  persistence: Pick<SessionPersistence, 'list' | 'open'>
  dataDir: string
  flushRefreshMs: number
  foldConcurrency: number
  logger?: { warn(message: string, ...details: unknown[]): void }
}

export declare class AnalyticsStore {
  persistence: Pick<SessionPersistence, 'list' | 'open'>
  dataDir: string
  flushRefreshMs: number
  foldConcurrency: number
  logger: { warn(message: string, ...details: unknown[]): void }
  sessions: Map<string, SessionStats>
  folds: Map<string, FoldWatermark>
  built: boolean
  lastScan: ScanResult | undefined
  refreshPromise: Promise<ScanResult | undefined> | undefined
  persistPromise: Promise<void>
  refreshTimer: ReturnType<typeof setTimeout> | undefined
  disposed: boolean
  constructor(options: AnalyticsStoreOptions)
  /** Load validated cache metadata; revisions are re-read in this instance. */
  load(): Promise<void>
  /** Serialize an atomic derived-cache write. */
  persist(options?: { final?: boolean }): Promise<void>
  /** Stop scheduling; the Host lifecycle awaits pending scans and final writes. */
  dispose(): void
  /** Scan changed own-session tails, or return the current result after disposal. */
  refresh(options?: { force?: boolean }): Promise<ScanResult | undefined>
  /** Schedule a scan with its failure observed by the logger. */
  refreshAsync(): void
  /** Read session metadata and close all read handles before advancing watermarks. */
  scan(force: boolean): Promise<ScanResult>
  /** Debounce scans requested by session events. */
  scheduleRefreshSoon(): void
  /** Derive exact period counts from cached invocation metadata. */
  snapshot(options?: SkillUsageRange): { generatedAt: number; skillUsage: SkillUsage }
}
