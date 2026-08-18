window.__ModuleLoader__.load({
	id: "@dsh/editor-launcher",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/preference.ts
		/** Browser-side persistence of the preferred editor choice. */
		const PREFERRED_KEY = "dsh.editor-launcher.preferred";
		/** Read the remembered editor, or undefined when unset or storage is unavailable. */
		function readPreferred() {
			try {
				const raw = localStorage.getItem(PREFERRED_KEY);
				if (raw === null || raw === "") return void 0;
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return void 0;
				const record = parsed;
				if (typeof record.id !== "string" || record.id === "") return void 0;
				if (typeof record.name !== "string") return void 0;
				return {
					id: record.id,
					name: record.name
				};
			} catch {
				return;
			}
		}
		/** Remember one editor as the default, name included for label rendering. */
		function writePreferred(editor) {
			try {
				localStorage.setItem(PREFERRED_KEY, JSON.stringify(editor));
			} catch {}
		}
		//#endregion
		//#region \0dsh-css:H:\dsh-plugin\plugins\editor-launcher\src\client\EditorPicker.module.css.mjs
		const css = ".cy5Iia_pickerButton{border:1px solid var(--dsw-alias-border-l2);height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex}.cy5Iia_pickerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.cy5Iia_pickerButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.cy5Iia_pickerButton span,.cy5Iia_pickerButton svg{flex:none}.cy5Iia_pickerButton span{white-space:nowrap;text-overflow:ellipsis;max-width:160px;overflow:hidden}";
		const tagId = "@dsh/editor-launcher/EditorPicker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh/editor-launcher";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var EditorPicker_module_css_default = { "pickerButton": "cy5Iia_pickerButton" };
		//#endregion
		//#region src/client/EditorPicker.tsx
		/** The Session-header editor picker: one capsule button opening a Menu of detected editors. */
		/** Menu row id for the manual re-detect action (icon-only row). */
		const REFRESH_ID = "__refresh__";
		/**
		* Render the Session-header editor picker capsule. Choosing an editor records
		* it as the preferred default (id + name, so the capsule label survives a
		* session switch); the click interceptor in the browser apply uses that id
		* when opening session file links. Editors load lazily on first menu open and
		* are cached across sessions in the browser apply, so page switches never
		* re-issue detection RPCs; the icon-only refresh row forces a fresh probe.
		* @param props - slot runtime, localized copy, and the injected detection face.
		* @returns the picker capsule with its menu.
		*/
		function EditorPicker({ listEditors, refreshEditors, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [editors, setEditors] = (0, react.useState)(null);
			const [preferred, setPreferred] = (0, react.useState)(readPreferred());
			const loadedOnce = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open || loadedOnce.current) return;
				loadedOnce.current = true;
				let cancelled = false;
				listEditors().then((found) => {
					if (!cancelled) setEditors(found);
				}, () => {
					if (!cancelled) setEditors([]);
				});
				return () => {
					cancelled = true;
				};
			}, [open, listEditors]);
			const refreshing = (0, react.useRef)(false);
			const refresh = (0, react.useCallback)(() => {
				if (refreshing.current) return;
				refreshing.current = true;
				setEditors(null);
				refreshEditors().then((found) => {
					setEditors(found);
					refreshing.current = false;
				}, () => {
					setEditors([]);
					refreshing.current = false;
				});
			}, [refreshEditors]);
			const label = preferred !== void 0 ? t("trigger.preferred", { name: preferred.name }) : t("trigger.default");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				align: "end",
				portal: true,
				items: editors === null ? [{
					type: "label",
					id: "loading",
					text: "…"
				}] : editors.length === 0 ? [{
					type: "label",
					id: "empty",
					text: t("menu.noEditors")
				}] : [{
					type: "label",
					id: "editors",
					text: t("menu.editors")
				}, ...editors.map((editor) => ({
					id: editor.id,
					label: editor.name
				}))],
				footer: [{
					type: "separator",
					id: "refresh-sep"
				}, {
					id: REFRESH_ID,
					label: "",
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "img",
						"aria-label": t("menu.refresh"),
						title: t("menu.refresh"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, { size: 14 })
					})
				}],
				selectedId: preferred?.id,
				onSelect: (id) => {
					if (id === REFRESH_ID) {
						refresh();
						return;
					}
					const editor = editors?.find((candidate) => candidate.id === id);
					if (editor === void 0) return;
					writePreferred({
						id: editor.id,
						name: editor.name
					});
					setPreferred({
						id: editor.id,
						name: editor.name
					});
					setOpen(false);
				},
				onClose: () => {
					setOpen(false);
				},
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: EditorPicker_module_css_default.pickerButton,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 12 })]
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale namespace owned by the editor launcher browser half. */
		const NS = "editor-launcher";
		/** Simplified-Chinese editor launcher strings. */
		const zh = {
			"trigger.default": "用编辑器打开",
			"trigger.preferred": "用 {name} 打开",
			"menu.editors": "编辑器",
			"menu.noEditors": "未检测到已安装的编辑器",
			"menu.refresh": "重新检测编辑器",
			"open.failed": "打开失败：{error}"
		};
		/** English editor launcher strings. */
		const en = {
			"trigger.default": "Open with editor",
			"trigger.preferred": "Open with {name}",
			"menu.editors": "Editors",
			"menu.noEditors": "No installed editors detected",
			"menu.refresh": "Re-detect editors",
			"open.failed": "Failed to open: {error}"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required client services: the slot registry, locale, connection RPC, and the session list store. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"sessions"
		];
		/** A bare filename (with extension) or a path containing a separator. */
		function looksLikeFilePath(text) {
			if (text.includes("/") || text.includes("\\")) return true;
			return /^[^\s./\\]+\.\w+$/.test(text);
		}
		/**
		* Resolve a workspace-relative path into the Host-facing absolute spelling
		* (mirror of the runtime helper; kept local so the browser bundle stays free
		* of cross-package value imports).
		* @param cwd - session workspace root, when known.
		* @param path - absolute or workspace-relative path.
		* @returns an absolute path when a workspace root is available, otherwise the original path.
		*/
		function resolveWorkspacePath(cwd, path) {
			if (path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\")) return path;
			if (cwd === void 0 || cwd === "") return path;
			return `${cwd.replace(/[/\\]+$/, "")}/${path.replace(/^[/\\]+/, "")}`;
		}
		/**
		* Mount the browser half: register the picker into the Session-header
		* utilities seat (order -1 keeps it left of the Session-log capsule) and
		* intercept clicks on session file-path links so they open with the preferred
		* editor instead of the host OS default application.
		* @param ctx - Browser context carrying slots, locale, connection, and sessions.
		*/
		function apply(ctx) {
			const connection = ctx.get("connection");
			let editorsCache = null;
			const fetchEditors = async () => {
				return unwrap(await connection.rpc.call("/api", "editorLauncher/listEditors", { args: {} }));
			};
			const listEditors = async () => {
				if (editorsCache !== null) return editorsCache;
				editorsCache = await fetchEditors();
				return editorsCache;
			};
			const refreshEditors = async () => {
				editorsCache = await fetchEditors();
				return editorsCache;
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "editor-launcher: browser dictionaries");
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "editor-launcher",
				order: -1,
				locale: NS,
				inject: () => ({
					listEditors,
					refreshEditors
				})
			}, EditorPicker));
			ctx.effect(() => {
				const onDocumentClick = (event) => {
					const preferred = readPreferred();
					if (preferred === void 0) return;
					const target = event.target;
					if (!(target instanceof Element)) return;
					const button = target.closest("button");
					if (button === null) return;
					if (button.hasAttribute("aria-expanded")) return;
					const titlePath = button.getAttribute("title");
					if (titlePath !== null && isAbsolutePath(titlePath)) {
						event.preventDefault();
						event.stopPropagation();
						openWithPreferred(connection, ctx, preferred.id, titlePath);
						return;
					}
					if (button.closest("[data-tool]") === null) return;
					const text = button.textContent?.trim() ?? "";
					if (!looksLikeFilePath(text)) return;
					event.preventDefault();
					event.stopPropagation();
					openWithPreferred(connection, ctx, preferred.id, text);
				};
				document.addEventListener("click", onDocumentClick, true);
				return () => document.removeEventListener("click", onDocumentClick, true);
			}, "editor-launcher: file-link click interceptor");
		}
		/** Whether a string is an absolute filesystem path (drive, UNC, or rooted). */
		function isAbsolutePath(value) {
			return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[/\\]/.test(value);
		}
		/** Unwrap a Remote RPC result or throw its carrier error. */
		function unwrap(result) {
			if (result.ok) return result.value;
			throw new Error(result.error.message);
		}
		/**
		* Open one file-path label with the preferred editor, falling back to the
		* host's default open when the editor is gone or the spawn fails.
		* @param connection - browser connection handle (RPC + host API).
		* @param ctx - browser context with the session list store.
		* @param editorId - the preferred editor id.
		* @param pathLabel - the file path text shown on the clicked link.
		*/
		async function openWithPreferred(connection, ctx, editorId, pathLabel) {
			const snapshot = ctx.sessions.list.getSnapshot();
			const filePath = resolveWorkspacePath(snapshot.current === void 0 ? void 0 : snapshot.byId[snapshot.current]?.cwd, pathLabel);
			const result = await connection.rpc.call("/api", "editorLauncher/openWith", { args: {
				editorId,
				filePath
			} });
			if (result.ok && result.value.ok) return;
			await connection.api.host.openPath({ path: filePath });
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map