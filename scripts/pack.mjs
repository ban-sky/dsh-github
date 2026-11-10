#!/usr/bin/env node
/**
 * Build the release artifact from this single source tree.
 *
 *   dsh-github-<version>.tgz    one package for every host: the Web UI, the
 *                               `dshGo` v1 manifest and the DSH GO panel /
 *                               composer entries (`lib/dsh-go.js`)
 *
 * The archive unpacks to a `package/` directory, the layout `plugin_manager`'s
 * `install_bundle` and `dsh plugin add <dir>` expect. `dist/SHA256SUMS.txt`
 * lists its hash in `sha256sum -c` format.
 *
 * The DSH GO surface costs nothing on a host that has no `dshGo` service:
 * `index.js` only imports `lib/dsh-go.js` after that service exists, so Web and
 * desktop hosts never load it.
 *
 * No dependencies: plain Node plus the system `tar`.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')
const stage = join(dist, '.stage')

/** Everything the package ships. */
const FILES = ['index.js', 'client.js', 'cordis.patch.yml', 'lib', 'locale', 'icon.svg', 'README.md', 'README.zh.md', 'LICENSE']

/**
 * Recursive copy without relying on `fs.cp`'s experimental status.
 *
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 */
async function copy(from, to) {
  const info = await stat(from)
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true })
    for (const entry of await readdir(from)) await copy(join(from, entry), join(to, entry))
    return
  }
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
}

/**
 * Stage and archive the package.
 *
 * @param {string} name - Artifact base name.
 * @returns {Promise<string>} Path of the tarball.
 */
async function build(name) {
  const workdir = join(stage, name)
  const pkgDir = join(workdir, 'package')
  await rm(workdir, { recursive: true, force: true })
  await mkdir(pkgDir, { recursive: true })
  for (const entry of FILES) await copy(join(root, entry), join(pkgDir, entry))

  // Shipped verbatim: one manifest describes every host.
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  await writeFile(join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const tarball = join(dist, `${name}.tgz`)
  await rm(tarball, { force: true })
  execFileSync('tar', ['-czf', tarball, '-C', workdir, 'package'], { stdio: 'inherit' })
  return tarball
}

/** @param {string} file - Path. @returns {Promise<string>} SHA-256 hex. */
async function sha256(file) {
  const hash = createHash('sha256')
  hash.update(await readFile(file))
  return hash.digest('hex')
}

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await mkdir(dist, { recursive: true })

// A tarball left over from an older version would otherwise be picked up by the
// release upload's `dist/dsh-github-*.tgz` glob.
for (const entry of await readdir(dist)) {
  if (entry.endsWith('.tgz')) await rm(join(dist, entry), { force: true })
}

const tarball = await build(`dsh-github-${version}`)
const name = tarball.slice(dist.length + 1)
await writeFile(join(dist, 'SHA256SUMS.txt'), `${await sha256(tarball)}  ${name}\n`)
await rm(stage, { recursive: true, force: true })

console.log(`built ${name}:`)
console.log(`  ${tarball.slice(root.length + 1)}`)
console.log(`  dist/SHA256SUMS.txt`)
