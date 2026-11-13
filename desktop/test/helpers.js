'use strict';
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** A stand-in for a child process: records the signals it receives and exits only for the ones it "handles". */
class FakeChild extends EventEmitter {
  constructor({ handles = ['SIGINT', 'SIGTERM', 'SIGKILL'] } = {}) {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.signalCode = null;
    this.signals = [];
    this.handles = handles;
  }

  kill(signal) {
    this.signals.push(signal);
    if (this.handles.includes(signal)) {
      setImmediate(() => this.exit(null, signal));
    }
    return true;
  }

  exit(code, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }
}

function tempDir(prefix = 'tf-desktop-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const FAST_STOP = [
  { signal: 'SIGINT', waitMs: 30 },
  { signal: 'SIGTERM', waitMs: 30 },
  { signal: 'SIGKILL', waitMs: 30 },
];

module.exports = { FakeChild, tempDir, FAST_STOP };
