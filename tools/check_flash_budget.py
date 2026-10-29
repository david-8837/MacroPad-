#!/usr/bin/env python3
"""
check_flash_budget.py — make sure the firmware image stops where the OLED frame
region begins.

The panel's animation frames are `const` tables linked into the normal UF2
image, NOT a separately written frame store. The flash map reserves an unused
window for a possible future store:

    0x00000000 .. 0x001DFFFF  boot2 + app + baked frames    (ceiling 0x1E0000)
    0x001E0000 .. 0x001FDFFF  unused/reserved window       (120 KiB budget)
    0x001FE000 .. 0x001FFFFF  config A / config B           (2 x 4 KiB)

The animation-content budget is derived in src/oled/capacity.ts and asserted in
firmware/include/board.h. This script reads a built UF2 to check that the whole
image stays below the reserved window; it does not prove that frames are mapped
there or that the target board actually boots.

    python3 tools/check_flash_budget.py                    # auto-find a .uf2
    python3 tools/check_flash_budget.py path/to/mpad3.uf2
    python3 tools/check_flash_budget.py --firmware path/to/mpad3.uf2

Exit codes: 0 within budget, 1 over budget, 2 no artefact found (with --strict).

The .uf2 format is 512-byte blocks: magic0, magic1, flags, target address,
payload size, block number, block count, then the payload. No ELF parser and no
ARM toolchain needed, which is why this can run anywhere the build ran.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Mirrors board.h and src/oled/capacity.ts. Kept as literals on purpose: if they
# drift, the exporter and the host tests fail, and this script is the third
# opinion rather than the source of truth.
FLASH_BYTES = 2 * 1024 * 1024
FRAME_REGION_OFFSET = 0x1E0000
FRAME_REGION_BYTES = 0x1FE000 - FRAME_REGION_OFFSET  # 122 880 = 120 KiB
CONFIG_OFFSET = 0x1FE000

# RP2040 maps flash at 0x10000000, and UF2 target addresses are absolute. Every
# comparison here is in flash offsets, so the base is removed on read.
XIP_BASE = 0x10000000

UF2_MAGIC0 = 0x0A324655
UF2_MAGIC1 = 0x9E5D5157
UF2_BLOCK = 512


def read_uf2_extent(path: Path) -> tuple[int, int, int]:
    """Return (lowest address, highest exclusive address, block count)."""
    data = path.read_bytes()
    if len(data) % UF2_BLOCK != 0:
        raise ValueError(f"{path} is {len(data)} bytes, not a whole number of 512 B UF2 blocks")

    low = None
    high = 0
    blocks = 0
    for off in range(0, len(data), UF2_BLOCK):
        m0, m1, _flags, addr, size = struct.unpack_from("<IIIII", data, off)
        if m0 != UF2_MAGIC0 or m1 != UF2_MAGIC1:
            raise ValueError(f"bad UF2 magic at block {blocks} (offset {off})")
        if addr < XIP_BASE:
            raise ValueError(f"block {blocks} targets 0x{addr:08X}, below the XIP base")
        offset = addr - XIP_BASE
        if offset + size > FLASH_BYTES:
            raise ValueError(f"block {blocks} runs past the end of flash")
        low = offset if low is None else min(low, offset)
        high = max(high, offset + size)
        blocks += 1
    return (low or 0), high, blocks


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Check the firmware image against the OLED frame region.")
    ap.add_argument("artifact", nargs="?", help="path to mpad3.uf2")
    ap.add_argument("--firmware", dest="fw", help="same as the positional argument")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="fail (exit 2) when no .uf2 exists instead of reporting the limits only",
    )
    args = ap.parse_args(argv)

    print(f"flash           {FLASH_BYTES:>9,} B  (2 MiB)")
    print(f"app ceiling     {FRAME_REGION_OFFSET:>9,} B  (0x{FRAME_REGION_OFFSET:06X})")
    print(f"frame region    {FRAME_REGION_BYTES:>9,} B  (120 KiB, {FRAME_REGION_BYTES // 512} frames)")
    print(f"config sectors  {FLASH_BYTES - CONFIG_OFFSET:>9,} B  (2 x 4 KiB)")

    explicit = args.fw or args.artifact
    if explicit:
        candidates = [Path(explicit)]
    else:
        candidates = sorted((ROOT / "firmware" / "build").glob("*.uf2"))

    artefact = next((c for c in candidates if c.is_file()), None)
    if artefact is None:
        where = explicit or (ROOT / "firmware" / "build" / "*.uf2")
        if args.strict:
            print(f"\nno firmware image found at {where}", file=sys.stderr)
            return 2
        print(f"\nno firmware image at {where} — limits only, build with cmake to check a real image")
        return 0

    low, high, blocks = read_uf2_extent(artefact)
    used = high
    slack = FRAME_REGION_OFFSET - used
    print(f"\nimage           {used:>9,} B  ({used / 1024:.1f} KiB, {blocks} UF2 blocks)")
    print(f"  occupies      flash offset 0x{low:06X} .. 0x{high - 1:06X}")
    print(f"  headroom      {slack:>9,} B  ({slack / 1024:.1f} KiB below the frame region)")

    if high > FRAME_REGION_OFFSET:
        over = high - FRAME_REGION_OFFSET
        print(
            f"\nOVER BUDGET: the image runs {over:,} B into the OLED frame region.\n"
            "  Either shrink the firmware, cut a loop with\n"
            "  `node scripts/export-oled-frames.mjs`, or move BOARD_OLED_FRAME_REGION_OFFSET\n"
            "  down in firmware/include/board.h and update src/oled/capacity.ts to match.",
            file=sys.stderr,
        )
        return 1
    if high > CONFIG_OFFSET:
        print("\nOVER BUDGET: the image overlaps the config sectors.", file=sys.stderr)
        return 1

    print("\nOK: the image stops before the frame region and the config sectors.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
