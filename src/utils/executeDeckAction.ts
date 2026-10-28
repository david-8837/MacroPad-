import { ActionDefinition } from '../types';
import { MACRO_STORAGE_KEY } from './macroStorage';

export interface MacroActionStep {
  type: 'down' | 'up' | 'combo' | 'text' | 'delay';
  value: string;
  keys?: string[];
  delayMs?: number;
}

export function loadStoredMacros(): { id: number; name: string; actions: MacroActionStep[] }[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(MACRO_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
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
    return res || { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function executeMacroSlot(macroId: number): Promise<{ success: boolean; error?: string; name?: string }> {
  const macros = loadStoredMacros();
  const macro = macros.find((m) => m.id === macroId);
  if (!macro) return { success: false, error: `Macro M${macroId} is not defined` };

  for (const step of macro.actions || []) {
    if (step.type === 'delay') {
      await delay(Math.min(Math.max(step.delayMs || 100, 0), 5000));
      continue;
    }
    if (step.type === 'text') {
      await sendNativeAction({
        id: `macro-${macroId}-text`,
        category: 'script',
        name: macro.name,
        payload: { command: step.value },
      });
      continue;
    }
    const keys = step.keys && step.keys.length > 0 ? step.keys : [step.value];
    await sendNativeAction({
      id: `macro-${macroId}-combo`,
      category: 'hotkey',
      name: macro.name,
      payload: { keys },
    });
    await delay(30);
  }
  return { success: true, name: macro.name };
}

export async function executeDeckAction(action: ActionDefinition | null | undefined): Promise<{ success: boolean; error?: string }> {
  if (!action) return { success: false, error: 'No action assigned' };

  if (action.category === 'script' && action.payload?.command?.startsWith('macro:')) {
    const raw = action.payload.command.replace(/^macro:/i, '').replace(/^M/i, '');
    const macroId = parseInt(raw, 10);
    if (Number.isNaN(macroId)) return { success: false, error: 'Invalid macro id' };
    return executeMacroSlot(macroId);
  }

  /* A raw keycode is something the pad itself emits; the PC cannot type MO(1).
   * Say that instead of sending an empty chord and reporting success. */
  if (action.payload?.keycode) {
    return {
      success: false,
      error: `${action.payload.keycode} is a keycode the macropad sends itself — the PC cannot type it.`,
    };
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
