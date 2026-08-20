/**
 * Windows 通知通道：一个常驻 STA PowerShell。
 * 身份（快捷方式 / AUMID）只在缺或坏了时登记；之后每条通知只发 XML。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NotifyRequest, NotifyResult } from './types.ts'
import {
  DEFAULT_APPROVAL_WAIT_MS,
  TOAST_APP_ID,
  TOAST_DISPLAY_NAME,
  buildToastXml,
  toastIconPath,
} from './windows-toast.ts'

function resolveScript(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url))
  const dirs = [here, join(here, '..')]
  for (const dir of dirs) {
    const path = join(dir, 'show-toast.ps1')
    if (existsSync(path)) return path
  }
  return undefined
}

function b64utf8(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function newToastTag(): string {
  return `tn${Date.now().toString(36).slice(-8)}${Math.random().toString(36).slice(2, 6)}`
}

/** 本机通知回传目录。 */
function toastClickDir(): string {
  const root = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(root, 'DeepSeek Harness')
}

/**
 * 这一次审批专用的点击回传文件，避免并行审批互相覆盖。
 * @param tag - 本次 SHOW 的 tag。
 */
function toastClickPath(tag: string): string {
  return join(toastClickDir(), `toast-click-${tag}.txt`)
}

/** 任务取消时通知助手结束等待，不杀掉常驻进程。 */
function requestToastAbort(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, 'abort\n', 'utf8')
  } catch {
    /* 助手可能已退出 */
  }
}

function removeToastClick(path: string): void {
  try { unlinkSync(path) } catch { /* 可能已读走 */ }
  try { unlinkSync(`${path}.ready`) } catch { /* 可能未创建 */ }
}

/** 读走点击回传文件。只有允许/拒绝算数；关闭/超时写的 deferred 不算按钮。 */
function consumeToastClick(path: string): 'allowed-once' | 'rejected' | undefined {
  if (!existsSync(path)) return undefined
  try {
    const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trim()
    unlinkSync(path)
    if (text.includes('allowed-once')) return 'allowed-once'
    if (text.includes('rejected')) return 'rejected'
  } catch {
    /* 助手可能正在读写 */
  }
  return undefined
}

function parseLine(line: string): NotifyResult {
  const trimmed = line.replace(/^\uFEFF/, '').trim()
  if (trimmed === 'ok') return { ok: true, channel: 'windows-toast' }
  if (trimmed === 'allowed-once' || trimmed === 'rejected' || trimmed === 'deferred') {
    return { ok: true, channel: 'windows-toast', action: trimmed }
  }
  if (trimmed.startsWith('error ')) {
    return { ok: false, error: trimmed.slice(6).trim() || 'toast helper error' }
  }
  return { ok: false, error: trimmed === '' ? 'empty toast helper reply' : trimmed }
}

/** 常驻 PowerShell 通知助手。同一时刻只处理一条 SHOW。 */
class ToastChannel {
  private child: ChildProcess | undefined
  private buffer = ''
  private waiters: Array<(line: string) => void> = []
  private start: Promise<void> | undefined
  private queue: Promise<void> = Promise.resolve()
  private ready = false

  /**
   * 拉起助手进程；已在跑则立刻返回。
   */
  ensureStarted(): Promise<void> {
    if (this.ready && this.child?.pid !== undefined && !this.child.killed) {
      return Promise.resolve()
    }
    if (this.start === undefined) {
      this.start = this.spawnHelper().then(
        () => { this.start = undefined },
        (error: unknown) => {
          this.start = undefined
          throw error
        },
      )
    }
    return this.start
  }

  /** 关掉助手。插件卸载时调用。 */
  dispose(): void {
    this.ready = false
    this.start = undefined
    const child = this.child
    this.child = undefined
    this.flushWaiters('error toast helper disposed')
    if (child === undefined) return
    try { child.stdin?.write('QUIT\n') } catch { /* 进程可能已死 */ }
    child.kill()
  }

  /**
   * 排队弹出一条通知。
   * @param request - 标题、正文、可选审批等待。
   */
  send(request: NotifyRequest): Promise<NotifyResult> {
    return new Promise((resolve) => {
      this.queue = this.queue.then(async () => {
        try {
          resolve(await this.sendNow(request))
        } catch (error) {
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })
    })
  }

  private async sendNow(request: NotifyRequest): Promise<NotifyResult> {
    try {
      await this.ensureStarted()
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    const child = this.child
    if (child?.stdin == null) {
      return { ok: false, error: 'toast helper stdin is missing' }
    }
    const wait = request.approvalActions === true
    const waitMs = wait ? (request.waitMs ?? DEFAULT_APPROVAL_WAIT_MS) : 0
    const tag = wait ? newToastTag() : '-'
    const clickFile = wait ? toastClickPath(tag) : ''
    const encoded = Buffer.from(buildToastXml(request), 'utf8').toString('base64')
    const line = `SHOW ${String(waitMs)} ${tag} ${encoded}`
    const timeoutMs = waitMs > 0 ? waitMs + 4000 : 15_000
    if (request.signal?.aborted === true) {
      return { ok: true, channel: 'windows-toast', action: 'deferred' }
    }
    let onAbort: () => void = () => {}
    const reply = this.waitLine(timeoutMs)
    onAbort = () => {
      if (clickFile !== '') requestToastAbort(clickFile)
    }
    request.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      child.stdin.write(`${line}\n`)
      const result = parseLine(await reply)
      if (!wait) return result
      if (result.ok && (result.action === 'allowed-once' || result.action === 'rejected')) return result
      const extra = consumeToastClick(clickFile)
      if (extra !== undefined) {
        return { ok: true, channel: 'windows-toast', action: extra }
      }
      return { ok: true, channel: 'windows-toast', action: 'deferred' }
    } catch (error) {
      this.killHelper()
      if (wait) return { ok: true, channel: 'windows-toast', action: 'deferred' }
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      request.signal?.removeEventListener('abort', onAbort)
      if (clickFile !== '') removeToastClick(clickFile)
    }
  }

  private waitLine(timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(waiter => waiter !== onLine)
        reject(new Error('toast helper timed out'))
      }, timeoutMs)
      const onLine = (line: string): void => {
        clearTimeout(timer)
        resolve(line)
      }
      this.waiters.push(onLine)
    })
  }

  private flushWaiters(line: string): void {
    const waiters = this.waiters
    this.waiters = []
    for (const waiter of waiters) waiter(line)
  }

  private killHelper(): void {
    this.ready = false
    this.start = undefined
    const child = this.child
    this.child = undefined
    this.flushWaiters('error toast helper killed')
    child?.kill()
  }

  private spawnHelper(): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = resolveScript()
      if (scriptPath === undefined) {
        reject(new Error('show-toast.ps1 is missing from the plugin bundle'))
        return
      }
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ], {
        windowsHide: true,
        env: {
          ...process.env,
          DSH_TOAST_APP_ID: TOAST_APP_ID,
          DSH_TOAST_NAME_B64: b64utf8(TOAST_DISPLAY_NAME),
          DSH_TOAST_PNG_B64: b64utf8(toastIconPath() ?? ''),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.child = child
      this.buffer = ''
      this.ready = false
      if (child.stdout === null || child.stdin === null) {
        child.kill()
        this.child = undefined
        reject(new Error('failed to pipe toast helper stdio'))
        return
      }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { this.onStdout(String(chunk)) })
      let stderr = ''
      child.stderr?.on('data', (chunk: string) => { stderr += String(chunk) })
      const timer = setTimeout(() => {
        this.killHelper()
        reject(new Error('toast helper did not become ready'))
      }, 30_000)
      const onReady = (line: string): void => {
        clearTimeout(timer)
        if (line.replace(/^\uFEFF/, '').trim() === 'ready') {
          this.ready = true
          resolve()
          return
        }
        this.killHelper()
        reject(new Error(line.trim() === '' ? (stderr.trim() || 'toast helper failed to start') : line))
      }
      this.waiters.push(onReady)
      child.on('error', (error) => {
        clearTimeout(timer)
        this.ready = false
        this.child = undefined
        reject(error)
      })
      child.on('close', () => {
        this.ready = false
        if (this.child === child) this.child = undefined
        this.flushWaiters('error toast helper exited')
      })
    })
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const index = this.buffer.indexOf('\n')
      if (index < 0) break
      let line = this.buffer.slice(0, index)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim() === '') continue
      if (line.includes('EventRegistrationToken')) continue
      const waiter = this.waiters.shift()
      if (waiter !== undefined) waiter(line)
    }
  }
}

const channel = new ToastChannel()

/**
 * 插件加载时预热通道。失败不抛，留给第一次 notify。
 */
export function ensureWindowsToastChannel(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  return channel.ensureStarted().catch(() => undefined)
}

/** 插件卸载时关掉常驻进程。 */
export function disposeWindowsToastChannel(): void {
  channel.dispose()
}

/**
 * 经常驻通道弹出 Windows 通知。
 * @param request - 标题、正文、可选审批等待。
 */
export function sendWindowsToast(request: NotifyRequest): Promise<NotifyResult> {
  return channel.send(request)
}
