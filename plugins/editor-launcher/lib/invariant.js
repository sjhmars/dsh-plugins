//#region lib/types/invariant.js
/** Package invariant companion for `@sjhmars/editor-launcher`. */
const PACKAGE_NAME = "@sjhmars/editor-launcher";
const name = "editor-launcher-invariant";
const inject = ["invariants"];
/** No runtime invariant: detection and launching are one-shot process capabilities with no owned event stream to observe. */
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Host context carrying the invariant registry.
* @returns the registration disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
