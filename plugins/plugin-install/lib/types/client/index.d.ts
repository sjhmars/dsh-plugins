/** 浏览器半：Plugins 配置页 的安装页。 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PluginInstallKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'plugin-install': PluginInstallKey;
    }
}
export declare const inject: string[];
/**
 * 注册本包的安装页面。
 * @param ctx - 浏览器插件上下文。
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map