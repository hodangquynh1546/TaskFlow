'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { freePort } = require('./ports');
const { loadOrCreateSecrets } = require('./secrets');
const { PostgresServer } = require('./postgres');
const { ApiServer } = require('./api');

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

/**
 * Starts and stops the two background programs in the right order, and does backups. The order is the whole point:
 * database first, then the API that needs it; on the way out, the API first so nothing writes to a closing database.
 */
class TaskFlowRuntime {
  constructor({ paths, safeStorage, deps = {} }) {
    this.paths = paths;
    this.safeStorage = safeStorage;
    this.deps = deps;
    this.pg = null;
    this.api = null;
    this.running = false;
  }

  get url() {
    return this.api?.url ?? null;
  }

  async start() {
    const { paths } = this;
    fs.mkdirSync(paths.userData, { recursive: true, mode: 0o700 });
    const secrets = loadOrCreateSecrets({ file: paths.secretsFile, safeStorage: this.safeStorage });
    const pgPort = await (this.deps.freePort ?? freePort)();
    const apiPort = await (this.deps.freePort ?? freePort)();

    const makePg = this.deps.makePg ?? ((options) => new PostgresServer(options));
    const makeApi = this.deps.makeApi ?? ((options) => new ApiServer(options));
    this.pg = makePg({
      binDir: path.dirname(paths.pgBin('postgres')),
      dataDir: paths.pgData,
      logFile: path.join(paths.logsDir, 'postgres.log'),
      user: 'taskflow',
      password: secrets.dbPassword,
      port: pgPort,
      deps: this.deps.pg,
    });
    this.api = makeApi({
      binary: paths.apiBinary,
      webDir: paths.webDir,
      port: apiPort,
      logFile: path.join(paths.logsDir, 'api.log'),
      pidFile: path.join(paths.userData, 'api.pid'),
      connectionString: this.pg.connectionString(),
      secrets,
      deps: this.deps.api,
    });

    try {
      await this.pg.start();
      await this.api.migrate();
      await this.api.start();
      this.running = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
    return this.api.url;
  }

  /** Last resort for a process that is exiting right now and cannot wait for a graceful stop. */
  killNow() {
    this.api?.child?.kill('SIGKILL');
    this.pg?.child?.kill('SIGKILL');
  }

  /** Safe to call at any point, including after a partial start or twice. */
  async stop() {
    this.running = false;
    await this.api?.stop();
    await this.pg?.stop();
  }

  /**
   * A backup is a copy of the data folder, taken while the database is stopped so the copy is always consistent.
   * The API comes back on the same port, so an open window just reloads.
   */
  async backup(targetFile) {
    const { paths } = this;
    const tar = this.deps.tar ?? runTar;
    await this.#whileStopped(async () => {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      await tar(['-czf', targetFile, '-C', path.dirname(paths.pgData), path.basename(paths.pgData)]);
    });
    return targetFile;
  }

  defaultBackupFile() {
    return path.join(this.paths.backupsDir, `taskflow-${stamp()}.tar.gz`);
  }

  /**
   * Replaces the data with a backup. The data it replaces is kept next to it (pgdata.before-restore-*) until the
   * person deletes it, so a wrong choice is never final.
   */
  async restore(sourceFile) {
    const { paths } = this;
    const tar = this.deps.tar ?? runTar;
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Backup not found: ${sourceFile}`);
    }
    await this.#whileStopped(async () => {
      const aside = `${paths.pgData}.before-restore-${stamp()}`;
      fs.renameSync(paths.pgData, aside);
      try {
        await tar(['-xzf', sourceFile, '-C', path.dirname(paths.pgData)]);
        if (!fs.existsSync(path.join(paths.pgData, 'PG_VERSION'))) {
          throw new Error('The file is not a TaskFlow backup.');
        }
      } catch (error) {
        fs.rmSync(paths.pgData, { recursive: true, force: true });
        fs.renameSync(aside, paths.pgData);
        throw error;
      }
    }, { migrateAfter: true });
  }

  async #whileStopped(work, { migrateAfter = false } = {}) {
    await this.api.stop();
    await this.pg.stop();
    try {
      await work();
    } finally {
      await this.pg.start();
      if (migrateAfter) {
        await this.api.migrate();
      }
      await this.api.start();
    }
  }
}

function runTar(args) {
  return new Promise((resolve, reject) => {
    childProcess.execFile('/usr/bin/tar', args, (error, stdout, stderr) => (error ? reject(new Error(String(stderr || error.message))) : resolve()));
  });
}

module.exports = { TaskFlowRuntime };
