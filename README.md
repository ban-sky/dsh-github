# dsh-github

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

**From a release (recommended):**

```bash
# private repository: the download needs a GitHub token, or use the
# Releases page in a browser where you are signed in
curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  -o dsh-github-0.2.1.tgz \
  https://github.com/ban-sky/dsh-github/releases/download/v0.2.1/dsh-github-0.2.1.tgz
tar -xzf dsh-github-0.2.1.tgz          # creates package/
```

Then install `package/` with the Harness `plugin_manager` tool
(`install_bundle target:/path/to/package`).

**From a source checkout:** install this directory as a bundle (Settings →
Plugins → install from directory, or the Harness `plugin_manager` tool with
`install_bundle`). The bundle mounts:

- Host: the `/api/github` authenticated route, the `github` authorization flow,
  and (when enabled) the `github` tool.
- Client: one `Settings → GitHub` page.

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

The requested scope is `repo` (read/write access to repositories, including
private ones). GitHub shows the scope on the approval screen.

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

The button adapts to the viewport: on desktop it shows the “GitHub” label, and on
the phone web UI (viewport ≤ 640px) it collapses to a 26px branch icon so a narrow
composer can never squeeze the label into a vertical column. The icon button keeps
its `aria-label`, so screen readers and tooltips still name it.

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
client.js           Web UI: Settings → GitHub
lib/github-api.js   Device flow + REST calls (token only in an auth header)
lib/git.js          git invocations, remote/URL and path containment checks
lib/service.js      State machine, dispatch, redaction boundary
lib/http.js         POST /api/github handler
lib/tools.js        `github` agent tool
lib/config.js       Non-secret settings ($DSH_HOME/dsh-github.json)
lib/validate.js     Owner/repo/path/message validation
lib/errors.js       Error codes + secret redaction
```
