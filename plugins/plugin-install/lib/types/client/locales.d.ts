/** 安装页文案。 */
export declare const NS = "plugin-install";
/** 简体中文。 */
export declare const zh: {
    readonly tab: "安装插件";
    readonly title: "用包名安装";
    readonly hint: "只填 npm 包名（可带 @版本），例如 @sjhmars/task-notify 或 @sjhmars/task-notify@0.2.0。写入 {profile} profile（网页版是 web，桌面客户端是 desktop；两边互不相通）。装完或换版本都会热挂载，刷新页面即可；更新本安装器自己需重启。";
    readonly placeholder: "@scope/package";
    readonly install: "安装";
    readonly installing: "正在安装…";
    readonly success: "安装成功，已热挂载；界面部分刷新页面即可。";
    readonly failure: "安装失败";
};
/** English copy. */
export declare const en: Record<keyof typeof zh, string>;
export type PluginInstallKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map