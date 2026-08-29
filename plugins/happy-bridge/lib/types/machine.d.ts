/** Machine-scoped Happy socket: spawn, stop-session, slim listDirectory. */
import type { CryptoContext } from './encryption.ts';
import type { SpawnSessionOptions, SpawnSessionResult, VirtualWorkspace } from './types.ts';
/** Machine RPC handlers owned by the bridge. */
export interface MachineHandlers {
    spawn: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
    /** Continue an offline Happy row (`resume-happy-session`). */
    resume: (happySessionId: string) => Promise<SpawnSessionResult>;
    stopSession: (happySessionId: string) => void;
    listWorkspaces: () => VirtualWorkspace[];
    log: (message: string) => void;
}
/**
 * Machine-scoped connection so the App New button reaches this Host.
 */
export declare class HappyMachineSocket {
    readonly machineId: string;
    private readonly token;
    private readonly serverUrl;
    private readonly crypto;
    private readonly handlers;
    private socket;
    private aliveTimer;
    private readonly rpcMethods;
    /**
     * @param machineId - stable machine id.
     * @param token - bearer token.
     * @param serverUrl - API origin.
     * @param crypto - machine encryption.
     * @param handlers - spawn / resume / list / stop.
     */
    constructor(machineId: string, token: string, serverUrl: string, crypto: CryptoContext, handlers: MachineHandlers);
    /** Connect and register prefixed RPCs. Does not register bash/writeFile. */
    connect(): Promise<void>;
    private bindRpc;
    private sendAlive;
    /** Close the machine socket. */
    dispose(): void;
}
//# sourceMappingURL=machine.d.ts.map