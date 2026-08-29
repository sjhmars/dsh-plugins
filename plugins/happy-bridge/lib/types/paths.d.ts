/** Map Happy picker paths onto registered workspace directories. Do not mkdir. */
import type { VirtualWorkspace } from './types.ts';
/** Virtual home the Happy directory picker starts in. */
export declare const VIRTUAL_HOME = "/dsh-workspaces";
/**
 * Normalize a path for comparison: slashes, no trailing slash (except root), Windows drive case.
 * @param value - real or virtual path.
 * @returns comparable spelling.
 */
export declare function normalizePath(value: string): string;
/**
 * Build virtual workspace entries from real registered roots.
 * @param workspaces - `{ path, title, id }` from `workspaceRegistry.list()`.
 * @returns virtual POSIX paths under {@link VIRTUAL_HOME}.
 */
export declare function virtualWorkspaces(workspaces: readonly {
    id: string;
    path: string;
    title: string;
}[]): VirtualWorkspace[];
/**
 * Find the registered workspace that owns a real session cwd.
 * Nested roots pick the longest matching path.
 * @param realCwd - session `header.cwd` or persisted meta.cwd.
 * @param workspaces - virtual mapping.
 */
export declare function matchVirtualWorkspace(realCwd: string, workspaces: readonly VirtualWorkspace[]): VirtualWorkspace | undefined;
/**
 * Resolve a spawn `directory` to a registered workspace real path.
 * @param directory - Happy spawn directory (virtual or real).
 * @param workspaces - virtual mapping.
 * @returns real path, or `undefined` when it is not a registered workspace.
 */
export declare function resolveSpawnDirectory(directory: string, workspaces: readonly VirtualWorkspace[]): string | undefined;
/**
 * Slim `listDirectory`: only the virtual home and workspace roots.
 * @param requestPath - path the App asked to list.
 * @param workspaces - virtual mapping.
 * @returns Happy listDirectory payload.
 */
export declare function listVirtualDirectory(requestPath: string, workspaces: readonly VirtualWorkspace[]): {
    success: true;
    entries: {
        name: string;
        type: 'directory';
    }[];
} | {
    success: false;
    error: string;
};
/** Windows-aware basename for a real workspace path shown as a fallback slug. */
export declare function realBasename(realPath: string): string;
//# sourceMappingURL=paths.d.ts.map