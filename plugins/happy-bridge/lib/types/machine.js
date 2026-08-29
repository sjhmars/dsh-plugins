/** Machine-scoped Happy socket: spawn, stop-session, slim listDirectory. */
import { hostname } from 'node:os';
import { io } from 'socket.io-client';
import { HAPPY_CLIENT } from "./happy-version.js";
import { registerRpc, requestRpcRegister } from "./rpc.js";
import { listVirtualDirectory, VIRTUAL_HOME } from "./paths.js";
/**
 * Machine-scoped connection so the App New button reaches this Host.
 */
export class HappyMachineSocket {
    machineId;
    token;
    serverUrl;
    crypto;
    handlers;
    socket;
    aliveTimer;
    rpcMethods = [];
    /**
     * @param machineId - stable machine id.
     * @param token - bearer token.
     * @param serverUrl - API origin.
     * @param crypto - machine encryption.
     * @param handlers - spawn / resume / list / stop.
     */
    constructor(machineId, token, serverUrl, crypto, handlers) {
        this.machineId = machineId;
        this.token = token;
        this.serverUrl = serverUrl;
        this.crypto = crypto;
        this.handlers = handlers;
    }
    /** Connect and register prefixed RPCs. Does not register bash/writeFile. */
    async connect() {
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
        });
        this.socket = socket;
        socket.on('connect_error', (error) => {
            this.handlers.log(`机器通道错误：${error.message}`);
        });
        socket.on('connect', () => {
            this.sendAlive();
            for (const method of this.rpcMethods)
                requestRpcRegister(socket, method);
        });
        try {
            await waitConnect(socket);
        }
        catch (error) {
            this.handlers.log(`${error instanceof Error ? error.message : String(error)}，机器通道继续自动重连`);
        }
        await this.bindRpc(socket, 'spawn-happy-session', async (params) => {
            const options = asSpawn(params);
            return this.handlers.spawn(options);
        });
        await this.bindRpc(socket, 'resume-happy-session', async (params) => {
            const id = asRecord(params).sessionId;
            if (typeof id !== 'string' || id === '') {
                return { type: 'error', errorMessage: 'Session ID is required' };
            }
            return this.handlers.resume(id);
        });
        await this.bindRpc(socket, 'stop-session', (params) => {
            const id = asRecord(params).sessionId;
            if (typeof id !== 'string' || id === '')
                throw new Error('Session ID is required');
            this.handlers.stopSession(id);
            return { success: true, message: 'Session stopped' };
        });
        await this.bindRpc(socket, 'listDirectory', (params) => {
            const path = typeof asRecord(params).path === 'string' ? String(asRecord(params).path) : VIRTUAL_HOME;
            return listVirtualDirectory(path, this.handlers.listWorkspaces());
        });
        this.sendAlive();
        this.aliveTimer = setInterval(() => {
            this.sendAlive();
        }, 20000);
        this.handlers.log(`机器 ${this.machineId}（${hostname()}）已连上 Happy`);
    }
    async bindRpc(socket, method, handler) {
        await registerRpc(socket, this.machineId, method, this.crypto, handler, this.handlers.log);
        this.rpcMethods.push(`${this.machineId}:${method}`);
    }
    sendAlive() {
        this.socket?.emit('machine-alive', { machineId: this.machineId, time: Date.now() });
    }
    /** Close the machine socket. */
    dispose() {
        if (this.aliveTimer !== undefined)
            clearInterval(this.aliveTimer);
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        this.socket = undefined;
    }
}
function waitConnect(socket) {
    if (socket.connected)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off('connect', onConnect);
            reject(new Error('连接 Happy 机器通道超时'));
        }, 60000);
        const onConnect = () => {
            clearTimeout(timer);
            resolve();
        };
        socket.once('connect', onConnect);
    });
}
function asSpawn(params) {
    const record = asRecord(params);
    if (typeof record.directory !== 'string' || record.directory === '') {
        throw new Error('Directory is required');
    }
    return {
        directory: record.directory,
        ...(typeof record.sessionId === 'string' ? { sessionId: record.sessionId } : {}),
        ...(typeof record.permissionMode === 'string' ? { permissionMode: record.permissionMode } : {}),
        ...(typeof record.modelMode === 'string' ? { modelMode: record.modelMode } : {}),
        ...(typeof record.effortLevel === 'string' ? { effortLevel: record.effortLevel } : {}),
    };
}
function asRecord(value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}
//# sourceMappingURL=machine.js.map