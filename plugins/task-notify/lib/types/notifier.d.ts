/**
 * 桌面通知提供方：Desktop 优先 Electron Notification（点一下能唤回窗口），
 * 否则按平台走 Windows Toast 或 macOS osascript。
 */
import type { DesktopNotifier, NotifyRequest, NotifyResult } from './types.ts';
/**
 * 当前是否有已聚焦的桌面窗口。仅 Electron 能判断；Web 浏览器无法从 Host 得知。
 */
export declare function isDesktopWindowFocused(): Promise<boolean>;
/** Host 桌面通知提供方：Electron，否则 Windows / macOS 系统通知。 */
export declare class HostDesktopNotifier implements DesktopNotifier {
    /**
     * 弹出一条通知：先试 Electron，再按平台回退。
     * Windows 审批等待时带按钮；Electron / macOS 忽略按钮，调用方视为未做决定。
     * @param request - 标题、正文、声音，以及可选的审批等待。
     */
    notify(request: NotifyRequest): Promise<NotifyResult>;
    /**
     * 在 Electron 主进程弹出原生通知；点通知会唤回第一扇窗口。
     * @returns 未处于 Electron 或不受支持时返回 undefined，让调用方走下一条通道。
     */
    private notifyElectron;
}
//# sourceMappingURL=notifier.d.ts.map