const STRINGS = {
  en: {
    subtitle: 'Convert documents to Markdown',
    convertAll: 'Convert all',
    converting: 'Converting…',
    addFiles: 'Add files…',
    outputSame: 'Output: same folder as each file',
    outputPrefix: 'Output: ',
    chooseFolder: 'Choose folder…',
    openOutput: 'Open output folder',
    clearList: 'Clear list',
    dropTitle: 'Drag & drop documents here',
    resetTitle: 'Back to per-file folders',
    rowOpen: 'Open folder',
    rowCancel: 'Cancel',
    rowRemove: 'Remove from list',
    unexpected: 'Unexpected error: ',
    status: { pending: 'pending', converting: 'converting', done: 'done', error: 'error', canceled: 'canceled' }
  },
  pt: {
    subtitle: 'Converta documentos para Markdown',
    convertAll: 'Converter tudo',
    converting: 'Convertendo…',
    addFiles: 'Adicionar arquivos…',
    outputSame: 'Saída: mesma pasta de cada arquivo',
    outputPrefix: 'Saída: ',
    chooseFolder: 'Escolher pasta…',
    openOutput: 'Abrir pasta de saída',
    clearList: 'Limpar lista',
    dropTitle: 'Arraste e solte documentos aqui',
    resetTitle: 'Voltar para a pasta de cada arquivo',
    rowOpen: 'Abrir pasta',
    rowCancel: 'Cancelar',
    rowRemove: 'Remover da lista',
    unexpected: 'Erro inesperado: ',
    status: { pending: 'pendente', converting: 'convertendo', done: 'concluído', error: 'erro', canceled: 'cancelada' }
  }
}

const L = STRINGS[window.markitdown.locale === 'pt' ? 'pt' : 'en']

const listEl = document.getElementById('list')
const dropEl = document.getElementById('drop')
const bannerEl = document.getElementById('banner')
const outdirLabel = document.getElementById('outdir-label')
const buttons = {
  pick: document.getElementById('pick'),
  chooseOutdir: document.getElementById('choose-outdir'),
  resetOutdir: document.getElementById('reset-outdir'),
  openOutdir: document.getElementById('open-outdir'),
  clear: document.getElementById('clear'),
  convert: document.getElementById('convert')
}

document.documentElement.lang = navigator.language
document.getElementById('subtitle').textContent = L.subtitle
document.getElementById('drop-title').textContent = L.dropTitle
buttons.pick.textContent = L.addFiles
buttons.chooseOutdir.textContent = L.chooseFolder
buttons.openOutdir.textContent = L.openOutput
buttons.clear.textContent = L.clearList
buttons.resetOutdir.title = L.resetTitle

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
  bannerEl.textContent = message
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
    chip.textContent = L.status[row.status]
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
    item.append(meta)

    const actions = document.createElement('div')
    actions.className = 'row-actions'
    if (row.status === 'done') {
      const open = document.createElement('button')
      open.textContent = L.rowOpen
      open.addEventListener('click', () => window.markitdown.openFolder(row.outputDir))
      actions.append(open)
    }
    if (state.running && ['pending', 'converting'].includes(row.status)) {
      const cancel = document.createElement('button')
      cancel.className = 'row-cancel'
      cancel.textContent = L.rowCancel
      cancel.addEventListener('click', () => window.markitdown.cancelJob(row.id))
      actions.append(cancel)
    }
    if (!state.running) {
      const remove = document.createElement('button')
      remove.textContent = '×'
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
