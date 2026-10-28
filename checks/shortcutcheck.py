import asyncio
from playwright.async_api import async_playwright

async def main():
    ok, bad = [], []
    def check(n, c, d=""):
        (ok if c else bad).append(f"{n}{(' — ' + d) if d and not c else ''}")
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1500, "height": 950},
                              permissions=["clipboard-read", "clipboard-write"])
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto("http://localhost:5173/", wait_until="networkidle")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Shortcuts/i.test(x.textContent||'')); b && b.click(); }""")
        await pg.wait_for_timeout(600)
        body = await pg.evaluate("() => document.body.innerText")
        check("shortcuts page renders", "SHORTCUTS VAULT" in body.upper())
        check("no assign button", "Assign to Key" not in body and "ASSIGNED" not in body)
        check("no target switch selector", "Target Switch" not in body)
        check("read-only framing", "VIA Quick Keycode Tray" in body and "Copy one or remember it" in body)
        n = await pg.evaluate("""() => Array.from(document.querySelectorAll('button')).filter(b => /^Copy$/i.test((b.textContent||'').trim())).length""")
        check("each card has a Copy button", n > 10, f"{n} copy buttons")
        # copy really writes the combo to the clipboard
        await pg.evaluate("""() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Copy$/i.test((x.textContent||'').trim())); b && b.click(); }""")
        await pg.wait_for_timeout(300)
        clip = await pg.evaluate("() => navigator.clipboard.readText()")
        check("copy puts a combo on the clipboard", "+" in clip or len(clip) > 0, repr(clip))
        body2 = await pg.evaluate("() => document.body.innerText")
        check("copy confirms in place", "Copied" in body2)
        check("no console errors", not errs, "; ".join(errs[:3]))
        await pg.screenshot(path="checks/artifacts/shortcutcheck.png", full_page=False)
        await b.close()
    for n in ok: print("  ok  ", n)
    for n in bad: print("  FAIL", n)
    print(f"=== {len(ok)} passed, {len(bad)} failed ===")
    return 1 if bad else 0

raise SystemExit(asyncio.run(main()))
