# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
