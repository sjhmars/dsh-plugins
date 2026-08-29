/** 浏览器半：设置 → 插件 的安装页。 */
import { PluginInstallTab } from "./PluginInstallTab.js";
import { en, NS, zh } from "./locales.js";
export const inject = ['slots', 'locale', 'connection'];
/**
 * 注册安装标签页。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx) {
    const connection = ctx.get('connection');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-install: 文案');
    const injected = () => ({
        target: async () => {
            const result = await connection.rpc.call('/api', 'pluginInstall/target', { args: {} });
            return unwrap(result);
        },
        install: async (packageName) => {
            const result = await connection.rpc.call('/api', 'pluginInstall/install', { args: { packageName } });
            return unwrap(result);
        },
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
function unwrap(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
//# sourceMappingURL=index.js.map