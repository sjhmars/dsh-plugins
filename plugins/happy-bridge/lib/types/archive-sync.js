/** Hide/show a harness session in the sidebar archive set without a Host unarchive RPC. */
import { SessionId } from '@deepseek-ai/dsh-session';
/**
 * Ids that entered or left the archive set.
 * @param previous - last observed set.
 * @param next - current `archivedSessionIds`.
 */
export function archiveSetDiff(previous, next) {
    return {
        hidden: [...next].filter(id => !previous.has(id)),
        shown: [...previous].filter(id => !next.has(id)),
    };
}
/**
 * Keep Happy online when the row is still in the unarchived web sidebar.
 * Opening an offline phone row does not start a heartbeat by itself.
 * @param parked - plugin park flag.
 * @param liveOnWeb - id is in the unarchived web sidebar.
 */
export function phoneParkAction(parked, liveOnWeb) {
    if (liveOnWeb)
        return parked ? 'unpark' : 'keep';
    return parked ? 'keep' : 'park';
}
/**
 * Archive on the Host (public API). Idempotent when already archived.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export async function hideOnHarness(registry, sessionId) {
    if (registry === undefined)
        return;
    const id = SessionId(sessionId);
    if (registry.archivedSessionIds.includes(id))
        return;
    try {
        await registry.archiveSession(id);
    }
    catch (error) {
        // Another writer (the web menu, or a parallel phone archive) may have
        // committed first; the set is what grouping surfaces read.
        if (registry.archivedSessionIds.includes(id))
            return;
        throw error;
    }
}
/**
 * Take one id out of the Host archive set so grouping surfaces show it again
 * in its kept `sessionIds` slot. Uses the registry write chain; does not add
 * a Harness API.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export async function revealOnHarness(registry, sessionId) {
    if (registry === undefined)
        return;
    const id = SessionId(sessionId);
    if (!registry.archivedSessionIds.includes(id))
        return;
    const writer = registry;
    await writer.enqueueOperation(async () => {
        const state = writer.requireState();
        if (!state.archivedSessionIds.includes(id))
            return;
        await writer.setState({
            ...state,
            archivedSessionIds: state.archivedSessionIds.filter(item => item !== id),
        });
    });
}
//# sourceMappingURL=archive-sync.js.map