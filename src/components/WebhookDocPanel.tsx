import React, { useEffect, useState } from 'react';
import { Copy, Check, Globe, Zap, KeyRound } from 'lucide-react';

interface WebhookDocPanelProps {
  /**
   * Runs the same renderer-side handler the HTTP server feeds, so the user can check
   * what an endpoint would do. This exercises the app logic only, not the HTTP/auth layer.
   */
  onRunLocally: (endpoint: string, body: Record<string, unknown>) => void;
}

interface WebhookInfo {
  port: number;
  token: string;
  listening: boolean;
}

const SNIPPETS: { title: string; endpoint: string; body: Record<string, unknown> }[] = [
  { title: 'Trigger Key Switch #1 (Tap)', endpoint: '/api/v1/trigger', body: { target: 'key', index: 0, action: 'tap' } },
  { title: 'Rotate Knob Clockwise (1 Detent)', endpoint: '/api/v1/dial', body: { direction: 'cw', step: 1 } },
  { title: 'Push Text to the OLED Display', endpoint: '/api/v1/oled', body: { line1: 'STREAM STARTING', line2: 'COUNTDOWN 05:00' } },
  { title: 'Switch Profile to DaVinci Resolve', endpoint: '/api/v1/profile', body: { profileId: 'profile-davinci', layerId: 'layer-edit' } },
  { title: 'Switch to Channel 2', endpoint: '/api/v1/action', body: { channel: 2 } },
];

export const WebhookDocPanel: React.FC<WebhookDocPanelProps> = ({ onRunLocally }) => {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getWebhookInfo?.()
      .then((i) => { if (!cancelled) setInfo(i); })
      .catch(() => { /* leave info null: shown as unavailable */ });
    return () => { cancelled = true; };
  }, []);

  const port = info?.port ?? 38491;
  const hasServer = Boolean(info?.listening);

  const buildCurl = (endpoint: string, body: Record<string, unknown>, token: string) =>
    `curl -X POST "http://127.0.0.1:${port}${endpoint}" ` +
    `-H "Authorization: Bearer ${token}" -H "Content-Type: application/json" ` +
    `-d '${JSON.stringify(body)}'`;

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1800);
    }).catch(() => { /* clipboard unavailable */ });
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#00F0FF]" />
            Localhost Webhook &amp; REST API
          </h3>
          <p className="text-[11px] text-white/40">
            Trigger the actions you configured from Home Assistant, scripts or cURL.
          </p>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 whitespace-nowrap ${
            hasServer
              ? 'text-[#00F0FF] bg-[#00F0FF]/10 border-[#00F0FF]/20'
              : 'text-white/40 bg-white/5 border-white/10'
          }`}
        >
          <Zap className="w-2.5 h-2.5" />
          {hasServer ? `LISTENING :${port}` : 'DESKTOP APP ONLY'}
        </span>
      </div>

      {hasServer && info ? (
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/40 border border-white/5">
          <span className="text-[11px] text-white/60 flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" />
            Requests need your access token
          </span>
          <button
            onClick={() => copy('token', info.token)}
            className="flex items-center gap-1 text-[10px] font-mono text-white/70 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
          >
            {copiedKey === 'token' ? <Check className="w-3 h-3 text-[#38EF7D]" /> : <Copy className="w-3 h-3" />}
            {copiedKey === 'token' ? 'Copied' : 'Copy token'}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-white/40 italic">
          The webhook server runs inside the Electron desktop app. In the browser preview you can still
          try each endpoint&apos;s behaviour with &quot;Run in app&quot;.
        </p>
      )}

      <div className="space-y-3">
        {SNIPPETS.map((item) => (
          <div key={item.endpoint + item.title} className="p-3 rounded-xl bg-[#0F1218] border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white">{item.title}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRunLocally(item.endpoint, item.body)}
                  title="Runs the same in-app handler the server uses (does not go through HTTP)"
                  className="text-[10px] font-mono text-[#FF5E00] hover:underline"
                >
                  [Run in app]
                </button>
                {hasServer && info && (
                  <button
                    onClick={() => copy(item.title, buildCurl(item.endpoint, item.body, info.token))}
                    className="flex items-center gap-1 text-[10px] font-mono text-white/60 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {copiedKey === item.title ? <Check className="w-3 h-3 text-[#38EF7D]" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === item.title ? 'Copied' : 'Copy cURL'}
                  </button>
                )}
              </div>
            </div>
            <div className="p-2 rounded bg-black/60 border border-white/5 font-mono text-[10px] text-[#00F0FF] overflow-x-auto">
              <code>{buildCurl(item.endpoint, item.body, '<YOUR_TOKEN>')}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
