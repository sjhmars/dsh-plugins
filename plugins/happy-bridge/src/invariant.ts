/** Package invariant companion for `@sjhmars/happy-bridge`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sjhmars/happy-bridge'

export const name = 'happy-bridge-invariant'
export const inject = ['invariants']

/** No runtime invariant: Happy relay I/O is an external event stream this package does not own. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
