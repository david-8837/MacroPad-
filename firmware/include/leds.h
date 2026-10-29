/*
 * leds.h — nine planned pixel positions; actual cuttable strip is unselected.
 * Default target builds hold GP10 LOW after initialization. The PIO/DMA path
 * exists only in deliberately bench-enabled builds, pending a verified strip,
 * supply budget and physical measurements.
 *
 * The split that matters:
 *   led_engine_t / led_compute_frame()  — pure colour maths, no hardware, tested on PC
 *   led_hw_*()                          — gated GPIO or bench PIO + DMA, target only
 *
 * Keeping them apart means the rainbow you see in the browser preview and the
 * rainbow on the pad come from the same code, and means firmware/tests can
 * assert exact RGB values instead of eyeballing a photo.
 *
 * ── Why PIO and not bit-banging ────────────────────────────────────────────
 * The Normand SK6812MINI-E Rev.02 requires 0/1 high pulses of 200..400 ns and
 * 580..1000 ns, a bit period >=1.2 us, and >80 us low for reset. The 10 MHz
 * PIO runs both 13-cycle bit paths at 1.30 us (about 281 us for nine pixels),
 * fed by DMA so USB/scan interrupts cannot distort individual bits. A guard
 * after each completed frame allows the last word to shift and the reset to
 * finish before the next frame, including back-to-back LED_TEST commands.
 * tools/pio_timing.py checks the source timings **for that reference part**;
 * the purchased strip may have different requirements. It cannot replace a
 * scope, a current-limited supply or a physical power-enable arrangement.
 *
 * ── Wiring reminder ───────────────────────────────────────────────────────
 * Data chain is ONE wire: GP10 -> non-inverting 74AHCT1G125 A -> Y -> 330R
 * -> LED0 DIN -> LED0 DOUT -> LED1 DIN -> ... -> LED8. Buffer /OE to GND;
 * common GND and 5 V LED supply. Do not wire pixels in parallel.
 */
#ifndef LEDS_H
#define LEDS_H

#include <stdbool.h>
#include <stdint.h>

#include "config.h"

/* Hardware pixel buffer, GRB order for the PIO program. */
typedef struct {
    uint8_t g, r, b;
} led_pixel_t;

typedef struct {
    led_pixel_t px[CFG_LED_COUNT];
    uint8_t count;
} led_frame_t;

/* What the engine needs to know about the physical world this tick. */
typedef struct {
    uint16_t key_down_mask; /* keys currently held: drives REACTIVE mode */
    uint16_t key_hit_mask;  /* keys that just registered a gesture this frame */
    uint8_t channel;        /* active channel */
    uint32_t now_ms;
    uint8_t master_brightness; /* 0..255, applied on top of per-channel value */
    uint8_t idle_override;     /* if 255, ignored; else forces brightness */
} led_state_t;

/* Per-key reactive decay state. */
typedef struct {
    uint8_t level[CFG_LED_COUNT];
    uint32_t last_ms;
} led_engine_t;

void led_engine_init(led_engine_t *e);

/* Pure: compute one frame. Writes `count` pixels. No hardware access. */
void led_compute_frame(const led_engine_t *cfg, const cfg_lighting_t *L, const led_state_t *st,
                       led_frame_t *out);

/* ---- hardware layer (target only) --------------------------------------- */
void led_hw_init(void);
void led_hw_show(const led_frame_t *f);
void led_hw_blank(void); /* bench: queue black frame; gated: keep GP10 LOW */
#ifdef LEDS_NO_HW
/* Host-only fake hardware observation for protocol tests. */
const led_frame_t *led_host_last_frame(void);
#endif

/* Pure packer used by the real DMA path: upper 24 bits carry GRB (or RGB).
 * The lower byte is unused because the PIO shifts left and autopulls at 24 bits. */
uint32_t led_pack_pio_word(uint8_t r, uint8_t g, uint8_t b);

/* ---- bounded raw bench test (CMD_LED_TEST) ------------------------------ */
/* Only a bench-enabled build may use exact unscaled bytes; the output is
 * otherwise gated LOW. The test expires automatically and the normal engine
 * resumes; zero RGB is NOT a persistent off/restore command. */
#define LED_TEST_HOLD_MS 300u
void led_host_test_override(const uint8_t *rgb24, uint32_t now_ms); /* 9 x 3 RGB bytes */
bool led_host_test_active(uint32_t now_ms);
void led_host_test_clear(void);

/* ---- colour helpers (pure, shared with the host preview) ---------------- */
void hsv_to_rgb(uint16_t hue, uint8_t sat, uint8_t val, uint8_t *r, uint8_t *g, uint8_t *b);
/* Apply the gamma table then scale by brightness/255. Integer only. */
uint8_t led_gamma_scale(uint8_t v, uint8_t brightness);

#endif /* LEDS_H */
