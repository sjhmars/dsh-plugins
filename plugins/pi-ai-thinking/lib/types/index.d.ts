/**
 * Automatically exposes thinking intensity controls for custom llm-pi-ai models
 * without modifying DeepSeek Harness or storing credentials.
 *
 * @module @sjhmars/pi-ai-thinking
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
/** Plugin configuration. */
export interface Config {
    /** Replace existing model reasoning maps instead of preserving them. */
    force: boolean;
}
/** Validate plugin configuration and provide its safe default. */
export declare const Config: Schema<Config>;
/** Cordis plugin name. */
export declare const name = "pi-ai-thinking";
/** The plugin reads and updates the registered settings service. */
export declare const inject: string[];
/**
 * Reconcile custom models at startup and after their raw user section changes.
 * @param ctx - Host context providing settings events.
 * @param config - Validated plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
export { buildThinkingOps, reasoningEffortsFor } from './patch.ts';
export type { CustomModel, CustomProvider, PiAiThinkingProtocol, PiAiUserSettings } from './types.ts';
//# sourceMappingURL=index.d.ts.map