/**
 * Version strings the Happy App compares against its minimum CLI.
 *
 * This is a reported compatibility tag matching npm `happy`, not this
 * plugin's package version and not an install of the official CLI.
 * Bump when Happy publishes a newer CLI that the App starts nagging for.
 */
export const HAPPY_CLI_VERSION = '1.2.0'

/** Official `X-Happy-Client` / socket `happyClient` value. */
export const HAPPY_CLIENT = `cli-coding-session/${HAPPY_CLI_VERSION}`
