# @sjhmars/pi-ai-thinking

为原设置页创建的自定义模型自动添加思考强度选择器，不修改 DeepSeek Harness 源码，也不要求手改 `settings.yaml`。

插件在启动时和自定义模型保存后检查 `llm-pi-ai` 的 user 配置。只要 provider 有 `models` 列表且协议为 `openai-completions`、`openai-responses` 或 `anthropic-messages`，每个模型都会获得 `off`、`low`、`high`、`max` 四档。

默认强度是 `off`：安装插件不会自动消耗思考 token。之后直接在 Harness 原有的模型选择器中选择 `low`、`high` 或 `max` 即可开启思考。

## 安装

```sh
dsh plugin --profile web add @sjhmars/pi-ai-thinking
dsh plugin --profile desktop add @sjhmars/pi-ai-thinking
```

安装后重启对应的 Web 或 Desktop 客户端。

## 使用

1. 在 Harness 原有的“自定义提供方”页面填写地址、协议、模型和密钥。
2. 保存后，插件会在用户配置层补齐思考能力。
3. 在原有模型选择器中选择 `off`、`low`、`high` 或 `max`。

插件不读取或写入 API Key。密钥仍由 Harness 的 credentials 服务管理。

## 协议映射

| 协议 | `off` | `low` / `high` / `max` |
| --- | --- | --- |
| `openai-completions` | 由 pi-ai 按模型兼容信息关闭或省略思考参数 | 将同名档位交给 pi-ai 序列化 |
| `openai-responses` | `reasoning.effort: "none"` | `reasoning.effort` 使用同名档位 |
| `anthropic-messages` | `thinking.type: "disabled"` | 传统预算式模型：`low` 为 2,048 token，`high` 与 `max` 为 16,384 token；自适应思考模型由 pi-ai 发原生 effort |

`anthropic-messages` 的传统预算式 API 只有 `minimal`、`low`、`medium`、`high` 四个预算级别，因此 `max` 与 `high` 使用同一预算。

## 配置

默认不会替换用户已有的 `reasoningEfforts`。只有需要强制使用本插件预设时，才在 profile patch 中设置 `force: true`：

```yaml
- id: pi-ai-thinking
  config:
    force: true
```

## 本地联调

```sh
cd H:\dsh-plugin
pnpm --filter @sjhmars/pi-ai-thinking run build
pnpm dsh web --patch H:\dsh-plugin\plugins\pi-ai-thinking\dev.cordis.yml --port 3080
```

`dev.cordis.yml` 是本机 overlay，包含绝对 `file:///` 路径，不应发布或提交。

## 限制

- 协议不能说明目标模型实际支持哪些档位。若网关或模型不支持用户选中的档位，目标服务会拒绝该请求。
- 插件不会修改 `thinkingFormat`、其他 `compat` 字段、协议类型或 endpoint；它不会把 Chat Completions 翻译成 Responses，或反向翻译。
- 官方 `deepseek-official` 路由已内置思考强度，不需要本插件。
