/** One Happy session-scoped socket: encrypt chat, metadata, agentState, permission RPC. */
import { type CryptoContext } from './encryption.ts';
import { type HappyInbound } from './inbound.ts';
import type { PermissionRpc } from './types.ts';
/** Callbacks the bridge installs on one Happy session. */
export interface SessionHandlers {
    /** Decrypted inbound chat or file. */
    onInbound: (message: InboundMessage) => void;
    /** Phone answered a permission / fake-tool request. */
    onPermission: (rpc: PermissionRpc) => void;
    /** Phone tapped Stop. Happy App `sessionAbort` for Rig sends `{}`. */
    onAbort: () => void;
    /** App archived or deleted this Happy session. */
    onArchived: () => void;
    /** App restored an archived session (lifecycle back to running). */
    onResumed: () => void;
    /** Phone changed Happy session metadata (model picker, without sending). */
    onCatalog: (meta: Record<string, unknown>) => void;
    /** Log line. */
    log: (message: string) => void;
}
/** Normalized inbound payload from Happy. */
export type InboundMessage = HappyInbound;
/**
 * Session-scoped Happy client for one mirrored or spawned conversation.
 */
export declare class HappySessionSocket {
    readonly happySessionId: string;
    private readonly token;
    private readonly serverUrl;
    private readonly crypto;
    private readonly handlers;
    private socket;
    private metadataVersion;
    private agentStateVersion;
    private aliveTimer;
    private turnId;
    private thinking;
    private rpcReady;
    private readonly rpcMethods;
    /**
     * @param happySessionId - Happy cloud session id.
     * @param token - bearer token.
     * @param serverUrl - API origin.
     * @param crypto - content encryption for this session.
     * @param handlers - inbound callbacks.
     */
    constructor(happySessionId: string, token: string, serverUrl: string, crypto: CryptoContext, handlers: SessionHandlers);
    /** Connect, register permission + abort + killSession, start keepalive. */
    connect(initialMetadataVersion?: number, initialAgentStateVersion?: number): Promise<void>;
    /** Stop session-alive so an App archive can stick. */
    stopKeepAlive(): void;
    /** Close the socket and keepalive. */
    dispose(): void;
    /** Whether the Happy session-scoped socket is connected. */
    isConnected(): boolean;
    /** Current Happy turn id for agent envelopes. */
    currentTurn(): string | undefined;
    /**
     * Open a Happy turn (turn-start).
     * @param time - original log time when replaying history.
     * @returns the new turn id.
     */
    startTurn(time?: number): string;
    /**
     * Close the Happy turn.
     * @param status - completed / failed / cancelled.
     * @param time - original log time when replaying history.
     */
    endTurn(status: 'completed' | 'failed' | 'cancelled', time?: number): void;
    /**
     * Send an agent text or service envelope.
     * @param kind - `text` or `service`.
     * @param text - markdown body.
     * @param time - original log time when replaying history.
     * @param thinking - `true` for a reasoning block the App can collapse.
     */
    sendText(kind: 'text' | 'service', text: string, time?: number, thinking?: boolean): void;
    /**
     * Send a user text envelope (history backfill or echo).
     * @param text - markdown body.
     * @param time - original log time when replaying history.
     */
    sendUser(text: string, time?: number): void;
    /**
     * Send a user file envelope after the encrypted blob is already on Happy.
     * Matches CLI `uploadLocalImageAttachmentEnvelope`: `size` is plaintext bytes.
     * @param file - Happy `ref` plus display fields.
     * @param time - original log time when replaying history.
     */
    sendFile(file: {
        ref: string;
        name: string;
        size: number;
        mimeType?: string;
    }, time?: number): void;
    /**
     * Send a tool-call card.
     * @param call - matching id. A later start with the same id updates description.
     * @param name - Happy tool name (PascalCase knownTools, or a camouflage).
     * @param args - tool arguments. Happy merges by keeping already-seen keys.
     * @param title - short heading (schema-required; App often ignores it).
     * @param description - row subtitle the App actually shows.
     * @param time - original log time when replaying history.
     */
    sendToolStart(call: string, name: string, args: Record<string, unknown>, title: string, description: string, time?: number): void;
    /**
     * Close a tool-call card.
     * @param call - matching id.
     * @param time - original log time when replaying history.
     */
    sendToolEnd(call: string, time?: number): void;
    /**
     * Emit session-alive so the App shows the session as linked / online.
     * Happy CLI sends this immediately and every 2s; without it the list archives the row.
     * @param thinking - `agent/status === running`.
     */
    keepAlive(thinking: boolean): void;
    /**
     * Restart session-alive if the timer was cleared. Happy lists the row as
     * offline once heartbeats stop; opening the chat on the phone does not
     * start them again.
     */
    ensureKeepAlive(): void;
    private emitAlive;
    private ensureAliveTimer;
    /** Tell Happy this session process is gone so the App can archive or delete it. */
    endSession(): void;
    /**
     * Encrypt and push session metadata.
     * @param metadata - plaintext catalog object.
     */
    updateMetadata(metadata: unknown): void;
    private emitMetadata;
    /**
     * Encrypt and push agentState (permission requests).
     * @param agentState - plaintext agentState.
     */
    updateState(agentState: unknown): void;
    private sendAgent;
    private emitEnvelope;
    private onMetadataUpdate;
    private dispatchInbound;
}
//# sourceMappingURL=session-socket.d.ts.map