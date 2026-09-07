/** Settings-card dictionaries. */
export const NS = 'segmented-compaction'
export const zh = {
  title: '分段压缩',
  description: '仅在原上下文压缩因输入超限失败后，分段生成摘要。原压缩成功时不介入。',
  enabled: '启用超限后的分段恢复',
  contextRatio: '上下文预算使用比例',
  maxShrinkRetries: '每段超限缩小重试上限',
  maxCalls: '整次压缩模型调用上限（含原请求与失败尝试）',
  hint: '分段预算根据压缩模型的上下文窗口、使用比例和输出预留自动计算。优先保留完整消息与工具组，必要时才切分文本。修改影响下一次恢复，不修改模型窗口或原压缩阈值。',
  save: '保存', saved: '已保存', saving: '保存中…', readOnly: '当前设置只读。',
  error: '保存失败，请检查输入后重试。', invalid: '请输入有效预算：比例须大于 0 且不超过 1，次数须为范围内的整数。',
}
export const en: Record<keyof typeof zh, string> = {
  title: 'Segmented compaction',
  description: 'Split history only after the original compaction fails with context overflow. Successful compaction passes through.',
  enabled: 'Recover context overflow with segmented summaries',
  contextRatio: 'Context budget ratio',
  maxShrinkRetries: 'Maximum shrink retries per segment',
  maxCalls: 'Total model call limit (including the original and failed attempts)',
  hint: 'The segment budget is calculated from the compaction model context window, budget ratio and output reservation. Keep complete messages and tool groups first; split text only when necessary. Changes apply to the next recovery, without changing model capacity or the original compaction threshold.',
  save: 'Save', saved: 'Saved', saving: 'Saving…', readOnly: 'These settings are read-only.',
  error: 'Save failed. Check the values and retry.', invalid: 'Enter valid budgets: ratio above 0 and at most 1; call limits must be integers in their allowed ranges.',
}
export type LocaleKey = keyof typeof zh
