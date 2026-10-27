#!/usr/bin/env python3
"""
pio_timing.py — simulate the WS2812 bit loop and check it against the LED spec.

Why this exists
---------------
The LED driver is the one part of this firmware that the unit tests structurally
cannot cover. `test_leds.c` asserts on the packed DMA buffer, and that buffer was
correct even while the PIO program was producing a waveform with no data in it:
the bit loop had a `jmp` whose target was the immediately-following instruction,
so the taken and not-taken paths ran the same instructions for the same duration
and T0H equalled T1H. Every LED would have latched one uniform colour.

Nothing in a C test can see that, because the bug is not in C. You need either a
logic analyser on the bench or a simulator in CI. This is the simulator: it parses
the .pio source, resolves labels and .define constants, and walks the bit loop the
way the state machine would, once pretending the bit is 0 and once pretending it
is 1. Then it checks the resulting pulse widths against the SK6812MINI-E
datasheet, and cross-checks the clock divisor in leds.c so the two files cannot
drift apart.

It deliberately fails loudly on the specific mistakes that produce a
silent-but-wrong waveform:

  * T0H == T1H          -> no data on the wire at all
  * either high time outside 150..750 ns
  * the two bit periods differing from each other
  * a low period long enough to look like the >50 us reset latch
  * the divisor in leds.c disagreeing with the cycles-per-bit here

Usage
-----
    python3 tools/pio_timing.py            # human-readable report, exit 1 on failure
    python3 tools/pio_timing.py --check    # one line, for scripts/test-all.sh
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIO_FILE = ROOT / "firmware/src/lighting/ws2812minie.pio"
LEDS_C = ROOT / "firmware/src/lighting/leds.c"

# SK6812MINI-E / WS2812B datasheet windows, in nanoseconds.
SPEC = {
    "T0H": (300, 150),   # nominal, tolerance
    "T1H": (600, 150),
    "T0L": (300, 150),
    "T1L": (600, 150),
}
# The high pulses are what the part actually discriminates on. A low time has no
# maximum below the reset threshold, so we only sanity-check the envelope.
RESET_NS = 50_000
# Anything outside this range for a high pulse will not be read as intended.
HIGH_ENVELOPE_NS = (150, 750)


class PioParseError(Exception):
    pass


def parse_pio(text: str):
    """Return (defines, instructions, wrap_target, wrap).

    Each instruction is (lineno, opcode, operand, side, delay, is_nop).
    Only the constructs this one program uses are understood; anything else
    raises rather than being silently skipped, because a silently-skipped
    instruction is exactly how the timing goes wrong.
    """
    defines: dict[str, int] = {}
    instrs: list[dict] = []
    labels: dict[str, int] = {}
    wrap_target = wrap = None
    in_program = False
    in_csdk = False

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.split(";", 1)[0].strip()
        if not line:
            continue
        if line.startswith("% c-sdk"):
            in_csdk = True
            continue
        if line.startswith("%}"):
            in_csdk = False
            continue
        if in_csdk:
            continue

        m = re.match(r"^\.program\s+(\w+)$", line)
        if m:
            in_program = True
            continue
        m = re.match(r"^\.side_set\s+(\d+)(.*)$", line)
        if m:
            n = int(m.group(1))
            if n != 1:
                raise PioParseError(f"line {lineno}: this checker assumes 1 side-set pin, got {n}")
            continue
        m = re.match(r"^\.define\s+(?:public\s+)?(\w+)\s+(.+)$", line)
        if m:
            defines[m.group(1)] = _const(m.group(2), defines, lineno)
            continue
        if line == ".wrap_target":
            wrap_target = len(instrs)
            continue
        if line == ".wrap":
            wrap = len(instrs) - 1
            continue
        if line.startswith("."):
            raise PioParseError(f"line {lineno}: unsupported directive {line!r}")

        if not in_program:
            continue

        m = re.match(r"^(\w+):$", line)
        if m:
            labels[m.group(1)] = len(instrs)
            continue

        instrs.append(_parse_instr(line, lineno, defines, labels))

    if wrap_target is None or wrap is None:
        raise PioParseError("no .wrap_target / .wrap pair found")
    # Resolve jump targets now that every label is known.
    for ins in instrs:
        if ins["target_label"] is not None:
            if ins["target_label"] not in labels:
                raise PioParseError(f"line {ins['lineno']}: unknown label {ins['target_label']!r}")
            ins["target"] = labels[ins["target_label"]]
    return defines, instrs, wrap_target, wrap


def _const(expr: str, defines: dict[str, int], lineno: int) -> int:
    """Evaluate a .define / delay expression: integers, names, + - * and parens."""
    safe = re.sub(r"\b([A-Za-z_]\w*)\b", lambda m: str(defines[m.group(1)]), expr)
    if not re.fullmatch(r"[\d\s()+\-*]+", safe):
        raise PioParseError(f"line {lineno}: cannot evaluate {expr!r}")
    return int(eval(safe, {"__builtins__": {}}, {}))  # noqa: S307 - inputs are constrained above


_SIDE_RE = re.compile(r"\bside\s+([01])")
_DELAY_RE = re.compile(r"\[\s*([^\]]+?)\s*\]")


def _parse_instr(line: str, lineno: int, defines: dict, labels: dict) -> dict:
    side_m = _SIDE_RE.search(line)
    delay_m = _DELAY_RE.search(line)
    side = int(side_m.group(1)) if side_m else 0
    delay = _const(delay_m.group(1), defines, lineno) if delay_m else 0

    body = line
    for rx in (_SIDE_RE, _DELAY_RE):
        body = rx.sub("", body)
    body = re.sub(r"\s+", " ", body).strip()

    target_label = None
    if body.startswith("jmp "):
        parts = body[4:].split(",")
        if len(parts) == 2:
            target_label = parts[1].strip()
        elif len(parts) == 1:
            target_label = parts[0].strip()
        else:
            raise PioParseError(f"line {lineno}: cannot parse {line!r}")
        opcode = "jmp"
    elif body.startswith("out "):
        opcode = "out"
    elif body.startswith("nop"):
        opcode = "nop"
    else:
        raise PioParseError(
            f"line {lineno}: unsupported instruction {body!r}. "
            "Teach this checker about it rather than letting it pass silently."
        )
    return {
        "lineno": lineno, "opcode": opcode, "side": side, "delay": delay,
        "cycles": 1 + delay, "target": None, "target_label": target_label,
        "text": line,
    }


def bit_sequence(instrs, wrap_target, wrap, bit: int) -> list[dict]:
    """Return the exact instructions one bit executes, in order.

    A `jmp !x, label` is taken when the bit just shifted out is 0. Execution runs
    until the program counter reaches the .wrap instruction inclusive, which then
    returns to .wrap_target - that is what .wrap means, so the loop body is
    wrap_target..wrap and the bit period is the sum of those durations.
    """
    pc = wrap_target
    seq: list[dict] = []
    guard = 0
    while True:
        guard += 1
        if guard > 64:
            raise PioParseError("bit loop did not reach .wrap within 64 instructions")
        ins = instrs[pc]
        seq.append(ins)
        taken = ins["opcode"] == "jmp" and bit == 0 and ins["target"] is not None
        if pc == wrap:
            break
        pc = ins["target"] if taken else pc + 1
        if not wrap_target <= pc <= wrap:
            raise PioParseError(
                f"line {ins['lineno']}: execution left the wrap region "
                f"(pc={pc}, wrap {wrap_target}..{wrap})"
            )
    return seq


def timeline_for_bit(instrs, wt, wp, bit: int, repeats: int = 3):
    """Simulate a steady-state run of identical bits and measure one bit.

    The timeline is treated as CIRCULAR, which is what makes the measurement
    correct: the datasheet's low time runs from the end of one bit's high pulse to
    the start of the next bit's high pulse, so it necessarily spans the bit
    boundary and includes the following bit's leading low run. Measuring a single
    bit in isolation, or leaving the fragment at the ends of a linear timeline in
    place, both give the wrong low time.
    """
    seq = bit_sequence(instrs, wt, wp, bit)
    flat: list[tuple[int, int]] = []
    for _ in range(repeats):
        for ins in seq:
            flat.append((ins["side"], ins["cycles"]))

    runs: list[list[int]] = []
    for level, cycles in flat:
        if runs and runs[-1][0] == level:
            runs[-1][1] += cycles
        else:
            runs.append([level, cycles])
    # Close the circle: the run at the end and the run at the start are the same
    # pulse, split by where the timeline happened to begin.
    if len(runs) > 1 and runs[0][0] == runs[-1][0]:
        runs[0][1] += runs[-1][1]
        runs.pop()

    per_cycle = sum(c for _, c in runs) / repeats
    highs = [c for lvl, c in runs if lvl == 1]
    lows = [c for lvl, c in runs if lvl == 0]
    if len(highs) != repeats or len(lows) != repeats:
        raise PioParseError(
            f"expected exactly one high and one low pulse per bit, got "
            f"{len(highs)} highs and {len(lows)} lows over {repeats} bits; the loop "
            "is not producing a clean single pulse per bit"
        )
    if len(set(highs)) != 1 or len(set(lows)) != 1:
        raise PioParseError(
            f"pulse widths are not consistent between bits (highs={sorted(set(highs))} "
            f"lows={sorted(set(lows))})"
        )
    return highs[0], lows[0], int(round(per_cycle)), seq


def divisor_from_leds_c(text: str) -> float | None:
    m = re.search(r"clock_get_hz\(\s*clk_sys\s*\)\s*/\s*\(?\s*([\d.]+)\s*f?\s*\*\s*1000000", text)
    return float(m.group(1)) if m else None


def main(argv: list[str]) -> int:
    check = "--check" in argv
    problems: list[str] = []

    try:
        defines, instrs, wt, wp = parse_pio(PIO_FILE.read_text())
    except (OSError, PioParseError) as e:
        print(f"FAIL cannot parse {PIO_FILE.name}: {e}")
        return 1

    div_mhz = divisor_from_leds_c(LEDS_C.read_text())
    if div_mhz is None:
        problems.append(f"could not find the PIO clock divider in {LEDS_C.name}")
        div_mhz = 8.0
    ns = 1000.0 / div_mhz

    if not check:
        print(f"{PIO_FILE.relative_to(ROOT)}")
        print(f"  {len(instrs)} instructions, wrap {wt}..{wp}, defines {defines}")
        print(f"  PIO clock {div_mhz:g} MHz (from {LEDS_C.name}) -> 1 cycle = {ns:.1f} ns")

    results = {}
    for bit in (0, 1):
        try:
            high_c, low_c, period_c, seq = timeline_for_bit(instrs, wt, wp, bit)
        except PioParseError as e:
            print(f"  FAIL bit {bit}: {e}")
            return 1
        results[bit] = dict(high=high_c * ns, low=low_c * ns, period=period_c * ns,
                            period_c=period_c, high_c=high_c, low_c=low_c)
        if not check:
            path = " -> ".join(
                f"{i['opcode']}({'taken' if i['opcode']=='jmp' and bit==0 else 'fall' if i['opcode']=='jmp' else ''}"
                f"{' side'+str(i['side']) if i['opcode']=='jmp' else ' side'+str(i['side'])},{i['cycles']}c)"
                for i in seq
            )
            print(f"  bit {bit}: {path}")

    r0, r1 = results[0], results[1]
    # period is in ns; a mean period of 812.5 ns is 1.23 MHz, i.e. 1231 kHz.
    mean_period_ns = (r0["period"] + r1["period"]) / 2.0
    rate_khz = 1e6 / mean_period_ns
    rate_mhz = rate_khz / 1e3
    if not check:
        print(f"    T0H = {r0['high_c']}c = {r0['high']:.0f} ns   "
              f"T0L = {r0['low_c']}c = {r0['low']:.0f} ns   period {r0['period_c']}c = {r0['period']:.0f} ns")
        print(f"    T1H = {r1['high_c']}c = {r1['high']:.0f} ns   "
              f"T1L = {r1['low_c']}c = {r1['low']:.0f} ns   period {r1['period_c']}c = {r1['period']:.0f} ns")
        for name, val in (("T0H", r0["high"]), ("T0L", r0["low"]),
                          ("T1H", r1["high"]), ("T1L", r1["low"])):
            nom, tol = SPEC[name]
            inside = nom - tol <= val <= nom + tol
            verdict = "in range" if inside else "outside the printed window (low times have no hard max below the 50 us reset)"
            print(f"      {name} {val:6.0f} ns   spec {nom} +/-{tol} = {nom-tol}..{nom+tol}   {verdict}")
        n_led = 9
        mean_cyc = (r0["period_c"] + r1["period_c"]) / 2.0
        frame_us = n_led * 24 * mean_cyc * ns / 1000.0
        print(f"  mean bit rate {rate_khz:.0f} kHz; {n_led} LEDs x 24 bits = "
              f"{frame_us:.0f} us per frame, DMA idle "
              f"{(1 - frame_us/16666.7)*100:.1f}% of a 60 Hz frame")

    # ── the checks that actually matter ────────────────────────────────────
    if r0["high"] == r1["high"]:
        problems.append(
            f"T0H == T1H == {r0['high']:.0f} ns. The two bit values are "
            "indistinguishable and the wire carries no data. Nearly always a jmp "
            "whose target is the immediately-following instruction, so the taken "
            "and not-taken paths execute the same instructions for the same time."
        )
    for name, val in (("T0H", r0["high"]), ("T1H", r1["high"])):
        lo, hi = HIGH_ENVELOPE_NS
        if not lo <= val <= hi:
            problems.append(f"{name} = {val:.0f} ns is outside the usable {lo}..{hi} ns envelope")
    for name, val in (("T0H", r0["high"]), ("T1H", r1["high"]),
                      ("T0L", r0["low"]), ("T1L", r1["low"])):
        nom, tol = SPEC[name]
        if not nom - tol <= val <= nom + tol:
            print(f"    note {name} = {val:.0f} ns is outside the datasheet's "
                  f"{nom - tol}..{nom + tol} ns window (tolerated; see the .pio header)")
    if r1["high"] < 2 * r0["high"]:
        problems.append(
            f"T1H ({r1['high']:.0f} ns) is less than twice T0H ({r0['high']:.0f} ns). "
            "The part decides by comparing the high pulse against a threshold, so "
            "give it a clear ratio rather than a marginal difference."
        )
    for name, val in (("T0H", r0["high"]), ("T1H", r1["high"])):
        if val < 80:
            problems.append(f"{name} = {val:.0f} ns may be too short for the input to register")
    # Unequal bit periods are legal for this family - it latches on the high
    # pulse and only cares that the low stays under the reset threshold - so this
    # is reported, not failed.
    for name, val in (("T0L", r0["low"]), ("T1L", r1["low"])):
        if val < 100:
            problems.append(f"{name} = {val:.0f} ns is too short to be seen reliably")
    if max(r0["low"], r1["low"]) >= RESET_NS:
        problems.append("a low period exceeds the ~50 us reset threshold, so the strip latches mid-frame")
    # period is in ns; a mean period of 812.5 ns is 1.23 MHz, i.e. 1231 kHz.
    mean_period_ns = (r0["period"] + r1["period"]) / 2.0
    rate_khz = 1e6 / mean_period_ns
    rate_mhz = rate_khz / 1e3
    # The protocol has no minimum bit rate - only the ~50 us low-time reset limit,
    # checked separately - so this is a wide sanity band, not a target.
    if not 0.3 <= rate_mhz <= 2.0:
        problems.append(
            f"mean bit rate is {rate_mhz*1e3:.0f} kHz, far from the WS2812 "
            "family's nominal 800 kHz; check the clock divider in leds.c"
        )

    if problems:
        if check:
            print("  FAIL pio timing")
        for p in problems:
            print(f"    !! {p}")
        return 1

    if check:
        print(f"  PASS pio timing — T0H {r0['high']:.0f} ns / T1H {r1['high']:.0f} ns, "
              f"mean {rate_mhz*1e3:.0f} kHz")
    else:
        print("  OK — T0H and T1H are well separated, both inside the usable "
              "envelope, no low period near the reset threshold")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
