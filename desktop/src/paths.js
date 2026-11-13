'use strict';
const path = require('node:path');

/**
 * Where everything lives. Pure (no Electron import) so it can be tested.
 *  - resources: the read-only bundle (API, web build, PostgreSQL), inside the .app when packaged.
 *  - userData: the person's own data, outside the app so updating or deleting the app never touches it.
 */
function resolvePaths({ isPackaged, resourcesPath, devResources, userData }) {
  const resources = isPackaged ? resourcesPath : devResources;
  return {
    resources,
    apiDir: path.join(resources, 'api'),
    apiBinary: path.join(resources, 'api', 'TaskManagement.API'),
    webDir: path.join(resources, 'web'),
    pgDir: path.join(resources, 'postgres'),
    pgBin: (name) => path.join(resources, 'postgres', 'bin', name),
    userData,
    pgData: path.join(userData, 'pgdata'),
    secretsFile: path.join(userData, 'secrets.bin'),
    logsDir: path.join(userData, 'logs'),
    backupsDir: path.join(userData, 'backups'),
    stateFile: path.join(userData, 'state.json'),
    apiPortFile: path.join(userData, 'api-port'),
  };
}

module.exports = { resolvePaths };
