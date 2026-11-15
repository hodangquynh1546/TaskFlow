'use strict';

/** The menu-bar icon's menu. `actions` come from main.js so this file stays free of Electron imports. */
function buildTrayMenu({ t, actions }) {
  return [
    { label: t('trayOpen'), click: actions.show },
    { type: 'separator' },
    { label: t('trayQuit'), click: actions.quit },
  ];
}

module.exports = { buildTrayMenu };
