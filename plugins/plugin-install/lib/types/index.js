import Schema from '@deepseek-ai/schemastery';
import { addProfilePlugin } from "./add.js";
export { parseNpmPackageName, addProfilePlugin, isInstallProfile, INSTALL_PROFILES, INSTALLER_PACKAGE } from "./add.js";
/** Cordis plugin name. */
export const name = 'plugin-install';
/** Current-profile target and bounds for package operations. */
export const Config = Schema.object({
    profile: Schema.union([Schema.const('web'), Schema.const('desktop')]).default('web'),
    pnpmCommand: Schema.string().pattern(/\S/).default('pnpm'),
    outputBytes: Schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_384),
    lockWaitMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
    idleTimeoutMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
    lookupTimeoutMs: Schema.number().step(1).min(1).max(2_147_483_647).default(120_000),
});
/** Launcher profile and authenticated route carrier. */
export const inject = ['connection', 'profileContext'];
/**
 * Register target and installation routes; unloading cancels and joins owned package operations.
 * @param ctx - Host context with launcher-owned profile information.
 * @param config - Validated target and package-operation settings.
 */
export function apply(ctx, config) {
    if (config.profile !== ctx.profileContext.name) {
        throw new Error('plugin-install: profile 必须与当前运行的 profile 一致：' + ctx.profileContext.name);
    }
    const abort = new AbortController();
    const operations = new Set();
    ctx.effect(() => async () => {
        abort.abort();
        await Promise.allSettled(operations);
    }, 'plugin-install: package operations');
    ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/pluginInstall/target', methods: ['GET'], requestBody: 'buffered',
        fetch: async () => Response.json({ profile: config.profile }),
    }), 'plugin-install: target route');
    ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/pluginInstall/install', methods: ['GET'], requestBody: 'buffered',
        fetch: async (request) => {
            const raw = new URL(request.url).searchParams.get('package') ?? '';
            const operation = addProfilePlugin(ctx.profileContext, config, raw, abort.signal);
            operations.add(operation);
            try {
                return Response.json(await operation);
            }
            finally {
                operations.delete(operation);
            }
        },
    }), 'plugin-install: installation route');
}
//# sourceMappingURL=index.js.map