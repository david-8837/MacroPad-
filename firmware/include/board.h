/*
 * board.h — hardware truth for the 3-channel macropad on a Waveshare RP2040-Zero.
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
 *   3.3V ──┬── key ──┬── GPIO(n)      (internal pull-up ON, pin reads 1 idle)
 *          │         │
 *         GND      (nothing else)
 *
 *   Press  -> pin goes LOW.  Release -> pin goes HIGH.
 *   No diodes, no row/col wiring, no ghosting, and you can check every key with a
 *   multimeter in continuity mode without desoldering anything.
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
 *   LED data        10        13            -> 330R -> DIN of LED0
 *   OLED SDA        28        5             I2C0, optional, needs 4.7k pull-ups
 *   OLED SCL        29        4             I2C0, optional
 *   USB             -         USB-C         native, handled by TinyUSB
 *
 *   That is 14 of the 20 header GPIOs with the OLED fitted, 12 without. Spare:
 *   GP13, GP14, GP15, GP26, GP27 — and GP26..GP29 are the ADC-capable ones, so
 *   keeping keys off them leaves all four ADC channels free for a later analogue
 *   knob, a battery divider, or a light sensor. An earlier version of this map put
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
 * SK6812MINI-E datasheet: VDD 3.3..5.8 V, VIH = 0.7 x VDD.
 *
 *   * Powered from the board's 5V pin: VIH = 3.5 V. The RP2040 outputs 3.3 V, so
 *     it is 200 mV SHORT of spec. That is exactly the case the 74AHCT1G125 is
 *     for, so keep it — but note the trap: a 74A**HCT** part needs VIH = 2.0 V and
 *     the RP2040's 3.3 V drives it happily. A plain 74AHC (no T) would need 3.5 V
 *     and would NOT work here. Check the marking on the chip you bought.
 *   * Powered from 3V3 instead: VIH = 2.31 V, so the RP2040 drives it directly
 *     and you can drop the shifter. But 3V3 is the wrong rail for this load. The
 *     ME6217C33M5G is rated 800 mA, which reads like plenty, except that it is a
 *     LINEAR regulator in a SOT-23-5: from a 5 V input it dissipates (5 - 3.3) x I
 *     as heat, so 540 mA for nine LEDs at full white is 0.92 W in a package with
 *     roughly 250 C/W junction-to-ambient. It has thermal shutdown and will use
 *     it, dropping the rail and taking the RP2040 with it - which presents as a
 *     random reboot whenever the LEDs go bright. The practical continuous figure
 *     is ~250 mA total including the board's own ~50-90 mA, so ~150-200 mA of LED
 *     current. docs/HARDWARE.md has the arithmetic.
 *
 * Keep the 330R in series with DIN and the 10..47 uF across the LED 5V/GND at
 * the FIRST LED, not near the board. Those two parts are what stop the first LED
 * from flickering when the strip inrushes.
 */
#ifndef BOARD_H
#define BOARD_H

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

/* The SK6812MINI-E is GRB like the WS2812B, but batches vary. Set this to 1 if
 * you find red and green swapped — it is a batch thing and swapping it in
 * software costs nothing. */
#define BOARD_LED_RGB_ORDER 0 /* 0 = GRB, 1 = RGB */

/* Data polarity: the PIO program can invert for free through the pad's GPIO
 * override, which is what makes an N-channel level shifter usable in the data
 * path. 1 = the board drives the shifter's /OE, so a logic 1 at the RP2040
 * becomes a logic 1 at DIN. Set to 0 if you drop the shifter. */
#define BOARD_LED_INVERT_OUTPUT 1

/* ---- optional OLED on I2C0 (declared, not driven in this build) ---------- */
/* GP28 = I2C0 SDA and GP29 = I2C0 SCL on the RP2040, and both are header pins
 * (5 and 4, at the top of the left column next to 3V3 — which is convenient,
 * since the pull-ups want to go to 3V3 anyway). GP4/GP5 are the other I2C0 pair
 * and are left free here. */
#define BOARD_OLED_PRESENT 0 /* set to 1 and implement oled.c when you fit it */
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
