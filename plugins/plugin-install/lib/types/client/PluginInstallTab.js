import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Plugins bundle page for installing npm names through the official manager. */
import { useEffect, useState } from 'react';
import css from './PluginInstallTab.module.css';
/**
 * 包名输入与安装日志。
 * @param props - 插槽运行时、文案和安装请求。
 * @returns 安装输入框与官方操作结果。
 */
export function PluginInstallTab({ install, target, t, view }) {
    const [packageName, setPackageName] = useState('');
    const [busy, setBusy] = useState(false);
    const [profile, setProfile] = useState();
    const [result, setResult] = useState();
    useEffect(() => {
        let cancelled = false;
        void target().then((next) => {
            if (!cancelled)
                setProfile(next.profile);
        }, (error) => {
            if (!cancelled)
                setResult({ ok: false, code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) });
        });
        return () => {
            cancelled = true;
        };
    }, [target]);
    const submit = () => {
        if (busy || profile === undefined || packageName.trim() === '')
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
    let status = 'failure';
    if (result?.ok) {
        if (result.kind === 'dependency')
            status = 'dependencyRestart';
        else if (result.kind === 'bundle' && result.enabled === false)
            status = 'bundleDisabled';
        else
            status = 'restart';
    }
    const log = result === undefined ? undefined
        : [t(status), result.stdout, result.stderr].filter(part => part.length > 0).join('\n');
    if (view === 'summary')
        return t('title');
    return (_jsxs("div", { className: css.section, children: [_jsx("h3", { className: css.title, children: t('title') }), _jsx("p", { className: css.hint, children: t('hint', { profile: profile ?? '…' }) }), _jsxs("div", { className: css.row, children: [_jsx("input", { value: packageName, placeholder: t('placeholder'), disabled: busy, onChange: event => setPackageName(event.target.value), onKeyDown: event => {
                            if (event.key === 'Enter')
                                submit();
                        } }), _jsx("button", { type: "button", disabled: busy || profile === undefined || packageName.trim().length === 0, onClick: submit, children: busy ? t('installing') : t('install') })] }), log !== undefined ? _jsx("pre", { className: css.log, "data-ok": result?.ok === true ? 'true' : 'false', children: log }) : null] }));
}
//# sourceMappingURL=PluginInstallTab.js.map