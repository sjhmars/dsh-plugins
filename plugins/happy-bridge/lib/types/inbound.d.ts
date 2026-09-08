/** Classify inbound Happy user text as a registered slash command or ordinary chat. */
import type { CommunicationRpc, PermissionRpc } from './types.ts';
/** Normalized inbound payload from a decrypted Happy message. */
export type HappyInbound = {
    kind: 'text';
    text: string;
    meta: Record<string, unknown>;
} | {
    kind: 'file';
    ref: string;
    name: string;
    mimeType?: string;
    meta: Record<string, unknown>;
};
/**
 * Read a user text or file event from a decrypted Happy payload.
 * The App wraps file events as `{ role: 'session', content: { type: 'session', data: { ev } } }`.
 * happy-wire envelopes put `ev` directly on `content`. Chat text from the phone
 * is still `{ role: 'user', content: { type: 'text' } }`.
 * @param plain - decrypted socket payload.
 * @returns inbound chat or file, or `undefined` when the payload is not user input.
 */
export declare function parseHappyInbound(plain: unknown): HappyInbound | undefined;
/**
 * Parse a candidate slash line the same way `dsh-commands` `parseCommand` does.
 * @param line - complete user text.
 * @returns name + rawInput, or `undefined` when the line is not a command.
 */
export declare function parseSlashLine(line: string): {
    name: string;
    rawInput: string;
} | undefined;
/**
 * Decide whether inbound phone text should run as a command or as followup.
 * Unknown `/name` stays chat so user-invocable skills still inject.
 * @param line - complete user text.
 * @param commandNames - registered command names without the leading slash.
 * @returns `command` when the whole line is a registered command, otherwise `chat`.
 */
export declare function classifyInboundText(line: string, commandNames: ReadonlySet<string>): 'command' | 'chat';
/**
 * Translate Happy AskUserQuestion `answers` (`{ [question text]: "a, b" }`)
 * back into harness `{ id, selected }` rows.
 * @param answers - permission RPC `updatedInput.answers`.
 * @param questions - original harness questions in order.
 * @returns selected labels keyed by question id.
 */
export declare function answersFromHappy(answers: Record<string, string> | undefined, questions: readonly {
    id: string;
    question: string;
}[]): {
    id: string;
    selected: string[];
}[];
/**
 * Fill every still-open question with the typed chat line as `custom`.
 * @param questions - harness questions in order.
 * @param text - the App composer line.
 * @returns one answer row per question.
 */
export declare function customAnswersFromText(questions: readonly {
    id: string;
}[], text: string): {
    id: string;
    selected: [];
    custom: string;
}[];
/**
 * The option label that declines a plan-review question.
 * @param question - first question of a plan-review `ask`.
 * @returns the non-approve option label, or Keep planning.
 */
export declare function planReviewDeclineLabel(question: {
    intent?: {
        kind: string;
        approve: string;
    };
    options?: readonly {
        label: string;
    }[];
}): string;
/**
 * Decode a Happy `permission` RPC body.
 * @param params - decrypted RPC params.
 * @returns id, approved flag, optional Always-allow decision, and answers.
 */
export declare function parsePermissionRpc(params: unknown): PermissionRpc;
/**
 * Synthetic last option the bridge appends to every question: the App's inline
 * form has no free-text input, so "custom answer" is a two-tap flow — pick
 * this option, then type the real answer in the composer.
 */
export declare const CUSTOM_ANSWER_LABEL = "\u270F\uFE0F \u81EA\u5B9A\u4E49\u2026";
/**
 * Merge composer text with a deferred (marker-picked) submission.
 * - No deferred selections: the text becomes `custom` for every question
 *   (the original "type while waiting" behavior).
 * - With deferred selections: real options are kept per question; questions
 *   that picked the marker — and questions never answered — take the text
 *   as `custom`.
 * @param questions - harness questions in order.
 * @param text - the composer line.
 * @param deferred - per-question submitted options, keyed by question id.
 * @returns one answer row per question.
 */
export declare function mergeCustomAnswers(questions: readonly {
    id: string;
}[], text: string, deferred?: Record<string, string[]>): {
    id: string;
    selected: string[];
    custom?: string;
}[];
/**
 * Translate a web-side harness answer batch into Happy communications answers
 * so the phone card shows the same choice instead of a cancelled form.
 * @param answers - harness answer rows from the web composer.
 * @returns answers keyed by question id.
 */
export declare function communicationAnswersFromWeb(answers: readonly {
    id: string;
    selected: string[];
    custom?: string;
}[]): Record<string, {
    options: string[];
    custom?: string;
}>;
/**
 * Translate Happy communications answers (`{ [question id]: { options, custom } }`)
 * into harness answer rows. Options become `selected`; free text becomes `custom`.
 * @param answers - communication RPC answers keyed by question id.
 * @param questions - original harness questions in order.
 * @returns one answer row per question.
 */
export declare function answersFromCommunication(answers: Record<string, {
    options: string[];
    custom?: string;
}> | undefined, questions: readonly {
    id: string;
}[]): {
    id: string;
    selected: string[];
    custom?: string;
}[];
/**
 * Decode a Happy `communication` RPC body (form answers or cancellation).
 * Unknown statuses degrade to `cancelled`, which re-asks instead of silently
 * submitting empty answers.
 * @param params - decrypted RPC params.
 * @returns id, form kind, answered/cancelled status, and per-question answers.
 */
export declare function parseCommunicationRpc(params: unknown): CommunicationRpc;
//# sourceMappingURL=inbound.d.ts.map