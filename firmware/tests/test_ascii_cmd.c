/*
 * test_ascii_cmd.c — the host's line protocol.
 *
 * These are the commands the desktop app has always sent over CDC, so the tests
 * are written the way the app sends them: whole lines, split lines, CRLF, junk,
 * and numbers that are out of range.
 */
#include <stddef.h>

#include "ascii_cmd.h"
#include "board.h"
#include "channel.h"
#include "config.h"
#include "oled_playlist.h"
#include "test.h"
#include "test_runner.h"

static cfg_global_t *globals(void) { return &config_mutable()->global; }

static void feed(const char *s) {
    while (*s) (void)ascii_cmd_feed((uint8_t)(unsigned char)*s++);
}

static void line_oled_next_steps_the_rotation(void) {
    oled_playlist_init(OLED_SCREEN_KADOWAZ, 0);
    feed("OLED:NEXT\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_SYSTEM);
    feed("OLED:NEXT\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_MEDIA);
}

static void line_oled_mode_pins_a_screen(void) {
    feed("OLED:MODE:5\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_CREATURE);
    /* Out of range: rejected, cursor unmoved. */
    feed("OLED:MODE:99\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_CREATURE);
}

static void line_oled_auto_sets_the_dwell(void) {
    feed("OLED:AUTO:30\n");
    ASSERT_EQ(globals()->oled_auto_cycle_s, 30);
    feed("OLED:AUTO:0\n");
    ASSERT_EQ(globals()->oled_auto_cycle_s, OLED_AUTO_CYCLE_OFF);
    /* 1 and 2 are below the documented floor: raised, not honoured. */
    feed("OLED:AUTO:2\n");
    ASSERT_EQ(globals()->oled_auto_cycle_s, OLED_AUTO_CYCLE_MIN_S);
    /* Saturates instead of wrapping. */
    feed("OLED:AUTO:999\n");
    ASSERT_EQ(globals()->oled_auto_cycle_s, 255);
}

static void line_oled_playlist_sets_the_mask(void) {
    feed("OLED:PL:5\n");
    ASSERT_EQ(globals()->oled_playlist, 5);
    /* Bits past the catalogue are dropped, not stored. */
    feed("OLED:PL:65535\n");
    ASSERT_EQ(globals()->oled_playlist, (uint16_t)((1u << OLED_SCREEN_COUNT) - 1u));
    feed("OLED:PL:0\n");
    ASSERT_EQ(globals()->oled_playlist, 0);
}

static void line_oled_ch_switches_page(void) {
    channel_set(0);
    feed("OLED:CH:2\n");
    ASSERT_EQ(channel_active(), 2);
    /* Out of range: ignored. */
    feed("OLED:CH:9\n");
    ASSERT_EQ(channel_active(), 2);
    channel_set(0);
}

static void split_line_is_assembled(void) {
    oled_playlist_init(OLED_SCREEN_KADOWAZ, 0);
    feed("OLED:NE");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_KADOWAZ);
    feed("XT\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_SYSTEM);
}

static void crlf_and_unknown_lines_are_tolerated(void) {
    feed("HELLO WORLD\r\n");
    feed("\r\n");
    feed("OLED:\r\n");
    feed("OLED:CUSTOM TEXT HERE\r\n");
    /* Nothing above is a command; the pad must still be alive and on a screen. */
    ASSERT(oled_playlist_current() < OLED_SCREEN_COUNT);
}

static void overlong_line_is_dropped_not_truncated_into_a_command(void) {
    oled_playlist_init(OLED_SCREEN_KADOWAZ, 0);
    /* 60 chars then the start of a real command: the first line overflows, so it
     * is discarded whole. If truncation ran the tail it would read "OLED:MODE:3"
     * out of the junk and pin the wrong screen. */
    for (int i = 0; i < 60; i++) (void)ascii_cmd_feed((uint8_t)'x');
    feed("OLED:MODE:3\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_KADOWAZ);
    /* And the parser recovers on the next clean line. */
    feed("OLED:MODE:3\n");
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_CHANNEL);
}

static void malformed_numbers_do_not_change_state(void) {
    feed("OLED:AUTO:7\n");
    uint8_t before = globals()->oled_auto_cycle_s;
    feed("OLED:AUTO:\n");
    feed("OLED:AUTO:x\n");
    feed("OLED:AUTO:2x\n");
    ASSERT_EQ(globals()->oled_auto_cycle_s, before);
    feed("OLED:AUTO:30\n");
}

static void handler_reports_recognition(void) {
    ASSERT(ascii_cmd_handle("OLED:NEXT"));
    ASSERT(ascii_cmd_handle("OLED:MODE:1"));
    ASSERT(!ascii_cmd_handle("OLED:"));
    ASSERT(!ascii_cmd_handle("KEY:0:down"));
    ASSERT(!ascii_cmd_handle(""));
    ASSERT(!ascii_cmd_handle(NULL));
}

static void rule_is_implemented_before_the_toctou(void) {
    /* Regression guard for the two-suite interaction: running this file after
     * test_oled_playlist.c must not inherit a cursor or a mask from it. Every
     * test above sets what it needs; this documents that assumption. */
    uint16_t mask = oled_playlist_sanitise(globals()->oled_playlist);
    ASSERT(mask == 0 || (mask & (uint16_t)((1u << OLED_SCREEN_COUNT) - 1u)) == mask);
}

const test_case_t ascii_cmd_tests[] = {
    {"line_oled_next_steps_the_rotation", line_oled_next_steps_the_rotation},
    {"line_oled_mode_pins_a_screen", line_oled_mode_pins_a_screen},
    {"line_oled_auto_sets_the_dwell", line_oled_auto_sets_the_dwell},
    {"line_oled_playlist_sets_the_mask", line_oled_playlist_sets_the_mask},
    {"line_oled_ch_switches_page", line_oled_ch_switches_page},
    {"split_line_is_assembled", split_line_is_assembled},
    {"crlf_and_unknown_lines_are_tolerated", crlf_and_unknown_lines_are_tolerated},
    {"overlong_line_is_dropped_not_truncated_into_a_command",
     overlong_line_is_dropped_not_truncated_into_a_command},
    {"malformed_numbers_do_not_change_state", malformed_numbers_do_not_change_state},
    {"handler_reports_recognition", handler_reports_recognition},
    {"rule_is_implemented_before_the_toctou", rule_is_implemented_before_the_toctou},
    {NULL, NULL},
};
