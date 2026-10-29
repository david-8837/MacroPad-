import asyncio
from playwright.async_api import async_playwright

LABEL = """() => { const el = document.querySelector('[aria-label^="OLED panel"]'); return el ? el.getAttribute('aria-label').replace('OLED panel showing ','') : null }"""

async def open_drawer(pg):
    await pg.evaluate("""() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /DISPLAY/i.test(x.textContent||''));
      b && b.click(); }""")
    await pg.wait_for_timeout(500)

async def close_drawer(pg):
    await pg.evaluate("""() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /^CLOSE$/.test((x.textContent||'').trim()));
      b && b.click(); }""")
    await pg.wait_for_timeout(300)

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
        await pg.wait_for_timeout(900)

        # 1. clicking the panel must NOT change the screen
        before = await pg.evaluate(LABEL)
        await pg.click('[aria-label^="OLED panel"]')
        await pg.wait_for_timeout(400)
        after = await pg.evaluate(LABEL)
        check("panel click is inert", before == after, f"{before} -> {after}")

        # 2. rotation toggle in the drawer
        await open_drawer(pg)
        state = await pg.evaluate("""() => {
          const btns = Array.from(document.querySelectorAll('span[role="button"]'));
          const cards = Array.from(document.querySelectorAll('button')).filter(b => /STARFIELD/i.test(b.textContent||''));
          const card = cards[0];
          const toggle = card ? card.querySelector('span[role="button"]') : null;
          return { cards: cards.length, toggles: btns.length, label: toggle ? toggle.textContent.trim() : null };
        }""")
        check("every card has a rotation toggle", state["toggles"] >= 12, str(state))
        check("toggle starts IN ROTATION", state["label"] == "IN ROTATION", str(state["label"]))

        await pg.evaluate("""() => {
          const card = Array.from(document.querySelectorAll('button')).find(b => /STARFIELD/i.test(b.textContent||''));
          card.querySelector('span[role="button"]').click(); }""")
        await pg.wait_for_timeout(400)
        after_toggle = await pg.evaluate("""() => {
          const card = Array.from(document.querySelectorAll('button')).find(b => /STARFIELD/i.test(b.textContent||''));
          const t = card.querySelector('span[role="button"]').textContent.trim();
          const tag = Array.from(card.querySelectorAll('span')).map(s => s.textContent.trim()).find(t => t === 'SKIPPED' || /FPS|STATIC|ACTIVE/.test(t));
          return { toggle: t, tag }; }""")
        check("toggle flips to SKIPPED", after_toggle["toggle"] == "SKIPPED", str(after_toggle))
        check("card tag follows rotation", after_toggle["tag"] == "SKIPPED", str(after_toggle))

        # 3. keep only the first two cards in the rotation, then cycle once
        await pg.evaluate("""() => {
          const cards = Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('span[role="button"]'));
          cards.forEach((c, i) => {
            const t = c.querySelector('span[role="button"]');
            if (i > 1 && t.textContent.trim() === 'IN ROTATION') t.click();
          });
        }""")
        await pg.wait_for_timeout(400)
        remaining = await pg.evaluate("""() => Array.from(document.querySelectorAll('span[role="button"]')).filter(s => s.textContent.trim() === 'IN ROTATION').length""")
        check("only kept screens stay in rotation", remaining == 2, f"{remaining} in rotation")

        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => /CYCLE NEXT MODE/i.test(x.textContent||''));
          b && b.click(); }""")
        await pg.wait_for_timeout(400)
        cyc = await pg.evaluate(LABEL)
        check("cycle jumps over skipped screens", cyc in ("system", "kadowaz"), f"went to {cyc}")

        # 4a. turn everything back on, then 4b. click every toggle inside a single
        # task: React batches those, so this is the regression test for updates
        # collapsing into one write, and for the "never empty rotation" guard.
        await pg.evaluate("""() => {
          const cards = Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('span[role="button"]'));
          cards.forEach((c) => { const t = c.querySelector('span[role="button"]'); if (t.textContent.trim() === 'SKIPPED') t.click(); });
        }""")
        await pg.wait_for_timeout(400)
        all_on = await pg.evaluate("""() => Array.from(document.querySelectorAll('span[role="button"]')).filter(s => s.textContent.trim() === 'IN ROTATION').length""")
        check("skipped screens can be put back", all_on == 12, f"{all_on} in rotation")

        await pg.evaluate("""() => {
          Array.from(document.querySelectorAll('span[role="button"]')).forEach(t => t.click());
        }""")
        await pg.wait_for_timeout(500)
        burst = await pg.evaluate("""() => Array.from(document.querySelectorAll('span[role="button"]')).filter(s => s.textContent.trim() === 'IN ROTATION').length""")
        check("batched toggles compose and never empty the rotation", burst == 1, f"{burst} in rotation")

        # 4c. auto switch OFF stops the timer
        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === 'OFF');
          b && b.click(); }""")
        await pg.wait_for_timeout(200)
        await close_drawer(pg)
        m0 = await pg.evaluate(LABEL)
        await pg.wait_for_timeout(4200)
        m1 = await pg.evaluate(LABEL)
        check("AUTO OFF freezes the rotation", m0 == m1, f"{m0} -> {m1}")

        # 5. persistence
        await open_drawer(pg)
        await pg.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === '10S');
          b && b.click(); }""")
        await pg.wait_for_timeout(300)
        await pg.evaluate("""() => {
          const cards = Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('span[role="button"]'));
          cards.slice(0, 3).forEach((c) => { const t = c.querySelector('span[role="button"]'); if (t.textContent.trim() === 'SKIPPED') t.click(); });
        }""")
        await pg.wait_for_timeout(300)
        live = await pg.evaluate("""() => Array.from(document.querySelectorAll('span[role="button"]')).filter(s => s.textContent.trim() === 'IN ROTATION').length""")
        await close_drawer(pg)
        saved = await pg.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_oled') || '{}')")
        check("auto cycle persisted", saved.get("autoCycleS") == 10, str(saved.get("autoCycleS")))
        check("playlist persisted", isinstance(saved.get("playlist"), list) and len(saved.get("playlist")) == live, f"{saved.get('playlist')} vs {live} live")
        await pg.reload(wait_until="networkidle")
        await pg.wait_for_timeout(900)
        await open_drawer(pg)
        restored = await pg.evaluate("""() => {
          const active = Array.from(document.querySelectorAll('span[role="button"]')).filter(s => s.textContent.trim() === 'IN ROTATION').length;
          const preset = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === '10S');
          return { active, presetActive: preset ? preset.className.includes('1351AA') : null }; }""")
        check("rotation survives reload", restored["active"] == live, f"{restored} vs {live}")
        check("interval survives reload", restored["presetActive"] is True, str(restored))
        await close_drawer(pg)

        # 6. migration from a pre-rotation saved state
        await pg.evaluate("""() => localStorage.setItem('kadowaz_oled', JSON.stringify({ mode: 'rain', cpuLoad: 10, gpuLoad: 20, ramUsage: 30, cpuTemp: 40 }))""")
        await pg.reload(wait_until="networkidle")
        await pg.wait_for_timeout(900)
        migrated = await pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('kadowaz_oled') || '{}'); return s; }""")
        check("migrated state keeps the saved mode", migrated.get("mode") == "rain", str(migrated.get("mode")))
        check("migrated state gains an interval", migrated.get("autoCycleS") == 30, str(migrated.get("autoCycleS")))
        check("migrated state gains a full rotation", isinstance(migrated.get("playlist"), list) and len(migrated.get("playlist")) == 12, str(migrated.get("playlist")))
        modelabel = await pg.evaluate(LABEL)
        check("migrated state renders", modelabel == "rain", str(modelabel))

        check("no console errors", not errs, str(errs[:3]))
        await b.close()

    print(f"PASS {len(ok)}")
    for o in ok: print("  ok  ", o)
    if bad:
        print(f"FAIL {len(bad)}")
        for f in bad: print("  FAIL", f)
    raise SystemExit(1 if bad else 0)

asyncio.run(main())
