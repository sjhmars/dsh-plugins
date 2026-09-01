# @sjhmars/happy-bridge

> **Remote-control bridge for the Happy mobile app.** Pair an already-running `dsh web` / DeepSeek Harness desktop client with [Happy App](https://github.com/slopus/happy) by scanning a QR code, then remote-control the **same harness sessions** from your phone over the Happy encrypted relay: send messages and images, read replies, approve tool calls / plan reviews / questions, stop a running turn, and switch models. Four grant levels: `watch` / `chat` / `approve` / `full`. "Bridge" here means the remote-control link between desktop harness and phone — not a card game.

电脑照常跑 `dsh web` / 桌面客户端。装上这个插件并扫码后，手机 [Happy App](https://github.com/slopus/happy) 遥控的是**同一套对话**（发消息、看回复、点批准），不是另开一个 agent。

不安装 Happy CLI。不要用 `happy acp -- dsh acp`。本插件不改 DeepSeek Harness 源码，也不改 Happy 官方仓库。

## 你会看见什么

设置 → **插件** → **Happy 远程**：

- 未配对：二维码 + 可复制的手机/网页链接。请在 **Happy App 里扫**，不要用系统相机。
- 已配对：显示已连接，可断开或点 **重新配对** 再出一张新二维码。断开只关掉 Happy 映射，网页 UI 还在。
- **手机能管多深**：只看 / 能聊 / 能批 / 完整。默认「能批」。改到 `danger-full-access`、以及让手机换模型和思考强度同步到电脑输入框，都需要「完整」。电脑上换模型和思考强度不需要这个档。两边都能切，会互相跟着变。网页加了新模型后，已经同步到手机的旧对话名单也会更新。改档位立刻生效，不必重新配对。

手机 Happy App：

- 列表里看到本机普通会话（子 agent 不镜像）。侧栏里没点开的对话同样保持在线心跳。网页上的空白「新会话」占位（没发过第一条消息、网页未选中时会藏起来）不会出现在手机上；发出第一条之后才会镜像。在手机里给这样的对话发消息，会把它在电脑上唤醒（网页不必跟着切过去），并用这场对话上次用过的模型生成回复；没有记录就用网页默认模型。连着电脑时是在线；心跳断了会显示未在线。网页侧栏还在的对话会自动把心跳续上；手机点开这条未在线对话也会重新接通，不必先去网页点开。标题优先用网页会话名，没有就用第一条用户消息；空对话和网页一样叫「新会话」。列表按网页工作区分组，不会把 Windows 盘符路径堆成一坨。网页归档的对话会停心跳、进手机归档列表；从归档里打开或再发一条，网页侧栏会把这场对话显示回来。
- 打开空的 Happy 会话时，会把网页里已有的用户/助手/工具记录补进去。之后网页新消息也会推到手机。从手机新建或唤醒一场对话时，首轮请求会补上明确的思考强度（网页正在用的档，否则模型默认档），并同时认消息里的 `effort` / `effortLevel`，避免第一段思考被写成正文。
- 新建：只能选已经在网页登记过的工作区。不会在磁盘上 mkdir。App 里「new worktree」会失败（故意不暴露 bash）。
- 发文字：已注册 `/命令` 走命令通道；否则当聊天。`/skill名` 仍当普通消息，由 harness 注入。
- 发图片：相册/拍照/粘贴后，会随下一条文字（也可以只发图）进同一场电脑对话，模型能看见图。`.java` / `.txt` 等普通文件会先下载到工作区 `happy-inbox/`，再走电脑原来的 `read` 工具读内容（和你在仓库里打开一个文件一样）。PDF、Word 这类不是纯文本的文件，电脑的 `read` 会拒绝，插件也不会自己拆文档。远程档至少「能聊」。输入框左边应有图片按钮；发出后电脑网页会出现图片，手机会转圈等回复。电脑网页贴的图也会按同一套加密上传推到手机。
- 工具批准、计划审阅、选择题：和网页黄框/提问框赛跑，谁先点谁算。手机点「始终允许」只在这次网页进程里记住。提问还在等的时候，用输入框打字等于自己填；审阅计划时打字会关掉审阅，这句话当普通聊天发出去。远程档至少「能批」才能从手机点。
- 电脑正在生成时，手机可以点停止（Happy App 的 Stop）。远程档至少「能聊」。只看档点了不会停。
- 助手回复按整段推到手机（生成中会转圈）。思考收成一行 **Think · 摘要** 的 Note 卡片，点进去看全文。工具用 Happy 认识的名字（Grep / Read / Bash），描述跟网页那一行摘要一样。Happy 没有网页同款图标。

## 安装

发布后：

```sh
dsh plugin --profile web add @sjhmars/happy-bridge
dsh plugin --profile desktop add @sjhmars/happy-bridge
```

设置里的二维码卡片是浏览器半边：必须按包名装进 profile，Harness 才能扫到 `dsh.client` 和 `exports["./client"]`。只 `--patch` 一个 `file:///` 文件只能挂上 Host，页面上不会出现入口。

## 本地联调

```sh
cd H:\dsh-plugin
pnpm --filter @sjhmars/happy-bridge run build
```

在 Harness 仓库把本插件目录装进 web profile（file: 依赖，不是把整个插件仓库 pnpm link 进去），然后**不要**再带 `--patch`：

```sh
cd H:\deepseek-harness
pnpm dsh plugin --profile web add H:\dsh-plugin\plugins\happy-bridge
pnpm dsh web --port 3080
```

打开设置 → 插件 → 插件配置，应出现 **Happy 远程** 卡片。在 Happy App 里扫码。扫码后手机应能看到本机会话、发消息、收回复。关掉插件或点断开，网页对话不受影响。

卸掉本地安装：`pnpm dsh plugin --profile web remove @sjhmars/happy-bridge`。

凭据优先读 `~/.happy/access.key`（如果以前用过 Happy CLI）；否则写到 `%USERPROFILE%\.dsh\happy-bridge\`。

## 配置

```yaml
- insert:
    - id: happy-bridge
      name: '@sjhmars/happy-bridge'
      config:
        enabled: true
        serverUrl: https://api.cluster-fluster.com
        appUrl: https://app.happy.engineering
        pairOnStart: true
        remoteGrant: approve
```

`remoteGrant`：`watch` | `chat` | `approve` | `full`。设置页下拉框会写入这份配置。会话里也可以 `/remote approve`（只改当前进程，不写设置）。档位「完整」时，手机换模型和思考强度走电脑同一条 `session.selectModel`，网页模型栏和推理等级会跟着变。电脑自己换模型和思考强度同样会写回手机。网页加了新模型后，已镜像的手机会话会重新收到完整名单。

## 已知限制

- 第 1 期 `listDirectory` 只列出已登记工作区根，不能在手机里浏览仓库内部文件。
- 不注册 `bash` / `writeFile` / `ripgrep`，App「new git worktree」不可用。
- 助手正文仍按整段推送：Happy 的每条 `text` 都是独立气泡，逐 token 推会变成一行一字。
- 电脑回合失败时，手机会收到一条「电脑没生成回复」说明，而不是空着。
- Happy 官方会藏掉 `thinking: true` 正文和名为 `think` 的工具，所以思考做成可点开的 Note 卡片，不是原生折叠思考。
- 手机 App 列表往往只有「归档」没有「删除」。空白「新会话」点归档会从列表拿掉。已经聊过的对话点归档：手机进归档列表，网页侧栏也藏起来。在手机归档列表里打开或再发一条，会重新接通，网页侧栏也会把这场对话显示回来。网页自己点归档同样会停手机心跳；手机再恢复时网页侧栏也会回来。
- 本插件连的是 Happy 云中继，服务器看不到明文，但需要网络。
- 旧版镜像出来的空会话：重启网页后插件会删掉这些空白占位，不会再出现。如果手机上仍留着一条空的「新会话」，左滑删掉即可，这次不会再长回来。
- 手机上多出一条名叫仓库文件夹（例如 `deepseek-harness`）的对话、列表也不再按项目分组：那是旧版把空会话写成了文件夹名、又把 Windows 路径交给 Happy 分组。重启网页后会按工作区重新分组；那条假对话不会再生成，左滑删掉即可。
- 手机列表全部已断开 / 显示「非活动」：先看设置卡片是否出现「已接通对话 x/y」。x 为 0 时通道还没连上，等一会儿或重启网页。不要去扫配对二维码（那是连账号，不是唤醒旧对话）。手机请在 Happy App 里扫，不要用系统相机。
- 向 Happy 上报的 CLI 版本与官网 npm 包 `happy` 对齐（当前 1.2.0），避免 App 把插件当成旧 CLI 催更新。仍然不要 `npm install -g happy`。
- 手机上左滑归档空白占位不会再长回来。已经聊过的对话误点归档后，到归档列表打开或再发一条即可重新接通，网页侧栏也会回来。
- 手机列表里某场对话变成未在线 / 非活动，而网页侧栏还在：心跳断了。插件会把心跳续上；也可以在手机里点开这条对话重新接通。网页会话不会动。
- 从手机发出的文字不会再在聊天里回显一遍。
- 手机图片按 Happy 官方加密上传下载；电脑网页贴的图用同一套 blob 密钥加密后再 `request-upload` 推到手机。不是图片的附件只存到工作区 `happy-inbox/`，由电脑原来的 `read` 工具读取，不会当识图输入，也不会在插件里拆 PDF/Word。
