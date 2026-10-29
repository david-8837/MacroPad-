/*
 * main.c — the whole firmware, top to bottom.
 *
 * Superloop, no RTOS. The required OLED adds a bounded ~12 ms full-frame I2C
 * transfer at 400 kHz (512 data bytes + control/addressing), not 1.5 ms.
 * Frames run at the baked animation's 6..15 fps or 5 fps for live screens;
 * input scanning, HID and USB are still serviced between frames. A stuck I2C
 * bus times out rather than permanently blocking keys. Flash erase on save is
 * a separate, much longer documented pause in flash_store.c.
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
#include "oled.h"
#include "oled_playlist.h"
#include "oled_runtime.h"
#include "oled_stream.h"
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
static oled_canvas_t s_oled;

static uint32_t s_next_scan_ms;
static uint32_t s_next_led_ms;
static uint32_t s_next_oled_ms;
static uint32_t s_next_oled_probe_ms;
static uint32_t s_last_activity_ms;
static uint32_t s_layer_overlay_until_ms;
static uint8_t s_last_oled_mode = 0xFF;
static uint8_t s_last_channel;
static uint8_t s_applied_contrast, s_applied_inverted;
static bool s_oled_settings_applied;

extern gesture_engine_t *dispatch_engine(void);
extern void dispatch_set_engine(gesture_engine_t *e);
extern void channel_apply_boot(const cfg_blob_t *cfg);
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
    /* The OLED is part of this pad, not an optional PC-only preview. A missing
     * module does not brick the keyboard: it is retried and CAP_OLED stays off
     * until the SSD1306 actually ACKs at 0x3C. */
    (void)oled_hw_init();
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
    oled_playlist_set_listener(usb_proto_oled_mode_changed);
    /* Not a touchscreen: show the saved boot screen; rotate via the saved
     * playlist/timer, a bound OLED_NEXT gesture, or host SET_OLED_MODE. */
    uint32_t now = (uint32_t)(time_us_64() / 1000u);
    oled_playlist_init(cfg->global.oled_boot_mode, now);

    s_next_scan_ms = now;
    s_next_led_ms = now;
    s_next_oled_ms = now;
    s_next_oled_probe_ms = now + 2000u;
    s_last_channel = channel_active();
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

            if (led_host_test_active(now)) {
                /* Bench-only raw pattern is briefly visible; when its bounded
                 * timer expires, the next engine frame restores the mode. */
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

        /* ---- OLED: autonomous art, PC live pixels or truthful offline UI ---- */
        (void)oled_playlist_tick(now);
        const uint8_t active_channel = channel_active();
        if (active_channel != s_last_channel) {
            s_last_channel = active_channel;
            s_layer_overlay_until_ms = now + 1400u;
            s_next_oled_ms = now; /* feedback immediately on a hardware gesture */
        }
        const uint8_t mode = oled_playlist_current();
        if (mode != s_last_oled_mode) {
            s_last_oled_mode = mode;
            s_next_oled_ms = now;
            oled_playlist_touch(now); /* full dwell after a manual switch */
        }
        if (!oled_hw_present() && (int32_t)(now - s_next_oled_probe_ms) >= 0) {
            s_next_oled_probe_ms = now + 2000u;
            if (oled_hw_init()) {
                s_next_oled_ms = now;
                s_oled_settings_applied = false; /* init resets the SSD1306 */
            }
        }
        if (oled_hw_present()) {
            const cfg_global_t *g = &config_get()->global;
            if (!s_oled_settings_applied || g->oled_contrast != s_applied_contrast ||
                g->oled_inverted != s_applied_inverted) {
                oled_set_contrast(g->oled_contrast);
                if (oled_hw_present()) oled_set_inverted(g->oled_inverted);
                if (oled_hw_present()) {
                    s_applied_contrast = g->oled_contrast;
                    s_applied_inverted = g->oled_inverted;
                    s_oled_settings_applied = true;
                }
            }
        }

        /* ---- USB ---- */
        hid_dev_task();
        usb_proto_pump(now);
        events_enable(config_get()->global.usb_report_events != 0);

        if (oled_hw_present() && (int32_t)(now - s_next_oled_ms) >= 0) {
            const oled_anim_t *anim = oled_anim_for(mode);
            /* Complete frames alone are visible. The layer overlay temporarily
             * wins, but the stream is not torn down; it resumes when the overlay
             * ends. Baked art is ALWAYS played locally (even with a PC open). */
            const uint8_t *live = anim ? NULL : oled_stream_frame(mode, now);
            uint32_t period_ms = anim ? 1000u / anim->fps : 200u; /* runtime cap: 5 Hz */
            if (period_ms < 60u) period_ms = 60u; /* cap I2C duty cycle */
            s_next_oled_ms = now + period_ms;
            if ((int32_t)(s_layer_overlay_until_ms - now) > 0) {
                oled_render_layer_overlay(&s_oled, active_channel);
            } else if (live) {
                oled_blit_pages(&s_oled, live);
            } else {
                oled_render_local(&s_oled, mode, now, active_channel);
            }
            oled_flush(&s_oled);
        }
    }
    return 0;
}
