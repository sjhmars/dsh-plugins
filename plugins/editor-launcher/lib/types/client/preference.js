/** Browser-side persistence of the preferred editor choice. */
const PREFERRED_KEY = 'dsh.editor-launcher.preferred';
/** Read the remembered editor, or undefined when unset or storage is unavailable. */
export function readPreferred() {
    try {
        const raw = localStorage.getItem(PREFERRED_KEY);
        if (raw === null || raw === '')
            return undefined;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return undefined;
        const record = parsed;
        if (typeof record.id !== 'string' || record.id === '')
            return undefined;
        if (typeof record.name !== 'string')
            return undefined;
        return { id: record.id, name: record.name };
    }
    catch {
        // Storage unavailable (private mode / restricted origin), or a legacy
        // plain-id value from an earlier build: the choice simply does not
        // persist, and the picker falls back to the default label.
        return undefined;
    }
}
/** Remember one editor as the default, name included for label rendering. */
export function writePreferred(editor) {
    try {
        localStorage.setItem(PREFERRED_KEY, JSON.stringify(editor));
    }
    catch {
        // Same availability contract as readPreferred: persistence is best-effort.
    }
}
//# sourceMappingURL=preference.js.map