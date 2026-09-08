/**
 * Pure helpers for the Happy agentState snapshot. The App zod-validates the
 * whole decrypted snapshot and blanks it on any malformed entry, so every
 * completed entry must carry the full original request shape.
 * @module agent-state
 */

import type {
  HappyCommunicationEntry,
  HappyCompletedCommunication,
  HappyCompletedRequest,
  HappyRequestEntry,
} from './types.ts'

/** Completed entries kept per session, so snapshots cannot grow without bound. */
export const COMPLETED_CAP = 50

/**
 * Insert or refresh a completed entry with FIFO eviction. Re-answering an id
 * moves it back to newest; the oldest entry falls off the cap.
 * @param map - per-link completed map.
 * @param id - Happy request / communication id.
 * @param entry - schema-valid completed entry.
 */
export function rememberCompleted<T>(map: Map<string, T>, id: string, entry: T): void {
  map.delete(id)
  map.set(id, entry)
  while (map.size > COMPLETED_CAP) {
    const oldest = map.keys().next().value
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

/** Plain-object view of a completed map for the encrypted snapshot. */
export function snapshotMap<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  return Object.fromEntries(map)
}

/**
 * Build the full agentState snapshot pushed with `update-state`. The pending
 * approval or question sits in `requests` / `communications`; every completed
 * entry rides along so App-side replays keep the answered card states.
 * @param input - pending id + entries, the completed maps, and the grant flag.
 * @returns the plaintext agentState object.
 */
export function agentStateSnapshot(input: {
  controlledByUser: boolean
  /** Local pending id; also the key in both maps and the tool-call id. */
  pendingId?: string
  /** Pending entry for the permission channel (approvals, plan review, legacy questions). */
  pendingRequest?: HappyRequestEntry
  /** Pending entry for the communications channel (questions). */
  pendingCommunication?: HappyCommunicationEntry
  completedRequests?: ReadonlyMap<string, HappyCompletedRequest>
  completedCommunications?: ReadonlyMap<string, HappyCompletedCommunication>
}): {
  controlledByUser: boolean
  requests: Record<string, HappyRequestEntry>
  communications: Record<string, HappyCommunicationEntry>
  completedRequests: Record<string, HappyCompletedRequest>
  completedCommunications: Record<string, HappyCompletedCommunication>
} {
  return {
    controlledByUser: input.controlledByUser,
    requests: input.pendingId === undefined || input.pendingRequest === undefined
      ? {}
      : { [input.pendingId]: input.pendingRequest },
    communications: input.pendingId === undefined || input.pendingCommunication === undefined
      ? {}
      : { [input.pendingId]: input.pendingCommunication },
    completedRequests: snapshotMap(input.completedRequests ?? new Map()),
    completedCommunications: snapshotMap(input.completedCommunications ?? new Map()),
  }
}
