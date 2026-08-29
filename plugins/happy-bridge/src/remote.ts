/** Typert Remote for the settings card: pairing status, start, disconnect. */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { HappyBridge } from './bridge.ts'
import type { PairingStatus } from './types.ts'

/**
 * Host RPC the browser settings card calls.
 */
export class HappyBridgeService extends TypertRemoteService {
  /** Live bridge; swapped when settings rebuild. */
  live: HappyBridge | undefined

  /**
   * @param ctx - Host context.
   */
  constructor(ctx: Context) {
    super(ctx, 'happyBridge')
  }

  /**
   * Current pairing / connection snapshot, including a QR data URL while pairing.
   * @returns status for the settings card.
   */
  @Remote('getStatus')
  async getStatus(): Promise<PairingStatus> {
    if (this.live === undefined) {
      return { paired: false, pairing: false, serverUrl: '' }
    }
    return this.live.status()
  }

  /**
   * Start or resume pairing.
   */
  @Remote('startPairing')
  async startPairing(): Promise<PairingStatus> {
    await this.live?.beginPairing()
    return this.getStatus()
  }

  /**
   * Disconnect Happy. The web UI keeps running.
   */
  @Remote('disconnect')
  async disconnect(): Promise<PairingStatus> {
    await this.live?.disconnect()
    return this.getStatus()
  }

  /**
   * Drop the current login and start a fresh QR pairing.
   */
  @Remote('rePair')
  async rePair(): Promise<PairingStatus> {
    await this.live?.rePair()
    return this.getStatus()
  }
}
