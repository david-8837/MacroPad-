"""Browser regression: a quick assignment must not be overwritten by an open drawer.

Start the development server on port 5173, then run this with Playwright installed.
The browser context is isolated; no existing local configuration is touched.
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://localhost:5173/', wait_until='networkidle')
    page.get_by_role('button', name='Keys Switch #1').click()
    page.locator('button[title^="KC_B —"]').click()
    page.get_by_role('button', name='Save Changes').click()
    key = page.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0]")
    assert key['tapAction']['payload']['keys'] == ['B'], 'open drawer overwrote the quick assignment'
    page.reload(wait_until='networkidle')
    assert page.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction.payload.keys") == ['B']
    assert not errors, errors
    browser.close()
    print('editorcheck: quick assignment survives saving the open drawer and reloading')
