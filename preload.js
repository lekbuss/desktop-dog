const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dogAPI', {
  setPosition: (x, y) => ipcRenderer.send('dog:set-position', x, y),
  getScreenSize: () => ipcRenderer.invoke('dog:get-screen-size'),
  setIgnoreMouse: (ignore, options) => ipcRenderer.send('dog:set-ignore-mouse', ignore, options),

  onTrayAction: (callback) => {
    ipcRenderer.removeAllListeners('dog:tray-action');
    ipcRenderer.on('dog:tray-action', (event, action) => callback(action));
  },

  getState: () => ipcRenderer.invoke('dog:get-state'),
  setState: (key, value) => ipcRenderer.send('dog:set-state', key, value),

  saveApiKey: (key) => ipcRenderer.send('dog:save-api-key', key),
  closeSetup: () => ipcRenderer.send('dog:close-setup'),
  openExternal: (url) => ipcRenderer.send('dog:open-external', url),

  showContextMenu: () => ipcRenderer.send('dog:show-context-menu'),
  resizeWindow: (width, height, deltaY) => ipcRenderer.send('dog:resize-window', width, height, deltaY),
  setWindowLayout: (layout) => ipcRenderer.send('dog:set-window-layout', layout),

  startChat: (payload) => ipcRenderer.send('dog:chat-start', payload),
  onChatEvent: (callback) => {
    ipcRenderer.removeAllListeners('dog:chat-event');
    ipcRenderer.on('dog:chat-event', (event, payload) => callback(payload));
  },

  quit: () => ipcRenderer.send('dog:quit')
});
