/*
 * gesture.h — the tap / hold / double-tap / knob engine.
 *
 * THIS FILE IS THE PART WORTH GETTING RIGHT. Everything else is plumbing.
 *
 * It is written to be compiled and tested on a PC with no hardware: no PIO, no
 * GPIO, no clock. Time comes from the caller as a plain uint32_t of milliseconds
 * and edges come from the caller as a bitmask, so firmware/tests can drive it
 * with a fake clock and get deterministic results.
 *
 * ── What the engine has to decide, and why it is not trivial ───────────────
 * A single physical press can mean up to three different things (tap, hold,
 * double tap) and you cannot know which until time has passed:
 *
 *   press ──────────── release            release before hold_ms  -> TAP
 *   press ──(hold_ms)─── ... held ...     crossed hold_ms         -> HOLD
 *   press ─release  press ─release        second press inside      -> DOUBLE_TAP
 *                                         double_tap_ms window
 *
 * So a tap can only be *committed* at the moment the double-tap window expires,
 * unless double_tap is unconfigured — then we commit on release with zero
 * latency. That single optimisation is what makes the pad feel instant for the
 * common case, and it is why `double_tap_ms == 0` is meaningful and not just
 * "disabled by accident".
 *
 * HOLD fires the instant the threshold is crossed, not on release, because
 * that is what people expect from a hold-to-do-thing binding. HOLD_RELEASE then
 * fires on release so hold-down actions can be undone.
 *
 * ── The knob is a different animal ────────────────────────────────────────
 * Rotation and pressing are tracked together because they interact: a long
 * press that happens *while rotating* must NOT switch channel (you were
 * scrolling, and your thumb drifted). So any rotation seen during a press
 * cancels the pending hold, and any press cancels pending rotation batching.
 *
 * Rotation is batched: a fast flick arrives as 12 half-detents in 8 ms, and
 * firing 12 separate volume-up events makes the OS lag behind. Detents
 * accumulate and flush when either knob_batch detents are pending or the knob
 * has been idle for knob_idle_ms — the idle flush is what makes a single slow
 * click still register.
 */
#ifndef GESTURE_H
#define GESTURE_H

#include <stdbool.h>
#include <stdint.h>

#include "config.h"

/* A gesture the engine resolved, handed to the dispatcher. */
typedef enum {
    GESTURE_NONE = 0,
    GESTURE_TAP,
    GESTURE_HOLD,        /* threshold just crossed, key still down */
    GESTURE_HOLD_RELEASE, /* key released after a hold already fired */
    GESTURE_DOUBLE_TAP,
    GESTURE_ROTATE_CW,   /* knob: `steps` detents clockwise */
    GESTURE_ROTATE_CCW,
    GESTURE_KNOB_TAP,
    GESTURE_KNOB_HOLD,   /* channel switch in the default config */
    GESTURE_KNOB_RELEASE,
} gesture_kind_t;

typedef struct {
    gesture_kind_t kind;
    uint8_t index;  /* key 0..8, or 255 for the knob */
    int16_t steps;  /* detent count for rotation gestures */
    uint32_t at_ms; /* timestamp it resolved at, for the event log */
} gesture_t;

#define GESTURE_INDEX_KNOB 255

/* Per-key state machine. */
typedef enum {
    KS_IDLE = 0,
    KS_PRESSED,         /* down, hold timer running */
    KS_HELD,            /* hold already fired */
    KS_WAIT_SECOND_TAP, /* released inside tap window, double-tap armed */
} key_state_t;

typedef struct {
    key_state_t state;
    bool physical;      /* debounced pin state, true = down */
    uint32_t press_at;
    uint32_t release_at;
    bool hold_fired;
    uint32_t last_repeat_at;
} key_gesture_t;

/* Knob state machine. */
typedef enum {
    NS_IDLE = 0,
    NS_PRESSED,
    NS_HELD,
} knob_state_t;

typedef struct {
    knob_state_t state;
    bool physical;
    uint32_t press_at;
    int32_t pending_steps;  /* signed detents not yet flushed */
    uint32_t last_move_at;
    bool rotated_while_pressed;
    bool hold_fired;
    /* Quadrature decoder state: last raw (A,B) pair, plus the fractional
     * half-step accumulator. The accumulator MUST live here and not in a file
     * static: a file static survives gesture_init(), so a previous test (or a
     * previous encoder glitch) leaves a residue of +/-3 half-steps that swallows
     * the first detent after every reset. */
    uint8_t last_ab;
    int16_t halfstep_accum;
} knob_gesture_t;

typedef struct {
    key_gesture_t keys[CFG_KEY_COUNT];
    knob_gesture_t knob;
    /* Timing thresholds, copied from cfg_global_t so the engine never reaches
     * into storage mid-frame. */
    uint16_t hold_ms;
    uint16_t double_tap_ms;
    uint16_t tap_max_ms;
    uint16_t hold_repeat_ms;
    uint16_t knob_hold_ms;
    uint16_t knob_idle_ms;
    uint8_t knob_batch;
} gesture_engine_t;

/* ---- input edges, one per scan ----------------------------------------- */
typedef struct {
    uint16_t key_down_mask; /* bit n = key n is currently DOWN */
    uint8_t enc_a;          /* raw quadrature levels */
    uint8_t enc_b;
    bool enc_sw_down;
} gesture_input_t;

/* ---- output queue ------------------------------------------------------ */
/* Fixed-size ring so the engine never allocates and never blocks. If the
 * dispatcher falls behind, gestures are dropped and `dropped` counts them —
 * better than corrupting state or stalling the scan loop. */
#define GESTURE_QUEUE_SIZE 16

typedef struct {
    gesture_t items[GESTURE_QUEUE_SIZE];
    uint8_t head;
    uint8_t tail;
    uint8_t count;
    uint32_t dropped;
} gesture_queue_t;

/* ---- lifecycle --------------------------------------------------------- */
void gesture_init(gesture_engine_t *e, const cfg_global_t *g);
/* Re-read timing thresholds after a config change. Preserves in-flight state. */
void gesture_apply_config(gesture_engine_t *e, const cfg_global_t *g);

/* Advance the engine by one scan tick. Pushes 0..n gestures onto `q`.
 * `now_ms` must be a free-running ms counter; wraparound is handled. */
void gesture_process(gesture_engine_t *e, const gesture_input_t *in, uint32_t now_ms,
                     gesture_queue_t *q);

/* Optional hooks. The engine deliberately knows nothing about actions or about
 * the channel layout, so anything it needs to ask about comes back through
 * here. Pass NULL (or use gesture_process) for pure gesture behaviour. */
typedef struct {
    /* Should the hold action bound to key `i` be auto-repeated while held?
     * The dispatcher answers from cfg_action_t.flags & ACTION_FLAG_REPEAT. */
    bool (*hold_is_repeatable)(void *user, uint8_t key_index);
    void *user;
} gesture_callbacks_t;

void gesture_process_cb(gesture_engine_t *e, const gesture_input_t *in, uint32_t now_ms,
                        gesture_queue_t *q, const gesture_callbacks_t *cb);

/* Feed a raw quadrature sample outside the normal scan (used by tests and by
 * the ISR path if you switch to interrupt-driven encoder reads). */
void gesture_encoder_sample(gesture_engine_t *e, uint8_t a, uint8_t b, uint32_t now_ms);

/* ---- queue ------------------------------------------------------------- */
void gesture_queue_init(gesture_queue_t *q);
bool gesture_queue_push(gesture_queue_t *q, const gesture_t *g);
bool gesture_queue_pop(gesture_queue_t *q, gesture_t *out);
/* Non-destructive read of the nth queued gesture (0 = oldest). Tests need this:
 * a destructive pop inside a helper would consume the very events the caller is
 * about to assert on, which is a trap that makes gesture tests lie. */
bool gesture_queue_peek(const gesture_queue_t *q, uint8_t n, gesture_t *out);

/* ---- helpers ----------------------------------------------------------- */
/* Wraparound-safe elapsed time. */
static inline uint32_t ms_elapsed(uint32_t start, uint32_t now) { return now - start; }

/* Name of a gesture, for logs and the host event stream. */
const char *gesture_name(gesture_kind_t k);

#endif /* GESTURE_H */
