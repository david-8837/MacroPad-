/*
 * board.h — hardware truth for the 4-channel macropad on a Waveshare RP2040-Zero.
 *
 * EVERYTHING physical lives in this file. If you re-route a wire, you change it
 * here and nowhere else.
 *
 * ── The board, and what changed from an XIAO RP2350 ────────────────────────
 * Waveshare RP2040-Zero: RP2040, dual Cortex-M0+ @ 133 MHz, 264 kB RAM,
 * 2 MB QSPI flash, USB-C, castellated edges so it can be soldered flat to a PCB.
 *
 *   * Flash is 2 MB, NOT 4 MB. The config sectors therefore live at 0x1FE000 /
 *     0x1FF000. Getting this wrong does not fail loudly — it writes your config
 *     into flash the chip does not have, or over the firmware. See below.
 *   * The main header is 23 pins: 5V, GND, 3V3, then 20 GPIO — GP0..GP15 and
 *     GP26..GP29. All of them are castellated header pins, so nothing here needs
 *     underside soldering. GP16 is not among them: it drives the board's own
 *     WS2812. GP17..GP25 come out only on the two 5-pin headers on the back and
 *     on solder pads, and are not used.
 *
 *     Worth knowing because it is easy to get wrong from the SDK: pico-sdk's
 *     boards/waveshare_rp2040_zero.h only #defines pins for GP0..GP10 and
 *     GP26..GP29, which reads like "15 GPIOs are broken out". That is the SDK
 *     being conservative about which pins it has named constants for, not a
 *     statement about the hardware. Waveshare's own schematic and the board's
 *     silkscreen both show 23 header positions with GP0..GP15 present.
 *   * GP16 drives the board's own onboard WS2812 and is not broken out. Do not
 *     plan around it.
 *   * No hardware floating point (M0+), so the LED and gesture code stay integer.
 *     They already were.
 *   * PICO_BOARD=waveshare_rp2040_zero in the SDK, which also selects the
 *     W25Q080 boot stage 2 for the 2 MB flash part.
 *
 * ── Wiring decision: DIRECT, one GPIO per key (no matrix, no diodes) ────────
 * You are hand soldering this, so it assumes the wiring that is hardest to get
 * wrong by hand:
 *
 *   GPIO(n) ── [normally-open switch] ── GND
 *                 internal pull-up to 3V3 is INSIDE the RP2040
 *
 *   Press -> pin LOW. Release -> pin HIGH. Do NOT wire a switch to 3V3/5V:
 *   the old sketch wrongly connected 3V3 directly to GND. Check for a short
 *   between the rails before applying power. No diodes or row/col wiring.
 *
 * A 3x3 matrix would save 3 GPIOs but cost 9 hand-soldered diodes, and on a
 * 9-key pad a solder bridge between two adjacent pads looks exactly like a stuck
 * key. Not a trade worth making. If you change your mind, see MATRIX mode at the
 * bottom of this file — the scanner supports both from one config table.
 *
 * ── GPIO budget ────────────────────────────────────────────────────────────
 *
 *   Function        GPIO      Header pin    Notes
 *   ------------    -------   ----------    ---------------------------------
 *   Key K0..K6      0..6      23..17        direct to GND, pull-up enabled
 *   Key K7          11        12            direct to GND, pull-up enabled
 *   Key K8          12        11            direct to GND, pull-up enabled
 *   Encoder A       7         16            to GND, pull-up enabled
 *   Encoder B       8         15            to GND, pull-up enabled
 *   Encoder SW      9         14            to GND, pull-up enabled
 *   LED data        10        13            -> buffer A; Y -> 330R -> LED0 DIN
 *   OLED SDA        28        5             I2C0, required, pull-up to 3V3
 *   OLED SCL        29        4             I2C0, required, pull-up to 3V3
 *   USB             -         USB-C         native, handled by TinyUSB
 *
 *   That is 15 of the 20 header GPIOs. Spare: GP13, GP14, GP15, GP26,
 *   GP27. GP28/GP29 are occupied by the OLED, so ADC0/ADC1 (GP26/GP27)
 *   remain available for a future analogue input. An earlier version of this map put
 *   K7/K8 on GP26/GP27 to work around a 15-GPIO limit that turned out not to
 *   exist; it cost both ADC0 and ADC1 for two digital keys.
 *
 *   Header pin numbers assume USB-C pointing up, front (component) side facing
 *   you, pin 1 = 5V at the top-left, counting counter-clockwise: the left column
 *   is pins 1..11 top to bottom (5V, GND, 3V3, GP29, GP28, GP27, GP26, GP15,
 *   GP14, GP13, GP12) and the right column is pins 12..23 bottom to top (GP11,
 *   GP10, GP9, GP8, GP7, GP6, GP5, GP4, GP3, GP2, GP1, GP0). That is the
 *   Waveshare schematic's own numbering for header P1. tools/check_board.py
 *   derives this table and cross-checks it against docs/HARDWARE.md and
 *   protocol.json, so the three cannot drift apart silently. Still confirm
 *   against your board's silkscreen before soldering.
 *
 * ── LED electrical notes ───────────────────────────────────────────────────
 * The referenced Normand SK6812MINI-E Rev.02 lists VDD 3.7..5.5 V (not the old
 * 3.3..5.8 V claim) and VIH >= 0.7 x VDD at 5 V. Confirm the exact purchased
 * part before wiring. At 5 V, VIH >= 3.5 V, so GP10's 3.3 V output needs the
 * specified 74AHCT1G125 supplied at 5 V: GP10 -> A, Y -> 330R -> LED0 DIN,
 * /OE -> GND, with a common GND and a 100 nF VCC bypass cap. The AHCT buffer
 * is NON-INVERTING; /OE is an enable, not a data pin. Do not substitute AHC
 * without checking its input-high requirement. A 3V3-powered LED chain is NOT
 * specified for the referenced SK6812MINI-E variant.
 *
 * Nine full-white LEDs would draw ~540 mA IF each colour drew 20 mA; this is
 * only a planning example, not a measured value for the as-yet-unselected strip
 * or a safe USB/regulator budget. The default build gates physical LED data,
 * while a bench build still allows full brightness and raw LED_TEST unscaled.
 * See docs/HARDWARE.md for the supply/power-sequencing and commissioning plan;
 * GP10 LOW after firmware init does NOT disconnect 5 V, guarantee boot/reset
 * darkness, or clear a pixel whose prior colour remains latched.
 *
 * Keep 330R between buffer Y and LED0 DIN, and 10..47 uF across LED 5V/GND
 * at the first LED.
 */
#ifndef BOARD_H
#define BOARD_H

/* Keys-and-knob model: no external display or lighting hardware. The full
 * model remains the default; serialized configuration layout stays identical. */
#ifndef BOARD_KEYS_ONLY
#define BOARD_KEYS_ONLY 0
#endif
#if BOARD_KEYS_ONLY != 0 && BOARD_KEYS_ONLY != 1
#error "BOARD_KEYS_ONLY must be 0 or 1"
#endif

/* ---- keys: direct wiring, one pin each, active LOW ------------------------ */
#define BOARD_KEY_COUNT 9

/* Physical order = the pad's key index, left-to-right then top-to-bottom:
 *
 *   K0  K1  K2        index 0 1 2
 *   K3  K4  K5   ->           3 4 5
 *   K6  K7  K8                6 7 8
 *
 * The knob sits above K0/K1 and is NOT part of this array; it is encoder_*().
 */
#define BOARD_KEY_PINS                                                               \
    {                                                                                \
        0, 1, 2, 3, 4, 5, 6, 11, 12                                                  \
    }

/* 1 = key press pulls the pin LOW (direct-to-GND wiring).                    */
#define BOARD_KEYS_ACTIVE_LOW 1

/* ---- rotary encoder: mechanical, common pin to GND ----------------------- */
#define BOARD_ENC_A_PIN 7
#define BOARD_ENC_B_PIN 8
#define BOARD_ENC_SW_PIN 9

/* Encoder electrical resolution. A full detent (one click) on the common
 * EC11-style encoder = 4 half-steps, and 20 detents per revolution. If your
 * encoder clicks 12 or 24 times per turn, fix ENC_DETENTS_PER_REV instead of
 * the half-step count. */
#define BOARD_ENC_HALF_STEPS_PER_DETENT 4
#define BOARD_ENC_DETENTS_PER_REV 20

/* ---- LED strip: 1 per key, driven by PIO from one pin -------------------- */
#define BOARD_LED_COUNT 9
#define BOARD_LED_PIN 10 /* header pin 13. GP16 is the board's own WS2812, not used */

/* FAIL CLOSED until the actual cuttable strip, its chipset/timing, 5 V supply,
 * allocated LED current and current-limited bench setup are identified. The
 * existing PIO timing targets a *reference* Normand SK6812MINI-E Rev.02, not
 * every addressable strip. Default builds hold GP10 LOW and refuse LED_TEST;
 * host settings may still be edited/saved but cannot light a strip.
 * Only opt in for a deliberate bench build via -DMPAD_BENCH_LED_OUTPUT=ON.
 * That opt-in is NOT evidence the strip or power budget is safe for normal USB
 * use: confirm part specifications and measure actual voltage/current/waveform
 * before considering any production enable. No saved config can lift this gate. */
#ifndef BOARD_LED_OUTPUT_ENABLED
#define BOARD_LED_OUTPUT_ENABLED 0
#endif
#if BOARD_KEYS_ONLY && BOARD_LED_OUTPUT_ENABLED
#error "The keys-only model cannot enable LED output"
#endif
#if BOARD_LED_OUTPUT_ENABLED != 0 && BOARD_LED_OUTPUT_ENABLED != 1
#error "BOARD_LED_OUTPUT_ENABLED must be 0 or 1"
#endif

/* The reference Normand SK6812MINI-E uses GRB. Check the exact strip's protocol
 * and colour order before bench output. This setting only selects GRB or RGB;
 * it cannot adapt RGBW, a different voltage, or incompatible bit timing. */
#define BOARD_LED_RGB_ORDER 0 /* 0 = GRB, 1 = RGB */

/* The serialized led_invert_output byte predates the non-inverting AHCT
 * buffer. Keep its legacy factory value so old config files and host defaults
 * agree, but it is NOT a GPIO control. The PIO always drives GP10 normally;
 * never invert GPIO output-enable or data for the specified 74AHCT1G125.
 * The actual signal still requires a scope/LED bench check. */
#define BOARD_LED_LEGACY_INVERT_DEFAULT 1

/* ---- required 128x32 SSD1306 OLED on I2C0 ------------------------------- */
/* User-selected Waveshare RP2040-Zero wiring: GP28 -> SDA, GP29 -> SCL,
 * 3V3 -> VCC/pull-ups, GND -> GND. Do NOT connect 5 V pull-ups to the RP2040.
 * Some four-pin modules have built-in pull-ups; otherwise fit external ~4.7k
 * resistors to 3V3. Firmware probes for an ACK and reports OLED capability
 * only when the physical display is responding. */
#if !BOARD_KEYS_ONLY
#define BOARD_OLED_PRESENT 1
#else
#define BOARD_OLED_PRESENT 0
#endif
#define BOARD_OLED_SDA_PIN 28
#define BOARD_OLED_SCL_PIN 29
#define BOARD_OLED_I2C_INST 0 /* i2c0 */
#define BOARD_OLED_ADDR 0x3C

/* ---- flash: where the saved config lives -------------------------------- */
/* THE NUMBER THAT CHANGED WITH THIS BOARD.
 *
 * pico_flash_program wants an OFFSET from the start of flash, and the RP2040-Zero
 * has 2 MB of it, not the 4 MB an XIAO RP2350 has. We reserve the last two 4 KiB
 * sectors so a firmware update can never overwrite config and a config write can
 * never brick the firmware:
 *
 *   0x000000 .. 0x1FDFFF   firmware (~40 KB used, so ~2 MB of headroom)
 *   0x1FE000 .. 0x1FEFFF   config sector A
 *   0x1FF000 .. 0x1FFFFFF  config sector B
 *
 * If you ever fit a board with a different flash size, this is the constant to
 * change — and PICO_FLASH_SIZE_BYTES in CMakeLists.txt must agree with it. */
#define BOARD_FLASH_SIZE_BYTES (2 * 1024 * 1024)
#define BOARD_CONFIG_SECTOR_A_OFFSET (BOARD_FLASH_SIZE_BYTES - 0x2000u)
#define BOARD_CONFIG_SECTOR_B_OFFSET (BOARD_FLASH_SIZE_BYTES - 0x1000u)
#define BOARD_CONFIG_SECTOR_SIZE 0x1000u

/* ---- OLED animation budget / future frame window ------------------------ */
/* Baked frames are `const` tables linked into the APPLICATION IMAGE and read
 * from XIP flash, not written to the upper flash window below. The 120 KiB
 * number is a content budget for those tables; the window is reserved for a
 * possible future independently writable frame store, but is UNUSED today.
 * Do not claim that reflash preserves baked artwork: it belongs to the UF2.
 *
 *   app image (including baked frames)  0x00000000 .. 0x001DFFFF
 *   reserved, currently unused         0x001E0000 .. 0x001FDFFF (120 KiB)
 *   saved config A/B                    0x001FE000 .. 0x001FFFFF (8 KiB)
 *
 * src/oled/capacity.ts limits baked table bytes, and check_flash_budget.py
 * enforces that the *whole* image stays below the unused window. */
#define BOARD_OLED_FRAME_REGION_OFFSET 0x1E0000u
#define BOARD_OLED_FRAME_REGION_BYTES                                                          \
    (BOARD_CONFIG_SECTOR_A_OFFSET - BOARD_OLED_FRAME_REGION_OFFSET) /* 122 880 = 120 KiB */
#define BOARD_OLED_FRAME_BYTES 512u                                     /* 128 x 32 / 8      */
#define BOARD_OLED_FRAME_SLOTS (BOARD_OLED_FRAME_REGION_BYTES / BOARD_OLED_FRAME_BYTES) /* 240 */

_Static_assert(BOARD_OLED_FRAME_REGION_OFFSET % BOARD_CONFIG_SECTOR_SIZE == 0,
               "frame region must start on an erase-sector boundary");
_Static_assert(BOARD_OLED_FRAME_REGION_BYTES % BOARD_OLED_FRAME_BYTES == 0,
               "frame region must hold a whole number of frames");
_Static_assert(BOARD_OLED_FRAME_REGION_OFFSET + BOARD_OLED_FRAME_REGION_BYTES ==
                   BOARD_CONFIG_SECTOR_A_OFFSET,
               "frame region must end where the config sectors begin");

/* ---- CPU ---- */
/* 133 MHz is the RP2040 maximum and the SDK default. Stated explicitly because
 * the PIO clock divider in leds.c is computed from clock_get_hz(), and a silent
 * change of system clock would quietly change the LED bit timing out of spec. */
#define BOARD_SYS_CLOCK_KHZ 133000

/* ---- matrix mode (unused by default, kept so you can switch wiring) ------ */
/* Set BOARD_SCAN_MODE_MATRIX to 1 and fill in the row/col tables; scan.c
 * compiles the matrix path instead of the direct path. Diodes required,
 * cathode to the row pin, anode to the col pin. */
#define BOARD_SCAN_MODE_MATRIX 0
#define BOARD_MATRIX_ROWS 3
#define BOARD_MATRIX_COLS 3
#define BOARD_MATRIX_ROW_PINS                                                                  \
    {                                                                                        \
        0, 1, 2                                                                              \
    }
#define BOARD_MATRIX_COL_PINS                                                                  \
    {                                                                                        \
        3, 4, 5                                                                              \
    }

#endif /* BOARD_H */
