"""Browser smoke test for backup, assignment, small windows and simulated pad events.

Run against a fresh Vite server on port 5173 with Playwright installed. The pad
frame is injected into the decoded bridge, not a substitute for physical testing.
"""
import asyncio
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ.get('TEST_CHROMIUM_EXECUTABLE') or None,
            args=json.loads(os.environ.get('TEST_CHROMIUM_ARGS', '["--no-sandbox"]')),
        )
        page = await browser.new_page(viewport={'width': 390, 'height': 844}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        await page.goto('http://localhost:5173/', wait_until='networkidle')
        await page.get_by_role('button', name='Layers, firmware & backup').click()
        await page.get_by_text('Backup & restore', exact=True).click()
        with TemporaryDirectory() as tmp:
            async with page.expect_download() as dl:
                await page.get_by_role('button', name='Download backup').click()
            download = await dl.value
            path = str(Path(tmp) / 'backup.json')
            await download.save_as(path)
            await page.locator('input[type=file]').set_input_files(path)
            await page.get_by_role('button', name='Confirm restore').click()
            assert await page.get_by_text('Restored in the app.', exact=False).count() == 1
        await page.get_by_role('button', name='Close layers & tools').click()
        await page.get_by_role('button', name='Shortcuts', exact=True).click()
        await page.get_by_role('button', name='Assign Lock PC shortcut').click()
        await page.get_by_role('button', name='Confirm assignment').click()
        assert await page.evaluate("JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction.name") == 'Lock PC'
        await page.get_by_role('button', name='Keys', exact=True).click()
        await page.get_by_role('button', name='Keys Switch #1', exact=False).click()
        editor = page.locator('.designer-inspector--editing')
        await editor.wait_for()
        rect = await editor.bounding_box()
        assert rect['x'] == 0 and rect['width'] == 390
        await page.get_by_role('button', name='Tester', exact=True).click()
        await page.get_by_role('heading', name='Pad inspector').wait_for()
        await page.wait_for_timeout(300)
        # A fresh dev server is required to share the app's module instance.
        result = await page.evaluate('''async () => {
          const { hardwareBridge } = await import('/src/utils/hardwareBridge.ts');
          let calls = 0;
          const off = hardwareBridge.onInputEvent(() => calls++);
          const frame = event => ({kind:'key', key:{source:0,index:0,event,channel:2,action:1,value:0}});
          hardwareBridge.handleLinkEvent(frame(1));
          await new Promise(r => setTimeout(r, 100));
          const held = document.querySelector('[aria-label="K0: held"]') !== null;
          hardwareBridge.handleLinkEvent(frame(2));
          await new Promise(r => setTimeout(r, 100));
          const observed = document.querySelector('[aria-label="K0: observed"]') !== null;
          off();
          return { calls, held, observed, log:document.querySelector('[aria-label="Recent physical events"]').textContent };
        }''')
        assert result['calls'] == 2 and result['held'] and result['observed'], result
        assert 'K0 · down · layer 2' in result['log'] and 'K0 · up · layer 2' in result['log'], result
        assert not errors, errors
        await browser.close()
    print('app improvements: backup/restore, assignment, mobile editor and simulated pad events passed')


asyncio.run(main())
