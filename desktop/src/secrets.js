'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * The database password and the token signing key are generated once on this machine and never leave it.
 * They are stored encrypted with the macOS Keychain (Electron safeStorage) when available; otherwise in a file only the
 * current user can read. Neither is ever written to a log or passed on a command line (processes list their arguments).
 */
function loadOrCreateSecrets({ file, safeStorage }) {
  const encrypted = Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    const text = encrypted ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(text);
  }

  const secrets = {
    dbPassword: crypto.randomBytes(24).toString('hex'),
    jwtKey: crypto.randomBytes(48).toString('base64'),
  };
  const text = JSON.stringify(secrets);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, encrypted ? safeStorage.encryptString(text) : text, { mode: 0o600 });
  return secrets;
}

module.exports = { loadOrCreateSecrets };
