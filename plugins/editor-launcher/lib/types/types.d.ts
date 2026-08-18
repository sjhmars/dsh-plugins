/** Wire vocabulary shared by the Host and Browser halves of the editor launcher. */
/** One detected editor the Host can launch. */
export interface EditorInfo {
    /** Stable id used by {@link OpenResult}-producing calls. */
    id: string;
    /** Human-facing editor name. */
    name: string;
    /** Resolved executable (absolute path, or a PATH-resolvable command). */
    command: string;
    /** Fixed arguments passed before the file path. */
    args?: string[];
}
/** Outcome of a launch attempt. */
export type OpenResult = {
    ok: true;
} | {
    ok: false;
    error: string;
};
//# sourceMappingURL=types.d.ts.map