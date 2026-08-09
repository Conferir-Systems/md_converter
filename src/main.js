const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron')
const { killAll } = require('./bridge')
const { SUPPORTED_EXTENSIONS, planJobs, runQueue, requestCancel, resetCancels } = require('./queue')
const { setupDevHooks, runSelfTest } = require('./devhooks')
const { t } = require('./i18n')

let lastDialogDir = app.getPath('documents')
let batchActive = false

function createWindow () {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0c0e12' : '#e8eaee',
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

function registerIpcHandlers () {
  ipcMain.handle('select-files', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: t('dialogSelectFiles'),
      defaultPath: lastDialogDir,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: t('filterDocuments'), extensions: SUPPORTED_EXTENSIONS },
        { name: t('filterAll'), extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    lastDialogDir = path.dirname(result.filePaths[0])
    return result.filePaths
  })

  ipcMain.handle('select-output-dir', async event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, {
      title: t('dialogSelectOutput'),
      defaultPath: lastDialogDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    lastDialogDir = result.filePaths[0]
    return result.filePaths[0]
  })

  ipcMain.handle('open-folder', async (event, dir) => {
    if (typeof dir !== 'string' || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, error: t('errNotFolder') }
    }
    const result = await shell.openPath(dir)
    return result === '' ? { ok: true } : { ok: false, error: result }
  })

  ipcMain.handle('convert-all', async (event, jobs) => {
    if (batchActive) return { ok: false, error: t('errBatchRunning') }
    if (!Array.isArray(jobs) || jobs.length === 0) return { ok: false, error: t('errNoFiles') }
    batchActive = true
    resetCancels()
    try {
      const planned = planJobs(jobs)
      const results = await runQueue(planned, update => event.sender.send('conversion-progress', update))
      return { ok: true, results }
    } finally {
      batchActive = false
      resetCancels()
    }
  })

  ipcMain.handle('cancel-job', (event, id) => {
    requestCancel(id)
    return { ok: true }
  })
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
