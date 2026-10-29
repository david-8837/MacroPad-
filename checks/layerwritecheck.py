"""Regression: editing a selected layer must never mutate a different layer.

Run against the dev server: python3 checks/layerwritecheck.py
"""
import asyncio
import re
from playwright.async_api import async_playwright


async def read_deck(page):
    return await page.evaluate("() => JSON.parse(localStorage.getItem('kadowaz_deck'))")


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 1500, "height": 950})
        try:
            await page.goto("http://localhost:5173/", wait_until="networkidle")
            await page.evaluate("() => localStorage.clear()")
            await page.reload(wait_until="networkidle")
            await page.wait_for_function("() => !!localStorage.getItem('kadowaz_deck')")

            for layer_idx, key in enumerate("ABCD"):
                before = await read_deck(page)
                selector = page.get_by_role(
                    "button", name=re.compile(rf"^0{layer_idx} LAYER {layer_idx} ")
                )
                await selector.click()
                await page.wait_for_function(
                    "id => JSON.parse(localStorage.getItem('kadowaz_deck')).activeLayerId === id",
                    arg=before["layers"][layer_idx]["id"],
                )
                await page.get_by_role("button", name=key, exact=True).click()
                await page.wait_for_function(
                    "args => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[args.idx].keys[0].label === args.key",
                    arg={"idx": layer_idx, "key": key},
                )
                after = await read_deck(page)
                for other in range(4):
                    if other == layer_idx:
                        assert after["layers"][other]["keys"][0]["tapAction"]["payload"]["keys"] == [key]
                    else:
                        assert after["layers"][other] == before["layers"][other], (
                            f"editing Layer {layer_idx} changed Layer {other}"
                        )
                assert after["activeLayerId"] == before["layers"][layer_idx]["id"]
                print(f"  ok  Layer {layer_idx} receives {key}; other layers remain unchanged")

            await page.reload(wait_until="networkidle")
            persisted = await read_deck(page)
            assert [layer["keys"][0]["label"] for layer in persisted["layers"]] == list("ABCD")
            print("  ok  four independent edits survive reload")

            # In older releases the session and deck could disagree. On the next
            # launch the session choice should be adopted for *both* viewing and
            # editing rather than silently writing the saved deck's Layer 0.
            target = persisted["layers"][2]["id"]
            await page.evaluate("id => localStorage.setItem('kadowaz_session', JSON.stringify({activeLayerId:id}))", target)
            await page.reload(wait_until="networkidle")
            await page.wait_for_function("id => JSON.parse(localStorage.getItem('kadowaz_deck')).activeLayerId === id", arg=target)
            old = await read_deck(page)
            await page.get_by_role("button", name="E", exact=True).click()
            await page.wait_for_function("() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[2].keys[0].label === 'E'")
            new = await read_deck(page)
            assert new["layers"][0] == old["layers"][0]
            assert new["layers"][1] == old["layers"][1]
            assert new["layers"][3] == old["layers"][3]
            print("  ok  legacy session/deck disagreement edits the visible layer")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
