/*
 * scan.h — debounced key sampling.
 *
 * Deliberately dumb: it knows about pins and bouncing, nothing about gestures
 * or actions. Output is a 16-bit mask, which is what gesture.h wants.
 */
#ifndef SCAN_H
#define SCAN_H

#include <stdbool.h>
#include <stdint.h>

#include "board.h"

typedef struct {
    uint16_t stable;   /* debounced state: bit n set = key n DOWN */
    uint16_t raw_last; /* previous raw sample, for edge counting */
    uint8_t count[BOARD_KEY_COUNT]; /* consecutive agreeing samples per key */
    uint32_t changes;               /* total accepted transitions (diagnostics) */
    uint32_t bounces;               /* raw samples that were rejected (diagnostics) */
} scan_state_t;

void scan_init(scan_state_t *s);

/* Configure the GPIOs. Safe to call once at boot. On host builds this is a
 * no-op (see scan_host.c). */
void scan_hw_init(void);

/* Configure the encoder A/B/SW pins (input, pull-up, hysteresis). Called from
 * scan_hw_init on the target; declared here so main.c does not touch GPIO
 * directly and the host build stays GPIO-free. */
void scan_hw_init_encoder(void);

/* Raw encoder pin levels. Host builds return the last injected values. */
uint8_t scan_read_encoder_a(void);
uint8_t scan_read_encoder_b(void);
bool scan_read_encoder_sw_down(void);

/* Read raw pin levels into a mask. Split out so tests can drive the debouncer
 * with synthetic samples without touching the state machine. */
uint16_t scan_read_raw(void);

/* Feed one raw sample. Call at CFG_SCAN_PERIOD_MS intervals. A key's state only
 * changes after CFG_DEBOUNCE_MS of agreement. */
void scan_update(scan_state_t *s, uint16_t raw);

#endif /* SCAN_H */
