# 变更日志

[English](CHANGELOG.md) | [中文](CHANGELOG.zh.md)

本插件的所有重要变更都记在这里。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.1] - 2026-11-10

### 修复

- **装了本插件时网页版可能整页打不开。** 客户端 bundle 注册用的模块 id 是
  `dsh-github`，而加载器是按包名 `@ban-sky/dsh-github` 建行的，两者对不上。1.1.0
  合并安装包后这个问题变成致命：宿主模块表里还留着改名前的旧行时，同一份 bundle
  会被排队两次，第二次执行抛
  `duplicate factory registration for "dsh-github"`，该批次里它之后的模块（包括插件
  自己）全部加载失败。现在 bundle 以 `@ban-sky/dsh-github` 注册，与包名一致。已经
  出现旧 `dsh-github` 行的宿主还需重启一次 `dsh web` 才会清掉。
- User-Agent 改为 `dsh-github/1.1.1`。

## [1.1.0] - 2026-11-10

### 变更

- **安装包从两个合并成一个。** 以前每次发布同时挂
  `dsh-github-<版本>.tgz`（只有 Web UI）和 `dsh-github-<版本>-dsh-go.tgz`
  （额外带 DSH GO 界面），用户得先弄清自己在哪个宿主上。现在 `scripts/pack.mjs`
  只构建一个 `dsh-github-<版本>.tgz`，里面同时包含 Web UI、`dshGo` 协议 v1 清单和
  `lib/dsh-go.js`；`index.js` 只有在宿主提供了 `dshGo` 服务之后才动态导入该模块，
  所以网页版与桌面端依旧不会加载它。`SHA256SUMS.txt` 只列这一个文件。
- 1.1.0 的包同时取代 1.0.0 的两个包。覆盖安装同一个 bundle 不会多出第二个
  `github` 插件行。
- User-Agent 改为 `dsh-github/1.1.0`。

## [1.0.0] - 2026-11-10

### 新增

- **工作流文件是受支持的提交目标。** 通过 `commit`（带 `push`）对
  `.github/workflows` 下文件的新增、修改、删除已对着真实仓库端到端验证：既覆盖默认的
  “暂存全部改动”模式，也覆盖显式传 `files` 列表的模式；删除既支持已经 `git rm` 暂存的
  情况，也支持文件只从工作区消失、由 `add -A` 收进暂存区的情况。
- README 记录了这三种情况对应的具体动作。

### 变更

- 1.0.0 表示功能集已稳定：登录、创建仓库、克隆、本地与会话目录状态、拉取、fetch、
  提交、推送以及 agent 工具都已对着真实 GitHub API 验证过。
- User-Agent 改为 `dsh-github/1.0.0`。

## [0.4.2] - 2026-11-10

### 移除

- **不再适配插件市场。** 删掉了 `market/` 下的上架清单与提交说明，README 也不再
  介绍如何提交到 DSH GO 插件市场。`dshGo` 协议 v1 清单、DSH GO 面板
  （`lib/dsh-go.js`）与两个 Release 安装包都保留，从 npm 或 Release 安装的方式不变。

## [0.4.1] - 2026-11-09

### 修复

- **可以推送工作流文件了。** 登录时除 `repo` 外一并申请 `workflow` scope，提交涉及
  `.github/workflows` 时 `git push` 不再报 "refusing to allow an OAuth App to
  create or update workflow ... without `workflow` scope"。
- 旧版本留下的令牌只有 `repo`：设置页与 DSH GO 面板现在会检测缺失的 scope，说明涉及
  工作流文件的推送会被拒，并提供一键重新授权。账号、设置文件和本地仓库都不受影响。
- 因缺少 scope 被拒的推送现在返回 `workflow-scope-missing` 并给出可操作的提示，而不是
  笼统的 `push-rejected`。

## [0.4.0] - 2026-11-08

### 变更

- **npm 包名改成 `@ban-sky/dsh-github`。** DSH GO 插件市场只收 npm 上的精确版本，
  而 `dsh-github` 这个包名在 npm 上已经属于其他发布者。GitHub Release 的安装包照旧
  可用；如果你用旧包名通过 `install_bundle` 装过 0.3.0，先把它卸掉，因为 `github`
  这条插件行不能同时挂载两份。
- `package.json` 去掉了 `private`，并声明 `publishConfig.access: public`，可以发布。

### 新增

- **DSH GO 插件市场信息。** `dshGo.minApp` 为 `1.0.13`；
  `market/dsh-go-market.json` 是提交到
  [ccch1mneyyy/dsh-go-market](https://github.com/ccch1mneyyy/dsh-go-market) 的条目
  （在那个仓库里复制成 `plugins/@ban-sky__dsh-github.json`）。
- 发版工作流在有 `NPM_TOKEN` 密钥时把该标签的版本发布到 npm（带 provenance）；
  没有密钥时给出警告，仍然上传 GitHub Release 附件。

## [0.3.0] - 2026-11-08

### 新增

- **每次发布出两个安装包。** `scripts/pack.mjs` 从同一份源码构建两个包，推
  `v*` 标签时由 `.github/workflows/release.yml` 挂到 GitHub Release：
  `dsh-github-<版本>.tgz` 给 DSH 网页版 / 桌面端（只有 Web UI），
  `dsh-github-<版本>-dsh-go.tgz` 给 DSH GO 手机 App。网页版包不含
  `lib/dsh-go.js` 和 `dshGo` 清单，`index.js` 按需加载，所以两个包都不带用不上的
  代码。
- **DSH GO 原生界面。** 在提供 `dshGo` 服务的宿主上，插件会注册一个原生面板
  （账号状态、设备码登录、Agent 工具开关，以及会话目录的刷新/更新/拉取/推送/
  提交/克隆/新建并推送），外加三个输入框入口：Client ID、提交信息、`owner/name`
  都从消息框取。两套界面共用同一个服务实例，凭据记录与设置文件都只有一份；没有
  `dshGo` 的宿主行为不变。
- 只有当 App 上报 `form` 与 `textField` 组件能力时才画原生表单；否则面板改为说明
  这些输入框入口——点不动的表单比没有表单更糟。

## [0.2.1] - 2026-11-08

### 修复

- **手机网页版的按钮。** 窄屏（视口 ≤ 640px）下 GitHub 按钮折叠成 26px 的分支图标，
  不再把标签挤成竖排。标签仍以视觉隐藏的方式留在 DOM 里，控件保留无障碍名称；
  `flex:none` 与 `white-space:nowrap` 让它不会被任何窄容器压扁。
- **会话面板里的过期令牌。** 令牌过期时，输入框下方的入口改为显示登录提示，而不是
  一组只会以 `token-invalid` 失败的操作按钮。
- 手机上对话框的内边距更紧凑，最大高度更高。

## [0.2.0] - 2026-11-06

### 新增

- **会话目录操作。** 输入框上方的 GitHub 按钮作用于当前会话的工作目录：把
  `owner/name` 克隆到 `<会话目录>/<name>`、创建仓库并把该目录发布出去
  （`git init -b main`、origin、提交、推送）、拉取（`--ff-only`）、更新
  （`git fetch --prune`）、提交、推送。
- 客户端只发送 `sessionId`；Host 通过 `agents` 与 `workingDirectory` 服务解析目录，
  用 `realpath` 复核，对未知或未激活的会话返回 `session-not-found`。
- 目录本身不是仓库时，只有当它里面恰好有一个直接子仓库（也就是刚克隆的那个）才沿用它；
  有多个子仓库时不作猜测。

### 修复

- `runGit` 现在给子进程服务传显式的 `cwd`（它要求这个参数）。缺了它，真实运行时每次
  git 调用都会以 `Cannot read properties of undefined (reading 'includes')` 失败。
- 拉取/推送/提交拒绝在错误的仓库里执行，也绝不碰带内嵌凭据的 remote。

## [0.1.0] - 2026-11-05

### 新增

- 首个版本：通过 DSH 的授权与凭据服务完成 GitHub 设备码登录，一个
  `设置 → GitHub` 页面（登录、仓库列表、创建、克隆到克隆根目录、本地检出状态、
  拉取、提交、推送），以及可选的 `github` agent 工具。
- 安全基线：令牌只存在 DSH 凭据库，经子进程环境变量加一次性内联 credential helper
  交给 git，所有路径与 remote 都在 Host 侧校验，所有错误都脱敏。
