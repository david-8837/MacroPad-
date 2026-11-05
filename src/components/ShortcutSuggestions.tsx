import { Sparkles } from 'lucide-react';

type Shortcut = { name: string; keys: string[]; label: string };
export function ShortcutSuggestions({ title = 'Popular shortcuts', shortcuts, onSelect }: {
  title?: string; shortcuts: Shortcut[]; onSelect: (keys: string[], label: string, name: string) => void;
}) {
  return <section className="drawer-shortcuts" aria-label={title}>
    <div className="drawer-shortcuts-header"><div><h3><Sparkles size={13} aria-hidden="true" />{title}</h3>
      <p>Choose a shortcut to fill the current assignment.</p></div><span>ONE CLICK</span></div>
    <div className="drawer-shortcuts-grid">
      {shortcuts.map(item => <button key={item.name} type="button" className="drawer-shortcut-card" onClick={() => onSelect(item.keys, item.label, item.name)}>
        <span>{item.name}</span><small>({item.label})</small>
      </button>)}
    </div>
  </section>;
}
