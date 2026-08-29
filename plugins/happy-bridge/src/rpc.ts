/** Prefixed Happy RPC: encrypt params/results, wait for `rpc-registered`. */

import type { Socket } from 'socket.io-client'
import { decryptB64, encryptB64, type CryptoContext } from './encryption.ts'

/** Handler for one decrypted RPC method. */
export type RpcHandler = (params: unknown) => unknown | Promise<unknown>

/**
 * Register `{prefix}:{method}` and wait for the server ack (with timeout).
 * @param socket - connected Socket.IO socket.
 * @param prefix - machineId or sessionId.
 * @param method - bare method name.
 * @param crypto - same variant as chat.
 * @param handler - decrypted params in, plaintext result out.
 * @param log - warning logger.
 */
export async function registerRpc(
  socket: Socket,
  prefix: string,
  method: string,
  crypto: CryptoContext,
  handler: RpcHandler,
  log: (message: string) => void,
): Promise<void> {
  const prefixed = `${prefix}:${method}`
  socket.on('rpc-request', async (data: { method?: string; params?: string }, callback: (response: string) => void) => {
    if (data.method !== prefixed) return
    try {
      const params = typeof data.params === 'string' ? decryptB64(crypto, data.params) : data.params
      const result = await handler(params)
      callback(encryptB64(crypto, result))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`RPC ${prefixed} 失败：${message}`)
      callback(encryptB64(crypto, { error: message }))
    }
  })
  await waitRegistered(socket, prefixed, log)
}

/**
 * Re-emit `rpc-register` after a Socket.IO reconnect without adding another handler.
 * @param socket - connected socket.
 * @param method - already-prefixed `{id}:{name}` method.
 */
export function requestRpcRegister(socket: Socket, method: string): void {
  socket.emit('rpc-register', { method })
}

async function waitRegistered(
  socket: Socket,
  method: string,
  log: (message: string) => void,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      socket.off('rpc-registered', onRegistered)
      log(`等待 rpc-registered（${method}）超时，继续运行`)
      resolve()
    }, 8000)
    const onRegistered = (data: { method?: string }): void => {
      if (data.method !== method) return
      clearTimeout(timer)
      socket.off('rpc-registered', onRegistered)
      resolve()
    }
    socket.on('rpc-registered', onRegistered)
    socket.emit('rpc-register', { method })
  })
}
