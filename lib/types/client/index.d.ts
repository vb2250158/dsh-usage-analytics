/** Browser loader factory exports; this entry is loaded by DSH's module loader. */
import type { Context } from '@deepseek-ai/cordis'

/** Browser services required for the localized sidebar action and modal. */
export declare const inject: string[]
/**
 * Register the reversible browser surfaces using supported DSH 0.2 slots.
 * @param ctx - Browser Cordis context with slots and locale services.
 */
export declare function apply(ctx: Context): void
