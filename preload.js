'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sb', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  saveConfig: (payload) => ipcRenderer.invoke('cfg:save', payload),

  createSession: (id, profile) => ipcRenderer.invoke('pty:create', { id, profile }),
  write: (id, data) => ipcRenderer.send('pty:input', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  close: (id) => ipcRenderer.send('pty:close', { id }),
  pause: (id) => ipcRenderer.invoke('pty:pause', { id }),
  resume: (id) => ipcRenderer.invoke('pty:resume', { id }),

  onOutput: (cb) => ipcRenderer.on('pty:data', (_e, m) => cb(m.id, m.data)),
  onExit: (cb) => ipcRenderer.on('pty:exit', (_e, m) => cb(m.id, m.code)),
  onState: (cb) => ipcRenderer.on('pty:state', (_e, m) => cb(m.id, m.state, m.cpu)),
  onTopChange: (cb) => ipcRenderer.on('win:top', (_e, v) => cb(v)),

  win: (action) => ipcRenderer.send('win:ctl', action)
});
