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

        # fresh profile so the shipped deck is what we see
        await pg.goto("http://localhost:5173/", wait_until="networkidle")
        await pg.evaluate("() => localStorage.clear()")
        await pg.reload(wait_until="networkidle")
        await pg.wait_for_timeout(900)

        body = await pg.evaluate("() => document.body.innerText")
        for i in range(4):
            check(f"layer {i} listed", f"LAYER {i}" in body)
        check("no legacy long layer names", "Tools & Navigation" not in body and "Custom Bank" not in body)
        check("new layers have no example tag", "EXAMPLE" not in body)
        check("all 36 starting keys are empty", await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers.every(l => l.keys.length === 9 && l.keys.every(k => !k.tapAction && !k.holdAction && !k.doubleTapAction && !k.safetyConfirmAction))"))

        # ---- assigning a keycode must actually write the binding
        before = await pg.evaluate("() => JSON.stringify(JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0])")
        clicked = await pg.evaluate("""() => {
          const b = document.querySelector('button[title^="KC_A —"]');
          if (!b) return false; b.click(); return true; }""")
        await pg.wait_for_timeout(500)
        after = await pg.evaluate("() => JSON.stringify(JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0])")
        check("VIA tray has an 'A' button to click", clicked)
        check("assigning a keycode changes the stored binding", before != after, "deck unchanged in localStorage")
        if before != after:
            d = await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0]")
            check("the new binding is key A", (d.get('tapAction') or {}).get('payload', {}).get('keys') == ['A'], str(d.get('tapAction')))
        check("the example tag goes away after an edit",
              await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].isExample") is False)
        await pg.reload(wait_until="networkidle")
        await pg.wait_for_timeout(700)
        still = await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].label")
        check("the binding survives a reload", still in ("A", "a", "Key A"), str(still))

        # ---- the dial keeps one mode per layer, numbered from zero
        modes = await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers.map(l => [l.dial.activeModeName, l.dial.availableModes.length])")
        check("each layer's dial has four modes", all(m[1] == 4 for m in modes), str(modes))
        check("each dial sits on its own layer's mode",
              all(m[0].startswith(f"Layer {i}:") for i, m in enumerate(modes)), str(modes))

        # ---- the knob drawer names the dial's own layer and the full hold cycle
        opened = await pg.evaluate("""() => {
          const rows = Array.from(document.querySelectorAll('button, div[role=button]'));
          const r = rows.find(x => /Knob/i.test(x.textContent||'') && /dial/i.test(x.textContent||''));
          if (!r) return false; r.click(); return true; }""")
        await pg.wait_for_timeout(700)
        knob = await pg.evaluate("() => document.body.innerText")
        check("the knob drawer opens", opened)
        check("the knob drawer shows Layer 0", "Layer 0" in knob, knob[:120].replace("\n", " | "))
        check("the hold copy lists all four layers",
              "Layer 0 → Layer 1 → Layer 2 → Layer 3" in knob, "hold line not updated")
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(400)

        # ---- lighting page sees four channels (one per layer)
        await pg.evaluate("""() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Lighting/i.test(x.textContent||'')); b && b.click(); }""")
        await pg.wait_for_timeout(700)
        lit = await pg.evaluate("() => document.body.innerText")
        check("lighting page has 4 channel buttons", all(f"0{i}" in lit for i in range(4)))
        check("lighting copy ties channel to layer", "channel 0 is Layer 0" in lit)

        check("no alert dialogs", not dialogs, "; ".join(dialogs[:2]))
        check("no console errors", not errs, "; ".join(errs[:3]))
        await pg.screenshot(path="checks/artifacts/layercheck.png", full_page=False)
        await b.close()

    for n in ok: print("  ok  ", n)
    for n in bad: print("  FAIL", n)
    print(f"=== {len(ok)} passed, {len(bad)} failed ===")
    return 1 if bad else 0

raise SystemExit(asyncio.run(main()))
