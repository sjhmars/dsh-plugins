/** Locale namespace owned by the Happy remote settings card. */
export const NS = 'happy-bridge'

/** Simplified-Chinese copy. */
export const zh = {
  'title': 'Happy 远程',
  'description': '用手机 Happy App 遥控已经在跑的对话。',
  'expand': '展开',
  'collapse': '收起',
  'status.unpaired': '还没配对',
  'status.pairing': '等待手机扫码…请在 Happy App 里扫，不要用系统相机。',
  'status.paired': '已连接到 Happy',
  'status.linked': '已接通对话',
  'qr.alt': 'Happy 配对二维码',
  'copy.mobile': '复制手机链接',
  'copy.web': '复制网页链接',
  'copied': '已复制',
  'start': '开始配对',
  'repair': '重新配对',
  'disconnect': '断开',
  'grant': '手机能管多深',
  'grant.watch': '只看',
  'grant.chat': '能聊',
  'grant.approve': '能批',
  'grant.full': '完整',
  'grant.hint': '改成「完整」后，手机换模型和思考强度会同步到电脑。电脑上换也会同步到手机。',
  'readOnly': '这份设置现在不能改。',
  'enabled': '启用',
  'error': '出错',
} as const

/** English copy. */
export const en: Record<keyof typeof zh, string> = {
  'title': 'Happy remote',
  'description': 'Let Happy App on your phone drive the same running conversations.',
  'expand': 'Expand',
  'collapse': 'Collapse',
  'status.unpaired': 'Not paired',
  'status.pairing': 'Waiting for a scan inside Happy App — not the OS camera.',
  'status.paired': 'Connected to Happy',
  'status.linked': 'Linked sessions',
  'qr.alt': 'Happy pairing QR code',
  'copy.mobile': 'Copy phone link',
  'copy.web': 'Copy web link',
  'copied': 'Copied',
  'start': 'Start pairing',
  'repair': 'Pair again',
  'disconnect': 'Disconnect',
  'grant': 'How far the phone may control',
  'grant.watch': 'Watch',
  'grant.chat': 'Chat',
  'grant.approve': 'Approve',
  'grant.full': 'Full',
  'grant.hint': 'On Full, a phone model or thinking-effort switch updates the computer picker. A computer switch updates the phone too.',
  'readOnly': 'This document is not writable here.',
  'enabled': 'Enabled',
  'error': 'Error',
}

/** Stable locale keys. */
export type HappyBridgeKey = keyof typeof zh
