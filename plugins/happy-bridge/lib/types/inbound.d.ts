/** Classify inbound Happy user text as a registered slash command or ordinary chat. */
import type { PermissionRpc } from './types.ts';
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
//# sourceMappingURL=inbound.d.ts.map