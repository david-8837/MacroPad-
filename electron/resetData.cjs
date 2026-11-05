// Only these application-owned files contain persistent native preferences.
// Never touch the install directory, exported backups, or the user's documents.
const fs = require('fs');
const path = require('path');
const FILES = ['webhook-token.txt', 'zero-window-theme.txt', 'zero-window-theme.txt.tmp'];

function resetNativeData(userData) {
  const entries = [];
  for (const name of FILES) {
    const file = path.join(userData, name);
    try {
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Refusing to reset unexpected ${name}.`);
      entries.push({ file, data: fs.readFileSync(file), mode: info.mode & 0o777 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const removed = [];
  try {
    for (const entry of entries) { fs.unlinkSync(entry.file); removed.push(entry); }
  } catch (error) {
    try { for (const entry of removed) fs.writeFileSync(entry.file, entry.data, { mode: entry.mode, flag: 'wx' }); }
    catch { throw new Error('Reset failed and some native data could not be restored. Check your backup before continuing.'); }
    throw new Error(`Reset failed; native data was restored. ${error.message}`);
  }
}
module.exports = { resetNativeData };
