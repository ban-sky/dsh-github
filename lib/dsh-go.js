/**
 * DSH GO surface of `dsh-github`.
 *
 * The Cordis plugin ships a Web UI, which the phone app cannot draw. This module
 * registers the same capability on the `dshGo` service the DSH GO bridge
 * provides: one native panel (account state, device-code sign-in, the session
 * folder's repository actions) plus three composer entries that take their text
 * from the message box, because native form inputs are not available everywhere.
 *
 * It reuses the very service instance created by `index.js`, so there is one
 * sign-in state machine, one credential record and one settings file.
 *
 * Nothing secret lives here: the access token stays in the DSH credential store.
 *
 * @module dsh-github/lib/dsh-go
 */

import { asGithubError, redact } from './errors.js'

/** Public GitHub device-code page; the only link this module ever opens. */
const DEVICE_URL = 'https://github.com/login/device'

/** Public Client IDs are short and safe to echo back. */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** `owner/name`, as the clone action wants it. */
const FULL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/

/** Deferred results must come back inside one minute. */
const SLOW_TIMEOUT_MS = 60_000

/** How long a sign-in attempt keeps the panel refreshing itself. */
const WATCH_MS = 15 * 60 * 1000

/** Wording for the failure codes the service raises. */
const FAILURES = {
  'not-signed-in': ['先登录 GitHub', 'Sign in to GitHub first'],
  'missing-client-id': ['先填 OAuth App 的 Client ID', 'Set the Client ID first'],
  'client-id-invalid': ['Client ID 格式不对', 'That Client ID looks wrong'],
  'device-flow-disabled': ['OAuth App 没开 Device flow', 'Enable Device Flow on the OAuth App'],
  'login-denied': ['你在 GitHub 上拒绝了授权', 'The authorization was denied'],
  'login-expired': ['设备码过期了，重新登录', 'The code expired; sign in again'],
  'login-failed': ['登录没成功，再试一次', 'Sign-in failed; try again'],
  'not-a-repo': ['当前目录不是 git 仓库', 'This folder is not a git repository'],
  'no-remote': ['这个仓库没有 origin', 'This repository has no origin'],
  'no-upstream': ['当前分支还没有上游', 'The branch has no upstream'],
  'not-fast-forward': ['远端有新提交，先拉取', 'Pull first: the remote moved'],
  'push-rejected': ['推送被 GitHub 拒绝了', 'GitHub rejected the push'],
  'nothing-to-commit': ['没有要提交的改动', 'Nothing to commit'],
  'dirty-worktree': ['工作区还有改动，先提交', 'Commit the working tree first'],
  'target-exists': ['目标目录已经有了', 'That folder already exists'],
  'invalid-repo-name': ['仓库名不合法', 'That repository name is invalid'],
  'invalid-owner': ['账号名不合法', 'That owner name is invalid'],
  'invalid-path': ['路径不合法', 'That path is invalid'],
  'unsafe-path': ['路径不安全，拒绝了', 'That path is unsafe'],
  'invalid-message': ['提交信息不合法', 'That commit message is invalid'],
  'invalid-files': ['指定的文件不合法', 'Those files are invalid'],
  'session-not-found': ['先打开一个对话', 'Open a session first'],
  'detached-head': ['现在不在任何分支上', 'HEAD is detached'],
  'git-missing': ['这台机器上没有 git', 'git is missing on this host'],
  'git-failed': ['git 执行失败', 'git failed'],
  'git-timeout': ['git 超时了', 'git timed out'],
  'network-error': ['连不上 GitHub，等下再试', 'Cannot reach GitHub; try later'],
  'rate-limited': ['GitHub 限流了，等下再试', 'GitHub is rate limiting; try later'],
  'forbidden': ['这个令牌没有权限', 'The token lacks permission'],
  'token-invalid': ['登录已失效，再登录一次', 'Sign in again'],
  'not-found': ['GitHub 上找不到它', 'Not found on GitHub'],
  'clone-root-missing': ['克隆根目录不可用', 'The clone root is not usable'],
  'invalid-clone-root': ['克隆根目录不合法', 'The clone root is invalid'],
  'cancelled': ['已取消', 'Cancelled'],
}

/**
 * Pick one of two strings.
 *
 * @param {string} zh - Chinese wording.
 * @param {string} en - English wording.
 * @param {boolean} zhMode - Chinese when true.
 * @returns {string}
 */
function s(zh, en, zhMode) {
  return zhMode ? zh : en
}

/**
 * Trim, collapse whitespace and cut a line for a toast or a view field.
 *
 * @param {unknown} value - Raw text.
 * @param {number} max - Maximum characters.
 * @returns {string}
 */
function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * A short, human sentence for a thrown failure.
 *
 * @param {unknown} error - Thrown value.
 * @param {boolean} zhMode - Chinese when true.
 * @returns {string}
 */
function describe(error, zhMode) {
  const failure = asGithubError(error, 'internal')
  const mapped = FAILURES[failure.code]
  if (mapped !== undefined) return s(mapped[0], mapped[1], zhMode)
  return clip(redact(failure.message), 60) || s('操作没成功', 'That did not work', zhMode)
}

/**
 * Show only the ends of a public Client ID.
 *
 * @param {string} clientId - Stored Client ID.
 * @returns {string}
 */
function masked(clientId) {
  if (clientId === '') return ''
  return clientId.length <= 10 ? clientId : `${clientId.slice(0, 6)}…${clientId.slice(-3)}`
}

/**
 * Find one form field in whatever shape the client sends on submit.
 *
 * @param {unknown} value - `event.value` of a panel action.
 * @param {string} field - Bound data field name.
 * @returns {string | undefined}
 */
function fieldValue(value, field) {
  const seen = new Set()
  /**
   * @param {unknown} node - Current node.
   * @param {number} depth - Recursion depth.
   * @returns {string | undefined}
   */
  const walk = (node, depth) => {
    if (node === null || typeof node !== 'object' || depth > 6 || seen.has(node)) return undefined
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item, depth + 1)
        if (hit !== undefined) return hit
      }
      return undefined
    }
    for (const [key, raw] of Object.entries(node)) {
      const leaf = key.slice(key.lastIndexOf('.') + 1)
      if (leaf === field && (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')) return String(raw)
    }
    for (const raw of Object.values(node)) {
      const hit = walk(raw, depth + 1)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return walk(value, 0)
}

/**
 * One line that sums up a local checkout.
 *
 * @param {any} repo - Status object from the service, or null.
 * @param {boolean} zhMode - Chinese when true.
 * @returns {string}
 */
function repoLine(repo, zhMode) {
  if (repo === null || repo === undefined) return s('不是 git 仓库', 'not a git repository', zhMode)
  const parts = [typeof repo.branch === 'string' && repo.branch !== '' ? repo.branch : s('游离 HEAD', 'detached HEAD', zhMode)]
  if (typeof repo.ahead === 'number' && repo.ahead > 0) parts.push(s(`领先 ${repo.ahead}`, `${repo.ahead} ahead`, zhMode))
  if (typeof repo.behind === 'number' && repo.behind > 0) parts.push(s(`落后 ${repo.behind}`, `${repo.behind} behind`, zhMode))
  if (typeof repo.changeCount === 'number' && repo.changeCount > 0) parts.push(s(`${repo.changeCount} 处改动`, `${repo.changeCount} changed`, zhMode))
  else parts.push(s('没有改动', 'clean', zhMode))
  const remote = repo.remote
  if (remote !== null && typeof remote === 'object' && typeof remote.owner === 'string' && remote.owner !== '') {
    parts.push(`${remote.owner}/${remote.name}`)
  }
  return parts.join(' · ')
}

/**
 * Register the DSH GO panel and composer entries.
 *
 * @param {any} ctx - Plugin context that has `dshGo`.
 * @param {any} service - Service created by `index.js`.
 */
export function registerDshGo(ctx, service) {
  let watchUntil = 0
  let watchStarted = 0
  let loopToken = 0

  /** Start or extend the live watch while a sign-in is in flight. */
  function watch() {
    if (watchUntil <= Date.now()) watchStarted = Date.now()
    watchUntil = Date.now() + WATCH_MS
  }

  /**
   * @param {any} scope - Panel scope.
   * @returns {string}
   */
  function sessionIdOf(scope) {
    return scope !== null && typeof scope === 'object' && typeof scope.sessionId === 'string' ? scope.sessionId : ''
  }

  /**
   * Read everything the panel shows.
   *
   * @param {any} scope - Panel scope.
   * @param {string} locale - Client locale.
   * @returns {Promise<Record<string, any>>}
   */
  async function collect(scope, locale) {
    const zh = !String(locale ?? '').toLowerCase().startsWith('en')
    /** @type {Record<string, any>} */
    const data = {
      hint: s('正在读取…', 'Reading…', zh),
      hintTone: 'info',
      account: '—',
      clientIdMasked: '—',
      repo: '—',
      tools: '—',
      code: '—',
      signedIn: false,
      loginPending: false,
      clientIdDraft: '',
      commitDraft: '',
      cloneDraft: '',
      publishDraft: '',
    }
    /** @type {any} */
    let snapshot = null
    try {
      snapshot = await service.dispatch('state')
    } catch (error) {
      data.hint = describe(error, zh)
      data.hintTone = 'bad'
      return data
    }
    const settings = snapshot?.settings ?? {}
    const auth = snapshot?.auth ?? {}
    const login = snapshot?.login ?? {}
    const clientId = typeof settings.clientId === 'string' ? settings.clientId : ''
    const status = typeof login.status === 'string' ? login.status : 'idle'
    const pending = status === 'starting' || status === 'pending'
    const code = typeof login.userCode === 'string' ? login.userCode : ''
    data.signedIn = auth.signedIn === true
    data.loginPending = pending
    data.clientIdMasked = clientId === '' ? s('未配置', 'not set', zh) : masked(clientId)
    data.tools = snapshot?.toolsRegistered === true ? s('已开启', 'on', zh) : s('未开启', 'off', zh)
    data.account = data.signedIn
      ? `@${typeof auth.login === 'string' && auth.login !== '' ? auth.login : 'github'}`
      : pending
        ? s('等待授权…', 'waiting…', zh)
        : s('未登录', 'not signed in', zh)
    data.code = pending && code !== '' ? code : '—'

    if (status === 'failed' && typeof login.message === 'string' && login.message !== '') {
      data.hint = clip(redact(login.message), 120)
      data.hintTone = 'bad'
    } else if (status === 'expired') {
      data.hint = s('设备码过期了，重新点登录', 'That code expired; start again', zh)
      data.hintTone = 'warn'
    } else if (clientId === '' && !data.signedIn) {
      data.hint = s('还没有 Client ID：把 OAuth App 的 ID 粘到输入框，点「存 ID」', 'No Client ID yet: paste it in the box, tap Save ID', zh)
      data.hintTone = 'warn'
    } else if (pending) {
      data.hint = code !== ''
        ? s(`设备码 ${code}：打开授权页输入，授权后这里会自动刷新`, `Code ${code}: enter it on GitHub; this page refreshes itself`, zh)
        : s('正在向 GitHub 要设备码…', 'Asking GitHub for a device code…', zh)
    } else if (!data.signedIn) {
      data.hint = s('点「登录」用设备码登录，不用密码', 'Tap Sign in for the device-code flow; no password', zh)
    } else {
      data.hint = s('已登录，可以对当前对话目录拉取、提交、推送', 'Signed in; pull, commit and push the session folder', zh)
      data.hintTone = 'good'
    }

    const sessionId = sessionIdOf(scope)
    if (sessionId === '') {
      data.repo = s('没有打开的对话', 'no session open', zh)
    } else {
      try {
        const local = await service.dispatch('session_status', { sessionId })
        data.repo = local?.repoRoot === null || local?.repoRoot === undefined
          ? s('不是 git 仓库', 'not a git repository', zh)
          : repoLine(local?.repo, zh)
      } catch {
        data.repo = s('读不到目录状态', 'cannot read the folder', zh)
      }
    }
    return data
  }

  /**
   * Wrap one repository action in the deferred-result effect.
   *
   * @param {string} label - Pending label.
   * @param {() => Promise<any>} work - Work returning effects.
   * @returns {any}
   */
  function slow(label, work) {
    return { pending: { label: clip(label, 16), timeoutMs: SLOW_TIMEOUT_MS }, result: work }
  }

  /**
   * A session-scoped repository action.
   *
   * @param {any} scope - Panel or capsule scope.
   * @param {{locale?: string}} event - Panel event (only `locale` is read).
   * @param {string} zhLabel - Pending label (zh).
   * @param {string} enLabel - Pending label (en).
   * @param {(sessionId: string, signal: AbortSignal) => Promise<any>} call - Service call.
   * @param {string} zhDone - Success toast (zh).
   * @param {string} enDone - Success toast (en).
   * @returns {any}
   */
  function sessionAction(scope, event, zhLabel, enLabel, call, zhDone, enDone) {
    const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
    const sessionId = sessionIdOf(scope)
    if (sessionId === '') return { toast: s('先在对话里打开会话', 'Open a session first', zh) }
    return slow(s(zhLabel, enLabel, zh), async (signal) => {
      try {
        await call(sessionId, signal)
        return { toast: s(zhDone, enDone, zh), patch: await collect(scope, event.locale) }
      } catch (error) {
        return { toast: clip(describe(error, zh), 40) }
      }
    })
  }

  /**
   * Store the public Client ID that switches device sign-in on.
   *
   * @param {unknown} raw - Client ID text.
   * @param {boolean} zh - Chinese wording.
   * @returns {Promise<{ok: boolean, toast: string}>}
   */
  async function saveClientId(raw, zh) {
    const value = String(raw ?? '').trim()
    if (!CLIENT_ID_PATTERN.test(value)) return { ok: false, toast: s('Client ID 看着不对', 'That Client ID looks wrong', zh) }
    try {
      const result = await service.dispatch('settings_save', { clientId: value })
      if (result?.settings?.clientId !== value) return { ok: false, toast: s('Client ID 没存进去，检查一下', 'That Client ID was not saved', zh) }
      return { ok: true, toast: s('已保存 Client ID', 'Client ID saved', zh) }
    } catch (error) {
      return { ok: false, toast: clip(describe(error, zh), 40) }
    }
  }

  /**
   * Commit and push the session folder with one message.
   *
   * @param {any} scope - Panel or capsule scope.
   * @param {string} locale - Client locale.
   * @param {unknown} message - Commit message.
   * @returns {any}
   */
  function commitWith(scope, locale, message) {
    const zh = !String(locale ?? '').toLowerCase().startsWith('en')
    const text = String(message ?? '').trim()
    if (text === '') return { toast: s('先写提交信息', 'Type a commit message', zh) }
    return sessionAction(
      scope,
      { locale },
      '正在提交',
      'Committing',
      (sessionId, signal) => service.dispatch('session_commit', { sessionId, message: text.slice(0, 2000), push: true }, signal),
      '已提交并推送',
      'Committed and pushed',
    )
  }

  /**
   * Clone one repository into the session folder.
   *
   * @param {any} scope - Panel or capsule scope.
   * @param {string} locale - Client locale.
   * @param {unknown} fullName - `owner/name`.
   * @returns {any}
   */
  function cloneWith(scope, locale, fullName) {
    const zh = !String(locale ?? '').toLowerCase().startsWith('en')
    const name = String(fullName ?? '').trim()
    if (!FULL_NAME_PATTERN.test(name)) return { toast: s('仓库写 owner/name', 'Use owner/name', zh) }
    return sessionAction(
      scope,
      { locale },
      '正在克隆',
      'Cloning',
      (sessionId, signal) => service.dispatch('session_clone', { sessionId, fullName: name }, signal),
      '已克隆到对话目录',
      'Cloned into the session folder',
    )
  }

  ctx.dshGo.panel('github', {
    view: (_scope, caps) => {
      const list = Array.isArray(caps?.components) ? caps.components : null
      const forms = list !== null && list.includes('form') && list.includes('textField')
      /** @type {any[]} */
      const children = [
        { type: 'callout', text: { $: 'data.hint' }, tone: { $: 'data.hintTone' } },
        {
          type: 'keyValue',
          items: [
            { label: '账号', value: { $: 'data.account' } },
            { label: 'Client ID', value: { $: 'data.clientIdMasked' } },
            { label: '对话目录', value: { $: 'data.repo' } },
            { label: 'Agent 工具', value: { $: 'data.tools' } },
          ],
        },
        {
          type: 'actions',
          items: [
            { label: '登录', action: 'login' },
            { label: '取消登录', action: 'cancel-login' },
            { label: '退出登录', action: 'logout' },
          ],
        },
        { type: 'text', text: { $: 'data.code' }, style: { size: 'title', weight: 'bold' } },
        {
          type: 'actions',
          items: [
            { label: '复制设备码', action: 'copy-code' },
            { label: '打开授权页', action: 'open-device' },
          ],
        },
        { type: 'divider' },
        {
          type: 'text',
          text: '下面的操作都在当前对话目录里进行。提交信息写进输入框，再点输入框上方的「提交」。',
          tone: 'muted',
        },
        {
          type: 'actions',
          items: [
            { label: '刷新', action: 'refresh' },
            { label: '更新', action: 'fetch' },
            { label: '拉取', action: 'pull' },
            { label: '推送', action: 'push' },
          ],
        },
      ]
      if (forms) {
        children.push({
          type: 'form',
          label: '提交并推送',
          submit: 'commit',
          submitLabel: '提交并推送',
          children: [{ type: 'textField', label: '提交信息', bind: 'data.commitDraft', placeholder: '这次改了什么', maxLength: 200 }],
        })
      }
      children.push({
        type: 'text',
        text: '克隆仓库：把 owner/name 写进输入框，点加号面板里的「克隆」；要把当前目录建成新仓库，用网页版的设置页。',
        tone: 'muted',
      })
      if (forms) {
        children.push({
          type: 'collapsible',
          label: '克隆 / 新建仓库',
          children: [
            {
              type: 'form',
              label: '克隆仓库到对话目录',
              submit: 'clone',
              submitLabel: '克隆',
              children: [{ type: 'textField', label: '仓库', bind: 'data.cloneDraft', placeholder: 'owner/name', maxLength: 200 }],
            },
            {
              type: 'form',
              label: '把对话目录新建成私有仓库并推送',
              submit: 'publish',
              submitLabel: '新建并推送',
              children: [{ type: 'textField', label: '仓库名', bind: 'data.publishDraft', placeholder: 'my-project', maxLength: 100 }],
            },
          ],
        })
      }
      children.push({
        type: 'text',
        text: '建 OAuth App：GitHub → Settings → Developer settings → OAuth Apps → New OAuth App；Homepage URL 和 Authorization callback URL 都填 https://github.com/，建好后再进应用页勾上 Enable Device Flow。',
        tone: 'muted',
      })
      children.push({
        type: 'text',
        text: '填 Client ID：把 Iv1.… / Ov23… 整段粘到输入框，点输入框上方的「存 ID」。',
      })
      if (forms) {
        children.push({
          type: 'form',
          label: 'Client ID',
          submit: 'save-client',
          submitLabel: '保存',
          children: [{ type: 'textField', label: 'Client ID', bind: 'data.clientIdDraft', placeholder: 'Iv1.… 或 Ov23…', maxLength: 64 }],
        })
      }
      children.push({ type: 'actions', items: [{ label: '开启 Agent 工具', action: 'enable-tools' }] })
      return { v: 2, type: 'stack', title: 'GitHub', children }
    },

    data: (scope, emit, caps) => {
      const token = (loopToken += 1)
      let stopped = false
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer
      const tick = async () => {
        if (stopped || token !== loopToken) return
        /** @type {Record<string, any>} */
        let data
        try {
          data = await collect(scope, caps?.locale)
        } catch {
          return
        }
        if (stopped || token !== loopToken) return
        emit(data)
        const watching = data.loginPending === true || (watchUntil > Date.now() && data.signedIn !== true)
        if (!watching) return
        if (data.loginPending === true) {
          if (watchUntil <= Date.now()) watchStarted = Date.now()
          watchUntil = Math.max(watchUntil, Date.now() + WATCH_MS)
        }
        const age = Date.now() - (watchStarted === 0 ? Date.now() : watchStarted)
        timer = setTimeout(tick, age < 60_000 ? 3000 : 10_000)
        timer.unref?.()
      }
      void tick()
      return () => {
        stopped = true
        if (timer !== undefined) clearTimeout(timer)
      }
    },

    actions: {
      refresh: async (scope, event) => {
        try {
          return { patch: await collect(scope, event?.locale) }
        } catch (error) {
          return { toast: clip(describe(error, true), 40) }
        }
      },

      login: async (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        try {
          const before = await service.dispatch('state')
          if (before?.auth?.signedIn === true) {
            return { toast: s('已经登录了', 'Already signed in', zh), patch: await collect(scope, event?.locale) }
          }
          if (!before?.settings?.clientId) return { toast: s('先填 Client ID 再登录', 'Set the Client ID first', zh) }
          watch()
          await service.dispatch('login_start')
          const deadline = Date.now() + 2000
          let state = null
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 300))
            state = await service.dispatch('login_status')
            const status = state?.login?.status
            if (status === 'pending' && typeof state?.login?.userCode === 'string' && state.login.userCode !== '') break
            if (status === 'failed' || status === 'cancelled' || status === 'authorized') break
          }
          const patch = await collect(scope, event?.locale)
          const code = typeof state?.login?.userCode === 'string' ? state.login.userCode : ''
          const status = state?.login?.status
          if (status === 'failed') {
            return { toast: clip(redact(state?.login?.message ?? ''), 40) || s('登录没成功', 'Sign-in failed', zh), patch }
          }
          if (code !== '') return { toast: s(`设备码 ${code}`, `Code ${code}`, zh), patch, refresh: true }
          return { toast: s('正在等 GitHub 回话…', 'Waiting for GitHub…', zh), patch, refresh: true }
        } catch (error) {
          return { toast: clip(describe(error, zh), 40) }
        }
      },

      'cancel-login': async (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        try {
          await service.dispatch('login_cancel')
          watchUntil = 0
          return { toast: s('已取消登录', 'Sign-in cancelled', zh), patch: await collect(scope, event?.locale) }
        } catch (error) {
          return { toast: clip(describe(error, zh), 40) }
        }
      },

      logout: async (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        try {
          await service.dispatch('logout')
          watchUntil = 0
          return { toast: s('已退出 GitHub', 'Signed out of GitHub', zh), patch: await collect(scope, event?.locale) }
        } catch (error) {
          return { toast: clip(describe(error, zh), 40) }
        }
      },

      'copy-code': async (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        try {
          const state = await service.dispatch('state')
          const code = state?.login?.userCode
          if (typeof code !== 'string' || code === '') return { toast: s('还没有设备码，先点登录', 'No code yet; sign in first', zh) }
          return { copy: code, toast: s('已复制设备码', 'Code copied', zh) }
        } catch (error) {
          return { toast: clip(describe(error, zh), 40) }
        }
      },

      'open-device': () => ({ link: DEVICE_URL }),

      fetch: (scope, event) =>
        sessionAction(scope, event, '正在更新', 'Fetching', (sessionId, signal) => service.dispatch('session_fetch', { sessionId }, signal), '已更新远端信息', 'Fetched'),

      pull: (scope, event) =>
        sessionAction(scope, event, '正在拉取', 'Pulling', (sessionId, signal) => service.dispatch('session_pull', { sessionId }, signal), '已快进拉取', 'Pulled'),

      push: (scope, event) =>
        sessionAction(scope, event, '正在推送', 'Pushing', (sessionId, signal) => service.dispatch('session_push', { sessionId }, signal), '已推送', 'Pushed'),

      commit: (scope, event) => commitWith(scope, event?.locale, fieldValue(event?.value, 'commitDraft')),

      clone: (scope, event) => cloneWith(scope, event?.locale, fieldValue(event?.value, 'cloneDraft')),

      publish: (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        const repoName = (fieldValue(event?.value, 'publishDraft') ?? '').trim()
        if (!/^[A-Za-z0-9._-]+$/.test(repoName)) return { toast: s('仓库名只能用字母数字和 . - _', 'Letters, digits, . - _ only', zh) }
        return sessionAction(
          scope,
          event,
          '正在新建',
          'Creating',
          (sessionId, signal) => service.dispatch('session_publish', { sessionId, name: repoName, private: true }, signal),
          '已新建私有仓库并推送',
          'Private repository created',
        )
      },

      'save-client': async (scope, event) => {
        const result = await saveClientId(fieldValue(event?.value, 'clientIdDraft'), !String(event?.locale ?? '').toLowerCase().startsWith('en'))
        if (!result.ok) return { toast: result.toast }
        return { toast: result.toast, patch: await collect(scope, event?.locale) }
      },

      'enable-tools': async (scope, event) => {
        const zh = !String(event?.locale ?? '').toLowerCase().startsWith('en')
        try {
          await service.dispatch('settings_save', { agentTools: true })
          return { toast: s('已开启，重启引擎后生效', 'On; restart the engine', zh), patch: await collect(scope, event?.locale) }
        } catch (error) {
          return { toast: clip(describe(error, zh), 40) }
        }
      },
    },
  })

  // The composer is the keyboard the phone app is good at: paste a Client ID or a
  // commit message there and tap the entry, instead of a native form input.
  ctx.dshGo.on('save-client-id', async (scope, event) => {
    const result = await saveClientId(scope?.draft, !String(event?.locale ?? '').toLowerCase().startsWith('en'))
    return { toast: result.toast }
  })

  ctx.dshGo.on('commit-draft', (scope, event) => commitWith(scope, event?.locale, scope?.draft))

  ctx.dshGo.on('clone-repo', (scope, event) => cloneWith(scope, event?.locale, scope?.draft))
}
