const L = {
  convertAll: 'Converter tudo',
  converting: 'Convertendo…',
  outputSame: 'Saída: mesma pasta de cada arquivo',
  outputPrefix: 'Saída: ',
  rowOpen: 'Abrir pasta',
  rowCancel: 'Cancelar',
  rowRemove: 'Remover da lista',
  unexpected: 'Erro inesperado: ',
  status: { pending: 'pendente', converting: 'convertendo', done: 'concluído', error: 'erro', canceled: 'cancelada' }
}

const ICONS = {
  folderOpen: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2" /></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
}

function icon (name) {
  const holder = document.createElement('span')
  holder.innerHTML = ICONS[name]
  return holder.firstElementChild
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
  convert: document.getElementById('convert')
}

const state = {
  rows: new Map(),
  outputDir: null,
  running: false,
  seq: 0
}

function fileName (fullPath) {
  return fullPath.split('\\').pop()
}

function parentDir (fullPath) {
  return fullPath.slice(0, fullPath.lastIndexOf('\\'))
}

function showBanner (message) {
  bannerMsgEl.textContent = message
  bannerEl.hidden = !message
}

function addFiles (paths) {
  let added = 0
  for (const fullPath of paths) {
    if (!fullPath) continue
    const duplicate = [...state.rows.values()].some(row => row.input === fullPath && row.status !== 'done')
    if (duplicate) continue
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

function render () {
  listEl.replaceChildren(...[...state.rows.values()].map(row => {
    const item = document.createElement('li')

    const chip = document.createElement('span')
    chip.className = `chip ${row.status}`
    if (row.status === 'converting') {
      const dot = document.createElement('span')
      dot.className = 'dot'
      chip.append(dot)
    }
    chip.append(document.createTextNode(L.status[row.status]))
    item.append(chip)

    const meta = document.createElement('div')
    meta.className = 'meta'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = fileName(row.input)
    name.title = row.input
    meta.append(name)
    const sub = document.createElement('span')
    if (row.status === 'error') {
      sub.className = 'sub error-msg'
      sub.textContent = row.message
    } else if (row.status === 'done') {
      sub.className = 'sub'
      sub.textContent = `→ ${fileName(row.output)}`
    } else {
      sub.className = 'sub'
      sub.textContent = parentDir(row.input)
    }
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
      const open = document.createElement('button')
      open.className = 'btn btn-outline btn-sm'
      open.append(icon('folderOpen'), document.createTextNode(L.rowOpen))
      open.addEventListener('click', () => window.markitdown.openFolder(row.outputDir))
      actions.append(open)
    }
    if (state.running && ['pending', 'converting'].includes(row.status)) {
      const cancel = document.createElement('button')
      cancel.className = 'row-cancel btn btn-outline btn-sm'
      cancel.textContent = L.rowCancel
      cancel.addEventListener('click', () => window.markitdown.cancelJob(row.id))
      actions.append(cancel)
    }
    if (!state.running) {
      const remove = document.createElement('button')
      remove.className = 'btn btn-icon btn-ghost'
      remove.append(icon('x'))
      remove.title = L.rowRemove
      remove.addEventListener('click', () => {
        state.rows.delete(row.id)
        render()
      })
      actions.append(remove)
    }
    item.append(actions)
    return item
  }))

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
  window.markitdown.openFolder(state.outputDir)
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

render()
