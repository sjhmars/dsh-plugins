/**
 * macOS 系统通知：Web 宿主（普通 Node）走 osascript。
 * AppleScript 字符串必须转义；本机不验收这条通道。
 */
import type { NotifyRequest, NotifyResult } from './types.ts';
/**
 * 用 `osascript display notification` 弹出一条 macOS 通知。
 * @param request - 标题、正文、是否出声。
 * @returns 成功或稳定错误字符串。
 */
export declare function showMacOsToast(request: NotifyRequest): Promise<NotifyResult>;
//# sourceMappingURL=macos-toast.d.ts.map