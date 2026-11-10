window.__ModuleLoader__.load({
  // Must equal the package name: the module registry keys factories by the id
  // declared here and matches it against the loader row, which is built from
  // package.json#name. A bare name here makes the row read "loaded without
  // registering" (and collide with a stale bare-name row).
  id: '@ban-sky/dsh-github',

  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useRef, useState } = React
    const h = React.createElement

    /** Locale namespace, matching the `meta` dictionaries in locale/*.json. */
    const NS = 'dsh-github'
    /** Authenticated Host route registered by the Host half. */
    const ROUTE = 'api/github'
    /** Settings section that renders this page. */
    const SECTION_SLOT = 'settings.section'
    const DOCK_SLOT = 'conversation.composer.dock'
    /** How often the pending sign-in is polled. */
    const POLL_MS = 2500

    const zh = {
      nav: 'GitHub',
      intro:
        '使用 GitHub 官方的设备码（Device Flow）登录。访问令牌只写入 DSH 凭据库，不会出现在设置文件、git remote 地址或命令参数里。',
      loading: '加载中…',
      signIn: '在 GitHub 上登录',
      signingIn: '正在向 GitHub 申请设备码…',
      enterCode: '在浏览器中打开 GitHub 并输入此代码：',
      openDevicePage: '打开验证页面',
      copyCode: '复制代码',
      copied: '已复制',
      waiting: '等待浏览器中完成授权，本页会自动更新。',
      cancel: '取消',
      cancelSignIn: '取消登录',
      scopesValue: '授权范围：{scopes}',
      obtainedAtValue: '授权时间：{when}',
      expired: '令牌已失效，请重新登录。',
      unverified: '暂时无法验证令牌，请检查网络。',
      signOut: '退出登录',
      signOutConfirm: '确认退出登录？',
      confirm: '确认',
      back: '返回',
      signedOut: '已退出登录；本地仓库不受影响。',
      signedInNotice: '登录成功。',
      settingsTitle: '连接设置',
      clientIdLabel: 'OAuth App Client ID',
      clientIdHint:
        '在 GitHub → Settings → Developer settings → OAuth Apps 新建应用并启用 Device Flow；只填写 Client ID，绝不要填写 Client Secret。',
      cloneRootLabel: '本地仓库目录',
      cloneRootHint: '克隆、拉取、提交和推送都被限制在该目录之内；目录外的路径会被拒绝。',
      agentToolsLabel: '启用 Agent 工具 github',
      agentToolsHint: '让模型使用相同的仓库操作；需要重新加载插件后生效。',
      save: '保存',
      saved: '设置已保存。',
      restartRequired: '设置已保存；Agent 工具变更将在重新加载插件后生效。',
      configFileValue: '设置文件：{path}',
      reposTitle: '我的仓库',
      loadRepos: '加载仓库',
      reload: '刷新',
      reposEmpty: '没有可显示的仓库。',
      reposTruncated: '只显示最近更新的 100 个仓库。',
      clone: '克隆',
      cloning: '克隆中…',
      cloned: '已克隆到 {path}',
      createTitle: '新建仓库',
      repoNameLabel: '仓库名称',
      repoNamePlaceholder: 'my-repo',
      repoDescriptionLabel: '描述',
      repoDescriptionPlaceholder: '可选',
      createPrivateLabel: '私有仓库',
      createAutoInitLabel: '用 README 初始化',
      create: '创建',
      creating: '创建中…',
      created: '已创建 {fullName}。',
      private: '私有',
      public: '公开',
      localTitle: '本地仓库',
      localEmpty: '目录里还没有仓库，可以在上方克隆仓库。',
      localTruncated: '只显示前 {count} 个本地仓库。',
      localMissing: '目录不存在：{root}',
      localLoading: '正在读取本地仓库…',
      pull: '拉取',
      pulling: '拉取中…',
      pulled: '已拉取到 {branch}。',
      push: '推送',
      pushing: '推送中…',
      pushed: '已推送 {branch}。',
      commit: '提交',
      committing: '提交中…',
      committed: '已提交 {short}。',
      committedPushed: '已提交 {short} 并推送 {branch}。',
      commitMessageLabel: '提交说明',
      commitMessagePlaceholder: '说明这次改动',
      commitPushLabel: '提交后推送',
      dirty: '{count} 项改动',
      clean: '工作区干净',
      ahead: '领先 {count}',
      behind: '落后 {count}',
      noUpstream: '未设置上游分支',
      detachedHead: '游离 HEAD',
      noCommit: '没有提交记录',
      statusError: '无法读取状态（{code}）',
      dockTitle: 'GitHub：会话目录',
      dockHint: '在当前会话目录里直接克隆、拉取、更新和推送。',
      sessionPathLabel: '会话目录',
      sessionNotRepo: '该目录还不是 Git 仓库。可以克隆一个仓库到这里，或把当前目录创建为 GitHub 仓库。',
      sessionCloneTitle: '克隆仓库到此目录',
      sessionCloneHint: '将克隆到 {path}',
      sessionFullNameLabel: '仓库（owner/name）',
      sessionFullNamePlaceholder: 'octocat/Hello-World',
      sessionPublishTitle: '创建仓库并推送此目录',
      sessionPublishHint:
        '在你的 GitHub 账号下创建仓库、初始化此目录并推送首个提交；仅当会话目录本身就是仓库根目录时执行。',
      sessionPublishMessageLabel: '首次提交说明',
      sessionPublishButton: '创建并推送',
      sessionPublishing: '创建并推送中…',
      sessionPublished: '已创建并推送 {fullName}。',
      sessionRefresh: '刷新',
      sessionFetch: '更新',
      sessionFetching: '更新中…',
      sessionFetched: '已更新远端信息。',
      sessionClose: '关闭',
      sessionSignInHint: '请先在「设置 → GitHub」中登录。',
      'error.sessionNotFound': '找不到该会话，请重新打开会话后再试。',
      'error.repoElsewhere': '会话目录位于另一个 Git 仓库内部，请改为打开那个仓库。',
      'error.remoteExists': '该目录已存在不同的 origin 远端，请先移除。',
      'error.targetExists': '目标位置已存在同名目录。',
      'error.repoNested': '会话目录里已经有一个仓库，请直接使用该仓库。',
      'error.generic': '操作失败。',
      'error.detail': '操作失败：{message}',
      'error.http': '请求失败（HTTP {status}）。',
      'error.unauthorized': '会话已失效，请刷新页面后重试。',
      'error.connection': '无法连接 DSH 主机。',
      'error.missingClientId': '请先填写 OAuth App Client ID 并保存。',
      'error.invalidClientId': 'Client ID 格式无效。',
      'error.deviceFlowDisabled': '该 OAuth App 未启用 Device Flow，请在 GitHub 应用设置中开启。',
      'error.loginDenied': 'GitHub 拒绝了授权。',
      'error.loginExpired': '设备码已过期，请重试。',
      'error.tokenInvalid': '访问令牌无效，请重新登录。',
      'error.rateLimited': 'GitHub API 请求过于频繁，请稍后再试。',
      'error.unsafePath': '该路径不在本地仓库目录内，已拒绝。',
      'error.notFound': '找不到该仓库或路径。',
      'error.invalidRepoName': '仓库名称无效。',
      'error.invalidOwner': '仓库所有者无效。',
      'error.invalidCloneRoot': '本地仓库目录无效（必须是绝对路径）。',
      'error.invalidMessage': '提交说明不能为空。',
      'error.invalidFiles': '文件列表无效。',
      'error.invalidPath': '仓库路径无效。',
      'error.cloneRootMissing': '本地仓库目录不存在。',
      'error.notARepo': '该目录不是 git 仓库。',
      'error.gitMissing': '找不到 git 命令。',
      'error.gitFailed': 'git 操作失败。',
      'error.noRemote': '该仓库没有 origin 远端。',
      'error.unsupportedRemote': '只允许 https://github.com 远端，已阻止操作。',
      'error.remoteHasCredentials': '远端地址内嵌了凭据，请先清理。',
      'error.dirtyWorktree': '工作区有未提交改动，无法拉取。',
      'error.notFastForward': '无法快进合并，请先手动处理分支。',
      'error.noUpstream': '该分支没有上游分支。',
      'error.detachedHead': '当前是游离 HEAD，无法推送。',
      'error.nothingToCommit': '没有可提交的改动。',
      'error.identityMissing': 'git 用户身份未配置（user.name / user.email）。',
      'error.pushRejected': '推送被远端拒绝。',
      'error.bodyTooLarge': '请求内容过大。',
      'error.logoutFailed': '退出登录失败。',
      'error.notSignedIn': '请先登录 GitHub。',
      'error.workflowScope': '授权缺少 workflow 权限，GitHub 拒绝推送工作流文件。请点“重新授权”后再试。',
      scopeMissingHint:
        '当前授权缺少 workflow 权限，无法推送 .github/workflows 下的工作流文件。重新授权即可补上；账号与本地仓库都不受影响。',
      reauth: '重新授权',
      scopeMissingShort: '授权缺少 workflow 权限，推送工作流文件会被拒；请在「设置 → GitHub」里重新授权。',
    }

    const en = {
      nav: 'GitHub',
      intro:
        'Sign in through GitHub’s official device flow. The access token is written only to the DSH credential store — never to the settings file, a git remote URL, or a command argument.',
      loading: 'Loading…',
      signIn: 'Sign in with GitHub',
      signingIn: 'Requesting a device code from GitHub…',
      enterCode: 'Open GitHub in your browser and enter this code:',
      openDevicePage: 'Open verification page',
      copyCode: 'Copy code',
      copied: 'Copied',
      waiting: 'Waiting for the browser to finish. This page updates on its own.',
      cancel: 'Cancel',
      cancelSignIn: 'Cancel sign-in',
      scopesValue: 'Scopes: {scopes}',
      obtainedAtValue: 'Authorized: {when}',
      expired: 'The token is no longer valid. Please sign in again.',
      unverified: 'The token could not be verified right now. Check the network.',
      signOut: 'Sign out',
      signOutConfirm: 'Sign out of GitHub?',
      confirm: 'Confirm',
      back: 'Back',
      signedOut: 'Signed out. Local repositories are untouched.',
      signedInNotice: 'Signed in.',
      settingsTitle: 'Connection settings',
      clientIdLabel: 'OAuth App Client ID',
      clientIdHint:
        'Create an OAuth App under GitHub → Settings → Developer settings → OAuth Apps and enable Device Flow. Enter only the Client ID — never the Client Secret.',
      cloneRootLabel: 'Local repository root',
      cloneRootHint: 'Clone, pull, commit and push are confined to this directory; paths outside it are rejected.',
      agentToolsLabel: 'Enable the github Agent tool',
      agentToolsHint: 'Lets the model run the same repository operations. Takes effect after the plugin reloads.',
      save: 'Save',
      saved: 'Settings saved.',
      restartRequired: 'Settings saved; the Agent-tool change applies after the plugin reloads.',
      configFileValue: 'Settings file: {path}',
      reposTitle: 'My repositories',
      loadRepos: 'Load repositories',
      reload: 'Refresh',
      reposEmpty: 'No repositories to show.',
      reposTruncated: 'Showing the 100 most recently updated repositories.',
      clone: 'Clone',
      cloning: 'Cloning…',
      cloned: 'Cloned to {path}',
      createTitle: 'Create repository',
      repoNameLabel: 'Repository name',
      repoNamePlaceholder: 'my-repo',
      repoDescriptionLabel: 'Description',
      repoDescriptionPlaceholder: 'Optional',
      createPrivateLabel: 'Private repository',
      createAutoInitLabel: 'Initialize with a README',
      create: 'Create',
      creating: 'Creating…',
      created: 'Created {fullName}.',
      private: 'Private',
      public: 'Public',
      localTitle: 'Local repositories',
      localEmpty: 'No repositories here yet. Clone one above.',
      localTruncated: 'Showing the first {count} local repositories.',
      localMissing: 'Directory does not exist: {root}',
      localLoading: 'Reading local repositories…',
      pull: 'Pull',
      pulling: 'Pulling…',
      pulled: 'Pulled to {branch}.',
      push: 'Push',
      pushing: 'Pushing…',
      pushed: 'Pushed {branch}.',
      commit: 'Commit',
      committing: 'Committing…',
      committed: 'Committed {short}.',
      committedPushed: 'Committed {short} and pushed {branch}.',
      commitMessageLabel: 'Commit message',
      commitMessagePlaceholder: 'Describe this change',
      commitPushLabel: 'Push after committing',
      dirty: '{count} change(s)',
      clean: 'Working tree clean',
      ahead: '{count} ahead',
      behind: '{count} behind',
      noUpstream: 'No upstream branch',
      detachedHead: 'Detached HEAD',
      noCommit: 'No commits',
      statusError: 'Status unavailable ({code})',
      dockTitle: 'GitHub: session folder',
      dockHint: 'Clone, pull, update and push inside the current session folder.',
      sessionPathLabel: 'Session folder',
      sessionNotRepo:
        'This folder is not a git repository yet. Clone a repository into it, or publish it as a new GitHub repository.',
      sessionCloneTitle: 'Clone a repository into this folder',
      sessionCloneHint: 'Cloned into {path}',
      sessionFullNameLabel: 'Repository (owner/name)',
      sessionFullNamePlaceholder: 'octocat/Hello-World',
      sessionPublishTitle: 'Create a repository and push this folder',
      sessionPublishHint:
        'Creates the repository in your GitHub account, initialises this folder and pushes the first commit. Only runs when the session folder is itself the repository root.',
      sessionPublishMessageLabel: 'First commit message',
      sessionPublishButton: 'Create and push',
      sessionPublishing: 'Creating and pushing…',
      sessionPublished: 'Created and pushed {fullName}.',
      sessionRefresh: 'Refresh',
      sessionFetch: 'Update',
      sessionFetching: 'Updating…',
      sessionFetched: 'Fetched from origin.',
      sessionClose: 'Close',
      sessionSignInHint: 'Sign in through Settings → GitHub first.',
      'error.sessionNotFound': 'That session is not active any more. Reopen it and try again.',
      'error.repoElsewhere': 'The session folder is inside another git repository; open that repository instead.',
      'error.remoteExists': 'This folder already has a different origin remote. Remove it first.',
      'error.targetExists': 'A directory with that name already exists at the target location.',
      'error.repoNested': 'The session folder already contains a repository; use that one instead.',
      'error.generic': 'The operation failed.',
      'error.detail': 'The operation failed: {message}',
      'error.http': 'The request failed (HTTP {status}).',
      'error.unauthorized': 'The session expired. Refresh the page and try again.',
      'error.connection': 'Could not reach the DSH host.',
      'error.missingClientId': 'Enter and save the OAuth App Client ID first.',
      'error.invalidClientId': 'That Client ID is not valid.',
      'error.deviceFlowDisabled': 'The OAuth App does not have Device Flow enabled.',
      'error.loginDenied': 'GitHub denied the authorization.',
      'error.loginExpired': 'The device code expired. Try again.',
      'error.tokenInvalid': 'The access token is no longer valid. Sign in again.',
      'error.rateLimited': 'GitHub API rate limit reached. Try again later.',
      'error.unsafePath': 'That path is outside the local repository root and was rejected.',
      'error.notFound': 'That repository or path does not exist.',
      'error.invalidRepoName': 'That repository name is not valid.',
      'error.invalidOwner': 'That repository owner is not valid.',
      'error.invalidCloneRoot': 'The local repository root must be an absolute path.',
      'error.invalidMessage': 'A commit message is required.',
      'error.invalidFiles': 'That file list is not valid.',
      'error.invalidPath': 'That repository path is not valid.',
      'error.cloneRootMissing': 'The local repository root does not exist.',
      'error.notARepo': 'That directory is not a git repository.',
      'error.gitMissing': 'The git executable was not found.',
      'error.gitFailed': 'A git operation failed.',
      'error.noRemote': 'The repository has no origin remote.',
      'error.unsupportedRemote': 'Only https://github.com remotes are allowed; the operation was blocked.',
      'error.remoteHasCredentials': 'The remote URL embeds credentials; clean it up first.',
      'error.dirtyWorktree': 'The working tree has uncommitted changes, so the pull was refused.',
      'error.notFastForward': 'The branch cannot be fast-forwarded; resolve it by hand.',
      'error.noUpstream': 'The branch has no upstream.',
      'error.detachedHead': 'HEAD is detached, so there is nothing to push.',
      'error.nothingToCommit': 'There is nothing to commit.',
      'error.identityMissing': 'git user.name / user.email are not configured.',
      'error.pushRejected': 'The remote rejected the push.',
      'error.bodyTooLarge': 'The request body was too large.',
      'error.logoutFailed': 'Signing out failed.',
      'error.notSignedIn': 'Sign in with GitHub first.',
      'error.workflowScope':
        'The token has no workflow scope, so GitHub refused to push workflow files. Re-authorize, then push again.',
      scopeMissingHint:
        'This authorization lacks the workflow scope, so pushes that touch .github/workflows are refused. Re-authorizing adds it; the account and local repositories are untouched.',
      reauth: 'Re-authorize',
      scopeMissingShort:
        'The token lacks the workflow scope, so pushing workflow files will fail. Re-authorize under Settings → GitHub.',
    }

    /** Host error code → locale key. Unknown codes fall back to the message. */
    const CODE_KEYS = {
      unauthorized: 'error.unauthorized',
      connection: 'error.connection',
      http: 'error.http',
      'missing-client-id': 'error.missingClientId',
      'invalid-client-id': 'error.invalidClientId',
      'device-flow-disabled': 'error.deviceFlowDisabled',
      'login-denied': 'error.loginDenied',
      'login-expired': 'error.loginExpired',
      'token-invalid': 'error.tokenInvalid',
      'rate-limited': 'error.rateLimited',
      'unsafe-path': 'error.unsafePath',
      'not-found': 'error.notFound',
      'invalid-repo-name': 'error.invalidRepoName',
      'invalid-owner': 'error.invalidOwner',
      'invalid-clone-root': 'error.invalidCloneRoot',
      'invalid-message': 'error.invalidMessage',
      'invalid-files': 'error.invalidFiles',
      'invalid-path': 'error.invalidPath',
      'clone-root-missing': 'error.cloneRootMissing',
      'not-a-repo': 'error.notARepo',
      'git-missing': 'error.gitMissing',
      'git-failed': 'error.gitFailed',
      'no-remote': 'error.noRemote',
      'unsupported-remote': 'error.unsupportedRemote',
      'remote-has-credentials': 'error.remoteHasCredentials',
      'dirty-worktree': 'error.dirtyWorktree',
      'not-fast-forward': 'error.notFastForward',
      'no-upstream': 'error.noUpstream',
      'detached-head': 'error.detachedHead',
      'nothing-to-commit': 'error.nothingToCommit',
      'identity-missing': 'error.identityMissing',
      'push-rejected': 'error.pushRejected',
      'workflow-scope-missing': 'error.workflowScope',
      'body-too-large': 'error.bodyTooLarge',
      'logout-failed': 'error.logoutFailed',
      'not-signed-in': 'error.notSignedIn',
      'session-not-found': 'error.sessionNotFound',
      'repo-elsewhere': 'error.repoElsewhere',
      'remote-exists': 'error.remoteExists',
      'target-exists': 'error.targetExists',
      'repo-nested': 'error.repoNested',
    }

    const CSS = `
.gh-section{display:flex;flex-direction:column;gap:16px;padding:8px 0}
.gh-header{display:flex;flex-direction:column;gap:4px}
.gh-heading{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.gh-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit)}
.gh-hint-small{font-size:11px}
.gh-banner{margin:0;padding:8px 12px;border-radius:var(--dsw-radius-md,8px);font-size:12px;line-height:1.5;word-break:break-word}
.gh-banner-error{background:var(--dsw-alias-bg-danger,rgba(229,72,77,.12));color:var(--dsw-alias-label-danger,#b42318)}
.gh-banner-ok{background:var(--dsw-alias-bg-success,rgba(46,160,67,.12));color:var(--dsw-alias-label-success,#17663a)}
.gh-banner-warn{background:var(--dsw-alias-bg-warning,rgba(212,167,44,.16));color:var(--dsw-alias-label-warning,#8a5d00)}
.gh-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,rgba(0,0,0,.1)));border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-settings-card-fill,transparent)}
.gh-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.gh-card-title{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.gh-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gh-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:var(--dsw-radius-md,8px);padding:6px 12px;font:inherit;font-size:12px;line-height:1.4;cursor:pointer}
.gh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.gh-btn:disabled{opacity:.55;cursor:default}
.gh-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,#24292f);color:var(--dsw-alias-button-primary-label,#fff)}
.gh-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover-fill,var(--dsw-alias-button-primary-fill,#24292f));opacity:.92}
.gh-btn-danger{border-color:transparent;background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12));color:var(--dsw-alias-label-danger,#b42318)}
.gh-btn:focus-visible,.gh-input:focus-visible,.gh-check input:focus-visible,.gh-code:focus-visible{outline:2px solid var(--dsw-alias-focus-ring,var(--dsw-alias-button-primary-fill,#0969da));outline-offset:2px}
.gh-code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:20px;letter-spacing:.18em;padding:8px 12px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,inherit);align-self:flex-start}
.gh-identity{display:flex;align-items:center;gap:10px}
.gh-avatar{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;background:var(--dsw-alias-bg-layer-2,#24292f);color:var(--dsw-alias-label-primary,#fff);flex:none}
.gh-identity-text{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dsw-alias-label-primary,inherit)}
.gh-muted{font-size:12px;color:var(--dsw-alias-label-secondary,inherit);word-break:break-all}
.gh-field{display:flex;flex-direction:column;gap:4px}
.gh-label{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.gh-input{box-sizing:border-box;width:100%;padding:6px 10px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary,inherit);background:transparent;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));border-radius:var(--dsw-radius-md,8px)}
.gh-check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-primary,inherit)}
.gh-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.gh-item{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:var(--dsw-radius-md,8px)}
.gh-item-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.gh-item-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);word-break:break-all}
.gh-item-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.gh-badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));color:var(--dsw-alias-label-secondary,inherit)}
.gh-commit{margin-top:4px;padding-top:10px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(0,0,0,.14));display:flex;flex-direction:column;gap:8px}
.gh-dock-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;appearance:none;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.14));background:transparent;color:var(--dsw-alias-label-secondary,inherit);border-radius:999px;padding:3px 10px;font:inherit;font-size:11px;line-height:1.5;cursor:pointer;flex:none;white-space:nowrap;min-width:0}
.gh-dock-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,inherit)}
.gh-dock-btn:focus-visible{outline:2px solid var(--dsw-alias-focus-ring,var(--dsw-alias-button-primary-fill,#0969da));outline-offset:2px}
.gh-dock-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.6;flex:none}
.gh-dock-icon{display:none;width:14px;height:14px;flex:none}
.gh-dock-label{white-space:nowrap}
/* Narrow screens (phone web UI): collapse the pill to a square icon so the
   label can never stack into a vertical column. The label stays in the DOM,
   visually hidden, so the button keeps its accessible name. */
@media (max-width:640px){
  .gh-dock-btn{position:relative;box-sizing:border-box;gap:0;padding:5px;width:26px;height:26px}
  .gh-dock-dot{display:none}
  .gh-dock-icon{display:block}
  .gh-dock-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
  .gh-overlay{padding:10px}
  .gh-dialog{padding:12px;gap:10px;max-height:min(86vh,720px)}
}
.gh-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.35)}
.gh-dialog{box-sizing:border-box;width:min(560px,100%);max-height:min(80vh,720px);overflow:auto;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,inherit);box-shadow:0 12px 40px rgba(0,0,0,.28)}
.gh-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.gh-dialog-title{margin:0;font-size:14px;font-weight:600}
.gh-dialog-foot{display:flex;justify-content:flex-end;gap:8px}
.gh-path{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-secondary,inherit);word-break:break-all}
.gh-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.gh-stack{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:var(--dsw-radius-md,8px)}
`

    /**
     * Call the Host route.
     *
     * Treats a non-2xx response or an `ok:false` envelope as a failure and
     * carries the Host error code on the thrown error.
     *
     * @param {string} action - Host action name.
     * @param {Record<string, unknown>} [payload] - Action payload.
     * @returns {Promise<any>}
     */
    async function call(action, payload) {
      /** @type {Response} */
      let response
      try {
        response = await fetch(ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...(payload ?? {}), action }),
        })
      } catch {
        throw fail('connection', 'request failed')
      }
      if (response.status === 401 || response.status === 403) throw fail('unauthorized', 'not authorized')
      /** @type {any} */
      let body = null
      try {
        body = await response.json()
      } catch {
        // A non-JSON body is handled by the status check below.
      }
      if (response.ok && body !== null && body.ok === true) return body.value
      const error = body !== null && typeof body === 'object' ? body.error ?? {} : {}
      const thrown = fail(typeof error.code === 'string' ? error.code : 'http', typeof error.message === 'string' ? error.message : 'request failed')
      thrown.status = response.status
      throw thrown
    }

    /**
     * @param {string} code - Host error code.
     * @param {string} message - Redacted Host message.
     * @returns {Error & {code: string, status?: number}}
     */
    function fail(code, message) {
      const error = new Error(message)
      error.code = code
      return error
    }

    /**
     * Localize one thrown error, preferring the code and falling back to the
     * (already redacted) Host message.
     *
     * @param {(key: string, params?: Record<string, unknown>) => string} t - Translator.
     * @param {unknown} error - Thrown value.
     * @returns {string}
     */
    function describeError(t, error) {
      const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
      if (code === 'http') {
        const status = error !== null && typeof error === 'object' ? error.status : undefined
        return t('error.http', { status: status ?? '?' })
      }
      const key = CODE_KEYS[code]
      if (key !== undefined) return t(key)
      const message = error instanceof Error ? error.message : ''
      if (message !== '' && message !== 'request failed') return t('error.detail', { message })
      return t('error.generic')
    }

    /**
     * Register the Client half.
     *
     * @param {any} ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-github: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.dshPlugin = NS
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-github: styles')

      const boundT = ctx.locale.bind(NS)

      /**
       * The GitHub settings page.
       *
       * Everything it shows is returned by the Host: settings, sign-in state,
       * repository lists. The access token itself is never part of a payload.
       *
       * @param {{t?: Function}} props - Slot props.
       */
      function GithubSection({ t }) {
        const tr = typeof t === 'function' ? t : boundT
        const [state, setState] = useState(null)
        const [settingsForm, setSettingsForm] = useState(null)
        const [remote, setRemote] = useState(null)
        const [local, setLocal] = useState(null)
        const [busy, setBusy] = useState('')
        const [error, setError] = useState('')
        const [notice, setNotice] = useState('')
        const [signOutOpen, setSignOutOpen] = useState(false)
        const [createForm, setCreateForm] = useState({ name: '', description: '', private: true, autoInit: true })
        const [commitPath, setCommitPath] = useState('')
        const [commitMessage, setCommitMessage] = useState('')
        const [commitPush, setCommitPush] = useState(false)
        const alive = useRef(true)

        useEffect(() => {
          alive.current = true
          return () => {
            alive.current = false
          }
        }, [])

        const applyState = useCallback((value) => {
          if (!alive.current) return
          setState(value)
          setSettingsForm((current) =>
            current === null
              ? {
                  clientId: value.settings.clientId,
                  cloneRoot: value.settings.cloneRoot,
                  agentTools: value.settings.agentTools,
                }
              : current,
          )
        }, [])

        const loadRepos = useCallback(async () => {
          setBusy('repos')
          setError('')
          try {
            const value = await call('list_repos')
            if (alive.current) setRemote(value)
          } catch (failure) {
            if (alive.current) setError(describeError(tr, failure))
          } finally {
            if (alive.current) setBusy('')
          }
        }, [tr])

        /** Run one Host action with shared busy/error handling. */
        const perform = useCallback(
          async (label, work) => {
            setBusy(label)
            setError('')
            setNotice('')
            try {
              await work()
            } catch (failure) {
              if (alive.current) setError(describeError(tr, failure))
            } finally {
              if (alive.current) setBusy('')
            }
          },
          [tr],
        )

        const replaceLocal = useCallback((repo) => {
          if (!alive.current) return
          setLocal((current) =>
            current === null
              ? current
              : {
                  ...current,
                  repos: current.repos.map((entry) => (entry.path === repo.path ? repo : entry)),
                },
          )
        }, [])

        const reloadLocal = useCallback(async () => {
          try {
            const value = await call('local_list')
            if (alive.current) setLocal(value)
          } catch {
            // A missing root is reported by the list itself; nothing to say here.
          }
        }, [])

        // Initial read of the Host state.
        useEffect(() => {
          let cancelled = false
          ;(async () => {
            try {
              const value = await call('state')
              if (!cancelled) applyState(value)
            } catch (failure) {
              if (!cancelled) setError(describeError(tr, failure))
            }
          })()
          return () => {
            cancelled = true
          }
        }, [applyState, tr])

        const loginStatus = state !== null ? state.login.status : 'idle'
        const signedIn = state !== null && state.auth.signedIn === true
        const signedKey = signedIn ? state.auth.login : ''

        // Poll while a device flow is pending.
        useEffect(() => {
          if (loginStatus !== 'pending' && loginStatus !== 'starting') return undefined
          const timer = setInterval(async () => {
            try {
              const value = await call('login_status')
              if (alive.current) applyState(value)
            } catch (failure) {
              if (alive.current) setError(describeError(tr, failure))
            }
          }, POLL_MS)
          return () => clearInterval(timer)
        }, [loginStatus, applyState, tr])

        // Announce the settled sign-in state once per transition.
        useEffect(() => {
          if (loginStatus === 'authorized') setNotice(tr('signedInNotice'))
          else if (loginStatus === 'cancelled') setNotice('')
        }, [loginStatus, tr])

        // Load repositories once the account is known, and reload when it changes.
        useEffect(() => {
          if (signedKey === '') {
            setRemote(null)
            return
          }
          if (remote === null) void loadRepos()
        }, [signedKey, remote, loadRepos])

        // Read local repositories whenever the clone root is known or changes.
        const cloneRoot = state !== null ? state.settings.cloneRoot : ''
        useEffect(() => {
          if (cloneRoot === '') return undefined
          let cancelled = false
          ;(async () => {
            try {
              const value = await call('local_list')
              if (!cancelled && alive.current) setLocal(value)
            } catch {
              // Reported through the list's own `exists` flag.
            }
          })()
          return () => {
            cancelled = true
          }
        }, [cloneRoot])

        const signIn = () =>
          perform('login', async () => {
            const value = await call('login_start')
            applyState(value)
          })

        const cancelSignIn = () =>
          perform('cancel', async () => {
            const value = await call('login_cancel')
            applyState(value)
          })

        const signOut = () =>
          perform('logout', async () => {
            const value = await call('logout')
            applyState(value)
            setSignOutOpen(false)
            setRemote(null)
            setNotice(tr('signedOut'))
          })

        const saveSettingsForm = () =>
          perform('save', async () => {
            const value = await call('settings_save', settingsForm)
            if (!alive.current) return
            setState((current) => (current === null ? current : { ...current, settings: value.settings }))
            setSettingsForm({
              clientId: value.settings.clientId,
              cloneRoot: value.settings.cloneRoot,
              agentTools: value.settings.agentTools,
            })
            setNotice(value.toolsRestartRequired ? tr('restartRequired') : tr('saved'))
          })

        const cloneOne = (repo) =>
          perform(`clone:${repo.fullName}`, async () => {
            const value = await call('repo_clone', { fullName: repo.fullName })
            if (alive.current) setNotice(tr('cloned', { path: value.path }))
            await reloadLocal()
          })

        const createRepo = () =>
          perform('create', async () => {
            const name = createForm.name.trim()
            if (name === '') throw fail('invalid-repo-name', 'name required')
            const value = await call('repo_create', {
              name,
              description: createForm.description.trim(),
              private: createForm.private,
              autoInit: createForm.autoInit,
            })
            if (!alive.current) return
            setNotice(tr('created', { fullName: value.repo.fullName }))
            setCreateForm((current) => ({ ...current, name: '', description: '' }))
            if (remote !== null) await loadRepos()
          })

        const pullOne = (repo) =>
          perform(`pull:${repo.path}`, async () => {
            const value = await call('repo_pull', { path: repo.path })
            replaceLocal(value.repo)
            setNotice(tr('pulled', { branch: value.repo.branch }))
          })

        const pushOne = (repo) =>
          perform(`push:${repo.path}`, async () => {
            const value = await call('repo_push', { path: repo.path })
            replaceLocal(value.repo)
            setNotice(tr('pushed', { branch: value.repo.branch }))
          })

        const commitOne = (repo) =>
          perform(`commit:${repo.path}`, async () => {
            const message = commitMessage.trim()
            if (message === '') throw fail('invalid-message', 'message required')
            const value = await call('repo_commit', { path: repo.path, message, push: commitPush })
            replaceLocal(value.repo)
            if (!alive.current) return
            setCommitPath('')
            setCommitMessage('')
            setCommitPush(false)
            setNotice(
              value.pushed !== null && value.pushed !== undefined
                ? tr('committedPushed', { short: value.commit.shortHash, branch: value.pushed.branch })
                : tr('committed', { short: value.commit.shortHash }),
            )
          })

        const initial = (login) => (typeof login === 'string' && login !== '' ? login.slice(0, 1).toUpperCase() : '?')

        const relativePath = (path) =>
          local !== null && path.startsWith(`${local.root}/`) ? path.slice(local.root.length + 1) : path

        const button = (key, label, onClick, options = {}) =>
          h(
            'button',
            {
              key,
              type: 'button',
              className: options.primary ? 'gh-btn gh-btn-primary' : options.danger ? 'gh-btn gh-btn-danger' : 'gh-btn',
              disabled: Boolean(options.disabled) || busy !== '',
              onClick,
            },
            label,
          )

        const banner = (key, text, kind) =>
          h('p', { key, className: `gh-banner gh-banner-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text)

        const renderAuth = () => {
          const auth = state.auth
          const login = state.login
          const children = []

          if (auth.signedIn) {
            children.push(
              h(
                'div',
                { className: 'gh-identity', key: 'identity' },
                h('span', { className: 'gh-avatar', 'aria-hidden': true }, initial(auth.login)),
                h(
                  'div',
                  { className: 'gh-identity-text' },
                  h('strong', null, `@${auth.login !== '' ? auth.login : '?'}`),
                  auth.name !== '' ? h('span', { className: 'gh-muted' }, auth.name) : null,
                  auth.scopes !== '' ? h('span', { className: 'gh-muted' }, tr('scopesValue', { scopes: auth.scopes })) : null,
                  auth.obtainedAt !== ''
                    ? h('span', { className: 'gh-muted' }, tr('obtainedAtValue', { when: auth.obtainedAt }))
                    : null,
                ),
              ),
            )
            if (auth.expired === true) children.push(banner('expired', tr('expired'), 'error'))
            else if (auth.unverified === true) children.push(banner('unverified', tr('unverified'), 'error'))
            const missing = Array.isArray(auth.missingScopes) ? auth.missingScopes : []
            if (missing.length > 0 && auth.expired !== true) {
              children.push(banner('scope-missing', tr('scopeMissingHint'), 'warn'))
            }
            children.push(
              h(
                'div',
                { className: 'gh-actions', key: 'actions' },
                signOutOpen
                  ? h(
                      React.Fragment,
                      null,
                      button('confirm-out', busy === 'logout' ? tr('signOut') : tr('confirm'), signOut, { danger: true }),
                      button('back', tr('back'), () => setSignOutOpen(false), { disabled: busy === 'logout' }),
                    )
                  : h(
                      React.Fragment,
                      null,
                      button('sign-out', tr('signOut'), () => setSignOutOpen(true)),
                      auth.expired === true
                        ? button('again', tr('signIn'), signIn, { primary: true })
                        : missing.length > 0
                          ? button('reauth', tr('reauth'), signIn, { primary: true })
                          : null,
                    ),
              ),
            )
            if (signOutOpen) children.push(h('p', { className: 'gh-hint gh-hint-small', key: 'confirm-hint' }, tr('signOutConfirm')))
          } else if (login.status === 'pending') {
            children.push(
              h('p', { className: 'gh-hint', key: 'code-label' }, tr('enterCode')),
              h('code', { className: 'gh-code', tabIndex: 0, key: 'code' }, login.userCode ?? ''),
              h(
                'div',
                { className: 'gh-actions', key: 'actions' },
                isGithubUrl(login.verificationUri)
                  ? h(
                      'a',
                      {
                        className: 'gh-btn gh-btn-primary',
                        href: login.verificationUri,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                        key: 'open',
                      },
                      tr('openDevicePage'),
                    )
                  : null,
                button(
                  'copy',
                  tr('copyCode'),
                  () => {
                    copyText(login.userCode)
                    setNotice(tr('copied'))
                  },
                  { disabled: busy !== '' },
                ),
                button('cancel', tr('cancelSignIn'), cancelSignIn, { danger: true }),
              ),
              h('p', { className: 'gh-hint gh-hint-small', key: 'wait' }, tr('waiting')),
            )
          } else if (login.status === 'starting') {
            children.push(h('p', { className: 'gh-hint', key: 'starting' }, tr('signingIn')))
          } else {
            if (login.status === 'failed' && typeof login.message === 'string') {
              children.push(banner('login-failed', describeError(tr, fail(login.code ?? 'generic', login.message)), 'error'))
            }
            children.push(
              h(
                'div',
                { className: 'gh-actions', key: 'actions' },
                button('sign-in', busy === 'login' ? tr('signingIn') : tr('signIn'), signIn, {
                  primary: true,
                  disabled: busy !== '',
                }),
              ),
            )
            if (state.settings.clientId === '') children.push(h('p', { className: 'gh-hint gh-hint-small', key: 'need-id' }, tr('clientIdHint')))
          }

          return h(
            'div',
            { className: 'gh-card', key: 'auth' },
            h('div', { className: 'gh-card-head' }, h('h3', { className: 'gh-card-title' }, tr('nav'))),
            ...children,
          )
        }

        const renderSettings = () => {
          const form = settingsForm
          if (form === null) return null
          return h(
            'div',
            { className: 'gh-card', key: 'settings' },
            h('div', { className: 'gh-card-head' }, h('h3', { className: 'gh-card-title' }, tr('settingsTitle'))),
            h(
              'label',
              { className: 'gh-field' },
              h('span', { className: 'gh-label' }, tr('clientIdLabel')),
              h('input', {
                type: 'text',
                className: 'gh-input',
                value: form.clientId,
                spellCheck: false,
                autoComplete: 'off',
                placeholder: 'Iv1.0123456789abcdef',
                onChange: (event) => {
                  const value = event.currentTarget.value
                  setSettingsForm((current) => (current === null ? current : { ...current, clientId: value }))
                },
              }),
              h('span', { className: 'gh-hint gh-hint-small' }, tr('clientIdHint')),
            ),
            h(
              'label',
              { className: 'gh-field' },
              h('span', { className: 'gh-label' }, tr('cloneRootLabel')),
              h('input', {
                type: 'text',
                className: 'gh-input',
                value: form.cloneRoot,
                spellCheck: false,
                autoComplete: 'off',
                onChange: (event) => {
                  const value = event.currentTarget.value
                  setSettingsForm((current) => (current === null ? current : { ...current, cloneRoot: value }))
                },
              }),
              h('span', { className: 'gh-hint gh-hint-small' }, tr('cloneRootHint')),
            ),
            h(
              'label',
              { className: 'gh-check' },
              h('input', {
                type: 'checkbox',
                checked: form.agentTools,
                onChange: (event) => {
                  const value = event.currentTarget.checked
                  setSettingsForm((current) => (current === null ? current : { ...current, agentTools: value }))
                },
              }),
              h('span', null, tr('agentToolsLabel')),
            ),
            h('p', { className: 'gh-hint gh-hint-small' }, tr('agentToolsHint')),
            h(
              'div',
              { className: 'gh-actions' },
              button('save', busy === 'save' ? tr('save') : tr('save'), saveSettingsForm, { primary: true }),
            ),
            h('p', { className: 'gh-hint gh-hint-small' }, tr('configFileValue', { path: state.settings.configFile })),
          )
        }

        const renderRemote = () => {
          if (!signedIn) return null
          const children = [
            h(
              'div',
              { className: 'gh-card-head', key: 'head' },
              h('h3', { className: 'gh-card-title' }, tr('reposTitle')),
              h(
                'div',
                { className: 'gh-actions' },
                remote === null
                  ? button('load', busy === 'repos' ? tr('loading') : tr('loadRepos'), loadRepos)
                  : button('reload', tr('reload'), loadRepos),
              ),
            ),
          ]
          if (remote !== null) {
            if (remote.repos.length === 0) children.push(h('p', { className: 'gh-hint', key: 'empty' }, tr('reposEmpty')))
            else {
              children.push(
                h(
                  'ul',
                  { className: 'gh-list', key: 'list' },
                  remote.repos.map((repo) =>
                    h(
                      'li',
                      { className: 'gh-item', key: repo.fullName },
                      h(
                        'div',
                        { className: 'gh-item-head' },
                        h('span', { className: 'gh-item-name' }, repo.fullName),
                        button(
                          `clone:${repo.fullName}`,
                          busy === `clone:${repo.fullName}` ? tr('cloning') : tr('clone'),
                          () => cloneOne(repo),
                          { disabled: busy !== '' },
                        ),
                      ),
                      h(
                        'div',
                        { className: 'gh-item-meta' },
                        h('span', { className: 'gh-badge' }, repo.private ? tr('private') : tr('public')),
                        repo.description !== '' ? h('span', null, repo.description) : null,
                        repo.updatedAt !== '' ? h('span', null, repo.updatedAt) : null,
                      ),
                    ),
                  ),
                ),
              )
              if (remote.truncated) children.push(h('p', { className: 'gh-hint gh-hint-small', key: 'trunc' }, tr('reposTruncated')))
            }
          }
          children.push(
            h('div', { className: 'gh-field', key: 'create' },
              h('h4', { className: 'gh-card-title' }, tr('createTitle')),
              h('label', { className: 'gh-field' },
                h('span', { className: 'gh-label' }, tr('repoNameLabel')),
                h('input', {
                  type: 'text',
                  className: 'gh-input',
                  value: createForm.name,
                  placeholder: tr('repoNamePlaceholder'),
                  spellCheck: false,
                  autoComplete: 'off',
                  onChange: (event) => {
                    const value = event.currentTarget.value
                    setCreateForm((current) => ({ ...current, name: value }))
                  },
                }),
              ),
              h('label', { className: 'gh-field' },
                h('span', { className: 'gh-label' }, tr('repoDescriptionLabel')),
                h('input', {
                  type: 'text',
                  className: 'gh-input',
                  value: createForm.description,
                  placeholder: tr('repoDescriptionPlaceholder'),
                  autoComplete: 'off',
                  onChange: (event) => {
                    const value = event.currentTarget.value
                    setCreateForm((current) => ({ ...current, description: value }))
                  },
                }),
              ),
              h('label', { className: 'gh-check' },
                h('input', {
                  type: 'checkbox',
                  checked: createForm.private,
                  onChange: (event) => {
                    const value = event.currentTarget.checked
                    setCreateForm((current) => ({ ...current, private: value }))
                  },
                }),
                h('span', null, tr('createPrivateLabel')),
              ),
              h('label', { className: 'gh-check' },
                h('input', {
                  type: 'checkbox',
                  checked: createForm.autoInit,
                  onChange: (event) => {
                    const value = event.currentTarget.checked
                    setCreateForm((current) => ({ ...current, autoInit: value }))
                  },
                }),
                h('span', null, tr('createAutoInitLabel')),
              ),
              h('div', { className: 'gh-actions' },
                button('create', busy === 'create' ? tr('creating') : tr('create'), createRepo, { primary: true }),
              ),
            ),
          )
          return h('div', { className: 'gh-card', key: 'remote' }, ...children)
        }

        const renderLocal = () => {
          const children = [
            h(
              'div',
              { className: 'gh-card-head', key: 'head' },
              h('h3', { className: 'gh-card-title' }, tr('localTitle')),
              h('div', { className: 'gh-actions' }, button('reload-local', tr('reload'), reloadLocal)),
            ),
          ]
          if (local === null) children.push(h('p', { className: 'gh-hint', key: 'loading' }, tr('localLoading')))
          else if (local.exists !== true) children.push(h('p', { className: 'gh-hint', key: 'missing' }, tr('localMissing', { root: local.root })))
          else if (local.repos.length === 0) children.push(h('p', { className: 'gh-hint', key: 'empty' }, tr('localEmpty')))
          else {
            children.push(
              h(
                'ul',
                { className: 'gh-list', key: 'list' },
                local.repos.map((repo) => {
                  const dir = relativePath(repo.path)
                  const meta = []
                  if (repo.error !== undefined) {
                    meta.push(h('span', { className: 'gh-badge', key: 'err' }, tr('statusError', { code: repo.error })))
                  } else {
                    meta.push(h('span', { className: 'gh-badge', key: 'branch' }, repo.detached ? tr('detachedHead') : repo.branch || '—'))
                    meta.push(
                      h(
                        'span',
                        { className: 'gh-badge', key: 'changes' },
                        repo.clean ? tr('clean') : tr('dirty', { count: repo.changeCount }),
                      ),
                    )
                    if (repo.upstream) meta.push(h('span', { className: 'gh-badge', key: 'up' }, repo.upstream))
                    else meta.push(h('span', { className: 'gh-badge', key: 'noup' }, tr('noUpstream')))
                    if (repo.ahead > 0) meta.push(h('span', { className: 'gh-badge', key: 'ahead' }, tr('ahead', { count: repo.ahead })))
                    if (repo.behind > 0) meta.push(h('span', { className: 'gh-badge', key: 'behind' }, tr('behind', { count: repo.behind })))
                  }
                  return h(
                    'li',
                    { className: 'gh-item', key: repo.path },
                    h(
                      'div',
                      { className: 'gh-item-head' },
                      h('span', { className: 'gh-item-name' }, dir),
                      h(
                        'div',
                        { className: 'gh-actions' },
                        button(`pull:${repo.path}`, busy === `pull:${repo.path}` ? tr('pulling') : tr('pull'), () => pullOne(repo), {
                          disabled: busy !== '',
                        }),
                        button(`push:${repo.path}`, busy === `push:${repo.path}` ? tr('pushing') : tr('push'), () => pushOne(repo), {
                          disabled: busy !== '',
                        }),
                        button(
                          `commit-open:${repo.path}`,
                          tr('commit'),
                          () => {
                            setCommitPath(commitPath === repo.path ? '' : repo.path)
                            setCommitMessage('')
                          },
                          { disabled: busy !== '' },
                        ),
                      ),
                    ),
                    h('div', { className: 'gh-item-meta' }, ...meta),
                    repo.lastCommit !== null && repo.lastCommit !== undefined
                      ? h(
                          'span',
                          { className: 'gh-muted' },
                          `${repo.lastCommit.shortHash} ${repo.lastCommit.subject} — ${repo.lastCommit.author}`,
                        )
                      : h('span', { className: 'gh-muted' }, tr('noCommit')),
                    commitPath === repo.path
                      ? h(
                          'div',
                          { className: 'gh-commit' },
                          h('label', { className: 'gh-field' },
                            h('span', { className: 'gh-label' }, tr('commitMessageLabel')),
                            h('input', {
                              type: 'text',
                              className: 'gh-input',
                              value: commitMessage,
                              placeholder: tr('commitMessagePlaceholder'),
                              autoComplete: 'off',
                              onChange: (event) => setCommitMessage(event.currentTarget.value),
                            }),
                          ),
                          h('label', { className: 'gh-check' },
                            h('input', {
                              type: 'checkbox',
                              checked: commitPush,
                              onChange: (event) => setCommitPush(event.currentTarget.checked),
                            }),
                            h('span', null, tr('commitPushLabel')),
                          ),
                          h('div', { className: 'gh-actions' },
                            button(
                              `commit:${repo.path}`,
                              busy === `commit:${repo.path}` ? tr('committing') : tr('commit'),
                              () => commitOne(repo),
                              { primary: true, disabled: busy !== '' },
                            ),
                            button('commit-cancel', tr('cancel'), () => setCommitPath(''), { disabled: busy !== '' }),
                          ),
                        )
                      : null,
                  )
                }),
              ),
            )
            if (local.truncated === true) {
              children.push(h('p', { className: 'gh-hint gh-hint-small', key: 'trunc' }, tr('localTruncated', { count: local.repos.length })))
            }
          }
          return h('div', { className: 'gh-card', key: 'local' }, ...children)
        }

        const body = []
        if (state !== null) {
          body.push(renderAuth(), renderSettings(), renderRemote(), renderLocal())
        }

        return h(
          'section',
          { className: 'gh-section', 'aria-label': tr('nav') },
          h(
            'div',
            { className: 'gh-header' },
            h('h2', { className: 'gh-heading' }, tr('nav')),
            h('p', { className: 'gh-hint' }, tr('intro')),
          ),
          error !== '' ? banner('error', error, 'error') : null,
          notice !== '' ? banner('notice', notice, 'ok') : null,
          state === null ? h('p', { className: 'gh-hint' }, tr('loading')) : body,
        )
      }

      /**
       * Composer-dock entry: git actions for the current session folder.
       *
       * The Client never sends a path: it sends `sessionId`, and the Host
       * resolves the committed working directory itself.
       *
       * @param {{sessionId?: string, t?: Function}} props - Dock slot props.
       */
      function GithubDock({ sessionId, t }) {
        const tr = typeof t === 'function' ? t : boundT
        const [open, setOpen] = useState(false)
        const [snapshot, setSnapshot] = useState(null)
        const [auth, setAuth] = useState(null)
        const [busy, setBusy] = useState('')
        const [error, setError] = useState('')
        const [notice, setNotice] = useState('')
        const [cloneName, setCloneName] = useState('')
        const [publishName, setPublishName] = useState('')
        const [publishMessage, setPublishMessage] = useState('Initial commit')
        const [publishPrivate, setPublishPrivate] = useState(true)
        const [commitMessage, setCommitMessage] = useState('')
        const [commitPush, setCommitPush] = useState(true)
        const [showCommit, setShowCommit] = useState(false)
        const alive = useRef(true)
        const dialog = useRef(null)
        const banner = (key, text, kind) =>
          h('p', { key, className: `gh-banner gh-banner-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text)

        useEffect(() => {
          alive.current = true
          return () => {
            alive.current = false
          }
        }, [])

        useEffect(() => {
          if (open) {
            if (typeof dialog.current?.focus === 'function') {
              try {
                dialog.current.focus()
              } catch {
                // Focusing is a convenience only.
              }
            }
          }
        }, [open])

        const applyStatus = useCallback((value) => {
          if (!alive.current || value === null || typeof value !== 'object') return
          setSnapshot(value)
        }, [])

        /** Run one Host action with shared busy/error handling. */
        const run = useCallback(
          async (label, action, payload) => {
            setBusy(label)
            setError('')
            setNotice('')
            try {
              return await call(action, payload)
            } catch (failure) {
              if (alive.current) setError(describeError(tr, failure))
              return null
            } finally {
              if (alive.current) setBusy('')
            }
          },
          [tr],
        )

        const refresh = useCallback(async () => {
          const status = await run('refresh', 'session_status', { sessionId })
          if (status !== null) applyStatus(status)
          const state = await run('auth', 'state')
          if (state !== null && alive.current) setAuth(state.auth)
        }, [applyStatus, run, sessionId])

        useEffect(() => {
          if (!open) return undefined
          refresh()
          return undefined
        }, [open, refresh])

        if (typeof sessionId !== 'string' || sessionId === '') return null

        // An expired token is still "signed in" on the Host, but every remote
        // action would fail with token-invalid; treat it as signed out here so
        // the panel offers the sign-in hint instead of broken buttons.
        const signedIn = auth !== null && auth.signedIn === true && auth.expired !== true
        const repo = snapshot !== null ? snapshot.repo : null
        const busyLabel = busy
        const disabled = busy !== ''

        const doClone = async () => {
          const value = await run('clone', 'session_clone', { sessionId, fullName: cloneName })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: value.path, repo: value.repo })
          setCloneName('')
          setNotice(tr('cloned', { path: value.path }))
        }

        const doPublish = async () => {
          const value = await run('publish', 'session_publish', {
            sessionId,
            name: publishName,
            message: publishMessage,
            private: publishPrivate,
          })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: value.path, repo: value.repo })
          setPublishName('')
          setNotice(tr('sessionPublished', { fullName: value.remote.fullName }))
        }

        const doPull = async () => {
          const value = await run('pull', 'session_pull', { sessionId })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: snapshot !== null ? snapshot.repoRoot : value.path, repo: value.repo })
          setNotice(tr('pulled', { branch: value.repo.branch }))
        }

        const doFetch = async () => {
          const value = await run('fetch', 'session_fetch', { sessionId })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: snapshot !== null ? snapshot.repoRoot : value.path, repo: value.repo })
          setNotice(tr('sessionFetched'))
        }

        const doCommit = async () => {
          const value = await run('commit', 'session_commit', {
            sessionId,
            message: commitMessage,
            push: commitPush,
          })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: snapshot !== null ? snapshot.repoRoot : value.path, repo: value.repo })
          setShowCommit(false)
          setCommitMessage('')
          if (value.pushed !== null) {
            setNotice(tr('committedPushed', { short: value.commit !== null ? value.commit.shortHash : '', branch: value.pushed.branch }))
          } else {
            setNotice(tr('committed', { short: value.commit !== null ? value.commit.shortHash : '' }))
          }
        }

        const doPush = async () => {
          const value = await run('push', 'session_push', { sessionId })
          if (value === null) return
          applyStatus({ path: value.path, repoRoot: snapshot !== null ? snapshot.repoRoot : value.path, repo: value.repo })
          setNotice(tr('pushed', { branch: value.pushed.branch }))
        }

        const pill = h(
          'button',
          {
            type: 'button',
            className: 'gh-dock-btn',
            title: tr('dockTitle'),
            'aria-label': tr('dockTitle'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen(true),
          },
          h('span', { className: 'gh-dock-dot', 'aria-hidden': true }),
          h(
            'svg',
            {
              className: 'gh-dock-icon',
              viewBox: '0 0 16 16',
              width: 14,
              height: 14,
              'aria-hidden': true,
              focusable: 'false',
            },
            h('path', {
              d: 'M5 4.6v6.8',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
            }),
            h('path', {
              d: 'M5 7.2h2.5a2.4 2.4 0 0 1 2.4 2.4v.6',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.4,
              strokeLinecap: 'round',
            }),
            h('circle', { cx: 5, cy: 3, r: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
            h('circle', { cx: 10, cy: 11.6, r: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
          ),
          h('span', { className: 'gh-dock-label' }, 'GitHub'),
        )

        if (!open) return pill

        const body = []
        if (snapshot !== null) {
          body.push(
            h(
              'div',
              { className: 'gh-row', key: 'path' },
              h('span', null, `${tr('sessionPathLabel')}: `),
              h('span', { className: 'gh-path' }, snapshot.path),
            ),
          )
          if (repo !== null) {
            const parts = []
            parts.push(h('span', { className: 'gh-badge', key: 'branch' }, repo.detached === true ? tr('detachedHead') : repo.branch))
            parts.push(
              h('span', { key: 'clean' }, repo.clean === true ? tr('clean') : tr('dirty', { count: repo.changeCount })),
            )
            if (repo.ahead > 0) parts.push(h('span', { key: 'ahead' }, tr('ahead', { count: repo.ahead })))
            if (repo.behind > 0) parts.push(h('span', { key: 'behind' }, tr('behind', { count: repo.behind })))
            if (repo.remote !== null) parts.push(h('span', { className: 'gh-path', key: 'remote' }, repo.remote.url))
            body.push(h('div', { className: 'gh-row', key: 'status' }, ...parts))
            if (repo.lastCommit !== null) {
              body.push(
                h(
                  'div',
                  { className: 'gh-row', key: 'last' },
                  h('span', { className: 'gh-path' }, `${repo.lastCommit.shortHash} ${repo.lastCommit.subject}`),
                ),
              )
            }
          }
        } else {
          body.push(h('p', { className: 'gh-hint', key: 'loading' }, tr('loading')))
        }

        if (signedIn !== true) body.push(h('p', { className: 'gh-hint', key: 'signin' }, tr('sessionSignInHint')))

        const scopes = auth !== null && Array.isArray(auth.missingScopes) ? auth.missingScopes : []
        if (signedIn === true && scopes.length > 0) {
          body.push(h('p', { className: 'gh-banner gh-banner-warn', key: 'scope' }, tr('scopeMissingShort')))
        }

        if (repo !== null && signedIn) {
          body.push(
            h(
              'div',
              { className: 'gh-actions', key: 'actions' },
              h('button', { type: 'button', className: 'gh-btn', disabled, onClick: refresh }, tr('sessionRefresh')),
              h('button', { type: 'button', className: 'gh-btn', disabled, onClick: doFetch }, busy === 'fetch' ? tr('sessionFetching') : tr('sessionFetch')),
              h('button', { type: 'button', className: 'gh-btn', disabled, onClick: doPull }, busy === 'pull' ? tr('pulling') : tr('pull')),
              h('button', { type: 'button', className: 'gh-btn', disabled, onClick: () => setShowCommit((value) => !value) }, tr('commit')),
              h('button', { type: 'button', className: 'gh-btn', disabled, onClick: doPush }, busy === 'push' ? tr('pushing') : tr('push')),
            ),
          )
          if (showCommit) {
            body.push(
              h(
                'div',
                { className: 'gh-stack', key: 'commit-form' },
                h(
                  'label',
                  { className: 'gh-field' },
                  h('span', { className: 'gh-label' }, tr('commitMessageLabel')),
                  h('input', {
                    className: 'gh-input',
                    value: commitMessage,
                    placeholder: tr('commitMessagePlaceholder'),
                    onChange: (event) => setCommitMessage(event.target.value),
                  }),
                ),
                h(
                  'label',
                  { className: 'gh-check' },
                  h('input', { type: 'checkbox', checked: commitPush, onChange: (event) => setCommitPush(event.target.checked) }),
                  h('span', null, tr('commitPushLabel')),
                ),
                h(
                  'div',
                  { className: 'gh-actions' },
                  h(
                    'button',
                    { type: 'button', className: 'gh-btn gh-btn-primary', disabled: disabled || commitMessage === '', onClick: doCommit },
                    busy === 'commit' ? tr('committing') : tr('commit'),
                  ),
                ),
              ),
            )
          }
        }

        if (repo === null && snapshot !== null && signedIn) {
          const preview = cloneName.includes('/') ? cloneName.split('/').pop() : cloneName
          body.push(
            h(
              'div',
              { className: 'gh-stack', key: 'clone' },
              h('h3', { className: 'gh-dialog-title' }, tr('sessionCloneTitle')),
              h(
                'label',
                { className: 'gh-field' },
                h('span', { className: 'gh-label' }, tr('sessionFullNameLabel')),
                h('input', {
                  className: 'gh-input',
                  value: cloneName,
                  placeholder: tr('sessionFullNamePlaceholder'),
                  onChange: (event) => setCloneName(event.target.value),
                }),
              ),
              preview !== '' ? h('p', { className: 'gh-hint gh-hint-small' }, tr('sessionCloneHint', { path: `${snapshot.path}/${preview}` })) : null,
              h('p', { className: 'gh-hint gh-hint-small' }, tr('sessionNotRepo')),
              h(
                'div',
                { className: 'gh-actions' },
                h(
                  'button',
                  { type: 'button', className: 'gh-btn gh-btn-primary', disabled: disabled || cloneName === '', onClick: doClone },
                  busy === 'clone' ? tr('cloning') : tr('clone'),
                ),
              ),
            ),
          )
        }

        if (repo === null && snapshot !== null && signedIn) {
          body.push(
            h(
              'div',
              { className: 'gh-stack', key: 'publish' },
              h('h3', { className: 'gh-dialog-title' }, tr('sessionPublishTitle')),
              h('p', { className: 'gh-hint gh-hint-small' }, tr('sessionPublishHint')),
              h(
                'label',
                { className: 'gh-field' },
                h('span', { className: 'gh-label' }, tr('repoNameLabel')),
                h('input', {
                  className: 'gh-input',
                  value: publishName,
                  placeholder: tr('repoNamePlaceholder'),
                  onChange: (event) => setPublishName(event.target.value),
                }),
              ),
              h(
                'label',
                { className: 'gh-field' },
                h('span', { className: 'gh-label' }, tr('sessionPublishMessageLabel')),
                h('input', {
                  className: 'gh-input',
                  value: publishMessage,
                  onChange: (event) => setPublishMessage(event.target.value),
                }),
              ),
              h(
                'label',
                { className: 'gh-check' },
                h('input', { type: 'checkbox', checked: publishPrivate, onChange: (event) => setPublishPrivate(event.target.checked) }),
                h('span', null, tr('createPrivateLabel')),
              ),
              h(
                'div',
                { className: 'gh-actions' },
                h(
                  'button',
                  { type: 'button', className: 'gh-btn gh-btn-primary', disabled: disabled || publishName === '', onClick: doPublish },
                  busy === 'publish' ? tr('sessionPublishing') : tr('sessionPublishButton'),
                ),
              ),
            ),
          )
        }

        return h(
          'div',
          null,
          pill,
          h(
            'div',
            {
              className: 'gh-overlay',
              onClick: (event) => {
                if (event.target === event.currentTarget) setOpen(false)
              },
            },
            h(
              'div',
              {
                className: 'gh-dialog',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': tr('dockTitle'),
                tabIndex: -1,
                ref: dialog,
                onKeyDown: (event) => {
                  if (event.key === 'Escape') setOpen(false)
                },
              },
              h(
                'div',
                { className: 'gh-dialog-head' },
                h('h2', { className: 'gh-dialog-title' }, tr('dockTitle')),
                h(
                  'button',
                  { type: 'button', className: 'gh-btn', onClick: () => setOpen(false) },
                  tr('sessionClose'),
                ),
              ),
              h('p', { className: 'gh-hint gh-hint-small' }, tr('dockHint')),
              error !== '' ? banner('error', error, 'error') : null,
              notice !== '' ? banner('notice', notice, 'ok') : null,
              ...body,
              h(
                'div',
                { className: 'gh-dialog-foot' },
                h('button', { type: 'button', className: 'gh-btn', onClick: () => setOpen(false) }, tr('sessionClose')),
              ),
            ),
          ),
        )
      }

      ctx.slots.inject(SECTION_SLOT, () =>
        ctx.slots.register(
          {
            name: SECTION_SLOT,
            id: NS,
            order: 60,
            label: () => boundT('nav'),
            locale: NS,
          },
          GithubSection,
        ),
      )

      ctx.slots.inject(DOCK_SLOT, () =>
        ctx.slots.register(
          {
            name: DOCK_SLOT,
            id: NS,
            order: 70,
            locale: NS,
          },
          GithubDock,
        ),
      )
    }

    /**
     * Only GitHub's own https page may become a link in the UI.
     *
     * @param {unknown} value - URL from a Host payload.
     * @returns {boolean}
     */
    function isGithubUrl(value) {
      return typeof value === 'string' && /^https:\/\/github\.com\/login\/device\/?$/.test(value)
    }

    /**
     * Copy the device code, tolerating a missing clipboard API.
     *
     * @param {unknown} value - Text to copy.
     */
    function copyText(value) {
      if (typeof value !== 'string' || value === '') return
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
      if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
      clipboard.writeText(value).catch(() => {
        // Copying is a convenience, never a requirement.
      })
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
