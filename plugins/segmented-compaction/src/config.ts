/** Settings shared by the Host and settings card. */
export interface Config {
  enabled: boolean
  contextRatio: number
  maxShrinkRetries: number
  maxCalls: number
}
/** Defaults apply to recovery only, never to the original request. */
export const defaults: Readonly<Config> = Object.freeze({
  enabled: true, contextRatio: 0.8, maxShrinkRetries: 8, maxCalls: 128,
})
/** Validate persisted settings before starting model work. */
export function validateConfig(config: Config): Config {
  if (typeof config.enabled !== 'boolean') throw new Error('enabled must be boolean')
  for (const key of ['maxShrinkRetries', 'maxCalls'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] < (key === 'maxShrinkRetries' ? 0 : 1)) {
      throw new Error(key + ' must be a valid non-negative integer within its allowed range')
    }
  }
  if (!Number.isFinite(config.contextRatio) || config.contextRatio <= 0 || config.contextRatio > 1) {
    throw new Error('contextRatio must be in (0, 1]')
  }
  return { ...config }
}
