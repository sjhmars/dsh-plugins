/** Browser-side persistence of the preferred editor choice. */
/** The remembered editor: stable id plus its display name for the capsule label. */
export interface PreferredEditor {
    readonly id: string;
    readonly name: string;
}
/** Read the remembered editor, or undefined when unset or storage is unavailable. */
export declare function readPreferred(): PreferredEditor | undefined;
/** Remember one editor as the default, name included for label rendering. */
export declare function writePreferred(editor: PreferredEditor): void;
//# sourceMappingURL=preference.d.ts.map