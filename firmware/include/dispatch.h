/*
 * dispatch.h — gesture queue -> actions -> side effects.
 *
 * This is the layer that knows about everything: channels, storage, LEDs, USB.
 * The gesture engine does not, which is why it can be unit tested alone.
 */
#ifndef DISPATCH_H
#define DISPATCH_H

#include <stdbool.h>
#include <stdint.h>

#include "gesture.h"

void dispatch_init(void);

/* Drain the gesture queue and execute what it implies. Call once per scan tick.
 * Returns the number of gestures handled. */
int dispatch_run(gesture_queue_t *q, uint32_t now_ms);

/* Keys that produced a gesture on the most recent dispatch_run. Consumed by the
 * LED engine for REACTIVE mode and cleared at the start of each frame. */
uint16_t dispatch_hit_mask(void);
void dispatch_clear_hit_mask(void);

/* Re-read timing thresholds and boot channel from the live config. Call after
 * any storage_stage / storage_reset. */
void gesture_apply_config_from_live(void);

/* Idle tracking, used by the LED dimmer. */
uint32_t dispatch_last_input_ms(void);

#endif /* DISPATCH_H */
