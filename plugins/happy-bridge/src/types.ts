/** Shared plugin types: config, credentials, remote grant, and Happy wire extras. */

/** Remote-control depth the phone is allowed on this Host. */
export type RemoteGrant = 'watch' | 'chat' | 'approve' | 'full'

/** Transport for harness `ask_user_question` on the phone. */
export type QuestionChannel = 'communications' | 'permission'

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
  /**
   * Which Happy channel carries questions. `communications` is the App's form
   * channel (options plus a free-text answer, with the choice echoed back on
   * the card); `permission` is the legacy AskUserQuestion fallback for older
   * App builds.
   */
  questionChannel: QuestionChannel
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

/** One question published on the Happy communications channel. */
export interface HappyFormQuestion {
  /** Harness question id; the App echoes it back as the answer key. */
  id: string
  header: string
  question: string
  options: { label: string; description?: string }[]
  multiSelect: boolean
  /** Lets the user write an answer the options did not offer. */
  allowCustom: boolean
  required: boolean
}

/** Pending communications entry published through agentState.communications. */
export interface HappyCommunicationEntry {
  kind: 'form'
  createdAt: number
  /** Equals the `request_user_input` tool-call id so the App joins the form to its card. */
  toolUseId: string
  title: string
  form: { questions: HappyFormQuestion[] }
}

/**
 * Completed communications entry. The App renders `answers` verbatim on the
 * card ("header: chosen labels / custom text"), which is the answer echo.
 */
export interface HappyCompletedCommunication extends HappyCommunicationEntry {
  completedAt: number
  status: 'answered' | 'cancelled'
  answers?: Record<string, { options: string[]; custom?: string }>
}

/**
 * Pending permission request entry, shaped like the official CLI's
 * `requests[id] = { tool, arguments, createdAt }`.
 */
export interface HappyRequestEntry {
  tool: string
  arguments: Record<string, unknown>
  createdAt: number
}

/**
 * Completed permission request entry. The App's zod schema requires `tool`
 * (and reads `arguments`); an entry without them blanks the whole agentState.
 */
export interface HappyCompletedRequest extends HappyRequestEntry {
  completedAt: number
  status: 'approved' | 'denied' | 'canceled'
  reason?: string
}

/** Happy `communication` RPC body from the App. */
export interface CommunicationRpc {
  id: string
  kind: string
  status: 'answered' | 'cancelled'
  answers?: Record<string, { options: string[]; custom?: string }>
}
