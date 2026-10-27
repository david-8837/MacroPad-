#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-all.sh — run everything, in the order that gives the most useful failure.
#
#   ./scripts/test-all.sh              host tests only (fast, no toolchain needed)
#   ./scripts/test-all.sh --arm        also cross-compile the real firmware image
#
# Exit code is non-zero if anything fails. Safe to wire into CI as-is.
#
# Every step runs ONCE, with its output captured. Running a command twice — once
# to display it and once to test its result — looks tidy and races: two
# concurrent `make test` invocations share firmware/build-host/ and one of them
# intermittently fails. Capture, print, then decide.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
FAILED=0
WANT_ARM=0
[[ "${1:-}" == "--arm" ]] && WANT_ARM=1

hr()  { printf '\n\033[1m── %s ──────────────────────────────────────────────\033[0m\n' "$1"; }
ok()  { printf '\033[32m  PASS\033[0m %s\n' "$1"; }
bad() { printf '\033[31m  FAIL\033[0m %s\n' "$1"; FAILED=1; }

# ── 1. firmware unit tests (host gcc, no hardware, no SDK) ──────────────────
hr "1/7  firmware unit tests (host build)"
if ! command -v gcc >/dev/null; then
    bad "gcc not found — cannot run the firmware unit tests"
else
    LOG=$(mktemp)
    make -C firmware -f Makefile.host test > "$LOG" 2>&1
    tail -30 "$LOG"
    if grep -q "ALL TESTS PASSED" "$LOG"; then
        ok "firmware unit tests"
    else
        bad "firmware unit tests"
    fi
    rm -f "$LOG"
fi

# ── 2. host artifacts the protocol suite diffs against ──────────────────────
hr "2/7  generate host artifacts from the compiled C"
LOG=$(mktemp)
make -C firmware -f Makefile.host hostartifacts > "$LOG" 2>&1
cat "$LOG"
if grep -q "wrote build-host/layout.json" "$LOG" && grep -q "wrote build-host/defaults.bin" "$LOG"; then
    ok "layout.json + defaults.bin"
else
    bad "could not generate layout.json / defaults.bin"
fi
rm -f "$LOG"

# ── 3. protocol suite (Node, no dependencies) ───────────────────────────────
hr "3/7  host protocol tests (Node)"
if ! command -v node >/dev/null; then
    bad "node not found — cannot run the protocol tests"
else
    LOG=$(mktemp)
    node host/tests/run.mjs > "$LOG" 2>&1
    tail -14 "$LOG"
    if grep -q "ALL HOST PROTOCOL TESTS PASSED" "$LOG"; then
        ok "host protocol tests"
    else
        bad "host protocol tests"
    fi
    rm -f "$LOG"
fi

# ── 3b. PIO waveform ────────────────────────────────────────────────────────
# The LED bit loop is the one thing the C unit tests structurally cannot check:
# they assert on the packed DMA buffer, which was correct even while the PIO was
# emitting a waveform with no data in it. This simulates the loop instead.
hr "5/7  WS2812 PIO waveform"
if ! command -v python3 >/dev/null; then
    bad "python3 not found — cannot check the PIO timing"
else
    LOG=$(mktemp)
    python3 tools/pio_timing.py > "$LOG" 2>&1
    RC=$?
    cat "$LOG"
    if [[ $RC -eq 0 ]]; then ok "WS2812 bit timing"; else bad "WS2812 bit timing"; fi
    rm -f "$LOG"
fi

# ── 4b. board pin map ───────────────────────────────────────────────────────
# board.h, protocol.json and the HARDWARE.md solder table state the pin map three
# times for three different readers. Nothing generates one from another.
hr "4/7  board pin map (board.h vs protocol.json vs HARDWARE.md)"
if ! command -v python3 >/dev/null; then
    bad "python3 not found — cannot check the pin map"
else
    LOG=$(mktemp)
    python3 tools/check_board.py > "$LOG" 2>&1
    RC=$?
    cat "$LOG"
    if [[ $RC -eq 0 ]]; then ok "board pin map"; else bad "board pin map"; fi
    rm -f "$LOG"
fi

# ── 4b. USB descriptors ─────────────────────────────────────────────────────
# Also invisible to the C tests: the host build compiles hid_dev.c out entirely.
hr "6/7  USB descriptor structure"
if ! command -v python3 >/dev/null; then
    bad "python3 not found — cannot check the USB descriptors"
else
    LOG=$(mktemp)
    python3 tools/check_usb_descriptors.py > "$LOG" 2>&1
    RC=$?
    cat "$LOG"
    if [[ $RC -eq 0 ]]; then ok "USB descriptors"; else bad "USB descriptors"; fi
    rm -f "$LOG"
fi

# ── 6. optional: the real ARM image ─────────────────────────────────────────
if [[ $WANT_ARM == 1 ]]; then
    hr "7/7  cross-compile for the RP2040-Zero"
    if ! command -v arm-none-eabi-gcc >/dev/null; then
        bad "arm-none-eabi-gcc not found (apt install gcc-arm-none-eabi)"
    elif [[ ! -d "${PICO_SDK_PATH:-$ROOT/pico-sdk}" ]]; then
        bad "pico-sdk not found. Run ./scripts/setup.sh or set PICO_SDK_PATH"
    else
        export PICO_SDK_PATH="${PICO_SDK_PATH:-$ROOT/pico-sdk}"
        cmake -S firmware -B firmware/build -DPICO_BOARD=waveshare_rp2040_zero > /dev/null 2>&1
        LOG=$(mktemp)
        cmake --build firmware/build -j4 > "$LOG" 2>&1
        BUILD_RC=$?
        if [[ $BUILD_RC -ne 0 ]]; then
            grep -E "error:|undefined reference" "$LOG" | head -10
            bad "ARM build"
        elif [[ ! -f firmware/build/mpad3.uf2 ]]; then
            bad "ARM build produced no .uf2"
        else
            SIZE=$(stat -c%s firmware/build/mpad3.uf2 2>/dev/null || stat -f%z firmware/build/mpad3.uf2)
            ok "ARM build — firmware/build/mpad3.uf2 (${SIZE} bytes)"
            grep -E "FLASH:|RAM:" "$LOG" | sed 's/^/       /'
            python3 - "$SIZE" << 'PYEOF'
import struct, sys
# UF2 block header: magic0 magic1 flags targetAddr payloadSize blkNo numBlocks
#                   then fileSize — OR familyId when UF2_FLAG_FAMILY_ID_PRESENT.
FAMILY_PRESENT = 0x00002000
RP2040_FAMILY  = 0xE48BFF56
with open("firmware/build/mpad3.uf2", "rb") as f:
    data = f.read()
m0, m1, flags, target, psize, _, nblk, last = struct.unpack("<IIIIIIII", data[:32])
problems = []
if (m0, m1) != (0x0A324655, 0x9E5D5157): problems.append("bad UF2 magic")
if len(data) != nblk * 512:               problems.append(f"{len(data)} bytes is not {nblk} whole blocks")
if not flags & FAMILY_PRESENT:            problems.append("family-ID flag not set")
elif last != RP2040_FAMILY:               problems.append(f"family 0x{last:08X} is not the RP2040's")
if target != 0x10000000:                  problems.append(f"loads at 0x{target:08X}, not XIP flash")
if psize != 256:                          problems.append(f"payload {psize}, expected 256")
name = "RP2040" if last == RP2040_FAMILY else "WRONG BOARD"
print(f"       UF2: {nblk} blocks x {psize} B = {nblk*psize} B of image at 0x{target:08X}, family 0x{last:08X} ({name})")
if problems:
    print("       !! " + "; ".join(problems))
    sys.exit(1)
PYEOF
            [[ $? -ne 0 ]] && bad "UF2 sanity check"
        fi
        rm -f "$LOG"
    fi
else
    hr "7/7  cross-compile for the RP2040-Zero (skipped — pass --arm to run it)"
fi

hr "result"
if [[ $FAILED == 0 ]]; then
    printf '\033[32m  everything passed\033[0m\n\n'
    exit 0
else
    printf '\033[31m  something failed — see above\033[0m\n\n'
    exit 1
fi
