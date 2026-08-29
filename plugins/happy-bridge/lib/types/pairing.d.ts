/** Happy terminal pairing: POST /v1/auth/request, QR URL, poll until authorized. */
import type { Credentials } from './types.ts';
/** Live pairing attempt the settings card can display. */
export interface PairingAttempt {
    /** Mobile `happy://terminal?...` URL. */
    mobileUrl: string;
    /** Web App connect URL. */
    webUrl: string;
    /** QR PNG data URL of the mobile URL. */
    qrDataUrl: string;
    /** Stop polling. */
    abort: () => void;
    /** Resolves with credentials when the phone approves. */
    done: Promise<Omit<Credentials, 'machineId'>>;
}
/**
 * Start one terminal auth request and poll until authorized.
 * @param serverUrl - Happy API origin.
 * @param appUrl - Happy App origin for the web URL.
 * @returns URLs plus a promise that settles on success or abort.
 */
export declare function startPairing(serverUrl: string, appUrl: string): Promise<PairingAttempt>;
//# sourceMappingURL=pairing.d.ts.map