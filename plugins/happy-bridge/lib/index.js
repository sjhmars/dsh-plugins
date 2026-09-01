import Schema from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { admitEncodedImages } from "@deepseek-ai/dsh-attachment";
import { ReasoningEffortId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
import { homedir, hostname } from "node:os";
import { basename, extname, isAbsolute, join, posix } from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { io } from "socket.io-client";
import QRCode from "qrcode";
import { createId } from "@paralleldrive/cuid2";
import { createEnvelope } from "@slopus/happy-wire";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/archive-sync.js
/** Hide/show a harness session in the sidebar archive set without a Host unarchive RPC. */
/**
* Ids that entered or left the archive set.
* @param previous - last observed set.
* @param next - current `archivedSessionIds`.
*/
function archiveSetDiff(previous, next) {
	return {
		hidden: [...next].filter((id) => !previous.has(id)),
		shown: [...previous].filter((id) => !next.has(id))
	};
}
/**
* Keep Happy online when the row is still in the unarchived web sidebar.
* Opening an offline phone row does not start a heartbeat by itself.
* @param parked - plugin park flag.
* @param liveOnWeb - id is in the unarchived web sidebar.
*/
function phoneParkAction(parked, liveOnWeb) {
	if (liveOnWeb) return parked ? "unpark" : "keep";
	return parked ? "keep" : "park";
}
/**
* Archive on the Host (public API). Idempotent when already archived.
* @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
* @param sessionId - harness session id.
*/
async function hideOnHarness(registry, sessionId) {
	if (registry === void 0) return;
	const id = SessionId(sessionId);
	if (registry.archivedSessionIds.includes(id)) return;
	try {
		await registry.archiveSession(id);
	} catch (error) {
		if (registry.archivedSessionIds.includes(id)) return;
		throw error;
	}
}
/**
* Take one id out of the Host archive set so grouping surfaces show it again
* in its kept `sessionIds` slot. Uses the registry write chain; does not add
* a Harness API.
* @param registry - `ctx.workspaceRegistry`, if the profile loaded it.
* @param sessionId - harness session id.
*/
async function revealOnHarness(registry, sessionId) {
	if (registry === void 0) return;
	const id = SessionId(sessionId);
	if (!registry.archivedSessionIds.includes(id)) return;
	const writer = registry;
	await writer.enqueueOperation(async () => {
		const state = writer.requireState();
		if (!state.archivedSessionIds.includes(id)) return;
		await writer.setState({
			...state,
			archivedSessionIds: state.archivedSessionIds.filter((item) => item !== id)
		});
	});
}
//#endregion
//#region lib/types/happy-version.js
/**
* Version strings the Happy App compares against its minimum CLI.
*
* This is a reported compatibility tag matching npm `happy`, not this
* plugin's package version and not an install of the official CLI.
* Bump when Happy publishes a newer CLI that the App starts nagging for.
*/
const HAPPY_CLI_VERSION = "1.2.0";
/** Official `X-Happy-Client` / socket `happyClient` value. */
const HAPPY_CLIENT = `cli-coding-session/${HAPPY_CLI_VERSION}`;
//#endregion
//#region lib/types/paths.js
/** Map Happy picker paths onto registered workspace directories. Do not mkdir. */
/** Virtual home the Happy directory picker starts in. */
const VIRTUAL_HOME = "/dsh-workspaces";
/**
* Normalize a path for comparison: slashes, no trailing slash (except root), Windows drive case.
* @param value - real or virtual path.
* @returns comparable spelling.
*/
function normalizePath(value) {
	const replaced = value.trim().replaceAll("\\", "/");
	const withDrive = /^[A-Za-z]:/.test(replaced) ? replaced[0].toUpperCase() + replaced.slice(1) : replaced;
	if (withDrive.length > 1 && withDrive.endsWith("/")) return withDrive.slice(0, -1);
	return withDrive;
}
/**
* Build virtual workspace entries from real registered roots.
* @param workspaces - `{ path, title, id }` from `workspaceRegistry.list()`.
* @returns virtual POSIX paths under {@link VIRTUAL_HOME}.
*/
function virtualWorkspaces(workspaces) {
	const used = /* @__PURE__ */ new Set();
	return workspaces.map((workspace) => {
		const base = slug(workspace.title) || slug(workspace.id) || "workspace";
		let name = base;
		let n = 2;
		while (used.has(name)) {
			name = `${base}-${n}`;
			n += 1;
		}
		used.add(name);
		return {
			virtualPath: `${VIRTUAL_HOME}/${name}`,
			realPath: workspace.path,
			title: workspace.title
		};
	});
}
/**
* Find the registered workspace that owns a real session cwd.
* Nested roots pick the longest matching path.
* @param realCwd - session `header.cwd` or persisted meta.cwd.
* @param workspaces - virtual mapping.
*/
function matchVirtualWorkspace(realCwd, workspaces) {
	const want = normalizePath(realCwd);
	let best;
	let bestLen = -1;
	for (const workspace of workspaces) {
		const root = normalizePath(workspace.realPath);
		if (want !== root && !want.startsWith(`${root}/`)) continue;
		if (root.length > bestLen) {
			best = workspace;
			bestLen = root.length;
		}
	}
	return best;
}
/**
* Resolve a spawn `directory` to a registered workspace real path.
* @param directory - Happy spawn directory (virtual or real).
* @param workspaces - virtual mapping.
* @returns real path, or `undefined` when it is not a registered workspace.
*/
function resolveSpawnDirectory(directory, workspaces) {
	const want = normalizePath(directory);
	for (const workspace of workspaces) {
		if (normalizePath(workspace.virtualPath) === want) return workspace.realPath;
		if (normalizePath(workspace.realPath) === want) return workspace.realPath;
	}
}
/**
* Slim `listDirectory`: only the virtual home and workspace roots.
* @param requestPath - path the App asked to list.
* @param workspaces - virtual mapping.
* @returns Happy listDirectory payload.
*/
function listVirtualDirectory(requestPath, workspaces) {
	const want = normalizePath(requestPath === "" || requestPath === "~" ? VIRTUAL_HOME : requestPath);
	if (want === "/" || want === "/dsh-workspaces") return {
		success: true,
		entries: workspaces.map((workspace) => ({
			name: posix.basename(workspace.virtualPath),
			type: "directory"
		}))
	};
	if (workspaces.find((workspace) => normalizePath(workspace.virtualPath) === want) !== void 0) return {
		success: true,
		entries: []
	};
	return {
		success: false,
		error: "只列出已登记的工作区根目录"
	};
}
function slug(value) {
	return (value.replaceAll("\\", "/").split("/").pop() ?? value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}
//#endregion
//#region lib/types/catalogs.js
/** Build Happy session metadata catalogs from the live harness context. */
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
async function buildSessionMetadata(ctx, source, machineId, title, selection, _grant) {
	const cwd = source.cwd;
	const slashCommands = source.agent === void 0 ? [] : listCommands(ctx, source.agent).map((command) => command.name);
	const skills = (await listSkills(ctx, cwd)).map((skill) => skill.name);
	const models = await listModels(ctx);
	const presets = ctx.get("permissionPresets");
	const names = presets?.names ?? ["workspace-write", "danger-full-access"];
	const currentPreset = presets === void 0 ? "workspace-write" : presets.current(source.events);
	const operatingModes = names.filter((name) => name !== "custom" && name !== "read-only").map((name) => ({
		code: name,
		value: name,
		description: name === "danger-full-access" ? "不限制文件，且不再询问批准" : "只能改当前工作区，危险工具要批准"
	}));
	const selected = resolveSelection(models, selection);
	const thoughtLevels = selected?.row.effortOptions;
	const thought = selected === void 0 ? void 0 : selected.effort ?? selected.row.defaultThinkingLevel;
	return {
		path: source.happyPath,
		host: hostname(),
		homeDir: VIRTUAL_HOME,
		version: HAPPY_CLI_VERSION,
		name: title,
		summary: {
			text: title,
			updatedAt: Date.now()
		},
		os: process.platform,
		machineId,
		flavor: "acp",
		startedBy: "terminal",
		lifecycleState: "running",
		lifecycleStateSince: Date.now(),
		happyHomeDir: VIRTUAL_HOME,
		happyLibDir: VIRTUAL_HOME,
		happyToolsDir: VIRTUAL_HOME,
		slashCommands,
		skills,
		models,
		operatingModes,
		client: {
			id: "rig",
			name: "DeepSeek Harness",
			version: HAPPY_CLI_VERSION
		},
		rigMetadataVersion: 1,
		capabilities: {
			abort: true,
			attachments: {
				enabled: true,
				maxBytes: 10485760,
				mediaTypes: [
					"image/png",
					"image/jpeg",
					"image/webp",
					"image/gif"
				]
			},
			files: {
				browse: false,
				read: false,
				search: false,
				write: false
			},
			modelSelection: true,
			reasoningSelection: true,
			permissionModeSelection: true,
			resume: false,
			rpcMethods: [
				"permission",
				"killSession",
				"abort"
			],
			shell: false,
			steering: false
		},
		currentOperatingModeCode: currentPreset === "custom" ? operatingModes[0]?.code ?? "workspace-write" : currentPreset,
		...selected === void 0 ? {} : {
			currentModelCode: selected.row.id,
			currentModelProviderId: selected.row.providerId,
			modelMode: `${selected.row.providerId}:${selected.row.id}`
		},
		...thoughtLevels === void 0 || thoughtLevels.length === 0 ? {} : {
			thoughtLevels,
			reasoning: {
				current: thought ?? null,
				levels: thoughtLevels.map((level) => level.code)
			}
		},
		...thought === void 0 ? {} : {
			currentThoughtLevelCode: thought,
			effortLevel: thought
		}
	};
}
function resolveSelection(models, selection) {
	if (selection !== void 0) {
		const row = models.find((model) => model.providerId === selection.provider && model.id === selection.model) ?? models.find((model) => model.code === `${selection.provider}/${selection.model}`);
		if (row !== void 0) return {
			row,
			...selection.reasoningEffort === void 0 ? {} : { effort: selection.reasoningEffort }
		};
	}
	const first = models[0];
	return first === void 0 ? void 0 : { row: first };
}
function listCommands(ctx, agent) {
	const commands = ctx.get("commands");
	if (commands === void 0) return [];
	return commands.list(agent).map((command) => ({
		name: command.name,
		description: command.description
	}));
}
async function listSkills(ctx, cwd) {
	const skills = ctx.get("skills");
	if (skills === void 0) return [];
	try {
		return (await skills.list({ cwd })).filter((skill) => skill.invocation.userInvocable).map((skill) => ({
			name: skill.name,
			description: skill.description
		}));
	} catch {
		return [];
	}
}
async function listModels(ctx) {
	const llm = ctx.get("llm");
	if (llm === void 0) return [];
	const out = [];
	for (const provider of llm.listProviders()) try {
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
				providerKind: "custom",
				providerName: provider.name,
				thinkingLevels: reasoning?.options.map((option) => option.code) ?? [],
				effortOptions: reasoning?.options ?? [],
				...reasoning?.defaultEffort === void 0 ? {} : { defaultThinkingLevel: reasoning.defaultEffort }
			});
		}
	} catch {}
	return out;
}
async function effortsFor(ctx, provider, model) {
	const llm = ctx.get("llm");
	if (llm === void 0) return void 0;
	try {
		const info = await llm.resolveModelInfo(provider, model);
		const efforts = info.reasoning?.efforts;
		if (efforts === void 0 || efforts.length === 0) return void 0;
		return {
			options: efforts.map((effort) => ({
				code: effort.id,
				value: effort.name
			})),
			...info.reasoning?.defaultEffort === void 0 ? {} : { defaultEffort: info.reasoning.defaultEffort }
		};
	} catch {
		return;
	}
}
//#endregion
//#region lib/types/bytes.js
/** Base64 helpers matching Happy CLI `encodeBase64` / `decodeBase64`. */
/**
* Encode bytes as standard or URL-safe base64.
* @param buffer - bytes to encode.
* @param variant - `base64` (default) or `base64url` without padding.
* @returns encoded string.
*/
function encodeBase64(buffer, variant = "base64") {
	const standard = Buffer.from(buffer).toString("base64");
	if (variant === "base64") return standard;
	return standard.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
/**
* Decode a standard or URL-safe base64 string.
* @param value - encoded string.
* @param variant - encoding used by `value`.
* @returns decoded bytes.
*/
function decodeBase64(value, variant = "base64") {
	if (variant === "base64url") {
		const padded = value.replaceAll("-", "+").replaceAll("/", "_") + "=".repeat((4 - value.length % 4) % 4);
		return new Uint8Array(Buffer.from(padded, "base64"));
	}
	return new Uint8Array(Buffer.from(value, "base64"));
}
//#endregion
//#region lib/types/credentials.js
/** Load and store Happy credentials. Prefer `~/.happy/access.key`, else plugin dir. */
/**
* Resolve the plugin credential directory.
* @param configured - Config.credentialDir; empty means the default under home.
* @returns absolute directory path.
*/
function resolveCredentialDir(configured) {
	if (configured.trim() !== "") return isAbsolute(configured) ? configured : join(homedir(), configured);
	return join(homedir(), ".dsh", "happy-bridge");
}
/**
* Load credentials: Happy CLI file first, then this plugin's file.
* @param credentialDir - plugin directory.
* @returns credentials, or `undefined` when nothing usable is on disk.
*/
async function loadCredentials(credentialDir) {
	const state = await readState(credentialDir);
	if (state.disconnected === true) return void 0;
	const happyHome = await readAccessKey(join(homedir(), ".happy", "access.key"));
	if (happyHome !== void 0) return {
		...happyHome,
		machineId: state.machineId ?? happyHome.machineId
	};
	return readAccessKey(join(credentialDir, "access.key"));
}
/**
* Persist credentials in the plugin directory. Does not overwrite `~/.happy/access.key`.
* @param credentialDir - plugin directory.
* @param credentials - token + encryption + machineId.
*/
async function saveCredentials(credentialDir, credentials) {
	await mkdir(credentialDir, { recursive: true });
	const body = {
		token: credentials.token,
		machineId: credentials.machineId
	};
	if (credentials.encryption.type === "legacy") body.secret = encodeBase64(credentials.encryption.secret);
	else body.encryption = {
		publicKey: encodeBase64(credentials.encryption.publicKey),
		machineKey: encodeBase64(credentials.encryption.machineKey)
	};
	await writeFile(join(credentialDir, "access.key"), JSON.stringify(body, null, 2), "utf8");
	await writeState(credentialDir, {
		disconnected: false,
		machineId: credentials.machineId
	});
}
/**
* Mark the plugin disconnected without deleting Happy CLI credentials.
* Clears phone-dismissed ids so a later pair remirrors those sessions.
* @param credentialDir - plugin directory.
* @param machineId - last known machine id to keep stable.
*/
async function markDisconnected(credentialDir, machineId) {
	await mkdir(credentialDir, { recursive: true });
	await writeState(credentialDir, {
		disconnected: true,
		...machineId === void 0 ? {} : { machineId },
		dismissedDshIds: []
	});
}
/**
* Clear the local disconnected flag so existing credentials can be reused.
* @param credentialDir - plugin directory.
* @param machineId - machine id to keep.
*/
async function markConnected(credentialDir, machineId) {
	await mkdir(credentialDir, { recursive: true });
	await writeState(credentialDir, {
		disconnected: false,
		machineId
	});
}
/**
* Last stored machine id, even when locally disconnected.
* @param credentialDir - plugin directory.
* @returns machine id, or `undefined`.
*/
async function peekMachineId(credentialDir) {
	return (await readState(credentialDir)).machineId;
}
/**
* Session ids the phone asked to stop mirroring. stop-session / archive
* persist here so a later scan does not recreate the Happy row.
* @param credentialDir - plugin directory.
* @returns harness session ids, possibly empty.
*/
async function loadDismissed(credentialDir) {
	return (await readState(credentialDir)).dismissedDshIds;
}
/**
* Forget a previously dismissed harness session so it can remirror.
* @param credentialDir - plugin directory.
* @param dshId - harness session id.
*/
async function removeDismissed(credentialDir, dshId) {
	const state = await readState(credentialDir);
	if (!state.dismissedDshIds.includes(dshId)) return;
	await writeState(credentialDir, {
		disconnected: state.disconnected,
		...state.machineId === void 0 ? {} : { machineId: state.machineId },
		dismissedDshIds: state.dismissedDshIds.filter((id) => id !== dshId)
	});
}
/**
* Remember that the phone dismissed this harness session.
* @param credentialDir - plugin directory.
* @param dshId - harness session id.
*/
async function addDismissed(credentialDir, dshId) {
	const state = await readState(credentialDir);
	if (state.dismissedDshIds.includes(dshId)) return;
	await writeState(credentialDir, {
		disconnected: state.disconnected,
		...state.machineId === void 0 ? {} : { machineId: state.machineId },
		dismissedDshIds: [...state.dismissedDshIds, dshId]
	});
}
async function readAccessKey(path) {
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	if (typeof parsed.token !== "string" || parsed.token === "") return void 0;
	const machineId = typeof parsed.machineId === "string" && parsed.machineId !== "" ? parsed.machineId : crypto.randomUUID();
	if (typeof parsed.secret === "string" && parsed.secret !== "") return {
		token: parsed.token,
		encryption: {
			type: "legacy",
			secret: decodeBase64(parsed.secret)
		},
		machineId
	};
	const publicKey = parsed.encryption?.publicKey;
	const machineKey = parsed.encryption?.machineKey;
	if (typeof publicKey === "string" && typeof machineKey === "string") return {
		token: parsed.token,
		encryption: {
			type: "dataKey",
			publicKey: decodeBase64(publicKey),
			machineKey: decodeBase64(machineKey)
		},
		machineId
	};
}
async function readState(credentialDir) {
	try {
		const raw = await readFile(join(credentialDir, "state.json"), "utf8");
		const parsed = JSON.parse(raw);
		return {
			disconnected: parsed.disconnected === true,
			...typeof parsed.machineId === "string" ? { machineId: parsed.machineId } : {},
			dismissedDshIds: stringList(parsed.dismissedDshIds)
		};
	} catch {
		return {
			disconnected: false,
			dismissedDshIds: []
		};
	}
}
async function writeState(credentialDir, state) {
	const previous = await readState(credentialDir);
	const dismissed = state.dismissedDshIds ?? previous.dismissedDshIds;
	await writeFile(join(credentialDir, "state.json"), JSON.stringify({
		disconnected: state.disconnected,
		...state.machineId === void 0 && previous.machineId === void 0 ? {} : { machineId: state.machineId ?? previous.machineId },
		...dismissed.length === 0 ? {} : { dismissedDshIds: dismissed }
	}, null, 2), "utf8");
}
function stringList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === "string" && item !== "");
}
//#endregion
//#region lib/types/attachments.js
/** Phone file events: sniff image bytes and split them from other attachments. */
const IMAGE_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif"
]);
/**
* Detect a DSH image media type from magic bytes, then declared MIME, then filename.
* @param file - decrypted Happy attachment.
* @returns a version-one image media type, or `undefined` for other files.
*/
function sniffImageMime(file) {
	const fromBytes = mimeFromMagic(file.bytes);
	if (fromBytes !== void 0) return fromBytes;
	if (IMAGE_TYPES.has(file.mimeType)) return file.mimeType;
	const lower = file.name.toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".gif")) return "image/gif";
}
/**
* Split decrypted Happy files into DSH image uploads and leftover binaries.
* @param files - drained phone attachments in arrival order.
* @returns encoded images plus non-image files.
*/
function splitPendingFiles(files) {
	const encoded = [];
	const extras = [];
	for (const file of files) {
		const mime = sniffImageMime(file);
		if (mime === void 0) {
			extras.push(file);
			continue;
		}
		encoded.push({
			mediaType: mime,
			data: Buffer.from(file.bytes).toString("base64"),
			name: file.name
		});
	}
	return {
		encoded,
		extras
	};
}
function mimeFromMagic(bytes) {
	if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
	if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	if (bytes.length >= 6 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56 && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return "image/gif";
	if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
}
//#endregion
//#region lib/types/inbox.js
/** Save phone non-image files into the session workspace so Harness `read` can open them. */
/** Directory under the session cwd that holds phone files for `read`. */
const HAPPY_INBOX_DIR = "happy-inbox";
const UNSAFE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;
/**
* Strip path separators and reserved characters so the file stays inside `happy-inbox/`.
* @param name - Happy's original filename.
* @returns a single path segment, or `file` when nothing usable remains.
*/
function sanitizeInboxName(name) {
	const base = basename(name.replaceAll("\\", "/")).replace(UNSAFE_NAME, "_").replace(/^\.+$/u, "_");
	return base.length > 0 ? base : "file";
}
/**
* Pick a basename that is not already taken in this inbox (on disk or in this batch).
* @param taken - basenames already used.
* @param name - Happy's original filename.
* @returns a unique basename under `happy-inbox/`.
*/
function uniqueInboxName(taken, name) {
	const safe = sanitizeInboxName(name);
	if (!taken.has(safe)) return safe;
	const ext = extname(safe);
	const stem = ext.length > 0 ? safe.slice(0, -ext.length) : safe;
	for (let i = 1; i < 1e4; i++) {
		const candidate = `${stem}-${i}${ext}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${stem}-${Date.now()}${ext}`;
}
/**
* Workspace-relative path the `read` tool resolves against session cwd. Always `/`.
* @param filename - a sanitized inbox basename.
* @returns `happy-inbox/<filename>`.
*/
function inboxReadPath(filename) {
	return `${HAPPY_INBOX_DIR}/${filename}`;
}
/**
* Append a `read`-tool instruction after the user's typed text.
* Harness web does not admit non-image composer uploads; ordinary files are workspace paths for `read`.
* @param text - what the phone typed, possibly empty.
* @param relativePaths - `happy-inbox/...` paths already written.
* @returns the followup text, or `text` when there are no files.
*/
function inboxReadPrompt(text, relativePaths) {
	if (relativePaths.length === 0) return text;
	const instruction = `请用 read 工具阅读这些工作区文件（不要用 cat）：\n${relativePaths.map((path) => `- ${path}`).join("\n")}`;
	return text.trim() === "" ? instruction : `${text.trim()}\n\n${instruction}`;
}
/**
* Write extras into `<cwd>/happy-inbox/` and return relative paths for `read`.
* @param cwd - session workspace root.
* @param files - decrypted non-image attachments.
* @returns posix-relative paths the model should pass to `read`.
*/
async function saveInboxFiles(cwd, files) {
	if (files.length === 0) return [];
	const inbox = join(cwd, HAPPY_INBOX_DIR);
	await mkdir(inbox, { recursive: true });
	const taken = new Set(await readdir(inbox));
	const relative = [];
	for (const file of files) {
		const name = uniqueInboxName(taken, file.name);
		taken.add(name);
		await writeFile(join(inbox, name), file.bytes);
		relative.push(inboxReadPath(name));
	}
	return relative;
}
//#endregion
//#region lib/types/encryption.js
/** Happy content encryption: legacy NaCl secretbox or AES-256-GCM dataKey. */
/**
* Encrypt a JSON value the way Happy CLI `encrypt()` does.
* @param ctx - session or machine crypto.
* @param data - JSON-serializable plaintext.
* @returns nonce+ciphertext bytes.
*/
function encryptJson(ctx, data) {
	if (ctx.variant === "legacy") return encryptLegacy(data, ctx.key);
	return encryptWithDataKey(data, ctx.key);
}
/**
* Decrypt a Happy ciphertext into JSON.
* @param ctx - matching crypto.
* @param data - nonce+ciphertext bytes.
* @returns plaintext or `null` when the box does not open.
*/
function decryptJson(ctx, data) {
	if (ctx.variant === "legacy") return decryptLegacy(data, ctx.key);
	return decryptWithDataKey(data, ctx.key);
}
/**
* Encrypt JSON and return the on-wire base64 string.
* @param ctx - session or machine crypto.
* @param data - JSON-serializable plaintext.
* @returns base64 ciphertext.
*/
function encryptB64(ctx, data) {
	return encodeBase64(encryptJson(ctx, data));
}
/**
* Decode base64 then decrypt JSON.
* @param ctx - matching crypto.
* @param value - base64 ciphertext.
* @returns plaintext or `null`.
*/
function decryptB64(ctx, value) {
	return decryptJson(ctx, decodeBase64(value));
}
/**
* Open the pairing `response` blob (ephemeral-box bundle).
* @param encryptedBundle - ephPublicKey + nonce + ciphertext.
* @param recipientSecretKey - our box secret key.
* @returns 32-byte shared secret, or versioned dataKey payload, or `null`.
*/
function decryptWithEphemeralKey(encryptedBundle, recipientSecretKey) {
	const ephemeralPublicKey = encryptedBundle.slice(0, 32);
	const nonce = encryptedBundle.slice(32, 32 + nacl.box.nonceLength);
	const encrypted = encryptedBundle.slice(32 + nacl.box.nonceLength);
	const decrypted = nacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
	return decrypted ? decrypted : null;
}
/**
* Wrap a data-encryption key for the account public key.
* @param dataKey - 32-byte DEK.
* @param recipientPublicKey - account box public key.
* @returns versioned bundle Happy stores as `dataEncryptionKey`.
*/
function wrapDataEncryptionKey(dataKey, recipientPublicKey) {
	const boxed = encryptForPublicKey(dataKey, recipientPublicKey);
	const wrapped = new Uint8Array(boxed.length + 1);
	wrapped.set([0], 0);
	wrapped.set(boxed, 1);
	return wrapped;
}
/**
* Content crypto for a newly created Happy session.
* @param credentials - account credentials.
* @returns session key plus optional wrapped DEK for POST /v1/sessions.
*/
function sessionCrypto(credentials) {
	if (credentials.encryption.type === "legacy") return {
		ctx: {
			key: credentials.encryption.secret,
			variant: "legacy"
		},
		dataEncryptionKey: void 0
	};
	const key = new Uint8Array(randomBytes(32));
	return {
		ctx: {
			key,
			variant: "dataKey"
		},
		dataEncryptionKey: wrapDataEncryptionKey(key, credentials.encryption.publicKey)
	};
}
/**
* Content crypto for the machine entity (uses `machineKey` on dataKey accounts).
* @param credentials - account credentials.
* @returns machine key plus optional wrapped DEK.
*/
function machineCrypto(credentials) {
	if (credentials.encryption.type === "legacy") return {
		ctx: {
			key: credentials.encryption.secret,
			variant: "legacy"
		},
		dataEncryptionKey: void 0
	};
	return {
		ctx: {
			key: credentials.encryption.machineKey,
			variant: "dataKey"
		},
		dataEncryptionKey: wrapDataEncryptionKey(credentials.encryption.machineKey, credentials.encryption.publicKey)
	};
}
function encryptLegacy(data, secret) {
	const nonce = randomBytes(nacl.secretbox.nonceLength);
	const encrypted = nacl.secretbox(new TextEncoder().encode(JSON.stringify(data)), standalone(nonce), standalone(secret));
	const result = new Uint8Array(nonce.length + encrypted.length);
	result.set(nonce);
	result.set(encrypted, nonce.length);
	return result;
}
function decryptLegacy(data, secret) {
	const nonce = data.slice(0, nacl.secretbox.nonceLength);
	const encrypted = data.slice(nacl.secretbox.nonceLength);
	const decrypted = nacl.secretbox.open(encrypted, nonce, standalone(secret));
	if (!decrypted) return null;
	return JSON.parse(new TextDecoder().decode(decrypted));
}
function encryptWithDataKey(data, dataKey) {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
	const plaintext = new TextEncoder().encode(JSON.stringify(data));
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const bundle = new Uint8Array(13 + encrypted.length + 16);
	bundle.set([0], 0);
	bundle.set(nonce, 1);
	bundle.set(encrypted, 13);
	bundle.set(authTag, 13 + encrypted.length);
	return bundle;
}
function decryptWithDataKey(bundle, dataKey) {
	if (bundle.length < 29) return null;
	if (bundle[0] !== 0) return null;
	const nonce = bundle.slice(1, 13);
	const authTag = bundle.slice(bundle.length - 16);
	const ciphertext = bundle.slice(13, bundle.length - 16);
	try {
		const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce);
		decipher.setAuthTag(authTag);
		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return JSON.parse(new TextDecoder().decode(decrypted));
	} catch {
		return null;
	}
}
function encryptForPublicKey(data, recipientPublicKey) {
	const ephemeral = nacl.box.keyPair();
	const nonce = randomBytes(nacl.box.nonceLength);
	const encrypted = nacl.box(standalone(data), standalone(nonce), recipientPublicKey, ephemeral.secretKey);
	const result = new Uint8Array(ephemeral.publicKey.length + nonce.length + encrypted.length);
	result.set(ephemeral.publicKey, 0);
	result.set(nonce, ephemeral.publicKey.length);
	result.set(encrypted, ephemeral.publicKey.length + nonce.length);
	return result;
}
/**
* Encrypt a binary blob with NaCl crypto_secretbox (XSalsa20-Poly1305).
* Wire format: nonce (24 bytes) then ciphertext plus 16-byte auth tag.
* Matches Happy App/CLI `encryptBlob`.
* @param data - plaintext bytes.
* @param key - 32-byte blob key from {@link deriveBlobKey}.
* @returns nonce + ciphertext.
*/
function encryptBlob(data, key) {
	const nonce = randomBytes(nacl.secretbox.nonceLength);
	const encrypted = nacl.secretbox(standalone(data), standalone(nonce), standalone(key));
	const result = new Uint8Array(nonce.length + encrypted.length);
	result.set(nonce, 0);
	result.set(encrypted, nonce.length);
	return result;
}
/**
* Decrypt a binary blob encrypted with NaCl crypto_secretbox.
* @param bundle - nonce + ciphertext from {@link encryptBlob}.
* @param key - matching 32-byte blob key.
* @returns plaintext bytes, or `null` when the box does not open.
*/
function decryptBlob(bundle, key) {
	if (bundle.length < nacl.secretbox.nonceLength + 16) return null;
	const nonce = bundle.slice(0, nacl.secretbox.nonceLength);
	const ciphertext = bundle.slice(nacl.secretbox.nonceLength);
	const decrypted = nacl.secretbox.open(ciphertext, standalone(nonce), standalone(key));
	return decrypted ? new Uint8Array(decrypted) : null;
}
/**
* Session blob key for Happy file attachments.
* Legacy accounts: `deriveKey(secret, 'Happy Blobs', ['master'])`.
* DataKey accounts: `deriveKey(dataKey, 'Happy Blobs', ['session'])`.
* @param ctx - the same session crypto used for JSON envelopes.
* @returns 32-byte secretbox key.
*/
async function deriveBlobKey(ctx) {
	const path = ctx.variant === "dataKey" ? ["session"] : ["master"];
	return deriveKey(ctx.key, "Happy Blobs", path);
}
/**
* HMAC-SHA512 hierarchical key tree used by Happy CLI `deriveKey`.
* @param master - root secret.
* @param usage - domain string such as `Happy Blobs`.
* @param path - child indexes such as `['session']` or `['master']`.
* @returns 32-byte derived key.
*/
async function deriveKey(master, usage, path) {
	let state = hmacSha512(new TextEncoder().encode(`${usage} Master Seed`), master);
	for (const index of path) {
		const encoded = new TextEncoder().encode(index);
		const data = new Uint8Array(1 + encoded.length);
		data[0] = 0;
		data.set(encoded, 1);
		state = hmacSha512(state.subarray(32), data);
	}
	return state.subarray(0, 32);
}
/** Copy a view onto its own ArrayBuffer so tweetnacl accepts it. */
function standalone(data) {
	if (data.byteOffset === 0 && data.buffer.byteLength === data.length) return data;
	return data.slice();
}
function hmacSha512(key, data) {
	return new Uint8Array(createHmac("sha512", key).update(data).digest());
}
//#endregion
//#region lib/types/grant.js
/** Remote-grant checks: what the phone is allowed to do. */
const ORDER = [
	"watch",
	"chat",
	"approve",
	"full"
];
/**
* Whether `actual` is at least as deep as `needed`.
* @param actual - currently selected grant.
* @param needed - minimum required grant.
* @returns true when the phone may perform the action.
*/
function grantAtLeast(actual, needed) {
	return ORDER.indexOf(actual) >= ORDER.indexOf(needed);
}
/** Claude-only permissionMode strings that must not be treated as dsh presets. */
const CLAUDE_PERMISSION_MODES = /* @__PURE__ */ new Set([
	"default",
	"acceptEdits",
	"bypassPermissions",
	"dontAsk",
	"plan",
	"read-only",
	"safe-yolo",
	"yolo"
]);
/**
* Decide how inbound `meta.permissionMode` maps onto a dsh preset.
* @param mode - Happy message meta.permissionMode.
* @param dshPresets - currently advertised preset names.
* @returns `apply` with the preset, `ignore` for Claude-only values, or `unknown`.
*/
function classifyPermissionMode(mode, dshPresets) {
	if (dshPresets.includes(mode)) return {
		kind: "apply",
		preset: mode
	};
	if (CLAUDE_PERMISSION_MODES.has(mode)) return { kind: "ignore" };
	return { kind: "unknown" };
}
/**
* Split a Happy `meta.model` / spawn `modelMode` code into provider and model.
* @param code - `provider/model`, Rig `provider:model`, or a bare model id.
* @returns provider (empty when bare) and model.
*/
function splitModelCode(code) {
	const slash = code.indexOf("/");
	if (slash > 0) return {
		provider: code.slice(0, slash),
		model: code.slice(slash + 1)
	};
	const colon = code.indexOf(":");
	if (colon > 0) return {
		provider: code.slice(0, colon),
		model: code.slice(colon + 1)
	};
	return {
		provider: "",
		model: code
	};
}
/**
* Model code from a Happy inbound message (`meta.model` plus optional provider).
* @param meta - Happy message meta object.
* @returns `provider/model` when both are known, otherwise the raw model string.
*/
function messageModelCode(meta) {
	const model = meta.model;
	if (typeof model !== "string" || model === "") return void 0;
	const provider = typeof meta.modelProviderId === "string" ? meta.modelProviderId : "";
	if (provider !== "" && !model.includes("/") && !model.includes(":")) return `${provider}/${model}`;
	return model;
}
/**
* Effort from a Happy inbound message. Current App wire uses `effort`;
* spawn and older clients send `effortLevel`.
* @param meta - Happy message meta object.
* @returns effort id, `null` when the field is explicitly cleared, or undefined when omitted.
*/
function messageEffort(meta) {
	if ("effort" in meta) {
		if (meta.effort === null) return null;
		if (typeof meta.effort === "string") return meta.effort;
	}
	if ("effortLevel" in meta) {
		if (meta.effortLevel === null) return null;
		if (typeof meta.effortLevel === "string") return meta.effortLevel;
	}
}
/**
* Whether a settings write can land on the live bridge without disposing sockets.
* Grant / pairOnStart changes take effect in place; URL or credential-dir
* changes restart the relay.
* @param previous - config the live bridge is using.
* @param next - config just resolved from settings.
*/
function sameHappyRuntime(previous, next) {
	return previous.enabled === next.enabled && previous.serverUrl === next.serverUrl && previous.appUrl === next.appUrl && previous.credentialDir === next.credentialDir;
}
/**
* Whether two overrides name the same Host selection.
* @param previous - last remembered override, if any.
* @param next - candidate override.
*/
function sameModelOverride(previous, next) {
	return previous !== void 0 && previous.provider === next.provider && previous.model === next.model && previous.reasoningEffort === next.reasoningEffort;
}
/**
* Model and effort Happy stores on session metadata.
* @param meta - decrypted Happy session metadata object.
* @returns the current model and/or effort, or undefined when neither is set.
*/
function catalogModelPick(meta) {
	const model = catalogModelCode(meta);
	const effort = catalogEffort(meta);
	if (model === void 0 && effort === void 0) return void 0;
	return {
		...model === void 0 ? {} : { model },
		...effort === void 0 ? {} : { effort }
	};
}
/**
* Whether an inbound Happy catalog is the same pick we last published.
* Slash and colon provider/model codes compare as one pair.
* @param previous - last pick we wrote, if any.
* @param next - pick decoded from inbound metadata.
* @returns true when the inbound pick is our own echo.
*/
function sameCatalogPick(previous, next) {
	if (previous === void 0) return false;
	return catalogPickKey(previous) === catalogPickKey(next);
}
function catalogPickKey(pick) {
	const split = pick.model === void 0 ? void 0 : splitModelCode(pick.model);
	return `${split === void 0 ? "" : split.provider === "" ? split.model : `${split.provider}/${split.model}`}\0${pick.effort === void 0 ? "" : pick.effort === null ? "null" : pick.effort}`;
}
function catalogModelCode(meta) {
	const mode = meta.modelMode;
	if (typeof mode === "string" && mode !== "") return mode;
	const id = meta.currentModelCode;
	if (typeof id !== "string" || id === "") return void 0;
	const provider = typeof meta.currentModelProviderId === "string" ? meta.currentModelProviderId : "";
	if (provider !== "" && !id.includes("/") && !id.includes(":")) return `${provider}/${id}`;
	return id;
}
function catalogEffort(meta) {
	if (meta.effortLevel === null) return null;
	if (typeof meta.effortLevel === "string") return meta.effortLevel;
	if (meta.currentThoughtLevelCode === null) return null;
	if (typeof meta.currentThoughtLevelCode === "string") return meta.currentThoughtLevelCode;
	const reasoning = meta.reasoning;
	if (reasoning !== null && typeof reasoning === "object" && !Array.isArray(reasoning)) {
		const current = reasoning.current;
		if (current === null) return null;
		if (typeof current === "string") return current;
	}
}
//#endregion
//#region lib/types/history.js
/** Fold a session label and replayable chat items from the harness log. */
/**
* Happy session-list title: logged title, else first human prompt, else the
* same "新会话" the web sidebar uses. Never the folder name — that belongs
* on Happy's project-group header via `metadata.path`.
* @param events - session log.
* @returns non-empty label.
*/
function sessionLabel(events) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event === void 0 || event.type !== "session/title") continue;
		const title = asRecord$4(event.data).title;
		if (typeof title === "string" && title.trim() !== "") return title.trim();
	}
	for (const event of events) {
		if (event.type !== "user/message") continue;
		const text = visibleUserText(event);
		if (text === "") continue;
		const line = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
		if (line === "") continue;
		return line.length <= 40 ? line : `${line.slice(0, 39)}…`;
	}
	return "新会话";
}
/**
* Same blank rule as the web sidebar: no `turn/start` yet means a
* provisional New Session placeholder, not a conversation.
* @param events - session log.
* @returns true when the sidebar would hide this row unless it is selected.
*/
function isBlankSession(events) {
	return !events.some((event) => event.type === "turn/start");
}
/**
* Visible user/assistant/tool turns to copy onto an empty Happy session.
* Plugin-injected user rows stay off the phone. Assistant chunks are skipped
* in favor of the committed assistant/message. Reasoning blocks become a
* collapsible Think card; tool-call blocks become Happy-known tool cards.
* @param events - session log in seq order.
* @returns replay items in log order.
*/
function historyItems(events) {
	const items = [];
	const started = /* @__PURE__ */ new Set();
	let reasoning = "";
	for (const event of events) {
		const time = typeof event.time === "number" ? event.time : 0;
		if (event.type === "turn/start") {
			items.push({
				kind: "turn-start",
				time
			});
			continue;
		}
		if (event.type === "assistant/chunk") {
			reasoning = foldReasoning(reasoning, asRecord$4(asRecord$4(event.data).chunk));
			continue;
		}
		if (event.type === "turn/end") {
			if (reasoning.trim() !== "") {
				pushThink(items, time, reasoning.trim());
				reasoning = "";
			}
			const kind = asRecord$4(asRecord$4(event.data).reason).kind;
			const status = kind === "error" ? "failed" : kind === "aborted" || kind === "interrupted" ? "cancelled" : "completed";
			items.push({
				kind: "turn-end",
				time,
				status
			});
			continue;
		}
		if (event.type === "user/message") {
			const text = visibleUserText(event);
			const images = visibleUserImages(event);
			if (text === "" && images.length === 0) continue;
			items.push({
				kind: "user",
				time,
				text,
				images
			});
			continue;
		}
		if (event.type === "assistant/message") {
			const parts = assistantParts(asRecord$4(asRecord$4(event.data).message).content);
			if (!parts.some((part) => part.kind === "thinking") && reasoning.trim() !== "") pushThink(items, time, reasoning.trim());
			reasoning = "";
			for (const part of parts) {
				if (part.kind === "thinking") {
					pushThink(items, time, part.text);
					continue;
				}
				if (part.kind === "text") {
					items.push({
						kind: "assistant",
						time,
						text: part.text
					});
					continue;
				}
				if (started.has(part.call)) continue;
				started.add(part.call);
				items.push({
					kind: "tool-start",
					time,
					call: part.call,
					...happyTool(part.name, part.args)
				});
			}
			continue;
		}
		if (event.type === "tool/call") {
			const data = asRecord$4(event.data);
			const call = typeof data.callId === "string" ? data.callId : "";
			const name = typeof data.name === "string" ? data.name : "tool";
			if (call === "" || started.has(call)) continue;
			started.add(call);
			const args = toolArgs(data.arguments);
			items.push({
				kind: "tool-start",
				time,
				call,
				...happyTool(name, args)
			});
			continue;
		}
		if (event.type === "tool/result") {
			const call = asRecord$4(asRecord$4(asRecord$4(event.data).message).source).callId;
			if (typeof call === "string" && call !== "") items.push({
				kind: "tool-end",
				time,
				call
			});
		}
	}
	return items;
}
/**
* Visible human prompt from a `user/message` log event.
* Plugin injects and tool-result rows return empty.
* @param event - one session log event.
* @returns trimmed concatenated text blocks, or `''`.
*/
function visibleUserText(event) {
	if (event.type !== "user/message") return "";
	const data = asRecord$4(event.data);
	const kind = asRecord$4(data.source).kind;
	if (kind !== void 0 && kind !== "user") return "";
	return textBlocks(data.content);
}
/**
* Image blocks from a human `user/message`. Plugin injects stay off the phone.
* @param event - one session log event.
* @returns attachment refs in content order.
*/
function visibleUserImages(event) {
	if (event.type !== "user/message") return [];
	const data = asRecord$4(event.data);
	const kind = asRecord$4(data.source).kind;
	if (kind !== void 0 && kind !== "user") return [];
	if (!Array.isArray(data.content)) return [];
	const images = [];
	for (const block of data.content) {
		const row = asRecord$4(block);
		if (row.type !== "image") continue;
		const attachment = asRecord$4(row.attachment);
		if (typeof attachment.attachmentId !== "string" || attachment.attachmentId === "") continue;
		if (typeof attachment.mediaType !== "string" || typeof attachment.bytes !== "number") continue;
		if (typeof attachment.width !== "number" || typeof attachment.height !== "number") continue;
		images.push(attachment);
	}
	return images;
}
/**
* Walk committed assistant content in log order: reasoning, visible text, tool calls.
* @param content - `assistant/message` content array.
* @returns Happy-ready parts, skipping empty text.
*/
function assistantParts(content) {
	if (!Array.isArray(content)) return [];
	const parts = [];
	for (const block of content) {
		const row = asRecord$4(block);
		if (row.type === "reasoning" && typeof row.text === "string" && row.text.trim() !== "") {
			parts.push({
				kind: "thinking",
				text: row.text.trim()
			});
			continue;
		}
		if (row.type === "text" && typeof row.text === "string" && row.text.trim() !== "") {
			parts.push({
				kind: "text",
				text: row.text.trim()
			});
			continue;
		}
		if (row.type !== "tool-call") continue;
		const call = typeof row.id === "string" ? row.id : typeof row.callId === "string" ? row.callId : "";
		if (call === "") continue;
		const name = typeof row.name === "string" && row.name !== "" ? row.name : "tool";
		parts.push({
			kind: "tool",
			call,
			name,
			args: toolArgs(row.arguments)
		});
	}
	return parts;
}
/**
* Happy App hides `thinking: true` text and tools named `think` /
* `CodexReasoning` / `GeminiReasoning`. Names starting `mcp__` become a
* one-line MCP row with no body. `Note` is unknown to that table, so it
* stays a tappable card; full text rides in `args.text`.
*/
const THINK_TOOL_NAME = "Note";
/**
* Collapsed Think row label. Happy compact rows show `description`.
* @param text - accumulated or committed reasoning.
* @returns `Think` or `Think ·` plus the first line.
*/
function thinkLabel(text) {
	const first = clipLine(text.trim().split(/\r?\n/, 1)[0] ?? "");
	return first === "" ? "Think" : `Think · ${first}`;
}
/**
* Think card for a finished reasoning block. Full text rides in `args`
* so a tap opens the detail page; the row itself stays one line.
* @param text - committed reasoning.
*/
function thinkCard(text) {
	const trimmed = text.trim();
	return {
		name: THINK_TOOL_NAME,
		title: "Think",
		description: thinkLabel(trimmed),
		args: { text: trimmed }
	};
}
/** dsh wire names Happy's knownTools table actually styles. */
const HAPPY_TOOL_NAMES = {
	grep: "Grep",
	glob: "Glob",
	read: "Read",
	write: "Write",
	edit: "Edit",
	bash: "Bash",
	pwsh: "Bash",
	web_search: "WebSearch",
	web_fetch: "WebFetch",
	todo_write: "TodoWrite"
};
const FILE_PATH_TOOLS = /* @__PURE__ */ new Set([
	"read",
	"write",
	"edit"
]);
const TOOL_HEADINGS = {
	grep: "Grep",
	glob: "Glob",
	read: "Read",
	write: "Write",
	edit: "Edit",
	bash: "Bash",
	pwsh: "Pwsh",
	web_search: "Search",
	web_fetch: "Fetch",
	run_code: "Code"
};
const TOOL_SUMMARY_KEYS = {
	grep: ["pattern"],
	glob: ["pattern"],
	read: [
		"path",
		"file_path",
		"url"
	],
	write: ["path", "file_path"],
	edit: ["path", "file_path"],
	bash: ["description", "command"],
	pwsh: ["description", "command"],
	web_search: ["query"],
	web_fetch: ["url"]
};
/**
* Map a dsh tool onto a Happy card. Compact rows only paint `description`,
* so that field is `Grep · pattern` (tool name plus the web summary).
* `name` stays PascalCase so Happy can still pick icons.
* @param name - registered dsh tool name.
* @param args - parsed tool arguments.
*/
function happyTool(name, args) {
	const heading = TOOL_HEADINGS[name] ?? headingFromName(name);
	return {
		name: HAPPY_TOOL_NAMES[name] ?? name,
		title: heading,
		description: toolTitle(name, args),
		args: happyToolArgs(name, args)
	};
}
/**
* Web-style one-line label used in tests: `Grep · pattern`.
* @param name - registered tool name.
* @param args - parsed tool arguments.
*/
function toolTitle(name, args) {
	const heading = TOOL_HEADINGS[name] ?? headingFromName(name);
	const summary = toolSummary(name, args);
	const label = summary === "" || summary === heading ? heading : `${heading} · ${summary}`;
	return label.length <= 80 ? label : `${label.slice(0, 79)}…`;
}
function pushThink(items, time, text) {
	const call = `think-${time}-${items.length}`;
	items.push({
		kind: "tool-start",
		time,
		call,
		...thinkCard(text)
	});
	items.push({
		kind: "tool-end",
		time,
		call
	});
}
function happyToolArgs(name, args) {
	const mapped = { ...args };
	if (FILE_PATH_TOOLS.has(name) && typeof mapped.path === "string" && mapped.file_path === void 0) mapped.file_path = mapped.path;
	if (name === "web_search" && typeof mapped.query !== "string" && Array.isArray(mapped.queries)) {
		const query = mapped.queries.find((item) => typeof item === "string" && item.trim() !== "");
		if (query !== void 0) mapped.query = query;
	}
	return mapped;
}
function headingFromName(name) {
	const spaced = name.replaceAll("_", " ").trim();
	if (spaced === "") return "Tool";
	return spaced.replaceAll(/\b[a-z]/gu, (char) => char.toUpperCase());
}
function toolSummary(name, args) {
	if (name === "web_search" && Array.isArray(args.queries)) {
		const queries = args.queries.filter((query) => typeof query === "string" && query.trim() !== "");
		if (queries.length > 0) return clipLine(queries.join(", "));
	}
	const picked = firstString(args, TOOL_SUMMARY_KEYS[name] ?? [
		"path",
		"command",
		"cmd",
		"query",
		"url",
		"pattern",
		"file",
		"target"
	]);
	return picked === void 0 ? "" : clipLine(picked);
}
function clipLine(text) {
	const line = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
	return line.length <= 80 ? line : `${line.slice(0, 79)}…`;
}
function foldReasoning(current, chunk) {
	if (chunk.type === "reasoning-delta" && typeof chunk.text === "string") return current + chunk.text;
	if (chunk.type === "block-end") {
		const block = asRecord$4(chunk.block);
		if (block.type === "reasoning" && typeof block.text === "string") return block.text;
	}
	return current;
}
function firstString(args, keys) {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value.trim() !== "") return value.trim();
	}
}
function toolArgs(value) {
	if (typeof value === "string") try {
		return JSON.parse(value);
	} catch {
		return { raw: value };
	}
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
function textBlocks(content) {
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		const row = asRecord$4(block);
		if (row.type === "text" && typeof row.text === "string") parts.push(row.text);
	}
	return parts.join("").trim();
}
function asRecord$4(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
/**
* Preset the session actually runs: last `agent-preset/selected`, else the
* creation-header value. Phone wake must mount this same composition, not the
* header alone — a blank session may have switched before its first turn.
* @param events - session log, oldest first.
* @param headerAgentPreset - `header.agentPreset` from inspect.
*/
function resolveSessionPreset(events, headerAgentPreset) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event === void 0 || event.type !== "agent-preset/selected") continue;
		const id = asRecord$4(event.data).agentPreset;
		if (typeof id === "string" && id !== "") return id;
	}
	return headerAgentPreset;
}
/**
* Same precedence Host `selectionFor` uses: first usable provider/model
* wins; a later candidate may only fill a missing thinking level when it is
* that same model. Empty provider/model pairs are skipped.
* @param primary - process pick, else `session.requestHeader()?.config`.
* @param fallbacks - remaining sources, usually the log then `agentDefaultModel`.
*/
function wakeModelSelection(primary, ...fallbacks) {
	const candidates = [primary, ...fallbacks].filter((row) => row !== void 0 && row.provider !== "" && row.model !== "");
	const first = candidates[0];
	if (first === void 0) return void 0;
	const reasoningEffort = first.reasoningEffort ?? candidates.find((row) => row.provider === first.provider && row.model === first.model && row.reasoningEffort !== void 0)?.reasoningEffort;
	return {
		provider: first.provider,
		model: first.model,
		...reasoningEffort === void 0 ? {} : { reasoningEffort }
	};
}
/**
* Effort the first phone-spawn / phone-wake request should send.
* Current pick wins; otherwise a preferred (web) value or the model's
* advertised default, but only when the model lists that id.
* @param currentEffort - already chosen effort, if any.
* @param preferred - web picker effort to reuse when the model accepts it.
* @param modelDefault - `resolveModelInfo().reasoning.defaultEffort`.
* @param supported - advertised effort ids; empty/absent means any string is accepted.
*/
function pinWakeEffort(currentEffort, preferred, modelDefault, supported) {
	const allowed = supported === void 0 || supported.length === 0 ? void 0 : new Set(supported);
	const pick = (value) => {
		if (value === void 0 || value === "") return void 0;
		if (allowed !== void 0 && !allowed.has(value)) return void 0;
		return value;
	};
	return pick(currentEffort) ?? pick(preferred) ?? pick(modelDefault) ?? supported?.find((id) => id !== "off");
}
/**
* Sidebar sessions that should stay linked on the phone: every workspace
* membership except the registry-global archive set.
* @param workspaces - `workspaceRegistry.list()` projections.
* @param archived - `workspaceRegistry.archivedSessionIds`.
*/
function unarchivedSessionIds(workspaces, archived) {
	const hidden = new Set(archived);
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const workspace of workspaces) for (const id of workspace.sessionIds) {
		if (hidden.has(id) || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}
//#endregion
//#region lib/types/inbound.js
/** Classify inbound Happy user text as a registered slash command or ordinary chat. */
/**
* Read a user text or file event from a decrypted Happy payload.
* The App wraps file events as `{ role: 'session', content: { type: 'session', data: { ev } } }`.
* happy-wire envelopes put `ev` directly on `content`. Chat text from the phone
* is still `{ role: 'user', content: { type: 'text' } }`.
* @param plain - decrypted socket payload.
* @returns inbound chat or file, or `undefined` when the payload is not user input.
*/
function parseHappyInbound(plain) {
	const record = asUnknownRecord(plain);
	const meta = asUnknownRecord(record.meta);
	const ev = userSessionEvent(record);
	if (ev !== void 0) {
		if (ev.t === "text" && typeof ev.text === "string") return {
			kind: "text",
			text: ev.text,
			meta
		};
		if (ev.t === "file" && typeof ev.ref === "string") return {
			kind: "file",
			ref: ev.ref,
			name: typeof ev.name === "string" ? ev.name : "file",
			meta,
			...typeof ev.mimeType === "string" ? { mimeType: ev.mimeType } : {}
		};
		return;
	}
	if (record.role === "user") {
		const content = asUnknownRecord(record.content);
		if (content.type === "text" && typeof content.text === "string") return {
			kind: "text",
			text: content.text,
			meta
		};
	}
}
/**
* Unwrap a user-role session event from either Happy App raw records or happy-wire envelopes.
* @param record - decrypted root object.
* @returns the `ev` object, or `undefined`.
*/
function userSessionEvent(record) {
	if (record.role !== "session") return void 0;
	const content = asUnknownRecord(record.content);
	if (content.role === "user") return asUnknownRecord(content.ev);
	const data = asUnknownRecord(content.data);
	if (content.type === "session" && data.role === "user") return asUnknownRecord(data.ev);
}
const COMMAND_LINE = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u;
/**
* Parse a candidate slash line the same way `dsh-commands` `parseCommand` does.
* @param line - complete user text.
* @returns name + rawInput, or `undefined` when the line is not a command.
*/
function parseSlashLine(line) {
	const match = COMMAND_LINE.exec(line);
	if (match === null) return void 0;
	const name = match[1];
	if (name === void 0) return void 0;
	return {
		name,
		rawInput: line.slice(match[0].length)
	};
}
/**
* Decide whether inbound phone text should run as a command or as followup.
* Unknown `/name` stays chat so user-invocable skills still inject.
* @param line - complete user text.
* @param commandNames - registered command names without the leading slash.
* @returns `command` when the whole line is a registered command, otherwise `chat`.
*/
function classifyInboundText(line, commandNames) {
	const parsed = parseSlashLine(line.trim());
	if (parsed === void 0) return "chat";
	return commandNames.has(parsed.name) ? "command" : "chat";
}
/**
* Translate Happy AskUserQuestion `answers` (`{ [question text]: "a, b" }`)
* back into harness `{ id, selected }` rows.
* @param answers - permission RPC `updatedInput.answers`.
* @param questions - original harness questions in order.
* @returns selected labels keyed by question id.
*/
function answersFromHappy(answers, questions) {
	if (answers === void 0) return questions.map((question) => ({
		id: question.id,
		selected: []
	}));
	return questions.map((question) => {
		const selected = (answers[question.question] ?? answers[question.id] ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "");
		return {
			id: question.id,
			selected
		};
	});
}
/**
* Fill every still-open question with the typed chat line as `custom`.
* @param questions - harness questions in order.
* @param text - the App composer line.
* @returns one answer row per question.
*/
function customAnswersFromText(questions, text) {
	return questions.map((question) => ({
		id: question.id,
		selected: [],
		custom: text
	}));
}
/**
* The option label that declines a plan-review question.
* @param question - first question of a plan-review `ask`.
* @returns the non-approve option label, or Keep planning.
*/
function planReviewDeclineLabel(question) {
	const approve = question.intent?.kind === "plan-review" ? question.intent.approve : void 0;
	return question.options?.find((option) => option.label !== approve)?.label ?? "Keep planning";
}
/**
* Decode a Happy `permission` RPC body.
* @param params - decrypted RPC params.
* @returns id, approved flag, optional Always-allow decision, and answers.
*/
function parsePermissionRpc(params) {
	const record = asUnknownRecord(params);
	const result = {
		id: typeof record.id === "string" ? record.id : "",
		approved: record.approved === true,
		...typeof record.decision === "string" && record.decision !== "" ? { decision: record.decision } : {}
	};
	if (!isUnknownRecord(record.updatedInput)) return result;
	const answers = record.updatedInput["answers"];
	if (!isUnknownRecord(answers)) {
		result.updatedInput = {};
		return result;
	}
	const mapped = {};
	for (const [key, value] of Object.entries(answers)) if (typeof value === "string") mapped[key] = value;
	result.updatedInput = { answers: mapped };
	return result;
}
function asUnknownRecord(value) {
	return isUnknownRecord(value) ? value : {};
}
function isUnknownRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
//#endregion
//#region lib/types/http.js
/** Happy HTTP helpers: auth, sessions, machines, attachments. */
/**
* JSON POST/GET against the Happy API with the CLI client header.
* @param serverUrl - API origin.
* @param path - path beginning with `/`.
* @param init - method, token, JSON body.
* @returns parsed JSON, or throws with status text.
*/
async function happyFetch(serverUrl, path, init) {
	const headers = {
		"Content-Type": "application/json",
		"X-Happy-Client": HAPPY_CLIENT
	};
	if (init.token !== void 0) headers.Authorization = `Bearer ${init.token}`;
	const response = await fetch(`${trimSlash$1(serverUrl)}${path}`, {
		method: init.method ?? "GET",
		headers,
		...init.body === void 0 ? {} : { body: JSON.stringify(init.body) }
	});
	const text = await response.text();
	let json = void 0;
	if (text !== "") try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text };
	}
	if (!response.ok) throw new Error(`Happy HTTP ${response.status} ${path}: ${text.slice(0, 300)}`);
	return json;
}
/**
* Create or load a Happy session by tag.
* @param serverUrl - API origin.
* @param token - bearer token.
* @param tag - stable tag such as `dsh:<sessionId>`.
* @param crypto - content encryption for this session.
* @param metadata - plaintext metadata.
* @param agentState - plaintext agent state.
* @param dataEncryptionKey - wrapped DEK bytes when using dataKey.
* @returns Happy session id and versions.
*/
async function createOrLoadSession(input) {
	const session = asRecord$3(asRecord$3(await happyFetch(input.serverUrl, "/v1/sessions", {
		method: "POST",
		token: input.token,
		body: {
			tag: input.tag,
			metadata: encryptB64(input.crypto, input.metadata),
			agentState: input.agentState === null || input.agentState === void 0 ? null : encryptB64(input.crypto, input.agentState),
			dataEncryptionKey: input.dataEncryptionKey === void 0 ? null : encodeBase64(input.dataEncryptionKey)
		}
	})).session);
	const id = session.id;
	if (typeof id !== "string" || id === "") throw new Error("Happy 创建会话没有返回 id");
	return {
		id,
		seq: numberOr(session.seq, 0),
		metadataVersion: numberOr(session.metadataVersion, 0),
		agentStateVersion: numberOr(session.agentStateVersion, 0)
	};
}
/**
* Register or update the machine entity so the App can spawn onto this Host.
* @param input - machine id, encrypted metadata, optional daemon state.
* @returns versions from the server.
*/
async function createOrLoadMachine(input) {
	const machine = asRecord$3(asRecord$3(await happyFetch(input.serverUrl, "/v1/machines", {
		method: "POST",
		token: input.token,
		body: {
			id: input.machineId,
			metadata: encryptB64(input.crypto, input.metadata),
			daemonState: encryptB64(input.crypto, input.daemonState),
			...input.dataEncryptionKey === void 0 ? {} : { dataEncryptionKey: encodeBase64(input.dataEncryptionKey) }
		}
	})).machine);
	return {
		metadataVersion: numberOr(machine.metadataVersion, 0),
		daemonStateVersion: numberOr(machine.daemonStateVersion, 0)
	};
}
/**
* Upload an already-encrypted attachment the way Happy CLI `uploadLocalImageAttachmentEnvelope` does:
* POST `/v1/sessions/:id/attachments/request-upload` `{ filename, size }` → `{ ref, uploadUrl, method }`
* then PUT octet-stream or POST multipart to `uploadUrl`.
* Presigned URLs must not receive extra headers; server-local URLs need Bearer.
* @param serverUrl - API origin.
* @param token - bearer token.
* @param sessionId - Happy session id that owns the blob.
* @param filename - display name sent to request-upload.
* @param encrypted - nonce+ciphertext from `encryptBlob`.
* @returns Happy `ref` to put on a user `file` event.
*/
async function uploadEncryptedAttachment(serverUrl, token, sessionId, filename, encrypted) {
	const origin = trimSlash$1(serverUrl);
	const upload = asRecord$3(await happyFetch(origin, `/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-upload`, {
		method: "POST",
		token,
		body: {
			filename,
			size: encrypted.length
		}
	}));
	const ref = upload.ref;
	const uploadUrl = upload.uploadUrl;
	if (typeof ref !== "string" || ref === "" || typeof uploadUrl !== "string" || uploadUrl === "") throw new Error("Happy 附件上传没有返回 uploadUrl");
	if (upload.method === "POST") {
		const { body, boundary } = buildMultipartUploadBody(stringRecord(upload.formFields), encrypted);
		const response = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
			body: new Blob([copyBytes(body)])
		});
		if (!response.ok) throw new Error(`Happy 附件上传失败 ${String(response.status)}`);
		return ref;
	}
	const headers = { "Content-Type": "application/octet-stream" };
	if (uploadUrl.startsWith(origin)) headers.Authorization = `Bearer ${token}`;
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers,
		body: new Blob([copyBytes(encrypted)])
	});
	if (!response.ok) throw new Error(`Happy 附件上传失败 ${String(response.status)}`);
	return ref;
}
function stringRecord(value) {
	const record = asRecord$3(value);
	const out = {};
	for (const [key, field] of Object.entries(record)) if (typeof field === "string") out[key] = field;
	return out;
}
function escapeMultipartValue(value) {
	return value.replaceAll("\r", "").replaceAll("\n", "").replaceAll("\"", "%22");
}
function buildMultipartUploadBody(fields, data) {
	const boundary = `----happy-bridge-${crypto.randomUUID()}`;
	const chunks = [];
	for (const [key, value] of Object.entries(fields)) chunks.push(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeMultipartValue(key)}"\r\n\r\n${value}\r\n`));
	chunks.push(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`));
	chunks.push(data);
	chunks.push(new TextEncoder().encode(`\r\n--${boundary}--\r\n`));
	const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return {
		body,
		boundary
	};
}
/**
* Download an encrypted attachment blob the way Happy CLI does:
* POST `/v1/sessions/:id/attachments/request-download` → `{ downloadUrl }` → GET bytes.
* S3 presigned URLs must not receive extra headers; server-local URLs need Bearer.
* @param serverUrl - API origin.
* @param token - bearer token.
* @param sessionId - Happy session id that owns the blob.
* @param ref - file event `ref`.
* @returns encrypted nonce+ciphertext bytes.
*/
async function downloadEncryptedAttachment(serverUrl, token, sessionId, ref) {
	const origin = trimSlash$1(serverUrl);
	const downloadUrl = asRecord$3(await happyFetch(origin, `/v1/sessions/${encodeURIComponent(sessionId)}/attachments/request-download`, {
		method: "POST",
		token,
		body: { ref }
	})).downloadUrl;
	if (typeof downloadUrl !== "string" || downloadUrl === "") throw new Error("Happy 附件下载没有返回 downloadUrl");
	const headers = {};
	if (downloadUrl.startsWith(origin)) headers.Authorization = `Bearer ${token}`;
	const response = await fetch(downloadUrl, { headers });
	if (!response.ok) throw new Error(`Happy 附件下载失败 ${String(response.status)}`);
	return new Uint8Array(await response.arrayBuffer());
}
/**
* Mark a Happy session inactive without deleting it. Accidental archive of a
* real conversation can still receive a later phone send.
* @param serverUrl - API origin.
* @param token - bearer token.
* @param sessionId - Happy session id.
*/
async function archiveHappySession(serverUrl, token, sessionId) {
	try {
		await happyFetch(serverUrl, `/v1/sessions/${encodeURIComponent(sessionId)}/archive`, {
			method: "POST",
			token
		});
	} catch {}
}
/**
* Remove a Happy cloud session so the App can drop it from the list.
* Already-gone ids are ignored.
* @param serverUrl - API origin.
* @param token - bearer token.
* @param sessionId - Happy session id.
*/
async function deleteHappySession(serverUrl, token, sessionId) {
	await archiveHappySession(serverUrl, token, sessionId);
	try {
		await happyFetch(serverUrl, `/v1/sessions/${encodeURIComponent(sessionId)}`, {
			method: "DELETE",
			token
		});
	} catch {}
}
/**
* Happy cloud sessions this token can see. Used to drop blank ghosts the
* App can only archive, not delete.
* @param serverUrl - API origin.
* @param token - bearer token.
* @returns id and optional tag; empty when the list endpoint is unavailable.
*/
async function listHappySessions(serverUrl, token) {
	try {
		return sessionRows(await happyFetch(serverUrl, "/v1/sessions", { token }));
	} catch {
		return [];
	}
}
function sessionRows(json) {
	const root = asRecord$3(json);
	const list = Array.isArray(json) ? json : Array.isArray(root.sessions) ? root.sessions : Array.isArray(root.items) ? root.items : [];
	const out = [];
	for (const row of list) {
		const record = asRecord$3(row);
		const nested = asRecord$3(record.session);
		const id = typeof record.id === "string" && record.id !== "" ? record.id : typeof nested.id === "string" ? nested.id : "";
		if (id === "") continue;
		const tag = typeof record.tag === "string" ? record.tag : typeof nested.tag === "string" ? nested.tag : "";
		out.push({
			id,
			tag
		});
	}
	return out;
}
function trimSlash$1(url) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}
function asRecord$3(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
function copyBytes(data) {
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	return copy;
}
function numberOr(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
//#endregion
//#region lib/types/rpc.js
/** Prefixed Happy RPC: encrypt params/results, wait for `rpc-registered`. */
/**
* Register `{prefix}:{method}` and wait for the server ack (with timeout).
* @param socket - connected Socket.IO socket.
* @param prefix - machineId or sessionId.
* @param method - bare method name.
* @param crypto - same variant as chat.
* @param handler - decrypted params in, plaintext result out.
* @param log - warning logger.
*/
async function registerRpc(socket, prefix, method, crypto, handler, log) {
	const prefixed = `${prefix}:${method}`;
	socket.on("rpc-request", async (data, callback) => {
		if (data.method !== prefixed) return;
		try {
			callback(encryptB64(crypto, await handler(typeof data.params === "string" ? decryptB64(crypto, data.params) : data.params)));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log(`RPC ${prefixed} 失败：${message}`);
			callback(encryptB64(crypto, { error: message }));
		}
	});
	await waitRegistered(socket, prefixed, log);
}
/**
* Re-emit `rpc-register` after a Socket.IO reconnect without adding another handler.
* @param socket - connected socket.
* @param method - already-prefixed `{id}:{name}` method.
*/
function requestRpcRegister(socket, method) {
	socket.emit("rpc-register", { method });
}
async function waitRegistered(socket, method, log) {
	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			socket.off("rpc-registered", onRegistered);
			log(`等待 rpc-registered（${method}）超时，继续运行`);
			resolve();
		}, 8e3);
		const onRegistered = (data) => {
			if (data.method !== method) return;
			clearTimeout(timer);
			socket.off("rpc-registered", onRegistered);
			resolve();
		};
		socket.on("rpc-registered", onRegistered);
		socket.emit("rpc-register", { method });
	});
}
//#endregion
//#region lib/types/machine.js
/** Machine-scoped Happy socket: spawn, stop-session, slim listDirectory. */
/**
* Machine-scoped connection so the App New button reaches this Host.
*/
var HappyMachineSocket = class {
	machineId;
	token;
	serverUrl;
	crypto;
	handlers;
	socket;
	aliveTimer;
	rpcMethods = [];
	/**
	* @param machineId - stable machine id.
	* @param token - bearer token.
	* @param serverUrl - API origin.
	* @param crypto - machine encryption.
	* @param handlers - spawn / resume / list / stop.
	*/
	constructor(machineId, token, serverUrl, crypto, handlers) {
		this.machineId = machineId;
		this.token = token;
		this.serverUrl = serverUrl;
		this.crypto = crypto;
		this.handlers = handlers;
	}
	/** Connect and register prefixed RPCs. Does not register bash/writeFile. */
	async connect() {
		const socket = io(this.serverUrl, {
			auth: {
				token: this.token,
				clientType: "machine-scoped",
				machineId: this.machineId,
				happyClient: HAPPY_CLIENT
			},
			path: "/v1/updates",
			transports: ["websocket", "polling"],
			reconnection: true,
			reconnectionDelay: 1e3,
			reconnectionDelayMax: 5e3,
			timeout: 2e4,
			withCredentials: true
		});
		this.socket = socket;
		socket.on("connect_error", (error) => {
			this.handlers.log(`机器通道错误：${error.message}`);
		});
		socket.on("connect", () => {
			this.sendAlive();
			for (const method of this.rpcMethods) requestRpcRegister(socket, method);
		});
		try {
			await waitConnect$1(socket);
		} catch (error) {
			this.handlers.log(`${error instanceof Error ? error.message : String(error)}，机器通道继续自动重连`);
		}
		await this.bindRpc(socket, "spawn-happy-session", async (params) => {
			const options = asSpawn(params);
			return this.handlers.spawn(options);
		});
		await this.bindRpc(socket, "resume-happy-session", async (params) => {
			const id = asRecord$2(params).sessionId;
			if (typeof id !== "string" || id === "") return {
				type: "error",
				errorMessage: "Session ID is required"
			};
			return this.handlers.resume(id);
		});
		await this.bindRpc(socket, "stop-session", (params) => {
			const id = asRecord$2(params).sessionId;
			if (typeof id !== "string" || id === "") throw new Error("Session ID is required");
			this.handlers.stopSession(id);
			return {
				success: true,
				message: "Session stopped"
			};
		});
		await this.bindRpc(socket, "listDirectory", (params) => {
			return listVirtualDirectory(typeof asRecord$2(params).path === "string" ? String(asRecord$2(params).path) : VIRTUAL_HOME, this.handlers.listWorkspaces());
		});
		this.sendAlive();
		this.aliveTimer = setInterval(() => {
			this.sendAlive();
		}, 2e4);
		this.handlers.log(`机器 ${this.machineId}（${hostname()}）已连上 Happy`);
	}
	async bindRpc(socket, method, handler) {
		await registerRpc(socket, this.machineId, method, this.crypto, handler, this.handlers.log);
		this.rpcMethods.push(`${this.machineId}:${method}`);
	}
	sendAlive() {
		this.socket?.emit("machine-alive", {
			machineId: this.machineId,
			time: Date.now()
		});
	}
	/** Close the machine socket. */
	dispose() {
		if (this.aliveTimer !== void 0) clearInterval(this.aliveTimer);
		this.socket?.removeAllListeners();
		this.socket?.disconnect();
		this.socket = void 0;
	}
};
function waitConnect$1(socket) {
	if (socket.connected) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off("connect", onConnect);
			reject(/* @__PURE__ */ new Error("连接 Happy 机器通道超时"));
		}, 6e4);
		const onConnect = () => {
			clearTimeout(timer);
			resolve();
		};
		socket.once("connect", onConnect);
	});
}
function asSpawn(params) {
	const record = asRecord$2(params);
	if (typeof record.directory !== "string" || record.directory === "") throw new Error("Directory is required");
	return {
		directory: record.directory,
		...typeof record.sessionId === "string" ? { sessionId: record.sessionId } : {},
		...typeof record.permissionMode === "string" ? { permissionMode: record.permissionMode } : {},
		...typeof record.modelMode === "string" ? { modelMode: record.modelMode } : {},
		...typeof record.effortLevel === "string" ? { effortLevel: record.effortLevel } : {}
	};
}
function asRecord$2(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
//#endregion
//#region lib/types/pairing.js
/** Happy terminal pairing: POST /v1/auth/request, QR URL, poll until authorized. */
/**
* Start one terminal auth request and poll until authorized.
* @param serverUrl - Happy API origin.
* @param appUrl - Happy App origin for the web URL.
* @returns URLs plus a promise that settles on success or abort.
*/
async function startPairing(serverUrl, appUrl) {
	const secret = nacl.randomBytes(32);
	const keypair = nacl.box.keyPair.fromSecretKey(secret);
	const publicKeyB64 = encodeBase64(keypair.publicKey);
	await happyFetch(serverUrl, "/v1/auth/request", {
		method: "POST",
		body: {
			publicKey: publicKeyB64,
			supportsV2: false
		}
	});
	const mobileUrl = `happy://terminal?${encodeBase64(keypair.publicKey, "base64url")}`;
	const webUrl = `${trimSlash(appUrl)}/terminal/connect#key=${encodeBase64(keypair.publicKey, "base64url")}`;
	const qrDataUrl = await QRCode.toDataURL(mobileUrl, {
		margin: 1,
		width: 240
	});
	const abort = new AbortController();
	return {
		mobileUrl,
		webUrl,
		qrDataUrl,
		abort: () => abort.abort(),
		done: pollAuthorized(serverUrl, publicKeyB64, keypair.secretKey, abort.signal)
	};
}
async function pollAuthorized(serverUrl, publicKeyB64, secretKey, signal) {
	while (!signal.aborted) {
		const record = asRecord$1(await happyFetch(serverUrl, "/v1/auth/request", {
			method: "POST",
			body: {
				publicKey: publicKeyB64,
				supportsV2: false
			}
		}));
		if (record.state === "authorized" && typeof record.token === "string" && typeof record.response === "string") {
			const decrypted = decryptWithEphemeralKey(decodeBase64(record.response), secretKey);
			if (decrypted === null) throw new Error("无法解密配对响应");
			if (decrypted.length === 32) return {
				token: record.token,
				encryption: {
					type: "legacy",
					secret: decrypted
				}
			};
			if (decrypted[0] === 0 && decrypted.length >= 33) return {
				token: record.token,
				encryption: {
					type: "dataKey",
					publicKey: decrypted.slice(1, 33),
					machineKey: nacl.randomBytes(32)
				}
			};
			throw new Error("配对响应格式无法识别");
		}
		await sleep(1e3, signal);
	}
	throw new Error("配对已取消");
}
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(/* @__PURE__ */ new Error("配对已取消"));
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
function trimSlash(url) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}
function asRecord$1(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
//#endregion
//#region lib/types/session-socket.js
/** One Happy session-scoped socket: encrypt chat, metadata, agentState, permission RPC. */
/**
* Session-scoped Happy client for one mirrored or spawned conversation.
*/
var HappySessionSocket = class {
	happySessionId;
	token;
	serverUrl;
	crypto;
	handlers;
	socket;
	metadataVersion = 0;
	agentStateVersion = 0;
	aliveTimer;
	turnId;
	thinking = false;
	rpcReady = false;
	rpcMethods = [];
	/**
	* @param happySessionId - Happy cloud session id.
	* @param token - bearer token.
	* @param serverUrl - API origin.
	* @param crypto - content encryption for this session.
	* @param handlers - inbound callbacks.
	*/
	constructor(happySessionId, token, serverUrl, crypto, handlers) {
		this.happySessionId = happySessionId;
		this.token = token;
		this.serverUrl = serverUrl;
		this.crypto = crypto;
		this.handlers = handlers;
	}
	/** Connect, register permission + abort + killSession, start keepalive. */
	async connect(initialMetadataVersion = 0, initialAgentStateVersion = 0) {
		this.metadataVersion = initialMetadataVersion;
		this.agentStateVersion = initialAgentStateVersion;
		const socket = io(this.serverUrl, {
			auth: {
				token: this.token,
				clientType: "session-scoped",
				sessionId: this.happySessionId,
				happyClient: HAPPY_CLIENT
			},
			path: "/v1/updates",
			transports: ["websocket", "polling"],
			reconnection: true,
			reconnectionDelay: 1e3,
			reconnectionDelayMax: 5e3,
			timeout: 2e4,
			withCredentials: true
		});
		this.socket = socket;
		socket.on("update", (data) => {
			if (data.body?.t === "update-session") {
				this.onMetadataUpdate(data.body.metadata);
				return;
			}
			if (data.body?.t !== "new-message") return;
			const content = data.body.message?.content;
			if (content?.t !== "encrypted" || typeof content.c !== "string") return;
			const plain = decryptB64(this.crypto, content.c);
			this.dispatchInbound(plain);
		});
		socket.on("connect_error", (error) => {
			this.handlers.log(`会话 ${this.happySessionId} 通道错误：${error.message}`);
		});
		socket.on("connect", () => {
			this.keepAlive(this.thinking);
			if (this.rpcReady) for (const method of this.rpcMethods) requestRpcRegister(socket, method);
		});
		try {
			await waitConnect(socket);
		} catch (error) {
			this.handlers.log(`${error instanceof Error ? error.message : String(error)}，会话 ${this.happySessionId} 继续自动重连`);
		}
		await registerRpc(socket, this.happySessionId, "permission", this.crypto, (params) => {
			this.handlers.onPermission(asPermission(params));
			return { ok: true };
		}, this.handlers.log);
		this.rpcMethods.push(`${this.happySessionId}:permission`);
		await registerRpc(socket, this.happySessionId, "abort", this.crypto, () => {
			this.handlers.onAbort();
			return { ok: true };
		}, this.handlers.log);
		this.rpcMethods.push(`${this.happySessionId}:abort`);
		await registerRpc(socket, this.happySessionId, "killSession", this.crypto, () => {
			this.stopKeepAlive();
			this.handlers.onArchived();
			return {
				success: true,
				message: "Session archived"
			};
		}, this.handlers.log);
		this.rpcMethods.push(`${this.happySessionId}:killSession`);
		this.rpcReady = true;
		this.keepAlive(this.thinking);
	}
	/** Stop session-alive so an App archive can stick. */
	stopKeepAlive() {
		if (this.aliveTimer !== void 0) {
			clearInterval(this.aliveTimer);
			this.aliveTimer = void 0;
		}
	}
	/** Close the socket and keepalive. */
	dispose() {
		this.stopKeepAlive();
		this.socket?.removeAllListeners();
		this.socket?.disconnect();
		this.socket = void 0;
	}
	/** Whether the Happy session-scoped socket is connected. */
	isConnected() {
		return this.socket?.connected === true;
	}
	/** Current Happy turn id for agent envelopes. */
	currentTurn() {
		return this.turnId;
	}
	/**
	* Open a Happy turn (turn-start).
	* @param time - original log time when replaying history.
	* @returns the new turn id.
	*/
	startTurn(time) {
		this.turnId = createId();
		this.sendAgent({ t: "turn-start" }, time);
		return this.turnId;
	}
	/**
	* Close the Happy turn.
	* @param status - completed / failed / cancelled.
	* @param time - original log time when replaying history.
	*/
	endTurn(status, time) {
		this.sendAgent({
			t: "turn-end",
			status
		}, time);
	}
	/**
	* Send an agent text or service envelope.
	* @param kind - `text` or `service`.
	* @param text - markdown body.
	* @param time - original log time when replaying history.
	* @param thinking - `true` for a reasoning block the App can collapse.
	*/
	sendText(kind, text, time, thinking = false) {
		if (kind === "service") {
			this.sendAgent({
				t: "service",
				text
			}, time);
			return;
		}
		this.sendAgent(thinking ? {
			t: "text",
			text,
			thinking: true
		} : {
			t: "text",
			text
		}, time);
	}
	/**
	* Send a user text envelope (history backfill or echo).
	* @param text - markdown body.
	* @param time - original log time when replaying history.
	*/
	sendUser(text, time) {
		const envelope = createEnvelope("user", {
			t: "text",
			text
		}, time === void 0 ? {} : { time });
		this.emitEnvelope(envelope);
	}
	/**
	* Send a user file envelope after the encrypted blob is already on Happy.
	* Matches CLI `uploadLocalImageAttachmentEnvelope`: `size` is plaintext bytes.
	* @param file - Happy `ref` plus display fields.
	* @param time - original log time when replaying history.
	*/
	sendFile(file, time) {
		const envelope = createEnvelope("user", {
			t: "file",
			ref: file.ref,
			name: file.name,
			size: file.size,
			...file.mimeType === void 0 ? {} : { mimeType: file.mimeType }
		}, time === void 0 ? {} : { time });
		this.emitEnvelope(envelope);
	}
	/**
	* Send a tool-call card.
	* @param call - matching id. A later start with the same id updates description.
	* @param name - Happy tool name (PascalCase knownTools, or a camouflage).
	* @param args - tool arguments. Happy merges by keeping already-seen keys.
	* @param title - short heading (schema-required; App often ignores it).
	* @param description - row subtitle the App actually shows.
	* @param time - original log time when replaying history.
	*/
	sendToolStart(call, name, args, title, description, time) {
		this.sendAgent({
			t: "tool-call-start",
			call,
			name,
			title,
			description,
			args
		}, time);
	}
	/**
	* Close a tool-call card.
	* @param call - matching id.
	* @param time - original log time when replaying history.
	*/
	sendToolEnd(call, time) {
		this.sendAgent({
			t: "tool-call-end",
			call
		}, time);
	}
	/**
	* Emit session-alive so the App shows the session as linked / online.
	* Happy CLI sends this immediately and every 2s; without it the list archives the row.
	* @param thinking - `agent/status === running`.
	*/
	keepAlive(thinking) {
		this.thinking = thinking;
		this.emitAlive();
		this.ensureAliveTimer();
	}
	/**
	* Assert the session state with a reliable (non-volatile) emit: state
	* transitions must not ride the droppable heartbeat path, or the App
	* flickers between online and thinking until the next 2s tick.
	* @param thinking - `true` while the Host turn is still executing.
	*/
	keepAliveNow(thinking) {
		this.thinking = thinking;
		this.socket?.emit("session-alive", {
			sid: this.happySessionId,
			time: Date.now(),
			thinking: this.thinking,
			mode: "remote"
		});
		this.ensureAliveTimer();
	}
	/**
	* Restart session-alive if the timer was cleared. Happy lists the row as
	* offline once heartbeats stop; opening the chat on the phone does not
	* start them again.
	*/
	ensureKeepAlive() {
		if (this.aliveTimer !== void 0) return;
		this.keepAlive(this.thinking);
	}
	emitAlive() {
		this.socket?.volatile.emit("session-alive", {
			sid: this.happySessionId,
			time: Date.now(),
			thinking: this.thinking,
			mode: "remote"
		});
	}
	ensureAliveTimer() {
		if (this.aliveTimer !== void 0 || this.socket === void 0) return;
		this.aliveTimer = setInterval(() => {
			this.emitAlive();
		}, 2e3);
	}
	/** Tell Happy this session process is gone so the App can archive or delete it. */
	endSession() {
		this.stopKeepAlive();
		this.socket?.emit("session-end", {
			sid: this.happySessionId,
			time: Date.now()
		});
	}
	/**
	* Encrypt and push session metadata.
	* @param metadata - plaintext catalog object.
	*/
	updateMetadata(metadata) {
		const socket = this.socket;
		if (socket === void 0) return;
		this.emitMetadata(socket, metadata, this.metadataVersion, 0);
	}
	emitMetadata(socket, metadata, expected, attempt) {
		socket.emit("update-metadata", {
			sid: this.happySessionId,
			metadata: encryptB64(this.crypto, metadata),
			expectedVersion: expected
		}, (answer) => {
			if (typeof answer?.version === "number") this.metadataVersion = answer.version;
			if (answer?.result === "version-mismatch" && attempt < 3 && typeof answer.version === "number") this.emitMetadata(socket, metadata, answer.version, attempt + 1);
		});
	}
	/**
	* Encrypt and push agentState (permission requests).
	* Retries on version-mismatch the same way metadata does; a dropped bump
	* leaves the App with empty `requests` and no Yes/No card.
	* @param agentState - plaintext agentState.
	*/
	updateState(agentState) {
		const socket = this.socket;
		if (socket === void 0) return;
		this.emitState(socket, agentState, this.agentStateVersion, 0);
	}
	emitState(socket, agentState, expected, attempt) {
		socket.emit("update-state", {
			sid: this.happySessionId,
			agentState: encryptB64(this.crypto, agentState),
			expectedVersion: expected
		}, (answer) => {
			if (typeof answer?.version === "number") this.agentStateVersion = answer.version;
			if (answer?.result === "version-mismatch" && attempt < 3 && typeof answer.version === "number") this.emitState(socket, agentState, answer.version, attempt + 1);
		});
	}
	sendAgent(ev, time) {
		if (this.turnId === void 0) this.turnId = createId();
		const envelope = createEnvelope("agent", ev, {
			turn: this.turnId,
			...time === void 0 ? {} : { time }
		});
		this.emitEnvelope(envelope);
	}
	emitEnvelope(envelope) {
		const content = {
			role: "session",
			content: envelope,
			meta: { sentFrom: "dsh" }
		};
		this.socket?.emit("message", {
			sid: this.happySessionId,
			message: encryptB64(this.crypto, content),
			localId: createId()
		});
	}
	onMetadataUpdate(metadata) {
		if (typeof metadata?.value !== "string") return;
		if (typeof metadata.version === "number") this.metadataVersion = metadata.version;
		let record;
		try {
			record = asRecord(decryptB64(this.crypto, metadata.value));
		} catch {
			return;
		}
		const lifecycle = record.lifecycleState;
		if (lifecycle === "archiveRequested" || lifecycle === "archived") {
			this.handlers.onArchived();
			return;
		}
		if (lifecycle === "running") this.handlers.onResumed();
		this.handlers.onCatalog(record);
	}
	dispatchInbound(plain) {
		const inbound = parseHappyInbound(plain);
		if (inbound !== void 0) this.handlers.onInbound(inbound);
	}
};
function waitConnect(socket) {
	if (socket.connected) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off("connect", onConnect);
			reject(/* @__PURE__ */ new Error("连接 Happy 会话超时"));
		}, 6e4);
		const onConnect = () => {
			clearTimeout(timer);
			resolve();
		};
		socket.once("connect", onConnect);
	});
}
function asPermission(params) {
	return parsePermissionRpc(params);
}
function asRecord(value) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
	return {};
}
//#endregion
//#region lib/types/bridge.js
/** Host orchestrator: pair, mirror sessions, map chat/approvals/questions onto Happy. */
/**
* Live Happy bridge for one Host process.
*/
var HappyBridge = class {
	ctx;
	config;
	log;
	credentials;
	pairing;
	machine;
	links = /* @__PURE__ */ new Map();
	happyToDsh = /* @__PURE__ */ new Map();
	models = /* @__PURE__ */ new Map();
	/** Last model/effort we wrote to Happy, so the metadata echo is not a phone pick. */
	lastPublished = /* @__PURE__ */ new Map();
	/** Count of in-flight phone-originated Host `selectModel` calls. */
	hostSelectFromPhone = 0;
	/** Per-agent selection installed on phone wake / spawn, matching Host `selectionFor`. */
	selections = /* @__PURE__ */ new WeakMap();
	/** In-flight phone wakes, so two inbound texts do not double-resume. */
	waking = /* @__PURE__ */ new Map();
	/** Phone stop-session / archive: do not recreate these Happy rows. */
	dismissed = /* @__PURE__ */ new Set();
	/** Phone New (spawn) blanks stay linked; web placeholders do not. */
	phoneSpawned = /* @__PURE__ */ new Set();
	/** Last Host archive set, so web archive/restore can park or unpark Happy. */
	lastArchivedIds = /* @__PURE__ */ new Set();
	/** Serialize phone text so two messages cannot split one attachment batch. */
	inboundTail = /* @__PURE__ */ new Map();
	error;
	running = false;
	scanTimer;
	/**
	* @param ctx - Host context.
	* @param config - resolved plugin config.
	* @param log - logger.
	*/
	constructor(ctx, config, log) {
		this.ctx = ctx;
		this.config = config;
		this.log = log;
	}
	/** Replace config after a settings write that keeps the same relay. */
	setConfig(config) {
		this.config = config;
	}
	/**
	* Apply a settings write in place when the Happy relay identity is unchanged.
	* Grant changes take effect immediately; URL / credential-dir / enabled
	* changes must rebuild.
	* @param next - resolved settings section.
	* @returns true when the live bridge kept running.
	*/
	acceptSettings(next) {
		if (!sameHappyRuntime(this.config, next)) return false;
		this.config = next;
		return true;
	}
	/** Snapshot for the settings card. */
	status() {
		return {
			paired: this.credentials !== void 0,
			pairing: this.pairing !== void 0,
			serverUrl: this.config.serverUrl,
			...this.pairing === void 0 ? {} : {
				mobileUrl: this.pairing.mobileUrl,
				webUrl: this.pairing.webUrl,
				qrDataUrl: this.pairing.qrDataUrl
			},
			...this.error === void 0 ? {} : { error: this.error },
			...this.credentials === void 0 ? {} : { machineId: this.credentials.machineId },
			sessionCount: this.links.size,
			linkedCount: [...this.links.values()].filter((link) => link.socket.isConnected()).length
		};
	}
	/** Load credentials, connect machine, mirror live root agents. */
	async start() {
		if (!this.config.enabled) return;
		this.running = true;
		this.installHooks();
		const dir = resolveCredentialDir(this.config.credentialDir);
		try {
			this.credentials = await loadCredentials(dir);
			if (this.credentials !== void 0) {
				for (const id of await loadDismissed(dir)) this.dismissed.add(id);
				await this.connectCloud();
				return;
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.log(`读取凭据失败：${this.error}`);
		}
		if (this.config.pairOnStart) await this.beginPairing();
	}
	/** Tear down sockets. Web UI keeps running. */
	dispose() {
		this.running = false;
		if (this.scanTimer !== void 0) {
			clearInterval(this.scanTimer);
			this.scanTimer = void 0;
		}
		this.pairing?.abort();
		this.pairing = void 0;
		this.machine?.dispose();
		this.machine = void 0;
		for (const link of this.links.values()) link.socket.dispose();
		this.links.clear();
		this.happyToDsh.clear();
		this.waking.clear();
		this.lastPublished.clear();
		this.models.clear();
	}
	/** Start or resume pairing. */
	async beginPairing() {
		this.pairing?.abort();
		this.error = void 0;
		const dir = resolveCredentialDir(this.config.credentialDir);
		const existing = await loadCredentials(dir);
		if (existing !== void 0) {
			this.credentials = existing;
			await markConnected(dir, existing.machineId);
			await this.connectCloud();
			return;
		}
		const attempt = await startPairing(this.config.serverUrl, this.config.appUrl);
		this.pairing = attempt;
		const machineId = await peekMachineId(dir) ?? crypto.randomUUID();
		attempt.done.then(async (partial) => {
			const credentials = {
				...partial,
				machineId
			};
			this.credentials = credentials;
			this.pairing = void 0;
			await saveCredentials(dir, credentials);
			await this.connectCloud();
		}).catch((error) => {
			if (this.pairing === attempt) this.pairing = void 0;
			this.error = error instanceof Error ? error.message : String(error);
			this.log(`配对失败：${this.error}`);
		});
	}
	/**
	* Drop the current Happy login and show a new QR. Keeps the same machine id
	* so already-mirrored sessions stay on this Host after the phone scans again.
	*/
	async rePair() {
		await this.disconnect();
		await this.beginPairing();
	}
	/** Disconnect Happy without killing dsh web. */
	async disconnect() {
		this.pairing?.abort();
		this.pairing = void 0;
		await markDisconnected(resolveCredentialDir(this.config.credentialDir), this.credentials?.machineId);
		this.credentials = void 0;
		this.machine?.dispose();
		this.machine = void 0;
		for (const link of this.links.values()) link.socket.dispose();
		this.links.clear();
		this.happyToDsh.clear();
		this.waking.clear();
		this.phoneSpawned.clear();
		this.dismissed.clear();
	}
	async connectCloud() {
		const credentials = this.credentials;
		if (credentials === void 0) return;
		const { ctx: crypto, dataEncryptionKey } = machineCrypto(credentials);
		await createOrLoadMachine({
			serverUrl: this.config.serverUrl,
			token: credentials.token,
			machineId: credentials.machineId,
			crypto,
			metadata: {
				host: "dsh",
				platform: process.platform,
				happyCliVersion: HAPPY_CLI_VERSION,
				homeDir: "/dsh-workspaces"
			},
			daemonState: {
				status: "running",
				pid: process.pid,
				startedAt: Date.now()
			},
			...dataEncryptionKey === void 0 ? {} : { dataEncryptionKey }
		});
		this.machine?.dispose();
		this.machine = new HappyMachineSocket(credentials.machineId, credentials.token, this.config.serverUrl, crypto, {
			spawn: (options) => this.spawn(options),
			resume: (happyId) => this.resumeHappySession(happyId),
			stopSession: (happyId) => this.unmapHappy(happyId),
			listWorkspaces: () => this.workspaces(),
			log: this.log
		});
		await this.machine.connect();
		this.seedArchiveSet();
		await this.syncMirrors();
		if (this.scanTimer === void 0) this.scanTimer = setInterval(() => {
			this.syncMirrors();
		}, 1e4);
	}
	installHooks() {
		this.ctx.on("agent/created", ({ agent }) => {
			if (!this.running || this.shouldSkip(agent)) return;
			if (this.dismissed.has(agent.id) && isBlankSession(agent.session.events)) return;
			if (this.dismissed.has(agent.id)) this.undismiss(agent.id);
			const existing = this.links.get(agent.id);
			if (existing !== void 0) {
				this.attachAgent(existing, agent);
				this.wakePhone(existing, true);
				return;
			}
			if (isBlankSession(agent.session.events) && !this.phoneSpawned.has(agent.id)) return;
			this.mirrorAgent(agent).then(() => {
				if (this.isHarnessArchived(agent.id)) this.parkPhoneSession(agent.id);
			}).catch((error) => this.log(`镜像会话失败：${String(error)}`));
		});
		this.ctx.on("agent/disposed", ({ agent }) => {
			const link = this.links.get(agent.id);
			if (link === void 0) return;
			if (this.listedUnarchived().has(agent.id) || link.parked) {
				delete link.agent;
				link.sessionUnsub?.();
				delete link.sessionUnsub;
				return;
			}
			this.dropLink(agent.id);
		});
		this.ctx.on("agent/status", ({ agent, status }) => {
			const link = this.links.get(agent.id);
			if (link === void 0 || link.parked) return;
			link.socket.keepAlive(status === "running");
			if (status === "idle") this.drainNewEvents(link, agent);
		}, { global: true });
		this.ctx.on("session/event", (session, event) => {
			if (event.type === "model/selection") {
				this.onHostModelSelected(String(session.header.id), event.data);
				return;
			}
			const link = this.links.get(session.header.id);
			if (link !== void 0) {
				this.onSessionEvent(link, event);
				return;
			}
			if (event.type !== "turn/start" || !this.running || this.credentials === void 0) return;
			if (this.dismissed.has(session.header.id)) this.undismiss(session.header.id);
			this.ensureMirror(session.header.id).catch((error) => this.log(`镜像会话失败：${String(error)}`));
		}, { global: true });
		this.ctx.on("approval/request", (req, next) => this.onApproval(req, next), { prepend: true });
		this.ctx.inject(["userQuestions"], (inner) => {
			const questions = inner.userQuestions;
			const original = questions.ask;
			questions.ask = (request) => this.onAsk(questions, original, request);
			inner.effect(() => () => {
				questions.ask = original;
			}, "happy-bridge: restore userQuestions.ask");
		});
		this.ctx.inject(["commands"], (inner) => {
			inner.commands.register({
				name: "remote",
				description: "查看或设置手机远程控制档（watch / chat / approve / full）",
				handler: (invocation) => {
					const arg = invocation.rawInput.trim();
					if (arg === "") return {
						kind: "success",
						text: `当前远程档 ${this.config.remoteGrant}`
					};
					if (arg !== "watch" && arg !== "chat" && arg !== "approve" && arg !== "full") return {
						kind: "error",
						text: `未知远程档 "${arg}"（watch / chat / approve / full）`
					};
					this.config.remoteGrant = arg;
					return {
						kind: "success",
						text: `远程档已设为 ${arg}`
					};
				}
			});
			inner.commands.register({
				name: "effort",
				description: "设置当前模型的推理档",
				handler: async (invocation) => {
					const id = invocation.rawInput.trim();
					const current = this.currentModel(invocation.agent);
					if (current === void 0) return {
						kind: "error",
						text: "当前没有已选模型"
					};
					if (id === "") {
						this.rememberModel(invocation.agent, {
							provider: current.provider,
							model: current.model
						});
						return {
							kind: "success",
							text: "推理档已恢复为模型默认"
						};
					}
					this.rememberModel(invocation.agent, {
						provider: current.provider,
						model: current.model,
						reasoningEffort: ReasoningEffortId(id)
					});
					return {
						kind: "success",
						text: `推理档 ${id}`
					};
				}
			});
		});
		this.ctx.on("commands/change", () => {
			this.pushAllMetadata();
		});
		this.ctx.on("llm/adapters-updated", () => {
			this.pushAllMetadata();
		});
		this.ctx.on("domain/changed", (change) => {
			if (change.domain !== "workspace" || change.table !== "") return;
			this.reconcileArchiveSet();
		});
	}
	isHarnessArchived(dshId) {
		return this.ctx.get("workspaceRegistry")?.archivedSessionIds.includes(SessionId(dshId)) === true;
	}
	seedArchiveSet() {
		const ids = this.ctx.get("workspaceRegistry")?.archivedSessionIds ?? [];
		this.lastArchivedIds = new Set(ids.map(String));
	}
	reconcileArchiveSet() {
		const next = new Set((this.ctx.get("workspaceRegistry")?.archivedSessionIds ?? []).map(String));
		const { hidden, shown } = archiveSetDiff(this.lastArchivedIds, next);
		this.lastArchivedIds = next;
		if (!this.running) return;
		for (const id of hidden) if (this.links.has(id)) this.parkPhoneSession(id);
		for (const id of shown) {
			const link = this.links.get(id);
			if (link !== void 0) this.unpark(link);
		}
	}
	listedUnarchived() {
		const registry = this.ctx.get("workspaceRegistry");
		return new Set(unarchivedSessionIds(registry?.list() ?? [], registry?.archivedSessionIds ?? []));
	}
	async syncMirrors() {
		if (!this.running || this.credentials === void 0) return;
		const wanted = /* @__PURE__ */ new Set([...this.listedUnarchived()]);
		for (const id of wanted) try {
			await this.ensureMirror(id);
		} catch (error) {
			this.log(`镜像会话失败：${String(error)}`);
		}
		for (const id of this.ctx.get("workspaceRegistry")?.archivedSessionIds ?? []) try {
			await this.ensureMirror(id);
		} catch (error) {
			this.log(`镜像会话失败：${String(error)}`);
		}
		for (const id of [...this.links.keys()]) {
			const link = this.links.get(id);
			if (link === void 0) continue;
			const action = phoneParkAction(link.parked, wanted.has(id));
			if (action === "unpark") {
				this.wakePhone(link);
				continue;
			}
			if (action === "park") {
				if (!this.phoneSpawned.has(id) && isBlankSession(this.linkEvents(link))) this.abandonBlankMirror(id);
				else if (this.isHarnessArchived(id)) this.parkPhoneSession(id);
				continue;
			}
			if (link.parked) continue;
			if (wanted.has(id)) this.wakePhone(link);
			if (!this.phoneSpawned.has(id) && isBlankSession(this.linkEvents(link))) this.abandonBlankMirror(id);
		}
		await this.sweepHappyGhosts();
	}
	async ensureMirror(id) {
		if (this.links.has(id)) return;
		if (this.dismissed.has(id) && await this.sessionIsBlank(id) && !this.phoneSpawned.has(id)) return;
		if (this.dismissed.has(id)) this.undismiss(id);
		const agent = this.ctx.agents.get(SessionId(id));
		if (agent !== void 0) {
			if (this.shouldSkip(agent)) return;
			if (isBlankSession(agent.session.events) && !this.phoneSpawned.has(id)) return;
			await this.mirrorAgent(agent);
			if (this.isHarnessArchived(id)) this.parkPhoneSession(id);
			return;
		}
		await this.mirrorDormant(id);
		if (this.isHarnessArchived(id)) this.parkPhoneSession(id);
	}
	dropLink(dshId) {
		const link = this.links.get(dshId);
		if (link === void 0) return;
		link.sessionUnsub?.();
		this.happyToDsh.delete(link.socket.happySessionId);
		link.socket.dispose();
		this.links.delete(dshId);
		this.lastPublished.delete(dshId);
		this.models.delete(dshId);
	}
	/**
	* Remove a web New Session placeholder from Happy without remembering a
	* dismiss: the first real turn should remirror it.
	*/
	abandonBlankMirror(dshId) {
		const link = this.links.get(dshId);
		const happyId = link?.socket.happySessionId;
		link?.socket.endSession();
		this.dropLink(dshId);
		if (happyId !== void 0 && this.credentials !== void 0) deleteHappySession(this.config.serverUrl, this.credentials.token, happyId);
		this.log(`空白占位不出现在手机上 ${dshId}`);
	}
	/**
	* Drop Happy rows for dismissed or blank dsh tags. The App archive button
	* only sets inactive; without this sweep a keepalive ghost stays in the list.
	*/
	async sweepHappyGhosts() {
		if (this.credentials === void 0) return;
		const rows = await listHappySessions(this.config.serverUrl, this.credentials.token);
		for (const row of rows) {
			const dshId = row.tag.startsWith("dsh:") ? row.tag.slice(4) : this.happyToDsh.get(row.id);
			if (dshId === void 0 || this.phoneSpawned.has(dshId)) continue;
			if (await this.sessionIsBlank(dshId)) this.forgetPhoneSession(row.id, dshId);
		}
	}
	async sessionIsBlank(dshId) {
		const agent = this.ctx.agents.get(SessionId(dshId));
		if (agent !== void 0) return isBlankSession(agent.session.events);
		const stored = await this.loadStored(dshId);
		if (stored === void 0) return !this.links.has(dshId);
		return isBlankSession(stored.events);
	}
	linkEvents(link) {
		return link.agent?.session.events ?? link.events;
	}
	requireAgent(link) {
		if (link.agent !== void 0) return link.agent;
		const live = this.ctx.agents.get(SessionId(link.dshId));
		if (live === void 0) return void 0;
		this.attachAgent(link, live);
		return live;
	}
	/** Bind a live agent onto an existing Happy socket without reminting it. */
	attachAgent(link, agent) {
		link.agent = agent;
		link.cwd = agent.session.header.cwd ?? link.cwd;
		link.events = [];
		if (link.lastForwardedSeq < 0) link.lastForwardedSeq = lastEventSeq(agent.session.events);
		link.sessionUnsub?.();
		link.sessionUnsub = agent.ctx.on("session/event", (session, event) => {
			if (session.header.id !== link.dshId) return;
			this.onSessionEvent(link, event);
		}, { global: true });
	}
	/** Copy log events newer than {@link Link.lastForwardedSeq} onto Happy. */
	drainNewEvents(link, agent) {
		if (link.replaying) return;
		for (const event of agent.session.events) this.onSessionEvent(link, event);
	}
	/**
	* Live agent for this Happy socket, resuming the persisted session when the
	* web has never opened it. Same preset the Host would mount on a web open.
	*/
	async ensureAgent(link) {
		const live = this.requireAgent(link);
		if (live !== void 0) return {
			agent: live,
			woke: false
		};
		const inflight = this.waking.get(link.dshId);
		if (inflight !== void 0) {
			const agent = await inflight;
			return agent === void 0 ? void 0 : {
				agent,
				woke: true
			};
		}
		link.socket.keepAlive(true);
		const waking = this.wakeAgent(link).finally(() => {
			if (this.waking.get(link.dshId) === waking) this.waking.delete(link.dshId);
		});
		this.waking.set(link.dshId, waking);
		const agent = await waking;
		return agent === void 0 ? void 0 : {
			agent,
			woke: true
		};
	}
	async wakeAgent(link) {
		const already = this.requireAgent(link);
		if (already !== void 0) return already;
		try {
			const agent = await withTimeout(this.resumeSession(link), 6e4, "打开这场对话超时");
			this.log(`已从手机唤醒会话 ${link.dshId}`);
			return agent;
		} catch (error) {
			const recovered = this.requireAgent(link);
			if (recovered !== void 0) return recovered;
			this.log(`唤醒会话失败：${error instanceof Error ? error.message : String(error)}`);
			return;
		}
	}
	async resumeSession(link) {
		const setup = await this.composeAgentSetup(resolveSessionPreset(this.linkEvents(link), link.headerAgentPreset));
		const handle = await this.ctx.agents.resume({
			resumeSessionId: SessionId(link.dshId),
			setup
		});
		await this.ensurePinnedEffort(handle.agent);
		const current = this.links.get(link.dshId);
		if (current !== void 0) this.attachAgent(current, handle.agent);
		return handle.agent;
	}
	/**
	* Resume/create composition matching Host `composeAgent`: install model
	* selection, then mount the preset when a roster exists.
	* @param presetHint - logged or requested preset id; omitted uses the roster default.
	*/
	async composeAgentSetup(presetHint) {
		const presets = this.ctx.get("agentPresets");
		let resolvedId;
		if (presets !== void 0) resolvedId = (await presets.resolve(presetHint)).id;
		return async (agentCtx) => {
			this.installWakeSelection(agentCtx);
			if (presets !== void 0 && resolvedId !== void 0) await presets.mount(agentCtx, resolvedId);
		};
	}
	/**
	* Same lazy selection Host `selectionFor` installs: remembered pick, else
	* the session's last `request/header`, else `agentDefaultModel`. A missing
	* thinking level keeps the web picker's effort when it is the same model.
	* Unlike Host `installModelSelection`, an absent effort does not clear
	* inherited thinking.
	*/
	installWakeSelection(agentCtx) {
		const agent = agentCtx.agent;
		if (agent === void 0) throw new Error("happy-bridge: agent setup has no scoped agent");
		if (this.selections.has(agent)) return;
		let picked;
		const bridge = this;
		const selection = {
			get current() {
				if (picked !== void 0) return picked;
				return bridge.currentModel(agent);
			},
			set current(next) {
				picked = next;
			},
			assembled: void 0
		};
		this.bindWakeSelection(agentCtx, selection);
		this.selections.set(agent, selection);
		const current = selection.current;
		if (current === void 0) return;
		const existing = this.models.get(agent.id);
		if (existing === void 0 || existing.reasoningEffort === void 0 && current.reasoningEffort !== void 0) this.models.set(agent.id, current);
	}
	/**
	* Pin provider/model for a phone-woken agent without wiping thinking when
	* the selection names no effort.
	*/
	bindWakeSelection(agentCtx, selection) {
		agentCtx.on("system-prompt/assemble", async (_assembly, _context, next) => {
			const selected = selection.current;
			const assembled = await next();
			selection.assembled = selected;
			if (selected === void 0) return assembled;
			return {
				...assembled,
				variables: {
					...assembled.variables,
					provider: selected.provider,
					model: selected.model
				}
			};
		});
		agentCtx.on("agent/request", async (_payload, next) => {
			const resolved = await next();
			const selected = selection.assembled;
			if (selected === void 0) return resolved;
			return {
				...resolved,
				provider: selected.provider,
				model: selected.model,
				...selected.reasoningEffort === void 0 ? {} : { reasoningEffort: selected.reasoningEffort }
			};
		});
	}
	/** Host default model, when the web profile mounted `agentDefaultModel`. */
	defaultModelSelection() {
		return this.ctx.get("agentDefaultModel")?.currentSelection();
	}
	/** Registered workspace for this session, or `undefined` when it is not in the sidebar. */
	workspaceFor(sessionId, cwd) {
		const mapped = this.workspaces();
		if (cwd !== void 0 && cwd !== "") {
			const hit = matchVirtualWorkspace(cwd, mapped);
			if (hit !== void 0) return hit;
		}
		const match = (this.ctx.get("workspaceRegistry")?.list() ?? []).find((workspace) => workspace.sessionIds.includes(SessionId(sessionId)));
		if (match === void 0) return void 0;
		return matchVirtualWorkspace(match.path, mapped);
	}
	async loadStored(id) {
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0) return void 0;
		try {
			const stored = await persistence.inspect(SessionId(id));
			if (stored.meta.origin === "subagent") return void 0;
			const workspace = this.workspaceFor(id, stored.meta.cwd);
			if (workspace === void 0) return void 0;
			return {
				cwd: stored.meta.cwd ?? workspace.realPath,
				happyPath: workspace.virtualPath,
				events: stored.events,
				...stored.meta.agentPreset === void 0 ? {} : { headerAgentPreset: stored.meta.agentPreset }
			};
		} catch {
			return;
		}
	}
	shouldSkip(agent) {
		return agent.session.header.origin === "subagent";
	}
	workspaces() {
		const registry = this.ctx.get("workspaceRegistry");
		if (registry === void 0) return [];
		return virtualWorkspaces(registry.list().map((workspace) => ({
			id: workspace.id,
			path: workspace.path,
			title: workspace.title
		})));
	}
	async mirrorAgent(agent, happySessionId) {
		if (this.links.has(agent.id) || this.credentials === void 0) return;
		if (isBlankSession(agent.session.events) && happySessionId === void 0 && !this.phoneSpawned.has(agent.id)) return;
		const workspace = this.workspaceFor(agent.id, agent.session.header.cwd);
		if (workspace === void 0) return;
		const cwd = agent.session.header.cwd ?? workspace.realPath;
		const credentials = this.credentials;
		const { ctx: crypto, dataEncryptionKey } = sessionCrypto(credentials);
		let sessionId = happySessionId;
		let metadataVersion = 0;
		let agentStateVersion = 0;
		let seq = happySessionId === void 0 ? 0 : 1;
		if (sessionId === void 0) {
			const created = await createOrLoadSession({
				serverUrl: this.config.serverUrl,
				token: credentials.token,
				tag: `dsh:${agent.id}`,
				crypto,
				metadata: await buildSessionMetadata(this.ctx, {
					cwd,
					happyPath: workspace.virtualPath,
					events: agent.session.events,
					agent
				}, credentials.machineId, sessionLabel(agent.session.events), this.currentModel(agent), this.config.remoteGrant),
				agentState: {
					controlledByUser: grantAtLeast(this.config.remoteGrant, "chat"),
					requests: {}
				},
				...dataEncryptionKey === void 0 ? {} : { dataEncryptionKey }
			});
			sessionId = created.id;
			seq = created.seq;
			metadataVersion = created.metadataVersion;
			agentStateVersion = created.agentStateVersion;
		}
		if (sessionId === void 0) return;
		const socket = new HappySessionSocket(sessionId, credentials.token, this.config.serverUrl, crypto, {
			onInbound: (message) => this.queueInbound(agent.id, message),
			onPermission: (rpc) => this.onPermission(agent.id, rpc),
			onAbort: () => this.onPhoneAbort(agent.id),
			onArchived: () => this.onPhoneArchive(sessionId, agent.id),
			onResumed: () => this.onPhoneRestore(agent.id),
			onCatalog: (meta) => this.applyPhoneCatalog(agent.id, meta),
			log: this.log
		});
		try {
			await socket.connect(metadataVersion, agentStateVersion);
		} catch (error) {
			socket.dispose();
			throw error;
		}
		const link = {
			agent,
			socket,
			crypto,
			pendingDownloads: [],
			alwaysAllow: /* @__PURE__ */ new Set(),
			replaying: false,
			skipNextUser: 0,
			outboundTail: Promise.resolve(),
			lastPhoneText: "",
			lastPhoneAt: 0,
			startedCalls: /* @__PURE__ */ new Set(),
			reasoning: "",
			thinkBodySent: false,
			thinkLastEmit: 0,
			dshId: agent.id,
			cwd,
			events: [],
			lastForwardedSeq: lastEventSeq(agent.session.events),
			parked: false
		};
		this.links.set(agent.id, link);
		this.happyToDsh.set(sessionId, agent.id);
		await this.pushMetadata(link);
		if (seq === 0) await this.replayHistory(link);
		this.log(`已镜像会话 ${agent.id} → Happy ${sessionId}（seq=${seq}）`);
	}
	async mirrorDormant(dshId) {
		if (this.links.has(dshId) || this.credentials === void 0) return;
		const stored = await this.loadStored(dshId);
		if (stored === void 0) return;
		if (isBlankSession(stored.events)) return;
		const credentials = this.credentials;
		const { ctx: crypto, dataEncryptionKey } = sessionCrypto(credentials);
		const title = sessionLabel(stored.events);
		const created = await createOrLoadSession({
			serverUrl: this.config.serverUrl,
			token: credentials.token,
			tag: `dsh:${dshId}`,
			crypto,
			metadata: await buildSessionMetadata(this.ctx, {
				cwd: stored.cwd,
				happyPath: stored.happyPath,
				events: stored.events
			}, credentials.machineId, title, void 0, this.config.remoteGrant),
			agentState: {
				controlledByUser: grantAtLeast(this.config.remoteGrant, "chat"),
				requests: {}
			},
			...dataEncryptionKey === void 0 ? {} : { dataEncryptionKey }
		});
		const socket = new HappySessionSocket(created.id, credentials.token, this.config.serverUrl, crypto, {
			onInbound: (message) => this.queueInbound(dshId, message),
			onPermission: (rpc) => this.onPermission(dshId, rpc),
			onAbort: () => this.onPhoneAbort(dshId),
			onArchived: () => this.onPhoneArchive(created.id, dshId),
			onResumed: () => this.onPhoneRestore(dshId),
			onCatalog: (meta) => this.applyPhoneCatalog(dshId, meta),
			log: this.log
		});
		try {
			await socket.connect(created.metadataVersion, created.agentStateVersion);
		} catch (error) {
			socket.dispose();
			throw error;
		}
		const link = {
			socket,
			crypto,
			pendingDownloads: [],
			alwaysAllow: /* @__PURE__ */ new Set(),
			replaying: false,
			skipNextUser: 0,
			outboundTail: Promise.resolve(),
			lastPhoneText: "",
			lastPhoneAt: 0,
			startedCalls: /* @__PURE__ */ new Set(),
			reasoning: "",
			thinkBodySent: false,
			thinkLastEmit: 0,
			dshId,
			cwd: stored.cwd,
			events: stored.events,
			lastForwardedSeq: -1,
			parked: false,
			...stored.headerAgentPreset === void 0 ? {} : { headerAgentPreset: stored.headerAgentPreset }
		};
		this.links.set(dshId, link);
		this.happyToDsh.set(created.id, dshId);
		await this.pushMetadata(link);
		if (created.seq === 0) await this.replayHistory(link);
		this.log(`已镜像未打开会话 ${dshId} → Happy ${created.id}（seq=${created.seq}）`);
	}
	unmapHappy(happySessionId) {
		this.onPhoneArchive(happySessionId, this.happyToDsh.get(happySessionId));
	}
	/**
	* Phone archive: park a real conversation so a later send resumes it.
	* Blank placeholders are forgotten and not remirrored.
	*/
	onPhoneArchive(happySessionId, dshId) {
		this.handlePhoneArchive(happySessionId, dshId);
	}
	async handlePhoneArchive(happySessionId, dshId) {
		if (dshId !== void 0 && !await this.sessionIsBlank(dshId)) {
			if (this.links.has(dshId)) this.parkPhoneSession(dshId, true);
			else this.undismiss(dshId);
			return;
		}
		this.forgetPhoneSession(happySessionId, dshId);
	}
	/**
	* Park a real conversation on Happy. `hideHost` archives the same row on
	* the web (phone archive). Web-initiated archive only parks Happy.
	*/
	parkPhoneSession(dshId, hideHost = false) {
		const link = this.links.get(dshId);
		if (link === void 0 || link.parked) return;
		link.parked = true;
		link.socket.stopKeepAlive();
		if (this.credentials !== void 0) archiveHappySession(this.config.serverUrl, this.credentials.token, link.socket.happySessionId);
		if (hideHost) hideOnHarness(this.ctx.get("workspaceRegistry"), dshId).catch((error) => {
			this.log(`网页归档失败：${error instanceof Error ? error.message : String(error)}`);
		});
		this.log(hideHost ? `已归档 ${dshId}，手机归档列表里打开或再发一条，网页侧栏也会回来` : `网页归档了 ${dshId}，手机也已归档，恢复后网页侧栏会回来`);
	}
	onPhoneRestore(dshId) {
		const link = this.links.get(dshId);
		if (link === void 0) {
			this.undismiss(dshId);
			return;
		}
		this.unpark(link);
	}
	undismiss(dshId) {
		if (!this.dismissed.has(dshId)) return;
		this.dismissed.delete(dshId);
		removeDismissed(resolveCredentialDir(this.config.credentialDir), dshId);
		this.log(`已恢复镜像 ${dshId}`);
	}
	/**
	* Put this Happy row back online. Opening an offline chat on the phone
	* does not start heartbeats; the web sidebar still showing the row, a
	* phone send, or Happy's resume RPC all come through here.
	* @param refreshCatalog - republish metadata (web open / phone resume).
	*/
	wakePhone(link, refreshCatalog = false) {
		if (link.parked) {
			this.unpark(link);
			return;
		}
		link.socket.ensureKeepAlive();
		if (refreshCatalog) this.pushMetadata(link);
	}
	unpark(link) {
		if (!link.parked) return;
		link.parked = false;
		if (this.dismissed.has(link.dshId)) this.undismiss(link.dshId);
		link.socket.keepAlive(false);
		this.pushMetadata(link);
		revealOnHarness(this.ctx.get("workspaceRegistry"), link.dshId).catch((error) => {
			this.log(`网页恢复失败：${error instanceof Error ? error.message : String(error)}`);
		});
		this.log(`已恢复 ${link.dshId}，网页侧栏会重新显示这场对话`);
	}
	/**
	* Honor a phone archive/delete: stop keepalive, drop the Happy row, and do
	* not remirror this harness session until the plugin is unpaired.
	*/
	forgetPhoneSession(happySessionId, dshId) {
		if (dshId !== void 0 && this.dismissed.has(dshId) && !this.links.has(dshId)) return;
		if (dshId !== void 0) {
			this.dismissed.add(dshId);
			addDismissed(resolveCredentialDir(this.config.credentialDir), dshId);
			this.links.get(dshId)?.socket.stopKeepAlive();
			this.links.get(dshId)?.socket.endSession();
			this.dropLink(dshId);
		}
		if (happySessionId !== void 0 && this.credentials !== void 0) deleteHappySession(this.config.serverUrl, this.credentials.token, happySessionId);
		this.log(`已从手机去掉 ${happySessionId ?? dshId ?? ""}（网页会话仍在）`);
	}
	/**
	* Happy App continues an offline row with `resume-happy-session`.
	* Reuse the existing harness session; do not mint a new one.
	* @param happySessionId - Happy cloud session id from the App.
	*/
	async resumeHappySession(happySessionId) {
		const known = this.happyToDsh.get(happySessionId);
		if (known !== void 0) {
			const link = this.links.get(known);
			if (link !== void 0) {
				this.wakePhone(link, true);
				this.log(`已从手机重新接上 ${known}`);
				return {
					type: "success",
					sessionId: happySessionId
				};
			}
		}
		for (const link of this.links.values()) {
			if (link.socket.happySessionId !== happySessionId) continue;
			this.happyToDsh.set(happySessionId, link.dshId);
			this.wakePhone(link, true);
			this.log(`已从手机重新接上 ${link.dshId}`);
			return {
				type: "success",
				sessionId: happySessionId
			};
		}
		if (this.credentials === void 0) return {
			type: "error",
			errorMessage: "还没连上 Happy"
		};
		try {
			const row = (await listHappySessions(this.config.serverUrl, this.credentials.token)).find((item) => item.id === happySessionId);
			const dshId = row?.tag.startsWith("dsh:") === true ? row.tag.slice(4) : void 0;
			if (dshId === void 0 || dshId === "") return {
				type: "error",
				errorMessage: "找不到这场对话，请在电脑网页里点开它"
			};
			this.undismiss(dshId);
			await this.ensureMirror(dshId);
			const link = this.links.get(dshId);
			if (link === void 0) return {
				type: "error",
				errorMessage: "找不到这场对话，请在电脑网页里点开它"
			};
			this.wakePhone(link, true);
			this.log(`已从手机重新接上 ${dshId}`);
			return {
				type: "success",
				sessionId: happySessionId
			};
		} catch (error) {
			return {
				type: "error",
				errorMessage: error instanceof Error ? error.message : String(error)
			};
		}
	}
	async spawn(options) {
		if (!grantAtLeast(this.config.remoteGrant, "chat")) return {
			type: "error",
			errorMessage: "当前远程档不能新建会话"
		};
		const real = resolveSpawnDirectory(options.directory, this.workspaces());
		if (real === void 0) return {
			type: "error",
			errorMessage: `目录不是已登记的工作区：${options.directory}`
		};
		try {
			const sessionId = SessionId(crypto.randomUUID());
			const setup = await this.composeAgentSetup();
			const handle = await this.ctx.agents.create({
				sessionId,
				meta: { cwd: real },
				setup
			});
			await (this.ctx.get("workspaceRegistry")?.list().find((item) => item.path === real))?.attachSession(sessionId);
			this.phoneSpawned.add(handle.agent.id);
			this.applySpawnMeta(handle.agent, options);
			await this.ensurePinnedEffort(handle.agent);
			await this.mirrorAgent(handle.agent, options.sessionId);
			return {
				type: "success",
				sessionId: this.links.get(handle.agent.id)?.socket.happySessionId ?? options.sessionId ?? handle.agent.id
			};
		} catch (error) {
			return {
				type: "error",
				errorMessage: error instanceof Error ? error.message : String(error)
			};
		}
	}
	applySpawnMeta(agent, options) {
		if (options.modelMode !== void 0) this.applyModel(agent, options.modelMode, options.effortLevel);
		else if (options.effortLevel !== void 0) this.applyEffort(agent, options.effortLevel);
		if (options.permissionMode !== void 0) this.applyPermission(agent, options.permissionMode, true);
	}
	queueInbound(dshId, message) {
		const next = (this.inboundTail.get(dshId) ?? Promise.resolve()).then(() => this.onInbound(dshId, message), () => this.onInbound(dshId, message));
		this.inboundTail.set(dshId, next);
	}
	async onInbound(dshId, message) {
		const link = this.links.get(dshId);
		if (link === void 0 || link.replaying) return;
		this.wakePhone(link);
		if (this.dismissed.has(dshId)) this.undismiss(dshId);
		if (message.meta.sentFrom === "dsh") return;
		if (message.kind === "text") {
			if (!(link.pendingDownloads.length > 0) && link.lastPhoneText === message.text && Date.now() - link.lastPhoneAt < 2500) return;
			link.lastPhoneText = message.text;
			link.lastPhoneAt = Date.now();
		}
		if (message.kind === "file") {
			if (!grantAtLeast(this.config.remoteGrant, "chat")) return;
			link.pendingDownloads.push(this.downloadPhoneFile(link, message));
			return;
		}
		const files = await this.drainPhoneFiles(link);
		const pending = link.pendingHuman;
		if (pending?.kind === "ask") {
			pending.resolve({ answers: customAnswersFromText(pending.questions, message.text) });
			delete link.pendingHuman;
			this.clearRequest(link, pending.id, "canceled");
			link.socket.sendToolEnd(pending.id);
			return;
		}
		if (pending?.kind === "plan-review") {
			pending.reject(new UserQuestionError("the user cancelled ask_user_question", "ASK_CANCELLED"));
			delete link.pendingHuman;
			this.clearRequest(link, pending.id, "canceled");
			link.socket.sendToolEnd(pending.id);
		}
		if (!grantAtLeast(this.config.remoteGrant, "chat")) {
			link.socket.sendText("service", "当前是「只看」档，不能从手机发消息。");
			return;
		}
		if (message.text.trim() === "" && files.length === 0) return;
		const ensured = await this.ensureAgent(link);
		const current = this.links.get(dshId);
		if (ensured === void 0 || current === void 0) {
			link.socket.keepAlive(false);
			link.socket.sendText("service", "没法从手机打开这场对话。请先在网页点开它一次，然后再试。");
			return;
		}
		const { agent } = ensured;
		await this.ensurePinnedEffort(agent);
		const names = new Set((this.ctx.get("commands")?.list(agent) ?? []).map((command) => command.name));
		const kind = classifyInboundText(message.text, names);
		await this.applyMessageMeta(current, agent, message.meta, kind === "command");
		if (kind === "command") {
			if (!grantAtLeast(this.config.remoteGrant, "full")) {
				current.socket.sendText("service", "斜杠命令需要远程档「完整」。");
				return;
			}
			const { encoded } = splitPendingFiles(files);
			const result = await this.ctx.get("commands")?.execute(agent, message.text, encoded, new AbortController().signal);
			const text = result?.result.text ?? (result === void 0 ? "未知命令" : result.result.kind);
			current.socket.sendText("service", text);
			return;
		}
		await this.followup(current, agent, message.text, files);
	}
	async applyMessageMeta(link, agent, meta, isCommand) {
		const model = messageModelCode(meta);
		const effort = messageEffort(meta);
		const permissionMode = meta.permissionMode;
		if (model !== void 0) {
			if (!grantAtLeast(this.config.remoteGrant, "full")) link.socket.sendText("service", "改模型需要远程档「完整」，这条消息仍会发出。");
			else this.applyModel(agent, model, typeof effort === "string" ? effort : effort === null ? null : void 0);
		} else if (effort === null || typeof effort === "string") {
			if (!grantAtLeast(this.config.remoteGrant, "full")) link.socket.sendText("service", "改思考强度需要远程档「完整」，这条消息仍会发出。");
			else if (effort === null) {
				const current = this.currentModel(agent);
				if (current !== void 0) this.rememberModel(agent, {
					provider: current.provider,
					model: current.model
				});
			} else this.applyEffort(agent, effort);
		}
		if (typeof permissionMode === "string" && permissionMode !== "") this.applyPermission(agent, permissionMode, isCommand);
	}
	applyPhoneCatalog(dshId, meta) {
		if (!grantAtLeast(this.config.remoteGrant, "full")) return;
		const pick = catalogModelPick(meta);
		if (pick === void 0) return;
		const published = this.lastPublished.get(dshId);
		if (published === void 0 || sameCatalogPick(published, pick)) return;
		const link = this.links.get(dshId);
		const agent = link === void 0 ? void 0 : this.requireAgent(link);
		if (agent === void 0) return;
		if (pick.model !== void 0) {
			this.applyModel(agent, pick.model, pick.effort);
			return;
		}
		if (pick.effort === null) {
			const current = this.currentModel(agent);
			if (current !== void 0) this.rememberModel(agent, {
				provider: current.provider,
				model: current.model
			});
			return;
		}
		if (typeof pick.effort === "string") this.applyEffort(agent, pick.effort);
	}
	applyModel(agent, code, effort) {
		const split = splitModelCode(code);
		const current = this.currentModel(agent);
		const provider = split.provider === "" ? current?.provider ?? "" : split.provider;
		if (provider === "") return;
		const sameModel = current?.provider === provider && current.model === split.model;
		const reasoningEffort = effort === null ? void 0 : typeof effort === "string" ? ReasoningEffortId(effort) : sameModel ? current?.reasoningEffort : void 0;
		const next = {
			provider,
			model: split.model,
			...reasoningEffort === void 0 ? {} : { reasoningEffort }
		};
		this.rememberModel(agent, next);
	}
	applyEffort(agent, effort) {
		const current = this.currentModel(agent);
		if (current === void 0) return;
		this.rememberModel(agent, {
			...current,
			reasoningEffort: ReasoningEffortId(effort)
		});
	}
	/** Keep the last Host pick so Happy metadata can echo the web composer. */
	rememberModel(agent, next) {
		const previous = this.models.get(agent.id);
		this.models.set(agent.id, next);
		const selection = this.selections.get(agent);
		if (selection !== void 0) selection.current = next;
		if (sameModelOverride(previous, next)) return;
		this.syncHostSelection(agent, next);
	}
	/**
	* Write the web picker's Host selection (`sessionController.selectModel`) so
	* the composer model seat reloads without a click on the computer.
	*/
	async syncHostSelection(agent, next) {
		const controller = this.ctx.get("sessionController");
		if (controller === void 0) return;
		this.hostSelectFromPhone += 1;
		try {
			await controller.selectModel({
				sessionId: agent.id,
				provider: next.provider,
				model: next.model,
				...next.reasoningEffort === void 0 ? {} : { reasoningEffort: next.reasoningEffort }
			});
			const link = this.links.get(agent.id);
			if (link !== void 0 && !link.parked) this.pushMetadata(link);
		} catch (error) {
			this.log(`电脑模型栏未同步：${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.hostSelectFromPhone -= 1;
		}
	}
	/**
	* After the web picker (or any Host caller) lands a selection, publish it
	* to Happy. Phone-originated calls set {@link hostSelectFromPhone} and push themselves.
	*/
	onHostModelSelected(sessionId, selection) {
		if (this.hostSelectFromPhone) return;
		const next = {
			provider: selection.provider,
			model: selection.model,
			...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) }
		};
		this.models.set(sessionId, next);
		const link = this.links.get(sessionId);
		const agent = link?.agent;
		if (agent !== void 0) {
			const current = this.selections.get(agent);
			if (current !== void 0) current.current = next;
		}
		if (link !== void 0 && !link.parked) this.pushMetadata(link);
	}
	/**
	* Put a concrete reasoningEffort on a phone-spawned / phone-woken agent
	* before the first LLM request, matching the effort Happy metadata advertises.
	*/
	async ensurePinnedEffort(agent) {
		const current = this.currentModel(agent);
		if (current === void 0) return;
		const preferred = this.defaultModelSelection()?.reasoningEffort;
		let modelDefault;
		let supported;
		try {
			const reasoning = (await this.ctx.get("llm")?.resolveModelInfo(current.provider, current.model))?.reasoning;
			if (typeof reasoning?.defaultEffort === "string" && reasoning.defaultEffort !== "") modelDefault = reasoning.defaultEffort;
			if (reasoning?.efforts !== void 0 && reasoning.efforts.length > 0) supported = reasoning.efforts.map((effort) => effort.id);
		} catch {}
		const effort = pinWakeEffort(current.reasoningEffort, preferred, modelDefault, supported);
		if (effort === void 0 || effort === current.reasoningEffort) return;
		const next = {
			...current,
			reasoningEffort: ReasoningEffortId(effort)
		};
		this.models.set(agent.id, next);
		const selection = this.selections.get(agent);
		if (selection !== void 0) selection.current = next;
	}
	applyPermission(agent, mode, fromCommand) {
		const presets = this.ctx.get("permissionPresets");
		if (presets === void 0) return;
		const classified = classifyPermissionMode(mode, presets.names);
		if (classified.kind === "ignore" || classified.kind === "unknown") {
			this.links.get(agent.id)?.socket.sendText("service", `已忽略手机权限模式 "${mode}"（不是 dsh 预设）。消息仍会发出。`);
			return;
		}
		if (classified.preset === "danger-full-access" && !grantAtLeast(this.config.remoteGrant, "full")) {
			this.links.get(agent.id)?.socket.sendText("service", "改到 danger-full-access 需要远程档「完整」。");
			return;
		}
		if (!fromCommand && !grantAtLeast(this.config.remoteGrant, "full")) {
			this.links.get(agent.id)?.socket.sendText("service", "改权限预设需要远程档「完整」。");
			return;
		}
		try {
			presets.set(agent.session, classified.preset);
		} catch (error) {
			this.log(`切换权限预设失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/**
	* Queue the phone text as a user followup. The App already shows the typed
	* bubble; do not send a second user envelope. Images ride as DSH
	* attachments; other files land under `happy-inbox` for Harness `read`.
	*/
	async followup(link, agent, text, files) {
		const blocks = [];
		const { encoded, extras } = splitPendingFiles(files);
		const store = this.ctx.get("attachments");
		if (encoded.length > 0 && store !== void 0) try {
			const refs = await admitEncodedImages(store, encoded);
			for (const ref of refs) blocks.push({
				type: "image",
				attachment: ref
			});
		} catch (error) {
			this.log(`图片准入失败：${error instanceof Error ? error.message : String(error)}`);
			link.socket.sendText("service", `图片没能交给电脑：${error instanceof Error ? error.message : String(error)}`);
		}
		let prompt = text;
		if (extras.length > 0) prompt = inboxReadPrompt(text, await saveInboxFiles(agent.session.header.cwd ?? link.cwd, extras));
		if (prompt !== "") blocks.push({
			type: "text",
			text: prompt
		});
		if (blocks.length === 0) return;
		link.skipNextUser += 1;
		link.agent = agent;
		agent.followup(createUserMessage({
			content: blocks,
			source: { kind: "user" }
		}));
	}
	/**
	* Claim every download started before this text, wait, keep the successes.
	* Swap-then-await so a later file event cannot join this batch.
	*/
	async drainPhoneFiles(link) {
		const downloads = link.pendingDownloads;
		link.pendingDownloads = [];
		if (downloads.length === 0) return [];
		return (await Promise.all(downloads)).filter((file) => file !== void 0);
	}
	async downloadPhoneFile(link, message) {
		if (this.credentials === void 0) return void 0;
		try {
			const encrypted = await downloadEncryptedAttachment(this.config.serverUrl, this.credentials.token, link.socket.happySessionId, message.ref);
			const key = link.blobKey ?? await deriveBlobKey(link.crypto);
			link.blobKey = key;
			const bytes = decryptBlob(encrypted, key);
			if (bytes === null) {
				link.socket.sendText("service", `无法解密附件 ${message.name}`);
				return;
			}
			return {
				name: message.name,
				bytes,
				mimeType: message.mimeType ?? ""
			};
		} catch (error) {
			this.log(`下载附件失败：${error instanceof Error ? error.message : String(error)}`);
			link.socket.sendText("service", `下载附件失败：${message.name}`);
			return;
		}
	}
	onSessionEvent(link, event) {
		if (!takeForwardedSeq(link, event.seq)) return;
		if (event.type === "session/title") {
			this.pushMetadata(link);
			return;
		}
		if (event.type === "user/message") {
			const text = visibleUserText(event);
			const images = visibleUserImages(event);
			if (text === "" && images.length === 0) return;
			if (link.skipNextUser > 0) {
				link.skipNextUser -= 1;
				return;
			}
			this.queueOutboundUser(link, text, images, event.time);
			return;
		}
		if (event.type === "turn/start") {
			link.socket.startTurn();
			return;
		}
		if (event.type === "turn/end") {
			this.flushReasoning(link, event.time);
			const reason = event.data.reason;
			if (reason.kind === "error") {
				const message = reason.error.message.trim();
				if (message !== "") link.socket.sendText("service", `电脑没生成回复：${message}`, event.time);
			}
			const status = reason.kind === "error" ? "failed" : reason.kind === "aborted" || reason.kind === "interrupted" ? "cancelled" : "completed";
			link.socket.endTurn(status);
			return;
		}
		if (event.type === "assistant/chunk") {
			const chunk = event.data.chunk;
			if (chunk.type === "reasoning-delta" && typeof chunk.text === "string" && chunk.text !== "") {
				link.reasoning += chunk.text;
				this.pulseThink(link);
			}
			if (chunk.type === "block-end" && chunk.block.type === "reasoning" && typeof chunk.block.text === "string") {
				link.reasoning = chunk.block.text;
				this.pulseThink(link);
			}
			return;
		}
		if (event.type === "assistant/message") {
			const parts = assistantParts(event.data.message.content);
			if (!parts.some((part) => part.kind === "thinking")) this.flushReasoning(link, event.time);
			else link.reasoning = "";
			for (const part of parts) {
				if (part.kind === "thinking") {
					this.finishThink(link, part.text, event.time);
					continue;
				}
				if (part.kind === "text") {
					link.socket.sendText("text", part.text, event.time);
					continue;
				}
				this.startTool(link, part.call, part.name, part.args);
			}
			return;
		}
		if (event.type === "tool/call") {
			let args = {};
			try {
				args = JSON.parse(event.data.arguments);
			} catch {
				args = { raw: event.data.arguments };
			}
			this.startTool(link, event.data.callId, event.data.name, args);
			return;
		}
		if (event.type === "tool/result") link.socket.sendToolEnd(event.data.message.source.callId);
	}
	async onApproval(req, next) {
		const link = this.links.get(req.agent.id);
		if (link === void 0 || req.callId === void 0) return next();
		if (link.alwaysAllow.has(req.toolName)) return "allowed-once";
		if (!grantAtLeast(this.config.remoteGrant, "approve")) return next();
		const id = req.callId;
		const controller = new AbortController();
		req.signal = req.signal === void 0 ? controller.signal : AbortSignal.any([req.signal, controller.signal]);
		const args = req.reason === void 0 ? {} : { reason: req.reason };
		const card = happyTool(req.toolName, args);
		let resolvePhone = () => {};
		const phone = new Promise((resolve) => {
			resolvePhone = resolve;
		});
		link.pendingHuman = {
			kind: "approval",
			id,
			toolName: req.toolName,
			happyName: card.name,
			arguments: card.args,
			resolve: resolvePhone
		};
		this.pushRequests(link);
		link.socket.keepAliveNow(true);
		const web = next().then((outcome) => ({
			src: "web",
			outcome
		}), () => ({
			src: "web",
			outcome: "cancelled"
		}));
		const winner = await Promise.race([phone.then((outcome) => ({
			src: "phone",
			outcome
		})), web]);
		if (winner.src === "phone") controller.abort();
		if (winner.src === "web" && link.pendingHuman?.kind === "approval" && link.pendingHuman.id === id) {
			delete link.pendingHuman;
			this.clearRequest(link, id, winner.outcome === "allowed-once" ? "approved" : "canceled");
		}
		if (link.agent?.status === "running") link.socket.keepAliveNow(true);
		return winner.outcome;
	}
	onAsk(questions, original, request) {
		const agent = request.agent;
		const link = agent === void 0 ? void 0 : this.links.get(agent.id);
		if (link === void 0 || !grantAtLeast(this.config.remoteGrant, "approve")) return original.call(questions, request);
		const first = request.questions[0];
		const controller = new AbortController();
		const combined = request.signal === void 0 ? controller.signal : AbortSignal.any([request.signal, controller.signal]);
		const phone = new Promise((resolve, reject) => {
			if (first?.intent?.kind === "plan-review") {
				const id = `plan-${createLocalId()}`;
				const plan = first.detail ?? first.question;
				const decline = planReviewDeclineLabel(first);
				link.pendingHuman = {
					kind: "plan-review",
					id,
					resolve,
					reject,
					approveLabel: first.intent.approve,
					declineLabel: decline,
					questionId: first.id
				};
				link.socket.sendToolStart(id, "exit_plan_mode", { plan }, "审阅计划", "审阅计划");
				this.pushRequests(link);
				return;
			}
			const id = `ask-${createLocalId()}`;
			link.pendingHuman = {
				kind: "ask",
				id,
				resolve,
				reject,
				questions: request.questions.map((question) => ({
					id: question.id,
					question: question.question
				}))
			};
			link.socket.sendToolStart(id, "AskUserQuestion", { questions: request.questions.map((question) => ({
				question: question.question,
				header: question.header ?? question.question.slice(0, 24),
				options: (question.options ?? []).map((option) => ({
					label: option.label,
					description: option.description ?? ""
				})),
				multiSelect: question.multiSelect === true
			})) }, "需要你回答", "需要你回答");
			this.pushRequests(link);
		});
		const web = original.call(questions, {
			...request,
			signal: combined
		});
		return Promise.race([phone.then((answer) => {
			controller.abort();
			return answer;
		}, (error) => {
			controller.abort();
			throw error;
		}), web.then((answer) => {
			if (link.pendingHuman !== void 0) {
				this.clearRequest(link, link.pendingHuman.id, "canceled");
				link.socket.sendToolEnd(link.pendingHuman.id);
				delete link.pendingHuman;
			}
			return answer;
		})]);
	}
	/**
	* Happy App `sessionAbort` for Rig: empty params, RPC name `abort`.
	* Watch grant keeps the button from doing work; chat and above cancel the turn.
	*/
	onPhoneAbort(dshId) {
		if (!grantAtLeast(this.config.remoteGrant, "chat")) return;
		const link = this.links.get(dshId);
		const agent = link === void 0 ? void 0 : this.requireAgent(link);
		if (agent === void 0) return;
		agent.cancel({ kind: "user" });
	}
	onPermission(dshId, rpc) {
		const link = this.links.get(dshId);
		const pending = link?.pendingHuman;
		if (link === void 0 || pending === void 0 || pending.id !== rpc.id) return;
		if (pending.kind === "approval") {
			if (rpc.approved) {
				if (rpc.decision === "approved_for_session") link.alwaysAllow.add(pending.toolName);
				pending.resolve("allowed-once");
				this.clearRequest(link, rpc.id, "approved");
			} else {
				pending.resolve("rejected");
				this.clearRequest(link, rpc.id, "denied");
			}
			delete link.pendingHuman;
			return;
		}
		if (pending.kind === "plan-review") {
			const selected = rpc.approved ? pending.approveLabel : pending.declineLabel;
			pending.resolve({ answers: [{
				id: pending.questionId,
				selected: [selected]
			}] });
			this.clearRequest(link, rpc.id, rpc.approved ? "approved" : "denied");
			delete link.pendingHuman;
			link.socket.sendToolEnd(rpc.id);
			return;
		}
		if (!rpc.approved) {
			pending.reject(/* @__PURE__ */ new Error("ASK_ABORTED"));
			this.clearRequest(link, rpc.id, "denied");
			delete link.pendingHuman;
			link.socket.sendToolEnd(rpc.id);
			return;
		}
		const mapped = answersFromHappy(rpc.updatedInput?.answers, pending.questions);
		pending.resolve({ answers: mapped.map((row) => ({
			id: row.id,
			selected: row.selected
		})) });
		this.clearRequest(link, rpc.id, "approved");
		delete link.pendingHuman;
		link.socket.sendToolEnd(rpc.id);
	}
	pushRequests(link) {
		const pending = link.pendingHuman;
		const requests = {};
		if (pending !== void 0) {
			if (pending.kind === "approval") requests[pending.id] = {
				tool: pending.happyName,
				arguments: pending.arguments,
				createdAt: Date.now()
			};
			else if (pending.kind === "plan-review") requests[pending.id] = {
				tool: "exit_plan_mode",
				arguments: {},
				createdAt: Date.now()
			};
			else requests[pending.id] = {
				tool: "AskUserQuestion",
				arguments: {},
				createdAt: Date.now()
			};
		}
		link.socket.updateState({
			controlledByUser: grantAtLeast(this.config.remoteGrant, "chat"),
			requests
		});
	}
	clearRequest(link, id, status) {
		link.socket.updateState({
			controlledByUser: grantAtLeast(this.config.remoteGrant, "chat"),
			requests: {},
			completedRequests: { [id]: {
				status,
				completedAt: Date.now()
			} }
		});
	}
	async pushMetadata(link) {
		if (this.credentials === void 0) return;
		const workspace = this.workspaceFor(link.dshId, link.cwd);
		if (workspace === void 0) return;
		const events = this.linkEvents(link);
		const metadata = await buildSessionMetadata(this.ctx, {
			cwd: link.cwd,
			happyPath: workspace.virtualPath,
			events,
			...link.agent === void 0 ? {} : { agent: link.agent }
		}, this.credentials.machineId, sessionLabel(events), link.agent === void 0 ? void 0 : this.currentModel(link.agent), this.config.remoteGrant);
		link.socket.updateMetadata(metadata);
		const pick = catalogModelPick(metadata);
		if (pick === void 0) this.lastPublished.delete(link.dshId);
		else this.lastPublished.set(link.dshId, pick);
	}
	pushAllMetadata() {
		for (const link of this.links.values()) if (!link.parked) this.pushMetadata(link);
	}
	queueOutboundUser(link, text, images, time) {
		link.outboundTail = link.outboundTail.then(() => this.pushUserToPhone(link, text, images, time), () => this.pushUserToPhone(link, text, images, time));
	}
	/**
	* Upload web-side images with Happy CLI's encrypt-then-request-upload path,
	* then emit file events and any remaining user text.
	*/
	async pushUserToPhone(link, text, images, time) {
		for (const image of images) try {
			await this.uploadOutboundImage(link, image, time);
		} catch (error) {
			this.log(`电脑图片没能推到手机：${error instanceof Error ? error.message : String(error)}`);
			link.socket.sendText("service", `电脑这张图没能发到手机：${image.name ?? "image"}`, time);
		}
		if (text !== "") link.socket.sendUser(text, time);
	}
	async uploadOutboundImage(link, image, time) {
		const credentials = this.credentials;
		const store = this.ctx.get("attachments");
		if (credentials === void 0 || store === void 0) throw new Error("没有附件存储或 Happy 凭据");
		const stored = await store.readImage(image);
		const key = link.blobKey ?? await deriveBlobKey(link.crypto);
		link.blobKey = key;
		const encrypted = encryptBlob(stored.data, key);
		const name = image.name ?? `image.${extensionForMime(image.mediaType)}`;
		const ref = await uploadEncryptedAttachment(this.config.serverUrl, credentials.token, link.socket.happySessionId, name, encrypted);
		link.socket.sendFile({
			ref,
			name,
			size: stored.data.byteLength,
			mimeType: image.mediaType
		}, time);
	}
	async replayHistory(link) {
		const items = historyItems(this.linkEvents(link));
		if (items.length === 0) return;
		link.replaying = true;
		try {
			await this.emitHistory(link, items);
		} finally {
			link.replaying = false;
		}
		this.log(`已把 ${items.length} 条历史写入 Happy 会话 ${link.socket.happySessionId}`);
	}
	async emitHistory(link, items) {
		for (const item of items) {
			if (item.kind === "turn-start") {
				link.socket.startTurn(item.time);
				continue;
			}
			if (item.kind === "turn-end") {
				link.socket.endTurn(item.status, item.time);
				continue;
			}
			if (item.kind === "user") {
				await this.pushUserToPhone(link, item.text, item.images, item.time);
				continue;
			}
			if (item.kind === "assistant") {
				link.socket.sendText("text", item.text, item.time);
				continue;
			}
			if (item.kind === "tool-start") {
				link.socket.sendToolStart(item.call, item.name, item.args, item.title, item.description, item.time);
				continue;
			}
			link.socket.sendToolEnd(item.call, item.time);
		}
	}
	pulseThink(link) {
		if (link.reasoning.trim() === "") return;
		const now = Date.now();
		const label = thinkLabel(link.reasoning);
		if (link.thinkCall === void 0) {
			link.thinkCall = createLocalId();
			link.thinkBodySent = false;
			link.thinkLastEmit = now;
			link.socket.sendToolStart(link.thinkCall, THINK_TOOL_NAME, { text: link.reasoning }, "Think", label);
			return;
		}
		if (now - link.thinkLastEmit < 200) return;
		link.thinkLastEmit = now;
		link.socket.sendToolStart(link.thinkCall, THINK_TOOL_NAME, { text: link.reasoning }, "Think", label);
	}
	flushReasoning(link, time) {
		const text = link.reasoning;
		link.reasoning = "";
		this.finishThink(link, text, time);
	}
	finishThink(link, text, time) {
		const body = text.trim();
		if (body === "") {
			if (link.thinkCall !== void 0) {
				link.socket.sendToolEnd(link.thinkCall, time);
				delete link.thinkCall;
				link.thinkBodySent = false;
			}
			return;
		}
		const call = link.thinkCall ?? createLocalId();
		const card = thinkCard(body);
		link.socket.sendToolStart(call, card.name, card.args, card.title, card.description, time);
		link.socket.sendToolEnd(call, time);
		delete link.thinkCall;
		link.thinkBodySent = false;
		link.thinkLastEmit = 0;
	}
	startTool(link, call, name, args) {
		if (call === "" || link.startedCalls.has(call)) return;
		link.startedCalls.add(call);
		const card = happyTool(name, args);
		link.socket.sendToolStart(call, card.name, card.args, card.title, card.description);
	}
	currentModel(agent) {
		const override = this.models.get(agent.id);
		const logged = agent.session.requestHeader()?.config;
		const resolved = wakeModelSelection(override, logged === void 0 ? void 0 : {
			provider: logged.provider,
			model: logged.model,
			...logged.reasoningEffort === void 0 ? {} : { reasoningEffort: logged.reasoningEffort }
		}, this.defaultModelSelection());
		if (resolved === void 0) return void 0;
		return {
			provider: resolved.provider,
			model: resolved.model,
			...resolved.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(resolved.reasoningEffort) }
		};
	}
};
function lastEventSeq(events) {
	let max = -1;
	for (const event of events) if (typeof event.seq === "number" && event.seq > max) max = event.seq;
	return max;
}
function takeForwardedSeq(link, seq) {
	if (seq <= link.lastForwardedSeq) return false;
	link.lastForwardedSeq = seq;
	return true;
}
function withTimeout(promise, ms, message) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(message));
		}, ms);
		promise.then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
function createLocalId() {
	return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}
function extensionForMime(mediaType) {
	if (mediaType === "image/jpeg") return "jpg";
	if (mediaType === "image/gif") return "gif";
	if (mediaType === "image/webp") return "webp";
	return "png";
}
//#endregion
//#region lib/types/remote.js
/** Typert Remote for the settings card: pairing status, start, disconnect. */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Host RPC the browser settings card calls.
*/
let HappyBridgeService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _getStatus_decorators;
	let _startPairing_decorators;
	let _disconnect_decorators;
	let _rePair_decorators;
	return class HappyBridgeService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_getStatus_decorators = [Remote("getStatus")];
			_startPairing_decorators = [Remote("startPairing")];
			_disconnect_decorators = [Remote("disconnect")];
			_rePair_decorators = [Remote("rePair")];
			__esDecorate(this, null, _getStatus_decorators, {
				kind: "method",
				name: "getStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "getStatus" in obj,
					get: (obj) => obj.getStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _startPairing_decorators, {
				kind: "method",
				name: "startPairing",
				static: false,
				private: false,
				access: {
					has: (obj) => "startPairing" in obj,
					get: (obj) => obj.startPairing
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _disconnect_decorators, {
				kind: "method",
				name: "disconnect",
				static: false,
				private: false,
				access: {
					has: (obj) => "disconnect" in obj,
					get: (obj) => obj.disconnect
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _rePair_decorators, {
				kind: "method",
				name: "rePair",
				static: false,
				private: false,
				access: {
					has: (obj) => "rePair" in obj,
					get: (obj) => obj.rePair
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		/** Live bridge; swapped when settings rebuild. */
		live = __runInitializers(this, _instanceExtraInitializers);
		/**
		* @param ctx - Host context.
		*/
		constructor(ctx) {
			super(ctx, "happyBridge");
		}
		/**
		* Current pairing / connection snapshot, including a QR data URL while pairing.
		* @returns status for the settings card.
		*/
		async getStatus() {
			if (this.live === void 0) return {
				paired: false,
				pairing: false,
				serverUrl: ""
			};
			return this.live.status();
		}
		/**
		* Start or resume pairing.
		*/
		async startPairing() {
			await this.live?.beginPairing();
			return this.getStatus();
		}
		/**
		* Disconnect Happy. The web UI keeps running.
		*/
		async disconnect() {
			await this.live?.disconnect();
			return this.getStatus();
		}
		/**
		* Drop the current login and start a fresh QR pairing.
		*/
		async rePair() {
			await this.live?.rePair();
			return this.getStatus();
		}
	};
})();
//#endregion
//#region lib/types/index.js
/**
* Host half of Happy remote control: pair a running dsh web/desktop client
* with Happy App so the phone drives the same harness sessions.
* @module @sjhmars/happy-bridge
*/
/** Cordis plugin name. */
const name = "happy-bridge";
/** Settings namespace keyed by the Plugins tab card. */
const HAPPY_BRIDGE_NS = settingsNamespace("happy-bridge");
/** Wait for the agent registry before mirroring sessions. */
const inject = ["agents"];
/** Validated plugin config. Illegal values fail at load. */
const Config = Schema.object({
	enabled: Schema.boolean().default(true),
	serverUrl: Schema.string().default("https://api.cluster-fluster.com"),
	appUrl: Schema.string().default("https://app.happy.engineering"),
	credentialDir: Schema.string().default(""),
	pairOnStart: Schema.boolean().default(true),
	remoteGrant: Schema.union([
		Schema.const("watch"),
		Schema.const("chat"),
		Schema.const("approve"),
		Schema.const("full")
	]).default("approve")
});
/**
* Mount the Host half: settings namespace, Typert Remote, Happy relay.
* @param ctx - Host context.
* @param config - composition entry config.
*/
function apply(ctx, config) {
	const service = new HappyBridgeService(ctx);
	let source = () => config;
	const rebuild = () => {
		service.live?.dispose();
		const current = source();
		if (!current.enabled) {
			service.live = void 0;
			ctx.logger.info("happy-bridge: 已关闭");
			return;
		}
		const bridge = new HappyBridge(ctx, current, (message) => ctx.logger.info(`happy-bridge: ${message}`));
		service.live = bridge;
		bridge.start().catch((error) => {
			ctx.logger.warn(`happy-bridge: 启动失败 ${error instanceof Error ? error.message : String(error)}`);
		});
	};
	installSettingsSection(ctx, HAPPY_BRIDGE_NS, Config, config, {
		setSource: (current) => {
			source = current;
		},
		onChange: () => {
			const current = source();
			if (service.live?.acceptSettings(current) === true) return;
			rebuild();
		}
	});
	ctx.effect(() => {
		rebuild();
		return () => {
			service.live?.dispose();
			service.live = void 0;
		};
	}, "happy-bridge: runtime");
}
//#endregion
export { Config, HAPPY_BRIDGE_NS, apply, inject, name };
