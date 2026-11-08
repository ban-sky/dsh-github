# dsh-github

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
- **Agent 工具**（`github`，默认关闭）—— 与设置页相同的操作，开启后模型可使用。
- **中英双语界面**，跟随 Harness 的界面语言。

## 前置条件

- Node.js 20+（Harness 已提供）。
- `PATH` 中有 `git`（仅 HTTPS remote）。
- 一个启用了 **Device flow** 的 GitHub **OAuth App**：一分钟配置，见下。
  （Client ID 是公开信息，不是密钥。）
- 未配置 OAuth App 时插件照常打开，会提示缺少什么，而不是静默失败。

## 安装

**从 Release 下载安装包**（推荐）：

在浏览器里登录 GitHub 后打开
[Releases](https://github.com/ban-sky/dsh-github/releases)，下载
`dsh-github-0.2.1.tgz` 与 `SHA256SUMS.txt`；或者用 GitHub CLI：

```bash
gh release download v0.2.1 -R ban-sky/dsh-github   # 需要先 gh auth login
sha256sum -c SHA256SUMS.txt
tar -xzf dsh-github-0.2.1.tgz                     # 解出 package/ 目录
```

> 私有仓库的 `releases/download/...` 直链只认浏览器登录态，API 令牌访问会
> 404；脚本里请用 `gh release download`，或调
> `GET /repos/ban-sky/dsh-github/releases/assets/<id>` 并带
> `Accept: application/octet-stream`。

然后在 Harness 里用 `plugin_manager` 的 `install_bundle` 指向解出的
`package/` 目录即可。

**从源码目录安装**：把本仓库目录作为 bundle 安装（设置 → 插件 → 从目录安装，
或 `plugin_manager` 工具的 `install_bundle`）。安装后：

- Host 端：`/api/github` 认证路由、`github` 授权流程，以及（开启后）`github` 工具。
- Client 端：一个 `设置 → GitHub` 页面。

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

申请的 scope 是 `repo`（含私有仓库的读写权限），GitHub 的批准页会显示该 scope。

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

按钮会随屏幕宽度自适应：桌面端显示“GitHub”文字标签，**手机网页版（视口宽度
≤ 640px）折叠成 26px 的分支图标按钮**，避免窄容器把文字挤成竖排；图标按钮仍带
`aria-label`，读屏软件与悬停提示照常可用。

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
lib/config.js       非秘密设置（$DSH_HOME/dsh-github.json）
lib/validate.js     owner/repo/路径/提交信息校验
lib/errors.js       错误码 + 密钥脱敏
```
