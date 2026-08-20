/**
 * macOS 系统通知：Web 宿主（普通 Node）走 osascript。
 * AppleScript 字符串必须转义；本机不验收这条通道。
 */

import { spawn } from 'node:child_process'
import type { NotifyRequest, NotifyResult } from './types.ts'

/**
 * 把用户文本放进 AppleScript 双引号字符串之前先收成一行再转义。
 * 换行、回车和其他控制字符会拆开 `-e` 脚本，osascript 会失败。
 */
function escapeAppleScript(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/**
 * 用 `osascript display notification` 弹出一条 macOS 通知。
 * @param request - 标题、正文、是否出声。
 * @returns 成功或稳定错误字符串。
 */
export function showMacOsToast(request: NotifyRequest): Promise<NotifyResult> {
  const title = escapeAppleScript(request.title)
  const body = escapeAppleScript(request.body)
  const sound = request.sound === false ? '' : ' sound name "default"'
  const source = `display notification "${body}" with title "${title}"${sound}`
  return new Promise((resolve) => {
    const child = spawn('osascript', ['-e', source], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', (error) => {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, channel: 'osascript' })
        return
      }
      const detail = stderr.trim()
      resolve({
        ok: false,
        error: detail === '' ? `osascript exited ${String(code)}` : detail,
      })
    })
  })
}
