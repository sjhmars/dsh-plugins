/** Host orchestrator: pair, mirror sessions, map chat/approvals/questions onto Happy. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { type ModelSelection, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
// Type-only: the `sessionController` Context augmentation this plugin reads.
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { admitEncodedImages } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment/types'
import { createUserMessage, ReasoningEffortId, type ContentBlock, type LlmCallConfig, type ReasoningEffortId as EffortId } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError, type AskUserQuestionAnswer, type AskUserQuestionRequest, type UserQuestionService } from '@deepseek-ai/dsh-user-questions'
import { archiveSetDiff, hideOnHarness, phoneParkAction, revealOnHarness } from './archive-sync.ts'
import { buildSessionMetadata } from './catalogs.ts'
import {
  loadCredentials, markConnected, markDisconnected, peekMachineId, resolveCredentialDir, saveCredentials,
  addDismissed, loadDismissed, removeDismissed,
} from './credentials.ts'
import { splitPendingFiles } from './attachments.ts'
import { inboxReadPrompt, saveInboxFiles } from './inbox.ts'
import { decryptBlob, deriveBlobKey, encryptBlob, machineCrypto, sessionCrypto, type CryptoContext } from './encryption.ts'
import { catalogModelPick, classifyPermissionMode, grantAtLeast, messageEffort, messageModelCode, sameCatalogPick, sameHappyRuntime, sameModelOverride, splitModelCode, type CatalogModelPick } from './grant.ts'
import {
  assistantParts, happyTool, historyItems, isBlankSession, resolveSessionPreset, sessionLabel, thinkCard, thinkLabel,
  THINK_TOOL_NAME, pinWakeEffort, unarchivedSessionIds, visibleUserImages, visibleUserText, wakeModelSelection, type HistoryEvent,
} from './history.ts'
import { answersFromHappy, classifyInboundText, customAnswersFromText, planReviewDeclineLabel } from './inbound.ts'
import { createOrLoadMachine, createOrLoadSession, archiveHappySession, deleteHappySession, downloadEncryptedAttachment, listHappySessions, uploadEncryptedAttachment } from './http.ts'
import { HappyMachineSocket } from './machine.ts'
import { startPairing, type PairingAttempt } from './pairing.ts'
import { matchVirtualWorkspace, resolveSpawnDirectory, virtualWorkspaces } from './paths.ts'
import { HAPPY_CLI_VERSION } from './happy-version.ts'
import { HappySessionSocket, type InboundMessage } from './session-socket.ts'
import type {
  Config, Credentials, PairingStatus, PendingFile, PermissionRpc,
  SpawnSessionOptions, SpawnSessionResult, VirtualWorkspace,
} from './types.ts'

interface Link {
  /** Live agent after the web, spawn, or a phone wake has opened this session. */
  agent?: Agent
  socket: HappySessionSocket
  crypto: CryptoContext
  /** In-flight Happy file downloads bound to the next user text. */
  pendingDownloads: Promise<PendingFile | undefined>[]
  /** Cached Happy blob key for this session crypto. */
  blobKey?: Uint8Array
  pendingHuman?: PendingHuman
  alwaysAllow: Set<string>
  /** True while historical log events are copied onto an empty Happy session. */
  replaying: boolean
  /** Phone-originated user/message events not to echo back onto Happy. */
  skipNextUser: number
  /** Serialize web→phone image uploads so two messages keep file-then-text order. */
  outboundTail: Promise<void>
  /** Last phone text, to ignore the App's duplicate inbound copy. */
  lastPhoneText: string
  /** Time of {@link lastPhoneText}. */
  lastPhoneAt: number
  /** Happy tool-call ids already opened, so assistant/message and tool/call do not double-emit. */
  startedCalls: Set<string>
  /** Accumulated reasoning-delta text until the committed assistant/message. */
  reasoning: string
  /** Open Think card id while reasoning is streaming. */
  thinkCall?: string
  /** Whether `args.text` was already sent (Happy keeps the first value of each key). */
  thinkBodySent: boolean
  /** Last Think-card description emit, for throttling. */
  thinkLastEmit: number
  /** Harness session id this Happy socket maps to. */
  dshId: string
  /** Workspace cwd used when the agent is not loaded yet. */
  cwd: string
  /** Inspected log for a sidebar session that nobody has opened on the web. */
  events: readonly HistoryEvent[]
  /** Creation-header preset; later `agent-preset/selected` events win. */
  headerAgentPreset?: string
  /** Highest session-event seq already copied onto Happy; history is skipped. */
  lastForwardedSeq: number
  /** Disposer for the agent-scoped session/event listener. */
  sessionUnsub?: () => boolean
  /** Phone archived this row; keep the socket so a later send can resume. */
  parked: boolean
}

/** Host `agentPresets` used only during phone wake; absent when the profile has no roster. */
interface AgentPresetsApi {
  resolve(id?: string): Promise<{ id: string }>
  mount(agentCtx: Context, id?: string): Promise<unknown>
}

/** Host `agentDefaultModel`, read by name so this plugin does not depend on that package. */
interface AgentDefaultModelApi {
  currentSelection(): ModelSelection
}

type PendingHuman =
  | {
    kind: 'approval'
    id: string
    toolName: string
    happyName: string
    arguments: Record<string, unknown>
    resolve: (outcome: ApprovalOutcome) => void
  }
  | {
    kind: 'plan-review'
    id: string
    resolve: (answer: AskUserQuestionAnswer) => void
    reject: (error: Error) => void
    approveLabel: string
    declineLabel: string
    questionId: string
  }
  | {
    kind: 'ask'
    id: string
    resolve: (answer: AskUserQuestionAnswer) => void
    reject: (error: Error) => void
    questions: readonly { id: string; question: string }[]
  }

interface ModelOverride {
  provider: string
  model: string
  reasoningEffort?: EffortId
}

/**
 * Live Happy bridge for one Host process.
 */
export class HappyBridge {
  private credentials: Credentials | undefined
  private pairing: PairingAttempt | undefined
  private machine: HappyMachineSocket | undefined
  private readonly links = new Map<string, Link>()
  private readonly happyToDsh = new Map<string, string>()
  private readonly models = new Map<string, ModelOverride>()
  /** Last model/effort we wrote to Happy, so the metadata echo is not a phone pick. */
  private readonly lastPublished = new Map<string, CatalogModelPick>()
  /** Count of in-flight phone-originated Host `selectModel` calls. */
  private hostSelectFromPhone = 0
  /** Per-agent selection installed on phone wake / spawn, matching Host `selectionFor`. */
  private readonly selections = new WeakMap<Agent, ModelSelectionRef>()
  /** In-flight phone wakes, so two inbound texts do not double-resume. */
  private readonly waking = new Map<string, Promise<Agent | undefined>>()
  /** Phone stop-session / archive: do not recreate these Happy rows. */
  private readonly dismissed = new Set<string>()
  /** Phone New (spawn) blanks stay linked; web placeholders do not. */
  private readonly phoneSpawned = new Set<string>()
  /** Last Host archive set, so web archive/restore can park or unpark Happy. */
  private lastArchivedIds = new Set<string>()
  /** Serialize phone text so two messages cannot split one attachment batch. */
  private readonly inboundTail = new Map<string, Promise<void>>()
  private error: string | undefined
  private running = false
  private scanTimer: ReturnType<typeof setInterval> | undefined

  /**
   * @param ctx - Host context.
   * @param config - resolved plugin config.
   * @param log - logger.
   */
  constructor(
    private readonly ctx: Context,
    private config: Config,
    private readonly log: (message: string) => void,
  ) {}

  /** Replace config after a settings write that keeps the same relay. */
  setConfig(config: Config): void {
    this.config = config
  }

  /**
   * Apply a settings write in place when the Happy relay identity is unchanged.
   * Grant changes take effect immediately; URL / credential-dir / enabled
   * changes must rebuild.
   * @param next - resolved settings section.
   * @returns true when the live bridge kept running.
   */
  acceptSettings(next: Config): boolean {
    if (!sameHappyRuntime(this.config, next)) return false
    this.config = next
    return true
  }

  /** Snapshot for the settings card. */
  status(): PairingStatus {
    return {
      paired: this.credentials !== undefined,
      pairing: this.pairing !== undefined,
      serverUrl: this.config.serverUrl,
      ...(this.pairing === undefined ? {} : {
        mobileUrl: this.pairing.mobileUrl,
        webUrl: this.pairing.webUrl,
        qrDataUrl: this.pairing.qrDataUrl,
      }),
      ...(this.error === undefined ? {} : { error: this.error }),
      ...(this.credentials === undefined ? {} : { machineId: this.credentials.machineId }),
      sessionCount: this.links.size,
      linkedCount: [...this.links.values()].filter(link => link.socket.isConnected()).length,
    }
  }

  /** Load credentials, connect machine, mirror live root agents. */
  async start(): Promise<void> {
    if (!this.config.enabled) return
    this.running = true
    this.installHooks()
    const dir = resolveCredentialDir(this.config.credentialDir)
    try {
      this.credentials = await loadCredentials(dir)
      if (this.credentials !== undefined) {
        for (const id of await loadDismissed(dir)) this.dismissed.add(id)
        await this.connectCloud()
        return
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.log(`读取凭据失败：${this.error}`)
    }
    if (this.config.pairOnStart) await this.beginPairing()
  }

  /** Tear down sockets. Web UI keeps running. */
  dispose(): void {
    this.running = false
    if (this.scanTimer !== undefined) {
      clearInterval(this.scanTimer)
      this.scanTimer = undefined
    }
    this.pairing?.abort()
    this.pairing = undefined
    this.machine?.dispose()
    this.machine = undefined
    for (const link of this.links.values()) link.socket.dispose()
    this.links.clear()
    this.happyToDsh.clear()
    this.waking.clear()
    this.lastPublished.clear()
    this.models.clear()
  }

  /** Start or resume pairing. */
  async beginPairing(): Promise<void> {
    this.pairing?.abort()
    this.error = undefined
    const dir = resolveCredentialDir(this.config.credentialDir)
    const existing = await loadCredentials(dir)
    if (existing !== undefined) {
      this.credentials = existing
      await markConnected(dir, existing.machineId)
      await this.connectCloud()
      return
    }
    const attempt = await startPairing(this.config.serverUrl, this.config.appUrl)
    this.pairing = attempt
    const machineId = await peekMachineId(dir) ?? crypto.randomUUID()
    void attempt.done.then(async (partial) => {
      const credentials: Credentials = { ...partial, machineId }
      this.credentials = credentials
      this.pairing = undefined
      await saveCredentials(dir, credentials)
      await this.connectCloud()
    }).catch((error: unknown) => {
      if (this.pairing === attempt) this.pairing = undefined
      this.error = error instanceof Error ? error.message : String(error)
      this.log(`配对失败：${this.error}`)
    })
  }

  /**
   * Drop the current Happy login and show a new QR. Keeps the same machine id
   * so already-mirrored sessions stay on this Host after the phone scans again.
   */
  async rePair(): Promise<void> {
    await this.disconnect()
    await this.beginPairing()
  }

  /** Disconnect Happy without killing dsh web. */
  async disconnect(): Promise<void> {
    this.pairing?.abort()
    this.pairing = undefined
    const dir = resolveCredentialDir(this.config.credentialDir)
    await markDisconnected(dir, this.credentials?.machineId)
    this.credentials = undefined
    this.machine?.dispose()
    this.machine = undefined
    for (const link of this.links.values()) link.socket.dispose()
    this.links.clear()
    this.happyToDsh.clear()
    this.waking.clear()
    this.phoneSpawned.clear()
    this.dismissed.clear()
  }

  private async connectCloud(): Promise<void> {
    const credentials = this.credentials
    if (credentials === undefined) return
    const { ctx: crypto, dataEncryptionKey } = machineCrypto(credentials)
    await createOrLoadMachine({
      serverUrl: this.config.serverUrl,
      token: credentials.token,
      machineId: credentials.machineId,
      crypto,
      metadata: {
        host: 'dsh',
        platform: process.platform,
        happyCliVersion: HAPPY_CLI_VERSION,
        homeDir: '/dsh-workspaces',
      },
      daemonState: { status: 'running', pid: process.pid, startedAt: Date.now() },
      ...(dataEncryptionKey === undefined ? {} : { dataEncryptionKey }),
    })
    this.machine?.dispose()
    this.machine = new HappyMachineSocket(
      credentials.machineId,
      credentials.token,
      this.config.serverUrl,
      crypto,
      {
        spawn: options => this.spawn(options),
        resume: happyId => this.resumeHappySession(happyId),
        stopSession: happyId => this.unmapHappy(happyId),
        listWorkspaces: () => this.workspaces(),
        log: this.log,
      },
    )
    await this.machine.connect()
    this.seedArchiveSet()
    await this.syncMirrors()
    if (this.scanTimer === undefined) {
      this.scanTimer = setInterval(() => {
        void this.syncMirrors()
      }, 10_000)
    }
  }

  private installHooks(): void {
    this.ctx.on('agent/created', ({ agent }) => {
      if (!this.running || this.shouldSkip(agent)) return
      if (this.dismissed.has(agent.id) && isBlankSession(agent.session.events)) return
      if (this.dismissed.has(agent.id)) this.undismiss(agent.id)
      const existing = this.links.get(agent.id)
      if (existing !== undefined) {
        this.attachAgent(existing, agent)
        this.wakePhone(existing, true)
        return
      }
      if (isBlankSession(agent.session.events) && !this.phoneSpawned.has(agent.id)) return
      void this.mirrorAgent(agent).then(() => {
        if (this.isHarnessArchived(agent.id)) this.parkPhoneSession(agent.id)
      }).catch(error => this.log(`镜像会话失败：${String(error)}`))
    })
    this.ctx.on('agent/disposed', ({ agent }) => {
      const link = this.links.get(agent.id)
      if (link === undefined) return
      if (this.listedUnarchived().has(agent.id) || link.parked) {
        delete link.agent
        link.sessionUnsub?.()
        delete link.sessionUnsub
        return
      }
      this.dropLink(agent.id)
    })
    this.ctx.on('agent/status', ({ agent, status }) => {
      const link = this.links.get(agent.id)
      if (link === undefined || link.parked) return
      link.socket.keepAlive(status === 'running')
      if (status === 'idle') this.drainNewEvents(link, agent)
    }, { global: true })
    this.ctx.on('session/event', (session, event: SessionEvent) => {
      if (event.type === 'model/selection') {
        this.onHostModelSelected(String(session.header.id), event.data)
        return
      }
      const link = this.links.get(session.header.id)
      if (link !== undefined) {
        this.onSessionEvent(link, event)
        return
      }
      if (event.type !== 'turn/start' || !this.running || this.credentials === undefined) return
      if (this.dismissed.has(session.header.id)) this.undismiss(session.header.id)
      void this.ensureMirror(session.header.id).catch(error => this.log(`镜像会话失败：${String(error)}`))
    }, { global: true })
    this.ctx.on('approval/request', (req, next) => this.onApproval(req, next), { prepend: true })
    this.ctx.inject(['userQuestions'], (inner) => {
      const questions = inner.userQuestions as UserQuestionService
      const original = questions.ask
      questions.ask = (request: AskUserQuestionRequest) => this.onAsk(questions, original, request)
      inner.effect(() => () => {
        questions.ask = original
      }, 'happy-bridge: restore userQuestions.ask')
    })
    this.ctx.inject(['commands'], (inner) => {
      inner.commands.register({
        name: 'remote',
        description: '查看或设置手机远程控制档（watch / chat / approve / full）',
        handler: (invocation) => {
          const arg = invocation.rawInput.trim()
          if (arg === '') return { kind: 'success', text: `当前远程档 ${this.config.remoteGrant}` }
          if (arg !== 'watch' && arg !== 'chat' && arg !== 'approve' && arg !== 'full') {
            return { kind: 'error', text: `未知远程档 "${arg}"（watch / chat / approve / full）` }
          }
          this.config.remoteGrant = arg
          return { kind: 'success', text: `远程档已设为 ${arg}` }
        },
      })
      inner.commands.register({
        name: 'effort',
        description: '设置当前模型的推理档',
        handler: async (invocation) => {
          const id = invocation.rawInput.trim()
          const current = this.currentModel(invocation.agent)
          if (current === undefined) return { kind: 'error', text: '当前没有已选模型' }
          if (id === '') {
            this.rememberModel(invocation.agent, { provider: current.provider, model: current.model })
            return { kind: 'success', text: '推理档已恢复为模型默认' }
          }
          this.rememberModel(invocation.agent, {
            provider: current.provider,
            model: current.model,
            reasoningEffort: ReasoningEffortId(id),
          })
          return { kind: 'success', text: `推理档 ${id}` }
        },
      })
    })
    this.ctx.on('commands/change', () => {
      this.pushAllMetadata()
    })
    this.ctx.on('llm/adapters-updated', () => {
      this.pushAllMetadata()
    })
    this.ctx.on('domain/changed', (change: { domain?: string; table?: string }) => {
      if (change.domain !== 'workspace' || change.table !== '') return
      this.reconcileArchiveSet()
    })
  }

  private isHarnessArchived(dshId: string): boolean {
    return this.ctx.get('workspaceRegistry')?.archivedSessionIds.includes(SessionId(dshId)) === true
  }

  private seedArchiveSet(): void {
    const ids = this.ctx.get('workspaceRegistry')?.archivedSessionIds ?? []
    this.lastArchivedIds = new Set(ids.map(String))
  }

  private reconcileArchiveSet(): void {
    const next = new Set((this.ctx.get('workspaceRegistry')?.archivedSessionIds ?? []).map(String))
    const { hidden, shown } = archiveSetDiff(this.lastArchivedIds, next)
    this.lastArchivedIds = next
    if (!this.running) return
    for (const id of hidden) {
      if (this.links.has(id)) this.parkPhoneSession(id)
    }
    for (const id of shown) {
      const link = this.links.get(id)
      if (link !== undefined) this.unpark(link)
    }
  }

  private listedUnarchived(): Set<string> {
    const registry = this.ctx.get('workspaceRegistry')
    return new Set(unarchivedSessionIds(registry?.list() ?? [], registry?.archivedSessionIds ?? []))
  }

  private async syncMirrors(): Promise<void> {
    if (!this.running || this.credentials === undefined) return
    const wanted = new Set([...this.listedUnarchived()])
    for (const id of wanted) {
      try {
        await this.ensureMirror(id)
      } catch (error) {
        this.log(`镜像会话失败：${String(error)}`)
      }
    }
    for (const id of this.ctx.get('workspaceRegistry')?.archivedSessionIds ?? []) {
      try {
        await this.ensureMirror(id)
      } catch (error) {
        this.log(`镜像会话失败：${String(error)}`)
      }
    }
    for (const id of [...this.links.keys()]) {
      const link = this.links.get(id)
      if (link === undefined) continue
      const action = phoneParkAction(link.parked, wanted.has(id))
      if (action === 'unpark') {
        this.wakePhone(link)
        continue
      }
      if (action === 'park') {
        if (!this.phoneSpawned.has(id) && isBlankSession(this.linkEvents(link))) {
          this.abandonBlankMirror(id)
        } else if (this.isHarnessArchived(id)) {
          this.parkPhoneSession(id)
        }
        continue
      }
      if (link.parked) continue
      if (wanted.has(id)) this.wakePhone(link)
      if (!this.phoneSpawned.has(id) && isBlankSession(this.linkEvents(link))) {
        this.abandonBlankMirror(id)
      }
    }
    await this.sweepHappyGhosts()
  }

  private async ensureMirror(id: string): Promise<void> {
    if (this.links.has(id)) return
    if (this.dismissed.has(id) && await this.sessionIsBlank(id) && !this.phoneSpawned.has(id)) return
    if (this.dismissed.has(id)) this.undismiss(id)
    const agent = this.ctx.agents.get(SessionId(id))
    if (agent !== undefined) {
      if (this.shouldSkip(agent)) return
      if (isBlankSession(agent.session.events) && !this.phoneSpawned.has(id)) return
      await this.mirrorAgent(agent)
      if (this.isHarnessArchived(id)) this.parkPhoneSession(id)
      return
    }
    await this.mirrorDormant(id)
    if (this.isHarnessArchived(id)) this.parkPhoneSession(id)
  }

  private dropLink(dshId: string): void {
    const link = this.links.get(dshId)
    if (link === undefined) return
    link.sessionUnsub?.()
    this.happyToDsh.delete(link.socket.happySessionId)
    link.socket.dispose()
    this.links.delete(dshId)
    this.lastPublished.delete(dshId)
    this.models.delete(dshId)
  }

  /**
   * Remove a web New Session placeholder from Happy without remembering a
   * dismiss: the first real turn should remirror it.
   */
  private abandonBlankMirror(dshId: string): void {
    const link = this.links.get(dshId)
    const happyId = link?.socket.happySessionId
    link?.socket.endSession()
    this.dropLink(dshId)
    if (happyId !== undefined && this.credentials !== undefined) {
      void deleteHappySession(this.config.serverUrl, this.credentials.token, happyId)
    }
    this.log(`空白占位不出现在手机上 ${dshId}`)
  }

  /**
   * Drop Happy rows for dismissed or blank dsh tags. The App archive button
   * only sets inactive; without this sweep a keepalive ghost stays in the list.
   */
  private async sweepHappyGhosts(): Promise<void> {
    if (this.credentials === undefined) return
    const rows = await listHappySessions(this.config.serverUrl, this.credentials.token)
    for (const row of rows) {
      const dshId = row.tag.startsWith('dsh:') ? row.tag.slice(4) : this.happyToDsh.get(row.id)
      if (dshId === undefined || this.phoneSpawned.has(dshId)) continue
      if (await this.sessionIsBlank(dshId)) this.forgetPhoneSession(row.id, dshId)
    }
  }

  private async sessionIsBlank(dshId: string): Promise<boolean> {
    const agent = this.ctx.agents.get(SessionId(dshId))
    if (agent !== undefined) return isBlankSession(agent.session.events)
    const stored = await this.loadStored(dshId)
    if (stored === undefined) return !this.links.has(dshId)
    return isBlankSession(stored.events)
  }

  private linkEvents(link: Link): readonly HistoryEvent[] {
    return link.agent?.session.events ?? link.events
  }

  private requireAgent(link: Link): Agent | undefined {
    if (link.agent !== undefined) return link.agent
    const live = this.ctx.agents.get(SessionId(link.dshId))
    if (live === undefined) return undefined
    this.attachAgent(link, live)
    return live
  }

  /** Bind a live agent onto an existing Happy socket without reminting it. */
  private attachAgent(link: Link, agent: Agent): void {
    link.agent = agent
    link.cwd = agent.session.header.cwd ?? link.cwd
    link.events = []
    if (link.lastForwardedSeq < 0) link.lastForwardedSeq = lastEventSeq(agent.session.events)
    link.sessionUnsub?.()
    link.sessionUnsub = agent.ctx.on('session/event', (session, event: SessionEvent) => {
      if (session.header.id !== link.dshId) return
      this.onSessionEvent(link, event)
    }, { global: true })
  }

  /** Copy log events newer than {@link Link.lastForwardedSeq} onto Happy. */
  private drainNewEvents(link: Link, agent: Agent): void {
    if (link.replaying) return
    for (const event of agent.session.events) this.onSessionEvent(link, event)
  }

  /**
   * Live agent for this Happy socket, resuming the persisted session when the
   * web has never opened it. Same preset the Host would mount on a web open.
   */
  private async ensureAgent(link: Link): Promise<{ agent: Agent; woke: boolean } | undefined> {
    const live = this.requireAgent(link)
    if (live !== undefined) return { agent: live, woke: false }
    const inflight = this.waking.get(link.dshId)
    if (inflight !== undefined) {
      const agent = await inflight
      return agent === undefined ? undefined : { agent, woke: true }
    }
    // Spinner only: a service bubble hid the real chat on the phone.
    link.socket.keepAlive(true)
    const waking = this.wakeAgent(link).finally(() => {
      if (this.waking.get(link.dshId) === waking) this.waking.delete(link.dshId)
    })
    this.waking.set(link.dshId, waking)
    const agent = await waking
    return agent === undefined ? undefined : { agent, woke: true }
  }

  private async wakeAgent(link: Link): Promise<Agent | undefined> {
    const already = this.requireAgent(link)
    if (already !== undefined) return already
    try {
      const agent = await withTimeout(this.resumeSession(link), 60_000, '打开这场对话超时')
      this.log(`已从手机唤醒会话 ${link.dshId}`)
      return agent
    } catch (error) {
      const recovered = this.requireAgent(link)
      if (recovered !== undefined) return recovered
      this.log(`唤醒会话失败：${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  private async resumeSession(link: Link): Promise<Agent> {
    const setup = await this.composeAgentSetup(
      resolveSessionPreset(this.linkEvents(link), link.headerAgentPreset),
    )
    const handle = await this.ctx.agents.resume({
      resumeSessionId: SessionId(link.dshId),
      setup,
    })
    await this.ensurePinnedEffort(handle.agent)
    const current = this.links.get(link.dshId)
    if (current !== undefined) this.attachAgent(current, handle.agent)
    return handle.agent
  }

  /**
   * Resume/create composition matching Host `composeAgent`: install model
   * selection, then mount the preset when a roster exists.
   * @param presetHint - logged or requested preset id; omitted uses the roster default.
   */
  private async composeAgentSetup(presetHint?: string): Promise<(agentCtx: Context) => Promise<void>> {
    const presets = (this.ctx as unknown as { get(name: string): AgentPresetsApi | undefined }).get('agentPresets')
    let resolvedId: string | undefined
    if (presets !== undefined) {
      resolvedId = (await presets.resolve(presetHint)).id
    }
    return async (agentCtx: Context) => {
      this.installWakeSelection(agentCtx)
      if (presets !== undefined && resolvedId !== undefined) {
        await presets.mount(agentCtx, resolvedId)
      }
    }
  }

  /**
   * Same lazy selection Host `selectionFor` installs: remembered pick, else
   * the session's last `request/header`, else `agentDefaultModel`. A missing
   * thinking level keeps the web picker's effort when it is the same model.
   * Unlike Host `installModelSelection`, an absent effort does not clear
   * inherited thinking.
   */
  private installWakeSelection(agentCtx: Context): void {
    const agent = agentCtx.agent
    if (agent === undefined) throw new Error('happy-bridge: agent setup has no scoped agent')
    if (this.selections.has(agent)) return
    let picked: ModelSelection | undefined
    const bridge = this
    const selection: ModelSelectionRef = {
      get current(): ModelSelection | undefined {
        if (picked !== undefined) return picked
        return bridge.currentModel(agent)
      },
      set current(next: ModelSelection | undefined) {
        picked = next
      },
      assembled: undefined,
    }
    this.bindWakeSelection(agentCtx, selection)
    this.selections.set(agent, selection)
    const current = selection.current
    if (current === undefined) return
    const existing = this.models.get(agent.id)
    if (existing === undefined || (existing.reasoningEffort === undefined && current.reasoningEffort !== undefined)) {
      this.models.set(agent.id, current)
    }
  }

  /**
   * Pin provider/model for a phone-woken agent without wiping thinking when
   * the selection names no effort.
   */
  private bindWakeSelection(agentCtx: Context, selection: ModelSelectionRef): void {
    agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const selected = selection.current
      const assembled = await next()
      selection.assembled = selected
      if (selected === undefined) return assembled
      return {
        ...assembled,
        variables: {
          ...assembled.variables,
          provider: selected.provider,
          model: selected.model,
        },
      }
    })
    agentCtx.on('agent/request', async (_payload, next): Promise<LlmCallConfig> => {
      const resolved = await next()
      const selected = selection.assembled
      if (selected === undefined) return resolved
      return {
        ...resolved,
        provider: selected.provider,
        model: selected.model,
        ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
      }
    })
  }

  /** Host default model, when the web profile mounted `agentDefaultModel`. */
  private defaultModelSelection(): ModelSelection | undefined {
    const service = (this.ctx as unknown as { get(name: string): AgentDefaultModelApi | undefined }).get('agentDefaultModel')
    return service?.currentSelection()
  }

  /** Registered workspace for this session, or `undefined` when it is not in the sidebar. */
  private workspaceFor(sessionId: string, cwd?: string): VirtualWorkspace | undefined {
    const mapped = this.workspaces()
    if (cwd !== undefined && cwd !== '') {
      const hit = matchVirtualWorkspace(cwd, mapped)
      if (hit !== undefined) return hit
    }
    const workspaces = this.ctx.get('workspaceRegistry')?.list() ?? []
    const match = workspaces.find(workspace => workspace.sessionIds.includes(SessionId(sessionId)))
    if (match === undefined) return undefined
    return matchVirtualWorkspace(match.path, mapped)
  }

  private async loadStored(id: string): Promise<{
    cwd: string
    happyPath: string
    events: readonly HistoryEvent[]
    headerAgentPreset?: string
  } | undefined> {
    const persistence = (this.ctx as unknown as { get(name: string): unknown }).get('sessionPersistence') as
      | { inspect(id: SessionId): Promise<{
        meta: { origin?: string; cwd?: string; agentPreset?: string }
        events: readonly HistoryEvent[]
      }> }
      | undefined
    if (persistence === undefined) return undefined
    try {
      const stored = await persistence.inspect(SessionId(id))
      if (stored.meta.origin === 'subagent') return undefined
      const workspace = this.workspaceFor(id, stored.meta.cwd)
      if (workspace === undefined) return undefined
      return {
        cwd: stored.meta.cwd ?? workspace.realPath,
        happyPath: workspace.virtualPath,
        events: stored.events,
        ...(stored.meta.agentPreset === undefined ? {} : { headerAgentPreset: stored.meta.agentPreset }),
      }
    } catch {
      return undefined
    }
  }

  private shouldSkip(agent: Agent): boolean {
    return agent.session.header.origin === 'subagent'
  }

  private workspaces(): VirtualWorkspace[] {
    const registry = this.ctx.get('workspaceRegistry')
    if (registry === undefined) return []
    return virtualWorkspaces(registry.list().map(workspace => ({
      id: workspace.id,
      path: workspace.path,
      title: workspace.title,
    })))
  }

  private async mirrorAgent(agent: Agent, happySessionId?: string): Promise<void> {
    if (this.links.has(agent.id) || this.credentials === undefined) return
    if (isBlankSession(agent.session.events) && happySessionId === undefined && !this.phoneSpawned.has(agent.id)) return
    const workspace = this.workspaceFor(agent.id, agent.session.header.cwd)
    if (workspace === undefined) return
    const cwd = agent.session.header.cwd ?? workspace.realPath
    const credentials = this.credentials
    const { ctx: crypto, dataEncryptionKey } = sessionCrypto(credentials)
    let sessionId = happySessionId
    let metadataVersion = 0
    let agentStateVersion = 0
    let seq = happySessionId === undefined ? 0 : 1
    if (sessionId === undefined) {
      const created = await createOrLoadSession({
        serverUrl: this.config.serverUrl,
        token: credentials.token,
        tag: `dsh:${agent.id}`,
        crypto,
        metadata: await buildSessionMetadata(
          this.ctx,
          { cwd, happyPath: workspace.virtualPath, events: agent.session.events, agent },
          credentials.machineId,
          sessionLabel(agent.session.events),
          this.currentModel(agent),
          this.config.remoteGrant),
        agentState: { controlledByUser: grantAtLeast(this.config.remoteGrant, 'chat'), requests: {} },
        ...(dataEncryptionKey === undefined ? {} : { dataEncryptionKey }),
      })
      sessionId = created.id
      seq = created.seq
      metadataVersion = created.metadataVersion
      agentStateVersion = created.agentStateVersion
    }
    if (sessionId === undefined) return
    const socket = new HappySessionSocket(sessionId, credentials.token, this.config.serverUrl, crypto, {
      onInbound: message => this.queueInbound(agent.id, message),
      onPermission: rpc => this.onPermission(agent.id, rpc),
      onAbort: () => this.onPhoneAbort(agent.id),
      onArchived: () => this.onPhoneArchive(sessionId, agent.id),
      onResumed: () => this.onPhoneRestore(agent.id),
      onCatalog: meta => this.applyPhoneCatalog(agent.id, meta),
      log: this.log,
    })
    try {
      await socket.connect(metadataVersion, agentStateVersion)
    } catch (error) {
      socket.dispose()
      throw error
    }
    const link: Link = {
      agent,
      socket,
      crypto,
      pendingDownloads: [],
      alwaysAllow: new Set(),
      replaying: false,
      skipNextUser: 0,
      outboundTail: Promise.resolve(),
      lastPhoneText: '',
      lastPhoneAt: 0,
      startedCalls: new Set(),
      reasoning: '',
      thinkBodySent: false,
      thinkLastEmit: 0,
      dshId: agent.id,
      cwd,
      events: [],
      lastForwardedSeq: lastEventSeq(agent.session.events),
      parked: false,
    }
    this.links.set(agent.id, link)
    this.happyToDsh.set(sessionId, agent.id)
    await this.pushMetadata(link)
    if (seq === 0) await this.replayHistory(link)
    this.log(`已镜像会话 ${agent.id} → Happy ${sessionId}（seq=${seq}）`)
  }

  private async mirrorDormant(dshId: string): Promise<void> {
    if (this.links.has(dshId) || this.credentials === undefined) return
    const stored = await this.loadStored(dshId)
    if (stored === undefined) return
    if (isBlankSession(stored.events)) return
    const credentials = this.credentials
    const { ctx: crypto, dataEncryptionKey } = sessionCrypto(credentials)
    const title = sessionLabel(stored.events)
    const created = await createOrLoadSession({
      serverUrl: this.config.serverUrl,
      token: credentials.token,
      tag: `dsh:${dshId}`,
      crypto,
      metadata: await buildSessionMetadata(
        this.ctx,
        { cwd: stored.cwd, happyPath: stored.happyPath, events: stored.events },
        credentials.machineId,
        title,
        undefined,
        this.config.remoteGrant,
      ),
      agentState: { controlledByUser: grantAtLeast(this.config.remoteGrant, 'chat'), requests: {} },
      ...(dataEncryptionKey === undefined ? {} : { dataEncryptionKey }),
    })
    const socket = new HappySessionSocket(created.id, credentials.token, this.config.serverUrl, crypto, {
      onInbound: message => this.queueInbound(dshId, message),
      onPermission: rpc => this.onPermission(dshId, rpc),
      onAbort: () => this.onPhoneAbort(dshId),
      onArchived: () => this.onPhoneArchive(created.id, dshId),
      onResumed: () => this.onPhoneRestore(dshId),
      onCatalog: meta => this.applyPhoneCatalog(dshId, meta),
      log: this.log,
    })
    try {
      await socket.connect(created.metadataVersion, created.agentStateVersion)
    } catch (error) {
      socket.dispose()
      throw error
    }
    const link: Link = {
      socket,
      crypto,
      pendingDownloads: [],
      alwaysAllow: new Set(),
      replaying: false,
      skipNextUser: 0,
      outboundTail: Promise.resolve(),
      lastPhoneText: '',
      lastPhoneAt: 0,
      startedCalls: new Set(),
      reasoning: '',
      thinkBodySent: false,
      thinkLastEmit: 0,
      dshId,
      cwd: stored.cwd,
      events: stored.events,
      lastForwardedSeq: -1,
      parked: false,
      ...(stored.headerAgentPreset === undefined ? {} : { headerAgentPreset: stored.headerAgentPreset }),
    }
    this.links.set(dshId, link)
    this.happyToDsh.set(created.id, dshId)
    await this.pushMetadata(link)
    if (created.seq === 0) await this.replayHistory(link)
    this.log(`已镜像未打开会话 ${dshId} → Happy ${created.id}（seq=${created.seq}）`)
  }

  private unmapHappy(happySessionId: string): void {
    this.onPhoneArchive(happySessionId, this.happyToDsh.get(happySessionId))
  }

  /**
   * Phone archive: park a real conversation so a later send resumes it.
   * Blank placeholders are forgotten and not remirrored.
   */
  private onPhoneArchive(happySessionId: string | undefined, dshId: string | undefined): void {
    void this.handlePhoneArchive(happySessionId, dshId)
  }

  private async handlePhoneArchive(happySessionId: string | undefined, dshId: string | undefined): Promise<void> {
    if (dshId !== undefined && !(await this.sessionIsBlank(dshId))) {
      if (this.links.has(dshId)) this.parkPhoneSession(dshId, true)
      else this.undismiss(dshId)
      return
    }
    this.forgetPhoneSession(happySessionId, dshId)
  }

  /**
   * Park a real conversation on Happy. `hideHost` archives the same row on
   * the web (phone archive). Web-initiated archive only parks Happy.
   */
  private parkPhoneSession(dshId: string, hideHost = false): void {
    const link = this.links.get(dshId)
    if (link === undefined || link.parked) return
    link.parked = true
    link.socket.stopKeepAlive()
    if (this.credentials !== undefined) {
      void archiveHappySession(this.config.serverUrl, this.credentials.token, link.socket.happySessionId)
    }
    if (hideHost) {
      void hideOnHarness(this.ctx.get('workspaceRegistry'), dshId).catch(error => {
        this.log(`网页归档失败：${error instanceof Error ? error.message : String(error)}`)
      })
    }
    this.log(hideHost
      ? `已归档 ${dshId}，手机归档列表里打开或再发一条，网页侧栏也会回来`
      : `网页归档了 ${dshId}，手机也已归档，恢复后网页侧栏会回来`)
  }

  private onPhoneRestore(dshId: string): void {
    const link = this.links.get(dshId)
    if (link === undefined) {
      this.undismiss(dshId)
      return
    }
    this.unpark(link)
  }

  private undismiss(dshId: string): void {
    if (!this.dismissed.has(dshId)) return
    this.dismissed.delete(dshId)
    void removeDismissed(resolveCredentialDir(this.config.credentialDir), dshId)
    this.log(`已恢复镜像 ${dshId}`)
  }

  /**
   * Put this Happy row back online. Opening an offline chat on the phone
   * does not start heartbeats; the web sidebar still showing the row, a
   * phone send, or Happy's resume RPC all come through here.
   * @param refreshCatalog - republish metadata (web open / phone resume).
   */
  private wakePhone(link: Link, refreshCatalog = false): void {
    if (link.parked) {
      this.unpark(link)
      return
    }
    link.socket.ensureKeepAlive()
    if (refreshCatalog) void this.pushMetadata(link)
  }

  private unpark(link: Link): void {
    if (!link.parked) return
    link.parked = false
    if (this.dismissed.has(link.dshId)) this.undismiss(link.dshId)
    link.socket.keepAlive(false)
    void this.pushMetadata(link)
    void revealOnHarness(this.ctx.get('workspaceRegistry'), link.dshId).catch(error => {
      this.log(`网页恢复失败：${error instanceof Error ? error.message : String(error)}`)
    })
    this.log(`已恢复 ${link.dshId}，网页侧栏会重新显示这场对话`)
  }

  /**
   * Honor a phone archive/delete: stop keepalive, drop the Happy row, and do
   * not remirror this harness session until the plugin is unpaired.
   */
  private forgetPhoneSession(happySessionId: string | undefined, dshId: string | undefined): void {
    if (dshId !== undefined && this.dismissed.has(dshId) && !this.links.has(dshId)) return
    if (dshId !== undefined) {
      this.dismissed.add(dshId)
      const dir = resolveCredentialDir(this.config.credentialDir)
      void addDismissed(dir, dshId)
      this.links.get(dshId)?.socket.stopKeepAlive()
      this.links.get(dshId)?.socket.endSession()
      this.dropLink(dshId)
    }
    if (happySessionId !== undefined && this.credentials !== undefined) {
      void deleteHappySession(this.config.serverUrl, this.credentials.token, happySessionId)
    }
    this.log(`已从手机去掉 ${happySessionId ?? dshId ?? ''}（网页会话仍在）`)
  }

  /**
   * Happy App continues an offline row with `resume-happy-session`.
   * Reuse the existing harness session; do not mint a new one.
   * @param happySessionId - Happy cloud session id from the App.
   */
  private async resumeHappySession(happySessionId: string): Promise<SpawnSessionResult> {
    const known = this.happyToDsh.get(happySessionId)
    if (known !== undefined) {
      const link = this.links.get(known)
      if (link !== undefined) {
        this.wakePhone(link, true)
        this.log(`已从手机重新接上 ${known}`)
        return { type: 'success', sessionId: happySessionId }
      }
    }
    for (const link of this.links.values()) {
      if (link.socket.happySessionId !== happySessionId) continue
      this.happyToDsh.set(happySessionId, link.dshId)
      this.wakePhone(link, true)
      this.log(`已从手机重新接上 ${link.dshId}`)
      return { type: 'success', sessionId: happySessionId }
    }
    if (this.credentials === undefined) {
      return { type: 'error', errorMessage: '还没连上 Happy' }
    }
    try {
      const rows = await listHappySessions(this.config.serverUrl, this.credentials.token)
      const row = rows.find(item => item.id === happySessionId)
      const dshId = row?.tag.startsWith('dsh:') === true ? row.tag.slice(4) : undefined
      if (dshId === undefined || dshId === '') {
        return { type: 'error', errorMessage: '找不到这场对话，请在电脑网页里点开它' }
      }
      this.undismiss(dshId)
      await this.ensureMirror(dshId)
      const link = this.links.get(dshId)
      if (link === undefined) {
        return { type: 'error', errorMessage: '找不到这场对话，请在电脑网页里点开它' }
      }
      this.wakePhone(link, true)
      this.log(`已从手机重新接上 ${dshId}`)
      return { type: 'success', sessionId: happySessionId }
    } catch (error) {
      return { type: 'error', errorMessage: error instanceof Error ? error.message : String(error) }
    }
  }

  private async spawn(options: SpawnSessionOptions): Promise<SpawnSessionResult> {
    if (!grantAtLeast(this.config.remoteGrant, 'chat')) {
      return { type: 'error', errorMessage: '当前远程档不能新建会话' }
    }
    const real = resolveSpawnDirectory(options.directory, this.workspaces())
    if (real === undefined) {
      return { type: 'error', errorMessage: `目录不是已登记的工作区：${options.directory}` }
    }
    try {
      const sessionId = SessionId(crypto.randomUUID())
      const setup = await this.composeAgentSetup()
      const handle = await this.ctx.agents.create({ sessionId, meta: { cwd: real }, setup })
      const workspace = this.ctx.get('workspaceRegistry')?.list().find(item => item.path === real)
      await workspace?.attachSession(sessionId)
      this.phoneSpawned.add(handle.agent.id)
      this.applySpawnMeta(handle.agent, options)
      await this.ensurePinnedEffort(handle.agent)
      await this.mirrorAgent(handle.agent, options.sessionId)
      const link = this.links.get(handle.agent.id)
      return { type: 'success', sessionId: link?.socket.happySessionId ?? options.sessionId ?? handle.agent.id }
    } catch (error) {
      return { type: 'error', errorMessage: error instanceof Error ? error.message : String(error) }
    }
  }

  private applySpawnMeta(agent: Agent, options: SpawnSessionOptions): void {
    if (options.modelMode !== undefined) this.applyModel(agent, options.modelMode, options.effortLevel)
    else if (options.effortLevel !== undefined) this.applyEffort(agent, options.effortLevel)
    if (options.permissionMode !== undefined) this.applyPermission(agent, options.permissionMode, true)
  }

  private queueInbound(dshId: string, message: InboundMessage): void {
    const previous = this.inboundTail.get(dshId) ?? Promise.resolve()
    const next = previous.then(
      () => this.onInbound(dshId, message),
      () => this.onInbound(dshId, message),
    )
    this.inboundTail.set(dshId, next)
  }

  private async onInbound(dshId: string, message: InboundMessage): Promise<void> {
    const link = this.links.get(dshId)
    if (link === undefined || link.replaying) return
    this.wakePhone(link)
    if (this.dismissed.has(dshId)) this.undismiss(dshId)
    if (message.meta.sentFrom === 'dsh') return
    if (message.kind === 'text') {
      const awaitingFiles = link.pendingDownloads.length > 0
      if (!awaitingFiles && link.lastPhoneText === message.text && Date.now() - link.lastPhoneAt < 2500) return
      link.lastPhoneText = message.text
      link.lastPhoneAt = Date.now()
    }
    if (message.kind === 'file') {
      if (!grantAtLeast(this.config.remoteGrant, 'chat')) return
      link.pendingDownloads.push(this.downloadPhoneFile(link, message))
      return
    }
    const files = await this.drainPhoneFiles(link)
    const pending = link.pendingHuman
    if (pending?.kind === 'ask') {
      pending.resolve({ answers: customAnswersFromText(pending.questions, message.text) })
      delete link.pendingHuman
      this.clearRequest(link, pending.id, 'canceled')
      link.socket.sendToolEnd(pending.id)
      return
    }
    if (pending?.kind === 'plan-review') {
      pending.reject(new UserQuestionError('the user cancelled ask_user_question', 'ASK_CANCELLED'))
      delete link.pendingHuman
      this.clearRequest(link, pending.id, 'canceled')
      link.socket.sendToolEnd(pending.id)
    }
    if (!grantAtLeast(this.config.remoteGrant, 'chat')) {
      link.socket.sendText('service', '当前是「只看」档，不能从手机发消息。')
      return
    }
    if (message.text.trim() === '' && files.length === 0) return
    const ensured = await this.ensureAgent(link)
    const current = this.links.get(dshId)
    if (ensured === undefined || current === undefined) {
      link.socket.keepAlive(false)
      link.socket.sendText('service', '没法从手机打开这场对话。请先在网页点开它一次，然后再试。')
      return
    }
    const { agent } = ensured
    await this.ensurePinnedEffort(agent)
    const names = new Set((this.ctx.get('commands')?.list(agent) ?? []).map(command => command.name))
    const kind = classifyInboundText(message.text, names)
    await this.applyMessageMeta(current, agent, message.meta, kind === 'command')
    if (kind === 'command') {
      if (!grantAtLeast(this.config.remoteGrant, 'full')) {
        current.socket.sendText('service', '斜杠命令需要远程档「完整」。')
        return
      }
      const { encoded } = splitPendingFiles(files)
      const result = await this.ctx.get('commands')?.execute(agent, message.text, encoded, new AbortController().signal)
      const text = result?.result.text ?? (result === undefined ? '未知命令' : result.result.kind)
      current.socket.sendText('service', text)
      return
    }
    await this.followup(current, agent, message.text, files)
  }

  private async applyMessageMeta(link: Link, agent: Agent, meta: Record<string, unknown>, isCommand: boolean): Promise<void> {
    const model = messageModelCode(meta)
    const effort = messageEffort(meta)
    const permissionMode = meta.permissionMode
    if (model !== undefined) {
      if (!grantAtLeast(this.config.remoteGrant, 'full')) {
        link.socket.sendText('service', '改模型需要远程档「完整」，这条消息仍会发出。')
      } else {
        this.applyModel(agent, model, typeof effort === 'string' ? effort : effort === null ? null : undefined)
      }
    } else if (effort === null || typeof effort === 'string') {
      if (!grantAtLeast(this.config.remoteGrant, 'full')) {
        link.socket.sendText('service', '改思考强度需要远程档「完整」，这条消息仍会发出。')
      } else if (effort === null) {
        const current = this.currentModel(agent)
        if (current !== undefined) this.rememberModel(agent, { provider: current.provider, model: current.model })
      } else {
        this.applyEffort(agent, effort)
      }
    }
    if (typeof permissionMode === 'string' && permissionMode !== '') {
      this.applyPermission(agent, permissionMode, isCommand)
    }
  }

  private applyPhoneCatalog(dshId: string, meta: Record<string, unknown>): void {
    if (!grantAtLeast(this.config.remoteGrant, 'full')) return
    const pick = catalogModelPick(meta)
    if (pick === undefined) return
    const published = this.lastPublished.get(dshId)
    if (published === undefined || sameCatalogPick(published, pick)) return
    const link = this.links.get(dshId)
    const agent = link === undefined ? undefined : this.requireAgent(link)
    if (agent === undefined) return
    if (pick.model !== undefined) {
      this.applyModel(agent, pick.model, pick.effort)
      return
    }
    if (pick.effort === null) {
      const current = this.currentModel(agent)
      if (current !== undefined) this.rememberModel(agent, { provider: current.provider, model: current.model })
      return
    }
    if (typeof pick.effort === 'string') this.applyEffort(agent, pick.effort)
  }

  private applyModel(agent: Agent, code: string, effort?: string | null): void {
    const split = splitModelCode(code)
    const current = this.currentModel(agent)
    const provider = split.provider === '' ? current?.provider ?? '' : split.provider
    if (provider === '') return
    const sameModel = current?.provider === provider && current.model === split.model
    const reasoningEffort = effort === null
      ? undefined
      : typeof effort === 'string'
        ? ReasoningEffortId(effort)
        : sameModel
          ? current?.reasoningEffort
          : undefined
    const next: ModelOverride = {
      provider,
      model: split.model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    }
    this.rememberModel(agent, next)
  }

  private applyEffort(agent: Agent, effort: string): void {
    const current = this.currentModel(agent)
    if (current === undefined) return
    this.rememberModel(agent, { ...current, reasoningEffort: ReasoningEffortId(effort) })
  }

  /** Keep the last Host pick so Happy metadata can echo the web composer. */
  private rememberModel(agent: Agent, next: ModelOverride): void {
    const previous = this.models.get(agent.id)
    this.models.set(agent.id, next)
    const selection = this.selections.get(agent)
    if (selection !== undefined) selection.current = next
    if (sameModelOverride(previous, next)) return
    void this.syncHostSelection(agent, next)
  }

  /**
   * Write the web picker's Host selection (`sessionController.selectModel`) so
   * the composer model seat reloads without a click on the computer.
   */
  private async syncHostSelection(agent: Agent, next: ModelOverride): Promise<void> {
    const controller = this.ctx.get('sessionController')
    if (controller === undefined) return
    this.hostSelectFromPhone += 1
    try {
      await controller.selectModel({
        sessionId: agent.id,
        provider: next.provider,
        model: next.model,
        ...(next.reasoningEffort === undefined ? {} : { reasoningEffort: next.reasoningEffort }),
      })
      const link = this.links.get(agent.id)
      if (link !== undefined && !link.parked) void this.pushMetadata(link)
    } catch (error: unknown) {
      this.log(`电脑模型栏未同步：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.hostSelectFromPhone -= 1
    }
  }

  /**
   * After the web picker (or any Host caller) lands a selection, publish it
   * to Happy. Phone-originated calls set {@link hostSelectFromPhone} and push themselves.
   */
  private onHostModelSelected(sessionId: string, selection: { provider: string; model: string; reasoningEffort?: string }): void {
    if (this.hostSelectFromPhone) return
    const next: ModelOverride = {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) }),
    }
    this.models.set(sessionId, next)
    const link = this.links.get(sessionId)
    const agent = link?.agent
    if (agent !== undefined) {
      const current = this.selections.get(agent)
      if (current !== undefined) current.current = next
    }
    if (link !== undefined && !link.parked) void this.pushMetadata(link)
  }

  /**
   * Put a concrete reasoningEffort on a phone-spawned / phone-woken agent
   * before the first LLM request, matching the effort Happy metadata advertises.
   */
  private async ensurePinnedEffort(agent: Agent): Promise<void> {
    const current = this.currentModel(agent)
    if (current === undefined) return
    const preferred = this.defaultModelSelection()?.reasoningEffort
    let modelDefault: string | undefined
    let supported: readonly string[] | undefined
    try {
      const info = await this.ctx.get('llm')?.resolveModelInfo(current.provider, current.model)
      const reasoning = info?.reasoning
      if (typeof reasoning?.defaultEffort === 'string' && reasoning.defaultEffort !== '') {
        modelDefault = reasoning.defaultEffort
      }
      if (reasoning?.efforts !== undefined && reasoning.efforts.length > 0) {
        supported = reasoning.efforts.map(effort => effort.id)
      }
    } catch {
      // 单个模型能力查询失败时仍用已有选择，不挡住唤醒。
    }
    const effort = pinWakeEffort(current.reasoningEffort, preferred, modelDefault, supported)
    if (effort === undefined || effort === current.reasoningEffort) return
    const next: ModelOverride = { ...current, reasoningEffort: ReasoningEffortId(effort) }
    this.models.set(agent.id, next)
    const selection = this.selections.get(agent)
    if (selection !== undefined) selection.current = next
  }

  private applyPermission(agent: Agent, mode: string, fromCommand: boolean): void {
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) return
    const classified = classifyPermissionMode(mode, presets.names)
    if (classified.kind === 'ignore' || classified.kind === 'unknown') {
      const link = this.links.get(agent.id)
      link?.socket.sendText('service', `已忽略手机权限模式 "${mode}"（不是 dsh 预设）。消息仍会发出。`)
      return
    }
    if (classified.preset === 'danger-full-access' && !grantAtLeast(this.config.remoteGrant, 'full')) {
      this.links.get(agent.id)?.socket.sendText('service', '改到 danger-full-access 需要远程档「完整」。')
      return
    }
    if (!fromCommand && !grantAtLeast(this.config.remoteGrant, 'full')) {
      this.links.get(agent.id)?.socket.sendText('service', '改权限预设需要远程档「完整」。')
      return
    }
    try {
      presets.set(agent.session, classified.preset)
    } catch (error) {
      this.log(`切换权限预设失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Queue the phone text as a user followup. The App already shows the typed
   * bubble; do not send a second user envelope. Images ride as DSH
   * attachments; other files land under `happy-inbox` for Harness `read`.
   */
  private async followup(link: Link, agent: Agent, text: string, files: PendingFile[]): Promise<void> {
    const blocks: ContentBlock[] = []
    const { encoded, extras } = splitPendingFiles(files)
    const store = this.ctx.get('attachments')
    if (encoded.length > 0 && store !== undefined) {
      try {
        const refs = await admitEncodedImages(store, encoded)
        for (const ref of refs) blocks.push({ type: 'image', attachment: ref })
      } catch (error) {
        this.log(`图片准入失败：${error instanceof Error ? error.message : String(error)}`)
        link.socket.sendText('service', `图片没能交给电脑：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    let prompt = text
    if (extras.length > 0) {
      const cwd = agent.session.header.cwd ?? link.cwd
      const relative = await saveInboxFiles(cwd, extras)
      prompt = inboxReadPrompt(text, relative)
    }
    if (prompt !== '') blocks.push({ type: 'text', text: prompt })
    if (blocks.length === 0) return
    link.skipNextUser += 1
    link.agent = agent
    agent.followup(createUserMessage({ content: blocks, source: { kind: 'user' } }))
  }

  /**
   * Claim every download started before this text, wait, keep the successes.
   * Swap-then-await so a later file event cannot join this batch.
   */
  private async drainPhoneFiles(link: Link): Promise<PendingFile[]> {
    const downloads = link.pendingDownloads
    link.pendingDownloads = []
    if (downloads.length === 0) return []
    const results = await Promise.all(downloads)
    return results.filter((file): file is PendingFile => file !== undefined)
  }

  private async downloadPhoneFile(
    link: Link,
    message: Extract<InboundMessage, { kind: 'file' }>,
  ): Promise<PendingFile | undefined> {
    if (this.credentials === undefined) return undefined
    try {
      const encrypted = await downloadEncryptedAttachment(
        this.config.serverUrl,
        this.credentials.token,
        link.socket.happySessionId,
        message.ref,
      )
      const key = link.blobKey ?? await deriveBlobKey(link.crypto)
      link.blobKey = key
      const bytes = decryptBlob(encrypted, key)
      if (bytes === null) {
        link.socket.sendText('service', `无法解密附件 ${message.name}`)
        return undefined
      }
      return {
        name: message.name,
        bytes,
        mimeType: message.mimeType ?? '',
      }
    } catch (error) {
      this.log(`下载附件失败：${error instanceof Error ? error.message : String(error)}`)
      link.socket.sendText('service', `下载附件失败：${message.name}`)
      return undefined
    }
  }

  private onSessionEvent(link: Link, event: SessionEvent): void {
    if (!takeForwardedSeq(link, event.seq)) return
    if ((event.type as string) === 'session/title') {
      void this.pushMetadata(link)
      return
    }
    if (event.type === 'user/message') {
      const text = visibleUserText(event)
      const images = visibleUserImages(event)
      if (text === '' && images.length === 0) return
      if (link.skipNextUser > 0) {
        link.skipNextUser -= 1
        return
      }
      this.queueOutboundUser(link, text, images, event.time)
      return
    }
    if (event.type === 'turn/start') {
      link.socket.startTurn()
      return
    }
    if (event.type === 'turn/end') {
      this.flushReasoning(link, event.time)
      const reason = event.data.reason
      if (reason.kind === 'error') {
        const message = reason.error.message.trim()
        if (message !== '') link.socket.sendText('service', `电脑没生成回复：${message}`, event.time)
      }
      const status = reason.kind === 'error' ? 'failed' : reason.kind === 'aborted' || reason.kind === 'interrupted' ? 'cancelled' : 'completed'
      link.socket.endTurn(status)
      return
    }
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string' && chunk.text !== '') {
        link.reasoning += chunk.text
        this.pulseThink(link)
      }
      if (chunk.type === 'block-end' && chunk.block.type === 'reasoning' && typeof chunk.block.text === 'string') {
        link.reasoning = chunk.block.text
        this.pulseThink(link)
      }
      return
    }
    if (event.type === 'assistant/message') {
      // Happy `t: text` is one markdown block. Token deltas would each become a line.
      const parts = assistantParts(event.data.message.content)
      if (!parts.some(part => part.kind === 'thinking')) this.flushReasoning(link, event.time)
      else link.reasoning = ''
      for (const part of parts) {
        if (part.kind === 'thinking') {
          this.finishThink(link, part.text, event.time)
          continue
        }
        if (part.kind === 'text') {
          link.socket.sendText('text', part.text, event.time)
          continue
        }
        this.startTool(link, part.call, part.name, part.args)
      }
      return
    }
    if (event.type === 'tool/call') {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(event.data.arguments) as Record<string, unknown>
      } catch {
        args = { raw: event.data.arguments }
      }
      this.startTool(link, event.data.callId, event.data.name, args)
      return
    }
    if (event.type === 'tool/result') {
      link.socket.sendToolEnd(event.data.message.source.callId)
    }
  }

  private async onApproval(
    req: ApprovalRequest,
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> {
    const link = this.links.get(req.agent.id)
    if (link === undefined || req.callId === undefined) return next()
    if (link.alwaysAllow.has(req.toolName)) return 'allowed-once'
    if (!grantAtLeast(this.config.remoteGrant, 'approve')) return next()
    const id = req.callId
    // 手机批准后给网页那一份发 cancel:进 next() 前把请求上的 signal 换成
    // 「原工具信号 + 专用 controller」的组合信号。手机先点时 controller.abort()
    // → Host 看到组合信号被掐 → 向网页发 cancel 关掉黄框;工具持有的原信号
    // 引用不受影响,已批准的命令照常执行。网页先点则不 abort,不误伤网页结果。
    const controller = new AbortController()
    const combined = req.signal === undefined
      ? controller.signal
      : AbortSignal.any([req.signal, controller.signal])
    ;(req as { signal?: AbortSignal }).signal = combined
    // Happy 的允许/拒绝按钮来自 agentState.requests 占位卡,不是 tool-call-start。
    // 审批时先开工具卡,手机会当成已经在执行,确认框就不弹了。
    const args = req.reason === undefined ? {} : { reason: req.reason }
    const card = happyTool(req.toolName, args)
    let resolvePhone: (outcome: ApprovalOutcome) => void = () => {}
    const phone = new Promise<ApprovalOutcome>((resolve) => {
      resolvePhone = resolve
    })
    link.pendingHuman = {
      kind: 'approval',
      id,
      toolName: req.toolName,
      happyName: card.name,
      arguments: card.args,
      resolve: resolvePhone,
    }
    this.pushRequests(link)
    link.socket.keepAliveNow(true)
    // controller.abort() 会取消网页那一环,next() 的拒绝必须接住,
    // 避免未处理的 Promise 报错。
    const web = next().then(
      outcome => ({ src: 'web' as const, outcome }),
      () => ({ src: 'web' as const, outcome: 'cancelled' as ApprovalOutcome }),
    )
    const winner = await Promise.race([
      phone.then(outcome => ({ src: 'phone' as const, outcome })),
      web,
    ])
    if (winner.src === 'phone') controller.abort()
    if (winner.src === 'web' && link.pendingHuman?.kind === 'approval' && link.pendingHuman.id === id) {
      delete link.pendingHuman
      this.clearRequest(link, id, winner.outcome === 'allowed-once' ? 'approved' : 'canceled')
    }
    // 权限结束、回合还在跑:立刻用可靠通道再声明一次 thinking,
    // 不等 2 秒的 volatile 心跳碰运气(否则在线/思考来回跳)。
    if (link.agent?.status === 'running') link.socket.keepAliveNow(true)
    return winner.outcome
  }

  private onAsk(
    questions: UserQuestionService,
    original: UserQuestionService['ask'],
    request: AskUserQuestionRequest,
  ): Promise<AskUserQuestionAnswer> {
    const agent = request.agent
    const link = agent === undefined ? undefined : this.links.get(agent.id)
    if (link === undefined || !grantAtLeast(this.config.remoteGrant, 'approve')) {
      return original.call(questions, request)
    }
    const first = request.questions[0]
    const controller = new AbortController()
    const combined = request.signal === undefined
      ? controller.signal
      : AbortSignal.any([request.signal, controller.signal])
    const phone = new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      if (first?.intent?.kind === 'plan-review') {
        const id = `plan-${createLocalId()}`
        const plan = first.detail ?? first.question
        const decline = planReviewDeclineLabel(first)
        link.pendingHuman = {
          kind: 'plan-review',
          id,
          resolve,
          reject,
          approveLabel: first.intent.approve,
          declineLabel: decline,
          questionId: first.id,
        }
        link.socket.sendToolStart(id, 'exit_plan_mode', { plan }, '审阅计划', '审阅计划')
        this.pushRequests(link)
        return
      }
      const id = `ask-${createLocalId()}`
      link.pendingHuman = {
        kind: 'ask',
        id,
        resolve,
        reject,
        questions: request.questions.map(question => ({ id: question.id, question: question.question })),
      }
      link.socket.sendToolStart(id, 'AskUserQuestion', {
        questions: request.questions.map(question => ({
          question: question.question,
          header: question.header ?? question.question.slice(0, 24),
          options: (question.options ?? []).map(option => ({
            label: option.label,
            description: option.description ?? '',
          })),
          multiSelect: question.multiSelect === true,
        })),
      }, '需要你回答', '需要你回答')
      this.pushRequests(link)
    })
    const web = original.call(questions, { ...request, signal: combined })
    return Promise.race([
      phone.then((answer) => {
        controller.abort()
        return answer
      }, (error: unknown) => {
        controller.abort()
        throw error
      }),
      web.then((answer) => {
        if (link.pendingHuman !== undefined) {
          this.clearRequest(link, link.pendingHuman.id, 'canceled')
          link.socket.sendToolEnd(link.pendingHuman.id)
          delete link.pendingHuman
        }
        return answer
      }),
    ])
  }

  /**
   * Happy App `sessionAbort` for Rig: empty params, RPC name `abort`.
   * Watch grant keeps the button from doing work; chat and above cancel the turn.
   */
  private onPhoneAbort(dshId: string): void {
    if (!grantAtLeast(this.config.remoteGrant, 'chat')) return
    const link = this.links.get(dshId)
    const agent = link === undefined ? undefined : this.requireAgent(link)
    if (agent === undefined) return
    agent.cancel({ kind: 'user' })
  }

  private onPermission(dshId: string, rpc: PermissionRpc): void {
    const link = this.links.get(dshId)
    const pending = link?.pendingHuman
    if (link === undefined || pending === undefined || pending.id !== rpc.id) return
    if (pending.kind === 'approval') {
      if (rpc.approved) {
        if (rpc.decision === 'approved_for_session') link.alwaysAllow.add(pending.toolName)
        pending.resolve('allowed-once')
        this.clearRequest(link, rpc.id, 'approved')
      } else {
        pending.resolve('rejected')
        this.clearRequest(link, rpc.id, 'denied')
      }
      delete link.pendingHuman
      return
    }
    if (pending.kind === 'plan-review') {
      const selected = rpc.approved ? pending.approveLabel : pending.declineLabel
      pending.resolve({ answers: [{ id: pending.questionId, selected: [selected] }] })
      this.clearRequest(link, rpc.id, rpc.approved ? 'approved' : 'denied')
      delete link.pendingHuman
      link.socket.sendToolEnd(rpc.id)
      return
    }
    if (!rpc.approved) {
      pending.reject(new Error('ASK_ABORTED'))
      this.clearRequest(link, rpc.id, 'denied')
      delete link.pendingHuman
      link.socket.sendToolEnd(rpc.id)
      return
    }
    const mapped = answersFromHappy(rpc.updatedInput?.answers, pending.questions)
    pending.resolve({ answers: mapped.map(row => ({ id: row.id, selected: row.selected })) })
    this.clearRequest(link, rpc.id, 'approved')
    delete link.pendingHuman
    link.socket.sendToolEnd(rpc.id)
  }

  private pushRequests(link: Link): void {
    const pending = link.pendingHuman
    const requests: Record<string, unknown> = {}
    if (pending !== undefined) {
      if (pending.kind === 'approval') {
        requests[pending.id] = {
          tool: pending.happyName,
          arguments: pending.arguments,
          createdAt: Date.now(),
        }
      } else if (pending.kind === 'plan-review') {
        requests[pending.id] = { tool: 'exit_plan_mode', arguments: {}, createdAt: Date.now() }
      } else {
        requests[pending.id] = { tool: 'AskUserQuestion', arguments: {}, createdAt: Date.now() }
      }
    }
    link.socket.updateState({
      controlledByUser: grantAtLeast(this.config.remoteGrant, 'chat'),
      requests,
    })
  }

  private clearRequest(link: Link, id: string, status: string): void {
    link.socket.updateState({
      controlledByUser: grantAtLeast(this.config.remoteGrant, 'chat'),
      requests: {},
      completedRequests: {
        [id]: { status, completedAt: Date.now() },
      },
    })
  }

  private async pushMetadata(link: Link): Promise<void> {
    if (this.credentials === undefined) return
    const workspace = this.workspaceFor(link.dshId, link.cwd)
    if (workspace === undefined) return
    const events = this.linkEvents(link)
    const metadata = await buildSessionMetadata(
      this.ctx,
      {
        cwd: link.cwd,
        happyPath: workspace.virtualPath,
        events,
        ...(link.agent === undefined ? {} : { agent: link.agent }),
      },
      this.credentials.machineId,
      sessionLabel(events),
      link.agent === undefined ? undefined : this.currentModel(link.agent),
      this.config.remoteGrant,
    )
    link.socket.updateMetadata(metadata)
    const pick = catalogModelPick(metadata as unknown as Record<string, unknown>)
    if (pick === undefined) this.lastPublished.delete(link.dshId)
    else this.lastPublished.set(link.dshId, pick)
  }

  private pushAllMetadata(): void {
    for (const link of this.links.values()) {
      if (!link.parked) void this.pushMetadata(link)
    }
  }

  private queueOutboundUser(
    link: Link,
    text: string,
    images: readonly ImageAttachmentRef[],
    time?: number,
  ): void {
    link.outboundTail = link.outboundTail.then(
      () => this.pushUserToPhone(link, text, images, time),
      () => this.pushUserToPhone(link, text, images, time),
    )
  }

  /**
   * Upload web-side images with Happy CLI's encrypt-then-request-upload path,
   * then emit file events and any remaining user text.
   */
  private async pushUserToPhone(
    link: Link,
    text: string,
    images: readonly ImageAttachmentRef[],
    time?: number,
  ): Promise<void> {
    for (const image of images) {
      try {
        await this.uploadOutboundImage(link, image, time)
      } catch (error) {
        this.log(`电脑图片没能推到手机：${error instanceof Error ? error.message : String(error)}`)
        link.socket.sendText('service', `电脑这张图没能发到手机：${image.name ?? 'image'}`, time)
      }
    }
    if (text !== '') link.socket.sendUser(text, time)
  }

  private async uploadOutboundImage(
    link: Link,
    image: ImageAttachmentRef,
    time?: number,
  ): Promise<void> {
    const credentials = this.credentials
    const store = this.ctx.get('attachments')
    if (credentials === undefined || store === undefined) {
      throw new Error('没有附件存储或 Happy 凭据')
    }
    const stored = await store.readImage(image)
    const key = link.blobKey ?? await deriveBlobKey(link.crypto)
    link.blobKey = key
    const encrypted = encryptBlob(stored.data, key)
    const name = image.name ?? `image.${extensionForMime(image.mediaType)}`
    const ref = await uploadEncryptedAttachment(
      this.config.serverUrl,
      credentials.token,
      link.socket.happySessionId,
      name,
      encrypted,
    )
    link.socket.sendFile({
      ref,
      name,
      size: stored.data.byteLength,
      mimeType: image.mediaType,
    }, time)
  }

  private async replayHistory(link: Link): Promise<void> {
    const items = historyItems(this.linkEvents(link))
    if (items.length === 0) return
    link.replaying = true
    try {
      await this.emitHistory(link, items)
    } finally {
      link.replaying = false
    }
    this.log(`已把 ${items.length} 条历史写入 Happy 会话 ${link.socket.happySessionId}`)
  }

  private async emitHistory(link: Link, items: ReturnType<typeof historyItems>): Promise<void> {
    for (const item of items) {
      if (item.kind === 'turn-start') {
        link.socket.startTurn(item.time)
        continue
      }
      if (item.kind === 'turn-end') {
        link.socket.endTurn(item.status, item.time)
        continue
      }
      if (item.kind === 'user') {
        await this.pushUserToPhone(link, item.text, item.images, item.time)
        continue
      }
      if (item.kind === 'assistant') {
        link.socket.sendText('text', item.text, item.time)
        continue
      }
      if (item.kind === 'tool-start') {
        link.socket.sendToolStart(item.call, item.name, item.args, item.title, item.description, item.time)
        continue
      }
      link.socket.sendToolEnd(item.call, item.time)
    }
  }

  private pulseThink(link: Link): void {
    if (link.reasoning.trim() === '') return
    const now = Date.now()
    const label = thinkLabel(link.reasoning)
    if (link.thinkCall === undefined) {
      link.thinkCall = createLocalId()
      link.thinkBodySent = false
      link.thinkLastEmit = now
      link.socket.sendToolStart(link.thinkCall, THINK_TOOL_NAME, { text: link.reasoning }, 'Think', label)
      return
    }
    if (now - link.thinkLastEmit < 200) return
    link.thinkLastEmit = now
    link.socket.sendToolStart(link.thinkCall, THINK_TOOL_NAME, { text: link.reasoning }, 'Think', label)
  }

  private flushReasoning(link: Link, time?: number): void {
    const text = link.reasoning
    link.reasoning = ''
    this.finishThink(link, text, time)
  }

  private finishThink(link: Link, text: string, time?: number): void {
    const body = text.trim()
    if (body === '') {
      if (link.thinkCall !== undefined) {
        link.socket.sendToolEnd(link.thinkCall, time)
        delete link.thinkCall
        link.thinkBodySent = false
      }
      return
    }
    const call = link.thinkCall ?? createLocalId()
    const card = thinkCard(body)
    link.socket.sendToolStart(call, card.name, card.args, card.title, card.description, time)
    link.socket.sendToolEnd(call, time)
    delete link.thinkCall
    link.thinkBodySent = false
    link.thinkLastEmit = 0
  }

  private startTool(link: Link, call: string, name: string, args: Record<string, unknown>): void {
    if (call === '' || link.startedCalls.has(call)) return
    link.startedCalls.add(call)
    const card = happyTool(name, args)
    link.socket.sendToolStart(call, card.name, card.args, card.title, card.description)
  }

  private currentModel(agent: Agent): ModelOverride | undefined {
    const override = this.models.get(agent.id)
    const logged = agent.session.requestHeader()?.config
    const fromLog = logged === undefined
      ? undefined
      : {
        provider: logged.provider,
        model: logged.model,
        ...logged.reasoningEffort === undefined ? {} : { reasoningEffort: logged.reasoningEffort },
      }
    const resolved = wakeModelSelection(override, fromLog, this.defaultModelSelection())
    if (resolved === undefined) return undefined
    return {
      provider: resolved.provider,
      model: resolved.model,
      ...resolved.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: ReasoningEffortId(resolved.reasoningEffort) },
    }
  }

}

function lastEventSeq(events: readonly { seq?: number }[]): number {
  let max = -1
  for (const event of events) {
    if (typeof event.seq === 'number' && event.seq > max) max = event.seq
  }
  return max
}

function takeForwardedSeq(link: Pick<Link, 'lastForwardedSeq'>, seq: number): boolean {
  if (seq <= link.lastForwardedSeq) return false
  link.lastForwardedSeq = seq
  return true
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function createLocalId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16)
}

function extensionForMime(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/webp') return 'webp'
  return 'png'
}
