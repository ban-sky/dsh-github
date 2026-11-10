# dsh-github

[English](README.md) | [中文](README.zh.md)

DeepSeek Harness Web UI 的 GitHub 插件。用 GitHub 官方 OAuth **设备码流程**登录，
然后在设置页里创建、列出、克隆、拉取、提交、推送仓库，或在任意会话的输入框
下方直接操作该会话目录里的仓库；可选地把同样的能力注册成 agent 工具。

安全优先：访问令牌只存在本机 DSH 凭据库中，绝不写进设置文件、git remote、
git config、命令行参数、日志或 Tool 返回值。

## 功能

- **官方登录** —— GitHub OAuth 设备码流程（`https://github.com/login/device`），
  插件不接触密码。
- **仓库管理** —— 列出账号可访问的仓库（自己的、协作者、组织成员），创建新仓库
  （公开/私有，可选初始化 README），把 `owner/name` 克隆到配置的克隆根目录。
- **本地检出** —— 查看分支、上游跟踪、ahead/behind、工作区改动；`git pull
  --ff-only`；提交指定路径（或全部改动）并推送。
- **会话目录操作** —— 每个会话的输入框旁有 GitHub 按钮：在会话工作目录里克隆仓库、
  新建仓库并推送（发布当前目录）、拉取、更新（fetch）和提交/推送。
- **工作流文件** —— `.github/workflows` 下的文件同样可以通过“提交 + 推送”新增、
  修改、删除（登录时申请 `workflow` scope；缺失时返回 `workflow-scope-missing`）。
- **Agent 工具**（`github`，默认关闭）—— 与设置页相同的操作，开启后模型可使用。
- **中英双语界面**，跟随 Harness 的界面语言。

## 前置条件

- Node.js 20+（Harness 已提供）。
- `PATH` 中有 `git`（仅 HTTPS remote）。
- 一个启用了 **Device flow** 的 GitHub **OAuth App**：一分钟配置，见下。
  （Client ID 是公开信息，不是密钥。）
- 未配置 OAuth App 时插件照常打开，会提示缺少什么，而不是静默失败。

## 安装

**从 npm 安装**：

在 Harness 里用 `plugin_manager` 的 `install_bundle`，target 写精确版本
`@ban-sky/dsh-github@1.0.0`。包名带 scope 是因为 `dsh-github` 在 npm 上已被他人
占用；Release 里的安装包内容相同。

**从 Release 下载安装包**（推荐）：

每次发布出两个包，按宿主挑一个，都解出 `package/`：

| 安装包 | 给谁用 |
| --- | --- |
| `dsh-github-<版本>.tgz` | DSH 网页版 / 桌面端：只有 Web UI |
| `dsh-github-<版本>-dsh-go.tgz` | DSH GO 手机 App：Web UI + 原生面板和输入框入口 |

在浏览器里登录 GitHub 后打开
[Releases](https://github.com/ban-sky/dsh-github/releases) 下载，或者用 GitHub CLI：

```bash
gh release download v1.0.0 -R ban-sky/dsh-github   # 需要先 gh auth login
sha256sum -c SHA256SUMS.txt
tar -xzf dsh-github-1.0.0.tgz                     # 网页版
tar -xzf dsh-github-1.0.0-dsh-go.tgz              # 手机用这个
```

> 私有仓库的 `releases/download/...` 直链只认浏览器登录态，API 令牌访问会
> 404；脚本里请用 `gh release download`，或调
> `GET /repos/ban-sky/dsh-github/releases/assets/<id>` 并带
> `Accept: application/octet-stream`。

然后在 Harness 里用 `plugin_manager` 的 `install_bundle` 指向解出的
`package/` 目录即可；DSH GO 也可以直接 `dsh plugin --profile web add /path/to/package`。

**从源码目录安装**：把本仓库目录作为 bundle 安装（设置 → 插件 → 从目录安装，
或 `plugin_manager` 工具的 `install_bundle`）。安装后：

- Host 端：`/api/github` 认证路由、`github` 授权流程，以及（开启后）`github` 工具。
- Client 端：一个 `设置 → GitHub` 页面。

## DSH GO

插件同时提供 DSH GO 原生界面：`package.json` 的 `dshGo` 协议 v1 声明原生面板与
输入框入口（`minApp` 1.0.13），`-dsh-go.tgz` 里带 `lib/dsh-go.js`。npm 上的包同时
包含 Web UI 与这套界面，因此 `@ban-sky/dsh-github` 对两种宿主都适用。

本插件不提交任何插件市场，分发渠道只有 npm 与 GitHub Release。

## 配置：创建 OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**。
2. Application name 任意，如 `DSH`；Homepage URL 填你自己的地址
   （`https://github.com/` 也可以）。
3. 在应用页面打开 **"Device flow"**。插件用的是设备授权，不依赖回调地址。
4. 复制 **Client ID**（`Iv1.…` 或 `Ov23…`）填入 **设置 → GitHub → Client ID** 并保存。

## 登录

1. 设置 → GitHub → **使用 GitHub 登录**。
2. 页面显示一次性设备码。打开 <https://github.com/login/device> 输入该码
   （插件只会把这一精确地址渲染成链接）。
3. 在 GitHub 上批准。页面会自动刷新并显示已登录账号。

申请的 scope 是 `repo`（含私有仓库的读写权限）和 `workflow`（允许推送创建或修改
`.github/workflows` 下的文件）。GitHub 的批准页会显示这两个 scope。

如果你是用旧版本登录的，已存授权只有 `repo`，GitHub 会拒绝任何涉及工作流文件的推送
（报 "refusing to allow an OAuth App to create or update workflow ... without
`workflow` scope"）。此时设置页会显示提示和 **重新授权** 按钮：再走一次设备码授权即可
补上 scope，账号、设置文件和本地仓库都不受影响。

退出登录会立即从凭据库删除授权记录，并让正在进行的操作失效。

## 会话目录操作

会话输入框下方的 GitHub 按钮只把 **sessionId** 发给 Host；Host 通过 agents 与
workingDirectory 服务自行解析该会话已提交的工作目录，客户端无法指定任意路径。

| 操作 | 说明 |
| --- | --- |
| 克隆 | 把 `owner/name` 克隆到 `<会话目录>/<name>`；目标已存在、非空、符号链接逃逸都会拒绝。 |
| 创建并推送 | 在账号下创建仓库（默认私有），在会话目录 `git init -b main`、添加 `origin`、提交并推送。仅当该目录本身是仓库根目录时执行；目录内已有仓库或位于别的仓库中会拒绝。 |
| 拉取 | 对会话目录里的仓库执行 `git pull --ff-only`。 |
| 更新 | `git fetch --prune`，刷新 ahead/behind，不改变工作区。 |
| 提交 | 提交全部改动（或指定文件），可选择随后推送。 |

会话目录本身不是仓库时，插件会识别目录里**唯一**的直接子仓库（即刚克隆的那个），
并在后续操作中沿用它；有多个子仓库时不作猜测。

### 工作流文件

`.github/workflows` 下的文件需要登录时申请的 `workflow` scope，除此之外与普通文件
没有区别。下面三种情况都已对着真实仓库验证：

| 场景 | 做法 |
| --- | --- |
| 新增 | 写好 `.yml`，然后 `commit` 带 `push: true`。不传 `files` 时插件执行 `git add -A`，新文件会被收进暂存区。 |
| 修改 | 改完 `.yml` 后同样 `commit` 带 `push: true`（暂存规则一致）。 |
| 删除 | 先 `git rm` 再提交，或者直接删掉文件、不传 `files` 提交——`git add -A` 会把删除暂存；传 `files: [".github/workflows/x.yml"]` 也能暂存删除，因为插件执行的是 `git add -- <paths>`。 |

缺少 scope 时推送涉及工作流的文件过去只报笼统的 `push-rejected`；从 0.4.1 起改为
`workflow-scope-missing`，设置页会给出**重新授权**按钮。

按钮会随屏幕宽度自适应：桌面端显示“GitHub”文字标签，**手机网页版（视口宽度
≤ 640px）折叠成 26px 的分支图标按钮**，避免窄容器把文字挤成竖排；图标按钮仍带
`aria-label`，读屏软件与悬停提示照常可用。

## DSH GO 手机端

DSH GO 的手机界面是 Flutter 原生的，画不了 Web UI。在提供 `dshGo` 服务的宿主上，
插件会额外注册一套原生界面，和设置页共用同一个服务实例（同一份令牌、同一份配置、
同一个登录状态机）：

- **GitHub 面板**：加号面板里的 GitHub、对话详情「插件」页签、或「全部功能」都能
  打开。里面有账号状态、设备码登录（复制设备码 / 打开授权页 / 取消 / 退出）、
  Agent 工具开关，以及针对当前对话目录的刷新、更新、拉取、推送。
- **输入框胶囊**：原生 App 不保证有能填的表单输入框，所以需要文字的操作走输入框
  ——把 Client ID 粘进去点「存 ID」，把提交信息写进去点「提交」，把 `owner/name`
  写进去点加号里的「克隆」。
- App 没上报 `form` / `textField` 组件能力时，面板不画输入框，只保留上面这些入口
  和说明，避免出现点不动的假表单。
- 同一台机器上如果装过早期的独立适配包，先卸掉它再用本插件，免得出现两个 GitHub
  面板抢同一个位置。

网页版不受影响：没有 `dshGo` 服务的宿主上这些代码不会执行。

## 设置项

| 设置 | 含义 |
| --- | --- |
| **Client ID** | 你的 OAuth App 的公开 Client ID（需启用 Device flow）。 |
| **克隆根目录** | 克隆必须落在此目录内，实际路径为 `<root>/<owner>/<name>`；越界路径（含符号链接逃逸）一律拒绝。默认 `~/github`。 |
| **Agent 工具** | 为模型注册 `github` 工具。下次挂载插件后生效（重启或重新保存插件），页面会提示。 |

设置文件为 `$DSH_HOME/dsh-github.json`（权限 `0600`），里面没有令牌。

## Agent 工具

`github` 的 `action`：

| action | 参数 | 结果 |
| --- | --- | --- |
| `status` | `path` | 登录状态、设置与本地检出 |
| `list_repos` | — | 已登录账号的仓库 |
| `create_repo` | `name`、`description?`、`private?`、`autoInit?` | 新仓库 |
| `clone` | `fullName` | 克隆路径与状态 |
| `pull` | `path` | 快进拉取结果 |
| `commit` | `path`、`message`、`files?` | 提交结果，可选择随后推送 |
| `push` | `path` | 推送结果（首次推送会设置上游） |

失败统一返回 `{ ok: false, code, message }`，与界面同样做脱敏。

## 安全模型

- 只用设备码流程：令牌经 TLS 从 GitHub 令牌端点取得，用
  `ctx.credentials.modifyRecord` 以 `grant` 记录存到 `dsh-github/token`
  （`$DSH_HOME/.credentials.yaml`，权限 `0600`）。
- 每次操作现读令牌；设置文件、UI 返回值和 Tool 结果里都没有令牌。
- git 的 `argv`、remote URL、git config 中都看不到令牌。令牌只通过子进程环境变量
  传入，由一次性内联 credential helper（`-c credential.helper=!…`）应答；之前先清空
  所有已配置的 helper，并设置 `GIT_TERMINAL_PROMPT=0`，杜绝交互提示与隐式保存凭据。
- 只使用或接受 `https://github.com/<owner>/<name>` 形式的 remote；`http`、SSH、
  其它域名以及内嵌凭据的 URL 一律拒绝；`origin` 不符合时拉取/推送直接拒绝。
- 克隆与提交路径做包含性校验：禁止 `..`、绝对路径、符号链接逃逸和形似选项的
  pathspec。
- 所有错误信息和 Tool 结果都会脱敏（已知令牌、`ghp_…`/`github_pat_…` 形态、
  `user:password@` 片段）。
- HTTP 路由是 Harness 的认证 fetch 端点（`POST /api/github`），只接受 JSON，
  请求体上限 1 MiB，业务错误不回传密钥。

## 限制

- 每个 Harness profile 只支持一个 GitHub 账号。
- 只做 git 操作（列出/创建/克隆/拉取/提交/推送）；不含 PR、Issue、Release、合并。
- 不自动刷新凭据：GitHub 撤销或过期后，页面会要求重新登录。

## 目录结构

```
index.js            Host 入口（路由、授权流程、可选工具）
client.js           Web UI：设置 → GitHub
lib/github-api.js   设备码流程 + REST 调用（令牌只放在 auth 头）
lib/git.js          git 调用、remote/URL 与路径包含性校验
lib/service.js      状态机、dispatch、脱敏边界
lib/http.js         POST /api/github 处理器
lib/tools.js        `github` agent 工具
lib/dsh-go.js       DSH GO 原生面板 + 输入框入口（共用同一服务实例）
lib/config.js       非秘密设置（$DSH_HOME/dsh-github.json）
lib/validate.js     owner/repo/路径/提交信息校验
lib/errors.js       错误码 + 密钥脱敏
```
