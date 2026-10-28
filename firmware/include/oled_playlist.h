/*
 * oled_playlist.h — which screen the panel shows, and for how long.
 *
 * The OLED on this board is a display, not an input. There is no touch layer,
 * so "switch screen" can only come from two places:
 *
 *   1. the timer  — cfg_global_t.oled_auto_cycle_s seconds per screen;
 *   2. a gesture  — ACTION_TYPE_OLED_NEXT bound to a key or the knob, or the
 *                   host sending OLED:NEXT over CDC.
 *
 * Both go through this module, so the panel cannot end up in a state the host
 * does not know about. The desktop simulator runs the same rules from
 * src/oled/playlist.ts; tests/test_oled_playlist.c and tests/oledModes.test.cjs
 * check both against the same table.
 *
 * Frames are `const` and live in flash (see BOARD_OLED_FRAME_REGION_*), so a
 * screen costs flash but no RAM. Only one screen is on the panel at a time, so
 * the rotation itself costs one byte plus one bitmask in the config — the mode
 * count is limited by flash bytes, not by this module.
 */
#ifndef OLED_PLAYLIST_H
#define OLED_PLAYLIST_H

#include <stdbool.h>
#include <stdint.h>

/* Screen indices. THIS ORDER IS THE CONTRACT: it is the order of OLED_MODES in
 * src/oled/modes.ts, and tests/oledModes.test.cjs parses this file to make sure
 * it still matches. Insert screens at the end; never renumber. */
#define OLED_SCREEN_KADOWAZ 0
#define OLED_SCREEN_SYSTEM 1
#define OLED_SCREEN_MEDIA 2
#define OLED_SCREEN_CHANNEL 3
#define OLED_SCREEN_LOADER 4
#define OLED_SCREEN_CREATURE 5
#define OLED_SCREEN_WAVE 6
#define OLED_SCREEN_STARFIELD 7
#define OLED_SCREEN_RAIN 8
#define OLED_SCREEN_CLOCK 9
#define OLED_SCREEN_RADAR 10
#define OLED_SCREEN_PULSE 11
#define OLED_SCREEN_COUNT 12

/* Rotation rules. `mask == 0` means "every screen": that is what a config
 * written before this field existed reads as (the bytes were padding), and it
 * must not black out the panel. */
#define OLED_PLAYLIST_ALL ((uint16_t)0xFFFFu)

#define OLED_AUTO_CYCLE_OFF 0
#define OLED_AUTO_CYCLE_MIN_S 3     /* two full plays of the shortest loop        */
#define OLED_AUTO_CYCLE_DEFAULT_S 30
/* A screen change is not allowed to happen faster than the panel can redraw:
 * the SSD1306 flush of a full frame is ~13 ms at 400 kHz, so any sane interval
 * is far above it. This is the floor the tick uses if the config is nonsense. */
#define OLED_AUTO_CYCLE_FLOOR_MS 1000u

bool oled_playlist_contains(uint16_t mask, uint8_t screen);
uint8_t oled_playlist_count(uint16_t mask);
/* Next/previous screen in the rotation, wrapping. Never returns an index
 * outside 0..OLED_SCREEN_COUNT-1, even for a mask that only has one bit set. */
uint8_t oled_playlist_next(uint16_t mask, uint8_t current);
uint8_t oled_playlist_prev(uint16_t mask, uint8_t current);
/* Normalise a mask coming from a host: drop unknown bits, keep it usable. */
uint16_t oled_playlist_sanitise(uint16_t mask);

/* Milliseconds per screen, or 0 when automatic switching is off. */
uint32_t oled_auto_cycle_ms(uint8_t seconds);
/* Wraparound-safe "has this screen been up long enough?". */
bool oled_auto_cycle_due(uint32_t now_ms, uint32_t last_change_ms, uint8_t seconds);

/* ---- runtime cursor ------------------------------------------------------ */

/* Register what to tell when the screen changes; the panel driver sets this.
 * Without a listener (host build, or BOARD_OLED_PRESENT 0) the module still
 * tracks state, so the logic stays testable. */
void oled_playlist_set_listener(void (*fn)(uint8_t screen));

/* Apply the saved config: cursor to the saved screen, dwell timer to `now_ms`. */
void oled_playlist_init(uint8_t screen, uint32_t now_ms);
uint8_t oled_playlist_current(void);

/* Manual step, from a gesture or OLED:NEXT. dir >= 0 is forward. Returns the
 * screen now displayed. */
uint8_t oled_playlist_advance(int8_t dir);

/* Jump to a specific screen, ignoring the rotation (host command OLED:MODE).
 * Returns false and does nothing if `screen` is out of range. */
bool oled_playlist_select(uint8_t screen);

/* Call from the main loop with a millisecond clock. Returns true when it moved
 * the rotation on, so the caller can redraw immediately. */
bool oled_playlist_tick(uint32_t now_ms);

/* Restart the dwell timer without changing the screen. Called on any input, so
 * a keypress does not get its screen swapped out from under it. */
void oled_playlist_touch(uint32_t now_ms);

/* ---- capacity ------------------------------------------------------------ */

/* Flash available to baked frames and what the committed tables actually use.
 * The static asserts in oled_playlist.c make an over-budget build fail. */
uint32_t oled_frame_region_bytes(void);
uint32_t oled_frame_slots(void);

#endif /* OLED_PLAYLIST_H */
