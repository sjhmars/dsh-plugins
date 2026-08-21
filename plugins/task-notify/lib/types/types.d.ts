/**
 * 桌面通知能力的稳定接口：请求、结果、提供方。
 * Host 与后续可能的替换提供方都只依赖这里的类型。
 */
/** 审批气泡等待结束后的结果。只有两个按钮算出裁决。 */
export type ToastWaitAction = 'allowed-once' | 'rejected' | 'deferred';
/** 一次桌面通知请求。 */
export interface NotifyRequest {
    /** 通知标题（任务栏气泡第一行）。 */
    readonly title: string;
    /** 通知正文。 */
    readonly body: string;
    /** 触发这次通知的会话 id，仅作诊断，不参与展示。 */
    readonly sessionId?: string;
    /** 是否播放系统提示音。 */
    readonly sound?: boolean;
    /**
     * 为 true 时 Windows 弹出带「拒绝 / 允许一次」的卡片，并等到点击、关闭或超时。
     * Web 与 Desktop 在 Windows 上相同；macOS / Linux 忽略此项，通知仍只提醒。
     */
    readonly approvalActions?: boolean;
    /** 审批气泡最长等待毫秒数。未设时由 Windows 通道默认 10000。 */
    readonly waitMs?: number;
    /** 中止等待（任务取消）。不把 abort 当成拒绝。 */
    readonly signal?: AbortSignal;
}
/** 一次弹出尝试的结果。 */
export type NotifyResult = {
    ok: true;
    channel: NotifyChannel;
    action?: ToastWaitAction;
} | {
    ok: false;
    error: string;
};
/** 实际弹出通知的通道。 */
export type NotifyChannel = 'electron' | 'windows-toast' | 'osascript';
/**
 * 桌面通知提供方。Host 上的消费者只调用这个接口，
 * 不关心 Windows Toast、Electron 还是 macOS osascript。
 */
export interface DesktopNotifier {
    /**
     * 弹出一条桌面通知。
     * @param request - 标题、正文、声音；审批等待时带按钮与超时。
     * @returns 成功时带通道名；审批等待时带 `action`。失败时带稳定错误字符串，永不抛出。
     */
    notify(request: NotifyRequest): Promise<NotifyResult>;
}
//# sourceMappingURL=types.d.ts.map