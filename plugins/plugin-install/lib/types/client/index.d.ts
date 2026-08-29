/** 浏览器半：设置 → 插件 的安装页。 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type PluginInstallKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'plugin-install': PluginInstallKey;
    }
}
export declare const inject: string[];
/**
 * 注册安装标签页。
 * @param ctx - 浏览器插件上下文。
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map