/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */
import Schema from '@deepseek-ai/schemastery';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { HappyBridge } from "./bridge.js";
import { HappyBridgeService } from "./remote.js";
/** Cordis plugin name. */
export const name = 'happy-bridge';
/** Settings namespace keyed by the Plugins tab card. */
export const HAPPY_BRIDGE_NS = settingsNamespace('happy-bridge');
/** Wait for the agent registry before mirroring sessions. */
export const inject = ['agents'];
/** Validated plugin config. Illegal values fail at load. */
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    serverUrl: Schema.string().default('https://api.cluster-fluster.com'),
    appUrl: Schema.string().default('https://app.happy.engineering'),
    credentialDir: Schema.string().default(''),
    pairOnStart: Schema.boolean().default(true),
    remoteGrant: Schema.union([
        Schema.const('watch'),
        Schema.const('chat'),
        Schema.const('approve'),
        Schema.const('full'),
    ]).default('approve'),
    questionChannel: Schema.union([
        Schema.const('communications'),
        Schema.const('permission'),
    ]).default('communications'),
});
/**
 * Mount the Host half: settings namespace, Typert Remote, Happy relay.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export function apply(ctx, config) {
    const service = new HappyBridgeService(ctx);
    let source = () => config;
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
    installSettingsSection(ctx, HAPPY_BRIDGE_NS, Config, config, {
        setSource: (current) => { source = current; },
        onChange: () => {
            const current = source();
            if (service.live?.acceptSettings(current) === true)
                return;
            rebuild();
        },
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