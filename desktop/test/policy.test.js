'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { allowPermission, shouldHideOnClose } = require('../src/policy');
const { buildTrayMenu } = require('../src/tray');
const { translator } = require('../src/strings');

const OWN = 'http://127.0.0.1:41234';

test('policy: notifications are allowed for the app\'s own page', () => {
  assert.equal(allowPermission('notifications', `${OWN}/dashboard`, OWN), true);
  assert.equal(allowPermission('notifications', OWN, OWN), true);
});

test('policy: everything else a page can ask for is refused', () => {
  for (const permission of ['media', 'geolocation', 'clipboard-read', 'midi', 'camera', 'microphone', 'openExternal', 'fullscreen', 'pointerLock']) {
    assert.equal(allowPermission(permission, OWN, OWN), false, permission);
  }
});

test('policy: notifications are refused for any other address, port or scheme', () => {
  for (const url of ['https://example.com/', 'http://127.0.0.1:41235/', 'http://localhost:41234/', 'https://127.0.0.1:41234/', 'file:///etc/passwd']) {
    assert.equal(allowPermission('notifications', url, OWN), false, url);
  }
});

test('policy: nothing is allowed before the app\'s own address is known, or for a missing or broken address', () => {
  assert.equal(allowPermission('notifications', OWN, null), false);
  assert.equal(allowPermission('notifications', undefined, OWN), false);
  assert.equal(allowPermission('notifications', 'not a url', OWN), false);
  assert.equal(allowPermission('notifications', OWN, 'not a url'), false);
});

test('policy: closing the window hides it, except when the app is really quitting', () => {
  assert.equal(shouldHideOnClose({ quitting: false }), true);
  assert.equal(shouldHideOnClose({ quitting: true }), false);
});

test('tray: the menu opens the window and quits, and is worded in the user\'s language', () => {
  const calls = [];
  const actions = { show: () => calls.push('show'), quit: () => calls.push('quit') };

  for (const [locale, open, quit] of [['vi-VN', 'Mở TaskFlow', 'Thoát TaskFlow'], ['en-US', 'Open TaskFlow', 'Quit TaskFlow']]) {
    const menu = buildTrayMenu({ t: translator(locale), actions });
    assert.deepEqual(menu.filter((m) => m.label).map((m) => m.label), [open, quit]);
  }

  const menu = buildTrayMenu({ t: translator('en'), actions });
  menu[0].click();
  menu[2].click();
  assert.deepEqual(calls, ['show', 'quit']);
});
