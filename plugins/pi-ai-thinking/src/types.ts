/** Narrow JSON-safe view of the llm-pi-ai user settings the plugin changes. */

/** Protocols whose custom provider profiles can expose thinking settings. */
export type PiAiThinkingProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages'

/** One model row from a custom llm-pi-ai provider. */
export interface CustomModel {
  /** User-selected model identifier. */
  id: string
  /** Existing fields retained when thinking capabilities are added. */
  [key: string]: unknown
}

/** One custom llm-pi-ai provider from the user settings layer. */
export interface CustomProvider {
  /** Wire protocol selected in the original custom-provider form. */
  api?: unknown
  /** Custom model rows; a catalog provider has no user-owned list. */
  models?: unknown
  /** Existing fields retained when model capabilities are added. */
  [key: string]: unknown
}

/** The user-owned subset of the llm-pi-ai settings section. */
export interface PiAiUserSettings {
  /** Provider profiles keyed by their route id. */
  providers?: unknown
}
