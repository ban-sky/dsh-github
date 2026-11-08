/**
 * Optional Agent Tool exposing the same guarded operations as the UI.
 *
 * Off by default: `agentTools` in the settings file decides whether the tool
 * is registered at mount, and every action re-reads the credential store and
 * the clone root, so enabling it never widens the path or remote allow-list.
 *
 * @module dsh-github/lib/tools
 */

/** Tool name registered with `ctx.tools`. */
export const TOOL_NAME = 'github'

/**
 * Build the `github` Tool definition.
 *
 * @param {ReturnType<import('./service.js').createService>} service - Plugin service.
 * @returns {object} Tool definition accepted by `ctx.tools.register`.
 */
export function buildGithubTool(service) {
  return {
    name: TOOL_NAME,
    description: [
      'Work with the GitHub account signed in through Settings → GitHub.',
      'status reports the sign-in and settings; list_repos lists repositories the token can reach;',
      'create_repo creates a repository for the account; clone clones owner/name into the configured clone root;',
      'pull fast-forwards one local repository; commit stages changes and commits them (optionally pushing);',
      'push publishes the current branch. All local paths must resolve inside the clone root,',
      'only https://github.com remotes are accepted, and the access token never appears in arguments or output.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'list_repos', 'create_repo', 'clone', 'pull', 'commit', 'push'],
          description: 'The GitHub operation to perform.',
        },
        fullName: {
          type: 'string',
          description: 'clone: repository as "owner/name".',
        },
        name: {
          type: 'string',
          description: 'create_repo: repository name (letters, digits, ".", "_", "-").',
        },
        description: {
          type: 'string',
          description: 'create_repo: optional description.',
        },
        private: {
          type: 'boolean',
          description: 'create_repo: create a private repository (default true).',
        },
        autoInit: {
          type: 'boolean',
          description: 'create_repo: initialize with a README and default branch (default true).',
        },
        path: {
          type: 'string',
          description: 'pull/commit/push: repository path, absolute or relative to the clone root.',
        },
        message: {
          type: 'string',
          description: 'commit: commit message (required).',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'commit: repository-relative files to stage; omit to stage every change.',
        },
        push: {
          type: 'boolean',
          description: 'commit: push after committing (default false).',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    timeoutMs: 300000,
    /**
     * @param {unknown} args - Tool arguments.
     * @param {any} exec - Execution context (`signal`).
     * @returns {Promise<Record<string, unknown>>}
     */
    async execute(args, exec) {
      const input = args !== null && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : {}
      const action = typeof input.action === 'string' ? input.action : ''
      try {
        const value = await service.dispatchTool(action, input, exec?.signal)
        return { ok: true, .../** @type {Record<string, unknown>} */ (value) }
      } catch (error) {
        const failure = service.failure(error)
        return { ok: false, code: failure.code, message: failure.message }
      }
    },
  }
}
