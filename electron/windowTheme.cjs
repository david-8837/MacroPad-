// The splash starts before the editor can read its localStorage. Mirror only the
// chosen theme in userData so its first frame can match the saved appearance.
const fs = require('fs');
const path = require('path');
const FILE = 'zero-window-theme.txt';

function readWindowTheme(userData) {
  try { return fs.readFileSync(path.join(userData, FILE), 'utf8').trim() === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

function saveWindowTheme(userData, theme) {
  if (theme !== 'light' && theme !== 'dark') return false;
  const file = path.join(userData, FILE);
  const temporary = `${file}.tmp`;
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(temporary, theme, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
    return true;
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* no temporary file */ }
    console.warn('[startup] Could not save loading-screen theme:', error.message);
    return false;
  }
}
module.exports = { readWindowTheme, saveWindowTheme };
