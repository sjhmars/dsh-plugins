window.__ModuleLoader__.load({
	id: "@sjhmars/plugin-install",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:H:\dsh-plugin\plugins\plugin-install\src\client\PluginInstallTab.module.css.mjs
		const css = "._3WBSWa_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}._3WBSWa_title,._3WBSWa_hint,._3WBSWa_log{margin:0}._3WBSWa_hint{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}._3WBSWa_row{align-items:center;gap:8px;display:flex}._3WBSWa_row input{border:1px solid var(--dsw-alias-border-l2);min-width:0;color:inherit;font:inherit;background:0 0;border-radius:6px;flex:1;padding:8px 12px}._3WBSWa_row button{border:1px solid var(--dsw-alias-border-l2);color:inherit;font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:8px 14px}._3WBSWa_row button:disabled{opacity:.5;cursor:default}._3WBSWa_log{white-space:pre-wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}._3WBSWa_log[data-ok=false]{color:var(--dsw-alias-state-error-primary)}";
		const tagId = "@sjhmars/plugin-install/PluginInstallTab.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@sjhmars/plugin-install";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginInstallTab_module_css_default = {
			"hint": "_3WBSWa_hint",
			"log": "_3WBSWa_log",
			"row": "_3WBSWa_row",
			"title": "_3WBSWa_title",
			"section": "_3WBSWa_section"
		};
		//#endregion
		//#region src/client/PluginInstallTab.tsx
		/** Plugins bundle page for installing npm names through the official manager. */
		/**
		* 包名输入与安装日志。
		* @param props - 插槽运行时、文案和安装请求。
		* @returns 安装输入框与官方操作结果。
		*/
		function PluginInstallTab({ install, target, t, view }) {
			const [packageName, setPackageName] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [profile, setProfile] = (0, react.useState)();
			const [result, setResult] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let cancelled = false;
				target().then((next) => {
					if (!cancelled) setProfile(next.profile);
				}, (error) => {
					if (!cancelled) setResult({
						ok: false,
						code: 1,
						stdout: "",
						stderr: error instanceof Error ? error.message : String(error)
					});
				});
				return () => {
					cancelled = true;
				};
			}, [target]);
			const submit = () => {
				if (busy || profile === void 0 || packageName.trim() === "") return;
				setBusy(true);
				setResult(void 0);
				install(packageName).then((next) => {
					setResult(next);
					setBusy(false);
				}, (error) => {
					setResult({
						ok: false,
						code: 1,
						stdout: "",
						stderr: error instanceof Error ? error.message : String(error)
					});
					setBusy(false);
				});
			};
			let status = "failure";
			if (result?.ok) {
				if (result.kind === "dependency") status = "dependencyRestart";
				else if (result.kind === "bundle" && result.enabled === false) status = "bundleDisabled";
				else status = "restart";
			}
			const log = result === void 0 ? void 0 : [
				t(status),
				result.stdout,
				result.stderr
			].filter((part) => part.length > 0).join("\n");
			if (view === "summary") return t("title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginInstallTab_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: PluginInstallTab_module_css_default.title,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginInstallTab_module_css_default.hint,
						children: t("hint", { profile: profile ?? "…" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginInstallTab_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: packageName,
							placeholder: t("placeholder"),
							disabled: busy,
							onChange: (event) => setPackageName(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") submit();
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy || profile === void 0 || packageName.trim().length === 0,
							onClick: submit,
							children: busy ? t("installing") : t("install")
						})]
					}),
					log !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: PluginInstallTab_module_css_default.log,
						"data-ok": result?.ok === true ? "true" : "false",
						children: log
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Localized installer copy. */
		const NS = "plugin-install";
		/** Simplified Chinese. */
		const zh = {
			title: "用包名安装",
			hint: "支持 npm 插件和普通组件，可带 @版本。写入当前 {profile} profile，安装后重启应用。",
			placeholder: "@scope/package",
			install: "安装",
			installing: "正在安装…",
			restart: "安装完成，请重启应用后生效。",
			dependencyRestart: "组件已安装，请重启应用。已配置的组件更新后生效；首次安装还需在配置文件中启用。",
			bundleDisabled: "安装完成，该插件仍处于停用状态。请在 Plugins 页启用后重启应用。",
			failure: "安装未完成"
		};
		/** English. */
		const en = {
			title: "Install by package name",
			hint: "Install npm plugins and components, optionally with @version. Uses the current {profile} profile. Restart the application after installation.",
			placeholder: "@scope/package",
			install: "Install",
			installing: "Installing…",
			restart: "Installed. Restart the application to apply it.",
			dependencyRestart: "Component installed. Restart the application. Configured components then use the update; a new component also needs a plugin entry in the configuration file.",
			bundleDisabled: "Installed; this plugin remains disabled. Enable it on the Plugins page, then restart the application.",
			failure: "Installation did not complete"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "locale"];
		/**
		* Call the installer's same-origin GET routes with parameters in the query string.
		* The Web route or Desktop IPC carrier owns admission and authentication.
		* @param path - route path below /api.
		* @param query - query parameters.
		* @returns the parsed JSON response.
		*/
		async function get(path, query = {}) {
			const url = Object.keys(query).length === 0 ? path : `${path}?${new URLSearchParams(query).toString()}`;
			const response = await fetch(url);
			if (!response.ok) throw new Error(`plugin-install: HTTP ${String(response.status)}`);
			return await response.json();
		}
		/**
		* 注册本包的安装页面。
		* @param ctx - 浏览器插件上下文。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "plugin-install: 文案");
			const injected = () => ({
				target: () => get("/api/pluginInstall/target"),
				install: (packageName) => get("/api/pluginInstall/install", { package: packageName })
			});
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "@sjhmars/plugin-install",
				locale: NS,
				inject: injected
			}, PluginInstallTab));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map