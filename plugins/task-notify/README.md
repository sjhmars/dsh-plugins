# @sjhmars/task-notify

Agent 任务结束后、以及等你批准或回答时，弹出系统桌面通知。Web 与 Desktop 共用同一条 Host 插件。

Shows a system desktop notification when an agent finishes a task, when a tool asks you to allow or deny, or when the agent asks you a question. One Host plugin for both Web and Desktop.

## 工作原理 / How it works

- **接口** `DesktopNotifier`（`ctx.taskNotify.notify`）：标题、正文、声音。
- **提供方** `HostDesktopNotifier`：Desktop 优先 Electron Notification（点击可唤回窗口）；`dsh web` 在 Windows 走一条常驻 WinRT Toast 通道，在 macOS 走 `osascript`（macOS 通道已实现，本仓库不验收）。
- **消费者**
  - `agent/status`：先 `running` 再 `idle` 视为一段任务结束（不是每一次 `turn/end`）。
  - `approval/request` waterfall（`prepend`）：Harness 要出黄框的同一时刻弹系统通知。先只出气泡，先不弹黄框；点了「拒绝 / 允许一次」就直接裁决，黄框不再出现。关掉气泡或点空白会立刻 `next()` 出网页黄框；一直不点才等到超时（默认约 10 秒）后再出黄框。
  - 包一层 `userQuestions.ask`：覆盖 `ask_user_question` 和计划审阅。不注册第二套提问 provider。提问通知仍只提醒，没有这两个按钮。

默认不通知 subagent。等人时 agent 仍是 `running`，处理完后再弹「任务已完成」。

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

`skipWhenFocused` 仅 Desktop/Electron 能判断窗口是否在前台；Web 浏览器无法从 Host 得知，始终会弹。`approvalWaitMs` 是审批气泡最长等待（默认 10000）；关掉气泡会立刻出网页黄框，超时同样出黄框，都不是拒绝。

## 安装 / Install

发布到 npm 之后用**包名**安装，不要把本仓库目录 link 进 profile：

```sh
dsh plugin --profile web add @sjhmars/task-notify
dsh plugin --profile desktop add @sjhmars/task-notify
```

## 本地联调 / Local overlay

不要执行 `dsh plugin add H:\dsh-plugin\plugins\task-notify`（那是 pnpm `link:`）。构建后用客户端 overlay。模块路径必须是绝对路径；Windows 上还要写成 `file:///` URL，否则 Node 会把 `H:/...` 当成协议 `h:` 而拒绝加载：

```sh
cd H:\dsh-plugin
pnpm --filter @sjhmars/task-notify run build
```

**Web：**

```sh
pnpm dsh web --patch H:\dsh-plugin\plugins\task-notify\dev.cordis.yml
```

**Desktop：** 没有 `--patch`。把 [dev.cordis.yml](dev.cordis.yml) 里的 `insert` 写进 home 级 `$DSH_HOME/cordis.patch.yml`（缺省是 `~/.dsh/cordis.patch.yml`），重启桌面客户端。测完删掉该段，避免本机路径一直留着。

改代码后重新 build，再刷新或重启对应客户端。

## 构建 / Build

```sh
cd H:\dsh-plugin
pnpm install
pnpm --filter @sjhmars/task-notify run build
```

`@deepseek-ai/*` 是 peerDependencies，运行时由 harness 安装树提供。

Windows 气泡顶栏显示 **DeepSeek Harness** 和产品图标。Host 加载时准备一条常驻 PowerShell 通道：快捷方式和 AUMID 只在缺或坏了时登记，之后每条通知只弹出气泡，不再删快捷方式、也不再刷新桌面图标。完成通知弹出后通道继续活着，避免进程立刻退出把气泡丢掉。审批气泡用系统「提醒」样式，带「拒绝 / 允许一次」两个按钮。

## 已知限制 / Known Limitations

- **Linux 不弹通知** — 失败记日志，插件照常加载。
- **macOS `osascript` 通道未在本机验收** — 代码路径存在；Desktop 上优先走 Electron。
- **不注册第二套 userQuestions provider** — 每个上下文只能有一个；本插件只包一层已有的 `ask()`。
- **关掉通知 ≠ 拒绝** — 点「允许一次 / 拒绝」才直接裁决。审批时从屏幕右边滑出和系统通知相近的卡片（不另开 PowerShell 窗口）。关掉卡片或等到超时，把决定权交给网页黄框。
- **审批气泡和网页黄框不能同时点** — 点了气泡就不出这次黄框；黄框出现时气泡这条路已经结束。两边同时可点需要改 Harness。
- **Electron / macOS 审批气泡不带按钮** — Desktop 点通知仍只唤回窗口，批准还是在应用里点。Linux 仍不弹。
