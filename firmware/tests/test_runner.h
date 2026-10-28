/*
 * test_runner.h — glue between test files and test_main.c.
 */
#ifndef TEST_RUNNER_H
#define TEST_RUNNER_H

#include "test.h"

/* Set by the runner before each case so a failure line names the test. */
extern const char *g_current;

/* Every test file exports one NULL-terminated array. Add yours to the list in
 * test_main.c — there is no auto-registration, because auto-registration needs
 * linker-section tricks that behave differently on gcc and clang and are not
 * worth it for 60 test cases. */
extern const test_case_t gesture_tests[];
extern const test_case_t scan_tests[];
extern const test_case_t config_tests[];
extern const test_case_t actions_tests[];
extern const test_case_t leds_tests[];
extern const test_case_t protocol_tests[];
extern const test_case_t oled_tests[];
extern const test_case_t ascii_cmd_tests[];
extern const test_case_t oled_playlist_tests[];

#endif /* TEST_RUNNER_H */
