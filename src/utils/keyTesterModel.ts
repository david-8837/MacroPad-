/* The Tester observes DOM keyboard events delivered by the OS to this window.
 * It does not sample the pad scan loop, HID frame times or switch contacts. */
export interface TesterKeyInfo {
  code: string;
  name: string;
  /** Fresh keydowns observed while this app was focused (excluding repeats). */
  pressCount: number;
}

export interface TesterState {
  activeKeys: Set<string>;
  testedKeys: Record<string, TesterKeyInfo>;
  keydownEvents: number;
  pressEvents: number;
  repeatEvents: number;
  lastKey: string;
}

export interface TesterKeyEvent {
  type: 'down' | 'up';
  code: string;
  key: string;
  repeat: boolean;
}

export function createTesterState(): TesterState {
  return { activeKeys: new Set(), testedKeys: {}, keydownEvents: 0, pressEvents: 0,
    repeatEvents: 0, lastKey: 'None' };
}

export function ignoreKeyTesterTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('tagName' in target)) return false;
  const el = target as HTMLElement;
  // A tab/button remains focused after navigating here. Observe key events
  // there too without cancelling the button's normal keyboard behavior.
  return Boolean(el.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT']
    .includes(String(el.tagName).toUpperCase());
}

export function reduceTesterEvent(state: TesterState, event: TesterKeyEvent): TesterState {
  const code = event.code || (event.key === ' ' ? 'Space' : event.key);
  if (!code) return state;
  if (event.type === 'up') {
    if (!state.activeKeys.has(code)) return state;
    const activeKeys = new Set(state.activeKeys);
    activeKeys.delete(code);
    return { ...state, activeKeys };
  }
  const fresh = !event.repeat && !state.activeKeys.has(code);
  const activeKeys = new Set(state.activeKeys);
  activeKeys.add(code);
  const old = state.testedKeys[code];
  return {
    ...state,
    activeKeys,
    testedKeys: { ...state.testedKeys, [code]: {
      code, name: event.key || code, pressCount: (old?.pressCount ?? 0) + (fresh ? 1 : 0),
    } },
    keydownEvents: state.keydownEvents + 1,
    pressEvents: state.pressEvents + (fresh ? 1 : 0),
    repeatEvents: state.repeatEvents + (event.repeat ? 1 : 0),
    lastKey: code,
  };
}

/** Losing window focus can hide keyup; clear only the visual held state. */
export function clearHeldKeys(state: TesterState): TesterState {
  return state.activeKeys.size ? { ...state, activeKeys: new Set() } : state;
}
