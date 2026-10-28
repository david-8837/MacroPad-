/*
 * test_main.c — runs every registered test case.
 *
 * Exit code is the failure count (capped at 100) so `make test` fails the build
 * on any regression without needing a test framework.
 */
#include <stdio.h>

#include "test.h"
#include "test_runner.h"

int g_tests = 0;
int g_fails = 0;
const char *g_current = "(none)";

static int run_suite(const char *suite, const test_case_t *cases) {
    int before = g_fails;
    int n = 0;
    printf("%s\n", suite);
    for (const test_case_t *c = cases; c->name != NULL; c++) {
        g_current = c->name;
        int fails_before = g_fails;
        c->fn();
        n++;
        if (g_fails == fails_before) {
            printf("  ok   %s\n", c->name);
        }
    }
    printf("  -- %d cases, %d failures\n\n", n, g_fails - before);
    return g_fails - before;
}

int main(void) {
    printf("=== mpad3 firmware unit tests (host build) ===\n\n");

    run_suite("gesture", gesture_tests);
    run_suite("scan", scan_tests);
    run_suite("config/storage", config_tests);
    run_suite("actions", actions_tests);
    run_suite("leds", leds_tests);
    run_suite("oled", oled_tests);
    run_suite("oled playlist", oled_playlist_tests);
    run_suite("protocol", protocol_tests);
    run_suite("ascii cmd", ascii_cmd_tests);

    printf("=== %d assertions, %d failures ===\n", g_tests, g_fails);
    if (g_fails == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    return g_fails > 100 ? 100 : g_fails;
}
