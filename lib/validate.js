/**
 * Input validators shared by the HTTP route and the Agent Tool.
 *
 * Rules encoded here are also security boundaries:
 * - repository and owner names are ASCII-only, so they cannot inject options
 *   or escape a path segment;
 * - committed file paths are repository-relative, cannot contain `..`, and
 *   cannot start with git pathspec magic (`:`);
 * - local repository paths must resolve inside the configured clone root.
 *
 * @module dsh-github/lib/validate
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'
import { GithubError } from './errors.js'

/** GitHub owner (user or organization) names. */
export const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

/** GitHub repository names. */
export const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/

/** Longest accepted commit message (characters). */
const MAX_MESSAGE_LENGTH = 5000

/** Longest accepted repository-relative file path (characters). */
const MAX_FILE_PATH_LENGTH = 1024

/**
 * Assert a repository name is acceptable to GitHub.
 *
 * @param {unknown} raw - Candidate name.
 * @returns {string}
 */
export function assertRepoName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '' || name.length > 100 || !REPO_PATTERN.test(name)) {
    throw new GithubError(
      'invalid-repo-name',
      'Repository names may only contain ASCII letters, digits, ".", "_" and "-" (1-100 characters).',
    )
  }
  if (name === '.' || name === '..') {
    throw new GithubError('invalid-repo-name', 'Repository name must not be "." or "..".')
  }
  return name
}

/**
 * Assert an owner name is acceptable to GitHub.
 *
 * @param {unknown} raw - Candidate owner.
 * @returns {string}
 */
export function assertOwner(raw) {
  const owner = typeof raw === 'string' ? raw.trim() : ''
  if (!OWNER_PATTERN.test(owner)) {
    throw new GithubError('invalid-owner', 'Owner must be a GitHub account or organization name (letters, digits, "-").')
  }
  return owner
}

/**
 * Parse `owner/name` (a trailing `.git` is accepted).
 *
 * @param {unknown} raw - Candidate full name.
 * @returns {{owner: string, name: string}}
 */
export function parseFullName(raw) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value)
  if (match === null) {
    throw new GithubError('invalid-repo-name', 'Expected a repository in the form "owner/name".')
  }
  const name = match[2].endsWith('.git') ? match[2].slice(0, -4) : match[2]
  return { owner: assertOwner(match[1]), name: assertRepoName(name) }
}

/**
 * True when `target` is strictly inside `root` (both are resolved first).
 *
 * @param {string} root - Directory that must contain the target.
 * @param {string} target - Candidate path.
 * @returns {boolean}
 */
export function isInside(root, target) {
  const rel = relative(resolve(root), resolve(target))
  if (rel === '' || isAbsolute(rel)) return false
  const parts = rel.split(sep)
  return parts.length > 0 && parts[0] !== '..' && parts.every((part) => part !== '')
}

/**
 * Assert `target` is strictly inside `root`.
 *
 * @param {string} root - Directory that must contain the target.
 * @param {string} target - Candidate path.
 * @returns {string} The resolved target.
 */
export function assertInside(root, target) {
  const rootAbs = resolve(root)
  const targetAbs = resolve(target)
  if (targetAbs === rootAbs) {
    throw new GithubError('unsafe-path', 'Refusing to operate on the clone root itself.')
  }
  if (!isInside(rootAbs, targetAbs)) {
    throw new GithubError('unsafe-path', 'Refusing to operate on a path outside the configured clone root.')
  }
  return targetAbs
}

/**
 * Validate a commit message.
 *
 * @param {unknown} raw - Candidate message.
 * @returns {string}
 */
export function assertCommitMessage(raw) {
  const message = typeof raw === 'string' ? raw.trim() : ''
  if (message === '') throw new GithubError('invalid-message', 'Commit message must not be empty.')
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new GithubError('invalid-message', `Commit message must be at most ${MAX_MESSAGE_LENGTH} characters.`)
  }
  if (message.includes('\0')) throw new GithubError('invalid-message', 'Commit message must not contain NUL.')
  return message
}

/**
 * Validate one repository-relative path passed to `git add`.
 *
 * @param {unknown} raw - Candidate path.
 * @returns {string}
 */
export function assertRepoPath(raw) {
  const path = typeof raw === 'string' ? raw.trim() : ''
  if (path === '' || path.length > MAX_FILE_PATH_LENGTH) {
    throw new GithubError('invalid-files', 'Each file path must be 1-1024 characters.')
  }
  if (path.includes('\0')) throw new GithubError('invalid-files', 'File paths must not contain NUL.')
  if (isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path)) {
    throw new GithubError('invalid-files', 'File paths must be repository-relative.')
  }
  const parts = path.split(/[\\/]/)
  if (parts.some((part) => part === '..')) {
    throw new GithubError('invalid-files', 'File paths must not contain "..".')
  }
  if (path.startsWith(':')) {
    throw new GithubError('invalid-files', 'File paths must not start with git pathspec magic (":").')
  }
  return path
}

/**
 * Validate a list of repository-relative paths.
 *
 * @param {unknown} raw - Candidate list; `undefined` means "all changes".
 * @returns {string[] | undefined}
 */
export function assertRepoPaths(raw) {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) throw new GithubError('invalid-files', 'files must be an array of repository-relative paths.')
  if (raw.length > 200) throw new GithubError('invalid-files', 'At most 200 file paths may be staged at once.')
  return raw.map(assertRepoPath)
}

/**
 * Read an optional string field of a request payload.
 *
 * @param {unknown} payload - Parsed request body.
 * @param {string} key - Field name.
 * @param {number} [maxLength] - Maximum accepted length.
 * @returns {string | undefined}
 */
export function optionalString(payload, key, maxLength = 500) {
  if (payload === null || typeof payload !== 'object') return undefined
  const value = /** @type {Record<string, unknown>} */ (payload)[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new GithubError('bad-request', `${key} must be a string.`)
  if (value.length > maxLength) throw new GithubError('bad-request', `${key} is too long.`)
  return value
}

/**
 * Read an optional boolean field of a request payload.
 *
 * @param {unknown} payload - Parsed request body.
 * @param {string} key - Field name.
 * @param {boolean} fallback - Value used when the field is absent.
 * @returns {boolean}
 */
export function optionalBoolean(payload, key, fallback) {
  if (payload === null || typeof payload !== 'object') return fallback
  const value = /** @type {Record<string, unknown>} */ (payload)[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new GithubError('bad-request', `${key} must be a boolean.`)
  return value
}
