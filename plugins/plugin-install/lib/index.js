import Schema from "@deepseek-ai/schemastery";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { bundlePatchPaths, loadOverlayPatches, readProfileManifest, resolveBundleDir } from "@deepseek-ai/dsh-app-boot";
import { runProfilePnpm } from "@deepseek-ai/dsh-plugin-manager/operations";
//#region lib/types/add.js
/** Validate npm names and install packages through official profile operations. */
/** Profiles exposed by this installer. */
const INSTALL_PROFILES = ["web", "desktop"];
/** Npm identity of this installer. */
const INSTALLER_PACKAGE = "@sjhmars/plugin-install";
/**
* Check the configured profile name.
* @param profile - Requested profile.
* @returns Whether the name is web or desktop.
*/
function isInstallProfile(profile) {
	return INSTALL_PROFILES.includes(profile);
}
/**
* 只接受注册表包名(含 scope,可带可选 `@version` 后缀)。拒绝路径、协议
* 前缀与空白。
* @param raw - 输入框原文。
* @returns 规范化的包名与可选版本;非法时为 undefined。
*/
function parseNpmPackageName(raw) {
	const input = raw.trim();
	if (input.length === 0 || input.length > 260) return void 0;
	if (/[\\\s]/.test(input)) return void 0;
	if (/^(?:file|link|github|git\+|workspace|npm|http|https):/i.test(input)) return void 0;
	if (input.startsWith(".") || input.startsWith("_")) return void 0;
	const at = input.lastIndexOf("@");
	const version = at > 0 ? input.slice(at + 1) : void 0;
	const name = at > 0 ? input.slice(0, at) : input;
	if (version !== void 0 && !/^[a-zA-Z0-9^~][a-zA-Z0-9._+~^-]*$/.test(version)) return void 0;
	if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name)) return void 0;
	return {
		name,
		version
	};
}
/**
* Install an npm bundle or plain dependency in the current profile.
* Newly installed bundles are selected; updates preserve existing selections.
* Failures restore the manifest and lockfile, while downloaded files and diagnostics may remain.
* @param current - Launcher-owned profile locations and optional packaged pnpm invocation.
* @param config - Resolved target, executable and operation bounds.
* @param raw - Npm package name with an optional version.
* @param signal - Cancels the package process; completion waits for it to stop.
* @returns Saved package kind and diagnostics; success requires a process restart.
*/
async function addProfilePlugin(current, config, raw, signal) {
	if (!isInstallProfile(config.profile) || config.profile !== current.name) return {
		ok: false,
		code: 2,
		stdout: "",
		stderr: "plugin-install: 配置必须使用当前 web 或 desktop profile：" + current.name
	};
	const spec = parseNpmPackageName(raw);
	if (spec === void 0) return {
		ok: false,
		code: 2,
		stdout: "",
		stderr: "plugin-install: 只接受 npm 包名，可带 @版本。"
	};
	let result;
	const output = () => result === void 0 ? "" : result.output + (result.truncated ? "\nLog: " + result.logPath : "");
	try {
		return await withFileLock(join(current.dir, "package.json"), async () => {
			signal?.throwIfAborted();
			const files = await Promise.all(["package.json", "pnpm-lock.yaml"].map(async (name) => {
				const filename = join(current.dir, name);
				let content;
				try {
					content = await readFile(filename, "utf8");
				} catch (error) {
					if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
				}
				return {
					filename,
					content
				};
			}));
			try {
				result = await runProfilePnpm({
					...current,
					profile: current.name
				}, ["add", spec.version === void 0 ? spec.name : spec.name + "@" + spec.version], {
					execution: "service",
					...current.packageManager ?? { command: config.pnpmCommand },
					outputBytes: config.outputBytes,
					lockWaitMs: config.lockWaitMs,
					idleTimeoutMs: config.idleTimeoutMs,
					lookupTimeoutMs: config.lookupTimeoutMs,
					...signal === void 0 ? {} : { signal }
				});
				signal?.throwIfAborted();
				if (result.exitCode !== 0 || result.timedOut === true) throw new Error(result.timedOut ? "pnpm: installation timed out" : "pnpm: installation exited with code " + String(result.exitCode));
				const directory = resolveBundleDir("dsh", spec.name, current.installAnchor, current.dir);
				const installed = readProfileManifest("dsh", directory);
				const bundle = installed.dsh?.bundle;
				if (bundle !== void 0) for (const file of bundlePatchPaths(directory, bundle)) loadOverlayPatches("dsh", file);
				const selected = readProfileManifest("dsh", current.dir).dsh?.profile?.bundles ?? [];
				return {
					ok: true,
					code: 0,
					stdout: output(),
					stderr: "",
					application: "restart-required",
					kind: bundle === void 0 ? "dependency" : "bundle",
					...bundle === void 0 ? {} : { enabled: selected.includes(spec.name) },
					...installed.version === void 0 ? {} : { version: installed.version }
				};
			} catch (error) {
				const failures = [];
				for (const file of files) try {
					if (file.content === void 0) await rm(file.filename, { force: true });
					else await writeFileAtomic(file.filename, file.content, { mode: 384 });
				} catch (restoreError) {
					failures.push(restoreError);
				}
				if (failures.length > 0) throw new AggregateError([error, ...failures], "Installation failed; restoring profile files also failed");
				throw error;
			}
		}, { waitMs: config.lockWaitMs });
	} catch (error) {
		return {
			ok: false,
			code: result?.exitCode || 1,
			stdout: output(),
			stderr: error instanceof Error ? error.message : String(error),
			application: signal?.aborted === true ? "cancelled" : "failed"
		};
	}
}
//#endregion
//#region lib/types/index.js
/** Cordis plugin name. */
const name = "plugin-install";
/** Current-profile target and bounds for package operations. */
const Config = Schema.object({
	profile: Schema.union([Schema.const("web"), Schema.const("desktop")]).default("web"),
	pnpmCommand: Schema.string().pattern(/\S/).default("pnpm"),
	outputBytes: Schema.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16384),
	lockWaitMs: Schema.number().step(1).min(1).max(2147483647).default(12e4),
	idleTimeoutMs: Schema.number().step(1).min(1).max(2147483647).default(12e4),
	lookupTimeoutMs: Schema.number().step(1).min(1).max(2147483647).default(12e4)
});
/** Launcher profile and authenticated route carrier. */
const inject = ["connection", "profileContext"];
/**
* Register target and installation routes; unloading cancels and joins owned package operations.
* @param ctx - Host context with launcher-owned profile information.
* @param config - Validated target and package-operation settings.
*/
function apply(ctx, config) {
	if (config.profile !== ctx.profileContext.name) throw new Error("plugin-install: profile 必须与当前运行的 profile 一致：" + ctx.profileContext.name);
	const abort = new AbortController();
	const operations = /* @__PURE__ */ new Set();
	ctx.effect(() => async () => {
		abort.abort();
		await Promise.allSettled(operations);
	}, "plugin-install: package operations");
	ctx.effect(() => ctx.connection.fetch.register({
		path: "/api/pluginInstall/target",
		methods: ["GET"],
		requestBody: "buffered",
		fetch: async () => Response.json({ profile: config.profile })
	}), "plugin-install: target route");
	ctx.effect(() => ctx.connection.fetch.register({
		path: "/api/pluginInstall/install",
		methods: ["GET"],
		requestBody: "buffered",
		fetch: async (request) => {
			const raw = new URL(request.url).searchParams.get("package") ?? "";
			const operation = addProfilePlugin(ctx.profileContext, config, raw, abort.signal);
			operations.add(operation);
			try {
				return Response.json(await operation);
			} finally {
				operations.delete(operation);
			}
		}
	}), "plugin-install: installation route");
}
//#endregion
export { Config, INSTALLER_PACKAGE, INSTALL_PROFILES, addProfilePlugin, apply, inject, isInstallProfile, name, parseNpmPackageName };
