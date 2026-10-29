import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Terminal,
  Copy,
  Trash2,
  RefreshCw,
  Search,
  Cpu,
  Volume2,
  Network,
  Download,
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

interface HardwareDiagnosticsPanelProps {
  isExpanded: boolean;
  actionHistory: ActionHistoryEntry[];
  onClearHistory: () => void;
}

/** Inline disclosure body: the parent Hardware summary owns expand/collapse. */
export const HardwareDiagnosticsPanel: React.FC<HardwareDiagnosticsPanelProps> = ({
  isExpanded,
  actionHistory,
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'health' | 'nativelog'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'key' | 'dial' | 'audio' | 'safety'>('all');
  const [selfTestResult, setSelfTestResult] = useState<DiagnosticSelfTestResult | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [nativeLogs, setNativeLogs] = useState<DiagnosticLogEntry[]>([]);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Poll native log entries only while the inline section is expanded.
  useEffect(() => {
    if (!isExpanded) return;

    const fetchNativeLog = async () => {
      try {
        const res = await window.electronAPI?.getDiagnosticLog?.();
        if (res?.ok && Array.isArray(res.value)) {
          setNativeLogs(res.value.slice().reverse());
        }
      } catch {
        setNativeLogs([]);
      }
    };

    fetchNativeLog();
    const interval = setInterval(fetchNativeLog, 2000);
    return () => clearInterval(interval);
  }, [isExpanded]);

  const runDiagnostics = async () => {
    setIsRunningTest(true);
    try {
      const res = await window.electronAPI?.runDiagnosticSelfTest?.();
      if (res?.ok) {
        setSelfTestResult(res.value);
      } else {
        // Browser previews cannot test Windows modules; do not report mock passes.
        const detail = window.electronAPI?.runDiagnosticSelfTest
          ? 'Native self-test returned no result. Open the Windows app and retry.'
          : 'Unavailable in browser preview. Run inside the Windows app for native checks.';
        setSelfTestResult({
          system: { ok: false, detail },
          audio: { ok: false, detail },
          webhook: { ok: false, detail },
          time: new Date().toISOString(),
        });
      }
    } catch {
      const detail = 'Native self-test failed to respond. Retry in the Windows app.';
      setSelfTestResult({
        system: { ok: false, detail },
        audio: { ok: false, detail },
        webhook: { ok: false, detail },
        time: new Date().toISOString(),
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return actionHistory.filter((item) => {
      if (selectedFilter === 'key' && item.category !== 'hotkey' && !item.name.toLowerCase().includes('key')) return false;
      if (selectedFilter === 'dial' && !item.name.toLowerCase().includes('dial') && !item.name.toLowerCase().includes('knob')) return false;
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

  if (!isExpanded) return null;

  const nativeChecksAvailable = Boolean(window.electronAPI?.runDiagnosticSelfTest);

  return (
    <div className="min-w-0 h-[min(55vh,500px)] min-h-[280px] flex flex-col overflow-hidden border-t border-[#E3E2DE] bg-[#FFFFFF]">
        {/* Inline header: no overlay, modal backdrop or separate close button. */}
        <div className="px-3 py-2 border-b border-[#E3E2DE] flex flex-wrap items-center justify-between gap-2 bg-[#EDECE8]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 shrink-0 bg-[#EDECE8] border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-[#141414] flex flex-wrap items-center gap-1">
                Action History & Diagnostics
                {copiedNotice && (
                  <span className="text-[11px] font-mono text-[#1351AA] bg-[#EDECE8] px-2 py-0.5 border border-[#C7C7C7] animate-pulse">
                    {copiedNotice}
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-[#646464]">Action stream, self-tests and native wire log</p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={exportFullDiagnosticReport}
              className="px-3 py-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#141414] text-xs font-mono border border-[#E3E2DE] flex items-center gap-1.5 transition-colors"
              title="Copy Full Diagnostic Markdown Report"
            >
              <Download className="w-3.5 h-3.5 text-[#1351AA]" />
              Export Report
            </button>

          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-3 pt-2 border-b border-[#E3E2DE] flex items-center gap-3 overflow-x-auto shrink-0 bg-[#E3E2DE] [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <button
            onClick={() => setActiveTab('timeline')}
            aria-label={`Action History Stream (${actionHistory.length})`}
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
 activeTab === 'timeline' ? 'text-[#1351AA]' : 'text-[#646464] hover:text-[#444343]'
 }`}
          >
            History ({actionHistory.length})
            {activeTab === 'timeline' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1351AA] " />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('health');
              if (!selfTestResult) runDiagnostics();
            }}
            aria-label="Subsystem Self-Tests"
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
 activeTab === 'health' ? 'text-[#1351AA]' : 'text-[#646464] hover:text-[#444343]'
 }`}
          >
            Self-Tests
            {activeTab === 'health' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1351AA] " />
            )}
          </button>
          <button
            onClick={() => setActiveTab('nativelog')}
            aria-label={`Native Engine Wire Log (${nativeLogs.length})`}
            className={`pb-2.5 text-xs font-mono font-bold transition-all relative ${
 activeTab === 'nativelog' ? 'text-[#1351AA]' : 'text-[#646464] hover:text-[#444343]'
 }`}
          >
            Wire Log ({nativeLogs.length})
            {activeTab === 'nativelog' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1351AA] " />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {activeTab === 'timeline' && (
            <div className="min-h-full flex flex-col space-y-3">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <div className="relative w-full">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#646464]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search events, keys, actions..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#EDECE8] border border-[#E3E2DE] text-xs text-[#141414] placeholder-[#7A7A7A] focus:outline-hidden focus:border-[#1351AA]"
                    />
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  {(['all', 'key', 'dial', 'audio', 'safety'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSelectedFilter(filter)}
                      className={`px-2.5 py-1 uppercase transition-all ${
 selectedFilter === filter
 ? 'bg-[#EDECE8] border border-[#1351AA] text-[#1351AA] font-bold'
 : 'bg-[#F4F3F0] border border-[#E3E2DE] text-[#646464] hover:text-[#141414]'
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
                    className="p-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#444343] hover:text-[#141414] transition-colors"
                    title="Copy Timeline to Clipboard"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClearHistory}
                    className="p-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#141414] hover:text-[#141414] transition-colors"
                    title="Clear Action History"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Log Entries List */}
              <div className="flex-1 space-y-1.5 pr-1 font-mono text-xs">
                {filteredHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#646464] text-xs italic">
                    <Terminal className="w-8 h-8 mb-2 opacity-40" />
                    <span>No matching events found. Press a switch or turn a knob to test.</span>
                  </div>
                ) : (
                  filteredHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-2.5 border flex items-center justify-between transition-colors ${
 entry.type === 'safety'
 ? 'bg-[#EDECE8]/20 border-[#C7C7C7]/30 text-[#1351AA]'
 : entry.type === 'error'
 ? 'bg-[#141414]/30 border-[#C7C7C7]/40 text-[#141414]'
 : 'bg-[#FFFFFF] border-[#E3E2DE] text-[#141414] hover:border-[#E3E2DE]'
 }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <span className="text-[10px] text-[#646464]">{entry.timestamp}</span>
                        <span
                          className={`w-2 h-2 shrink-0 ${
 entry.type === 'safety'
 ? 'bg-[#EDECE8]'
 : entry.type === 'error'
 ? 'bg-[#EDECE8]'
 : 'bg-[#1351AA]'
 }`}
                        />
                        <span className="font-semibold text-xs truncate">{entry.name}</span>
                        {entry.detail && (
                          <span className="text-[11px] text-[#646464] truncate">— {entry.detail}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {entry.source && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 bg-[#F4F3F0] text-[#646464] border border-[#E3E2DE]">
                            {entry.source}
                          </span>
                        )}
                        <span className="text-[9px] uppercase px-2 py-0.5 bg-[#EDECE8] text-[#444343] font-bold">
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
            <div className="flex flex-col space-y-4 pr-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#141414]">Subsystem Health & Self-Tests</h3>
                  <p className="text-xs text-[#646464]">Query hardware interop, drivers, audio and streaming sockets</p>
                </div>
                <button
                  onClick={runDiagnostics}
                  disabled={isRunningTest}
                  className="px-3 py-1.5 bg-[#EDECE8] hover:bg-[#EDECE8] border border-[#C7C7C7] text-[#1351AA] text-xs font-mono font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : ''}`} />
                  {isRunningTest ? 'Running Checks...' : 'Run Diagnostics'}
                </button>
              </div>

              {selfTestResult ? (
                <div className="space-y-3">
                  {/* System Telemetry */}
                  <div className="p-4 bg-[#EDECE8] border border-[#E3E2DE] flex items-start gap-4">
                    <div className="p-2.5 bg-[#EDECE8]/10 text-[#1351AA] border border-[#C7C7C7]/20">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#141414] font-mono">SYSTEM TELEMETRY ENGINE</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 border ${selfTestResult.system.ok ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]' : 'text-[#141414] bg-[#EDECE8]/10 border-[#C7C7C7]/20'}`}>
                          {selfTestResult.system.ok ? 'OPERATIONAL' : nativeChecksAvailable ? 'DEGRADED' : 'UNAVAILABLE'}
                        </span>
                      </div>
                      <p className="text-xs text-[#444343] font-mono mt-1">{selfTestResult.system.detail}</p>
                    </div>
                  </div>

                  {/* Windows Audio */}
                  <div className="p-4 bg-[#EDECE8] border border-[#E3E2DE] flex items-start gap-4">
                    <div className="p-2.5 bg-[#EDECE8]/10 text-[#1351AA] border border-[#C7C7C7]/20">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#141414] font-mono">WINDOWS COREAUDIO INTEROP</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 border ${selfTestResult.audio.ok ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]' : 'text-[#141414] bg-[#EDECE8]/10 border-[#C7C7C7]/20'}`}>
                          {selfTestResult.audio.ok ? 'OPERATIONAL' : nativeChecksAvailable ? 'DEGRADED' : 'UNAVAILABLE'}
                        </span>
                      </div>
                      <p className="text-xs text-[#444343] font-mono mt-1">{selfTestResult.audio.detail}</p>
                    </div>
                  </div>

                  {/* Local Webhook API */}
                  <div className="p-4 bg-[#EDECE8] border border-[#E3E2DE] flex items-start gap-4">
                    <div className="p-2.5 bg-[#EDECE8]/10 text-[#1351AA] border border-[#C7C7C7]/20">
                      <Network className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#141414] font-mono">REST & WEBHOOK API SERVER</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 border ${selfTestResult.webhook.ok ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]' : 'text-[#141414] bg-[#EDECE8]/10 border-[#C7C7C7]/20'}`}>
                          {selfTestResult.webhook.ok ? 'LISTENING :38491' : nativeChecksAvailable ? 'INACTIVE' : 'UNAVAILABLE'}
                        </span>
                      </div>
                      <p className="text-xs text-[#444343] font-mono mt-1">{selfTestResult.webhook.detail}</p>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-[#646464] text-xs italic">
                  <span>Click "Run Diagnostics" to inspect all native modules.</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'nativelog' && (
            <div className="flex flex-col space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E3E2DE]">
                <span className="text-xs text-[#444343]">Chronological Native Ring Buffer (Last 400 lines)</span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      nativeLogs.map((l) => `[${new Date(l.at).toLocaleTimeString()}] [${l.where}] ${l.message}${l.extra ? ` | ${l.extra}` : ''}`).join('\n'),
                      'Native Wire Log Copied!'
                    )
                  }
                  className="px-2.5 py-1 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#444343] text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Log
                </button>
              </div>

              <div className="space-y-1 pr-1 bg-[#EDECE8] p-3 border border-[#E3E2DE] text-[11px]">
                {nativeLogs.length === 0 ? (
                  <div className="text-[#646464] italic">{window.electronAPI?.getDiagnosticLog
                    ? 'No native log events emitted yet.'
                    : 'Native log unavailable in browser preview; open the Windows app to view native events.'}</div>
                ) : (
                  nativeLogs.map((log, index) => (
                    <div key={index} className="flex flex-wrap items-start gap-2 text-[#444343] leading-relaxed break-words">
                      <span className="text-[#646464] select-none">{new Date(log.at).toLocaleTimeString()}</span>
                      <span className="text-[#1351AA] font-bold">[{log.where}]</span>
                      <span className="flex-1 min-w-0 text-[#444343]">{log.message}</span>
                      {log.extra && <span className="text-[#646464] italic">{log.extra}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

