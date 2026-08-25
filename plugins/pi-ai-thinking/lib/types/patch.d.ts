/**
 * Builds minimal user-layer edits that advertise thinking capabilities for
 * custom llm-pi-ai model rows.
 */
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings';
import type { PiAiThinkingProtocol } from './types.ts';
/** The four intensity ids exposed by DeepSeek Harness for generic custom models. */
export declare const THINKING_EFFORTS: readonly ["off", "low", "high", "max"];
/** Return the wire spelling map required for one protocol. */
export declare function reasoningEffortsFor(protocol: PiAiThinkingProtocol): Readonly<Record<string, string | null>>;
/**
 * Build path edits for all user-created custom providers that speak a supported
 * protocol. Existing reasoning capabilities stay untouched unless `force` is set.
 * @param section - raw llm-pi-ai user section from settings.describe().
 * @param force - whether to replace a model's existing reasoning effort map.
 * @returns minimal updates that preserve every unrelated user setting.
 */
export declare function buildThinkingOps(section: unknown, force: boolean): SettingsPathOp[];
//# sourceMappingURL=patch.d.ts.map