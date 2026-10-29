// Real host codec + link + bridge against one fake binary CDC pad. This checks
// request exclusivity, full-frame ACKs, unsolicited mode sync and save priority;
// the firmware's own assembler is covered separately in test_oled_stream.c.
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'oled-wire-'));
  try {
    const outfile = join(tmp, 'entry.mjs');
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      platform: 'neutral', format: 'esm', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

async function main() {
  const p = await bundle('host/protocol/mpad3-protocol.mjs');
  const { Mpad3Link } = await bundle('src/utils/mpad3Link.ts');
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');
  const { CMD, CAP, STATUS, CHUNK_SIZE, CHUNK_COUNT, SIZES, FrameDecoder,
    crc32, decodeOledFrameChunk, defaultConfig, encodeConfig, encodeFrame,
    encodeChunk, decodeChunk } = p;
  const pages = Uint8Array.from({ length: 512 }, (_, i) => (i * 19 + (i >> 7)) & 255);

  function fakePad(options = {}) {
    let mode = 1, epoch = 0xfffe;
    let committed = encodeConfig(defaultConfig());
    let stagingConfig = new Uint8Array(SIZES.config);
    let first = null;
    let link;
    let releaseAck, releaseMode;
    let holdOnce = !!options.holdAck;
    let holdModeOnce = !!options.holdMode;
    let reachedSecond, reachedMode;
    const secondReached = new Promise(resolve => { reachedSecond = resolve; });
    const modeReached = new Promise(resolve => { reachedMode = resolve; });
    const commands = [];
    const chunks = [];
    const reply = (cmd, payload) => link.feed(encodeFrame(cmd, Uint8Array.from(payload)));
    const state = () => [mode, epoch & 255, epoch >> 8];
    const port = { writable: new WritableStream({
      async write(wire) {
        const decoder = new FrameDecoder();
        decoder.push(wire);
        const frame = decoder.next();
        assert.ok(frame, 'one valid MPAD3 frame per writer call');
        const { cmd, payload } = frame;
        commands.push(cmd);
        switch (cmd) {
          case CMD.PING: reply(CMD.PONG, []); break;
          case CMD.GET_INFO: {
            const info = new Uint8Array(16);
            const v = new DataView(info.buffer);
            v.setUint32(0, p.MAGIC_U32, true);
            v.setUint16(4, p.PROTOCOL_VERSION, true);
            v.setUint16(6, p.CONFIG_FORMAT_VERSION, true);
            info[8] = p.CHANNEL_COUNT; info[9] = p.KEY_COUNT; info[10] = p.LED_COUNT;
            info[11] = CAP.FLASH | CAP.OLED | CAP.OLED_STREAM | CAP.EVENTS;
            v.setUint16(12, SIZES.config, true);
            reply(CMD.INFO, info);
            break;
          }
          case CMD.GET_OLED_STATE:
            if (options.initialEvent) reply(CMD.OLED_MODE_EVENT, state());
            reply(CMD.OLED_STATE, state());
            break;
          case CMD.SET_OLED_MODE:
            if (options.rejectMode) { reply(CMD.ERROR, [STATUS.BAD_ARG]); break; }
            mode = payload[0]; epoch = (epoch + 1) & 0xffff;
            if (holdModeOnce) {
              holdModeOnce = false;
              reachedMode();
              await new Promise(resolve => { releaseMode = resolve; });
              // Firmware may deliver its event before the SET reply when an
              // earlier snapshot was queued. It is still an echo of this SET.
              reply(CMD.OLED_MODE_EVENT, state());
              reply(CMD.OLED_STATE, state());
            } else {
              reply(CMD.OLED_STATE, state());
              reply(CMD.OLED_MODE_EVENT, state());
            }
            break;
          case CMD.OLED_FRAME: {
            const part = decodeOledFrameChunk(payload);
            chunks.push(part);
            if (part.index === 0) {
              // Firmware sends one application ERROR only after the final
              // half; an invalid first half is discarded, not double-replied.
              first = options.rejectFirst ? null : part;
            } else {
              if (!first) { reply(CMD.ERROR, [STATUS.BAD_ARG]); break; }
              assert.equal(first.seq, part.seq);
              assert.equal(first.mode, part.mode);
              assert.equal(first.crc32, part.crc32);
              const canvas = Uint8Array.from([...first.pages, ...part.pages]);
              assert.equal(crc32(canvas), first.crc32);
              if (holdOnce) {
                holdOnce = false;
                reachedSecond();
                await new Promise(resolve => { releaseAck = resolve; });
              }
              if (options.rejectSecond) reply(CMD.ERROR, [STATUS.BAD_CRC]);
              else if (!options.dropAck) {
                const seq = options.wrongAck ? part.seq + 1 : part.seq;
                reply(CMD.OLED_FRAME_ACK, [seq & 255, (seq >> 8) & 255, part.mode]);
              }
            }
            break;
          }
          case CMD.GET_CONFIG: {
            const index = payload[0];
            reply(CMD.CONFIG_CHUNK, encodeChunk(index, CHUNK_COUNT,
              committed.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)));
            break;
          }
          case CMD.SET_CONFIG: {
            const part = decodeChunk(payload);
            if (part.index === 0) stagingConfig = new Uint8Array(SIZES.config);
            stagingConfig.set(part.bytes, part.index * CHUNK_SIZE);
            if (part.index === CHUNK_COUNT - 1) reply(CMD.SET_ACK, [STATUS.OK]);
            break;
          }
          case CMD.COMMIT:
            committed = Uint8Array.from(stagingConfig);
            reply(CMD.COMMIT_ACK, [STATUS.OK]);
            break;
          default: assert.fail(`unexpected command ${cmd}`);
        }
      },
    }) };
    link = new Mpad3Link(port);
    return {
      link, commands, chunks, secondReached, modeReached,
      releaseAck: () => { if (releaseAck) releaseAck(); else assert.fail('ACK is not held'); },
      releaseMode: () => { if (releaseMode) releaseMode(); else assert.fail('mode reply is not held'); },
      emit: (nextMode, nextEpoch, physical = false) => {
        if (physical) { mode = nextMode; epoch = nextEpoch; }
        reply(CMD.OLED_MODE_EVENT, [nextMode, nextEpoch & 255, nextEpoch >> 8]);
      },
    };
  }

  {
    const peer = fakePad({ initialEvent: true });
    const events = [];
    peer.link.onFrame(e => { if (e.kind === 'oledMode') events.push(e.state); });
    const info = await peer.link.probe();
    assert.equal(info.hasOledStream, true);
    assert.equal(info.hasOled, true);
    const state = await peer.link.readOledMode();
    assert.deepEqual(state, { mode: 1, epoch: 0xfffe });
    assert.deepEqual(events, [{ mode: 1, epoch: 0xfffe }],
      'an unsolicited event must NOT steal a pending OLED_STATE response');
    assert.equal(await peer.link.streamOledFrame(1, pages), true);
    assert.deepEqual(peer.commands.slice(-2), [CMD.OLED_FRAME, CMD.OLED_FRAME]);
    assert.equal(peer.chunks[0].pages[127], pages[127]);
    assert.equal(peer.chunks[0].pages[128], pages[128]);
    assert.equal(peer.chunks[1].pages[255], pages[511]);
    assert.equal(peer.chunks[0].crc32, crc32(pages));
    assert.equal(await peer.link.setOledMode(9).then(s => s.mode), 9);
    assert.equal(events.at(-1).mode, 9);
    console.log('  ok  v2 probe, initial mode, two page-order chunks, full ACK and unsolicited mode');
  }

  for (const [settings, expected, writes] of [
    [{ rejectFirst: true }, /BAD_ARG/, 2],
    [{ rejectSecond: true }, /BAD_CRC/, 2],
    [{ wrongAck: true }, /another OLED frame/, 2],
    [{ dropAck: true }, /no reply to OLED_FRAME/, 2],
  ]) {
    const peer = fakePad(settings);
    await assert.rejects(peer.link.streamOledFrame(1, pages), expected);
    assert.equal(peer.commands.filter(cmd => cmd === CMD.OLED_FRAME).length, writes);
    assert.equal(await peer.link.streamOledFrame(1, pages).catch(() => false), false,
      'a pad that rejects every frame still cannot report success');
  }
  console.log('  ok  rejected first half, bad CRC, wrong ACK and missing ACK never report a delivered frame');

  {
    const peer = fakePad({ holdAck: true });
    const stream = peer.link.streamOledFrame(1, pages);
    await peer.secondReached;
    const select = peer.link.setOledMode(9);
    assert.equal(await peer.link.streamOledFrame(1, pages), false, 'no overlapping frames');
    assert.ok(!peer.commands.includes(CMD.SET_OLED_MODE), 'a mode command waits for atomic two-chunk slot');
    peer.releaseAck();
    assert.equal(await stream, true);
    assert.deepEqual(await select, { mode: 9, epoch: 0xffff });
    assert.deepEqual(peer.commands.slice(-3), [CMD.OLED_FRAME, CMD.OLED_FRAME, CMD.SET_OLED_MODE]);
    console.log('  ok  mode selection waits for the frame ACK; no binary/ASCII interleaving');
  }

  {
    const peer = fakePad({ holdAck: true });
    const stream = peer.link.streamOledFrame(1, pages);
    await peer.secondReached;
    const save = peer.link.updateConfig(base => ({
      config: { ...base, global: { ...base.global, oledBootMode: 9 } }, result: 9,
    }));
    assert.ok(!peer.commands.includes(CMD.GET_CONFIG));
    peer.releaseAck();
    assert.equal(await stream, true);
    assert.equal(await save, 9);
    assert.equal(await peer.link.streamOledFrame(1, pages), true); // explicit new slot
    assert.deepEqual(peer.commands.slice(0, 2), [CMD.OLED_FRAME, CMD.OLED_FRAME]);
    assert.ok(peer.commands.indexOf(CMD.COMMIT) > peer.commands.indexOf(CMD.SET_CONFIG),
      'flash save must not interleave frame transfer');
    console.log('  ok  Display Save waits for the short stream slot, then runs exclusively');
  }

  {
    // A mode click during a multi-chunk flash save used to hit sendAscii's
    // pending guard and quietly vanish. The bridge must retry the confirmed
    // mode request after the ACK/COMMIT/readback exchange owns the wire.
    const peer = fakePad({ holdAck: true });
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasOledStream: true, hasOled: true, hasFlash: true };
    hardwareBridge.lastOledState = { mode: 1, epoch: 0xfffe };
    hardwareBridge.connectionState = 'connected';
    hardwareBridge.deviceInfo = { type: 'webserial', name: 'fake', protocolReady: true };
    const stream = peer.link.streamOledFrame(1, pages);
    await peer.secondReached;
    const save = peer.link.updateConfig(base => ({ config: base, result: 'saved' }));
    const select = hardwareBridge.selectOledMode('clock');
    assert.ok(!peer.commands.includes(CMD.SET_OLED_MODE));
    peer.releaseAck();
    assert.equal(await stream, true);
    assert.equal(await save, 'saved');
    assert.equal(await select, true);
    assert.ok(peer.commands.indexOf(CMD.SET_OLED_MODE) > peer.commands.indexOf(CMD.COMMIT),
      'mode request must be delivered after the exclusive save');
    assert.equal(hardwareBridge.physicalOledMode, 'clock');
    peer.link.close();
    hardwareBridge.link = null; hardwareBridge.protocolInfo = null;
    hardwareBridge.lastOledState = null; hardwareBridge.deviceInfo = null;
    hardwareBridge.connectionState = 'disconnected';
    console.log('  ok  mode chosen mid-save is retried and confirmed, not silently lost');
  }

  {
    const peer = fakePad({ holdAck: true });
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasOledStream: true, hasOled: true, hasFlash: true };
    hardwareBridge.lastOledState = { mode: 1, epoch: 0xfffe };
    hardwareBridge.connectionState = 'connected';
    hardwareBridge.deviceInfo = { type: 'webserial', name: 'fake', protocolReady: true };
    peer.link.onFrame(e => hardwareBridge.handleLinkEvent(e));
    const stream = peer.link.streamOledFrame(1, pages);
    await peer.secondReached;
    const save = peer.link.updateConfig(base => ({ config: base, result: 'saved' }));
    const oldClick = hardwareBridge.selectOledMode('clock');
    peer.emit(2, 0xffff, true); // pad gesture while the unsent click waits
    assert.equal(hardwareBridge.physicalOledMode, 'media');
    peer.releaseAck();
    assert.equal(await stream, true);
    assert.equal(await save, 'saved');
    assert.equal(await oldClick, false);
    assert.ok(!peer.commands.includes(CMD.SET_OLED_MODE),
      'the old pending UI choice must not overwrite a newer physical gesture');
    peer.link.close();
    hardwareBridge.link = null; hardwareBridge.protocolInfo = null;
    hardwareBridge.lastOledState = null; hardwareBridge.deviceInfo = null;
    hardwareBridge.connectionState = 'disconnected';
    console.log('  ok  pad gesture cancels an unsent UI mode intent during a flash save');
  }

  {
    // An older UI SET already on the wire can emit an event while a second
    // click is waiting. Its echo must not be mistaken for a pad gesture.
    const peer = fakePad({ holdMode: true });
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasOledStream: true, hasOled: true, hasFlash: true };
    hardwareBridge.lastOledState = { mode: 1, epoch: 0xfffe };
    hardwareBridge.connectionState = 'connected';
    hardwareBridge.deviceInfo = { type: 'webserial', name: 'fake', protocolReady: true };
    peer.link.onFrame(e => hardwareBridge.handleLinkEvent(e));
    const firstClick = hardwareBridge.selectOledMode('clock');
    await peer.modeReached;
    const newerClick = hardwareBridge.selectOledMode('channel');
    peer.releaseMode();
    assert.equal(await firstClick, false, 'the older selection is superseded');
    assert.equal(await newerClick, true, 'its event cannot cancel the later click');
    assert.equal(hardwareBridge.physicalOledMode, 'channel');
    assert.equal(peer.commands.filter(cmd => cmd === CMD.SET_OLED_MODE).length, 2);
    peer.link.close();
    hardwareBridge.link = null; hardwareBridge.protocolInfo = null;
    hardwareBridge.lastOledState = null; hardwareBridge.deviceInfo = null;
    hardwareBridge.connectionState = 'disconnected';
    console.log('  ok  event echo from an in-flight older SET does not cancel a newer UI click');
  }

  {
    const peer = fakePad({ initialEvent: true });
    hardwareBridge.link = peer.link;
    hardwareBridge.serialPort = {}; // fake connected CDC
    hardwareBridge.deviceInfo = { type: 'webserial', name: 'fake', protocolReady: false };
    hardwareBridge.connectionState = 'connected';
    hardwareBridge.protocolInfo = null;
    hardwareBridge.lastOledState = null;
    const seen = [];
    const off = hardwareBridge.onOledMode(mode => seen.push(mode));
    await hardwareBridge.probeProtocol();
    assert.equal(hardwareBridge.deviceInfo.hasOledStream, true);
    assert.equal(hardwareBridge.physicalOledMode, 'system');
    assert.deepEqual(seen, ['system'], 'initial event + GET_STATE must not double-emit');
    peer.emit(9, 0xffff, true);
    peer.emit(1, 0xfffe); // stale
    peer.emit(9, 0xffff); // duplicate
    assert.deepEqual(seen, ['system', 'clock']);
    peer.emit(2, 0, true); // wrap
    assert.deepEqual(seen, ['system', 'clock', 'media']);
    assert.equal(hardwareBridge.physicalOledMode, 'media');
    assert.equal(await hardwareBridge.streamOledFrame('loader', pages), false, 'baked art stays local');
    assert.equal(await hardwareBridge.streamOledFrame('clock', pages), false, 'stale UI mode is not streamed');
    assert.equal(await hardwareBridge.streamOledFrame('media', pages), true);
    assert.equal(await hardwareBridge.selectOledMode('clock'), true);
    assert.equal(hardwareBridge.physicalOledMode, 'clock');
    assert.equal(seen.at(-1), 'clock');
    off();
    peer.link.close();
    hardwareBridge.link = null; hardwareBridge.serialPort = null;
    hardwareBridge.protocolInfo = null; hardwareBridge.lastOledState = null;
    hardwareBridge.connectionState = 'disconnected'; hardwareBridge.deviceInfo = null;
    console.log('  ok  pad timer/gesture events sync app mode, wrap epoch, reject stale and skip baked frames');
  }

  console.log('OLED link + bridge: all fake-pad assertions passed');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
