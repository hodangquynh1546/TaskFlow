'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const childProcess = require('node:child_process');
const { sleep, stopChild, tail } = require('./process');

const MIGRATE_TIMEOUT_MS = 120_000;
const START_TIMEOUT_MS = 60_000;

/** The bundled ASP.NET API. It also serves the Angular build, so one loopback URL is the whole app. */
class ApiServer {
  constructor({ binary, webDir, port, logFile, pidFile, connectionString, secrets, deps = {} }) {
    this.binary = binary;
    this.webDir = webDir;
    this.port = port;
    this.logFile = logFile;
    this.pidFile = pidFile;
    this.connectionString = connectionString;
    this.secrets = secrets;
    this.spawn = deps.spawn ?? childProcess.spawn;
    this.healthCheck = deps.healthCheck ?? defaultHealthCheck;
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.commandOf = deps.commandOf ?? defaultCommandOf;
    this.killPid = deps.killPid ?? ((pid, signal) => process.kill(pid, signal));
    this.stopSteps = deps.stopSteps ?? [
      { signal: 'SIGTERM', waitMs: 8_000 },
      { signal: 'SIGKILL', waitMs: 3_000 },
    ];
    this.child = null;
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Configuration travels by environment variable: arguments would show up in the process list. */
  environment() {
    return {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Production',
      ASPNETCORE_URLS: this.url,
      DOTNET_NOLOGO: '1',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      ConnectionStrings__DefaultConnection: this.connectionString,
      Jwt__Key: this.secrets.jwtKey,
      Jwt__Issuer: 'TaskFlow',
      Jwt__Audience: 'TaskFlow.Client',
      Jwt__ExpiresMinutes: '60',
      Hosting__ServeSpa: 'true',
      Hosting__SpaRoot: this.webDir,
    };
  }

  openLog() {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    return fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  /** `TaskManagement.API migrate`: applies pending migrations and exits (non-zero on failure). */
  async migrate() {
    const log = this.openLog();
    const child = this.spawn(this.binary, ['migrate'], { env: this.environment(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk) => {
      output += chunk.toString();
      log.write(chunk);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('The database update took too long and was cancelled.'));
      }, MIGRATE_TIMEOUT_MS);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });
    if (code !== 0) {
      throw new Error(`The database update failed (exit ${code}).\n${tail(output)}`);
    }
  }

  /**
   * If the app was killed hard, its API outlives it. The pid file says which process that was; it is only stopped when
   * it is still our API binary, because the number may since have been given to an unrelated program.
   */
  async stopStale() {
    if (!this.pidFile || !fs.existsSync(this.pidFile)) {
      return;
    }
    const pid = Number.parseInt(fs.readFileSync(this.pidFile, 'utf8'), 10);
    fs.rmSync(this.pidFile, { force: true });
    if (!Number.isInteger(pid) || pid <= 1 || !this.isAlive(pid) || !(this.commandOf(pid) ?? '').startsWith(this.binary)) {
      return;
    }
    for (const [signal, waitMs] of [['SIGTERM', 8_000], ['SIGKILL', 3_000]]) {
      this.killPid(pid, signal);
      const until = Date.now() + waitMs;
      while (this.isAlive(pid) && Date.now() < until) {
        await sleep(100);
      }
      if (!this.isAlive(pid)) {
        return;
      }
    }
  }

  async start() {
    await this.stopStale();
    const log = this.openLog();
    const child = this.spawn(this.binary, [], { env: this.environment(), stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    if (this.pidFile && child.pid) {
      fs.writeFileSync(this.pidFile, String(child.pid));
    }
    child.once('exit', () => {
      log.end();
      if (this.pidFile) {
        fs.rmSync(this.pidFile, { force: true });
      }
    });
    let output = '';
    const collect = (chunk) => {
      output += chunk.toString();
      log.write(chunk);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    let died = null;
    child.once('exit', (code, signal) => {
      died = `exited (${signal ?? `code ${code}`})`;
    });
    child.once('error', (error) => {
      died = error.message;
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (died) {
        throw new Error(`The API ${died} before it was ready.\n${tail(output)}`);
      }
      if (await this.healthCheck(this.url)) {
        return;
      }
      await sleep(150);
    }
    throw new Error(`The API did not answer within ${START_TIMEOUT_MS / 1000}s.\n${tail(output)}`);
  }

  async stop() {
    const child = this.child;
    this.child = null;
    return stopChild(child, this.stopSteps);
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

function defaultCommandOf(pid) {
  try {
    return childProcess.execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function defaultHealthCheck(url) {
  return new Promise((resolve) => {
    const request = http.get(`${url}/health`, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

module.exports = { ApiServer };
