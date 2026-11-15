'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell, safeStorage, session } = require('electron');
const { resolvePaths } = require('./src/paths');
const { TaskFlowRuntime } = require('./src/lifecycle');
const { buildMenuTemplate } = require('./src/menu');
const { translator } = require('./src/strings');
const { allowPermission, shouldHideOnClose } = require('./src/policy');
const { buildTrayMenu } = require('./src/tray');

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
let tray = null;
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

function showWindow() {
  if (!win) {
    // The window can be destroyed without a close event (a page calling window.close()); the app stays up, so bring it back.
    if (runtime.url && !quitting) {
      createWindow();
      win.loadURL(runtime.url).then(() => win?.show());
    }
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip(t('trayTooltip'));
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenu({ t, actions: { show: showWindow, quit: () => app.quit() } })));
  tray.on('click', showWindow);
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
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),
      // Reminders are checked by the page, so it must keep its timers running while the window is tucked away.
      backgroundThrottling: false,
    },
  });
  win.on('close', (event) => {
    saveBounds();
    // Closing the window only hides it: the app keeps running in the menu bar so it can still remind you.
    if (shouldHideOnClose({ quitting })) {
      event.preventDefault();
      win.hide();
    }
  });
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
  app.on('second-instance', showWindow);
  // Clicking the Dock icon brings the window back too.
  app.on('activate', showWindow);

  app.whenReady().then(() => {
    // Nothing in this app needs the camera, microphone, location or notifications from the page.
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => callback(allowPermission(permission, details.requestingUrl, runtime.url)));
    session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => allowPermission(permission, requestingOrigin, runtime.url));
    // A reminder that was clicked asks for the window back; only our own page may ask.
    ipcMain.on('show-window', (event) => {
      if (runtime.url && new URL(event.senderFrame.url).origin === new URL(runtime.url).origin) {
        showWindow();
      }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ t, actions, isDev: !app.isPackaged })));
    createWindow();
    if (!hidden) {
      createTray();
    }
    startRuntime();
  });

  // No window-all-closed handler: closing the window hides it and the app keeps running in the menu bar to
  // deliver reminders. It ends only through Quit (Cmd+Q or the menu-bar item), which stops the database and API.
  app.on('window-all-closed', () => {});

  app.on('before-quit', (event) => {
    if (quitting) {
      return;
    }
    event.preventDefault();
    quitting = true;
    // exit() skips Chromium's own shutdown, so what the page saved (the sign-in) is written to disk by hand first.
    runtime
      .stop()
      .catch(console.error)
      .then(() => session.defaultSession.flushStorageData())
      .then(() => session.defaultSession.cookies.flushStore())
      .catch(console.error)
      .finally(() => app.exit(0));
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => app.quit());
  }
  // If we are going down hard, take the children with us rather than leaving them running.
  process.on('exit', () => runtime.killNow());
}
