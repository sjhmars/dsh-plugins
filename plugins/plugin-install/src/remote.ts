/** 设置页调用的 Typert Remote：按包名安装 profile 插件。 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { addProfilePlugin, parseNpmPackageName, resolveInstallAnchor } from './add.ts'
import type { Config, InstallResult } from './types.ts'

/**
 * 浏览器安装页调用的 Host RPC。
 */
export class PluginInstallService extends TypertRemoteService {
  /** 当前组合写入的 profile。 */
  profile: Config['profile'] = 'web'

  /**
   * @param ctx - Host 上下文。
   */
  constructor(ctx: Context) {
    super(ctx, 'pluginInstall')
  }

  /**
   * 当前组合写入的 profile：浏览器为 `web`，桌面客户端为 `desktop`。
   * @returns 与 `dsh plugin --profile` 相同的名字。
   */
  @Remote('target')
  async target(): Promise<{ profile: Config['profile'] }> {
    return { profile: this.profile }
  }

  /**
   * 只接受 npm 包名，写入 {@link profile}。
   * @param packageName - 输入框原文。
   * @returns 安装结果。
   */
  @Remote('install')
  async install(packageName: string): Promise<InstallResult> {
    const name = parseNpmPackageName(packageName)
    if (name === undefined) {
      return {
        ok: false,
        code: 2,
        stdout: '',
        stderr: 'plugin-install: 只接受 npm 包名（例如 @sjhmars/task-notify）',
      }
    }
    return addProfilePlugin(this.profile, name, resolveInstallAnchor())
  }
}
