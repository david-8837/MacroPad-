import type { PCShortcut } from '../data/pcShortcuts';
import type { KeyBinding } from '../types';

const emptyCaption = (value?: string) => !value?.trim() || /^(empty slot|empty|unassigned|no action)$/i.test(value.trim());
const defaultLabel = (binding: KeyBinding) =>
  !binding.label?.trim() || /^(empty|unassigned)$/i.test(binding.label.trim()) ||
  binding.label.trim() === `Switch #${binding.keyIndex + 1}`;

/** Assign a shortcut without disturbing other gestures, the icon, or custom key names. */
export function assignShortcutToBinding(binding: KeyBinding, shortcut: PCShortcut): KeyBinding {
  const previousShortcutName = binding.tapAction?.id.startsWith('shortcut-') && binding.label === binding.tapAction.name;
  const autoLabel = defaultLabel(binding) || previousShortcutName;
  return {
    ...binding,
    label: autoLabel ? shortcut.name : binding.label,
    sublabel: autoLabel ? shortcut.keys.join(' + ') : shortcut.name,
    tapAction: {
      id: `shortcut-${shortcut.id}`,
      name: shortcut.name,
      category: 'hotkey',
      payload: { keys: [...shortcut.keys] },
    },
  };
}

/** Repair stale placeholder captions visually, including assignments saved by older releases. */
export function keyDisplayText(binding: KeyBinding): { label: string; sublabel?: string } {
  const action = binding.tapAction;
  if (!action || !emptyCaption(binding.sublabel)) {
    return { label: binding.label, sublabel: binding.sublabel };
  }
  if (defaultLabel(binding)) {
    return { label: action.name, sublabel: action.payload.keys?.join(' + ') || undefined };
  }
  return { label: binding.label, sublabel: action.name };
}
