/** Settings → Plugins card: pairing QR, copy links, remote grant. */
import { type ReactNode } from 'react';
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { PairingStatus, RemoteGrant } from '../types.ts';
import { NS } from './locales.ts';
/** Fields this card reads from the `happy-bridge` settings namespace. */
export interface HappyBridgeSettings {
    enabled?: boolean;
    remoteGrant?: RemoteGrant;
}
/** Injected Host RPC + settings writes. Snapshot rides `hooks.happySettings`. */
export interface HappyBridgeInjected {
    /** Poll pairing status (includes QR data URL). */
    getStatus: () => Promise<PairingStatus>;
    /** Start or resume pairing. */
    startPairing: () => Promise<PairingStatus>;
    /** Disconnect Happy; the web UI stays up. */
    disconnect: () => Promise<PairingStatus>;
    /** Drop the current login and show a new QR. */
    rePair: () => Promise<PairingStatus>;
    /** Persist the remote-grant field. */
    setGrant: (grant: RemoteGrant) => Promise<void>;
    /** Persist the enabled field. */
    setEnabled: (enabled: boolean) => Promise<void>;
    hooks: {
        /** Live settings snapshot for this namespace. */
        happySettings: {
            getSnapshot(): SettingsScopeSnapshot<HappyBridgeSettings>;
            subscribe(fn: () => void): () => void;
        };
    };
}
/** Card props: locale seat plus injected RPC. */
export type HappyBridgeCardProps = PropsLocale<typeof NS> & InjectFace<HappyBridgeInjected>;
/**
 * Render the Happy remote plugin card.
 * @param props - locale + injected Host RPC.
 */
export declare function HappyBridgeCard(props: HappyBridgeCardProps): ReactNode;
//# sourceMappingURL=HappyBridgeCard.d.ts.map