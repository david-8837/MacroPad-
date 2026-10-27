/*
 * test_scan.c — the debouncer.
 *
 * The rule under test: a pin must agree with its new state for
 * CFG_DEBOUNCE_MS / CFG_SCAN_PERIOD_MS consecutive samples before the accepted
 * state flips, and a bounce shorter than that must never reach the gesture
 * engine. This is the layer that decides whether a 2 ms contact bounce becomes a
 * phantom double-tap.
 */
#include "scan.h"

#include <string.h>

#include "config.h"
#include "test.h"
#include "test_runner.h"

#define SAMPLES (CFG_DEBOUNCE_MS / CFG_SCAN_PERIOD_MS)

static void feed_n(scan_state_t *s, uint16_t raw, int n) {
    for (int i = 0; i < n; i++) scan_update(s, raw);
}

static void test_clean_press_is_accepted_after_threshold(void) {
    g_current = __func__;
    scan_state_t s;
    scan_init(&s);
    ASSERT_EQ(s.stable, 0);

    /* One sample short of the threshold must NOT register. */
    feed_n(&s, 0x0001, SAMPLES - 1);
    ASSERT_EQ(s.stable & 1, 0);
    /* The threshold sample must. */
    feed_n(&s, 0x0001, 1);
    ASSERT_EQ(s.stable & 1, 1);
    ASSERT_EQ(s.changes, 1);
}

static void test_single_sample_bounce_is_rejected(void) {
    g_current = __func__;
    scan_state_t s;
    scan_init(&s);
    feed_n(&s, 0x0004, SAMPLES); /* key 2 down, accepted */
    ASSERT_EQ(s.stable & 0x4, 0x4);

    feed_n(&s, 0x0000, 1); /* 1 ms glitch */
    ASSERT_EQ(s.stable & 0x4, 0x4); /* still down: glitch did not propagate */
    feed_n(&s, 0x0004, SAMPLES);
    ASSERT_EQ(s.stable & 0x4, 0x4);
    ASSERT_EQ(s.changes, 1); /* exactly one accepted transition in total */
}

static void test_bounce_storm_never_produces_a_second_press(void) {
    g_current = __func__;
    /* Worst realistic case: 6 rapid open/close transitions over 6 ms while the
     * key is nominally held. The accepted state must flip once, at the start,
     * and stay down. */
    scan_state_t s;
    scan_init(&s);
    feed_n(&s, 0x0008, SAMPLES);
    ASSERT_EQ(s.stable & 0x8, 0x8);
    int accepted = (int)s.changes;

    for (int i = 0; i < 6; i++) {
        feed_n(&s, 0x0000, 1);
        feed_n(&s, 0x0008, 1);
    }
    ASSERT_EQ(s.stable & 0x8, 0x8);
    ASSERT_EQ((int)s.changes, accepted); /* no phantom press/release pair */
    ASSERT(s.bounces > 0);               /* but the raw noise was observed */
}

static void test_release_also_debounces(void) {
    g_current = __func__;
    scan_state_t s;
    scan_init(&s);
    feed_n(&s, 0x0010, SAMPLES);
    ASSERT_EQ(s.stable & 0x10, 0x10);
    feed_n(&s, 0x0000, SAMPLES - 1);
    ASSERT_EQ(s.stable & 0x10, 0x10); /* not released yet */
    feed_n(&s, 0x0000, 1);
    ASSERT_EQ(s.stable & 0x10, 0);
}

static void test_all_nine_keys_are_independent(void) {
    g_current = __func__;
    scan_state_t s;
    scan_init(&s);
    uint16_t all = (uint16_t)((1u << BOARD_KEY_COUNT) - 1u);
    feed_n(&s, all, SAMPLES);
    ASSERT_EQ(s.stable, all);
    ASSERT_EQ(BOARD_KEY_COUNT, 9);

    /* Release only key 4. The other eight must not be disturbed. */
    feed_n(&s, (uint16_t)(all & ~(1u << 4)), SAMPLES);
    ASSERT_EQ(s.stable, (uint16_t)(all & ~(1u << 4)));
}

static void test_bit_beyond_nine_keys_is_ignored(void) {
    g_current = __func__;
    /* A mask with bit 12 set cannot happen from our 9 pins, but if it did — say
     * from a mis-wired test harness — it must not corrupt the accepted state. */
    scan_state_t s;
    scan_init(&s);
    feed_n(&s, 0x1000, SAMPLES * 3);
    ASSERT_EQ(s.stable, 0);
}

const test_case_t scan_tests[] = {
    {"clean_press_is_accepted_after_threshold", test_clean_press_is_accepted_after_threshold},
    {"single_sample_bounce_is_rejected", test_single_sample_bounce_is_rejected},
    {"bounce_storm_never_produces_a_second_press", test_bounce_storm_never_produces_a_second_press},
    {"release_also_debounces", test_release_also_debounces},
    {"all_nine_keys_are_independent", test_all_nine_keys_are_independent},
    {"bit_beyond_nine_keys_is_ignored", test_bit_beyond_nine_keys_is_ignored},
    {NULL, NULL},
};
