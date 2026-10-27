/*
 * gesture.c — tap / hold / double-tap / knob state machines.
 *
 * Hardware-free by construction: no includes of pico/stdlib.h, no GPIO, no
 * timer reads. Time and edges arrive as arguments. That is what lets
 * firmware/tests/test_gesture.c run the exact same code the RP2040 runs.
 */
#include "gesture.h"

#include <string.h>

/* Quadrature decoder table, indexed by (last_ab << 2) | now_ab.
 * Values are HALF-STEPS: +1 forward, -1 backward, 0 = no move or a glitch.
 * A single detent on a standard EC11-style encoder is 4 half-steps, so we
 * accumulate and divide by BOARD_ENC_HALF_STEPS_PER_DETENT.
 *
 * Illegal transitions (both lines changing at once) score 0 rather than being
 * guessed at: on a hand-soldered encoder with bouncing contacts, guessing
 * produces phantom volume changes, ignoring produces at worst one lost click. */
static const int8_t QUAD_TABLE[16] = {
    /*        AB=00  AB=01  AB=10  AB=11   <- now */
    /* 00 */  0,    +1,    -1,     0,
    /* 01 */ -1,     0,     0,    +1,
    /* 10 */ +1,     0,     0,    -1,
    /* 11 */  0,    -1,    +1,     0,
};

void gesture_init(gesture_engine_t *e, const cfg_global_t *g) {
    memset(e, 0, sizeof(*e));
    e->knob.last_ab = 3; /* assume both lines high (idle) at boot */
    e->knob.halfstep_accum = 0;
    if (g) gesture_apply_config(e, g);
}

void gesture_apply_config(gesture_engine_t *e, const cfg_global_t *g) {
    if (!g) return;
    e->hold_ms = g->hold_ms ? g->hold_ms : CFG_DEFAULT_HOLD_MS;
    e->double_tap_ms = g->double_tap_ms; /* 0 is a valid "disabled" */
    e->tap_max_ms = CFG_DEFAULT_TAP_MAX_MS;
    e->hold_repeat_ms = g->hold_repeat_ms ? g->hold_repeat_ms : CFG_DEFAULT_HOLD_REPEAT_MS;
    e->knob_hold_ms = g->knob_hold_ms ? g->knob_hold_ms : CFG_DEFAULT_KNOB_HOLD_MS;
    e->knob_idle_ms = g->knob_idle_ms ? g->knob_idle_ms : CFG_DEFAULT_KNOB_IDLE_MS;
    e->knob_batch = g->knob_batch ? g->knob_batch : CFG_DEFAULT_KNOB_BATCH;
}

void gesture_queue_init(gesture_queue_t *q) {
    if (!q) return;
    q->head = q->tail = q->count = 0;
    q->dropped = 0;
}

bool gesture_queue_push(gesture_queue_t *q, const gesture_t *g) {
    if (!q || !g || q->count >= GESTURE_QUEUE_SIZE) {
        if (q) q->dropped++;
        return false;
    }
    q->items[q->tail] = *g;
    q->tail = (uint8_t)((q->tail + 1) % GESTURE_QUEUE_SIZE);
    q->count++;
    return true;
}

bool gesture_queue_peek(const gesture_queue_t *q, uint8_t n, gesture_t *out) {
    if (!q || !out || n >= q->count) return false;
    *out = q->items[(uint8_t)((q->head + n) % GESTURE_QUEUE_SIZE)];
    return true;
}

bool gesture_queue_pop(gesture_queue_t *q, gesture_t *out) {
    if (!q || !out || q->count == 0) return false;
    *out = q->items[q->head];
    q->head = (uint8_t)((q->head + 1) % GESTURE_QUEUE_SIZE);
    q->count--;
    return true;
}

static void emit(gesture_queue_t *q, gesture_kind_t kind, uint8_t index, int16_t steps,
                 uint32_t now) {
    gesture_t g = {.kind = kind, .index = index, .steps = steps, .at_ms = now};
    gesture_queue_push(q, &g);
}

/* A press longer than this is no longer a candidate for tap or double-tap.
 * Taking the min of hold_ms and tap_max_ms is what stops a very short hold_ms
 * (say 80 ms) from also firing a tap on release — you would get both actions
 * from one press, which is the single most confusing bug a gesture engine can
 * have. */
static uint32_t tap_window(const gesture_engine_t *e) {
    uint32_t w = e->hold_ms;
    if (e->tap_max_ms && e->tap_max_ms < w) w = e->tap_max_ms;
    return w;
}

/* ---- keys --------------------------------------------------------------- */
static void process_key(gesture_engine_t *e, uint8_t i, bool down, uint32_t now,
                        gesture_queue_t *q, const gesture_callbacks_t *cb) {
    key_gesture_t *k = &e->keys[i];

    /* --- edge handling --- */
    if (down != k->physical) {
        k->physical = down;
        if (down) {
            k->press_at = now;
            k->hold_fired = false;
            k->last_repeat_at = now;
            if (k->state == KS_WAIT_SECOND_TAP &&
                ms_elapsed(k->release_at, now) <= e->double_tap_ms) {
                /* Second press landed inside the window. Commit the double tap
                 * NOW rather than on release: the user has already committed to
                 * the gesture, and waiting another 150 ms to fire makes it feel
                 * broken. */
                emit(q, GESTURE_DOUBLE_TAP, i, 0, now);
                k->state = KS_HELD;
                k->hold_fired = true; /* suppress a HOLD after the double tap */
            } else {
                k->state = KS_PRESSED;
            }
        } else {
            k->release_at = now;
            uint32_t held = ms_elapsed(k->press_at, now);
            switch (k->state) {
            case KS_HELD:
                if (k->hold_fired) emit(q, GESTURE_HOLD_RELEASE, i, 0, now);
                k->state = KS_IDLE;
                break;
            case KS_PRESSED:
                if (held <= tap_window(e)) {
                    if (e->double_tap_ms > 0) {
                        /* Arm the double-tap window; the tap commits later. */
                        k->state = KS_WAIT_SECOND_TAP;
                    } else {
                        /* No double tap configured: fire immediately, zero added
                         * latency. This is the default for every key. */
                        emit(q, GESTURE_TAP, i, 0, now);
                        k->state = KS_IDLE;
                    }
                } else {
                    /* Long press that never reached hold_ms (possible when
                     * hold_ms > tap_max_ms). Treat as a hold that fired late. */
                    if (!k->hold_fired && held >= e->hold_ms) {
                        emit(q, GESTURE_HOLD, i, 0, now);
                        emit(q, GESTURE_HOLD_RELEASE, i, 0, now);
                    } else if (!k->hold_fired) {
                        emit(q, GESTURE_TAP, i, 0, now);
                    }
                    k->state = KS_IDLE;
                }
                break;
            case KS_WAIT_SECOND_TAP:
                /* Released again without a second press; the timer below will
                 * commit the tap. */
                break;
            case KS_IDLE:
            default:
                break;
            }
        }
    }

    /* --- level handling (timeouts while the state is unchanged) --- */
    switch (k->state) {
    case KS_PRESSED:
        if (!k->hold_fired && ms_elapsed(k->press_at, now) >= e->hold_ms) {
            k->hold_fired = true;
            k->last_repeat_at = now;
            emit(q, GESTURE_HOLD, i, 0, now);
            k->state = KS_HELD;
        }
        break;

    case KS_HELD:
        /* Hold-repeat: re-fire the hold gesture at the configured interval, but
         * only for actions that asked for it. Asking the caller keeps action
         * semantics out of this file. */
        if (cb && cb->hold_is_repeatable && cb->hold_is_repeatable(cb->user, i) &&
            ms_elapsed(k->last_repeat_at, now) >= e->hold_repeat_ms) {
            k->last_repeat_at = now;
            emit(q, GESTURE_HOLD, i, 0, now);
        }
        break;

    case KS_WAIT_SECOND_TAP:
        if (ms_elapsed(k->release_at, now) > e->double_tap_ms) {
            /* Window expired with no second press: commit the single tap. */
            emit(q, GESTURE_TAP, i, 0, now);
            k->state = KS_IDLE;
        }
        break;

    case KS_IDLE:
    default:
        break;
    }
}

/* ---- knob --------------------------------------------------------------- */
void gesture_encoder_sample(gesture_engine_t *e, uint8_t a, uint8_t b, uint32_t now_ms) {
    uint8_t now_ab = (uint8_t)(((a ? 1 : 0) << 1) | (b ? 1 : 0));
    int8_t delta = QUAD_TABLE[(e->knob.last_ab << 2) | now_ab];
    e->knob.last_ab = now_ab;
    if (delta == 0) return;

    e->knob.halfstep_accum = (int16_t)(e->knob.halfstep_accum + delta);
    while (e->knob.halfstep_accum >= BOARD_ENC_HALF_STEPS_PER_DETENT) {
        e->knob.halfstep_accum = (int16_t)(e->knob.halfstep_accum - BOARD_ENC_HALF_STEPS_PER_DETENT);
        e->knob.pending_steps += 1;
        e->knob.last_move_at = now_ms;
        e->knob.rotated_while_pressed = e->knob.rotated_while_pressed || (e->knob.state != NS_IDLE);
    }
    while (e->knob.halfstep_accum <= -BOARD_ENC_HALF_STEPS_PER_DETENT) {
        e->knob.halfstep_accum = (int16_t)(e->knob.halfstep_accum + BOARD_ENC_HALF_STEPS_PER_DETENT);
        e->knob.pending_steps -= 1;
        e->knob.last_move_at = now_ms;
        e->knob.rotated_while_pressed = e->knob.rotated_while_pressed || (e->knob.state != NS_IDLE);
    }
}

static void flush_rotation(gesture_engine_t *e, uint32_t now, gesture_queue_t *q) {
    int32_t s = e->knob.pending_steps;
    if (s == 0) return;
    /* Clamp to int16 so a violent flick cannot overflow the event payload. */
    if (s > 512) s = 512;
    if (s < -512) s = -512;
    emit(q, s > 0 ? GESTURE_ROTATE_CW : GESTURE_ROTATE_CCW, GESTURE_INDEX_KNOB, (int16_t)(s > 0 ? s : -s),
         now);
    e->knob.pending_steps = 0;
}

static void process_knob(gesture_engine_t *e, bool down, uint32_t now, gesture_queue_t *q) {
    knob_gesture_t *k = &e->knob;

    if (down != k->physical) {
        k->physical = down;
        if (down) {
            k->press_at = now;
            k->hold_fired = false;
            k->rotated_while_pressed = false;
            /* Pressing cancels any pending rotation batch so the press gesture
             * is not preceded by a stray volume step. */
            flush_rotation(e, now, q);
            k->state = NS_PRESSED;
        } else {
            switch (k->state) {
            case NS_HELD:
                if (k->hold_fired) emit(q, GESTURE_KNOB_RELEASE, GESTURE_INDEX_KNOB, 0, now);
                break;
            case NS_PRESSED:
                /* A tap is a clean press+release with no rotation in between
                 * and shorter than the hold threshold. Requiring "no rotation"
                 * is what stops a scroll that ends with your thumb on the shaft
                 * from firing mute. */
                if (!k->hold_fired && !k->rotated_while_pressed &&
                    ms_elapsed(k->press_at, now) < e->knob_hold_ms) {
                    emit(q, GESTURE_KNOB_TAP, GESTURE_INDEX_KNOB, 0, now);
                }
                break;
            case NS_IDLE:
            default:
                break;
            }
            /* Rotation that happened while pressed is delivered on release so
             * the ordering stays "press, scroll, release" for the host. */
            flush_rotation(e, now, q);
            k->state = NS_IDLE;
            k->rotated_while_pressed = false;
        }
    }

    /* Batched rotation flush. Two triggers:
     *   - enough detents accumulated (fast flick: deliver in one event)
     *   - the knob went quiet (slow single click: still has to fire)
     * Without the idle trigger, one detent would sit in pending_steps forever. */
    if (k->state != NS_PRESSED || !k->rotated_while_pressed) {
        int32_t mag = k->pending_steps < 0 ? -k->pending_steps : k->pending_steps;
        if (mag >= (int32_t)e->knob_batch) {
            flush_rotation(e, now, q);
        } else if (k->pending_steps != 0 && ms_elapsed(k->last_move_at, now) >= e->knob_idle_ms) {
            flush_rotation(e, now, q);
        }
    }

    /* Long-press check comes after rotation handling for a reason: rotation is
     * decoded above and sets rotated_while_pressed, and that flag is what
     * cancels the hold. Checking the hold first would let the threshold fire on
     * the very tick the user starts scrolling, which is the accidental
     * channel-switch this rule exists to prevent. */
    if (k->state == NS_PRESSED && !k->hold_fired && !k->rotated_while_pressed &&
        ms_elapsed(k->press_at, now) >= e->knob_hold_ms) {
        k->hold_fired = true;
        k->state = NS_HELD;
        emit(q, GESTURE_KNOB_HOLD, GESTURE_INDEX_KNOB, 0, now);
    }


}

/* ---- main entry --------------------------------------------------------- */
void gesture_process_cb(gesture_engine_t *e, const gesture_input_t *in, uint32_t now_ms,
                        gesture_queue_t *q, const gesture_callbacks_t *cb) {
    if (!e || !in || !q) return;

    gesture_encoder_sample(e, in->enc_a, in->enc_b, now_ms);

    for (uint8_t i = 0; i < CFG_KEY_COUNT; i++) {
        bool down = (in->key_down_mask >> i) & 1u;
        process_key(e, i, down, now_ms, q, cb);
    }

    process_knob(e, in->enc_sw_down, now_ms, q);
}

void gesture_process(gesture_engine_t *e, const gesture_input_t *in, uint32_t now_ms,
                     gesture_queue_t *q) {
    gesture_process_cb(e, in, now_ms, q, NULL);
}

const char *gesture_name(gesture_kind_t k) {
    switch (k) {
    case GESTURE_TAP: return "tap";
    case GESTURE_HOLD: return "hold";
    case GESTURE_HOLD_RELEASE: return "hold_release";
    case GESTURE_DOUBLE_TAP: return "double_tap";
    case GESTURE_ROTATE_CW: return "rotate_cw";
    case GESTURE_ROTATE_CCW: return "rotate_ccw";
    case GESTURE_KNOB_TAP: return "knob_tap";
    case GESTURE_KNOB_HOLD: return "knob_hold";
    case GESTURE_KNOB_RELEASE: return "knob_release";
    case GESTURE_NONE:
    default: return "none";
    }
}
