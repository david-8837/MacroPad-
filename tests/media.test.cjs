// Run: node tests/media.test.cjs
//
// The Windows media session (SMTC) is read through PowerShell, which cannot run
// here, so the parsing half is pure and tested directly. These cases are the
// shapes Windows actually returns: WinRT TimeSpans as ticks, PlaybackStatus as
// an enum name or a number, and a timeline whose position was captured whenever
// the OS last chose to tell us.
const assert = require('assert');
const {
  parseNowPlaying,
  friendlyApp,
  isPlayingFrom,
  toSeconds,
} = require('../electron/native/audio.cjs');

/** A realistic payload: Spotify, mid-track, playing, position sampled 4 s ago. */
function payload(overrides = {}) {
  return JSON.stringify({
    title: 'Redbone',
    artist: 'Childish Gambino',
    album: 'Awaken, My Love!',
    app: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
    status: 4,
    position: 950000000,       // 95 s in ticks
    duration: 3260000000,      // 326 s
    lastUpdated: '2026-10-28T12:00:00.000Z',
    ...overrides,
  });
}

const NOW = Date.parse('2026-10-28T12:00:04.000Z'); // 4 s after lastUpdated

function runTests() {
  /* ── TimeSpan conversion ──────────────────────────────────────────────── */
  assert.strictEqual(toSeconds(950000000), 95, 'ticks are 100 ns units');
  assert.strictEqual(toSeconds('00:03:45'), 225, 'hh:mm:ss form');
  assert.strictEqual(toSeconds('01:02:03.5000000'), 3723, 'hh:mm:ss with fraction');
  assert.strictEqual(toSeconds('1.02:00:00'), 93600, 'TimeSpan with a day component');
  assert.strictEqual(toSeconds('00:00:07.1234567'), 7, 'sub-second is truncated, then rounded later');
  assert.strictEqual(toSeconds(null), 0, 'null is zero, not NaN');
  assert.strictEqual(toSeconds(''), 0, 'empty string is zero');
  assert.strictEqual(
    toSeconds('2026-10-28T12:00:00.000Z'),
    Date.parse('2026-10-28T12:00:00.000Z') / 1000,
    'an ISO timestamp becomes epoch seconds (LastUpdatedTime shape)',
  );

  /* ── transport state ──────────────────────────────────────────────────── */
  assert.strictEqual(isPlayingFrom(4), true, 'WindowsMediaPlaybackStatus 4 = Playing');
  assert.strictEqual(isPlayingFrom(5), false, '5 = Paused');
  assert.strictEqual(isPlayingFrom(3), false, '3 = Stopped');
  assert.strictEqual(isPlayingFrom(0), false, '0 = Closed');
  assert.strictEqual(isPlayingFrom('Playing'), true, 'enum name form');
  assert.strictEqual(isPlayingFrom('Paused'), false, 'enum name form, paused');
  assert.strictEqual(isPlayingFrom('nonsense'), false, 'unknown status is not playing');
  assert.strictEqual(isPlayingFrom(undefined), false, 'missing status is not playing');

  /* ── app names ────────────────────────────────────────────────────────── */
  assert.strictEqual(friendlyApp('Spotify.exe'), 'Spotify', 'exe suffix stripped');
  assert.strictEqual(
    friendlyApp('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'),
    'Spotify',
    'AUMID: the segment after ! is the app name',
  );
  assert.strictEqual(friendlyApp('chrome.exe'), 'chrome', 'unrecognised casing is left alone');
  assert.strictEqual(friendlyApp(null), null, 'no app is null');
  assert.strictEqual(friendlyApp(''), null, 'empty app is null');

  /* ── the parser ───────────────────────────────────────────────────────── */
  const playing = parseNowPlaying(payload(), NOW);
  assert.ok(playing, 'a playing track parses');
  assert.strictEqual(playing.title, 'Redbone');
  assert.strictEqual(playing.artist, 'Childish Gambino');
  assert.strictEqual(playing.album, 'Awaken, My Love!');
  assert.strictEqual(playing.app, 'Spotify');
  assert.strictEqual(playing.isPlaying, true);
  assert.strictEqual(playing.durationS, 326);
  // Position is where it was when the OS sampled it, so it is extrapolated to now.
  assert.strictEqual(playing.positionS, 99, 'position advances with the clock');
  assert.strictEqual(playing.progress, 30, 'progress is derived from position/duration');

  const paused = parseNowPlaying(payload({ status: 5 }), NOW);
  assert.strictEqual(paused.isPlaying, false);
  assert.strictEqual(paused.positionS, 95, 'a paused track does not advance');

  // A stale timeline (the OS did not notify us for a minute) must not jump the
  // bar by a minute: the drift contribution is capped at 5 s.
  const stale = parseNowPlaying(payload({ lastUpdated: '2026-10-28T11:59:00.000Z' }), NOW);
  assert.strictEqual(stale.positionS, 100, 'drift is capped at 5 s');
  assert.ok(stale.positionS <= stale.durationS, 'position never exceeds duration');

  const pastEnd = parseNowPlaying(payload({ position: 4000000000 }), NOW);
  assert.strictEqual(pastEnd.positionS, 326, 'position is clamped to duration');
  assert.strictEqual(pastEnd.progress, 100, 'progress tops out at 100');

  // No duration means no meaningful percentage; it must not divide by zero.
  const live = parseNowPlaying(payload({ duration: 0 }), NOW);
  assert.strictEqual(live.durationS, 0);
  assert.strictEqual(live.progress, 0, 'unknown duration yields 0%, not NaN');

  /* ── "nothing playing" is a state, not an error ───────────────────────── */
  assert.strictEqual(parseNowPlaying(''), null, 'no session output is null');
  assert.strictEqual(parseNowPlaying('   '), null, 'whitespace is null');
  assert.strictEqual(parseNowPlaying('garbage that is not json'), null, 'unparseable is null');
  assert.strictEqual(parseNowPlaying(JSON.stringify({ title: '', artist: '' })), null, 'no title and no artist is null');

  // PowerShell sometimes writes warnings before the JSON; the loose parser is
  // tested here because this is the path that actually carries them.
  const noisy = `Add-Type: something harmless\n${payload()}\n`;
  const recovered = parseNowPlaying(noisy, NOW);
  assert.ok(recovered && recovered.title === 'Redbone', 'JSON is recovered from noise');

  // Artist-only sessions exist (some radio apps never report a title).
  const artistOnly = parseNowPlaying(JSON.stringify({ title: '', artist: 'NTS Radio', status: 4 }), NOW);
  assert.ok(artistOnly, 'artist-only session is kept');
  assert.strictEqual(artistOnly.title, '');
  assert.strictEqual(artistOnly.artist, 'NTS Radio');

  console.log('media: all assertions passed (SMTC payloads, extrapolation, no-session state)');
}

runTests();
