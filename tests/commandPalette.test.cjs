/**
 * Unit tests for Global Command Palette (Ctrl+K) search and ranking algorithm
 */

const assert = require('node:assert');

// Port the pure rank function for Node test verification
function rank(items, query) {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return items.filter((i) => i.group === 'Page' || i.group === 'Layer' || i.group === 'Action').slice(0, 30);
  }

  const scored = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const where = item.where.toLowerCase();
    const also = (item.also || '').toLowerCase();
    let score = -1;

    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (words.every((w) => label.includes(w))) score = 2;
    else if (label.includes(q)) score = 3;
    else if (words.every((w) => also.includes(w))) score = 4;
    else if (also.includes(q)) score = 5;
    else if (where.includes(q)) score = 6;

    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 50).map((x) => x.item);
}

function runTests() {
  console.log('[commandPalette] Starting Global Command Palette Tests...');

  const mockItems = [
    { id: 'page-deck', group: 'Page', label: 'Deck Studio', where: 'Home editor', also: 'pad twin buttons' },
    { id: 'page-tester', group: 'Page', label: 'Key Tester', where: 'Matrix validator', also: 'actuation check switch' },
    { id: 'page-apps', group: 'Page', label: 'Application Library', where: 'Detected software', also: 'exe launch' },
    { id: 'act-diag', group: 'Action', label: 'Hardware Status & Diagnostics', where: 'Studio inspector', also: 'diagnostics action history logs debug health selftest errors' },
    { id: 'act-firmware', group: 'Action', label: 'RP2040 Firmware & Bootloader (.uf2)', where: 'Left sidebar · BOOTSEL', also: 'bootsel flash rpi-rp2' },
    { id: 'layer-edit', group: 'Layer', label: 'Switch to Edit Layer', where: 'Current active layer', also: 'layer 1 channel edit' },
    { id: 'layer-color', group: 'Layer', label: 'Switch to Color Layer', where: 'Channel #2', also: 'layer 2 channel color' },
    { id: 'audio-mute', group: 'Audio', label: 'Audio: Toggle Master Mute', where: 'CoreAudio', also: 'sound silence volume' },
    { id: 'audio-vol-up', group: 'Audio', label: 'Audio: Master Volume Up (+5%)', where: 'CoreAudio', also: 'louder sound' },
    { id: 'sc-snip', group: 'Shortcut', label: 'Snipping Tool (Screen Capture)', where: 'Win+Shift+S', also: 'screenshot screenshot' },
  ];

  // 1. Empty query should return default high-level items (Pages & Actions)
  const emptyRes = rank(mockItems, '');
  assert.ok(emptyRes.length > 0, 'Empty query should return default items');
  assert.ok(emptyRes.every((i) => i.group === 'Page' || i.group === 'Layer' || i.group === 'Action'));
  console.log('✓ Empty query returns default navigation pages and primary actions');

  // 2. Exact match ranking
  const exactRes = rank(mockItems, 'Key Tester');
  assert.strictEqual(exactRes[0].id, 'page-tester', 'Exact label match should be ranked #1');
  console.log('✓ Exact search term ranks target command at top (score 0)');

  // 3. Multi-word prefix matching
  const prefixRes = rank(mockItems, 'deck');
  assert.strictEqual(prefixRes[0].id, 'page-deck');
  console.log('✓ Label prefix match ranks higher than generic substring');

  // 4. Searching by keyword in 'also'
  const alsoRes = rank(mockItems, 'bootsel');
  assert.ok(alsoRes.length > 0);
  assert.strictEqual(alsoRes[0].id, 'act-firmware', 'Keyword in also matches firmware flasher');
  console.log('✓ Keyword / alias matching correctly resolves target command');

  // 5. Multi-word out-of-order search
  const multiWordRes = rank(mockItems, 'silence sound');
  assert.ok(multiWordRes.length > 0);
  assert.ok(multiWordRes.some((x) => x.id === 'audio-mute'));
  console.log('✓ Multi-word query matches items regardless of token order');

  // 6. Case insensitivity
  const caseRes = rank(mockItems, 'COLOR LAYER');
  assert.strictEqual(caseRes[0].id, 'layer-color');
  console.log('✓ Search query matching is completely case-insensitive');

  // 7. Non-matching query returns empty array
  const noMatchRes = rank(mockItems, 'xyznonexistent123');
  assert.strictEqual(noMatchRes.length, 0);
  console.log('✓ Non-matching query cleanly returns 0 results');

  console.log('Global Command Palette: ALL TESTS PASSED!\n');
}

runTests();

