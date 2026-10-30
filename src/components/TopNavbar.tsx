import React, { useState } from 'react';
import { ConnectedDeviceInfo, HardwareConnectionState } from '../utils/hardwareBridge';
import {
  Minus,
  Square,
  X,
  ChevronDown,
  Usb,
  Cpu,
  Power,
  Activity,
  Zap,
} from 'lucide-react';

interface TopNavbarProps {
  activeTab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros' | 'presets';
  onChangeTab: (tab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros' | 'presets') => void;
  hardwareState: HardwareConnectionState;
  deviceInfo: ConnectedDeviceInfo | null;
  onConnectSerial: () => void;
  onDisconnectHardware?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenFirmwarePanel?: () => void;
}

// The Applications page is deliberately not a tab: it is a launcher you visit to
// assign one key, not a workspace you sit in. Reach it from Ctrl+K or from the
// App action in the key drawer; the page carries its own way back.
const TABS = [
  { id: 'designer', label: 'Keys', index: '01' },
  { id: 'presets', label: 'Presets', index: '02' },
  { id: 'tester', label: 'Tester', index: '03' },
  { id: 'shortcuts', label: 'Shortcuts', index: '04' },
  { id: 'lighting', label: 'Lighting', index: '05' },
  { id: 'macros', label: 'Macros', index: '06' },
] as const;

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  onChangeTab,
  hardwareState,
  deviceInfo,
  onConnectSerial,
  onDisconnectHardware,
  onOpenDiagnostics,
  onOpenFirmwarePanel,
}) => {
  const [showConnectMenu, setShowConnectMenu] = useState(false);

  const connected = hardwareState === 'connected';

  return (
    <header className="app-header h-16 shrink-0 border-b border-[#C7C7C7] bg-[#E3E2DE] select-none z-50">
      <div className="h-full flex items-stretch min-w-0">

        {/* ── identity · brand + deck ───────────────────────────── */}
        <div className="flex items-center gap-3 pl-4 pr-4 border-r border-[#C7C7C7] shrink-0 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="brand-mark w-6 h-6 bg-[#141414] text-[#E3E2DE] font-mono text-[11px] font-bold flex items-center justify-center">
              K
            </span>
            <span className="text-[13px] font-bold uppercase tracking-[-0.02em] text-[#141414] leading-none">
              Kadowaz<span className="text-[#646464]"> / Macropad</span>
            </span>
          </div>
        </div>

        {/* ── cols 4–9 · modules ─────────────────────────────────── */}
        <nav className="flex-1 flex items-stretch justify-start px-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Modules">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChangeTab(t.id)}
                aria-current={on ? 'true' : undefined}
                className={`premium-nav-link group relative px-3 flex items-center gap-1.5 border-b-2 transition-colors duration-300 shrink-0 ${
                  on
                    ? 'border-[#1351AA] text-[#1351AA]'
                    : 'border-transparent text-[#646464] hover:text-[#141414]'
                }`}
              >
                <span className="hidden xl:inline font-mono text-[9px] tracking-[0.1em] opacity-60">{t.index}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em]">{t.label}</span>
              </button>
            );
          })}

        </nav>

        {/* ── cols 10–12 · hardware + actions ────────────────────── */}
        <div className="flex items-center justify-end gap-1.5 pr-3 pl-3 border-l border-[#C7C7C7] shrink-0">
          {/* hardware state */}
          <div className="relative">
            {connected ? (
              <div className="flex items-center gap-2 h-8 px-2 border border-[#C7C7C7] bg-[#FFFFFF]">
                <span className="mark mark--on" />
                <span className="font-mono text-[9px] font-bold tracking-[0.1em] text-[#141414]">
                  {deviceInfo?.protocolReady ? 'MPAD3 READY' : 'SERIAL OPEN'}
                </span>
                <button
                  onClick={onDisconnectHardware}
                  title="Disconnect"
                  className="w-5 h-5 flex items-center justify-center text-[#646464] hover:text-[#141414] transition-colors"
                >
                  <Power className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowConnectMenu(!showConnectMenu)}
                  aria-label="Connect macropad"
                  className="flex items-center gap-2 h-8 px-2 border border-[#C7C7C7] hover:border-[#141414] transition-colors"
                >
                  <span className="mark mark--off" />
                  <Usb className="w-3 h-3 text-[#646464]" />
                  <span className="font-mono text-[9px] font-bold tracking-[0.1em] text-[#444343]">CONNECT</span>
                  <ChevronDown className="w-3 h-3 text-[#646464]" />
                </button>

                {showConnectMenu && (
                  <div className="absolute top-full right-0 mt-2 w-[248px] bg-[#FFFFFF] border border-[#C7C7C7] z-50">
                    <div className="px-3 py-2 border-b border-[#C7C7C7]">
                      <span className="eyebrow">Connect device</span>
                    </div>
                    <div className="px-3 py-2 text-[9px] font-mono text-[#646464] border-b border-[#E3E2DE]">
                      HID keystrokes work through the OS. Use USB serial for configuration and pad events.
                    </div>
                    <button
                      onClick={() => { setShowConnectMenu(false); onConnectSerial(); }}
                      className="w-full text-left px-3 py-2.5 border-b border-[#E3E2DE] hover:bg-[#EDECE8] transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#141414]">
                        <Cpu className="w-3 h-3 text-[#1351AA]" /> USB serial
                      </span>
                      <span className="block mt-0.5 font-mono text-[9px] text-[#646464]">
                        RP2040 CDC · 115200 baud
                      </span>
                    </button>
                    <button
                      onClick={() => { setShowConnectMenu(false); onOpenFirmwarePanel?.(); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-[#EDECE8] transition-colors"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#141414]">
                        <Zap className="w-3 h-3 text-[#1351AA]" /> Firmware &amp; bootloader
                      </span>
                      <span className="block mt-0.5 font-mono text-[9px] text-[#646464]">
                        Expand left sidebar · RP2040 .uf2
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* tool squares */}
          {[
            { icon: <Activity className="w-3.5 h-3.5" />, title: 'Expand Hardware Status & Diagnostics', fn: onOpenDiagnostics },
          ].map((b) => (
            <button
              key={b.title}
              onClick={b.fn}
              title={b.title}
              className="w-8 h-8 flex items-center justify-center border border-[#C7C7C7] text-[#444343] hover:border-[#141414] hover:bg-[#141414] hover:text-[#E3E2DE] transition-colors"
            >
              {b.icon}
            </button>
          ))}

          {/* window controls */}
          <div className="flex items-center ml-1 border-l border-[#C7C7C7] pl-2 gap-0.5">
            {[
              { icon: <Minus className="w-3 h-3" />, act: 'minimize', hover: 'hover:bg-[#EDECE8]' },
              { icon: <Square className="w-2.5 h-2.5" />, act: 'maximize', hover: 'hover:bg-[#EDECE8]' },
              { icon: <X className="w-3 h-3" />, act: 'close', hover: 'hover:bg-[#141414] hover:text-[#E3E2DE]' },
            ].map((w) => (
              <button
                key={w.act}
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (window as any).electronAPI?.windowControl?.(w.act);
                }}
                className={`w-6 h-6 flex items-center justify-center text-[#646464] transition-colors ${w.hover}`}
              >
                {w.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
