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
      platform: extra.platform,
      execFile: extra.execFile ?? ((file, args, options, callback) => {
        calls.initdb.push({ file, args, pwFileExistedDuring: fs.existsSync(args[args.indexOf('--pwfile') + 1]) });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
        callback(null, '', '');
      }),
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

// ---- Windows --------------------------------------------------------------------------------------------------------
// These cannot run the real programs, only check what would be asked of them: the rest is a matter of the bundle.

test('postgres on Windows: the programs are the .exe files of the bundle, with their window hidden', async () => {
  const { server, calls } = setup({ platform: 'win32' });

  await server.start();

  assert.equal(calls.initdb[0].file, '/bundle/postgres/bin/initdb.exe');
  assert.equal(calls.spawn[0].file, '/bundle/postgres/bin/postgres.exe');
  assert.equal(calls.spawn[0].options.windowsHide, true);
});

test('postgres on Windows: Unicode-aware lower-casing comes from ICU, since "C" would fold ASCII only and Windows has no en_US.UTF-8', async () => {
  const { server, calls } = setup({ platform: 'win32' });

  await server.start();

  const args = calls.initdb[0].args;
  assert.ok(args.includes('UTF8'));
  assert.ok(args.includes('--locale-provider=icu') && args.includes('--icu-locale=en-US'));
  assert.ok(!args.some((a) => a.includes('en_US.UTF-8')), 'that libc locale does not exist on Windows');
  assert.ok(!args.join(' ').includes('S3cret-pass'));
});

test('postgres on Windows: no unix socket setting (the parameter is unknown there and the server would refuse to start), still loopback only', async () => {
  const { server, calls } = setup({ platform: 'win32' });

  await server.start();

  const args = calls.spawn[0].args;
  assert.ok(!args.some((a) => a.startsWith('unix_socket_directories')));
  assert.ok(args.includes('listen_addresses=127.0.0.1'));
  assert.equal(args[args.indexOf('-p') + 1], '54329');
});

test('postgres on Windows: the environment does not force a unix locale; elsewhere it still does', () => {
  assert.equal(setup({ platform: 'win32' }).server.environment().LC_ALL, process.env.LC_ALL);
  assert.equal(setup({ platform: 'darwin' }).server.environment().LC_ALL, 'en_US.UTF-8');
});

test('postgres on Windows: stopping asks pg_ctl for a fast shutdown first, because a signal would end the server abruptly', async () => {
  const asked = [];
  const { server, children } = setup({
    platform: 'win32',
    execFile: (file, args, options, callback) => {
      asked.push({ file, args, options });
      if (args[0] === 'stop') {
        children[0].exit(0); // what pg_ctl -w achieves: it returns only after the server has left on its own
      } else {
        fs.mkdirSync(server.dataDir, { recursive: true });
        fs.writeFileSync(path.join(server.dataDir, 'PG_VERSION'), '16\n');
      }
      callback(null, '', '');
    },
  });
  await server.start();

  const clean = await server.stop();

  const stop = asked.find((a) => a.args[0] === 'stop');
  assert.equal(stop.file, '/bundle/postgres/bin/pg_ctl.exe');
  assert.deepEqual(stop.args.slice(0, 4), ['stop', '-D', server.dataDir, '-m']);
  assert.equal(stop.args[stop.args.indexOf('-m') + 1], 'fast');
  assert.ok(stop.args.includes('-w'), 'it waits for the shutdown to finish');
  assert.equal(stop.options.windowsHide, true);
  assert.deepEqual(children[0].signals, [], 'no signal was needed');
  assert.equal(clean, true);
});

test('postgres on Windows: if pg_ctl fails, the server is ended after all rather than left running', async () => {
  const { server, children } = setup({
    platform: 'win32',
    execFile: (file, args, options, callback) => {
      if (args[0] === 'stop') {
        return callback(new Error('pg_ctl: could not send stop signal'), '', '');
      }
      fs.mkdirSync(server.dataDir, { recursive: true });
      fs.writeFileSync(path.join(server.dataDir, 'PG_VERSION'), '16\n');
      return callback(null, '', '');
    },
  });
  await server.start();

  await server.stop();

  assert.ok(children[0].signals.length > 0, 'it fell back to the signals');
});

test('postgres on Windows: a server left over from a crash is asked to stop through pg_ctl too', async () => {
  const asked = [];
  let alive = true;
  const { server, dataDir } = setup({
    platform: 'win32',
    isAlive: () => alive,
    kill: () => assert.fail('a signal ends a Windows process abruptly: pg_ctl must be used'),
    execFile: (file, args, options, callback) => {
      asked.push(args[0]);
      if (args[0] === 'stop') {
        alive = false;
      } else {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
      }
      callback(null, '', '');
    },
  });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'PG_VERSION'), '16\n');
  fs.writeFileSync(path.join(dataDir, 'postmaster.pid'), '4242\n');

  await server.start();

  assert.ok(asked.includes('stop'));
});
