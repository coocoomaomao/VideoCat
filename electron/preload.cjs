const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('videocat', {
  chooseVideos: () => ipcRenderer.invoke('videocat:choose-videos'),
  chooseOutputDir: () => ipcRenderer.invoke('videocat:choose-output-dir'),
  suggestOutputDir: filePath => ipcRenderer.invoke('videocat:suggest-output-dir', filePath),
  inspectVideos: files => ipcRenderer.invoke('videocat:inspect-videos', files),
  compress: payload => ipcRenderer.invoke('videocat:compress', payload),
  revealFile: filePath => ipcRenderer.invoke('videocat:reveal-file', filePath),
  onProgress: callback => ipcRenderer.on('videocat:progress', (_event, data) => callback(data))
});
