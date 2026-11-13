'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { sleep, stopChild, tail } = require('./process');

const READY = /database system is ready to accept connections/;
const START_TIMEOUT_MS = 45_000;

/**
 * The embedded PostgreSQL: one private server per app, on a random loopback port, with its data in the user's
 * folder. Only the three programs of the bundle are used (initdb, postgres), so nothing here depends on psql or
 * pg_dump; backups are done by copying the data folder while the server is stopped (see lifecycle.js).
 */
class PostgresServer {
  constructor({ binDir, dataDir, logFile, user, password, port, deps = {} }) {
    this.binDir = binDir;
    this.dataDir = dataDir;
    this.logFile = logFile;
    this.user = user;
    this.password = password;
    this.port = port;
    this.spawn = deps.spawn ?? childProcess.spawn;
    this.execFile = deps.execFile ?? childProcess.execFile;
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.kill = deps.kill ?? process.kill.bind(process);
    this.stopSteps = deps.stopSteps ?? [
      { signal: 'SIGINT', waitMs: 20_000 },
      { signal: 'SIGTERM', waitMs: 5_000 },
      { signal: 'SIGKILL', waitMs: 5_000 },
    ];
    this.child = null;
  }

  /** The same database every time: the default "postgres" one, owned by our own user. */
  connectionString() {
    return `Host=127.0.0.1;Port=${this.port};Database=postgres;Username=${this.user};Password=${this.password};Pooling=true;Maximum Pool Size=20`;
  }

  get initialized() {
    return fs.existsSync(path.join(this.dataDir, 'PG_VERSION'));
  }

  async initialize() {
    if (this.initialized) {
      return false;
    }
    fs.mkdirSync(path.dirname(this.dataDir), { recursive: true, mode: 0o700 });
    // The password goes in a file that exists only for the duration of initdb, never on the command line.
    const pwFile = path.join(path.dirname(this.dataDir), `.pw-${process.pid}`);
    fs.writeFileSync(pwFile, this.password, { mode: 0o600 });
    try {
      await new Promise((resolve, reject) => {
        this.execFile(
          path.join(this.binDir, 'initdb'),
          ['-D', this.dataDir, '-U', this.user, '--pwfile', pwFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '-E', 'UTF8', '--locale=en_US.UTF-8', '--no-instructions'],
          { env: this.environment() },
          (error, stdout, stderr) => (error ? reject(new Error(`initdb failed: ${tail(String(stderr || error.message))}`)) : resolve(stdout)),
        );
      });
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    return true;
  }

  /** A server left over from a crash of the app would hold the data folder; ask it to stop before starting a new one. */
  async stopStaleServer() {
    const pidFile = path.join(this.dataDir, 'postmaster.pid');
    if (!fs.existsSync(pidFile)) {
      return;
    }
    const pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').split('\n')[0], 10);
    if (!Number.isInteger(pid) || pid <= 1 || !this.isAlive(pid)) {
      return; // postgres cleans up its own stale lock file
    }
    this.kill(pid, 'SIGINT');
    for (let i = 0; i < 100 && this.isAlive(pid); i++) {
      await sleep(200);
    }
    if (this.isAlive(pid)) {
      throw new Error(`Another PostgreSQL (pid ${pid}) is still using ${this.dataDir}.`);
    }
  }

  async start() {
    await this.initialize();
    await this.stopStaleServer();
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    const log = fs.createWriteStream(this.logFile, { flags: 'a' });
    const child = this.spawn(
      path.join(this.binDir, 'postgres'),
      [
        '-D', this.dataDir,
        '-p', String(this.port),
        '-c', 'listen_addresses=127.0.0.1',
        '-c', 'unix_socket_directories=',
        '-c', 'max_connections=40',
        '-c', 'shared_buffers=64MB',
      ],
      { env: this.environment(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;
    child.once('exit', () => log.end());

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`PostgreSQL did not become ready within ${START_TIMEOUT_MS / 1000}s.`)), START_TIMEOUT_MS);
      const onData = (chunk) => {
        log.write(chunk);
        if (READY.test(chunk.toString())) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`PostgreSQL exited during start (${signal ?? `code ${code}`}). See ${this.logFile}.`));
      });
    });
  }

  /** SIGINT is PostgreSQL's "fast shutdown": it rolls back open work and flushes everything safely. */
  async stop() {
    const child = this.child;
    this.child = null;
    return stopChild(child, this.stopSteps);
  }

  environment() {
    // PGPASSWORD is deliberately not set; nothing here needs it.
    return { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
  }
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

module.exports = { PostgresServer };
