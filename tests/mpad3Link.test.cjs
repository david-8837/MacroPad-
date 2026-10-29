/** Fake serial peer: exercise ACK ordering, flash commits and readback. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'mpad3-link-'));
  try {
    const outfile = join(tmp, 'module.mjs');
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const protocol = await bundle('host/protocol/mpad3-protocol.mjs');
  const { Mpad3Link } = await bundle('src/utils/mpad3Link.ts');
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');
  const { CMD, STATUS, CHUNK_COUNT, CHUNK_SIZE, SIZES,
    FrameDecoder, defaultConfig, encodeConfig, decodeConfig, encodeFrame, encodeChunk,
    decodeChunk, encodeLighting, decodeLighting } = protocol;

  function createPeer(options = {}) {
    const commands = [];
    let committed = encodeConfig(options.initialConfig ?? defaultConfig());
    let staging = new Uint8Array(SIZES.config);
    let staged = null;
    let storedLighting = encodeLighting(0, defaultConfig().channels[0].lighting).subarray(1);
    let liveLighting = Uint8Array.from(storedLighting);
    let link;
    const reply = (command, payload) => link.feed(encodeFrame(command, Uint8Array.from(payload)));
    const port = {
      writable: new WritableStream({
        write(frame) {
          const decoder = new FrameDecoder();
          decoder.push(frame);
          const message = decoder.next();
          assert.ok(message, 'host wrote a valid frame');
          const { cmd, payload } = message;
          commands.push(cmd);
          if (cmd === CMD.SET_CONFIG) {
            const chunk = decodeChunk(payload);
            if (chunk.index === options.rejectChunk) {
              reply(CMD.ERROR, [STATUS.BAD_CRC]);
              return;
            }
            if (chunk.index === 0) staging = new Uint8Array(SIZES.config);
            staging.set(chunk.bytes, chunk.index * CHUNK_SIZE);
            if (chunk.index === CHUNK_COUNT - 1) {
              staged = Uint8Array.from(staging);
              if (options.disconnectOnLastChunk) link.close();
              else if (!options.noSetAck) reply(CMD.SET_ACK, options.emptySetAck ? [] : [STATUS.OK]);
            }
          } else if (cmd === CMD.GET_INFO) {
            const info = new Uint8Array(16);
            const view = new DataView(info.buffer);
            view.setUint32(0, protocol.MAGIC_U32, true);
            view.setUint16(4, protocol.PROTOCOL_VERSION, true);
            view.setUint16(6, protocol.CONFIG_FORMAT_VERSION, true);
            info[8] = protocol.CHANNEL_COUNT;
            info[9] = protocol.KEY_COUNT;
            info[10] = 9;
            info[11] = protocol.CAP.FLASH | (options.oledDropped ? 0 : protocol.CAP.OLED) |
              (options.ledOutput ? protocol.CAP.LED_OUTPUT : 0);
            view.setUint16(12, SIZES.config, true);
            reply(CMD.INFO, info);
          } else if (cmd === CMD.GET_CONFIG) {
            const index = payload[0];
            const slice = committed.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
            reply(CMD.CONFIG_CHUNK, encodeChunk(index, CHUNK_COUNT, slice));
          } else if (cmd === CMD.SET_LIGHTING || cmd === CMD.PREVIEW_LIGHTING) {
            if (cmd === CMD.PREVIEW_LIGHTING && !options.ledOutput) {
              reply(CMD.ERROR, [STATUS.LED_DISABLED]);
              return;
            }
            if (options.rejectLighting) {
              reply(CMD.ERROR, [STATUS.BAD_ARG]);
              return;
            }
            liveLighting = Uint8Array.from(payload.subarray(1));
            reply(CMD.SET_ACK, [STATUS.OK]);
          } else if (cmd === CMD.LED_TEST) {
            if (!options.ledOutput) reply(CMD.ERROR, [STATUS.LED_DISABLED]);
            else if (options.rejectLedTest) reply(CMD.ERROR, [STATUS.BAD_ARG]);
            else reply(CMD.SET_ACK, [STATUS.OK]);
          } else if (cmd === CMD.COMMIT) {
            if (options.commitFailure) {
              reply(CMD.COMMIT_ACK, [STATUS.FLASH_FAIL]);
              return;
            }
            if (staged && !options.staleConfig) committed = Uint8Array.from(staged);
            if (!options.staleLighting) storedLighting = Uint8Array.from(liveLighting);
            reply(CMD.COMMIT_ACK, [STATUS.OK]);
          } else if (cmd === CMD.GET_LIGHTING) {
            const channel = options.wrongLightingChannel ? payload[0] + 1 : payload[0];
            const bytes = options.staleLighting ? storedLighting : liveLighting;
            reply(CMD.LIGHTING, [channel, ...bytes]);
          } else {
            assert.fail(`unexpected request: ${cmd}`);
          }
        },
      }),
    };
    link = new Mpad3Link(port);
    return {
      link, commands,
      get committed() { return committed; },
      reboot() { liveLighting = Uint8Array.from(storedLighting); },
      get lighting() { return decodeLighting(Uint8Array.from(storedLighting)); },
    };
  }

  // An open COM port is not proof of a compatible pad. A PONG followed by
  // malformed or foreign INFO must never enable configuration upload.
  function probePeer(overrides = {}) {
    const info = new Uint8Array(16);
    const view = new DataView(info.buffer);
    view.setUint32(0, overrides.magic ?? protocol.MAGIC_U32, true);
    view.setUint16(4, overrides.version ?? protocol.PROTOCOL_VERSION, true);
    view.setUint16(6, overrides.configVersion ?? protocol.CONFIG_FORMAT_VERSION, true);
    info[8] = overrides.channels ?? protocol.CHANNEL_COUNT;
    info[9] = overrides.keys ?? protocol.KEY_COUNT;
    info[10] = 9;
    info[11] = overrides.capabilities ?? (protocol.CAP.FLASH | protocol.CAP.EVENTS | protocol.CAP.OLED);
    view.setUint16(12, overrides.configSize ?? SIZES.config, true);
    view.setUint16(14, 42, true);
    let link;
    const port = { writable: new WritableStream({ write(frame) {
      const decoder = new FrameDecoder();
      decoder.push(frame);
      const request = decoder.next();
      if (request.cmd === CMD.PING) link.feed(encodeFrame(CMD.PONG, new Uint8Array(0)));
      else if (request.cmd === CMD.GET_INFO) link.feed(encodeFrame(CMD.INFO, info));
      else assert.fail(`unexpected probe request ${request.cmd}`);
    } }) };
    link = new Mpad3Link(port);
    return link;
  }
  const verifiedInfo = await probePeer().probe();
  assert.equal(verifiedInfo.channels, protocol.CHANNEL_COUNT);
  assert.equal(verifiedInfo.hasFlash, true);
  assert.equal(verifiedInfo.hasEvents, true);
  assert.equal(verifiedInfo.hasOled, true);
  assert.equal(verifiedInfo.hasLedOutput, false, 'safe default does not claim LED drive');
  assert.equal((await probePeer({ capabilities: protocol.CAP.FLASH | protocol.CAP.LED_OUTPUT }).probe()).hasLedOutput, true,
    'only the bench build advertises physical LED data output');
  assert.equal((await probePeer({ capabilities: protocol.CAP.FLASH }).probe()).hasOled, false,
    'an absent I²C ACK must not advertise a physical OLED');
  for (const invalid of [
    { magic: 0 }, { version: 99 }, { configVersion: 99 },
    { channels: 3 }, { keys: 8 }, { configSize: 1708 },
  ]) {
    await assert.rejects(probePeer(invalid).probe(), /does not match this MPAD3/);
  }
  assert.equal((await probePeer({ capabilities: 0 }).probe()).hasFlash, false);
  console.log('  ok  protocol probe rejects foreign/incompatible ports and reports flash capability');

  {
    let link;
    const port = { writable: new WritableStream({ write(frame) {
      const decoder = new FrameDecoder();
      decoder.push(frame);
      assert.equal(decoder.next()?.cmd, CMD.PING);
      link.feed(encodeFrame(CMD.PONG, new Uint8Array(0)));
    } }) };
    link = new Mpad3Link(port);
    const realWrite = link.write.bind(link);
    let failsOnce = true;
    // Simulate a transient writer acquisition failure. A WHATWG stream sink
    // throwing would permanently error the stream, which is a different case.
    link.write = async frame => {
      if (failsOnce) { failsOnce = false; throw new Error('transient USB write error'); }
      return realWrite(frame);
    };
    await assert.rejects(link.request(CMD.PING, new Uint8Array(0), CMD.PONG), /transient USB write error/);
    await link.request(CMD.PING, new Uint8Array(0), CMD.PONG);
    console.log('  ok  one rejected writer fails its request without permanently poisoning the queue');
  }

  const cfg = defaultConfig();
  cfg.channels[2].keys[4] = { type: protocol.ACTION_TYPE.KEYCODE, code: 0x506, flags: 0, text: '' };

  {
    const peer = createPeer();
    const counts = [], phases = [];
    await peer.link.writeConfig(cfg, (n) => counts.push(n), (phase) => phases.push(phase));
    assert.deepEqual(counts, Array.from({ length: CHUNK_COUNT }, (_, i) => i + 1));
    assert.deepEqual(phases, ['committing', 'verifying']);
    assert.equal(peer.commands.filter((c) => c === CMD.SET_CONFIG).length, CHUNK_COUNT);
    assert.equal(peer.commands.filter((c) => c === CMD.COMMIT).length, 1);
    assert.equal(peer.commands.filter((c) => c === CMD.GET_CONFIG).length, CHUNK_COUNT);
    assert.deepEqual(peer.committed, encodeConfig(cfg));
    console.log('  ok  final SET_ACK, COMMIT_ACK, and full matching readback certify an upload');
  }

  {
    const previous = defaultConfig();
    previous.global.bootChannel = 3;
    previous.global.holdMs = 417;
    previous.channels[3].keys[8] = { type: protocol.ACTION_TYPE.TEXT, code: 0,
      flags: 0, text: 'keep-my-key' };
    previous.channels[3].lighting.brightness = 37;
    const peer = createPeer({ initialConfig: previous });
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasFlash: true, hasOled: true };
    const saved = {
      mode: 'clock', brightness: 71, inverted: true,
      autoCycleS: 14, playlist: ['loader', 'clock'],
    };
    await hardwareBridge.saveDisplaySettings(saved);
    const stored = decodeConfig(peer.committed);
    const firstChannel = protocol.OFFSETS.config.channels;
    const endChannels = protocol.OFFSETS.config.crc32;
    assert.deepEqual(peer.committed.subarray(firstChannel, endChannels),
      encodeConfig(previous).subarray(firstChannel, endChannels),
      'all binding and lighting bytes survive Display Save');
    assert.equal(stored.global.bootChannel, 3, 'existing boot layer survives');
    assert.equal(stored.global.holdMs, 417, 'existing gesture timing survives');
    assert.equal(stored.global.oledBootMode, 9);
    assert.equal(stored.global.oledContrast, Math.round(71 * 255 / 100));
    assert.equal(stored.global.oledInverted, 1);
    assert.equal(stored.global.oledAutoCycleS, 14);
    assert.equal(stored.global.oledPlaylist, (1 << 4) | (1 << 9));
    assert.equal(peer.commands.filter(c => c === CMD.GET_CONFIG).length, CHUNK_COUNT * 2,
      'one validated read before the write and one after COMMIT');
    assert.equal(peer.commands.filter(c => c === CMD.COMMIT).length, 1);
    assert.deepEqual(await hardwareBridge.readDisplaySettings(), saved);
    hardwareBridge.protocolInfo = { hasFlash: true, hasOled: false };
    await assert.rejects(hardwareBridge.saveDisplaySettings(saved), /responding OLED/);
    hardwareBridge.protocolInfo = { hasFlash: false, hasOled: true };
    await assert.rejects(hardwareBridge.saveDisplaySettings(saved), /with flash/);
    hardwareBridge.link = null;
    hardwareBridge.protocolInfo = null;
    console.log('  ok  Display Save preserves keys, lights and globals; readback and OLED capability are required');
  }

  {
    const peer = createPeer({ oledDropped: true });
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasFlash: true, hasOled: true }; // last probe was valid
    await assert.rejects(hardwareBridge.saveDisplaySettings({
      mode: 'media', brightness: 56, inverted: false, autoCycleS: 30, playlist: ['media'],
    }), /no longer reports a responding OLED/);
    assert.ok(!peer.commands.includes(CMD.SET_CONFIG) && !peer.commands.includes(CMD.COMMIT));
    hardwareBridge.link = null;
    hardwareBridge.protocolInfo = null;
    console.log('  ok  OLED disappearing after connection blocks the flash write before GET_CONFIG');
  }

  for (const options of [{ commitFailure: true }, { staleConfig: true }]) {
    const peer = createPeer(options);
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasFlash: true, hasOled: true };
    await assert.rejects(hardwareBridge.saveDisplaySettings({
      mode: 'rain', brightness: 43, inverted: false, autoCycleS: 9, playlist: ['rain'],
    }), options.commitFailure ? /FLASH_FAIL/ : /readback differs/);
    assert.equal(decodeConfig(peer.committed).global.oledBootMode, 0,
      'no failed device save is reported as stored');
    hardwareBridge.link = null;
    hardwareBridge.protocolInfo = null;
  }
  console.log('  ok  failed COMMIT or stale readback refuses Display Save');

  {
    const peer = createPeer();
    const first = peer.link.updateConfig(base => ({
      config: { ...base, global: { ...base.global, oledBootMode: 8 } }, result: 'first',
    }));
    await assert.rejects(peer.link.updateConfig(base => ({ config: base, result: 'second' })), /busy/);
    await assert.rejects(peer.link.sendAscii('OLED:MODE:1'), /busy/);
    assert.equal(await first, 'first');
    assert.equal(decodeConfig(peer.committed).global.oledBootMode, 8);
    console.log('  ok  read/modify/write is exclusive and ASCII cannot interleave the binary transaction');
  }

  for (const rejectChunk of [0, 4, CHUNK_COUNT - 1]) {
    const peer = createPeer({ rejectChunk });
    await assert.rejects(peer.link.writeConfig(cfg), /BAD_CRC/);
    assert.ok(!peer.commands.includes(CMD.COMMIT), 'never commit after a rejected chunk');
    console.log(`  ok  rejected chunk ${rejectChunk} aborts without a flash commit`);
  }

  {
    const peer = createPeer({ disconnectOnLastChunk: true });
    await assert.rejects(peer.link.writeConfig(cfg), /port closed/);
    assert.ok(!peer.commands.includes(CMD.COMMIT));
    console.log('  ok  disconnect before the final SET_ACK aborts the upload');
  }

  {
    const peer = createPeer({ emptySetAck: true });
    await assert.rejects(peer.link.writeConfig(cfg), /missing status/);
    assert.ok(!peer.commands.includes(CMD.COMMIT));
    console.log('  ok  malformed empty SET_ACK cannot certify a save');
  }

  {
    const peer = createPeer({ noSetAck: true });
    await assert.rejects(peer.link.writeConfig(cfg), /no reply to SET_CONFIG/);
    assert.ok(!peer.commands.includes(CMD.COMMIT));
    console.log('  ok  missing final SET_ACK times out without committing');
  }

  {
    const peer = createPeer({ commitFailure: true });
    await assert.rejects(peer.link.writeConfig(cfg), /FLASH_FAIL/);
    assert.equal(peer.commands.filter((c) => c === CMD.GET_CONFIG).length, 0);
    console.log('  ok  failed flash COMMIT is not mistaken for success');
  }

  {
    const peer = createPeer({ staleConfig: true });
    await assert.rejects(peer.link.writeConfig(cfg), /readback differs/);
    console.log('  ok  stale configuration after an OK commit is reported as unverified');
  }

  {
    const peer = createPeer();
    const upload = peer.link.writeConfig(cfg);
    await assert.rejects(peer.link.readConfig(), /busy saving/);
    await upload;
    console.log('  ok  simultaneous reads cannot steal the upload acknowledgements');
  }

  const lighting = defaultConfig().channels[0].lighting;
  lighting.brightness = 234;
  lighting.perKey[0] = [12, 34, 56];
  lighting.perKey[8] = [78, 90, 123];

  {
    const peer = createPeer({ ledOutput: true });
    await peer.link.writeLighting(0, lighting, false);
    assert.deepEqual(peer.commands, [CMD.PREVIEW_LIGHTING]);
    peer.reboot();
    assert.equal(peer.lighting.brightness, 90, 'RAM preview must not survive reboot');
    await peer.link.writeLighting(0, lighting, true);
    assert.deepEqual(peer.commands.slice(1), [CMD.SET_LIGHTING, CMD.COMMIT, CMD.GET_LIGHTING]);
    peer.reboot();
    assert.equal(peer.lighting.brightness, 234);
    assert.deepEqual(peer.lighting.perKey[0], [12, 34, 56]);
    assert.deepEqual(peer.lighting.perKey[8], [78, 90, 123]);
    console.log('  ok  lighting preview stays volatile; Save commits and reads back RGB overrides');
  }

  const redOnly = Array.from({ length: 9 }, (_, i) => [i === 0 ? 12 : 0, 0, 0]);
  {
    const peer = createPeer(); /* default image has no physical data drive */
    await assert.rejects(peer.link.writeLighting(0, lighting, false), /LED_DISABLED/);
    assert.equal(peer.commands.at(-1), CMD.PREVIEW_LIGHTING);
    await assert.rejects(peer.link.ledTest(redOnly), /LED_DISABLED/);
    assert.equal(peer.commands.at(-1), CMD.LED_TEST);
    await peer.link.writeLighting(0, lighting, true);
    assert.deepEqual(peer.commands.slice(-3), [CMD.SET_LIGHTING, CMD.COMMIT, CMD.GET_LIGHTING]);
    assert.equal(peer.lighting.brightness, 234, 'stored preset works with output gated');
    console.log('  ok  default image refuses preview and raw test with a matching ERROR; Save still persists');
  }

  {
    const peer = createPeer({ ledOutput: true });
    await peer.link.ledTest(redOnly);
    assert.deepEqual(peer.commands, [CMD.LED_TEST]);
    const rejected = createPeer({ ledOutput: true, rejectLedTest: true });
    await assert.rejects(rejected.link.ledTest(redOnly), /BAD_ARG/);
    console.log('  ok  bench raw LED test waits for a real ACK; firmware rejection is not reported as success');
  }

  {
    const peer = createPeer();
    hardwareBridge.link = peer.link;
    hardwareBridge.protocolInfo = { hasLedOutput: false };
    await assert.rejects(hardwareBridge.writeLighting(0, lighting, false), /disabled/);
    await assert.rejects(hardwareBridge.ledTest(redOnly), /disabled/);
    assert.deepEqual(peer.commands, [], 'bridge must not send a disabled-output command');
    await hardwareBridge.writeLighting(0, lighting, true);
    assert.equal(peer.lighting.brightness, 234);
    hardwareBridge.link = null;
    hardwareBridge.protocolInfo = null;

    const bench = createPeer({ ledOutput: true });
    hardwareBridge.link = bench.link;
    hardwareBridge.protocolInfo = { hasLedOutput: true };
    await hardwareBridge.writeLighting(0, lighting, false);
    await hardwareBridge.ledTest(redOnly);
    assert.deepEqual(bench.commands, [CMD.PREVIEW_LIGHTING, CMD.LED_TEST]);
    hardwareBridge.link = null;
    hardwareBridge.protocolInfo = null;
    console.log('  ok  bridge sends physical commands only with LED_OUTPUT; saves are independent of output');
  }

  {
    const peer = createPeer({ rejectLighting: true });
    await assert.rejects(peer.link.writeLighting(0, lighting, true), /BAD_ARG/);
    assert.ok(!peer.commands.includes(CMD.COMMIT));
    console.log('  ok  rejected lighting update never commits');
  }

  {
    const peer = createPeer({ staleLighting: true });
    await assert.rejects(peer.link.writeLighting(0, lighting, true), /retain the saved lighting/);
    console.log('  ok  stale lighting readback after a commit is not reported as saved');
  }

  {
    const peer = createPeer({ wrongLightingChannel: true });
    await assert.rejects(peer.link.writeLighting(0, lighting, true), /wrong channel/);
    console.log('  ok  lighting readback from a different channel is rejected');
  }

  console.log('mpad3Link transaction tests passed');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
