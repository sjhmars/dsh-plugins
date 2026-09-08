/** Build Happy session metadata catalogs from the live harness context. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { RemoteGrant } from './types.ts';
/** One model row Happy's Rig picker understands (slash `code` plus provider/id). */
export interface HappyModelRow {
    code: string;
    value: string;
    description?: string;
    id: string;
    name: string;
    providerId: string;
    providerKind: 'custom';
    providerName: string;
    thinkingLevels: string[];
    defaultThinkingLevel?: string;
    effortOptions: {
        code: string;
        value: string;
    }[];
}
/** Current Host pick published so the phone can echo model + effort. */
export interface HappySelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** Plain metadata object written into the encrypted Happy session metadata field. */
export interface SessionMetadata {
    path: string;
    host: string;
    homeDir: string;
    version: string;
    name: string;
    summary: {
        text: string;
        updatedAt: number;
    };
    os: string;
    machineId: string;
    flavor: 'acp';
    startedBy: 'terminal';
    lifecycleState: string;
    lifecycleStateSince: number;
    happyHomeDir: string;
    happyLibDir: string;
    happyToolsDir: string;
    slashCommands: string[];
    skills: string[];
    models: HappyModelRow[];
    operatingModes: {
        code: string;
        value: string;
        description: string;
    }[];
    currentModelCode?: string;
    currentModelProviderId?: string;
    modelMode?: string;
    currentOperatingModeCode?: string;
    thoughtLevels?: {
        code: string;
        value: string;
    }[];
    currentThoughtLevelCode?: string;
    effortLevel?: string;
    reasoning?: {
        current: string | null;
        levels: string[];
    };
    client: {
        id: 'rig';
        name: string;
        version: string;
    };
    rigMetadataVersion: 1;
    capabilities: {
        abort: true;
        attachments: {
            enabled: true;
            maxBytes: number;
            mediaTypes: string[];
        };
        files: {
            browse: false;
            read: false;
            search: false;
            write: false;
        };
        modelSelection: true;
        reasoningSelection: true;
        permissionModeSelection: true;
        resume: false;
        rpcMethods: string[];
        shell: false;
        /** True: mid-turn phone text steers the running turn (`agent.steer`). */
        steering: boolean;
    };
    tools?: string[];
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
export declare function buildSessionMetadata(ctx: Context, source: {
    cwd: string;
    /** POSIX path under {@link VIRTUAL_HOME}; Happy groups the list by this. */
    happyPath: string;
    events: readonly {
        type: string;
        data: unknown;
    }[];
    agent?: Agent;
}, machineId: string, title: string, selection: HappySelection | undefined, _grant: RemoteGrant): Promise<SessionMetadata>;
/**
 * Pick the Happy catalog row that matches Host selection.
 * A known Host pick that is missing from the listed rows stays that pick
 * (synthetic row) instead of falling back to `models[0]` (usually DeepSeek V4).
 * @param models - rows advertised to the App.
 * @param selection - current Host provider/model/effort, when known.
 * @returns the row to publish, plus effort when the Host named one.
 */
export declare function resolvePublishedSelection(models: HappyModelRow[], selection: HappySelection | undefined): {
    row: HappyModelRow;
    effort?: string;
} | undefined;
//# sourceMappingURL=catalogs.d.ts.map