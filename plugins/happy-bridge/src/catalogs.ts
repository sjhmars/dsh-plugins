/** Build Happy session metadata catalogs from the live harness context. */

import { hostname } from 'node:os'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { HAPPY_CLI_VERSION } from './happy-version.ts'
import type { RemoteGrant } from './types.ts'
import { VIRTUAL_HOME } from './paths.ts'

/** One model row Happy's Rig picker understands (slash `code` plus provider/id). */
export interface HappyModelRow {
  code: string
  value: string
  description?: string
  id: string
  name: string
  providerId: string
  providerKind: 'custom'
  providerName: string
  thinkingLevels: string[]
  defaultThinkingLevel?: string
  effortOptions: { code: string; value: string }[]
}

/** Current Host pick published so the phone can echo model + effort. */
export interface HappySelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Plain metadata object written into the encrypted Happy session metadata field. */
export interface SessionMetadata {
  path: string
  host: string
  homeDir: string
  version: string
  name: string
  summary: { text: string; updatedAt: number }
  os: string
  machineId: string
  flavor: 'acp'
  startedBy: 'terminal'
  lifecycleState: string
  lifecycleStateSince: number
  happyHomeDir: string
  happyLibDir: string
  happyToolsDir: string
  slashCommands: string[]
  skills: string[]
  models: HappyModelRow[]
  operatingModes: { code: string; value: string; description: string }[]
  currentModelCode?: string
  currentModelProviderId?: string
  modelMode?: string
  currentOperatingModeCode?: string
  thoughtLevels?: { code: string; value: string }[]
  currentThoughtLevelCode?: string
  effortLevel?: string
  reasoning?: { current: string | null; levels: string[] }
  client: { id: 'rig'; name: string; version: string }
  rigMetadataVersion: 1
  capabilities: {
    abort: true
    attachments: { enabled: true; maxBytes: number; mediaTypes: string[] }
    files: { browse: false; read: false; search: false; write: false }
    modelSelection: true
    reasoningSelection: true
    permissionModeSelection: true
    resume: false
    rpcMethods: string[]
    shell: false
    steering: false
  }
  tools?: string[]
}

/**
 * Snapshot catalogs for one session, live or still sitting in the sidebar.
 * @param ctx - Host context.
 * @param source - real cwd for skills, POSIX `happyPath` for the App list, log, and optional live agent.
 * @param machineId - Happy machine id.
 * @param title - session display name.
 * @param selection - current provider/model/effort, when known.
 * @param grant - unused in metadata; kept for future capability bits.
 * @returns plaintext metadata.
 */
export async function buildSessionMetadata(
  ctx: Context,
  source: {
    cwd: string
    /** POSIX path under {@link VIRTUAL_HOME}; Happy groups the list by this. */
    happyPath: string
    events: readonly { type: string; data: unknown }[]
    agent?: Agent
  },
  machineId: string,
  title: string,
  selection: HappySelection | undefined,
  _grant: RemoteGrant,
): Promise<SessionMetadata> {
  const cwd = source.cwd
  const slashCommands = source.agent === undefined ? [] : listCommands(ctx, source.agent).map(command => command.name)
  const skills = (await listSkills(ctx, cwd)).map(skill => skill.name)
  const models = await listModels(ctx)
  const presets = ctx.get('permissionPresets')
  const names = presets?.names ?? ['workspace-write', 'danger-full-access']
  const currentPreset = presets === undefined
    ? 'workspace-write'
    : presets.current(source.events as Parameters<NonNullable<typeof presets>['current']>[0])
  const operatingModes = names
    .filter(name => name !== 'custom' && name !== 'read-only')
    .map(name => ({
      code: name,
      value: name,
      description: name === 'danger-full-access' ? '不限制文件，且不再询问批准' : '只能改当前工作区，危险工具要批准',
    }))
  const selected = resolveSelection(models, selection)
  const thoughtLevels = selected?.row.effortOptions
  const thought = selected === undefined
    ? undefined
    : selected.effort ?? selected.row.defaultThinkingLevel
  return {
    path: source.happyPath,
    host: hostname(),
    homeDir: VIRTUAL_HOME,
    version: HAPPY_CLI_VERSION,
    name: title,
    summary: { text: title, updatedAt: Date.now() },
    os: process.platform,
    machineId,
    flavor: 'acp',
    startedBy: 'terminal',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    happyHomeDir: VIRTUAL_HOME,
    happyLibDir: VIRTUAL_HOME,
    happyToolsDir: VIRTUAL_HOME,
    slashCommands,
    skills,
    models,
    operatingModes,
    client: { id: 'rig', name: 'DeepSeek Harness', version: HAPPY_CLI_VERSION },
    rigMetadataVersion: 1,
    capabilities: {
      abort: true,
      attachments: {
        enabled: true,
        maxBytes: 10 * 1024 * 1024,
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      },
      files: { browse: false, read: false, search: false, write: false },
      modelSelection: true,
      reasoningSelection: true,
      permissionModeSelection: true,
      resume: false,
      rpcMethods: ['permission', 'killSession', 'abort'],
      shell: false,
      steering: false,
    },
    currentOperatingModeCode: currentPreset === 'custom' ? (operatingModes[0]?.code ?? 'workspace-write') : currentPreset,
    ...(selected === undefined ? {} : {
      currentModelCode: selected.row.id,
      currentModelProviderId: selected.row.providerId,
      modelMode: `${selected.row.providerId}:${selected.row.id}`,
    }),
    ...(thoughtLevels === undefined || thoughtLevels.length === 0
      ? {}
      : {
        thoughtLevels,
        reasoning: { current: thought ?? null, levels: thoughtLevels.map(level => level.code) },
      }),
    ...(thought === undefined ? {} : { currentThoughtLevelCode: thought, effortLevel: thought }),
  }
}

function resolveSelection(
  models: HappyModelRow[],
  selection: HappySelection | undefined,
): { row: HappyModelRow; effort?: string } | undefined {
  if (selection !== undefined) {
    const row = models.find(model => model.providerId === selection.provider && model.id === selection.model)
      ?? models.find(model => model.code === `${selection.provider}/${selection.model}`)
    if (row !== undefined) {
      return {
        row,
        ...(selection.reasoningEffort === undefined ? {} : { effort: selection.reasoningEffort }),
      }
    }
  }
  const first = models[0]
  return first === undefined ? undefined : { row: first }
}

function listCommands(ctx: Context, agent: Agent): { name: string; description: string }[] {
  const commands = ctx.get('commands')
  if (commands === undefined) return []
  return commands.list(agent).map(command => ({
    name: command.name,
    description: command.description,
  }))
}

async function listSkills(ctx: Context, cwd: string): Promise<{ name: string; description: string }[]> {
  const skills = ctx.get('skills')
  if (skills === undefined) return []
  try {
    const listed = await skills.list({ cwd })
    return listed
      .filter(skill => skill.invocation.userInvocable)
      .map(skill => ({ name: skill.name, description: skill.description }))
  } catch {
    return []
  }
}

async function listModels(ctx: Context): Promise<HappyModelRow[]> {
  const llm = ctx.get('llm')
  if (llm === undefined) return []
  const out: HappyModelRow[] = []
  for (const provider of llm.listProviders()) {
    try {
      const models = await llm.listModels(provider.id)
      for (const model of models) {
        const reasoning = await effortsFor(ctx, provider.id, model.id)
        out.push({
          code: `${provider.id}/${model.id}`,
          value: model.name,
          description: model.name,
          id: model.id,
          name: model.name,
          providerId: provider.id,
          providerKind: 'custom',
          providerName: provider.name,
          thinkingLevels: reasoning?.options.map(option => option.code) ?? [],
          effortOptions: reasoning?.options ?? [],
          ...(reasoning?.defaultEffort === undefined ? {} : { defaultThinkingLevel: reasoning.defaultEffort }),
        })
      }
    } catch {
      // 单个提供方目录失败不挡住其余模型。
    }
  }
  return out
}

async function effortsFor(
  ctx: Context,
  provider: string,
  model: string,
): Promise<{ options: { code: string; value: string }[]; defaultEffort?: string } | undefined> {
  const llm = ctx.get('llm')
  if (llm === undefined) return undefined
  try {
    const info = await llm.resolveModelInfo(provider, model)
    const efforts = info.reasoning?.efforts
    if (efforts === undefined || efforts.length === 0) return undefined
    return {
      options: efforts.map(effort => ({ code: effort.id, value: effort.name })),
      ...(info.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: info.reasoning.defaultEffort }),
    }
  } catch {
    return undefined
  }
}
