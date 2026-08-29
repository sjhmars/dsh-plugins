/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Config as HappyBridgeConfig } from './types.ts';
export type { Config as HappyBridgeConfig, PairingStatus, RemoteGrant } from './types.ts';
/** Cordis plugin name. */
export declare const name = "happy-bridge";
/** Settings namespace keyed by the Plugins tab card. */
export declare const HAPPY_BRIDGE_NS: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Wait for the agent registry before mirroring sessions. */
export declare const inject: string[];
/** Validated plugin config. Illegal values fail at load. */
export declare const Config: Schema<HappyBridgeConfig>;
/**
 * Mount the Host half: settings namespace, Typert Remote, Happy relay.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export declare function apply(ctx: Context, config: HappyBridgeConfig): void;
//# sourceMappingURL=index.d.ts.map