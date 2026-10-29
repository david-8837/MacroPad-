#!/usr/bin/env python3
"""Check the exact LED PIO bit paths against the named SK6812MINI-E datasheet.

Normand SK6812MINI-E Rev.02, section 12:
https://www.normandled.com/upload/202004/SK6812MINI-E%20LED%20Datasheet.pdf
T0H 200..400 ns; T0L >=800 ns; T1H 580..1000 ns; T1L >=200 ns;
period >=1200 ns; each low <20000 ns; reset LOW >80000 ns.

The parser deliberately supports only this program's PIO constructs. It follows
both the conditional zero-bit jump and the unconditional one-bit loop jump, and
includes the NEXT bit's leading low cycles when measuring each low pulse. It
fails, rather than prints a note, if any specified limit is missed. It also
checks the 10 MHz divisor and last-word/reset guard in the C driver.

This is a SOURCE simulation, not a measurement at the 5 V LED DIN pin. Actual
clock, buffer, DMA and purchased LEDs still require a bench/scope check.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIO_FILE = ROOT / "firmware/src/lighting/ws2812minie.pio"
LEDS_C = ROOT / "firmware/src/lighting/leds.c"

# Bounds in nanoseconds, including the datasheet note that each low <20 us.
SPEC_NS = {"T0H": (200, 400), "T0L": (800, 20_000),
           "T1H": (580, 1000), "T1L": (200, 20_000)}
MIN_PERIOD_NS = 1200
MIN_RESET_NS = 80_000  # reset must be strictly greater than this


class PioParseError(Exception):
    pass


def _const(expr: str, defines: dict[str, int], lineno: int) -> int:
    """Evaluate integer delay expressions using only known defines and +-*/()."""
    try:
        safe = re.sub(r"\b([A-Za-z_]\w*)\b", lambda m: str(defines[m.group(1)]), expr)
    except KeyError as exc:
        raise PioParseError(f"line {lineno}: unknown constant {exc.args[0]}") from exc
    if not re.fullmatch(r"[\d\s()+\-*/]+", safe):
        raise PioParseError(f"line {lineno}: invalid integer expression {expr!r}")
    try:
        value = eval(safe, {"__builtins__": {}}, {})  # noqa: S307 - constrained above
    except (SyntaxError, ZeroDivisionError) as exc:
        raise PioParseError(f"line {lineno}: invalid expression {expr!r}") from exc
    if type(value) is not int:
        raise PioParseError(f"line {lineno}: non-integer expression {expr!r}")
    return value


_SIDE_RE = re.compile(r"\bside\s+([01])\b")
_DELAY_RE = re.compile(r"\[\s*([^\]]+?)\s*\]")


def _parse_instr(line: str, lineno: int, defines: dict[str, int]) -> dict:
    side_m = _SIDE_RE.search(line)
    delay_m = _DELAY_RE.search(line)
    if not side_m:
        raise PioParseError(f"line {lineno}: explicit side 0/1 required")
    delay = _const(delay_m.group(1), defines, lineno) if delay_m else 0
    # One mandatory side-set bit leaves four delay bits on an RP2040 instruction.
    if not 0 <= delay <= 15:
        raise PioParseError(f"line {lineno}: side-set delay {delay} is not 0..15")
    body = _SIDE_RE.sub("", line)
    body = _DELAY_RE.sub("", body)
    body = re.sub(r"\s+", " ", body).strip()
    condition = target_label = None
    if re.fullmatch(r"out x,\s*1", body):
        opcode = "out"
    elif body == "nop":
        opcode = "nop"
    elif body.startswith("jmp "):
        opcode = "jmp"
        conditional = re.fullmatch(r"jmp !x(?:\s*,\s*|\s+)([A-Za-z_]\w*)", body)
        unconditional = re.fullmatch(r"jmp ([A-Za-z_]\w*)", body)
        if conditional:
            condition, target_label = "!x", conditional.group(1)
        elif unconditional:
            target_label = unconditional.group(1)
        else:
            raise PioParseError(f"line {lineno}: unsupported jump condition/syntax {body!r}")
    else:
        raise PioParseError(f"line {lineno}: unsupported instruction {body!r}")
    return {"lineno": lineno, "opcode": opcode, "condition": condition,
            "side": int(side_m.group(1)), "cycles": 1 + delay,
            "target_label": target_label, "target": None}


def parse_pio(text: str):
    """Return (defines, instructions, wrap_target, wrap), resolving labels."""
    defines: dict[str, int] = {}
    instrs: list[dict] = []
    labels: dict[str, int] = {}
    wrap_target = wrap = None
    in_program = in_csdk = False
    saw_side_set = False
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.split(";", 1)[0].strip()
        if not line:
            continue
        if line.startswith("% c-sdk {"):
            in_csdk = True
            continue
        if line == "%}":
            in_csdk = False
            continue
        if in_csdk:
            continue
        if line.startswith(".program "):
            if line != ".program ws2812minie" or in_program:
                raise PioParseError(f"line {lineno}: unexpected PIO program")
            in_program = True
            continue
        if line.startswith(".side_set "):
            if line != ".side_set 1" or saw_side_set:
                raise PioParseError(f"line {lineno}: exactly one mandatory side-set pin required")
            saw_side_set = True
            continue
        m = re.fullmatch(r"\.define\s+(?:public\s+)?(\w+)\s+(.+)", line)
        if m:
            defines[m.group(1)] = _const(m.group(2), defines, lineno)
            continue
        if line == ".wrap_target":
            if wrap_target is not None:
                raise PioParseError("duplicate .wrap_target")
            wrap_target = len(instrs)
            continue
        if line == ".wrap":
            if wrap is not None:
                raise PioParseError("duplicate .wrap")
            wrap = len(instrs) - 1
            continue
        if line.startswith("."):
            raise PioParseError(f"line {lineno}: unsupported directive {line!r}")
        if not in_program:
            raise PioParseError(f"line {lineno}: instruction outside program")
        m = re.fullmatch(r"([A-Za-z_]\w*):", line)
        if m:
            if m.group(1) in labels:
                raise PioParseError(f"line {lineno}: duplicate label {m.group(1)}")
            labels[m.group(1)] = len(instrs)
            continue
        if not saw_side_set:
            raise PioParseError(f"line {lineno}: no .side_set 1 before instruction")
        instrs.append(_parse_instr(line, lineno, defines))

    if not in_program or not saw_side_set or wrap_target is None or wrap is None:
        raise PioParseError("missing program, side-set or wrap markers")
    if not 0 <= wrap_target <= wrap < len(instrs) <= 32:
        raise PioParseError("wrap region is empty or program exceeds 32 instructions")
    for ins in instrs:
        label = ins["target_label"]
        if label is not None:
            if label not in labels:
                raise PioParseError(f"line {ins['lineno']}: unknown label {label!r}")
            ins["target"] = labels[label]
    return defines, instrs, wrap_target, wrap


def bit_sequence(instrs: list[dict], wt: int, wp: int, bit: int) -> list[dict]:
    """Execute exactly one bit through .wrap OR a jump back to .wrap_target."""
    pc = wt
    seq: list[dict] = []
    for _ in range(64):
        ins = instrs[pc]
        seq.append(ins)
        if ins["opcode"] == "jmp":
            taken = ins["condition"] is None or (ins["condition"] == "!x" and bit == 0)
        else:
            taken = False
        next_pc = ins["target"] if taken else pc + 1
        if pc == wp and not taken:
            break  # .wrap executes after this instruction
        if next_pc == wt:
            if not taken:
                raise PioParseError("bit ended without an explicit jump or .wrap")
            break  # one-bit path loops before reaching .wrap
        if not wt <= next_pc <= wp:
            raise PioParseError(f"line {ins['lineno']}: branch left wrap region")
        pc = next_pc
    else:
        raise PioParseError("bit loop never returns to .wrap_target")
    if sum(ins["opcode"] == "out" for ins in seq) != 1 or seq[0]["opcode"] != "out":
        raise PioParseError("bit path must shift exactly one bit, at its start")
    if seq[0]["side"] != 0:
        raise PioParseError("first instruction must drive LOW to idle on TX stall")
    return seq


def timeline_for_bit(instrs, wt, wp, bit: int, repeats: int = 3):
    """Measure circular steady-state pulses, including the following bit's low."""
    seq = bit_sequence(instrs, wt, wp, bit)
    runs: list[list[int]] = []
    for _ in range(repeats):
        for ins in seq:
            level, cycles = ins["side"], ins["cycles"]
            if runs and runs[-1][0] == level:
                runs[-1][1] += cycles
            else:
                runs.append([level, cycles])
    if len(runs) > 1 and runs[0][0] == runs[-1][0]:
        runs[0][1] += runs[-1][1]
        runs.pop()
    highs = [cyc for level, cyc in runs if level == 1]
    lows = [cyc for level, cyc in runs if level == 0]
    if len(highs) != repeats or len(lows) != repeats:
        raise PioParseError(f"bit {bit} does not produce one high and one low per bit")
    if len(set(highs)) != 1 or len(set(lows)) != 1:
        raise PioParseError(f"bit {bit} has inconsistent pulses across boundaries")
    period_c = sum(ins["cycles"] for ins in seq)
    if highs[0] + lows[0] != period_c:
        raise PioParseError(f"bit {bit} high + low differs from instruction count")
    return highs[0], lows[0], period_c, seq


def c_driver_constants(text: str) -> dict[str, int]:
    """Extract and require the clock expression and FIFO-drain/reset guard."""
    constants: dict[str, int] = {}
    for name in ("LED_PIO_CLOCK_MHZ", "LED_SYMBOL_CYCLES", "LED_RESET_GUARD_US"):
        match = re.search(r"^#define\s+" + name + r"\s+(\d+)u\s*$", text, re.M)
        if not match:
            raise PioParseError(f"missing {name} constant in leds.c")
        constants[name] = int(match.group(1))
    clock = r"clock_get_hz\(clk_sys\)\s*/\s*\(LED_PIO_CLOCK_MHZ\s*\*\s*1000000\.0f\)"
    if not re.search(clock, text):
        raise PioParseError("PIO clock divider no longer uses LED_PIO_CLOCK_MHZ")
    last_word = r"#define\s+LED_LAST_WORD_US\s+\(\(24u\s*\*\s*LED_SYMBOL_CYCLES\s*\+\s*LED_PIO_CLOCK_MHZ\s*-\s*1u\)\s*/\s*LED_PIO_CLOCK_MHZ\)"
    if not re.search(last_word, text):
        raise PioParseError("last-pixel duration is not derived from PIO symbol cycles")
    if "busy_wait_us(LED_LAST_WORD_US + LED_RESET_GUARD_US)" not in text:
        raise PioParseError("missing final-pixel and reset-gap wait")
    return constants


def check_spec(results: dict[int, dict], constants: dict[str, int]) -> list[str]:
    """Return violations; every cited datasheet bound is a failing check."""
    problems: list[str] = []
    r0, r1 = results[0], results[1]
    if r0["high"] == r1["high"]:
        problems.append("T0H == T1H: the LED cannot distinguish zero from one")
    for bit, row in results.items():
        for kind in ("H", "L"):
            name = f"T{bit}{kind}"
            lo, hi = SPEC_NS[name]
            val = row["high" if kind == "H" else "low"]
            if not lo <= val <= hi:
                problems.append(f"{name} {val:.0f} ns is outside {lo}..{hi} ns")
        if row["period"] < MIN_PERIOD_NS:
            problems.append(f"bit {bit} period {row['period']:.0f} ns is below {MIN_PERIOD_NS} ns")
    if r0["period_c"] != r1["period_c"]:
        problems.append("zero- and one-bit periods differ; check the loop branches")
    expected_cycles = constants["LED_SYMBOL_CYCLES"]
    if max(r0["period_c"], r1["period_c"]) != expected_cycles:
        problems.append(f"LED_SYMBOL_CYCLES={expected_cycles} disagrees with PIO paths")
    clock_mhz = constants["LED_PIO_CLOCK_MHZ"]
    if clock_mhz < 1:
        problems.append("PIO clock is not positive")
    else:
        last_word_us = (24 * expected_cycles + clock_mhz - 1) // clock_mhz
        last_actual_us = 24 * max(r0["period"], r1["period"]) / 1000
        if last_word_us < last_actual_us:
            problems.append("last-word wait is shorter than 24 bits at the configured clock")
    if constants["LED_RESET_GUARD_US"] * 1000 <= MIN_RESET_NS:
        problems.append("reset guard is not strictly longer than 80 us")
    return problems


def main(argv: list[str]) -> int:
    check = "--check" in argv
    if any(a != "--check" for a in argv):
        print("usage: pio_timing.py [--check]")
        return 2
    try:
        _, instrs, wt, wp = parse_pio(PIO_FILE.read_text())
        constants = c_driver_constants(LEDS_C.read_text())
        ns = 1000 / constants["LED_PIO_CLOCK_MHZ"]
        results = {}
        for bit in (0, 1):
            high_c, low_c, period_c, seq = timeline_for_bit(instrs, wt, wp, bit)
            results[bit] = {"high": high_c * ns, "low": low_c * ns,
                            "period": period_c * ns, "period_c": period_c,
                            "path": " -> ".join(f"{ins['opcode']} {ins['side']}({ins['cycles']}c)"
                                                 for ins in seq)}
        problems = check_spec(results, constants)
    except (OSError, PioParseError, ZeroDivisionError) as exc:
        print(f"  FAIL pio timing: {exc}")
        return 1

    if not check:
        print(f"{PIO_FILE.relative_to(ROOT)}: {len(instrs)} instructions, "
              f"PIO {constants['LED_PIO_CLOCK_MHZ']} MHz = {ns:g} ns/cycle")
        for bit, r in results.items():
            print(f"  {bit}: {r['path']}")
            print(f"     T{bit}H {r['high']:.0f} ns, T{bit}L {r['low']:.0f} ns, "
                  f"period {r['period']:.0f} ns")
        frame_us = 9 * 24 * max(r["period"] for r in results.values()) / 1000
        print(f"  9 pixels x 24 bits: <= {frame_us:.1f} us, "
              f"reset guard {constants['LED_RESET_GUARD_US']} us "
              "after final FIFO word plus its remaining bits")
    if problems:
        print("  FAIL pio timing")
        for problem in problems:
            print(f"    !! {problem}")
        return 1
    r0, r1 = results[0], results[1]
    print(f"  PASS pio timing — 0 {r0['high']:.0f}/{r0['low']:.0f} ns; "
          f"1 {r1['high']:.0f}/{r1['low']:.0f} ns; "
          f"{r0['period']:.0f} ns/bit, within Normand Rev.02 limits")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
