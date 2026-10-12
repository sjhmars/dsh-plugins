/**
 * Host half of Happy remote control: pair a running dsh web/desktop client
 * with Happy App so the phone drives the same harness sessions.
 * @module @sjhmars/happy-bridge
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Config as HappyBridgeConfig } from './types.ts';
export type { Config as HappyBridgeConfig, PairingStatus, RemoteGrant } from './types.ts';
/** Cordis plugin name. */
export declare const name = "happy-bridge";
/** Loader entry id used by the Plugins configuration page. */
export declare const HAPPY_BRIDGE_NS = "happy-bridge";
/** Wait for the agent registry before mirroring sessions. */
export declare const inject: string[];
/** Live references supplied by the Loader for this plugin instance. */
export type Config = {
    [K in keyof HappyBridgeConfig]: Volatile<HappyBridgeConfig[K]>;
};
/** Validate editable fields before committing their live references. */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    serverUrl: Schema<string, string, "volatile-defined">;
    appUrl: Schema<string, string, "volatile-defined">;
    credentialDir: Schema<string, string, "volatile-defined">;
    pairOnStart: Schema<boolean, boolean, "volatile-defined">;
    remoteGrant: Schema<"watch" | "chat" | "approve" | "full", "watch" | "chat" | "approve" | "full", "volatile-defined">;
    questionChannel: Schema<"communications" | "permission", "communications" | "permission", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    serverUrl: Schema<string, string, "volatile-defined">;
    appUrl: Schema<string, string, "volatile-defined">;
    credentialDir: Schema<string, string, "volatile-defined">;
    pairOnStart: Schema<boolean, boolean, "volatile-defined">;
    remoteGrant: Schema<"watch" | "chat" | "approve" | "full", "watch" | "chat" | "approve" | "full", "volatile-defined">;
    questionChannel: Schema<"communications" | "permission", "communications" | "permission", "volatile-defined">;
}>>, "plain">;
/**
 * Mount the Typert Remote and Happy relay; live Config edits update the running bridge.
 * @param ctx - Host context.
 * @param config - composition entry config.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map