/*
 * test.h — a ~40 line test framework.
 *
 * Deliberately tiny: no dependency to install, no runner to configure, works
 * with `make test` and prints a pass/fail line per assertion. The existing
 * project style was "transpile and assert with Node built-ins"; this is the C
 * equivalent of that.
 */
#ifndef TEST_H
#define TEST_H

#include <stdio.h>
#include <string.h>

extern int g_tests, g_fails;
extern const char *g_current;

/* Registration without a linker section trick: each test file exposes an array. */
typedef struct {
    const char *name;
    void (*fn)(void);
} test_case_t;

#define ASSERT(cond)                                                                \
    do {                                                                            \
        g_tests++;                                                                  \
        if (!(cond)) {                                                              \
            g_fails++;                                                              \
            printf("  FAIL %s:%d  %s\n    assert: %s\n", __FILE__, __LINE__,        \
                   g_current, #cond);                                               \
        }                                                                           \
    } while (0)

#define ASSERT_EQ(a, b)                                                             \
    do {                                                                            \
        g_tests++;                                                                  \
        long long _a = (long long)(a), _b = (long long)(b);                         \
        if (_a != _b) {                                                             \
            g_fails++;                                                              \
            printf("  FAIL %s:%d  %s\n    expected %s == %s, got %lld vs %lld\n",   \
                   __FILE__, __LINE__, g_current, #a, #b, _a, _b);                  \
        }                                                                           \
    } while (0)

#define ASSERT_STR_EQ(a, b)                                                         \
    do {                                                                            \
        g_tests++;                                                                  \
        const char *_a = (a), *_b = (b);                                            \
        if (!_a || !_b || strcmp(_a, _b) != 0) {                                    \
            g_fails++;                                                              \
            printf("  FAIL %s:%d  %s\n    expected \"%s\", got \"%s\"\n", __FILE__, \
                   __LINE__, g_current, _b ? _b : "(null)", _a ? _a : "(null)");    \
        }                                                                           \
    } while (0)

#endif /* TEST_H */
