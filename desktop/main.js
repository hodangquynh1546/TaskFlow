'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, dialog, shell, safeStorage, session } = require('electron');
const { resolvePaths } = require('./src/paths');
const { TaskFlowRuntime } = require('./src/lifecycle');
const { buildMenuTemplate } = require('./src/menu');
const { translator } = require('./src/strings');

// Own folder, so it never mixes with the Docker setup's data (~/Library/Application Support/TaskFlow).
const userData = process.env.TASKFLOW_USER_DATA || path.join(app.getPath('appData'), 'TaskFlow Desktop');
app.setName('TaskFlow');
app.setPath('userData', userData);

const t = translator(app.getLocale());
const paths = resolvePaths({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  devResources: path.join(__dirname, 'resources'),
  userData,
});
const hidden = process.env.TASKFLOW_HIDDEN === '1';
const runtime = new TaskFlowRuntime({ paths, safeStorage });
let win = null;
let quitting = false;

const loadingFile = path.join(__dirname, 'loading.html');
const showBusy = (message) => win?.loadFile(loadingFile, { query: { m: message } });

function readState() {
  try {
    return JSON.parse(fs.readFileSync(paths.stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) {
    return;
  }
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.writeFileSync(paths.stateFile, JSON.stringify({ bounds: win.getBounds() }));
}

function createWindow() {
  const { bounds } = readState();
  win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 860,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 380,
    minHeight: 560,
    show: !hidden,
    title: 'TaskFlow',
    backgroundColor: '#f1f6ff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.on('close', saveBounds);
  win.on('closed', () => {
    win = null;
  });

  // The window only ever shows our own page. Links to other sites open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const ours = runtime.url && new URL(url).origin === new URL(runtime.url).origin;
    if (!ours && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
  showBusy(t('starting'));
}

async function startRuntime() {
  try {
    const url = await runtime.start();
    await win?.loadURL(url);
  } catch (error) {
    console.error(error);
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: t('startFailedTitle'),
      message: t('startFailedTitle'),
      detail: `${t('startFailedBody')}\n\n${String(error.message).slice(0, 600)}`,
      buttons: [t('openLogs'), t('quit')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      shell.openPath(paths.logsDir);
    }
    app.quit();
  }
}

async function withBusyScreen(message, work) {
  showBusy(message);
  try {
    await work();
  } finally {
    if (runtime.url) {
      await win?.loadURL(runtime.url);
    }
  }
}

const actions = {
  async backup() {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), path.basename(runtime.defaultBackupFile())),
      filters: [{ name: t('backupFilter'), extensions: ['gz'] }],
    });
    if (canceled || !filePath) {
      return;
    }
    try {
      await withBusyScreen(t('backingUp'), () => runtime.backup(filePath));
      dialog.showMessageBox(win, { type: 'info', message: t('backupDone'), detail: `${t('backupSaved')}\n${filePath}` });
    } catch (error) {
      dialog.showErrorBox(t('failed'), String(error.message));
    }
  },
  async restore() {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters: [{ name: t('backupFilter'), extensions: ['gz'] }], properties: ['openFile'] });
    if (canceled || filePaths.length === 0) {
      return;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: t('restoreConfirmTitle'),
      detail: t('restoreConfirmBody'),
      buttons: [t('cancel'), t('restoreConfirmOk')],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) {
      return;
    }
    try {
      await withBusyScreen(t('restoring'), () => runtime.restore(filePaths[0]));
      dialog.showMessageBox(win, { type: 'info', message: t('restoreDone') });
    } catch (error) {
      dialog.showErrorBox(t('failed'), String(error.message));
    }
  },
  openData: () => shell.openPath(paths.userData),
  openLogs: () => shell.openPath(paths.logsDir),
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // Nothing in this app needs the camera, microphone, location or notifications from the page.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ t, actions, isDev: !app.isPackaged })));
    createWindow();
    startRuntime();
  });

  // Closing the window ends the app, and with it the database and API (no leftover background processes).
  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', (event) => {
    if (quitting) {
      return;
    }
    event.preventDefault();
    quitting = true;
    runtime.stop().catch(console.error).finally(() => app.exit(0));
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => app.quit());
  }
  // If we are going down hard, take the children with us rather than leaving them running.
  process.on('exit', () => runtime.killNow());
}
