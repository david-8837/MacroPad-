/*
 * config_defaults.c — what a factory-fresh pad does.
 *
 * Philosophy: ship SAFE and OBVIOUS defaults, not clever ones. Every key you
 * have to unbind is friction; every key that does something surprising on first
 * power-up is a support question. So:
 *
 *   * Channel 0 keys 0-8 are empty (ACTION_TYPE_NONE). The pad does nothing
 *     until you tell it something. Nothing can misfire, nothing can type into a
 *     window you did not mean, and the first thing you do in your app is
 *     obviously meaningful.
 *   * The knob works out of the box, because a knob that does nothing makes
 *     people think the firmware is broken: CW = volume up, CCW = volume down,
 *     tap = mute. Those three are the only bindings anyone expects from an
 *     unlabelled knob.
 *   * knob_hold is a CHANNEL_NEXT action, so long-press cycles pages. It is a
 *     real action slot rather than hard-wired firmware behaviour, which means
 *     you *can* repoint it later — but if you do, you lose the only way to
 *     change channel from the hardware. The app should warn about that.
 *   * All three channels get a different base colour so you can tell which page
 *     you are on without looking directly at it.
 */
#include "config.h"

#include <string.h>

#include "actions.h"

static void set_action(cfg_action_t *a, uint8_t type, uint8_t flags, uint16_t code) {
    memset(a, 0, sizeof(*a));
    a->type = type;
    a->flags = flags;
    a->code = code;
}

static void set_text(cfg_action_t *a, const char *s) {
    memset(a, 0, sizeof(*a));
    a->type = ACTION_TYPE_TEXT;
    a->flags = ACTION_FLAG_NONE;
    a->code = 0;
    if (s) {
        size_t n = strlen(s);
        if (n > CFG_TEXT_MAX - 1) n = CFG_TEXT_MAX - 1; /* always leave the NUL */
        memcpy(a->text, s, n);
    }
}

/* Three distinct base colours, chosen to stay distinguishable at low
 * brightness and through a translucent keycap: cool blue, magenta, warm amber.
 * Hue spacing of roughly 120 degrees is the minimum for three-way
 * tell-apart-at-a-glance. */
static const uint8_t k_channel_rgb[CFG_CHANNEL_COUNT][3] = {
    {0x20, 0x60, 0xFF}, /* ch0: blue    */
    {0xC0, 0x20, 0xFF}, /* ch1: magenta */
    {0xFF, 0x90, 0x10}, /* ch2: amber   */
};

void config_defaults(cfg_blob_t *out) {
    if (!out) return;
    memset(out, 0, sizeof(*out));

    out->magic = MAGIC_CONFIG;
    out->version = CONFIG_FORMAT_VERSION;
    out->length = (uint16_t)sizeof(cfg_blob_t);

    /* ---- global timing ---- */
    out->global.hold_ms = CFG_DEFAULT_HOLD_MS;
    out->global.double_tap_ms = 0; /* off by default: taps fire with zero added
                                    * latency. Turn on per-device when you bind
                                    * a double tap, not before. */
    out->global.knob_hold_ms = CFG_DEFAULT_KNOB_HOLD_MS;
    out->global.knob_idle_ms = CFG_DEFAULT_KNOB_IDLE_MS;
    out->global.knob_batch = CFG_DEFAULT_KNOB_BATCH;
    out->global.hold_repeat_ms = CFG_DEFAULT_HOLD_REPEAT_MS;
    out->global.boot_channel = 0;
    out->global.led_invert_output = BOARD_LED_INVERT_OUTPUT;
    out->global.usb_report_events = 1;

    /* ---- channels ---- */
    for (int ch = 0; ch < CFG_CHANNEL_COUNT; ch++) {
        cfg_channel_t *c = &out->channels[ch];

        /* Keys: all empty. */
        for (int k = 0; k < CFG_KEY_COUNT; k++) set_action(&c->keys[k], ACTION_TYPE_NONE, 0, 0);

        /* Knob: useful immediately, identical on every channel so the knob
         * feels consistent as you page through. */
        set_action(&c->knob_cw, ACTION_TYPE_MEDIA, 0, MEDIA_VOLUME_UP);
        set_action(&c->knob_ccw, ACTION_TYPE_MEDIA, 0, MEDIA_VOLUME_DOWN);
        set_action(&c->knob_tap, ACTION_TYPE_MEDIA, 0, MEDIA_MUTE);
        set_action(&c->knob_hold, ACTION_TYPE_CHANNEL_NEXT, 0, 0);

        /* Lighting: reactive so a press visibly confirms itself — that feedback
         * is what makes an empty pad feel alive rather than broken. */
        cfg_lighting_t *L = &c->lighting;
        L->mode = LED_MODE_REACTIVE;
        L->brightness = 90; /* not 255: 9 LEDs at full white is ~540 mA, which
                             * is more than the board's 5V pin should carry from USB
                             * alone. Raise it if you power the strip separately. */
        L->speed = 128;
        L->r = k_channel_rgb[ch][0];
        L->g = k_channel_rgb[ch][1];
        L->b = k_channel_rgb[ch][2];
        L->per_key_mask = 0;
        memset(L->per_key, 0, sizeof(L->per_key));
    }

    config_reseal(out);
}

/* Silence the unused-function warning for set_text when the defaults do not use
 * it: it is part of this file's API for whoever adds their own defaults. */
void config_defaults_helper_set_text(cfg_action_t *a, const char *s) { set_text(a, s); }
