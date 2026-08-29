import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Settings → Plugins card: pairing QR, copy links, remote grant. */
import { useEffect, useState } from 'react';
import css from './HappyBridgeCard.module.css';
const GRANTS = ['watch', 'chat', 'approve', 'full'];
/**
 * Render the Happy remote plugin card.
 * @param props - locale + injected Host RPC.
 */
export function HappyBridgeCard(props) {
    const { t, getStatus, startPairing, disconnect, rePair, setGrant, setEnabled } = props;
    const snap = props.useHappySettings(snapshot => snapshot);
    const grant = snap.value?.remoteGrant ?? 'approve';
    const enabled = snap.value?.enabled !== false;
    const writable = snap.writable;
    const [open, setOpen] = useState(true);
    const [status, setStatus] = useState(undefined);
    const [copied, setCopied] = useState(undefined);
    useEffect(() => {
        let cancelled = false;
        const tick = () => {
            void getStatus().then((next) => { if (!cancelled)
                setStatus(next); });
        };
        tick();
        const timer = setInterval(tick, 2000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [getStatus]);
    const copy = async (which, value) => {
        if (value === undefined)
            return;
        await navigator.clipboard.writeText(value);
        setCopied(which);
        setTimeout(() => setCopied(undefined), 1500);
    };
    return (_jsxs("li", { className: css.card, children: [_jsxs("button", { type: "button", className: css.header, "aria-expanded": open, onClick: () => setOpen(!open), children: [_jsxs("span", { className: css.headText, children: [_jsx("span", { className: css.name, children: t('title') }), _jsx("span", { className: css.description, children: t('description') })] }), _jsx("span", { className: css.chevron, children: open ? '▴' : '▾' })] }), open
                ? (_jsxs("div", { className: css.body, children: [!writable
                            ? _jsx("p", { className: css.status, role: "status", children: t('readOnly') })
                            : null, _jsxs("label", { className: css.label, children: [_jsx("input", { className: css.checkbox, type: "checkbox", checked: enabled, disabled: !writable, onChange: event => void setEnabled(event.target.checked) }), ' ', t('enabled')] }), _jsx("p", { className: css.status, children: status?.paired === true
                                ? (_jsxs(_Fragment, { children: [t('status.paired'), typeof status.sessionCount === 'number'
                                            ? ` · ${t('status.linked')} ${status.linkedCount ?? 0}/${status.sessionCount}`
                                            : null] }))
                                : status?.pairing === true
                                    ? t('status.pairing')
                                    : t('status.unpaired') }), status?.error !== undefined ? _jsxs("p", { className: css.error, role: "status", children: [t('error'), ": ", status.error] }) : null, status?.qrDataUrl !== undefined
                            ? _jsx("img", { className: css.qr, alt: t('qr.alt'), src: status.qrDataUrl })
                            : null, _jsxs("div", { className: css.row, children: [status?.paired === true
                                    ? _jsx("button", { type: "button", className: css.button, onClick: () => void disconnect(), children: t('disconnect') })
                                    : _jsx("button", { type: "button", className: css.button, onClick: () => void startPairing(), children: t('start') }), _jsx("button", { type: "button", className: css.button, onClick: () => void rePair(), children: t('repair') }), _jsx("button", { type: "button", className: css.button, onClick: () => void copy('mobile', status?.mobileUrl), children: copied === 'mobile' ? t('copied') : t('copy.mobile') }), _jsx("button", { type: "button", className: css.button, onClick: () => void copy('web', status?.webUrl), children: copied === 'web' ? t('copied') : t('copy.web') })] }), _jsxs("label", { className: css.label, children: [t('grant'), ' ', _jsx("select", { className: css.select, value: grant, disabled: !writable, onChange: event => void setGrant(event.target.value), children: GRANTS.map(value => (_jsx("option", { value: value, children: t(`grant.${value}`) }, value))) })] }), _jsx("p", { className: css.status, children: t('grant.hint') })] }))
                : null] }));
}
//# sourceMappingURL=HappyBridgeCard.js.map