/** Localized installer copy. */
export declare const NS = "plugin-install";
/** Simplified Chinese. */
export declare const zh: {
    readonly title: "用包名安装";
    readonly hint: "支持 npm 插件和普通组件，可带 @版本。写入当前 {profile} profile，安装后重启应用。";
    readonly placeholder: "@scope/package";
    readonly install: "安装";
    readonly installing: "正在安装…";
    readonly restart: "安装完成，请重启应用后生效。";
    readonly dependencyRestart: "组件已安装，请重启应用。已配置的组件更新后生效；首次安装还需在配置文件中启用。";
    readonly bundleDisabled: "安装完成，该插件仍处于停用状态。请在 Plugins 页启用后重启应用。";
    readonly failure: "安装未完成";
};
/** English. */
export declare const en: Record<keyof typeof zh, string>;
/** Dictionary keys. */
export type PluginInstallKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map