/** Installer configuration and package-operation outcomes. */

/** Settings resolved by the Loader before installation routes mount. */
export interface Config {
  /** Must match the running web or desktop profile. */
  profile: 'web' | 'desktop'
  /** PATH executable used when the application supplies no bundled package manager. */
  pnpmCommand: string
  /** Maximum captured package-manager output, in bytes. Full output remains in the diagnostic log. */
  outputBytes: number
  /** Maximum wait for the profile writer lock, in milliseconds. */
  lockWaitMs: number
  /** Maximum time without package-manager output, in milliseconds. */
  idleTimeoutMs: number
  /** Maximum registry preflight time, in milliseconds. */
  lookupTimeoutMs: number
}

/** Saved installation and its application state, displayed by the Plugins page. */
export interface InstallResult {
  /** Installation and compatibility checks succeeded; this does not imply the component is running. */
  ok: boolean
  /** Zero on success, two for invalid input, otherwise the nonzero package exit code or one. */
  code: number
  stdout: string
  stderr: string
  /** Successful installations require a process restart. */
  application?: 'restart-required' | 'failed' | 'cancelled'
  /** Bundles supply composition; dependencies need an existing or user-authored plugin row. */
  kind?: 'bundle' | 'dependency'
  /** Whether the installed bundle is selected in the profile. */
  enabled?: boolean
  /** Actual installed version, which can differ from a requested dist-tag. */
  version?: string
}
