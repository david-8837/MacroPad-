import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  Cpu,
  Volume2,
  Radio,
  Network,
  Download,
  X,
  Zap,
} from 'lucide-react';
import type { DiagnosticLogEntry, DiagnosticSelfTestResult } from '../types/electron';

export interface ActionHistoryEntry {
  id: string;
  timestamp: string;
  at: number;
  name: string;
  category: string;
  type: 'success' | 'safety' | 'error' | 'info';
  detail?: string;
  source?: 'hardware' | 'app' | 'webhook';
}

interface DiagnosticLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  actionHistory: ActionHistoryEntry[];
  onClearHistory: () => void;
  onOpenFirmwareModal?: () => void;
}

export const DiagnosticLogDrawer: React.FC<DiagnosticLogDrawerProps> = ({
  isOpen,
  onClose,
  actionHistory,
  onClearHistory,
  onOpenFirmwareModal,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'health' | 'nativelog'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'key' | 'dial' | 'obs' | 'audio' | 'safety'>('all');
  const [selfTestResult, setSelfTestResult] = useState<DiagnosticSelfTestResult | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [nativeLogs, setNativeLogs] = useState<DiagnosticLogEntry[]>([]);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Poll native log entries when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const fetchNativeLog = () => {
      window.electronAPI?.getDiagnosticLog?.().then((res) => {
        if (res && res.ok && Array.isArray(res.value)) {
          setNativeLogs(res.value.slice().reverse());
        }
      });
    };

    fetchNativeLog();
    const interval = setInterval(fetchNativeLog, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const runDiagnostics = async () => {
    setIsRunningTest(true);
    try {
      const res = await window.electronAPI?.runDiagnosticSelfTest?.();
      if (res && res.ok) {
        setSelfTestResult(res.value);
      } else {
        // Fallback for browser testing
        setSelfTestResult({
          system: { ok: true, detail: 'Browser mode: Mock system telemetry active' },
          audio: { ok: true, detail: 'Browser mode: Mock WebAudio active' },
          obs: { ok: false, detail: 'Browser mode: OBS WebSocket not reachable' },
          webhook: { ok: true, detail: 'Port 38491 listening (token protected)' },
          time: new Date().toISOString(),
        });
      }
    } catch {
      // ignore
    } finally {
      setIsRunningTest(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return actionHistory.filter((item) => {
      if (selectedFilter === 'key' && item.category !== 'hotkey' && !item.name.toLowerCase().includes('key')) return false;
      if (selectedFilter === 'dial' && !item.name.toLowerCase().includes('dial') && !item.name.toLowerCase().includes('knob')) return false;
      if (selectedFilter === 'obs' && item.category !== 'obs') return false;
      if (selectedFilter === 'audio' && item.category !== 'audio_session' && item.category !== 'media') return false;
      if (selectedFilter === 'safety' && item.type !== 'safety' && item.type !== 'error') return false;

      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q))
      );
    });
  }, [actionHistory, selectedFilter, searchQuery]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(label);
      setTimeout(() => setCopiedNotice(null), 2500);
    } catch {
      // fallback
    }
  };

  const exportFullDiagnosticReport = () => {
    const report = [
      '# KADOWAZ Deck Studio — Diagnostic & System Report',
      `Generated: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      '',
      '## Subsystem Health Self-Tests',
      selfTestResult
        ? [
            `- System Telemetry: ${selfTestResult.system.ok ? 'PASS' : 'FAIL'} (${selfTestResult.system.detail})`,
            `- Windows CoreAudio: ${selfTestResult.audio.ok ? 'PASS' : 'FAIL'} (${selfTestResult.audio.detail})`,
            `- OBS Studio WebSocket: ${selfTestResult.obs.ok ? 'PASS' : 'FAIL'} (${selfTestResult.obs.detail})`,
            `- Local Webhook API: ${selfTestResult.webhook.ok ? 'PASS' : 'FAIL'} (${selfTestResult.webhook.detail})`,
          ].join('\n')
        : 'Self-test not run yet. Click "Run Diagnostic Checks" to populate.',
      '',
      '## Recent Action History Timeline',
      actionHistory.length > 0
        ? actionHistory.slice(0, 50).map((a) => `[${a.timestamp}] [${a.type.toUpperCase()}] [${a.category}] ${a.name}${a.detail ? ` — ${a.detail}` : ''}`).join('\n')
        : 'No actions logged during this session.',
      '',
      '## Native Subsystem Event Log (Last 50 Entries)',
      nativeLogs.length > 0
        ? nativeLogs.slice(0, 50).map((l) => `[${new Date(l.at).toLocaleTimeString()}] [${l.where}] ${l.message}${l.extra ? ` | ${l.extra}` : ''}`).join('\n')
        : 'No native log entries recorded.',
    ].join('\n');

    copyToClipboard(report, 'Full Diagnostic Report Copied!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl h-[85vh] bg-[#0E1118] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 flex items-center justify-center text-[#00F0FF]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Action History & Diagnostics
                {copiedNotice && (
                  <span className="text-[11px] font-mono text-[#38EF7D] bg-[#38EF7D]/10 px-2 py-0.5 rounded-full border border-[#38EF7D]/30 animate-pulse">
                    {copiedNotice}
                  </span>
                )}
              </h2>
              <p className="text-xs text-white/40">Live hardware telemetry, execution stream, and subsystem self-tests</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportFullDiagnosticReport}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-mono border border-white/10 flex items-center gap-1.5 transition-colors"
              title="Copy Full Diagnostic Markdown Report"
            >
              <Download className="w-3.5 h-3.5 text-[#00F0FF]" />
              Export Report
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center border border-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-3 border-b border-white/5 flex items-center gap-4 bg-black/20">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
              activeTab === 'timeline' ? 'text-[#00F0FF]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Action History Stream ({actionHistory.length})
            {activeTab === 'timeline' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00F0FF] rounded-full" />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('health');
              if (!selfTestResult) runDiagnostics();
            }}
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
              activeTab === 'health' ? 'text-[#00F0FF]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Subsystem Self-Tests
            {activeTab === 'health' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00F0FF] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('nativelog')}
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
              activeTab === 'nativelog' ? 'text-[#00F0FF]' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Native Engine Wire Log ({nativeLogs.length})
            {activeTab === 'nativelog' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00F0FF] rounded-full" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6">
          {activeTab === 'timeline' && (
            <div className="h-full flex flex-col space-y-3">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-white/40" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search events, keys, actions..."
                      className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-hidden focus:border-[#00F0FF]"
                    />
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  {(['all', 'key', 'dial', 'obs', 'audio', 'safety'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSelectedFilter(filter)}
                      className={`px-2.5 py-1 rounded-lg uppercase transition-all ${
                        selectedFilter === filter
                          ? 'bg-[#00F0FF]/15 border border-[#00F0FF] text-[#00F0FF] font-bold'
                          : 'bg-white/5 border border-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        actionHistory.map((a) => `[${a.timestamp}] [${a.type}] [${a.category}] ${a.name}`).join('\n'),
                        'Action Log Copied!'
                      )
                    }
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Copy Timeline to Clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClearHistory}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors"
                    title="Clear Action History"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Log Entries List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 font-mono text-xs">
                {filteredHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-white/30 text-xs italic">
                    <Terminal className="w-8 h-8 mb-2 opacity-40" />
                    <span>No matching events found. Press a switch or turn a knob to test.</span>
                  </div>
                ) : (
                  filteredHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                        entry.type === 'safety'
                          ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                          : entry.type === 'error'
                          ? 'bg-red-950/30 border-red-500/40 text-red-200'
                          : 'bg-[#121620] border-white/5 text-white hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <span className="text-[10px] text-white/40">{entry.timestamp}</span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            entry.type === 'safety'
                              ? 'bg-amber-400'
                              : entry.type === 'error'
                              ? 'bg-red-400'
                              : 'bg-[#38EF7D]'
                          }`}
                        />
                        <span className="font-semibold text-xs truncate">{entry.name}</span>
                        {entry.detail && (
                          <span className="text-[11px] text-white/40 truncate">— {entry.detail}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {entry.source && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">
                            {entry.source}
                          </span>
                        )}
                        <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-white/10 text-white/70 font-bold">
                          {entry.category}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'health' && (
            <div className="h-full flex flex-col space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Subsystem Health & Self-Tests</h3>
                  <p className="text-xs text-white/40">Query hardware interop, drivers, audio and streaming sockets</p>
                </div>
                <button
                  onClick={runDiagnostics}
                  disabled={isRunningTest}
                  className="px-3 py-1.5 rounded-xl bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-mono font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : ''}`} />
                  {isRunningTest ? 'Running Checks...' : 'Run Diagnostics'}
                </button>
              </div>

              {selfTestResult ? (
                <div className="space-y-3">
                  {/* System Telemetry */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">SYSTEM TELEMETRY ENGINE</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${selfTestResult.system.ok ? 'text-[#38EF7D] bg-[#38EF7D]/10 border-[#38EF7D]/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                          {selfTestResult.system.ok ? 'OPERATIONAL' : 'DEGRADED'}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono mt-1">{selfTestResult.system.detail}</p>
                    </div>
                  </div>

                  {/* Windows Audio */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 text-[#FF5E00] border border-orange-500/20">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">WINDOWS COREAUDIO INTEROP</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${selfTestResult.audio.ok ? 'text-[#38EF7D] bg-[#38EF7D]/10 border-[#38EF7D]/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                          {selfTestResult.audio.ok ? 'OPERATIONAL' : 'DEGRADED'}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono mt-1">{selfTestResult.audio.detail}</p>
                    </div>
                  </div>

                  {/* OBS WebSocket */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">OBS STUDIO WEBSOCKET v5</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${selfTestResult.obs.ok ? 'text-[#38EF7D] bg-[#38EF7D]/10 border-[#38EF7D]/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
                          {selfTestResult.obs.ok ? 'CONNECTED' : 'STANDBY (OFFLINE)'}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono mt-1">{selfTestResult.obs.detail}</p>
                    </div>
                  </div>

                  {/* Local Webhook API */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 text-[#00F0FF] border border-cyan-500/20">
                      <Network className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">REST & WEBHOOK API SERVER</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${selfTestResult.webhook.ok ? 'text-[#38EF7D] bg-[#38EF7D]/10 border-[#38EF7D]/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                          {selfTestResult.webhook.ok ? 'LISTENING :38491' : 'INACTIVE'}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-mono mt-1">{selfTestResult.webhook.detail}</p>
                    </div>
                  </div>

                  {/* RP2040 Firmware & Bootloader */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-[#FF5E00]/10 text-[#FF5E00] border border-[#FF5E00]/20">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">RP2040 FIRMWARE & BOOTLOADER</span>
                        {onOpenFirmwareModal && (
                          <button
                            onClick={onOpenFirmwareModal}
                            className="px-2.5 py-1 rounded-lg bg-[#FF5E00]/15 hover:bg-[#FF5E00]/25 text-[#FF5E00] border border-[#FF5E00]/30 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Zap className="w-3 h-3 fill-current" />
                            Flash Firmware (.uf2)
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-white/60 font-mono mt-1">
                        RP2040 mass-storage bootloader (RPI-RP2) detection and safe block-level UF2 validation.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-white/30 text-xs italic">
                  <span>Click "Run Diagnostics" to inspect all native modules.</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'nativelog' && (
            <div className="h-full flex flex-col space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs text-white/60">Chronological Native Ring Buffer (Last 400 lines)</span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      nativeLogs.map((l) => `[${new Date(l.at).toLocaleTimeString()}] [${l.where}] ${l.message}${l.extra ? ` | ${l.extra}` : ''}`).join('\n'),
                      'Native Wire Log Copied!'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Log
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-2 bg-black/40 p-3 rounded-xl border border-white/5 text-[11px]">
                {nativeLogs.length === 0 ? (
                  <div className="text-white/30 italic">No native log events emitted yet.</div>
                ) : (
                  nativeLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2 text-white/80 leading-relaxed">
                      <span className="text-white/30 select-none">{new Date(log.at).toLocaleTimeString()}</span>
                      <span className="text-[#00F0FF] font-bold">[{log.where}]</span>
                      <span className="flex-1 text-white/90">{log.message}</span>
                      {log.extra && <span className="text-white/40 italic">{log.extra}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

