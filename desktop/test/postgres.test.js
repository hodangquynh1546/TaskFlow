'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PostgresServer } = require('../src/postgres');
const { FakeChild, tempDir, FAST_STOP } = require('./helpers');

function setup(extra = {}) {
  const root = tempDir();
  const dataDir = path.join(root, 'pgdata');
  const calls = { initdb: [], spawn: [] };
  const children = [];
  const server = new PostgresServer({
    binDir: '/bundle/postgres/bin',
    dataDir,
    logFile: path.join(root, 'logs', 'postgres.log'),
    user: 'taskflow',
    password: 'S3cret-pass',
    port: 54329,
    deps: {
      stopSteps: FAST_STOP,
      execFile: (file, args, options, callback) => {
        calls.initdb.push({ file, args, pwFileExistedDuring: fs.existsSync(args[args.indexOf('--pwfile') + 1]) });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
        callback(null, '', '');
      },
      spawn: (file, args, options) => {
        const child = new FakeChild(extra.child);
        calls.spawn.push({ file, args, options });
        children.push(child);
        setImmediate(() => child.stderr.emit('data', Buffer.from(extra.output ?? 'LOG:  database system is ready to accept connections\n')));
        return child;
      },
      isAlive: extra.isAlive,
      kill: extra.kill,
    },
  });
  return { server, root, dataDir, calls, children };
}

test('postgres: a first start creates the database folder with initdb, handing over the password in a temporary file', async () => {
  const { server, calls, root } = setup();

  await server.start();

  assert.equal(calls.initdb.length, 1);
  const { file, args, pwFileExistedDuring } = calls.initdb[0];
  assert.equal(file, '/bundle/postgres/bin/initdb');
  assert.ok(pwFileExistedDuring);
  assert.ok(!args.join(' ').includes('S3cret-pass'), 'the password must never be on a command line');
  assert.ok(args.includes('UTF8') && args.includes('--locale=en_US.UTF-8'), 'Vietnamese text needs a UTF-8 locale for case-insensitive search');
  assert.deepEqual(fs.readdirSync(root).filter((f) => f.startsWith('.pw-')), [], 'the password file is removed afterwards');
});

test('postgres: later starts reuse the data and do not initialise again', async () => {
  const { server, calls } = setup();
  await server.start();
  await server.stop();

  await server.start();

  assert.equal(calls.initdb.length, 1);
});

test('postgres: the server listens only on loopback, on its own port, with no unix socket', async () => {
  const { server, calls } = setup();

  await server.start();

  const { file, args } = calls.spawn[0];
  assert.equal(file, '/bundle/postgres/bin/postgres');
  assert.ok(args.includes('listen_addresses=127.0.0.1'));
  assert.ok(args.includes('unix_socket_directories='));
  assert.equal(args[args.indexOf('-p') + 1], '54329');
  assert.ok(!args.join(' ').includes('S3cret-pass'));
});

test('postgres: start waits for the "ready" line and writes the server log to a file', async () => {
  const { server, root } = setup();

  await server.start();

  // File writes are asynchronous: wait (briefly) for the line to reach the disk.
  const logFile = path.join(root, 'logs', 'postgres.log');
  for (let i = 0; i < 50 && !(fs.existsSync(logFile) && fs.readFileSync(logFile, 'utf8').length > 0); i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(fs.readFileSync(logFile, 'utf8'), /ready to accept connections/);
});

test('postgres: a server that dies while starting is reported, not waited for', async () => {
  const { server } = setup({ output: 'FATAL: could not bind\n' });
  const original = server.spawn;
  server.spawn = (...args) => {
    const child = original(...args);
    setImmediate(() => child.exit(1));
    return child;
  };

  await assert.rejects(server.start(), /exited during start/);
});

test('postgres: stop uses the gentle "fast shutdown" signal first', async () => {
  const { server, children } = setup();
  await server.start();

  assert.equal(await server.stop(), true);

  assert.deepEqual(children[0].signals, ['SIGINT']);
});

test('postgres: a server that ignores the gentle signal is escalated, and the result says it was not clean', async () => {
  const { server, children } = setup({ child: { handles: ['SIGKILL'] } });
  await server.start();

  assert.equal(await server.stop(), false);

  assert.deepEqual(children[0].signals, ['SIGINT', 'SIGTERM', 'SIGKILL']);
});

test('postgres: a leftover server from a crashed run is asked to stop before a new one starts', async () => {
  let alive = true;
  const killed = [];
  const { server, dataDir } = setup({
    isAlive: () => alive,
    kill: (pid, signal) => {
      killed.push([pid, signal]);
      alive = false;
    },
  });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
  fs.writeFileSync(path.join(dataDir, 'postmaster.pid'), '4242\n/some/dir\n');

  await server.start();

  assert.deepEqual(killed, [[4242, 'SIGINT']]);
});

test('postgres: a stale lock file for a process that is gone is simply ignored', async () => {
  const { server, dataDir } = setup({ isAlive: () => false, kill: () => assert.fail('must not signal a dead process') });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
  fs.writeFileSync(path.join(dataDir, 'postmaster.pid'), '4242\n');

  await server.start();
});

test('postgres: the connection string points at loopback and the right port and user', () => {
  const { server } = setup();

  const text = server.connectionString();

  assert.match(text, /Host=127\.0\.0\.1;Port=54329;Database=postgres;Username=taskflow;/);
});
