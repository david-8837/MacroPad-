// Run: node tests/windowTracker.test.cjs
const assert = require('assert');
const { normalise, getActiveWindow } = require('../electron/native/window.cjs');

async function runTests() {
  // 1. Process name normalization
  const norm1 = normalise({ process: 'Resolve.exe', title: 'DaVinci Resolve Studio 18', pid: 1234 });
  assert.strictEqual(norm1.app, 'resolve');
  assert.strictEqual(norm1.title, 'DaVinci Resolve Studio 18');
  assert.strictEqual(norm1.pid, 1234);

  const norm2 = normalise({ process: 'OBS64.EXE', title: 'OBS 30.1.0 - Profile: Stream' });
  assert.strictEqual(norm2.app, 'obs64');

  const normEmpty = normalise({});
  assert.strictEqual(normEmpty.app, '');
  assert.strictEqual(normEmpty.title, '');
  assert.strictEqual(normEmpty.pid, 0);

  // 2. Profile auto-switch matching simulation
  const mockProfiles = [
    { id: 'davinci', name: 'DaVinci Resolve', targetProcess: 'resolve.exe', windowTitleRegex: 'DaVinci Resolve.*' },
    { id: 'obs', name: 'OBS Studio', targetProcess: 'obs64.exe' },
    { id: 'code', name: 'VS Code', targetProcess: 'Code.exe', windowTitleRegex: '.*Visual Studio Code' },
  ];

  function matchProfile(win, profiles) {
    const appName = win.app.toLowerCase();
    const winTitle = win.title;
    return profiles.find((p) => {
      if (p.targetProcess) {
        const targetClean = p.targetProcess.toLowerCase().replace(/\.exe$/, '');
        if (targetClean === appName || appName.includes(targetClean)) return true;
      }
      if (p.windowTitleRegex) {
        try {
          const re = new RegExp(p.windowTitleRegex, 'i');
          if (re.test(winTitle)) return true;
        } catch { /* ignore */ }
      }
      return false;
    });
  }

  const match1 = matchProfile({ app: 'resolve', title: 'DaVinci Resolve - Project 1' }, mockProfiles);
  assert.strictEqual(match1?.id, 'davinci');

  const match2 = matchProfile({ app: 'obs64', title: 'OBS Studio' }, mockProfiles);
  assert.strictEqual(match2?.id, 'obs');

  const match3 = matchProfile({ app: 'code', title: 'App.tsx - desktop-app - Visual Studio Code' }, mockProfiles);
  assert.strictEqual(match3?.id, 'code');

  const matchNone = matchProfile({ app: 'notepad', title: 'Untitled - Notepad' }, mockProfiles);
  assert.strictEqual(matchNone, undefined);

  // 3. Test getActiveWindow query
  const res = await getActiveWindow();
  assert.ok(typeof res.ok === 'boolean', 'getActiveWindow must return ok boolean');
  if (res.ok) {
    assert.ok(typeof res.value.app === 'string', 'value.app must be string');
    assert.ok(typeof res.value.title === 'string', 'value.title must be string');
  }

  console.log('windowTracker: all assertions passed (active window normalization and profile matching verified)');
}

runTests().catch((err) => {
  console.error('windowTracker test failed:', err);
  process.exit(1);
});
