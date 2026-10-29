"""Macro Test Run must type literal text and stop on native failure."""
import asyncio
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1550, 'height': 920})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        try:
            await page.goto('http://localhost:5173/', wait_until='networkidle')
            await page.evaluate('localStorage.clear()')
            await page.reload(wait_until='networkidle')
            await page.evaluate("""() => {
              window.__macroCalls = [];
              window.electronAPI = { execAction: async action => {
                window.__macroCalls.push(action);
                return { success: false, error: 'injected native failure' };
              } };
            }""")
            await page.get_by_role('navigation', name='Modules').get_by_role('button', name='Macros').click()
            await page.get_by_role('button', name='Presets', exact=True).click()
            await page.get_by_role('button', name='Git Commit & Push').click()
            await page.get_by_role('button', name='Test Run').click()
            await page.get_by_text('Test Run stopped at step 1:', exact=False).wait_for()
            calls = await page.evaluate('window.__macroCalls')
            assert len(calls) == 1, calls
            assert calls[0]['category'] == 'text', calls
            assert calls[0]['payload']['text'].startswith('git add .'), calls
            assert 'command' not in calls[0]['payload'], calls
            body = await page.locator('body').inner_text()
            assert 'injected native failure' in body
            assert 'Finished Macro M0 Execution' not in body
            assert not errors, errors
            print('  ok  text preset stays literal and failed step stops Test Run without fake completion')
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
