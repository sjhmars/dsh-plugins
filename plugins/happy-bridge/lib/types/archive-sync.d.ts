/** Hide/show a harness session in the sidebar archive set without a Host unarchive RPC. */
import { SessionId } from '@deepseek-ai/dsh-session';
/** `workspaceRegistry` fields this plugin uses for archive sync. */
export interface ArchiveRegistry {
    readonly archivedSessionIds: readonly SessionId[];
    archiveSession(sessionId: SessionId): Promise<void>;
}
/**
 * Ids that entered or left the archive set.
 * @param previous - last observed set.
 * @param next - current `archivedSessionIds`.
 */
export declare function archiveSetDiff(previous: ReadonlySet<string>, next: ReadonlySet<string>): {
    hidden: string[];
    shown: string[];
};
/**
 * Keep Happy online when the row is still in the unarchived web sidebar.
 * Opening an offline phone row does not start a heartbeat by itself.
 * @param parked - plugin park flag.
 * @param liveOnWeb - id is in the unarchived web sidebar.
 */
export declare function phoneParkAction(parked: boolean, liveOnWeb: boolean): 'park' | 'unpark' | 'keep';
/**
 * Archive on the Host (public API). Idempotent when already archived.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export declare function hideOnHarness(registry: ArchiveRegistry | undefined, sessionId: string): Promise<void>;
/**
 * Take one id out of the Host archive set so grouping surfaces show it again
 * in its kept `sessionIds` slot. Uses the registry write chain; does not add
 * a Harness API.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export declare function revealOnHarness(registry: ArchiveRegistry | undefined, sessionId: string): Promise<void>;
//# sourceMappingURL=archive-sync.d.ts.map