/**
 * Git operations for the plugin.
 *
 * All network operations go through `ctx.subprocess` with:
 * - the token handed to `git` only through the child environment, read by an
 *   inline `!shell` credential helper (never argv, never a remote URL, never
 *   git config, nothing written to disk);
 * - `GIT_TERMINAL_PROMPT=0` so git can never block on an interactive prompt;
 * - `-c credential.helper=` first, so no globally configured credential store
 *   is consulted or written;
 * - a hard timeout and the caller's abort signal.
 *
 * Local-only reads never receive the token environment at all.
 *
 * @module dsh-github/lib/git
 */

import { lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { GithubError } from './errors.js'
import { assertInside, isInside, parseFullName } from './validate.js'

/**
 * Inline credential helper. Git runs it through `sh -c` for HTTPS
 * authentication; the token is read from the child environment set by
 * {@link runGit}, so it never appears in argv or on disk.
 *
 * The helper is written as a `!shell` snippet because `/tmp` is commonly
 * mounted noexec, which would break execution of a `GIT_ASKPASS` script. It
 * only answers `get`, so nothing is ever stored.
 */
const CREDENTIAL_HELPER =
  '!f() { [ "$1" = get ] && { printf "%s\\n" "username=x-access-token" "password=$DSH_GITHUB_TOKEN"; }; }; f'

/** Default timeout for a local git command (ms). */
const LOCAL_TIMEOUT_MS = 30000
/** Timeout for a network git command (ms). */
const NETWORK_TIMEOUT_MS = 180000

/**
 * Result of one git invocation.
 *
 * @typedef {object} GitResult
 * @property {number | null} exitCode - Process exit code (`null` when killed).
 * @property {string} stdout - Collected stdout.
 * @property {string} stderr - Collected stderr.
 */

/**
 * Run git with the plugin's safety flags.
 *
 * @param {{subprocess: any}} ctx - Host context carrying `subprocess`.
 * @param {string[]} argv - Arguments after `git`.
 * @param {object} [options] - Run options.
 * @param {string} [options.cwd] - Working directory.
 * @param {string} [options.token] - Token that enables the credential helper.
 * @param {AbortSignal} [options.signal] - Caller cancellation.
 * @param {number} [options.timeoutMs] - Hard timeout.
 * @returns {Promise<GitResult>}
 */
export async function runGit(ctx, argv, options = {}) {
  const { cwd, token, signal, timeoutMs = LOCAL_TIMEOUT_MS } = options
  const withToken = typeof token === 'string' && token !== ''
  /** @type {Record<string, string>} */
  const env = { GIT_TERMINAL_PROMPT: '0' }
  if (withToken) env.DSH_GITHUB_TOKEN = token
  // Clear every configured helper (no keychain, no ~/.git-credentials) and, when
  // a token is present, answer the HTTPS prompt from the environment only.
  const credentialArgs = withToken
    ? ['-c', 'credential.helper=', '-c', `credential.helper=${CREDENTIAL_HELPER}`]
    : ['-c', 'credential.helper=']

  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(new Error('git timed out')), timeoutMs)
  const combined = signal === undefined ? timeoutController.signal : AbortSignal.any([signal, timeoutController.signal])

  try {
    const handle = ctx.subprocess.spawn({
      argv: ['git', ...credentialArgs, ...argv],
      // The subprocess service requires an explicit cwd; every git command here
      // addresses its repository explicitly, so the host's cwd is only a floor.
      cwd: cwd ?? process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 1 << 20 },
        stderr: { maxBytes: 1 << 20 },
      },
      graceMs: 5000,
      signal: combined,
      env,
    })
    const outcome = await handle.done
    return {
      exitCode: typeof outcome?.exitCode === 'number' ? outcome.exitCode : null,
      stdout: handle.collected?.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected?.stderr?.readFrom(0).text ?? '',
    }
  } catch (error) {
    if (timeoutController.signal.aborted || signal?.aborted === true) {
      throw new GithubError('git-timeout', 'The git operation timed out or was cancelled.')
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/ENOENT|not found|spawn/i.test(message)) {
      throw new GithubError('git-missing', `Could not run git: ${message}`, {}, { cause: error })
    }
    throw new GithubError('git-failed', `Could not run git: ${message}`, {}, { cause: error })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Build a GithubError from a failed git result.
 *
 * @param {GitResult} result - Failed invocation.
 * @param {string} what - What was being attempted.
 * @returns {GithubError}
 */
function gitFailure(result, what) {
  const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-2000)
  return new GithubError(
    'git-failed',
    detail === '' ? `${what} failed (exit ${result.exitCode ?? 'unknown'}).` : `${what} failed: ${detail}`,
    { exitCode: result.exitCode },
  )
}

/**
 * Parse an `https://github.com/owner/name(.git)` remote URL.
 *
 * @param {string} value - Remote URL.
 * @returns {{owner: string, name: string, url: string, hasCredentials: boolean} | null}
 */
export function parseGithubRemote(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') return null
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname.toLowerCase() !== 'github.com') return null
  let path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (path.endsWith('.git')) path = path.slice(0, -4)
  const parts = path.split('/')
  if (parts.length !== 2) return null
  const [owner, name] = parts
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return null
  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}.git`,
    hasCredentials: parsed.username !== '' || parsed.password !== '',
  }
}

/**
 * Strip userinfo from a URL for display.
 *
 * @param {string} value - Raw URL.
 * @returns {string}
 */
export function displayRemote(value) {
  return String(value)
    .replace(/^(https?:\/\/)[^/@]+@/i, '$1')
    .replace(/^(git@|ssh:\/\/[^/@]+@)/i, 'ssh:')
}

/**
 * Read `remote.origin.url`.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {string} path - Repository path.
 * @param {AbortSignal} [signal] - Cancellation.
 * @returns {Promise<string>}
 */
async function readRemote(ctx, path, signal) {
  const result = await runGit(ctx, ['-C', path, 'config', '--get', 'remote.origin.url'], { signal })
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

/**
 * Refuse network operations on remotes we cannot verify.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {string} path - Repository path.
 * @param {AbortSignal} [signal] - Cancellation.
 * @returns {Promise<{owner: string, name: string, url: string}>}
 */
async function assertGithubRemote(ctx, path, signal) {
  const remote = await readRemote(ctx, path, signal)
  if (remote === '') {
    throw new GithubError('no-remote', 'This repository has no "origin" remote.')
  }
  const parsed = parseGithubRemote(remote)
  if (parsed === null) {
    throw new GithubError(
      'unsupported-remote',
      'Only https://github.com/<owner>/<repo> remotes are supported for pull and push.',
    )
  }
  if (parsed.hasCredentials) {
    throw new GithubError(
      'remote-has-credentials',
      'The origin URL embeds a credential. Remove it with `git remote set-url origin https://github.com/<owner>/<repo>.git`, then retry.',
    )
  }
  return { owner: parsed.owner, name: parsed.name, url: parsed.url }
}

/**
 * Parse the first line of `git status --porcelain=v1 --branch`.
 *
 * @param {string} header - Line starting with `## `.
 * @returns {{branch: string, detached: boolean, upstream: string, ahead: number, behind: number}}
 */
function parseStatusHeader(header) {
  const text = header.replace(/^##\s?/, '')
  const noCommits = /^No commits yet on (.+)$/.exec(text)
  if (noCommits !== null) {
    return { branch: noCommits[1], detached: false, upstream: '', ahead: 0, behind: 0 }
  }
  if (/^HEAD \(no branch\)/.test(text)) {
    return { branch: 'HEAD', detached: true, upstream: '', ahead: 0, behind: 0 }
  }
  const split = text.split('...')
  const branch = split[0] ?? ''
  const right = split.length > 1 ? split.slice(1).join('...') : ''
  const trackMatch = /^(\S+?)(?:\s+\[(.+)\])?$/.exec(right)
  const upstream = trackMatch?.[1] ?? ''
  const track = trackMatch?.[2] ?? ''
  const aheadMatch = /ahead (\d+)/.exec(track)
  const behindMatch = /behind (\d+)/.exec(track)
  return {
    branch,
    detached: false,
    upstream,
    ahead: aheadMatch === null ? 0 : Number(aheadMatch[1]),
    behind: behindMatch === null ? 0 : Number(behindMatch[1]),
  }
}

/**
 * Read the last commit of a repository.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {string} path - Repository path.
 * @param {AbortSignal} [signal] - Cancellation.
 * @returns {Promise<{shortHash: string, subject: string, author: string, date: string} | null>}
 */
async function readLastCommit(ctx, path, signal) {
  const result = await runGit(ctx, ['-C', path, 'log', '-1', '--format=%h%x1f%s%x1f%an%x1f%cI'], {
    signal,
    timeoutMs: LOCAL_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) return null
  const [shortHash = '', subject = '', author = '', date = ''] = result.stdout.trim().split('\u001f')
  return { shortHash, subject, author, date }
}

/**
 * Describe one repository: branch, cleanliness, ahead/behind, last commit and
 * the sanitized origin remote.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Repository to inspect.
 * @param {string} input.path - Absolute repository path.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<object>}
 */
export async function readStatus(ctx, { path, signal }) {
  const [statusResult, lastCommit, remote] = await Promise.all([
    runGit(ctx, ['-C', path, 'status', '--porcelain=v1', '--branch'], { signal }),
    readLastCommit(ctx, path, signal),
    readRemote(ctx, path, signal),
  ])
  if (statusResult.exitCode !== 0) throw gitFailure(statusResult, 'reading repository status')
  const lines = statusResult.stdout.split('\n').filter((line) => line !== '')
  const header = parseStatusHeader(lines[0] ?? '## ')
  const entries = lines.slice(1)
  const parsedRemote = parseGithubRemote(remote)
  return {
    path,
    branch: header.branch,
    detached: header.detached,
    upstream: header.upstream,
    ahead: header.ahead,
    behind: header.behind,
    clean: entries.length === 0,
    changeCount: entries.length,
    changes: entries.slice(0, 100),
    lastCommit,
    remote:
      remote === ''
        ? null
        : parsedRemote === null
          ? { owner: '', name: '', url: displayRemote(remote), unsupported: true }
          : { owner: parsedRemote.owner, name: parsedRemote.name, url: parsedRemote.url },
  }
}

/**
 * Prepare `<root>/<owner>/<name>` for a clone, refusing symlinked segments and
 * non-empty targets.
 *
 * @param {string} root - Existing clone root.
 * @param {string} owner - Validated owner.
 * @param {string} name - Validated repository name.
 * @returns {Promise<string>} Absolute directory that is ready to receive the clone.
 */
export async function prepareCloneTarget(root, owner, name) {
  const realRoot = await realpath(root)
  let current = realRoot
  for (const part of [owner, name]) {
    const next = join(current, part)
    const info = await lstat(next).catch(() => null)
    if (info === null) {
      await mkdir(next, { mode: 0o755 })
    } else if (info.isSymbolicLink()) {
      throw new GithubError('unsafe-path', 'Refusing to clone through a symlinked directory.')
    } else if (!info.isDirectory()) {
      throw new GithubError('target-exists', `A non-directory already exists at ${next}.`)
    }
    current = await realpath(next)
    if (!isInside(realRoot, current)) {
      throw new GithubError('unsafe-path', 'Refusing to clone outside the configured clone root.')
    }
  }
  const entries = await readdir(current)
  if (entries.length > 0) {
    throw new GithubError('target-exists', 'The clone target already exists and is not empty.')
  }
  return current
}

/**
 * Clone `https://github.com/<owner>/<name>.git` into `<root>/<owner>/<name>`.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Clone input.
 * @param {string} input.token - Access token.
 * @param {string} input.fullName - `owner/name`.
 * @param {string} input.root - Clone root.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<string>} Absolute path of the new clone.
 */
export async function cloneRepository(ctx, { token, fullName, root, signal }) {
  const { owner, name } = parseFullName(fullName)
  await mkdir(root, { recursive: true })
  const target = await prepareCloneTarget(root, owner, name)
  const url = `https://github.com/${owner}/${name}.git`
  const result = await runGit(ctx, ['clone', '--quiet', '--', url, target], {
    cwd: dirname(target),
    token,
    signal,
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) {
    await rm(target, { recursive: true, force: true }).catch(() => {})
    const text = `${result.stderr}\n${result.stdout}`
    if (/Authentication failed|could not read Username|invalid username or password/i.test(text)) {
      throw new GithubError('token-invalid', 'GitHub rejected the credentials. Sign in again.')
    }
    if (/not found|does not exist|Repository not found/i.test(text)) {
      throw new GithubError('not-found', 'The repository was not found (or the token has no access).')
    }
    throw gitFailure(result, 'clone failed')
  }
  const realTarget = await realpath(target)
  assertInside(await realpath(root), realTarget)
  return realTarget
}

/**
 * Fast-forward pull of the current branch.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Pull input.
 * @param {string} input.path - Repository path.
 * @param {string} input.token - Access token.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<object>} Fresh status.
 */
export async function pullRepository(ctx, { path, token, signal }) {
  await assertGithubRemote(ctx, path, signal)
  const result = await runGit(ctx, ['-C', path, 'pull', '--ff-only', '--no-rebase', '--quiet'], {
    token,
    signal,
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) {
    const text = `${result.stdout}\n${result.stderr}`
    if (/no tracking information|no upstream|no such remote/i.test(text)) {
      throw new GithubError('no-upstream', 'The current branch has no upstream branch to pull from.')
    }
    if (/not possible to fast-forward|diverging|diverged|need to specify how to reconcile/i.test(text)) {
      throw new GithubError('not-fast-forward', 'Local and remote history diverged; this plugin only fast-forwards.')
    }
    if (/would be overwritten|local changes/i.test(text)) {
      throw new GithubError('dirty-worktree', 'Local changes would be overwritten. Commit or stash them first.')
    }
    if (/Authentication failed|could not read Username|invalid username or password/i.test(text)) {
      throw new GithubError('token-invalid', 'GitHub rejected the credentials. Sign in again.')
    }
    throw gitFailure(result, 'pull failed')
  }
  return readStatus(ctx, { path, signal })
}

/**
 * Stage changes and create one commit.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Commit input.
 * @param {string} input.path - Repository path.
 * @param {string} input.message - Commit message.
 * @param {string[] | undefined} input.files - Repository-relative paths; all changes when absent.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<object | null>} The new commit.
 */
export async function commitChanges(ctx, { path, message, files, signal }) {
  const add =
    files === undefined
      ? await runGit(ctx, ['-C', path, 'add', '-A'], { signal })
      : await runGit(ctx, ['-C', path, 'add', '--', ...files], { signal })
  if (add.exitCode !== 0) throw gitFailure(add, 'staging changes')

  const commit = await runGit(ctx, ['-C', path, 'commit', '-m', message], { signal })
  if (commit.exitCode !== 0) {
    const text = `${commit.stdout}\n${commit.stderr}`
    if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(text)) {
      throw new GithubError('nothing-to-commit', 'There are no changes to commit.')
    }
    if (/please tell me who you are|author identity unknown|unable to auto-detect email address/i.test(text)) {
      throw new GithubError(
        'identity-missing',
        'Git has no committer identity. Configure `git config --global user.name "..."` and `git config --global user.email "..."` first.',
      )
    }
    throw gitFailure(commit, 'commit')
  }
  return readLastCommit(ctx, path, signal)
}

/**
 * Push the current branch to `origin`.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Push input.
 * @param {string} input.path - Repository path.
 * @param {string} input.token - Access token.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<{branch: string, upstream: string}>}
 */
export async function pushRepository(ctx, { path, token, signal }) {
  await assertGithubRemote(ctx, path, signal)
  const head = await runGit(ctx, ['-C', path, 'symbolic-ref', '--short', '-q', 'HEAD'], { signal })
  if (head.exitCode !== 0 || head.stdout.trim() === '') {
    throw new GithubError('detached-head', 'HEAD is detached; check out a branch before pushing.')
  }
  const branch = head.stdout.trim()
  const upstream = await runGit(ctx, ['-C', path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { signal })
  const hasUpstream = upstream.exitCode === 0 && upstream.stdout.trim() !== ''
  const argv = hasUpstream
    ? ['-C', path, 'push', '--quiet']
    : ['-C', path, 'push', '--quiet', '--set-upstream', 'origin', branch]
  const result = await runGit(ctx, argv, { token, signal, timeoutMs: NETWORK_TIMEOUT_MS })
  if (result.exitCode !== 0) {
    const text = `${result.stdout}\n${result.stderr}`
    if (/non-fast-forward|fetch first|rejected/i.test(text)) {
      throw new GithubError('push-rejected', 'The push was rejected because the remote has newer commits. Pull first.')
    }
    if (/Authentication failed|could not read Username|invalid username or password|Permission denied/i.test(text)) {
      throw new GithubError('token-invalid', 'GitHub rejected the credentials. Sign in again.')
    }
    throw gitFailure(result, 'push failed')
  }
  return { branch, upstream: hasUpstream ? upstream.stdout.trim() : `origin/${branch}` }
}

/**
 * Resolve the work-tree root of a directory, or `null` when it is not inside a
 * git repository.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {string} path - Directory to probe.
 * @param {AbortSignal} [signal] - Cancellation.
 * @returns {Promise<string | null>} Real path of the work-tree root.
 */
export async function repositoryTopLevel(ctx, path, signal) {
  const result = await runGit(ctx, ['-C', path, 'rev-parse', '--show-toplevel'], { signal })
  if (result.exitCode !== 0) return null
  const top = result.stdout.trim()
  if (top === '') return null
  return (await realpath(top).catch(() => null)) ?? top
}

/**
 * Prepare `<baseDir>/<dirName>` for a clone without leaving the base directory.
 *
 * @param {string} baseDir - Existing directory that receives the clone.
 * @param {string} dirName - Validated single path segment.
 * @returns {Promise<{base: string, target: string}>}
 */
export async function prepareFlatTarget(baseDir, dirName) {
  const realBase = await realpath(baseDir).catch(() => null)
  if (realBase === null) throw new GithubError('not-found', 'The session directory does not exist any more.')
  const info = await lstat(realBase).catch(() => null)
  if (info === null || !info.isDirectory()) {
    throw new GithubError('invalid-path', 'The session directory is not a directory.')
  }
  if (dirName.includes('/') || dirName.includes('\\') || dirName === '.' || dirName === '..') {
    throw new GithubError('invalid-repo-name', 'A repository name may not contain path separators.')
  }
  const target = join(realBase, dirName)
  const existing = await lstat(target).catch(() => null)
  if (existing !== null && existing.isSymbolicLink()) {
    throw new GithubError('unsafe-path', 'Refusing to clone through a symlinked directory.')
  }
  if (existing !== null && (!existing.isDirectory() || (await readdir(target)).length > 0)) {
    throw new GithubError('target-exists', 'The clone target already exists and is not empty.')
  }
  return { base: realBase, target }
}

/**
 * Clone `https://github.com/<owner>/<name>.git` into `<baseDir>/<name>`.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Clone input.
 * @param {string} input.token - Access token.
 * @param {string} input.fullName - `owner/name`.
 * @param {string} input.baseDir - Directory that receives the clone.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<string>} Absolute path of the new clone.
 */
export async function cloneIntoDirectory(ctx, { token, fullName, baseDir, signal }) {
  const { owner, name } = parseFullName(fullName)
  const { base, target } = await prepareFlatTarget(baseDir, name)
  const url = `https://github.com/${owner}/${name}.git`
  const result = await runGit(ctx, ['clone', '--quiet', '--', url, target], {
    cwd: base,
    token,
    signal,
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) {
    await rm(target, { recursive: true, force: true }).catch(() => {})
    const text = `${result.stderr}\n${result.stdout}`
    if (/Authentication failed|could not read Username|invalid username or password/i.test(text)) {
      throw new GithubError('token-invalid', 'GitHub rejected the credentials. Sign in again.')
    }
    if (/not found|does not exist|Repository not found/i.test(text)) {
      throw new GithubError('not-found', 'The repository was not found (or the token has no access).')
    }
    throw gitFailure(result, 'clone failed')
  }
  const realTarget = await realpath(target)
  assertInside(base, realTarget)
  return realTarget
}

/**
 * Create a repository in place (idempotent when one already exists).
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {string} path - Directory to initialise.
 * @param {AbortSignal} [signal] - Cancellation.
 * @returns {Promise<void>}
 */
export async function initRepository(ctx, path, signal) {
  const result = await runGit(ctx, ['-C', path, 'init', '--quiet', '-b', 'main'], { signal })
  if (result.exitCode !== 0) throw gitFailure(result, 'git init')
}

/**
 * Point `origin` at a GitHub URL, refusing to overwrite a different remote.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Input.
 * @param {string} input.path - Repository path.
 * @param {string} input.url - Expected `https://github.com/<owner>/<name>.git` URL.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<{created: boolean}>}
 */
export async function ensureOrigin(ctx, { path, url, signal }) {
  const current = await runGit(ctx, ['-C', path, 'config', '--get', 'remote.origin.url'], { signal })
  const existing = current.exitCode === 0 ? current.stdout.trim() : ''
  if (existing !== '') {
    if (existing === url) return { created: false }
    throw new GithubError(
      'remote-exists',
      'This repository already has a different "origin" remote. Remove it before publishing.',
    )
  }
  const result = await runGit(ctx, ['-C', path, 'remote', 'add', 'origin', url], { signal })
  if (result.exitCode !== 0) throw gitFailure(result, 'adding the origin remote')
  return { created: true }
}

/**
 * Stage everything and create a commit, allowing an empty commit.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Input.
 * @param {string} input.path - Repository path.
 * @param {string} input.message - Commit message.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<object | null>} The new commit.
 */
export async function commitAll(ctx, { path, message, signal }) {
  const add = await runGit(ctx, ['-C', path, 'add', '-A'], { signal })
  if (add.exitCode !== 0) throw gitFailure(add, 'staging changes')
  const commit = await runGit(ctx, ['-C', path, 'commit', '--allow-empty', '-m', message], { signal })
  if (commit.exitCode !== 0) {
    const text = `${commit.stdout}\n${commit.stderr}`
    if (/please tell me who you are|author identity unknown|unable to auto-detect email address/i.test(text)) {
      throw new GithubError(
        'identity-missing',
        'Git has no committer identity. Configure `git config --global user.name "..."` and `git config --global user.email "..."` first.',
      )
    }
    throw gitFailure(commit, 'commit')
  }
  return readLastCommit(ctx, path, signal)
}

/**
 * Fetch `origin` and report the refreshed status.
 *
 * @param {{subprocess: any}} ctx - Host context.
 * @param {object} input - Input.
 * @param {string} input.path - Repository path.
 * @param {string} input.token - Access token.
 * @param {AbortSignal} [input.signal] - Cancellation.
 * @returns {Promise<object>} Fresh status.
 */
export async function fetchRepository(ctx, { path, token, signal }) {
  await assertGithubRemote(ctx, path, signal)
  const result = await runGit(ctx, ['-C', path, 'fetch', '--prune', '--quiet', 'origin'], {
    token,
    signal,
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) {
    const text = `${result.stdout}\n${result.stderr}`
    if (/Authentication failed|could not read Username|invalid username or password/i.test(text)) {
      throw new GithubError('token-invalid', 'GitHub rejected the credentials. Sign in again.')
    }
    throw gitFailure(result, 'fetch failed')
  }
  return readStatus(ctx, { path, signal })
}
