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
			"title": "_3WBSWa_title",
			"row": "_3WBSWa_row",
			"hint": "_3WBSWa_hint",
			"section": "_3WBSWa_section",
			"log": "_3WBSWa_log"
		};
		//#endregion
		//#region src/client/PluginInstallTab.tsx
		/** 设置 → 插件：只填 npm 包名安装。 */
		/**
		* 包名输入与安装日志。
		* @param props - 插槽运行时 + 文案 + RPC。
		*/
		function PluginInstallTab({ install, target, t }) {
			const [packageName, setPackageName] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [profile, setProfile] = (0, react.useState)();
			const [result, setResult] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let cancelled = false;
				target().then((next) => {
					if (!cancelled) setProfile(next.profile);
				});
				return () => {
					cancelled = true;
				};
			}, [target]);
			const submit = () => {
				if (busy) return;
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
			const log = result === void 0 ? void 0 : [
				result.ok ? t("success") : t("failure"),
				result.stdout,
				result.stderr
			].filter((part) => part.length > 0).join("\n");
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
							disabled: busy || packageName.trim().length === 0,
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
		/** 安装页文案。 */
		const NS = "plugin-install";
		/** 简体中文。 */
		const zh = {
			tab: "安装插件",
			title: "用包名安装",
			hint: "只填 npm 包名（可带 @版本），例如 @sjhmars/task-notify 或 @sjhmars/task-notify@0.2.0。写入 {profile} profile（网页版是 web，桌面客户端是 desktop；两边互不相通）。装完或换版本都会热挂载，刷新页面即可；更新本安装器自己需重启。",
			placeholder: "@scope/package",
			install: "安装",
			installing: "正在安装…",
			success: "安装成功，已热挂载；界面部分刷新页面即可。",
			failure: "安装失败"
		};
		/** English copy. */
		const en = {
			tab: "Install plugin",
			title: "Install by package name",
			hint: "npm package name only, optionally with @version — for example @sjhmars/task-notify or @sjhmars/task-notify@0.2.0. Writes the {profile} profile (browser = web, desktop client = desktop; they do not share plugins). Installs and version updates hot-mount; refresh the page. Updating this installer itself needs a restart.",
			placeholder: "@scope/package",
			install: "Install",
			installing: "Installing…",
			success: "Installed and hot-mounted; refresh the page for its UI.",
			failure: "Install failed"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "locale"];
		/**
		* One same-origin GET to the plugin's exact Fetch routes (the seam allows
		* GET/HEAD only; parameters ride the query string). The physical carrier
		* (web route lane or the desktop IPC bridge) owns trust policy.
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
		* 注册安装标签页。
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
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "install",
				order: 20,
				label: () => ctx.locale.bind(NS)("tab"),
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