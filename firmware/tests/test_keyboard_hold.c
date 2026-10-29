/* Exercise the production scan -> gesture -> dispatcher -> HID-report path. */
#include "test_runner.h"
#include "actions.h"
#include "channel.h"
#include "config.h"
#include "dispatch.h"
#include "events.h"
#include "gesture.h"
#include "storage.h"
#include <string.h>

typedef struct { uint8_t mods, keys[6]; } report_t;
static report_t reports[128];
static int report_count;
static gesture_engine_t engine;
static gesture_queue_t queue;
static uint32_t epoch;
extern void dispatch_set_engine(gesture_engine_t *e);
static void record(uint8_t mods, const uint8_t keys[6]) {
    if (report_count >= 128) return;
    reports[report_count].mods = mods;
    memcpy(reports[report_count++].keys, keys, 6);
}
static const action_backend_t backend = { .hid_send_keyboard = record };
static void tick(uint16_t mask, bool mounted, uint32_t now) {
    gesture_input_t in = { .key_down_mask = mask, .enc_a = 1, .enc_b = 1 };
    dispatch_keyboard_sample(mask, mounted, epoch);
    gesture_process(&engine, &in, now, &queue);
    dispatch_run(&queue, now);
}
static void setup(void) {
    storage_init();
    cfg_blob_t *cfg = config_mutable();
    config_defaults(cfg);
    for (int c = 0; c < CFG_CHANNEL_COUNT; c++)
        memset(cfg->channels[c].keys, 0, sizeof(cfg->channels[c].keys));
    channel_set(0);
    action_set_backend(&backend);
    action_reset_state();
    report_count = 0; memset(reports, 0, sizeof(reports));
    events_init(); events_enable(true);
    gesture_init(&engine, &cfg->global);
    dispatch_set_engine(&engine);
    epoch = 0;
    gesture_queue_init(&queue);
    dispatch_init();
    tick(0, true, 0);
}
static void key(int layer, int i, uint16_t code) {
    cfg_action_t *a = &config_mutable()->channels[layer].keys[i];
    a->type = ACTION_TYPE_KEYCODE; a->flags = 0; a->code = code;
}
static int has(int report, uint8_t code) {
    for (int i = 0; i < 6; i++) if (reports[report].keys[i] == code) return 1;
    return 0;
}
static void test_press_hold_release(void) {
    setup(); key(3, 0, HID_A); channel_set(3); report_count = 0;
    tick(1, true, 10);
    ASSERT_EQ(report_count, 1); ASSERT(has(0, HID_A));
    tick(1, true, 400); tick(1, true, 1200);
    ASSERT_EQ(report_count, 1); /* remains held; OS controls typematic repeat */
    tick(0, true, 1201);
    ASSERT_EQ(report_count, 2); ASSERT(!has(1, HID_A));
    tick(0, true, 1800); ASSERT_EQ(report_count, 2); /* no gesture duplicate */
    key_event_t event;
    while (events_pop(&event)) if (event.index == 0 && event.source == EV_SOURCE_KEY)
        ASSERT_EQ(event.action, ACTION_TYPE_KEYCODE);
}
static void test_tap_and_sequential_chord(void) {
    setup(); key(0, 0, HID_A); key(0, 1, ((uint16_t)MOD_LCTL << 8) | HID_C);
    tick(1, true, 10); tick(3, true, 15);
    ASSERT_EQ(report_count, 2); ASSERT(has(1, HID_A)); ASSERT(has(1, HID_C)); ASSERT_EQ(reports[1].mods, MOD_LCTL);
    tick(1, true, 20);
    ASSERT_EQ(report_count, 3); ASSERT(has(2, HID_A)); ASSERT(!has(2, HID_C)); ASSERT_EQ(reports[2].mods, 0);
    tick(0, true, 25);
    ASSERT_EQ(report_count, 4); ASSERT(!has(3, HID_A));
}
static void test_same_usage_and_modifier_sharing(void) {
    setup(); key(0, 0, ((uint16_t)MOD_LCTL << 8) | HID_A);
    key(0, 1, ((uint16_t)MOD_LCTL << 8) | HID_A);
    tick(1, true, 1); tick(3, true, 2); tick(2, true, 3);
    ASSERT_EQ(report_count, 3); ASSERT(has(2, HID_A)); ASSERT_EQ(reports[2].mods, MOD_LCTL);
    tick(0, true, 4); ASSERT(!has(3, HID_A)); ASSERT_EQ(reports[3].mods, 0);
}
static void test_modifiers_and_double_tap_window(void) {
    setup();
    cfg_action_t *mod = &config_mutable()->channels[0].keys[0];
    mod->type = ACTION_TYPE_MODS; mod->code = MOD_LSFT;
    key(0, 1, HID_A);
    config_mutable()->global.double_tap_ms = 150;
    gesture_apply_config_from_live();
    tick(1, true, 10); ASSERT_EQ(reports[0].mods, MOD_LSFT);
    tick(3, true, 20); ASSERT(has(1, HID_A)); ASSERT_EQ(reports[1].mods, MOD_LSFT);
    tick(1, true, 30); ASSERT(!has(2, HID_A)); ASSERT_EQ(reports[2].mods, MOD_LSFT);
    tick(3, true, 50); ASSERT(has(3, HID_A));
    tick(1, true, 60); ASSERT(!has(4, HID_A));
    tick(0, true, 70); ASSERT_EQ(report_count, 6); ASSERT_EQ(reports[5].mods, 0);
    tick(0, true, 300); ASSERT_EQ(report_count, 6); /* no delayed duplicate */
}
static void test_six_key_rollover_recovery(void) {
    setup(); for (int i=0; i<7; i++) key(0, i, HID_A+i);
    tick(0x7f, true, 1); ASSERT_EQ(report_count, 7);
    for (int i=0; i<6; i++) ASSERT_EQ(reports[6].keys[i], 1);
    tick(0x3f, true, 2); ASSERT_EQ(report_count, 8);
    for (int i=0; i<6; i++) ASSERT(has(7, HID_A+i));
    tick(0, true, 3); ASSERT_EQ(report_count, 14);
    for (int i=0; i<6; i++) ASSERT_EQ(reports[13].keys[i], 0);
}
static void test_layer_change_and_config_cancel(void) {
    setup(); key(0, 0, HID_A); key(1, 0, HID_B);
    tick(1, true, 5); channel_set(1);
    ASSERT_EQ(report_count, 2); ASSERT(!has(1, HID_A));
    tick(1, true, 400); tick(0, true, 401);
    ASSERT_EQ(report_count, 2); /* don't fire B or replay held key */
    key_event_t e; while (events_pop(&e)) if (e.source == EV_SOURCE_KEY && e.index == 0) {
        ASSERT_EQ(e.action, ACTION_TYPE_KEYCODE); ASSERT_EQ(e.channel, 0);
    }
    tick(1, true, 500); ASSERT(has(2, HID_B));
    config_mutable()->channels[1].keys[0].code = HID_C;
    gesture_apply_config_from_live();
    ASSERT_EQ(report_count, 4); ASSERT(!has(3, HID_B));
    tick(1, true, 510); tick(0, true, 520); ASSERT_EQ(report_count, 4);
    tick(1, true, 530); ASSERT(has(4, HID_C)); tick(0, true, 540);
}
static void test_disconnect_requires_fresh_press(void) {
    setup(); key(0, 0, HID_A); tick(1, true, 1);
    tick(1, false, 2); ASSERT_EQ(report_count, 2); ASSERT(!has(1, HID_A));
    tick(1, true, 3); tick(1, true, 4); ASSERT_EQ(report_count, 2);
    tick(0, true, 5); ASSERT_EQ(report_count, 2);
    tick(1, true, 6); ASSERT_EQ(report_count, 3); ASSERT(has(2, HID_A));
    tick(0, true, 7); ASSERT_EQ(report_count, 4);
}
static void test_fast_reconnect_between_scans(void) {
    setup(); key(0, 0, HID_A); key(0, 1, HID_B);
    tick(1, true, 1);
    epoch += 2; /* suspend and resume before next scan; still mounted */
    tick(1, true, 2); ASSERT_EQ(report_count, 2); ASSERT(!has(1, HID_A));
    tick(3, true, 3); ASSERT_EQ(report_count, 3);
    ASSERT(has(2, HID_B)); ASSERT(!has(2, HID_A));
    tick(0, true, 4);
}
static void test_other_actions_preserve_held_key(void) {
    setup(); key(0, 0, HID_A); tick(1, true, 1);
    action_t shortcut = { .type = ACTION_TYPE_KEYCODE, .code = HID_B };
    action_fire(&shortcut, true);
    ASSERT_EQ(report_count, 3); ASSERT(has(1, HID_A)); ASSERT(has(1, HID_B));
    ASSERT(has(2, HID_A)); ASSERT(!has(2, HID_B));
    tick(0, true, 2); ASSERT_EQ(report_count, 4); ASSERT(!has(3, HID_A));
}
const test_case_t keyboard_hold_tests[] = {
    {"physical_press_hold_release", test_press_hold_release},
    {"tap_and_simultaneous_chord", test_tap_and_sequential_chord},
    {"duplicate_usage_and_modifier", test_same_usage_and_modifier_sharing},
    {"modifiers_and_double_tap_window", test_modifiers_and_double_tap_window},
    {"six_key_rollover_recovers", test_six_key_rollover_recovery},
    {"layer_and_config_release", test_layer_change_and_config_cancel},
    {"disconnect_requires_fresh_press", test_disconnect_requires_fresh_press},
    {"fast_reconnect_between_scans", test_fast_reconnect_between_scans},
    {"other_actions_preserve_held_key", test_other_actions_preserve_held_key},
    {NULL, NULL}
};
