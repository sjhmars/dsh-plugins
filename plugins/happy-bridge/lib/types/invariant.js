/** Package invariant companion for `@sjhmars/happy-bridge`. */
const PACKAGE_NAME = '@sjhmars/happy-bridge';
export const name = 'happy-bridge-invariant';
export const inject = ['invariants'];
/** No runtime invariant: Happy relay I/O is an external event stream this package does not own. */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map