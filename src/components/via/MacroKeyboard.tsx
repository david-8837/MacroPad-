
export type MacroModifier = 'Ctrl' | 'Shift' | 'Alt' | 'Win';
type Key = { label: string; value: string; width?: number; modifier?: MacroModifier };
const key = (value: string, label = value, width = 1): Key => ({ value, label, width });
const mod = (value: MacroModifier, width = 1.35): Key => ({ value, label: value, modifier: value, width });
const rows: Key[][] = [
  [key('Esc'), ...Array.from({ length: 12 }, (_, i) => key(`F${i + 1}`)), key('Delete', 'Del', 1.35)],
  [key('`'), ...'1234567890'.split('').map(k => key(k)), key('-'), key('='), key('Backspace', 'Backspace', 1.8)],
  [key('Tab', 'Tab', 1.5), ...'QWERTYUIOP'.split('').map(k => key(k)), key('['), key(']'), key('\\', '\\', 1.3)],
  [key('CapsLock', 'Caps', 1.7), ...'ASDFGHJKL'.split('').map(k => key(k)), key(';'), key("'"), key('Enter', 'Enter', 2)],
  [mod('Shift', 2.15), ...'ZXCVBNM'.split('').map(k => key(k)), key(','), key('.'), key('/'), mod('Shift', 2.15)],
  [mod('Ctrl'), mod('Win'), mod('Alt'), key('Space', 'Space', 5.3), mod('Alt'), mod('Ctrl'), key('Left', '←'), key('Up', '↑'), key('Down', '↓'), key('Right', '→')],
];

/** Buttons compose macro steps only; they never send a key to the computer. */
export function MacroKeyboard({ modifiers, onModifier, onKey }: {
  modifiers: MacroModifier[];
  onModifier: (modifier: MacroModifier) => void;
  onKey: (key: string) => void;
}) {
  return <div className="macro-keyboard-scroll" role="region" aria-label="On-screen macro keyboard" tabIndex={0}>
    <div className="macro-keyboard">
      {rows.map((row, rowIndex) => <div className="macro-keyboard-row" key={rowIndex}>
        {row.map((item, index) => <button key={`${item.value}-${index}`} type="button"
          aria-label={`Key ${item.label}${item.label !== item.value ? ` (${item.value})` : ''}`} data-macro-key={item.value} aria-pressed={item.modifier ? modifiers.includes(item.modifier) : undefined}
          className={`macro-keyboard-key ${item.modifier && modifiers.includes(item.modifier) ? 'macro-keyboard-key--active' : ''}`}
          style={{ flex: `${item.width || 1} 1 0%` }}
          onClick={() => item.modifier ? onModifier(item.modifier) : onKey(item.value)}>{item.label}</button>)}
      </div>)}
    </div>
  </div>;
}
