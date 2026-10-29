// Every application preset has local artwork; the general layouts use symbols.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { build } = require('esbuild');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'preset-icons-'));
  try {
    const root = resolve(__dirname, '..');
    const entry = join(dir, 'entry.mjs');
    writeFileSync(entry, `export { LAYER_PRESETS } from '${root}/src/data/layerPresets.ts';\nexport { PRESET_APP_ICONS } from '${root}/src/data/presetIcons.ts';`);
    const outfile = join(dir, 'bundle.mjs');
    await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile,
      loader: { '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'silent' });
    const { LAYER_PRESETS, PRESET_APP_ICONS } = await import(`file://${outfile}`);
    const apps = LAYER_PRESETS.filter(p => p.group !== 'General');
    assert.equal(apps.length, Object.keys(PRESET_APP_ICONS).length);
    for (const preset of apps) {
      assert.match(PRESET_APP_ICONS[preset.id] ?? '', /^data:image\/(?:svg\+xml|png)/, `${preset.name} has local image`);
    }
    assert.match(PRESET_APP_ICONS.blender, /^data:image\/png/);
    const component = readFileSync(join(root, 'src/components/PresetsPage.tsx'), 'utf8');
    assert.match(component, /<PresetIcon id=\{item\.id\}/, 'show artwork on cards');
    assert.match(component, /<PresetIcon id=\{preset\.id\}/, 'show artwork in selected preview');
    assert.match(component, /aria-hidden="true"/, 'decorative images should not repeat the preset name');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert(pkg.build.extraResources.some(r => r.from === 'src/assets/preset-icons' && r.to === 'licenses/preset-icons'),
      'the packaged desktop app must include artwork attribution and licenses');
    console.log('presetIcons: every app preset has locally bundled artwork in card and preview');
  } finally { rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
