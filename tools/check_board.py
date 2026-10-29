#!/usr/bin/env python3
"""
check_board.py — verify that the three places the pin map is stated still agree.

The pin map is written down three times, for three different readers:

  * `firmware/include/board.h`      — what the firmware actually compiles
  * `host/protocol/protocol.json`   — what generates docs/PROTOCOL.md
  * `docs/HARDWARE.md`              — what you solder against

Nothing generates one from another. board.h cannot be generated (it is C that has
to satisfy the compiler and the SDK board header), and the markdown table is
prose-embedded. So they drift, and the drift is silent: the firmware works, the
documentation tells you to solder K7 to the wrong pin, and you find out with a
multimeter.

This checks board.h against protocol.json (both machine-readable) and then checks
that every GPIO named in the HARDWARE.md pin table matches too. It also verifies
the header pin numbers against the RP2040-Zero's physical header layout, so a
transposed row/column shows up here rather than on the bench. A small textual
regression guard checks that BOTH key diagrams show GPIO -> switch -> GND and
rejects the earlier 3V3-to-GND short sketch. It is not a netlist/continuity test.

It additionally enforces the constraint that motivated this whole pin map: every
pin used must be one the RP2040-Zero brings out on its castellated **headers**.
GP11-GP15 are on those headers; GP17-GP25 are on the rear headers/solder pads,
not the main castellated header. GP16 drives the onboard WS2812.

Usage
-----
    python3 tools/check_board.py           # report, exit 1 on failure
    python3 tools/check_board.py --check   # one line, for scripts/test-all.sh
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOARD_H = ROOT / "firmware/include/board.h"
SPEC = ROOT / "host/protocol/protocol.json"
HARDWARE_MD = ROOT / "docs/HARDWARE.md"

# Waveshare RP2040-Zero: the 20 GPIOs on the main 23-pin castellated header.
# GP16 is not among them (it drives the board's own WS2812) and GP17..GP25 are on
# the rear 5-pin headers and solder pads. Note that pico-sdk's board header only
# names GP0..GP10 and GP26..GP29, which reads like 15 GPIOs are broken out; that is
# the SDK being conservative about constants, not a fact about the hardware.
HEADER_GPIO = set(range(0, 16)) | {26, 27, 28, 29}   # 20 GPIOs on the 23-pin header
ONBOARD_WS2812_PIN = 16
# GP17..GP25 are on the two 5-pin headers on the back and on solder pads, not on
# the main castellated header. This pin map never uses them.
NOT_ON_MAIN_HEADER = set(range(17, 26))

# Derived rather than typed, because both easy mistakes are silent and this table
# is what you solder against. Numbering is Waveshare's own for header P1: 23 pins,
# USB-C up, front side facing you, pin 1 = 5V at top-left, counter-clockwise. The
# left column is pins 1..11 top to bottom and the right column is pins 12..23
# bottom to top, so GP0 - the last pin reached - is 23.
#
# The first version of this table had the right column starting at pin 12 with GP10
# instead of GP11, which shifted every pin from GP10 down by one and put GP0 at a
# pin 22 that is actually GP1. Exactly the class of error this file exists to stop.
def _derive_header_pins() -> dict:
    pins = {}
    left = [29, 28, 27, 26, 15, 14, 13, 12]              # header pins 4..11
    right = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]       # header pins 12..23
    for i, g in enumerate(left):
        pins[g] = 4 + i
    for i, g in enumerate(right):
        pins[g] = 12 + i
    assert pins[29] == 4 and pins[26] == 7, "left column drifted"
    assert pins[15] == 8 and pins[12] == 11, "left column drifted"
    assert pins[11] == 12 and pins[10] == 13, "right column drifted"
    assert pins[1] == 22 and pins[0] == 23, "right column drifted"
    assert len(pins) == 20 and max(pins.values()) == 23, "23-pin header, 20 of them GPIO"
    assert set(pins) == (set(range(16)) | {26, 27, 28, 29}) - {16}, \
        "GP0..GP15 and GP26..GP29 are the header GPIOs; GP16 is the onboard WS2812"
    return pins


HEADER_PIN = _derive_header_pins()

# A pin-table comparison alone passed while the soldering sketch shorted 3V3
# directly to GND. This guard catches the specific unsafe regression in both
# physical descriptions; it does NOT prove an arbitrary new circuit is safe.
SAFE_KEY_SKETCH = "GPIO(n) ── [normally-open switch] ── GND"
UNSAFE_OLD_SKETCH = re.compile(r"(?m)^\s*(?:\*\s*)?(?:3\.3V|3V3)\s*─+┬─+\s*key\b")


def key_sketch_issues(md: str, board_src: str) -> list[str]:
    issues = []
    for name, text in (("docs/HARDWARE.md", md), ("firmware/include/board.h", board_src)):
        if SAFE_KEY_SKETCH not in text:
            issues.append(f"{name} lacks the GPIO(n) -> switch -> GND key diagram")
        if UNSAFE_OLD_SKETCH.search(text):
            issues.append(f"{name} still contains the old 3V3-to-GND short key sketch")
    return issues


# Pins 1-3 are 5V / GND / 3V3 and carry no GPIO.
POWER_PINS = {1: "5V", 2: "GND", 3: "3V3"}


def board_h_pins(src: str) -> dict:
    """Pull the pin assignments out of board.h."""
    out: dict[str, int] = {}

    m = re.search(r"#define\s+BOARD_KEY_PINS\s*\\\s*\{\s*\\\s*([\d,\s]+?)\\\s*\}", src)
    if not m:
        # tolerate a single-line form
        m = re.search(r"#define\s+BOARD_KEY_PINS\s*\{\s*([\d,\s]+?)\}", src)
    if not m:
        raise ValueError("could not find BOARD_KEY_PINS")
    out["keys"] = [int(x) for x in re.findall(r"\d+", m.group(1))]

    for name, macro in (("enc_a", "BOARD_ENC_A_PIN"), ("enc_b", "BOARD_ENC_B_PIN"),
                        ("enc_sw", "BOARD_ENC_SW_PIN"), ("led", "BOARD_LED_PIN"),
                        ("oled_sda", "BOARD_OLED_SDA_PIN"), ("oled_scl", "BOARD_OLED_SCL_PIN")):
        mm = re.search(rf"#define\s+{macro}\s+(\d+)", src)
        if not mm:
            raise ValueError(f"could not find {macro}")
        out[name] = int(mm.group(1))

    mm = re.search(r"#define\s+BOARD_LED_COUNT\s+(\d+)", src)
    out["led_count"] = int(mm.group(1)) if mm else None
    mm = re.search(r"#define\s+BOARD_FLASH_SIZE_BYTES\s+\(?\s*(\d+)\s*\*\s*1024\s*\*\s*1024", src)
    out["flash_mb"] = int(mm.group(1)) if mm else None
    mm = re.search(r"#define\s+BOARD_OLED_PRESENT\s+(\d+)", src)
    out["oled_present"] = int(mm.group(1)) if mm else None
    mm = re.search(r"#define\s+BOARD_OLED_ADDR\s+(0x[0-9a-fA-F]+|\d+)", src)
    out["oled_addr"] = int(mm.group(1), 0) if mm else None
    mm = re.search(r"#define\s+BOARD_SYS_CLOCK_KHZ\s+(\d+)", src)
    out["clock_khz"] = int(mm.group(1)) if mm else None
    return out


def main(argv: list[str]) -> int:
    check = "--check" in argv
    problems: list[str] = []
    notes: list[str] = []

    try:
        board_src = BOARD_H.read_text()
        pins = board_h_pins(board_src)
        spec = json.loads(SPEC.read_text())["layout"]
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"FAIL cannot read the pin map: {e}")
        return 1

    board = spec.get("board", {})

    # ── board.h must only use header pins ─────────────────────────────────
    used: dict[int, str] = {}
    for i, g in enumerate(pins["keys"]):
        used.setdefault(g, f"key K{i}")
    for name in ("enc_a", "enc_b", "enc_sw"):
        used.setdefault(pins[name], name)
    used.setdefault(pins["led"], "LED data")
    if pins["oled_present"]:
        used.setdefault(pins["oled_sda"], "OLED SDA")
        used.setdefault(pins["oled_scl"], "OLED SCL")

    for g, what in sorted(used.items()):
        if g == ONBOARD_WS2812_PIN:
            problems.append(
                f"{what} uses GP{g}, which already drives the RP2040-Zero's own "
                "onboard WS2812 and is not broken out on the headers"
            )
        elif g in NOT_ON_MAIN_HEADER:
            problems.append(
                f"{what} uses GP{g}, which on the RP2040-Zero is not on the main "
                "castellated header — it is on the rear 5-pin headers and solder "
                "pads only, and this map was chosen to avoid those"
            )
        elif g not in HEADER_GPIO:
            problems.append(f"{what} uses GP{g}, which is not a header GPIO on this board")

    clashes: dict[int, list[str]] = {}
    for i, g in enumerate(pins["keys"]):
        clashes.setdefault(g, []).append(f"K{i}")
    for name in ("enc_a", "enc_b", "enc_sw", "led"):
        clashes.setdefault(pins[name], []).append(name)
    if pins["oled_present"]:
        for name in ("oled_sda", "oled_scl"):
            clashes.setdefault(pins[name], []).append(name)
    for g, whos in sorted(clashes.items()):
        if len(whos) > 1:
            problems.append(f"GP{g} is assigned to {whos}")

    # ── board.h vs protocol.json ──────────────────────────────────────────
    spec_keys = {k["index"]: k for k in spec["keys"]}
    if len(spec_keys) != len(pins["keys"]):
        problems.append(
            f"board.h lists {len(pins['keys'])} keys, protocol.json lists {len(spec_keys)}"
        )
    for i, g in enumerate(pins["keys"]):
        k = spec_keys.get(i)
        if not k:
            continue
        if k["gpio"] != g:
            problems.append(f"K{i}: board.h says GP{g}, protocol.json says GP{k['gpio']}")
        if "headerPin" in k and k["headerPin"] != HEADER_PIN.get(g):
            problems.append(
                f"K{i}: protocol.json says header pin {k['headerPin']} but GP{g} is "
                f"header pin {HEADER_PIN.get(g)}"
            )
    for name, macro, spec_path in (
            ("enc_a", "BOARD_ENC_A_PIN", ("encoder", "a")),
            ("enc_b", "BOARD_ENC_B_PIN", ("encoder", "b")),
            ("enc_sw", "BOARD_ENC_SW_PIN", ("encoder", "switch"))):
        node = spec
        for part in spec_path:
            node = node.get(part, {}) if isinstance(node, dict) else {}
        if node.get("gpio") != pins[name]:
            problems.append(
                f"{macro}: board.h says GP{pins[name]}, protocol.json says "
                f"GP{node.get('gpio')}"
            )
        elif node.get("headerPin") != HEADER_PIN.get(pins[name]):
            problems.append(
                f"{macro}: protocol.json says header pin {node.get('headerPin')} but "
                f"GP{pins[name]} is header pin {HEADER_PIN.get(pins[name])}"
            )
    led_node = spec.get("leds", {}).get("data", {})
    if led_node.get("gpio") != pins["led"]:
        problems.append(
            f"BOARD_LED_PIN: board.h says GP{pins['led']}, protocol.json says "
            f"GP{led_node.get('gpio')}"
        )
    elif led_node.get("headerPin") != HEADER_PIN.get(pins["led"]):
        problems.append(
            f"LED data: protocol.json says header pin {led_node.get('headerPin')} but "
            f"GP{pins['led']} is header pin {HEADER_PIN.get(pins['led'])}"
        )
    if spec.get("leds", {}).get("count") != pins["led_count"]:
        problems.append(
            f"BOARD_LED_COUNT is {pins['led_count']} but protocol.json says "
            f"{spec.get('leds', {}).get('count')}"
        )

    oled = spec.get("oled", {})
    if oled.get("present") != bool(pins["oled_present"]):
        problems.append("BOARD_OLED_PRESENT and protocol.json OLED presence disagree")
    if pins["oled_addr"] is None or str(oled.get("address", "")).lower() != f"0x{pins['oled_addr']:02x}":
        problems.append("BOARD_OLED_ADDR and protocol.json OLED address disagree")
    for label, pin_name in (("sda", "oled_sda"), ("scl", "oled_scl")):
        node = oled.get(label, {})
        if node.get("gpio") != pins[pin_name] or node.get("headerPin") != HEADER_PIN.get(pins[pin_name]):
            problems.append(f"OLED {label.upper()} pin disagrees between board.h and protocol.json")

    # ── flash size must match what the spec documents ─────────────────────
    if pins["flash_mb"] and board.get("flash"):
        got = re.search(r"(\d+)\s*MB", str(board["flash"]))
        if not got or int(got.group(1)) != pins["flash_mb"]:
            problems.append(
                f"board.h says {pins['flash_mb']} MB of flash, protocol.json says "
                f"{board['flash']!r}"
            )

    # ── HARDWARE.md's solder table and key-safety sketch ──────────────────
    md = HARDWARE_MD.read_text() if HARDWARE_MD.exists() else ""
    problems.extend(key_sketch_issues(md, board_src))
    rows = re.findall(r"^\|\s*([^|]+?)\s*\|\s*GP(\d+)\s*\|\s*(\d+)\s*\|", md, re.M)
    if not rows:
        notes.append("HARDWARE.md has no recognisable pin table (| Function | GPn | pin |)")
    by_name = {
        "encodera": "enc_a", "encoderb": "enc_b", "encoderswitch": "enc_sw",
        "encodersw": "enc_sw", "leddata": "led", "oledsda": "oled_sda",
        "oledscl": "oled_scl",
    }
    for label, gpio, hdr in rows:
        gpio, hdr = int(gpio), int(hdr)
        # Keep digits: "K0" must normalise to "k0", not "k". Stripping [^a-z]
        # ate the index and every key row silently fell through to the
        # "not matched" note instead of being checked - which is the worst
        # outcome, because the rows you actually solder were the ones skipped.
        key = re.sub(r"[^a-z0-9]", "", label.lower())
        m = re.match(r"(?:key)?k(\d)$", key)
        if m:
            idx = int(m.group(1))
            want = pins["keys"][idx] if idx < len(pins["keys"]) else None
            what = f"K{idx}"
        else:
            mapped = by_name.get(key)
            want = pins.get(mapped) if mapped else None
            what = label.strip()
        if want is None:
            problems.append(
                f"HARDWARE.md row {label.strip()!r} does not correspond to any pin in "
                "board.h, so the solder table has drifted from the firmware"
            )
            continue
        if want != gpio:
            problems.append(
                f"HARDWARE.md says {what} is GP{gpio} but board.h says GP{want} — "
                "you would solder it to the wrong pin"
            )
        if HEADER_PIN.get(gpio) != hdr:
            problems.append(
                f"HARDWARE.md says GP{gpio} is header pin {hdr}; on the RP2040-Zero "
                f"GP{gpio} is header pin {HEADER_PIN.get(gpio)}"
            )

    if not check:
        print(f"{BOARD_H.relative_to(ROOT)} vs {SPEC.relative_to(ROOT)} vs "
              f"{HARDWARE_MD.relative_to(ROOT)}")
        print(f"  board: {board.get('name', '?')}, sys clock {pins['clock_khz']} kHz, "
              f"flash {pins['flash_mb']} MB, OLED "
              f"{'fitted' if pins['oled_present'] else 'absent'}")
        for g, what in sorted(used.items()):
            print(f"    GP{g:<3} header pin {HEADER_PIN.get(g, '?'):>2}   {what}")
        free = sorted(HEADER_GPIO - set(used))
        print(f"  spare header GPIO: {', '.join(f'GP{g}' for g in free) or 'none'}")
        for n in notes:
            print(f"    note {n}")

    if problems:
        if check:
            print("  FAIL board pin map")
        for p in problems:
            print(f"    !! {p}")
        return 1
    if check:
        print(f"  PASS board pin map — {len(used)} pins agree across board.h, "
              f"protocol.json and HARDWARE.md, all on headers")
    else:
        print("  OK — board.h, protocol.json and the HARDWARE.md solder table agree, "
              "every pin is a header pin, none collide")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
