/** Map Happy picker paths onto registered workspace directories. Do not mkdir. */
import { posix, win32 } from 'node:path';
/** Virtual home the Happy directory picker starts in. */
export const VIRTUAL_HOME = '/dsh-workspaces';
/**
 * Normalize a path for comparison: slashes, no trailing slash (except root), Windows drive case.
 * @param value - real or virtual path.
 * @returns comparable spelling.
 */
export function normalizePath(value) {
    const trimmed = value.trim();
    const replaced = trimmed.replaceAll('\\', '/');
    const withDrive = /^[A-Za-z]:/.test(replaced) ? replaced[0].toUpperCase() + replaced.slice(1) : replaced;
    if (withDrive.length > 1 && withDrive.endsWith('/'))
        return withDrive.slice(0, -1);
    return withDrive;
}
/**
 * Build virtual workspace entries from real registered roots.
 * @param workspaces - `{ path, title, id }` from `workspaceRegistry.list()`.
 * @returns virtual POSIX paths under {@link VIRTUAL_HOME}.
 */
export function virtualWorkspaces(workspaces) {
    const used = new Set();
    return workspaces.map((workspace) => {
        const base = slug(workspace.title) || slug(workspace.id) || 'workspace';
        let name = base;
        let n = 2;
        while (used.has(name)) {
            name = `${base}-${n}`;
            n += 1;
        }
        used.add(name);
        return {
            virtualPath: `${VIRTUAL_HOME}/${name}`,
            realPath: workspace.path,
            title: workspace.title,
        };
    });
}
/**
 * Find the registered workspace that owns a real session cwd.
 * Nested roots pick the longest matching path.
 * @param realCwd - session `header.cwd` or persisted meta.cwd.
 * @param workspaces - virtual mapping.
 */
export function matchVirtualWorkspace(realCwd, workspaces) {
    const want = normalizePath(realCwd);
    let best;
    let bestLen = -1;
    for (const workspace of workspaces) {
        const root = normalizePath(workspace.realPath);
        if (want !== root && !want.startsWith(`${root}/`))
            continue;
        if (root.length > bestLen) {
            best = workspace;
            bestLen = root.length;
        }
    }
    return best;
}
/**
 * Resolve a spawn `directory` to a registered workspace real path.
 * @param directory - Happy spawn directory (virtual or real).
 * @param workspaces - virtual mapping.
 * @returns real path, or `undefined` when it is not a registered workspace.
 */
export function resolveSpawnDirectory(directory, workspaces) {
    const want = normalizePath(directory);
    for (const workspace of workspaces) {
        if (normalizePath(workspace.virtualPath) === want)
            return workspace.realPath;
        if (normalizePath(workspace.realPath) === want)
            return workspace.realPath;
    }
    return undefined;
}
/**
 * Slim `listDirectory`: only the virtual home and workspace roots.
 * @param requestPath - path the App asked to list.
 * @param workspaces - virtual mapping.
 * @returns Happy listDirectory payload.
 */
export function listVirtualDirectory(requestPath, workspaces) {
    const want = normalizePath(requestPath === '' || requestPath === '~' ? VIRTUAL_HOME : requestPath);
    if (want === '/' || want === VIRTUAL_HOME) {
        return {
            success: true,
            entries: workspaces.map(workspace => ({
                name: posix.basename(workspace.virtualPath),
                type: 'directory',
            })),
        };
    }
    const hit = workspaces.find(workspace => normalizePath(workspace.virtualPath) === want);
    if (hit !== undefined) {
        return { success: true, entries: [] };
    }
    return { success: false, error: '只列出已登记的工作区根目录' };
}
function slug(value) {
    const leaf = value.replaceAll('\\', '/').split('/').pop() ?? value;
    const cleaned = leaf.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned;
}
/** Windows-aware basename for a real workspace path shown as a fallback slug. */
export function realBasename(realPath) {
    return process.platform === 'win32' ? win32.basename(realPath) : posix.basename(realPath);
}
//# sourceMappingURL=paths.js.map