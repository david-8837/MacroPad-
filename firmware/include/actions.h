/*
 * actions.h — what a gesture can actually DO.
 *
 * An action is {type, flags, code, text}. The dispatcher (actions.c) turns one
 * into either a USB HID report, a system side effect, or an event pushed to the
 * host app for it to handle (webhook / macro on the PC side).
 *
 * Design note: text and webhook payloads live on the DEVICE, not the host. That
 * means a saved macro still types correctly with the app closed, which is the
 * point of storing config in flash. The host only stores what the device cannot
 * do itself.
 *
 * Design note 2: actions.c contains NO hardware calls. It talks to whatever
 * backend was registered with action_set_backend() — real TinyUSB HID on the
 * target, a recorder in tests. That is why this file can be unit tested.
 */
#ifndef ACTIONS_H
#define ACTIONS_H

#include <stdbool.h>
#include <stdint.h>

#define ACTION_TEXT_MAX 32

/* ---- action_type_t ------------------------------------------------------ */
#define ACTION_TYPE_NONE 0         /* slot is empty */
#define ACTION_TYPE_KEYCODE 1      /* code = HID keyboard usage, press+release */
#define ACTION_TYPE_MODS 2         /* code = HID modifier bitmask, tap the combo */
#define ACTION_TYPE_TEXT 3         /* text[] typed out, US layout */
#define ACTION_TYPE_MEDIA 4        /* code = HID consumer usage (see media codes) */
#define ACTION_TYPE_CHANNEL 5      /* code = channel to switch to (absolute) */
#define ACTION_TYPE_CHANNEL_NEXT 6 /* relative, wraps */
#define ACTION_TYPE_LED_MODE 7     /* code = led_mode_t, applies to all channels */
#define ACTION_TYPE_LED_BRIGHT 8   /* code = 0..255 absolute brightness */
#define ACTION_TYPE_LAYER_HOLD 9   /* hold: channel up while held, release: back */
#define ACTION_TYPE_WEBHOOK 10     /* emit an event to the host; host does the HTTP */
#define ACTION_TYPE_BOOTLOADER 11
#define ACTION_TYPE_RESET_CONFIG 12
/* Advance the OLED rotation by one screen (what OLED:NEXT does over USB). Bind
 * it to a key or to the knob tap if you want a manual switch; the timer in
 * oled_playlist.c does it on its own otherwise. `code` selects a direction:
 * 0 or 1 = forward, -1 (0xFF) = backward. */
#define ACTION_TYPE_OLED_NEXT 13

/* Gap between characters of a TEXT macro. Small enough to feel instant, large
 * enough that no OS keyboard stack drops a report. */
#define ACTION_TEXT_CHAR_GAP_MS 8

/* ---- action_flag_t (ORed into cfg_action_t.flags) ----------------------- */
#define ACTION_FLAG_NONE 0x00
/* Send the key DOWN on press and hold it until release, instead of a clean
 * tap. Needed for game-style bindings and for anything the OS treats as a
 * hold-to-repeat. Mutually exclusive with ON_RELEASE. */
#define ACTION_FLAG_HOLD_DOWN 0x01
/* Fire the action when the key is RELEASED rather than on the gesture
 * resolving. Useful when you want a modifier held by another finger first. */
#define ACTION_FLAG_ON_RELEASE 0x02
/* Repeat while held, at cfg_global_t.hold_repeat_ms. Only meaningful with a
 * hold gesture. */
#define ACTION_FLAG_REPEAT 0x04
/* Sticky: fire once on press, fire again on the next press to release. Turns
 * Shift into Caps-style Shift. */
#define ACTION_FLAG_STICKY 0x08

/* ---- HID keyboard usages you are most likely to bind -------------------- */
/* Values are USB HID usage IDs (Keyboard/Keypad page, 0x07). */
#define HID_A 0x04
#define HID_B 0x05
#define HID_C 0x06
#define HID_D 0x07
#define HID_E 0x08
#define HID_F 0x09
#define HID_G 0x0A
#define HID_H 0x0B
#define HID_I 0x0C
#define HID_J 0x0D
#define HID_K 0x0E
#define HID_L 0x0F
#define HID_M 0x10
#define HID_N 0x11
#define HID_O 0x12
#define HID_P 0x13
#define HID_Q 0x14
#define HID_R 0x15
#define HID_S 0x16
#define HID_T 0x17
#define HID_U 0x18
#define HID_V 0x19
#define HID_W 0x1A
#define HID_X 0x1B
#define HID_Y 0x1C
#define HID_Z 0x1D
#define HID_1 0x1E
#define HID_2 0x1F
#define HID_3 0x20
#define HID_4 0x21
#define HID_5 0x22
#define HID_6 0x23
#define HID_7 0x24
#define HID_8 0x25
#define HID_9 0x26
#define HID_0 0x27
#define HID_ENTER 0x28
#define HID_ESC 0x29
#define HID_BACKSPACE 0x2A
#define HID_TAB 0x2B
#define HID_SPACE 0x2C
#define HID_MINUS 0x2D
#define HID_EQUAL 0x2E
#define HID_LBRACKET 0x2F
#define HID_RBRACKET 0x30
#define HID_BSLASH 0x31
#define HID_SEMICOLON 0x33
#define HID_QUOTE 0x34
#define HID_GRAVE 0x35
#define HID_COMMA 0x36
#define HID_DOT 0x37
#define HID_SLASH 0x38
#define HID_CAPSLOCK 0x39
#define HID_F1 0x3A
#define HID_F2 0x3B
#define HID_F3 0x3C
#define HID_F4 0x3D
#define HID_F5 0x3E
#define HID_F6 0x3F
#define HID_F7 0x40
#define HID_F8 0x41
#define HID_F9 0x42
#define HID_F10 0x43
#define HID_F11 0x44
#define HID_F12 0x45
#define HID_PRINTSCREEN 0x46
#define HID_INSERT 0x49
#define HID_HOME 0x4A
#define HID_PAGEUP 0x4B
#define HID_DELETE 0x4C
#define HID_END 0x4D
#define HID_PAGEDOWN 0x4E
#define HID_RIGHT 0x4F
#define HID_LEFT 0x50
#define HID_DOWN 0x51
#define HID_UP 0x52

/* ---- HID modifier bits (for ACTION_TYPE_MODS) --------------------------- */
#define MOD_LCTL 0x01
#define MOD_LSFT 0x02
#define MOD_LALT 0x04
#define MOD_LGUI 0x08
#define MOD_RCTL 0x10
#define MOD_RSFT 0x20
#define MOD_RALT 0x40
#define MOD_RGUI 0x80

/* ---- HID consumer / media usages (for ACTION_TYPE_MEDIA) ---------------- */
#define MEDIA_PLAY_PAUSE 0xCD
#define MEDIA_STOP 0xB7
#define MEDIA_NEXT_TRACK 0xB5
#define MEDIA_PREV_TRACK 0xB6
#define MEDIA_VOLUME_UP 0xE9
#define MEDIA_VOLUME_DOWN 0xEA
#define MEDIA_MUTE 0xE2
#define MEDIA_BRIGHTNESS_UP 0x6F
#define MEDIA_BRIGHTNESS_DOWN 0x70

/* ---- led_mode_t --------------------------------------------------------- */
#define LED_MODE_OFF 0
#define LED_MODE_STATIC 1       /* channel base colour, all keys */
#define LED_MODE_PER_KEY 2      /* per_key[] where masked, else base colour */
#define LED_MODE_BREATH 3       /* sine on base colour */
#define LED_MODE_RAINBOW 4      /* hue cycles, same hue everywhere */
#define LED_MODE_SPECTRUM 5     /* hue cycles with a spatial offset per key */
#define LED_MODE_REACTIVE 6     /* keys flash white on press and decay */
#define LED_MODE_CHANNEL_TINT 7 /* base colour, hue-shifted per channel */

/* ---- runtime action ---------------------------------------------------- */
typedef struct {
    uint8_t type;
    uint8_t flags;
    uint16_t code;
    char text[ACTION_TEXT_MAX];
} action_t;

/* ---- backend: where the bytes actually go ------------------------------- */
/* actions.c calls these and nothing else. hid_send_keyboard sends a full 8-byte
 * boot-protocol report (modifier byte, reserved, 6 keycodes). consumer sends a
 * 16-bit media usage, 0 to release. Both are plain byte interfaces so the HID
 * struct type never leaks into the action layer. */
typedef struct {
    void (*hid_send_keyboard)(uint8_t mods, const uint8_t keys[6]);
    void (*hid_send_consumer)(uint16_t usage);
    /* Emitted for WEBHOOK actions and for anything the host asked to be told
     * about. `payload` is the action's text, which the host turns into a URL
     * call — the device has no network stack and should not grow one. */
    void (*emit_event)(uint8_t kind, uint8_t channel, const char *payload);
    void (*request_bootloader)(void);
    void (*request_config_reset)(void);
    /* Blocking pause in milliseconds. Used between characters of a TEXT macro
     * and between repeated hold actions. On the target this is sleep_ms; in
     * tests it is a counter, which is how test_actions.c asserts the gap exists
     * without actually waiting. Set to NULL for no gap. */
    void (*delay_ms)(uint32_t ms);
    void *user;
} action_backend_t;

void action_set_backend(const action_backend_t *b);
const action_backend_t *action_backend(void);

/* ---- API ---------------------------------------------------------------- */

/* Convert a stored slot (cfg_action_t*) to the runtime form. Takes void* so
 * this header stays free of config.h. */
void action_from_cfg(const void *cfg_action_ptr, action_t *out);

bool action_is_set(const action_t *a);

/* Execute. `press` is true for key-down semantics, false for key-up. Actions
 * that do not care ignore it. Returns true if anything was emitted. */
bool action_fire(const action_t *a, bool press);

/* Release everything an action may still be holding (sticky, hold-down).
 * Sends the all-clear report. Called on channel change and before sleeping so a
 * modifier never sticks. */
void action_release_all(void);

/* Clear the same state WITHOUT sending anything. For boot-time init and for
 * tests that need a clean slate between cases. */
void action_reset_state(void);

/* ASCII -> HID usage, US layout. Returns 0 for characters we cannot type, and
 * sets *out_mods to MOD_LSFT when the character needs shift. */
uint8_t action_char_to_usage(char c, uint8_t *out_mods);

#endif /* ACTIONS_H */
