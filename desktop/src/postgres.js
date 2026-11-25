'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { exited, sleep, stopChild, tail } = require('./process');

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
    this.platform = deps.platform ?? process.platform;
    // On Windows every signal but 0 ends the process on the spot (no "fast shutdown"), so the polite stop is pg_ctl
    // (see stop()) and what is left here is only the fallback.
    this.stopSteps = deps.stopSteps ?? (this.windows
      ? [{ signal: 'SIGTERM', waitMs: 20_000 }, { signal: 'SIGKILL', waitMs: 5_000 }]
      : [{ signal: 'SIGINT', waitMs: 20_000 }, { signal: 'SIGTERM', waitMs: 5_000 }, { signal: 'SIGKILL', waitMs: 5_000 }]);
    this.child = null;
  }

  get windows() {
    return this.platform === 'win32';
  }

  /** The path of one of the bundle's programs: `initdb.exe` on Windows. */
  program(name) {
    return path.join(this.binDir, this.windows ? `${name}.exe` : name);
  }

  /**
   * The database is UTF-8 with Unicode-aware lower-casing, because the task search compares lower-cased text and
   * Vietnamese letters must fold properly ("Đ" and "đ"). Where the C library has the locale (macOS) that is
   * en_US.UTF-8; Windows names its locales differently and "C" would fold ASCII only, so there ICU does the work.
   */
  initdbArgs(pwFile) {
    const locale = this.windows ? ['--locale=C', '--locale-provider=icu', '--icu-locale=en-US'] : ['--locale=en_US.UTF-8'];
    return ['-D', this.dataDir, '-U', this.user, '--pwfile', pwFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '-E', 'UTF8', ...locale, '--no-instructions'];
  }

  startArgs() {
    return [
      '-D', this.dataDir,
      '-p', String(this.port),
      '-c', 'listen_addresses=127.0.0.1',
      // Unix sockets do not exist on Windows, and the setting itself is unknown there (PostgreSQL would refuse to start).
      ...(this.windows ? [] : ['-c', 'unix_socket_directories=']),
      '-c', 'max_connections=40',
      '-c', 'shared_buffers=64MB',
    ];
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
          this.program('initdb'),
          this.initdbArgs(pwFile),
          { env: this.environment(), windowsHide: true },
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
    if (this.windows) {
      await this.pgCtlStop();
    } else {
      this.kill(pid, 'SIGINT');
    }
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
      this.program('postgres'),
      this.startArgs(),
      { env: this.environment(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
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

  /** SIGINT is PostgreSQL's "fast shutdown": it rolls back open work and flushes everything safely. On Windows pg_ctl does the same job. */
  async stop() {
    const child = this.child;
    this.child = null;
    if (this.windows && child && child.exitCode === null && !child.signalCode) {
      await this.pgCtlStop();
      // pg_ctl returns when the server has finished; give the process a moment to report that it left before any signal.
      await Promise.race([exited(child), sleep(3_000)]);
    }
    return stopChild(child, this.stopSteps);
  }

  /** `pg_ctl stop -m fast`: the fast shutdown, asked for through the server's own pid file. Never throws: the caller falls back to ending the process. */
  pgCtlStop() {
    return new Promise((resolve) => {
      this.execFile(
        this.program('pg_ctl'),
        ['stop', '-D', this.dataDir, '-m', 'fast', '-w', '-t', '30'],
        { env: this.environment(), windowsHide: true },
        () => resolve(),
      );
    });
  }

  environment() {
    // PGPASSWORD is deliberately not set; nothing here needs it. Windows has no such locale names, and ICU covers it there.
    return this.windows ? { ...process.env } : { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
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
