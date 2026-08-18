/** Locale namespace owned by the editor launcher browser half. */
export declare const NS = "editor-launcher";
/** Simplified-Chinese editor launcher strings. */
export declare const zh: {
    readonly 'trigger.default': "用编辑器打开";
    readonly 'trigger.preferred': "用 {name} 打开";
    readonly 'menu.editors': "编辑器";
    readonly 'menu.noEditors': "未检测到已安装的编辑器";
    readonly 'menu.refresh': "重新检测编辑器";
    readonly 'open.failed': "打开失败：{error}";
};
/** English editor launcher strings. */
export declare const en: Record<keyof typeof zh, string>;
/** Stable locale keys consumed by the picker component. */
export type EditorLauncherKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map