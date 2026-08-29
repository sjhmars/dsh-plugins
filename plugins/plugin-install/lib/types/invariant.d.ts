/** `@sjhmars/plugin-install` 的 invariant 伴侣。 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "plugin-install-invariant";
export declare const inject: string[];
/**
 * 注册 invariant 伴侣。
 * @param ctx - 带 invariants 服务的 Host 上下文。
 * @returns 注册释放器。
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map