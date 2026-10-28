import React, { useState } from 'react';
import { Layer } from '../types';
import { ConnectedDeviceInfo, HardwareConnectionState } from '../utils/hardwareBridge';
import {
  Sliders,
  Minus,
  Square,
  X,
  Usb,
  Cpu,
  RefreshCw,
  Power,
  Activity,
  Zap,
} from 'lucide-react';

interface TopNavbarProps {
  activeLayer: Layer;
  onSelectLayer: (layerId: string) => void;
  onToggleLock: () => void;
  onTriggerOSD: () => void;
  activeTab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros';
  onChangeTab: (tab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros') => void;
  hardwareState: HardwareConnectionState;
  deviceInfo: ConnectedDeviceInfo | null;
  onConnectHID: () => void;
  onConnectSerial: () => void;
  onDisconnectHardware?: () => void;
  onSyncEEPROM: () => void;
  onOpenUploadModal?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenFirmwareModal?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeLayer,
  onSelectLayer,
  onToggleLock,
  onTriggerOSD,
  activeTab,
  onChangeTab,
  hardwareState,
  deviceInfo,
  onConnectHID,
  onConnectSerial,
  onDisconnectHardware,
  onSyncEEPROM,
  onOpenUploadModal,
  onOpenDiagnostics,
  onOpenFirmwareModal,
}) => {
  const [showConnectMenu, setShowConnectMenu] = useState(false);

  return (
    <header className="h-14 border-b border-white/10 bg-[#0C0E14] px-4 flex items-center justify-between select-none">
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#D44400] flex items-center justify-center font-mono font-black text-xs text-black shadow-orange-glow">
            K
          </div>
          <span className="font-bold tracking-tight text-white text-sm">
            KADOWAZ <span className="text-[#FF5E00]">DECK</span>
          </span>
        </div>
      </div>

      {/* Center: Module Navigation Tabs (VIA Suite) */}
      <div className="flex items-center gap-1 p-1 bg-[#121620] rounded-xl border border-white/5 text-xs font-medium">
        <button
          onClick={() => onChangeTab('designer')}
          className={`px-3 py-1 rounded-lg transition-colors ${activeTab === 'designer'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          Deck Studio
        </button>

        <button
          onClick={() => onChangeTab('tester')}
          className={`px-3 py-1 rounded-lg transition-colors ${activeTab === 'tester'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          Key Tester
        </button>

        <button
          onClick={() => onChangeTab('shortcuts')}
          className={`px-3 py-1 rounded-lg transition-colors ${activeTab === 'shortcuts'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          Shortcuts
        </button>

        <button
          onClick={() => onChangeTab('apps')}
          className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'apps'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          <span>App Library</span>
        </button>

        <button
          onClick={() => onChangeTab('lighting')}
          className={`px-3 py-1 rounded-lg transition-colors ${activeTab === 'lighting'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          Lighting
        </button>

        <button
          onClick={() => onChangeTab('macros')}
          className={`px-3 py-1 rounded-lg transition-colors ${activeTab === 'macros'
              ? 'bg-[#FF5E00] text-black font-semibold shadow-xs'
              : 'text-white/60 hover:text-white'
            }`}
        >
          Macros
        </button>
      </div>

      {/* Right: Hardware Microcontroller Status + Export/Import */}
      <div className="flex items-center gap-2">
        {/* HARDWARE MICROCONTROLLER CONNECTION PILL */}
        <div className="relative">
          {hardwareState === 'connected' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/10 border border-[#10B981]/40 text-xs font-mono text-[#38EF7D]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
              <span className="font-bold">CONNECTED</span>
              <button
                onClick={onSyncEEPROM}
                title="Sync Keymap to Flash Memory / EEPROM"
                className="ml-1 p-0.5 rounded hover:bg-[#10B981]/20 text-[#38EF7D] cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                onClick={onDisconnectHardware}
                title="Disconnect Microcontroller"
                className="ml-1 p-0.5 rounded hover:bg-red-500/20 text-red-400 cursor-pointer"
              >
                <Power className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={() => setShowConnectMenu(!showConnectMenu)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 hover:border-[#FF5E00]/60 text-xs font-mono text-white/70 hover:text-white transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <Usb className="w-3.5 h-3.5 text-[#FF5E00]" />
                <span className="font-bold text-white/80">NOT CONNECTED</span>
                <ChevronDown className="w-3 h-3 text-white/40" />
              </button>

              {/* Connect Menu Dropdown */}
              {showConnectMenu && (
                <div className="absolute top-full right-0 mt-1.5 w-56 rounded-xl bg-[#161B26] border border-white/15 shadow-2xl p-2 z-50 space-y-1 animate-in fade-in duration-100">
                  <div className="text-[10px] font-mono text-white/40 px-1 py-0.5 uppercase">
                    Connect Microcontroller
                  </div>
                  <button
                    onClick={() => { setShowConnectMenu(false); onConnectHID(); }}
                    className="w-full text-left p-2 rounded-lg bg-black/40 hover:bg-[#FF5E00]/10 hover:text-[#FF5E00] text-xs font-mono border border-white/5 transition-colors cursor-pointer"
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Usb className="w-3 h-3 text-[#FF5E00]" />
                      WebHID Macropad
                    </div>
                    <div className="text-[9px] text-white/40 font-normal">QMK / Raw HID endpoint (0xFF60)</div>
                  </button>

                  <button
                    onClick={() => { setShowConnectMenu(false); onConnectSerial(); }}
                    className="w-full text-left p-2 rounded-lg bg-black/40 hover:bg-[#FF5E00]/10 hover:text-[#FF5E00] text-xs font-mono border border-white/5 transition-colors cursor-pointer"
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      <Cpu className="w-3 h-3 text-[#38EF7D]" />
                      USB Serial / COM Port
                    </div>
                    <div className="text-[9px] text-white/40 font-normal">Arduino / RP2040 CDC Serial (115200)</div>
                  </button>

                  <div className="border-t border-white/10 pt-1 mt-1">
                    <button
                      onClick={() => { setShowConnectMenu(false); onOpenFirmwareModal?.(); }}
                      className="w-full text-left p-2 rounded-lg bg-black/40 hover:bg-[#00F0FF]/10 hover:text-[#00F0FF] text-xs font-mono border border-white/5 transition-colors cursor-pointer"
                    >
                      <div className="font-bold flex items-center gap-1.5 text-white/90">
                        <Zap className="w-3 h-3 text-[#FF5E00]" />
                        Flash Firmware (.uf2)...
                      </div>
                      <div className="text-[9px] text-white/40 font-normal">RP2040 BOOTSEL mass-storage</div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PROMINENT UPLOAD ALL TO MACROPAD BUTTON */}
        <button
          onClick={onOpenUploadModal}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#FF5E00] to-[#FF8C00] hover:from-[#FF701A] hover:to-[#FFA024] text-black font-black text-xs font-mono shadow-[0_0_15px_rgba(255,94,0,0.4)] active:scale-95 transition-all cursor-pointer"
          title="Upload all 3 Layers & Dial to Physical Macropad"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>UPLOAD TO DECK</span>
        </button>


        {/* Diagnostics & Action History Drawer Trigger */}
        <button
          onClick={onOpenDiagnostics}
          title="Diagnostics & Action History Log"
          className="p-1.5 rounded-lg border border-white/10 text-white/60 hover:text-[#00F0FF] hover:border-[#00F0FF]/40 hover:bg-[#00F0FF]/10 transition-colors"
        >
          <Activity className="w-3.5 h-3.5" />
        </button>

        {/* Window controls */}
        <div className="flex items-center gap-1 pl-2 border-l border-white/10">
          <button
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).electronAPI?.windowControl?.('minimize');
            }}
            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).electronAPI?.windowControl?.('maximize');
            }}
            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).electronAPI?.windowControl?.('close');
            }}
            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
};
