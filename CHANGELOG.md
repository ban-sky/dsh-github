# Changelog

[English](CHANGELOG.md) | [中文](CHANGELOG.zh.md)

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.4.1] - 2026-11-09

### Fixed

- **Workflow files can be pushed.** Sign-in now requests the `workflow` scope
  together with `repo`, so `git push` no longer fails with "refusing to allow an
  OAuth App to create or update workflow ... without `workflow` scope" when a
  commit touches `.github/workflows`.
- Tokens granted by older releases only carry `repo`. The settings page and the
  DSH GO panel now detect the missing scope, explain that pushes touching
  workflow files will be refused, and offer a one-click re-authorization. The
  account, the settings file and every local repository are left untouched.
- A push refused for that reason now reports `workflow-scope-missing` with an
  actionable hint instead of the generic `push-rejected`.

## [0.4.0] - 2026-11-08

### Changed

- **The npm package is now `@ban-sky/dsh-github`.** The DSH GO market only lists
  exact npm versions, and the plain `dsh-github` name already belongs to another
  publisher on npm. GitHub Release packages install exactly as before; if you
  installed 0.3.0 through `install_bundle` under the old name, remove that
  package first, because the `github` plugin row cannot be mounted twice.
- `package.json` no longer sets `private` and declares
  `publishConfig.access: public`, so the package can be published.

### Added

- **DSH GO market metadata.** `dshGo.minApp` is `1.0.13`, and
  `market/dsh-go-market.json` is the entry to submit to
  [ccch1mneyyy/dsh-go-market](https://github.com/ccch1mneyyy/dsh-go-market)
  (copy it to `plugins/@ban-sky__dsh-github.json` there).
- The release workflow publishes the tagged version to npm when the `NPM_TOKEN`
  secret exists, with provenance; without the secret it warns and still uploads
  the GitHub Release assets.

## [0.3.0] - 2026-11-08

### Added

- **Two installation packages per release.** `scripts/pack.mjs` builds both from
  this one source tree and `.github/workflows/release.yml` attaches them to the
  GitHub Release when a `v*` tag is pushed: `dsh-github-<version>.tgz` for DSH
  Web / desktop (Web UI only) and `dsh-github-<version>-dsh-go.tgz` for the DSH
  GO phone app. The web package omits `lib/dsh-go.js` and the `dshGo` manifest,
  which `index.js` loads on demand, so neither artifact carries dead code.
- **DSH GO native surface.** On hosts that provide the `dshGo` service the plugin
  now registers a native panel (account state, device-code sign-in, Agent-tool
  switch, and refresh/fetch/pull/push/commit/clone/publish for the session
  folder) plus three composer entries that take the Client ID, the commit message
  and `owner/name` from the message box. Both surfaces share one service
  instance, so the credential record and the settings file stay single-sourced;
  hosts without `dshGo` are unchanged.
- Native form inputs are only drawn when the app advertises the `form` and
  `textField` components; otherwise the panel explains the composer entries,
  because a form nobody can type into is worse than no form.

## [0.2.1] - 2026-11-08

### Fixed

- **Mobile composer button.** On narrow screens (viewport ≤ 640px) the GitHub
  button now collapses to a 26px branch icon instead of squeezing its label
  into a vertical column. The label stays in the DOM as visually hidden text so
  the control keeps its accessible name, and `flex:none` + `white-space:nowrap`
  stop the pill from being squashed in any narrow container.
- **Expired token in the session panel.** When the stored token has expired the
  dock now shows the sign-in hint instead of action buttons that would all fail
  with `token-invalid`.
- The dialog uses tighter padding and a taller max height on phones.

## [0.2.0] - 2026-11-06

### Added

- **Session folder actions.** A GitHub button above the composer operates on the
  current session's working directory: clone `owner/name` into `<session>/<name>`,
  create a repository and publish the folder (`git init -b main`, origin,
  commit, push), pull (`--ff-only`), update (`git fetch --prune`), commit, and
  push.
- The client sends only a `sessionId`; the Host resolves the directory through
  the `agents` and `workingDirectory` services, re-validates it with `realpath`,
  and rejects unknown or inactive sessions with `session-not-found`.
- A folder that is not itself a repository is used only when it contains exactly
  one immediate child repository (the one just cloned); with several children
  the plugin refuses to guess.

### Fixed

- `runGit` now passes an explicit `cwd` to the subprocess service, which
  requires one. Without it every git call failed in the live runtime with
  `Cannot read properties of undefined (reading 'includes')`.
- Pull/push/commit refuse to run inside the wrong repository and never touch a
  remote that carries embedded credentials.

## [0.1.0] - 2026-11-05

### Added

- Initial release: GitHub device-flow sign-in through the DSH authorization and
  credential services, a `Settings → GitHub` page (sign-in, repository list,
  create, clone into the clone root, local clone status, pull, commit, push),
  and an optional `github` agent tool.
- Security baseline: the access token lives only in the DSH credential store,
  reaches git through the child environment with an inline credential helper,
  all paths and remotes are validated host-side, and every error is redacted.
