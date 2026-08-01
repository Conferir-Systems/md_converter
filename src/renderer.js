const out = document.getElementById('out')
const drop = document.getElementById('drop')
const pick = document.getElementById('pick')

function log (line) {
  out.textContent += line + '\n'
}

window.markitdown.onProgress(update => {
  log(`progress: ${JSON.stringify(update)}`)
})

pick.addEventListener('click', async () => {
  const files = await window.markitdown.selectFiles()
  log(`picked: ${JSON.stringify(files)}`)
})

drop.addEventListener('dragover', event => {
  event.preventDefault()
})

drop.addEventListener('drop', event => {
  event.preventDefault()
  for (const file of event.dataTransfer.files) {
    log(`dropped: ${window.markitdown.pathForDroppedFile(file)}`)
  }
})

async function selfTest () {
  const result = await window.markitdown.convertAll([
    { input: 'C:\\fake\\relatório.pdf', output: null },
    { input: 'C:\\fake\\planilha.xlsx', output: null }
  ])
  log(`convertAll result: ${JSON.stringify(result)}`)
}

selfTest()
