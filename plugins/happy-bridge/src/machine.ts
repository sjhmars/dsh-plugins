/** Machine-scoped Happy socket: spawn, stop-session, slim listDirectory. */

import { hostname } from 'node:os'
import { io, type Socket } from 'socket.io-client'
import { HAPPY_CLIENT } from './happy-version.ts'
import type { CryptoContext } from './encryption.ts'
import { registerRpc, requestRpcRegister } from './rpc.ts'
import { listVirtualDirectory, VIRTUAL_HOME } from './paths.ts'
import type { SpawnSessionOptions, SpawnSessionResult, VirtualWorkspace } from './types.ts'

/** Machine RPC handlers owned by the bridge. */
export interface MachineHandlers {
  spawn: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>
  /** Continue an offline Happy row (`resume-happy-session`). */
  resume: (happySessionId: string) => Promise<SpawnSessionResult>
  stopSession: (happySessionId: string) => void
  listWorkspaces: () => VirtualWorkspace[]
  log: (message: string) => void
}

/**
 * Machine-scoped connection so the App New button reaches this Host.
 */
export class HappyMachineSocket {
  private socket: Socket | undefined
  private aliveTimer: ReturnType<typeof setInterval> | undefined
  private readonly rpcMethods: string[] = []

  /**
   * @param machineId - stable machine id.
   * @param token - bearer token.
   * @param serverUrl - API origin.
   * @param crypto - machine encryption.
   * @param handlers - spawn / resume / list / stop.
   */
  constructor(
    readonly machineId: string,
    private readonly token: string,
    private readonly serverUrl: string,
    private readonly crypto: CryptoContext,
    private readonly handlers: MachineHandlers,
  ) {}

  /** Connect and register prefixed RPCs. Does not register bash/writeFile. */
  async connect(): Promise<void> {
    const socket = io(this.serverUrl, {
      auth: {
        token: this.token,
        clientType: 'machine-scoped',
        machineId: this.machineId,
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
    socket.on('connect_error', (error: Error) => {
      this.handlers.log(`机器通道错误：${error.message}`)
    })
    socket.on('connect', () => {
      this.sendAlive()
      for (const method of this.rpcMethods) requestRpcRegister(socket, method)
    })
    try {
      await waitConnect(socket)
    } catch (error) {
      this.handlers.log(`${error instanceof Error ? error.message : String(error)}，机器通道继续自动重连`)
    }
    await this.bindRpc(socket, 'spawn-happy-session', async (params) => {
      const options = asSpawn(params)
      return this.handlers.spawn(options)
    })
    await this.bindRpc(socket, 'resume-happy-session', async (params) => {
      const id = asRecord(params).sessionId
      if (typeof id !== 'string' || id === '') {
        return { type: 'error', errorMessage: 'Session ID is required' } satisfies SpawnSessionResult
      }
      return this.handlers.resume(id)
    })
    await this.bindRpc(socket, 'stop-session', (params) => {
      const id = asRecord(params).sessionId
      if (typeof id !== 'string' || id === '') throw new Error('Session ID is required')
      this.handlers.stopSession(id)
      return { success: true, message: 'Session stopped' }
    })
    await this.bindRpc(socket, 'listDirectory', (params) => {
      const path = typeof asRecord(params).path === 'string' ? String(asRecord(params).path) : VIRTUAL_HOME
      return listVirtualDirectory(path, this.handlers.listWorkspaces())
    })
    this.sendAlive()
    this.aliveTimer = setInterval(() => {
      this.sendAlive()
    }, 20000)
    this.handlers.log(`机器 ${this.machineId}（${hostname()}）已连上 Happy`)
  }

  private async bindRpc(
    socket: Socket,
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ): Promise<void> {
    await registerRpc(socket, this.machineId, method, this.crypto, handler, this.handlers.log)
    this.rpcMethods.push(`${this.machineId}:${method}`)
  }

  private sendAlive(): void {
    this.socket?.emit('machine-alive', { machineId: this.machineId, time: Date.now() })
  }

  /** Close the machine socket. */
  dispose(): void {
    if (this.aliveTimer !== undefined) clearInterval(this.aliveTimer)
    this.socket?.removeAllListeners()
    this.socket?.disconnect()
    this.socket = undefined
  }
}

function waitConnect(socket: Socket): Promise<void> {
  if (socket.connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect)
      reject(new Error('连接 Happy 机器通道超时'))
    }, 60000)
    const onConnect = (): void => {
      clearTimeout(timer)
      resolve()
    }
    socket.once('connect', onConnect)
  })
}

function asSpawn(params: unknown): SpawnSessionOptions {
  const record = asRecord(params)
  if (typeof record.directory !== 'string' || record.directory === '') {
    throw new Error('Directory is required')
  }
  return {
    directory: record.directory,
    ...(typeof record.sessionId === 'string' ? { sessionId: record.sessionId } : {}),
    ...(typeof record.permissionMode === 'string' ? { permissionMode: record.permissionMode } : {}),
    ...(typeof record.modelMode === 'string' ? { modelMode: record.modelMode } : {}),
    ...(typeof record.effortLevel === 'string' ? { effortLevel: record.effortLevel } : {}),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}
