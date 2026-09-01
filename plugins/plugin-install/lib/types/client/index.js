/** 浏览器半：设置 → 插件 的安装页。 */
import { PluginInstallTab } from "./PluginInstallTab.js";
import { en, NS, zh } from "./locales.js";
export const inject = ['slots', 'locale'];
/**
 * One same-origin GET to the plugin's exact Fetch routes (the seam allows
 * GET/HEAD only; parameters ride the query string). The physical carrier
 * (web route lane or the desktop IPC bridge) owns trust policy.
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
 * 注册安装标签页。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-install: 文案');
    const injected = () => ({
        target: () => get('/api/pluginInstall/target'),
        install: (packageName) => get('/api/pluginInstall/install', { package: packageName }),
    });
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'install',
        order: 20,
        label: () => ctx.locale.bind(NS)('tab'),
        locale: NS,
        inject: injected,
    }, PluginInstallTab));
}
//# sourceMappingURL=index.js.map