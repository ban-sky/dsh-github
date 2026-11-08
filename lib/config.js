/**
 * Non-secret plugin settings.
 *
 * The access token never lives here: it is a credential record
 * (`dsh-github/token`) in the DSH credential store. This file only holds the
 * OAuth App Client ID (public by design), the clone root, and whether Agent
 * tools are exposed.
 *
 * File: `$DSH_HOME/dsh-github.json`, written atomically with mode 0600.
 *
 * @module dsh-github/lib/config
 */

import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { GithubError } from './errors.js'

/** File name inside DSH_HOME. */
export const CONFIG_FILE_NAME = 'dsh-github.json'

/**
 * GitHub OAuth App Client IDs are short alphanumeric tokens (for example
 * `Ov23liAbCdEfGhIjKlMn`). This is deliberately narrow: the value is echoed
 * back into the UI and used in a device-code request.
 */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * @typedef {object} GithubConfig
 * @property {string} clientId - OAuth App Client ID, '' when not configured.
 * @property {string} cloneRoot - Absolute directory that contains every clone.
 * @property {boolean} agentTools - Whether Agent tools are registered at mount.
 */

/**
 * DSH home directory (`DSH_HOME`, else `~/.dsh`).
 *
 * @returns {string}
 */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

/**
 * Absolute path of the settings file.
 *
 * @returns {string}
 */
export function configFile() {
  return join(dshHome(), CONFIG_FILE_NAME)
}

/**
 * Expand a leading `~` or `~/`.
 *
 * @param {string} value - Raw path from the UI.
 * @returns {string}
 */
export function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

/**
 * Default settings.
 *
 * @returns {GithubConfig}
 */
export function defaultConfig() {
  return { clientId: '', cloneRoot: join(homedir(), 'github'), agentTools: false }
}

/**
 * Coerce an unknown JSON object into a valid config, dropping invalid fields.
 *
 * @param {unknown} raw - Parsed file contents.
 * @returns {GithubConfig}
 */
export function normalizeConfig(raw) {
  const config = defaultConfig()
  if (raw === null || typeof raw !== 'object') return config
  const record = /** @type {Record<string, unknown>} */ (raw)
  if (typeof record.clientId === 'string') {
    const clientId = record.clientId.trim()
    if (clientId === '' || CLIENT_ID_PATTERN.test(clientId)) config.clientId = clientId
  }
  if (typeof record.cloneRoot === 'string' && record.cloneRoot.trim() !== '') {
    const expanded = expandHome(record.cloneRoot.trim())
    if (isAbsolute(expanded) && !expanded.includes('\0')) config.cloneRoot = resolve(expanded)
  }
  if (typeof record.agentTools === 'boolean') config.agentTools = record.agentTools
  return config
}

/**
 * Validate a partial settings patch, returning only the accepted fields.
 *
 * @param {Record<string, unknown>} patch - Fields from the UI.
 * @returns {Partial<GithubConfig>}
 */
export function validatePatch(patch) {
  /** @type {Partial<GithubConfig>} */
  const next = {}
  if ('clientId' in patch) {
    const clientId = typeof patch.clientId === 'string' ? patch.clientId.trim() : ''
    if (clientId !== '' && !CLIENT_ID_PATTERN.test(clientId)) {
      throw new GithubError(
        'invalid-client-id',
        'clientId must be 1-64 letters, digits, ".", "-" or "_" (it is the public OAuth App Client ID).',
      )
    }
    next.clientId = clientId
  }
  if ('cloneRoot' in patch) {
    const raw = typeof patch.cloneRoot === 'string' ? patch.cloneRoot.trim() : ''
    if (raw === '' || raw.includes('\0')) {
      throw new GithubError('invalid-clone-root', 'cloneRoot must be a non-empty absolute directory path.')
    }
    const expanded = expandHome(raw)
    if (!isAbsolute(expanded)) {
      throw new GithubError('invalid-clone-root', 'cloneRoot must be an absolute path (leading "~" is allowed).')
    }
    next.cloneRoot = resolve(expanded)
  }
  if ('agentTools' in patch) next.agentTools = patch.agentTools === true
  return next
}

/**
 * Read settings, falling back to defaults when the file is absent or corrupt.
 *
 * @returns {Promise<GithubConfig>}
 */
export async function readConfig() {
  try {
    const text = await readFile(configFile(), 'utf8')
    return normalizeConfig(JSON.parse(text))
  } catch (error) {
    const code = /** @type {{code?: string}} */ (error)?.code
    if (code === 'ENOENT' || error instanceof SyntaxError) return defaultConfig()
    throw error
  }
}

/**
 * Synchronous read used only to decide, at mount time, whether to register
 * Agent tools.
 *
 * @returns {GithubConfig}
 */
export function readConfigSync() {
  try {
    return normalizeConfig(JSON.parse(readFileSync(configFile(), 'utf8')))
  } catch {
    return defaultConfig()
  }
}

/**
 * Merge a validated patch into the settings file and persist it atomically.
 *
 * @param {Record<string, unknown>} patch - Fields to change.
 * @returns {Promise<GithubConfig>}
 */
export async function updateConfig(patch) {
  const validated = validatePatch(patch)
  const current = await readConfig()
  const next = normalizeConfig({ ...current, ...validated })
  const file = configFile()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, file)
  return next
}
