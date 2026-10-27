/*
 * leds.c — colour maths and the PIO/dMA driver for 9 x SK6812MINI-E.
 *
 * The maths half (led_compute_frame, hsv_to_rgb, led_gamma_scale) is pure and
 * compiled into the host tests too. The hardware half is behind
 * #ifndef LEDS_NO_HW so a PC build does not need pico-sdk headers.
 */
#include "leds.h"

#include <string.h>

#include "actions.h"

#ifndef LEDS_NO_HW
#include "hardware/clocks.h"
#include "hardware/dma.h"
#include "hardware/irq.h"
#include "hardware/pio.h"
#include "pico/stdlib.h"

#include "ws2812minie.pio.h"
#endif

/* ---- gamma -------------------------------------------------------------- */
/* A 2.2-ish curve as a 256-entry table, generated offline. Reason it exists:
 * LED perceived brightness is roughly logarithmic, so a linear ramp from 0-255
 * looks like "off, off, off, ON". Without this, the breathing mode stalls at
 * the bottom of its cycle and then snaps. Cost is 256 bytes of flash. */
static const uint8_t GAMMA8[256] = {
      0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1,
      1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   2,   2,   2,   2,   2,   2,
      3,   3,   3,   3,   3,   4,   4,   4,   4,   5,   5,   5,   5,   6,   6,   6,
      6,   7,   7,   7,   8,   8,   8,   9,   9,   9,  10,  10,  11,  11,  11,  12,
     12,  13,  13,  13,  14,  14,  15,  15,  16,  16,  17,  17,  18,  18,  19,  19,
     20,  20,  21,  22,  22,  23,  23,  24,  25,  25,  26,  26,  27,  28,  28,  29,
     30,  30,  31,  32,  33,  33,  34,  35,  35,  36,  37,  38,  39,  39,  40,  41,
     42,  43,  43,  44,  45,  46,  47,  48,  49,  49,  50,  51,  52,  53,  54,  55,
     56,  57,  58,  59,  60,  61,  62,  63,  64,  65,  66,  67,  68,  69,  70,  71,
     73,  74,  75,  76,  77,  78,  79,  81,  82,  83,  84,  85,  87,  88,  89,  90,
     91,  93,  94,  95,  97,  98,  99, 100, 102, 103, 105, 106, 107, 109, 110, 111,
    113, 114, 116, 117, 119, 120, 121, 123, 124, 126, 127, 129, 130, 132, 133, 135,
    137, 138, 140, 141, 143, 145, 146, 148, 149, 151, 153, 154, 156, 158, 159, 161,
    163, 165, 166, 168, 170, 172, 173, 175, 177, 179, 181, 182, 184, 186, 188, 190,
    192, 194, 196, 197, 199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219, 221,
    223, 225, 227, 229, 231, 234, 236, 238, 240, 242, 244, 246, 248, 251, 253, 255
};


uint8_t led_gamma_scale(uint8_t v, uint8_t brightness) {
    /* Scale in linear space first, then gamma. Doing it the other way round
     * makes low brightness values crush to zero unevenly across the three
     * channels, which shows up as a colour shift when you dim. */
    uint16_t scaled = (uint16_t)(((uint16_t)v * (uint16_t)brightness) / 255u);
    return GAMMA8[scaled & 0xFF];
}

/* ---- HSV -> RGB --------------------------------------------------------- */
/* hue is 0..65535 mapping to 0..360 degrees, so a hue ramp is a plain integer
 * increment with no floating point anywhere in the frame path. */
void hsv_to_rgb(uint16_t hue, uint8_t sat, uint8_t val, uint8_t *r, uint8_t *g, uint8_t *b) {
    if (!r || !g || !b) return;
    if (val == 0) { *r = *g = *b = 0; return; }
    if (sat == 0) { *r = *g = *b = val; return; }

    /* region = which 60-degree sextant, remainder = position inside it scaled
     * to 0..255. Written as one expression per value: the earlier form
     * (hue - region*65536/6) * 6 / 65536 * 255 silently multiplied by 255/256
     * and rounded region boundaries the wrong way, which put a green tint on
     * what should have been pure green. */
    uint32_t h32 = hue;
    uint8_t region = (uint8_t)(h32 * 6u / 65536u);
    uint16_t remainder = (uint16_t)(((h32 - (uint32_t)region * 65536u / 6u) * 1536u) / 65536u);

    uint8_t p = (uint8_t)(((uint16_t)val * (255u - sat)) >> 8);
    uint8_t q = (uint8_t)(((uint16_t)val * (255u - (((uint16_t)sat * remainder) >> 8))) >> 8);
    uint8_t t = (uint8_t)(((uint16_t)val * (255u - (((uint16_t)sat * (255u - remainder)) >> 8))) >> 8);

    switch (region) {
    case 0:  *r = val; *g = t;   *b = p;   break;
    case 1:  *r = q;   *g = val; *b = p;   break;
    case 2:  *r = p;   *g = val; *b = t;   break;
    case 3:  *r = p;   *g = q;   *b = val; break;
    case 4:  *r = t;   *g = p;   *b = val; break;
    default: *r = val; *g = p;   *b = q;   break;
    }
}

/* ---- engine ------------------------------------------------------------- */
void led_engine_init(led_engine_t *e) {
    if (!e) return;
    memset(e, 0, sizeof(*e));
}

/* Triangle wave 0..255..0 over a period, integer only. */
static uint8_t triangle(uint32_t phase) {
    uint8_t p = (uint8_t)(phase & 0xFF);
    return (p < 128) ? (uint8_t)(p * 2) : (uint8_t)((255 - p) * 2);
}

void led_compute_frame(const led_engine_t *eng, const cfg_lighting_t *L, const led_state_t *st,
                       led_frame_t *out) {
    if (!L || !st || !out) return;
    memset(out, 0, sizeof(*out));
    out->count = CFG_LED_COUNT;

    /* Master brightness: config value, then any idle-dim override. */
    uint8_t master = L->brightness;
    if (st->idle_override != 255 && st->idle_override < master) master = st->idle_override;
    if (st->master_brightness != 255 && st->master_brightness < master) {
        master = st->master_brightness;
    }

    /* Animation phase. speed 1..255 scales a base rate; the shift keeps the
     * multiplication inside 32 bits at speed 255. */
    uint32_t rate = (uint32_t)(L->speed ? L->speed : 1);
    uint32_t phase = (uint32_t)((st->now_ms * rate) >> 6);

    /* Frame delta, computed ONCE. This must not live inside the per-key loop:
     * updating last_ms on the first key makes dt zero for keys 1..8, so only LED
     * 0 ever decays and the other eight stay pinned at whatever they last hit.
     * That is a real bug this codebase had, and the unit test is what caught it. */
    led_engine_t *eng_mut = (led_engine_t *)eng; /* see note in REACTIVE below */
    uint32_t dt_ms = eng_mut ? (st->now_ms - eng_mut->last_ms) : 0;
    if (eng_mut) eng_mut->last_ms = st->now_ms;

    for (int i = 0; i < CFG_LED_COUNT; i++) {
        uint8_t r = L->r, g = L->g, b = L->b;

        switch (L->mode) {
        case LED_MODE_OFF:
            r = g = b = 0;
            break;

        case LED_MODE_STATIC:
            break; /* base colour as configured */

        case LED_MODE_PER_KEY:
            if (L->per_key_mask & (1u << i)) {
                r = L->per_key[i][0];
                g = L->per_key[i][1];
                b = L->per_key[i][2];
            }
            break;

        case LED_MODE_BREATH: {
            uint8_t s = triangle(phase);
            r = (uint8_t)(((uint16_t)r * s) / 255u);
            g = (uint8_t)(((uint16_t)g * s) / 255u);
            b = (uint8_t)(((uint16_t)b * s) / 255u);
            break;
        }

        case LED_MODE_RAINBOW:
            hsv_to_rgb((uint16_t)(phase * 256u), 255, 255, &r, &g, &b);
            break;

        case LED_MODE_SPECTRUM:
            /* Spatial offset: each key sits 1/9 of the wheel apart, so the
             * colour visibly travels across the pad instead of pulsing in
             * unison. The (i * 65536 / 9) is precomputed by the compiler. */
            hsv_to_rgb((uint16_t)(phase * 256u + (uint32_t)i * 65536u / CFG_LED_COUNT), 255, 255,
                       &r, &g, &b);
            break;

        case LED_MODE_REACTIVE: {
            /* Base colour, dimmed to a third; a press flares it toward white and
             * decays. The decay state lives in led_engine_t, which is why the
             * engine pointer is const-cast once above: this is the only mutable
             * piece of an otherwise pure function, and pushing it out to main.c
             * would mean main.c had to know how the animation works. */
            led_engine_t *e = eng_mut;
            uint32_t dt = dt_ms;
            if (st->key_hit_mask & (1u << i)) {
                if (e) e->level[i] = 255;
            } else if (e && dt) {
                /* Decay proportional to elapsed time so the rate is the same at
                 * 60 Hz and at 30 Hz when the CPU is busy. */
                /* Decay rate: at speed 128 and a 60 Hz frame this is ~64/255
                 * per frame, so a flash is visibly gone in about a second. A
                 * /256 divisor here made the fade take four seconds, which reads
                 * as "the LED is stuck on" rather than as an animation. */
                uint16_t drop = (uint16_t)((dt * (uint32_t)(L->speed ? L->speed : 64)) / 32u);
                if (drop > 255) drop = 255;
                e->level[i] = (drop >= e->level[i]) ? 0 : (uint8_t)(e->level[i] - drop);
            }
            uint8_t flare = e ? e->level[i] : 0;
            if (flare) {
                uint8_t inv = (uint8_t)(255 - flare);
                r = (uint8_t)(((uint16_t)r * inv + 255u * flare) / 255u);
                g = (uint8_t)(((uint16_t)g * inv + 255u * flare) / 255u);
                b = (uint8_t)(((uint16_t)b * inv + 255u * flare) / 255u);
            } else {
                r = (uint8_t)(r / 3);
                g = (uint8_t)(g / 3);
                b = (uint8_t)(b / 3);
            }
            break;
        }

        case LED_MODE_CHANNEL_TINT:
            /* Shift hue by channel so the same configured colour reads
             * differently on each page. 1/3 of the wheel per channel keeps the
             * three pages maximally distinct. */
            hsv_to_rgb((uint16_t)((uint32_t)st->channel * 65536u / CFG_CHANNEL_COUNT), 220, 220,
                       &r, &g, &b);
            break;

        default:
            r = g = b = 0;
            break;
        }

        out->px[i].r = led_gamma_scale(r, master);
        out->px[i].g = led_gamma_scale(g, master);
        out->px[i].b = led_gamma_scale(b, master);
    }
}

/* ---- raw override ------------------------------------------------------- */
static led_frame_t s_override;
static bool s_override_active;

void led_host_test_override(const uint8_t *rgb24) {
    if (!rgb24) {
        s_override_active = false;
        return;
    }
    memset(&s_override, 0, sizeof(s_override));
    s_override.count = CFG_LED_COUNT;
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        /* No gamma and no brightness scaling here on purpose: the point of the
         * wiring test is to see the exact bytes you asked for on the exact LED
         * you asked for. */
        s_override.px[i].r = rgb24[i * 3 + 0];
        s_override.px[i].g = rgb24[i * 3 + 1];
        s_override.px[i].b = rgb24[i * 3 + 2];
    }
    s_override_active = true;
    led_hw_show(&s_override);
}

bool led_host_test_active(void) { return s_override_active; }

/* Called by main before each engine-driven frame so a normal update always wins
 * over a stale test pattern. */
void led_host_test_clear(void) { s_override_active = false; }

/* ---- hardware ----------------------------------------------------------- */
#ifndef LEDS_NO_HW

static PIO s_pio;
static uint s_sm;
static int s_dma_chan = -1;
/* One 32-bit PIO word per LED (low 24 bits used). */
static uint32_t s_dma_buf[CFG_LED_COUNT];

void led_hw_init(void) {
    uint offset;
    s_pio = pio0;
    /* pio_add_program can fail only if the PIO is out of instruction memory,
     * which cannot happen with a single 12-instruction program, but check
     * anyway: silently running with a bad offset is much harder to debug. */
    if (!pio_can_add_program(s_pio, &ws2812minie_program)) return;
    offset = pio_add_program(s_pio, &ws2812minie_program);
    s_sm = pio_claim_unused_sm(s_pio, true);

    /* 8 MHz PIO clock, so one PIO cycle is 125 ns. ws2812minie.pio derives
     * T0H/T1H/T0L/T1L from that, and tools/pio_timing.py simulates the loop and
     * fails the test run if the waveform leaves the usable envelope or if this
     * number stops matching it.
     *
     * 125 ns is not an arbitrary pick, it is the optimum for this loop shape.
     * With the bit loop at T0H=2, T1H=4, T0L=3, T1L=3 cycles, the datasheet
     * windows constrain the cycle time to:
     *     T0H 150..450 ns -> 75..225      T1H 450..750 ns -> 112.5..187.5
     *     T0L 150..450 ns -> 50..150      T1L 450..750 ns -> 150..250
     * The first three intersect at 112.5..150 ns; T1L wants >= 150 and only just
     * touches it, so no cycle time satisfies all four. 125 ns (exactly 133/16.625,
     * representable in the PIO's 16.16 divisor) satisfies three and leaves T1L
     * 75 ns short, which is the same compromise every WS2812 driver makes - the
     * part discriminates on the high pulse and has no maximum low time below the
     * ~50 us reset.
     *
     * If a batch of LEDs misreads the data, slow this down rather than editing the
     * .pio: 6 MHz scales every pulse by 1.25 and leaves the ratios alone. */
    float div = (float)clock_get_hz(clk_sys) / (8.0f * 1000000.0f);

    ws2812minie_program_init(s_pio, s_sm, offset, BOARD_LED_PIN, div,
                             BOARD_LED_INVERT_OUTPUT ? 1 : 0);

    s_dma_chan = dma_claim_unused_channel(true);
    dma_channel_config c = dma_channel_get_default_config(s_dma_chan);
    channel_config_set_transfer_data_size(&c, DMA_SIZE_32);
    channel_config_set_read_increment(&c, true);
    channel_config_set_write_increment(&c, false);
    channel_config_set_dreq(&c, pio_get_dreq(s_pio, s_sm, true));

    /* Prime with zeroes so the line idles low. */
    memset(s_dma_buf, 0, sizeof(s_dma_buf));
    dma_channel_configure(s_dma_chan, &c, &s_pio->txf[s_sm], s_dma_buf, CFG_LED_COUNT,
                          false);
}

void led_hw_show(const led_frame_t *f) {
    if (!f || s_dma_chan < 0) return;

    /* Pack 24-bit GRB words, 8 bits per PIO write. The PIO program consumes one
     * 32-bit word per LED and shifts out 24 bits from it. */
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        uint8_t r = f->px[i].r, g = f->px[i].g, b = f->px[i].b;
#if BOARD_LED_RGB_ORDER
        s_dma_buf[i] = ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
#else
        s_dma_buf[i] = ((uint32_t)g << 16) | ((uint32_t)r << 8) | b;
#endif
    }

    /* Wait for the previous frame to finish before touching the buffer. At 60 Hz
     * with a 216 us frame this never blocks for long, but not waiting is what
     * causes the classic "top half of the strip shows last frame's colours" bug. */
    dma_channel_wait_for_finish_blocking(s_dma_chan);
    dma_channel_set_read_addr(s_dma_chan, s_dma_buf, true);
}

void led_hw_blank(void) {
    memset(s_dma_buf, 0, sizeof(s_dma_buf));
    if (s_dma_chan >= 0) {
        dma_channel_wait_for_finish_blocking(s_dma_chan);
        dma_channel_set_read_addr(s_dma_chan, s_dma_buf, true);
    }
}

#else /* host build */

static led_frame_t s_host_frame;
const led_frame_t *led_host_last_frame(void) { return &s_host_frame; }
void led_hw_init(void) {}
void led_hw_show(const led_frame_t *f) { if (f) s_host_frame = *f; }
void led_hw_blank(void) { memset(&s_host_frame, 0, sizeof(s_host_frame)); }

#endif
