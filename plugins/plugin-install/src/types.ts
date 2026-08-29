/** Host 配置：安装写进哪个 profile。 */

/** 插件配置。 */
export interface Config {
  /** 对应 `dsh plugin --profile` 的名字。浏览器组合用 `web`，桌面组合用 `desktop`。 */
  profile: 'web' | 'desktop'
}

/** 安装一次的退出码与捕获输出，供设置面板展示。 */
export interface InstallResult {
  /** pnpm 成功且调和完成。 */
  ok: boolean
  /** 进程退出码；非法包名或非法 profile 为 2。 */
  code: number
  stdout: string
  stderr: string
}
