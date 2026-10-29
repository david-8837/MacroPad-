/*
 * events.h — device -> host notification ring.
 *
 * Everything the pad does can be mirrored to the host as an 8-byte event. This
 * is what makes the app's Key Tester honest: previously it could only listen to
 * the PC keyboard, so it showed you what your laptop did, not what the pad did.
 * With this stream it shows the pad's own resolved gestures, including the
 * channel they fired on.
 *
 * The ring is lossy on purpose. If the host is not reading (app closed, cable
 * unplugged), events are dropped and `overrun` counts them. A keypress must
 * never be delayed because nobody is listening.
 */
#ifndef EVENTS_H
#define EVENTS_H

#include <stdbool.h>
#include <stdint.h>

#include "magic.h"

#define EVENT_RING_SIZE 32

typedef struct {
    uint8_t source;  /* EV_SOURCE_KEY / EV_SOURCE_KNOB */
    uint8_t index;   /* key 0..8, 0 for the knob */
    uint8_t event;   /* EV_* */
    uint8_t channel; /* active channel when it happened */
    int16_t value;   /* rotation detents; key HOLD_RELEASE: held ms (capped at 32767) */
    uint16_t action; /* action_type_t that fired, 0 if none */
} key_event_t; /* 8 bytes, matches KEY_EVENT_SIZE */

_Static_assert(sizeof(key_event_t) == KEY_EVENT_SIZE, "key_event_t must stay 8 bytes on the wire");

typedef struct {
    key_event_t items[EVENT_RING_SIZE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
    uint32_t overrun;
} event_ring_t;

void events_init(void);
void events_enable(bool on);
bool events_enabled(void);

/* Push an event. No-op when disabled. */
void events_push(uint8_t source, uint8_t index, uint8_t event, uint8_t channel, int16_t value,
                 uint16_t action);

/* Pop for transmission. Returns false when empty. */
bool events_pop(key_event_t *out);

uint8_t events_pending(void);
uint32_t events_overrun(void);

#endif /* EVENTS_H */
