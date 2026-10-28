"""Measure every visible text node in the app and check WCAG AA contrast.

The bug this exists for: several "active"/"idle" states painted text in the paper
colour (#E3E2DE) on a paper background, so labels like KEYS / KNOB / DISPLAY and
the Delay tab simply were not there. Eyeballing screenshots misses the ones that
are merely bad (3:1), so this measures.
"""
import asyncio
from playwright.async_api import async_playwright

MEASURE = r"""() => {
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const bgOf = (el) => {
    let n = el;
    let acc = null;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 1 && !acc.partial) return acc;
        if (c.a >= 1) return acc;
      }
      n = n.parentElement;
    }
    return acc || { r: 255, g: 255, b: 255, a: 1 };
  };
  const path = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; i < 4 && n && n !== document.body; i++) {
      bits.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string'
        ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
      n = n.parentElement;
    }
    return bits.join(' > ');
  };

  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const text = (t.textContent || '').trim();
    if (!text) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (parseFloat(cs.opacity) < 0.35) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const fgOnBg = fg.a < 1 ? over(fg, bg) : fg;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const r = ratio(fgOnBg, bg);
    if (r < need) {
      out.push({
        text: text.slice(0, 48),
        ratio: Math.round(r * 100) / 100,
        need,
        fg: `rgba(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)},${fg.a})`,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
        size: Math.round(size * 10) / 10,
        weight,
        where: path(el),
        disabled: !!el.closest('[disabled]'),
      });
    }
  }
  return out;
}"""

VIEWS = [
    ("studio", None),
    ("macros", "Macros"),
    ("shortcuts", "Shortcuts"),
    ("lighting", "Lighting"),
    ("tester", "Tester"),
]


async def main():
    failures = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        page = await b.new_page(viewport={"width": 1500, "height": 950})
        await page.goto("http://localhost:5173/", wait_until="networkidle")
        await page.evaluate("() => localStorage.clear()")
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(800)

        for name, tab in VIEWS:
            if tab:
                await page.evaluate(
                    """(t) => { const b = Array.from(document.querySelectorAll('button'))
                        .find(x => (x.textContent||'').trim().includes(t)); b && b.click(); }""",
                    tab,
                )
                await page.wait_for_timeout(600)
            found = await page.evaluate(MEASURE)
            for f in found:
                f["view"] = name
            failures.extend(found)

        # The macro page's inactive builder tabs are a known trap, so check them
        # in each state rather than only whichever is selected on load.
        await page.evaluate("""() => { const b = Array.from(document.querySelectorAll('button'))
            .find(x => (x.textContent||'').trim().includes('Macros')); b && b.click(); }""")
        await page.wait_for_timeout(500)
        for label in ["Text String", "Delay (ms)", "Presets", "Type Keys"]:
            await page.evaluate(
                """(t) => { const b = Array.from(document.querySelectorAll('button'))
                    .find(x => (x.textContent||'').trim() === t); b && b.click(); }""",
                label,
            )
            await page.wait_for_timeout(300)
            for f in await page.evaluate(MEASURE):
                f["view"] = f"macros:{label}"
                failures.append(f)

        # drawers
        for label, name in [("Keys", "drawer:keys"), ("Knob", "drawer:knob"), ("Display", "drawer:display")]:
            await page.goto("http://localhost:5173/", wait_until="networkidle")
            await page.wait_for_timeout(600)
            clicked = await page.evaluate(
                """(t) => { const b = Array.from(document.querySelectorAll('button'))
                    .find(x => (x.textContent||'').trim().toLowerCase().startsWith(t.toLowerCase()));
                    if (!b) return false; b.click(); return true; }""",
                label,
            )
            if not clicked:
                continue
            await page.wait_for_timeout(600)
            for f in await page.evaluate(MEASURE):
                f["view"] = name
                failures.append(f)
        await b.close()

    # One line per distinct problem, so a shared class fix collapses to one row.
    seen = set()
    for f in failures:
        key = (f["fg"], f["bg"], f["size"], f["weight"], f["view"].split(":")[0])
        if key in seen:
            continue
        seen.add(key)
        print(
            f"  {f['ratio']:>5}:1 (need {f['need']}) {f['view']:<14} "
            f"{f['fg']} on {f['bg']} {f['size']}px/{f['weight']} — \"{f['text']}\" [{f['where']}]"
        )
    print(f"=== {len(failures)} low-contrast text nodes, {len(seen)} distinct ===")
    return 1 if failures else 0


raise SystemExit(asyncio.run(main()))
