const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('markitdown', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  convertAll: jobs => ipcRenderer.invoke('convert-all', jobs),
  cancelJob: id => ipcRenderer.invoke('cancel-job', id),
  openFolder: dir => ipcRenderer.invoke('open-folder', dir),
  pathForDroppedFile: file => webUtils.getPathForFile(file),
  onProgress: callback => {
    ipcRenderer.on('conversion-progress', (event, update) => callback(update))
  }
})
