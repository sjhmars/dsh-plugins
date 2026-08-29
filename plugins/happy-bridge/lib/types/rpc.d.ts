/** Prefixed Happy RPC: encrypt params/results, wait for `rpc-registered`. */
import type { Socket } from 'socket.io-client';
import { type CryptoContext } from './encryption.ts';
/** Handler for one decrypted RPC method. */
export type RpcHandler = (params: unknown) => unknown | Promise<unknown>;
/**
 * Register `{prefix}:{method}` and wait for the server ack (with timeout).
 * @param socket - connected Socket.IO socket.
 * @param prefix - machineId or sessionId.
 * @param method - bare method name.
 * @param crypto - same variant as chat.
 * @param handler - decrypted params in, plaintext result out.
 * @param log - warning logger.
 */
export declare function registerRpc(socket: Socket, prefix: string, method: string, crypto: CryptoContext, handler: RpcHandler, log: (message: string) => void): Promise<void>;
/**
 * Re-emit `rpc-register` after a Socket.IO reconnect without adding another handler.
 * @param socket - connected socket.
 * @param method - already-prefixed `{id}:{name}` method.
 */
export declare function requestRpcRegister(socket: Socket, method: string): void;
//# sourceMappingURL=rpc.d.ts.map