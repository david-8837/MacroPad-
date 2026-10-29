import { ActionDefinition } from '../types';
import { MACRO_STORAGE_KEY, isPcMacroBinding, isMacroReady, pcMacroId } from './macroStorage';

export interface MacroActionStep {
  type: 'down' | 'up' | 'combo' | 'text' | 'delay';
  value: string;
  keys?: string[];
  delayMs?: number;
}

export function loadStoredMacros(): { id: number; name: string; actions: MacroActionStep[] }[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MACRO_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    return parsed.filter(m => {
      if (!m || typeof m !== 'object' || !Number.isInteger(m.id) ||
          m.id < 0 || m.id > 15 || seen.has(m.id)) return false;
      seen.add(m.id); // first slot wins, as the executor's find() would
      return true;
    });
  } catch {
    return [];
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendNativeAction(action: ActionDefinition): Promise<{ success: boolean; error?: string }> {
  const api = window.electronAPI;
  if (!api?.execAction) {
    return { success: false, error: 'Native desktop shell is not available (browser preview)' };
  }
  try {
    const res = await api.execAction({
      actionId: action.id,
      actionName: action.name,
      category: action.category,
      payload: action.payload || {},
    });
    if (!res || typeof res.success !== 'boolean') {
      return { success: false, error: 'Native action returned no valid result' };
    }
    return res;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function executeMacroSlot(macroId: number, onStep?: (index: number) => void): Promise<{ success: boolean; error?: string; name?: string }> {
  const macros = loadStoredMacros();
  const macro = macros.find((m) => m.id === macroId);
  if (!macro) return { success: false, error: `Macro M${macroId} is not defined` };
  if (!Array.isArray(macro.actions) || macro.actions.length === 0) {
    return { success: false, error: `Macro M${macroId} is empty; add steps in Macro Studio` };
  }
  if (!isMacroReady(macro)) {
    return { success: false, error: `Macro M${macroId} has unsupported steps; use a combo, text or delay step` };
  }

  for (const [index, step] of macro.actions.entries()) {
    onStep?.(index);
    if (step.type === 'delay') {
      await delay(Math.min(Math.max(step.delayMs || 100, 0), 5000));
      continue;
    }
    /* Macro Studio creates combo/text/delay steps. Old JSON may contain
     * down/up steps, but the native chord API immediately releases each key;
     * calling that a held key would be a dangerous false success. */
    if (step.type !== 'combo' && step.type !== 'text') {
      return { success: false, name: macro.name,
        error: `Step ${index + 1}: ${step.type} is not executable; use a combo, text or delay step` };
    }
    const keys = step.keys && step.keys.length > 0 ? step.keys : [step.value];
    const result = step.type === 'text'
      ? await sendNativeAction({
        id: `macro-${macroId}-text`, category: 'text', name: macro.name,
        payload: { text: step.value },
      })
      : await sendNativeAction({
        id: `macro-${macroId}-combo`, category: 'hotkey', name: macro.name,
        payload: { keys },
      });
    if (!result.success) {
      return { success: false, name: macro.name,
        error: `Step ${index + 1} failed: ${result.error || 'native action was rejected'}` };
    }
    await delay(30);
  }
  return { success: true, name: macro.name };
}

export async function executeDeckAction(action: ActionDefinition | null | undefined): Promise<{ success: boolean; error?: string }> {
  if (!action) return { success: false, error: 'No action assigned' };

  /* Old decks stored M0 as `script / macro:0`; new tray bindings use
   * `macro / macroId:0`. Both are reserved for the same PC-owned slot. An
   * invalid reserved prefix is never forwarded to a native shell or typed. */
  if (isPcMacroBinding(action)) {
    const id = pcMacroId(action);
    if (id === null) return { success: false, error: 'Invalid legacy or desktop macro ID (expected M0–M15)' };
    return executeMacroSlot(id);
  }

  /* A legacy raw keycode (MO(1), etc.) works on neither this pad nor the PC.
   * Fail instead of sending an empty chord and reporting success. */
  if (action.payload?.keycode) {
    return {
      success: false,
      error: `${action.payload.keycode} is a keycode the macropad sends itself — the PC cannot type it.`,
    };
  }

  // Firmware owns OLED_NEXT. The desktop native key injector cannot send an
  // OLED gesture; an editor preview must not claim a second execution.
  if (action.category === 'oled') {
    return { success: false, error: 'OLED NEXT runs on the pad after upload; no desktop key was sent' };
  }

  if (action.category === 'app_launch') {
    const api = window.electronAPI;
    if (api?.launchApp) {
      try {
        return await api.launchApp(action.payload);
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  return sendNativeAction(action);
}
