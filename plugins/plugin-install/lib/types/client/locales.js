/** 安装页文案。 */
export const NS = 'plugin-install';
/** 简体中文。 */
export const zh = {
    tab: '安装插件',
    title: '用包名安装',
    hint: '只填 npm 包名（可带 @版本），例如 @sjhmars/task-notify 或 @sjhmars/task-notify@0.2.0。写入 {profile} profile（网页版是 web，桌面客户端是 desktop；两边互不相通）。装完或换版本都会热挂载，刷新页面即可；更新本安装器自己需重启。',
    placeholder: '@scope/package',
    install: '安装',
    installing: '正在安装…',
    success: '安装成功，已热挂载；界面部分刷新页面即可。',
    failure: '安装失败',
};
/** English copy. */
export const en = {
    tab: 'Install plugin',
    title: 'Install by package name',
    hint: 'npm package name only, optionally with @version — for example @sjhmars/task-notify or @sjhmars/task-notify@0.2.0. Writes the {profile} profile (browser = web, desktop client = desktop; they do not share plugins). Installs and version updates hot-mount; refresh the page. Updating this installer itself needs a restart.',
    placeholder: '@scope/package',
    install: 'Install',
    installing: 'Installing…',
    success: 'Installed and hot-mounted; refresh the page for its UI.',
    failure: 'Install failed',
};
//# sourceMappingURL=locales.js.map