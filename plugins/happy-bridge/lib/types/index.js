/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */
import Schema from '@deepseek-ai/schemastery';
import { HappyBridge } from "./bridge.js";
import { HappyBridgeService } from "./remote.js";
/** Cordis plugin name. */
export const name = 'happy-bridge';
/** Loader entry id used by the Plugins configuration page. */
export const HAPPY_BRIDGE_NS = 'happy-bridge';
/** Wait for the agent registry before mirroring sessions. */
export const inject = ['agents', 'sessionQuery'];
/** Validate editable fields before committing their live references. */
export const Config = Schema.object({
    enabled: Schema.boolean().default(true).volatile(),
    serverUrl: Schema.string().default('https://api.cluster-fluster.com').volatile(),
    appUrl: Schema.string().default('https://app.happy.engineering').volatile(),
    credentialDir: Schema.string().default('').volatile(),
    pairOnStart: Schema.boolean().default(true).volatile(),
    remoteGrant: Schema.union([
        Schema.const('watch'),
        Schema.const('chat'),
        Schema.const('approve'),
        Schema.const('full'),
    ]).default('approve').volatile(),
    questionChannel: Schema.union([
        Schema.const('communications'),
        Schema.const('permission'),
    ]).default('communications').volatile(),
});
/**
 * Mount the Typert Remote and Happy relay; live Config edits update the running bridge.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export function apply(ctx, config) {
    const service = new HappyBridgeService(ctx);
    const source = () => ({
        enabled: config.enabled.get(), serverUrl: config.serverUrl.get(), appUrl: config.appUrl.get(),
        credentialDir: config.credentialDir.get(), pairOnStart: config.pairOnStart.get(),
        remoteGrant: config.remoteGrant.get(), questionChannel: config.questionChannel.get(),
    });
    ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)); });
    const rebuild = () => {
        service.live?.dispose();
        const current = source();
        if (!current.enabled) {
            service.live = undefined;
            ctx.logger.info('happy-bridge: 已关闭');
            return;
        }
        const bridge = new HappyBridge(ctx, current, message => ctx.logger.info(`happy-bridge: ${message}`));
        service.live = bridge;
        void bridge.start().catch((error) => {
            ctx.logger.warn(`happy-bridge: 启动失败 ${error instanceof Error ? error.message : String(error)}`);
        });
    };
    ctx.on('loader/volatile-update', () => {
        const current = source();
        if (service.live?.acceptSettings(current) === true)
            return;
        rebuild();
    });
    ctx.effect(() => {
        rebuild();
        return () => {
            service.live?.dispose();
            service.live = undefined;
        };
    }, 'happy-bridge: runtime');
}
//# sourceMappingURL=index.js.map