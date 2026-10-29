/*
 * config.h — tunable behaviour and the on-flash configuration layout.
 *
 * Two kinds of thing live here:
 *   1. COMPILE-TIME defaults (the #defines at the top). Change these and rebuild.
 *   2. The RUNTIME config struct, which is what your app edits over USB and
 *      what config_store.c writes to flash. Defaults for it are in config_defaults.c.
 *
 * The struct is the wire format. Its byte layout is mirrored by
 * host/protocol/protocol.json, and `tools/gen_protocol.py` regenerates the
 * TypeScript + markdown from the same source so the two ends cannot drift.
 */
#ifndef CONFIG_H
#define CONFIG_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#include "actions.h"
#include "board.h"
#include "magic.h"

/* ---- layout constants (part of the wire protocol — do not change lightly) -- */
/* Four pages, numbered 0-3. The app has always called these "layers"; the wire
 * calls them channels. They are the same thing, and there are four of them, so
 * the two ends agree instead of the app drawing a fourth page the device cannot
 * hold. */
#define CFG_CHANNEL_COUNT 4
#define CFG_KEY_COUNT BOARD_KEY_COUNT /* 9 */
#define CFG_LED_COUNT BOARD_LED_COUNT /* 9, one per key */
#define CFG_TEXT_MAX ACTION_TEXT_MAX  /* 32 bytes, NUL included */

/* ---- compile-time tuning ------------------------------------------------- */
/* Debounce: a pin must read the same for this many consecutive 1 ms scans
 * before the change is accepted. 5 ms is the usual mechanical-switch value. */
#define CFG_DEBOUNCE_MS 5

/* How often the key pins are sampled. Drives debounce timing. */
#define CFG_SCAN_PERIOD_MS 1

/* Gesture timing. These are the DEFAULTS baked into the firmware; the runtime
 * config can override hold/double-tap per device. */
#define CFG_DEFAULT_HOLD_MS 300
#define CFG_DEFAULT_DOUBLE_TAP_MS 250
#define CFG_DEFAULT_TAP_MAX_MS 200 /* a press longer than this is never a tap */
#define CFG_DEFAULT_HOLD_REPEAT_MS 40

/* Knob long-press to switch channel. Long enough that a knob tap (which you
 * will want for mute/play) never triggers it by accident. */
#define CFG_DEFAULT_KNOB_HOLD_MS 500

/* Rotation: detents are accumulated and flushed either when this many build up
 * or when the knob has been still for this long. The timeout is what makes a
 * single click actually do something instead of waiting for a second one. */
#define CFG_DEFAULT_KNOB_BATCH 4
#define CFG_DEFAULT_KNOB_IDLE_MS 40

/* LED refresh. 60 Hz is plenty and keeps PIO bandwidth free for scanning. */
#define CFG_LED_FRAME_HZ 60

/* Idle dimming: after this many ms with no input, brightness ramps toward
 * CFG_IDLE_BRIGHTNESS over CFG_IDLE_FADE_MS. 0 disables the feature. */
#define CFG_IDLE_DIM_MS 120000
#define CFG_IDLE_FADE_MS 3000
#define CFG_IDLE_BRIGHTNESS 25

/* USB CDC framing. Frames are small; 512 is generous for a full config dump
 * split across several frames. */
#define CFG_PROTOCOL_MTU 512
#define CFG_RX_RING_SIZE 2048

/* ---- runtime configuration ---------------------------------------------- */

/* One action slot. Fixed size so the whole blob stays flat and memcpy-able. */
typedef struct __attribute__((packed)) {
    uint8_t type;           /* action_type_t */
    uint8_t flags;          /* action_flag_t, ORed */
    uint16_t code;          /* HID usage, media code, or channel index */
    uint8_t text[CFG_TEXT_MAX]; /* NUL-terminated, only for ACTION_TYPE_TEXT */
    uint8_t _pad[4];            /* explicit: keeps this a round 40 bytes and gives
                                 * room for a parameter without a format bump */
} cfg_action_t; /* 40 bytes */

_Static_assert(sizeof(cfg_action_t) == 40, "cfg_action_t must stay 40 bytes on the wire");

/* Lighting for one channel. Per-key colour override is optional: if
 * per_key_mask bit n is set, key n uses per_key[n], else the channel colour. */
/* Byte offsets on the wire (packed):
 *   0 mode, 1 brightness, 2 speed, 3 r, 4 g, 5 b, 6 _pad0,
 *   7..8 per_key_mask (u16 LE), 9..35 per_key[9][3], 36..39 _pad
 */
typedef struct __attribute__((packed)) {
    uint8_t mode;       /* led_mode_t */
    uint8_t brightness; /* 0..255, master scale applied after per-key maths */
    uint8_t speed;      /* 1..255, mode-dependent rate */
    uint8_t r, g, b;    /* channel base colour */
    uint8_t _pad0;             /* keeps per_key_mask 2-byte aligned */
    uint16_t per_key_mask; /* bit n -> per_key[n] is used for key n */
    uint8_t per_key[CFG_LED_COUNT][3]; /* 27 bytes, RGB per key */
    uint8_t _pad[4];                   /* 3+3+1+2+27+4 = 40 */
} cfg_lighting_t; /* 40 bytes */

_Static_assert(sizeof(cfg_lighting_t) == 40, "cfg_lighting_t must stay 40 bytes on the wire");

typedef struct __attribute__((packed)) {
    cfg_action_t keys[CFG_KEY_COUNT]; /* 9 x 40 = 360 */

    /* Knob actions. knob_cw/nob_ccw fire per rotation batch; knob_tap is a
     * clean press+release with no rotation in between; knob_hold fires once on
     * crossing the threshold. knob_hold is RESERVED for channel switching in
     * the default config, but it is still a full action slot so you can
     * re-point it (e.g. to ACTION_TYPE_LAYER_HOLD) if you would rather have a
     * dedicated key for paging. */
    cfg_action_t knob_cw;
    cfg_action_t knob_ccw;
    cfg_action_t knob_tap;
    cfg_action_t knob_hold; /* 4 x 40 = 160 */

    cfg_lighting_t lighting; /* 40 */
} cfg_channel_t; /* 560 bytes: 13 actions x 40 + 1 lighting x 40 */

_Static_assert(sizeof(cfg_channel_t) == 560, "cfg_channel_t must stay 560 bytes on the wire");

/* Device-wide settings. */
typedef struct __attribute__((packed)) {
    uint16_t hold_ms;
    uint16_t double_tap_ms;
    uint16_t knob_hold_ms;
    uint16_t knob_idle_ms;
    uint8_t knob_batch;
    uint8_t hold_repeat_ms;
    uint8_t boot_channel;     /* channel selected at power-on */
    uint8_t led_invert_output; /* stored legacy field; hardware driver ignores it */
    uint8_t usb_report_events; /* 1 = stream key/gesture events to the host */

    /* Required physical OLED. The first three bytes were already in v2's
     * global struct; four more bytes in v3 persist boot display settings.
     * storage_init() migrates valid v2 sectors without losing bindings. */
    uint8_t oled_auto_cycle_s; /* 0 = off; 3..255 = seconds per screen */
    uint16_t oled_playlist;    /* bit i = screen i; 0 = all screens */
    uint8_t oled_boot_mode;    /* catalogue index 0..11 on power-up */
    uint8_t oled_contrast;     /* SSD1306 contrast register 0..255 */
    uint8_t oled_inverted;     /* SSD1306 0xA7 when 1; normal when 0 */
    uint8_t _oled_pad;        /* reserved, must be zero */
} cfg_global_t; /* 20 bytes */

_Static_assert(sizeof(cfg_global_t) == 20, "cfg_global_t must stay 20 bytes on the wire");
_Static_assert(offsetof(cfg_global_t, oled_auto_cycle_s) == 13, "oled_auto_cycle_s offset moved");
_Static_assert(offsetof(cfg_global_t, oled_playlist) == 14, "oled_playlist offset moved");
_Static_assert(offsetof(cfg_global_t, oled_boot_mode) == 16, "oled_boot_mode offset moved");
_Static_assert(offsetof(cfg_global_t, oled_contrast) == 17, "oled_contrast offset moved");
_Static_assert(offsetof(cfg_global_t, oled_inverted) == 18, "oled_inverted offset moved");
_Static_assert(offsetof(cfg_global_t, _oled_pad) == 19, "oled pad offset moved");

/* The whole blob. Header first so a reader can reject an incompatible file
 * before touching the payload. */
typedef struct __attribute__((packed)) {
    uint32_t magic;    /* MAGIC_CONFIG */
    uint16_t version;  /* CONFIG_FORMAT_VERSION */
    uint16_t length;   /* sizeof(cfg_blob_t), sanity check */
    cfg_global_t global;
    cfg_channel_t channels[CFG_CHANNEL_COUNT];
    uint32_t crc32;    /* over every byte above this field */
} cfg_blob_t;

_Static_assert(sizeof(cfg_blob_t) == 8 + 20 + (CFG_CHANNEL_COUNT * 560) + 4, "cfg_blob_t layout changed");
_Static_assert(CFG_CHANNEL_COUNT == 4, "four layers, numbered 0-3");

/* Offset of the CRC inside the blob — the host needs it too. */
#define CFG_CRC_OFFSET (sizeof(cfg_blob_t) - 4)
#define CFG_CRC_COVERED_BYTES (sizeof(cfg_blob_t) - 4)

/* ---- API ---------------------------------------------------------------- */

/* Fill a blob with the factory defaults (see config_defaults.c). Always sets
 * magic/version/length and recomputes crc32. */
void config_defaults(cfg_blob_t *out);

/* Validate + repair: returns false if the blob is unusable (bad magic,
 * version, length, or CRC). Does NOT modify it. */
bool config_validate(const cfg_blob_t *cfg);

/* Recompute crc32 in place. Call after any field edit. */
void config_reseal(cfg_blob_t *cfg);

/* The live config. Owned by config_store.c; everyone else reads through this. */
const cfg_blob_t *config_get(void);
cfg_blob_t *config_mutable(void); /* edit, then config_store_commit() */

#endif /* CONFIG_H */
