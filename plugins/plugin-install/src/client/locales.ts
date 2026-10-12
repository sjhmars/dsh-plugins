/** Localized installer copy. */
export const NS = 'plugin-install'
/** Simplified Chinese. */
export const zh = {
  title: '用包名安装',
  hint: '支持 npm 插件和普通组件，可带 @版本。写入当前 {profile} profile，安装后重启应用。',
  placeholder: '@scope/package',
  install: '安装',
  installing: '正在安装…',
  restart: '安装完成，请重启应用后生效。',
  dependencyRestart: '组件已安装，请重启应用。已配置的组件更新后生效；首次安装还需在配置文件中启用。',
  bundleDisabled: '安装完成，该插件仍处于停用状态。请在 Plugins 页启用后重启应用。',
  failure: '安装未完成',
} as const
/** English. */
export const en: Record<keyof typeof zh, string> = {
  title: 'Install by package name',
  hint: 'Install npm plugins and components, optionally with @version. Uses the current {profile} profile. Restart the application after installation.',
  placeholder: '@scope/package',
  install: 'Install',
  installing: 'Installing…',
  restart: 'Installed. Restart the application to apply it.',
  dependencyRestart: 'Component installed. Restart the application. Configured components then use the update; a new component also needs a plugin entry in the configuration file.',
  bundleDisabled: 'Installed; this plugin remains disabled. Enable it on the Plugins page, then restart the application.',
  failure: 'Installation did not complete',
}
/** Dictionary keys. */
export type PluginInstallKey = keyof typeof zh
