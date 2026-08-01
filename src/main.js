const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { convertFile, resolveBridge, killAll } = require('./bridge')

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'json', 'xml', 'html', 'htm', 'txt', 'zip']
const CONCURRENCY = 2

let lastDialogDir = app.getPath('documents')
let batchActive = false

// Validates every job and reserves a unique output path for the whole batch
// up front — an exists-check at write time would race between the two workers.
function planJobs (jobs) {
  const claimed = new Set()
  return jobs.map(job => {
    const { id, input } = job
    if (typeof input !== 'string' || input.length === 0) {
      return { id, input, error: 'Invalid file path' }
    }
    let stat
    try {
      stat = fs.statSync(input)
    } catch {
      return { id, input, error: 'File not found' }
    }
    if (!stat.isFile()) {
      return { id, input, error: 'Not a file (folders are not supported)' }
    }
    const extension = path.extname(input).slice(1).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return { id, input, error: `Unsupported file type: .${extension || '(none)'}` }
    }
    const dir = typeof job.outputDir === 'string' && job.outputDir.length > 0 ? job.outputDir : path.dirname(input)
    const base = path.basename(input, path.extname(input))
    let candidate = path.join(dir, `${base}.md`)
    let suffix = 1
    while (claimed.has(candidate.toLowerCase()) || fs.existsSync(candidate)) {
      candidate = path.join(dir, `${base} (${suffix}).md`)
      suffix += 1
    }
    claimed.add(candidate.toLowerCase())
    return { id, input, output: candidate }
  })
}

async function runQueue (planned, report) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < planned.length) {
      const job = planned[next]
      next += 1
      if (job.error) {
        report({ id: job.id, status: 'error', error: job.error, code: 'INVALID_INPUT' })
        results.push({ id: job.id, ok: false, error: job.error, code: 'INVALID_INPUT' })
        continue
      }
      report({ id: job.id, status: 'converting' })
      const result = await convertFile(job.input, job.output)
      if (result.ok) {
        report({ id: job.id, status: 'done', output: result.output, outputDir: path.dirname(result.output), bytes: result.bytes })
      } else {
        report({ id: job.id, status: 'error', error: result.error, code: result.code })
      }
      results.push({ id: job.id, ...result })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, planned.length) }, worker))
  return results
}

function createWindow () {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'index.html'))

  setupDevHooks(win)
  return win
}

// Dev-only self-test hooks, inert unless the env vars are set:
//   MDGUI_SHOT=<png>     screenshot the window and quit
//   MDGUI_UITEST=<dir>   feed every file in <dir> through the real UI, then quit
async function captureShot (win) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const img = await win.webContents.capturePage()
      if (!img.isEmpty()) {
        fs.writeFileSync(process.env.MDGUI_SHOT, img.toPNG())
        console.log('smoke-test: screenshot written')
        return
      }
    } catch (err) {
      console.error(`smoke-test capture attempt ${attempt} failed: ${err}`)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

function setupDevHooks (win) {
  if (process.env.MDGUI_UITEST) {
    win.once('show', () => setTimeout(async () => {
      const dir = process.env.MDGUI_UITEST
      const files = fs.readdirSync(dir)
        .map(name => path.join(dir, name))
        .filter(file => fs.statSync(file).isFile())
      await win.webContents.executeJavaScript(`addFiles(${JSON.stringify(files)})`)
      await win.webContents.executeJavaScript("document.getElementById('convert').click()")
      const deadline = Date.now() + 300000
      while (Date.now() < deadline) {
        const busy = await win.webContents.executeJavaScript('state.running')
        if (!busy) break
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      const text = await win.webContents.executeJavaScript('document.body.innerText')
      console.log(`uitest: page text = ${JSON.stringify(text)}`)
      if (process.env.MDGUI_SHOT) await captureShot(win)
      app.exit(0)
    }, 1000))
    return
  }

  if (process.env.MDGUI_SHOT) {
    win.once('show', () => setTimeout(async () => {
      try {
        const isolated = await win.webContents.executeJavaScript('typeof require')
        console.log(`smoke-test: typeof require in renderer = ${isolated}`)
        const text = await win.webContents.executeJavaScript('document.body.innerText')
        console.log(`smoke-test: page text = ${JSON.stringify(text)}`)
      } catch (err) {
        console.error(`smoke-test isolation check failed: ${err}`)
      }
      await captureShot(win)
      app.quit()
    }, 1500))
  }
}

function registerIpcHandlers () {
  ipcMain.handle('select-files', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Select documents to convert',
      defaultPath: lastDialogDir,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: SUPPORTED_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    lastDialogDir = path.dirname(result.filePaths[0])
    return result.filePaths
  })

  ipcMain.handle('select-output-dir', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: 'Select output folder',
      defaultPath: lastDialogDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    lastDialogDir = result.filePaths[0]
    return result.filePaths[0]
  })

  ipcMain.handle('open-folder', async (event, dir) => {
    if (typeof dir !== 'string' || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, error: 'Not a folder' }
    }
    const result = await shell.openPath(dir)
    return result === '' ? { ok: true } : { ok: false, error: result }
  })

  ipcMain.handle('convert-all', async (event, jobs) => {
    if (batchActive) return { ok: false, error: 'A conversion batch is already running' }
    if (!Array.isArray(jobs) || jobs.length === 0) return { ok: false, error: 'No files to convert' }
    batchActive = true
    try {
      const planned = planJobs(jobs)
      const results = await runQueue(planned, update => event.sender.send('conversion-progress', update))
      return { ok: true, results }
    } finally {
      batchActive = false
    }
  })
}

async function runSelfTest () {
  const dir = process.env.MDGUI_SELFTEST
  const outputDir = process.env.MDGUI_SELFTEST_OUT || null
  console.log(`selftest: bridge = ${JSON.stringify(resolveBridge())}`)
  const files = fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).isFile())
  const jobs = files.map((input, id) => ({ id, input, outputDir }))
  const planned = planJobs(jobs)
  const results = await runQueue(planned, update => console.log(`progress ${JSON.stringify(update)}`))
  const okCount = results.filter(r => r.ok).length
  console.log(`selftest: ${okCount}/${results.length} succeeded`)
  for (const result of results) {
    console.log(`result ${JSON.stringify({ ...result, input: files[result.id] })}`)
  }
  app.exit(okCount === results.length ? 0 : 1)
}

app.whenReady().then(() => {
  if (process.env.MDGUI_SELFTEST) {
    runSelfTest()
    return
  }
  registerIpcHandlers()
  createWindow()
})

app.on('before-quit', () => {
  killAll()
})

app.on('window-all-closed', () => {
  app.quit()
})
