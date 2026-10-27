/*
 * channel.c — the 3-page system and gesture -> action resolution.
 */
#include "channel.h"

#include <string.h>

#include "actions.h"
#include "config.h"
#include "events.h"

static uint8_t s_active;

uint8_t channel_active(void) { return s_active; }

void channel_set(uint8_t index) {
    if (index >= CFG_CHANNEL_COUNT) index = index % CFG_CHANNEL_COUNT;
    if (index == s_active) return;

    /* Release anything the old channel is still holding before the bindings
     * change underneath it. Skipping this is the classic bug where you switch
     * page while Shift is latched and the next page inherits a stuck modifier. */
    action_release_all();

    s_active = index;
    events_push(EV_SOURCE_KNOB, 0, EV_CHANNEL_CHANGE, s_active, 0, ACTION_TYPE_CHANNEL);
}

void channel_next(void) { channel_set((uint8_t)((s_active + 1) % CFG_CHANNEL_COUNT)); }
void channel_prev(void) {
    channel_set((uint8_t)((s_active + CFG_CHANNEL_COUNT - 1) % CFG_CHANNEL_COUNT));
}

const cfg_action_t *action_for_gesture(gesture_kind_t kind, uint8_t key_index) {
    const cfg_blob_t *cfg = config_get();
    if (!cfg) return NULL;
    const cfg_channel_t *ch = &cfg->channels[s_active % CFG_CHANNEL_COUNT];

    switch (kind) {
    case GESTURE_TAP:
        return (key_index < CFG_KEY_COUNT) ? &ch->keys[key_index] : NULL;

    case GESTURE_HOLD:
    case GESTURE_HOLD_RELEASE:
        /* Hold shares the key's slot; the action's flags decide whether it
         * behaves as hold-down, sticky, or repeat. There is no separate hold
         * binding per key, which keeps 9 slots instead of 27 and keeps the app
         * UI comprehensible. If you ever need a genuinely different action on
         * hold, add a keys_hold[] array here and bump CONFIG_FORMAT_VERSION. */
        return (key_index < CFG_KEY_COUNT) ? &ch->keys[key_index] : NULL;

    case GESTURE_DOUBLE_TAP:
        return (key_index < CFG_KEY_COUNT) ? &ch->keys[key_index] : NULL;

    case GESTURE_ROTATE_CW:
        return &ch->knob_cw;
    case GESTURE_ROTATE_CCW:
        return &ch->knob_ccw;
    case GESTURE_KNOB_TAP:
        return &ch->knob_tap;
    case GESTURE_KNOB_HOLD:
        return &ch->knob_hold;

    case GESTURE_KNOB_RELEASE:
    case GESTURE_NONE:
    default:
        return NULL;
    }
}

bool channel_hold_is_repeatable(uint8_t key_index) {
    if (key_index >= CFG_KEY_COUNT) return false;
    const cfg_blob_t *cfg = config_get();
    if (!cfg) return false;
    return (cfg->channels[s_active % CFG_CHANNEL_COUNT].keys[key_index].flags &
            ACTION_FLAG_REPEAT) != 0;
}

/* Called by storage/dispatch after a config load so the active channel obeys
 * boot_channel. */
void channel_apply_boot(const cfg_blob_t *cfg) {
    if (!cfg) return;
    s_active = cfg->global.boot_channel % CFG_CHANNEL_COUNT;
}
