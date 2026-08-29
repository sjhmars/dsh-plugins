/** Build Happy session metadata catalogs from the live harness context. */
import { hostname } from 'node:os';
import { HAPPY_CLI_VERSION } from "./happy-version.js";
import { VIRTUAL_HOME } from "./paths.js";
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
export async function buildSessionMetadata(ctx, source, machineId, title, selection, _grant) {
    const cwd = source.cwd;
    const slashCommands = source.agent === undefined ? [] : listCommands(ctx, source.agent).map(command => command.name);
    const skills = (await listSkills(ctx, cwd)).map(skill => skill.name);
    const models = await listModels(ctx);
    const presets = ctx.get('permissionPresets');
    const names = presets?.names ?? ['workspace-write', 'danger-full-access'];
    const currentPreset = presets === undefined
        ? 'workspace-write'
        : presets.current(source.events);
    const operatingModes = names
        .filter(name => name !== 'custom' && name !== 'read-only')
        .map(name => ({
        code: name,
        value: name,
        description: name === 'danger-full-access' ? '不限制文件，且不再询问批准' : '只能改当前工作区，危险工具要批准',
    }));
    const selected = resolveSelection(models, selection);
    const thoughtLevels = selected?.row.effortOptions;
    const thought = selected === undefined
        ? undefined
        : selected.effort ?? selected.row.defaultThinkingLevel;
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
    };
}
function resolveSelection(models, selection) {
    if (selection !== undefined) {
        const row = models.find(model => model.providerId === selection.provider && model.id === selection.model)
            ?? models.find(model => model.code === `${selection.provider}/${selection.model}`);
        if (row !== undefined) {
            return {
                row,
                ...(selection.reasoningEffort === undefined ? {} : { effort: selection.reasoningEffort }),
            };
        }
    }
    const first = models[0];
    return first === undefined ? undefined : { row: first };
}
function listCommands(ctx, agent) {
    const commands = ctx.get('commands');
    if (commands === undefined)
        return [];
    return commands.list(agent).map(command => ({
        name: command.name,
        description: command.description,
    }));
}
async function listSkills(ctx, cwd) {
    const skills = ctx.get('skills');
    if (skills === undefined)
        return [];
    try {
        const listed = await skills.list({ cwd });
        return listed
            .filter(skill => skill.invocation.userInvocable)
            .map(skill => ({ name: skill.name, description: skill.description }));
    }
    catch {
        return [];
    }
}
async function listModels(ctx) {
    const llm = ctx.get('llm');
    if (llm === undefined)
        return [];
    const out = [];
    for (const provider of llm.listProviders()) {
        try {
            const models = await llm.listModels(provider.id);
            for (const model of models) {
                const reasoning = await effortsFor(ctx, provider.id, model.id);
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
                });
            }
        }
        catch {
            // 单个提供方目录失败不挡住其余模型。
        }
    }
    return out;
}
async function effortsFor(ctx, provider, model) {
    const llm = ctx.get('llm');
    if (llm === undefined)
        return undefined;
    try {
        const info = await llm.resolveModelInfo(provider, model);
        const efforts = info.reasoning?.efforts;
        if (efforts === undefined || efforts.length === 0)
            return undefined;
        return {
            options: efforts.map(effort => ({ code: effort.id, value: effort.name })),
            ...(info.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: info.reasoning.defaultEffort }),
        };
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=catalogs.js.map