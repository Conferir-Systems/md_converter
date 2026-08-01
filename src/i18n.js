const { app } = require('electron')

// Main-process strings only. The renderer has its own dictionary in
// renderer.js because a sandboxed preload cannot require local modules.
// Messages coming from bridge.py (markitdown's own exception text) stay in
// English — they are technical diagnostics, not UI copy.
const STRINGS = {
  en: {
    dialogSelectFiles: 'Select documents to convert',
    dialogSelectOutput: 'Select output folder',
    filterDocuments: 'Documents',
    filterAll: 'All files',
    errNotFolder: 'Not a folder',
    errInvalidPath: 'Invalid file path',
    errNotFound: 'File not found',
    errNotFile: 'Not a file (folders are not supported)',
    errUnsupported: ext => `Unsupported file type: .${ext}`,
    errBatchRunning: 'A conversion batch is already running',
    errNoFiles: 'No files to convert',
    errTimeout: 'Conversion timed out after 120 seconds',
    errSpawn: (cmd, msg) => `Could not start the converter (${cmd}): ${msg}. If an antivirus quarantined it, restore the file.`,
    errCrash: (code, cmd, tail) => `Converter crashed (exit ${code}, ${cmd}). ${tail || 'No diagnostic output.'}`,
    errUnreadable: (cmd, tail) => `Converter returned unreadable output (${cmd}). ${tail || ''}`.trim(),
    canceled: 'Canceled'
  },
  pt: {
    dialogSelectFiles: 'Selecione os documentos para converter',
    dialogSelectOutput: 'Selecione a pasta de saída',
    filterDocuments: 'Documentos',
    filterAll: 'Todos os arquivos',
    errNotFolder: 'Não é uma pasta',
    errInvalidPath: 'Caminho de arquivo inválido',
    errNotFound: 'Arquivo não encontrado',
    errNotFile: 'Não é um arquivo (pastas não são suportadas)',
    errUnsupported: ext => `Tipo de arquivo não suportado: .${ext}`,
    errBatchRunning: 'Uma conversão em lote já está em andamento',
    errNoFiles: 'Nenhum arquivo para converter',
    errTimeout: 'A conversão excedeu o tempo limite de 120 segundos',
    errSpawn: (cmd, msg) => `Não foi possível iniciar o conversor (${cmd}): ${msg}. Se um antivírus o colocou em quarentena, restaure o arquivo.`,
    errCrash: (code, cmd, tail) => `O conversor falhou (código ${code}, ${cmd}). ${tail || 'Sem diagnóstico disponível.'}`,
    errUnreadable: (cmd, tail) => `O conversor retornou uma resposta ilegível (${cmd}). ${tail || ''}`.trim(),
    canceled: 'Cancelada'
  }
}

// app.getLocale() reports Chromium's resolved locale, which can be en-US even
// when Windows' preferred display language is Portuguese — the preference
// list is the signal that matches what the user actually sees elsewhere.
function language () {
  if (process.env.MDGUI_LANG) return process.env.MDGUI_LANG === 'pt' ? 'pt' : 'en'
  const preferred = app.getPreferredSystemLanguages()[0] || app.getLocale()
  return preferred.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

function t (key, ...args) {
  const entry = STRINGS[language()][key]
  return typeof entry === 'function' ? entry(...args) : entry
}

module.exports = { t, language }
