/* Exercise the *production* TinyUSB HID path (no HID_DEV_NO_HW) against a
 * controllable fake for both endpoints. The fake copies accepted payloads and
 * only completes them when explicitly told to, so a permanently busy endpoint,
 * submission rejection and transfer failure can all be reproduced on a PC. */
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "actions.h"
#include "channel.h"
#include "config.h"
#include "events.h"
#include "hid_dev.h"
#include "tusb.h"

enum { KBD = 0, CONSUMER = 1, REPORT_LOG = 256 };
typedef struct {
    bool ready, in_flight;
    unsigned failures_left, attempts, accepted_n, complete_n;
    uint8_t current[9];
    uint16_t current_len;
    uint8_t accepted[REPORT_LOG][9];
    uint8_t complete[REPORT_LOG][9];
} fake_ep_t;
static fake_ep_t ep[2];
static bool mounted, auto_complete;
static unsigned boot_calls, sleeps, board_calls, usb_calls, tasks;

/* Link the real actions.c/channel.c into this target-branch test. The config and
 * event implementations are irrelevant to a channel-change release, so only
 * those external dependencies are inert test stubs. */
const cfg_blob_t *config_get(void) {
    static cfg_blob_t cfg;
    return &cfg;
}
void events_push(uint8_t source, uint8_t index, uint8_t event, uint8_t channel,
                 int16_t value, uint16_t action) {
    (void)source; (void)index; (void)event; (void)channel; (void)value; (void)action;
}
static void action_keyboard(uint8_t mods, const uint8_t keys[6]) {
    mpad_kbd_report_t report = {0};
    report.modifier = mods;
    memcpy(report.keycode, keys, 6);
    hid_dev_keyboard(&report);
}
static void action_consumer(uint16_t usage) { hid_dev_consumer(usage); }
static const action_backend_t ACTION_BACKEND = {
    .hid_send_keyboard = action_keyboard,
    .hid_send_consumer = action_consumer,
};

void board_init(void) { board_calls++; }
void tusb_init(void) { usb_calls++; }
void flash_get_unique_id(uint8_t *id) {
    for (unsigned i = 0; i < 8; i++) id[i] = (uint8_t)(i + 1);
}
void reset_usb_boot(uint32_t gpio_mask, uint32_t disable_mask) {
    assert(gpio_mask == 0 && disable_mask == 0);
    boot_calls++; /* the real BOOTSEL call never returns */
}
void sleep_ms(uint32_t delay_ms) {
    assert(delay_ms == 1);
    sleeps++;
}
bool tud_mounted(void) { return mounted; }
bool tud_hid_n_ready(uint8_t instance) {
    assert(instance < 2);
    return mounted && ep[instance].ready && !ep[instance].in_flight;
}
bool tud_hid_n_report(uint8_t instance, uint8_t report_id, const void *payload, uint16_t len) {
    assert(instance < 2 && payload);
    assert(report_id == (uint8_t)(instance + 1));
    assert(len == (instance == KBD ? sizeof(mpad_kbd_report_t) : sizeof(uint16_t)));
    fake_ep_t *e = &ep[instance];
    assert(e->ready && !e->in_flight && e->accepted_n < REPORT_LOG);
    e->attempts++;
    if (e->failures_left) { e->failures_left--; return false; }
    e->current[0] = report_id;
    memcpy(e->current + 1, payload, len); /* TinyUSB copies on acceptance */
    e->current_len = (uint16_t)(len + 1);
    memcpy(e->accepted[e->accepted_n++], e->current, e->current_len);
    e->in_flight = true;
    return true;
}

static void complete(uint8_t instance) {
    fake_ep_t *e = &ep[instance];
    assert(e->in_flight && e->complete_n < REPORT_LOG);
    memcpy(e->complete[e->complete_n++], e->current, e->current_len);
    e->in_flight = false;
    tud_hid_report_complete_cb(instance, e->current, e->current_len);
}
static void fail_input(uint8_t instance) {
    fake_ep_t *e = &ep[instance];
    assert(e->in_flight);
    e->in_flight = false;
    /* The xferred_bytes may be zero even though the attempted frame still
     * resides in TinyUSB's endpoint buffer. */
    tud_hid_report_failed_cb(instance, HID_REPORT_TYPE_INPUT, e->current, 0);
}
void tud_task(void) {
    tasks++;
    if (auto_complete) {
        for (uint8_t i = 0; i < 2; i++) if (ep[i].in_flight) complete(i);
    }
}

static mpad_kbd_report_t key(uint8_t modifier, uint8_t keycode) {
    mpad_kbd_report_t report = {0};
    report.modifier = modifier;
    report.keycode[0] = keycode;
    return report;
}
static uint8_t accepted_key(unsigned index) {
    assert(index < ep[KBD].accepted_n);
    return ep[KBD].accepted[index][3]; /* ID, modifier, reserved, first key */
}
static uint16_t accepted_usage(unsigned index) {
    assert(index < ep[CONSUMER].accepted_n);
    uint16_t usage;
    memcpy(&usage, ep[CONSUMER].accepted[index] + 1, sizeof(usage));
    return usage;
}
static void fresh(void) {
    memset(ep, 0, sizeof(ep));
    ep[KBD].ready = ep[CONSUMER].ready = true;
    mounted = false;
    auto_complete = false;
    boot_calls = sleeps = board_calls = usb_calls = tasks = 0;
    hid_dev_init();
    assert(board_calls == 1 && usb_calls == 1 && !hid_dev_mounted());
    mounted = true;
    tud_mount_cb();
    assert(hid_dev_mounted());
    assert(tud_hid_descriptor_report_cb(KBD) != tud_hid_descriptor_report_cb(CONSUMER));
}
static void settle_mount(void) {
    hid_dev_task();
    assert(ep[KBD].in_flight && ep[CONSUMER].in_flight);
    assert(accepted_key(0) == 0 && accepted_usage(0) == 0);
    complete(KBD);
    complete(CONSUMER);
}
static void check_get_report(uint8_t expected_key, uint16_t expected_usage) {
    uint8_t report[8] = {0xFF};
    assert(tud_hid_get_report_cb(KBD, 1, HID_REPORT_TYPE_INPUT, report, sizeof(report)) == 8);
    assert(report[2] == expected_key);
    uint8_t usage_buf[2];
    assert(tud_hid_get_report_cb(CONSUMER, 2, HID_REPORT_TYPE_INPUT,
                                  usage_buf, sizeof(usage_buf)) == 2);
    uint16_t usage;
    memcpy(&usage, usage_buf, sizeof(usage));
    assert(usage == expected_usage);
}

static void test_busy_independent_down_up(void) {
    fresh(); settle_mount();
    ep[KBD].ready = false;
    mpad_kbd_report_t down = key(0x02, 4), up = {0};
    hid_dev_keyboard(&down);
    hid_dev_keyboard(&up);
    hid_dev_consumer(0xE9); /* volume up */
    hid_dev_consumer(0);
    check_get_report(0, 0);
    for (unsigned i = 0; i < 30; i++) hid_dev_task();
    assert(ep[KBD].attempts == 1); /* only the mount zero was submitted */
    assert(ep[CONSUMER].in_flight && accepted_usage(1) == 0xE9);
    complete(CONSUMER);
    hid_dev_task();
    assert(accepted_usage(2) == 0);
    complete(CONSUMER);
    ep[KBD].ready = true;
    hid_dev_task();
    assert(accepted_key(1) == 4 && ep[KBD].current[1] == 0x02);
    for (unsigned i = 0; i < 30; i++) hid_dev_task();
    assert(ep[KBD].accepted_n == 2); /* up cannot overtake in-flight down */
    complete(KBD);
    hid_dev_task();
    assert(accepted_key(2) == 0 && ep[KBD].current[1] == 0);
    complete(KBD);
    for (unsigned i = 0; i < 20; i++) hid_dev_task();
    assert(ep[KBD].accepted_n == 3 && ep[CONSUMER].accepted_n == 3);
}

static void test_release_all_media_only_through_busy_usb(void) {
    fresh(); settle_mount();
    action_set_backend(&ACTION_BACKEND);
    action_reset_state();
    ep[CONSUMER].ready = false;
    action_t media_action = {.type = ACTION_TYPE_MEDIA, .flags = ACTION_FLAG_HOLD_DOWN,
                             .code = MEDIA_VOLUME_UP};
    assert(action_fire(&media_action, true));
    action_release_all();
    action_release_all(); /* a second release must not replay a media zero */
    for (unsigned i = 0; i < 30; i++) hid_dev_task();
    assert(ep[CONSUMER].accepted_n == 1 && ep[KBD].accepted_n == 1);
    ep[CONSUMER].ready = true;
    hid_dev_task();
    assert(accepted_usage(1) == MEDIA_VOLUME_UP);
    complete(CONSUMER);
    hid_dev_task();
    assert(accepted_usage(2) == 0);
    complete(CONSUMER);
    assert(ep[CONSUMER].accepted_n == 3 && ep[KBD].accepted_n == 1);
}

static void test_channel_switch_action_through_busy_usb(void) {
    fresh(); settle_mount();
    action_set_backend(&ACTION_BACKEND);
    action_reset_state();
    channel_set(0);
    ep[KBD].ready = ep[CONSUMER].ready = false;
    action_t key_action = {.type = ACTION_TYPE_KEYCODE, .flags = ACTION_FLAG_HOLD_DOWN,
                           .code = (uint16_t)((MOD_LCTL << 8) | HID_A)};
    action_t media_action = {.type = ACTION_TYPE_MEDIA, .flags = ACTION_FLAG_HOLD_DOWN,
                             .code = MEDIA_VOLUME_UP};
    assert(action_fire(&key_action, true));
    assert(action_fire(&media_action, true));
    channel_set(1); /* real action_release_all -> real HID FIFO -> fake USB */
    for (unsigned i = 0; i < 30; i++) hid_dev_task();
    assert(ep[KBD].accepted_n == 1 && ep[CONSUMER].accepted_n == 1);
    ep[KBD].ready = ep[CONSUMER].ready = true;
    hid_dev_task();
    assert(accepted_key(1) == HID_A && ep[KBD].current[1] == MOD_LCTL);
    assert(accepted_usage(1) == MEDIA_VOLUME_UP);
    complete(KBD); complete(CONSUMER);
    hid_dev_task();
    assert(accepted_key(2) == 0 && ep[KBD].current[1] == 0);
    assert(accepted_usage(2) == 0);
    complete(KBD); complete(CONSUMER);
    check_get_report(0, 0);
    assert(ep[KBD].accepted_n == 3 && ep[CONSUMER].accepted_n == 3);
}

static void test_rejected_submission_and_failed_transfer(void) {
    fresh(); settle_mount();
    mpad_kbd_report_t down = key(0, 5), up = {0};
    hid_dev_keyboard(&down);
    hid_dev_keyboard(&up);
    ep[KBD].failures_left = 5;
    for (unsigned i = 0; i < 5; i++) {
        hid_dev_task();
        assert(ep[KBD].accepted_n == 1 && !ep[KBD].in_flight);
    }
    hid_dev_task();
    assert(accepted_key(1) == 5);
    /* A failure of an unrelated HID OUTPUT transfer must not dequeue INPUT. */
    tud_hid_report_failed_cb(KBD, HID_REPORT_TYPE_OUTPUT, ep[KBD].current, 0);
    hid_dev_task();
    assert(ep[KBD].accepted_n == 2);
    fail_input(KBD);
    hid_dev_task();
    assert(accepted_key(2) == 5); /* failed down was retried, not lost */
    complete(KBD);
    hid_dev_task();
    assert(accepted_key(3) == 0); /* only now may the release go out */
    complete(KBD);
    assert(ep[KBD].complete_n == 3); /* mount zero, down, release */

    hid_dev_consumer(0xE9);
    hid_dev_consumer(0);
    ep[CONSUMER].failures_left = 3;
    for (unsigned i = 0; i < 3; i++) hid_dev_task();
    assert(ep[CONSUMER].accepted_n == 1);
    hid_dev_task();
    assert(accepted_usage(1) == 0xE9);
    fail_input(CONSUMER);
    hid_dev_task();
    assert(accepted_usage(2) == 0xE9);
    complete(CONSUMER);
    hid_dev_task();
    assert(accepted_usage(3) == 0); /* failed media down preceded media zero */
    complete(CONSUMER);
    assert(ep[CONSUMER].complete_n == 3);

    hid_dev_consumer(0xE9);
    hid_dev_consumer(0);
    hid_dev_task();
    assert(accepted_usage(4) == 0xE9);
    ep[CONSUMER].in_flight = false;
    tud_hid_report_complete_cb(CONSUMER, ep[CONSUMER].current, 1); /* short success */
    hid_dev_task();
    assert(accepted_usage(5) == 0xE9); /* not acknowledged prematurely */
    complete(CONSUMER);
    hid_dev_task();
    assert(accepted_usage(6) == 0);
    complete(CONSUMER);
}

static void test_overflow_preserves_release_and_inflight_head(void) {
    fresh(); settle_mount();
    mpad_kbd_report_t down = key(0, 4), up = {0};
    hid_dev_keyboard(&down);
    hid_dev_task();
    assert(ep[KBD].in_flight && accepted_key(1) == 4);
    ep[KBD].ready = false;
    for (unsigned i = 0; i < 95; i++) hid_dev_keyboard((i & 1) ? &up : &down);
    hid_dev_keyboard(&up); /* final state is up even after a full-queue collapse */
    for (unsigned i = 0; i < 30; i++) hid_dev_task();
    assert(ep[KBD].accepted_n == 2);
    complete(KBD); /* the original accepted down still owns the head */
    ep[KBD].ready = true;
    for (unsigned i = 0; i < 100; i++) {
        hid_dev_task();
        if (ep[KBD].in_flight) complete(KBD);
    }
    assert(ep[KBD].accepted_n > 2 && ep[KBD].accepted_n < 80);
    assert(accepted_key(2) == 0); /* neutral barrier immediately after in-flight */
    assert(accepted_key(ep[KBD].accepted_n - 1) == 0); /* final release */
    unsigned drained_kbd = ep[KBD].accepted_n;
    for (unsigned i = 0; i < 10; i++) hid_dev_task();
    assert(ep[KBD].accepted_n == drained_kbd);

    fresh(); settle_mount();
    hid_dev_consumer(0xE9);
    hid_dev_task(); /* volume-up is already accepted by the consumer endpoint */
    assert(ep[CONSUMER].in_flight && accepted_usage(1) == 0xE9);
    ep[CONSUMER].ready = false;
    for (unsigned i = 0; i < 42; i++) hid_dev_consumer((i & 1) ? 0 : 0xE9);
    hid_dev_consumer(0);
    complete(CONSUMER);
    ep[CONSUMER].ready = true;
    for (unsigned i = 0; i < 35; i++) {
        hid_dev_task();
        if (ep[CONSUMER].in_flight) complete(CONSUMER);
    }
    assert(accepted_usage(2) == 0); /* neutral barrier after in-flight volume-up */
    assert(accepted_usage(ep[CONSUMER].accepted_n - 1) == 0);
    assert(ep[CONSUMER].accepted_n < 42);

    /* An overload entirely before a transfer also starts with a zero barrier. */
    fresh(); settle_mount();
    ep[CONSUMER].ready = false;
    for (unsigned i = 0; i < 42; i++) hid_dev_consumer((i & 1) ? 0 : 0xE9);
    hid_dev_consumer(0);
    ep[CONSUMER].ready = true;
    hid_dev_task();
    assert(accepted_usage(1) == 0);
    for (unsigned i = 0; i < 35; i++) {
        if (ep[CONSUMER].in_flight) complete(CONSUMER);
        hid_dev_task();
    }
    assert(accepted_usage(ep[CONSUMER].accepted_n - 1) == 0);
    assert(ep[CONSUMER].accepted_n < 42);
}

static void test_disconnect_and_suspend_cancel_stale_downs(void) {
    fresh(); settle_mount();
    mpad_kbd_report_t down = key(0, 4), up = {0};
    hid_dev_keyboard(&down);
    hid_dev_keyboard(&up);
    hid_dev_consumer(0xE9);
    hid_dev_task();
    assert(ep[KBD].in_flight && ep[CONSUMER].in_flight);
    ep[KBD].in_flight = ep[CONSUMER].in_flight = false; /* physical unplug */
    mounted = false;
    tud_umount_cb();
    check_get_report(0, 0);
    hid_dev_keyboard(&down); /* offline presses do not replay on remount */
    hid_dev_consumer(0xE9);
    mounted = true;
    tud_mount_cb();
    hid_dev_task();
    assert(accepted_key(2) == 0 && accepted_usage(2) == 0);
    complete(KBD); complete(CONSUMER);
    hid_dev_keyboard(&down);
    hid_dev_consumer(0xE9);
    tud_suspend_cb(false);
    hid_dev_keyboard(&down);
    tud_resume_cb();
    hid_dev_task();
    assert(accepted_key(3) == 0 && accepted_usage(3) == 0);
    complete(KBD); complete(CONSUMER);
    assert(ep[KBD].accepted_n == 4 && ep[CONSUMER].accepted_n == 4);
}

static void test_bootloader_drains_zero_with_bounded_timeout(void) {
    fresh(); settle_mount();
    mpad_kbd_report_t down = key(0, 4), queued = key(0, 5);
    hid_dev_keyboard(&down);
    hid_dev_consumer(0xE9);
    hid_dev_task(); /* old downs are already in-flight */
    hid_dev_keyboard(&queued); /* queued press must not replay during BOOTSEL */
    hid_dev_consumer(0xEA);
    auto_complete = true;
    hid_dev_enter_bootloader();
    assert(boot_calls == 1 && sleeps < 100);
    assert(accepted_key(ep[KBD].accepted_n - 1) == 0);
    assert(accepted_usage(ep[CONSUMER].accepted_n - 1) == 0);
    for (unsigned i = 0; i < ep[KBD].accepted_n; i++) assert(accepted_key(i) != 5);
    for (unsigned i = 0; i < ep[CONSUMER].accepted_n; i++) assert(accepted_usage(i) != 0xEA);

    fresh(); settle_mount();
    ep[KBD].ready = ep[CONSUMER].ready = false;
    hid_dev_keyboard(&down);
    hid_dev_consumer(0xE9);
    hid_dev_enter_bootloader();
    assert(boot_calls == 1 && sleeps == 100); /* never wait forever on host */
    assert(ep[KBD].accepted_n == 1 && ep[CONSUMER].accepted_n == 1);
}

int main(void) {
    test_busy_independent_down_up();
    test_release_all_media_only_through_busy_usb();
    test_channel_switch_action_through_busy_usb();
    test_rejected_submission_and_failed_transfer();
    test_overflow_preserves_release_and_inflight_head();
    test_disconnect_and_suspend_cancel_stale_downs();
    test_bootloader_drains_zero_with_bounded_timeout();
    puts("HID target-branch busy/retry/release/overflow/boot tests passed");
    return 0;
}
