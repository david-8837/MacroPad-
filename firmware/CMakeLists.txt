cmake_minimum_required(VERSION 3.16)

# ─────────────────────────────────────────────────────────────────────────────
# Build:
#   export PICO_SDK_PATH=/path/to/pico-sdk      (or pass -DPICO_SDK_PATH=...)
#   cmake -B build -DPICO_BOARD=waveshare_rp2040_zero
#   cmake --build build -j
#   -> build/mpad3.uf2   (drag onto the RPI-RP2 drive)
#
# Target: Waveshare RP2040-Zero. The board header in pico-sdk sets
# PICO_PLATFORM=rp2040 (Cortex-M0+) and PICO_FLASH_SIZE_BYTES=2MB and selects the
# W25Q080 boot stage 2, so all three follow from PICO_BOARD and nothing here has
# to restate them.
#
# FLASH SIZE IS THE ONE THAT BITES. 2 MB, not the 4 MB an XIAO RP2350 has.
# firmware/include/board.h puts the saved config in the last two 4 KiB sectors
# (0x1FE000 / 0x1FF000) and that arithmetic is derived from
# BOARD_FLASH_SIZE_BYTES, which must agree with PICO_FLASH_SIZE_BYTES. If you
# move to a board with a different flash chip, change both.
# ─────────────────────────────────────────────────────────────────────────────

set(PICO_BOARD "waveshare_rp2040_zero" CACHE STRING "Target board")

# The SDK must be found before project().
if(DEFINED ENV{PICO_SDK_PATH} AND NOT PICO_SDK_PATH)
    set(PICO_SDK_PATH $ENV{PICO_SDK_PATH})
endif()
if(NOT PICO_SDK_PATH)
    # Fall back to the copy checked out next to this repo by scripts/setup.sh.
    set(PICO_SDK_PATH "${CMAKE_CURRENT_LIST_DIR}/../pico-sdk")
endif()
include(${PICO_SDK_PATH}/pico_sdk_init.cmake)

project(mpad3 C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

# Warnings on: an uninitialised action slot or a signed/unsigned mixup in the
# gesture timing maths is exactly the kind of bug that shows up as "sometimes the
# key does nothing", so treat it as noise you can afford to fix.
#
# -Wconversion and -Wsign-conversion are deliberately NOT enabled. pico-sdk and
# TinyUSB do not build cleanly under them (every pio_add_program / dma_channel_*
# call takes an int where a uint is wanted), so enabling them produces ~200
# warnings from other people's headers and buries the one from your code that
# matters. The host test build in Makefile.host is where the strict flags live,
# because there the only headers are ours.
add_compile_options(-Wall -Wextra -Wno-unused-parameter -Wshadow -Wdouble-promotion
                    -fno-exceptions)

add_executable(mpad3
    src/main.c
    src/core/actions.c
    src/core/ascii_cmd.c
    src/core/channel.c
    src/core/crc.c
    src/core/dispatch.c
    src/core/events.c
    src/core/gesture.c
    src/core/oled_playlist.c
    src/core/oled_stream.c
    src/core/protocol.c
    src/drivers/oled.c
    src/drivers/oled_frames.c
    src/drivers/oled_runtime.c
    src/drivers/scan.c
    src/lighting/leds.c
    src/storage/config_defaults.c
    src/storage/config_store.c
    src/storage/flash_store.c
    src/usb/hid_dev.c
    src/usb/usb_proto.c
)

target_include_directories(mpad3 PRIVATE
    include
    src/usb           # tusb_config.h must be on the include path for TinyUSB
)

target_compile_definitions(mpad3 PRIVATE
    FW_BUILD=1
    PICO_XOSC_STARTUP_DELAY_MULTIPLIER=64   # slower-crystal tolerance; the board
                                            # header sets the same value, and
                                            # restating it here keeps a custom
                                            # board from silently losing it
    # TinyUSB device: keyboard + consumer + CDC. See tusb_config.h.
    CFG_TUSB_CONFIG_FILE="tusb_config.h"
)

# An unspecified LED strip and unbudgeted 5 V rail must not light on first
# power-up. Bench-only opt-in is explicit and never stored in flash config.
option(MPAD_KEYS_ONLY "Build for the keys-and-knob model without OLED or LEDs" OFF)
option(MPAD_BENCH_LED_OUTPUT "Enable LED output for a current-limited bench setup only" OFF)
if(MPAD_KEYS_ONLY AND MPAD_BENCH_LED_OUTPUT)
    message(FATAL_ERROR "The keys-and-knob model has no LED output")
endif()
if(MPAD_KEYS_ONLY)
    target_compile_definitions(mpad3 PRIVATE BOARD_KEYS_ONLY=1)
endif()
if(MPAD_BENCH_LED_OUTPUT)
    target_compile_definitions(mpad3 PRIVATE BOARD_LED_OUTPUT_ENABLED=1)
endif()

# Generate the PIO header from the .pio source at configure time.
pico_generate_pio_header(mpad3 ${CMAKE_CURRENT_LIST_DIR}/src/lighting/ws2812minie.pio)

target_link_libraries(mpad3 PRIVATE
    pico_stdlib
    pico_bootrom
    hardware_pio
    hardware_dma
    hardware_flash
    hardware_clocks
    hardware_gpio
    hardware_i2c
    hardware_watchdog
    tinyusb_device
    tinyusb_board
)

# One USB CDC interface that WE own, no SDK stdio (see the comment in main.c).
pico_enable_stdio_usb(mpad3 0)
pico_enable_stdio_uart(mpad3 0)

# Produce .uf2 (what you drag onto the board), .hex and .bin.
pico_add_extra_outputs(mpad3)

# Map file: worth keeping. When flash gets tight or a stack overflow shows up,
# mpad3.map is the only thing that tells you which module ate the space.
target_link_options(mpad3 PRIVATE -Wl,--print-memory-usage)
