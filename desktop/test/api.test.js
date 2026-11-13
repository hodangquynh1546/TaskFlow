'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ApiServer } = require('../src/api');
const { FakeChild, tempDir } = require('./helpers');

function setup({ healthCheck, onSpawn } = {}) {
  const spawned = [];
  const api = new ApiServer({
    binary: '/bundle/api/TaskManagement.API',
    webDir: '/bundle/web',
    port: 41234,
    logFile: path.join(tempDir(), 'logs', 'api.log'),
    connectionString: 'Host=127.0.0.1;Port=1;Password=db-pass',
    secrets: { jwtKey: 'jwt-signing-key-value-that-is-long-enough-0123456789' },
    deps: {
      stopSteps: [{ signal: 'SIGTERM', waitMs: 30 }, { signal: 'SIGKILL', waitMs: 30 }],
      healthCheck: healthCheck ?? (async () => true),
      spawn: (file, args, options) => {
        const child = new FakeChild();
        spawned.push({ file, args, options, child });
        onSpawn?.(child, spawned.length);
        return child;
      },
    },
  });
  return { api, spawned };
}

test('api: configuration goes in environment variables, never on the command line', async () => {
  const { api, spawned } = setup();

  await api.start();

  const { args, options } = spawned[0];
  assert.deepEqual(args, []);
  const env = options.env;
  assert.equal(env.ASPNETCORE_URLS, 'http://127.0.0.1:41234');
  assert.equal(env.ASPNETCORE_ENVIRONMENT, 'Production');
  assert.equal(env.Hosting__ServeSpa, 'true');
  assert.equal(env.Hosting__SpaRoot, '/bundle/web');
  assert.match(env.ConnectionStrings__DefaultConnection, /Password=db-pass/);
  assert.ok(env.Jwt__Key.length >= 32);
});

test('api: it only ever listens on loopback', () => {
  const { api } = setup();

  assert.match(api.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('api: migrate runs the "migrate" command and succeeds on exit code 0', async () => {
  const { api, spawned } = setup({ onSpawn: (child) => setImmediate(() => child.exit(0)) });

  await api.migrate();

  assert.deepEqual(spawned[0].args, ['migrate']);
});

test('api: a failed migration stops the start and shows the end of its output', async () => {
  const { api } = setup({
    onSpawn: (child) =>
      setImmediate(() => {
        child.stderr.emit('data', Buffer.from('fail: could not connect to the database\n'));
        child.exit(1);
      }),
  });

  await assert.rejects(api.migrate(), (error) => /exit 1/.test(error.message) && /could not connect/.test(error.message));
});

test('api: start waits until the health check passes', async () => {
  let calls = 0;
  const { api } = setup({ healthCheck: async () => ++calls >= 3 });

  await api.start();

  assert.equal(calls, 3);
});

test('api: a process that dies while starting is reported with its output, not waited on', async () => {
  const { api } = setup({
    healthCheck: async () => false,
    onSpawn: (child) =>
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('Jwt:Key must be at least 32 bytes\n'));
        child.exit(134);
      }),
  });

  await assert.rejects(api.start(), (error) => /exited/.test(error.message) && /Jwt:Key/.test(error.message));
});

test('api: stop asks politely first', async () => {
  const { api, spawned } = setup();
  await api.start();

  assert.equal(await api.stop(), true);

  assert.deepEqual(spawned[0].child.signals, ['SIGTERM']);
});

function staleSetup({ pidText, alive, command }) {
  const dir = tempDir();
  const pidFile = path.join(dir, 'api.pid');
  if (pidText !== undefined) {
    require('node:fs').writeFileSync(pidFile, pidText);
  }
  const killed = [];
  let running = alive;
  const api = new ApiServer({
    binary: '/bundle/api/TaskManagement.API',
    webDir: '/bundle/web',
    port: 41234,
    logFile: path.join(dir, 'logs', 'api.log'),
    pidFile,
    connectionString: 'x',
    secrets: { jwtKey: 'k'.repeat(40) },
    deps: {
      healthCheck: async () => true,
      spawn: () => Object.assign(new FakeChild(), { pid: 777 }),
      isAlive: () => running,
      commandOf: () => command,
      killPid: (pid, signal) => {
        killed.push([pid, signal]);
        running = false;
      },
    },
  });
  return { api, killed, pidFile };
}

test('api: an API left running by a crashed app is stopped before a new one starts', async () => {
  const { api, killed } = staleSetup({ pidText: '4242', alive: true, command: '/bundle/api/TaskManagement.API' });

  await api.start();

  assert.deepEqual(killed, [[4242, 'SIGTERM']]);
});

test('api: a recycled pid that is now some other program is left alone', async () => {
  const { api, killed } = staleSetup({ pidText: '4242', alive: true, command: '/usr/bin/some-other-program' });

  await api.start();

  assert.deepEqual(killed, []);
});

test('api: a pid file for a process that is gone, or garbage, is ignored', async () => {
  for (const pidText of ['4242', 'not-a-number', '1']) {
    const { api, killed } = staleSetup({ pidText, alive: false, command: '/bundle/api/TaskManagement.API' });
    await api.start();
    assert.deepEqual(killed, [], pidText);
  }
});

test('api: its pid is recorded while running', async () => {
  const { api, pidFile } = staleSetup({ alive: false });

  await api.start();

  assert.equal(require('node:fs').readFileSync(pidFile, 'utf8'), '777');
});
