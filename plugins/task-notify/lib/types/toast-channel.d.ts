/**
 * Windows 通知通道：一个常驻 STA PowerShell。
 * 身份（快捷方式 / AUMID）只在缺或坏了时登记；之后每条通知只发 XML。
 */
import type { NotifyRequest, NotifyResult } from './types.ts';
/**
 * 插件加载时预热通道。失败不抛，留给第一次 notify。
 */
export declare function ensureWindowsToastChannel(): Promise<void>;
/** 插件卸载时关掉常驻进程。 */
export declare function disposeWindowsToastChannel(): void;
/**
 * 经常驻通道弹出 Windows 通知。
 * @param request - 标题、正文、可选审批等待。
 */
export declare function sendWindowsToast(request: NotifyRequest): Promise<NotifyResult>;
//# sourceMappingURL=toast-channel.d.ts.map