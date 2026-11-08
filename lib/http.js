/**
 * The authenticated HTTP route shared by the client UI.
 *
 * Registered through `ctx.connection.fetch`, which only admits requests that
 * passed the Connection's own authentication: a page that is not signed in to
 * this DSH instance never reaches the handler. On top of that the handler
 * requires a JSON content type (so a cross-site HTML form POST cannot reach
 * it), bounds the body size, and returns business failures in an `ok:false`
 * envelope with redacted messages.
 *
 * @module dsh-github/lib/http
 */

import { GithubError, asGithubError } from './errors.js'

/** Exact route below the shared `/api` channel; must match the Client half. */
export const ROUTE_PATH = '/api/github'

/** Maximum accepted request body size (bytes). */
const MAX_BODY_BYTES = 1 << 20

/**
 * One JSON response.
 *
 * @param {number} status - HTTP status.
 * @param {unknown} body - JSON body.
 * @returns {Response}
 */
export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/**
 * Failure envelope.
 *
 * @param {string} code - Machine-readable code.
 * @param {string} message - Redacted message.
 * @returns {{ok: false, error: {code: string, message: string, details: Record<string, unknown>}}}
 */
function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

/**
 * Build the route handler.
 *
 * @param {ReturnType<import('./service.js').createService>} service - Plugin service.
 * @returns {(request: Request) => Promise<Response>}
 */
export function createHandler(service) {
  return async (request) => {
    const contentType = request.headers.get('content-type') ?? ''
    if (!/^application\/json\b/i.test(contentType)) {
      return jsonResponse(415, failure('unsupported-media-type', 'send a JSON body with content-type application/json'))
    }
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return jsonResponse(413, failure('body-too-large', 'the request body is too large'))
    }

    let text
    try {
      text = await request.text()
    } catch {
      return jsonResponse(400, failure('bad-request', 'the request body could not be read'))
    }
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse(413, failure('body-too-large', 'the request body is too large'))
    }

    /** @type {unknown} */
    let payload
    try {
      payload = text.trim() === '' ? {} : JSON.parse(text)
    } catch {
      return jsonResponse(400, failure('bad-request', 'the request body is not JSON'))
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return jsonResponse(400, failure('bad-request', 'the request body must be a JSON object'))
    }

    const action = typeof /** @type {Record<string, unknown>} */ (payload).action === 'string'
      ? /** @type {{action: string}} */ (payload).action
      : ''
    try {
      const value = await service.dispatch(action, payload, request.signal)
      return jsonResponse(200, { ok: true, value })
    } catch (error) {
      const normalized = asGithubError(error)
      // `cancelled` is a normal end to a request, not a defect.
      if (normalized.code === 'cancelled') return jsonResponse(499, failure('cancelled', 'the request was cancelled'))
      return jsonResponse(200, { ok: false, error: service.failure(error) })
    }
  }
}

/**
 * Build one error-shaped response for an unexpected handler failure.
 *
 * @param {unknown} error - Thrown value.
 * @returns {Response}
 */
export function unexpectedResponse(error) {
  const normalized = error instanceof GithubError ? error : asGithubError(error)
  return jsonResponse(500, failure(normalized.code, normalized.message))
}
