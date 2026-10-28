/*
 * oled_playlist.c — the panel's rotation state machine.
 *
 * Pure logic plus one millisecond clock, so it runs identically in the host test
 * build and on the board, and so the whole interaction model of a screen you
 * cannot touch is testable without a screen.
 */
#include "oled_playlist.h"

#include "board.h"
#include "config.h"
#include "oled_frames.h"

/* ---- capacity, checked at compile time ---------------------------------- */
/* These are the numbers src/oled/capacity.ts derives from the flash map. If a
 * new animation ever pushes the baked tables past the region, the build stops
 * here instead of the linker silently eating the config sectors. */
_Static_assert(BOARD_OLED_FRAME_REGION_BYTES == 120u * 1024u, "frame region size changed");
_Static_assert(BOARD_OLED_FRAME_SLOTS == 240u, "frame region no longer holds 240 frames");
_Static_assert(OLED_ANIM_TOTAL_BYTES <= BOARD_OLED_FRAME_REGION_BYTES,
               "baked OLED frames do not fit in the frame region");
_Static_assert(OLED_ANIM_SLOTS_USED <= BOARD_OLED_FRAME_SLOTS,
               "baked OLED frames need more slots than the region holds");
_Static_assert(OLED_FRAME_BYTES == BOARD_OLED_FRAME_BYTES, "frame size disagrees with the display");
/* A single screen can never need more than the whole region, and the catalogue
 * fits in the 16-bit mask, or a playlist bit would have nowhere to live. */
_Static_assert(OLED_SCREEN_COUNT == OLED_MODE_COUNT,
               "oled_playlist.h screen indices disagree with the generated mode enum");
_Static_assert(OLED_SCREEN_COUNT <= 16, "screen indices no longer fit in oled_playlist");

uint32_t oled_frame_region_bytes(void) { return (uint32_t)BOARD_OLED_FRAME_REGION_BYTES; }
uint32_t oled_frame_slots(void) { return (uint32_t)BOARD_OLED_FRAME_SLOTS; }

/* ---- pure rules --------------------------------------------------------- */

bool oled_playlist_contains(uint16_t mask, uint8_t screen) {
    if (screen >= OLED_SCREEN_COUNT) return false;
    if (mask == 0) return true; /* 0 = everything */
    return (mask & (uint16_t)(1u << screen)) != 0;
}

uint8_t oled_playlist_count(uint16_t mask) {
    if (mask == 0) return OLED_SCREEN_COUNT;
    uint8_t n = 0;
    for (uint8_t i = 0; i < OLED_SCREEN_COUNT; i++) {
        if (mask & (uint16_t)(1u << i)) n++;
    }
    return n;
}

uint16_t oled_playlist_sanitise(uint16_t mask) {
    uint16_t keep = 0;
    for (uint8_t i = 0; i < OLED_SCREEN_COUNT; i++) {
        if (mask & (uint16_t)(1u << i)) keep |= (uint16_t)(1u << i);
    }
    /* A mask that only had unknown bits is treated as "all", not "nothing": an
     * empty rotation would leave the panel stuck on whatever it was showing. */
    return keep;
}

uint8_t oled_playlist_next(uint16_t mask, uint8_t current) {
    /* An out-of-range cursor is a bug upstream, not a screen: land on the first
     * entry rather than stepping past it. */
    if (current >= OLED_SCREEN_COUNT) return oled_playlist_contains(mask, 0) ? 0
                                                                            : oled_playlist_next(mask, 0);
    for (uint8_t step = 1; step <= OLED_SCREEN_COUNT; step++) {
        uint8_t cand = (uint8_t)((current + step) % OLED_SCREEN_COUNT);
        if (oled_playlist_contains(mask, cand)) return cand;
    }
    return current; /* single-entry rotation */
}

uint8_t oled_playlist_prev(uint16_t mask, uint8_t current) {
    if (current >= OLED_SCREEN_COUNT) return oled_playlist_contains(mask, 0)
                                                 ? 0
                                                 : oled_playlist_prev(mask, 0);
    for (uint8_t step = 1; step <= OLED_SCREEN_COUNT; step++) {
        uint8_t cand = (uint8_t)((current + OLED_SCREEN_COUNT - step) % OLED_SCREEN_COUNT);
        if (oled_playlist_contains(mask, cand)) return cand;
    }
    return current;
}

uint32_t oled_auto_cycle_ms(uint8_t seconds) {
    if (seconds == OLED_AUTO_CYCLE_OFF) return 0;
    if (seconds < OLED_AUTO_CYCLE_MIN_S) return (uint32_t)OLED_AUTO_CYCLE_MIN_S * 1000u;
    return (uint32_t)seconds * 1000u;
}

bool oled_auto_cycle_due(uint32_t now_ms, uint32_t last_change_ms, uint8_t seconds) {
    uint32_t interval = oled_auto_cycle_ms(seconds);
    if (interval == 0) return false;
    if (interval < OLED_AUTO_CYCLE_FLOOR_MS) interval = OLED_AUTO_CYCLE_FLOOR_MS;
    /* Signed difference so a 32-bit millisecond counter wrapping every 49 days
     * does not freeze the rotation. */
    return (int32_t)(now_ms - last_change_ms) >= (int32_t)interval;
}

/* ---- runtime cursor ----------------------------------------------------- */

static uint8_t s_current;
static uint32_t s_last_change_ms;
static void (*s_listener)(uint8_t screen);

static uint16_t playlist_mask(void) {
    const cfg_blob_t *cfg = config_get();
    if (!cfg) return 0; /* no config yet: rotate through everything */
    return oled_playlist_sanitise(cfg->global.oled_playlist);
}

static uint8_t auto_cycle_s(void) {
    const cfg_blob_t *cfg = config_get();
    return cfg ? cfg->global.oled_auto_cycle_s : OLED_AUTO_CYCLE_DEFAULT_S;
}

void oled_playlist_set_listener(void (*fn)(uint8_t screen)) { s_listener = fn; }

void oled_playlist_init(uint8_t screen, uint32_t now_ms) {
    s_current = screen < OLED_SCREEN_COUNT ? screen : 0;
    s_last_change_ms = now_ms;
    if (s_listener) s_listener(s_current);
}

uint8_t oled_playlist_current(void) { return s_current; }

uint8_t oled_playlist_advance(int8_t dir) {
    uint16_t mask = playlist_mask();
    s_current = dir >= 0 ? oled_playlist_next(mask, s_current) : oled_playlist_prev(mask, s_current);
    if (s_listener) s_listener(s_current);
    return s_current;
}

bool oled_playlist_select(uint8_t screen) {
    if (screen >= OLED_SCREEN_COUNT) return false;
    s_current = screen;
    if (s_listener) s_listener(s_current);
    return true;
}

bool oled_playlist_tick(uint32_t now_ms) {
    if (!oled_auto_cycle_due(now_ms, s_last_change_ms, auto_cycle_s())) return false;
    s_last_change_ms = now_ms;
    (void)oled_playlist_advance(1);
    return true;
}

void oled_playlist_touch(uint32_t now_ms) { s_last_change_ms = now_ms; }
