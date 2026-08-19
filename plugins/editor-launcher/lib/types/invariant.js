/** Package invariant companion for `@sjhmars/editor-launcher`. */
const PACKAGE_NAME = '@sjhmars/editor-launcher';
export const name = 'editor-launcher-invariant';
export const inject = ['invariants'];
/** No runtime invariant: detection and launching are one-shot process capabilities with no owned event stream to observe. */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map