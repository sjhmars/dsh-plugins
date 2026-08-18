/** Locale namespace owned by the editor launcher browser half. */
export const NS = 'editor-launcher'

/** Simplified-Chinese editor launcher strings. */
export const zh = {
  'trigger.default': '用编辑器打开',
  'trigger.preferred': '用 {name} 打开',
  'menu.editors': '编辑器',
  'menu.noEditors': '未检测到已安装的编辑器',
  'menu.refresh': '重新检测编辑器',
  'open.failed': '打开失败：{error}',
} as const

/** English editor launcher strings. */
export const en: Record<keyof typeof zh, string> = {
  'trigger.default': 'Open with editor',
  'trigger.preferred': 'Open with {name}',
  'menu.editors': 'Editors',
  'menu.noEditors': 'No installed editors detected',
  'menu.refresh': 'Re-detect editors',
  'open.failed': 'Failed to open: {error}',
}

/** Stable locale keys consumed by the picker component. */
export type EditorLauncherKey = keyof typeof zh
