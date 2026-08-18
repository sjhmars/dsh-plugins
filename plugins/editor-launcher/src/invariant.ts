/** Package invariant companion for `@dsh/editor-launcher`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh/editor-launcher'

export const name = 'editor-launcher-invariant'
export const inject = ['invariants']

/** No runtime invariant: detection and launching are one-shot process capabilities with no owned event stream to observe. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
