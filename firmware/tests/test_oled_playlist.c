/*
 * test_oled_playlist.c — the rotation rules and the flash budget.
 *
 * The panel cannot be touched, so "which screen is showing" is a state machine
 * driven by a timer and by gestures. That machine is what these tests pin, along
 * with the capacity numbers the settings UI displays: if the flash region and
 * src/oled/capacity.ts ever disagree, this suite and the exporter both fail.
 */
#include <stddef.h>

#include "board.h"
#include "config.h"
#include "dispatch.h"
#include "gesture.h"
#include "oled_frames.h"
#include "oled_playlist.h"
#include "test.h"
#include "test_runner.h"

/* The catalogue positions the C side must agree with. Keep in step with
 * src/oled/modes.ts; tests/oledModes.test.cjs parses this file to check the
 * order, so a renumbered enum is caught even if nobody runs the C tests. */
static void screen_order_matches_the_catalogue(void) {
    ASSERT_EQ(OLED_SCREEN_KADOWAZ, 0);
    ASSERT_EQ(OLED_SCREEN_SYSTEM, 1);
    ASSERT_EQ(OLED_SCREEN_MEDIA, 2);
    ASSERT_EQ(OLED_SCREEN_CHANNEL, 3);
    ASSERT_EQ(OLED_SCREEN_LOADER, 4);
    ASSERT_EQ(OLED_SCREEN_CREATURE, 5);
    ASSERT_EQ(OLED_SCREEN_WAVE, 6);
    ASSERT_EQ(OLED_SCREEN_STARFIELD, 7);
    ASSERT_EQ(OLED_SCREEN_RAIN, 8);
    ASSERT_EQ(OLED_SCREEN_CLOCK, 9);
    ASSERT_EQ(OLED_SCREEN_RADAR, 10);
    ASSERT_EQ(OLED_SCREEN_PULSE, 11);
    ASSERT_EQ(OLED_SCREEN_COUNT, OLED_MODE_COUNT);
}

/* ---- capacity ----------------------------------------------------------- */

static void frame_region_is_derived_not_guessed(void) {
    /* 2 MB part, two 4 KiB config sectors on top, 120 KiB of frames below them,
     * 512 B per frame. Every step is a hardware number, none is a round guess. */
    ASSERT_EQ(BOARD_FLASH_SIZE_BYTES, 2 * 1024 * 1024);
    ASSERT_EQ(BOARD_CONFIG_SECTOR_SIZE, 4096);
    ASSERT_EQ(BOARD_OLED_FRAME_REGION_OFFSET % BOARD_CONFIG_SECTOR_SIZE, 0);
    ASSERT_EQ(BOARD_OLED_FRAME_REGION_BYTES, 120u * 1024u);
    ASSERT_EQ(BOARD_OLED_FRAME_BYTES, 512);
    ASSERT_EQ(BOARD_OLED_FRAME_SLOTS, 240);
    ASSERT_EQ(BOARD_OLED_FRAME_REGION_OFFSET + BOARD_OLED_FRAME_REGION_BYTES,
              BOARD_CONFIG_SECTOR_A_OFFSET);
    ASSERT_EQ(oled_frame_region_bytes(), 122880);
    ASSERT_EQ(oled_frame_slots(), 240);
}

static void baked_tables_fit_the_region(void) {
    /* The real check is a _Static_assert in oled_playlist.c; asserting the same
     * numbers here means a failure names the budget instead of the file. */
    ASSERT(OLED_ANIM_TOTAL_BYTES <= BOARD_OLED_FRAME_REGION_BYTES);
    ASSERT_EQ(OLED_ANIM_TOTAL_BYTES, 65024);
    ASSERT_EQ(OLED_ANIM_SLOTS_USED, 127);
    ASSERT(OLED_ANIM_SLOTS_USED < BOARD_OLED_FRAME_SLOTS);
    ASSERT_EQ(OLED_FRAME_REGION_TOTAL_BYTES, BOARD_OLED_FRAME_REGION_BYTES);
}

/* ---- rotation rules ----------------------------------------------------- */

static void mask_zero_means_everything(void) {
    /* Configs saved before the field existed read 0 here. If 0 meant "nothing",
     * every one of those panels would freeze on screen 0. */
    ASSERT_EQ(oled_playlist_count(0), OLED_SCREEN_COUNT);
    ASSERT(oled_playlist_contains(0, OLED_SCREEN_PULSE));
    ASSERT_EQ(oled_playlist_next(0, OLED_SCREEN_PULSE), OLED_SCREEN_KADOWAZ);
}

static void unknown_bits_are_dropped(void) {
    uint16_t m = oled_playlist_sanitise((uint16_t)(0xF000u | (1u << OLED_SCREEN_RAIN)));
    ASSERT_EQ(m, (uint16_t)(1u << OLED_SCREEN_RAIN));
    ASSERT_EQ(oled_playlist_count(m), 1);
    /* Only-unknown bits fall back to "everything", never to "nothing". */
    ASSERT_EQ(oled_playlist_sanitise(0xF000u), 0);
}

static void next_walks_the_mask_and_wraps(void) {
    uint16_t m = (uint16_t)((1u << OLED_SCREEN_SYSTEM) | (1u << OLED_SCREEN_STARFIELD));
    ASSERT_EQ(oled_playlist_count(m), 2);
    ASSERT_EQ(oled_playlist_next(m, OLED_SCREEN_SYSTEM), OLED_SCREEN_STARFIELD);
    ASSERT_EQ(oled_playlist_next(m, OLED_SCREEN_STARFIELD), OLED_SCREEN_SYSTEM);
    /* Disabled screens are skipped, not shown briefly. */
    ASSERT_EQ(oled_playlist_next(m, OLED_SCREEN_MEDIA), OLED_SCREEN_STARFIELD);
}

static void prev_is_the_mirror(void) {
    uint16_t m = (uint16_t)((1u << OLED_SCREEN_SYSTEM) | (1u << OLED_SCREEN_STARFIELD));
    ASSERT_EQ(oled_playlist_prev(m, OLED_SCREEN_SYSTEM), OLED_SCREEN_STARFIELD);
    ASSERT_EQ(oled_playlist_prev(m, OLED_SCREEN_STARFIELD), OLED_SCREEN_SYSTEM);
    /* A single-entry rotation stays put rather than spinning forever. */
    uint16_t one = (uint16_t)(1u << OLED_SCREEN_CREATURE);
    ASSERT_EQ(oled_playlist_next(one, OLED_SCREEN_CREATURE), OLED_SCREEN_CREATURE);
    ASSERT_EQ(oled_playlist_prev(one, OLED_SCREEN_CREATURE), OLED_SCREEN_CREATURE);
}

static void out_of_range_cursor_is_clamped(void) {
    ASSERT_EQ(oled_playlist_next(0, 99), OLED_SCREEN_KADOWAZ);
    ASSERT_EQ(oled_playlist_prev(0, 200), OLED_SCREEN_KADOWAZ);
    ASSERT(!oled_playlist_contains(0, 12));
}

/* ---- timing ------------------------------------------------------------- */

static void auto_cycle_ms_and_due(void) {
    ASSERT_EQ(oled_auto_cycle_ms(0), 0);      /* off */
    ASSERT_EQ(oled_auto_cycle_ms(30), 30000);
    ASSERT_EQ(oled_auto_cycle_ms(1), 3000);   /* clamped up to the 3 s floor */
    ASSERT_EQ(oled_auto_cycle_ms(255), 255000);

    ASSERT(!oled_auto_cycle_due(29999, 0, 30));
    ASSERT(oled_auto_cycle_due(30000, 0, 30));
    /* Off means never. */
    ASSERT(!oled_auto_cycle_due(600000, 0, 0));
    /* A 32-bit millisecond counter wraps every 49 days; the rotation must not
     * freeze when it does. */
    /* 29 000 ms before the counter wrapped, then 1 000 ms after it: 30 000 ms
     * of real dwell, so exactly due. One millisecond earlier is not. */
    ASSERT(oled_auto_cycle_due(1000, 0xFFFF8EB8u, 30));
    ASSERT(!oled_auto_cycle_due(999, 0xFFFF8EB8u, 30));
}

/* ---- runtime cursor ----------------------------------------------------- */

static void cursor_tracks_config_and_listener(void) {
    cfg_blob_t *cfg = config_mutable();
    cfg->global.oled_playlist = (uint16_t)((1u << OLED_SCREEN_LOADER) | (1u << OLED_SCREEN_RADAR));
    cfg->global.oled_auto_cycle_s = 10;
    config_reseal(cfg);

    oled_playlist_init(OLED_SCREEN_LOADER, 1000);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_LOADER);

    ASSERT_EQ(oled_playlist_advance(1), OLED_SCREEN_RADAR);
    ASSERT_EQ(oled_playlist_advance(1), OLED_SCREEN_LOADER);
    ASSERT_EQ(oled_playlist_advance(-1), OLED_SCREEN_RADAR);

    /* Selecting a disabled screen still works: the host can pin any screen. */
    ASSERT(oled_playlist_select(OLED_SCREEN_MEDIA));
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_MEDIA);
    ASSERT(!oled_playlist_select(OLED_SCREEN_COUNT));

    /* The tick only moves once 10 s have passed, and restarts the dwell. */
    cfg = config_mutable();
    cfg->global.oled_playlist = 0; /* everything */
    config_reseal(cfg);
    oled_playlist_init(OLED_SCREEN_SYSTEM, 0);
    ASSERT(!oled_playlist_tick(9000));
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_SYSTEM);
    ASSERT(oled_playlist_tick(10000));
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_MEDIA);
    ASSERT(!oled_playlist_tick(15000));

    /* Any input restarts the timer, so a keypress is not swapped out mid-press. */
    oled_playlist_touch(15000);
    ASSERT(!oled_playlist_tick(20000));
    ASSERT(oled_playlist_tick(25000));
}

static void auto_cycle_off_never_advances(void) {
    cfg_blob_t *cfg = config_mutable();
    cfg->global.oled_playlist = 0;
    cfg->global.oled_auto_cycle_s = 0;
    config_reseal(cfg);
    oled_playlist_init(OLED_SCREEN_PULSE, 0);
    ASSERT(!oled_playlist_tick(10000000));
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_PULSE);
    /* Restore the shipping default so later suites see a clean config. */
    cfg = config_mutable();
    cfg->global.oled_auto_cycle_s = 30;
    config_reseal(cfg);
}

/* ---- the gesture path --------------------------------------------------- */

/* Drive ACTION_TYPE_OLED_NEXT through dispatch_run, which is the code that
 * actually runs on a keypress: config slot -> gesture queue -> system action. */
static void oled_next_is_a_bindable_action(void) {
    cfg_blob_t *cfg = config_mutable();
    cfg->global.oled_playlist = 0; /* every screen */
    cfg->global.oled_auto_cycle_s = 0; /* timer off, so only the gesture moves it */
    cfg->channels[0].keys[0].type = ACTION_TYPE_OLED_NEXT;
    cfg->channels[0].keys[0].code = 1; /* forward */
    cfg->channels[0].keys[1].type = ACTION_TYPE_OLED_NEXT;
    cfg->channels[0].keys[1].code = 0xFF; /* backward, packed as a signed byte */
    config_reseal(cfg);

    dispatch_init();
    oled_playlist_init(OLED_SCREEN_SYSTEM, 0);

    gesture_queue_t q;
    gesture_queue_init(&q);
    gesture_t g;
    memset(&g, 0, sizeof(g));
    g.kind = GESTURE_TAP;
    g.index = 0;
    ASSERT(gesture_queue_push(&q, &g));
    ASSERT_EQ(dispatch_run(&q, 10), 1);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_MEDIA);

    /* Backward binding: code 0xFF has to arrive as -1, not +255. */
    g.index = 1;
    ASSERT(gesture_queue_push(&q, &g));
    ASSERT_EQ(dispatch_run(&q, 20), 1);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_SYSTEM);

    /* A release gesture must not step the rotation again. */
    g.kind = GESTURE_HOLD_RELEASE;
    g.index = 0;
    ASSERT(gesture_queue_push(&q, &g));
    (void)dispatch_run(&q, 30);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_SYSTEM);

    /* Put the slots back so later suites see the factory keymap. */
    cfg = config_mutable();
    cfg->channels[0].keys[0].type = ACTION_TYPE_NONE;
    cfg->channels[0].keys[1].type = ACTION_TYPE_NONE;
    cfg->global.oled_auto_cycle_s = 30;
    config_reseal(cfg);
    oled_playlist_init(OLED_SCREEN_KADOWAZ, 0);
}

const test_case_t oled_playlist_tests[] = {
    {"playlist screen order", screen_order_matches_the_catalogue},
    {"frame region derivation", frame_region_is_derived_not_guessed},
    {"frame region fits baked tables", baked_tables_fit_the_region},
    {"playlist mask zero means all", mask_zero_means_everything},
    {"playlist drops unknown bits", unknown_bits_are_dropped},
    {"playlist next wraps", next_walks_the_mask_and_wraps},
    {"playlist prev mirrors", prev_is_the_mirror},
    {"playlist clamps cursor", out_of_range_cursor_is_clamped},
    {"auto cycle ms and due", auto_cycle_ms_and_due},
    {"playlist cursor and listener", cursor_tracks_config_and_listener},
    {"auto cycle off never advances", auto_cycle_off_never_advances},
    {"oled next is a bindable action", oled_next_is_a_bindable_action},
    {NULL, NULL},
};
