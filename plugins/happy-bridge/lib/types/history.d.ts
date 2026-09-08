/** Fold a session label and replayable chat items from the harness log. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment/types';
/** Minimal log event the history fold reads. */
export interface HistoryEvent {
    type: string;
    time?: number;
    data: unknown;
}
/** One Happy envelope to emit when filling an empty mirrored session. */
export type HistoryItem = {
    kind: 'turn-start';
    time: number;
} | {
    kind: 'turn-end';
    time: number;
    status: 'completed' | 'failed' | 'cancelled';
} | {
    kind: 'user';
    time: number;
    text: string;
    images: ImageAttachmentRef[];
} | {
    kind: 'assistant';
    time: number;
    text: string;
} | {
    kind: 'tool-start';
    time: number;
    call: string;
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
} | {
    kind: 'tool-end';
    time: number;
    call: string;
};
/**
 * Happy session-list title: logged title, else first human prompt, else the
 * same "新会话" the web sidebar uses. Never the folder name — that belongs
 * on Happy's project-group header via `metadata.path`.
 * @param events - session log.
 * @returns non-empty label.
 */
export declare function sessionLabel(events: readonly HistoryEvent[]): string;
/**
 * Same blank rule as the web sidebar: no `turn/start` yet means a
 * provisional New Session placeholder, not a conversation.
 * @param events - session log.
 * @returns true when the sidebar would hide this row unless it is selected.
 */
export declare function isBlankSession(events: readonly HistoryEvent[]): boolean;
/**
 * Visible user/assistant/tool turns to copy onto an empty Happy session.
 * Plugin-injected user rows stay off the phone. Assistant chunks are skipped
 * in favor of the committed assistant/message. Reasoning blocks become a
 * collapsible Think card; tool-call blocks become Happy-known tool cards.
 * @param events - session log in seq order.
 * @returns replay items in log order.
 */
export declare function historyItems(events: readonly HistoryEvent[]): HistoryItem[];
/**
 * Visible human prompt from a `user/message` log event.
 * Plugin injects and tool-result rows return empty.
 * @param event - one session log event.
 * @returns trimmed concatenated text blocks, or `''`.
 */
export declare function visibleUserText(event: HistoryEvent): string;
/**
 * Image blocks from a human `user/message`. Plugin injects stay off the phone.
 * @param event - one session log event.
 * @returns attachment refs in content order.
 */
export declare function visibleUserImages(event: HistoryEvent): ImageAttachmentRef[];
/** One committed assistant content block, already folded for Happy. */
export type AssistantPart = {
    kind: 'thinking';
    text: string;
} | {
    kind: 'text';
    text: string;
} | {
    kind: 'tool';
    call: string;
    name: string;
    args: Record<string, unknown>;
};
/**
 * Walk committed assistant content in log order: reasoning, visible text, tool calls.
 * @param content - `assistant/message` content array.
 * @returns Happy-ready parts, skipping empty text.
 */
export declare function assistantParts(content: unknown): AssistantPart[];
/**
 * Happy App hides `thinking: true` text and tools named `think` /
 * `CodexReasoning` / `GeminiReasoning`. Names starting `mcp__` become a
 * one-line MCP row with no body. `Note` is unknown to that table, so it
 * stays a tappable card; full text rides in `args.text`.
 */
export declare const THINK_TOOL_NAME = "Note";
/** One Happy tool-call-start payload. */
export interface HappyToolCard {
    name: string;
    title: string;
    description: string;
    args: Record<string, unknown>;
}
/**
 * Collapsed Think row label. Happy compact rows show `description`.
 * @param text - accumulated or committed reasoning.
 * @returns `Think` or `Think ·` plus the first line.
 */
export declare function thinkLabel(text: string): string;
/**
 * Think card for a finished reasoning block. Full text rides in `args`
 * so a tap opens the detail page; the row itself stays one line.
 * @param text - committed reasoning.
 */
export declare function thinkCard(text: string): HappyToolCard;
/**
 * Map a dsh tool onto a Happy card. Compact rows only paint `description`,
 * so that field is `Grep · pattern` (tool name plus the web summary).
 * `name` stays PascalCase so Happy can still pick icons.
 * @param name - registered dsh tool name.
 * @param args - parsed tool arguments.
 */
export declare function happyTool(name: string, args: Record<string, unknown>): HappyToolCard;
/**
 * Web-style one-line label used in tests: `Grep · pattern`.
 * @param name - registered tool name.
 * @param args - parsed tool arguments.
 */
export declare function toolTitle(name: string, args: Record<string, unknown>): string;
/**
 * Preset the session actually runs: last `agent-preset/selected`, else the
 * creation-header value. Phone wake must mount this same composition, not the
 * header alone — a blank session may have switched before its first turn.
 * @param events - session log, oldest first.
 * @param headerAgentPreset - `header.agentPreset` from inspect.
 */
export declare function resolveSessionPreset(events: readonly HistoryEvent[], headerAgentPreset?: string): string | undefined;
/** Provider, model, and optional effort used to start a phone-woken turn. */
export interface WakeModelSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/**
 * Same precedence Host `selectionFor` uses: first usable provider/model
 * wins; a later candidate may only fill a missing thinking level when it is
 * that same model. Empty provider/model pairs are skipped.
 * @param primary - process pick, else `session.requestHeader()?.config`.
 * @param fallbacks - remaining sources, usually the log then `agentDefaultModel`.
 */
export declare function wakeModelSelection(primary: WakeModelSelection | undefined, ...fallbacks: Array<WakeModelSelection | undefined>): WakeModelSelection | undefined;
/**
 * Effort the first web / phone-spawn / phone-wake request should send.
 * Current pick wins; otherwise a preferred (web) value or the model's
 * advertised default, but only when the model lists that id.
 * Written onto the Host picker via `selectModel`; requests then read that bar.
 * @param currentEffort - already chosen effort, if any.
 * @param preferred - web picker effort to reuse when the model accepts it.
 * @param modelDefault - `resolveModelInfo().reasoning.defaultEffort`.
 * @param supported - advertised effort ids; empty/absent means any string is accepted.
 */
export declare function pinWakeEffort(currentEffort: string | undefined, preferred: string | undefined, modelDefault: string | undefined, supported: readonly string[] | undefined): string | undefined;
/**
 * Sidebar sessions that should stay linked on the phone: every workspace
 * membership except the registry-global archive set.
 * @param workspaces - `workspaceRegistry.list()` projections.
 * @param archived - `workspaceRegistry.archivedSessionIds`.
 */
export declare function unarchivedSessionIds(workspaces: readonly {
    sessionIds: readonly string[];
}[], archived: readonly string[]): string[];
/**
 * Sidebar ids still eligible for a Happy socket: not archived on the web,
 * and not dismissed from the phone.
 * @param wanted - {@link unarchivedSessionIds} result.
 * @param dismissed - phone stop-session / archive ids.
 * @returns ids that should have a live Happy socket.
 */
export declare function mirrorTargets(wanted: readonly string[], dismissed: ReadonlySet<string>): string[];
//# sourceMappingURL=history.d.ts.map