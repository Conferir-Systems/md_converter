const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { app } = require('electron')
const { t } = require('./i18n')

const BRIDGE_TIMEOUT_MS = 120000
const STDERR_TAIL_LINES = 10

const activeChildren = new Set()

let resolved = null

function locateBridge () {
  const exe = 'markitdown-bridge.exe'
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, 'py', 'markitdown-bridge', exe),
      args: [],
      kind: 'packaged exe'
    }
  }
  const frozen = path.join(__dirname, '..', 'resources', 'py', 'markitdown-bridge', exe)
  if (fs.existsSync(frozen)) {
    return { command: frozen, args: [], kind: 'frozen exe (dev)' }
  }
  return {
    command: path.join(__dirname, '..', 'python', '.venv', 'Scripts', 'python.exe'),
    args: [path.join(__dirname, '..', 'python', 'bridge.py')],
    kind: 'venv python (dev)'
  }
}

// Memoized: the answer cannot change while the app runs, and convertFile()
// asks once per file. Resolved lazily because app.isPackaged needs the app.
function resolveBridge () {
  if (resolved === null) resolved = locateBridge()
  return resolved
}

function tail (text, lines) {
  return text.split(/\r?\n/).filter(Boolean).slice(-lines).join('\n')
}

// hooks.onSpawn receives a cancel() function that kills this conversion and
// resolves it with code CANCELED instead of BRIDGE_CRASH.
function convertFile (input, output, hooks = {}) {
  return new Promise(resolve => {
    const bridge = resolveBridge()
    const child = spawn(bridge.command, bridge.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
      shell: false
    })
    activeChildren.add(child)

    let settled = false
    let timedOut = false
    let canceled = false
    const stdoutChunks = []
    const stderrChunks = []

    const settle = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeChildren.delete(child)
      resolve(result)
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, BRIDGE_TIMEOUT_MS)

    if (hooks.onSpawn) {
      hooks.onSpawn(() => {
        canceled = true
        child.kill()
      })
    }

    child.on('error', err => {
      settle({ ok: false, error: t('errSpawn', bridge.command, err.message), code: 'BRIDGE_CRASH' })
    })

    // EPIPE lands here when the child dies before reading its stdin; the
    // exit/error handlers already produce the meaningful result.
    child.stdin.on('error', () => {})

    child.stdout.on('data', chunk => stdoutChunks.push(chunk))
    child.stderr.on('data', chunk => stderrChunks.push(chunk))

    child.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (canceled) {
        settle({ ok: false, error: t('canceled'), code: 'CANCELED' })
        return
      }
      if (timedOut) {
        settle({ ok: false, error: t('errTimeout'), code: 'TIMEOUT' })
        return
      }
      if (code !== 0) {
        settle({ ok: false, error: t('errCrash', code, bridge.command, tail(stderr, STDERR_TAIL_LINES)), code: 'BRIDGE_CRASH' })
        return
      }
      try {
        settle(JSON.parse(stdout))
      } catch {
        settle({ ok: false, error: t('errUnreadable', bridge.command, tail(stderr, STDERR_TAIL_LINES)), code: 'BRIDGE_CRASH' })
      }
    })

    child.stdin.write(Buffer.from(JSON.stringify({ input, output }), 'utf8'))
    child.stdin.end()
  })
}

function killAll () {
  for (const child of activeChildren) child.kill()
  activeChildren.clear()
}

module.exports = { convertFile, resolveBridge, killAll }
