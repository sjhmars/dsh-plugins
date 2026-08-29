/** Load and store Happy credentials. Prefer `~/.happy/access.key`, else plugin dir. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { decodeBase64, encodeBase64 } from "./bytes.js";
/**
 * Resolve the plugin credential directory.
 * @param configured - Config.credentialDir; empty means the default under home.
 * @returns absolute directory path.
 */
export function resolveCredentialDir(configured) {
    if (configured.trim() !== '') {
        return isAbsolute(configured) ? configured : join(homedir(), configured);
    }
    return join(homedir(), '.dsh', 'happy-bridge');
}
/**
 * Load credentials: Happy CLI file first, then this plugin's file.
 * @param credentialDir - plugin directory.
 * @returns credentials, or `undefined` when nothing usable is on disk.
 */
export async function loadCredentials(credentialDir) {
    const state = await readState(credentialDir);
    if (state.disconnected === true)
        return undefined;
    const happyHome = await readAccessKey(join(homedir(), '.happy', 'access.key'));
    if (happyHome !== undefined) {
        return { ...happyHome, machineId: state.machineId ?? happyHome.machineId };
    }
    return readAccessKey(join(credentialDir, 'access.key'));
}
/**
 * Persist credentials in the plugin directory. Does not overwrite `~/.happy/access.key`.
 * @param credentialDir - plugin directory.
 * @param credentials - token + encryption + machineId.
 */
export async function saveCredentials(credentialDir, credentials) {
    await mkdir(credentialDir, { recursive: true });
    const body = {
        token: credentials.token,
        machineId: credentials.machineId,
    };
    if (credentials.encryption.type === 'legacy') {
        body.secret = encodeBase64(credentials.encryption.secret);
    }
    else {
        body.encryption = {
            publicKey: encodeBase64(credentials.encryption.publicKey),
            machineKey: encodeBase64(credentials.encryption.machineKey),
        };
    }
    await writeFile(join(credentialDir, 'access.key'), JSON.stringify(body, null, 2), 'utf8');
    await writeState(credentialDir, { disconnected: false, machineId: credentials.machineId });
}
/**
 * Mark the plugin disconnected without deleting Happy CLI credentials.
 * Clears phone-dismissed ids so a later pair remirrors those sessions.
 * @param credentialDir - plugin directory.
 * @param machineId - last known machine id to keep stable.
 */
export async function markDisconnected(credentialDir, machineId) {
    await mkdir(credentialDir, { recursive: true });
    await writeState(credentialDir, {
        disconnected: true,
        ...(machineId === undefined ? {} : { machineId }),
        dismissedDshIds: [],
    });
}
/**
 * Clear the local disconnected flag so existing credentials can be reused.
 * @param credentialDir - plugin directory.
 * @param machineId - machine id to keep.
 */
export async function markConnected(credentialDir, machineId) {
    await mkdir(credentialDir, { recursive: true });
    await writeState(credentialDir, { disconnected: false, machineId });
}
/**
 * Last stored machine id, even when locally disconnected.
 * @param credentialDir - plugin directory.
 * @returns machine id, or `undefined`.
 */
export async function peekMachineId(credentialDir) {
    const state = await readState(credentialDir);
    return state.machineId;
}
/**
 * Session ids the phone asked to stop mirroring. stop-session / archive
 * persist here so a later scan does not recreate the Happy row.
 * @param credentialDir - plugin directory.
 * @returns harness session ids, possibly empty.
 */
export async function loadDismissed(credentialDir) {
    return (await readState(credentialDir)).dismissedDshIds;
}
/**
 * Forget a previously dismissed harness session so it can remirror.
 * @param credentialDir - plugin directory.
 * @param dshId - harness session id.
 */
export async function removeDismissed(credentialDir, dshId) {
    const state = await readState(credentialDir);
    if (!state.dismissedDshIds.includes(dshId))
        return;
    await writeState(credentialDir, {
        disconnected: state.disconnected,
        ...(state.machineId === undefined ? {} : { machineId: state.machineId }),
        dismissedDshIds: state.dismissedDshIds.filter(id => id !== dshId),
    });
}
/**
 * Remember that the phone dismissed this harness session.
 * @param credentialDir - plugin directory.
 * @param dshId - harness session id.
 */
export async function addDismissed(credentialDir, dshId) {
    const state = await readState(credentialDir);
    if (state.dismissedDshIds.includes(dshId))
        return;
    await writeState(credentialDir, {
        disconnected: state.disconnected,
        ...(state.machineId === undefined ? {} : { machineId: state.machineId }),
        dismissedDshIds: [...state.dismissedDshIds, dshId],
    });
}
async function readAccessKey(path) {
    let raw;
    try {
        raw = await readFile(path, 'utf8');
    }
    catch {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return undefined;
    }
    if (typeof parsed.token !== 'string' || parsed.token === '')
        return undefined;
    const machineId = typeof parsed.machineId === 'string' && parsed.machineId !== ''
        ? parsed.machineId
        : crypto.randomUUID();
    if (typeof parsed.secret === 'string' && parsed.secret !== '') {
        return {
            token: parsed.token,
            encryption: { type: 'legacy', secret: decodeBase64(parsed.secret) },
            machineId,
        };
    }
    const publicKey = parsed.encryption?.publicKey;
    const machineKey = parsed.encryption?.machineKey;
    if (typeof publicKey === 'string' && typeof machineKey === 'string') {
        return {
            token: parsed.token,
            encryption: {
                type: 'dataKey',
                publicKey: decodeBase64(publicKey),
                machineKey: decodeBase64(machineKey),
            },
            machineId,
        };
    }
    return undefined;
}
async function readState(credentialDir) {
    try {
        const raw = await readFile(join(credentialDir, 'state.json'), 'utf8');
        const parsed = JSON.parse(raw);
        return {
            disconnected: parsed.disconnected === true,
            ...(typeof parsed.machineId === 'string' ? { machineId: parsed.machineId } : {}),
            dismissedDshIds: stringList(parsed.dismissedDshIds),
        };
    }
    catch {
        return { disconnected: false, dismissedDshIds: [] };
    }
}
async function writeState(credentialDir, state) {
    const previous = await readState(credentialDir);
    const dismissed = state.dismissedDshIds ?? previous.dismissedDshIds;
    await writeFile(join(credentialDir, 'state.json'), JSON.stringify({
        disconnected: state.disconnected,
        ...(state.machineId === undefined && previous.machineId === undefined
            ? {}
            : { machineId: state.machineId ?? previous.machineId }),
        ...(dismissed.length === 0 ? {} : { dismissedDshIds: dismissed }),
    }, null, 2), 'utf8');
}
function stringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item !== '');
}
//# sourceMappingURL=credentials.js.map