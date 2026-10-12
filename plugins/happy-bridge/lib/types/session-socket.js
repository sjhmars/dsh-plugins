/** One Happy session-scoped socket: encrypt chat, metadata, agentState, permission RPC. */
import { createId } from '@paralleldrive/cuid2';
import { createEnvelope } from '@slopus/happy-wire';
import { io } from 'socket.io-client';
import { catalogModelPick, sameCatalogPick } from "./grant.js";
import { HAPPY_CLIENT } from "./happy-version.js";
import { decryptB64, encryptB64 } from "./encryption.js";
import { parseCommunicationRpc, parseHappyInbound, parsePermissionRpc } from "./inbound.js";
import { registerRpc, requestRpcRegister } from "./rpc.js";
/**
 * Session-scoped Happy client for one mirrored or spawned conversation.
 */
export class HappySessionSocket {
    happySessionId;
    token;
    serverUrl;
    crypto;
    handlers;
    socket;
    metadataVersion = 0;
    externalSelectionRevision = 0;
    metadata = {};
    previousModes;
    publications = new Map();
    metadataTail = Promise.resolve();
    heartbeatEnabled = false;
    disposed = false;
    messageSeq = -1;
    agentStateVersion = 0;
    aliveTimer;
    turnId;
    thinking = false;
    rpcReady = false;
    rpcMethods = [];
    /**
     * @param happySessionId - Happy cloud session id.
     * @param token - bearer token.
     * @param serverUrl - API origin.
     * @param crypto - content encryption for this session.
     * @param handlers - inbound callbacks.
     */
    constructor(happySessionId, token, serverUrl, crypto, handlers) {
        this.happySessionId = happySessionId;
        this.token = token;
        this.serverUrl = serverUrl;
        this.crypto = crypto;
        this.handlers = handlers;
    }
    /**
     * Connect the message/RPC channel without enabling online presence.
     * @param initialMetadataVersion - version returned by create/load.
     * @param initialAgentStateVersion - permission-state version returned by create/load.
     * @param initialMetadata - existing cloud snapshot; establishes a baseline, not a user action.
     */
    async connect(initialMetadataVersion = 0, initialAgentStateVersion = 0, initialMetadata = {}) {
        this.previousModes = { modelMode: initialMetadata.modelMode, effortLevel: initialMetadata.effortLevel };
        this.metadata = initialMetadata;
        this.metadataVersion = initialMetadataVersion;
        this.agentStateVersion = initialAgentStateVersion;
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
        });
        if (this.disposed) {
            socket.disconnect();
            return;
        }
        this.socket = socket;
        socket.on('update', (data) => {
            if (data.body?.t === 'update-session') {
                this.onMetadataUpdate(data.body.metadata);
                return;
            }
            if (data.body?.t !== 'new-message')
                return;
            const content = data.body.message?.content;
            if (content?.t !== 'encrypted' || typeof content.c !== 'string')
                return;
            const seq = data.body.message?.seq;
            if (seq !== undefined && seq <= this.messageSeq)
                return;
            if (seq !== undefined)
                this.messageSeq = seq;
            const plain = decryptB64(this.crypto, content.c);
            this.dispatchInbound(plain);
        });
        socket.on('connect_error', (error) => {
            this.handlers.log(`会话 ${this.happySessionId} 通道错误：${error.message}`);
        });
        socket.on('connect', () => {
            this.keepAlive(this.thinking);
            if (this.rpcReady) {
                for (const method of this.rpcMethods)
                    requestRpcRegister(socket, method);
            }
        });
        try {
            await waitConnect(socket);
        }
        catch (error) {
            this.handlers.log(`${error instanceof Error ? error.message : String(error)}，会话 ${this.happySessionId} 继续自动重连`);
        }
        if (this.disposed)
            return;
        await registerRpc(socket, this.happySessionId, 'permission', this.crypto, (params) => {
            this.handlers.onPermission(asPermission(params));
            return { ok: true };
        }, this.handlers.log);
        this.rpcMethods.push(`${this.happySessionId}:permission`);
        await registerRpc(socket, this.happySessionId, 'communication', this.crypto, (params) => {
            this.handlers.onCommunication(parseCommunicationRpc(params));
            return { ok: true };
        }, this.handlers.log);
        this.rpcMethods.push(`${this.happySessionId}:communication`);
        await registerRpc(socket, this.happySessionId, 'abort', this.crypto, () => {
            this.handlers.onAbort();
            return { ok: true };
        }, this.handlers.log);
        this.rpcMethods.push(`${this.happySessionId}:abort`);
        await registerRpc(socket, this.happySessionId, 'killSession', this.crypto, async () => {
            this.stopKeepAlive();
            await this.handlers.onArchived();
            // Happy App checks `success`, not `ok`. A mismatch toasts 归档失败
            // even when POST /archive and the web hide both landed.
            return { success: true, message: 'Session archived' };
        }, this.handlers.log);
        this.rpcMethods.push(`${this.happySessionId}:killSession`);
        if (this.disposed)
            return;
        this.rpcReady = true;
        this.keepAlive(this.thinking);
    }
    /** Stop session-alive so an App archive can stick. */
    stopKeepAlive() {
        this.heartbeatEnabled = false;
        if (this.aliveTimer !== undefined) {
            clearInterval(this.aliveTimer);
            this.aliveTimer = undefined;
        }
    }
    /** Close the socket and keepalive. */
    dispose() {
        this.disposed = true;
        this.publications.clear();
        this.stopKeepAlive();
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        this.socket = undefined;
    }
    /** Whether the Happy session-scoped socket is connected. */
    isConnected() {
        return this.socket?.connected === true;
    }
    /** Current Happy turn id for agent envelopes. */
    currentTurn() {
        return this.turnId;
    }
    /**
     * Open a Happy turn (turn-start).
     * @param time - original log time when replaying history.
     * @returns the new turn id.
     */
    startTurn(time) {
        this.turnId = createId();
        this.sendAgent({ t: 'turn-start' }, time);
        return this.turnId;
    }
    /**
     * Close the Happy turn.
     * @param status - completed / failed / cancelled.
     * @param time - original log time when replaying history.
     */
    endTurn(status, time) {
        this.sendAgent({ t: 'turn-end', status }, time);
    }
    /**
     * Send an agent text or service envelope.
     * @param kind - `text` or `service`.
     * @param text - markdown body.
     * @param time - original log time when replaying history.
     * @param thinking - `true` for a reasoning block the App can collapse.
     */
    sendText(kind, text, time, thinking = false) {
        if (kind === 'service') {
            this.sendAgent({ t: 'service', text }, time);
            return;
        }
        this.sendAgent(thinking ? { t: 'text', text, thinking: true } : { t: 'text', text }, time);
    }
    /**
     * Send a user text envelope (history backfill or echo).
     * @param text - markdown body.
     * @param time - original log time when replaying history.
     */
    sendUser(text, time) {
        const envelope = createEnvelope('user', { t: 'text', text }, time === undefined ? {} : { time });
        this.emitEnvelope(envelope);
    }
    /**
     * Send a user file envelope after the encrypted blob is already on Happy.
     * Matches CLI `uploadLocalImageAttachmentEnvelope`: `size` is plaintext bytes.
     * @param file - Happy `ref` plus display fields.
     * @param time - original log time when replaying history.
     */
    sendFile(file, time) {
        const envelope = createEnvelope('user', {
            t: 'file',
            ref: file.ref,
            name: file.name,
            size: file.size,
            ...(file.mimeType === undefined ? {} : { mimeType: file.mimeType }),
        }, time === undefined ? {} : { time });
        this.emitEnvelope(envelope);
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
    sendToolStart(call, name, args, title, description, time) {
        this.sendAgent({
            t: 'tool-call-start',
            call,
            name,
            title,
            description,
            args,
        }, time);
    }
    /**
     * Close a tool-call card.
     * @param call - matching id.
     * @param time - original log time when replaying history.
     */
    sendToolEnd(call, time) {
        this.sendAgent({ t: 'tool-call-end', call }, time);
    }
    /**
     * Emit session-alive so the App shows the session as linked / online.
     * Happy CLI sends this immediately and every 2s; without it the list archives the row.
     * @param thinking - `agent/status === running`.
     */
    keepAlive(thinking) {
        if (!this.heartbeatEnabled || this.disposed)
            return;
        this.thinking = thinking;
        this.emitAlive();
        this.ensureAliveTimer();
    }
    /**
     * Assert the session state with a reliable (non-volatile) emit: state
     * transitions must not ride the droppable heartbeat path, or the App
     * flickers between online and thinking until the next 2s tick.
     * @param thinking - `true` while the Host turn is still executing.
     */
    keepAliveNow(thinking) {
        if (!this.heartbeatEnabled || this.disposed)
            return;
        this.thinking = thinking;
        this.socket?.emit('session-alive', {
            sid: this.happySessionId,
            time: Date.now(),
            thinking: this.thinking,
            mode: 'remote',
        });
        this.ensureAliveTimer();
    }
    /**
     * Restart session-alive if the timer was cleared. Happy lists the row as
     * offline once heartbeats stop; opening the chat on the phone does not
     * start them again.
     */
    ensureKeepAlive() {
        if (this.aliveTimer !== undefined)
            return;
        this.keepAlive(this.thinking);
    }
    /** Enable presence only after the bridge has committed a visible session. */
    startKeepAlive() {
        if (this.disposed)
            return;
        this.heartbeatEnabled = true;
        this.keepAlive(this.thinking);
    }
    emitAlive() {
        if (!this.heartbeatEnabled || this.disposed)
            return;
        this.socket?.volatile.emit('session-alive', {
            sid: this.happySessionId,
            time: Date.now(),
            thinking: this.thinking,
            mode: 'remote',
        });
    }
    ensureAliveTimer() {
        if (this.aliveTimer !== undefined || this.socket === undefined)
            return;
        this.aliveTimer = setInterval(() => {
            this.emitAlive();
        }, 2000);
    }
    /** Tell Happy this session process is gone so the App can archive or delete it. */
    endSession() {
        this.stopKeepAlive();
        this.socket?.emit('session-end', { sid: this.happySessionId, time: Date.now() });
    }
    /**
     * Encrypt and push session metadata.
     * @param metadata - plaintext catalog object.
     * @returns completion of the serialized publication; conflicts with new phone picks defer to their Host update.
     */
    updateMetadata(metadata) {
        const task = this.metadataTail.then(() => this.publishMetadata(metadata));
        this.metadataTail = task.catch(error => {
            this.handlers.log('元数据同步失败：' + String(error));
        });
        return task;
    }
    async publishMetadata(owned) {
        const socket = this.socket;
        if (socket === undefined || this.disposed)
            return;
        const selectionRevision = this.externalSelectionRevision;
        for (let attempt = 0; attempt < 4; attempt++) {
            if (this.disposed)
                return;
            const merged = { ...this.metadata, ...owned };
            const expected = this.metadataVersion;
            const value = encryptB64(this.crypto, merged);
            this.publications.set(value, expected + 1);
            const answer = await new Promise((resolve, reject) => {
                socket.timeout(8000).emit('update-metadata', {
                    sid: this.happySessionId, metadata: value, expectedVersion: expected,
                }, (error, result) => {
                    if (error)
                        reject(error);
                    else
                        resolve(result);
                });
            });
            if (this.disposed)
                return;
            if (answer.result === 'success') {
                this.onMetadataUpdate({ version: answer.version ?? expected + 1, value: answer.metadata ?? value });
                return;
            }
            if (answer.result !== 'version-mismatch' || typeof answer.metadata !== 'string' || typeof answer.version !== 'number') {
                throw new Error('Happy rejected metadata update');
            }
            const previous = catalogModelPick(this.metadata);
            this.onMetadataUpdate({ version: answer.version, value: answer.metadata });
            if (this.externalSelectionRevision !== selectionRevision)
                return;
            const latest = catalogModelPick(this.metadata);
            // A new phone pick owns the next publication; its queued Host write
            // will publish the resulting selection instead of replaying this one.
            if (latest !== undefined && !sameCatalogPick(previous, latest))
                return;
        }
        throw new Error('Happy metadata version conflict');
    }
    /**
     * Encrypt and push agentState (permission requests).
     * Retries on version-mismatch the same way metadata does; a dropped bump
     * leaves the App with empty `requests` and no Yes/No card.
     * @param agentState - plaintext agentState.
     */
    updateState(agentState) {
        const socket = this.socket;
        if (socket === undefined)
            return;
        this.emitState(socket, agentState, this.agentStateVersion, 0);
    }
    emitState(socket, agentState, expected, attempt) {
        if (this.disposed)
            return;
        socket.emit('update-state', {
            sid: this.happySessionId,
            agentState: encryptB64(this.crypto, agentState),
            expectedVersion: expected,
        }, (answer) => {
            if (typeof answer?.version === 'number')
                this.agentStateVersion = answer.version;
            if (answer?.result === 'version-mismatch' && attempt < 3 && typeof answer.version === 'number') {
                this.emitState(socket, agentState, answer.version, attempt + 1);
            }
        });
    }
    sendAgent(ev, time) {
        if (this.turnId === undefined)
            this.turnId = createId();
        const envelope = createEnvelope('agent', ev, {
            turn: this.turnId,
            ...(time === undefined ? {} : { time }),
        });
        this.emitEnvelope(envelope);
    }
    emitEnvelope(envelope) {
        const content = { role: 'session', content: envelope, meta: { sentFrom: 'dsh' } };
        this.socket?.emit('message', {
            sid: this.happySessionId,
            message: encryptB64(this.crypto, content),
            localId: createId(),
        });
    }
    onMetadataUpdate(metadata) {
        if (this.disposed || typeof metadata?.value !== 'string' || typeof metadata.version !== 'number')
            return;
        if (metadata.version <= this.metadataVersion)
            return;
        let record;
        try {
            record = asRecord(decryptB64(this.crypto, metadata.value));
        }
        catch {
            return;
        }
        const previous = catalogModelPick(this.metadata);
        const own = this.publications.get(metadata.value) === metadata.version;
        for (const [value, version] of this.publications) {
            if (version <= metadata.version)
                this.publications.delete(value);
        }
        this.metadataVersion = metadata.version;
        this.metadata = record;
        const next = catalogModelPick(record);
        const explicitChange = record.modelMode !== this.previousModes?.modelMode || record.effortLevel !== this.previousModes?.effortLevel;
        this.previousModes = { modelMode: record.modelMode, effortLevel: record.effortLevel };
        if (!own && explicitChange && next !== undefined && !sameCatalogPick(previous, next)) {
            this.externalSelectionRevision += 1;
            this.handlers.onCatalog(record);
        }
    }
    dispatchInbound(plain) {
        const inbound = parseHappyInbound(plain);
        if (inbound !== undefined)
            this.handlers.onInbound(inbound);
    }
}
function waitConnect(socket) {
    if (socket.connected)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off('connect', onConnect);
            reject(new Error('连接 Happy 会话超时'));
        }, 60000);
        const onConnect = () => {
            clearTimeout(timer);
            resolve();
        };
        socket.once('connect', onConnect);
    });
}
function asPermission(params) {
    return parsePermissionRpc(params);
}
function asRecord(value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}
//# sourceMappingURL=session-socket.js.map