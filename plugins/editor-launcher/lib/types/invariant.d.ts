/** Package invariant companion for `@dsh/editor-launcher`. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "editor-launcher-invariant";
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map