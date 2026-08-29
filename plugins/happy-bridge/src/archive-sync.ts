/** Hide/show a harness session in the sidebar archive set without a Host unarchive RPC. */

import { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceDomainState } from '@deepseek-ai/dsh-workspace'

/** `workspaceRegistry` fields this plugin uses for archive sync. */
export interface ArchiveRegistry {
  readonly archivedSessionIds: readonly SessionId[]
  archiveSession(sessionId: SessionId): Promise<void>
}

/**
 * The Host registry write chain. `archiveSession` is public; restore has to
 * reuse the same durable global set because there is no unarchive method.
 */
interface RegistryWriteChain {
  enqueueOperation: (operation: () => Promise<void>) => Promise<void>
  requireState: () => WorkspaceDomainState
  setState: (state: WorkspaceDomainState) => Promise<void>
}

/**
 * Ids that entered or left the archive set.
 * @param previous - last observed set.
 * @param next - current `archivedSessionIds`.
 */
export function archiveSetDiff(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
): { hidden: string[]; shown: string[] } {
  return {
    hidden: [...next].filter(id => !previous.has(id)),
    shown: [...previous].filter(id => !next.has(id)),
  }
}

/**
 * Keep Happy online when the row is still in the unarchived web sidebar.
 * Opening an offline phone row does not start a heartbeat by itself.
 * @param parked - plugin park flag.
 * @param liveOnWeb - id is in the unarchived web sidebar.
 */
export function phoneParkAction(parked: boolean, liveOnWeb: boolean): 'park' | 'unpark' | 'keep' {
  if (liveOnWeb) return parked ? 'unpark' : 'keep'
  return parked ? 'keep' : 'park'
}

/**
 * Archive on the Host (public API). Idempotent when already archived.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export async function hideOnHarness(
  registry: ArchiveRegistry | undefined,
  sessionId: string,
): Promise<void> {
  if (registry === undefined) return
  const id = SessionId(sessionId)
  if (registry.archivedSessionIds.includes(id)) return
  try {
    await registry.archiveSession(id)
  } catch (error) {
    // Another writer (the web menu, or a parallel phone archive) may have
    // committed first; the set is what grouping surfaces read.
    if (registry.archivedSessionIds.includes(id)) return
    throw error
  }
}

/**
 * Take one id out of the Host archive set so grouping surfaces show it again
 * in its kept `sessionIds` slot. Uses the registry write chain; does not add
 * a Harness API.
 * @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
 * @param sessionId - harness session id.
 */
export async function revealOnHarness(
  registry: ArchiveRegistry | undefined,
  sessionId: string,
): Promise<void> {
  if (registry === undefined) return
  const id = SessionId(sessionId)
  if (!registry.archivedSessionIds.includes(id)) return
  const writer = registry as unknown as RegistryWriteChain
  await writer.enqueueOperation(async () => {
    const state = writer.requireState()
    if (!state.archivedSessionIds.includes(id)) return
    await writer.setState({
      ...state,
      archivedSessionIds: state.archivedSessionIds.filter(item => item !== id),
    })
  })
}
