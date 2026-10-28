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
  CHUNK_COUNT,
  CMD,
  CMD_NAME,
  ConfigAssembler,
  FrameDecoder,
  STATUS,
  STATUS_NAME,
  decodeInfo,
  decodeKeyEvent,
  decodeLighting,
  encodeConfigFrames,
  encodeFrame,
  encodeLedTest,
  encodeLighting,
} from '../../host/protocol/mpad3-protocol.mjs';
import type { Cfg, DecodedFrame, Info, KeyEvent, Lighting } from '../../host/protocol/mpad3-protocol.mjs';

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
  hasEvents: boolean;
}

export type LinkEvent =
  | { kind: 'lighting'; channel: number; lighting: Lighting }
  | { kind: 'info'; info: Info }
  /** A physical key, knob detent or layer change, straight from the pad. */
  | { kind: 'key'; key: KeyEvent }
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

  close() {
    this.closed = true;
    this.failAll(new LinkError('port closed'));
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

  /** Fire a command without waiting for a reply (LED_TEST, BOOTLOADER, …). */
  async send(cmd: number, payload?: Uint8Array): Promise<void> {
    if (this.closed) throw new LinkError('port closed');
    const frame = encodeFrame(cmd, payload ?? new Uint8Array(0));
    this.writeChain = this.writeChain.then(() => this.write(frame));
    return this.writeChain;
  }

  /** Send and wait for one specific reply, or time out. */
  async request(cmd: number, payload: Uint8Array, want: number, timeoutMs = 900): Promise<Uint8Array> {
    if (this.closed) throw new LinkError('port closed');
    const answer = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.pending.findIndex((p) => p.timer === timer);
        if (i >= 0) this.pending.splice(i, 1);
        reject(new LinkError(`no reply to ${CMD_NAME[cmd] ?? cmd} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.push({ want, resolve, reject, timer });
    });
    try {
      await this.send(cmd, payload);
    } catch (err) {
      this.failAll(err as Error);
      throw err;
    }
    return answer;
  }

  async probe(timeoutMs = 700): Promise<DeviceInfo> {
    const payload = await this.request(CMD.PING, new Uint8Array(0), CMD.PONG, timeoutMs);
    void payload;
    const infoPayload = await this.request(CMD.GET_INFO, new Uint8Array(0), CMD.INFO, timeoutMs);
    const info = decodeInfo(infoPayload);
    return {
      firmwareBuild: info.firmwareBuild,
      protocolVersion: info.protocolVersion,
      channels: info.channels,
      keys: info.keys,
      leds: info.leds,
      hasFlash: (info.capabilities & CAP.FLASH) !== 0,
      hasEvents: (info.capabilities & CAP.EVENTS) !== 0,
    };
  }

  /**
   * Push lighting. `save: false` uses PREVIEW_LIGHTING, which the firmware applies
   * without touching flash — that is what slider drags use. `save: true` uses
   * SET_LIGHTING and waits for the ACK, then checks the status byte; a rejected
   * write throws instead of looking successful.
   */
  async writeLighting(channel: number, L: Lighting, save: boolean): Promise<void> {
    const cmd = save ? CMD.SET_LIGHTING : CMD.PREVIEW_LIGHTING;
    const payload = encodeLighting(channel, L);
    const ack = await this.request(cmd, payload, CMD.SET_ACK);
    const status = ack[0] ?? STATUS.OK;
    if (status !== STATUS.OK) {
      throw new LinkError(`device refused the lighting write: ${STATUS_NAME[status] ?? status}`);
    }
  }

  async readLighting(channel: number): Promise<Lighting> {
    const payload = await this.request(
      CMD.GET_LIGHTING,
      new Uint8Array([channel]),
      CMD.LIGHTING,
    );
    return decodeLighting(payload, 1);
  }

  /** Raw wiring test: nine exact RGB bytes, no gamma, no brightness. */
  async ledTest(rgb: Array<[number, number, number]>): Promise<void> {
    await this.send(CMD.LED_TEST, encodeLedTest(rgb));
  }

  /**
   * Read the pad's whole config, chunk by chunk. ConfigAssembler checks the
   * chunk order and the CRC, so a half-answer is an error rather than a
   * half-filled struct.
   */
  async readConfig(chunkTimeoutMs = 1200): Promise<Cfg> {
    const assembler = new ConfigAssembler();
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const payload = await this.request(
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

  /**
   * Stream a config and commit it.
   *
   * SET_CONFIG only stages the config in RAM; COMMIT is the flash write. They are
   * separate on purpose (docs/PROTOCOL.md): seven chunks should cause one erase,
   * and a user who changes their mind can simply not commit. This waits for the
   * COMMIT acknowledgement and throws on a non-OK status, so "uploaded" in the
   * UI always means the pad said yes.
   */
  async writeConfig(cfg: Cfg, onProgress?: (sent: number, total: number) => void): Promise<void> {
    if (this.closed) throw new LinkError('port closed');
    const frames = encodeConfigFrames(cfg);
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      this.writeChain = this.writeChain.then(() => this.write(frame));
      await this.writeChain;
      onProgress?.(i + 1, frames.length);
    }
    const ack = await this.request(CMD.COMMIT, new Uint8Array(0), CMD.COMMIT_ACK, 4000);
    const status = ack[0] ?? STATUS.OK;
    if (status !== STATUS.OK) {
      throw new LinkError(`the pad refused the commit: ${STATUS_NAME[status] ?? status}`);
    }
  }
}
