/**
 * Shared error and redaction helpers for the GitHub plugin.
 *
 * Every failure that can reach the Client, a log line, or a Tool result flows
 * through {@link GithubError} and {@link redact}. The token is never part of a
 * message: git stderr and HTTP failures are scrubbed before they leave.
 *
 * @module dsh-github/lib/errors
 */

/** Maximum length of one failure message handed to the Client. */
const MAX_MESSAGE_LENGTH = 4000

/**
 * A failure with a machine-readable code.
 */
export class GithubError extends Error {
  /**
   * @param {string} code - Stable machine-readable code (`invalid-repo-name`, ...).
   * @param {string} message - Human-readable message; must not contain secrets.
   * @param {Record<string, unknown>} [details] - Extra structured data.
   * @param {{cause?: unknown}} [options] - Error options.
   */
  constructor(code, message, details = {}, options) {
    super(message, options)
    this.name = 'GithubError'
    this.code = code
    this.details = details
  }
}

/**
 * Normalize any thrown value into a GithubError.
 *
 * @param {unknown} error - Thrown value.
 * @param {string} [fallbackCode] - Code used when the value carries none.
 * @returns {GithubError}
 */
export function asGithubError(error, fallbackCode = 'internal') {
  if (error instanceof GithubError) return error
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof /** @type {{code?: unknown}} */ (error)?.code === 'string'
    ? /** @type {{code: string}} */ (error).code
    : fallbackCode
  return new GithubError(code, message || 'unknown error')
}

/**
 * Scrub secrets from text before it is returned or logged.
 *
 * Replaces: every known token value, any GitHub token literal, and any
 * `scheme://userinfo@host` fragment.
 *
 * @param {string} value - Candidate text.
 * @param {Iterable<string>} [secrets] - Secret values to remove verbatim.
 * @returns {string}
 */
export function redact(value, secrets = []) {
  let text = typeof value === 'string' ? value : String(value)
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) text = text.split(secret).join('***')
  }
  text = text.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '***')
  text = text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1***@')
  text = text.replace(/(https?:\/\/)[^\s/@]+@/g, '$1***@')
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text
}
