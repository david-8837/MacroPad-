/*
 * dispatch.c — gesture -> action -> side effects.
 *
 * The only file that is allowed to know about channels, storage, LEDs and USB
 * at the same time. Keeping that coupling in one place is what lets every other
 * module be tested in isolation.
 */
#include "dispatch.h"

#include <string.h>

#include "actions.h"
#include "channel.h"
#include "config.h"
#include "events.h"
#include "oled_playlist.h"
#include "storage.h"

static uint16_t s_hit_mask;
static uint32_t s_last_input_ms;
static gesture_engine_t *s_engine;
static uint16_t s_key_mask, s_keyboard_gestures;
static uint8_t s_keyboard_origin[CFG_KEY_COUNT], s_keyboard_type[CFG_KEY_COUNT];
static bool s_usb_ready;
static uint32_t s_usb_epoch;

/* main.c hands the engine over at init so dispatch can retune it after a config
 * change without owning its lifetime. */
gesture_engine_t *dispatch_engine(void);
void dispatch_set_engine(gesture_engine_t *e) { s_engine = e; }
gesture_engine_t *dispatch_engine(void) { return s_engine; }

/* Forward decl: channel.c owns the active channel, we only set it at boot. */
void channel_apply_boot(const cfg_blob_t *cfg);

void dispatch_init(void) {
    s_hit_mask = 0;
    s_last_input_ms = 0;
    s_key_mask = s_keyboard_gestures = 0;
    memset(s_keyboard_origin, 0, sizeof(s_keyboard_origin));
    memset(s_keyboard_type, ACTION_TYPE_KEYCODE, sizeof(s_keyboard_type));
    s_usb_ready = false;
    s_usb_epoch = 0;
    channel_apply_boot(config_get());
}

void gesture_apply_config_from_live(void) {
    const cfg_blob_t *cfg = config_get();
    if (!cfg) return;
    /* A live upload/reset must not leave the old assignment held. A switch
     * already down is not re-armed until it has been released. */
    action_release_all();
    s_keyboard_gestures |= s_key_mask;
    gesture_engine_t *e = dispatch_engine();
    if (e) gesture_apply_config(e, &cfg->global);
    /* boot_channel only applies at power-on; a live reload keeps you on the
     * page you are on, which is what you want when the app saves a colour. */
}

void dispatch_keyboard_sample(uint16_t down_mask, bool usb_ready, uint32_t usb_epoch) {
    down_mask &= (uint16_t)((1u << CFG_KEY_COUNT) - 1u);
    if (usb_ready != s_usb_ready || usb_epoch != s_usb_epoch) {
        action_release_all();
        /* Do not replay a held switch after disconnect or reconnect. */
        s_keyboard_gestures |= (uint16_t)(s_key_mask | down_mask);
        s_key_mask = down_mask;
        s_usb_ready = usb_ready;
        s_usb_epoch = usb_epoch;
        return;
    }
    uint16_t changed = (uint16_t)(s_key_mask ^ down_mask);
    for (uint8_t i = 0; i < CFG_KEY_COUNT; i++) {
        const uint16_t bit = (uint16_t)(1u << i);
        if (!(changed & bit)) continue;
        if (!(down_mask & bit)) {
            action_physical_keyboard(i, NULL, false);
        } else if (usb_ready) {
            const cfg_action_t *slot = action_for_gesture(GESTURE_TAP, i);
            action_t a;
            if (slot) {
                action_from_cfg(slot, &a);
                if (action_physical_keyboard_supported(&a)) {
                    s_keyboard_gestures |= bit;
                    s_keyboard_origin[i] = channel_active();
                    s_keyboard_type[i] = a.type;
                    action_physical_keyboard(i, &a, true);
                }
            }
        }
    }
    s_key_mask = down_mask;
}

uint16_t dispatch_hit_mask(void) { return s_hit_mask; }
void dispatch_clear_hit_mask(void) { s_hit_mask = 0; }
uint32_t dispatch_last_input_ms(void) { return s_last_input_ms; }

/* System actions are handled here rather than in actions.c because they need
 * channel and storage state. Returns true if the action was consumed. */
static bool handle_system_action(const action_t *a, bool press) {
    switch (a->type) {
    case ACTION_TYPE_CHANNEL:
        if (press) channel_set((uint8_t)a->code);
        return true;
    case ACTION_TYPE_CHANNEL_NEXT:
        if (press) channel_next();
        return true;
    case ACTION_TYPE_LED_MODE: {
        if (!press) return true;
        cfg_blob_t *cfg = config_mutable();
        for (int ch = 0; ch < CFG_CHANNEL_COUNT; ch++) cfg->channels[ch].lighting.mode = a->code;
        config_reseal(cfg);
        /* Deliberately NOT committed to flash: cycling LED modes with a key
         * would wear the sector out in a week. It is a runtime override; save it
         * from the app if you want it to persist. */
        return true;
    }
    case ACTION_TYPE_LED_BRIGHT: {
        if (!press) return true;
        cfg_blob_t *cfg = config_mutable();
        uint8_t v = (uint8_t)(a->code > 255 ? 255 : a->code);
        for (int ch = 0; ch < CFG_CHANNEL_COUNT; ch++) cfg->channels[ch].lighting.brightness = v;
        config_reseal(cfg);
        return true;
    }
    case ACTION_TYPE_LAYER_HOLD:
        /* Hold: step up a channel while held, come back on release. Implemented
         * as an absolute set on press plus a restore on release. */
        if (press) {
            channel_next();
        } else {
            channel_prev();
        }
        return true;
    case ACTION_TYPE_OLED_NEXT:
        /* Manual switch, for people who would rather not wait for the timer.
         * code -1 (0xFF) steps backwards; anything else steps forwards. */
        if (press) (void)oled_playlist_advance((int8_t)a->code);
        return true;
    case ACTION_TYPE_BOOTLOADER:
    case ACTION_TYPE_RESET_CONFIG:
        /* Left to actions.c -> backend, which owns the reboot path. */
        return false;
    default:
        return false;
    }
}

/* Gesture kind -> the EV_* code streamed to the host. Kept as a switch rather
 * than a table so an added gesture fails to compile here instead of silently
 * reporting EV_NONE. */
static uint8_t gesture_to_event(gesture_kind_t k) {
    switch (k) {
    case GESTURE_TAP: return EV_TAP;
    case GESTURE_HOLD: return EV_HOLD;
    case GESTURE_HOLD_RELEASE: return EV_HOLD_RELEASE;
    case GESTURE_DOUBLE_TAP: return EV_DOUBLE_TAP;
    case GESTURE_ROTATE_CW: return EV_ENC_CW;
    case GESTURE_ROTATE_CCW: return EV_ENC_CCW;
    case GESTURE_KNOB_TAP: return EV_TAP;
    case GESTURE_KNOB_HOLD: return EV_HOLD;
    case GESTURE_KNOB_RELEASE: return EV_HOLD_RELEASE;
    case GESTURE_NONE:
    default: return EV_NONE;
    }
}

int dispatch_run(gesture_queue_t *q, uint32_t now_ms) {
    if (!q) return 0;
    gesture_t g;
    int handled = 0;

    while (gesture_queue_pop(q, &g)) {
        handled++;
        s_last_input_ms = now_ms;

        bool is_knob = (g.index == GESTURE_INDEX_KNOB);
        if (!is_knob && g.index < CFG_KEY_COUNT) s_hit_mask |= (uint16_t)(1u << g.index);

        const cfg_action_t *slot = action_for_gesture(g.kind, g.index);
        action_t a;
        memset(&a, 0, sizeof(a));
        if (slot) action_from_cfg(slot, &a);

        /* Rotation gestures carry a detent count. A binding is fired once per
         * detent so that "volume up" behaves like a real keyboard's media key:
         * 4 clicks = 4 steps, not 1 step of size 4. The clamp in gesture.c caps
         * a violent flick at 512 so this loop cannot stall the scan. */
        int repeats = 1;
        if (g.kind == GESTURE_ROTATE_CW || g.kind == GESTURE_ROTATE_CCW) {
            repeats = g.steps > 0 ? g.steps : 1;
        }

        /* Normal keyboard actions were already handled on physical edges.
         * Retain gesture events for diagnostics/desktop, but never fire the
         * keyboard action a second time on TAP/HOLD/DOUBLE. */
        bool keyboard_gesture = !is_knob && g.index < CFG_KEY_COUNT &&
            (g.kind == GESTURE_TAP || g.kind == GESTURE_HOLD ||
             g.kind == GESTURE_HOLD_RELEASE || g.kind == GESTURE_DOUBLE_TAP) &&
            ((s_keyboard_gestures & (1u << g.index)) || action_physical_keyboard_supported(&a));
        if (keyboard_gesture && (g.kind == GESTURE_TAP || g.kind == GESTURE_HOLD_RELEASE))
            s_keyboard_gestures &= (uint16_t)~(1u << g.index);
        uint8_t action_type = keyboard_gesture ? s_keyboard_type[g.index] : a.type;
        uint8_t event_channel = keyboard_gesture ? s_keyboard_origin[g.index] : channel_active();
        for (int r = 0; r < repeats; r++) {
            bool press = true;
            if (g.kind == GESTURE_HOLD_RELEASE || g.kind == GESTURE_KNOB_RELEASE) press = false;
            if (!keyboard_gesture && action_is_set(&a)) {
                if (!handle_system_action(&a, press)) action_fire(&a, press);
            }
        }

        events_push(is_knob ? EV_SOURCE_KNOB : EV_SOURCE_KEY, is_knob ? 0 : g.index,
                    gesture_to_event(g.kind), keyboard_gesture ? event_channel : channel_active(), g.steps, action_type);
    }
    return handled;
}
