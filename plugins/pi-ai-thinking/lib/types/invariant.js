/** Invariant companion for @sjhmars/pi-ai-thinking. */
const PACKAGE_NAME = '@sjhmars/pi-ai-thinking';
export const name = 'pi-ai-thinking-invariant';
export const inject = ['invariants'];
/** Settings mutations have no plugin-owned event stream to validate. */
const install = () => { };
/**
 * Register the package invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns disposer for the registered companion.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map