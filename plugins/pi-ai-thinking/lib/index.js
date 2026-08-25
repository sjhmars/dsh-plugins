import Schema from "@deepseek-ai/schemastery";
import { SettingsConflictError, settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region lib/types/patch.js
const SUPPORTED_PROTOCOLS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages"
];
const COMPLETIONS_EFFORTS = {
	off: null,
	low: "low",
	high: "high",
	max: "max"
};
const RESPONSES_EFFORTS = {
	off: "none",
	low: "low",
	high: "high",
	max: "max"
};
const ANTHROPIC_EFFORTS = {
	off: null,
	low: "low",
	high: "high",
	max: "max"
};
const ANTHROPIC_BUDGETS = {
	low: 2048,
	high: 16384
};
/** Whether a configuration value is a plain JSON object. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Whether a provider protocol has a pi-ai thinking preset. */
function isThinkingProtocol(value) {
	return typeof value === "string" && SUPPORTED_PROTOCOLS.includes(value);
}
/** Return the wire spelling map required for one protocol. */
function reasoningEffortsFor(protocol) {
	switch (protocol) {
		case "openai-completions": return COMPLETIONS_EFFORTS;
		case "openai-responses": return RESPONSES_EFFORTS;
		case "anthropic-messages": return ANTHROPIC_EFFORTS;
	}
}
/** Build a complete model list while retaining every non-thinking model field. */
function patchedModels(models, protocol, force) {
	let changed = false;
	const efforts = reasoningEffortsFor(protocol);
	const next = models.map((model) => {
		if (!isRecord(model) || typeof model.id !== "string") return model;
		const typed = model;
		if (!force && typed.reasoningEfforts !== void 0) return model;
		changed = true;
		return {
			...typed,
			reasoningEfforts: efforts
		};
	});
	return changed ? next : void 0;
}
/** Add missing Anthropic token-budget values without replacing explicit user choices. */
function patchedAnthropicBudgets(provider) {
	const current = isRecord(provider.thinkingBudgets) ? provider.thinkingBudgets : {};
	const next = {
		...current,
		...current.low === void 0 ? { low: ANTHROPIC_BUDGETS.low } : {},
		...current.high === void 0 ? { high: ANTHROPIC_BUDGETS.high } : {}
	};
	return current.low === next.low && current.high === next.high ? void 0 : next;
}
/**
* Build path edits for all user-created custom providers that speak a supported
* protocol. Existing reasoning capabilities stay untouched unless `force` is set.
* @param section - raw llm-pi-ai user section from settings.describe().
* @param force - whether to replace a model's existing reasoning effort map.
* @returns minimal updates that preserve every unrelated user setting.
*/
function buildThinkingOps(section, force) {
	const settings = section;
	if (!isRecord(settings) || !isRecord(settings.providers)) return [];
	const ops = [];
	for (const [route, profile] of Object.entries(settings.providers)) {
		if (!isRecord(profile)) continue;
		const provider = profile;
		if (!isThinkingProtocol(provider.api) || !Array.isArray(provider.models)) continue;
		const models = patchedModels(provider.models, provider.api, force);
		if (models !== void 0) ops.push({
			op: "set",
			path: [
				"providers",
				route,
				"models"
			],
			value: models
		});
		if (provider.reasoning === void 0) ops.push({
			op: "set",
			path: [
				"providers",
				route,
				"reasoning"
			],
			value: "off"
		});
		if (provider.api !== "anthropic-messages") continue;
		const budgets = patchedAnthropicBudgets(provider);
		if (budgets !== void 0) ops.push({
			op: "set",
			path: [
				"providers",
				route,
				"thinkingBudgets"
			],
			value: budgets
		});
	}
	return ops;
}
//#endregion
//#region lib/types/index.js
/**
* Automatically exposes thinking intensity controls for custom llm-pi-ai models
* without modifying DeepSeek Harness or storing credentials.
*
* @module @sjhmars/pi-ai-thinking
*/
const PI_AI_NAMESPACE = settingsNamespace("llm-pi-ai");
/** Validate plugin configuration and provide its safe default. */
const Config = Schema.object({ force: Schema.boolean().default(false) });
/** Cordis plugin name. */
const name = "pi-ai-thinking";
/** The plugin reads and updates the registered settings service. */
const inject = ["settings"];
/**
* Add thinking capability declarations to the current llm-pi-ai user section.
* A retry handles a user save that committed after this plugin read its revision.
* @param ctx - Host context providing the settings service.
* @param config - Validated plugin configuration.
* @param retries - Remaining stale-revision retries.
*/
async function reconcile(ctx, config, retries) {
	const descriptor = ctx.settings.describe().find((candidate) => candidate.ns === PI_AI_NAMESPACE);
	if (descriptor?.user === void 0) return;
	const ops = buildThinkingOps(descriptor.user, config.force);
	if (ops.length === 0) return;
	try {
		await ctx.settings.mutate(PI_AI_NAMESPACE, ops, descriptor.revision);
	} catch (error) {
		if (error instanceof SettingsConflictError && retries > 0) {
			await reconcile(ctx, config, retries - 1);
			return;
		}
		throw error;
	}
}
/** Log an automatic configuration failure without preventing Harness startup. */
function reportFailure(ctx, error) {
	ctx.logger.warn("pi-ai-thinking: 自动补齐模型思考档位失败");
	ctx.logger.warn(error);
}
/**
* Reconcile custom models at startup and after their raw user section changes.
* @param ctx - Host context providing settings events.
* @param config - Validated plugin configuration.
*/
function apply(ctx, config) {
	let active = true;
	let tail = Promise.resolve();
	const enqueue = () => {
		tail = tail.then(() => active ? reconcile(ctx, config, 1) : void 0).catch((error) => {
			reportFailure(ctx, error);
		});
	};
	ctx.effect(() => () => {
		active = false;
	}, "pi-ai-thinking: stop settings reconciliation");
	ctx.on("settings/document-updated", (namespace) => {
		if (namespace === PI_AI_NAMESPACE) enqueue();
	});
	enqueue();
}
//#endregion
export { Config, apply, buildThinkingOps, inject, name, reasoningEffortsFor };
