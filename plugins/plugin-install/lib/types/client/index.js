/** 浏览器半：Plugins 配置页 的安装页。 */
import { PluginInstallTab } from "./PluginInstallTab.js";
import { en, NS, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
/**
 * Call the installer's same-origin GET routes with parameters in the query string.
 * The Web route or Desktop IPC carrier owns admission and authentication.
 * @param path - route path below /api.
 * @param query - query parameters.
 * @returns the parsed JSON response.
 */
async function get(path, query = {}) {
    const url = Object.keys(query).length === 0 ? path : `${path}?${new URLSearchParams(query).toString()}`;
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`plugin-install: HTTP ${String(response.status)}`);
    return await response.json();
}
/**
 * 注册本包的安装页面。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-install: 文案');
    const injected = () => ({
        target: () => get('/api/pluginInstall/target'),
        install: (packageName) => get('/api/pluginInstall/install', { package: packageName }),
    });
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: '@sjhmars/plugin-install',
        locale: NS,
        inject: injected,
    }, PluginInstallTab));
}
//# sourceMappingURL=index.js.map