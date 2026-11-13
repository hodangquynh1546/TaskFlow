'use strict';

/** The native menu. `actions` are callbacks supplied by main.js so this file stays free of Electron imports. */
function buildMenuTemplate({ t, actions, isDev }) {
  return [
    {
      label: 'TaskFlow',
      submenu: [
        { role: 'about', label: t('menuAbout') },
        { type: 'separator' },
        { role: 'hide', label: t('menuHide') },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: t('menuQuit') },
      ],
    },
    {
      label: t('menuFile'),
      submenu: [
        { label: t('menuBackup'), accelerator: 'CmdOrCtrl+Shift+B', click: actions.backup },
        { label: t('menuRestore'), click: actions.restore },
        { type: 'separator' },
        { label: t('menuOpenData'), click: actions.openData },
        { label: t('menuOpenLogs'), click: actions.openLogs },
      ],
    },
    {
      label: t('menuEdit'),
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: t('menuView'),
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // Developer tools only when running from source; the packaged app has no way to inspect itself.
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: t('menuWindow'),
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
}

module.exports = { buildMenuTemplate };
