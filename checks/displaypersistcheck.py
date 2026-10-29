"""Browser UI against a fake v3 USB CDC peer; no real OLED/flash is tested.

Run with Vite on localhost:5173: python3 checks/displaypersistcheck.py
Verifies pad-success UI only after GET_INFO, GET_CONFIG, SET_ACK, COMMIT_ACK and
full readback; missing panel and failed COMMIT cannot show device success.
"""
import asyncio
from playwright.async_api import async_playwright

FAKE_PAD = r"""(() => {
  window.__pad = {
    present: true, failCommit: false, commands: [], commits: 0,
    written: [], committed: null,
  };
  const pad = window.__pad;
  let controller;
  let staged = null;
  const readable = new ReadableStream({ start(c) { controller = c; } });
  const p = import('/host/protocol/mpad3-protocol.mjs');
  const respond = (proto, cmd, payload) =>
    controller.enqueue(proto.encodeFrame(cmd, payload));
  const writable = new WritableStream({
    async write(frame) {
      if (frame[0] !== 0xA5 || frame[1] !== 0x5A) {
        pad.written.push(new TextDecoder().decode(frame).trim());
        return;
      }
      const proto = await p;
      const parser = new proto.FrameDecoder();
      parser.push(frame);
      const req = parser.next();
      if (!req) throw new Error('invalid request frame');
      pad.commands.push(req.cmd);
      if (pad.committed === null) {
        const init = proto.defaultConfig();
        init.channels[3].keys[8] = {
          type: proto.ACTION_TYPE.TEXT, code: 0, flags: 0, text: 'keep-my-key',
        };
        init.channels[3].lighting.brightness = 37;
        init.global.holdMs = 417;
        pad.committed = proto.encodeConfig(init);
      }
      if (req.cmd === proto.CMD.PING) {
        respond(proto, proto.CMD.PONG, new Uint8Array(0));
      } else if (req.cmd === proto.CMD.GET_INFO) {
        const info = new Uint8Array(16), v = new DataView(info.buffer);
        v.setUint32(0, proto.MAGIC_U32, true);
        v.setUint16(4, proto.PROTOCOL_VERSION, true);
        v.setUint16(6, proto.CONFIG_FORMAT_VERSION, true);
        info[8] = proto.CHANNEL_COUNT;
        info[9] = proto.KEY_COUNT;
        info[10] = 9;
        info[11] = proto.CAP.FLASH | proto.CAP.EVENTS |
          (pad.present ? proto.CAP.OLED : 0);
        v.setUint16(12, proto.SIZES.config, true);
        v.setUint16(14, 91, true);
        respond(proto, proto.CMD.INFO, info);
      } else if (req.cmd === proto.CMD.GET_CONFIG) {
        const i = req.payload[0];
        const bytes = pad.committed.subarray(i * proto.CHUNK_SIZE, (i + 1) * proto.CHUNK_SIZE);
        respond(proto, proto.CMD.CONFIG_CHUNK, proto.encodeChunk(i, proto.CHUNK_COUNT, bytes));
      } else if (req.cmd === proto.CMD.SET_CONFIG) {
        const chunk = proto.decodeChunk(req.payload);
        if (chunk.index === 0) staged = new Uint8Array(proto.SIZES.config);
        staged.set(chunk.bytes, chunk.index * proto.CHUNK_SIZE);
        if (chunk.index === proto.CHUNK_COUNT - 1)
          respond(proto, proto.CMD.SET_ACK, new Uint8Array([proto.STATUS.OK]));
      } else if (req.cmd === proto.CMD.COMMIT) {
        if (!pad.failCommit) {
          pad.committed = Uint8Array.from(staged);
          pad.commits++;
        }
        respond(proto, proto.CMD.COMMIT_ACK, new Uint8Array([
          pad.failCommit ? proto.STATUS.FLASH_FAIL : proto.STATUS.OK,
        ]));
      } else throw new Error(`unexpected command ${req.cmd}`);
    },
  });
  const port = { readable, writable, async open() {},
    async close() { controller.close(); } };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: async () => port,
  }});
  window.__pad.read = async () => (await p).decodeConfig(pad.committed);
  window.__pad.cmd = async name => (await p).CMD[name];
})();"""


async def connect(page):
    await page.locator('header button:has(.mark--off)').click()
    await page.get_by_role('button', name='USB serial').click()
    await page.get_by_text('MPAD3 READY', exact=True).wait_for(timeout=6000)


async def open_display(page):
    await page.get_by_role('button', name='03 Display OLED mode').click()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1536, 'height': 920})
        await page.add_init_script(FAKE_PAD)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        try:
            await page.goto('http://localhost:5173/', wait_until='networkidle')
            await connect(page)
            await open_display(page)
            await page.get_by_role('button', name='SAVE DISPLAY TO PAD').wait_for()
            await page.get_by_role('button', name='CYCLE NEXT MODE').click()
            await page.wait_for_function("window.__pad.written.includes('OLED:MODE:1')")
            await page.get_by_role('button', name='APPEARANCE & TEXT').click()
            await page.locator('input[type="range"]').last.fill('71')
            await page.get_by_text('INVERT COLORS').locator('..').locator('..').get_by_role('button').click()
            await page.get_by_role('button', name='SAVE DISPLAY TO PAD').click()
            await page.get_by_role('button', name='SAVED TO PAD').wait_for(timeout=7000)
            saved = await page.evaluate('window.__pad.read()')
            assert saved['global']['oledBootMode'] == 1, saved['global']
            assert saved['global']['oledContrast'] == round(71 * 255 / 100), saved['global']
            assert saved['global']['oledInverted'] == 1
            assert saved['global']['holdMs'] == 417
            assert saved['channels'][3]['keys'][8]['text'] == 'keep-my-key'
            assert saved['channels'][3]['lighting']['brightness'] == 37
            assert await page.evaluate('window.__pad.commits') == 1
            written = await page.evaluate('window.__pad.written')
            assert not any(x.startswith(('OLED:AUTO:', 'OLED:PL:')) for x in written), written
            print('  ok  OLED-capable pad shows SAVED TO PAD after verified flash transaction; bindings preserved')

            await page.get_by_role('button', name='CYCLE NEXT MODE').click()
            await page.evaluate('window.__pad.failCommit = true')
            await page.get_by_role('button', name='SAVE DISPLAY TO PAD').click()
            await page.get_by_text('NOT SAVED TO PAD:', exact=False).wait_for(timeout=7000)
            assert await page.get_by_role('button', name='SAVED TO PAD').count() == 0
            assert await page.evaluate('window.__pad.commits') == 1
            print('  ok  failed COMMIT remains a visible failure and never claims device success')

            await page.evaluate('window.__pad.failCommit = false; window.__pad.present = false')
            await page.get_by_role('button', name='SAVE DISPLAY TO PAD').click()
            await page.get_by_text('no longer reports a responding OLED', exact=False).wait_for(timeout=7000)
            assert await page.evaluate('window.__pad.commits') == 1
            print('  ok  disconnected OLED after probe prevents another flash write')
            assert not errors, errors

            missing = await browser.new_page(viewport={'width': 1536, 'height': 920})
            await missing.add_init_script(FAKE_PAD)
            await missing.goto('http://localhost:5173/', wait_until='networkidle')
            await missing.evaluate('window.__pad.present = false')
            await connect(missing)
            await open_display(missing)
            await missing.get_by_role('button', name='SAVE DISPLAY (PC ONLY)').click()
            assert await missing.get_by_role('button', name='SAVED ON PC ONLY').count() == 1
            assert await missing.evaluate('window.__pad.commits') == 0
            print('  ok  panel missing at probe offers PC-only save, not a device-success path')
            print('displaypersistcheck: all browser assertions passed')
        finally:
            await browser.close()


asyncio.run(main())
