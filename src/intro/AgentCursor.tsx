import type { RegionScript } from './config';

export function AgentCursor({ script }: { script: RegionScript }) {
  return <div className="intro-cursor" data-cursor={script.id} style={{ color: script.tint }} aria-hidden="true">
    <svg width="22" height="28" viewBox="0 0 22 28" fill="none"><path d="M2 1.5V22L7.7 16.8L11.7 25.7L15 24.2L11.1 15.6L19 15.3L2 1.5Z" fill="currentColor" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    <span className="intro-cursor-tag">{script.role}</span><span className="intro-click-ring" />
  </div>;
}
