"""Browser/React integration with a fake v2 SSD1306 pad, not physical proof.

Run with Vite on localhost:5173: python3 checks/oledstreamcheck.py
Exercises initial GET_OLED_STATE vs saved boot mode, unsolicited pad rotation,
no mode echo, live frame delivery with a hidden preview, media/metrics changes,
baked autonomy, and user-select ACK. Firmware assembler/TTL have C tests.
"""
import asyncio
from playwright.async_api import async_playwright

FAKE_PAD = r"""(() => {
  let controller;
  let stagedFrame = null;
  const protoPromise = import('/host/protocol/mpad3-protocol.mjs');
  const pad = window.__oled = {
    mode: 9, epoch: 51, commands: [], frameCount: 0, lastFrame: null,
    modeSetCount: 0, written: [], committed: null,
  };
  const readable = new ReadableStream({ start(c) { controller = c; } });
  const reply = (proto, cmd, bytes) => controller.enqueue(proto.encodeFrame(cmd, Uint8Array.from(bytes)));
  const state = () => [pad.mode, pad.epoch & 255, pad.epoch >> 8];
  const writable = new WritableStream({
    async write(wire) {
      if (wire[0] !== 0xA5 || wire[1] !== 0x5A) {
        pad.written.push(new TextDecoder().decode(wire).trim());
        return;
      }
      const proto = await protoPromise;
      const decoder = new proto.FrameDecoder();
      decoder.push(wire);
      const req = decoder.next();
      if (!req) throw new Error('corrupted MPAD3 host frame');
      pad.commands.push(req.cmd);
      if (pad.committed === null) {
        const cfg = proto.defaultConfig();
        cfg.global.oledBootMode = 0; // stale boot screen; physical mode is CLOCK(9)
        pad.committed = proto.encodeConfig(cfg);
      }
      if (req.cmd === proto.CMD.PING) reply(proto, proto.CMD.PONG, []);
      else if (req.cmd === proto.CMD.GET_INFO) {
        const info = new Uint8Array(16), v = new DataView(info.buffer);
        v.setUint32(0, proto.MAGIC_U32, true);
        v.setUint16(4, proto.PROTOCOL_VERSION, true);
        v.setUint16(6, proto.CONFIG_FORMAT_VERSION, true);
        info[8] = proto.CHANNEL_COUNT; info[9] = proto.KEY_COUNT; info[10] = proto.LED_COUNT;
        info[11] = proto.CAP.FLASH | proto.CAP.EVENTS | proto.CAP.OLED | proto.CAP.OLED_STREAM;
        v.setUint16(12, proto.SIZES.config, true);
        reply(proto, proto.CMD.INFO, info);
      } else if (req.cmd === proto.CMD.GET_OLED_STATE) {
        // Event arrives before the reply. Distinct commands prevent request theft.
        reply(proto, proto.CMD.OLED_MODE_EVENT, state());
        reply(proto, proto.CMD.OLED_STATE, state());
      } else if (req.cmd === proto.CMD.GET_CONFIG) {
        const i = req.payload[0];
        const bytes = pad.committed.subarray(i * proto.CHUNK_SIZE, (i + 1) * proto.CHUNK_SIZE);
        reply(proto, proto.CMD.CONFIG_CHUNK, proto.encodeChunk(i, proto.CHUNK_COUNT, bytes));
      } else if (req.cmd === proto.CMD.SET_OLED_MODE) {
        pad.modeSetCount++;
        pad.mode = req.payload[0];
        pad.epoch++;
        reply(proto, proto.CMD.OLED_STATE, state());
        reply(proto, proto.CMD.OLED_MODE_EVENT, state());
      } else if (req.cmd === proto.CMD.OLED_FRAME) {
        const part = proto.decodeOledFrameChunk(req.payload);
        if (part.mode !== pad.mode) {
          reply(proto, proto.CMD.ERROR, [proto.STATUS.BAD_ARG]);
          stagedFrame = null;
          return;
        }
        if (part.index === 0) {
          stagedFrame = part;
        } else {
          if (!stagedFrame || part.seq !== stagedFrame.seq || part.crc32 !== stagedFrame.crc32)
            throw new Error('host mixed OLED halves');
          const pages = Uint8Array.from([...stagedFrame.pages, ...part.pages]);
          if (pages.length !== 512 || proto.crc32(pages) !== stagedFrame.crc32)
            throw new Error('host OLED frame CRC mismatch');
          pad.frameCount++;
          pad.lastFrame = { mode: part.mode, seq: part.seq,
            pages: Array.from(pages), crc: proto.crc32(pages) };
          reply(proto, proto.CMD.OLED_FRAME_ACK,
            [part.seq & 255, part.seq >> 8, part.mode]);
          stagedFrame = null;
        }
      } else throw new Error(`unexpected host command ${req.cmd}`);
    },
  });
  const port = { readable, writable, async open() {}, async close() { controller.close(); } };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    requestPort: async () => port,
  }});
  pad.advance = async (nextMode) => {
    const proto = await protoPromise;
    pad.mode = nextMode;
    pad.epoch++;
    reply(proto, proto.CMD.OLED_MODE_EVENT, state());
  };
  pad.disconnect = () => controller.close();
  // Only the actual native callbacks can supply readings; a browser with no
  // native data would truthfully show -- / NO MEDIA instead of invented values.
  window.electronAPI = {
    onSystemMetrics(cb) { pad.pushMetrics = cb; return () => {}; },
    onMediaState(cb) { pad.pushMedia = cb; return () => {}; },
    getNowPlaying: async () => ({ ok: true, value: null }),
  };
})();"""

async def wait_mode(page, name):
    await page.wait_for_function(
        "name => JSON.parse(localStorage.getItem('kadowaz_oled') || '{}').mode === name",
        arg=name, timeout=5000)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1536, 'height': 920})
        await page.add_init_script(FAKE_PAD)
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        try:
            await page.goto('http://localhost:5173/', wait_until='networkidle')
            await page.locator('header button:has(.mark--off)').click()
            await page.get_by_role('button', name='USB serial').click()
            await page.get_by_text('MPAD3 READY', exact=True).wait_for(timeout=6000)
            await wait_mode(page, 'clock')
            await page.wait_for_function('window.__oled.frameCount >= 2', timeout=5000)
            initial = await page.evaluate('({ sets: __oled.modeSetCount, mode: __oled.lastFrame.mode, length: __oled.lastFrame.pages.length, hasInk: __oled.lastFrame.pages.some(Boolean) })')
            assert initial == {'sets': 0, 'mode': 9, 'length': 512, 'hasInk': True}, initial
            assert await page.evaluate('JSON.parse(localStorage.getItem("kadowaz_oled")).mode') == 'clock', 'saved boot mode must not overwrite live clock'
            print('  ok  physical CLOCK wins over saved boot mode; 512-byte PC-rendered frames arrive without mode echo')

            # The canvas preview explicitly pauses when hidden; the serial timer
            # must continue to produce live frames independent of that RAF.
            await page.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })")
            before = await page.evaluate('window.__oled.frameCount')
            await page.wait_for_function('minimum => window.__oled.frameCount >= minimum', arg=before + 2, timeout=5000)
            print('  ok  runtime streaming continues while the preview is hidden')
            await page.evaluate("delete document.visibilityState")

            await page.evaluate('window.__oled.advance(1)') # physical SYSTEM
            await wait_mode(page, 'system')
            await page.wait_for_function('window.__oled.lastFrame?.mode === 1')
            assert await page.evaluate('window.__oled.modeSetCount') == 0, 'pad-originated mode event was echoed to SET_OLED_MODE'
            before_crc = await page.evaluate('window.__oled.lastFrame.crc')
            await page.evaluate('window.__oled.pushMetrics({cpu:83, gpu:47, ram:61, temp:54, sources:{cpu:"fake",gpu:"fake",temp:"fake"}})')
            await page.wait_for_function('before => window.__oled.lastFrame?.mode === 1 && window.__oled.lastFrame.crc !== before', arg=before_crc)
            print('  ok  pad-originated mode sync has no echo; new measured metrics change physical pixels')

            await page.evaluate('window.__oled.advance(4)') # baked LOADER
            await wait_mode(page, 'loader')
            await page.wait_for_timeout(300) # allow an already-in-flight frame to settle
            before = await page.evaluate('window.__oled.frameCount')
            await page.wait_for_timeout(450)
            assert await page.evaluate('window.__oled.frameCount') == before, 'baked animation must stay on device'
            await page.evaluate('window.__oled.advance(2)') # physical MEDIA, no track
            await wait_mode(page, 'media')
            await page.wait_for_function('window.__oled.lastFrame?.mode === 2')
            before_crc = await page.evaluate('window.__oled.lastFrame.crc')
            await page.evaluate('window.__oled.pushMedia({title:"REAL TRACK", artist:"ARTIST", isPlaying:true, progress:41})')
            await page.wait_for_function('before => window.__oled.lastFrame?.mode === 2 && window.__oled.lastFrame.crc !== before', arg=before_crc)
            print('  ok  baked mode sends no frames; media session updates the 512-byte physical canvas')

            await page.get_by_role('button', name='03 Display OLED mode').click()
            await page.get_by_role('button', name='CYCLE NEXT MODE').click()
            await wait_mode(page, 'channel')
            await page.wait_for_function('window.__oled.mode === 3 && window.__oled.modeSetCount === 1')
            await page.wait_for_timeout(250)
            assert await page.evaluate('window.__oled.modeSetCount') == 1, 'host selection echoed itself'
            print('  ok  app-originated selection is confirmed exactly once by the pad')

            await page.evaluate('window.__oled.disconnect()')
            await page.wait_for_function('window.__oled.frameCount > 0')
            before = await page.evaluate('window.__oled.frameCount')
            await page.wait_for_timeout(1450)
            assert await page.evaluate('window.__oled.frameCount') == before, 'no USB frames after disconnect'
            assert not errors, errors
            print('  ok  disconnect stops host producer; C tests cover 1.2s firmware local fallback')
            print('oledstreamcheck: all browser assertions passed (fake CDC; no assembled OLED)')
        finally:
            await browser.close()

asyncio.run(main())
