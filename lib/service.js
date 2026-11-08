/**
 * Business layer of the GitHub plugin.
 *
 * One instance is created per plugin mount. It owns:
 * - the sign-in state machine driven by the DSH authorization service;
 * - credential reads/writes (the only place the token is read);
 * - the repository and local-git operations;
 * - failure redaction.
 *
 * The token is read from the credential store on every operation and is never
 * cached in the settings file, the UI payload, or a Tool result.
 *
 * @module dsh-github/lib/service
 */

import { lstat, readdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { configFile, readConfig, updateConfig } from './config.js'
import { GithubError, asGithubError, redact } from './errors.js'
import {
  createRepository,
  getAuthenticatedUser,
  listRepositories,
  pollAccessToken,
  requestDeviceCode,
} from './github-api.js'
import {
  cloneIntoDirectory,
  cloneRepository,
  commitAll,
  commitChanges,
  ensureOrigin,
  fetchRepository,
  initRepository,
  pullRepository,
  pushRepository,
  readStatus,
  repositoryTopLevel,
} from './git.js'
import {
  assertCommitMessage,
  assertRepoName,
  assertRepoPaths,
  isInside,
  optionalBoolean,
  optionalString,
  parseFullName,
} from './validate.js'

/** Credential record that holds the OAuth access token. */
export const TOKEN_KEY = 'dsh-github/token'

/** Maximum number of local repositories reported by `local_list`. */
const MAX_LOCAL_REPOS = 40

/** Repository status reads run in small parallel batches. */
const STATUS_BATCH = 4

/** How long a verified GitHub identity is trusted before re-checking (ms). */
const USER_CACHE_MS = 60000

/**
 * @typedef {object} LoginState
 * @property {'idle' | 'starting' | 'pending' | 'authorized' | 'cancelled' | 'failed' | 'expired'} status
 * @property {string} [userCode] - Device code to type on GitHub.
 * @property {string} [verificationUri] - GitHub verification page.
 * @property {string} [expiresAt] - ISO timestamp when the code expires.
 * @property {string} [message] - Human-readable progress line.
 * @property {string} [code] - Failure code.
 */

/**
 * Create the plugin service.
 *
 * @param {any} ctx - Host context carrying `credentials`, `authorization` and `subprocess`.
 * @returns {object} Service API used by the HTTP route, the Tool and `index.js`.
 */
export function createService(ctx) {
  /** @type {LoginState} */
  let login = { status: 'idle' }
  /** @type {string} */
  let lastToken = ''
  /** @type {{token: string, at: number, user: any} | null} */
  let userCache = null
  /** @type {boolean} */
  let toolsRegistered = false

  /** Serialize mutating operations (clone/commit/pull/push/create). */
  let tail = Promise.resolve()
  /**
   * @template T
   * @param {() => Promise<T>} work - Critical section.
   * @returns {Promise<T>}
   */
  function exclusive(work) {
    const run = tail.then(work, work)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Scrub every known secret from a message.
   *
   * @param {string} value - Text.
   * @returns {string}
   */
  function scrub(value) {
    return redact(value, lastToken === '' ? [] : [lastToken])
  }

  /**
   * Read the stored token record, if any.
   *
   * @returns {Promise<{token: string, payload: Record<string, any>} | null>}
   */
  async function readToken() {
    let record = null
    try {
      record = await ctx.credentials.readRecord(TOKEN_KEY)
    } catch {
      return null
    }
    if (record === null || typeof record !== 'object' || record.kind !== 'grant') return null
    const payload = record.payload
    if (payload === null || typeof payload !== 'object') return null
    if (typeof payload.accessToken !== 'string' || payload.accessToken.length < 8) return null
    lastToken = payload.accessToken
    return { token: payload.accessToken, payload }
  }

  /**
   * Require a signed-in token.
   *
   * @returns {Promise<{token: string, payload: Record<string, any>}>}
   */
  async function requireToken() {
    const record = await readToken()
    if (record === null) throw new GithubError('not-signed-in', 'Sign in with GitHub first.')
    return record
  }

  /**
   * Public login state (normalizes an expired pending code).
   *
   * @returns {LoginState}
   */
  function publicLogin() {
    if (login.status === 'pending' && typeof login.expiresAt === 'string') {
      const expires = Date.parse(login.expiresAt)
      if (Number.isFinite(expires) && expires < Date.now()) return { ...login, status: 'expired' }
    }
    return { ...login }
  }

  /**
   * Full UI state: settings, signed-in identity and the login machine.
   *
   * @returns {Promise<object>}
   */
  async function state() {
    const config = await readConfig()
    const record = await readToken()
    /** @type {Record<string, unknown>} */
    const auth = { signedIn: false }
    if (record !== null) {
      auth.signedIn = true
      auth.login = typeof record.payload.login === 'string' ? record.payload.login : ''
      auth.name = typeof record.payload.name === 'string' ? record.payload.name : ''
      auth.avatarUrl = typeof record.payload.avatarUrl === 'string' ? record.payload.avatarUrl : ''
      auth.scopes = typeof record.payload.scope === 'string' ? record.payload.scope : ''
      auth.obtainedAt = typeof record.payload.obtainedAt === 'string' ? record.payload.obtainedAt : ''
      auth.expired = false
      try {
        const cached = userCache !== null && userCache.token === record.token && Date.now() - userCache.at < USER_CACHE_MS
        const user = cached ? userCache.user : await getAuthenticatedUser(record.token, AbortSignal.timeout(6000))
        if (!cached) userCache = { token: record.token, at: Date.now(), user }
        auth.login = user.login !== '' ? user.login : auth.login
        auth.name = user.name !== '' ? user.name : auth.name
        auth.avatarUrl = user.avatarUrl !== '' ? user.avatarUrl : auth.avatarUrl
        auth.url = user.htmlUrl
      } catch (error) {
        const failure = asGithubError(error)
        if (failure.code === 'token-invalid' || failure.code === 'forbidden') {
          auth.expired = true
          userCache = null
        } else {
          auth.unverified = true
        }
      }
    }
    return {
      settings: { ...config, configFile: configFile() },
      auth,
      login: publicLogin(),
      toolsRegistered,
    }
  }

  /**
   * Start the device-flow sign-in.
   *
   * The HTTP request's abort signal is deliberately not forwarded: the flow
   * must outlive the response so the client can keep polling `login_status`.
   *
   * @returns {Promise<LoginState>}
   */
  async function startLogin() {
    const config = await readConfig()
    if (config.clientId === '') {
      throw new GithubError('missing-client-id', 'Configure the OAuth App Client ID before signing in.')
    }
    if (login.status === 'starting' || login.status === 'pending') return publicLogin()
    login = { status: 'starting' }

    /** @type {{notify: (notice: any) => void, prompt: () => Promise<string>}} */
    const interaction = {
      notify(notice) {
        if (login.status !== 'starting' && login.status !== 'pending') return
        /** @type {LoginState} */
        const next = { ...login, status: 'pending' }
        if (notice !== null && typeof notice === 'object') {
          if (typeof notice.message === 'string') next.message = notice.message
          if (typeof notice.code === 'string') next.userCode = notice.code
          if (typeof notice.url === 'string') next.verificationUri = notice.url
        }
        login = next
      },
      async prompt() {
        throw new GithubError('prompt-unsupported', 'The GitHub device flow does not ask questions.')
      },
    }

    let started
    try {
      started = ctx.authorization.begin({ key: TOKEN_KEY, method: 'device', interaction })
    } catch (error) {
      const failure = asGithubError(error)
      login = { status: 'failed', code: failure.code, message: scrub(failure.message) }
      return publicLogin()
    }
    void started.then(
      (outcome) => {
        if (outcome?.status === 'cancelled') login = { status: 'cancelled' }
        else login = { status: 'authorized' }
      },
      (error) => {
        const failure = asGithubError(error)
        login =
          failure.code === 'cancelled'
            ? { status: 'cancelled' }
            : { status: 'failed', code: failure.code, message: scrub(failure.message) }
      },
    )
    return publicLogin()
  }

  /**
   * Cancel an in-flight sign-in.
   *
   * @returns {Promise<LoginState>}
   */
  async function cancelLogin() {
    try {
      await ctx.authorization.cancel(TOKEN_KEY)
    } catch {
      // Nothing in flight is not an error for the UI.
    }
    if (login.status === 'starting' || login.status === 'pending') login = { status: 'cancelled' }
    return publicLogin()
  }

  /**
   * Forget the stored token.
   *
   * @returns {Promise<object>} Fresh state.
   */
  async function logout() {
    try {
      await ctx.authorization.cancel(TOKEN_KEY)
    } catch {
      // ignore
    }
    try {
      await ctx.credentials.deleteRecord(TOKEN_KEY)
    } catch (error) {
      throw new GithubError('logout-failed', scrub(`Could not delete the stored token: ${asGithubError(error).message}`))
    }
    lastToken = ''
    userCache = null
    login = { status: 'idle' }
    return state()
  }

  /**
   * Persist non-secret settings.
   *
   * @param {Record<string, unknown>} payload - Partial settings.
   * @returns {Promise<object>}
   */
  async function saveSettings(payload) {
    const before = await readConfig()
    /** @type {Record<string, unknown>} */
    const patch = {}
    if (payload !== null && typeof payload === 'object') {
      if ('clientId' in payload) patch.clientId = optionalString(payload, 'clientId', 128) ?? ''
      if ('cloneRoot' in payload) patch.cloneRoot = optionalString(payload, 'cloneRoot', 4096) ?? ''
      if ('agentTools' in payload) patch.agentTools = optionalBoolean(payload, 'agentTools', false)
    }
    const next = await updateConfig(patch)
    return {
      settings: { ...next, configFile: configFile() },
      toolsRestartRequired: next.agentTools !== before.agentTools,
    }
  }

  /**
   * List repositories visible to the token.
   *
   * @returns {Promise<{repos: any[], truncated: boolean}>}
   */
  async function listRepos() {
    const record = await requireToken()
    const repos = await listRepositories(record.token)
    return { repos, truncated: repos.length >= 100 }
  }

  /**
   * Create a repository for the signed-in account.
   *
   * @param {Record<string, unknown>} payload - `{name, description, private, autoInit}`.
   * @returns {Promise<{repo: any}>}
   */
  function createRepo(payload) {
    return exclusive(async () => {
      const record = await requireToken()
      const name = assertRepoName(payload?.name)
      const description = optionalString(payload, 'description', 350) ?? ''
      const isPrivate = optionalBoolean(payload, 'private', true)
      const autoInit = optionalBoolean(payload, 'autoInit', true)
      const repo = await createRepository(record.token, { name, description, private: isPrivate, autoInit })
      return { repo }
    })
  }

  /**
   * Clone one repository into the clone root.
   *
   * @param {string} fullName - `owner/name`.
   * @param {AbortSignal | undefined} signal - Cancellation.
   * @returns {Promise<{path: string, repo: object}>}
   */
  function cloneRepo(fullName, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const config = await readConfig()
      const target = await cloneRepository(ctx, {
        token: record.token,
        fullName: typeof fullName === 'string' ? fullName : '',
        root: config.cloneRoot,
        signal,
      })
      const repo = await readStatus(ctx, { path: target, signal })
      return { path: target, repo }
    })
  }

  /**
   * Resolve a user-supplied path to a git repository inside the clone root.
   *
   * @param {unknown} raw - Absolute path or path relative to the clone root.
   * @returns {Promise<{path: string, root: string}>}
   */
  async function resolveLocalRepo(raw) {
    const input = typeof raw === 'string' ? raw.trim() : ''
    if (input === '' || input.includes('\0') || input.length > 4096) {
      throw new GithubError('invalid-path', 'A repository path is required.')
    }
    const config = await readConfig()
    const rootInfo = await lstat(config.cloneRoot).catch(() => null)
    if (rootInfo === null || !rootInfo.isDirectory()) {
      throw new GithubError('clone-root-missing', 'The configured clone root does not exist.')
    }
    const realRoot = await realpath(config.cloneRoot)
    const candidate = resolve(realRoot, input)
    const real = await realpath(candidate).catch(() => null)
    if (real === null) throw new GithubError('not-found', 'That directory does not exist.')
    if (!isInside(realRoot, real)) {
      throw new GithubError('unsafe-path', 'Refusing to operate outside the configured clone root.')
    }
    const gitDir = await lstat(join(real, '.git')).catch(() => null)
    if (gitDir === null || !gitDir.isDirectory()) {
      throw new GithubError('not-a-repo', 'That directory is not a git repository.')
    }
    return { path: real, root: realRoot }
  }

  /**
   * Scan the clone root for local repositories and read their status.
   *
   * @returns {Promise<{root: string, exists: boolean, repos: any[], truncated: boolean}>}
   */
  async function listLocal() {
    const config = await readConfig()
    const rootInfo = await lstat(config.cloneRoot).catch(() => null)
    if (rootInfo === null || !rootInfo.isDirectory()) {
      return { root: config.cloneRoot, exists: false, repos: [], truncated: false }
    }
    const realRoot = await realpath(config.cloneRoot)
    /** @type {string[]} */
    const found = []
    outer: for (const ownerEntry of await readdir(realRoot, { withFileTypes: true }).catch(() => [])) {
      if (!ownerEntry.isDirectory() || ownerEntry.isSymbolicLink() || ownerEntry.name.startsWith('.')) continue
      const ownerPath = join(realRoot, ownerEntry.name)
      for (const repoEntry of await readdir(ownerPath, { withFileTypes: true }).catch(() => [])) {
        if (!repoEntry.isDirectory() || repoEntry.isSymbolicLink() || repoEntry.name.startsWith('.')) continue
        const repoPath = join(ownerPath, repoEntry.name)
        const gitDir = await lstat(join(repoPath, '.git')).catch(() => null)
        if (gitDir === null || !gitDir.isDirectory()) continue
        found.push(repoPath)
        if (found.length >= MAX_LOCAL_REPOS) break outer
      }
    }
    /** @type {any[]} */
    const repos = []
    for (let index = 0; index < found.length; index += STATUS_BATCH) {
      const batch = found.slice(index, index + STATUS_BATCH)
      const statuses = await Promise.all(
        batch.map(async (repoPath) => {
          try {
            return await readStatus(ctx, { path: repoPath })
          } catch (error) {
            return { path: repoPath, branch: '', clean: true, changeCount: 0, changes: [], lastCommit: null, remote: null, error: asGithubError(error).code }
          }
        }),
      )
      repos.push(...statuses)
    }
    return { root: realRoot, exists: true, repos, truncated: found.length >= MAX_LOCAL_REPOS }
  }

  /**
   * Read one local repository's status.
   *
   * @param {unknown} raw - Repository path.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  async function localStatus(raw, signal) {
    const { path } = await resolveLocalRepo(raw)
    return { repo: await readStatus(ctx, { path, signal }) }
  }

  /**
   * Fast-forward pull one local repository.
   *
   * @param {unknown} raw - Repository path.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  function pullRepo(raw, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const { path } = await resolveLocalRepo(raw)
      const repo = await pullRepository(ctx, { path, token: record.token, signal })
      return { repo }
    })
  }

  /**
   * Commit staged changes (all changes unless `files` is given) and optionally
   * push.
   *
   * @param {Record<string, unknown>} payload - `{path, message, files, push}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  function commitRepo(payload, signal) {
    return exclusive(async () => {
      const { path } = await resolveLocalRepo(payload?.path)
      const message = assertCommitMessage(payload?.message)
      const files = assertRepoPaths(payload?.files)
      const shouldPush = optionalBoolean(payload, 'push', false)
      const commit = await commitChanges(ctx, { path, message, files, signal })
      /** @type {{branch: string, upstream: string} | null} */
      let pushed = null
      if (shouldPush) {
        const record = await requireToken()
        pushed = await pushRepository(ctx, { path, token: record.token, signal })
      }
      const repo = await readStatus(ctx, { path, signal })
      return { commit, pushed, repo }
    })
  }

  /**
   * Push one local repository.
   *
   * @param {unknown} raw - Repository path.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  function pushRepo(raw, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const { path } = await resolveLocalRepo(raw)
      const pushed = await pushRepository(ctx, { path, token: record.token, signal })
      const repo = await readStatus(ctx, { path, signal })
      return { pushed, repo }
    })
  }

  /**
   * Resolve the committed working directory of one live session.
   *
   * The Client only names a session; the Host resolves the directory itself
   * through `agents` + `workingDirectory`, so a request can never point the
   * plugin at an arbitrary path.
   *
   * @param {unknown} sessionId - Session identifier from the Client.
   * @returns {Promise<string>} Real path of the session directory.
   */
  async function sessionDirectory(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 200) {
      throw new GithubError('session-not-found', 'Open a session and try again.')
    }
    const agents = ctx.get('agents')
    const agent = agents !== undefined && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
    if (agent === undefined || agent === null) {
      throw new GithubError('session-not-found', 'That session is not active. Open it and try again.')
    }
    let dir = ''
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory !== undefined && typeof workingDirectory.get === 'function') {
      try {
        dir = workingDirectory.get(agent.session)
      } catch {
        dir = ''
      }
    }
    if (typeof dir !== 'string' || dir === '') dir = agent.session?.header?.cwd ?? ''
    if (typeof dir !== 'string' || dir === '') {
      throw new GithubError('session-not-found', 'That session has no working directory.')
    }
    const real = await realpath(dir).catch(() => null)
    if (real === null) throw new GithubError('not-found', 'The session directory no longer exists.')
    const info = await lstat(real).catch(() => null)
    if (info === null || !info.isDirectory()) {
      throw new GithubError('invalid-path', 'The session directory is not a directory.')
    }
    return real
  }

  /**
   * Find the single git repository directly inside a directory.
   *
   * Cloning into a session folder produces `<session>/<repo>`; treating that
   * repository as the session's repository keeps the dock usable afterwards.
   * More than one immediate repository is ambiguous, so none is chosen.
   *
   * @param {string} base - Session directory.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<string | null>}
   */
  async function findChildRepository(base, signal) {
    const directories = []
    for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue
      directories.push(join(base, entry.name))
    }
    // Only a folder that holds nothing but the checkout is treated as that
    // checkout: a shared workspace with several projects must not be guessed.
    if (directories.length !== 1) return null
    const child = directories[0]
    const gitDir = await lstat(join(child, '.git')).catch(() => null)
    if (gitDir === null) return null
    if ((await repositoryTopLevel(ctx, child, signal)) !== child) return null
    return child
  }

  /**
   * Resolve the repository the session actions should operate on.
   *
   * When the session directory is itself a repository it wins; otherwise a
   * single repository one level below is used (the result of a clone).
   *
   * @param {unknown} sessionId - Session identifier.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{base: string, path: string, repoRoot: string | null}>}
   */
  async function sessionRepository(sessionId, signal) {
    const base = await sessionDirectory(sessionId)
    const top = await repositoryTopLevel(ctx, base, signal)
    if (top !== null) return { base, path: base, repoRoot: top }
    const child = await findChildRepository(base, signal)
    if (child === null) return { base, path: base, repoRoot: null }
    return { base, path: child, repoRoot: child }
  }

  /**
   * Read the git state of the session directory.
   *
   * @param {unknown} sessionId - Session identifier.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{base: string, path: string, repoRoot: string | null, repo: object | null}>}
   */
  async function sessionStatus(sessionId, signal) {
    const { base, path, repoRoot } = await sessionRepository(sessionId, signal)
    if (repoRoot === null) return { base, path, repoRoot: null, repo: null }
    return { base, path, repoRoot, repo: await readStatus(ctx, { path, signal }) }
  }

  /**
   * Clone one repository into the session directory (flat layout).
   *
   * @param {Record<string, unknown>} payload - `{sessionId, fullName}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{path: string, repo: object}>}
   */
  function sessionClone(payload, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const baseDir = await sessionDirectory(payload?.sessionId)
      const fullName = parseFullName(payload?.fullName)
      const target = await cloneIntoDirectory(ctx, {
        token: record.token,
        fullName: `${fullName.owner}/${fullName.name}`,
        baseDir,
        signal,
      })
      const repo = await readStatus(ctx, { path: target, signal })
      return { path: target, repo }
    })
  }

  /**
   * Fast-forward pull the repository that contains the session directory.
   *
   * @param {Record<string, unknown>} payload - `{sessionId}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{path: string, repo: object}>}
   */
  function sessionPull(payload, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const { base, path, repoRoot } = await sessionRepository(payload?.sessionId, signal)
      if (repoRoot === null) {
        throw new GithubError('not-a-repo', 'This session directory is not a git repository.')
      }
      const repo = await pullRepository(ctx, { path, token: record.token, signal })
      return { base, path, repo }
    })
  }

  /**
   * Fetch `origin` for the session repository and report the refreshed status.
   *
   * @param {Record<string, unknown>} payload - `{sessionId}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{path: string, repo: object}>}
   */
  function sessionFetch(payload, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const { base, path, repoRoot } = await sessionRepository(payload?.sessionId, signal)
      if (repoRoot === null) {
        throw new GithubError('not-a-repo', 'This session directory is not a git repository.')
      }
      const repo = await fetchRepository(ctx, { path, token: record.token, signal })
      return { base, path, repo }
    })
  }

  /**
   * Commit the session repository and optionally push it.
   *
   * @param {Record<string, unknown>} payload - `{sessionId, message, files, push}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  function sessionCommit(payload, signal) {
    return exclusive(async () => {
      const { base, path, repoRoot } = await sessionRepository(payload?.sessionId, signal)
      if (repoRoot === null) {
        throw new GithubError('not-a-repo', 'This session directory is not a git repository.')
      }
      const message = assertCommitMessage(payload?.message)
      const files = assertRepoPaths(payload?.files)
      const shouldPush = optionalBoolean(payload, 'push', false)
      const commit = await commitChanges(ctx, { path, message, files, signal })
      /** @type {{branch: string, upstream: string} | null} */
      let pushed = null
      if (shouldPush) {
        const record = await requireToken()
        pushed = await pushRepository(ctx, { path, token: record.token, signal })
      }
      const repo = await readStatus(ctx, { path, signal })
      return { base, path, commit, pushed, repo }
    })
  }

  /**
   * Create a GitHub repository for the session directory and push it.
   *
   * The directory is initialised only when it is not a repository yet; when it
   * already sits inside a different repository the request is refused so the
   * plugin never publishes a parent project by accident.
   *
   * @param {Record<string, unknown>} payload - `{sessionId, name, description, private, message}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<object>}
   */
  function sessionPublish(payload, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const path = await sessionDirectory(payload?.sessionId)
      const name = assertRepoName(payload?.name)
      const description = optionalString(payload, 'description', 350) ?? ''
      const isPrivate = optionalBoolean(payload, 'private', true)
      const message = optionalString(payload, 'message', 5000) || 'Initial commit'
      assertCommitMessage(message)
      const top = await repositoryTopLevel(ctx, path, signal)
      if (top !== null && top !== path) {
        throw new GithubError(
          'repo-elsewhere',
          'The session directory is inside another git repository. Open that repository instead.',
        )
      }
      if (top === null && (await findChildRepository(path, signal)) !== null) {
        throw new GithubError(
          'repo-nested',
          'The session folder already contains a git repository; use that one instead.',
        )
      }
      const remote = await createRepository(record.token, {
        name,
        description,
        private: isPrivate,
        autoInit: false,
      })
      if (top === null) await initRepository(ctx, path, signal)
      await ensureOrigin(ctx, { path, url: `https://github.com/${remote.fullName}.git`, signal })
      const commit = await commitAll(ctx, { path, message, signal })
      const pushed = await pushRepository(ctx, { path, token: record.token, signal })
      const repo = await readStatus(ctx, { path, signal })
      return { remote, path, commit, pushed, repo }
    })
  }

  /**
   * Push the session repository's current branch to `origin`.
   *
   * @param {Record<string, unknown>} payload - `{sessionId}`.
   * @param {AbortSignal} [signal] - Cancellation.
   * @returns {Promise<{path: string, pushed: {branch: string, upstream: string}, repo: object}>}
   */
  function sessionPush(payload, signal) {
    return exclusive(async () => {
      const record = await requireToken()
      const { base, path, repoRoot } = await sessionRepository(payload?.sessionId, signal)
      if (repoRoot === null) {
        throw new GithubError('not-a-repo', 'This session directory is not a git repository.')
      }
      const pushed = await pushRepository(ctx, { path, token: record.token, signal })
      const repo = await readStatus(ctx, { path, signal })
      return { base, path, pushed, repo }
    })
  }

  /**
   * The DSH authorization flow for `dsh-github/token`.
   *
   * @returns {object}
   */
  function authorizationFlow() {
    return {
      key: TOKEN_KEY,
      label: 'GitHub',
      methods: [{ id: 'device', label: 'GitHub device code' }],
      /**
       * @param {any} session - Authorization session supplied by the service.
       * @returns {Promise<void>}
       */
      async run(session) {
        const config = await readConfig()
        if (config.clientId === '') {
          throw new GithubError('missing-client-id', 'Configure the OAuth App Client ID before signing in.')
        }
        const device = await requestDeviceCode(config.clientId, session.signal)
        login = {
          status: 'pending',
          userCode: device.userCode,
          verificationUri: device.verificationUri,
          expiresAt: new Date(Date.now() + device.expiresIn * 1000).toISOString(),
          message: `Enter the code ${device.userCode} at GitHub to authorize this device.`,
        }
        session.notify({
          message: `Enter the code ${device.userCode} at GitHub to authorize this device.`,
          url: device.verificationUri,
          code: device.userCode,
        })
        const granted = await pollAccessToken(config.clientId, device, session.signal)
        const user = await getAuthenticatedUser(granted.accessToken, session.signal)
        lastToken = granted.accessToken
        await session.commit({
          kind: 'grant',
          payload: {
            accessToken: granted.accessToken,
            tokenType: granted.tokenType,
            scope: granted.scope,
            login: user.login,
            name: user.name,
            avatarUrl: user.avatarUrl,
            obtainedAt: new Date().toISOString(),
          },
        })
        userCache = null
        login = { status: 'authorized' }
      },
    }
  }

  /**
   * Redacted failure payload for a Client response.
   *
   * @param {unknown} error - Thrown value.
   * @returns {{code: string, message: string, details: Record<string, unknown>}}
   */
  function failure(error) {
    const normalized = asGithubError(error)
    /** @type {Record<string, unknown>} */
    const details = {}
    if (normalized.details !== null && typeof normalized.details === 'object') {
      for (const [key, value] of Object.entries(normalized.details)) {
        details[key] = typeof value === 'string' ? scrub(value) : value
      }
    }
    return { code: normalized.code, message: scrub(normalized.message), details }
  }

  /**
   * Dispatch one HTTP action.
   *
   * @param {string} action - Action name.
   * @param {any} payload - Parsed request body.
   * @param {AbortSignal} [signal] - Request cancellation.
   * @returns {Promise<unknown>}
   */
  async function dispatch(action, payload, signal) {
    switch (action) {
      case 'state':
        return state()
      case 'settings_save':
        return saveSettings(payload ?? {})
      case 'login_start':
        await startLogin()
        return state()
      case 'login_status':
        return state()
      case 'login_cancel': {
        await cancelLogin()
        return state()
      }
      case 'logout':
        return logout()
      case 'list_repos':
        return listRepos()
      case 'repo_create':
        return createRepo(payload ?? {})
      case 'repo_clone':
        return cloneRepo(payload?.fullName, signal)
      case 'local_list':
        return listLocal()
      case 'local_status':
        return localStatus(payload?.path, signal)
      case 'repo_pull':
        return pullRepo(payload?.path, signal)
      case 'repo_commit':
        return commitRepo(payload ?? {}, signal)
      case 'repo_push':
        return pushRepo(payload?.path, signal)
      case 'session_status':
        return sessionStatus(payload?.sessionId, signal)
      case 'session_clone':
        return sessionClone(payload ?? {}, signal)
      case 'session_pull':
        return sessionPull(payload ?? {}, signal)
      case 'session_fetch':
        return sessionFetch(payload ?? {}, signal)
      case 'session_commit':
        return sessionCommit(payload ?? {}, signal)
      case 'session_publish':
        return sessionPublish(payload ?? {}, signal)
      case 'session_push':
        return sessionPush(payload ?? {}, signal)
      default:
        throw new GithubError('unknown-action', `Unknown action "${action}".`)
    }
  }

  /**
   * Dispatch one Agent Tool action (same guards as the HTTP path).
   *
   * @param {string} action - Tool action.
   * @param {Record<string, unknown>} args - Tool arguments.
   * @param {AbortSignal} [signal] - Tool cancellation.
   * @returns {Promise<unknown>}
   */
  async function dispatchTool(action, args, signal) {
    const input = args !== null && typeof args === 'object' ? args : {}
    switch (action) {
      case 'status':
        return state()
      case 'list_repos':
        return listRepos()
      case 'create_repo':
        return createRepo(input)
      case 'clone':
        return cloneRepo(input.fullName, signal)
      case 'pull':
        return pullRepo(input.path, signal)
      case 'commit':
        return commitRepo(input, signal)
      case 'push':
        return pushRepo(input.path, signal)
      default:
        throw new GithubError('unknown-action', `Unknown action "${action}".`)
    }
  }

  /**
   * Record that Agent tools were registered at mount.
   *
   * @param {boolean} value - Whether tools are live.
   */
  function markToolsRegistered(value) {
    toolsRegistered = value === true
  }

  return {
    TOKEN_KEY,
    state,
    startLogin,
    cancelLogin,
    logout,
    saveSettings,
    listRepos,
    createRepo,
    cloneRepo,
    listLocal,
    localStatus,
    pullRepo,
    commitRepo,
    pushRepo,
    sessionStatus,
    sessionClone,
    sessionPull,
    sessionFetch,
    sessionCommit,
    sessionPublish,
    sessionPush,
    authorizationFlow,
    failure,
    dispatch,
    dispatchTool,
    markToolsRegistered,
    readToken,
    resolveLocalRepo,
  }
}
