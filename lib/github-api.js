/**
 * Thin GitHub REST client: device-flow sign-in and the repository calls the
 * plugin needs.
 *
 * Security properties:
 * - the token travels only in the `Authorization` header, never in a URL,
 *   query string, or log line;
 * - redirects are refused, so a 30x cannot move the token to another host;
 * - every call carries a hard timeout and a caller-supplied abort signal.
 *
 * @module dsh-github/lib/github-api
 */

import { GithubError } from './errors.js'

const API_ROOT = 'https://api.github.com'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_AGENT = 'dsh-github/1.1.1'
const DEFAULT_TIMEOUT_MS = 20000

/**
 * OAuth scopes requested at sign-in.
 *
 * `repo` covers private repositories. `workflow` is what GitHub demands before
 * it lets a token create or update `.github/workflows/*` files: with a
 * `repo`-only token `git push` fails with "refusing to allow an OAuth App to
 * create or update workflow ... without `workflow` scope". One Device Flow
 * authorization grants both, so asking together costs nothing extra.
 */
const REQUESTED_SCOPE = 'repo workflow'

/** Scopes the plugin relies on, used to flag tokens that need re-authorization. */
export const REQUIRED_SCOPES = Object.freeze(['repo', 'workflow'])

/**
 * Scopes from {@link REQUIRED_SCOPES} that a granted scope string does not cover.
 *
 * GitHub reports granted scopes comma separated ("repo, workflow"); older
 * tokens can report a space separated or even empty string.
 *
 * @param {string} granted - Scope string stored with the token.
 * @returns {string[]} Missing scopes, in REQUIRED_SCOPES order.
 */
export function missingScopes(granted) {
  const held = new Set(String(granted ?? '').split(/[,\s]+/).filter(Boolean))
  return REQUIRED_SCOPES.filter((scope) => !held.has(scope))
}

/**
 * @typedef {object} DeviceCode
 * @property {string} deviceCode
 * @property {string} userCode
 * @property {string} verificationUri
 * @property {number} expiresIn - Seconds until the code expires.
 * @property {number} interval - Minimum polling interval in seconds.
 */

/**
 * @typedef {object} Repository
 * @property {number} id
 * @property {string} fullName
 * @property {string} name
 * @property {string} owner
 * @property {boolean} private
 * @property {string} description
 * @property {string} defaultBranch
 * @property {string} updatedAt
 * @property {string} htmlUrl
 * @property {boolean} canPush
 */

/**
 * Sleep that rejects when the signal aborts.
 *
 * @param {number} ms - Delay.
 * @param {AbortSignal | undefined} signal - Cancellation.
 * @returns {Promise<void>}
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new GithubError('cancelled', 'the operation was cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new GithubError('cancelled', 'the operation was cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * One HTTP request against GitHub, JSON in and JSON out.
 *
 * @param {string} url - Absolute URL.
 * @param {object} [options] - Request options.
 * @param {'GET' | 'POST'} [options.method] - HTTP method.
 * @param {string} [options.token] - Access token (sent as a Bearer header).
 * @param {unknown} [options.body] - JSON body.
 * @param {AbortSignal} [options.signal] - Cancellation.
 * @param {number} [options.timeoutMs] - Timeout in milliseconds.
 * @param {string} [options.accept] - Accept header.
 * @returns {Promise<any>}
 */
async function request(url, options = {}) {
  const {
    method = 'GET',
    token,
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    accept = 'application/vnd.github+json',
  } = options
  const signals = [AbortSignal.timeout(timeoutMs)]
  if (signal !== undefined) signals.push(signal)
  /** @type {Record<string, string>} */
  const headers = { accept, 'user-agent': USER_AGENT }
  if (typeof token === 'string' && token !== '') headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any(signals),
    })
  } catch (error) {
    const aborted = AbortSignal.any(signals).aborted
    if (aborted) {
      throw new GithubError('network-error', 'the GitHub request timed out or was cancelled.', {}, { cause: error })
    }
    throw new GithubError(
      'network-error',
      `could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`,
      {},
      { cause: error },
    )
  }

  const text = await response.text().catch(() => '')
  let payload = null
  if (text !== '') {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) throw httpFailure(response, payload)
  if (payload === null || typeof payload !== 'object') {
    throw new GithubError('github-bad-response', `GitHub returned an unreadable response (HTTP ${response.status}).`)
  }
  return payload
}

/**
 * Map a non-2xx GitHub response to a GithubError.
 *
 * @param {Response} response - Failed response.
 * @param {any} payload - Parsed body, if any.
 * @returns {GithubError}
 */
function httpFailure(response, payload) {
  const status = response.status
  const message = typeof payload?.message === 'string' ? payload.message : ''
  if (status === 401) {
    return new GithubError('token-invalid', 'GitHub rejected the stored token. Sign in again.')
  }
  if (status === 403 || status === 429) {
    if (response.headers.get('x-ratelimit-remaining') === '0' || status === 429) {
      const reset = response.headers.get('x-ratelimit-reset')
      const retryAfter = response.headers.get('retry-after')
      const hint = reset !== null ? ` Resets at ${new Date(Number(reset) * 1000).toISOString()}.` : ''
      const wait = retryAfter !== null ? ` Retry after ${retryAfter}s.` : ''
      return new GithubError('rate-limited', `GitHub API rate limit exceeded.${wait}${hint}`)
    }
    return new GithubError('forbidden', `GitHub refused the request (HTTP 403)${message !== '' ? `: ${message}` : ''}.`)
  }
  if (status === 404) {
    return new GithubError('not-found', 'GitHub returned 404: the repository does not exist or the token lacks access.')
  }
  if (status === 422) {
    const first = Array.isArray(payload?.errors) && payload.errors.length > 0 ? payload.errors[0] : undefined
    const detail = typeof first?.message === 'string' ? first.message : message
    return new GithubError('invalid-request', `GitHub rejected the request: ${detail || 'HTTP 422'}`)
  }
  return new GithubError(
    'github-error',
    `GitHub request failed (HTTP ${status})${message !== '' ? `: ${message}` : ''}.`,
  )
}

/**
 * Map a device-flow error code to a GithubError.
 *
 * @param {string} code - GitHub error code.
 * @param {string} [description] - GitHub error description.
 * @returns {GithubError}
 */
function deviceFailure(code, description) {
  const detail = typeof description === 'string' && description !== '' ? ` ${description}` : ''
  switch (code) {
    case 'device_flow_disabled':
      return new GithubError('device-flow-disabled', 'This OAuth App has Device Flow disabled. Enable it in the App settings.')
    case 'unauthorized_client':
    case 'incorrect_client_credentials':
    case 'invalid_client':
      return new GithubError('client-id-invalid', `GitHub did not accept the Client ID.${detail}`)
    case 'access_denied':
      return new GithubError('login-denied', 'The authorization was denied on GitHub.')
    case 'expired_token':
      return new GithubError('login-expired', 'The device code expired before it was authorized. Start over.')
    default:
      return new GithubError('login-failed', `The device authorization failed: ${code}.${detail}`)
  }
}

/**
 * Request a device code from GitHub (step 1 of the official device flow).
 *
 * @param {string} clientId - OAuth App Client ID.
 * @param {AbortSignal | undefined} signal - Cancellation.
 * @returns {Promise<DeviceCode>}
 */
export async function requestDeviceCode(clientId, signal) {
  const payload = await request(DEVICE_CODE_URL, {
    method: 'POST',
    body: { client_id: clientId, scope: REQUESTED_SCOPE },
    signal,
    accept: 'application/json',
  })
  if (typeof payload.error === 'string' && payload.error !== '') {
    throw deviceFailure(payload.error, payload.error_description)
  }
  const deviceCode = payload.device_code
  const userCode = payload.user_code
  const verificationUri = payload.verification_uri
  if (typeof deviceCode !== 'string' || deviceCode === '' || typeof userCode !== 'string' || userCode === '') {
    throw new GithubError('github-bad-response', 'GitHub did not return a usable device code.')
  }
  const expiresIn = Number(payload.expires_in)
  const interval = Number(payload.interval)
  return {
    deviceCode,
    userCode,
    verificationUri: typeof verificationUri === 'string' ? verificationUri : 'https://github.com/login/device',
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 900,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 5,
  }
}

/**
 * Poll GitHub until the user authorizes (step 2 of the device flow).
 *
 * @param {string} clientId - OAuth App Client ID.
 * @param {DeviceCode} device - Code from {@link requestDeviceCode}.
 * @param {AbortSignal | undefined} signal - Cancellation.
 * @returns {Promise<{accessToken: string, scope: string, tokenType: string}>}
 */
export async function pollAccessToken(clientId, device, signal) {
  const deadline = Date.now() + Math.min(device.expiresIn, 15 * 60) * 1000
  let intervalMs = Math.max(5, device.interval) * 1000
  while (Date.now() < deadline) {
    await sleep(intervalMs, signal)
    const payload = await request(ACCESS_TOKEN_URL, {
      method: 'POST',
      body: {
        client_id: clientId,
        device_code: device.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
      signal,
      accept: 'application/json',
    })
    if (typeof payload.access_token === 'string' && payload.access_token !== '') {
      return {
        accessToken: payload.access_token,
        scope: typeof payload.scope === 'string' ? payload.scope : '',
        tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'bearer',
      }
    }
    const code = typeof payload.error === 'string' ? payload.error : ''
    if (code === 'authorization_pending') continue
    if (code === 'slow_down') {
      intervalMs += 5000
      continue
    }
    if (code === 'expired_token') throw new GithubError('login-expired', 'The device code expired. Start over.')
    if (code === 'access_denied') throw new GithubError('login-denied', 'The authorization was denied on GitHub.')
    throw deviceFailure(code === '' ? 'unknown' : code, payload.error_description)
  }
  throw new GithubError('login-expired', 'The device code expired before it was authorized. Start over.')
}

/**
 * Read the signed-in account.
 *
 * @param {string} token - Access token.
 * @param {AbortSignal | undefined} [signal] - Cancellation.
 * @returns {Promise<{login: string, name: string, avatarUrl: string, htmlUrl: string}>}
 */
export async function getAuthenticatedUser(token, signal) {
  const payload = await request(`${API_ROOT}/user`, { token, signal })
  return {
    login: typeof payload.login === 'string' ? payload.login : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    avatarUrl: typeof payload.avatar_url === 'string' ? payload.avatar_url : '',
    htmlUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
  }
}

/**
 * Shape one repository API object for the UI.
 *
 * @param {any} raw - Repository JSON from GitHub.
 * @returns {Repository}
 */
function toRepository(raw) {
  return {
    id: Number(raw.id) || 0,
    fullName: String(raw.full_name ?? ''),
    name: String(raw.name ?? ''),
    owner: String(raw.owner?.login ?? ''),
    private: raw.private === true,
    description: typeof raw.description === 'string' ? raw.description : '',
    defaultBranch: String(raw.default_branch ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
    htmlUrl: String(raw.html_url ?? ''),
    canPush: raw.permissions?.push === true,
  }
}

/**
 * List repositories the signed-in account can push to.
 *
 * @param {string} token - Access token.
 * @param {AbortSignal | undefined} signal - Cancellation.
 * @returns {Promise<Repository[]>}
 */
export async function listRepositories(token, signal) {
  const payload = await request(`${API_ROOT}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, {
    token,
    signal,
  })
  if (!Array.isArray(payload)) {
    throw new GithubError('github-bad-response', 'GitHub returned an unexpected repository list.')
  }
  return payload.map(toRepository)
}

/**
 * Create one repository for the signed-in account.
 *
 * @param {string} token - Access token.
 * @param {object} input - Repository fields.
 * @param {string} input.name - Repository name (validated by the caller).
 * @param {string} input.description - Description (may be empty).
 * @param {boolean} input.private - Private repository.
 * @param {boolean} input.autoInit - Initialize with a README.
 * @param {AbortSignal | undefined} signal - Cancellation.
 * @returns {Promise<Repository>}
 */
export async function createRepository(token, input, signal) {
  const payload = await request(`${API_ROOT}/user/repos`, {
    method: 'POST',
    token,
    body: {
      name: input.name,
      description: input.description,
      private: input.private,
      auto_init: input.autoInit,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    },
    signal,
  })
  return toRepository(payload)
}
