const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codex', {
  hide: () => ipcRenderer.send('codex:hide'),
  quit: () => ipcRenderer.send('codex:quit'),
  getPinned: () => ipcRenderer.invoke('codex:getPinned'),
  setPinned: (v) => ipcRenderer.send('codex:setPinned', v),
  hotkey: () => ipcRenderer.invoke('codex:hotkey'),
  onShow: (fn) => ipcRenderer.on('codex:show', fn),
  onPinned: (fn) => ipcRenderer.on('codex:pinned', (_, v) => fn(v)),
});
