/*
 * mpad3Link.ts — the binary protocol, over the serial port the app already opens.
 *
 * `host/protocol/mpad3-protocol.mjs` is the single JavaScript implementation of
 * the wire format: the Node suite checks it byte for byte against the compiled C,
 * so this file must not encode anything itself. It only moves bytes and matches
 * replies to requests.
 *
 * Why it exists at all: until now the app spoke text lines (`OLED:MODE:3`) and a
 * JSON blob for keymap sync, and the firmware speaks the MPAD3 frame protocol, so
 * anything that was not an `OLED:` line was dropped by the frame parser. Lighting
 * needs real frames, so here they are.
 *
 * Nothing here assumes the device answers. Every request times out with a typed
 * error and the UI says so; a missing pad must never look like a successful
 * write.
 */
import {
  CAP,
  CHANNEL_COUNT,
  OLED_MODE_COUNT,
  CHUNK_COUNT,
  CONFIG_FORMAT_VERSION,
  KEY_COUNT,
  MAGIC_U32,
  PROTOCOL_VERSION,
  CMD,
  CMD_NAME,
  ConfigAssembler,
  FrameDecoder,
  STATUS,
  STATUS_NAME,
  SIZES,
  decodeInfo,
  decodeKeyEvent,
  decodeLighting,
  decodeOledState,
  decodeOledFrameAck,
  encodeOledFrameChunks,
  encodeConfig,
  encodeConfigFrames,
  encodeFrame,
  encodeLedTest,
  encodeLighting,
} from '../../host/protocol/mpad3-protocol.mjs';
import type { Cfg, DecodedFrame, Info, KeyEvent, Lighting, OledState } from '../../host/protocol/mpad3-protocol.mjs';

/* Web Serial is not in the DOM lib this project targets, and hardwareBridge
 * already treats it structurally; keep the same approach here. */
type SerialPortLike = {
  writable: WritableStream<Uint8Array> | null;
};

export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkError';
  }
}

export interface DeviceInfo {
  firmwareBuild: number;
  protocolVersion: number;
  channels: number;
  keys: number;
  leds: number;
  hasFlash: boolean;
  /** Firmware supports KEY_EVENT; config.global.usbReportEvents controls whether it streams. */
  hasEvents: boolean;
  hasOled: boolean;
  /** PIO data output is compiled in for bench work; NOT power/current approval. */
  hasLedOutput: boolean;
  /** A physical SSD1306 ACKed and the volatile canvas path is enabled. */
  hasOledStream: boolean;
}

export type LinkEvent =
  | { kind: 'lighting'; channel: number; lighting: Lighting }
  | { kind: 'info'; info: Info }
  /** A physical key, knob detent or layer change, straight from the pad. */
  | { kind: 'key'; key: KeyEvent }
  /** Unsolicited physical mode change: manual gesture, rotation or host select. */
  | { kind: 'oledMode'; state: OledState }
  /** The pad rejected something and said why. */
  | { kind: 'error'; status: number; statusName: string }
  | { kind: 'frame'; cmd: number; cmdName: string };

interface Pending {
  want: number;
  resolve: (payload: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Mpad3Link {
  private decoder = new FrameDecoder();
  private pending: Pending[] = [];
  private listeners = new Set<(e: LinkEvent) => void>();
  private writeChain: Promise<void> = Promise.resolve();
  private port: SerialPortLike;
  private closed = false;
  // ERROR frames carry no request ID. Keep reads/writes exclusive while a
  // save is in flight so an unrelated ACK cannot certify the wrong transaction.
  private saving = false;
  /* Runtime OLED pixels are lowest priority. One atomic two-packet stream uses
   * the writer exclusively until its complete-frame ACK arrives. A user save,
   * lighting change or mode selection WAITS for that short slot; frames skip
   * while any higher-priority request is pending. */
  private streaming = false;
  private streamDone: Promise<void> | null = null;
  private streamResolve: (() => void) | null = null;
  private oledSequence = 0;

  constructor(port: SerialPortLike) {
    this.port = port;
  }

  /** Feed every byte the port delivers. Safe to call with partial frames. */
  feed(bytes: Uint8Array) {
    if (this.closed) return;
    this.decoder.push(bytes);
    /* push() returns the accumulating queue, not the new frames, so drain it. */
    for (let f = this.decoder.next(); f; f = this.decoder.next()) this.dispatch(f);
  }

  onFrame(fn: (e: LinkEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Used by mode-intent coordination: a pad-originated mode change can cancel
   * a not-yet-sent user selection while a frame/save holds the wire. */
  get isBusy(): boolean { return this.saving || this.streaming || this.pending.length > 0; }

  close() {
    this.closed = true;
    this.failAll(new LinkError('port closed'));
    this.streamResolve?.(); /* release requests waiting for a failed stream */
    this.streamResolve = null;
    this.streamDone = null;
    this.streaming = false;
    this.listeners.clear();
  }

  private failAll(err: Error) {
    for (const p of this.pending.splice(0)) {
      clearTimeout(p.timer);
      p.reject(err);
    }
  }

  private dispatch(f: DecodedFrame) {
    const cmd = f.cmd;

    /* An error reply fails whichever request was waiting on that command. */
    if (cmd === CMD.ERROR) {
      const status = f.payload[0] ?? 0;
      const name = STATUS_NAME[status] ?? `0x${status.toString(16)}`;
      const err = new LinkError(`device rejected the command: ${name}`);
      const victim = this.pending.shift();
      if (victim) {
        clearTimeout(victim.timer);
        victim.reject(err);
      }
      /* Also tell the UI. An ERROR frame with nobody waiting on it used to be
       * dropped on the floor, which made a rejected command look like silence. */
      this.emit({ kind: 'error', status, statusName: name });
      return;
    }

    const idx = this.pending.findIndex((p) => p.want === cmd);
    if (idx >= 0) {
      const [p] = this.pending.splice(idx, 1);
      clearTimeout(p.timer);
      p.resolve(f.payload);
      return;
    }

    const cmdName = CMD_NAME[cmd] ?? `0x${cmd.toString(16)}`;
    if (cmd === CMD.LIGHTING) {
      const channel = f.payload[0] ?? 0;
      this.emit({ kind: 'lighting', channel, lighting: decodeLighting(f.payload, 1) });
      return;
    }
    if (cmd === CMD.INFO) {
      this.emit({ kind: 'info', info: decodeInfo(f.payload) });
      return;
    }
    /* Unsolicited while global.usbReportEvents is 1: this is how a physical key
     * press reaches the app. It arrived and was ignored before. */
    if (cmd === CMD.KEY_EVENT) {
      this.emit({ kind: 'key', key: decodeKeyEvent(f.payload) });
      return;
    }
    if (cmd === CMD.OLED_MODE_EVENT) {
      if (f.payload.length !== SIZES.oledState || f.payload[0] >= OLED_MODE_COUNT) {
        this.emit({ kind: 'error', status: STATUS.BAD_LENGTH, statusName: 'invalid OLED mode event' });
      } else {
        this.emit({ kind: 'oledMode', state: decodeOledState(f.payload) });
      }
      return;
    }
    this.emit({ kind: 'frame', cmd, cmdName });
  }

  private emit(e: LinkEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  private async write(bytes: Uint8Array) {
    const port = this.port;
    if (!port.writable) throw new LinkError('serial port is not writable');
    const writer = port.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  private sendFrame(frame: Uint8Array): Promise<void> {
    if (this.closed) throw new LinkError('port closed');
    // A transient rejected writer must fail its own request, but not poison all
    // future attempts on a still-open port. Keep subsequent writes serialized.
    this.writeChain = this.writeChain.catch(() => {}).then(() => this.write(frame));
    return this.writeChain;
  }

  /** Firmware also accepts short OLED: text lines on the same USB CDC port.
   * Route them through the link's writer, never a second unlocked getWriter().
   * Do not mix ASCII with a binary GET/SET/COMMIT exchange. */
  async sendAscii(command: string): Promise<void> {
    if (!command.startsWith('OLED:') || command.length > 62 || /[\u0000-\u001f\u007f]/.test(command)) {
      throw new LinkError('invalid OLED command');
    }
    if (this.streamDone) await this.streamDone;
    if (this.closed) throw new LinkError('port closed');
    if (this.saving || this.pending.length) throw new LinkError('the pad is busy with another command');
    return this.sendFrame(new TextEncoder().encode(`${command}\n`));
  }

  /** Fire a command without waiting for a reply (never use for LED_TEST). */
  async send(cmd: number, payload?: Uint8Array): Promise<void> {
    if (this.streamDone) await this.streamDone;
    if (this.closed) throw new LinkError('port closed');
    if (this.saving || this.pending.length) throw new LinkError('the pad is busy with another command');
    return this.sendFrame(encodeFrame(cmd, payload ?? new Uint8Array(0)));
  }

  private expect(want: number, label: string, timeoutMs: number) {
    let pending!: Pending;
    const promise = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.pending.indexOf(pending);
        if (i >= 0) this.pending.splice(i, 1);
        reject(new LinkError(`no reply to ${label} within ${timeoutMs} ms`));
      }, timeoutMs);
      pending = { want, resolve, reject, timer };
      this.pending.push(pending);
    });
    // The device can reject a chunk before the caller finishes writing later
    // chunks. Attach a rejection handler now rather than generating an unhandled
    // promise rejection before the caller can await the final acknowledgement.
    void promise.catch(() => {});
    const cancel = (error: Error) => {
      const i = this.pending.indexOf(pending);
      if (i < 0) return;
      this.pending.splice(i, 1);
      clearTimeout(pending.timer);
      pending.reject(error);
    };
    return { promise, cancel };
  }

  private async requestCore(cmd: number, payload: Uint8Array, want: number, timeoutMs: number): Promise<Uint8Array> {
    if (this.closed) throw new LinkError('port closed');
    if (this.pending.length) throw new LinkError('the pad is busy with another command');
    const reply = this.expect(want, CMD_NAME[cmd] ?? String(cmd), timeoutMs);
    try {
      await this.sendFrame(encodeFrame(cmd, payload));
    } catch (err) {
      reply.cancel(err as Error);
      throw err;
    }
    return reply.promise;
  }

  /** Send and wait for one specific reply, or time out. */
  async request(cmd: number, payload: Uint8Array, want: number, timeoutMs = 900): Promise<Uint8Array> {
    if (this.streamDone) await this.streamDone;
    if (this.saving) throw new LinkError('the pad is busy saving a configuration');
    return this.requestCore(cmd, payload, want, timeoutMs);
  }

  private beginSave() {
    if (this.closed) throw new LinkError('port closed');
    if (this.saving || this.pending.length) throw new LinkError('the pad is busy with another command');
    this.saving = true;
  }

  private checkStatus(reply: Uint8Array, operation: string) {
    if (reply.length !== 1 || reply[0] !== STATUS.OK) {
      const status = reply.length === 1 ? (STATUS_NAME[reply[0]] ?? reply[0]) : 'missing status';
      throw new LinkError(`the pad refused ${operation}: ${status}`);
    }
  }

  private async commitCore() {
    const ack = await this.requestCore(CMD.COMMIT, new Uint8Array(0), CMD.COMMIT_ACK, 4000);
    this.checkStatus(ack, 'the flash commit');
  }

  async probe(timeoutMs = 700): Promise<DeviceInfo> {
    const payload = await this.request(CMD.PING, new Uint8Array(0), CMD.PONG, timeoutMs);
    void payload;
    const infoPayload = await this.request(CMD.GET_INFO, new Uint8Array(0), CMD.INFO, timeoutMs);
    const info = decodeInfo(infoPayload);
    if (info.magic !== MAGIC_U32 || info.protocolVersion !== PROTOCOL_VERSION ||
        info.configVersion !== CONFIG_FORMAT_VERSION ||
        info.channels !== CHANNEL_COUNT || info.keys !== KEY_COUNT || info.configSize !== SIZES.config) {
      throw new LinkError('connected device does not match this MPAD3 config/protocol');
    }
    return {
      firmwareBuild: info.firmwareBuild,
      protocolVersion: info.protocolVersion,
      channels: info.channels,
      keys: info.keys,
      leds: info.leds,
      hasFlash: (info.capabilities & CAP.FLASH) !== 0,
      hasEvents: (info.capabilities & CAP.EVENTS) !== 0,
      hasOled: (info.capabilities & CAP.OLED) !== 0,
      hasLedOutput: (info.capabilities & CAP.LED_OUTPUT) !== 0,
      hasOledStream: (info.capabilities & (CAP.OLED | CAP.OLED_STREAM)) === (CAP.OLED | CAP.OLED_STREAM),
    };
  }

  /** Ask the device which screen is REALLY selected; saved boot mode is not
   * the live cursor after a gesture or rotation. */
  async readOledMode(): Promise<OledState> {
    return decodeOledState(await this.request(
      CMD.GET_OLED_STATE, new Uint8Array(0), CMD.OLED_STATE, 1200,
    ));
  }

  /** Confirm a physical screen selection; unlike an ASCII fire-and-forget, an
   * ACK cannot be lost during a pending binary save without the caller knowing. */
  async setOledMode(mode: number): Promise<OledState> {
    if (!Number.isInteger(mode) || mode < 0 || mode >= OLED_MODE_COUNT) {
      throw new LinkError('invalid OLED screen');
    }
    const state = decodeOledState(await this.request(
      CMD.SET_OLED_MODE, new Uint8Array([mode]), CMD.OLED_STATE, 1200,
    ));
    if (state.mode !== mode) throw new LinkError('the pad acknowledged a different OLED screen');
    return state;
  }

  /** Low-priority, volatile pixels. Returns false if a user command owns the
   * link (caller should skip this frame, not queue stale images). Returns true
   * ONLY after both halves and the device's full-frame CRC ACK. */
  async streamOledFrame(mode: number, pages: Uint8Array): Promise<boolean> {
    if (this.closed) throw new LinkError('port closed');
    if (this.saving || this.pending.length || this.streaming) return false;
    const seq = this.oledSequence = (this.oledSequence + 1) & 0xffff;
    const [first, last] = encodeOledFrameChunks(pages, mode, seq);
    this.streaming = true;
    this.streamDone = new Promise<void>((resolve) => { this.streamResolve = resolve; });
    const ack = this.expect(CMD.OLED_FRAME_ACK, 'OLED_FRAME', 900);
    let earlyError: Error | null = null;
    let ackBeforeLastChunk = false;
    void ack.promise.then(
      () => { ackBeforeLastChunk = true; },
      (err: Error) => { earlyError = err; },
    );
    try {
      await this.sendFrame(encodeFrame(CMD.OLED_FRAME, first));
      if (earlyError) throw earlyError;
      if (ackBeforeLastChunk) throw new LinkError('the pad acknowledged an incomplete OLED frame');
      await this.sendFrame(encodeFrame(CMD.OLED_FRAME, last));
      const result = decodeOledFrameAck(await ack.promise);
      if (result.seq !== seq || result.mode !== mode) {
        throw new LinkError('the pad acknowledged another OLED frame or screen');
      }
      return true;
    } catch (err) {
      ack.cancel(err as Error);
      throw err;
    } finally {
      this.streaming = false;
      const release = this.streamResolve;
      this.streamResolve = null;
      this.streamDone = null;
      release?.();
    }
  }

  /** Preview is RAM-only; Save requires SET_ACK, a flash COMMIT and readback. */
  async writeLighting(channel: number, L: Lighting, save: boolean): Promise<void> {
    const payload = encodeLighting(channel, L);
    if (!save) {
      const ack = await this.request(CMD.PREVIEW_LIGHTING, payload, CMD.SET_ACK);
      this.checkStatus(ack, 'the lighting preview');
      return;
    }

    if (this.streamDone) await this.streamDone;
    this.beginSave();
    try {
      const ack = await this.requestCore(CMD.SET_LIGHTING, payload, CMD.SET_ACK, 1200);
      this.checkStatus(ack, 'the lighting update');
      await this.commitCore();
      const received = encodeLighting(channel, await this.readLightingCore(channel));
      if (received.length !== payload.length || received.some((value, i) => value !== payload[i])) {
        throw new LinkError('the pad did not retain the saved lighting settings');
      }
    } finally {
      this.saving = false;
    }
  }

  private async readLightingCore(channel: number): Promise<Lighting> {
    const payload = await this.requestCore(
      CMD.GET_LIGHTING,
      new Uint8Array([channel]),
      CMD.LIGHTING,
      1200,
    );
    if (payload.length !== 1 + SIZES.lighting || payload[0] !== channel) {
      throw new LinkError('the pad answered with lighting for the wrong channel or an invalid size');
    }
    return decodeLighting(payload, 1);
  }

  async readLighting(channel: number): Promise<Lighting> {
    if (this.streamDone) await this.streamDone;
    if (this.saving) throw new LinkError('the pad is busy saving a configuration');
    return this.readLightingCore(channel);
  }

  /** Bench wiring test: raw bytes, 300 ms timeout on device, require ACK. */
  async ledTest(rgb: Array<[number, number, number]>): Promise<void> {
    const ack = await this.request(CMD.LED_TEST, encodeLedTest(rgb), CMD.SET_ACK);
    this.checkStatus(ack, 'the raw LED test');
  }

  /**
   * Read the pad's whole config, chunk by chunk. ConfigAssembler checks the
   * chunk order and the CRC, so a half-answer is an error rather than a
   * half-filled struct.
   */
  private async readConfigCore(chunkTimeoutMs: number): Promise<Cfg> {
    const assembler = new ConfigAssembler();
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const payload = await this.requestCore(
        CMD.GET_CONFIG,
        new Uint8Array([i]),
        CMD.CONFIG_CHUNK,
        chunkTimeoutMs,
      );
      const cfg = assembler.add(payload);
      if (cfg) return cfg;
    }
    throw new LinkError(`the pad answered ${CHUNK_COUNT} chunks but the config never validated`);
  }

  async readConfig(chunkTimeoutMs = 1200): Promise<Cfg> {
    if (this.streamDone) await this.streamDone;
    if (this.saving) throw new LinkError('the pad is busy saving a configuration');
    return this.readConfigCore(chunkTimeoutMs);
  }

  /**
   * Atomically read the latest device config, edit only the requested fields,
   * stage every chunk, COMMIT, then verify a full readback. Keep the link's
   * exclusive save guard from the FIRST GET_CONFIG through the LAST readback:
   * otherwise an upload racing Display Save can clobber unrelated bindings.
   */
  async updateConfig<T>(
    edit: (base: Cfg) => { config: Cfg; result: T },
    options?: {
      requireOled?: boolean;
      onRead?: () => void;
      onProgress?: (sent: number, total: number) => void;
      onStage?: (stage: 'committing' | 'verifying') => void;
    },
  ): Promise<T> {
    if (this.streamDone) await this.streamDone;
    this.beginSave();
    try {
      if (options?.requireOled) {
        // The capability at connection time can be stale if I²C NACKed later.
        // Refresh it INSIDE the exclusive transaction before any flash write.
        const payload = await this.requestCore(CMD.GET_INFO, new Uint8Array(0), CMD.INFO, 1200);
        const info = decodeInfo(payload);
        if (info.magic !== MAGIC_U32 || info.protocolVersion !== PROTOCOL_VERSION ||
            info.configVersion !== CONFIG_FORMAT_VERSION || info.configSize !== SIZES.config ||
            (info.capabilities & (CAP.FLASH | CAP.OLED)) !== (CAP.FLASH | CAP.OLED)) {
          throw new LinkError('the pad no longer reports a responding OLED with flash');
        }
      }
      options?.onRead?.();
      const { config, result } = edit(await this.readConfigCore(1200));
      await this.writeConfigCore(config, options?.onProgress, options?.onStage);
      return result;
    } finally {
      this.saving = false;
    }
  }

  /** Full config replacement; use updateConfig() for any read-modify-write. */
  async writeConfig(
    cfg: Cfg,
    onProgress?: (sent: number, total: number) => void,
    onStage?: (stage: 'committing' | 'verifying') => void,
  ): Promise<void> {
    if (this.streamDone) await this.streamDone;
    this.beginSave();
    try {
      await this.writeConfigCore(cfg, onProgress, onStage);
    } finally {
      this.saving = false;
    }
  }

  /** Firmware replies to SET_CONFIG only after the LAST chunk validates. */
  private async writeConfigCore(
    cfg: Cfg,
    onProgress?: (sent: number, total: number) => void,
    onStage?: (stage: 'committing' | 'verifying') => void,
  ): Promise<void> {
    const expected = encodeConfig(cfg);
    const frames = encodeConfigFrames(expected);
    // Register before the first chunk: ERROR on any chunk must abort the save.
    const stageReply = this.expect(CMD.SET_ACK, 'SET_CONFIG', 4000);
    let stageError: Error | null = null;
    let stageAckEarly = false;
    void stageReply.promise.then(
      () => { stageAckEarly = true; },
      (err: Error) => { stageError = err; },
    );
    try {
      for (let i = 0; i < frames.length; i++) {
        if (stageError) throw stageError;
        await this.sendFrame(frames[i]);
        if (stageError) throw stageError;
        if (stageAckEarly && i < frames.length - 1) {
          throw new LinkError('the pad acknowledged the configuration before receiving every chunk');
        }
        onProgress?.(i + 1, frames.length);
      }
      this.checkStatus(await stageReply.promise, 'the staged configuration');
      onStage?.('committing');
      await this.commitCore();
      onStage?.('verifying');
      try {
        const received = encodeConfig(await this.readConfigCore(1200));
        if (received.length !== expected.length || received.some((value, i) => value !== expected[i])) {
          throw new LinkError('the readback differs from the configuration sent');
        }
      } catch (err) {
        throw new LinkError(`the pad acknowledged the commit, but the configuration could not be verified: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      stageReply.cancel(err as Error);
      throw err;
    }
  }
}
