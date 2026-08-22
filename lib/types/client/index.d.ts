/**
 * dsh-usage-analytics — browser half type surface.
 * Hand-written (the implementation is a plain-JS __ModuleLoader__ bundle).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Locale namespace this plugin owns. */
export declare const NS: 'dsh-usage-analytics'

/** Services required by the browser half. */
export declare const inject: string[]

/** Mount the sidebar entry + full-screen dashboard. */
export declare function apply(ctx: ClientContext): void
