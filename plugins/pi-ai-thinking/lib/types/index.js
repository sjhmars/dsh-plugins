/**
 * Automatically exposes thinking intensity controls for custom llm-pi-ai models
 * without modifying DeepSeek Harness or storing credentials.
 *
 * @module @sjhmars/pi-ai-thinking
 */
import Schema from '@deepseek-ai/schemastery';
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { buildThinkingOps } from "./patch.js";
const PI_AI_NAMESPACE = settingsNamespace('llm-pi-ai');
/** Validate plugin configuration and provide its safe default. */
export const Config = Schema.object({
    force: Schema.boolean().default(false),
});
/** Cordis plugin name. */
export const name = 'pi-ai-thinking';
/** The plugin reads and updates the registered settings service. */
export const inject = ['settings'];
/**
 * Add thinking capability declarations to the current llm-pi-ai user section.
 * A retry handles a user save that committed after this plugin read its revision.
 * @param ctx - Host context providing the settings service.
 * @param config - Validated plugin configuration.
 * @param retries - Remaining stale-revision retries.
 */
async function reconcile(ctx, config, retries) {
    const descriptor = ctx.settings.describe().find(candidate => candidate.ns === PI_AI_NAMESPACE);
    if (descriptor?.user === undefined)
        return;
    const ops = buildThinkingOps(descriptor.user, config.force);
    if (ops.length === 0)
        return;
    try {
        await ctx.settings.mutate(PI_AI_NAMESPACE, ops, descriptor.revision);
    }
    catch (error) {
        if (error instanceof SettingsConflictError && retries > 0) {
            await reconcile(ctx, config, retries - 1);
            return;
        }
        throw error;
    }
}
/** Log an automatic configuration failure without preventing Harness startup. */
function reportFailure(ctx, error) {
    ctx.logger.warn('pi-ai-thinking: 自动补齐模型思考档位失败');
    ctx.logger.warn(error);
}
/**
 * Reconcile custom models at startup and after their raw user section changes.
 * @param ctx - Host context providing settings events.
 * @param config - Validated plugin configuration.
 */
export function apply(ctx, config) {
    let active = true;
    let tail = Promise.resolve();
    const enqueue = () => {
        tail = tail
            .then(() => active ? reconcile(ctx, config, 1) : undefined)
            .catch((error) => {
            reportFailure(ctx, error);
        });
    };
    ctx.effect(() => () => {
        active = false;
    }, 'pi-ai-thinking: stop settings reconciliation');
    ctx.on('settings/document-updated', (namespace) => {
        if (namespace === PI_AI_NAMESPACE)
            enqueue();
    });
    enqueue();
}
export { buildThinkingOps, reasoningEffortsFor } from "./patch.js";
//# sourceMappingURL=index.js.map