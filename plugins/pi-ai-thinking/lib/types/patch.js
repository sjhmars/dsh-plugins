/**
 * Builds minimal user-layer edits that advertise thinking capabilities for
 * custom llm-pi-ai model rows.
 */
/** The four intensity ids exposed by DeepSeek Harness for generic custom models. */
export const THINKING_EFFORTS = ['off', 'low', 'high', 'max'];
const SUPPORTED_PROTOCOLS = [
    'openai-completions',
    'openai-responses',
    'anthropic-messages',
];
const COMPLETIONS_EFFORTS = {
    off: null,
    low: 'low',
    high: 'high',
    max: 'max',
};
const RESPONSES_EFFORTS = {
    off: 'none',
    low: 'low',
    high: 'high',
    max: 'max',
};
const ANTHROPIC_EFFORTS = {
    off: null,
    low: 'low',
    high: 'high',
    max: 'max',
};
const ANTHROPIC_BUDGETS = {
    low: 2_048,
    high: 16_384,
};
/** Whether a configuration value is a plain JSON object. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Whether a provider protocol has a pi-ai thinking preset. */
function isThinkingProtocol(value) {
    return typeof value === 'string' && SUPPORTED_PROTOCOLS.includes(value);
}
/** Return the wire spelling map required for one protocol. */
export function reasoningEffortsFor(protocol) {
    switch (protocol) {
        case 'openai-completions': return COMPLETIONS_EFFORTS;
        case 'openai-responses': return RESPONSES_EFFORTS;
        case 'anthropic-messages': return ANTHROPIC_EFFORTS;
    }
}
/** Build a complete model list while retaining every non-thinking model field. */
function patchedModels(models, protocol, force) {
    let changed = false;
    const efforts = reasoningEffortsFor(protocol);
    const next = models.map((model) => {
        if (!isRecord(model) || typeof model.id !== 'string')
            return model;
        const typed = model;
        if (!force && typed.reasoningEfforts !== undefined)
            return model;
        changed = true;
        return { ...typed, reasoningEfforts: efforts };
    });
    return changed ? next : undefined;
}
/** Add missing Anthropic token-budget values without replacing explicit user choices. */
function patchedAnthropicBudgets(provider) {
    const current = isRecord(provider.thinkingBudgets) ? provider.thinkingBudgets : {};
    const next = {
        ...current,
        ...current.low === undefined ? { low: ANTHROPIC_BUDGETS.low } : {},
        ...current.high === undefined ? { high: ANTHROPIC_BUDGETS.high } : {},
    };
    return current.low === next.low && current.high === next.high ? undefined : next;
}
/**
 * Build path edits for all user-created custom providers that speak a supported
 * protocol. Existing reasoning capabilities stay untouched unless `force` is set.
 * @param section - raw llm-pi-ai user section from settings.describe().
 * @param force - whether to replace a model's existing reasoning effort map.
 * @returns minimal updates that preserve every unrelated user setting.
 */
export function buildThinkingOps(section, force) {
    const settings = section;
    if (!isRecord(settings) || !isRecord(settings.providers))
        return [];
    const ops = [];
    for (const [route, profile] of Object.entries(settings.providers)) {
        if (!isRecord(profile))
            continue;
        const provider = profile;
        if (!isThinkingProtocol(provider.api) || !Array.isArray(provider.models))
            continue;
        const models = patchedModels(provider.models, provider.api, force);
        if (models !== undefined) {
            ops.push({ op: 'set', path: ['providers', route, 'models'], value: models });
        }
        if (provider.reasoning === undefined) {
            ops.push({ op: 'set', path: ['providers', route, 'reasoning'], value: 'off' });
        }
        if (provider.api !== 'anthropic-messages')
            continue;
        const budgets = patchedAnthropicBudgets(provider);
        if (budgets !== undefined) {
            ops.push({ op: 'set', path: ['providers', route, 'thinkingBudgets'], value: budgets });
        }
    }
    return ops;
}
//# sourceMappingURL=patch.js.map