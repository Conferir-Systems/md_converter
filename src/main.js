const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'json', 'xml', 'html', 'htm', 'txt', 'zip']

let lastDialogDir = app.getPath('documents')

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

  if (process.env.MDGUI_SHOT) {
    win.once('show', () => setTimeout(async () => {
      try {
        const isolated = await win.webContents.executeJavaScript('typeof require')
        console.log(`smoke-test: typeof require in renderer = ${isolated}`)
        const out = await win.webContents.executeJavaScript("document.getElementById('out')?.textContent ?? ''")
        console.log(`smoke-test: #out = ${out}`)
      } catch (err) {
        console.error(`smoke-test isolation check failed: ${err}`)
      }
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const img = await win.webContents.capturePage()
          if (!img.isEmpty()) {
            require('node:fs').writeFileSync(process.env.MDGUI_SHOT, img.toPNG())
            console.log('smoke-test: screenshot written')
            break
          }
        } catch (err) {
          console.error(`smoke-test capture attempt ${attempt} failed: ${err}`)
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      app.quit()
    }, 1500))
  }

  return win
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

  // Fake pipeline: proves invoke round-trip + progress channel before the real sidecar exists
  ipcMain.handle('convert-all', async (event, jobs) => {
    if (!Array.isArray(jobs)) return { ok: false, error: 'jobs must be an array' }
    for (const [i, job] of jobs.entries()) {
      event.sender.send('conversion-progress', { id: i, status: 'converting', input: job.input })
      await new Promise(resolve => setTimeout(resolve, 200))
      event.sender.send('conversion-progress', { id: i, status: 'done', output: String(job.input).replace(/\.[^.]+$/, '.md'), fake: true })
    }
    return { ok: true, fake: true, count: jobs.length }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
