/**
 * 通过 Windows Runtime Toast API 弹出系统通知（Web 宿主走这条路径）。
 * XML 以 UTF-8 Base64 传入，避免中文在环境变量里被 PowerShell 5 编码弄乱。
 * 左上角来源图标来自开始菜单快捷方式的 AUMID，不在正文里塞产品图。
 */
import type { NotifyRequest, ToastWaitAction } from './types.ts';
/** 通知身份。换过一次以免沿用已缓存的无图标 AUMID。 */
export declare const TOAST_APP_ID = "DeepSeek.Harness";
/** 通知中心和气泡顶栏显示的应用名。 */
export declare const TOAST_DISPLAY_NAME = "DeepSeek Harness";
/** 用于画开始菜单小图标的产品 PNG。 */
export declare function toastIconPath(): string | undefined;
/** 审批气泡默认最长等待。关掉或超时都不算拒绝。 */
export declare const DEFAULT_APPROVAL_WAIT_MS = 10000;
/**
 * 组装 Toast XML。正文只有标题和文字，来源栏图标不走这里。
 * 审批等待时带「拒绝」「允许一次」；关闭、点空白、超时都不走这两个 arguments。
 * @param request - 标题、正文、是否出声、是否带审批按钮。
 */
export declare function buildToastXml(request: NotifyRequest): string;
/**
 * 读 PowerShell 等待进程的最后一行。无法识别的输出一律视为未做决定。
 * @param stdout - 子进程标准输出。
 * @returns `allowed-once` / `rejected` / `deferred`。
 */
export declare function parseToastStdout(stdout: string): ToastWaitAction;
//# sourceMappingURL=windows-toast.d.ts.map