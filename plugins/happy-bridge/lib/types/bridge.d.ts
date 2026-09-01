/** Host orchestrator: pair, mirror sessions, map chat/approvals/questions onto Happy. */
import type { Context } from '@deepseek-ai/cordis';
import type { Config, PairingStatus } from './types.ts';
/**
 * Live Happy bridge for one Host process.
 */
export declare class HappyBridge {
    private readonly ctx;
    private config;
    private readonly log;
    private credentials;
    private pairing;
    private machine;
    private readonly links;
    private readonly happyToDsh;
    private readonly models;
    /** Last model/effort we wrote to Happy, so the metadata echo is not a phone pick. */
    private readonly lastPublished;
    /** Count of in-flight phone-originated Host `selectModel` calls. */
    private hostSelectFromPhone;
    /** Per-agent selection installed on phone wake / spawn, matching Host `selectionFor`. */
    private readonly selections;
    /** In-flight phone wakes, so two inbound texts do not double-resume. */
    private readonly waking;
    /** Phone stop-session / archive: do not recreate these Happy rows. */
    private readonly dismissed;
    /** Phone New (spawn) blanks stay linked; web placeholders do not. */
    private readonly phoneSpawned;
    /** Last Host archive set, so web archive/restore can park or unpark Happy. */
    private lastArchivedIds;
    /** Serialize phone text so two messages cannot split one attachment batch. */
    private readonly inboundTail;
    private error;
    private running;
    private scanTimer;
    /**
     * @param ctx - Host context.
     * @param config - resolved plugin config.
     * @param log - logger.
     */
    constructor(ctx: Context, config: Config, log: (message: string) => void);
    /** Replace config after a settings write that keeps the same relay. */
    setConfig(config: Config): void;
    /**
     * Apply a settings write in place when the Happy relay identity is unchanged.
     * Grant changes take effect immediately; URL / credential-dir / enabled
     * changes must rebuild.
     * @param next - resolved settings section.
     * @returns true when the live bridge kept running.
     */
    acceptSettings(next: Config): boolean;
    /** Snapshot for the settings card. */
    status(): PairingStatus;
    /** Load credentials, connect machine, mirror live root agents. */
    start(): Promise<void>;
    /** Tear down sockets. Web UI keeps running. */
    dispose(): void;
    /** Start or resume pairing. */
    beginPairing(): Promise<void>;
    /**
     * Drop the current Happy login and show a new QR. Keeps the same machine id
     * so already-mirrored sessions stay on this Host after the phone scans again.
     */
    rePair(): Promise<void>;
    /** Disconnect Happy without killing dsh web. */
    disconnect(): Promise<void>;
    private connectCloud;
    private installHooks;
    private isHarnessArchived;
    private seedArchiveSet;
    private reconcileArchiveSet;
    private listedUnarchived;
    private syncMirrors;
    private ensureMirror;
    private dropLink;
    /**
     * Remove a web New Session placeholder from Happy without remembering a
     * dismiss: the first real turn should remirror it.
     */
    private abandonBlankMirror;
    /**
     * Drop Happy rows for dismissed or blank dsh tags. The App archive button
     * only sets inactive; without this sweep a keepalive ghost stays in the list.
     */
    private sweepHappyGhosts;
    private sessionIsBlank;
    private linkEvents;
    private requireAgent;
    /** Bind a live agent onto an existing Happy socket without reminting it. */
    private attachAgent;
    /** Copy log events newer than {@link Link.lastForwardedSeq} onto Happy. */
    private drainNewEvents;
    /**
     * Live agent for this Happy socket, resuming the persisted session when the
     * web has never opened it. Same preset the Host would mount on a web open.
     */
    private ensureAgent;
    private wakeAgent;
    private resumeSession;
    /**
     * Resume/create composition matching Host `composeAgent`: install model
     * selection, then mount the preset when a roster exists.
     * @param presetHint - logged or requested preset id; omitted uses the roster default.
     */
    private composeAgentSetup;
    /**
     * Same lazy selection Host `selectionFor` installs: remembered pick, else
     * the session's last `request/header`, else `agentDefaultModel`. A missing
     * thinking level keeps the web picker's effort when it is the same model.
     * Unlike Host `installModelSelection`, an absent effort does not clear
     * inherited thinking.
     */
    private installWakeSelection;
    /**
     * Pin provider/model for a phone-woken agent without wiping thinking when
     * the selection names no effort.
     */
    private bindWakeSelection;
    /** Host default model, when the web profile mounted `agentDefaultModel`. */
    private defaultModelSelection;
    /** Registered workspace for this session, or `undefined` when it is not in the sidebar. */
    private workspaceFor;
    private loadStored;
    private shouldSkip;
    private workspaces;
    private mirrorAgent;
    private mirrorDormant;
    private unmapHappy;
    /**
     * Phone archive: park a real conversation so a later send resumes it.
     * Blank placeholders are forgotten and not remirrored.
     */
    private onPhoneArchive;
    private handlePhoneArchive;
    /**
     * Park a real conversation on Happy. `hideHost` archives the same row on
     * the web (phone archive). Web-initiated archive only parks Happy.
     */
    private parkPhoneSession;
    private onPhoneRestore;
    private undismiss;
    /**
     * Put this Happy row back online. Opening an offline chat on the phone
     * does not start heartbeats; the web sidebar still showing the row, a
     * phone send, or Happy's resume RPC all come through here.
     * @param refreshCatalog - republish metadata (web open / phone resume).
     */
    private wakePhone;
    private unpark;
    /**
     * Honor a phone archive/delete: stop keepalive, drop the Happy row, and do
     * not remirror this harness session until the plugin is unpaired.
     */
    private forgetPhoneSession;
    /**
     * Happy App continues an offline row with `resume-happy-session`.
     * Reuse the existing harness session; do not mint a new one.
     * @param happySessionId - Happy cloud session id from the App.
     */
    private resumeHappySession;
    private spawn;
    private applySpawnMeta;
    private queueInbound;
    private onInbound;
    private applyMessageMeta;
    private applyPhoneCatalog;
    private applyModel;
    private applyEffort;
    /** Keep the last Host pick so Happy metadata can echo the web composer. */
    private rememberModel;
    /**
     * Write the web picker's Host selection (`sessionController.selectModel`) so
     * the composer model seat reloads without a click on the computer.
     */
    private syncHostSelection;
    /**
     * After the web picker (or any Host caller) lands a selection, publish it
     * to Happy. Phone-originated calls set {@link hostSelectFromPhone} and push themselves.
     */
    private onHostModelSelected;
    /**
     * Put a concrete reasoningEffort on a phone-spawned / phone-woken agent
     * before the first LLM request, matching the effort Happy metadata advertises.
     */
    private ensurePinnedEffort;
    private applyPermission;
    /**
     * Queue the phone text as a user followup. The App already shows the typed
     * bubble; do not send a second user envelope. Images ride as DSH
     * attachments; other files land under `happy-inbox` for Harness `read`.
     */
    private followup;
    /**
     * Claim every download started before this text, wait, keep the successes.
     * Swap-then-await so a later file event cannot join this batch.
     */
    private drainPhoneFiles;
    private downloadPhoneFile;
    private onSessionEvent;
    private onApproval;
    private onAsk;
    /**
     * Happy App `sessionAbort` for Rig: empty params, RPC name `abort`.
     * Watch grant keeps the button from doing work; chat and above cancel the turn.
     */
    private onPhoneAbort;
    private onPermission;
    private pushRequests;
    private clearRequest;
    private pushMetadata;
    private pushAllMetadata;
    private queueOutboundUser;
    /**
     * Upload web-side images with Happy CLI's encrypt-then-request-upload path,
     * then emit file events and any remaining user text.
     */
    private pushUserToPhone;
    private uploadOutboundImage;
    private replayHistory;
    private emitHistory;
    private pulseThink;
    private flushReasoning;
    private finishThink;
    private startTool;
    private currentModel;
}
//# sourceMappingURL=bridge.d.ts.map