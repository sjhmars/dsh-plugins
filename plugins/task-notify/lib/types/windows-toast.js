/**
 * 通过 Windows Runtime Toast API 弹出系统通知（Web 宿主走这条路径）。
 * XML 以 UTF-8 Base64 传入，避免中文在环境变量里被 PowerShell 5 编码弄乱。
 * 左上角来源图标来自开始菜单快捷方式的 AUMID，不在正文里塞产品图。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** 通知身份。换过一次以免沿用已缓存的无图标 AUMID。 */
export const TOAST_APP_ID = 'DeepSeek.Harness';
/** 通知中心和气泡顶栏显示的应用名。 */
export const TOAST_DISPLAY_NAME = 'DeepSeek Harness';
/** 把用户文本放进 Toast XML 之前先转义。 */
function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/** 打包在 `lib/` 的资源；overlay 加载时与 `lib/index.js` 同目录。 */
function resolveAsset(fileName) {
    const here = dirname(fileURLToPath(import.meta.url));
    const dirs = [here, join(here, '..'), join(here, '..', 'assets'), join(here, '..', '..', 'assets')];
    for (const dir of dirs) {
        const path = join(dir, fileName);
        if (existsSync(path))
            return path;
    }
    return undefined;
}
/** 用于画开始菜单小图标的产品 PNG。 */
export function toastIconPath() {
    return resolveAsset('icon.png');
}
/** 审批气泡默认最长等待。关掉或超时都不算拒绝。 */
export const DEFAULT_APPROVAL_WAIT_MS = 10_000;
/**
 * 组装 Toast XML。正文只有标题和文字，来源栏图标不走这里。
 * 审批等待时带「拒绝」「允许一次」；关闭、点空白、超时都不走这两个 arguments。
 * @param request - 标题、正文、是否出声、是否带审批按钮。
 */
export function buildToastXml(request) {
    const title = escapeXml(request.title);
    const body = escapeXml(request.body);
    const audio = request.sound === false
        ? '<audio silent="true"/>'
        : '<audio src="ms-winsoundevent:Notification.Default"/>';
    if (request.approvalActions !== true) {
        return ('<toast><visual><binding template="ToastGeneric">'
            + `<text>${title}</text><text>${body}</text>`
            + `</binding></visual>${audio}</toast>`);
    }
    // 未打包 Win10：快捷方式 COM CLSID + 前台按钮；点允许/拒绝由助手直接回传。
    return ('<toast scenario="reminder" activationType="foreground" launch="dismiss">'
        + '<visual><binding template="ToastGeneric">'
        + `<text>${title}</text><text>${body}</text>`
        + '</binding></visual><actions>'
        + '<action content="拒绝" arguments="rejected" activationType="foreground"/>'
        + '<action content="允许一次" arguments="allowed-once" activationType="foreground"/>'
        + `</actions>${audio}</toast>`);
}
/**
 * 读 PowerShell 等待进程的最后一行。无法识别的输出一律视为未做决定。
 * @param stdout - 子进程标准输出。
 * @returns `allowed-once` / `rejected` / `deferred`。
 */
export function parseToastStdout(stdout) {
    const lines = stdout.trim().split(/\r?\n/).filter(line => line !== '');
    const line = (lines.at(-1) ?? '').replace(/^\uFEFF/, '').trim();
    if (line === 'allowed-once' || line === 'rejected')
        return line;
    return 'deferred';
}
//# sourceMappingURL=windows-toast.js.map