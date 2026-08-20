/**
 * Host 半部：桌面通知能力 = 接口（DesktopNotifier）+ Electron/Windows/macOS
 * 提供方 + 三类消费者（任务结束、权限审批、向用户提问）。
 * Web 与 Desktop 共用同一条 Host 组合，无需浏览器 Notification 权限。
 * （样式复测：新样式卡片，点任意按钮验证。）
 * @module @sjhmars/task-notify
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import Schema from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { HostDesktopNotifier, isDesktopWindowFocused } from "./notifier.js";
import { disposeWindowsToastChannel, ensureWindowsToastChannel } from "./toast-channel.js";
/** Cordis 插件名。 */
export const name = 'task-notify';
/** 等 agent 注册表就绪后再挂监听。 */
export const inject = ['agents'];
/** Schemastery 校验；缺省字段在加载时填入默认值。 */
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    notifyOnIdle: Schema.boolean().default(true),
    notifyOnApproval: Schema.boolean().default(true),
    notifyOnQuestion: Schema.boolean().default(true),
    notifySubagents: Schema.boolean().default(false),
    skipWhenFocused: Schema.boolean().default(false),
    title: Schema.string().default('DeepSeek Harness'),
    sound: Schema.boolean().default(true),
    previewMaxChars: Schema.number().min(1).default(120),
    approvalWaitMs: Schema.number().min(1).default(10_000),
});
/** 截断正文预览。 */
function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}…`;
}
/** 把 turn/end 的 kind 翻成用户能看懂的一句中文。 */
function outcomeLabel(kind) {
    switch (kind) {
        case 'completed': return '任务已完成';
        case 'error': return '任务出错';
        case 'aborted': return '任务已停止';
        case 'blocked': return '任务被拦截';
        case 'max-tokens': return '输出达到上限';
        case 'interrupted': return '任务已中断';
        default: return '任务已结束';
    }
}
/** 从日志里取最近一次 turn/end 的 kind；没有则当作完成。 */
function lastTurnKind(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'turn/end')
            return event.data.reason.kind;
    }
    return 'completed';
}
/** 从日志里取最近一条会话标题（不依赖 sessionTitle 服务）。 */
function lastSessionTitle(events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event === undefined)
            continue;
        if (event.type !== 'session/title')
            continue;
        const title = event.data.title;
        if (typeof title === 'string' && title.trim() !== '')
            return title.trim();
    }
    return undefined;
}
/** 从助手消息里抽出可见文本。 */
function assistantText(event) {
    const parts = [];
    for (const block of event.data.message.content) {
        if (block.type === 'text')
            parts.push(block.text);
    }
    return parts.join('').trim();
}
/** 最近一条非空助手回复的截断预览。 */
function lastAssistantPreview(events, maxChars) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type !== 'assistant/message')
            continue;
        const text = assistantText(event);
        if (text === '')
            continue;
        return truncate(text, maxChars);
    }
    return undefined;
}
/** 是否应跳过这个 agent（默认不通知 subagent）。 */
function skipAgent(agent, config) {
    if (agent === undefined)
        return false;
    return !config.notifySubagents && agent.session.header.origin === 'subagent';
}
/** 带会话标题的通知抬头。 */
function titled(config, events) {
    if (events === undefined)
        return config.title;
    const sessionTitle = lastSessionTitle(events);
    return sessionTitle === undefined ? config.title : `${config.title} · ${sessionTitle}`;
}
/**
 * 把一次刚结束的 agent 活动收成通知标题和正文。
 * @param agent - 刚回到 idle 的 agent。
 * @param config - 插件配置。
 */
export function buildIdleRequest(agent, config) {
    const events = agent.session.events;
    const outcome = outcomeLabel(lastTurnKind(events));
    const preview = lastAssistantPreview(events, config.previewMaxChars);
    const body = preview === undefined ? outcome : `${outcome}：${preview}`;
    return {
        title: titled(config, events),
        body,
        sessionId: agent.id,
        sound: config.sound,
    };
}
/**
 * 权限审批问人时的通知文案。
 * @param req - waterfall 里的只读审批请求。
 * @param config - 插件配置。
 */
export function buildApprovalRequest(req, config) {
    const reason = req.reason === undefined || req.reason.trim() === '' ? undefined : req.reason.trim();
    const detail = reason === undefined ? req.toolName : `${req.toolName}（${reason}）`;
    return {
        title: '需要你批准',
        body: truncate(detail, Math.min(config.previewMaxChars, 80)),
        sessionId: req.agent.id,
        sound: config.sound,
    };
}
/**
 * 向用户提问时的通知文案。
 * @param request - userQuestions.ask 的原始请求。
 * @param config - 插件配置。
 */
export function buildQuestionRequest(request, config) {
    const first = request.questions[0];
    const prompt = first === undefined ? '需要你回答' : first.question.trim();
    const prefix = first?.intent?.kind === 'plan-review' ? '需要你审阅计划' : '需要你回答';
    const body = first === undefined || prompt === '' ? prefix : `${prefix}：${prompt}`;
    return {
        title: titled(config, request.agent?.session.events),
        body: truncate(body, config.previewMaxChars),
        ...(request.agent === undefined ? {} : { sessionId: request.agent.id }),
        sound: config.sound,
    };
}
/** 对外服务：实现 DesktopNotifier，同时把 notify 发布成 Typert Remote。 */
let TaskNotifyService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _notify_decorators;
    let _getEnabled_decorators;
    return class TaskNotifyService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _notify_decorators = [Remote('notify')];
            _getEnabled_decorators = [Remote('getEnabled')];
            __esDecorate(this, null, _notify_decorators, { kind: "method", name: "notify", static: false, private: false, access: { has: obj => "notify" in obj, get: obj => obj.notify }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getEnabled_decorators, { kind: "method", name: "getEnabled", static: false, private: false, access: { has: obj => "getEnabled" in obj, get: obj => obj.getEnabled }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        notifier = __runInitializers(this, _instanceExtraInitializers);
        config;
        /**
         * @param ctx - Host 上下文。
         * @param notifier - 实际弹出系统通知的提供方。
         * @param config - 已校验的插件配置。
         */
        constructor(ctx, notifier, config) {
            super(ctx, 'taskNotify');
            this.notifier = notifier;
            this.config = config;
        }
        /**
         * 弹出一条桌面通知。其他插件也可调用。
         * @param request - 标题、正文、声音。
         */
        async notify(request) {
            return this.notifier.notify(request);
        }
        /**
         * 当前总开关（只读镜像，改配置走 cordis.yml / overlay）。
         */
        async getEnabled() {
            return this.config.enabled;
        }
    };
})();
export { TaskNotifyService };
/**
 * 按需跳过聚焦窗口后弹出通知；失败只打日志，不影响 agent 循环。
 */
async function fire(ctx, service, config, request) {
    try {
        if (config.skipWhenFocused && await isDesktopWindowFocused())
            return;
        const result = await service.notify(request);
        if (!result.ok)
            ctx.logger.warn(`task-notify: ${result.error}`);
    }
    catch (error) {
        ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * 弹出带按钮的审批气泡并等待。只有两个按钮返回裁决；关闭、超时、点空白、失败都是 deferred。
 * @param req - 当前审批请求，用于文案和 abort。
 * @returns 两个按钮算出裁决；其余情况都是 deferred。
 */
async function waitApprovalToast(ctx, service, config, req) {
    try {
        if (config.skipWhenFocused && await isDesktopWindowFocused())
            return 'deferred';
        const result = await service.notify({
            ...buildApprovalRequest(req, config),
            approvalActions: true,
            waitMs: config.approvalWaitMs,
            ...(req.signal === undefined ? {} : { signal: req.signal }),
        });
        if (!result.ok) {
            ctx.logger.warn(`task-notify: ${result.error}`);
            return 'deferred';
        }
        if (result.action === 'allowed-once' || result.action === 'rejected')
            return result.action;
        return 'deferred';
    }
    catch (error) {
        ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`);
        return 'deferred';
    }
}
/**
 * 挂载 Host 半部：登记服务，并在任务结束、审批问人、向用户提问时弹出通知。
 * @param ctx - Host 上下文。
 * @param config - 已校验配置。
 */
export function apply(ctx, config) {
    if (process.platform === 'win32') {
        void ensureWindowsToastChannel();
        ctx.effect(() => () => {
            disposeWindowsToastChannel();
        }, 'task-notify: toast channel');
    }
    const notifier = new HostDesktopNotifier();
    const service = new TaskNotifyService(ctx, notifier, config);
    const seenRunning = new WeakSet();
    // 插件晚于任务启动才加载时，把当前已在跑的 agent 算作已经 running。
    for (const agent of ctx.agents.list()) {
        if (agent.status === 'running')
            seenRunning.add(agent);
    }
    ctx.on('agent/status', ({ agent, status }) => {
        if (status === 'running') {
            seenRunning.add(agent);
            return;
        }
        if (status !== 'idle' || !seenRunning.has(agent))
            return;
        seenRunning.delete(agent);
        if (!config.enabled || !config.notifyOnIdle)
            return;
        if (skipAgent(agent, config))
            return;
        void fire(ctx, service, config, buildIdleRequest(agent, config));
    });
    // 审批：点气泡按钮则短路裁决；关掉立刻 next 给网页黄框；超时同样 next。
    ctx.on('approval/request', async (req, next) => {
        if (!config.enabled || !config.notifyOnApproval || skipAgent(req.agent, config)) {
            return next();
        }
        const action = await waitApprovalToast(ctx, service, config, req);
        if (action === 'allowed-once' || action === 'rejected') {
            ctx.logger.info(`task-notify: approval toast ${action}`);
            return action;
        }
        ctx.logger.info('task-notify: approval toast deferred, yellow box next');
        return next();
    }, { prepend: true });
    ctx.inject(['userQuestions'], (inner) => {
        const questions = inner.userQuestions;
        const original = questions.ask;
        questions.ask = function wrappedAsk(request) {
            if (config.enabled && config.notifyOnQuestion && !skipAgent(request.agent, config)) {
                void fire(ctx, service, config, buildQuestionRequest(request, config));
            }
            return original.call(this, request);
        };
        inner.effect(() => () => {
            questions.ask = original;
        }, 'task-notify: restore userQuestions.ask');
    });
}
//# sourceMappingURL=index.js.map