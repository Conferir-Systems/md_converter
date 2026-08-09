// Dev-only self-test harness, inert unless the env vars are set:
//   MDGUI_SHOT=<png>     screenshot the window and quit
//   MDGUI_UITEST=<dir>   feed every file in <dir> through the real UI, then quit
//   MDGUI_SELFTEST=<dir> convert every file in <dir> headlessly, then quit
// It drives the renderer through its own DOM (ids, .row-cancel, state.running),
// so renderer refactors have to keep those names — they are this file's API.
const path = require('node:path')
const fs = require('node:fs')
const { app } = require('electron')
const { resolveBridge } = require('./bridge')
const { planJobs, runQueue } = require('./queue')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const afterShow = (win, delayMs, run) => win.once('show', () => setTimeout(run, delayMs))

function filesIn (dir) {
  return fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).isFile())
}

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
    await sleep(500)
  }
}

function setupDevHooks (win) {
  if (process.env.MDGUI_UITEST) {
    afterShow(win, 1000, async () => {
      const files = filesIn(process.env.MDGUI_UITEST)
      await win.webContents.executeJavaScript(`addFiles(${JSON.stringify(files)})`)
      await win.webContents.executeJavaScript("document.getElementById('convert').click()")
      if (process.env.MDGUI_UITEST_CANCEL) {
        await sleep(400)
        await win.webContents.executeJavaScript("[...document.querySelectorAll('#list li .row-cancel')].at(-1)?.click()")
      }
      const deadline = Date.now() + 300000
      while (Date.now() < deadline) {
        const busy = await win.webContents.executeJavaScript('state.running')
        if (!busy) break
        await sleep(500)
      }
      const text = await win.webContents.executeJavaScript('document.body.innerText')
      console.log(`uitest: page text = ${JSON.stringify(text)}`)
      if (process.env.MDGUI_SHOT) await captureShot(win)
      app.exit(0)
    })
    return
  }

  if (process.env.MDGUI_SHOT) {
    afterShow(win, 1500, async () => {
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
    })
  }
}

async function runSelfTest () {
  const outputDir = process.env.MDGUI_SELFTEST_OUT || null
  console.log(`selftest: bridge = ${JSON.stringify(resolveBridge())}`)
  const files = filesIn(process.env.MDGUI_SELFTEST)
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

module.exports = { setupDevHooks, runSelfTest }
