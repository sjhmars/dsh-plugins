/** 设置页调用的 Typert Remote：按包名安装 profile 插件。 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Config, InstallResult } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Settings-tab plugin installer Remote. */
        pluginInstall: PluginInstallService;
    }
}
/**
 * 浏览器安装页调用的 Host RPC。
 */
export declare class PluginInstallService extends TypertRemoteService {
    /** 当前组合写入的 profile。 */
    profile: Config['profile'];
    /**
     * @param ctx - Host 上下文。
     */
    constructor(ctx: Context);
    /**
     * 当前组合写入的 profile：浏览器为 `web`，桌面客户端为 `desktop`。
     * @returns 与 `dsh plugin --profile` 相同的名字。
     */
    target(): Promise<{
        profile: Config['profile'];
    }>;
    /**
     * 只接受 npm 包名，写入 {@link profile}。
     * @param packageName - 输入框原文。
     * @returns 安装结果。
     */
    install(packageName: string): Promise<InstallResult>;
    /**
     * Hot-mount the freshly installed package into the running tree, so a
     * first-time install takes effect without a client restart. Durability
     * across restarts is the profile manifest's job (already written); the
     * loader mount is process-local and self-healing — a failed or partial
     * mount only downgrades to "effective after restart". Mounted rows run
     * with the plugin's default config; a bundle patch carrying row config or
     * overriding other rows reaches full fidelity at the next restart.
     * @param name - the installed package name.
     * @param result - the completed install result.
     * @returns the result with the live-mount outcome appended.
     */
    private mountInstalled;
}
//# sourceMappingURL=remote.d.ts.map