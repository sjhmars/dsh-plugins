/** Happy terminal pairing: POST /v1/auth/request, QR URL, poll until authorized. */
import nacl from 'tweetnacl';
import QRCode from 'qrcode';
import { decodeBase64, encodeBase64 } from "./bytes.js";
import { decryptWithEphemeralKey } from "./encryption.js";
import { happyFetch } from "./http.js";
/**
 * Start one terminal auth request and poll until authorized.
 * @param serverUrl - Happy API origin.
 * @param appUrl - Happy App origin for the web URL.
 * @returns URLs plus a promise that settles on success or abort.
 */
export async function startPairing(serverUrl, appUrl) {
    const secret = nacl.randomBytes(32);
    const keypair = nacl.box.keyPair.fromSecretKey(secret);
    const publicKeyB64 = encodeBase64(keypair.publicKey);
    await happyFetch(serverUrl, '/v1/auth/request', {
        method: 'POST',
        body: { publicKey: publicKeyB64, supportsV2: false },
    });
    const mobileUrl = `happy://terminal?${encodeBase64(keypair.publicKey, 'base64url')}`;
    const webUrl = `${trimSlash(appUrl)}/terminal/connect#key=${encodeBase64(keypair.publicKey, 'base64url')}`;
    const qrDataUrl = await QRCode.toDataURL(mobileUrl, { margin: 1, width: 240 });
    const abort = new AbortController();
    const done = pollAuthorized(serverUrl, publicKeyB64, keypair.secretKey, abort.signal);
    return {
        mobileUrl,
        webUrl,
        qrDataUrl,
        abort: () => abort.abort(),
        done,
    };
}
async function pollAuthorized(serverUrl, publicKeyB64, secretKey, signal) {
    while (!signal.aborted) {
        const json = await happyFetch(serverUrl, '/v1/auth/request', {
            method: 'POST',
            body: { publicKey: publicKeyB64, supportsV2: false },
        });
        const record = asRecord(json);
        if (record.state === 'authorized' && typeof record.token === 'string' && typeof record.response === 'string') {
            const decrypted = decryptWithEphemeralKey(decodeBase64(record.response), secretKey);
            if (decrypted === null)
                throw new Error('无法解密配对响应');
            if (decrypted.length === 32) {
                return { token: record.token, encryption: { type: 'legacy', secret: decrypted } };
            }
            if (decrypted[0] === 0 && decrypted.length >= 33) {
                return {
                    token: record.token,
                    encryption: {
                        type: 'dataKey',
                        publicKey: decrypted.slice(1, 33),
                        machineKey: nacl.randomBytes(32),
                    },
                };
            }
            throw new Error('配对响应格式无法识别');
        }
        await sleep(1000, signal);
    }
    throw new Error('配对已取消');
}
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('配对已取消'));
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
function trimSlash(url) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}
function asRecord(value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return {};
}
//# sourceMappingURL=pairing.js.map