/**
 * Host half of the editor launcher: detects installed editors and opens a
 * file with a chosen one. Exposed to the browser through the Typert Gateway's
 * SRC claim path (`TypertRemoteService` binding + `@Remote` markers), which is
 * reachable from both the Web and Desktop carriers over the shared `/api`
 * channel.
 * @module @sjhmars/editor-launcher
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { EditorInfo, OpenResult } from './types.ts'

/** Stable Cordis plugin name (host half). */
export const name = 'editor-launcher'

/** No required services: detection and launching are pure process capabilities. */
export const inject: string[] = []

/** One well-known editor candidate, resolved per platform. */
interface EditorCandidate {
  readonly id: string
  readonly name: string
  /** CLI names probed on PATH via `where` / `which`. */
  readonly commands: readonly string[]
  /** Absolute install paths per platform, probed with `existsSync`. */
  readonly paths: Partial<Record<NodeJS.Platform, readonly string[]>>
  /** macOS: `open -a <app>` when the named bundle exists in /Applications. */
  readonly macApp?: string
  /**
   * Windows only: executable names registered under the `App Paths` registry
   * key (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\<name>`).
   * The `(Default)` value is the real install path, so non-C-drive installs
   * resolve without guessing. Probed before `paths`.
   */
  readonly appPaths?: readonly string[]
  /**
   * Windows only: resolve via Microsoft's `vswhere` (the VS Installer
   * locator) instead of fixed paths — the reliable way to find Visual Studio
   * instances, which may live on any drive.
   */
  readonly vswhere?: boolean
}

const CANDIDATES: readonly EditorCandidate[] = [
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    commands: ['code'],
    paths: {
      win32: [
        process.env.LOCALAPPDATA + '\\Programs\\Microsoft VS Code\\Code.exe',
        process.env.PROGRAMFILES + '\\Microsoft VS Code\\Code.exe',
      ],
      darwin: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'],
      linux: ['/usr/bin/code', '/snap/bin/code', '/usr/share/code/bin/code'],
    },
    macApp: 'Visual Studio Code',
  },
  {
    id: 'vscode-insiders',
    name: 'VS Code Insiders',
    commands: ['code-insiders'],
    paths: {
      win32: [
        process.env.LOCALAPPDATA + '\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe',
        process.env.PROGRAMFILES + '\\Microsoft VS Code Insiders\\Code - Insiders.exe',
      ],
      darwin: ['/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders'],
      linux: ['/usr/bin/code-insiders', '/snap/bin/code-insiders'],
    },
    macApp: 'Visual Studio Code - Insiders',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    commands: ['cursor'],
    paths: {
      win32: [process.env.LOCALAPPDATA + '\\Programs\\cursor\\Cursor.exe'],
      darwin: ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor'],
      linux: ['/usr/bin/cursor', '/snap/bin/cursor'],
    },
    macApp: 'Cursor',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    commands: ['windsurf'],
    paths: {
      win32: [process.env.LOCALAPPDATA + '\\Programs\\Windsurf\\Windsurf.exe'],
      darwin: ['/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf'],
      linux: ['/usr/bin/windsurf', '/snap/bin/windsurf'],
    },
    macApp: 'Windsurf',
  },
  {
    id: 'vscodium',
    name: 'VSCodium',
    commands: ['codium'],
    paths: {
      win32: [process.env.LOCALAPPDATA + '\\Programs\\VSCodium\\VSCodium.exe'],
      darwin: ['/Applications/VSCodium.app/Contents/Resources/app/bin/codium'],
      linux: ['/usr/bin/codium'],
    },
    macApp: 'VSCodium',
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    commands: ['subl', 'sublime_text'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\Sublime Text\\sublime_text.exe'],
      darwin: ['/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl'],
      linux: ['/usr/bin/sublime_text', '/opt/sublime_text/sublime_text'],
    },
    macApp: 'Sublime Text',
  },
  {
    id: 'notepadpp',
    name: 'Notepad++',
    commands: ['notepad++'],
    paths: {
      win32: [
        process.env.PROGRAMFILES + '\\Notepad++\\notepad++.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Notepad++\\notepad++.exe',
      ],
    },
  },
  {
    id: 'nvim',
    name: 'Neovim',
    commands: ['nvim'],
    paths: {
      win32: [process.env.LOCALAPPDATA + '\\nvim\\bin\\nvim.exe'],
      linux: ['/usr/bin/nvim', '/snap/bin/nvim'],
    },
  },
  {
    id: 'vim',
    name: 'Vim',
    commands: ['vim'],
    paths: {
      linux: ['/usr/bin/vim'],
    },
  },
  // JetBrains IDEs: standalone installs register their `bin/<product>64.exe`
  // under App Paths (any drive); Toolbox installs put a `<product>` CLI on
  // PATH. Probe App Paths first, then PATH.
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    commands: ['idea'],
    appPaths: ['idea64.exe', 'idea.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe'],
      darwin: ['/Applications/IntelliJ IDEA.app/Contents/MacOS/idea'],
      linux: ['/usr/bin/idea'],
    },
    macApp: 'IntelliJ IDEA',
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    commands: ['webstorm'],
    appPaths: ['webstorm64.exe', 'webstorm.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\WebStorm\\bin\\webstorm64.exe'],
      darwin: ['/Applications/WebStorm.app/Contents/MacOS/webstorm'],
      linux: ['/usr/bin/webstorm'],
    },
    macApp: 'WebStorm',
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    commands: ['pycharm'],
    appPaths: ['pycharm64.exe', 'pycharm.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\PyCharm\\bin\\pycharm64.exe'],
      darwin: ['/Applications/PyCharm.app/Contents/MacOS/pycharm'],
      linux: ['/usr/bin/pycharm'],
    },
    macApp: 'PyCharm',
  },
  {
    id: 'goland',
    name: 'GoLand',
    commands: ['goland'],
    appPaths: ['goland64.exe', 'goland.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\GoLand\\bin\\goland64.exe'],
      darwin: ['/Applications/GoLand.app/Contents/MacOS/goland'],
      linux: ['/usr/bin/goland'],
    },
    macApp: 'GoLand',
  },
  {
    id: 'datagrip',
    name: 'DataGrip',
    commands: ['datagrip'],
    appPaths: ['datagrip64.exe', 'datagrip.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\DataGrip\\bin\\datagrip64.exe'],
      darwin: ['/Applications/DataGrip.app/Contents/MacOS/datagrip'],
      linux: ['/usr/bin/datagrip'],
    },
    macApp: 'DataGrip',
  },
  {
    id: 'phpstorm',
    name: 'PhpStorm',
    commands: ['phpstorm'],
    appPaths: ['phpstorm64.exe', 'phpstorm.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\PhpStorm\\bin\\phpstorm64.exe'],
      darwin: ['/Applications/PhpStorm.app/Contents/MacOS/phpstorm'],
      linux: ['/usr/bin/phpstorm'],
    },
    macApp: 'PhpStorm',
  },
  {
    id: 'rubymine',
    name: 'RubyMine',
    commands: ['rubymine'],
    appPaths: ['rubymine64.exe', 'rubymine.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\RubyMine\\bin\\rubymine64.exe'],
      darwin: ['/Applications/RubyMine.app/Contents/MacOS/rubymine'],
      linux: ['/usr/bin/rubymine'],
    },
    macApp: 'RubyMine',
  },
  {
    id: 'clion',
    name: 'CLion',
    commands: ['clion'],
    appPaths: ['clion64.exe', 'clion.exe'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\JetBrains\\CLion\\bin\\clion64.exe'],
      darwin: ['/Applications/CLion.app/Contents/MacOS/clion'],
      linux: ['/usr/bin/clion'],
    },
    macApp: 'CLion',
  },
  {
    id: 'visual-studio',
    name: 'Visual Studio',
    commands: [],
    vswhere: true,
    paths: {},
  },
  {
    id: 'android-studio',
    name: 'Android Studio',
    commands: ['studio'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\Android\\Android Studio\\bin\\studio64.exe'],
      darwin: ['/Applications/Android Studio.app/Contents/MacOS/studio'],
      linux: ['/usr/bin/studio', '/opt/android-studio/bin/studio.sh'],
    },
    macApp: 'Android Studio',
  },
  {
    id: 'zed',
    name: 'Zed',
    commands: ['zed'],
    paths: {
      darwin: ['/Applications/Zed.app/Contents/MacOS/zed'],
      linux: ['/usr/bin/zed'],
    },
    macApp: 'Zed',
  },
  {
    id: 'emacs',
    name: 'Emacs',
    commands: ['emacs'],
    paths: {
      win32: [process.env.PROGRAMFILES + '\\Emacs\\bin\\emacs.exe'],
      linux: ['/usr/bin/emacs'],
    },
  },
  {
    id: 'kate',
    name: 'Kate',
    commands: ['kate'],
    paths: {
      linux: ['/usr/bin/kate'],
    },
  },
  {
    id: 'gedit',
    name: 'gedit',
    commands: ['gedit'],
    paths: {
      linux: ['/usr/bin/gedit'],
    },
  },
  {
    id: 'geany',
    name: 'Geany',
    commands: ['geany'],
    paths: {
      linux: ['/usr/bin/geany'],
    },
  },
]

/** Detection result TTL: editors change rarely, so cache generously. */
const DETECT_TTL_MS = 300_000
let detectCache: { at: number; editors: EditorInfo[] } | undefined

/**
 * Windows: one `reg query ... /s` dump of the whole `App Paths` subtree,
 * parsed into `exeName -> install path`. A single subprocess replaces dozens
 * of per-key queries — spawning `reg.exe` cold on Windows is ~1s each, which
 * was the real source of the page-switch lag.
 */
let appPathsCache: Map<string, string> | undefined
async function loadAppPaths(): Promise<Map<string, string>> {
  if (appPathsCache !== undefined) return appPathsCache
  const map = new Map<string, string>()
  if (process.platform === 'win32') {
    const stdout = await runCommand('reg.exe', [
      'query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', '/s',
    ])
    // Rows: `...\App Paths\idea64.exe` then `(Default) REG_SZ <path>`.
    let currentExe: string | undefined
    for (const line of stdout.split(/\r?\n/)) {
      const keyMatch = /App Paths\\([^\r\n]+)\s*$/.exec(line)
      if (keyMatch !== null) {
        currentExe = keyMatch[1]?.trim().toLowerCase()
        continue
      }
      const valueMatch = /REG_SZ\s+(\S.*)$/.exec(line)
      if (currentExe !== undefined && valueMatch !== null) {
        const path = valueMatch[1]?.trim()
        if (path !== undefined && path !== '' && existsSync(path)) map.set(currentExe, path)
        currentExe = undefined
      }
    }
  }
  appPathsCache = map
  return map
}

/** Run one command, collecting stdout; never blocks the event loop. */
function runCommand(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.on('error', () => { resolve('') })
    child.on('close', () => { resolve(stdout) })
  })
}

/** Resolve one CLI name to its first PATH hit, or undefined when absent. */
function resolveCommand(command: string): string | undefined {
  // PATH parse, not `where`: reading the environment is instant, while a
  // `where` subprocess costs ~1s per command on Windows. Match `where`'s
  // PATHEXT semantics: try the bare name, then .exe/.cmd/.bat.
  const onWindows = process.platform === 'win32'
  const candidates = onWindows
    ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
    : [command]
  const dirs = (process.env.PATH ?? '').split(onWindows ? ';' : ':')
  const sep = onWindows ? '\\' : '/'
  for (const dir of dirs) {
    if (dir === '') continue
    const base = dir.replace(/[/\\]+$/, '')
    for (const name of candidates) {
      const candidate = `${base}${sep}${name}`
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * Windows: resolve one `App Paths` registry entry from the bulk-loaded map.
 * @param exeName - registry key name, e.g. `idea64.exe`.
 * @returns the path, or undefined when the key or value is absent.
 */
async function resolveAppPath(exeName: string): Promise<string | undefined> {
  const map = await loadAppPaths()
  return map.get(exeName.toLowerCase())
}

/** The VS Installer locator, present on any machine with VS 2017 or newer. */
const VSWHERE = 'vswhere.exe'

/**
 * Windows: locate Visual Studio's `devenv.exe` via Microsoft's `vswhere`
 * (ships with the VS Installer). VS instances can live on any drive, so fixed
 * paths cannot find them; vswhere reports the authoritative install location.
 * @returns the devenv.exe path, or undefined when no instance is found.
 */
async function resolveVswhere(): Promise<string | undefined> {
  const dir = process.env['PROGRAMFILES(X86)'] + '\\Microsoft Visual Studio\\Installer'
  const vswhere = dir + '\\' + VSWHERE
  if (!existsSync(vswhere)) return undefined
  const stdout = await runCommand(vswhere, [
    '-latest', '-products', '*',
    '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property', 'productPath',
  ])
  const path = stdout.trim()
  return path !== '' && existsSync(path) ? path : undefined
}

/** Probe one candidate on the current platform. */
async function resolveCandidate(candidate: EditorCandidate): Promise<EditorInfo | undefined> {
  if (process.platform === 'win32') {
    // App Paths first: the registry records the real install path for
    // standalone installs on any drive.
    for (const exeName of candidate.appPaths ?? []) {
      const path = await resolveAppPath(exeName)
      if (path !== undefined) {
        return { id: candidate.id, name: candidate.name, command: path }
      }
    }
    if (candidate.vswhere === true) {
      const path = await resolveVswhere()
      if (path !== undefined) {
        return { id: candidate.id, name: candidate.name, command: path }
      }
    }
  }
  if (process.platform === 'darwin' && candidate.macApp !== undefined) {
    const bundle = `/Applications/${candidate.macApp}.app`
    if (existsSync(bundle)) {
      return { id: candidate.id, name: candidate.name, command: 'open', args: ['-a', candidate.macApp] }
    }
  }
  for (const path of candidate.paths[process.platform] ?? []) {
    if (path !== undefined && existsSync(path)) {
      return { id: candidate.id, name: candidate.name, command: path }
    }
  }
  for (const command of candidate.commands) {
    const resolved = await resolveCommand(command)
    if (resolved !== undefined) {
      return { id: candidate.id, name: candidate.name, command: resolved }
    }
  }
  return undefined
}

/**
 * Detect every editor on this machine, caching the result for the TTL. Probes
 * run async (`spawn`, never `spawnSync`) under a small concurrency window:
 * spawning dozens of `where`/`reg.exe` processes at once is itself slow on
 * Windows, and page-switch lag came from exactly that burst. A cold detection
 * therefore settles in about a second while the event loop stays responsive.
 */
async function detectEditors(): Promise<EditorInfo[]> {
  const now = Date.now()
  if (detectCache !== undefined && now - detectCache.at < DETECT_TTL_MS) {
    return detectCache.editors
  }
  const results = await mapWithConcurrency(CANDIDATES, 4, resolveCandidate)
  const editors = results.flatMap(resolved => resolved === undefined ? [] : [resolved])
  detectCache = { at: now, editors }
  return editors
}

/** Map async work over a list with a fixed concurrency window (no process burst). */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index] as T)
    }
  })
  await Promise.all(runners)
  return results
}

/** The Remote service: browser-facing endpoints for detection and launching. */
export class EditorLauncherService extends TypertRemoteService {
  /**
   * Register the service under the `editorLauncher` context key.
   * @param ctx - Host context (the plugin apply context).
   */
  constructor(ctx: Context) {
    super(ctx, 'editorLauncher')
  }

  /**
   * List every detected editor on this machine (cached for the detection TTL).
   * @returns resolved editor entries in candidate order.
   */
  @Remote('listEditors')
  async listEditors(): Promise<EditorInfo[]> {
    return detectEditors()
  }

  /**
   * Open one file with a previously detected editor.
   * @param editorId - editor id returned by {@link listEditors}.
   * @param filePath - absolute path to open.
   * @returns success, or a stable error string for an unknown editor or a failed spawn.
   */
  @Remote('openWith')
  async openWith(editorId: string, filePath: string): Promise<OpenResult> {
    const candidate = CANDIDATES.find(item => item.id === editorId)
    if (candidate === undefined) {
      return { ok: false, error: `unknown editor "${editorId}"` }
    }
    const editor = await resolveCandidate(candidate)
    if (editor === undefined) {
      return { ok: false, error: `editor "${candidate.name}" is no longer available` }
    }
    const args = [...(editor.args ?? []), filePath]
    // `.cmd`/`.bat` shims (VS Code, JetBrains launchers) need a shell to execute.
    const lower = editor.command.toLowerCase()
    const shell = process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))
    try {
      const child = spawn(editor.command, args, {
        detached: true,
        stdio: 'ignore',
        shell,
        windowsHide: true,
      })
      child.unref()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/**
 * Mount the Host half: constructing the service registers it on the context,
 * which is what makes its `@Remote` endpoints claimable through the Gateway.
 * @param ctx - Host context.
 */
export function apply(ctx: Context): void {
  new EditorLauncherService(ctx)
}
