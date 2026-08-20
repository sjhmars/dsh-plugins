/** Package invariant companion for `@sjhmars/task-notify`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sjhmars/task-notify'

export const name = 'task-notify-invariant'
export const inject = ['invariants']

/** No runtime invariant: toast delivery is OS-local; approval wait returns via process stdout, not an owned harness event stream. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
