/*
 * test_gesture.c — the engine that decides what a press MEANS.
 *
 * Uses a fake clock: every call passes an explicit millisecond value, so there
 * is no sleeping, no timing flakiness, and the whole suite runs in microseconds.
 * If a test here is wrong, it is wrong deterministically, which is the point.
 */
#include "gesture.h"

#include <string.h>

#include "test.h"
#include "test_runner.h"

static gesture_engine_t E;
static gesture_queue_t Q;
static gesture_input_t IN;
static int s_quad_idx = 2; /* encoder idle position (A=1, B=1) in seq[] */

static cfg_global_t defaults_global(void) {
    cfg_global_t g;
    memset(&g, 0, sizeof(g));
    g.hold_ms = 300;
    g.double_tap_ms = 0; /* off: taps fire on release with zero added latency */
    g.knob_hold_ms = 500;
    g.knob_idle_ms = 40;
    g.knob_batch = 4;
    g.hold_repeat_ms = 40;
    return g;
}

static void reset(void) {
    cfg_global_t g = defaults_global();
    gesture_init(&E, &g);
    gesture_queue_init(&Q);
    memset(&IN, 0, sizeof(IN));
    IN.enc_a = 1; /* idle: both lines high */
    IN.enc_b = 1;
    s_quad_idx = 2;
}

static void tick(uint32_t ms) { gesture_process(&E, &IN, ms, &Q); }

static void press(uint8_t key, uint32_t ms) {
    IN.key_down_mask = (uint16_t)(IN.key_down_mask | (1u << key));
    tick(ms);
}

static void release(uint8_t key, uint32_t ms) {
    IN.key_down_mask = (uint16_t)(IN.key_down_mask & ~(1u << key));
    tick(ms);
}

static bool pop(gesture_t *out) { return gesture_queue_pop(&Q, out); }

/* Non-destructive: peeks the whole queue without consuming it.
 * A destructive count here would eat the events a later assertion in the same
 * test needs, which is how gesture tests end up passing for the wrong reason. */
static int count_kind(gesture_kind_t kind) {
    gesture_t g;
    int n = 0;
    for (uint8_t i = 0; gesture_queue_peek(&Q, i, &g); i++) {
        if (g.kind == kind) n++;
    }
    return n;
}

/* Sum of `steps` over every queued gesture of a kind. Non-destructive. */
static int sum_steps(gesture_kind_t kind) {
    gesture_t g;
    int total = 0;
    for (uint8_t i = 0; gesture_queue_peek(&Q, i, &g); i++) {
        if (g.kind == kind) total += g.steps;
    }
    return total;
}

/* ---- tests -------------------------------------------------------------- */

static void test_short_press_is_a_tap(void) {
    g_current = __func__;
    reset();
    press(3, 100);
    release(3, 150); /* 50 ms, well under hold_ms */
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_TAP);
    ASSERT_EQ(g.index, 3);
    ASSERT(!pop(&g)); /* exactly one gesture, no phantom hold */
}

static void test_long_press_fires_hold_at_threshold_not_on_release(void) {
    g_current = __func__;
    reset();
    press(0, 1000);
    tick(1100);
    ASSERT_EQ(count_kind(GESTURE_HOLD), 0); /* not yet: 100 ms < 300 ms */
    tick(1300);
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_HOLD); /* fired AT the threshold, while still down */
    release(0, 1500);
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_HOLD_RELEASE);
    ASSERT_EQ(count_kind(GESTURE_TAP), 0); /* a hold must never also report a tap */
}

static void test_hold_does_not_also_emit_tap_when_hold_ms_below_tap_max(void) {
    g_current = __func__;
    /* The nastiest config: hold_ms shorter than the tap window. A 100 ms press
     * is longer than hold_ms, so it is a hold; it must not ALSO be a tap. */
    reset();
    cfg_global_t g = defaults_global();
    g.hold_ms = 60;
    gesture_apply_config(&E, &g);
    press(1, 0);
    tick(70);
    release(1, 100);
    ASSERT_EQ(count_kind(GESTURE_HOLD), 1);
    ASSERT_EQ(count_kind(GESTURE_TAP), 0);
}

static void test_double_tap_needs_second_press_inside_window(void) {
    g_current = __func__;
    reset();
    cfg_global_t g = defaults_global();
    g.double_tap_ms = 250;
    gesture_apply_config(&E, &g);

    press(2, 0);
    release(2, 60); /* first tap: must NOT fire yet, window is open */
    ASSERT_EQ(count_kind(GESTURE_TAP), 0);
    press(2, 120); /* second press inside the 250 ms window */
    gesture_t out;
    ASSERT(pop(&out));
    ASSERT_EQ(out.kind, GESTURE_DOUBLE_TAP);
    ASSERT_EQ(out.index, 2);
    release(2, 160);
    ASSERT_EQ(count_kind(GESTURE_TAP), 0); /* and no leftover single tap */
}

static void test_double_tap_window_expiry_falls_back_to_single_tap(void) {
    g_current = __func__;
    reset();
    cfg_global_t g = defaults_global();
    g.double_tap_ms = 250;
    gesture_apply_config(&E, &g);

    press(4, 0);
    release(4, 60);
    tick(200);
    ASSERT_EQ(count_kind(GESTURE_TAP), 0); /* still inside the window */
    tick(320); /* 60 + 260 > 250 since release */
    gesture_t out;
    ASSERT(pop(&out));
    ASSERT_EQ(out.kind, GESTURE_TAP);
    ASSERT_EQ(out.index, 4);
}

static void test_second_press_outside_window_is_two_taps(void) {
    g_current = __func__;
    reset();
    cfg_global_t g = defaults_global();
    g.double_tap_ms = 250;
    gesture_apply_config(&E, &g);

    press(5, 0);
    release(5, 50);
    tick(400); /* window expired (50 + 350 > 250), single tap committed */
    ASSERT_EQ(count_kind(GESTURE_TAP), 1);
    press(5, 500);
    release(5, 560);
    /* The second press came 450 ms after the first release, far outside the
     * 250 ms window, so it is a separate tap and NOT a double tap. It is still
     * sitting in its own window though, so let that expire before asserting. */
    ASSERT_EQ(count_kind(GESTURE_TAP), 1);
    ASSERT_EQ(count_kind(GESTURE_DOUBLE_TAP), 0);
    tick(900);
    ASSERT_EQ(count_kind(GESTURE_TAP), 2);
    ASSERT_EQ(count_kind(GESTURE_DOUBLE_TAP), 0);
}

static void test_bounce_shorter_than_debounce_is_not_a_press(void) {
    g_current = __func__;
    /* The gesture engine trusts its input; debouncing is scan.c's job. This test
     * documents the boundary: a 1 ms glitch passed straight through WOULD be a
     * tap, which is why scan.c must run first. Tested properly in test_scan.c. */
    reset();
    press(6, 0);
    release(6, 1);
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_TAP);
}

/* File-scope context for the hold-repeat callback. Nested functions are a GCC
 * extension and would not compile on clang, so the trampoline lives here. */
static struct {
    bool value;
    int calls;
} s_repeat_ctx;

static bool repeat_trampoline(void *user, uint8_t idx) {
    (void)user;
    (void)idx;
    s_repeat_ctx.calls++;
    return s_repeat_ctx.value;
}

static void test_hold_repeat_only_when_action_asks(void) {
    g_current = __func__;
    reset();
    gesture_callbacks_t cb = {.hold_is_repeatable = repeat_trampoline, .user = NULL};
    s_repeat_ctx.value = false;
    s_repeat_ctx.calls = 0;

    press(7, 0);
    tick(300); /* hold fires at the threshold */
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_HOLD);

    /* Not repeatable: holding another 190 ms must produce nothing extra. */
    for (uint32_t t = 310; t < 500; t += 10) gesture_process_cb(&E, &IN, t, &Q, &cb);
    ASSERT_EQ(count_kind(GESTURE_HOLD), 0);
    ASSERT(s_repeat_ctx.calls > 0); /* the engine did ask, it was told "no" */

    /* Repeatable: holds arrive roughly every hold_repeat_ms (40). */
    s_repeat_ctx.value = true;
    for (uint32_t t = 500; t < 700; t += 10) gesture_process_cb(&E, &IN, t, &Q, &cb);
    int repeats = count_kind(GESTURE_HOLD);
    ASSERT(repeats > 0);
    ASSERT(repeats <= 6); /* 200/40 = 5, one of slack */
    release(7, 710);
}

/* ---- knob --------------------------------------------------------------- */

/* Drive one full detent: 4 half-steps, ending back at the idle (A=1,B=1) state.
 *
 * The sequence is indexed off the encoder's CURRENT position rather than written
 * as a literal list of levels. That matters: a fixed list whose first entry
 * equals the idle state wastes one transition as a no-op, giving 3 half-steps
 * instead of 4 — one short of a detent, so the click silently never registers.
 *
 * DIRECTION IS A WIRING CONVENTION, not a physical truth. Whether stepping
 * forwards through the sequence is "clockwise" depends on which way you mounted
 * the encoder and which pin you called A. If your pad's volume goes down when
 * you turn the knob up, swap BOARD_ENC_A_PIN and BOARD_ENC_B_PIN in board.h —
 * one line, no logic change, nothing in this file to touch.
 */
static void rotate(int direction, uint32_t start_ms) {
    /* One full gray-code cycle. Index 2 is (A=1,B=1), the state both lines rest
     * in with pull-ups fitted and the switch open — which is what gesture_init()
     * primes last_ab to. Starting anywhere else in this array makes the first of
     * the four transitions a no-op, so the click scores 3 half-steps instead of
     * 4 and never becomes a detent. */
    static const uint8_t seq[4][2] = {{0, 0}, {0, 1}, {1, 1}, {1, 0}};
    uint32_t t = start_ms;
    for (int i = 0; i < 4; i++) {
        s_quad_idx = (s_quad_idx + (direction > 0 ? 1 : 3)) % 4; /* +3 == -1 mod 4 */
        IN.enc_a = seq[s_quad_idx][0];
        IN.enc_b = seq[s_quad_idx][1];
        tick(t);
        t += 1;
    }
}

static void test_single_detent_flushes_on_idle_timeout(void) {
    g_current = __func__;
    reset();
    rotate(+1, 1000);
    /* One detent is under knob_batch (4) and the idle timer has not expired
     * yet, so nothing must fire immediately. */
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CW), 0);
    /* But the idle timeout has to deliver it, or a single slow click does
     * nothing — the bug that makes a knob feel dead at low speed. */
    tick(1000 + 4 + 50);
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CW), 1);
    gesture_t g;
    ASSERT(gesture_queue_peek(&Q, 0, &g));
    ASSERT_EQ(g.kind, GESTURE_ROTATE_CW);
    ASSERT_EQ(g.steps, 1);
    ASSERT_EQ(g.index, GESTURE_INDEX_KNOB);
}

static void test_fast_flick_batches_into_one_event(void) {
    g_current = __func__;
    reset();
    for (int i = 0; i < 6; i++) rotate(+1, 2000 + (uint32_t)i * 4);
    /* 6 detents >= batch of 4, so a batched event must already have fired. */
    ASSERT(sum_steps(GESTURE_ROTATE_CW) >= 4);
    ASSERT_EQ(sum_steps(GESTURE_ROTATE_CCW), 0); /* direction is unambiguous */
    /* The tail (whatever is under the batch threshold) is delivered by the idle
     * timeout. Without it, the last 1-3 detents of every flick would vanish —
     * which is exactly the "I scrolled and the last few steps did nothing"
     * complaint. */
    tick(2000 + 6 * 4 + 100);
    ASSERT_EQ(sum_steps(GESTURE_ROTATE_CW), 6); /* none lost, none invented */
    ASSERT(count_kind(GESTURE_ROTATE_CW) <= 2); /* and coalesced, not 6 events */
}

static void test_counter_clockwise_is_negative_direction(void) {
    g_current = __func__;
    reset();
    rotate(-1, 3000);
    tick(3100); /* idle timeout flushes the single detent */
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CCW), 1);
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CW), 0); /* direction is not ambiguous */
    gesture_t g;
    ASSERT(gesture_queue_peek(&Q, 0, &g));
    ASSERT_EQ(g.kind, GESTURE_ROTATE_CCW);
    ASSERT_EQ(g.steps, 1);
}

static void test_knob_long_press_switches_channel(void) {
    g_current = __func__;
    reset();
    IN.enc_sw_down = true;
    tick(4000);
    tick(4300);
    ASSERT_EQ(count_kind(GESTURE_KNOB_HOLD), 0); /* 300 ms < 500 ms threshold */
    tick(4520);
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_KNOB_HOLD);
    IN.enc_sw_down = false;
    tick(4600);
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_KNOB_RELEASE);
    ASSERT_EQ(count_kind(GESTURE_KNOB_TAP), 0); /* a hold is never also a tap */
}

static void test_knob_short_press_is_a_tap(void) {
    g_current = __func__;
    reset();
    IN.enc_sw_down = true;
    tick(5000);
    IN.enc_sw_down = false;
    tick(5100);
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_KNOB_TAP);
}

static void test_rotating_while_pressing_cancels_the_hold(void) {
    g_current = __func__;
    /* The accidental-mode-switch case: you are scrolling and your thumb rests on
     * the shaft. Without this rule, every long scroll changes your channel. */
    reset();
    IN.enc_sw_down = true;
    tick(6000);
    rotate(+1, 6010);
    tick(6600); /* past the 500 ms knob_hold_ms */
    ASSERT_EQ(count_kind(GESTURE_KNOB_HOLD), 0);
    IN.enc_sw_down = false;
    tick(6700);
    ASSERT_EQ(count_kind(GESTURE_KNOB_TAP), 0); /* rotation also cancels the tap */
    /* The rotation itself must still be delivered — cancelling the hold must not
     * cancel the scroll. */
    ASSERT_EQ(sum_steps(GESTURE_ROTATE_CW), 1);
}

static void test_glitch_transition_is_ignored(void) {
    g_current = __func__;
    reset();
    /* 11 -> 00 is both lines changing at once: electrically impossible on a
     * working encoder, so it is a glitch and must score zero. */
    IN.enc_a = 0;
    IN.enc_b = 0;
    tick(7000);
    IN.enc_a = 1;
    IN.enc_b = 1;
    tick(7001);
    tick(7200);
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CW), 0);
    ASSERT_EQ(count_kind(GESTURE_ROTATE_CCW), 0);
}

static void test_queue_overflow_counts_drops_without_corrupting(void) {
    g_current = __func__;
    reset();
    /* Fill past GESTURE_QUEUE_SIZE by tapping every key repeatedly. */
    for (int round = 0; round < 4; round++) {
        for (uint8_t k = 0; k < CFG_KEY_COUNT; k++) {
            press(k, (uint32_t)(8000 + round * 100));
            release(k, (uint32_t)(8020 + round * 100));
        }
    }
    gesture_t g;
    int n = 0;
    while (pop(&g)) n++;
    ASSERT(n <= GESTURE_QUEUE_SIZE);
    ASSERT(Q.dropped > 0); /* overflow was detected and counted, not silently lost */
}

static void test_time_wraparound_does_not_stick_a_key(void) {
    g_current = __func__;
    reset();
    /* Press just before the 32-bit ms counter wraps (~49.7 days of uptime). */
    uint32_t before_wrap = 0xFFFFFFFFu - 100u;
    press(8, before_wrap);
    tick(before_wrap + 50);          /* 150 ms held, under the 300 ms threshold */
    ASSERT_EQ(count_kind(GESTURE_HOLD), 0);
    tick(before_wrap + 300);         /* wraps to 199 */
    gesture_t g;
    ASSERT(pop(&g));
    ASSERT_EQ(g.kind, GESTURE_HOLD); /* elapsed via unsigned subtraction */
    release(8, 400);
}

/* ---- registration ------------------------------------------------------- */
const test_case_t gesture_tests[] = {
    {"short_press_is_a_tap", test_short_press_is_a_tap},
    {"long_press_fires_hold_at_threshold_not_on_release",
     test_long_press_fires_hold_at_threshold_not_on_release},
    {"hold_does_not_also_emit_tap_when_hold_ms_below_tap_max",
     test_hold_does_not_also_emit_tap_when_hold_ms_below_tap_max},
    {"double_tap_needs_second_press_inside_window", test_double_tap_needs_second_press_inside_window},
    {"double_tap_window_expiry_falls_back_to_single_tap",
     test_double_tap_window_expiry_falls_back_to_single_tap},
    {"second_press_outside_window_is_two_taps", test_second_press_outside_window_is_two_taps},
    {"bounce_shorter_than_debounce_is_not_a_press", test_bounce_shorter_than_debounce_is_not_a_press},
    {"hold_repeat_only_when_action_asks", test_hold_repeat_only_when_action_asks},
    {"single_detent_flushes_on_idle_timeout", test_single_detent_flushes_on_idle_timeout},
    {"fast_flick_batches_into_one_event", test_fast_flick_batches_into_one_event},
    {"counter_clockwise_is_negative_direction", test_counter_clockwise_is_negative_direction},
    {"knob_long_press_switches_channel", test_knob_long_press_switches_channel},
    {"knob_short_press_is_a_tap", test_knob_short_press_is_a_tap},
    {"rotating_while_pressing_cancels_the_hold", test_rotating_while_pressing_cancels_the_hold},
    {"glitch_transition_is_ignored", test_glitch_transition_is_ignored},
    {"queue_overflow_counts_drops_without_corrupting",
     test_queue_overflow_counts_drops_without_corrupting},
    {"time_wraparound_does_not_stick_a_key", test_time_wraparound_does_not_stick_a_key},
    {NULL, NULL},
};
