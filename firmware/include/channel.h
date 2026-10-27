/*
 * channel.h — the 3-channel page system.
 *
 * A "channel" is a complete, independent personality for the pad: its own 9 key
 * bindings, its own 4 knob bindings, and its own lighting. Switching channel is
 * the only thing that is hard-wired and cannot be rebound away by accident:
 * knob long-press cycles 0 -> 1 -> 2 -> 0.
 *
 * Why a long press on the knob and not a key: all 9 keys are for you to spend
 * on macros, and the knob's tap and both rotation directions are already bound
 * per channel. The knob's long press is the one gesture that has no other use,
 * which is exactly what a mode switch should consume.
 *
 * The lighting being per channel is what makes the channels legible without
 * looking at a screen: channel 0 is one colour, channel 1 another, channel 2 a
 * third. You can see which page you are on out of the corner of your eye.
 */
#ifndef CHANNEL_H
#define CHANNEL_H

#include <stdbool.h>
#include <stdint.h>

#include "config.h"
#include "gesture.h"

/* 0-based active channel. */
uint8_t channel_active(void);

/* Switch. Wraps, releases any held keys from the old channel first, and pushes
 * an EV_CHANNEL_CHANGE event so the host UI can follow along. */
void channel_set(uint8_t index);
void channel_next(void);
void channel_prev(void);

/* Resolve a gesture to the action slot that should fire, on the ACTIVE channel.
 * Returns NULL when the gesture has no binding.
 *   GESTURE_TAP/HOLD/DOUBLE_TAP + key index -> that key's slot for that gesture
 *   GESTURE_HOLD_RELEASE                    -> the same slot as HOLD (release)
 *   GESTURE_ROTATE_CW/CCW                   -> knob_cw / knob_ccw
 *   GESTURE_KNOB_TAP                        -> knob_tap
 *   GESTURE_KNOB_HOLD                       -> knob_hold (reserved by default)
 */
const cfg_action_t *action_for_gesture(gesture_kind_t kind, uint8_t key_index);

/* Is the hold action bound to this key marked for auto-repeat? Answered here so
 * the gesture engine stays ignorant of config layout. */
bool channel_hold_is_repeatable(uint8_t key_index);

#endif /* CHANNEL_H */
