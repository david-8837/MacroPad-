import asyncio
from playwright.async_api import async_playwright

async def main():
    ok, bad = [], []
    def check(n, c, d=""):
        (ok if c else bad).append(f"{n}{(' — ' + d) if d and not c else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 950})
        pg = await ctx.new_page()
        errs, dialogs = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("dialog", lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))

        await pg.goto("http://localhost:5173/", wait_until="networkidle")
        await pg.evaluate("() => localStorage.clear()")
        await pg.reload(wait_until="networkidle")
        await pg.wait_for_timeout(900)

        opened = await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /UPLOAD TO DECK/i.test(x.textContent||''));
          if (!b) return false; b.click(); return true; }""")
        await pg.wait_for_timeout(600)
        check("the upload modal opens", opened)

        stats = await pg.evaluate("""() => {
          const want = ['HOTKEYS', 'EMPTY', 'APP LAUNCH', 'MEDIA', 'HOLD-CONFIRM'];
          const out = {};
          document.querySelectorAll('div').forEach(d => {
            const t = (d.textContent || '').trim();
            if (want.includes(t) && d.nextElementSibling) out[t] = (d.nextElementSibling.textContent || '').trim();
          });
          return out; }""")
        check("the deck's key counts are honest (17 bound, 18 empty, 1 hold-to-confirm)",
              stats.get('HOTKEYS') == '17' and stats.get('EMPTY') == '18' and stats.get('HOLD-CONFIRM') == '1',
              str(stats))

        before = await pg.evaluate("() => document.body.innerText")
        check("the modal does not promise four-layer success before anything happened",
              "SUCCESSFULLY UPLOADED" not in before)
        check("the modal no longer claims a 1,708-byte blob", "1,708" not in before)

        flicked = await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /FLASH \\/ UPLOAD ALL/i.test(x.textContent||''));
          if (!b) return false; b.click(); return true; }""")
        await pg.wait_for_timeout(1200)
        after = await pg.evaluate("() => document.body.innerText")

        check("the flash button runs", flicked)
        check("with no pad, the result says nothing was written", "NOTHING WAS WRITTEN" in after,
              after[-400:].replace("\n", " | "))
        check("and it names the reason", "No pad is answering" in after)
        check("it never claims the pad acknowledged a commit",
              "ACKNOWLEDGED" not in after and "SUCCESSFULLY UPLOADED" not in after)
        check("no alert dialogs", not dialogs, "; ".join(dialogs[:2]))
        check("no console errors", not errs, "; ".join(errs[:3]))
        await pg.screenshot(path="checks/artifacts/uploadcheck.png")
        await b.close()

    for n in ok: print("  ok  ", n)
    for n in bad: print("  FAIL", n)
    print(f"=== {len(ok)} passed, {len(bad)} failed ===")
    return 1 if bad else 0

raise SystemExit(asyncio.run(main()))
