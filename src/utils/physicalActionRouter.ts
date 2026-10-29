/*
 * The firmware executes uploaded key/knob actions BEFORE it reports a
 * KEY_EVENT. Replaying an action with nonzero `action` on the PC would send
 * every shortcut twice. Route only empty firmware slots to their PC-only
 * bindings, preserving the originating channel and the actual gesture.
 */
import { ACTION_TYPE } from '../../host/protocol/mpad3-protocol.mjs';
import type { ActionDefinition, Layer } from '../types';

export type PhysicalGesture =
  | 'down' | 'up' | 'tap' | 'hold' | 'hold_release' | 'double_tap'
  | 'dial_cw' | 'dial_ccw' | 'dial_tap' | 'dial_hold' | 'dial_hold_release';

export interface PhysicalEventMeta {
  channel: number;
  /** cfg_action_t.type reported by the device AFTER dispatching the action. */
  firmwareAction: number;
  /** Rotation detents, or key HOLD_RELEASE duration in milliseconds. */
  value: number;
}

export interface PhysicalAction {
  action: ActionDefinition | null;
  count: number;
  /** Nonempty only when a hold-to-confirm key was released too early. */
  reason?: string;
  /** The host caps a malformed/high-volume batch to avoid a launch storm. */
  truncated?: boolean;
}

const none = (): PhysicalAction => ({ action: null, count: 0 });

export function routePhysicalAction(
  layers: readonly Layer[], index: number, gesture: PhysicalGesture, meta: PhysicalEventMeta,
): PhysicalAction {
  if (!Number.isInteger(meta.channel) || meta.channel < 0 || meta.channel >= layers.length) return none();
  if (meta.firmwareAction !== ACTION_TYPE.NONE) return none();
  const layer = layers[meta.channel];

  if (index >= 0 && index < 9) {
    const key = layer.keys.find((binding) => binding.keyIndex === index);
    if (!key) return none();
    if (key.isDestructiveSafety) {
      if (gesture !== 'hold_release') return none();
      // Old firmware reports zero, not a verified hold duration. Fail closed.
      const configured = key.longPressThresholdMs;
      const threshold = typeof configured === 'number' && Number.isFinite(configured) && configured >= 300
        ? configured : 1500;
      if (!Number.isInteger(meta.value) || meta.value < threshold) {
        return { action: null, count: 0, reason: 'Hold cancelled (threshold not met or duration unavailable)' };
      }
      return { action: key.safetyConfirmAction ?? null, count: key.safetyConfirmAction ? 1 : 0 };
    }
    const action = gesture === 'tap' ? key.tapAction
      : gesture === 'hold' ? key.holdAction
      : gesture === 'double_tap' ? key.doubleTapAction
      : null;
    return { action: action ?? null, count: action ? 1 : 0 };
  }

  if (index !== 9) return none();
  const dial = layer.dial;
  const action = gesture === 'dial_cw' ? dial.cwAction
    : gesture === 'dial_ccw' ? dial.ccwAction
    : gesture === 'dial_tap' ? dial.pressAction
    : gesture === 'dial_hold' ? dial.holdAction
    : null;
  if (!action) return none();
  const detents = gesture === 'dial_cw' || gesture === 'dial_ccw'
    ? (Number.isFinite(meta.value) ? Math.max(1, Math.floor(meta.value)) : 1) : 1;
  const count = Math.min(detents, 20);
  return { action, count, truncated: detents > count };
}
