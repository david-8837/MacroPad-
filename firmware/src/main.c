/*
 * main.c — the whole firmware, top to bottom.
 *
 * Superloop, no RTOS. Reason: there are five things to do and one core, and an
 * RTOS would add a scheduler, stack sizing, and a class of bug (priority
 * inversion on the flash write) in exchange for nothing. Everything here is
 * sub-millisecond except the flash erase, which is documented in flash_store.c.
 *
 * Task budget at 133 MHz (BOARD_SYS_CLOCK_KHZ):
 *   scan + debounce      ~3 us   every 1 ms
 *   gesture engine       ~5 us   every 1 ms
 *   dispatch             ~10 us  only when a gesture resolves
 *   LED frame compute    ~25 us  every 16 ms (60 Hz)
 *   USB pump             ~20 us  every loop, dominated by tud_task
 *   flash commit         ~50 ms  only on save
 * Idle CPU load is well under 5%. If you later add the OLED, that is the thing
 * that will eat the budget — I2C at 400 kHz for a 128x32 frame is ~1.5 ms, so
 * render it at 10 Hz, not 60.
 */
#include <stdio.h>
#include <string.h>

#include "hardware/clocks.h"
#include "pico/stdlib.h"

#include "actions.h"
#include "board.h"
#include "channel.h"
#include "config.h"
#include "dispatch.h"
#include "events.h"
#include "gesture.h"
#include "hid_dev.h"
#include "leds.h"
#include "oled_playlist.h"
#include "protocol.h"
#include "scan.h"
#include "storage.h"
#include "usb_proto.h"

#ifndef FW_BUILD
#define FW_BUILD 1
#endif

static scan_state_t s_scan;
static gesture_engine_t s_gesture;
static gesture_queue_t s_queue;
static led_engine_t s_led;
static led_frame_t s_frame;

static uint32_t s_next_scan_ms;
static uint32_t s_next_led_ms;
static uint32_t s_last_activity_ms;

extern gesture_engine_t *dispatch_engine(void);
extern void dispatch_set_engine(gesture_engine_t *e);
extern void channel_apply_boot(const cfg_blob_t *cfg);
extern void led_host_test_clear(void);

/* ---- action backend: route everything into the real USB HID ------------- */
static void be_keyboard(uint8_t mods, const uint8_t keys[6]) {
    mpad_kbd_report_t r;
    memset(&r, 0, sizeof(r));
    r.modifier = mods;
    r.reserved = 0;
    memcpy(r.keycode, keys, HID_KEY_MAX);
    hid_dev_keyboard(&r);
}

static void be_consumer(uint16_t usage) { hid_dev_consumer(usage); }

static void be_event(uint8_t kind, uint8_t channel, const char *payload) {
    /* A WEBHOOK action becomes an event on the CDC stream. The device has no
     * network stack and should not grow one: TLS alone would be 40 kB of flash
     * and a heap. The app does the HTTP; the pad just says what happened. */
    (void)payload;
    events_push(EV_SOURCE_KEY, 0, kind, channel, 0, ACTION_TYPE_WEBHOOK);
}

static void be_bootloader(void) { hid_dev_enter_bootloader(); }

static void be_reset_config(void) { (void)storage_reset(); }

static void be_delay(uint32_t ms) { busy_wait_ms(ms); }

static const action_backend_t s_backend = {
    .hid_send_keyboard = be_keyboard,
    .hid_send_consumer = be_consumer,
    .emit_event = be_event,
    .request_bootloader = be_bootloader,
    .request_config_reset = be_reset_config,
    .delay_ms = be_delay,
    .user = NULL,
};

/* ---- gesture callback: does this key's hold action repeat? -------------- */
static bool cb_hold_repeatable(void *user, uint8_t key_index) {
    (void)user;
    return channel_hold_is_repeatable(key_index);
}

static const gesture_callbacks_t s_gesture_cb = {
    .hold_is_repeatable = cb_hold_repeatable,
    .user = NULL,
};

/* ---- LED brightness with idle dimming ---------------------------------- */
/* Ramps down after CFG_IDLE_DIM_MS of no input, ramps back up instantly on any
 * gesture. The instant wake-up matters: a pad that takes 3 seconds to become
 * visible feels broken at 2am. */
static uint8_t idle_brightness(uint32_t now_ms) {
    if (CFG_IDLE_DIM_MS == 0) return 255; /* feature disabled */
    uint32_t idle = now_ms - s_last_activity_ms;
    if (idle < CFG_IDLE_DIM_MS) return 255;

    uint32_t over = idle - CFG_IDLE_DIM_MS;
    if (over >= CFG_IDLE_FADE_MS) return CFG_IDLE_BRIGHTNESS;
    /* Linear interpolation from full to idle brightness. */
    uint32_t span = 255u - CFG_IDLE_BRIGHTNESS;
    return (uint8_t)(255u - (span * over) / CFG_IDLE_FADE_MS);
}

int main(void) {
    /* 133 MHz is the RP2040 maximum and the SDK default. Set explicitly anyway:
     * the PIO clock divider in leds.c is computed from clock_get_hz(), so a
     * silent change of system clock would move the LED bit timing out of the
     * SK6812MINI-E spec without anything else appearing to break. */
    set_sys_clock_khz(BOARD_SYS_CLOCK_KHZ, true);

    /* DO NOT call stdio_init_all(). The pico-sdk's stdio_usb spins up its own
     * TinyUSB device with its own CDC interface, which collides with ours: the
     * host would see two serial ports and your app would open the wrong one, or
     * both stacks would fight over the same USB hardware and enumeration would
     * fail.
     *
     * If you want debug output, define MPAD_DEBUG_UART and point stdio_uart at
     * UART1 on GP4 (TX) / GP5 (RX) — header pins 19 and 18, both spare in this pin
     * map, and still free with the OLED fitted since the OLED is on I2C0 at
     * GP28/GP29. UART0 would be the natural choice but GP0 and GP1 are keys K0 and
     * K1 here, so it is not available without re-pinning the keypad. */
#ifndef MPAD_DEBUG_UART
#define stdio_init_all() ((void)0)
#endif

    /* Config first: everything else reads from it. */
    bool had_config = storage_init();
    const cfg_blob_t *cfg = config_get();

    /* Hardware */
    scan_hw_init();
    scan_hw_init_encoder();
    scan_init(&s_scan);
    led_hw_init();
    hid_dev_init();
    action_set_backend(&s_backend);

    /* State machines */
    events_init();
    events_enable(cfg->global.usb_report_events != 0);
    gesture_init(&s_gesture, &cfg->global);
    gesture_queue_init(&s_queue);
    led_engine_init(&s_led);
    dispatch_set_engine(&s_gesture);
    dispatch_init();
    usb_proto_init();
    usb_proto_set_build(FW_BUILD);
    /* The panel is not a touchscreen: it starts on the saved screen and moves
     * on when cfg_global_t.oled_auto_cycle_s elapses, or when a gesture bound to
     * ACTION_TYPE_OLED_NEXT / the host's OLED:NEXT asks it to. */
    oled_playlist_init(OLED_SCREEN_KADOWAZ, 0);

    uint32_t now = time_us_64() / 1000u;
    s_next_scan_ms = now;
    s_next_led_ms = now;
    s_last_activity_ms = now;

    (void)had_config; /* reported to the host via CMD_GET_INFO diagnostics */

    /* First frame immediately so the pad is lit before USB enumerates. A dark
     * pad for the 1-2 s of enumeration reads as "it's broken". */
    for (;;) {
        now = (uint32_t)(time_us_64() / 1000u);

        /* ---- 1 ms: scan, debounce, gestures, dispatch ---- */
        if ((int32_t)(now - s_next_scan_ms) >= 0) {
            s_next_scan_ms += CFG_SCAN_PERIOD_MS;
            /* Catch up rather than spiral: if we were delayed (flash write),
             * clamp so we do not then run 50 scans back to back. */
            if ((int32_t)(now - s_next_scan_ms) > 100) s_next_scan_ms = now;

            uint16_t raw = scan_read_raw();
            scan_update(&s_scan, raw);

            gesture_input_t in;
            memset(&in, 0, sizeof(in));
            in.key_down_mask = s_scan.stable;
            in.enc_a = scan_read_encoder_a();
            in.enc_b = scan_read_encoder_b();
            in.enc_sw_down = scan_read_encoder_sw_down();

            uint32_t before = s_queue.count;
            gesture_process_cb(&s_gesture, &in, now, &s_queue, &s_gesture_cb);
            int handled = dispatch_run(&s_queue, now);
            if (handled || s_queue.count != before) s_last_activity_ms = now;
            if (s_scan.stable) s_last_activity_ms = now; /* keys held count too */
        }

        /* ---- LED frame ---- */
        if ((int32_t)(now - s_next_led_ms) >= 0) {
            s_next_led_ms += (1000u / CFG_LED_FRAME_HZ);
            if ((int32_t)(now - s_next_led_ms) > 100) s_next_led_ms = now;

            if (led_host_test_active()) {
                /* A raw wiring test is running: do not overwrite it. */
            } else {
                led_state_t st;
                memset(&st, 0, sizeof(st));
                st.key_down_mask = s_scan.stable;
                st.key_hit_mask = dispatch_hit_mask();
                st.channel = channel_active();
                st.now_ms = now;
                st.master_brightness = 255;
                st.idle_override = idle_brightness(now);
                led_compute_frame(&s_led, &config_get()->channels[channel_active()].lighting, &st,
                                  &s_frame);
                led_hw_show(&s_frame);
                dispatch_clear_hit_mask();
            }
        }

        /* ---- OLED rotation ---- */
        /* Cheap enough to poll every pass: one comparison, and only a switch
         * costs anything (a frame blit, and that only with a panel fitted). */
        if (oled_playlist_tick(now)) {
            /* A switch is input-like: a keypress on the new screen should not
             * be swapped out from under the user. */
            oled_playlist_touch(now);
        }

        /* ---- USB ---- */
        hid_dev_task();
        usb_proto_pump(now);

        /* Keep the event-enable flag in sync with config (the app can change it
         * through SET_CONFIG). */
        events_enable(config_get()->global.usb_report_events != 0);
    }
    return 0;
}
