// Microcontroller WebHID and WebSerial Communication Bridge
// Connects desktop software to physical Arduino, RP2040, QMK, or Vial devices

// Ambient type aliases for WebHID & WebSerial browser APIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HIDDevice = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

/* Mirrors firmware/include/hid_dev.h. */
const MPAD_VID = 0x1209;
const MPAD_PID = 0xc0ff;

import { Mpad3Link, LinkError, type DeviceInfo, type LinkEvent } from './mpad3Link';
import { CHUNK_COUNT } from '../../host/protocol/mpad3-protocol.mjs';
import { deckToConfig, type UnsupportedBinding } from './deckToConfig';
import type { Deck } from '../types';
import type { Lighting } from '../../host/protocol/mpad3-protocol.mjs';

/** Where an upload has got to. Real phases, because the UI used to animate a
 * fake progress bar and then claim success no matter what happened. */
export interface UploadProgress {
  phase: 'reading' | 'sending' | 'committing';
  sent: number;
  total: number;
}

/** What an upload actually did. `unsupported` is not an error: it is the list of
 * bindings that stay on the PC, by design, and the UI names them. */
export interface UploadResult {
  ok: boolean;
  message: string;
  mapped: number;
  unsupported: UnsupportedBinding[];
}

export interface ConnectedDeviceInfo {
  type: 'webhid' | 'webserial' | 'simulator';
  name: string;
  vendorId?: string;
  productId?: string;
  portName?: string;
}

export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

class HardwareBridgeManager {
  private connectionState: HardwareConnectionState = 'disconnected';
  private deviceInfo: ConnectedDeviceInfo | null = null;
  private hidDevice: HIDDevice | null = null;
  private serialPort: SerialPort | null = null;
  private listeners: ((state: HardwareConnectionState, info: ConnectedDeviceInfo | null) => void)[] = [];
  private inputListeners: ((keyIndex: number, actionType: 'down' | 'up' | 'dial_cw' | 'dial_ccw') => void)[] = [];
  private channelListeners: ((channelIndex: number) => void)[] = [];
  private holdSwitchListeners: (() => void)[] = [];
  /**
   * The binary protocol link. Present only when the attached device actually
   * answers a PING — a serial port that speaks the old text protocol still works
   * for key events, but it cannot take a lighting write, and the UI has to be
   * able to tell the difference.
   */
  private link: Mpad3Link | null = null;
  private protocolInfo: DeviceInfo | null = null;
  private protocolError: string | null = null;

  constructor() {
    this.checkExistingDevices();
  }

  // Subscribe to connection state changes
  public onStateChange(callback: (state: HardwareConnectionState, info: ConnectedDeviceInfo | null) => void) {
    this.listeners.push(callback);
    callback(this.connectionState, this.deviceInfo);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // Subscribe to live physical input events from the microcontroller
  public onInputEvent(callback: (keyIndex: number, actionType: 'down' | 'up' | 'dial_cw' | 'dial_ccw') => void) {
    this.inputListeners.push(callback);
    return () => {
      this.inputListeners = this.inputListeners.filter(cb => cb !== callback);
    };
  }

  // Subscribe to hardware channel switch events (e.g. CHANNEL:1, CHANNEL:2, CHANNEL:3)
  public onChannelSwitch(callback: (channelIndex: number) => void) {
    this.channelListeners.push(callback);
    return () => {
      this.channelListeners = this.channelListeners.filter(cb => cb !== callback);
    };
  }

  // Alias for onChannelSwitch
  public onLayerSwitch(callback: (layerIndex: number) => void) {
    return this.onChannelSwitch(callback);
  }

  // Subscribe to the firmware's confirmation that a knob hold already switched layer on-device
  public onHoldSwitch(callback: () => void) {
    this.holdSwitchListeners.push(callback);
    return () => {
      this.holdSwitchListeners = this.holdSwitchListeners.filter(cb => cb !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.connectionState, this.deviceInfo));
  }

  private notifyInput(keyIndex: number, actionType: 'down' | 'up' | 'dial_cw' | 'dial_ccw') {
    this.inputListeners.forEach(cb => cb(keyIndex, actionType));
  }

  private notifyHoldSwitch() {
    this.holdSwitchListeners.forEach(cb => cb());
  }

  private notifyChannel(channelIndex: number) {
    this.channelListeners.forEach(cb => cb(channelIndex));
  }

  // Check if devices were previously granted
  private async checkExistingDevices() {
    if (typeof navigator !== 'undefined' && 'hid' in navigator) {
      try {
        const devices = await (navigator as unknown as { hid: { getDevices: () => Promise<HIDDevice[]> } }).hid.getDevices();
        if (devices.length > 0) {
          this.attachHIDDevice(devices[0]);
        }
      } catch {
        // Ignore
      }
    }
  }

  // Request user to select a WebHID Macropad device
  public async connectHID(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('hid' in navigator)) {
      alert('WebHID is not supported in this browser. Please use Chrome, Edge, or the native Electron app.');
      return false;
    }

    try {
      this.connectionState = 'connecting';
      this.notify();

      const navHid = (navigator as unknown as { hid: { requestDevice: (opt: object) => Promise<HIDDevice[]> } }).hid;
      /* Filter to this project's own VID/PID. With `filters: []` the picker
       * offers every HID device on the machine — a mouse, someone else's
       * keyboard — and picking one reported CONNECTED for a device that cannot
       * carry a single byte of configuration. The pad's HID interfaces are a boot
       * keyboard and a consumer control; configuration only travels over CDC. */
      const devices = await navHid.requestDevice({
        filters: [{ vendorId: MPAD_VID, productId: MPAD_PID }],
      });

      if (devices.length > 0) {
        await this.attachHIDDevice(devices[0]);
        return true;
      } else {
        this.connectionState = 'disconnected';
        this.notify();
        return false;
      }
    } catch (err) {
      console.error('HID Connection Error:', err);
      this.connectionState = 'disconnected';
      this.notify();
      return false;
    }
  }

  // Request user to select a Virtual COM Port (Serial CDC) e.g. Arduino / RP2040
  public async connectSerial(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      alert('Web Serial API is not supported in this browser. Please use Chrome, Edge, or the native Electron app.');
      return false;
    }

    try {
      this.connectionState = 'connecting';
      this.notify();

      const navSerial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPort> } }).serial;
      const port = await navSerial.requestPort();
      await port.open({ baudRate: 115200 });

      this.serialPort = port;
      this.connectionState = 'connected';
      this.deviceInfo = {
        type: 'webserial',
        name: 'USB Serial Controller (115200 Baud)',
        portName: 'COM Port (Connected)'
      };
      this.notify();

      // Listen for incoming serial data from microcontroller
      this.readSerialStream(port);

      /* Ask the device who it is. Best effort: a device that speaks only the
       * text protocol will not answer, and that is a fact the UI needs, not an
       * error to shout about. */
      this.link = new Mpad3Link(port as unknown as { writable: WritableStream<Uint8Array> | null });
      this.probeProtocol();
      return true;
    } catch (err) {
      console.error('Serial Connection Error:', err);
      this.connectionState = 'disconnected';
      this.notify();
      return false;
    }
  }

  private async attachHIDDevice(device: HIDDevice) {
    if (!device.opened) {
      await device.open();
    }
    this.hidDevice = device;
    this.connectionState = 'connected';
    this.deviceInfo = {
      type: 'webhid',
      name: device.productName || 'USB Macropad HID',
      vendorId: `0x${device.vendorId.toString(16).toUpperCase()}`,
      productId: `0x${device.productId.toString(16).toUpperCase()}`,
    };
    this.notify();

    // Listen for input reports from physical switches and encoder
    device.addEventListener('inputreport', (event: unknown) => {
      const e = event as { data: DataView; reportId: number };
      const data = e.data;
      if (data.byteLength > 0) {
        const cmd = data.getUint8(0);
        // Protocol: [KeyIndex, State (0:up, 1:down, 2:cw, 3:ccw)]
        if (cmd <= 8) {
          const state = data.byteLength > 1 ? data.getUint8(1) : 1;
          const actionType = state === 1 ? 'down' : 'up';
          this.notifyInput(cmd, actionType);
        } else if (cmd === 0xE0) { // Encoder CW
          this.notifyInput(9, 'dial_cw');
        } else if (cmd === 0xE1) { // Encoder CCW
          this.notifyInput(9, 'dial_ccw');
        }
      }
    });
  }

  // Parse one complete protocol line (no trailing newline)
  private handleSerialLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) return;
    const parts = line.split(':');
    if (parts[0] === 'KEY' && parts.length >= 3) {
      const keyIdx = parseInt(parts[1], 10);
      if (Number.isNaN(keyIdx) || keyIdx < 0 || keyIdx > 8) return;
      const st = parts[2].toLowerCase() === 'down' ? 'down' : 'up';
      this.notifyInput(keyIdx, st);
    } else if (parts[0] === 'ENC') {
      if (parts[1] === 'CW') this.notifyInput(9, 'dial_cw');
      else if (parts[1] === 'CCW') this.notifyInput(9, 'dial_ccw');
      else if (parts[1] === 'DOWN' || parts[1] === 'PUSH') this.notifyInput(9, 'down');
      else if (parts[1] === 'UP') this.notifyInput(9, 'up');
      else if (parts[1] === 'HOLD_SWITCH') this.notifyHoldSwitch();
    } else if ((parts[0] === 'CHANNEL' || parts[0] === 'LAYER') && parts.length >= 2) {
      const ch = parseInt(parts[1], 10) - 1;
      if (!Number.isNaN(ch) && ch >= 0 && ch < 3) {
        this.notifyChannel(ch);
      }
    }
  }

  private async readSerialStream(port: SerialPort) {
    if (!port.readable) return;
    const reader = port.readable.getReader();
    const textDecoder = new TextDecoder();

    // Serial chunks do not respect line boundaries ("KEY:0:D" + "OWN\n"), so
    // accumulate text and only parse complete newline-terminated lines. The same
    // bytes also go to the binary decoder: a text line is ignored by it (no frame
    // header) and a frame is ignored by the line splitter (no newline in the
    // header), so one reader serves both protocols.
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        this.link?.feed(value as Uint8Array);
        buffer += textDecoder.decode(value as Uint8Array, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          this.handleSerialLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
        if (buffer.length > 1024) buffer = ''; // discard runaway garbage without a newline
      }
    } catch (err) {
      console.error('Serial read loop error:', err);
    } finally {
      reader.releaseLock();
      // Stream ended (device unplugged or closed): reflect it in the UI
      if (this.serialPort === port) {
        this.serialPort = null;
        this.connectionState = 'disconnected';
        this.deviceInfo = null;
        this.notify();
      }
    }
  }

  // Disconnect active hardware
  public async disconnect() {
    if (this.link) {
      this.link.close();
      this.link = null;
      this.protocolInfo = null;
    }
    if (this.hidDevice && this.hidDevice.opened) {
      await this.hidDevice.close();
      this.hidDevice = null;
    }
    if (this.serialPort) {
      try { await this.serialPort.close(); } catch { /* ignore */ }
      this.serialPort = null;
    }
    this.connectionState = 'disconnected';
    this.deviceInfo = null;
    this.notify();
  }

  // Send deck / keymap configuration packet to the physical microcontroller EEPROM
  /**
   * Push the deck to the pad: read what the pad has, replace the key and knob
   * slots, stream the config, commit it to flash.
   *
   * This replaced a JSON `SYNC_KEYMAP` write that nothing on the device parsed —
   * it "succeeded" whenever the serial port accepted the bytes, which is why an
   * upload looked fine and changed nothing. Now the only way this resolves ok is
   * the pad acknowledging a COMMIT.
   */
  public async uploadDeck(
    deck: Deck,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<UploadResult> {
    if (!this.link) {
      return {
        ok: false,
        message: 'No pad is answering the binary protocol. Connect by USB serial first.',
        mapped: 0,
        unsupported: [],
      };
    }
    try {
      /* Read first: the globals (gesture timings, OLED playlist, boot layer) and
       * the lighting belong to the pad, and an upload should not reset them. */
      onProgress?.({ phase: 'reading', sent: 0, total: CHUNK_COUNT });
      const base = await this.link.readConfig();
      const { config, mapped, unsupported } = deckToConfig(deck, base);
      await this.link.writeConfig(config, (sent: number, total: number) =>
        onProgress?.({ phase: 'sending', sent, total }),
      );
      onProgress?.({ phase: 'committing', sent: CHUNK_COUNT, total: CHUNK_COUNT });
      return {
        ok: true,
        message: `Wrote ${mapped} key and knob actions to the pad and committed them to flash.`,
        mapped,
        unsupported,
      };
    } catch (err) {
      const reason = err instanceof LinkError ? err.message : err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Upload failed: ${reason}`, mapped: 0, unsupported: [] };
    }
  }

  /* ── binary protocol ─────────────────────────────────────────────────── */

  /** What the device said it is, or null if it never answered a PING. */
  public get protocol(): DeviceInfo | null {
    return this.protocolInfo;
  }

  /** The last status the pad rejected something with, or null. */
  public get lastProtocolError(): string | null {
    return this.protocolError;
  }

  /**
   * Binary frames the pad sends on its own.
   *
   * This is the only path by which a *physical* key press reaches the app: the
   * firmware streams KEY_EVENT frames (docs/PROTOCOL.md, 0xC0) and the app used
   * to subscribe to serial text lines that this firmware never sends. Same two
   * notifications the simulator uses, so everything downstream is unchanged.
   */
  private handleLinkEvent(e: LinkEvent) {
    if (e.kind === 'error') {
      this.protocolError = e.statusName;
      this.notify();
      return;
    }
    if (e.kind !== 'key') return;

    const { source, index, event, channel } = e.key;
    const KEY = 0;
    const PRESS = 1, RELEASE = 2, TAP = 3, HOLD = 4, HOLD_RELEASE = 5, DOUBLE_TAP = 6;
    const ENC_CW = 7, ENC_CCW = 8, CHANNEL_CHANGE = 9;

    if (event === CHANNEL_CHANGE) {
      /* The pad switched layers (knob hold, or a bound CHANNEL action). Tell the
       * UI so the editor follows the hardware instead of disagreeing with it. */
      this.notifyChannel(channel);
      return;
    }

    if (source !== KEY) {
      if (event === ENC_CW) this.notifyInput(9, 'dial_cw');
      else if (event === ENC_CCW) this.notifyInput(9, 'dial_ccw');
      else if (event === PRESS) this.notifyInput(9, 'down');
      else if (event === RELEASE) this.notifyInput(9, 'up');
      else if (event === HOLD) this.notifyHoldSwitch();
      return;
    }

    switch (event) {
      case PRESS:
      case HOLD:
        this.notifyInput(index, 'down');
        break;
      case RELEASE:
      case HOLD_RELEASE:
        this.notifyInput(index, 'up');
        break;
      case TAP:
      case DOUBLE_TAP:
        /* A tap is both edges; two notifications keep the UI's press animation
         * and the safety-hold timing honest. */
        this.notifyInput(index, 'down');
        this.notifyInput(index, 'up');
        break;
      default:
        break;
    }
  }

  private async probeProtocol() {
    const link = this.link;
    if (!link) return;
    try {
      const info = await link.probe();
      if (this.link !== link) return;
      this.protocolInfo = info;
      link.onFrame((e) => this.handleLinkEvent(e));
      this.notify();
    } catch {
      if (this.link !== link) return;
      this.protocolInfo = null;
      this.notify();
    }
  }

  private requireLink(): Mpad3Link {
    if (!this.link) throw new LinkError('no serial port is open');
    return this.link;
  }

  /** Push one channel's lighting. `save` = false previews without touching flash. */
  public async writeLighting(channel: number, L: Lighting, save: boolean): Promise<void> {
    await this.requireLink().writeLighting(channel, L, save);
  }

  public async readLighting(channel: number): Promise<Lighting> {
    return this.requireLink().readLighting(channel);
  }

  /** Nine exact RGB bytes, no gamma and no brightness scaling (wiring test). */
  public async ledTest(rgb: Array<[number, number, number]>): Promise<void> {
    await this.requireLink().ledTest(rgb);
  }

  // Send ASCII command line to microcontroller over serial (e.g. OLED:CH:2)
  public async sendSerialCommand(command: string): Promise<boolean> {
    if (this.serialPort && this.serialPort.writable) {
      try {
        const encoder = new TextEncoder();
        const writer = this.serialPort.writable.getWriter();
        await writer.write(encoder.encode(command + '\n'));
        writer.releaseLock();
        return true;
      } catch (err) {
        console.error('Serial command error:', err);
        return false;
      }
    }
    return false;
  }
}

export const hardwareBridge = new HardwareBridgeManager();
