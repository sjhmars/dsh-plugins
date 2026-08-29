/** Typert Remote for the settings card: pairing status, start, disconnect. */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { HappyBridge } from './bridge.ts';
import type { PairingStatus } from './types.ts';
/**
 * Host RPC the browser settings card calls.
 */
export declare class HappyBridgeService extends TypertRemoteService {
    /** Live bridge; swapped when settings rebuild. */
    live: HappyBridge | undefined;
    /**
     * @param ctx - Host context.
     */
    constructor(ctx: Context);
    /**
     * Current pairing / connection snapshot, including a QR data URL while pairing.
     * @returns status for the settings card.
     */
    getStatus(): Promise<PairingStatus>;
    /**
     * Start or resume pairing.
     */
    startPairing(): Promise<PairingStatus>;
    /**
     * Disconnect Happy. The web UI keeps running.
     */
    disconnect(): Promise<PairingStatus>;
    /**
     * Drop the current login and start a fresh QR pairing.
     */
    rePair(): Promise<PairingStatus>;
}
//# sourceMappingURL=remote.d.ts.map