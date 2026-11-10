# dsh-github

[English](README.md) | [中文](README.zh.md)

GitHub integration for the DeepSeek Harness Web UI. Sign in with GitHub's
official OAuth **device flow**, then create, list, clone, pull, commit and push
repositories from a single Settings page — or work on the current session folder
directly from a button above the composer. An optional agent tool exposes the
same operations to the model.

Security comes first: the access token lives only in the local DSH credential
store and is never written to the settings file, a git remote, git config, a
command line, a log line or a Tool result.

## Features

- **Official sign-in** — GitHub OAuth device flow (`https://github.com/login/device`).
  No password is ever handled by the plugin.
- **Repositories** — list the account's repositories (owner, collaborator and
  organization member), create a new repository (public/private, optional
  README), clone any `owner/name` into the configured clone root.
- **Local checkouts** — inspect branch, tracking state, ahead/behind and working
  tree changes; `git pull --ff-only`; commit selected paths (or everything) and
  push.
- **Session folder actions** — the GitHub button above the composer clones into,
  publishes, pulls, updates (fetch) and pushes the current session working
  directory.
- **Workflow files** — files under `.github/workflows` can be created, updated
  and deleted through the same commit + push actions (the `workflow` scope is
  requested at sign-in and its absence is reported as `workflow-scope-missing`).
- **Agent tool** (`github`, off by default) — the same operations as a Tool, so
  the model can act on GitHub when the user enables it.
- **Bilingual UI** — Chinese and English, following the Harness locale.

## Requirements

- Node.js 20+ (the Harness already provides this).
- `git` on `PATH` (HTTPS remotes only).
- A GitHub **OAuth App** with the *device flow* enabled — one minute of setup,
  see below. (A device-flow-capable OAuth App client ID is public information;
  it is not a secret.)
- Until an OAuth App is configured the plugin still opens; it explains what is
  missing instead of failing silently.

## Install

**From npm:**

Use the Harness `plugin_manager` tool with `install_bundle` and the exact version
`@ban-sky/dsh-github@1.1.1` as the target. The name carries a scope because
`dsh-github` is taken on npm; the Release package contains the same code.

**From a release (recommended):**

Every release ships one package that suits every host — DSH Web, the desktop app
and the DSH GO phone app. It unpacks to `package/`. Open the
[Releases](https://github.com/ban-sky/dsh-github/releases) page in a
browser where you are signed in, or use the GitHub CLI:

```bash
gh release download v1.1.1 -R ban-sky/dsh-github   # needs gh auth login first
sha256sum -c SHA256SUMS.txt
tar -xzf dsh-github-1.1.1.tgz
```

> The plain `releases/download/...` URL of a **private** repository only accepts
> a browser session; an API token gets a 404 there. For scripts use
> `gh release download`, or call
> `GET /repos/ban-sky/dsh-github/releases/assets/<id>` with
> `Accept: application/octet-stream`.

Then install `package/` with the Harness `plugin_manager` tool
(`install_bundle target:/path/to/package`). On a phone you can also run
`dsh plugin --profile web add /path/to/package`.

**Upgrading from 1.1.0:** the Web UI of a host that ran 1.1.0 keeps a stale
`dsh-github` module row in memory, so restart `dsh web` once after installing
1.1.1. Without the restart the page can still hit a duplicate-registration
boot failure caused by the fixed module id.

**From a source checkout:** install this directory as a bundle (Settings →
Plugins → install from directory, or the Harness `plugin_manager` tool with
`install_bundle`). The bundle mounts:

- Host: the `/api/github` authenticated route, the `github` authorization flow,
  and (when enabled) the `github` tool.
- Client: one `Settings → GitHub` page.

## DSH GO

The plugin also speaks the DSH GO surface: `package.json.dshGo` (protocol v1)
declares the native panel and the composer entries (`minApp` 1.0.13), and
`lib/dsh-go.js` implements them. That module is only imported after a host
provides the `dshGo` service, so Web and desktop hosts never load it and the
single package fits either host.

This plugin is not submitted to any plugin market. npm and the GitHub Release are
the only distribution channels.

## Setup: create the OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Application name: anything, e.g. `DSH`; Homepage URL: anything you control
   (`https://github.com/` is fine).
3. **Enable "Device flow"** on the app page. This is required: the plugin uses
   the device authorization grant, not a redirect callback.
4. Copy the **Client ID** (`Iv1.…` or `Ov23…`) into **Settings → GitHub →
   Client ID** and save.

## Sign in

1. Settings → GitHub → **Sign in with GitHub**.
2. A one-time code appears. Open <https://github.com/login/device> (the plugin
   only ever links to that exact host) and enter the code.
3. Approve the request. The page updates as soon as GitHub confirms, and shows
   the signed-in account.

The requested scopes are `repo` (read/write access to repositories, including
private ones) and `workflow` (lets a push create or update files under
`.github/workflows`). GitHub shows both on the approval screen.

If you signed in with an older release, the stored grant only has `repo`, so
GitHub refuses pushes that touch workflow files ("refusing to allow an OAuth App
to create or update workflow ... without `workflow` scope"). Settings → GitHub
then shows a warning with a **Re-authorize** button; one more device-flow
approval adds the scope, and the account, settings and local repositories are
left untouched.

Sign out deletes the stored grant from the credential store immediately; the
token is also invalidated locally for every in-flight operation.

## Session folder actions

The composer button sends only the **sessionId** to the Host. The Host resolves
the session's committed working directory through the agents and
workingDirectory services, so the Client can never name an arbitrary path.

| Action | Behaviour |
| --- | --- |
| Clone | Clones `owner/name` into `<session folder>/<name>`; refuses existing, non-empty or symlinked targets. |
| Create and push | Creates the repository in your account (private by default), runs `git init -b main` in the session folder, adds `origin`, commits and pushes. Only runs when the folder itself is the repository root; refuses when it already contains a repository or lives inside another one. |
| Pull | `git pull --ff-only` on the session repository. |
| Update | `git fetch --prune`, refreshing ahead/behind without touching the working tree. |
| Commit | Commits every change (or selected files), optionally followed by a push. |

When the session folder is not itself a repository, the plugin uses the **single**
immediate child repository (the one just cloned) for later actions. With more
than one child repository it refuses to guess.

### Workflow files

Files under `.github/workflows` need the `workflow` scope, which sign-in requests,
and they are ordinary commit targets otherwise. All three cases are verified
against a live repository:

| Case | How to do it |
| --- | --- |
| Create | Write the `.yml`, then `commit` with `push: true`. With no `files` the plugin stages everything (`git add -A`), so a new file is picked up. |
| Update | Edit the `.yml`, then `commit` with `push: true` (same staging rule). |
| Delete | Either `git rm` first and commit, or just remove the file and commit with `files` omitted: `git add -A` stages the deletion. Passing `files: [".github/workflows/x.yml"]` also stages a removal, because the plugin runs `git add -- <paths>`. |

A push that touches a workflow file without the scope previously failed with a
generic `push-rejected`; since 0.4.1 it reports `workflow-scope-missing` and the
settings page offers a one-click re-authorization.

The button adapts to the viewport: on desktop it shows the “GitHub” label, and on
the phone web UI (viewport ≤ 640px) it collapses to a 26px branch icon so a narrow
composer can never squeeze the label into a vertical column. The icon button keeps
its `aria-label`, so screen readers and tooltips still name it.

## DSH GO (the phone app)

DSH GO draws its own Flutter UI, so it cannot render the Web settings page. On a
host that provides the `dshGo` service the plugin registers a native surface that
shares this plugin's one service instance (one token, one settings file, one
sign-in state machine):

- **GitHub panel**: account state, device-code sign-in (copy the code, open the
  authorization page, cancel, sign out), the Agent-tool switch, and
  refresh/fetch/pull/push for the current session folder. Reachable from the add
  sheet, the session details "Plugins" tab, or "All features".
- **Composer entries**: native form inputs are not available everywhere, so
  text-driven work uses the message box: paste the Client ID and tap "Save ID",
  type a commit message and tap "Commit", type `owner/name` and tap "Clone".
- An app that does not advertise the `form` / `textField` components gets the
  panel without input fields, only those entries and their instructions, instead
  of a form nobody can type into.
- Remove any older standalone adaptation package on the same host first, so two
  GitHub panels do not compete.

Hosts without the `dshGo` service are unaffected: none of this code runs there.

## Settings

| Setting | Meaning |
| --- | --- |
| **Client ID** | Public Client ID of your OAuth App (requires device flow). |
| **Clone root** | Directory that clones must stay inside. Clones are placed at `<root>/<owner>/<name>`; paths that escape the root (including through symlinks) are rejected. Defaults to `~/github`. |
| **Agent tool** | Registers the `github` tool for the model. Takes effect on the next plugin mount (restart or re-save the plugin), as the page indicates. |

The settings file is `$DSH_HOME/dsh-github.json` (created with mode `0600`),
and it never contains the token.

## Agent tool

`github` accepts `action`:

| Action | Arguments | Result |
| --- | --- | --- |
| `status` | `path` | Sign-in state, settings and local checkouts |
| `list_repos` | — | Repositories of the signed-in account |
| `create_repo` | `name`, `description?`, `private?`, `autoInit?` | New repository |
| `clone` | `fullName` | Cloned checkout path + status |
| `pull` | `path` | Fast-forward pull result |
| `commit` | `path`, `message`, `files?` | Commit result, optionally appended to the next push |
| `push` | `path` | Push result (sets upstream on first push) |

Failures come back as `{ ok: false, code, message }` with the same redaction as
the UI.

## Security model

- Device flow only: the token is obtained from GitHub's token endpoint over
  TLS and stored with `ctx.credentials.modifyRecord` as a `grant` record under
  the key `dsh-github/token` (in `$DSH_HOME/.credentials.yaml`, mode `0600`).
- The token is read per operation; it is never cached in the settings file, the
  UI payload, or the Tool description.
- Git never sees the token in `argv`, in a remote URL, or in git config. It is
  passed only through the child process environment and answered by a one-shot
  inline credential helper (`-c credential.helper=!…`); every configured
  credential helper is cleared first and `GIT_TERMINAL_PROMPT=0` prevents any
  interactive prompt or implicit credential persistence.
- Only `https://github.com/<owner>/<name>` remotes are used or accepted;
  `http`, SSH, other hosts and URLs with embedded credentials are rejected.
  Pull/push refuse to run on a checkout whose `origin` is not such a URL.
- Clone and commit paths are validated and contained: no `..`, no absolute
  paths, no symlink escapes, no option-looking pathspecs.
- Every error message and Tool result is redacted (known tokens, `ghp_…`/
  `github_pat_…` shapes and `user:password@` URL parts).
- The HTTP route is an authenticated Harness fetch endpoint (`POST
  /api/github`); it accepts JSON only, caps the body at 1 MiB, and returns
  business errors without leaking secrets.

## Limits

- One GitHub account per Harness profile.
- Git operations only (list/create/clone/pull/commit/push); no pull requests,
  issues, releases or merges.
- No automatic credential refresh: when GitHub revokes or expires the grant,
  the page asks you to sign in again.

## Layout

```
index.js            Host entry (route, authorization flow, optional tool)
client.js           Web UI: Settings → GitHub (registers under the package name)
lib/github-api.js   Device flow + REST calls (token only in an auth header)
lib/git.js          git invocations, remote/URL and path containment checks
lib/service.js      State machine, dispatch, redaction boundary
lib/http.js         POST /api/github handler
lib/tools.js        `github` agent tool
lib/config.js       Non-secret settings ($DSH_HOME/dsh-github.json)
lib/validate.js     Owner/repo/path/message validation
lib/errors.js       Error codes + secret redaction
```
