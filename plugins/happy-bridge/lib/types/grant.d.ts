/** Remote-grant checks: what the phone is allowed to do. */
import type { Config, RemoteGrant } from './types.ts';
/**
 * Whether `actual` is at least as deep as `needed`.
 * @param actual - currently selected grant.
 * @param needed - minimum required grant.
 * @returns true when the phone may perform the action.
 */
export declare function grantAtLeast(actual: RemoteGrant, needed: RemoteGrant): boolean;
/** Claude-only permissionMode strings that must not be treated as dsh presets. */
export declare const CLAUDE_PERMISSION_MODES: ReadonlySet<string>;
/**
 * Decide how inbound `meta.permissionMode` maps onto a dsh preset.
 * @param mode - Happy message meta.permissionMode.
 * @param dshPresets - currently advertised preset names.
 * @returns `apply` with the preset, `ignore` for Claude-only values, or `unknown`.
 */
export declare function classifyPermissionMode(mode: string, dshPresets: readonly string[]): {
    kind: 'apply';
    preset: string;
} | {
    kind: 'ignore';
} | {
    kind: 'unknown';
};
/**
 * Split a Happy `meta.model` / spawn `modelMode` code into provider and model.
 * @param code - `provider/model`, Rig `provider:model`, or a bare model id.
 * @returns provider (empty when bare) and model.
 */
export declare function splitModelCode(code: string): {
    provider: string;
    model: string;
};
/**
 * Model code from a Happy inbound message (`meta.model` plus optional provider).
 * @param meta - Happy message meta object.
 * @returns `provider/model` when both are known, otherwise the raw model string.
 */
export declare function messageModelCode(meta: Record<string, unknown>): string | undefined;
/**
 * Effort from a Happy inbound message. Current App wire uses `effort`;
 * spawn and older clients send `effortLevel`.
 * @param meta - Happy message meta object.
 * @returns effort id, `null` when the field is explicitly cleared, or undefined when omitted.
 */
export declare function messageEffort(meta: Record<string, unknown>): string | null | undefined;
/**
 * Whether a settings write can land on the live bridge without disposing sockets.
 * Grant / pairOnStart changes take effect in place; URL or credential-dir
 * changes restart the relay.
 * @param previous - config the live bridge is using.
 * @param next - config just resolved from settings.
 */
export declare function sameHappyRuntime(previous: Config, next: Config): boolean;
/** Provider / model / effort triple the phone and Host picker share. */
export interface ModelOverrideFields {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/**
 * Whether two overrides name the same Host selection.
 * @param previous - last remembered override, if any.
 * @param next - candidate override.
 */
export declare function sameModelOverride(previous: ModelOverrideFields | undefined, next: ModelOverrideFields): boolean;
/**
 * Model and effort Happy stores on session metadata.
 * @param meta - decrypted Happy session metadata object.
 * @returns the current model and/or effort, or undefined when neither is set.
 */
export declare function catalogModelPick(meta: Record<string, unknown>): CatalogModelPick | undefined;
/** Model and/or effort Happy wrote into session metadata. */
export interface CatalogModelPick {
    model?: string;
    effort?: string | null;
}
/**
 * Whether an inbound Happy catalog is the same pick we last published.
 * Slash and colon provider/model codes compare as one pair.
 * @param previous - last pick we wrote, if any.
 * @param next - pick decoded from inbound metadata.
 * @returns true when the inbound pick is our own echo.
 */
export declare function sameCatalogPick(previous: CatalogModelPick | undefined, next: CatalogModelPick): boolean;
//# sourceMappingURL=grant.d.ts.map