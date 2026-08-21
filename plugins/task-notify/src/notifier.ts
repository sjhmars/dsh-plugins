/**
 * 桌面通知提供方：任务结束 / 提问时 Desktop 优先 Electron Notification（点一下能唤回窗口）；
 * Windows 上批准工具一律走带按钮的卡片，Web 与 Desktop 相同。
 */

import type { DesktopNotifier, NotifyRequest, NotifyResult } from './types.ts'
import { showMacOsToast } from './macos-toast.ts'
import { sendWindowsToast } from './toast-channel.ts'

/** Electron 主进程里动态 import 的最小类型，避免把 electron 写成硬依赖。 */
interface ElectronNotificationApi {
  isSupported(): boolean
  new (options: { title: string; body: string; silent?: boolean }): {
    show(): void
    on(event: 'click', listener: () => void): void
  }
}

interface ElectronBrowserWindowApi {
  getAllWindows(): Array<{ isFocused(): boolean; show(): void; focus(): void }>
}

interface ElectronModule {
  Notification: ElectronNotificationApi
  BrowserWindow: ElectronBrowserWindowApi
}

/** 当前进程是否跑在 Electron 主进程里。 */
function isElectronMain(): boolean {
  return process.versions.electron !== undefined
}

/**
 * 动态加载 electron。Web 宿主没有这个模块，失败时返回 undefined。
 */
async function loadElectron(): Promise<ElectronModule | undefined> {
  if (!isElectronMain()) return undefined
  try {
    const specifier = 'electron'
    return await import(specifier) as unknown as ElectronModule
  } catch {
    // 主进程标志在、但模块解析失败：退回操作系统通道。
    return undefined
  }
}

/**
 * 当前是否有已聚焦的桌面窗口。仅 Electron 能判断；Web 浏览器无法从 Host 得知。
 */
export async function isDesktopWindowFocused(): Promise<boolean> {
  const electron = await loadElectron()
  if (electron === undefined) return false
  return electron.BrowserWindow.getAllWindows().some(window => window.isFocused())
}

/** Host 桌面通知提供方：Electron，否则 Windows / macOS 系统通知。 */
export class HostDesktopNotifier implements DesktopNotifier {
  /**
   * 弹出一条通知：Windows 批准走带按钮的卡片；其余先试 Electron，再按平台回退。
   * @param request - 标题、正文、声音，以及可选的审批等待。
   */
  async notify(request: NotifyRequest): Promise<NotifyResult> {
    if (request.approvalActions === true && process.platform === 'win32') {
      return sendWindowsToast(request)
    }
    const electronResult = await this.notifyElectron(request)
    if (electronResult !== undefined) return electronResult
    if (process.platform === 'win32') return sendWindowsToast(request)
    if (process.platform === 'darwin') return showMacOsToast(request)
    return { ok: false, error: `desktop notifications are unsupported on ${process.platform}` }
  }

  /**
   * 在 Electron 主进程弹出原生通知；点通知会唤回第一扇窗口。
   * @returns 未处于 Electron 或不受支持时返回 undefined，让调用方走下一条通道。
   */
  private async notifyElectron(request: NotifyRequest): Promise<NotifyResult | undefined> {
    const electron = await loadElectron()
    if (electron === undefined) return undefined
    if (!electron.Notification.isSupported()) return undefined
    try {
      const notification = new electron.Notification({
        title: request.title,
        body: request.body,
        silent: request.sound === false,
      })
      notification.on('click', () => {
        const window = electron.BrowserWindow.getAllWindows()[0]
        if (window === undefined) return
        window.show()
        window.focus()
      })
      notification.show()
      return { ok: true, channel: 'electron' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
