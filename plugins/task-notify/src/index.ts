/**
 * Host 半部：桌面通知能力 = 接口（DesktopNotifier）+ Electron/Windows/macOS
 * 提供方 + 三类消费者（任务结束、权限审批、向用户提问）。
 * Web 与 Desktop 共用同一条 Host 组合，无需浏览器 Notification 权限。
 * @module @sjhmars/task-notify
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionRequest, UserQuestionService } from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import { HostDesktopNotifier, isDesktopWindowFocused } from './notifier.ts'
import { disposeWindowsToastChannel, ensureWindowsToastChannel } from './toast-channel.ts'
import type { DesktopNotifier, NotifyRequest, NotifyResult, ToastWaitAction } from './types.ts'

export type { DesktopNotifier, NotifyChannel, NotifyRequest, NotifyResult, ToastWaitAction } from './types.ts'

/** Cordis 插件名。 */
export const name = 'task-notify'

/** 等 agent 注册表就绪后再挂监听。 */
export const inject = ['agents']

/** 部署可调项。非法值在加载时失败。 */
export interface Config {
  /** 总开关。 */
  enabled: boolean
  /** agent 从 running 回到 idle 时通知。 */
  notifyOnIdle: boolean
  /** 权限审批真正问人时通知。 */
  notifyOnApproval: boolean
  /** userQuestions.ask（含 ask_user_question 与计划审阅）时通知。 */
  notifyOnQuestion: boolean
  /** 为 true 时连 subagent 子会话也通知。 */
  notifySubagents: boolean
  /** 窗口已聚焦时跳过（仅 Desktop/Electron 能判断）。 */
  skipWhenFocused: boolean
  /** 通知标题前缀。 */
  title: string
  /** 是否播放系统提示音。 */
  sound: boolean
  /** 正文预览的最大字符数。 */
  previewMaxChars: number
  /**
   * 审批气泡最长等待毫秒数。超时后气泡这条路结束，交给网页黄框；不是拒绝。
   * 只有点「允许一次」或「拒绝」才直接裁决。
   */
  approvalWaitMs: number
}

/** Schemastery 校验；缺省字段在加载时填入默认值。 */
export const Config: Schema<Config> = Schema.object({
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
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 桌面通知服务，供其他插件直接弹出一条通知。 */
    taskNotify: TaskNotifyService
  }
}

/** 截断正文预览。 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}…`
}

/** 把 turn/end 的 kind 翻成用户能看懂的一句中文。 */
function outcomeLabel(kind: TurnEndReason['kind']): string {
  switch (kind) {
    case 'completed': return '任务已完成'
    case 'error': return '任务出错'
    case 'aborted': return '任务已停止'
    case 'blocked': return '任务被拦截'
    case 'max-tokens': return '输出达到上限'
    case 'interrupted': return '任务已中断'
    default: return '任务已结束'
  }
}

/** 从日志里取最近一次 turn/end 的 kind；没有则当作完成。 */
function lastTurnKind(events: readonly SessionEvent[]): TurnEndReason['kind'] {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'turn/end') return event.data.reason.kind
  }
  return 'completed'
}

/** 从日志里取最近一条会话标题（不依赖 sessionTitle 服务）。 */
function lastSessionTitle(events: readonly SessionEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined) continue
    if ((event.type as string) !== 'session/title') continue
    const title = (event.data as { title?: unknown }).title
    if (typeof title === 'string' && title.trim() !== '') return title.trim()
  }
  return undefined
}

/** 从助手消息里抽出可见文本。 */
function assistantText(event: SessionEvent<'assistant/message'>): string {
  const parts: string[] = []
  for (const block of event.data.message.content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return parts.join('').trim()
}

/** 最近一条非空助手回复的截断预览。 */
function lastAssistantPreview(events: readonly SessionEvent[], maxChars: number): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'assistant/message') continue
    const text = assistantText(event)
    if (text === '') continue
    return truncate(text, maxChars)
  }
  return undefined
}

/** 是否应跳过这个 agent（默认不通知 subagent）。 */
function skipAgent(agent: Agent | undefined, config: Config): boolean {
  if (agent === undefined) return false
  return !config.notifySubagents && agent.session.header.origin === 'subagent'
}

/** 带会话标题的通知抬头。 */
function titled(config: Config, events: readonly SessionEvent[] | undefined): string {
  if (events === undefined) return config.title
  const sessionTitle = lastSessionTitle(events)
  return sessionTitle === undefined ? config.title : `${config.title} · ${sessionTitle}`
}

/**
 * 把一次刚结束的 agent 活动收成通知标题和正文。
 * @param agent - 刚回到 idle 的 agent。
 * @param config - 插件配置。
 */
export function buildIdleRequest(agent: Agent, config: Config): NotifyRequest {
  const events = agent.session.events
  const outcome = outcomeLabel(lastTurnKind(events))
  const preview = lastAssistantPreview(events, config.previewMaxChars)
  const body = preview === undefined ? outcome : `${outcome}：${preview}`
  return {
    title: titled(config, events),
    body,
    sessionId: agent.id,
    sound: config.sound,
  }
}

/**
 * 权限审批问人时的通知文案。
 * @param req - waterfall 里的只读审批请求。
 * @param config - 插件配置。
 */
export function buildApprovalRequest(req: ApprovalRequest, config: Config): NotifyRequest {
  const reason = req.reason === undefined || req.reason.trim() === '' ? undefined : req.reason.trim()
  const detail = reason === undefined ? req.toolName : `${req.toolName}（${reason}）`
  return {
    title: '需要你批准',
    body: truncate(detail, Math.min(config.previewMaxChars, 80)),
    sessionId: req.agent.id,
    sound: config.sound,
  }
}

/**
 * 向用户提问时的通知文案。
 * @param request - userQuestions.ask 的原始请求。
 * @param config - 插件配置。
 */
export function buildQuestionRequest(request: AskUserQuestionRequest, config: Config): NotifyRequest {
  const first = request.questions[0]
  const prompt = first === undefined ? '需要你回答' : first.question.trim()
  const prefix = first?.intent?.kind === 'plan-review' ? '需要你审阅计划' : '需要你回答'
  const body = first === undefined || prompt === '' ? prefix : `${prefix}：${prompt}`
  return {
    title: titled(config, request.agent?.session.events),
    body: truncate(body, config.previewMaxChars),
    ...(request.agent === undefined ? {} : { sessionId: request.agent.id }),
    sound: config.sound,
  }
}

/** 对外服务：实现 DesktopNotifier，同时把 notify 发布成 Typert Remote。 */
export class TaskNotifyService extends TypertRemoteService implements DesktopNotifier {
  /**
   * @param ctx - Host 上下文。
   * @param notifier - 实际弹出系统通知的提供方。
   * @param config - 已校验的插件配置。
   */
  constructor(
    ctx: Context,
    private readonly notifier: DesktopNotifier,
    private readonly config: Config,
  ) {
    super(ctx, 'taskNotify')
  }

  /**
   * 弹出一条桌面通知。其他插件也可调用。
   * @param request - 标题、正文、声音。
   */
  @Remote('notify')
  async notify(request: NotifyRequest): Promise<NotifyResult> {
    return this.notifier.notify(request)
  }

  /**
   * 当前总开关（只读镜像，改配置走 cordis.yml / overlay）。
   */
  @Remote('getEnabled')
  async getEnabled(): Promise<boolean> {
    return this.config.enabled
  }
}

/**
 * 按需跳过聚焦窗口后弹出通知；失败只打日志，不影响 agent 循环。
 */
async function fire(
  ctx: Context,
  service: TaskNotifyService,
  config: Config,
  request: NotifyRequest,
): Promise<void> {
  try {
    if (config.skipWhenFocused && await isDesktopWindowFocused()) return
    const result = await service.notify(request)
    if (!result.ok) ctx.logger.warn(`task-notify: ${result.error}`)
  } catch (error) {
    ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 弹出带按钮的审批气泡并等待。只有两个按钮返回裁决；关闭、超时、点空白、失败都是 deferred。
 * @param req - 当前审批请求，用于文案和 abort。
 * @returns 两个按钮算出裁决；其余情况都是 deferred。
 */
async function waitApprovalToast(
  ctx: Context,
  service: TaskNotifyService,
  config: Config,
  req: ApprovalRequest,
): Promise<ToastWaitAction> {
  try {
    if (config.skipWhenFocused && await isDesktopWindowFocused()) return 'deferred'
    const result = await service.notify({
      ...buildApprovalRequest(req, config),
      approvalActions: true,
      waitMs: config.approvalWaitMs,
      ...(req.signal === undefined ? {} : { signal: req.signal }),
    })
    if (!result.ok) {
      ctx.logger.warn(`task-notify: ${result.error}`)
      return 'deferred'
    }
    if (result.action === 'allowed-once' || result.action === 'rejected') return result.action
    return 'deferred'
  } catch (error) {
    ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`)
    return 'deferred'
  }
}

/**
 * 挂载 Host 半部：登记服务，并在任务结束、审批问人、向用户提问时弹出通知。
 * @param ctx - Host 上下文。
 * @param config - 已校验配置。
 */
export function apply(ctx: Context, config: Config): void {
  if (process.platform === 'win32') {
    void ensureWindowsToastChannel()
    ctx.effect(() => () => {
      disposeWindowsToastChannel()
    }, 'task-notify: toast channel')
  }
  const notifier = new HostDesktopNotifier()
  const service = new TaskNotifyService(ctx, notifier, config)
  const seenRunning = new WeakSet<Agent>()
  // 插件晚于任务启动才加载时，把当前已在跑的 agent 算作已经 running。
  for (const agent of ctx.agents.list()) {
    if (agent.status === 'running') seenRunning.add(agent)
  }

  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'running') {
      seenRunning.add(agent)
      return
    }
    if (status !== 'idle' || !seenRunning.has(agent)) return
    seenRunning.delete(agent)
    if (!config.enabled || !config.notifyOnIdle) return
    if (skipAgent(agent, config)) return
    void fire(ctx, service, config, buildIdleRequest(agent, config))
  })

  // 审批：点气泡按钮则短路裁决；关掉立刻 next 给网页黄框；超时同样 next。
  ctx.on('approval/request', async (req, next) => {
    if (!config.enabled || !config.notifyOnApproval || skipAgent(req.agent, config)) {
      return next()
    }
    const action = await waitApprovalToast(ctx, service, config, req)
    if (action === 'allowed-once' || action === 'rejected') {
      ctx.logger.info(`task-notify: approval toast ${action}`)
      return action
    }
    ctx.logger.info('task-notify: approval toast deferred, yellow box next')
    return next()
  }, { prepend: true })

  ctx.inject(['userQuestions'], (inner) => {
    const questions = inner.userQuestions as UserQuestionService
    const original = questions.ask
    questions.ask = function wrappedAsk(
      this: UserQuestionService,
      request: AskUserQuestionRequest,
    ) {
      if (config.enabled && config.notifyOnQuestion && !skipAgent(request.agent, config)) {
        void fire(ctx, service, config, buildQuestionRequest(request, config))
      }
      return original.call(this, request)
    }
    inner.effect(() => () => {
      questions.ask = original
    }, 'task-notify: restore userQuestions.ask')
  })
}
