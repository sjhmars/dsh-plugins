/** Remote-grant checks: what the phone is allowed to do. */
const ORDER = ['watch', 'chat', 'approve', 'full'];
/**
 * Whether `actual` is at least as deep as `needed`.
 * @param actual - currently selected grant.
 * @param needed - minimum required grant.
 * @returns true when the phone may perform the action.
 */
export function grantAtLeast(actual, needed) {
    return ORDER.indexOf(actual) >= ORDER.indexOf(needed);
}
/** Claude-only permissionMode strings that must not be treated as dsh presets. */
export const CLAUDE_PERMISSION_MODES = new Set([
    'default',
    'acceptEdits',
    'bypassPermissions',
    'dontAsk',
    'plan',
    'read-only',
    'safe-yolo',
    'yolo',
]);
/**
 * Decide how inbound `meta.permissionMode` maps onto a dsh preset.
 * @param mode - Happy message meta.permissionMode.
 * @param dshPresets - currently advertised preset names.
 * @returns `apply` with the preset, `ignore` for Claude-only values, or `unknown`.
 */
export function classifyPermissionMode(mode, dshPresets) {
    if (dshPresets.includes(mode))
        return { kind: 'apply', preset: mode };
    if (CLAUDE_PERMISSION_MODES.has(mode))
        return { kind: 'ignore' };
    return { kind: 'unknown' };
}
/**
 * Split a Happy `meta.model` / spawn `modelMode` code into provider and model.
 * @param code - `provider/model`, Rig `provider:model`, or a bare model id.
 * @returns provider (empty when bare) and model.
 */
export function splitModelCode(code) {
    const slash = code.indexOf('/');
    if (slash > 0)
        return { provider: code.slice(0, slash), model: code.slice(slash + 1) };
    const colon = code.indexOf(':');
    if (colon > 0)
        return { provider: code.slice(0, colon), model: code.slice(colon + 1) };
    return { provider: '', model: code };
}
/**
 * Model code from a Happy inbound message (`meta.model` plus optional provider).
 * @param meta - Happy message meta object.
 * @returns `provider/model` when both are known, otherwise the raw model string.
 */
export function messageModelCode(meta) {
    const model = meta.model;
    if (typeof model !== 'string' || model === '')
        return undefined;
    const provider = typeof meta.modelProviderId === 'string' ? meta.modelProviderId : '';
    if (provider !== '' && !model.includes('/') && !model.includes(':'))
        return `${provider}/${model}`;
    return model;
}
/**
 * Effort from a Happy inbound message. Current App wire uses `effort`;
 * spawn and older clients send `effortLevel`.
 * @param meta - Happy message meta object.
 * @returns effort id, `null` when the field is explicitly cleared, or undefined when omitted.
 */
export function messageEffort(meta) {
    if ('effort' in meta) {
        if (meta.effort === null)
            return null;
        if (typeof meta.effort === 'string')
            return meta.effort;
    }
    if ('effortLevel' in meta) {
        if (meta.effortLevel === null)
            return null;
        if (typeof meta.effortLevel === 'string')
            return meta.effortLevel;
    }
    return undefined;
}
/**
 * Whether a settings write can land on the live bridge without disposing sockets.
 * Grant / pairOnStart changes take effect in place; URL or credential-dir
 * changes restart the relay.
 * @param previous - config the live bridge is using.
 * @param next - config just resolved from settings.
 */
export function sameHappyRuntime(previous, next) {
    return previous.enabled === next.enabled
        && previous.serverUrl === next.serverUrl
        && previous.appUrl === next.appUrl
        && previous.credentialDir === next.credentialDir;
}
/**
 * Whether two overrides name the same Host selection.
 * @param previous - last remembered override, if any.
 * @param next - candidate override.
 */
export function sameModelOverride(previous, next) {
    return previous !== undefined
        && previous.provider === next.provider
        && previous.model === next.model
        && previous.reasoningEffort === next.reasoningEffort;
}
/**
 * Model and effort Happy stores on session metadata.
 * @param meta - decrypted Happy session metadata object.
 * @returns the current model and/or effort, or undefined when neither is set.
 */
export function catalogModelPick(meta) {
    const model = catalogModelCode(meta);
    const effort = catalogEffort(meta);
    if (model === undefined && effort === undefined)
        return undefined;
    return {
        ...(model === undefined ? {} : { model }),
        ...(effort === undefined ? {} : { effort }),
    };
}
/**
 * Whether an inbound Happy catalog is the same pick we last published.
 * Slash and colon provider/model codes compare as one pair.
 * @param previous - last pick we wrote, if any.
 * @param next - pick decoded from inbound metadata.
 * @returns true when the inbound pick is our own echo.
 */
export function sameCatalogPick(previous, next) {
    if (previous === undefined)
        return false;
    return catalogPickKey(previous) === catalogPickKey(next);
}
/**
 * Whether inbound `meta.model` is the pick we last published.
 * The App often echoes only `currentModelCode` (bare id) on a chat line,
 * while we publish `provider:id`; treating that as a user switch would
 * lock the web composer onto the catalog default (DeepSeek V4).
 * @param published - last pick we wrote, if any.
 * @param inbound - model code from the inbound message.
 * @returns true when the inbound model is our own echo.
 */
export function isPublishedModelEcho(published, inbound) {
    if (published?.model === undefined)
        return false;
    if (sameCatalogPick({ model: published.model }, { model: inbound }))
        return true;
    const publishedSplit = splitModelCode(published.model);
    const inboundSplit = splitModelCode(inbound);
    return inboundSplit.provider === '' && inboundSplit.model === publishedSplit.model;
}
function catalogPickKey(pick) {
    const split = pick.model === undefined ? undefined : splitModelCode(pick.model);
    const model = split === undefined
        ? ''
        : split.provider === ''
            ? split.model
            : `${split.provider}/${split.model}`;
    const effort = pick.effort === undefined ? '' : pick.effort === null ? 'null' : pick.effort;
    return `${model}\0${effort}`;
}
function catalogModelCode(meta) {
    const mode = meta.modelMode;
    if (typeof mode === 'string' && mode !== '')
        return mode;
    const id = meta.currentModelCode;
    if (typeof id !== 'string' || id === '')
        return undefined;
    const provider = typeof meta.currentModelProviderId === 'string' ? meta.currentModelProviderId : '';
    if (provider !== '' && !id.includes('/') && !id.includes(':'))
        return `${provider}/${id}`;
    return id;
}
function catalogEffort(meta) {
    if (meta.effortLevel === null)
        return null;
    if (typeof meta.effortLevel === 'string')
        return meta.effortLevel;
    if (meta.currentThoughtLevelCode === null)
        return null;
    if (typeof meta.currentThoughtLevelCode === 'string')
        return meta.currentThoughtLevelCode;
    const reasoning = meta.reasoning;
    if (reasoning !== null && typeof reasoning === 'object' && !Array.isArray(reasoning)) {
        const current = reasoning.current;
        if (current === null)
            return null;
        if (typeof current === 'string')
            return current;
    }
    return undefined;
}
//# sourceMappingURL=grant.js.map