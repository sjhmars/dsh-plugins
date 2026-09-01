/**
 * Host:设置里用 npm 包名给当前 profile 装树外插件。
 *
 * RPC 面走 connection 的精确 Fetch 路由而不是 Typert Remote:Remote 的
 * 方法标记寄存在 typert-protocol 模块内的注册表里,树外插件经 profile
 * node_modules 解析到的是另一份模块实例,gateway 永远看不见那些标记
 * (表现为 /api 调用 404)。精确路由由 connection 服务直接派发,不经
 * gateway 的端点认领,是官方为"不能用 JSON Remote 的调用"留的通道。
 * @module @sjhmars/plugin-install
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the `connection` Context augmentation (HostConnectionHandle).
import type {} from '@deepseek-ai/dsh-client-connection'
import Schema from '@deepseek-ai/schemastery'
import {
  addProfilePlugin,
  INSTALLER_PACKAGE,
  entryBelongsToPackage,
  parseNpmPackageName,
  resolveInstallAnchor,
  resolveInstalledPackageUrl,
} from './add.ts'
import type { Config as InstallConfig, InstallResult } from './types.ts'

export type { Config as PluginInstallConfig, InstallResult } from './types.ts'
export {
  parseNpmPackageName,
  addProfilePlugin,
  entryBelongsToPackage,
  isInstallProfile,
  INSTALL_PROFILES,
  INSTALLER_PACKAGE,
} from './add.ts'
export type { NpmPackageSpec } from './add.ts'

/** Cordis 插件名。 */
export const name = 'plugin-install'

/** 非法 profile 名在加载时失败。 */
export const Config: Schema<InstallConfig> = Schema.object({
  profile: Schema.union([Schema.const('web' as const), Schema.const('desktop' as const)]).default('web'),
})

/** 精确 Fetch 路由挂在 connection 服务上。 */
export const inject = ['connection']

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: JSON_HEADERS })
}

/**
 * 注册两条安装路由并挂上热挂载,按组合配置钉住目标 profile。
 *
 * GET 携带查询参数:精确 Fetch 路由只认 GET/HEAD(POST 保留给 JSON
 * Remote 通道),这个本地同源工具 API 以查询参数传包名。
 * @param ctx - Host 插件上下文。
 * @param config - 组合行配置。
 */
export function apply(ctx: Context, config: InstallConfig): void {
  ctx.connection.fetch.register({
    path: '/api/pluginInstall/target',
    methods: ['GET'],
    fetch: async () => json({ profile: config.profile }),
  })
  ctx.connection.fetch.register({
    path: '/api/pluginInstall/install',
    methods: ['GET'],
    fetch: async (request) => {
      const raw = new URL(request.url).searchParams.get('package') ?? ''
      const spec = parseNpmPackageName(raw)
      if (spec === undefined) {
        return json({
          ok: false,
          code: 2,
          stdout: '',
          stderr: 'plugin-install: 只接受 npm 包名（可带 @版本，例如 @sjhmars/task-notify@0.2.0）',
        } satisfies InstallResult)
      }
      const result = addProfilePlugin(config.profile, spec.name, resolveInstallAnchor(), spec.version)
      if (!result.ok) return json(result)
      return json(await mountInstalled(ctx, spec.name, result, config.profile))
    },
  })
  ctx.logger.info(`plugin-install: 安装目标 profile=${config.profile}`)
}

/**
 * 把刚装好的包挂进运行中的树:首次安装热挂载,更新版本热替换(dispose
 * 旧 entry 后以缓存爆破 URL 重新导入,新代码真正生效)。跨重启的持久
 * 由 profile 清单负责(已写好);任何挂载失败都只降级为"重启后生效",
 * 不影响安装结果。热挂载的行以插件默认配置运行;bundle patch 带 row
 * 配置或覆盖其他行的插件,完整组合以下次重启为准。
 * @param ctx - Host 插件上下文。
 * @param name - the installed package name.
 * @param result - the completed install result.
 * @param profile - 写入的 profile，用来从该目录解析刚装好的入口。
 * @returns the result with the live-mount outcome appended.
 */
async function mountInstalled(
  ctx: Context,
  name: string,
  result: InstallResult,
  profile: InstallConfig['profile'],
): Promise<InstallResult> {
  if (name === INSTALLER_PACKAGE) {
    return {
      ...result,
      stdout: `${result.stdout}\nplugin-install: 本安装器已写入 profile，请重启 dsh 后生效（不能热替换正在处理这次安装的自己）。`
        .split('\n').filter(part => part.length > 0).join('\n'),
    }
  }
  const stale = [...ctx.loader.entries()]
    .filter(entry => entryBelongsToPackage(entry.options.name, name) && entry.fiber !== undefined && !entry.disabled)
  try {
    // tsdown 打成单文件，?hot= 让 Node 重新读盘。先卸掉官方包名行和上次
    // file://?hot= 行，避免同一包两份抢路由、前端图报双来源。
    const fresh = `${resolveInstalledPackageUrl(profile, name)}?hot=${Date.now().toString(36)}`
    for (const entry of stale) await entry.update({ disabled: true })
    await ctx.loader.create({ name: fresh })
    return {
      ...result,
      stdout: `${result.stdout}\nplugin-install: ${name} 已热${stale.length > 0 ? '替换' : '挂载'}，无需重启；界面部分刷新页面即可。`
        .split('\n').filter(part => part.length > 0).join('\n'),
    }
  } catch (error) {
    return {
      ...result,
      stderr: `${result.stderr}\nplugin-install: 安装成功，热挂载/热替换失败，重启后生效：${error instanceof Error ? error.message : String(error)}`
        .split('\n').filter(part => part.length > 0).join('\n'),
    }
  }
}

