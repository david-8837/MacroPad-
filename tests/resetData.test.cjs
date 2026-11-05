const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { resetNativeData } = require('../electron/resetData.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-reset-native-'));
try {
  for (const name of ['webhook-token.txt', 'zero-window-theme.txt', 'zero-window-theme.txt.tmp', 'my-backup.json', 'other.txt']) fs.writeFileSync(path.join(dir, name), name);
  // A failure during removal rolls earlier files back, without touching exports.
  let calls = 0;
  const mockFs = { ...fs, unlinkSync(file) { if (++calls === 2) throw new Error('locked'); fs.unlinkSync(file); } };
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/resetData.cjs'), 'utf8'), { require: id => id === 'fs' ? mockFs : require(id), module: mod, exports: mod.exports });
  assert.throws(() => mod.exports.resetNativeData(dir), /native data was restored/);
  for (const name of ['webhook-token.txt', 'zero-window-theme.txt', 'zero-window-theme.txt.tmp', 'my-backup.json', 'other.txt']) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), name);
  resetNativeData(dir);
  for (const name of ['webhook-token.txt', 'zero-window-theme.txt', 'zero-window-theme.txt.tmp']) assert.equal(fs.existsSync(path.join(dir, name)), false);
  for (const name of ['my-backup.json', 'other.txt']) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), name);
  resetNativeData(dir); // missing files are harmless
  fs.symlinkSync(path.join(dir, 'my-backup.json'), path.join(dir, 'webhook-token.txt'));
  assert.throws(() => resetNativeData(dir), /unexpected/);
  assert.equal(fs.readFileSync(path.join(dir, 'my-backup.json'), 'utf8'), 'my-backup.json');
  console.log('native reset: allowlisted files, symlink protection, rollback and backup preservation passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
