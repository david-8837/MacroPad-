// Microcontroller WebHID and WebSerial Communication Bridge
// Connects desktop software to physical Arduino, RP2040, QMK, or Vial devices

// Ambient type aliases for WebHID & WebSerial browser APIs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HIDDevice = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerialPort = any;

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

  // Subscribe to the firmware's confirmation that a knob hold already switched channel on-device
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
      const devices = await navHid.requestDevice({
        filters: [] // Allow user to pick any connected USB HID keyboard / macropad
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
    } else if (parts[0] === 'CHANNEL' && parts.length >= 2) {
      const ch = parseInt(parts[1], 10) - 1;
      if (!Number.isNaN(ch) && ch >= 0 && ch < 3) {
        this.notifyChannel(ch);
      }
    }
  }

  private async readSerialStream(port: SerialPort) {
    if (!port.readable) return;
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable).catch(() => { /* port closed */ });
    const reader = textDecoder.readable.getReader();

    // Serial chunks do not respect line boundaries ("KEY:0:D" + "OWN\n"), so
    // accumulate text and only parse complete newline-terminated lines.
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += value;
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

  // Send Profile / Keymap configuration packet to physical microcontroller EEPROM
  public async syncKeymapToHardware(packetData: Uint8Array): Promise<boolean> {
    if (this.hidDevice && this.hidDevice.opened) {
      try {
        await this.hidDevice.sendReport(0x00, packetData);
        return true;
      } catch (err) {
        console.error('HID send report error:', err);
        return false;
      }
    } else if (this.serialPort && this.serialPort.writable) {
      try {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(packetData);
        writer.releaseLock();
        return true;
      } catch (err) {
        console.error('Serial write error:', err);
        return false;
      }
    }
    return false;
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
