/**
 * 桌面通知提供方：Desktop 优先 Electron Notification（点一下能唤回窗口），
 * 否则按平台走 Windows Toast 或 macOS osascript。
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { showMacOsToast } from "./macos-toast.js";
import { sendWindowsToast } from "./toast-channel.js";
/** 当前进程是否跑在 Electron 主进程里。 */
function isElectronMain() {
    return process.versions.electron !== undefined;
}
/**
 * 动态加载 electron。Web 宿主没有这个模块，失败时返回 undefined。
 */
async function loadElectron() {
    if (!isElectronMain())
        return undefined;
    try {
        const specifier = 'electron';
        return await import(__rewriteRelativeImportExtension(specifier));
    }
    catch {
        // 主进程标志在、但模块解析失败：退回操作系统通道。
        return undefined;
    }
}
/**
 * 当前是否有已聚焦的桌面窗口。仅 Electron 能判断；Web 浏览器无法从 Host 得知。
 */
export async function isDesktopWindowFocused() {
    const electron = await loadElectron();
    if (electron === undefined)
        return false;
    return electron.BrowserWindow.getAllWindows().some(window => window.isFocused());
}
/** Host 桌面通知提供方：Electron，否则 Windows / macOS 系统通知。 */
export class HostDesktopNotifier {
    /**
     * 弹出一条通知：先试 Electron，再按平台回退。
     * Windows 审批等待时带按钮；Electron / macOS 忽略按钮，调用方视为未做决定。
     * @param request - 标题、正文、声音，以及可选的审批等待。
     */
    async notify(request) {
        const electronResult = await this.notifyElectron(request);
        if (electronResult !== undefined)
            return electronResult;
        if (process.platform === 'win32')
            return sendWindowsToast(request);
        if (process.platform === 'darwin')
            return showMacOsToast(request);
        return { ok: false, error: `desktop notifications are unsupported on ${process.platform}` };
    }
    /**
     * 在 Electron 主进程弹出原生通知；点通知会唤回第一扇窗口。
     * @returns 未处于 Electron 或不受支持时返回 undefined，让调用方走下一条通道。
     */
    async notifyElectron(request) {
        const electron = await loadElectron();
        if (electron === undefined)
            return undefined;
        if (!electron.Notification.isSupported())
            return undefined;
        try {
            const notification = new electron.Notification({
                title: request.title,
                body: request.body,
                silent: request.sound === false,
            });
            notification.on('click', () => {
                const window = electron.BrowserWindow.getAllWindows()[0];
                if (window === undefined)
                    return;
                window.show();
                window.focus();
            });
            notification.show();
            return { ok: true, channel: 'electron' };
        }
        catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
//# sourceMappingURL=notifier.js.map