import asyncio, json
from playwright.async_api import async_playwright

async def main():
    ok, bad = [], []
    def check(name, cond, detail=""):
        (ok if cond else bad).append(f"{name}{(' — ' + detail) if detail else ''}")

    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto("http://localhost:5173/", wait_until="networkidle")
        await pg.wait_for_timeout(600)

        # go to Macros tab
        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /(Macros)/i.test((x.textContent||'').trim()));
          b && b.click(); }""")
        await pg.wait_for_timeout(700)

        body = await pg.evaluate("() => document.body.innerText")
        check("macro page renders", "VIA Macro Studio" in body)

        # 1. M0 is empty on a fresh profile
        empty_slots = body.count("Empty slot")
        check("all 16 slots start empty", empty_slots >= 16, f"found {empty_slots} 'Empty slot' labels")
        check("no seeded 'Copy & Paste Helper'", "Copy & Paste Helper" not in body)
        check("no seeded 'Lock PC Workstation'", "Lock PC Workstation" not in body)
        check("no 'Git Status & Log' seed", "Git Status & Log" not in body)
        store = await pg.evaluate("() => ({v2: !!localStorage.getItem('kadowaz_macros_v2')})")
        check("new storage key in use", store["v2"] is True)
        name_val = await pg.evaluate("""() => {
          const i = Array.from(document.querySelectorAll('input')).find(x => /macro label/i.test(x.placeholder||''));
          return i ? i.value : 'MISSING'; }""")
        check("M0 name field is blank", name_val == "", repr(name_val))

        # 2. no assign button
        check("no 'Assign to Switch' button", "Assign to Switch" not in body)

        # 3. typing on the real keyboard logs a step
        check("capture hint shown", "Press the keys you want" in body)
        check("capture idle text", "nothing yet" in body)
        await pg.click("[aria-label='Type the keys you want to log']")
        await pg.keyboard.down("Control")
        await pg.keyboard.press("c")
        await pg.keyboard.up("Control")
        await pg.wait_for_timeout(400)
        body2 = await pg.evaluate("() => document.body.innerText")
        check("typed Ctrl+C became a step", "Ctrl+C" in body2, "no Ctrl+C step in page text")
        check("capture confirms what it logged", "Ctrl + C" in body2)

        # a plain letter and a shifted letter
        await pg.keyboard.press("a")
        await pg.wait_for_timeout(250)
        body3 = await pg.evaluate("() => document.body.innerText")
        check("plain key logged", "LAST LOGGED\nA" in body3 or "A" in body3.split("LAST LOGGED")[-1][:20])
        await pg.keyboard.down("Shift"); await pg.keyboard.press("F5"); await pg.keyboard.up("Shift")
        await pg.wait_for_timeout(250)
        body4 = await pg.evaluate("() => document.body.innerText")
        check("modifier+function key logged", "Shift+F5" in body4)

        # 4. typing in the name field must not create steps
        await pg.click("input[placeholder*='macro label']")
        await pg.keyboard.type("My Macro")
        await pg.wait_for_timeout(300)
        steps_txt = await pg.evaluate("""() => {
          const m = document.body.innerText.match(/ACTION SEQUENCE TIMELINE \\((\\d+) STEPS\\)/);
          return m ? parseInt(m[1],10) : -1; }""")
        check("typing in the name field adds no steps", steps_txt == 3, f"step count {steps_txt}")

        # 5. Escape clears the capture readout
        await pg.click("[aria-label='Type the keys you want to log']")
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(250)
        body5 = await pg.evaluate("() => document.body.innerText")
        check("Escape clears capture readout", "nothing yet" in body5)

        # 6. Test Run is honest without the desktop shell
        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /Test Run/i.test(x.textContent||''));
          b && b.click(); }""")
        await pg.wait_for_timeout(600)
        body6 = await pg.evaluate("() => document.body.innerText")
        check("Test Run admits it needs the desktop app", "Test Run needs the Kadowaz desktop app" in body6)


        # 8. the on-screen key grid is gone: typing replaced it
        check("no on-screen modifier buttons", "+ Ctrl" not in body)
        check("no on-screen key grid button", "Insert Combo" not in body and "OR PICK MODIFIERS" not in body)
        # 7. clearing + slot switching keeps M0 independent
        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /Clear All Steps/i.test(x.textContent||''));
          b && b.click(); }""")
        await pg.wait_for_timeout(400)
        body7 = await pg.evaluate("() => document.body.innerText")
        check("Clear All Steps empties the sequence", "0 STEPS" in body7.replace("\n"," "))

        # 9. presets: 49 offered, nothing pre-applied
        await pg.evaluate("""() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^\\s*Presets\\s*$/i.test((x.textContent||'').trim())); b && b.click(); }""")
        await pg.wait_for_timeout(400)
        body8 = await pg.evaluate("() => document.body.innerText")
        check("preset library is offered", "ALL 49" in body8, "no 'ALL 49' chip")
        check("presets are not pre-applied", "0 STEPS" in body8.replace("\n", " "))
        await pg.evaluate("""() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Lock PC/.test((x.textContent||'').trim())); b && b.click(); }""")
        await pg.wait_for_timeout(400)
        body9 = await pg.evaluate("() => document.body.innerText")
        check("applying a preset writes its steps", "1 STEPS" in body9.replace("\n", " "), "step count not 1")
        check("applying a preset names the slot", "Lock PC" in body9)

        # 10. Save is a local save, not an EEPROM flash
        check("button says Save, not Save to EEPROM", "EEPROM" not in body9)

        check("no console errors", not errs, "; ".join(errs[:3]))
        await pg.screenshot(path="checks/artifacts/macrocheck.png", full_page=True)
        await b.close()

    for n in ok: print("  ok  ", n)
    for n in bad: print("  FAIL", n)
    print(f"=== {len(ok)} passed, {len(bad)} failed ===")
    return 1 if bad else 0

raise SystemExit(asyncio.run(main()))
