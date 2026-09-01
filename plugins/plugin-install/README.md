# `@sjhmars/plugin-install`

在设置 → 插件里用 **npm 包名** 安装树外 dsh 插件（与 `dsh plugin --profile <name> add <包名>` 相同：profile 目录 `pnpm add`，再按 `dsh.bundle` 写入 `dsh.profile.bundles`）。

**web 和 desktop 是两套互不相通的 profile。** 网页版写入 `web`；桌面客户端写入 `desktop`。在浏览器里装的插件不会出现在桌面客户端，反之亦然。

面板不接受路径、`github:`、`file:`;包名可带 `@版本` 后缀(dist-tag、semver 或范围)。安装与更新版本都会**热挂载/热替换**(卸掉官方包名行和上次 `file://?hot=` 行后再挂;界面刷新页面即可)。更新本安装器自己只写入 profile，需重启。热挂载走 `ctx.loader.create`,以插件默认配置挂载——bundle patch 带 row 配置或覆盖其他行的插件,完整组合以下次重启为准。

## 安装本包

网页版（之后设置里装别人的包也进 `web`）：

```sh
dsh plugin --profile web add @sjhmars/plugin-install
```

未发布时用 `add <tarball>`。不要 `add` 本仓库插件源码目录。

桌面客户端把本包写进 `dsh-desktop-app` 组合，打包后第一次打开即可使用，不必再 `dsh plugin add`。设置里再装别人的包进 `desktop`，等价于：

```sh
dsh plugin --profile desktop add <包名>
```

不要对桌面客户端执行 `dsh plugin --profile web add`：那是网页版的目录。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `profile` | `web` | 写入的 profile 名。网页版保持 `web`；桌面组合写成 `desktop`。 |
