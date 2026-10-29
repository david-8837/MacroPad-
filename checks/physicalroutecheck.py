"""End-to-end MPAD3 KEY_EVENT ownership, gestures, channel and safety checks.

A browser-local fake Web Serial port answers PING/INFO and injects actual binary
frames; execAction is stubbed, so this never sends an OS shortcut.
"""
import asyncio
from playwright.async_api import async_playwright

SERIAL_PEER = r"""(() => {
  window.__actionCalls = [];
  window.electronAPI = { execAction: async action => {
    window.__actionCalls.push(action);
    return { success: true };
  }};
  window.__proto = import('/host/protocol/mpad3-protocol.mjs');
  window.__serialCommands = [];
  let controller;
  const readable = new ReadableStream({ start(c) { controller = c; } });
  const writable = new WritableStream({
    async write(frame) {
      if (frame[0] !== 0xA5 || frame[1] !== 0x5A) {
        window.__serialCommands.push(new TextDecoder().decode(frame).trim());
        return;
      }
      const p = await window.__proto;
      const parser = new p.FrameDecoder();
      parser.push(frame);
      const req = parser.next();
      if (!req) throw new Error('invalid host frame');
      if (req.cmd === p.CMD.PING) {
        controller.enqueue(p.encodeFrame(p.CMD.PONG, new Uint8Array(0)));
      } else if (req.cmd === p.CMD.GET_INFO) {
        const payload = new Uint8Array(16);
        const v = new DataView(payload.buffer);
        v.setUint32(0, p.MAGIC_U32, true);
        v.setUint16(4, p.PROTOCOL_VERSION, true);
        v.setUint16(6, p.CONFIG_FORMAT_VERSION, true);
        payload[8] = p.CHANNEL_COUNT;
        payload[9] = p.KEY_COUNT;
        payload[10] = 9;
        payload[11] = p.CAP.FLASH | p.CAP.EVENTS;
        v.setUint16(12, p.SIZES.config, true);
        v.setUint16(14, 73, true);
        controller.enqueue(p.encodeFrame(p.CMD.INFO, payload));
      }
    }
  });
  const port = {
    readable, writable,
    async open() {},
    async close() { controller.close(); }
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: async () => port
  }});
  window.__sendKeyEvent = async ({ source = 0, index = 0, event = 3,
      channel = 0, value = 0, action = 0 }) => {
    const p = await window.__proto;
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    bytes[0] = source; bytes[1] = index; bytes[2] = event; bytes[3] = channel;
    view.setInt16(4, value, true);
    view.setUint16(6, action, true);
    controller.enqueue(p.encodeFrame(p.CMD.KEY_EVENT, bytes));
  };
})()"""


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1550, 'height': 920})
        await page.add_init_script(SERIAL_PEER)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        try:
            await page.goto('http://localhost:5173/', wait_until='networkidle')
            await page.evaluate('() => { localStorage.clear(); }')
            await page.reload(wait_until='networkidle')
            await page.evaluate("""() => {
                const deck = JSON.parse(localStorage.getItem('kadowaz_deck'));
                deck.layers[0].keys[0].tapAction = {
                  id: 'host-only-L0', category: 'app_launch', name: 'Host-only L0',
                  payload: { appName: 'Fake App', exePath: 'fake.exe' }
                };
                deck.layers[1].keys[0].tapAction = {
                  id: 'host-only-L1', category: 'hotkey', name: 'Host-only L1',
                  payload: { keys: ['Ctrl', 'Q'] }
                };
                localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
            }""")
            await page.reload(wait_until='networkidle')
            await page.locator('header button:has(.mark--off)').click()
            await page.get_by_role('button', name='USB serial').click()
            await page.get_by_text('MPAD3 READY', exact=True).wait_for(timeout=6000)
            print('  ok  binary PING/INFO probe marks MPAD3 ready')

            await page.evaluate("""() => {
                const button = Array.from(document.querySelectorAll('button'))
                  .find(b => /DISPLAY/i.test(b.textContent || ''));
                button.click();
            }""")
            assert await page.get_by_role('button', name='SAVE DISPLAY (PC ONLY)').count() == 1
            await page.get_by_role('button', name='CYCLE NEXT MODE').click()
            await page.wait_for_function("window.__serialCommands.includes('OLED:MODE:1')")
            await page.get_by_role('button', name='CLOSE', exact=True).click()
            print('  ok  OLED mode selection uses numeric ID; pad without OLED offers PC-only Save')

            await page.evaluate('() => window.__sendKeyEvent({index: 0, action: 1})')
            await page.wait_for_timeout(90)
            assert await page.evaluate('window.__actionCalls.length') == 0, 'host duplicated a firmware-owned key'
            await page.evaluate('() => window.__sendKeyEvent({index: 0, action: 0})')
            await page.wait_for_function('window.__actionCalls.length === 1')
            calls = await page.evaluate('window.__actionCalls')
            assert calls[0]['actionId'] == 'host-only-L0', calls
            assert calls[0]['payload']['appName'] == 'Fake App', calls
            print('  ok  device-owned key suppressed, PC-owned key executes once with payload')

            await page.evaluate('() => window.__sendKeyEvent({index: 0, channel: 1, action: 0})')
            await page.wait_for_function('window.__actionCalls.length === 2')
            calls = await page.evaluate('window.__actionCalls')
            assert calls[1]['actionId'] == 'host-only-L1', calls
            assert calls[1]['payload']['keys'] == ['Ctrl', 'Q'], calls
            print('  ok  binary event uses originating channel, not stale selected layer')

            await page.evaluate('() => window.__sendKeyEvent({source: 1, event: 7, value: 3, action: 0})')
            await page.wait_for_function('window.__actionCalls.length === 5')
            calls = await page.evaluate('window.__actionCalls')
            assert [c['actionId'] for c in calls[2:5]] == ['scrub-cw'] * 3, calls
            await page.evaluate('() => window.__sendKeyEvent({source: 1, event: 3, action: 0})')
            await page.wait_for_function('window.__actionCalls.length === 6')
            calls = await page.evaluate('window.__actionCalls')
            assert calls[5]['actionId'] == 'play-toggle', calls
            print('  ok  knob batch preserves three detents and knob tap reaches press binding')

            await page.evaluate('() => window.__sendKeyEvent({index: 8, event: 4, action: 0})')
            await page.evaluate('() => window.__sendKeyEvent({index: 8, event: 5, value: 500, action: 0})')
            await page.wait_for_timeout(100)
            assert await page.evaluate('window.__actionCalls.length') == 6, 'short hold executed safety action'
            await page.evaluate('() => window.__sendKeyEvent({index: 8, event: 4, action: 0})')
            await page.evaluate('() => window.__sendKeyEvent({index: 8, event: 5, value: 1600, action: 0})')
            await page.wait_for_function('window.__actionCalls.length === 7')
            calls = await page.evaluate('window.__actionCalls')
            assert calls[6]['actionId'] == 'act-render', calls
            assert calls[6]['payload']['keys'] == ['Ctrl', 'Shift', 'R'], calls
            print('  ok  physical safety key fails closed on short hold and confirms on verified release')
            assert not errors, errors
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
