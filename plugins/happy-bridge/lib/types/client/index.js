/** Browser half: Happy remote configuration on its Plugins bundle page. */
import { HappyBridgeCard, } from "./HappyBridgeCard.js";
import { en, NS, zh } from "./locales.js";
/** Required client services. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'configForms'];
/**
 * Register the Happy remote page using its Loader entry configuration.
 * @param ctx - browser plugin context.
 */
export function apply(ctx) {
    const connection = ctx.get('connection');
    const scope = ctx.configForms.get('happy-bridge');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'happy-bridge: browser dictionaries');
    const rpc = async (method) => {
        const result = await connection.rpc.call('/api', `happyBridge/${method}`, { args: {} });
        return unwrap(result);
    };
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: '@sjhmars/happy-bridge',
        locale: NS,
        inject: () => ({
            getStatus: () => rpc('getStatus'),
            startPairing: () => rpc('startPairing'),
            disconnect: () => rpc('disconnect'),
            rePair: () => rpc('rePair'),
            setGrant: (grant) => scope.set('remoteGrant', grant),
            setEnabled: (enabled) => scope.set('enabled', enabled),
            hooks: { happySettings: scope },
        }),
    }, HappyBridgeCard));
}
function unwrap(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message);
}
//# sourceMappingURL=index.js.map