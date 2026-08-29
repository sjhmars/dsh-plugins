/** Phone file events: sniff image bytes and split them from other attachments. */
import type { EncodedImageAttachment, ImageMediaType } from '@deepseek-ai/dsh-attachment/types';
import type { PendingFile } from './types.ts';
/**
 * Detect a DSH image media type from magic bytes, then declared MIME, then filename.
 * @param file - decrypted Happy attachment.
 * @returns a version-one image media type, or `undefined` for other files.
 */
export declare function sniffImageMime(file: PendingFile): ImageMediaType | undefined;
/**
 * Split decrypted Happy files into DSH image uploads and leftover binaries.
 * @param files - drained phone attachments in arrival order.
 * @returns encoded images plus non-image files.
 */
export declare function splitPendingFiles(files: readonly PendingFile[]): {
    encoded: EncodedImageAttachment[];
    extras: PendingFile[];
};
//# sourceMappingURL=attachments.d.ts.map