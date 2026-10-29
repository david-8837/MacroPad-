"""Regression: simulator knob and hold actions keep their native payloads."""
import asyncio
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1500, "height": 950})
        try:
            await page.goto('http://localhost:5173/', wait_until='networkidle')
            await page.evaluate('() => localStorage.clear()')
            await page.reload(wait_until='networkidle')
            assert await page.get_by_text('WebHID Macropad').count() == 0
            await page.locator('header button:has(.mark--off)').click()
            assert await page.get_by_text('USB serial', exact=True).count() == 1
            assert await page.get_by_text('WebHID Macropad').count() == 0
            await page.locator('header button:has(.mark--off)').click()
            print('  ok  connection menu offers only the implemented CDC event protocol')
            await page.evaluate("""() => {
                window.__actionCalls = [];
                window.electronAPI = { execAction: async action => {
                    window.__actionCalls.push(action);
                    return { success: true };
                }};
            }""")

            await page.get_by_role('button', name='Step Clockwise').click()
            await page.wait_for_function('() => window.__actionCalls.length === 1')
            calls = await page.evaluate('() => window.__actionCalls')
            assert calls[0]['category'] == 'hotkey'
            assert calls[0]['payload']['keys'] == ['RightArrow'], calls
            print('  ok  simulator CW sends the full configured hotkey')

            safety = page.locator('button.macropad-key', has_text='Render Out')
            await safety.dispatch_event('pointerdown', {'pointerId': 1, 'pointerType': 'mouse', 'button': 0})
            await page.wait_for_timeout(1620)
            await safety.dispatch_event('pointerup', {'pointerId': 1, 'pointerType': 'mouse', 'button': 0})
            await page.wait_for_function('() => window.__actionCalls.length === 2')
            calls = await page.evaluate('() => window.__actionCalls')
            assert calls[1]['actionId'] == 'act-render', calls
            assert calls[1]['payload']['keys'] == ['Ctrl', 'Shift', 'R'], calls
            print('  ok  simulator safety hold sends the configured confirmation chord')

            # A failed action must not be accompanied by a fake success event.
            await page.evaluate("""() => {
                window.__actionCalls = [];
                window.electronAPI.execAction = async action => {
                    window.__actionCalls.push(action);
                    return { success: false, error: 'injected failure' };
                };
            }""")
            await page.get_by_role('button', name='Step Clockwise').click()
            await page.wait_for_function('() => window.__actionCalls.length === 1')
            await page.get_by_title('Diagnostics & history', exact=True).click()
            await page.wait_for_function("() => document.body.innerText.includes('[ACTION FAILED]')")
            text = await page.locator('div.fixed').inner_text()
            assert 'injected failure' in text and '[ACTION FAILED]' in text, text[-350:]
            print('  ok  rejected native action appears as a failure, not an early success')

            await page.reload(wait_until='networkidle')
            await page.get_by_role('button', name='Step Clockwise').click()
            await page.get_by_title('Diagnostics & history', exact=True).click()
            await page.wait_for_function("() => document.body.innerText.includes('[PREVIEW]')")
            text = await page.locator('div.fixed').inner_text()
            assert 'native OS injection requires Electron' in text, text[-350:]
            print('  ok  browser preview is labeled non-executing')
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
