const L = {
  convertAll: 'Converter tudo',
  converting: 'Convertendo…',
  outputSame: 'Saída: mesma pasta de cada arquivo',
  outputPrefix: 'Saída: ',
  rowOpen: 'Abrir pasta',
  rowCancel: 'Cancelar',
  rowRemove: 'Remover da lista',
  themeToDark: 'Mudar para o tema escuro',
  themeToLight: 'Mudar para o tema claro',
  unexpected: 'Erro inesperado: ',
  status: { pending: 'pendente', converting: 'convertendo', done: 'concluído', error: 'erro', canceled: 'cancelada' }
}

// Icons the renderer injects into elements it builds or owns. Icons that only
// ever sit on static markup stay inline in index.html.
const ICON_MARKUP = {
  folderOpen: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2" /></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>',
  sun: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></svg>',
  moon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" /></svg>'
}

// Parsed once at load; every icon() call hands out a clone.
const ICONS = new Map()
for (const [name, markup] of Object.entries(ICON_MARKUP)) {
  const holder = document.createElement('span')
  holder.innerHTML = markup
  ICONS.set(name, holder.firstElementChild)
}

function icon (name) {
  return ICONS.get(name).cloneNode(true)
}

function actionButton ({ className, content, title, onClick }) {
  const button = document.createElement('button')
  button.className = className
  button.append(...content)
  if (title) button.title = title
  button.addEventListener('click', onClick)
  return button
}

const listEl = document.getElementById('list')
const dropEl = document.getElementById('drop')
const bannerEl = document.getElementById('banner')
const bannerMsgEl = document.getElementById('banner-msg')
const outdirLabel = document.getElementById('outdir-label')
const buttons = {
  pick: document.getElementById('pick'),
  chooseOutdir: document.getElementById('choose-outdir'),
  resetOutdir: document.getElementById('reset-outdir'),
  openOutdir: document.getElementById('open-outdir'),
  clear: document.getElementById('clear'),
  convert: document.getElementById('convert'),
  themeToggle: document.getElementById('theme-toggle')
}
buttons.openOutdir.prepend(icon('folderOpen'))
buttons.resetOutdir.append(icon('x'))

const state = {
  rows: new Map(),
  outputDir: null,
  running: false,
  dark: false,
  seq: 0
}

// The renderer splits paths itself: a sandboxed preload cannot require
// node:path, and paths of dropped files never reach the main process.
function cutAt (fullPath) {
  return Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'))
}

function fileName (fullPath) {
  return fullPath.slice(cutAt(fullPath) + 1)
}

function parentDir (fullPath) {
  const cut = cutAt(fullPath)
  return cut < 0 ? '' : fullPath.slice(0, cut)
}

// The button advertises the theme a click will produce, not the current one, so
// icon and label are derived together and cannot drift apart.
function paintTheme ({ dark }) {
  state.dark = dark
  buttons.themeToggle.replaceChildren(icon(dark ? 'sun' : 'moon'))
  buttons.themeToggle.title = dark ? L.themeToLight : L.themeToDark
  buttons.themeToggle.ariaLabel = buttons.themeToggle.title
}

function showBanner (message) {
  bannerMsgEl.textContent = message
  bannerEl.hidden = !message
}

async function openFolder (dir) {
  const result = await window.markitdown.openFolder(dir)
  if (!result.ok) showBanner(result.error)
}

function addFiles (paths) {
  const queued = new Set()
  for (const row of state.rows.values()) {
    if (row.status !== 'done') queued.add(row.input)
  }
  let added = 0
  for (const fullPath of paths) {
    if (!fullPath || queued.has(fullPath)) continue
    queued.add(fullPath)
    const id = state.seq++
    state.rows.set(id, { id, input: fullPath, status: 'pending', message: '', output: null, outputDir: null })
    added += 1
  }
  if (added > 0) showBanner('')
  render()
}

function convertibleRows () {
  return [...state.rows.values()].filter(row => ['pending', 'error', 'canceled'].includes(row.status))
}

function renderRow (row) {
  const item = document.createElement('li')

  const chip = document.createElement('span')
  chip.className = `chip ${row.status}`
  if (row.status === 'converting') {
    const dot = document.createElement('span')
    dot.className = 'dot'
    chip.append(dot)
  }
  chip.append(L.status[row.status])
  item.append(chip)

  const meta = document.createElement('div')
  meta.className = 'meta'
  const name = document.createElement('span')
  name.className = 'name truncate'
  name.textContent = fileName(row.input)
  name.title = row.input
  meta.append(name)
  const sub = document.createElement('span')
  sub.className = row.status === 'error' ? 'sub error-msg' : 'sub truncate'
  sub.textContent = row.status === 'error' ? row.message
    : row.status === 'done' ? `→ ${fileName(row.output)}`
      : parentDir(row.input)
  meta.append(sub)
  if (row.status === 'converting') {
    const progress = document.createElement('div')
    progress.className = 'progress'
    const bar = document.createElement('div')
    bar.className = 'progress-bar'
    progress.append(bar)
    meta.append(progress)
  }
  item.append(meta)

  const actions = document.createElement('div')
  actions.className = 'row-actions'
  if (row.status === 'done') {
    actions.append(actionButton({
      className: 'btn btn-outline btn-sm',
      content: [icon('folderOpen'), L.rowOpen],
      onClick: () => openFolder(row.outputDir)
    }))
  }
  if (state.running && ['pending', 'converting'].includes(row.status)) {
    actions.append(actionButton({
      className: 'row-cancel btn btn-outline btn-sm',
      content: [L.rowCancel],
      onClick: () => window.markitdown.cancelJob(row.id)
    }))
  }
  if (!state.running) {
    actions.append(actionButton({
      className: 'btn btn-icon btn-ghost',
      content: [icon('x')],
      title: L.rowRemove,
      onClick: () => {
        state.rows.delete(row.id)
        render()
      }
    }))
  }
  item.append(actions)
  return item
}

function render () {
  listEl.replaceChildren(...[...state.rows.values()].map(renderRow))

  buttons.convert.disabled = state.running || convertibleRows().length === 0
  buttons.convert.textContent = state.running ? L.converting : L.convertAll
  buttons.clear.disabled = state.running || state.rows.size === 0
  buttons.pick.disabled = state.running
  buttons.chooseOutdir.disabled = state.running
  buttons.resetOutdir.hidden = state.outputDir === null
  buttons.resetOutdir.disabled = state.running
  buttons.openOutdir.disabled = state.outputDir === null
  outdirLabel.textContent = state.outputDir ? `${L.outputPrefix}${state.outputDir}` : L.outputSame
  outdirLabel.title = state.outputDir ?? ''
}

window.markitdown.onProgress(update => {
  const row = state.rows.get(update.id)
  if (!row) return
  row.status = update.status
  if (update.status === 'done') {
    row.output = update.output
    row.outputDir = update.outputDir
    row.message = ''
  } else if (update.status === 'error') {
    row.message = update.error
  }
  render()
})

buttons.pick.addEventListener('click', async () => {
  addFiles(await window.markitdown.selectFiles())
})

buttons.chooseOutdir.addEventListener('click', async () => {
  const dir = await window.markitdown.selectOutputDir()
  if (dir) {
    state.outputDir = dir
    render()
  }
})

buttons.resetOutdir.addEventListener('click', () => {
  state.outputDir = null
  render()
})

buttons.openOutdir.addEventListener('click', () => {
  openFolder(state.outputDir)
})

buttons.themeToggle.addEventListener('click', async () => {
  paintTheme(await window.markitdown.setTheme(state.dark ? 'light' : 'dark'))
})

buttons.clear.addEventListener('click', () => {
  state.rows.clear()
  showBanner('')
  render()
})

buttons.convert.addEventListener('click', async () => {
  const jobs = convertibleRows().map(row => ({ id: row.id, input: row.input, outputDir: state.outputDir }))
  if (jobs.length === 0) return
  state.running = true
  showBanner('')
  render()
  try {
    const result = await window.markitdown.convertAll(jobs)
    if (!result.ok) showBanner(result.error)
  } catch (err) {
    showBanner(`${L.unexpected}${err.message}`)
  } finally {
    state.running = false
    render()
  }
})

dropEl.addEventListener('dragover', event => {
  event.preventDefault()
  dropEl.classList.add('active')
})

dropEl.addEventListener('dragleave', () => {
  dropEl.classList.remove('active')
})

dropEl.addEventListener('drop', event => {
  event.preventDefault()
  dropEl.classList.remove('active')
  addFiles([...event.dataTransfer.files].map(file => window.markitdown.pathForDroppedFile(file)))
})

// Dropping anywhere else must not make Chromium navigate to the file
window.addEventListener('dragover', event => event.preventDefault())
window.addEventListener('drop', event => event.preventDefault())

// Until the first click the app still follows the OS, so keep the icon honest
// if the desktop theme changes underneath us.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
paintTheme({ dark: darkQuery.matches })
darkQuery.addEventListener('change', event => paintTheme({ dark: event.matches }))

render()
