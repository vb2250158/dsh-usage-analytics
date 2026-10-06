/** Browser loader factory exports; this entry is loaded by DSH's module loader. */
import type { Context } from '@deepseek-ai/cordis'

/** Browser services required for the localized shared tab or standalone modal. */
export declare const inject: string[]
/**
 * Contribute Skill usage to settings.usage-statistics.tab while its owner is loaded;
 * otherwise register the standalone sidebar action and modal. No usage-plugin dependency is required.
 * @param ctx - Browser Cordis context with slots and locale services.
 */
export declare function apply(ctx: Context): void
