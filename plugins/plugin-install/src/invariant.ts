/** `@sjhmars/plugin-install` 的 invariant 伴侣。 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@sjhmars/plugin-install'

export const name = 'plugin-install-invariant'
export const inject = ['invariants']

/** 安装是一次性 pnpm 子进程，没有本包可审计的持续事件流。 */
const install: InvariantInstaller = () => {}

/**
 * 注册 invariant 伴侣。
 * @param ctx - 带 invariants 服务的 Host 上下文。
 * @returns 注册释放器。
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
