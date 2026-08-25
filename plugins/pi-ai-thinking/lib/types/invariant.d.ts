/** Invariant companion for @sjhmars/pi-ai-thinking. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "pi-ai-thinking-invariant";
export declare const inject: string[];
/**
 * Register the package invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns disposer for the registered companion.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map