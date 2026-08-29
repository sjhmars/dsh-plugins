/** Shared plugin types: config, credentials, remote grant, and Happy wire extras. */

/** Remote-control depth the phone is allowed on this Host. */
export type RemoteGrant = 'watch' | 'chat' | 'approve' | 'full'

/** Validated plugin config. */
export interface Config {
  /** Master switch. */
  enabled: boolean
  /** Happy API origin. */
  serverUrl: string
  /** Happy App origin used to build the web pairing URL. */
  appUrl: string
  /** Credential directory; empty means `%USERPROFILE%\.dsh\happy-bridge`. */
  credentialDir: string
  /** Start or resume pairing when the plugin loads. */
  pairOnStart: boolean
  /** How deeply the phone may control this Host. */
  remoteGrant: RemoteGrant
}

/** Encryption variant stored with the account credentials. */
export type EncryptionVariant = 'legacy' | 'dataKey'

/** Account credentials after pairing or loading `~/.happy/access.key`. */
export interface Credentials {
  /** Bearer token for HTTP and Socket.IO. */
  token: string
  /** Content-encryption variant. */
  encryption: {
    type: 'legacy'
    secret: Uint8Array
  } | {
    type: 'dataKey'
    publicKey: Uint8Array
    machineKey: Uint8Array
  }
  /** Stable machine id for machine-scoped sockets. */
  machineId: string
}

/** Pairing / connection snapshot served to the settings card. */
export interface PairingStatus {
  /** Whether a usable token is on disk and not locally disconnected. */
  paired: boolean
  /** Whether we are currently polling `/v1/auth/request`. */
  pairing: boolean
  /** Mobile `happy://terminal?...` URL, when pairing. */
  mobileUrl?: string
  /** Web App connect URL, when pairing. */
  webUrl?: string
  /** QR PNG as a data URL for the mobile pairing URL. */
  qrDataUrl?: string
  /** Last error shown on the card. */
  error?: string
  /** Configured Happy API origin. */
  serverUrl: string
  /** Machine id once known. */
  machineId?: string
  /** How many mirrored Happy session sockets exist. */
  sessionCount?: number
  /** How many of those sockets are currently connected. */
  linkedCount?: number
}

/** One pending Happy file waiting to ride with the next user text. */
export interface PendingFile {
  /** Original display name. */
  name: string
  /** Decrypted bytes. */
  bytes: Uint8Array
  /** Declared or sniffed media type. */
  mimeType: string
}

/** Spawn RPC input (Happy CLI `SpawnSessionOptions` subset). */
export interface SpawnSessionOptions {
  directory: string
  sessionId?: string
  permissionMode?: string
  modelMode?: string
  effortLevel?: string
}

/** Spawn RPC result. */
export type SpawnSessionResult =
  | { type: 'success'; sessionId: string }
  | { type: 'error'; errorMessage: string }

/** One registered workspace exposed as a virtual directory under `/dsh-workspaces`. */
export interface VirtualWorkspace {
  /** Virtual POSIX path the Happy picker can join. */
  virtualPath: string
  /** Real workspace directory. */
  realPath: string
  /** Display name. */
  title: string
}

/** Permission RPC body from the Happy App. */
export interface PermissionRpc {
  id: string
  approved: boolean
  /** Happy Allow-always; remembered in this process only. */
  decision?: string
  updatedInput?: {
    answers?: Record<string, string>
  }
}
