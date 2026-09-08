/** One Happy session-scoped socket: encrypt chat, metadata, agentState, permission RPC. */

import { createId } from '@paralleldrive/cuid2'
import { createEnvelope, type SessionEnvelope, type SessionEvent as HappyEvent } from '@slopus/happy-wire'
import { io, type Socket } from 'socket.io-client'
import { HAPPY_CLIENT } from './happy-version.ts'
import { decryptB64, encryptB64, type CryptoContext } from './encryption.ts'
import { parseCommunicationRpc, parseHappyInbound, parsePermissionRpc, type HappyInbound } from './inbound.ts'
import { registerRpc, requestRpcRegister } from './rpc.ts'
import type { CommunicationRpc, PermissionRpc } from './types.ts'

/** Callbacks the bridge installs on one Happy session. */
export interface SessionHandlers {
  /** Decrypted inbound chat or file. */
  onInbound: (message: InboundMessage) => void
  /** Phone answered a permission / fake-tool request. */
  onPermission: (rpc: PermissionRpc) => void
  /** Phone answered or cancelled a communications-channel form. */
  onCommunication: (rpc: CommunicationRpc) => void
  /** Phone tapped Stop. Happy App `sessionAbort` for Rig sends `{}`. */
  onAbort: () => void
  /** App archived or deleted this Happy session. */
  onArchived: () => void
  /** App restored an archived session (lifecycle back to running). */
  onResumed: () => void
  /** Phone changed Happy session metadata (model picker, without sending). */
  onCatalog: (meta: Record<string, unknown>) => void
  /** Log line. */
  log: (message: string) => void
}

/** Normalized inbound payload from Happy. */
export type InboundMessage = HappyInbound

/**
 * Session-scoped Happy client for one mirrored or spawned conversation.
 */
export class HappySessionSocket {
  private socket: Socket | undefined
  private metadataVersion = 0
  private agentStateVersion = 0
  private aliveTimer: ReturnType<typeof setInterval> | undefined
  private turnId: string | undefined
  private thinking = false
  private rpcReady = false
  private readonly rpcMethods: string[] = []

  /**
   * @param happySessionId - Happy cloud session id.
   * @param token - bearer token.
   * @param serverUrl - API origin.
   * @param crypto - content encryption for this session.
   * @param handlers - inbound callbacks.
   */
  constructor(
    readonly happySessionId: string,
    private readonly token: string,
    private readonly serverUrl: string,
    private readonly crypto: CryptoContext,
    private readonly handlers: SessionHandlers,
  ) {}

  /** Connect, register permission + abort + killSession, start keepalive. */
  async connect(initialMetadataVersion = 0, initialAgentStateVersion = 0): Promise<void> {
    this.metadataVersion = initialMetadataVersion
    this.agentStateVersion = initialAgentStateVersion
    const socket = io(this.serverUrl, {
      auth: {
        token: this.token,
        clientType: 'session-scoped',
        sessionId: this.happySessionId,
        happyClient: HAPPY_CLIENT,
      },
      path: '/v1/updates',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      withCredentials: true,
    })
    this.socket = socket
    socket.on('update', (data: {
      body?: {
        t?: string
        message?: { content?: { t?: string; c?: string } }
        metadata?: { version?: number; value?: string }
      }
    }) => {
      if (data.body?.t === 'update-session') {
        this.onMetadataUpdate(data.body.metadata)
        return
      }
      if (data.body?.t !== 'new-message') return
      const content = data.body.message?.content
      if (content?.t !== 'encrypted' || typeof content.c !== 'string') return
      const plain = decryptB64(this.crypto, content.c)
      this.dispatchInbound(plain)
    })
    socket.on('connect_error', (error: Error) => {
      this.handlers.log(`会话 ${this.happySessionId} 通道错误：${error.message}`)
    })
    socket.on('connect', () => {
      this.keepAlive(this.thinking)
      if (this.rpcReady) {
        for (const method of this.rpcMethods) requestRpcRegister(socket, method)
      }
    })
    try {
      await waitConnect(socket)
    } catch (error) {
      this.handlers.log(`${error instanceof Error ? error.message : String(error)}，会话 ${this.happySessionId} 继续自动重连`)
    }
    await registerRpc(socket, this.happySessionId, 'permission', this.crypto, (params) => {
      this.handlers.onPermission(asPermission(params))
      return { ok: true }
    }, this.handlers.log)
    this.rpcMethods.push(`${this.happySessionId}:permission`)
    await registerRpc(socket, this.happySessionId, 'communication', this.crypto, (params) => {
      this.handlers.onCommunication(parseCommunicationRpc(params))
      return { ok: true }
    }, this.handlers.log)
    this.rpcMethods.push(`${this.happySessionId}:communication`)
    await registerRpc(socket, this.happySessionId, 'abort', this.crypto, () => {
      this.handlers.onAbort()
      return { ok: true }
    }, this.handlers.log)
    this.rpcMethods.push(`${this.happySessionId}:abort`)
    await registerRpc(socket, this.happySessionId, 'killSession', this.crypto, () => {
      this.stopKeepAlive()
      this.handlers.onArchived()
      // Happy App checks `success`, not `ok`. A mismatch toasts 归档失败
      // even when POST /archive and the web hide both landed.
      return { success: true, message: 'Session archived' }
    }, this.handlers.log)
    this.rpcMethods.push(`${this.happySessionId}:killSession`)
    this.rpcReady = true
    this.keepAlive(this.thinking)
  }

  /** Stop session-alive so an App archive can stick. */
  stopKeepAlive(): void {
    if (this.aliveTimer !== undefined) {
      clearInterval(this.aliveTimer)
      this.aliveTimer = undefined
    }
  }

  /** Close the socket and keepalive. */
  dispose(): void {
    this.stopKeepAlive()
    this.socket?.removeAllListeners()
    this.socket?.disconnect()
    this.socket = undefined
  }

  /** Whether the Happy session-scoped socket is connected. */
  isConnected(): boolean {
    return this.socket?.connected === true
  }

  /** Current Happy turn id for agent envelopes. */
  currentTurn(): string | undefined {
    return this.turnId
  }

  /**
   * Open a Happy turn (turn-start).
   * @param time - original log time when replaying history.
   * @returns the new turn id.
   */
  startTurn(time?: number): string {
    this.turnId = createId()
    this.sendAgent({ t: 'turn-start' }, time)
    return this.turnId
  }

  /**
   * Close the Happy turn.
   * @param status - completed / failed / cancelled.
   * @param time - original log time when replaying history.
   */
  endTurn(status: 'completed' | 'failed' | 'cancelled', time?: number): void {
    this.sendAgent({ t: 'turn-end', status }, time)
  }

  /**
   * Send an agent text or service envelope.
   * @param kind - `text` or `service`.
   * @param text - markdown body.
   * @param time - original log time when replaying history.
   * @param thinking - `true` for a reasoning block the App can collapse.
   */
  sendText(kind: 'text' | 'service', text: string, time?: number, thinking = false): void {
    if (kind === 'service') {
      this.sendAgent({ t: 'service', text }, time)
      return
    }
    this.sendAgent(thinking ? { t: 'text', text, thinking: true } : { t: 'text', text }, time)
  }

  /**
   * Send a user text envelope (history backfill or echo).
   * @param text - markdown body.
   * @param time - original log time when replaying history.
   */
  sendUser(text: string, time?: number): void {
    const envelope = createEnvelope('user', { t: 'text', text }, time === undefined ? {} : { time })
    this.emitEnvelope(envelope)
  }

  /**
   * Send a user file envelope after the encrypted blob is already on Happy.
   * Matches CLI `uploadLocalImageAttachmentEnvelope`: `size` is plaintext bytes.
   * @param file - Happy `ref` plus display fields.
   * @param time - original log time when replaying history.
   */
  sendFile(file: { ref: string; name: string; size: number; mimeType?: string }, time?: number): void {
    const envelope = createEnvelope('user', {
      t: 'file',
      ref: file.ref,
      name: file.name,
      size: file.size,
      ...(file.mimeType === undefined ? {} : { mimeType: file.mimeType }),
    }, time === undefined ? {} : { time })
    this.emitEnvelope(envelope)
  }

  /**
   * Send a tool-call card.
   * @param call - matching id. A later start with the same id updates description.
   * @param name - Happy tool name (PascalCase knownTools, or a camouflage).
   * @param args - tool arguments. Happy merges by keeping already-seen keys.
   * @param title - short heading (schema-required; App often ignores it).
   * @param description - row subtitle the App actually shows.
   * @param time - original log time when replaying history.
   */
  sendToolStart(
    call: string,
    name: string,
    args: Record<string, unknown>,
    title: string,
    description: string,
    time?: number,
  ): void {
    this.sendAgent({
      t: 'tool-call-start',
      call,
      name,
      title,
      description,
      args,
    }, time)
  }

  /**
   * Close a tool-call card.
   * @param call - matching id.
   * @param time - original log time when replaying history.
   */
  sendToolEnd(call: string, time?: number): void {
    this.sendAgent({ t: 'tool-call-end', call }, time)
  }

  /**
   * Emit session-alive so the App shows the session as linked / online.
   * Happy CLI sends this immediately and every 2s; without it the list archives the row.
   * @param thinking - `agent/status === running`.
   */
  keepAlive(thinking: boolean): void {
    this.thinking = thinking
    this.emitAlive()
    this.ensureAliveTimer()
  }

  /**
   * Assert the session state with a reliable (non-volatile) emit: state
   * transitions must not ride the droppable heartbeat path, or the App
   * flickers between online and thinking until the next 2s tick.
   * @param thinking - `true` while the Host turn is still executing.
   */
  keepAliveNow(thinking: boolean): void {
    this.thinking = thinking
    this.socket?.emit('session-alive', {
      sid: this.happySessionId,
      time: Date.now(),
      thinking: this.thinking,
      mode: 'remote',
    })
    this.ensureAliveTimer()
  }

  /**
   * Restart session-alive if the timer was cleared. Happy lists the row as
   * offline once heartbeats stop; opening the chat on the phone does not
   * start them again.
   */
  ensureKeepAlive(): void {
    if (this.aliveTimer !== undefined) return
    this.keepAlive(this.thinking)
  }

  private emitAlive(): void {
    this.socket?.volatile.emit('session-alive', {
      sid: this.happySessionId,
      time: Date.now(),
      thinking: this.thinking,
      mode: 'remote',
    })
  }

  private ensureAliveTimer(): void {
    if (this.aliveTimer !== undefined || this.socket === undefined) return
    this.aliveTimer = setInterval(() => {
      this.emitAlive()
    }, 2000)
  }

  /** Tell Happy this session process is gone so the App can archive or delete it. */
  endSession(): void {
    this.stopKeepAlive()
    this.socket?.emit('session-end', { sid: this.happySessionId, time: Date.now() })
  }

  /**
   * Encrypt and push session metadata.
   * @param metadata - plaintext catalog object.
   */
  updateMetadata(metadata: unknown): void {
    const socket = this.socket
    if (socket === undefined) return
    this.emitMetadata(socket, metadata, this.metadataVersion, 0)
  }

  private emitMetadata(
    socket: Socket,
    metadata: unknown,
    expected: number,
    attempt: number,
  ): void {
    socket.emit('update-metadata', {
      sid: this.happySessionId,
      metadata: encryptB64(this.crypto, metadata),
      expectedVersion: expected,
    }, (answer: { result?: string; version?: number }) => {
      if (typeof answer?.version === 'number') this.metadataVersion = answer.version
      if (answer?.result === 'version-mismatch' && attempt < 3 && typeof answer.version === 'number') {
        this.emitMetadata(socket, metadata, answer.version, attempt + 1)
      }
    })
  }

  /**
   * Encrypt and push agentState (permission requests).
   * Retries on version-mismatch the same way metadata does; a dropped bump
   * leaves the App with empty `requests` and no Yes/No card.
   * @param agentState - plaintext agentState.
   */
  updateState(agentState: unknown): void {
    const socket = this.socket
    if (socket === undefined) return
    this.emitState(socket, agentState, this.agentStateVersion, 0)
  }

  private emitState(
    socket: Socket,
    agentState: unknown,
    expected: number,
    attempt: number,
  ): void {
    socket.emit('update-state', {
      sid: this.happySessionId,
      agentState: encryptB64(this.crypto, agentState),
      expectedVersion: expected,
    }, (answer: { result?: string; version?: number }) => {
      if (typeof answer?.version === 'number') this.agentStateVersion = answer.version
      if (answer?.result === 'version-mismatch' && attempt < 3 && typeof answer.version === 'number') {
        this.emitState(socket, agentState, answer.version, attempt + 1)
      }
    })
  }

  private sendAgent(ev: HappyEvent, time?: number): void {
    if (this.turnId === undefined) this.turnId = createId()
    const envelope = createEnvelope('agent', ev, {
      turn: this.turnId,
      ...(time === undefined ? {} : { time }),
    })
    this.emitEnvelope(envelope)
  }

  private emitEnvelope(envelope: SessionEnvelope): void {
    const content = { role: 'session', content: envelope, meta: { sentFrom: 'dsh' } }
    this.socket?.emit('message', {
      sid: this.happySessionId,
      message: encryptB64(this.crypto, content),
      localId: createId(),
    })
  }

  private onMetadataUpdate(metadata: { version?: number; value?: string } | undefined): void {
    if (typeof metadata?.value !== 'string') return
    if (typeof metadata.version === 'number') this.metadataVersion = metadata.version
    let record: Record<string, unknown>
    try {
      record = asRecord(decryptB64(this.crypto, metadata.value))
    } catch {
      return
    }
    const lifecycle = record.lifecycleState
    if (lifecycle === 'archiveRequested' || lifecycle === 'archived') {
      this.handlers.onArchived()
      return
    }
    if (lifecycle === 'running') this.handlers.onResumed()
    this.handlers.onCatalog(record)
  }

  private dispatchInbound(plain: unknown): void {
    const inbound = parseHappyInbound(plain)
    if (inbound !== undefined) this.handlers.onInbound(inbound)
  }
}

function waitConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect)
      reject(new Error('连接 Happy 会话超时'))
    }, 60000)
    const onConnect = (): void => {
      clearTimeout(timer)
      resolve()
    }
    socket.once('connect', onConnect)
  })
}

function asPermission(params: unknown): PermissionRpc {
  return parsePermissionRpc(params)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
