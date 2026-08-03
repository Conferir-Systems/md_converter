// Main-process strings only. The renderer keeps its own minimal dictionary in
// renderer.js because a sandboxed preload cannot require local modules.
// Messages coming from bridge.py (markitdown's own exception text) stay in
// English — they are technical diagnostics, not UI copy.
const STRINGS = {
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

function t (key, ...args) {
  const entry = STRINGS[key]
  return typeof entry === 'function' ? entry(...args) : entry
}

module.exports = { t }
