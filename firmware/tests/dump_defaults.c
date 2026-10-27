/*
 * dump_defaults.c — writes the firmware's factory config to stdout as raw bytes.
 *
 * Exists for one reason: host/tests/run.mjs builds its own idea of the factory
 * default config in JavaScript and compares it byte for byte against this. If
 * the two disagree anywhere — a timing constant, a knob binding, a base colour,
 * a field offset — the test names the offset, and you know the app would show
 * the user something the pad is not actually doing.
 *
 * That is a much stronger check than either side testing itself, because it
 * catches the case where both implementations are individually consistent and
 * jointly wrong.
 */
#include <stdio.h>

#include "config.h"

int main(void) {
    cfg_blob_t c;
    config_defaults(&c);
    const unsigned char *p = (const unsigned char *)&c;
    for (size_t i = 0; i < sizeof(c); i++) putchar(p[i]);
    return 0;
}
