'use strict';

/** Resolves when the child has exited (immediately if it already did). */
function exited(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      resolve(child.exitCode);
      return;
    }
    if (child.signalCode) {
      resolve(null);
      return;
    }
    child.once('exit', (code) => resolve(code));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks a child to stop politely, then firmly. `signals` is the escalation order with how long to wait after each.
 * Returns true if it stopped on its own terms, false if it had to be killed.
 */
async function stopChild(child, signals) {
  if (!child || child.exitCode !== null && child.exitCode !== undefined || child.signalCode) {
    return true;
  }
  for (const { signal, waitMs } of signals) {
    child.kill(signal);
    const done = await Promise.race([exited(child).then(() => true), sleep(waitMs).then(() => false)]);
    if (done) {
      return signal !== 'SIGKILL';
    }
  }
  return false;
}

/** The last lines of a log file, for an error message a person can act on. */
function tail(text, lines = 12) {
  return text.split('\n').filter(Boolean).slice(-lines).join('\n');
}

module.exports = { exited, sleep, stopChild, tail };
