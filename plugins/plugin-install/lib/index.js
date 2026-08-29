import { createRequire } from "node:module";
import Schema from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROFILE_TEMPLATES, initProfile, readProfileManifest, resolveBundleDir, resolveProfileDir, writeProfileManifest } from "@deepseek-ai/dsh-app-boot";
//#region lib/types/add.js
/**
* 校验 npm 包名，并在 profile 目录执行与官方 `dsh plugin add` 相同的两步：
* pnpm add，再按 `dsh.bundle` 调和 `dsh.profile.bundles`。
* @module @sjhmars/plugin-install/add
*/
/** 安装器只写这两套 profile：浏览器 `dsh web` 与桌面客户端各一份，互不相通。 */
const INSTALL_PROFILES = ["web", "desktop"];
/**
* 是否为本安装器允许写入的 profile。
* @param profile - 组合配置或 RPC 传入的名字。
* @returns 是否为 `web` 或 `desktop`。
*/
function isInstallProfile(profile) {
	return INSTALL_PROFILES.includes(profile);
}
const LOG = "plugin-install";
/**
* 只接受注册表包名（含 scope）。拒绝路径、协议前缀、版本后缀与空白。
* @param raw - 输入框原文。
* @returns 规范化包名；非法时为 undefined。
*/
function parseNpmPackageName(raw) {
	const name = raw.trim();
	if (name.length === 0) return void 0;
	if (name.length > 214) return void 0;
	if (/[\\\s]/.test(name)) return void 0;
	if (/^(?:file|link|github|git\+|workspace|npm|http|https):/i.test(name)) return void 0;
	if (name.startsWith(".") || name.startsWith("_")) return void 0;
	if (name.includes("@") && !name.startsWith("@")) return void 0;
	if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name)) return void 0;
	return name;
}
/**
* 定位本包依赖的 pnpm CLI（`.cjs`，不必走 Windows `.cmd`）。
* @param from - 解析起点，默认本模块。
* @returns pnpm 入口文件绝对路径。
*/
function resolvePnpmCli(from = import.meta.url) {
	return createRequire(from).resolve("pnpm/bin/pnpm.cjs");
}
/**
* 从已安装的 harness 包推断安装锚（desktop-app / web-app / base）。
* @returns 某个 harness 包的 package.json 路径。
*/
function resolveInstallAnchor() {
	const require = createRequire(import.meta.url);
	for (const id of [
		"@deepseek-ai/dsh-desktop-app/package.json",
		"@deepseek-ai/dsh-web-app/package.json",
		"@deepseek-ai/dsh-base/package.json"
	]) try {
		return require.resolve(id);
	} catch {
		continue;
	}
	throw new Error(`${LOG}: 找不到 harness 安装锚，无法调和 profile 插件层`);
}
function exportsPatch(packageName, profileDir, installAnchor) {
	let dir;
	try {
		dir = resolveBundleDir("dsh", packageName, installAnchor, profileDir);
	} catch {
		return false;
	}
	return readProfileManifest("dsh", dir).dsh?.bundle?.patch !== void 0;
}
function reconcilePlugins(before, profileDir, installAnchor) {
	const after = readProfileManifest("dsh", profileDir);
	const beforeDeps = new Set(Object.keys(before.dependencies ?? {}));
	const dependencies = Object.keys(after.dependencies ?? {});
	const plugins = after.dsh?.profile?.bundles ?? [];
	const warnings = [];
	let changed = false;
	for (const packageName of dependencies) {
		const isBundle = exportsPatch(packageName, profileDir, installAnchor);
		if (isBundle && !plugins.includes(packageName)) {
			plugins.push(packageName);
			changed = true;
		} else if (!isBundle && !beforeDeps.has(packageName)) warnings.push(`${LOG}: ${packageName} 未声明 dsh.bundle，已作为普通依赖安装（日后带上声明会自动进层）`);
	}
	const dependencySet = new Set(dependencies);
	for (const packageName of [...plugins]) {
		const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName);
		const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, profileDir, installAnchor);
		if (wasDependency && !stillBundle) {
			plugins.splice(plugins.indexOf(packageName), 1);
			changed = true;
		}
	}
	if (changed) {
		after.dsh = {
			...after.dsh,
			profile: {
				...after.dsh?.profile,
				bundles: plugins
			}
		};
		writeProfileManifest(profileDir, after);
	}
	return warnings.join("\n");
}
/**
* 在指定 profile 安装一个已校验的 npm 包名。
* `web` 等价 `dsh plugin --profile web add`；`desktop` 等价 `dsh plugin --profile desktop add`。
* @param profile - `web` 或 `desktop`。
* @param packageName - {@link parseNpmPackageName} 的返回值。
* @param installAnchor - 与 CLI `INSTALL_ANCHOR` 同角色。
* @returns 退出码与 stdout/stderr。
*/
function addProfilePlugin(profile, packageName, installAnchor) {
	if (!isInstallProfile(profile)) return {
		ok: false,
		code: 2,
		stdout: "",
		stderr: `${LOG}: 只写入 web 或 desktop profile，收到 ${JSON.stringify(profile)}`
	};
	const dir = resolveProfileDir(profile);
	const template = PROFILE_TEMPLATES[profile];
	if (template === void 0) return {
		ok: false,
		code: 2,
		stdout: "",
		stderr: `${LOG}: profile ${profile} 没有 shipped 模板`
	};
	if (!existsSync(join(dir, "package.json"))) initProfile(dir, template);
	const before = readProfileManifest("dsh", dir);
	let pnpmCli;
	try {
		pnpmCli = resolvePnpmCli();
	} catch {
		return {
			ok: false,
			code: 127,
			stdout: "",
			stderr: `${LOG}: 找不到内置 pnpm，无法安装插件`
		};
	}
	const result = spawnSync(process.execPath, [
		pnpmCli,
		"add",
		packageName
	], {
		cwd: dir,
		encoding: "utf8",
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1"
		}
	});
	const stdout = result.stdout ?? "";
	let stderr = result.stderr ?? "";
	if (result.error !== void 0) {
		if (result.error.code === "ENOENT") return {
			ok: false,
			code: 127,
			stdout,
			stderr: `${LOG}: 无法启动 Node 来运行 pnpm`
		};
		throw result.error;
	}
	const exitCode = result.status ?? 1;
	if (exitCode !== 0) {
		stderr = [stderr, `${LOG}: pnpm 在 ${dir} 失败`].filter((part) => part.length > 0).join("\n");
		return {
			ok: false,
			code: exitCode,
			stdout,
			stderr
		};
	}
	const warnings = reconcilePlugins(before, dir, installAnchor);
	if (warnings.length > 0) stderr = [stderr, warnings].filter((part) => part.length > 0).join("\n");
	return {
		ok: true,
		code: 0,
		stdout,
		stderr
	};
}
//#endregion
//#region lib/types/remote.js
/** 设置页调用的 Typert Remote：按包名安装 profile 插件。 */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* 浏览器安装页调用的 Host RPC。
*/
let PluginInstallService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _target_decorators;
	let _install_decorators;
	return class PluginInstallService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_target_decorators = [Remote("target")];
			_install_decorators = [Remote("install")];
			__esDecorate(this, null, _target_decorators, {
				kind: "method",
				name: "target",
				static: false,
				private: false,
				access: {
					has: (obj) => "target" in obj,
					get: (obj) => obj.target
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _install_decorators, {
				kind: "method",
				name: "install",
				static: false,
				private: false,
				access: {
					has: (obj) => "install" in obj,
					get: (obj) => obj.install
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		/** 当前组合写入的 profile。 */
		profile = (__runInitializers(this, _instanceExtraInitializers), "web");
		/**
		* @param ctx - Host 上下文。
		*/
		constructor(ctx) {
			super(ctx, "pluginInstall");
		}
		/**
		* 当前组合写入的 profile：浏览器为 `web`，桌面客户端为 `desktop`。
		* @returns 与 `dsh plugin --profile` 相同的名字。
		*/
		async target() {
			return { profile: this.profile };
		}
		/**
		* 只接受 npm 包名，写入 {@link profile}。
		* @param packageName - 输入框原文。
		* @returns 安装结果。
		*/
		async install(packageName) {
			const name = parseNpmPackageName(packageName);
			if (name === void 0) return {
				ok: false,
				code: 2,
				stdout: "",
				stderr: "plugin-install: 只接受 npm 包名（例如 @sjhmars/task-notify）"
			};
			return addProfilePlugin(this.profile, name, resolveInstallAnchor());
		}
	};
})();
//#endregion
//#region lib/types/index.js
/**
* Host：设置里用 npm 包名给当前 profile 安装树外插件。
* @module @sjhmars/plugin-install
*/
/** Cordis 插件名。 */
const name = "plugin-install";
/** 非法 profile 名在加载时失败。 */
const Config = Schema.object({ profile: Schema.union([Schema.const("web"), Schema.const("desktop")]).default("web") });
/**
* 挂上安装 Remote，并把 profile 钉在组合配置上。
* @param ctx - Host 上下文。
* @param config - 组合行配置。
*/
function apply(ctx, config) {
	const service = new PluginInstallService(ctx);
	service.profile = config.profile;
	ctx.logger.info(`plugin-install: 安装目标 profile=${config.profile}`);
}
//#endregion
export { Config, INSTALL_PROFILES, addProfilePlugin, apply, isInstallProfile, name, parseNpmPackageName };
