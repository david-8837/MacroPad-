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
  { title: 'Update PC OLED labels (live stream only on a verified pad)', endpoint: '/api/v1/oled', body: { line1: 'STREAM STARTING', line2: 'COUNTDOWN 05:00' } },
  { title: 'Edit / preview Layer 2 (pad unchanged)', endpoint: '/api/v1/action', body: { layer: 2 } },
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
    <div className="panel p-4 border border-[#E3E2DE] space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[#141414] text-sm flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#1351AA]" />
            Localhost Webhook &amp; REST API
          </h3>
          <p className="text-[11px] text-[#646464]">
            Trigger the actions you configured from Home Assistant, scripts or cURL.
          </p>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 border flex items-center gap-1 whitespace-nowrap ${
 hasServer
 ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]'
 : 'text-[#646464] bg-[#F4F3F0] border-[#E3E2DE]'
 }`}
        >
          <Zap className="w-2.5 h-2.5" />
          {hasServer ? `LISTENING :${port}` : 'DESKTOP APP ONLY'}
        </span>
      </div>

      {hasServer && info ? (
        <div className="flex items-center justify-between gap-2 p-2 bg-[#EDECE8] border border-[#E3E2DE]">
          <span className="text-[11px] text-[#444343] flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" />
            Requests need your access token
          </span>
          <button
            onClick={() => copy('token', info.token)}
            className="flex items-center gap-1 text-[10px] font-mono text-[#444343] hover:text-[#141414] px-2 py-0.5 bg-[#F4F3F0] hover:bg-[#EDECE8] transition-colors"
          >
            {copiedKey === 'token' ? <Check className="w-3 h-3 text-[#1351AA]" /> : <Copy className="w-3 h-3" />}
            {copiedKey === 'token' ? 'Copied' : 'Copy token'}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-[#646464] italic">
          The webhook server runs inside the Electron desktop app. In the browser preview you can still
          try each endpoint&apos;s behaviour with &quot;Run in app&quot;.
        </p>
      )}

      <div className="space-y-3">
        {SNIPPETS.map((item) => (
          <div key={item.endpoint + item.title} className="p-3 bg-[#FFFFFF] border border-[#E3E2DE] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#141414]">{item.title}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRunLocally(item.endpoint, item.body)}
                  title="Runs the same in-app handler the server uses (does not go through HTTP)"
                  className="text-[10px] font-mono text-[#1351AA] hover:underline"
                >
                  [Run in app]
                </button>
                {hasServer && info && (
                  <button
                    onClick={() => copy(item.title, buildCurl(item.endpoint, item.body, info.token))}
                    className="flex items-center gap-1 text-[10px] font-mono text-[#444343] hover:text-[#141414] px-2 py-0.5 bg-[#F4F3F0] hover:bg-[#EDECE8] transition-colors"
                  >
                    {copiedKey === item.title ? <Check className="w-3 h-3 text-[#1351AA]" /> : <Copy className="w-3 h-3" />}
                    {copiedKey === item.title ? 'Copied' : 'Copy cURL'}
                  </button>
                )}
              </div>
            </div>
            <div className="p-2 bg-[#EDECE8] border border-[#E3E2DE] font-mono text-[10px] text-[#1351AA] overflow-x-auto">
              <code>{buildCurl(item.endpoint, item.body, '<YOUR_TOKEN>')}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
