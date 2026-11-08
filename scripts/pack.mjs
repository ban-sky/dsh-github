#!/usr/bin/env node
/**
 * Build the two release artifacts from this single source tree.
 *
 *   dsh-github-<version>.tgz           Web UI only: no native surface and no
 *                                      `dshGo` manifest, for DSH Web / desktop
 *   dsh-github-<version>-dsh-go.tgz    Web UI + the DSH GO panel and composer
 *                                      entries, for the phone app
 *
 * Both unpack to a `package/` directory, the layout `plugin_manager`'s
 * `install_bundle` and `dsh plugin add <dir>` expect. `dist/SHA256SUMS.txt`
 * lists both hashes in `sha256sum -c` format.
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

/** Everything both artifacts ship. */
const SHARED = ['index.js', 'client.js', 'cordis.patch.yml', 'lib', 'locale', 'icon.svg', 'README.md', 'README.zh.md', 'LICENSE']

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
 * Stage and archive one variant.
 *
 * @param {string} name - Artifact base name.
 * @param {{native: boolean}} options - `native` keeps the DSH GO surface.
 * @returns {Promise<string>} Path of the tarball.
 */
async function build(name, { native }) {
  const workdir = join(stage, name)
  const pkgDir = join(workdir, 'package')
  await rm(workdir, { recursive: true, force: true })
  await mkdir(pkgDir, { recursive: true })
  for (const entry of SHARED) await copy(join(root, entry), join(pkgDir, entry))

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (!native) {
    delete manifest.dshGo
    await rm(join(pkgDir, 'lib', 'dsh-go.js'), { force: true })
  }
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

const web = await build(`dsh-github-${version}`, { native: false })
const dshGo = await build(`dsh-github-${version}-dsh-go`, { native: true })

const lines = []
for (const file of [web, dshGo]) lines.push(`${await sha256(file)}  ${file.slice(dist.length + 1)}`)
await writeFile(join(dist, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
await rm(stage, { recursive: true, force: true })

console.log(`built dsh-github ${version}:`)
for (const file of [web, dshGo]) console.log(`  ${file.slice(root.length + 1)}`)
console.log(`  dist/SHA256SUMS.txt`)
