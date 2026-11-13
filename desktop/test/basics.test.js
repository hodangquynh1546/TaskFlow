'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolvePaths } = require('../src/paths');
const { freePort } = require('../src/ports');
const { loadOrCreateSecrets } = require('../src/secrets');
const { languageFor, translator, MESSAGES } = require('../src/strings');
const { buildMenuTemplate } = require('../src/menu');
const { stopChild, tail } = require('../src/process');
const { FakeChild, tempDir } = require('./helpers');

test('paths: packaged apps read the bundle from the app resources, development from ./resources', () => {
  const packaged = resolvePaths({ isPackaged: true, resourcesPath: '/App/Contents/Resources', devResources: '/src/resources', userData: '/u' });
  const dev = resolvePaths({ isPackaged: false, resourcesPath: '/ignored', devResources: '/src/resources', userData: '/u' });

  assert.equal(packaged.apiBinary, '/App/Contents/Resources/api/TaskManagement.API');
  assert.equal(packaged.pgBin('postgres'), '/App/Contents/Resources/postgres/bin/postgres');
  assert.equal(dev.webDir, '/src/resources/web');
});

test('paths: the person\'s data lives outside the bundle, so replacing the app never touches it', () => {
  const p = resolvePaths({ isPackaged: true, resourcesPath: '/App/Contents/Resources', devResources: '', userData: '/Users/a/Library/Application Support/TaskFlow Desktop' });

  for (const mine of [p.pgData, p.secretsFile, p.logsDir, p.backupsDir]) {
    assert.ok(mine.startsWith(p.userData), mine);
    assert.ok(!mine.startsWith(p.resources), mine);
  }
});

test('ports: free ports are real, on loopback, and different from one another', async () => {
  const [a, b] = [await freePort(), await freePort()];

  assert.ok(Number.isInteger(a) && a > 1023);
  assert.notEqual(a, b);
});

test('secrets: created once, then the same ones come back', () => {
  const file = path.join(tempDir(), 'secrets.bin');

  const first = loadOrCreateSecrets({ file, safeStorage: null });
  const second = loadOrCreateSecrets({ file, safeStorage: null });

  assert.deepEqual(second, first);
  assert.ok(first.jwtKey.length >= 48, 'the signing key must be long enough for the API (32+ bytes)');
  assert.match(first.dbPassword, /^[0-9a-f]{48}$/);
});

test('secrets: a different machine or run does not reuse them', () => {
  const a = loadOrCreateSecrets({ file: path.join(tempDir(), 's'), safeStorage: null });
  const b = loadOrCreateSecrets({ file: path.join(tempDir(), 's'), safeStorage: null });

  assert.notEqual(a.jwtKey, b.jwtKey);
  assert.notEqual(a.dbPassword, b.dbPassword);
});

test('secrets: with the Keychain they are stored encrypted, not as readable text', () => {
  const file = path.join(tempDir(), 'secrets.bin');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(text, 'utf8').reverse(),
    decryptString: (buffer) => Buffer.from(buffer).reverse().toString('utf8'),
  };

  const created = loadOrCreateSecrets({ file, safeStorage });

  assert.ok(!fs.readFileSync(file, 'utf8').includes(created.dbPassword));
  assert.deepEqual(loadOrCreateSecrets({ file, safeStorage }), created);
});

test('secrets: without the Keychain the file is private to the user', () => {
  const file = path.join(tempDir(), 'secrets.bin');

  loadOrCreateSecrets({ file, safeStorage: null });

  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('strings: Vietnamese for Vietnamese systems, English otherwise', () => {
  assert.equal(languageFor('vi'), 'vi');
  assert.equal(languageFor('vi-VN'), 'vi');
  assert.equal(languageFor('en-US'), 'en');
  assert.equal(languageFor('fr'), 'en');
  assert.equal(languageFor(undefined), 'en');
  assert.equal(translator('vi')('menuBackup'), 'Sao lưu dữ liệu…');
  assert.equal(translator('en')('menuBackup'), 'Back up data…');
});

test('strings: both languages have exactly the same messages', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.vi).sort());
  for (const [lang, table] of Object.entries(MESSAGES)) {
    for (const [key, text] of Object.entries(table)) {
      assert.ok(text.trim().length > 0, `${lang}.${key}`);
    }
  }
});

test('menu: backup and restore are in the File menu and developer tools only in development', () => {
  const click = () => {};
  const actions = { backup: click, restore: click, openData: click, openLogs: click };
  const t = translator('en');

  const labels = (template) => JSON.stringify(template);
  assert.ok(labels(buildMenuTemplate({ t, actions, isDev: false })).includes('Back up data…'));
  assert.ok(!labels(buildMenuTemplate({ t, actions, isDev: false })).includes('toggleDevTools'));
  assert.ok(labels(buildMenuTemplate({ t, actions, isDev: true })).includes('toggleDevTools'));
});

test('process: stopChild escalates until the child is gone and says whether it had to be killed', async () => {
  const polite = new FakeChild({ handles: ['SIGINT'] });
  const stubborn = new FakeChild({ handles: ['SIGKILL'] });
  const steps = [{ signal: 'SIGINT', waitMs: 30 }, { signal: 'SIGKILL', waitMs: 30 }];

  assert.equal(await stopChild(polite, steps), true);
  assert.deepEqual(polite.signals, ['SIGINT']);
  assert.equal(await stopChild(stubborn, steps), false);
  assert.deepEqual(stubborn.signals, ['SIGINT', 'SIGKILL']);
  assert.equal(await stopChild(null, steps), true);
});

test('process: tail keeps the last lines for error messages', () => {
  assert.equal(tail('a\nb\nc\n', 2), 'b\nc');
});
