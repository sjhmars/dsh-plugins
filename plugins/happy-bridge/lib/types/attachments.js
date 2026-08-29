/** Phone file events: sniff image bytes and split them from other attachments. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/**
 * Detect a DSH image media type from magic bytes, then declared MIME, then filename.
 * @param file - decrypted Happy attachment.
 * @returns a version-one image media type, or `undefined` for other files.
 */
export function sniffImageMime(file) {
    const fromBytes = mimeFromMagic(file.bytes);
    if (fromBytes !== undefined)
        return fromBytes;
    if (IMAGE_TYPES.has(file.mimeType))
        return file.mimeType;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return 'image/jpeg';
    if (lower.endsWith('.webp'))
        return 'image/webp';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    return undefined;
}
/**
 * Split decrypted Happy files into DSH image uploads and leftover binaries.
 * @param files - drained phone attachments in arrival order.
 * @returns encoded images plus non-image files.
 */
export function splitPendingFiles(files) {
    const encoded = [];
    const extras = [];
    for (const file of files) {
        const mime = sniffImageMime(file);
        if (mime === undefined) {
            extras.push(file);
            continue;
        }
        encoded.push({
            mediaType: mime,
            data: Buffer.from(file.bytes).toString('base64'),
            name: file.name,
        });
    }
    return { encoded, extras };
}
function mimeFromMagic(bytes) {
    if (bytes.length >= 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
        return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (bytes.length >= 6
        && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
        && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
        return 'image/gif';
    }
    if (bytes.length >= 12
        && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
    }
    return undefined;
}
//# sourceMappingURL=attachments.js.map