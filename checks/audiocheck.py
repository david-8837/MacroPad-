"""The audio panel must not show sessions it did not measure."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    ok, bad = [], []
    def check(name, cond, detail=""):
        (ok if cond else bad).append(f"{name}{(' — ' + detail) if detail and not cond else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto("http://localhost:5173/", wait_until="networkidle")
        await pg.wait_for_timeout(700)

        # Open the collapsed audio panel on the Studio page.
        await pg.evaluate("""() => {
          const s = Array.from(document.querySelectorAll('summary')).find(x => /audio mixer/i.test(x.textContent||''));
          s && s.click(); }""")
        await pg.wait_for_timeout(400)
        html = await pg.content()
        text = await pg.evaluate("() => document.body.innerText")

        check("no invented Spotify row", "Spotify Music" not in text)
        check("no invented Discord row", "Discord Voice" not in text)
        check("no invented game row", "Active Game" not in text)
        check("no invented level", "85%" not in text and "90%" not in text)
        check("no fabricated peak meter", "Peak" not in text and "peak" not in text)
        check("says the bridge is unavailable", "UNAVAILABLE" in text)
        check("explains why", "No audio bridge" in text)
        check("points at the key action", "AUDIO SESSION" in text)
        check("no console errors", not errs, "; ".join(errs[:3]))
        await b.close()

    print(f"PASS {len(ok)}")
    for n in ok:
        print("  ok  ", n)
    if bad:
        print(f"FAIL {len(bad)}")
        for n in bad:
            print("  FAIL", n)
        raise SystemExit(1)

asyncio.run(main())
