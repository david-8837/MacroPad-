"""The Applications page lost its nav tab but must stay reachable from Ctrl+K."""
from playwright.sync_api import sync_playwright
import sys

URL = "http://localhost:5173/"
ok = fail = 0
errors = []


def check(name, cond):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name}")


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(600)

    nav = pg.locator("nav")
    nav_text = nav.inner_text().upper()
    check("nav has Keys", "KEYS" in nav_text)
    check("nav has Tester", "TESTER" in nav_text)
    check("nav has Shortcuts", "SHORTCUTS" in nav_text)
    check("nav has Lighting", "LIGHTING" in nav_text)
    check("nav has Macros", "MACROS" in nav_text)
    check("no Apps tab in the nav", "\nAPPS\n" not in nav_text and not nav_text.strip().endswith("APPS"))
    tabs = pg.locator("nav button")
    check("exactly 6 nav tabs", tabs.count() == 6)

    idx = [tabs.nth(i).inner_text().upper().replace("\n", " ") for i in range(tabs.count())]
    check("indices renumbered 01-06", all(str(i + 1).zfill(2) in idx[i] for i in range(6)))

    # Ctrl+K -> Application Library
    pg.keyboard.press("Control+k")
    pg.wait_for_timeout(300)
    search = pg.locator('input[placeholder]').first
    check("palette opened", search.is_visible())
    search.fill("application library")
    pg.wait_for_timeout(300)
    body = pg.locator("body").inner_text()
    check("palette lists the Application Library", "APPLICATION LIBRARY" in body.upper())
    check("palette says it is palette-only", "PALETTE-ONLY" in body.upper())
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)

    body = pg.locator("body").inner_text().upper()
    check("apps page rendered", "NO NAV TAB" in body)
    check("apps page offers a way back", "KEYS" in body)
    check("nothing in the nav is marked active", pg.locator("nav button[aria-current], nav button[data-active]").count() == 0)
    pg.screenshot(path="checks/artifacts/apptabcheck.png", full_page=False)

    back = pg.get_by_role("button", name="← Keys")
    check("back button present", back.count() == 1)
    back.first.click()
    pg.wait_for_timeout(500)
    body = pg.locator("body").inner_text().upper()
    check("back returns to the Keys page", "NO NAV TAB" not in body)
    check("deck twin is back", pg.locator("nav button", has_text="KEYS").first.is_visible())

    check("no console errors", len(errors) == 0)
    if errors:
        for e in errors[:5]:
            print("    console:", e)

    b.close()

print(f"\n=== {ok} passed, {fail} failed ===")
sys.exit(1 if fail else 0)
