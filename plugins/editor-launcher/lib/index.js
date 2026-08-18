import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
/**
* Host half of the editor launcher: detects installed editors and opens a
* file with a chosen one. Exposed to the browser through the Typert Gateway's
* SRC claim path (`TypertRemoteService` binding + `@Remote` markers), which is
* reachable from both the Web and Desktop carriers over the shared `/api`
* channel.
* @module @dsh/editor-launcher
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Stable Cordis plugin name (host half). */
const name = "editor-launcher";
/** No required services: detection and launching are pure process capabilities. */
const inject = [];
const CANDIDATES = [
	{
		id: "vscode",
		name: "Visual Studio Code",
		commands: ["code"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\Programs\\Microsoft VS Code\\Code.exe", process.env.PROGRAMFILES + "\\Microsoft VS Code\\Code.exe"],
			darwin: ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"],
			linux: [
				"/usr/bin/code",
				"/snap/bin/code",
				"/usr/share/code/bin/code"
			]
		},
		macApp: "Visual Studio Code"
	},
	{
		id: "vscode-insiders",
		name: "VS Code Insiders",
		commands: ["code-insiders"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe", process.env.PROGRAMFILES + "\\Microsoft VS Code Insiders\\Code - Insiders.exe"],
			darwin: ["/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders"],
			linux: ["/usr/bin/code-insiders", "/snap/bin/code-insiders"]
		},
		macApp: "Visual Studio Code - Insiders"
	},
	{
		id: "cursor",
		name: "Cursor",
		commands: ["cursor"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\Programs\\cursor\\Cursor.exe"],
			darwin: ["/Applications/Cursor.app/Contents/Resources/app/bin/cursor"],
			linux: ["/usr/bin/cursor", "/snap/bin/cursor"]
		},
		macApp: "Cursor"
	},
	{
		id: "windsurf",
		name: "Windsurf",
		commands: ["windsurf"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\Programs\\Windsurf\\Windsurf.exe"],
			darwin: ["/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf"],
			linux: ["/usr/bin/windsurf", "/snap/bin/windsurf"]
		},
		macApp: "Windsurf"
	},
	{
		id: "vscodium",
		name: "VSCodium",
		commands: ["codium"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\Programs\\VSCodium\\VSCodium.exe"],
			darwin: ["/Applications/VSCodium.app/Contents/Resources/app/bin/codium"],
			linux: ["/usr/bin/codium"]
		},
		macApp: "VSCodium"
	},
	{
		id: "sublime",
		name: "Sublime Text",
		commands: ["subl", "sublime_text"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\Sublime Text\\sublime_text.exe"],
			darwin: ["/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl"],
			linux: ["/usr/bin/sublime_text", "/opt/sublime_text/sublime_text"]
		},
		macApp: "Sublime Text"
	},
	{
		id: "notepadpp",
		name: "Notepad++",
		commands: ["notepad++"],
		paths: { win32: [process.env.PROGRAMFILES + "\\Notepad++\\notepad++.exe", process.env["PROGRAMFILES(X86)"] + "\\Notepad++\\notepad++.exe"] }
	},
	{
		id: "nvim",
		name: "Neovim",
		commands: ["nvim"],
		paths: {
			win32: [process.env.LOCALAPPDATA + "\\nvim\\bin\\nvim.exe"],
			linux: ["/usr/bin/nvim", "/snap/bin/nvim"]
		}
	},
	{
		id: "vim",
		name: "Vim",
		commands: ["vim"],
		paths: { linux: ["/usr/bin/vim"] }
	},
	{
		id: "idea",
		name: "IntelliJ IDEA",
		commands: ["idea"],
		appPaths: ["idea64.exe", "idea.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe"],
			darwin: ["/Applications/IntelliJ IDEA.app/Contents/MacOS/idea"],
			linux: ["/usr/bin/idea"]
		},
		macApp: "IntelliJ IDEA"
	},
	{
		id: "webstorm",
		name: "WebStorm",
		commands: ["webstorm"],
		appPaths: ["webstorm64.exe", "webstorm.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\WebStorm\\bin\\webstorm64.exe"],
			darwin: ["/Applications/WebStorm.app/Contents/MacOS/webstorm"],
			linux: ["/usr/bin/webstorm"]
		},
		macApp: "WebStorm"
	},
	{
		id: "pycharm",
		name: "PyCharm",
		commands: ["pycharm"],
		appPaths: ["pycharm64.exe", "pycharm.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\PyCharm\\bin\\pycharm64.exe"],
			darwin: ["/Applications/PyCharm.app/Contents/MacOS/pycharm"],
			linux: ["/usr/bin/pycharm"]
		},
		macApp: "PyCharm"
	},
	{
		id: "goland",
		name: "GoLand",
		commands: ["goland"],
		appPaths: ["goland64.exe", "goland.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\GoLand\\bin\\goland64.exe"],
			darwin: ["/Applications/GoLand.app/Contents/MacOS/goland"],
			linux: ["/usr/bin/goland"]
		},
		macApp: "GoLand"
	},
	{
		id: "datagrip",
		name: "DataGrip",
		commands: ["datagrip"],
		appPaths: ["datagrip64.exe", "datagrip.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\DataGrip\\bin\\datagrip64.exe"],
			darwin: ["/Applications/DataGrip.app/Contents/MacOS/datagrip"],
			linux: ["/usr/bin/datagrip"]
		},
		macApp: "DataGrip"
	},
	{
		id: "phpstorm",
		name: "PhpStorm",
		commands: ["phpstorm"],
		appPaths: ["phpstorm64.exe", "phpstorm.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\PhpStorm\\bin\\phpstorm64.exe"],
			darwin: ["/Applications/PhpStorm.app/Contents/MacOS/phpstorm"],
			linux: ["/usr/bin/phpstorm"]
		},
		macApp: "PhpStorm"
	},
	{
		id: "rubymine",
		name: "RubyMine",
		commands: ["rubymine"],
		appPaths: ["rubymine64.exe", "rubymine.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\RubyMine\\bin\\rubymine64.exe"],
			darwin: ["/Applications/RubyMine.app/Contents/MacOS/rubymine"],
			linux: ["/usr/bin/rubymine"]
		},
		macApp: "RubyMine"
	},
	{
		id: "clion",
		name: "CLion",
		commands: ["clion"],
		appPaths: ["clion64.exe", "clion.exe"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\JetBrains\\CLion\\bin\\clion64.exe"],
			darwin: ["/Applications/CLion.app/Contents/MacOS/clion"],
			linux: ["/usr/bin/clion"]
		},
		macApp: "CLion"
	},
	{
		id: "visual-studio",
		name: "Visual Studio",
		commands: [],
		vswhere: true,
		paths: {}
	},
	{
		id: "android-studio",
		name: "Android Studio",
		commands: ["studio"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\Android\\Android Studio\\bin\\studio64.exe"],
			darwin: ["/Applications/Android Studio.app/Contents/MacOS/studio"],
			linux: ["/usr/bin/studio", "/opt/android-studio/bin/studio.sh"]
		},
		macApp: "Android Studio"
	},
	{
		id: "zed",
		name: "Zed",
		commands: ["zed"],
		paths: {
			darwin: ["/Applications/Zed.app/Contents/MacOS/zed"],
			linux: ["/usr/bin/zed"]
		},
		macApp: "Zed"
	},
	{
		id: "emacs",
		name: "Emacs",
		commands: ["emacs"],
		paths: {
			win32: [process.env.PROGRAMFILES + "\\Emacs\\bin\\emacs.exe"],
			linux: ["/usr/bin/emacs"]
		}
	},
	{
		id: "kate",
		name: "Kate",
		commands: ["kate"],
		paths: { linux: ["/usr/bin/kate"] }
	},
	{
		id: "gedit",
		name: "gedit",
		commands: ["gedit"],
		paths: { linux: ["/usr/bin/gedit"] }
	},
	{
		id: "geany",
		name: "Geany",
		commands: ["geany"],
		paths: { linux: ["/usr/bin/geany"] }
	}
];
/** Detection result TTL: re-probing PATH + install paths on every menu open is
* the "每次点击都很卡" complaint; editors change rarely, so cache briefly. */
const DETECT_TTL_MS = 3e4;
let detectCache;
/** Resolve one CLI name to its first PATH hit, or undefined when absent. */
function resolveCommand(command) {
	const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
		encoding: "utf8",
		windowsHide: true
	});
	if (result.error !== void 0 || result.status !== 0) return void 0;
	return result.stdout.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() || void 0;
}
/**
* Windows: read one `App Paths` registry key and return the executable's real
* install path. The `(Default)` value holds the absolute path regardless of
* drive, which is how non-C-drive installs resolve. `reg query` is the
* shell-free builtin; output is `(Default) REG_SZ <path>`.
* @param exeName - registry key name, e.g. `idea64.exe`.
* @returns the path, or undefined when the key or value is absent.
*/
function resolveAppPath(exeName) {
	const result = spawnSync("reg.exe", [
		"query",
		`HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
		"/ve"
	], {
		encoding: "utf8",
		windowsHide: true
	});
	if (result.error !== void 0 || result.status !== 0) return void 0;
	const path = /REG_SZ\s+(\S.*)$/m.exec(result.stdout)?.[1]?.trim();
	return path !== void 0 && path !== "" && existsSync(path) ? path : void 0;
}
/**
* Windows: locate Visual Studio's `devenv.exe` via Microsoft's `vswhere`
* (ships with the VS Installer). VS instances can live on any drive, so fixed
* paths cannot find them; vswhere reports the authoritative install location.
* @returns the devenv.exe path, or undefined when no instance is found.
*/
function resolveVswhere() {
	const vswhere = process.env["PROGRAMFILES(X86)"] + "\\Microsoft Visual Studio\\Installer\\vswhere.exe";
	if (!existsSync(vswhere)) return void 0;
	const result = spawnSync(vswhere, [
		"-latest",
		"-products",
		"*",
		"-requires",
		"Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
		"-property",
		"productPath"
	], {
		encoding: "utf8",
		windowsHide: true
	});
	if (result.error !== void 0 || result.status !== 0) return void 0;
	const path = result.stdout.trim();
	return path !== "" && existsSync(path) ? path : void 0;
}
/** Probe one candidate on the current platform. */
function resolveCandidate(candidate) {
	if (process.platform === "win32") {
		for (const exeName of candidate.appPaths ?? []) {
			const path = resolveAppPath(exeName);
			if (path !== void 0) return {
				id: candidate.id,
				name: candidate.name,
				command: path
			};
		}
		if (candidate.vswhere === true) {
			const path = resolveVswhere();
			if (path !== void 0) return {
				id: candidate.id,
				name: candidate.name,
				command: path
			};
		}
	}
	if (process.platform === "darwin" && candidate.macApp !== void 0) {
		if (existsSync(`/Applications/${candidate.macApp}.app`)) return {
			id: candidate.id,
			name: candidate.name,
			command: "open",
			args: ["-a", candidate.macApp]
		};
	}
	for (const path of candidate.paths[process.platform] ?? []) if (path !== void 0 && existsSync(path)) return {
		id: candidate.id,
		name: candidate.name,
		command: path
	};
	for (const command of candidate.commands) {
		const resolved = resolveCommand(command);
		if (resolved !== void 0) return {
			id: candidate.id,
			name: candidate.name,
			command: resolved
		};
	}
}
/** Detect every editor on this machine, caching the result for the TTL. */
function detectEditors() {
	const now = Date.now();
	if (detectCache !== void 0 && now - detectCache.at < DETECT_TTL_MS) return detectCache.editors;
	const editors = CANDIDATES.flatMap((candidate) => {
		const resolved = resolveCandidate(candidate);
		return resolved === void 0 ? [] : [resolved];
	});
	detectCache = {
		at: now,
		editors
	};
	return editors;
}
/** The Remote service: browser-facing endpoints for detection and launching. */
let EditorLauncherService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _listEditors_decorators;
	let _openWith_decorators;
	return class EditorLauncherService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_listEditors_decorators = [Remote("listEditors")];
			_openWith_decorators = [Remote("openWith")];
			__esDecorate(this, null, _listEditors_decorators, {
				kind: "method",
				name: "listEditors",
				static: false,
				private: false,
				access: {
					has: (obj) => "listEditors" in obj,
					get: (obj) => obj.listEditors
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _openWith_decorators, {
				kind: "method",
				name: "openWith",
				static: false,
				private: false,
				access: {
					has: (obj) => "openWith" in obj,
					get: (obj) => obj.openWith
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		/**
		* Register the service under the `editorLauncher` context key.
		* @param ctx - Host context (the plugin apply context).
		*/
		constructor(ctx) {
			super(ctx, "editorLauncher");
			__runInitializers(this, _instanceExtraInitializers);
		}
		/**
		* List every detected editor on this machine (cached for the detection TTL).
		* @returns resolved editor entries in candidate order.
		*/
		async listEditors() {
			return detectEditors();
		}
		/**
		* Open one file with a previously detected editor.
		* @param editorId - editor id returned by {@link listEditors}.
		* @param filePath - absolute path to open.
		* @returns success, or a stable error string for an unknown editor or a failed spawn.
		*/
		async openWith(editorId, filePath) {
			const candidate = CANDIDATES.find((item) => item.id === editorId);
			if (candidate === void 0) return {
				ok: false,
				error: `unknown editor "${editorId}"`
			};
			const editor = resolveCandidate(candidate);
			if (editor === void 0) return {
				ok: false,
				error: `editor "${candidate.name}" is no longer available`
			};
			const args = [...editor.args ?? [], filePath];
			const lower = editor.command.toLowerCase();
			const shell = process.platform === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"));
			try {
				spawn(editor.command, args, {
					detached: true,
					stdio: "ignore",
					shell,
					windowsHide: true
				}).unref();
				return { ok: true };
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	};
})();
/**
* Mount the Host half: constructing the service registers it on the context,
* which is what makes its `@Remote` endpoints claimable through the Gateway.
* @param ctx - Host context.
*/
function apply(ctx) {
	new EditorLauncherService(ctx);
}
//#endregion
export { EditorLauncherService, apply, inject, name };
