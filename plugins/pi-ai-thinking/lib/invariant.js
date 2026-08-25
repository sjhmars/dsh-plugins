//#region lib/types/invariant.js
/** Invariant companion for @sjhmars/pi-ai-thinking. */
const PACKAGE_NAME = "@sjhmars/pi-ai-thinking";
const name = "pi-ai-thinking-invariant";
const inject = ["invariants"];
/** Settings mutations have no plugin-owned event stream to validate. */
const install = () => {};
/**
* Register the package invariant companion.
* @param ctx - Host context carrying the invariant registry.
* @returns disposer for the registered companion.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
