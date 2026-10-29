"""Appearance-tab and telemetry-tab behaviour, checked in a real browser.

Covers the code paths that were re-implemented when the drawer stopped keeping a
second copy of the state: every edit now commits through one helper, so a burst of
edits has to compose instead of the last one winning.

Run: python3 uicheck2.py   (needs `npm run dev` on :5173)
"""
import asyncio
from playwright.async_api import async_playwright

OPEN = """() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => /DISPLAY/i.test(x.textContent||''));
  b && b.click();
}"""
CLOSE = """() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => /^CANCEL$/.test((x.textContent||'').trim()));
  b && b.click();
}"""
TAB = """(name) => {
  const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim().includes(name));
  b && b.click();
}"""
PREFS = "() => JSON.parse(localStorage.getItem('kadowaz_oled') || '{}')"
DRAWER_TEXT = "() => document.body.innerText"


async def main():
    ok, bad = [], []

    def check(name, cond, detail=""):
        (ok if cond else bad).append(f"{name}{(' — ' + detail) if detail and not cond else ''}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        await page.goto("http://localhost:5173/", wait_until="networkidle")
        await page.wait_for_timeout(600)

        # A. Live values in a browser: nothing measured, nothing invented.
        drawer = await page.evaluate(DRAWER_TEXT)
        check("no invented track name", "Starboy" not in await page.content())
        check("no invented CPU figure", "24%" not in drawer and "42%" not in drawer)

        await page.evaluate(OPEN)
        await page.wait_for_timeout(400)
        await page.evaluate(TAB, "APPEARANCE")
        await page.wait_for_timeout(300)

        inputs = page.locator('input[type="text"]')
        check("two label inputs exist", await inputs.count() >= 2)

        # B. Typing a title commits immediately (preference, persisted).
        await inputs.nth(0).fill("NIGHT SHIFT")
        await page.wait_for_timeout(250)
        prefs = await page.evaluate(PREFS)
        check("custom title persists", prefs.get("customTitle") == "NIGHT SHIFT", str(prefs.get("customTitle")))

        # C. A burst of edits in one task must compose, not overwrite each other.
        # React tracks the native value setter, so a plain `.value =` assignment is
        # invisible to onChange; go through the prototype setter like React does.
        await page.evaluate("""() => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          setter.call(inputs[0], 'FINAL');
          inputs[0].dispatchEvent(new Event('input', {bubbles:true}));
          setter.call(inputs[1], 'ON AIR');
          inputs[1].dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(250)
        prefs = await page.evaluate(PREFS)
        check("burst keeps both edits", prefs.get("customTitle") == "FINAL" and prefs.get("customSubtitle") == "ON AIR",
              f"{prefs.get('customTitle')} / {prefs.get('customSubtitle')}")

        # D. Brightness slider.
        slider = page.locator('input[type="range"]').first
        await slider.fill("50")
        await page.wait_for_timeout(250)
        prefs = await page.evaluate(PREFS)
        check("brightness commits", prefs.get("brightness") == 50, str(prefs.get("brightness")))

        # E. Inversion toggle is a real toggle, not a one-way latch.
        before = (await page.evaluate(PREFS)).get("inverted")
        await page.evaluate("""() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /MONOCHROME PIXEL INVERSION/i.test((b.parentElement && b.parentElement.textContent) || ''));
          btn && btn.click();
        }""")
        await page.wait_for_timeout(250)
        after = (await page.evaluate(PREFS)).get("inverted")
        check("inversion toggles", before != after, f"{before} -> {after}")

        # F. Reset restores the defaults, including the rotation and the interval.
        await page.evaluate("""() => {
          const b = document.querySelector('button[title="Reset display defaults"]');
          b && b.click();
        }""")
        await page.wait_for_timeout(300)
        prefs = await page.evaluate(PREFS)
        check("reset restores the title", prefs.get("customTitle") == "KADOWAZ IND.", str(prefs.get("customTitle")))
        check("reset restores the interval", prefs.get("autoCycleS") == 30, str(prefs.get("autoCycleS")))
        check("reset restores the rotation", len(prefs.get("playlist") or []) == 12, str(len(prefs.get("playlist") or [])))
        check("reset clears inversion", prefs.get("inverted") is False, str(prefs.get("inverted")))
        check("reset restores SSD1306 0x8F contrast (56%)", prefs.get("brightness") == 56, str(prefs.get("brightness")))

        # G. Telemetry tab: says plainly that nothing was measured.
        await page.evaluate(TAB, "TELEMETRY")
        await page.wait_for_timeout(300)
        text = await page.evaluate(DRAWER_TEXT)
        check("telemetry names the missing source", "No native telemetry" in text)
        check("telemetry shows placeholders", "--" in text)
        check("media shows NO MEDIA", "NO MEDIA" in text)
        check("telemetry has no fake meter values", "35%" not in text and "58%" not in text)
        check("display save is labeled as PC-only", "SAVE DISPLAY (PC ONLY)" in text)

        # H. PC-only Save leaves the preference preview in place.
        await page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'SAVE DISPLAY (PC ONLY)');
          b && b.click();
        }""")
        await page.wait_for_timeout(300)

        check("no console errors", not errs, "; ".join(errs[:3]))
        await browser.close()

    print(f"PASS {len(ok)}")
    for name in ok:
        print("  ok  ", name)
    if bad:
        print(f"FAIL {len(bad)}")
        for name in bad:
            print("  FAIL", name)
        raise SystemExit(1)


asyncio.run(main())
