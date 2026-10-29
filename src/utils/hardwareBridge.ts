// RP2040 Web Serial (CDC) communication bridge. Its HID keyboard and consumer
// reports go directly to the OS; they do NOT encode pad-key/encoder input events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

import { Mpad3Link, LinkError, type DeviceInfo, type LinkEvent } from './mpad3Link';
import type { OledState } from '../../host/protocol/mpad3-protocol.mjs';
import { CHUNK_COUNT } from '../../host/protocol/mpad3-protocol.mjs';
import { deckToConfig, hasOledNextAction, type UnsupportedBinding } from './deckToConfig';
import { deckIsLocked } from './deckLock';
import { loadStoredMacros } from './executeDeckAction';
import { isMacroReady, requiredPcMacroIds } from './macroStorage';
import { OLED_MODE_IDS, getOLEDMode, type OLEDMode } from '../oled/modes';
import { clampAutoCycleS, maskToPlaylist, normalizePlaylist, playlistToMask } from '../oled/playlist';
import type { Deck, OLEDState } from '../types';
import type { Lighting } from '../../host/protocol/mpad3-protocol.mjs';
import type { PhysicalGesture, PhysicalEventMeta } from './physicalActionRouter';

/** Where an upload has got to. Real phases, because the UI used to animate a
 * fake progress bar and then claim success no matter what happened. */
export interface UploadProgress {
  phase: 'reading' | 'sending' | 'committing' | 'verifying';
  sent: number;
  total: number;
}

/** PC-owned actions need an opt-in if the current pad config has key events
 * switched off. No UI option can invent an absent firmware event capability. */
export interface UploadOptions {
  enablePcEvents?: boolean;
}

/** `unsupported` lists bindings not stored as device actions. Each item names
 * whether it can run in the desktop app or is unavailable everywhere. */
export interface UploadResult {
  ok: boolean;
  message: string;
  mapped: number;
  unsupported: UnsupportedBinding[];
}

export type PhysicalDisplaySettings = Required<Pick<OLEDState,
  'mode' | 'brightness' | 'inverted' | 'autoCycleS' | 'playlist'>>;

export interface ConnectedDeviceInfo {
  type: 'webserial' | 'simulator';
  name: string;
  portName?: string;
  /** Opening a COM port is not proof that it speaks this binary protocol. */
  protocolReady?: boolean;
  hasFlash?: boolean;
  /** Capability, not current setting; current usbReportEvents is read in upload. */
  hasEvents?: boolean;
  /** True only if this firmware actually detected the SSD1306 on I²C. */
  hasOled?: boolean;
  /** Compatible protocol + physical I2C ACK; enables volatile runtime frames. */
  hasOledStream?: boolean;
  /** Bench-only LED data drive is compiled in; not a safety/current approval. */
  hasLedOutput?: boolean;
}

export type HardwareConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

class HardwareBridgeManager {
  private connectionState: HardwareConnectionState = 'disconnected';
  private deviceInfo: ConnectedDeviceInfo | null = null;
  private serialPort: SerialPort | null = null;
  private listeners: ((state: HardwareConnectionState, info: ConnectedDeviceInfo | null) => void)[] = [];
  private inputListeners: ((keyIndex: number, gesture: PhysicalGesture, meta?: PhysicalEventMeta) => void)[] = [];
  private channelListeners: ((channelIndex: number) => void)[] = [];
  private holdSwitchListeners: (() => void)[] = [];
  private oledModeListeners: ((mode: OLEDMode) => void)[] = [];
  private lastOledState: OledState | null = null;
  private modeIntent = 0; /* a later selection supersedes a busy retry */
  private requestedModeIndex: number | null = null;
  private inflightModeIndex: number | null = null; /* distinguish an older SET's event from a pad gesture */
  /**
   * The binary protocol decoder exists as soon as the port opens. Only
   * protocolInfo/protocolReady means the device passed PING + validated INFO;
   * legacy text ports never qualify for config or lighting writes.
   */
  private link: Mpad3Link | null = null;
  private protocolInfo: DeviceInfo | null = null;
  private protocolError: string | null = null;

  // Subscribe to connection state changes
  public onStateChange(callback: (state: HardwareConnectionState, info: ConnectedDeviceInfo | null) => void) {
    this.listeners.push(callback);
    callback(this.connectionState, this.deviceInfo);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // Subscribe to live physical input events from the microcontroller
  public onInputEvent(callback: (keyIndex: number, gesture: PhysicalGesture, meta?: PhysicalEventMeta) => void) {
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

  /** The device owns its active screen while connected. The initial GET_STATE
   * and every unsolicited gesture/rotation event use this same subscription. */
  public onOledMode(callback: (mode: OLEDMode) => void) {
    this.oledModeListeners.push(callback);
    if (this.lastOledState && this.protocolInfo?.hasOledStream) {
      callback(OLED_MODE_IDS[this.lastOledState.mode]);
    }
    return () => {
      this.oledModeListeners = this.oledModeListeners.filter(cb => cb !== callback);
    };
  }

  private acceptOledState(state: OledState): boolean {
    const mode = OLED_MODE_IDS[state.mode];
    if (!mode) return false;
    const previous = this.lastOledState;
    if (previous) {
      const delta = (state.epoch - previous.epoch + 0x10000) & 0xffff;
      if (delta >= 0x8000 || (delta === 0 && state.mode !== previous.mode)) return false;
    }
    this.lastOledState = state;
    if (!previous || previous.mode !== state.mode) {
      this.oledModeListeners.forEach(cb => cb(mode));
    }
    return true;
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.connectionState, this.deviceInfo));
  }

  private notifyInput(keyIndex: number, gesture: PhysicalGesture, meta?: PhysicalEventMeta) {
    this.inputListeners.forEach(cb => cb(keyIndex, gesture, meta));
  }

  private notifyHoldSwitch() {
    this.holdSwitchListeners.forEach(cb => cb());
  }

  private notifyChannel(channelIndex: number) {
    this.channelListeners.forEach(cb => cb(channelIndex));
  }

  // Request user to select the RP2040 virtual COM port (USB CDC). The OS
  // receives HID keystrokes automatically; only CDC carries MPAD3 pad events.
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
      this.protocolInfo = null;
      this.protocolError = null;
      this.lastOledState = null;
      this.modeIntent++;
      this.requestedModeIndex = null;
      this.inflightModeIndex = null;
      this.connectionState = 'connected';
      this.deviceInfo = {
        type: 'webserial',
        name: 'USB Serial Controller (115200 Baud)',
        portName: 'COM Port (Connected)',
        protocolReady: false,
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

  // Parse one complete protocol line (no trailing newline)
  private handleSerialLine(rawLine: string) {
    // Once MPAD3 is verified, only its binary KEY_EVENT stream owns inputs.
    // Parsing printable fragments of a binary frame as legacy lines would
    // duplicate or spoof host actions.
    if (this.protocolInfo) return;
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
      if (!Number.isNaN(ch) && ch >= 0 && ch < 4) {
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
    // bytes also go to the binary decoder. Some binary payloads contain a newline,
    // so the legacy parser is disabled as soon as a valid MPAD3 probe succeeds.
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
        this.link?.close();
        this.link = null;
        this.protocolInfo = null;
        this.serialPort = null;
        this.lastOledState = null;
        this.modeIntent++;
        this.requestedModeIndex = null;
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
    if (this.serialPort) {
      try { await this.serialPort.close(); } catch { /* ignore */ }
      this.serialPort = null;
    }
    this.connectionState = 'disconnected';
    this.deviceInfo = null;
    this.lastOledState = null;
    this.modeIntent++;
    this.requestedModeIndex = null;
    this.inflightModeIndex = null;
    this.notify();
  }

  // Send deck / keymap configuration packet to the physical microcontroller EEPROM
  /**
   * Push the deck to the pad: read what the pad has, replace the key and knob
   * slots, stream the config, commit it to flash.
   *
   * This replaced a JSON `SYNC_KEYMAP` write that nothing on the device parsed —
   * it "succeeded" whenever the serial port accepted the bytes, which is why an
   * upload looked fine and changed nothing. Success now requires the final
   * SET_ACK, a COMMIT_ACK, and a full config readback matching what was sent.
   */
  public async uploadDeck(
    deck: Deck,
    onProgress?: (p: UploadProgress) => void,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    // A programmatic caller must not bypass the sidebar lock or the modal's
    // disabled button. Check before GET_CONFIG and before any write or callback.
    if (deckIsLocked(deck)) {
      return { ok: false, message: 'Deck is locked. Unlock deck before uploading bindings.',
        mapped: 0, unsupported: [] };
    }
    const link = this.link;
    if (!link || !this.protocolInfo?.hasFlash) {
      return {
        ok: false,
        message: 'No compatible MPAD3 pad with flash has answered the serial probe. Connect a supported USB serial device first.',
        mapped: 0,
        unsupported: [],
      };
    }
    try {
      /* Hold the same exclusive link guard over GET_CONFIG and COMMIT as Display
       * Save; otherwise two writes can both read the old snapshot and erase
       * one another's edits. Preserve all globals and per-channel lighting. */
      const { mapped, unsupported } = await link.updateConfig(
        (base) => {
          const { config, mapped, unsupported } = deckToConfig(deck, base);
          if (hasOledNextAction(config) && !this.protocolInfo?.hasOled) {
            throw new LinkError('pad did not detect an SSD1306 OLED; OLED NEXT cannot run on this hardware');
          }
          const desktopActions = unsupported.filter(binding => binding.route === 'desktop');
          if (desktopActions.length) {
            if (!this.protocolInfo?.hasEvents) {
              throw new LinkError('pad firmware has no KEY_EVENT capability; PC-owned bindings cannot run');
            }
            if (base.global.usbReportEvents !== 1) {
              if (!options.enablePcEvents) {
                throw new LinkError('pad USB key events are off (usbReportEvents=0); enable PC actions in the upload sheet before uploading');
              }
              /* User opted in. Change only the event global when a PC-owned
               * binding actually needs it, alongside the verified full config
               * transaction. Do not silently change their other settings. */
              config.global.usbReportEvents = 1;
            }
            if (typeof window !== 'undefined' && !window.electronAPI?.execAction) {
              throw new LinkError('PC-owned bindings need the Electron desktop app; browser preview has no native executor');
            }
            const requiredMacros = requiredPcMacroIds(deck);
            if (requiredMacros.length) {
              const saved = loadStoredMacros();
              const missing = requiredMacros.filter(id => !saved.some(m => m.id === id && isMacroReady(m)));
              if (missing.length) {
                throw new LinkError(`M${missing.join(', M')} has no saved executable steps in this desktop app; define the macro before uploading`);
              }
            }
          }
          return { config, result: { mapped, unsupported } };
        },
        {
          onRead: () => onProgress?.({ phase: 'reading', sent: 0, total: CHUNK_COUNT }),
          onProgress: (sent: number, total: number) => onProgress?.({ phase: 'sending', sent, total }),
          onStage: (phase) => onProgress?.({ phase, sent: CHUNK_COUNT, total: CHUNK_COUNT }),
        },
      );
      return {
        ok: true,
        message: `Wrote ${mapped} key and knob actions to flash and verified the pad's readback.`,
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

  public get physicalOledMode(): OLEDMode | null {
    return this.protocolInfo?.hasOledStream && this.lastOledState
      ? OLED_MODE_IDS[this.lastOledState.mode] : null;
  }

  /** Select a screen through a confirmed v2 command. If a flash transaction
   * temporarily owns the link, retry the latest user choice rather than losing
   * an ASCII mode change. A later click supersedes the older busy retry. */
  public async selectOledMode(mode: OLEDMode): Promise<boolean> {
    const index = OLED_MODE_IDS.indexOf(mode);
    if (index < 0) return false;
    const link = this.link;
    if (!link || !this.protocolInfo?.hasOledStream) {
      return this.sendSerialCommand(`OLED:MODE:${index}`);
    }
    const intent = ++this.modeIntent;
    this.requestedModeIndex = index;
    const deadline = Date.now() + 8000;
    try {
      while (Date.now() < deadline && this.link === link && intent === this.modeIntent) {
        // Do not register a SET_MODE request until it is ready to go on the
        // wire: a physical MODE_EVENT can supersede an unsent click during Save.
        if (link.isBusy) {
          await new Promise(resolve => setTimeout(resolve, 70));
          continue;
        }
        try {
          this.inflightModeIndex = index;
          try {
            this.acceptOledState(await link.setOledMode(index));
          } finally {
            if (this.link === link && this.inflightModeIndex === index) this.inflightModeIndex = null;
          }
          return this.link === link && intent === this.modeIntent;
        } catch (err) {
          if (this.link !== link || intent !== this.modeIntent) return false;
          const reason = err instanceof Error ? err.message : String(err);
          if (!/\bbusy\b/i.test(reason)) {
            this.protocolError = reason;
            this.notify();
            return false;
          }
          await new Promise(resolve => setTimeout(resolve, 70));
        }
      }
      if (this.link === link && intent === this.modeIntent) {
        this.protocolError = 'OLED mode change was busy for too long';
        this.notify();
      }
      return false;
    } finally {
      if (intent === this.modeIntent) this.requestedModeIndex = null;
    }
  }

  /** Frame data is never saved. Baked loops, a missing panel, an unverified
   * port and a screen the pad hasn't selected are all deliberately skipped. */
  public async streamOledFrame(mode: OLEDMode, pages: Uint8Array): Promise<boolean> {
    const index = OLED_MODE_IDS.indexOf(mode);
    if (index < 0 || !getOLEDMode(mode).runtime || !this.link ||
        !this.protocolInfo?.hasOledStream || this.connectionState !== 'connected' ||
        !this.deviceInfo?.protocolReady || this.lastOledState?.mode !== index) return false;
    return this.link.streamOledFrame(index, pages);
  }

  /**
   * Binary frames the pad sends on its own.
   *
   * Firmware streams KEY_EVENT frames (docs/PROTOCOL.md, 0xC0). Preserve the
   * event kind, channel, firmware action and detent/duration field: flattening
   * everything into press/release made tap and hold indistinguishable, doubled
   * device-owned actions, and lost knob taps and batched detents.
   */
  private handleLinkEvent(e: LinkEvent) {
    if (e.kind === 'error') {
      this.protocolError = e.statusName;
      this.notify();
      return;
    }
    if (e.kind === 'oledMode') {
      const before = this.lastOledState;
      const fresh = this.acceptOledState(e.state);
      if (fresh && (!before || before.epoch !== e.state.epoch) &&
          this.requestedModeIndex !== null && e.state.mode !== this.requestedModeIndex &&
          e.state.mode !== this.inflightModeIndex) {
        // A genuinely new pad screen wins over a queued, unsent UI click.
        // The event for an older, already-sent SET must NOT cancel a later click.
        this.modeIntent++;
        this.requestedModeIndex = null;
      }
      return;
    }
    if (e.kind !== 'key') return;

    const { source, index, event, channel, action, value } = e.key;
    const KEY = 0;
    const PRESS = 1, RELEASE = 2, TAP = 3, HOLD = 4, HOLD_RELEASE = 5, DOUBLE_TAP = 6;
    const ENC_CW = 7, ENC_CCW = 8, CHANNEL_CHANGE = 9;
    const meta: PhysicalEventMeta = { channel, firmwareAction: action, value };

    if (event === CHANNEL_CHANGE) {
      this.notifyChannel(channel);
      return;
    }

    if (source !== KEY) {
      if (event === ENC_CW) this.notifyInput(9, 'dial_cw', meta);
      else if (event === ENC_CCW) this.notifyInput(9, 'dial_ccw', meta);
      else if (event === TAP) this.notifyInput(9, 'dial_tap', meta);
      else if (event === HOLD) {
        this.notifyHoldSwitch();
        this.notifyInput(9, 'dial_hold', meta);
      } else if (event === HOLD_RELEASE) this.notifyInput(9, 'dial_hold_release', meta);
      else if (event === PRESS) this.notifyInput(9, 'down', meta);
      else if (event === RELEASE) this.notifyInput(9, 'up', meta);
      return;
    }

    if (index >= 9) return;
    if (event === PRESS) this.notifyInput(index, 'down', meta);
    else if (event === RELEASE) this.notifyInput(index, 'up', meta);
    else if (event === TAP) this.notifyInput(index, 'tap', meta);
    else if (event === HOLD) this.notifyInput(index, 'hold', meta);
    else if (event === HOLD_RELEASE) this.notifyInput(index, 'hold_release', meta);
    else if (event === DOUBLE_TAP) this.notifyInput(index, 'double_tap', meta);
  }

  private async probeProtocol() {
    const link = this.link;
    if (!link) return;
    try {
      const info = await link.probe();
      if (this.link !== link) return;
      this.protocolInfo = info;
      this.protocolError = null;
      link.onFrame((e) => { if (this.link === link) this.handleLinkEvent(e); });
      if (info.hasOledStream) {
        try {
          // A saved boot mode may be hours behind a gesture/timer selection.
          // Query the actual cursor BEFORE enabling the app's stream effect.
          this.acceptOledState(await link.readOledMode());
        } catch (err) {
          // Keep keys and flash usable, but don't stream to an unknown screen.
          info.hasOledStream = false;
          this.protocolError = `OLED mode sync unavailable: ${err instanceof Error ? err.message : String(err)}`;
        }
        if (this.link !== link) return;
      }
      this.deviceInfo = this.deviceInfo ? {
        ...this.deviceInfo, protocolReady: true,
        hasFlash: info.hasFlash, hasEvents: info.hasEvents, hasOled: info.hasOled,
        hasOledStream: info.hasOledStream, hasLedOutput: info.hasLedOutput,
      } : null;
      this.notify();
    } catch (err) {
      if (this.link !== link) return;
      this.protocolInfo = null;
      this.protocolError = err instanceof Error ? err.message : String(err);
      this.deviceInfo = this.deviceInfo ? { ...this.deviceInfo, protocolReady: false } : null;
      this.notify();
    }
  }

  private requireLink(): Mpad3Link {
    if (!this.link || !this.protocolInfo) {
      throw new LinkError('no compatible MPAD3 device answered the serial probe');
    }
    return this.link;
  }

  /** Save may store an inactive preset; preview must have actual bench LED drive. */
  public async writeLighting(channel: number, L: Lighting, save: boolean): Promise<void> {
    const link = this.requireLink();
    if (!save && !this.protocolInfo?.hasLedOutput) {
      throw new LinkError('physical LED data output is disabled; preview is unavailable');
    }
    await link.writeLighting(channel, L, save);
  }

  public async readLighting(channel: number): Promise<Lighting> {
    return this.requireLink().readLighting(channel);
  }

  private requireOledLink(): Mpad3Link {
    const link = this.requireLink();
    if (!this.protocolInfo?.hasFlash || !this.protocolInfo.hasOled) {
      throw new LinkError('a compatible MPAD3 pad with flash and a responding OLED is required');
    }
    return link;
  }

  /** Read stored boot settings. Labels/telemetry are streamed while connected,
   * never written into the pad's flash config. */
  public async readDisplaySettings(): Promise<PhysicalDisplaySettings> {
    const cfg = await this.requireOledLink().readConfig();
    const g = cfg.global;
    return {
      mode: OLED_MODE_IDS[g.oledBootMode] ?? OLED_MODE_IDS[0],
      brightness: Math.round((g.oledContrast * 100) / 255),
      inverted: g.oledInverted === 1,
      autoCycleS: clampAutoCycleS(g.oledAutoCycleS),
      playlist: maskToPlaylist(g.oledPlaylist),
    };
  }

  /** Change ONLY display globals from the pad's latest full config. All keys,
   * knob actions, lighting and other globals survive. The link's exclusive
   * transaction requires SET_ACK, flash COMMIT_ACK and a matching readback. */
  public async saveDisplaySettings(state: PhysicalDisplaySettings): Promise<void> {
    const link = this.requireOledLink();
    const bootMode = OLED_MODE_IDS.indexOf(state.mode);
    const brightness = state.brightness;
    if (bootMode < 0 || !Number.isFinite(brightness) || brightness < 0 || brightness > 100) {
      throw new LinkError('display mode or brightness is outside the SSD1306 range');
    }
    const contrast = Math.round(brightness * 255 / 100);
    const autoCycleS = clampAutoCycleS(state.autoCycleS);
    const mask = playlistToMask(normalizePlaylist(state.playlist));
    await link.updateConfig((base) => ({
      config: {
        ...base,
        global: {
          ...base.global,
          oledBootMode: bootMode,
          oledContrast: contrast,
          oledInverted: state.inverted ? 1 : 0,
          oledAutoCycleS: autoCycleS,
          oledPlaylist: mask,
        },
      },
      result: undefined,
    }), { requireOled: true });
  }

  /** Current-limited bench wiring test only. Never infer power safety from INFO. */
  public async ledTest(rgb: Array<[number, number, number]>): Promise<void> {
    const link = this.requireLink();
    if (!this.protocolInfo?.hasLedOutput) {
      throw new LinkError('physical LED data output is disabled; raw LED test is unavailable');
    }
    await link.ledTest(rgb);
  }

  // OLED: text shares USB CDC with MPAD3 frames. Use the link writer whenever
  // one exists: a second getWriter() can corrupt a binary save mid-flight.
  public async sendSerialCommand(command: string): Promise<boolean> {
    if (this.link) {
      try {
        await this.link.sendAscii(command);
        return true;
      } catch (err) {
        console.warn('OLED command not sent:', err);
        return false;
      }
    }
    if (!this.serialPort?.writable) return false;
    try {
      const writer = this.serialPort.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(`${command}\n`));
      } finally {
        writer.releaseLock();
      }
      return true;
    } catch (err) {
      console.warn('OLED command not sent:', err);
      return false;
    }
  }
}

export const hardwareBridge = new HardwareBridgeManager();
