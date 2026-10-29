#!/usr/bin/env python3
"""Expose the *actual* .pio % c-sdk init block to SDK-free LED hardware tests.

This does not assemble PIO instructions. tools/pio_timing.py simulates those
instructions separately; a Pico SDK/ARM build is still required to validate
pioasm output when the toolchain is available.
"""

from __future__ import annotations

import re
from pathlib import Path

pio = Path(__file__).resolve().parent.parent / "firmware/src/lighting/ws2812minie.pio"
text = pio.read_text()
blocks = re.findall(r"(?ms)^% c-sdk \{\s*\n(.*?)^%\}\s*$", text)
if len(blocks) != 1 or "ws2812minie_program_init" not in blocks[0]:
    raise SystemExit("expected exactly one LED PIO c-sdk init block")
print("""/* Generated for HOST TESTS ONLY from ws2812minie.pio's c-sdk block. */
#ifndef TEST_WS2812MINIE_PIO_H
#define TEST_WS2812MINIE_PIO_H
#include "hardware/pio.h"
static const struct pio_program ws2812minie_program = {0};
static inline pio_sm_config ws2812minie_program_get_default_config(uint offset) {
    (void)offset;
    pio_sm_config c = {0};
    return c;
}
""")
print(blocks[0])
print("#endif")
