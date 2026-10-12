/** Plugins bundle page for installing npm names through the official manager. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { Config, InstallResult } from '../types.ts';
/** 安装页注入的 Host RPC。 */
export interface PluginInstallTabInjected {
    /** 当前写入的 profile（web 或 desktop）。 */
    target: () => Promise<{
        profile: Config['profile'];
    }>;
    /** 校验后安装到当前 profile。 */
    install: (packageName: string) => Promise<InstallResult>;
}
export type PluginInstallTabProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'plugin-install'> & InjectFace<PluginInstallTabInjected>;
/**
 * 包名输入与安装日志。
 * @param props - 插槽运行时、文案和安装请求。
 * @returns 安装输入框与官方操作结果。
 */
export declare function PluginInstallTab({ install, target, t, view }: PluginInstallTabProps): ReactNode;
//# sourceMappingURL=PluginInstallTab.d.ts.map