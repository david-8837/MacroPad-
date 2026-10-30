"""Browser regression: event feedback must not shift the tester or scroll it."""
import asyncio
import json
import os
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ.get('TEST_CHROMIUM_EXECUTABLE') or None,
            args=json.loads(os.environ.get('TEST_CHROMIUM_ARGS', '["--no-sandbox"]')),
        )
        page = await browser.new_page(viewport={'width': 1238, 'height': 900})
        await page.goto('http://localhost:5173/', wait_until='networkidle')
        await page.get_by_role('button', name='Tester', exact=True).click()
        await page.get_by_role('button', name='Sound feedback', exact=True).click()
        # Pointer activation returns focus to the surface so Space is tested,
        # not interpreted as another click on the last control.
        async def geometry():
            return await page.evaluate('''() => {
              const rect = selector => {
                const r = document.querySelector(selector).getBoundingClientRect();
                return [r.x, r.y, r.width, r.height];
              };
              const scroller = document.querySelector('.tester-page');
              return { header: rect('main header'), keyboard: rect('.tester-keyboard-scroll'),
                key: rect('[data-code="KeyA"]'), readout: rect('[aria-label="Observed key codes"]'),
                scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight };
            }''')
        before = await geometry()
        await page.keyboard.down('a')
        assert await page.locator('[data-code="KeyA"]').get_attribute('data-state') == 'held'
        assert before == await geometry(), 'held key shifted the layout'
        await page.keyboard.up('a')
        assert await page.locator('[data-code="KeyA"]').get_attribute('data-state') == 'tested'
        assert before == await geometry(), 'first event changed the page geometry'
        for key in ['Space', 'ArrowDown', 'ArrowUp', 'PageDown', 'Home', 'End']:
            await page.keyboard.press(key)
            await page.wait_for_timeout(100)
            assert before == await geometry(), f'{key} moved or resized the tester'
        # A growing set of observed keys must stay inside the fixed readout.
        await page.evaluate('''() => {
          for (let i = 0; i < 35; i++) {
            const code = `LongUnknownPhysicalKeyCode${i}`;
            window.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'a' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'a' }));
          }
        }''')
        await page.wait_for_timeout(100)
        assert before == await geometry(), 'many observed codes changed the page geometry'
        assert await page.locator('.tester-readout').evaluate('(e) => e.scrollHeight > e.clientHeight')
        await page.get_by_role('button', name='Reset events').click()
        assert before == await geometry(), 'reset changed the page geometry'
        # Buttons must still work via keyboard, and normal modified shortcuts
        # must not be canceled by the scroll-key suppression.
        await page.get_by_role('button', name='TKL', exact=True).focus()
        await page.keyboard.press('Enter')
        assert await page.get_by_role('button', name='TKL', exact=True).get_attribute('aria-pressed') == 'true'
        await page.evaluate('''() => { window.canceled = null; window.addEventListener('keydown', e => {
          if (e.ctrlKey && e.code === 'ArrowDown') window.canceled = e.defaultPrevented;
        }); document.querySelector('main').focus(); }''')
        await page.keyboard.press('Control+ArrowDown')
        assert await page.evaluate('window.canceled') is False
        await browser.close()
    print('tester stability: key feedback, scrolling and keyboard controls passed')


asyncio.run(main())
