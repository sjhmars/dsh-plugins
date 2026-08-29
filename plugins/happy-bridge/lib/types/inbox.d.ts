/** Save phone non-image files into the session workspace so Harness `read` can open them. */
import type { PendingFile } from './types.ts';
/** Directory under the session cwd that holds phone files for `read`. */
export declare const HAPPY_INBOX_DIR = "happy-inbox";
/**
 * Strip path separators and reserved characters so the file stays inside `happy-inbox/`.
 * @param name - Happy's original filename.
 * @returns a single path segment, or `file` when nothing usable remains.
 */
export declare function sanitizeInboxName(name: string): string;
/**
 * Pick a basename that is not already taken in this inbox (on disk or in this batch).
 * @param taken - basenames already used.
 * @param name - Happy's original filename.
 * @returns a unique basename under `happy-inbox/`.
 */
export declare function uniqueInboxName(taken: ReadonlySet<string>, name: string): string;
/**
 * Workspace-relative path the `read` tool resolves against session cwd. Always `/`.
 * @param filename - a sanitized inbox basename.
 * @returns `happy-inbox/<filename>`.
 */
export declare function inboxReadPath(filename: string): string;
/**
 * Append a `read`-tool instruction after the user's typed text.
 * Harness web does not admit non-image composer uploads; ordinary files are workspace paths for `read`.
 * @param text - what the phone typed, possibly empty.
 * @param relativePaths - `happy-inbox/...` paths already written.
 * @returns the followup text, or `text` when there are no files.
 */
export declare function inboxReadPrompt(text: string, relativePaths: readonly string[]): string;
/**
 * Write extras into `<cwd>/happy-inbox/` and return relative paths for `read`.
 * @param cwd - session workspace root.
 * @param files - decrypted non-image attachments.
 * @returns posix-relative paths the model should pass to `read`.
 */
export declare function saveInboxFiles(cwd: string, files: readonly PendingFile[]): Promise<string[]>;
//# sourceMappingURL=inbox.d.ts.map