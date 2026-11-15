'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The one thing the page may ask of the shell: bring the window back when a reminder is clicked.
contextBridge.exposeInMainWorld('taskflowDesktop', {
  showWindow: () => ipcRenderer.send('show-window'),
});
