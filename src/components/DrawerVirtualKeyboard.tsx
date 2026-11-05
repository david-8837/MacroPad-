import { useState, type CSSProperties } from 'react';
import {
  type KeyboardKeyDef, drawerKeyName,
  DRAWER_MAIN_ROW_0, DRAWER_MAIN_ROW_1, DRAWER_MAIN_ROW_2, DRAWER_MAIN_ROW_3, DRAWER_MAIN_ROW_4, DRAWER_MAIN_ROW_5,
  DRAWER_NAV_ROW_0, DRAWER_NAV_ROW_1, DRAWER_NAV_ROW_2, DRAWER_ARROW_ROW_4, DRAWER_ARROW_ROW_5,
  DRAWER_NUMPAD_ROW_0, DRAWER_NUMPAD_GRID,
} from '../data/keyboardLayouts';

/** Keep aliases for previously saved shortcuts while giving each key its real name. */
function isKeyActive(key: KeyboardKeyDef, keys: string[]) {
  return keys.some(recorded => {
    if (!recorded) return false;
    if (recorded === key.code || (!key.code.startsWith('Numpad') && recorded === key.label)) return true;
    if (key.code.startsWith('Key') && recorded.toUpperCase() === key.code.slice(3).toUpperCase()) return true;
    if (key.code.startsWith('Digit') && recorded === key.code.slice(5)) return true;
    if (key.code.startsWith('Control') && ['Ctrl', 'Control'].includes(recorded)) return true;
    if (key.code.startsWith('Shift') && recorded === 'Shift') return true;
    if (key.code.startsWith('Alt') && recorded === 'Alt') return true;
    if (key.code.startsWith('Meta') && ['Win', 'Meta'].includes(recorded)) return true;
    if (key.code === 'Escape' && ['Esc', 'Escape'].includes(recorded)) return true;
    if (key.code === 'Backspace' && ['⌫', 'Backspace'].includes(recorded)) return true;
    const arrows: Record<string, string[]> = { ArrowUp: ['▲', 'ArrowUp', 'Up'], ArrowDown: ['▼', 'ArrowDown', 'Down'], ArrowLeft: ['◀', 'ArrowLeft', 'Left'], ArrowRight: ['▶', 'ArrowRight', 'Right'] };
    if (arrows[key.code]?.includes(recorded)) return true;
    if (key.code.startsWith('Numpad')) {
      const sub = key.code.slice(6);
      return [key.code, `Num ${sub}`, `NumPad${sub}`].includes(recorded);
    }
    return false;
  });
}

type Props = { recordedKeys: string[]; onKey: (key: string) => void };
export function DrawerVirtualKeyboard({ recordedKeys, onKey }: Props) {
  const [layout, setLayout] = useState<'full' | 'tkl' | '60'>('full');
  const renderKey = (key: KeyboardKeyDef, gridArea?: string) => {
    const style: CSSProperties = gridArea ? { gridArea } : { flex: `${key.width || 1} 1 0%` };
    if (key.code.startsWith('spacer-')) return <span key={key.code} className="drawer-keyboard-spacer" style={style} aria-hidden="true" />;
    const selected = isKeyActive(key, recordedKeys);
    const name = drawerKeyName(key);
    return <button key={key.code} type="button" data-key-code={key.code} aria-label={`${key.label}${name !== key.label ? ` (${name})` : ''}`}
      aria-pressed={selected} disabled={key.code === 'Calc'}
      title={key.code === 'Calc' ? 'Calculator key is not supported; use Open App instead' : name}
      onClick={() => onKey(name)} style={style}
      className={`drawer-keyboard-key ${selected ? 'drawer-keyboard-key--selected' : ''}`}>
      <span>{key.label}</span>{key.subLabel && <span className="drawer-keyboard-sub">{key.subLabel}</span>}
    </button>;
  };
  const row = (keys: KeyboardKeyDef[], className = '') => <div className={`drawer-keyboard-row ${className}`}>{keys.map(k => renderKey(k))}</div>;
  return <section className="drawer-keyboard-section" aria-label="Virtual Keyboard">
    <div className="drawer-keyboard-header">
      <div><h3>Virtual Keyboard</h3><p>Choose keys to build a shortcut</p></div>
      <div className="drawer-keyboard-layout" role="group" aria-label="Keyboard layout">
        {([['full', 'Full 104'], ['tkl', 'TKL'], ['60', '60%']] as const).map(([mode, label]) =>
          <button type="button" key={mode} aria-pressed={layout === mode} onClick={() => setLayout(mode)}>{label}</button>)}
      </div>
    </div>
    <div className="drawer-keyboard-container">
      <div className="drawer-keyboard-surface">
        <div className="drawer-keyboard-main-scroll"><div className="drawer-keyboard-main">
          {row(DRAWER_MAIN_ROW_0, 'drawer-keyboard-function-row')}
          {row(DRAWER_MAIN_ROW_1)}{row(DRAWER_MAIN_ROW_2)}{row(DRAWER_MAIN_ROW_3)}{row(DRAWER_MAIN_ROW_4)}{row(DRAWER_MAIN_ROW_5)}
        </div></div>
        {layout !== '60' && <div className="drawer-keyboard-extras">
          <div className="drawer-keyboard-cluster" aria-label="Navigation and arrow keys">
            <span className="drawer-keyboard-cluster-title">Navigation</span>
            {row(DRAWER_NAV_ROW_0)}{row(DRAWER_NAV_ROW_1)}{row(DRAWER_NAV_ROW_2)}
            {row(DRAWER_ARROW_ROW_4, 'drawer-keyboard-arrows')}{row(DRAWER_ARROW_ROW_5)}
          </div>
          {layout === 'full' && <div className="drawer-keyboard-cluster" aria-label="Number pad">
            <span className="drawer-keyboard-cluster-title">Number pad</span>
            {row(DRAWER_NUMPAD_ROW_0)}
            <div className="drawer-keyboard-numpad">{DRAWER_NUMPAD_GRID.map(k => renderKey(k, k.gridArea))}</div>
          </div>}
        </div>}
      </div>
    </div>
  </section>;
}
