import Schema from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
//#region lib/types/macos-toast.js
/**
* macOS 系统通知：Web 宿主（普通 Node）走 osascript。
* AppleScript 字符串必须转义；本机不验收这条通道。
*/
/**
* 把用户文本放进 AppleScript 双引号字符串之前先收成一行再转义。
* 换行、回车和其他控制字符会拆开 `-e` 脚本，osascript 会失败。
*/
function escapeAppleScript(value) {
	return value.replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
/**
* 用 `osascript display notification` 弹出一条 macOS 通知。
* @param request - 标题、正文、是否出声。
* @returns 成功或稳定错误字符串。
*/
function showMacOsToast(request) {
	const title = escapeAppleScript(request.title);
	const source = `display notification "${escapeAppleScript(request.body)}" with title "${title}"${request.sound === false ? "" : " sound name \"default\""}`;
	return new Promise((resolve) => {
		const child = spawn("osascript", ["-e", source], { stdio: [
			"ignore",
			"ignore",
			"pipe"
		] });
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (error) => {
			resolve({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve({
					ok: true,
					channel: "osascript"
				});
				return;
			}
			const detail = stderr.trim();
			resolve({
				ok: false,
				error: detail === "" ? `osascript exited ${String(code)}` : detail
			});
		});
	});
}
//#endregion
//#region lib/types/windows-toast.js
/**
* 通过 Windows Runtime Toast API 弹出系统通知（Web 宿主走这条路径）。
* XML 以 UTF-8 Base64 传入，避免中文在环境变量里被 PowerShell 5 编码弄乱。
* 左上角来源图标来自开始菜单快捷方式的 AUMID，不在正文里塞产品图。
*/
/** 通知身份。换过一次以免沿用已缓存的无图标 AUMID。 */
const TOAST_APP_ID = "DeepSeek.Harness";
/** 通知中心和气泡顶栏显示的应用名。 */
const TOAST_DISPLAY_NAME = "DeepSeek Harness";
/** 把用户文本放进 Toast XML 之前先转义。 */
function escapeXml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
/** 打包在 `lib/` 的资源；overlay 加载时与 `lib/index.js` 同目录。 */
function resolveAsset(fileName) {
	const here = dirname(fileURLToPath(import.meta.url));
	const dirs = [
		here,
		join(here, ".."),
		join(here, "..", "assets"),
		join(here, "..", "..", "assets")
	];
	for (const dir of dirs) {
		const path = join(dir, fileName);
		if (existsSync(path)) return path;
	}
}
/** 用于画开始菜单小图标的产品 PNG。 */
function toastIconPath() {
	return resolveAsset("icon.png");
}
/**
* 组装 Toast XML。正文只有标题和文字，来源栏图标不走这里。
* 审批等待时带「拒绝」「允许一次」；关闭、点空白、超时都不走这两个 arguments。
* @param request - 标题、正文、是否出声、是否带审批按钮。
*/
function buildToastXml(request) {
	const title = escapeXml(request.title);
	const body = escapeXml(request.body);
	const audio = request.sound === false ? "<audio silent=\"true\"/>" : "<audio src=\"ms-winsoundevent:Notification.Default\"/>";
	if (request.approvalActions !== true) return `<toast><visual><binding template="ToastGeneric"><text>${title}</text><text>${body}</text></binding></visual>${audio}</toast>`;
	return `<toast scenario="reminder" activationType="foreground" launch="dismiss"><visual><binding template="ToastGeneric"><text>${title}</text><text>${body}</text></binding></visual><actions><action content="拒绝" arguments="rejected" activationType="foreground"/><action content="允许一次" arguments="allowed-once" activationType="foreground"/></actions>${audio}</toast>`;
}
//#endregion
//#region lib/types/toast-channel.js
/**
* Windows 通知通道：一个常驻 STA PowerShell。
* 身份（快捷方式 / AUMID）只在缺或坏了时登记；之后每条通知只发 XML。
*/
function resolveScript() {
	const here = dirname(fileURLToPath(import.meta.url));
	const dirs = [here, join(here, "..")];
	for (const dir of dirs) {
		const path = join(dir, "show-toast.ps1");
		if (existsSync(path)) return path;
	}
}
function b64utf8(value) {
	return Buffer.from(value, "utf8").toString("base64");
}
function newToastTag() {
	return `tn${Date.now().toString(36).slice(-8)}${Math.random().toString(36).slice(2, 6)}`;
}
/** 本机通知回传目录。 */
function toastClickDir() {
	const root = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
	return join(root, "DeepSeek Harness");
}
/**
* 这一次审批专用的点击回传文件，避免并行审批互相覆盖。
* @param tag - 本次 SHOW 的 tag。
*/
function toastClickPath(tag) {
	return join(toastClickDir(), `toast-click-${tag}.txt`);
}
/** 任务取消时通知助手结束等待，不杀掉常驻进程。 */
function requestToastAbort(path) {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "abort\n", "utf8");
	} catch {}
}
function removeToastClick(path) {
	try {
		unlinkSync(path);
	} catch {}
	try {
		unlinkSync(`${path}.ready`);
	} catch {}
}
/** 读走点击回传文件。只有允许/拒绝算数；关闭/超时写的 deferred 不算按钮。 */
function consumeToastClick(path) {
	if (!existsSync(path)) return void 0;
	try {
		const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
		unlinkSync(path);
		if (text.includes("allowed-once")) return "allowed-once";
		if (text.includes("rejected")) return "rejected";
	} catch {}
}
function parseLine(line) {
	const trimmed = line.replace(/^\uFEFF/, "").trim();
	if (trimmed === "ok") return {
		ok: true,
		channel: "windows-toast"
	};
	if (trimmed === "allowed-once" || trimmed === "rejected" || trimmed === "deferred") return {
		ok: true,
		channel: "windows-toast",
		action: trimmed
	};
	if (trimmed.startsWith("error ")) return {
		ok: false,
		error: trimmed.slice(6).trim() || "toast helper error"
	};
	return {
		ok: false,
		error: trimmed === "" ? "empty toast helper reply" : trimmed
	};
}
/** 常驻 PowerShell 通知助手。同一时刻只处理一条 SHOW。 */
var ToastChannel = class {
	child;
	buffer = "";
	waiters = [];
	start;
	queue = Promise.resolve();
	ready = false;
	/**
	* 拉起助手进程；已在跑则立刻返回。
	*/
	ensureStarted() {
		if (this.ready && this.child?.pid !== void 0 && !this.child.killed) return Promise.resolve();
		if (this.start === void 0) this.start = this.spawnHelper().then(() => {
			this.start = void 0;
		}, (error) => {
			this.start = void 0;
			throw error;
		});
		return this.start;
	}
	/** 关掉助手。插件卸载时调用。 */
	dispose() {
		this.ready = false;
		this.start = void 0;
		const child = this.child;
		this.child = void 0;
		this.flushWaiters("error toast helper disposed");
		if (child === void 0) return;
		try {
			child.stdin?.write("QUIT\n");
		} catch {}
		child.kill();
	}
	/**
	* 排队弹出一条通知。
	* @param request - 标题、正文、可选审批等待。
	*/
	send(request) {
		return new Promise((resolve) => {
			this.queue = this.queue.then(async () => {
				try {
					resolve(await this.sendNow(request));
				} catch (error) {
					resolve({
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			});
		});
	}
	async sendNow(request) {
		try {
			await this.ensureStarted();
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		const child = this.child;
		if (child?.stdin == null) return {
			ok: false,
			error: "toast helper stdin is missing"
		};
		const wait = request.approvalActions === true;
		const waitMs = wait ? request.waitMs ?? 1e4 : 0;
		const tag = wait ? newToastTag() : "-";
		const clickFile = wait ? toastClickPath(tag) : "";
		const encoded = Buffer.from(buildToastXml(request), "utf8").toString("base64");
		const line = `SHOW ${String(waitMs)} ${tag} ${encoded}`;
		const timeoutMs = waitMs > 0 ? waitMs + 4e3 : 15e3;
		if (request.signal?.aborted === true) return {
			ok: true,
			channel: "windows-toast",
			action: "deferred"
		};
		let onAbort = () => {};
		const reply = this.waitLine(timeoutMs);
		onAbort = () => {
			if (clickFile !== "") requestToastAbort(clickFile);
		};
		request.signal?.addEventListener("abort", onAbort, { once: true });
		try {
			child.stdin.write(`${line}\n`);
			const result = parseLine(await reply);
			if (!wait) return result;
			if (result.ok && (result.action === "allowed-once" || result.action === "rejected")) return result;
			const extra = consumeToastClick(clickFile);
			if (extra !== void 0) return {
				ok: true,
				channel: "windows-toast",
				action: extra
			};
			return {
				ok: true,
				channel: "windows-toast",
				action: "deferred"
			};
		} catch (error) {
			this.killHelper();
			if (wait) return {
				ok: true,
				channel: "windows-toast",
				action: "deferred"
			};
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		} finally {
			request.signal?.removeEventListener("abort", onAbort);
			if (clickFile !== "") removeToastClick(clickFile);
		}
	}
	waitLine(timeoutMs) {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((waiter) => waiter !== onLine);
				reject(/* @__PURE__ */ new Error("toast helper timed out"));
			}, timeoutMs);
			const onLine = (line) => {
				clearTimeout(timer);
				resolve(line);
			};
			this.waiters.push(onLine);
		});
	}
	flushWaiters(line) {
		const waiters = this.waiters;
		this.waiters = [];
		for (const waiter of waiters) waiter(line);
	}
	killHelper() {
		this.ready = false;
		this.start = void 0;
		const child = this.child;
		this.child = void 0;
		this.flushWaiters("error toast helper killed");
		child?.kill();
	}
	spawnHelper() {
		return new Promise((resolve, reject) => {
			const scriptPath = resolveScript();
			if (scriptPath === void 0) {
				reject(/* @__PURE__ */ new Error("show-toast.ps1 is missing from the plugin bundle"));
				return;
			}
			const child = spawn("powershell.exe", [
				"-NoProfile",
				"-NonInteractive",
				"-STA",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				scriptPath
			], {
				windowsHide: true,
				env: {
					...process.env,
					DSH_TOAST_APP_ID: TOAST_APP_ID,
					DSH_TOAST_NAME_B64: b64utf8(TOAST_DISPLAY_NAME),
					DSH_TOAST_PNG_B64: b64utf8(toastIconPath() ?? "")
				},
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				]
			});
			this.child = child;
			this.buffer = "";
			this.ready = false;
			if (child.stdout === null || child.stdin === null) {
				child.kill();
				this.child = void 0;
				reject(/* @__PURE__ */ new Error("failed to pipe toast helper stdio"));
				return;
			}
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk) => {
				this.onStdout(String(chunk));
			});
			let stderr = "";
			child.stderr?.on("data", (chunk) => {
				stderr += String(chunk);
			});
			const timer = setTimeout(() => {
				this.killHelper();
				reject(/* @__PURE__ */ new Error("toast helper did not become ready"));
			}, 3e4);
			const onReady = (line) => {
				clearTimeout(timer);
				if (line.replace(/^\uFEFF/, "").trim() === "ready") {
					this.ready = true;
					resolve();
					return;
				}
				this.killHelper();
				reject(new Error(line.trim() === "" ? stderr.trim() || "toast helper failed to start" : line));
			};
			this.waiters.push(onReady);
			child.on("error", (error) => {
				clearTimeout(timer);
				this.ready = false;
				this.child = void 0;
				reject(error);
			});
			child.on("close", () => {
				this.ready = false;
				if (this.child === child) this.child = void 0;
				this.flushWaiters("error toast helper exited");
			});
		});
	}
	onStdout(chunk) {
		this.buffer += chunk;
		while (true) {
			const index = this.buffer.indexOf("\n");
			if (index < 0) break;
			let line = this.buffer.slice(0, index);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			this.buffer = this.buffer.slice(index + 1);
			if (line.trim() === "") continue;
			if (line.includes("EventRegistrationToken")) continue;
			const waiter = this.waiters.shift();
			if (waiter !== void 0) waiter(line);
		}
	}
};
const channel = new ToastChannel();
/**
* 插件加载时预热通道。失败不抛，留给第一次 notify。
*/
function ensureWindowsToastChannel() {
	if (process.platform !== "win32") return Promise.resolve();
	return channel.ensureStarted().catch(() => void 0);
}
/** 插件卸载时关掉常驻进程。 */
function disposeWindowsToastChannel() {
	channel.dispose();
}
/**
* 经常驻通道弹出 Windows 通知。
* @param request - 标题、正文、可选审批等待。
*/
function sendWindowsToast(request) {
	return channel.send(request);
}
//#endregion
//#region lib/types/notifier.js
/**
* 桌面通知提供方：Desktop 优先 Electron Notification（点一下能唤回窗口），
* 否则按平台走 Windows Toast 或 macOS osascript。
*/
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
/** 当前进程是否跑在 Electron 主进程里。 */
function isElectronMain() {
	return process.versions.electron !== void 0;
}
/**
* 动态加载 electron。Web 宿主没有这个模块，失败时返回 undefined。
*/
async function loadElectron() {
	if (!isElectronMain()) return void 0;
	try {
		return await import(__rewriteRelativeImportExtension("electron"));
	} catch {
		return;
	}
}
/**
* 当前是否有已聚焦的桌面窗口。仅 Electron 能判断；Web 浏览器无法从 Host 得知。
*/
async function isDesktopWindowFocused() {
	const electron = await loadElectron();
	if (electron === void 0) return false;
	return electron.BrowserWindow.getAllWindows().some((window) => window.isFocused());
}
/** Host 桌面通知提供方：Electron，否则 Windows / macOS 系统通知。 */
var HostDesktopNotifier = class {
	/**
	* 弹出一条通知：先试 Electron，再按平台回退。
	* Windows 审批等待时带按钮；Electron / macOS 忽略按钮，调用方视为未做决定。
	* @param request - 标题、正文、声音，以及可选的审批等待。
	*/
	async notify(request) {
		const electronResult = await this.notifyElectron(request);
		if (electronResult !== void 0) return electronResult;
		if (process.platform === "win32") return sendWindowsToast(request);
		if (process.platform === "darwin") return showMacOsToast(request);
		return {
			ok: false,
			error: `desktop notifications are unsupported on ${process.platform}`
		};
	}
	/**
	* 在 Electron 主进程弹出原生通知；点通知会唤回第一扇窗口。
	* @returns 未处于 Electron 或不受支持时返回 undefined，让调用方走下一条通道。
	*/
	async notifyElectron(request) {
		const electron = await loadElectron();
		if (electron === void 0) return void 0;
		if (!electron.Notification.isSupported()) return void 0;
		try {
			const notification = new electron.Notification({
				title: request.title,
				body: request.body,
				silent: request.sound === false
			});
			notification.on("click", () => {
				const window = electron.BrowserWindow.getAllWindows()[0];
				if (window === void 0) return;
				window.show();
				window.focus();
			});
			notification.show();
			return {
				ok: true,
				channel: "electron"
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
};
//#endregion
//#region lib/types/index.js
/**
* Host 半部：桌面通知能力 = 接口（DesktopNotifier）+ Electron/Windows/macOS
* 提供方 + 三类消费者（任务结束、权限审批、向用户提问）。
* Web 与 Desktop 共用同一条 Host 组合，无需浏览器 Notification 权限。
* （样式复测：新样式卡片，点任意按钮验证。）
* @module @sjhmars/task-notify
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
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Cordis 插件名。 */
const name = "task-notify";
/** 等 agent 注册表就绪后再挂监听。 */
const inject = ["agents"];
/** Schemastery 校验；缺省字段在加载时填入默认值。 */
const Config = Schema.object({
	enabled: Schema.boolean().default(true),
	notifyOnIdle: Schema.boolean().default(true),
	notifyOnApproval: Schema.boolean().default(true),
	notifyOnQuestion: Schema.boolean().default(true),
	notifySubagents: Schema.boolean().default(false),
	skipWhenFocused: Schema.boolean().default(false),
	title: Schema.string().default("DeepSeek Harness"),
	sound: Schema.boolean().default(true),
	previewMaxChars: Schema.number().min(1).default(120),
	approvalWaitMs: Schema.number().min(1).default(1e4)
});
/** 截断正文预览。 */
function truncate(text, maxChars) {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}…`;
}
/** 把 turn/end 的 kind 翻成用户能看懂的一句中文。 */
function outcomeLabel(kind) {
	switch (kind) {
		case "completed": return "任务已完成";
		case "error": return "任务出错";
		case "aborted": return "任务已停止";
		case "blocked": return "任务被拦截";
		case "max-tokens": return "输出达到上限";
		case "interrupted": return "任务已中断";
		default: return "任务已结束";
	}
}
/** 从日志里取最近一次 turn/end 的 kind；没有则当作完成。 */
function lastTurnKind(events) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type === "turn/end") return event.data.reason.kind;
	}
	return "completed";
}
/** 从日志里取最近一条会话标题（不依赖 sessionTitle 服务）。 */
function lastSessionTitle(events) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event === void 0) continue;
		if (event.type !== "session/title") continue;
		const title = event.data.title;
		if (typeof title === "string" && title.trim() !== "") return title.trim();
	}
}
/** 从助手消息里抽出可见文本。 */
function assistantText(event) {
	const parts = [];
	for (const block of event.data.message.content) if (block.type === "text") parts.push(block.text);
	return parts.join("").trim();
}
/** 最近一条非空助手回复的截断预览。 */
function lastAssistantPreview(events, maxChars) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.type !== "assistant/message") continue;
		const text = assistantText(event);
		if (text === "") continue;
		return truncate(text, maxChars);
	}
}
/** 是否应跳过这个 agent（默认不通知 subagent）。 */
function skipAgent(agent, config) {
	if (agent === void 0) return false;
	return !config.notifySubagents && agent.session.header.origin === "subagent";
}
/** 带会话标题的通知抬头。 */
function titled(config, events) {
	if (events === void 0) return config.title;
	const sessionTitle = lastSessionTitle(events);
	return sessionTitle === void 0 ? config.title : `${config.title} · ${sessionTitle}`;
}
/**
* 把一次刚结束的 agent 活动收成通知标题和正文。
* @param agent - 刚回到 idle 的 agent。
* @param config - 插件配置。
*/
function buildIdleRequest(agent, config) {
	const events = agent.session.events;
	const outcome = outcomeLabel(lastTurnKind(events));
	const preview = lastAssistantPreview(events, config.previewMaxChars);
	const body = preview === void 0 ? outcome : `${outcome}：${preview}`;
	return {
		title: titled(config, events),
		body,
		sessionId: agent.id,
		sound: config.sound
	};
}
/**
* 权限审批问人时的通知文案。
* @param req - waterfall 里的只读审批请求。
* @param config - 插件配置。
*/
function buildApprovalRequest(req, config) {
	const reason = req.reason === void 0 || req.reason.trim() === "" ? void 0 : req.reason.trim();
	return {
		title: "需要你批准",
		body: truncate(reason === void 0 ? req.toolName : `${req.toolName}（${reason}）`, Math.min(config.previewMaxChars, 80)),
		sessionId: req.agent.id,
		sound: config.sound
	};
}
/**
* 向用户提问时的通知文案。
* @param request - userQuestions.ask 的原始请求。
* @param config - 插件配置。
*/
function buildQuestionRequest(request, config) {
	const first = request.questions[0];
	const prompt = first === void 0 ? "需要你回答" : first.question.trim();
	const prefix = first?.intent?.kind === "plan-review" ? "需要你审阅计划" : "需要你回答";
	const body = first === void 0 || prompt === "" ? prefix : `${prefix}：${prompt}`;
	return {
		title: titled(config, request.agent?.session.events),
		body: truncate(body, config.previewMaxChars),
		...request.agent === void 0 ? {} : { sessionId: request.agent.id },
		sound: config.sound
	};
}
/** 对外服务：实现 DesktopNotifier，同时把 notify 发布成 Typert Remote。 */
let TaskNotifyService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _notify_decorators;
	let _getEnabled_decorators;
	return class TaskNotifyService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_notify_decorators = [Remote("notify")];
			_getEnabled_decorators = [Remote("getEnabled")];
			__esDecorate(this, null, _notify_decorators, {
				kind: "method",
				name: "notify",
				static: false,
				private: false,
				access: {
					has: (obj) => "notify" in obj,
					get: (obj) => obj.notify
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getEnabled_decorators, {
				kind: "method",
				name: "getEnabled",
				static: false,
				private: false,
				access: {
					has: (obj) => "getEnabled" in obj,
					get: (obj) => obj.getEnabled
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
		notifier = __runInitializers(this, _instanceExtraInitializers);
		config;
		/**
		* @param ctx - Host 上下文。
		* @param notifier - 实际弹出系统通知的提供方。
		* @param config - 已校验的插件配置。
		*/
		constructor(ctx, notifier, config) {
			super(ctx, "taskNotify");
			this.notifier = notifier;
			this.config = config;
		}
		/**
		* 弹出一条桌面通知。其他插件也可调用。
		* @param request - 标题、正文、声音。
		*/
		async notify(request) {
			return this.notifier.notify(request);
		}
		/**
		* 当前总开关（只读镜像，改配置走 cordis.yml / overlay）。
		*/
		async getEnabled() {
			return this.config.enabled;
		}
	};
})();
/**
* 按需跳过聚焦窗口后弹出通知；失败只打日志，不影响 agent 循环。
*/
async function fire(ctx, service, config, request) {
	try {
		if (config.skipWhenFocused && await isDesktopWindowFocused()) return;
		const result = await service.notify(request);
		if (!result.ok) ctx.logger.warn(`task-notify: ${result.error}`);
	} catch (error) {
		ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* 弹出带按钮的审批气泡并等待。只有两个按钮返回裁决；关闭、超时、点空白、失败都是 deferred。
* @param req - 当前审批请求，用于文案和 abort。
* @returns 两个按钮算出裁决；其余情况都是 deferred。
*/
async function waitApprovalToast(ctx, service, config, req) {
	try {
		if (config.skipWhenFocused && await isDesktopWindowFocused()) return "deferred";
		const result = await service.notify({
			...buildApprovalRequest(req, config),
			approvalActions: true,
			waitMs: config.approvalWaitMs,
			...req.signal === void 0 ? {} : { signal: req.signal }
		});
		if (!result.ok) {
			ctx.logger.warn(`task-notify: ${result.error}`);
			return "deferred";
		}
		if (result.action === "allowed-once" || result.action === "rejected") return result.action;
		return "deferred";
	} catch (error) {
		ctx.logger.warn(`task-notify: ${error instanceof Error ? error.message : String(error)}`);
		return "deferred";
	}
}
/**
* 挂载 Host 半部：登记服务，并在任务结束、审批问人、向用户提问时弹出通知。
* @param ctx - Host 上下文。
* @param config - 已校验配置。
*/
function apply(ctx, config) {
	if (process.platform === "win32") {
		ensureWindowsToastChannel();
		ctx.effect(() => () => {
			disposeWindowsToastChannel();
		}, "task-notify: toast channel");
	}
	const notifier = new HostDesktopNotifier();
	const service = new TaskNotifyService(ctx, notifier, config);
	const seenRunning = /* @__PURE__ */ new WeakSet();
	for (const agent of ctx.agents.list()) if (agent.status === "running") seenRunning.add(agent);
	ctx.on("agent/status", ({ agent, status }) => {
		if (status === "running") {
			seenRunning.add(agent);
			return;
		}
		if (status !== "idle" || !seenRunning.has(agent)) return;
		seenRunning.delete(agent);
		if (!config.enabled || !config.notifyOnIdle) return;
		if (skipAgent(agent, config)) return;
		fire(ctx, service, config, buildIdleRequest(agent, config));
	});
	ctx.on("approval/request", async (req, next) => {
		if (!config.enabled || !config.notifyOnApproval || skipAgent(req.agent, config)) return next();
		const action = await waitApprovalToast(ctx, service, config, req);
		if (action === "allowed-once" || action === "rejected") {
			ctx.logger.info(`task-notify: approval toast ${action}`);
			return action;
		}
		ctx.logger.info("task-notify: approval toast deferred, yellow box next");
		return next();
	}, { prepend: true });
	ctx.inject(["userQuestions"], (inner) => {
		const questions = inner.userQuestions;
		const original = questions.ask;
		questions.ask = function wrappedAsk(request) {
			if (config.enabled && config.notifyOnQuestion && !skipAgent(request.agent, config)) fire(ctx, service, config, buildQuestionRequest(request, config));
			return original.call(this, request);
		};
		inner.effect(() => () => {
			questions.ask = original;
		}, "task-notify: restore userQuestions.ask");
	});
}
//#endregion
export { Config, TaskNotifyService, apply, buildApprovalRequest, buildIdleRequest, buildQuestionRequest, inject, name };
