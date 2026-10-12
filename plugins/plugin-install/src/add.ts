/** Validate npm names and install packages through official profile operations. */
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { bundlePatchPaths, loadOverlayPatches, readProfileManifest, resolveBundleDir, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { runProfilePnpm } from '@deepseek-ai/dsh-plugin-manager/operations'
import type { PackageResult } from '@deepseek-ai/dsh-plugin-manager'
import type { Config, InstallResult } from './types.ts'
export type { InstallResult } from './types.ts'

/** Profiles exposed by this installer. */
export const INSTALL_PROFILES = ['web', 'desktop'] as const
/** Npm identity of this installer. */
export const INSTALLER_PACKAGE = '@sjhmars/plugin-install'

/**
 * Check the configured profile name.
 * @param profile - Requested profile.
 * @returns Whether the name is web or desktop.
 */
export function isInstallProfile(profile: string): profile is Config['profile'] {
  return (INSTALL_PROFILES as readonly string[]).includes(profile)
}

/** 输入框解析结果:npm 包名与可选版本。 */
export interface NpmPackageSpec {
  /** 不含版本后缀的注册表包名。 */
  readonly name: string
  /** 请求的版本(dist-tag、精确 semver、`~`/`^` 范围);纯包名输入为 undefined。 */
  readonly version: string | undefined
}

/**
 * 只接受注册表包名(含 scope,可带可选 `@version` 后缀)。拒绝路径、协议
 * 前缀与空白。
 * @param raw - 输入框原文。
 * @returns 规范化的包名与可选版本;非法时为 undefined。
 */
export function parseNpmPackageName(raw: string): NpmPackageSpec | undefined {
  const input = raw.trim()
  if (input.length === 0 || input.length > 260) return undefined
  if (/[\\\s]/.test(input)) return undefined
  if (/^(?:file|link|github|git\+|workspace|npm|http|https):/i.test(input)) return undefined
  if (input.startsWith('.') || input.startsWith('_')) return undefined
  const at = input.lastIndexOf('@')
  const version = at > 0 ? input.slice(at + 1) : undefined
  const name = at > 0 ? input.slice(0, at) : input
  if (version !== undefined && !/^[a-zA-Z0-9^~][a-zA-Z0-9._+~^-]*$/.test(version)) return undefined
  if (!/^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/.test(name)) return undefined
  return { name, version }
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
export async function addProfilePlugin(
  current: ProfileContext,
  config: Config,
  raw: string,
  signal?: AbortSignal,
): Promise<InstallResult> {
  if (!isInstallProfile(config.profile) || config.profile !== current.name) {
    return { ok: false, code: 2, stdout: '', stderr: 'plugin-install: 配置必须使用当前 web 或 desktop profile：' + current.name }
  }
  const spec = parseNpmPackageName(raw)
  if (spec === undefined) {
    return { ok: false, code: 2, stdout: '', stderr: 'plugin-install: 只接受 npm 包名，可带 @版本。' }
  }
  let result: PackageResult | undefined
  const output = (): string => result === undefined ? ''
    : result.output + (result.truncated ? '\nLog: ' + result.logPath : '')
  try {
    return await withFileLock(join(current.dir, 'package.json'), async () => {
      signal?.throwIfAborted()
      const files = await Promise.all(['package.json', 'pnpm-lock.yaml'].map(async name => {
        const filename = join(current.dir, name)
        let content: string | undefined
        try { content = await readFile(filename, 'utf8') }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        }
        return { filename, content }
      }))
      try {
        result = await runProfilePnpm({ ...current, profile: current.name }, [
          'add', spec.version === undefined ? spec.name : spec.name + '@' + spec.version,
        ], {
          execution: 'service',
          ...current.packageManager ?? { command: config.pnpmCommand },
          outputBytes: config.outputBytes, lockWaitMs: config.lockWaitMs,
          idleTimeoutMs: config.idleTimeoutMs, lookupTimeoutMs: config.lookupTimeoutMs,
          ...signal === undefined ? {} : { signal },
        })
        signal?.throwIfAborted()
        if (result.exitCode !== 0 || result.timedOut === true) {
          throw new Error(result.timedOut ? 'pnpm: installation timed out' : 'pnpm: installation exited with code ' + String(result.exitCode))
        }
        const directory = resolveBundleDir('dsh', spec.name, current.installAnchor, current.dir)
        const installed = readProfileManifest('dsh', directory)
        const bundle = installed.dsh?.bundle
        if (bundle !== undefined) {
          for (const file of bundlePatchPaths(directory, bundle)) loadOverlayPatches('dsh', file)
        }
        const selected = readProfileManifest('dsh', current.dir).dsh?.profile?.bundles ?? []
        return {
          ok: true, code: 0, stdout: output(), stderr: '', application: 'restart-required',
          kind: bundle === undefined ? 'dependency' : 'bundle',
          ...bundle === undefined ? {} : { enabled: selected.includes(spec.name) },
          ...installed.version === undefined ? {} : { version: installed.version },
        }
      } catch (error) {
        const failures: unknown[] = []
        for (const file of files) {
          try {
            if (file.content === undefined) await rm(file.filename, { force: true })
            else await writeFileAtomic(file.filename, file.content, { mode: 0o600 })
          } catch (restoreError) { failures.push(restoreError) }
        }
        if (failures.length > 0) throw new AggregateError([error, ...failures], 'Installation failed; restoring profile files also failed')
        throw error
      }
    }, { waitMs: config.lockWaitMs })
  } catch (error) {
    return {
      ok: false, code: result?.exitCode || 1, stdout: output(),
      stderr: error instanceof Error ? error.message : String(error),
      application: signal?.aborted === true ? 'cancelled' : 'failed',
    }
  }
}
