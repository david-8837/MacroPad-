/*
 * leds.h — 9 x SK6812MINI-E, one under each key, driven by PIO.
 *
 * The split that matters:
 *   led_engine_t / led_compute_frame()  — pure colour maths, no hardware, tested on PC
 *   led_hw_*()                          — PIO + DMA, only compiles for the target
 *
 * Keeping them apart means the rainbow you see in the browser preview and the
 * rainbow on the pad come from the same code, and means firmware/tests can
 * assert exact RGB values instead of eyeballing a photo.
 *
 * ── Why PIO and not bit-banging ────────────────────────────────────────────
 * SK6812MINI-E timing is ~300 ns / 600 ns with a +/-150 ns tolerance. At the
 * RP2040's 133 MHz one cycle is 7.5 ns, so a 250 ns pulse is 33 cycles — and the
 * Cortex-M0+ has no branch-prediction-free pipeline to hide behind, no hardware
 * divide, and every GPIO write is a store to a memory-mapped register whose cost
 * depends on bus arbitration with the other core and the DMA. You can bit-bang
 * this, but only with interrupts off for the whole frame, and this firmware has a
 * USB stack and a 1 ms scan tick that both need them. One stray interrupt mid-byte
 * shows up as an LED three keys away flashing the wrong colour, which is maddening
 * to debug because it is intermittent and never where you look first.
 *
 * PIO runs the waveform from its own state machine at its own clock, fed by DMA,
 * so interrupts are irrelevant and the CPU is free during the whole 176 us frame.
 * tools/pio_timing.py simulates the resulting bit loop and checks it against the
 * datasheet windows — see ws2812minie.pio for the cycle-by-cycle breakdown, and
 * for the two ways this loop was written wrong before it was written right.
 *
 * ── Wiring reminder ───────────────────────────────────────────────────────
 * Data chain is ONE wire: GP10 -> 330R -> LED0 DIN -> LED0 DOUT -> LED1 DIN
 * -> ... -> LED8. Do not wire them in parallel; they are a shift register.
 * See board.h for the 74AHCT1G125 note (AHC vs AHCT matters here).
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
void led_hw_blank(void); /* drive the line low for the 300 us reset */

/* ---- raw override (CMD_LED_TEST) --------------------------------------- */
/* When set, led_hw_show pushes these bytes instead of the engine's frame. Used
 * by the wiring test command and cleared by any normal lighting update. */
void led_host_test_override(const uint8_t *rgb24); /* 9 x 3 bytes, or NULL to clear */
bool led_host_test_active(void);

/* ---- colour helpers (pure, shared with the host preview) ---------------- */
void hsv_to_rgb(uint16_t hue, uint8_t sat, uint8_t val, uint8_t *r, uint8_t *g, uint8_t *b);
/* Apply the gamma table then scale by brightness/255. Integer only. */
uint8_t led_gamma_scale(uint8_t v, uint8_t brightness);

#endif /* LEDS_H */
