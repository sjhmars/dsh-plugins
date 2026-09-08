/**
 * Pure helpers for the Happy agentState snapshot. The App zod-validates the
 * whole decrypted snapshot and blanks it on any malformed entry, so every
 * completed entry must carry the full original request shape.
 * @module agent-state
 */
import type { HappyCommunicationEntry, HappyCompletedCommunication, HappyCompletedRequest, HappyRequestEntry } from './types.ts';
/** Completed entries kept per session, so snapshots cannot grow without bound. */
export declare const COMPLETED_CAP = 50;
/**
 * Insert or refresh a completed entry with FIFO eviction. Re-answering an id
 * moves it back to newest; the oldest entry falls off the cap.
 * @param map - per-link completed map.
 * @param id - Happy request / communication id.
 * @param entry - schema-valid completed entry.
 */
export declare function rememberCompleted<T>(map: Map<string, T>, id: string, entry: T): void;
/** Plain-object view of a completed map for the encrypted snapshot. */
export declare function snapshotMap<T>(map: ReadonlyMap<string, T>): Record<string, T>;
/**
 * Build the full agentState snapshot pushed with `update-state`. The pending
 * approval or question sits in `requests` / `communications`; every completed
 * entry rides along so App-side replays keep the answered card states.
 * @param input - pending id + entries, the completed maps, and the grant flag.
 * @returns the plaintext agentState object.
 */
export declare function agentStateSnapshot(input: {
    controlledByUser: boolean;
    /** Local pending id; also the key in both maps and the tool-call id. */
    pendingId?: string;
    /** Pending entry for the permission channel (approvals, plan review, legacy questions). */
    pendingRequest?: HappyRequestEntry;
    /** Pending entry for the communications channel (questions). */
    pendingCommunication?: HappyCommunicationEntry;
    completedRequests?: ReadonlyMap<string, HappyCompletedRequest>;
    completedCommunications?: ReadonlyMap<string, HappyCompletedCommunication>;
}): {
    controlledByUser: boolean;
    requests: Record<string, HappyRequestEntry>;
    communications: Record<string, HappyCommunicationEntry>;
    completedRequests: Record<string, HappyCompletedRequest>;
    completedCommunications: Record<string, HappyCompletedCommunication>;
};
//# sourceMappingURL=agent-state.d.ts.map