#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — get a machine from nothing to a built .uf2.
#
#   ./scripts/setup.sh          install deps + fetch pico-sdk + build
#   ./scripts/setup.sh --check  just report what is present and what is missing
#
# Debian/Ubuntu package names. On macOS use: brew install cmake gcc-arm-none-eabi
# and clone the SDK manually (the script will tell you where to put it).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
SDK_DIR="${PICO_SDK_PATH:-$ROOT/pico-sdk}"
SDK_VERSION="2.1.1"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

have() { command -v "$1" >/dev/null 2>&1; }
need() { printf '  \033[31mmissing\033[0m  %s\n' "$1"; MISSING=1; }
got()  { printf '  \033[32mok\033[0m      %s\n' "$1"; }

MISSING=0
echo "Checking toolchain:"
for tool in gcc make cmake node arm-none-eabi-gcc git; do
    if have "$tool"; then got "$tool ($($tool --version 2>&1 | head -1 | cut -c1-60))"; else need "$tool"; fi
done

if [[ $CHECK_ONLY == 1 ]]; then
    echo
    if [[ -d "$SDK_DIR" ]]; then got "pico-sdk at $SDK_DIR"; else need "pico-sdk at $SDK_DIR"; fi
    echo
    [[ $MISSING == 0 ]] && { echo "Ready. Run: ./scripts/test-all.sh --arm"; exit 0; }
    echo "Install what is missing above, then re-run."
    exit 1
fi

if [[ $MISSING == 1 ]]; then
    echo
    echo "Installing build dependencies (needs sudo)..."
    if have apt-get; then
        sudo apt-get update -qq
        sudo apt-get install -y -qq cmake gcc-arm-none-eabi libnewlib-arm-none-eabi \
            libstdc++-arm-none-eabi-newlib picolibc-arm-none-eabi build-essential git
    else
        echo "  Not a Debian/Ubuntu system — install cmake, an arm-none-eabi cross"
        echo "  compiler, newlib, and git yourself, then re-run this script."
        exit 1
    fi
fi

# ── pico-sdk ────────────────────────────────────────────────────────────────
# Cloned, not vendored: it is ~60 MB with the TinyUSB submodule, and pinning it
# in your repo would make every clone of your project download it twice.
if [[ ! -d "$SDK_DIR" ]]; then
    echo
    echo "Cloning pico-sdk $SDK_VERSION into $SDK_DIR ..."
    git clone --depth 1 --branch "$SDK_VERSION" --recurse-submodules --shallow-submodules \
        https://github.com/raspberrypi/pico-sdk.git "$SDK_DIR" || {
        echo "Clone failed. Do it manually:"
        echo "  git clone --branch $SDK_VERSION --recurse-submodules https://github.com/raspberrypi/pico-sdk.git $SDK_DIR"
        exit 1
    }
else
    echo
    echo "pico-sdk already present at $SDK_DIR"
fi

# The TinyUSB submodule is what provides the HID and CDC classes. A plain
# --depth 1 clone of the SDK leaves it empty and the build then fails with
# "hid_device.h: No such file", which does not point at the real cause.
if [[ ! -f "$SDK_DIR/lib/tinyusb/src/class/hid/hid_device.h" ]]; then
    echo "Fetching the TinyUSB submodule (this is what the HID/CDC classes come from)..."
    (cd "$SDK_DIR" && git submodule update --init --depth 1 lib/tinyusb)
fi

echo
echo "Building firmware..."
export PICO_SDK_PATH="$SDK_DIR"
cmake -S firmware -B firmware/build -DPICO_BOARD=waveshare_rp2040_zero || exit 1
cmake --build firmware/build -j4 || exit 1

echo
if [[ -f firmware/build/mpad3.uf2 ]]; then
    echo "  \033[32mBuilt:\033[0m firmware/build/mpad3.uf2"
    echo
    echo "To flash: hold the RP2040-Zero's BOOT button, plug in USB-C, release,"
    echo "then copy mpad3.uf2 onto the RPI-RP2 drive that appears."
    echo
    echo "To run the tests: ./scripts/test-all.sh"
else
    echo "  Build did not produce a .uf2 — see the errors above."
    exit 1
fi
