/*
 * test_actions.c — the dispatcher, with a recording backend.
 *
 * actions.c has no hardware in it, so the "backend" here is an array that
 * records every HID report. The assertions are about the exact byte sequences a
 * real keyboard would have to send, which is the part that is easy to get
 * subtly wrong (a missing release leaves a modifier stuck, and a stuck modifier
 * is the single most reported bug in any DIY keyboard).
 */
#include <string.h>

#include "actions.h"
#include "channel.h"
#include "config.h"
#include "events.h"
#include "gesture.h"
#include "storage.h"
#include "test.h"
#include "test_runner.h"

extern void storage_host_reset(void);

/* ---- recording backend -------------------------------------------------- */
typedef enum { REC_KBD, REC_CONSUMER, REC_EVENT, REC_BOOT, REC_RESET, REC_DELAY } rec_kind_t;

typedef struct {
    rec_kind_t kind;
    uint8_t mods;
    uint8_t keys[6];
    uint16_t usage;
    uint32_t ms;
    char text[ACTION_TEXT_MAX];
} rec_t;

#define REC_MAX 256
static rec_t R[REC_MAX];
static int Rn;

static void rec(rec_kind_t k) {
    if (Rn < REC_MAX) {
        memset(&R[Rn], 0, sizeof(R[Rn]));
        R[Rn].kind = k;
        Rn++;
    }
}

static void b_kbd(uint8_t mods, const uint8_t keys[6]) {
    rec(REC_KBD);
    if (Rn) {
        R[Rn - 1].mods = mods;
        memcpy(R[Rn - 1].keys, keys, 6);
    }
}
static void b_consumer(uint16_t u) {
    rec(REC_CONSUMER);
    if (Rn) R[Rn - 1].usage = u;
}
static void b_event(uint8_t kind, uint8_t channel, const char *payload) {
    (void)channel;
    rec(REC_EVENT);
    if (Rn) {
        R[Rn - 1].mods = kind;
        if (payload) snprintf(R[Rn - 1].text, sizeof(R[Rn - 1].text), "%s", payload);
    }
}
static void b_boot(void) { rec(REC_BOOT); }
static void b_reset(void) { rec(REC_RESET); }
static void b_delay(uint32_t ms) {
    rec(REC_DELAY);
    if (Rn) R[Rn - 1].ms = ms;
}

static const action_backend_t BACKEND = {
    .hid_send_keyboard = b_kbd,
    .hid_send_consumer = b_consumer,
    .emit_event = b_event,
    .request_bootloader = b_boot,
    .request_config_reset = b_reset,
    .delay_ms = b_delay,
    .user = NULL,
};

static void reset_recording(void) {
    Rn = 0;
    memset(R, 0, sizeof(R));
    action_set_backend(&BACKEND);
    /* The sticky latch is deliberately module state — that is what makes sticky
     * work — so tests must clear it explicitly or cases leak into each other.
     * reset_state (not release_all) because release_all emits a report, which
     * would then be counted as part of the case under test. */
    action_reset_state();
}

/* Count key-DOWN reports for a specific usage (non-zero key slot 0). */
static int count_down(uint8_t usage) {
    int n = 0;
    for (int i = 0; i < Rn; i++)
        if (R[i].kind == REC_KBD && R[i].keys[0] == usage) n++;
    return n;
}
static int count_up(void) {
    int n = 0;
    for (int i = 0; i < Rn; i++)
        if (R[i].kind == REC_KBD && R[i].keys[0] == 0 && R[i].mods == 0) n++;
    return n;
}
static int count_kind(rec_kind_t k) {
    int n = 0;
    for (int i = 0; i < Rn; i++)
        if (R[i].kind == k) n++;
    return n;
}

static action_t mk(uint8_t type, uint8_t flags, uint16_t code) {
    action_t a;
    memset(&a, 0, sizeof(a));
    a.type = type;
    a.flags = flags;
    a.code = code;
    return a;
}

/* ---- tests -------------------------------------------------------------- */

static void test_empty_action_does_nothing(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_NONE, 0, 0);
    ASSERT(!action_is_set(&a));
    ASSERT(!action_fire(&a, true));
    ASSERT_EQ(Rn, 0);
}

static void test_keycode_tap_sends_down_then_up(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_KEYCODE, 0, HID_ENTER);
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(Rn, 2);
    ASSERT_EQ(R[0].kind, REC_KBD);
    ASSERT_EQ(R[0].keys[0], HID_ENTER);
    ASSERT_EQ(R[1].kind, REC_KBD);
    ASSERT_EQ(R[1].keys[0], 0); /* the release, without which the key sticks */
}

static void test_hold_down_flag_defers_release(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_KEYCODE, ACTION_FLAG_HOLD_DOWN, HID_LEFT);
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(Rn, 1);            /* down only */
    ASSERT_EQ(count_down(HID_LEFT), 1);
    ASSERT_EQ(count_up(), 0);
    /* The release half is an effect in its own right (it let go), so it reports
     * true too. */
    ASSERT(action_fire(&a, false));
    ASSERT_EQ(Rn, 2);
    ASSERT_EQ(count_up(), 1); /* released on the false call */
}

static void test_on_release_flag_ignores_the_press(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_KEYCODE, ACTION_FLAG_ON_RELEASE, HID_ESC);
    ASSERT(!action_fire(&a, true)); /* press is swallowed */
    ASSERT_EQ(Rn, 0);
    ASSERT(action_fire(&a, false));
    ASSERT_EQ(count_down(HID_ESC), 1);
}

static void test_sticky_toggles_on_second_press(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_MODS, ACTION_FLAG_STICKY, MOD_LSFT);
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(Rn, 1);
    ASSERT_EQ(R[0].mods, MOD_LSFT); /* latched, and visible in the report */

    /* The latch must now be applied to whatever else is typed. This is the whole
     * point of sticky: press Shift once, then press A, get a capital A. */
    action_t letter = mk(ACTION_TYPE_KEYCODE, 0, HID_A);
    ASSERT(action_fire(&letter, true));
    /* A tap is down then up, so records 1 and 2; record 1 is the shifted A. */
    ASSERT_EQ(R[1].keys[0], HID_A);
    ASSERT_EQ(R[1].mods, MOD_LSFT); /* shift rode along */
    ASSERT_EQ(R[2].keys[0], 0);
    ASSERT_EQ(R[2].mods, MOD_LSFT); /* held through the release too */

    /* Second press of the sticky action unlatches. */
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(R[Rn - 1].mods, 0);
    ASSERT_EQ(R[Rn - 1].keys[0], 0);

    /* And now the same key must not be shifted. */
    ASSERT(action_fire(&letter, true));
    ASSERT_EQ(R[Rn - 2].keys[0], HID_A);
    ASSERT_EQ(R[Rn - 2].mods, 0);
}

static void test_keycode_carries_modifiers_in_the_high_byte(void) {
    g_current = __func__;
    reset_recording();
    /* Ctrl+C in one slot: code = (MOD_LCTL << 8) | HID_C. This is how the app
     * uploads every shortcut that is not a bare key. */
    action_t a = mk(ACTION_TYPE_KEYCODE, 0, (uint16_t)((MOD_LCTL << 8) | HID_C));
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(Rn, 2);
    ASSERT_EQ(R[0].keys[0], HID_C);
    ASSERT_EQ(R[0].mods, MOD_LCTL); /* the modifier rides in the report */
    ASSERT_EQ(R[1].keys[0], 0);
    ASSERT_EQ(R[1].mods, 0);         /* and is released with the key */

    /* A plain keycode still has a zero high byte, so nothing changes for the
     * bindings that were already on the pad. */
    action_t plain = mk(ACTION_TYPE_KEYCODE, 0, HID_A);
    ASSERT(action_fire(&plain, true));
    ASSERT_EQ(R[Rn - 2].keys[0], HID_A);
    ASSERT_EQ(R[Rn - 2].mods, 0);

    /* Shift+Ctrl+S: two modifiers, one key. */
    reset_recording();
    action_t three = mk(ACTION_TYPE_KEYCODE, 0,
                        (uint16_t)(((MOD_LSFT | MOD_LCTL) << 8) | HID_S));
    ASSERT(action_fire(&three, true));
    ASSERT_EQ(R[0].mods, (uint8_t)(MOD_LSFT | MOD_LCTL));
    ASSERT_EQ(R[0].keys[0], HID_S);

    /* Hold-down keeps the modifier on the down half and clears it on release. */
    reset_recording();
    action_t held = mk(ACTION_TYPE_KEYCODE, ACTION_FLAG_HOLD_DOWN,
                       (uint16_t)((MOD_LALT << 8) | HID_TAB));
    ASSERT(action_fire(&held, true));
    ASSERT_EQ(R[0].mods, MOD_LALT);
    ASSERT(action_fire(&held, false));
    ASSERT_EQ(R[Rn - 1].mods, 0);
}

static void test_media_action_uses_the_consumer_report(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_MEDIA, 0, MEDIA_VOLUME_UP);
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(count_kind(REC_CONSUMER), 2);
    ASSERT_EQ(R[0].usage, MEDIA_VOLUME_UP);
    ASSERT_EQ(R[1].usage, 0); /* released */
    ASSERT_EQ(count_kind(REC_KBD), 0); /* and never touches the keyboard report */
}

static void test_text_types_every_character_with_a_gap(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_TEXT, 0, 0);
    strcpy(a.text, "Hi!");
    ASSERT(action_fire(&a, true));

    /* 'H' needs shift, 'i' does not, '!' needs shift+1. */
    ASSERT_EQ(count_down(HID_H), 1);
    ASSERT_EQ(count_down(HID_I), 1);
    ASSERT_EQ(count_down(HID_1), 1);
    /* Each character: down, up, delay = 3 records. */
    ASSERT_EQ(count_kind(REC_DELAY), 3);
    for (int i = 0; i < Rn; i++) {
        if (R[i].kind == REC_DELAY) ASSERT_EQ(R[i].ms, ACTION_TEXT_CHAR_GAP_MS);
    }
    /* Shift must be present on the H and the 1, absent on the i. */
    bool saw_shift_h = false, saw_plain_i = false;
    for (int i = 0; i < Rn; i++) {
        if (R[i].kind != REC_KBD) continue;
        if (R[i].keys[0] == HID_H && (R[i].mods & MOD_LSFT)) saw_shift_h = true;
        if (R[i].keys[0] == HID_I && R[i].mods == 0) saw_plain_i = true;
    }
    ASSERT(saw_shift_h);
    ASSERT(saw_plain_i);
}

static void test_text_skips_untypeable_characters(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_TEXT, 0, 0);
    strcpy(a.text, "a\x01" "b"); /* 0x01 has no US-layout key */
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(count_down(HID_A), 1);
    ASSERT_EQ(count_down(HID_B), 1);
    ASSERT_EQ(count_kind(REC_DELAY), 2); /* the skipped char produced nothing */
}

static void test_webhook_emits_event_and_no_hid(void) {
    g_current = __func__;
    reset_recording();
    action_t a = mk(ACTION_TYPE_WEBHOOK, 0, 0);
    strcpy(a.text, "scene:cam");
    ASSERT(action_fire(&a, true));
    ASSERT_EQ(count_kind(REC_EVENT), 1);
    ASSERT_STR_EQ(R[0].text, "scene:cam");
    ASSERT_EQ(count_kind(REC_KBD), 0); /* the pad does not type its own webhook */
}

static void test_char_to_usage_matches_us_layout(void) {
    g_current = __func__;
    uint8_t mods;
    ASSERT_EQ(action_char_to_usage('a', &mods), HID_A);
    ASSERT_EQ(mods, 0);
    ASSERT_EQ(action_char_to_usage('A', &mods), HID_A);
    ASSERT_EQ(mods, MOD_LSFT);
    ASSERT_EQ(action_char_to_usage('0', &mods), HID_0);
    ASSERT_EQ(action_char_to_usage('9', &mods), HID_9);
    ASSERT_EQ(action_char_to_usage(' ', &mods), HID_SPACE);
    ASSERT_EQ(action_char_to_usage('\n', &mods), HID_ENTER);
    ASSERT_EQ(action_char_to_usage('?', &mods), HID_SLASH);
    ASSERT_EQ(mods, MOD_LSFT);
    ASSERT_EQ(action_char_to_usage('@', &mods), HID_2);
    ASSERT_EQ(action_char_to_usage('\x7f', &mods), 0); /* untypeable */
}

static void test_release_all_clears_a_stuck_modifier(void) {
    g_current = __func__;
    reset_recording();
    action_t held = mk(ACTION_TYPE_KEYCODE, ACTION_FLAG_HOLD_DOWN, HID_LEFT);
    action_fire(&held, true); /* down, never released */
    action_t sticky = mk(ACTION_TYPE_MODS, ACTION_FLAG_STICKY, MOD_LCTL);
    action_fire(&sticky, true);
    int before = Rn;
    action_release_all();
    ASSERT(Rn > before);
    /* The last report must be an all-clear. */
    ASSERT_EQ(R[Rn - 1].kind, REC_KBD);
    ASSERT_EQ(R[Rn - 1].mods, 0);
    ASSERT_EQ(R[Rn - 1].keys[0], 0);
    /* The latch is gone, not just masked: a later key must be unmodified. */
    action_t letter = mk(ACTION_TYPE_KEYCODE, 0, HID_B);
    action_fire(&letter, true);
    ASSERT_EQ(R[Rn - 2].mods, 0);
    /* And a second release_all must not spam more reports. */
    int after = Rn;
    action_release_all();
    ASSERT_EQ(Rn, after);
}

static void test_from_cfg_copies_and_terminates_text(void) {
    g_current = __func__;
    cfg_action_t c;
    memset(&c, 0, sizeof(c));
    c.type = ACTION_TYPE_TEXT;
    c.flags = ACTION_FLAG_REPEAT;
    c.code = 0;
    memset(c.text, 'x', CFG_TEXT_MAX); /* deliberately unterminated */

    action_t a;
    action_from_cfg(&c, &a);
    ASSERT_EQ(a.type, ACTION_TYPE_TEXT);
    ASSERT_EQ(a.flags, ACTION_FLAG_REPEAT);
    ASSERT_EQ(a.text[CFG_TEXT_MAX - 1], '\0'); /* forced termination */
    ASSERT_EQ((int)strlen(a.text), CFG_TEXT_MAX - 1);
}

/* ---- channel resolution ------------------------------------------------ */

static void test_action_for_gesture_reads_the_active_channel(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    cfg_blob_t *m = config_mutable();
    m->channels[0].keys[1].type = ACTION_TYPE_KEYCODE;
    m->channels[0].keys[1].code = HID_A;
    m->channels[1].keys[1].type = ACTION_TYPE_KEYCODE;
    m->channels[1].keys[1].code = HID_B;
    m->channels[2].keys[1].type = ACTION_TYPE_KEYCODE;
    m->channels[2].keys[1].code = HID_C;
    m->channels[3].keys[1].type = ACTION_TYPE_KEYCODE;
    m->channels[3].keys[1].code = HID_D;
    config_reseal(m);

    channel_set(0);
    ASSERT_EQ(channel_active(), 0);
    ASSERT_EQ(action_for_gesture(GESTURE_TAP, 1)->code, HID_A);

    channel_set(1);
    ASSERT_EQ(action_for_gesture(GESTURE_TAP, 1)->code, HID_B);

    channel_next();
    ASSERT_EQ(channel_active(), 2);
    ASSERT_EQ(action_for_gesture(GESTURE_TAP, 1)->code, HID_C);

    channel_next();
    ASSERT_EQ(channel_active(), 3);
    ASSERT_EQ(action_for_gesture(GESTURE_TAP, 1)->code, HID_D);

    channel_next(); /* wraps at four */
    ASSERT_EQ(channel_active(), 0);
    ASSERT_EQ(action_for_gesture(GESTURE_TAP, 1)->code, HID_A);

    channel_prev(); /* and wraps backwards */
    ASSERT_EQ(channel_active(), 3);
}

static void test_knob_gestures_map_to_the_right_slots(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    const cfg_channel_t *ch = &config_get()->channels[channel_active()];
    ASSERT(action_for_gesture(GESTURE_ROTATE_CW, GESTURE_INDEX_KNOB) == &ch->knob_cw);
    ASSERT(action_for_gesture(GESTURE_ROTATE_CCW, GESTURE_INDEX_KNOB) == &ch->knob_ccw);
    ASSERT(action_for_gesture(GESTURE_KNOB_TAP, GESTURE_INDEX_KNOB) == &ch->knob_tap);
    ASSERT(action_for_gesture(GESTURE_KNOB_HOLD, GESTURE_INDEX_KNOB) == &ch->knob_hold);
    ASSERT(action_for_gesture(GESTURE_KNOB_RELEASE, GESTURE_INDEX_KNOB) == NULL);
    ASSERT(action_for_gesture(GESTURE_TAP, 9) == NULL); /* key index out of range */
}

static void test_channel_switch_releases_held_keys(void) {
    g_current = __func__;
    reset_recording();
    storage_host_reset();
    storage_init();
    events_init();

    action_t held = mk(ACTION_TYPE_KEYCODE, ACTION_FLAG_HOLD_DOWN, HID_LEFT);
    action_fire(&held, true);
    ASSERT_EQ(count_up(), 0);

    channel_set(1);
    /* Switching page with a key held must release it, or the new page inherits
     * a phantom held arrow key. */
    ASSERT_EQ(count_up(), 1);
}

static void test_event_ring_drops_oldest_when_full(void) {
    g_current = __func__;
    events_init();
    events_enable(true);
    for (int i = 0; i < EVENT_RING_SIZE + 10; i++) {
        events_push(EV_SOURCE_KEY, (uint8_t)(i % 9), EV_TAP, 0, 0, ACTION_TYPE_KEYCODE);
    }
    ASSERT_EQ(events_pending(), EVENT_RING_SIZE);
    ASSERT(events_overrun() >= 10);
    key_event_t e;
    ASSERT(events_pop(&e));
    /* The surviving events are the NEWEST ones, which is what a host that comes
     * back late actually wants. */
    ASSERT_EQ(e.index, (uint8_t)(((EVENT_RING_SIZE + 10) - EVENT_RING_SIZE) % 9));
}

static void test_events_disabled_push_nothing(void) {
    g_current = __func__;
    events_init();
    events_enable(false);
    events_push(EV_SOURCE_KEY, 0, EV_TAP, 0, 0, 0);
    ASSERT_EQ(events_pending(), 0);
    events_enable(true);
    events_push(EV_SOURCE_KEY, 0, EV_TAP, 0, 0, 0);
    ASSERT_EQ(events_pending(), 1);
}

const test_case_t actions_tests[] = {
    {"empty_action_does_nothing", test_empty_action_does_nothing},
    {"keycode_tap_sends_down_then_up", test_keycode_tap_sends_down_then_up},
    {"keycode_carries_modifiers_in_the_high_byte", test_keycode_carries_modifiers_in_the_high_byte},
    {"hold_down_flag_defers_release", test_hold_down_flag_defers_release},
    {"on_release_flag_ignores_the_press", test_on_release_flag_ignores_the_press},
    {"sticky_toggles_on_second_press", test_sticky_toggles_on_second_press},
    {"media_action_uses_the_consumer_report", test_media_action_uses_the_consumer_report},
    {"text_types_every_character_with_a_gap", test_text_types_every_character_with_a_gap},
    {"text_skips_untypeable_characters", test_text_skips_untypeable_characters},
    {"webhook_emits_event_and_no_hid", test_webhook_emits_event_and_no_hid},
    {"char_to_usage_matches_us_layout", test_char_to_usage_matches_us_layout},
    {"release_all_clears_a_stuck_modifier", test_release_all_clears_a_stuck_modifier},
    {"from_cfg_copies_and_terminates_text", test_from_cfg_copies_and_terminates_text},
    {"action_for_gesture_reads_the_active_channel", test_action_for_gesture_reads_the_active_channel},
    {"knob_gestures_map_to_the_right_slots", test_knob_gestures_map_to_the_right_slots},
    {"channel_switch_releases_held_keys", test_channel_switch_releases_held_keys},
    {"event_ring_drops_oldest_when_full", test_event_ring_drops_oldest_when_full},
    {"events_disabled_push_nothing", test_events_disabled_push_nothing},
    {NULL, NULL},
};
