import { createRequire } from "node:module";
import Schema from "@deepseek-ai/schemastery";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
/** 本安装器的 npm 包名。设置页更新自己时不热替换，避免处理请求时卸掉当前实例。 */
const INSTALLER_PACKAGE = "@sjhmars/plugin-install";
/**
* Loader 行是否属于该 npm 包：启动时的包名行、旧式 `包名?hot=`、以及
* `file://…/node_modules/<包名>/…?hot=` 热挂行。
* @param entryName - Loader `options.name`。
* @param packageName - 不含版本后缀的 npm 包名。
* @returns 是否应在热替换前卸掉。
*/
function entryBelongsToPackage(entryName, packageName) {
	if (entryName === void 0 || packageName.length === 0) return false;
	if (entryName === packageName || entryName.startsWith(`${packageName}?hot=`)) return true;
	return (entryName.split("?")[0] ?? entryName).replaceAll("\\", "/").includes(`/node_modules/${packageName}/`);
}
/**
* 从 profile 的 node_modules 解析刚装好的包入口 URL（不用已加载模块的 resolve 缓存）。
* @param profile - `web` 或 `desktop`。
* @param packageName - 不含版本后缀的 npm 包名。
* @returns `file://` 入口 URL。
*/
function resolveInstalledPackageUrl(profile, packageName) {
	const require = createRequire(join(resolveProfileDir(profile), "package.json"));
	return pathToFileURL(require.resolve(packageName)).href;
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
* 沿 node_modules 链直寻 pnpm CLI。pnpm 的 exports 只暴露 package.json,
* `require.resolve('pnpm/bin/pnpm.cjs')` 即使文件存在也会被拒;直接按
* 路径查找是唯一可靠的定位方式。
* @param from - 起始目录,默认本模块目录。
* @returns `bin/pnpm.cjs` 绝对路径;整条链都没有时为 undefined。
*/
function resolvePnpmCli(from = dirname(fileURLToPath(import.meta.url))) {
	let dir = from;
	for (;;) {
		const candidate = join(dir, "node_modules", "pnpm", "bin", "pnpm.cjs");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return void 0;
		dir = parent;
	}
}
/** 读 profile 的 node_modules/.modules.yaml 里记录的 storeDir;全新或非 pnpm 布局时为 undefined。 */
function readProfileStoreDir(profileDir) {
	let text;
	try {
		text = readFileSync(join(profileDir, "node_modules", ".modules.yaml"), "utf8");
	} catch {
		return;
	}
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed.storeDir === "string") return parsed.storeDir;
	} catch {}
	const line = text.split(/\r?\n/).find((candidate) => candidate.startsWith("storeDir:"));
	if (line === void 0) return void 0;
	return line.slice(9).trim().replace(/^['"]|['"]$/g, "");
}
function normalizePath(path) {
	return path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}
function cliLauncher(cli) {
	return {
		label: cli,
		storePath: (cwd) => {
			const result = spawnSync(process.execPath, [
				cli,
				"store",
				"path"
			], {
				cwd,
				encoding: "utf8"
			});
			return result.status === 0 ? (result.stdout ?? "").trim() : void 0;
		},
		run: (args, cwd) => spawnSync(process.execPath, [cli, ...args], {
			cwd,
			encoding: "utf8",
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: "1"
			}
		})
	};
}
function systemLauncher() {
	return {
		label: "pnpm (system)",
		storePath: (cwd) => {
			const result = spawnSync("pnpm", ["store", "path"], {
				cwd,
				encoding: "utf8",
				shell: process.platform === "win32"
			});
			return result.status === 0 ? (result.stdout ?? "").trim() : void 0;
		},
		run: (args, cwd) => spawnSync("pnpm", [...args], {
			cwd,
			encoding: "utf8",
			shell: process.platform === "win32"
		})
	};
}
/**
* 选出与 profile 兼容的 pnpm:两个大版本的 pnpm store 布局互不兼容
* (ERR_PNPM_UNEXPECTED_STORE),必须由创建该 node_modules 的同一套
* store 继续管理。先读 .modules.yaml 的 storeDir,在 profile 目录里
* 探测各候选的 store(与实际运行同 cwd,避免 npmrc 链差异),取匹配
* 者;全新 profile 或无人匹配时优先系统 pnpm(官方 `dsh plugin` 的同
* 源管理者),内置 CLI 只在没有系统 pnpm 的机器上兜底。
* @param profileDir - 目标 profile 目录。
* @returns 可用的 pnpm 启动器;一个都没有时为 undefined。
*/
function selectPnpm(profileDir) {
	const bundled = resolvePnpmCli() === void 0 ? void 0 : cliLauncher(resolvePnpmCli());
	const system = systemLauncher();
	const probed = bundled === void 0 ? [system] : [bundled, system];
	const store = readProfileStoreDir(profileDir);
	if (store !== void 0) for (const candidate of probed) {
		const path = candidate.storePath(profileDir);
		if (path !== void 0 && normalizePath(path) === normalizePath(store)) return candidate;
	}
	return [system, ...bundled === void 0 ? [] : [bundled]].find((candidate) => candidate.storePath(profileDir) !== void 0);
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
* @param packageName - 不含版本后缀的包名。
* @param installAnchor - 与 CLI `INSTALL_ANCHOR` 同角色。
* @param version - 可选版本(dist-tag、semver 或范围),拼入 pnpm 安装参数。
* @returns 退出码与 stdout/stderr。
*/
function addProfilePlugin(profile, packageName, installAnchor, version = void 0) {
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
	if (!existsSync(join(dir, "package.json"))) initProfile(dir, template.bundles, template.patchReload);
	const before = readProfileManifest("dsh", dir);
	const spec = version === void 0 ? packageName : `${packageName}@${version}`;
	const pnpm = selectPnpm(dir);
	if (pnpm === void 0) return {
		ok: false,
		code: 127,
		stdout: "",
		stderr: `${LOG}: 找不到可用的 pnpm（内置或系统），无法安装插件`
	};
	const result = pnpm.run(["add", spec], dir);
	const stdout = result.stdout ?? "";
	let stderr = result.stderr ?? "";
	if (result.error !== void 0) {
		if (result.error.code === "ENOENT") return {
			ok: false,
			code: 127,
			stdout,
			stderr: `${LOG}: 无法启动 pnpm（${pnpm.label}）`
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
//#region lib/types/index.js
/**
* Host:设置里用 npm 包名给当前 profile 装树外插件。
*
* RPC 面走 connection 的精确 Fetch 路由而不是 Typert Remote:Remote 的
* 方法标记寄存在 typert-protocol 模块内的注册表里,树外插件经 profile
* node_modules 解析到的是另一份模块实例,gateway 永远看不见那些标记
* (表现为 /api 调用 404)。精确路由由 connection 服务直接派发,不经
* gateway 的端点认领,是官方为"不能用 JSON Remote 的调用"留的通道。
* @module @sjhmars/plugin-install
*/
/** Cordis 插件名。 */
const name = "plugin-install";
/** 非法 profile 名在加载时失败。 */
const Config = Schema.object({ profile: Schema.union([Schema.const("web"), Schema.const("desktop")]).default("web") });
/** 精确 Fetch 路由挂在 connection 服务上。 */
const inject = ["connection"];
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
function json(value) {
	return new Response(JSON.stringify(value), { headers: JSON_HEADERS });
}
/**
* 注册两条安装路由并挂上热挂载,按组合配置钉住目标 profile。
*
* GET 携带查询参数:精确 Fetch 路由只认 GET/HEAD(POST 保留给 JSON
* Remote 通道),这个本地同源工具 API 以查询参数传包名。
* @param ctx - Host 插件上下文。
* @param config - 组合行配置。
*/
function apply(ctx, config) {
	ctx.connection.fetch.register({
		path: "/api/pluginInstall/target",
		methods: ["GET"],
		fetch: async () => json({ profile: config.profile })
	});
	ctx.connection.fetch.register({
		path: "/api/pluginInstall/install",
		methods: ["GET"],
		fetch: async (request) => {
			const spec = parseNpmPackageName(new URL(request.url).searchParams.get("package") ?? "");
			if (spec === void 0) return json({
				ok: false,
				code: 2,
				stdout: "",
				stderr: "plugin-install: 只接受 npm 包名（可带 @版本，例如 @sjhmars/task-notify@0.2.0）"
			});
			const result = addProfilePlugin(config.profile, spec.name, resolveInstallAnchor(), spec.version);
			if (!result.ok) return json(result);
			return json(await mountInstalled(ctx, spec.name, result, config.profile));
		}
	});
	ctx.logger.info(`plugin-install: 安装目标 profile=${config.profile}`);
}
/**
* 把刚装好的包挂进运行中的树:首次安装热挂载,更新版本热替换(dispose
* 旧 entry 后以缓存爆破 URL 重新导入,新代码真正生效)。跨重启的持久
* 由 profile 清单负责(已写好);任何挂载失败都只降级为"重启后生效",
* 不影响安装结果。热挂载的行以插件默认配置运行;bundle patch 带 row
* 配置或覆盖其他行的插件,完整组合以下次重启为准。
* @param ctx - Host 插件上下文。
* @param name - the installed package name.
* @param result - the completed install result.
* @param profile - 写入的 profile，用来从该目录解析刚装好的入口。
* @returns the result with the live-mount outcome appended.
*/
async function mountInstalled(ctx, name, result, profile) {
	if (name === "@sjhmars/plugin-install") return {
		...result,
		stdout: `${result.stdout}\nplugin-install: 本安装器已写入 profile，请重启 dsh 后生效（不能热替换正在处理这次安装的自己）。`.split("\n").filter((part) => part.length > 0).join("\n")
	};
	const stale = [...ctx.loader.entries()].filter((entry) => entryBelongsToPackage(entry.options.name, name) && entry.fiber !== void 0 && !entry.disabled);
	try {
		const fresh = `${resolveInstalledPackageUrl(profile, name)}?hot=${Date.now().toString(36)}`;
		for (const entry of stale) await entry.update({ disabled: true });
		await ctx.loader.create({ name: fresh });
		return {
			...result,
			stdout: `${result.stdout}\nplugin-install: ${name} 已热${stale.length > 0 ? "替换" : "挂载"}，无需重启；界面部分刷新页面即可。`.split("\n").filter((part) => part.length > 0).join("\n")
		};
	} catch (error) {
		return {
			...result,
			stderr: `${result.stderr}\nplugin-install: 安装成功，热挂载/热替换失败，重启后生效：${error instanceof Error ? error.message : String(error)}`.split("\n").filter((part) => part.length > 0).join("\n")
		};
	}
}
//#endregion
export { Config, INSTALLER_PACKAGE, INSTALL_PROFILES, addProfilePlugin, apply, entryBelongsToPackage, inject, isInstallProfile, name, parseNpmPackageName };
