/** 安装页文案。 */
export const NS = 'plugin-install'

/** 简体中文。 */
export const zh = {
  tab: '安装插件',
  title: '用包名安装',
  hint: '只填 npm 包名，例如 @sjhmars/task-notify。写入 {profile} profile（网页版是 web，桌面客户端是 desktop；两边互不相通）。装完请重启。',
  placeholder: '@scope/package',
  install: '安装',
  installing: '正在安装…',
  success: '安装成功，请重启后生效。',
  failure: '安装失败',
} as const

/** English copy. */
export const en: Record<keyof typeof zh, string> = {
  tab: 'Install plugin',
  title: 'Install by package name',
  hint: 'npm package name only, for example @sjhmars/task-notify. Writes the {profile} profile (browser = web, desktop client = desktop; they do not share plugins). Restart afterwards.',
  placeholder: '@scope/package',
  install: 'Install',
  installing: 'Installing…',
  success: 'Installed. Restart the client to load it.',
  failure: 'Install failed',
}

export type PluginInstallKey = keyof typeof zh
