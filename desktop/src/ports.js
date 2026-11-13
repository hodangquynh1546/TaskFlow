'use strict';
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

module.exports = { freePort };
