# @sjhmars/task-notify

切到别的窗口时也能知道 Agent 在等你：任务做完、工具要你批准、或向你提问，都会在桌面右下角弹出通知。Web 和 Desktop 共用这一条 Host 插件，不向浏览器申请通知权限。

Shows a desktop notification when an agent finishes a task, when a tool asks you to allow or deny, or when the agent asks you a question. One Host plugin for Web and Desktop; no browser Notification permission.

## 你会看见什么 / What you see

- **任务结束**：系统通知。标题是「任务已完成」一类，正文是最近一段回复的预览。
- **批准工具（Windows 上的 `dsh web`）**：从屏幕右边滑出一张和 Windows 系统通知相近的卡片，配色跟任务栏 / 通知中心（不是应用窗口的浅色主题）。卡片上有 **拒绝**、**允许一次**，右上角有关闭 ×。
  - 点 **允许一次** 或 **拒绝**：这次直接按你的选择执行，网页黄框不再出现。
  - 点 **×**：马上把决定权交给网页黄框。关掉不是拒绝。
  - 一直不点：大约 10 秒后卡片消失，同样出网页黄框。
- **向你提问**：只弹系统通知提醒你去看屏幕，没有这两个按钮。
- **Desktop（Electron）**：走应用自己的通知。点一下会唤回窗口；批准仍在应用里点。带按钮的审批卡片只在 Windows 的 `dsh web` 上出现。

默认不通知 subagent。等人批准时任务还在跑，处理完后再弹「任务已完成」。

## 工作原理 / How it works

- **接口** `DesktopNotifier`（`ctx.taskNotify.notify`）：标题、正文、声音。
- **提供方** `HostDesktopNotifier`：Desktop 优先 Electron Notification（点击可唤回窗口）；`dsh web` 在 Windows 走一条常驻通知通道，在 macOS 走 `osascript`（macOS 通道已实现，本仓库不验收）。
- **Windows Web 的两条样子**
  - 任务结束、提问：系统 WinRT 通知。
  - 批准工具：独立弹出右下角卡片（从右边滑入 / 滑出），版式对齐系统通知；点按钮把「允许一次 / 拒绝」写回 Host，点 × 或超时则交给网页黄框。
- **消费者**
  - `agent/status`：先 `running` 再 `idle` 视为一段任务结束（不是每一次 `turn/end`）。
  - `approval/request` waterfall（`prepend`）：Harness 要出黄框的同一时刻先出卡片。点了两个按钮就短路裁决；关掉或超时再 `next()` 出黄框。
  - 包一层 `userQuestions.ask`：覆盖 `ask_user_question` 和计划审阅。不注册第二套提问 provider。

## 配置 / Config

写在 profile 的 `cordis.patch.yml` 或 overlay 的 `config` 里，非法值加载失败：

```yaml
- insert:
    - id: task-notify
      name: '@sjhmars/task-notify'
      config:
        enabled: true
        notifyOnIdle: true
        notifyOnApproval: true
        notifyOnQuestion: true
        notifySubagents: false
        skipWhenFocused: false
        title: DeepSeek Harness
        sound: true
        previewMaxChars: 120
        approvalWaitMs: 10000
```

`skipWhenFocused` 仅 Desktop/Electron 能判断窗口是否在前台；Web 浏览器无法从 Host 得知，始终会弹。`approvalWaitMs` 是审批卡片最长等待（默认 10000 毫秒）；关掉会立刻出网页黄框，超时同样出黄框，都不是拒绝。

## 安装 / Install

发布到 npm 之后用**包名**安装，不要把本仓库目录 link 进 profile：

```sh
dsh plugin --profile web add @sjhmars/task-notify
dsh plugin --profile desktop add @sjhmars/task-notify
```

## 本地联调 / Local overlay

不要执行 `dsh plugin add H:\dsh-plugin\plugins\task-notify`（那是 pnpm `link:`）。构建后用客户端 overlay。模块路径必须是绝对路径；Windows 上还要写成 `file:///` URL，否则 Node 会把 `H:/...` 当成协议 `h:` 而拒绝加载。

```sh
cd H:\dsh-plugin
pnpm --filter @sjhmars/task-notify run build
```

**Web：** `--patch` 必须写在 `--port` 前面。本机 overlay 文件是 `dev.cordis.yml`（含这台电脑的路径，不进 git）：

```sh
node apps/cli/lib/bin.js web --patch H:\dsh-plugin\plugins\task-notify\dev.cordis.yml --port 3080
```

在 harness 仓库里也可以：`pnpm dsh web --patch H:\dsh-plugin\plugins\task-notify\dev.cordis.yml --port 3080`。

**Desktop：** 没有 `--patch`。把本机 overlay 的 `insert` 写进 home 级 `$DSH_HOME/cordis.patch.yml`（缺省是 `~/.dsh/cordis.patch.yml`），重启桌面客户端。测完删掉该段，避免本机路径一直留着。

改代码后重新 build，再重启对应客户端。审批卡片脚本在 `lib/`，只刷新网页不够。

## 构建 / Build

```sh
cd H:\dsh-plugin
pnpm install
pnpm --filter @sjhmars/task-notify run build
```

`@deepseek-ai/*` 是 peerDependencies，运行时由 harness 安装树提供。

Windows 通知顶栏显示 **DeepSeek Harness** 和产品图标。Host 加载时准备一条常驻 PowerShell 通道：快捷方式和 AUMID 只在缺或坏了时登记，之后任务结束 / 提问只弹出系统通知。审批卡片由另一条 Hidden PowerShell 画出，避免助手进程自己没有窗口导致卡片出不来。

## 已知限制 / Known Limitations

- **Linux 不弹通知** — 失败记日志，插件照常加载。
- **macOS `osascript` 通道未在本机验收** — 代码路径存在；Desktop 上优先走 Electron。
- **不注册第二套 userQuestions provider** — 每个上下文只能有一个；本插件只包一层已有的 `ask()`。
- **关掉通知 ≠ 拒绝** — 点「允许一次 / 拒绝」才直接裁决。关掉卡片或等到超时，把决定权交给网页黄框。
- **审批卡片和网页黄框不能同时点** — 点了卡片按钮就不出这次黄框；黄框出现时卡片这条路已经结束。两边同时可点需要改 Harness。
- **Electron / macOS 审批通知不带按钮** — Desktop 点通知仍只唤回窗口，批准还是在应用里点。Linux 仍不弹。
