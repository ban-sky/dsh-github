/**
 * Host half of `dsh-github`.
 *
 * Registers, on the authenticated Host context:
 * 1. one DSH authorization flow for the credential key `dsh-github/token`
 *    (GitHub OAuth Device Flow — the official, browser-based sign-in);
 * 2. the authenticated JSON route `/api/github` used by the Settings page;
 * 3. optionally, an Agent Tool (`github`) when `agentTools` is enabled in the
 *    settings file at mount time.
 *
 * The access token is only ever read from / written to the DSH credential
 * store. It is never part of the settings file, a git remote URL, a command
 * argument, or a response body.
 *
 * @module dsh-github
 */

import { readConfigSync } from './lib/config.js'
import { createHandler, ROUTE_PATH } from './lib/http.js'
import { createService } from './lib/service.js'
import { buildGithubTool } from './lib/tools.js'

/**
 * Register the Host side of the plugin.
 *
 * @param {any} ctx - Host context.
 */
export function apply(ctx) {
  ctx.inject(['connection', 'credentials', 'authorization', 'subprocess'], (child) => {
    const service = createService(child)

    child.effect(
      () => child.authorization.registerFlow(service.authorizationFlow()),
      'dsh-github: authorization flow',
    )

    child.effect(
      () =>
        child.connection.fetch.register({
          path: ROUTE_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: createHandler(service),
        }),
      'dsh-github: fetch route',
    )

    // DSH GO (the phone app) cannot draw the Web UI, so it gets a native panel
    // and three composer entries backed by the same service instance. The module
    // is loaded on demand, so a host without the `dshGo` service never evaluates it.
    child.inject(['dshGo'], (ui) => {
      const report = (error) => {
        if (typeof ui.logger?.warn === 'function') ui.logger.warn(error)
        else console.warn('[dsh-github] the DSH GO surface is unavailable:', error?.message ?? error)
      }
      import('./lib/dsh-go.js').then(
        ({ registerDshGo }) => {
          try {
            registerDshGo(ui, service)
          } catch (error) {
            report(error)
          }
        },
        report,
      )
    })

    // Tool registration is a mount-time decision: `ctx.tools.register` is not
    // hot-reloadable, so changing the setting takes effect on the next plugin
    // load. The UI says so.
    if (readConfigSync().agentTools) {
      service.markToolsRegistered(true)
      child.inject(['tools'], (toolCtx) => {
        toolCtx.effect(() => toolCtx.tools.register(buildGithubTool(service)), 'dsh-github: agent tool')
      })
    }
  })
}
