/**
 * 校验 npm 包名，并在 profile 目录执行与官方 `dsh plugin add` 相同的两步：
 * pnpm add，再按 `dsh.bundle` 调和 `dsh.profile.bundles`。
 * @module @sjhmars/plugin-install/add
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initProfile, PROFILE_TEMPLATES, readProfileManifest, resolveBundleDir, resolveProfileDir, writeProfileManifest, } from '@deepseek-ai/dsh-app-boot';
/** 安装器只写这两套 profile：浏览器 `dsh web` 与桌面客户端各一份，互不相通。 */
export const INSTALL_PROFILES = ['web', 'desktop'];
/**
 * 是否为本安装器允许写入的 profile。
 * @param profile - 组合配置或 RPC 传入的名字。
 * @returns 是否为 `web` 或 `desktop`。
 */
export function isInstallProfile(profile) {
    return INSTALL_PROFILES.includes(profile);
}
const LOG = 'plugin-install';
/** 本安装器的 npm 包名。设置页更新自己时不热替换，避免处理请求时卸掉当前实例。 */
export const INSTALLER_PACKAGE = '@sjhmars/plugin-install';
/**
 * Loader 行是否属于该 npm 包：启动时的包名行、旧式 `包名?hot=`、以及
 * `file://…/node_modules/<包名>/…?hot=` 热挂行。
 * @param entryName - Loader `options.name`。
 * @param packageName - 不含版本后缀的 npm 包名。
 * @returns 是否应在热替换前卸掉。
 */
export function entryBelongsToPackage(entryName, packageName) {
    if (entryName === undefined || packageName.length === 0)
        return false;
    if (entryName === packageName || entryName.startsWith(`${packageName}?hot=`))
        return true;
    const withoutQuery = (entryName.split('?')[0] ?? entryName).replaceAll('\\', '/');
    return withoutQuery.includes(`/node_modules/${packageName}/`);
}
/**
 * 从 profile 的 node_modules 解析刚装好的包入口 URL（不用已加载模块的 resolve 缓存）。
 * @param profile - `web` 或 `desktop`。
 * @param packageName - 不含版本后缀的 npm 包名。
 * @returns `file://` 入口 URL。
 */
export function resolveInstalledPackageUrl(profile, packageName) {
    const require = createRequire(join(resolveProfileDir(profile), 'package.json'));
    return pathToFileURL(require.resolve(packageName)).href;
}
/**
 * 只接受注册表包名(含 scope,可带可选 `@version` 后缀)。拒绝路径、协议
 * 前缀与空白。
 * @param raw - 输入框原文。
 * @returns 规范化的包名与可选版本;非法时为 undefined。
 */
export function parseNpmPackageName(raw) {
    const input = raw.trim();
    if (input.length === 0 || input.length > 260)
        return undefined;
    if (/[\\\s]/.test(input))
        return undefined;
    if (/^(?:file|link|github|git\+|workspace|npm|http|https):/i.test(input))
        return undefined;
    if (input.startsWith('.') || input.startsWith('_'))
        return undefined;
    const at = input.lastIndexOf('@');
    const version = at > 0 ? input.slice(at + 1) : undefined;
    const name = at > 0 ? input.slice(0, at) : input;
    if (version !== undefined && !/^[a-zA-Z0-9^~][a-zA-Z0-9._+~^-]*$/.test(version))
        return undefined;
    if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name))
        return undefined;
    return { name, version };
}
/**
 * 沿 node_modules 链直寻 pnpm CLI。pnpm 的 exports 只暴露 package.json,
 * `require.resolve('pnpm/bin/pnpm.cjs')` 即使文件存在也会被拒;直接按
 * 路径查找是唯一可靠的定位方式。
 * @param from - 起始目录,默认本模块目录。
 * @returns `bin/pnpm.cjs` 绝对路径;整条链都没有时为 undefined。
 */
export function resolvePnpmCli(from = dirname(fileURLToPath(import.meta.url))) {
    let dir = from;
    for (;;) {
        const candidate = join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
/** 读 profile 的 node_modules/.modules.yaml 里记录的 storeDir;全新或非 pnpm 布局时为 undefined。 */
export function readProfileStoreDir(profileDir) {
    let text;
    try {
        text = readFileSync(join(profileDir, 'node_modules', '.modules.yaml'), 'utf8');
    }
    catch {
        return undefined;
    }
    // pnpm 11 writes the file JSON-style; pnpm 10 writes plain YAML.
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed.storeDir === 'string')
            return parsed.storeDir;
    }
    catch {
        // Plain-YAML layout: fall through to the line scan.
    }
    const line = text.split(/\r?\n/).find(candidate => candidate.startsWith('storeDir:'));
    if (line === undefined)
        return undefined;
    return line.slice('storeDir:'.length).trim().replace(/^['"]|['"]$/g, '');
}
function normalizePath(path) {
    return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}
function cliLauncher(cli) {
    return {
        label: cli,
        storePath: (cwd) => {
            const result = spawnSync(process.execPath, [cli, 'store', 'path'], { cwd, encoding: 'utf8' });
            return result.status === 0 ? (result.stdout ?? '').trim() : undefined;
        },
        run: (args, cwd) => spawnSync(process.execPath, [cli, ...args], {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        }),
    };
}
function systemLauncher() {
    return {
        label: 'pnpm (system)',
        storePath: (cwd) => {
            const result = spawnSync('pnpm', ['store', 'path'], {
                cwd,
                encoding: 'utf8',
                shell: process.platform === 'win32',
            });
            return result.status === 0 ? (result.stdout ?? '').trim() : undefined;
        },
        run: (args, cwd) => spawnSync('pnpm', [...args], {
            cwd,
            encoding: 'utf8',
            shell: process.platform === 'win32',
        }),
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
export function selectPnpm(profileDir) {
    const bundled = resolvePnpmCli() === undefined ? undefined : cliLauncher(resolvePnpmCli());
    const system = systemLauncher();
    const probed = bundled === undefined ? [system] : [bundled, system];
    const store = readProfileStoreDir(profileDir);
    if (store !== undefined) {
        for (const candidate of probed) {
            const path = candidate.storePath(profileDir);
            if (path !== undefined && normalizePath(path) === normalizePath(store))
                return candidate;
        }
    }
    return [system, ...bundled === undefined ? [] : [bundled]]
        .find(candidate => candidate.storePath(profileDir) !== undefined);
}
/**
 * 从已安装的 harness 包推断安装锚（desktop-app / web-app / base）。
 * @returns 某个 harness 包的 package.json 路径。
 */
export function resolveInstallAnchor() {
    const require = createRequire(import.meta.url);
    const candidates = [
        '@deepseek-ai/dsh-desktop-app/package.json',
        '@deepseek-ai/dsh-web-app/package.json',
        '@deepseek-ai/dsh-base/package.json',
    ];
    for (const id of candidates) {
        try {
            return require.resolve(id);
        }
        catch {
            continue; // 当前安装树没有该表层包
        }
    }
    throw new Error(`${LOG}: 找不到 harness 安装锚，无法调和 profile 插件层`);
}
function exportsPatch(packageName, profileDir, installAnchor) {
    let dir;
    try {
        dir = resolveBundleDir('dsh', packageName, installAnchor, profileDir);
    }
    catch {
        return false; // pnpm 成功但包不可解析：当作普通依赖
    }
    const manifest = readProfileManifest('dsh', dir);
    return manifest.dsh?.bundle?.patch !== undefined;
}
function reconcilePlugins(before, profileDir, installAnchor) {
    const after = readProfileManifest('dsh', profileDir);
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
        }
        else if (!isBundle && !beforeDeps.has(packageName)) {
            warnings.push(`${LOG}: ${packageName} 未声明 dsh.bundle，已作为普通依赖安装（日后带上声明会自动进层）`);
        }
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
        after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles: plugins } };
        writeProfileManifest(profileDir, after);
    }
    return warnings.join('\n');
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
export function addProfilePlugin(profile, packageName, installAnchor, version = undefined) {
    if (!isInstallProfile(profile)) {
        return {
            ok: false,
            code: 2,
            stdout: '',
            stderr: `${LOG}: 只写入 web 或 desktop profile，收到 ${JSON.stringify(profile)}`,
        };
    }
    const dir = resolveProfileDir(profile);
    const template = PROFILE_TEMPLATES[profile];
    if (template === undefined) {
        return {
            ok: false,
            code: 2,
            stdout: '',
            stderr: `${LOG}: profile ${profile} 没有 shipped 模板`,
        };
    }
    if (!existsSync(join(dir, 'package.json'))) {
        initProfile(dir, template.bundles, template.patchReload);
    }
    const before = readProfileManifest('dsh', dir);
    const spec = version === undefined ? packageName : `${packageName}@${version}`;
    const pnpm = selectPnpm(dir);
    if (pnpm === undefined) {
        return {
            ok: false,
            code: 127,
            stdout: '',
            stderr: `${LOG}: 找不到可用的 pnpm（内置或系统），无法安装插件`,
        };
    }
    const result = pnpm.run(['add', spec], dir);
    const stdout = result.stdout ?? '';
    let stderr = result.stderr ?? '';
    if (result.error !== undefined) {
        const code = result.error.code;
        if (code === 'ENOENT') {
            return { ok: false, code: 127, stdout, stderr: `${LOG}: 无法启动 pnpm（${pnpm.label}）` };
        }
        throw result.error;
    }
    const exitCode = result.status ?? 1;
    if (exitCode !== 0) {
        stderr = [stderr, `${LOG}: pnpm 在 ${dir} 失败`].filter(part => part.length > 0).join('\n');
        return { ok: false, code: exitCode, stdout, stderr };
    }
    const warnings = reconcilePlugins(before, dir, installAnchor);
    if (warnings.length > 0)
        stderr = [stderr, warnings].filter(part => part.length > 0).join('\n');
    return { ok: true, code: 0, stdout, stderr };
}
//# sourceMappingURL=add.js.map