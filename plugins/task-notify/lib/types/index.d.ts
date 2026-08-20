/**
 * Host 半部：桌面通知能力 = 接口（DesktopNotifier）+ Electron/Windows/macOS
 * 提供方 + 三类消费者（任务结束、权限审批、向用户提问）。
 * Web 与 Desktop 共用同一条 Host 组合，无需浏览器 Notification 权限。
 * @module @sjhmars/task-notify
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval';
import type { AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions';
import type { DesktopNotifier, NotifyRequest, NotifyResult } from './types.ts';
export type { DesktopNotifier, NotifyChannel, NotifyRequest, NotifyResult, ToastWaitAction } from './types.ts';
/** Cordis 插件名。 */
export declare const name = "task-notify";
/** 等 agent 注册表就绪后再挂监听。 */
export declare const inject: string[];
/** 部署可调项。非法值在加载时失败。 */
export interface Config {
    /** 总开关。 */
    enabled: boolean;
    /** agent 从 running 回到 idle 时通知。 */
    notifyOnIdle: boolean;
    /** 权限审批真正问人时通知。 */
    notifyOnApproval: boolean;
    /** userQuestions.ask（含 ask_user_question 与计划审阅）时通知。 */
    notifyOnQuestion: boolean;
    /** 为 true 时连 subagent 子会话也通知。 */
    notifySubagents: boolean;
    /** 窗口已聚焦时跳过（仅 Desktop/Electron 能判断）。 */
    skipWhenFocused: boolean;
    /** 通知标题前缀。 */
    title: string;
    /** 是否播放系统提示音。 */
    sound: boolean;
    /** 正文预览的最大字符数。 */
    previewMaxChars: number;
    /**
     * 审批气泡最长等待毫秒数。超时后气泡这条路结束，交给网页黄框；不是拒绝。
     * 只有点「允许一次」或「拒绝」才直接裁决。
     */
    approvalWaitMs: number;
}
/** Schemastery 校验；缺省字段在加载时填入默认值。 */
export declare const Config: Schema<Config>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** 桌面通知服务，供其他插件直接弹出一条通知。 */
        taskNotify: TaskNotifyService;
    }
}
/**
 * 把一次刚结束的 agent 活动收成通知标题和正文。
 * @param agent - 刚回到 idle 的 agent。
 * @param config - 插件配置。
 */
export declare function buildIdleRequest(agent: Agent, config: Config): NotifyRequest;
/**
 * 权限审批问人时的通知文案。
 * @param req - waterfall 里的只读审批请求。
 * @param config - 插件配置。
 */
export declare function buildApprovalRequest(req: ApprovalRequest, config: Config): NotifyRequest;
/**
 * 向用户提问时的通知文案。
 * @param request - userQuestions.ask 的原始请求。
 * @param config - 插件配置。
 */
export declare function buildQuestionRequest(request: AskUserQuestionRequest, config: Config): NotifyRequest;
/** 对外服务：实现 DesktopNotifier，同时把 notify 发布成 Typert Remote。 */
export declare class TaskNotifyService extends TypertRemoteService implements DesktopNotifier {
    private readonly notifier;
    private readonly config;
    /**
     * @param ctx - Host 上下文。
     * @param notifier - 实际弹出系统通知的提供方。
     * @param config - 已校验的插件配置。
     */
    constructor(ctx: Context, notifier: DesktopNotifier, config: Config);
    /**
     * 弹出一条桌面通知。其他插件也可调用。
     * @param request - 标题、正文、声音。
     */
    notify(request: NotifyRequest): Promise<NotifyResult>;
    /**
     * 当前总开关（只读镜像，改配置走 cordis.yml / overlay）。
     */
    getEnabled(): Promise<boolean>;
}
/**
 * 挂载 Host 半部：登记服务，并在任务结束、审批问人、向用户提问时弹出通知。
 * @param ctx - Host 上下文。
 * @param config - 已校验配置。
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map