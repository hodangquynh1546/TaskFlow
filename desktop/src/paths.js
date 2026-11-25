'use strict';
const path = require('node:path');

/**
 * Where everything lives. Pure (no Electron import) so it can be tested.
 *  - resources: the read-only bundle (API, web build, PostgreSQL), inside the .app when packaged.
 *  - userData: the person's own data, outside the app so updating or deleting the app never touches it.
 */
function resolvePaths({ isPackaged, resourcesPath, devResources, userData, platform = process.platform }) {
  const resources = isPackaged ? resourcesPath : devResources;
  // Programs end in .exe on Windows and have no extension elsewhere.
  const exe = platform === 'win32' ? '.exe' : '';
  return {
    resources,
    apiDir: path.join(resources, 'api'),
    apiBinary: path.join(resources, 'api', `TaskManagement.API${exe}`),
    webDir: path.join(resources, 'web'),
    pgDir: path.join(resources, 'postgres'),
    pgBin: (name) => path.join(resources, 'postgres', 'bin', `${name}${exe}`),
    userData,
    pgData: path.join(userData, 'pgdata'),
    secretsFile: path.join(userData, 'secrets.bin'),
    logsDir: path.join(userData, 'logs'),
    backupsDir: path.join(userData, 'backups'),
    stateFile: path.join(userData, 'state.json'),
    apiPortFile: path.join(userData, 'api-port'),
  };
}

/**
 * Where a person's data goes when nothing says otherwise: a folder of its own in the app-data directory.
 * On Windows PostgreSQL is unreliable with a data directory whose path has non-ASCII letters, and Windows account names
 * (and so `C:\\Users\\<name>`) often have Vietnamese diacritics. In that case the data goes to a plain-ASCII folder under
 * ProgramData instead, named after the account by a hash so two accounts on one PC never share a database.
 */
function defaultUserData({ platform = process.platform, appData, programData, username }) {
  const usual = path.join(appData, 'TaskFlow Desktop');
  const plainAscii = /^[\x20-\x7e]*$/;
  if (platform !== 'win32' || (plainAscii.test(usual) && plainAscii.test(username ?? ''))) {
    return usual;
  }
  const account = require('node:crypto').createHash('sha1').update(String(username)).digest('hex').slice(0, 10);
  return path.join(programData || 'C:\\ProgramData', 'TaskFlow', account);
}

module.exports = { resolvePaths, defaultUserData };
