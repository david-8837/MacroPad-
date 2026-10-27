/*
 * events.c — the notification ring.
 */
#include "events.h"

#include <string.h>

static event_ring_t s_ring;
static bool s_enabled = true;

void events_init(void) {
    memset(&s_ring, 0, sizeof(s_ring));
}

void events_enable(bool on) { s_enabled = on; }
bool events_enabled(void) { return s_enabled; }

void events_push(uint8_t source, uint8_t index, uint8_t event, uint8_t channel, int16_t value,
                 uint16_t action) {
    if (!s_enabled) return;
    if (s_ring.count >= EVENT_RING_SIZE) {
        /* Drop the OLDEST, not the newest. The host that comes back later wants
         * to see what just happened, not what happened 32 events ago. */
        s_ring.head = (uint8_t)((s_ring.head + 1) % EVENT_RING_SIZE);
        s_ring.count--;
        s_ring.overrun++;
    }
    key_event_t *e = &s_ring.items[s_ring.tail];
    e->source = source;
    e->index = index;
    e->event = event;
    e->channel = channel;
    e->value = value;
    e->action = action;
    s_ring.tail = (uint8_t)((s_ring.tail + 1) % EVENT_RING_SIZE);
    s_ring.count++;
}

bool events_pop(key_event_t *out) {
    if (!out || s_ring.count == 0) return false;
    *out = s_ring.items[s_ring.head];
    s_ring.head = (uint8_t)((s_ring.head + 1) % EVENT_RING_SIZE);
    s_ring.count--;
    return true;
}

uint8_t events_pending(void) { return s_ring.count; }
uint32_t events_overrun(void) { return s_ring.overrun; }
