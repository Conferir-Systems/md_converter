const path = require('node:path')
const { app, BrowserWindow } = require('electron')

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
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, 'index.html'))

  if (process.env.MDGUI_SHOT) {
    win.once('show', () => setTimeout(async () => {
      try {
        const isolated = await win.webContents.executeJavaScript('typeof require')
        console.log(`smoke-test: typeof require in renderer = ${isolated}`)
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
    }, 500))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
