import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** 设置 → 插件：只填 npm 包名安装。 */
import { useEffect, useState } from 'react';
import css from './PluginInstallTab.module.css';
/**
 * 包名输入与安装日志。
 * @param props - 插槽运行时 + 文案 + RPC。
 */
export function PluginInstallTab({ install, target, t }) {
    const [packageName, setPackageName] = useState('');
    const [busy, setBusy] = useState(false);
    const [profile, setProfile] = useState();
    const [result, setResult] = useState();
    useEffect(() => {
        let cancelled = false;
        void target().then((next) => {
            if (!cancelled)
                setProfile(next.profile);
        });
        return () => {
            cancelled = true;
        };
    }, [target]);
    const submit = () => {
        if (busy)
            return;
        setBusy(true);
        setResult(undefined);
        void install(packageName).then((next) => {
            setResult(next);
            setBusy(false);
        }, (error) => {
            setResult({
                ok: false,
                code: 1,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
            });
            setBusy(false);
        });
    };
    const log = result === undefined
        ? undefined
        : [result.ok ? t('success') : t('failure'), result.stdout, result.stderr]
            .filter(part => part.length > 0)
            .join('\n');
    return (_jsxs("div", { className: css.section, children: [_jsx("h3", { className: css.title, children: t('title') }), _jsx("p", { className: css.hint, children: t('hint', { profile: profile ?? '…' }) }), _jsxs("div", { className: css.row, children: [_jsx("input", { value: packageName, placeholder: t('placeholder'), disabled: busy, onChange: event => setPackageName(event.target.value), onKeyDown: event => {
                            if (event.key === 'Enter')
                                submit();
                        } }), _jsx("button", { type: "button", disabled: busy || packageName.trim().length === 0, onClick: submit, children: busy ? t('installing') : t('install') })] }), log !== undefined ? _jsx("pre", { className: css.log, "data-ok": result?.ok === true ? 'true' : 'false', children: log }) : null] }));
}
//# sourceMappingURL=PluginInstallTab.js.map