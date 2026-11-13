'use strict';
const fs = require('node:fs');
const net = require('node:net');

/** A free TCP port on loopback, picked by the OS. Another process could grab it before use, so callers retry on failure. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/**
 * The same port on every launch while it is free. The window's address includes the port, and the browser keeps the
 * sign-in per address, so a different port each time would sign the user out at every start. If the remembered port
 * is taken by something else, a new one is chosen and remembered (the user signs in once more).
 */
async function stablePort(file, pick = freePort) {
  let remembered = null;
  try {
    remembered = Number.parseInt(fs.readFileSync(file, 'utf8'), 10);
  } catch {
    // First start: nothing remembered yet.
  }
  if (Number.isInteger(remembered) && remembered >= 1024 && remembered <= 65535 && (await isFree(remembered))) {
    return remembered;
  }
  const port = await pick();
  try {
    fs.writeFileSync(file, String(port), { mode: 0o600 });
  } catch {
    // Not remembering only costs a sign-in next time.
  }
  return port;
}

module.exports = { freePort, stablePort };
