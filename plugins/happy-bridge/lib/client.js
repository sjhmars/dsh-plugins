window.__ModuleLoader__.load({
	id: "@sjhmars/happy-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:H:\dsh-plugin\plugins\happy-bridge\src\client\HappyBridgeCard.module.css.mjs
		const css = ".l9rBEq_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}.l9rBEq_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:12px;padding:14px 16px;display:flex}.l9rBEq_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.l9rBEq_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600}.l9rBEq_description{color:var(--dsw-alias-label-tertiary);font-size:13px}.l9rBEq_chevron{color:var(--dsw-alias-label-tertiary)}.l9rBEq_body{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:12px;margin:0 16px;padding:12px 0 16px;display:flex}.l9rBEq_status{color:var(--dsw-alias-label-secondary);font-size:13px}.l9rBEq_error{color:var(--dsw-alias-danger,#c44);font-size:13px}.l9rBEq_qr{background:#fff;border-radius:8px;align-self:center;width:180px;height:180px}.l9rBEq_row{flex-wrap:wrap;gap:8px;display:flex}.l9rBEq_button{appearance:none;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:8px;padding:6px 12px;font-size:13px}.l9rBEq_button:hover{background:var(--dsw-alias-interactive-bg-hover)}.l9rBEq_label{color:var(--dsw-alias-label-tertiary);font-size:13px}.l9rBEq_select,.l9rBEq_checkbox{font:inherit;font-size:13px}.l9rBEq_select{min-width:8em}.l9rBEq_select:disabled,.l9rBEq_checkbox:disabled{opacity:.6;cursor:not-allowed}";
		const tagId = "@sjhmars/happy-bridge/HappyBridgeCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@sjhmars/happy-bridge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var HappyBridgeCard_module_css_default = {
			"status": "l9rBEq_status",
			"qr": "l9rBEq_qr",
			"select": "l9rBEq_select",
			"row": "l9rBEq_row",
			"name": "l9rBEq_name",
			"body": "l9rBEq_body",
			"label": "l9rBEq_label",
			"header": "l9rBEq_header",
			"chevron": "l9rBEq_chevron",
			"checkbox": "l9rBEq_checkbox",
			"card": "l9rBEq_card",
			"headText": "l9rBEq_headText",
			"button": "l9rBEq_button",
			"error": "l9rBEq_error",
			"description": "l9rBEq_description"
		};
		//#endregion
		//#region src/client/HappyBridgeCard.tsx
		/** Settings → Plugins card: pairing QR, copy links, remote grant. */
		const GRANTS = [
			"watch",
			"chat",
			"approve",
			"full"
		];
		/**
		* Render the Happy remote plugin card.
		* @param props - locale + injected Host RPC.
		*/
		function HappyBridgeCard(props) {
			const { t, getStatus, startPairing, disconnect, rePair, setGrant, setEnabled } = props;
			const snap = props.useHappySettings((snapshot) => snapshot);
			const grant = snap.value?.remoteGrant ?? "approve";
			const enabled = snap.value?.enabled !== false;
			const writable = snap.writable;
			const [open, setOpen] = (0, react.useState)(true);
			const [status, setStatus] = (0, react.useState)(void 0);
			const [copied, setCopied] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const tick = () => {
					getStatus().then((next) => {
						if (!cancelled) setStatus(next);
					});
				};
				tick();
				const timer = setInterval(tick, 2e3);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [getStatus]);
			const copy = async (which, value) => {
				if (value === void 0) return;
				await navigator.clipboard.writeText(value);
				setCopied(which);
				setTimeout(() => setCopied(void 0), 1500);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: HappyBridgeCard_module_css_default.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: HappyBridgeCard_module_css_default.header,
					"aria-expanded": open,
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: HappyBridgeCard_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: HappyBridgeCard_module_css_default.name,
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: HappyBridgeCard_module_css_default.description,
							children: t("description")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: HappyBridgeCard_module_css_default.chevron,
						children: open ? "▴" : "▾"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: HappyBridgeCard_module_css_default.body,
					children: [
						!writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: HappyBridgeCard_module_css_default.status,
							role: "status",
							children: t("readOnly")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: HappyBridgeCard_module_css_default.label,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: HappyBridgeCard_module_css_default.checkbox,
									type: "checkbox",
									checked: enabled,
									disabled: !writable,
									onChange: (event) => void setEnabled(event.target.checked)
								}),
								" ",
								t("enabled")
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: HappyBridgeCard_module_css_default.status,
							children: status?.paired === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [t("status.paired"), typeof status.sessionCount === "number" ? ` · ${t("status.linked")} ${status.linkedCount ?? 0}/${status.sessionCount}` : null] }) : status?.pairing === true ? t("status.pairing") : t("status.unpaired")
						}),
						status?.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: HappyBridgeCard_module_css_default.error,
							role: "status",
							children: [
								t("error"),
								": ",
								status.error
							]
						}) : null,
						status?.qrDataUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: HappyBridgeCard_module_css_default.qr,
							alt: t("qr.alt"),
							src: status.qrDataUrl
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: HappyBridgeCard_module_css_default.row,
							children: [
								status?.paired === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: HappyBridgeCard_module_css_default.button,
									onClick: () => void disconnect(),
									children: t("disconnect")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: HappyBridgeCard_module_css_default.button,
									onClick: () => void startPairing(),
									children: t("start")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: HappyBridgeCard_module_css_default.button,
									onClick: () => void rePair(),
									children: t("repair")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: HappyBridgeCard_module_css_default.button,
									onClick: () => void copy("mobile", status?.mobileUrl),
									children: copied === "mobile" ? t("copied") : t("copy.mobile")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: HappyBridgeCard_module_css_default.button,
									onClick: () => void copy("web", status?.webUrl),
									children: copied === "web" ? t("copied") : t("copy.web")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: HappyBridgeCard_module_css_default.label,
							children: [
								t("grant"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: HappyBridgeCard_module_css_default.select,
									value: grant,
									disabled: !writable,
									onChange: (event) => void setGrant(event.target.value),
									children: GRANTS.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value,
										children: t(`grant.${value}`)
									}, value))
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: HappyBridgeCard_module_css_default.status,
							children: t("grant.hint")
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace owned by the Happy remote settings card. */
		const NS = "happy-bridge";
		/** Simplified-Chinese copy. */
		const zh = {
			"title": "Happy 远程",
			"description": "用手机 Happy App 遥控已经在跑的对话。",
			"expand": "展开",
			"collapse": "收起",
			"status.unpaired": "还没配对",
			"status.pairing": "等待手机扫码…请在 Happy App 里扫，不要用系统相机。",
			"status.paired": "已连接到 Happy",
			"status.linked": "已接通对话",
			"qr.alt": "Happy 配对二维码",
			"copy.mobile": "复制手机链接",
			"copy.web": "复制网页链接",
			"copied": "已复制",
			"start": "开始配对",
			"repair": "重新配对",
			"disconnect": "断开",
			"grant": "手机能管多深",
			"grant.watch": "只看",
			"grant.chat": "能聊",
			"grant.approve": "能批",
			"grant.full": "完整",
			"grant.hint": "改成「完整」后，手机换模型和思考强度会同步到电脑。电脑上换也会同步到手机。",
			"readOnly": "这份设置现在不能改。",
			"enabled": "启用",
			"error": "出错"
		};
		/** English copy. */
		const en = {
			"title": "Happy remote",
			"description": "Let Happy App on your phone drive the same running conversations.",
			"expand": "Expand",
			"collapse": "Collapse",
			"status.unpaired": "Not paired",
			"status.pairing": "Waiting for a scan inside Happy App — not the OS camera.",
			"status.paired": "Connected to Happy",
			"status.linked": "Linked sessions",
			"qr.alt": "Happy pairing QR code",
			"copy.mobile": "Copy phone link",
			"copy.web": "Copy web link",
			"copied": "Copied",
			"start": "Start pairing",
			"repair": "Pair again",
			"disconnect": "Disconnect",
			"grant": "How far the phone may control",
			"grant.watch": "Watch",
			"grant.chat": "Chat",
			"grant.approve": "Approve",
			"grant.full": "Full",
			"grant.hint": "On Full, a phone model or thinking-effort switch updates the computer picker. A computer switch updates the phone too.",
			"readOnly": "This document is not writable here.",
			"enabled": "Enabled",
			"error": "Error"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required client services. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/**
		* Register the Happy remote card under the `happy-bridge` settings namespace.
		* @param ctx - browser plugin context.
		*/
		function apply(ctx) {
			const connection = ctx.get("connection");
			const scope = ctx.settingsScope.bind({ namespace: "happy-bridge" });
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "happy-bridge: browser dictionaries");
			const rpc = async (method) => {
				return unwrap(await connection.rpc.call("/api", `happyBridge/${method}`, { args: {} }));
			};
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: "happy-bridge",
				locale: NS,
				inject: () => ({
					getStatus: () => rpc("getStatus"),
					startPairing: () => rpc("startPairing"),
					disconnect: () => rpc("disconnect"),
					rePair: () => rpc("rePair"),
					setGrant: (grant) => scope.set("remoteGrant", grant),
					setEnabled: (enabled) => scope.set("enabled", enabled),
					hooks: { happySettings: scope }
				})
			}, HappyBridgeCard));
		}
		function unwrap(result) {
			if (result.ok) return result.value;
			throw new Error(result.error.message);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map