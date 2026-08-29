//#region lib/types/invariant.js
/** Package invariant companion for `@sjhmars/happy-bridge`. */
const PACKAGE_NAME = "@sjhmars/happy-bridge";
const name = "happy-bridge-invariant";
const inject = ["invariants"];
/** No runtime invariant: Happy relay I/O is an external event stream this package does not own. */
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Host context carrying the invariant registry.
* @returns the registration disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
