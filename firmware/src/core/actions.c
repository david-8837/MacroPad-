/*
 * actions.c — the dispatcher. Turns a resolved action into bytes.
 *
 * No hardware calls in here. Everything leaves through action_backend_t.
 */
#include "actions.h"

#include <string.h>

#include "config.h"

static action_backend_t s_backend;
static bool s_backend_set;

/* Sticky / latched modifier state.
 *
 * A sticky modifier cannot be implemented by sending a down+up pair: the OS
 * would see Shift pressed and released with nothing in between, and nothing
 * would be shifted. It has to LATCH — held in this variable and OR-ed into every
 * keyboard report until the next press of the same action clears it. That is how
 * a real keyboard's sticky-keys accessibility feature works, and it is the only
 * way "press once for Shift, then press A" can produce a capital A.
 *
 * Only one sticky slot exists. With 9 keys you could want two, but two latched
 * modifiers interacting (which one clears first?) is a state machine of its own
 * and nobody needs it on a macropad. */
static uint8_t s_latched_mods;
static uint8_t s_latched_key;
static bool s_sticky_active;

/* One keyboard state per physical switch. Reports are composed together so
 * releasing one switch never releases a different held key or modifier. */
static struct { uint8_t mods, usage; bool down; } s_physical[CFG_KEY_COUNT];

/* Hold-down state, so a release knows what to undo. */
static struct {
    uint8_t mods;
    uint8_t keys[6];
    bool keyboard_down;
    uint16_t consumer;
    bool consumer_down;
} s_held;

void action_set_backend(const action_backend_t *b) {
    if (b) {
        s_backend = *b;
        s_backend_set = true;
    } else {
        memset(&s_backend, 0, sizeof(s_backend));
        s_backend_set = false;
    }
}

const action_backend_t *action_backend(void) { return s_backend_set ? &s_backend : NULL; }

void action_from_cfg(const void *cfg_action_ptr, action_t *out) {
    if (!cfg_action_ptr || !out) return;
    const cfg_action_t *c = (const cfg_action_t *)cfg_action_ptr;
    memset(out, 0, sizeof(*out));
    out->type = c->type;
    out->flags = c->flags;
    out->code = c->code;
    memcpy(out->text, c->text, CFG_TEXT_MAX);
    out->text[CFG_TEXT_MAX - 1] = '\0';
}

bool action_is_set(const action_t *a) { return a && a->type != ACTION_TYPE_NONE; }

/* ---- HID helpers -------------------------------------------------------- */
static void send_keyboard(uint8_t mods, const uint8_t keys[6]) {
    if (!s_backend.hid_send_keyboard) return;
    uint8_t out[6] = {0};
    uint8_t n = 0;
    bool overflow = false;
    mods |= s_latched_mods;
    for (int i = 0; i < CFG_KEY_COUNT + 6; i++) {
        uint8_t key;
        if (i < CFG_KEY_COUNT) {
            if (!s_physical[i].down) continue;
            mods |= s_physical[i].mods;
            key = s_physical[i].usage;
        } else key = keys[i - CFG_KEY_COUNT];
        if (!key) continue;
        bool found = false;
        for (int j = 0; j < n; j++) if (out[j] == key) found = true;
        if (found) continue;
        if (n == 6) overflow = true;
        else out[n++] = key;
    }
    /* Boot-protocol keyboards have six slots; ErrorRollOver is the HID-defined
     * way to report more than six distinct usages without a stuck key. */
    if (overflow) memset(out, 1, sizeof(out));
    s_backend.hid_send_keyboard(mods, out);
}

bool action_physical_keyboard_supported(const action_t *a) {
    return a && (a->type == ACTION_TYPE_KEYCODE || a->type == ACTION_TYPE_MODS) &&
           a->flags == ACTION_FLAG_NONE;
}

void action_physical_keyboard(uint8_t index, const action_t *a, bool down) {
    if (index >= CFG_KEY_COUNT) return;
    if (down) {
        if (!action_physical_keyboard_supported(a) || s_physical[index].down) return;
        s_physical[index].down = true;
        s_physical[index].mods = a->type == ACTION_TYPE_KEYCODE ? (uint8_t)(a->code >> 8) : (uint8_t)a->code;
        s_physical[index].usage = a->type == ACTION_TYPE_KEYCODE ? (uint8_t)a->code : 0;
    } else {
        if (!s_physical[index].down) return;
        memset(&s_physical[index], 0, sizeof(s_physical[index]));
    }
    const uint8_t empty[6] = {0};
    send_keyboard(0, empty);
}

static void send_consumer(uint16_t usage) {
    if (s_backend.hid_send_consumer) s_backend.hid_send_consumer(usage);
}

/* ---- text typing -------------------------------------------------------- */
/* US QWERTY, the layout the HID usage table assumes. If your OS is set to
 * another layout, the *scancodes* are still US — the OS translates. That is
 * correct behaviour and matches how every real keyboard works, but it does mean
 * text macros containing punctuation come out wrong on e.g. a German layout.
 * Letters and digits are safe everywhere. */
uint8_t action_char_to_usage(char c, uint8_t *out_mods) {
    uint8_t mods = 0;
    uint8_t usage = 0;

    if (c >= 'a' && c <= 'z') {
        usage = (uint8_t)(HID_A + (c - 'a'));
    } else if (c >= 'A' && c <= 'Z') {
        usage = (uint8_t)(HID_A + (c - 'A'));
        mods = MOD_LSFT;
    } else if (c >= '1' && c <= '9') {
        usage = (uint8_t)(HID_1 + (c - '1'));
    } else if (c == '0') {
        usage = HID_0;
    } else {
        switch (c) {
        case ' ': usage = HID_SPACE; break;
        case '\n': usage = HID_ENTER; break;
        case '\t': usage = HID_TAB; break;
        case '-': usage = HID_MINUS; break;
        case '_': usage = HID_MINUS; mods = MOD_LSFT; break;
        case '=': usage = HID_EQUAL; break;
        case '+': usage = HID_EQUAL; mods = MOD_LSFT; break;
        case '[': usage = HID_LBRACKET; break;
        case '{': usage = HID_LBRACKET; mods = MOD_LSFT; break;
        case ']': usage = HID_RBRACKET; break;
        case '}': usage = HID_RBRACKET; mods = MOD_LSFT; break;
        case '\\': usage = HID_BSLASH; break;
        case '|': usage = HID_BSLASH; mods = MOD_LSFT; break;
        case ';': usage = HID_SEMICOLON; break;
        case ':': usage = HID_SEMICOLON; mods = MOD_LSFT; break;
        case '\'': usage = HID_QUOTE; break;
        case '"': usage = HID_QUOTE; mods = MOD_LSFT; break;
        case '`': usage = HID_GRAVE; break;
        case '~': usage = HID_GRAVE; mods = MOD_LSFT; break;
        case ',': usage = HID_COMMA; break;
        case '<': usage = HID_COMMA; mods = MOD_LSFT; break;
        case '.': usage = HID_DOT; break;
        case '>': usage = HID_DOT; mods = MOD_LSFT; break;
        case '/': usage = HID_SLASH; break;
        case '?': usage = HID_SLASH; mods = MOD_LSFT; break;
        case '!': usage = HID_1; mods = MOD_LSFT; break;
        case '@': usage = HID_2; mods = MOD_LSFT; break;
        case '#': usage = HID_3; mods = MOD_LSFT; break;
        case '$': usage = HID_4; mods = MOD_LSFT; break;
        case '%': usage = HID_5; mods = MOD_LSFT; break;
        case '^': usage = HID_6; mods = MOD_LSFT; break;
        case '&': usage = HID_7; mods = MOD_LSFT; break;
        case '*': usage = HID_8; mods = MOD_LSFT; break;
        case '(': usage = HID_9; mods = MOD_LSFT; break;
        case ')': usage = HID_0; mods = MOD_LSFT; break;
        default: usage = 0; break; /* untypeable: skipped, not fatal */
        }
    }
    if (out_mods) *out_mods = mods;
    return usage;
}

static void type_text(const char *text) {
    if (!text) return;
    const uint8_t empty[6] = {0};
    for (const char *p = text; *p; p++) {
        uint8_t mods = 0;
        uint8_t usage = action_char_to_usage(*p, &mods);
        if (usage == 0) continue; /* untypeable character: skip, keep going */
        uint8_t keys[6] = {0};
        keys[0] = usage;
        send_keyboard(mods, keys); /* down */
        send_keyboard(0, empty);   /* up */
        /* Inter-character gap: a full-speed burst of down/up pairs with no delay
         * gets dropped by some OS keyboard stacks, which shows up as missing
         * letters in the middle of a macro. Via the backend so tests can count
         * it instead of sleeping. */
        if (s_backend.delay_ms) s_backend.delay_ms(ACTION_TEXT_CHAR_GAP_MS);
    }
}

/* ---- public ------------------------------------------------------------ */
void action_reset_state(void) {
    /* Clears every latch WITHOUT sending a report. Needed by tests between
     * cases, and useful at boot before the host has enumerated — sending a
     * report to an unmounted device is harmless but pointless. */
    memset(&s_held, 0, sizeof(s_held));
    memset(s_physical, 0, sizeof(s_physical));
    s_latched_mods = 0;
    s_latched_key = 0;
    s_sticky_active = false;
}

void action_release_all(void) {
    uint8_t empty[6] = {0};
    bool need_clear = s_held.keyboard_down || s_sticky_active || s_latched_mods || s_latched_key;
    bool need_consumer_clear = s_held.consumer_down;
    for (int i = 0; i < CFG_KEY_COUNT; i++) if (s_physical[i].down) need_clear = true;

    /* Clear every latch FIRST. send_keyboard() ORs s_latched_mods into the
     * report it sends, so releasing before clearing would put the modifier back
     * on the wire — the host would end up holding exactly the key we meant to
     * let go of. */
    s_latched_mods = 0;
    s_latched_key = 0;
    s_sticky_active = false;
    memset(&s_held, 0, sizeof(s_held));
    memset(s_physical, 0, sizeof(s_physical));

    /* Then one all-clear report. Only one: several in a row are wasted USB
     * traffic and make the report log hard to read. */
    if (need_clear) send_keyboard(0, empty);
    if (need_consumer_clear) send_consumer(0);
}

bool action_fire(const action_t *a, bool press) {
    if (!action_is_set(a)) return false;

    uint8_t keys[6] = {0};
    /* ON_RELEASE defers the action to the release edge. It has to be applied per
     * action type rather than as one early return: a blanket "ignore the press"
     * also disabled the HOLD_DOWN release path, which needs the press to latch
     * and the release to fire. */
    bool deferred = (a->flags & ACTION_FLAG_ON_RELEASE) != 0;

    switch (a->type) {
    case ACTION_TYPE_KEYCODE: {
        /* code is (modifiers << 8) | HID usage. The high byte carries a HID
         * modifier mask so one slot can send Ctrl+C; an unmodified key leaves it
         * zero. `code` was a u16 with an unused upper byte all along, so the
         * wire format and the config version do not change. */
        keys[0] = (uint8_t)(a->code & 0xFF);
        const uint8_t kc_mods = (uint8_t)(a->code >> 8);
        if (deferred) {
            if (press) return false;      /* wait for the release */
            send_keyboard(kc_mods, keys); /* then tap */
            uint8_t empty[6] = {0};
            send_keyboard(0, empty);
            return true;
        }
        if (a->flags & ACTION_FLAG_HOLD_DOWN) {
            if (press) {
                send_keyboard(kc_mods, keys);
                s_held.keyboard_down = true;
                memcpy(s_held.keys, keys, 6);
            } else {
                uint8_t empty[6] = {0};
                send_keyboard(0, empty);
                s_held.keyboard_down = false;
            }
        } else if (a->flags & ACTION_FLAG_STICKY) {
            if (!press) break; /* sticky acts on the press edge only */
            if (s_sticky_active && s_latched_key == keys[0]) {
                /* Second press: unlatch, then tell the host everything is up. */
                s_latched_key = 0;
                s_sticky_active = false;
                uint8_t empty[6] = {0};
                send_keyboard(0, empty);
            } else {
                /* First press: latch. The report sent here carries the modifier
                 * so the host sees it immediately; it then stays applied to
                 * every later report until the unlatch above. */
                s_latched_key = keys[0];
                s_sticky_active = true;
                send_keyboard(kc_mods, keys);
            }
        } else if (press) {
            /* Clean tap: down then up in one go. */
            send_keyboard(kc_mods, keys);
            uint8_t empty[6] = {0};
            send_keyboard(0, empty);
        }
        /* For HOLD_DOWN the release half really did something (it let go), so
         * report true. Callers use the return value as "did this gesture have an
         * effect", and a key release is an effect. */
        return true;
    }

    case ACTION_TYPE_MODS: {
        uint8_t mods = (uint8_t)(a->code & 0xFF);
        uint8_t empty[6] = {0};
        if (deferred) {
            if (press) return false;
            send_keyboard(mods, empty);
            send_keyboard(0, empty);
            return true;
        }
        if (a->flags & ACTION_FLAG_STICKY) {
            /* Sticky MODIFIER: latch it and let send_keyboard() fold it into
             * every later report. Sending a down+up pair here would do nothing
             * at all — the OS would see Shift tapped with no key in between. */
            if (!press) return true;
            if (s_sticky_active && s_latched_mods == mods) {
                s_latched_mods = 0;
                s_latched_key = 0;
                s_sticky_active = false;
                send_keyboard(0, empty);
            } else {
                s_latched_mods = (uint8_t)(s_latched_mods | mods);
                s_sticky_active = true;
                send_keyboard(0, empty);
            }
            return true;
        }
        if (a->flags & ACTION_FLAG_HOLD_DOWN) {
            if (press) {
                /* A latched modifier plus a hold-down modifier is a real
                 * combination (sticky Ctrl, then hold Shift), so latch it too
                 * rather than choosing one. */
                s_latched_mods = (uint8_t)(s_latched_mods | mods);
                s_sticky_active = true;
                send_keyboard(0, empty);
                s_held.mods = mods;
                s_held.keyboard_down = true;
            } else {
                s_latched_mods = (uint8_t)(s_latched_mods & (uint8_t)~mods);
                if (!s_latched_mods) s_sticky_active = false;
                send_keyboard(0, empty);
                s_held.mods = 0;
                s_held.keyboard_down = false;
            }
        } else if (press) {
            send_keyboard(mods, empty);
            send_keyboard(0, empty);
        }
        return true;
    }

    case ACTION_TYPE_TEXT:
        /* A text macro on release is the useful direction: fire it when the key
         * comes up, so a modifier held by another finger is already down. */
        if (deferred && press) return false;
        if (!deferred && !press) return false;
        type_text(a->text);
        return true;

    case ACTION_TYPE_MEDIA:
        if (deferred) {
            if (press) return false;
            send_consumer(a->code);
            send_consumer(0);
            return true;
        }
        if (a->flags & ACTION_FLAG_HOLD_DOWN) {
            if (press) {
                send_consumer(a->code);
                s_held.consumer = a->code;
                s_held.consumer_down = true;
            } else {
                send_consumer(0);
                s_held.consumer_down = false;
            }
        } else if (press) {
            send_consumer(a->code);
            send_consumer(0);
        }
        return true;

    /* The system actions are declared here for completeness but they are
     * actually handled by dispatch.c, which has access to channel/storage
     * state. Falling through to the backend hook keeps actions.c free of those
     * dependencies. */
    case ACTION_TYPE_CHANNEL:
    case ACTION_TYPE_CHANNEL_NEXT:
    case ACTION_TYPE_LED_MODE:
    case ACTION_TYPE_LED_BRIGHT:
    case ACTION_TYPE_LAYER_HOLD:
        return press;

    case ACTION_TYPE_WEBHOOK:
        if (deferred && press) return false;
        if (!deferred && !press) return false;
        if (s_backend.emit_event) s_backend.emit_event(a->type, 0, a->text);
        return true;

    case ACTION_TYPE_BOOTLOADER:
        if (!press) return false;
        if (s_backend.request_bootloader) s_backend.request_bootloader();
        return true;

    case ACTION_TYPE_RESET_CONFIG:
        if (!press) return false;
        if (s_backend.request_config_reset) s_backend.request_config_reset();
        return true;

    case ACTION_TYPE_NONE:
    default:
        break;
    }
    return false;
}

