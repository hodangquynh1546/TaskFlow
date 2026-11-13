'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TaskFlowRuntime } = require('../src/lifecycle');
const { resolvePaths } = require('../src/paths');
const { tempDir } = require('./helpers');

function setup({ failAt, tar } = {}) {
  const userData = tempDir();
  const paths = resolvePaths({ isPackaged: false, devResources: '/res', resourcesPath: '/res', userData });
  const calls = [];
  const step = (name) => async () => {
    calls.push(name);
    if (failAt === name) {
      throw new Error(`${name} failed`);
    }
  };
  const runtime = new TaskFlowRuntime({
    paths,
    safeStorage: null,
    deps: {
      freePort: (() => { let p = 40000; return async () => p++; })(),
      makePg: () => ({ connectionString: () => 'cs', start: step('pg.start'), stop: step('pg.stop'), child: null }),
      makeApi: () => ({ url: 'http://127.0.0.1:40001', migrate: step('api.migrate'), start: step('api.start'), stop: step('api.stop'), child: null }),
      tar: tar ?? (async (args) => calls.push(`tar ${args[0]}`)),
    },
  });
  return { runtime, calls, paths };
}

test('lifecycle: starts the database, then migrates, then starts the API, and returns its address', async () => {
  const { runtime, calls } = setup();

  const url = await runtime.start();

  assert.deepEqual(calls, ['pg.start', 'api.migrate', 'api.start']);
  assert.equal(url, 'http://127.0.0.1:40001');
  assert.equal(runtime.running, true);
});

test('lifecycle: stops the API before the database', async () => {
  const { runtime, calls } = setup();
  await runtime.start();
  calls.length = 0;

  await runtime.stop();

  assert.deepEqual(calls, ['api.stop', 'pg.stop']);
  assert.equal(runtime.running, false);
});

test('lifecycle: when the migration fails everything already started is stopped and the error is passed on', async () => {
  const { runtime, calls } = setup({ failAt: 'api.migrate' });

  await assert.rejects(runtime.start(), /api\.migrate failed/);

  assert.deepEqual(calls, ['pg.start', 'api.migrate', 'api.stop', 'pg.stop']);
  assert.equal(runtime.running, false);
});

test('lifecycle: stopping twice, or before starting, is harmless', async () => {
  const { runtime } = setup();

  await runtime.stop();
  await runtime.start();
  await runtime.stop();
  await runtime.stop();
});

test('lifecycle: a backup is taken with both servers stopped, then everything comes back', async () => {
  const { runtime, calls, paths } = setup();
  await runtime.start();
  calls.length = 0;

  const file = await runtime.backup(path.join(paths.backupsDir, 'b.tar.gz'));

  assert.deepEqual(calls, ['api.stop', 'pg.stop', 'tar -czf', 'pg.start', 'api.start']);
  assert.ok(file.endsWith('b.tar.gz'));
});

test('lifecycle: if the backup itself fails the servers still come back', async () => {
  const { runtime, calls, paths } = setup({ tar: async () => { throw new Error('disk full'); } });
  await runtime.start();
  calls.length = 0;

  await assert.rejects(runtime.backup(path.join(paths.backupsDir, 'b.tar.gz')), /disk full/);

  assert.deepEqual(calls, ['api.stop', 'pg.stop', 'pg.start', 'api.start']);
});

test('lifecycle: restore keeps the old data aside, brings the backup in, then migrates in case it is older', async () => {
  const { runtime, calls, paths } = setup({
    tar: async () => {
      fs.mkdirSync(paths.pgData, { recursive: true });
      fs.writeFileSync(path.join(paths.pgData, 'PG_VERSION'), '16\n');
    },
  });
  await runtime.start();
  fs.mkdirSync(paths.pgData, { recursive: true });
  fs.writeFileSync(path.join(paths.pgData, 'marker'), 'old data');
  const backup = path.join(tempDir(), 'b.tar.gz');
  fs.writeFileSync(backup, 'x');
  calls.length = 0;

  await runtime.restore(backup);

  assert.deepEqual(calls, ['api.stop', 'pg.stop', 'pg.start', 'api.migrate', 'api.start']);
  const kept = fs.readdirSync(paths.userData).filter((name) => name.startsWith('pgdata.before-restore-'));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(paths.userData, kept[0], 'marker'), 'utf8'), 'old data');
  assert.ok(!fs.existsSync(path.join(paths.pgData, 'marker')));
});

test('lifecycle: a file that is not a backup is refused and the original data is put back untouched', async () => {
  const { runtime, paths } = setup({ tar: async () => undefined }); // extracts nothing useful
  await runtime.start();
  fs.mkdirSync(paths.pgData, { recursive: true });
  fs.writeFileSync(path.join(paths.pgData, 'marker'), 'precious');
  const bogus = path.join(tempDir(), 'bogus.tar.gz');
  fs.writeFileSync(bogus, 'x');

  await assert.rejects(runtime.restore(bogus), /not a TaskFlow backup/);

  assert.equal(fs.readFileSync(path.join(paths.pgData, 'marker'), 'utf8'), 'precious');
});

test('lifecycle: restoring from a file that does not exist fails before anything is stopped', async () => {
  const { runtime, calls } = setup();
  await runtime.start();
  calls.length = 0;

  await assert.rejects(runtime.restore('/no/such/file.tar.gz'), /not found/);

  assert.deepEqual(calls, []);
});
