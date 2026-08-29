/**
 * 校验 npm 包名，并在 profile 目录执行与官方 `dsh plugin add` 相同的两步：
 * pnpm add，再按 `dsh.bundle` 调和 `dsh.profile.bundles`。
 * @module @sjhmars/plugin-install/add
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
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
/**
 * 只接受注册表包名（含 scope）。拒绝路径、协议前缀、版本后缀与空白。
 * @param raw - 输入框原文。
 * @returns 规范化包名；非法时为 undefined。
 */
export function parseNpmPackageName(raw) {
    const name = raw.trim();
    if (name.length === 0)
        return undefined;
    if (name.length > 214)
        return undefined;
    if (/[\\\s]/.test(name))
        return undefined;
    if (/^(?:file|link|github|git\+|workspace|npm|http|https):/i.test(name))
        return undefined;
    if (name.startsWith('.') || name.startsWith('_'))
        return undefined;
    if (name.includes('@') && !name.startsWith('@'))
        return undefined;
    if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name))
        return undefined;
    return name;
}
/**
 * 定位本包依赖的 pnpm CLI（`.cjs`，不必走 Windows `.cmd`）。
 * @param from - 解析起点，默认本模块。
 * @returns pnpm 入口文件绝对路径。
 */
export function resolvePnpmCli(from = import.meta.url) {
    return createRequire(from).resolve('pnpm/bin/pnpm.cjs');
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
 * @param packageName - {@link parseNpmPackageName} 的返回值。
 * @param installAnchor - 与 CLI `INSTALL_ANCHOR` 同角色。
 * @returns 退出码与 stdout/stderr。
 */
export function addProfilePlugin(profile, packageName, installAnchor) {
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
        initProfile(dir, template);
    }
    const before = readProfileManifest('dsh', dir);
    let pnpmCli;
    try {
        pnpmCli = resolvePnpmCli();
    }
    catch {
        return {
            ok: false,
            code: 127,
            stdout: '',
            stderr: `${LOG}: 找不到内置 pnpm，无法安装插件`,
        };
    }
    const result = spawnSync(process.execPath, [pnpmCli, 'add', packageName], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    const stdout = result.stdout ?? '';
    let stderr = result.stderr ?? '';
    if (result.error !== undefined) {
        const code = result.error.code;
        if (code === 'ENOENT') {
            return { ok: false, code: 127, stdout, stderr: `${LOG}: 无法启动 Node 来运行 pnpm` };
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