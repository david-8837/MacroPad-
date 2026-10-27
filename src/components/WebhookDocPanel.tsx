import React, { useState } from 'react';
import { Terminal, Copy, Check, ExternalLink, Globe, Zap } from 'lucide-react';

interface WebhookDocPanelProps {
  onTriggerSimulatedWebhook: (endpoint: string) => void;
}

export const WebhookDocPanel: React.FC<WebhookDocPanelProps> = ({ onTriggerSimulatedWebhook }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const curlSnippets = [
    {
      title: 'Trigger Key Switch #1 (Tap)',
      method: 'POST',
      url: 'http://127.0.0.1:38491/api/v1/trigger',
      body: JSON.stringify({ target: 'key', index: 0, action: 'tap' }, null, 2),
    },
    {
      title: 'Rotate Knob Clockwise (1 Detent)',
      method: 'POST',
      url: 'http://127.0.0.1:38491/api/v1/dial',
      body: JSON.stringify({ direction: 'cw', step: 1, velocity: 'fast' }, null, 2),
    },
    {
      title: 'Push Live OLED Display Text',
      method: 'POST',
      url: 'http://127.0.0.1:38491/api/v1/oled',
      body: JSON.stringify({ line1: 'STREAM STARTING', line2: 'COUNTDOWN 05:00' }, null, 2),
    },
    {
      title: 'Switch Profile to DaVinci Resolve',
      method: 'POST',
      url: 'http://127.0.0.1:38491/api/v1/profile',
      body: JSON.stringify({ profileId: 'profile-davinci', layerId: 'layer-edit' }, null, 2),
    },
  ];

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#00F0FF]" />
            Localhost Webhook & REST API Server
          </h3>
          <p className="text-[11px] text-white/40">
            Control the deck remotely via Home Assistant, Python, cURL, or local automation
          </p>
        </div>
        <span className="text-[10px] font-mono text-[#00F0FF] bg-[#00F0FF]/10 px-2 py-0.5 rounded-full border border-[#00F0FF]/20 flex items-center gap-1">
          <Zap className="w-2.5 h-2.5" />
          LISTENING :38491
        </span>
      </div>

      {/* Snippets list */}
      <div className="space-y-3">
        {curlSnippets.map((item, i) => {
          const curlCmd = `curl -X ${item.method} "${item.url}" -H "Content-Type: application/json" -d '${item.body.replace(/\n\s*/g, ' ')}'`;
          return (
            <div key={i} className="p-3 rounded-xl bg-[#0F1218] border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white">{item.title}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onTriggerSimulatedWebhook(item.title)}
                    className="text-[10px] font-mono text-[#FF5E00] hover:underline"
                  >
                    [Test Trigger]
                  </button>
                  <button
                    onClick={() => handleCopy(curlCmd, i)}
                    className="flex items-center gap-1 text-[10px] font-mono text-white/60 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {copiedIndex === i ? <Check className="w-3 h-3 text-[#38EF7D]" /> : <Copy className="w-3 h-3" />}
                    {copiedIndex === i ? 'Copied' : 'Copy cURL'}
                  </button>
                </div>
              </div>

              <div className="p-2 rounded bg-black/60 border border-white/5 font-mono text-[10px] text-[#00F0FF] overflow-x-auto">
                <code>{curlCmd}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
