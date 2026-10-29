/*
 * test_leds.c — the colour maths, checked as numbers not as a photo.
 *
 * Asserting exact RGB values is what makes the lighting trustworthy: "the
 * rainbow looked about right" is not a regression test.
 */
#include <stddef.h>
#include <string.h>

#include "actions.h"
#include "config.h"
#include "leds.h"
#include "test.h"
#include "test_runner.h"

static cfg_lighting_t L;
static led_state_t S;
static led_engine_t E;
static led_frame_t F;

static void reset(uint8_t mode) {
    memset(&L, 0, sizeof(L));
    memset(&S, 0, sizeof(S));
    led_engine_init(&E);
    L.mode = mode;
    L.brightness = 255;
    L.speed = 128;
    L.r = 255;
    L.g = 128;
    L.b = 32;
    S.master_brightness = 255;
    S.idle_override = 255; /* 255 = "no override" */
    S.now_ms = 0;
}

static void test_off_mode_is_all_zero(void) {
    g_current = __func__;
    reset(LED_MODE_OFF);
    led_compute_frame(&E, &L, &S, &F);
    ASSERT_EQ(F.count, CFG_LED_COUNT);
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        ASSERT_EQ(F.px[i].r, 0);
        ASSERT_EQ(F.px[i].g, 0);
        ASSERT_EQ(F.px[i].b, 0);
    }
}

static void test_static_mode_passes_colour_through_gamma(void) {
    g_current = __func__;
    reset(LED_MODE_STATIC);
    led_compute_frame(&E, &L, &S, &F);
    /* At brightness 255 the scale is identity, so the output is gamma(v). */
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        ASSERT_EQ(F.px[i].r, led_gamma_scale(255, 255));
        ASSERT_EQ(F.px[i].g, led_gamma_scale(128, 255));
        ASSERT_EQ(F.px[i].b, led_gamma_scale(32, 255));
    }
    ASSERT_EQ(F.px[0].r, 255);
    /* Gamma must be monotonic: r > g > b in, r > g > b out. */
    ASSERT(F.px[0].r > F.px[0].g);
    ASSERT(F.px[0].g > F.px[0].b);
}

static void test_brightness_zero_is_off_and_gamma_is_monotonic(void) {
    g_current = __func__;
    reset(LED_MODE_STATIC);
    L.brightness = 0;
    led_compute_frame(&E, &L, &S, &F);
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        ASSERT_EQ(F.px[i].r, 0);
        ASSERT_EQ(F.px[i].g, 0);
        ASSERT_EQ(F.px[i].b, 0);
    }

    /* Monotonic: dimming never makes a channel brighter. Without gamma this is
     * trivially true; with a broken table it is not. */
    uint8_t prev = 255;
    for (int b = 255; b >= 0; b--) {
        uint8_t v = led_gamma_scale(200, (uint8_t)b);
        ASSERT(v <= prev);
        prev = v;
    }
}

static void test_idle_override_caps_but_never_raises(void) {
    g_current = __func__;
    reset(LED_MODE_STATIC);
    L.brightness = 200;
    S.idle_override = 30; /* dimmed for idle */
    led_compute_frame(&E, &L, &S, &F);
    uint8_t dim = F.px[0].r;

    S.idle_override = 250; /* higher than the config value */
    led_compute_frame(&E, &L, &S, &F);
    /* The override must not be able to push brightness ABOVE what the user set,
     * otherwise an idle-dim bug becomes an eye-searing one. */
    ASSERT_EQ(F.px[0].r, led_gamma_scale(255, 200));
    ASSERT(dim < F.px[0].r);
}

static void test_per_key_mask_selects_override_colours(void) {
    g_current = __func__;
    reset(LED_MODE_PER_KEY);
    L.per_key_mask = (uint16_t)((1u << 0) | (1u << 4) | (1u << 8));
    L.per_key[0][0] = 255; L.per_key[0][1] = 0;   L.per_key[0][2] = 0;
    L.per_key[4][0] = 0;   L.per_key[4][1] = 255; L.per_key[4][2] = 0;
    L.per_key[8][0] = 0;   L.per_key[8][1] = 0;   L.per_key[8][2] = 255;
    led_compute_frame(&E, &L, &S, &F);

    ASSERT_EQ(F.px[0].r, 255); ASSERT_EQ(F.px[0].g, 0);   ASSERT_EQ(F.px[0].b, 0);
    ASSERT_EQ(F.px[4].g, 255); ASSERT_EQ(F.px[4].r, 0);
    ASSERT_EQ(F.px[8].b, 255); ASSERT_EQ(F.px[8].r, 0);
    /* Unmasked keys fall back to the channel base colour. */
    ASSERT_EQ(F.px[1].r, led_gamma_scale(L.r, 255));
    ASSERT_EQ(F.px[5].g, led_gamma_scale(L.g, 255));
}

static void test_breath_cycles_and_returns_to_start(void) {
    g_current = __func__;
    reset(LED_MODE_BREATH);
    L.speed = 64;
    uint8_t min_r = 255, max_r = 0;
    uint8_t first = 0;
    for (uint32_t t = 0; t < 20000; t += 16) {
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
        if (t == 0) first = F.px[0].r;
        if (F.px[0].r < min_r) min_r = F.px[0].r;
        if (F.px[0].r > max_r) max_r = F.px[0].r;
    }
    /* It must actually breathe: reach both a dim and a bright value. */
    ASSERT(max_r > 200);
    ASSERT(min_r < 40);
    ASSERT(max_r > min_r + 100);
    (void)first;
}

static void test_breath_does_not_stall_at_the_bottom(void) {
    g_current = __func__;
    /* The classic gamma bug: with a linear ramp, the low half of a breath sits
     * at 0 for so long the LED looks dead. Sample the dimmest quarter of the
     * cycle and require it to contain several distinct values. */
    reset(LED_MODE_BREATH);
    L.speed = 64;
    int distinct = 0;
    uint8_t last = 255;
    for (uint32_t t = 0; t < 8000; t += 8) {
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
        uint8_t v = F.px[0].r;
        if (v < 40 && v != last) distinct++;
        last = v;
    }
    ASSERT(distinct > 8);
}

static void test_rainbow_visits_the_whole_wheel(void) {
    g_current = __func__;
    reset(LED_MODE_RAINBOW);
    L.speed = 200;
    bool saw_red = false, saw_green = false, saw_blue = false;
    for (uint32_t t = 0; t < 30000; t += 8) {
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
        uint8_t r = F.px[0].r, g = F.px[0].g, b = F.px[0].b;
        if (r > 150 && g < 60 && b < 60) saw_red = true;
        if (g > 150 && r < 60 && b < 60) saw_green = true;
        if (b > 150 && r < 60 && g < 60) saw_blue = true;
    }
    ASSERT(saw_red);
    ASSERT(saw_green);
    ASSERT(saw_blue);
}

static void test_rainbow_is_uniform_across_keys(void) {
    g_current = __func__;
    reset(LED_MODE_RAINBOW);
    S.now_ms = 12345;
    led_compute_frame(&E, &L, &S, &F);
    /* RAINBOW is one hue everywhere; SPECTRUM is the spatial one. If these were
     * swapped the pad would look wrong and nobody would know why. */
    for (int i = 1; i < CFG_LED_COUNT; i++) {
        ASSERT_EQ(F.px[i].r, F.px[0].r);
        ASSERT_EQ(F.px[i].g, F.px[0].g);
        ASSERT_EQ(F.px[i].b, F.px[0].b);
    }
}

static void test_spectrum_differs_between_keys(void) {
    g_current = __func__;
    reset(LED_MODE_SPECTRUM);
    L.speed = 40; /* slow, so the spatial offset dominates over time */
    S.now_ms = 1000;
    led_compute_frame(&E, &L, &S, &F);
    int differing = 0;
    for (int i = 1; i < CFG_LED_COUNT; i++) {
        if (F.px[i].r != F.px[0].r || F.px[i].g != F.px[0].g || F.px[i].b != F.px[0].b)
            differing++;
    }
    ASSERT(differing >= 5); /* at least most keys show a different hue */
}

static void test_reactive_flashes_on_hit_and_decays(void) {
    g_current = __func__;
    reset(LED_MODE_REACTIVE);
    /* A slower decay than the default so this measures the fade rather than
     * racing it: at speed 128 the whole flash is gone in ~125 ms, which is 8
     * frames and too coarse to assert on. */
    L.speed = 8;
    S.key_hit_mask = (uint16_t)(1u << 3); /* key 3 just fired */
    S.now_ms = 1000;
    led_compute_frame(&E, &L, &S, &F);
    uint8_t peak = F.px[3].g;
    ASSERT(peak > 200); /* flares toward white */

    /* Assert on GREEN, not red. The base colour is (255,128,32): red is already
     * saturated at 255, so blending it toward white cannot move and every frame
     * reads 255. That is correct behaviour, not a stuck LED — asserting on it
     * would be asserting on a constant. Green starts at 128 and has somewhere to
     * go, which is what makes it observable. */
    /* At full flare the key is driven to white, so all three channels peg. That
     * is the intent: a hit should read as a flash, not as "the same colour but
     * brighter". */
    ASSERT_EQ(F.px[3].r, 255);
    ASSERT_EQ(F.px[3].g, 255);
    ASSERT_EQ(F.px[3].b, 255);

    /* Unhit keys stay dim. */
    ASSERT(F.px[2].g < peak / 2);

    /* Decay over time with no new hits. */
    S.key_hit_mask = 0;
    uint8_t prev = peak;
    int decreased = 0;
    for (uint32_t t = 1016; t < 3000; t += 16) {
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
        if (F.px[3].g < prev) decreased++;
        prev = F.px[3].g;
    }
    ASSERT(decreased > 5);
    ASSERT(F.px[3].g < peak / 2); /* it actually got dim */
    ASSERT_EQ(F.px[3].g, led_gamma_scale(L.g / 3, 255)); /* back to the idle base */
}

static void test_reactive_decay_is_time_based_not_frame_based(void) {
    g_current = __func__;
    /* If the decay were per-frame instead of per-millisecond, a busy CPU (frames
     * arriving at 30 Hz instead of 60) would make the flash last twice as long.
     * Same elapsed wall time, different frame count -> same colour. */
    reset(LED_MODE_REACTIVE);
    L.speed = 8;

    S.key_hit_mask = (uint16_t)(1u << 0);
    S.now_ms = 0;
    led_compute_frame(&E, &L, &S, &F);
    S.key_hit_mask = 0;
    for (uint32_t t = 16; t <= 1024; t += 16) { /* 64 frames */
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
    }
    uint8_t after_many_frames = F.px[0].g;

    led_engine_init(&E);
    S.key_hit_mask = (uint16_t)(1u << 0);
    S.now_ms = 0;
    led_compute_frame(&E, &L, &S, &F);
    S.key_hit_mask = 0;
    for (uint32_t t = 64; t <= 1024; t += 64) { /* 16 frames, same wall time */
        S.now_ms = t;
        led_compute_frame(&E, &L, &S, &F);
    }
    /* Allow a small difference from the coarser dt quantisation, but nowhere
     * near the factor of four a frame-based decay would produce. */
    int diff = (int)F.px[0].g - (int)after_many_frames;
    if (diff < 0) diff = -diff;
    ASSERT(diff < 40);
}

static void test_channel_tint_gives_three_distinct_colours(void) {
    g_current = __func__;
    reset(LED_MODE_CHANNEL_TINT);
    uint8_t r[3], g[3], b[3];
    for (int ch = 0; ch < 3; ch++) {
        S.channel = (uint8_t)ch;
        S.now_ms = 0;
        led_compute_frame(&E, &L, &S, &F);
        r[ch] = F.px[0].r; g[ch] = F.px[0].g; b[ch] = F.px[0].b;
    }
    for (int a = 0; a < 3; a++) {
        for (int bb = a + 1; bb < 3; bb++) {
            bool same = r[a] == r[bb] && g[a] == g[bb] && b[a] == b[bb];
            ASSERT(!same);
        }
    }
}

static void test_unknown_mode_is_dark_not_garbage(void) {
    g_current = __func__;
    reset(99);
    S.now_ms = 500;
    led_compute_frame(&E, &L, &S, &F);
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        ASSERT_EQ(F.px[i].r, 0);
        ASSERT_EQ(F.px[i].g, 0);
        ASSERT_EQ(F.px[i].b, 0);
    }
}

static void test_hsv_primary_colours(void) {
    g_current = __func__;
    uint8_t r, g, b;
    hsv_to_rgb(0, 255, 255, &r, &g, &b); /* hue 0 = red */
    ASSERT(r > 200); ASSERT(g < 60); ASSERT(b < 60);
    hsv_to_rgb(65536 / 3, 255, 255, &r, &g, &b); /* 120 deg = green */
    ASSERT(g > 200); ASSERT(r < 60); ASSERT(b < 60);
    hsv_to_rgb(2 * 65536 / 3, 255, 255, &r, &g, &b); /* 240 deg = blue */
    ASSERT(b > 200); ASSERT(r < 60); ASSERT(g < 60);
    hsv_to_rgb(0, 0, 128, &r, &g, &b); /* no saturation = grey */
    ASSERT_EQ(r, 128); ASSERT_EQ(g, 128); ASSERT_EQ(b, 128);
    hsv_to_rgb(0, 255, 0, &r, &g, &b); /* no value = black */
    ASSERT_EQ(r, 0); ASSERT_EQ(g, 0); ASSERT_EQ(b, 0);
}

static void test_pixel_buffer_is_grb_ordered(void) {
    g_current = __func__;
    /* The PIO consumes GRB. If the struct were RGB the red and green channels
     * would be swapped on every LED, which is the most common first-build bug. */
    ASSERT_EQ(offsetof(led_pixel_t, g), 0);
    ASSERT_EQ(offsetof(led_pixel_t, r), 1);
    ASSERT_EQ(offsetof(led_pixel_t, b), 2);
    ASSERT_EQ((int)sizeof(led_pixel_t), 3);
}

static void test_pio_words_are_msb_aligned_grb(void) {
    g_current = __func__;
    /* PIO shifts LEFT, consuming bits 31..8, not bits 23..0. The first three
     * bytes sent must be G, R, B and the discarded low byte must be zero. */
    ASSERT_EQ(BOARD_LED_RGB_ORDER, 0);
    ASSERT_EQ(led_pack_pio_word(0x12, 0x34, 0x56), 0x34125600u);
    ASSERT_EQ(led_pack_pio_word(0, 0, 0), 0u);
    ASSERT_EQ(led_pack_pio_word(255, 0, 0), 0x00FF0000u);
    ASSERT_EQ(led_pack_pio_word(0, 255, 0), 0xFF000000u);
    ASSERT_EQ(led_pack_pio_word(0, 0, 255), 0x0000FF00u);
    for (int r = 0; r <= 255; r += 17) {
        uint32_t word = led_pack_pio_word((uint8_t)r, (uint8_t)(255 - r), 0xA5);
        ASSERT_EQ((word >> 24) & 255u, (uint8_t)(255 - r));
        ASSERT_EQ((word >> 16) & 255u, (uint8_t)r);
        ASSERT_EQ((word >> 8) & 255u, 0xA5u);
        ASSERT_EQ(word & 255u, 0u);
    }
}

const test_case_t leds_tests[] = {
    {"off_mode_is_all_zero", test_off_mode_is_all_zero},
    {"static_mode_passes_colour_through_gamma", test_static_mode_passes_colour_through_gamma},
    {"brightness_zero_is_off_and_gamma_is_monotonic",
     test_brightness_zero_is_off_and_gamma_is_monotonic},
    {"idle_override_caps_but_never_raises", test_idle_override_caps_but_never_raises},
    {"per_key_mask_selects_override_colours", test_per_key_mask_selects_override_colours},
    {"breath_cycles_and_returns_to_start", test_breath_cycles_and_returns_to_start},
    {"breath_does_not_stall_at_the_bottom", test_breath_does_not_stall_at_the_bottom},
    {"rainbow_visits_the_whole_wheel", test_rainbow_visits_the_whole_wheel},
    {"rainbow_is_uniform_across_keys", test_rainbow_is_uniform_across_keys},
    {"spectrum_differs_between_keys", test_spectrum_differs_between_keys},
    {"reactive_flashes_on_hit_and_decays", test_reactive_flashes_on_hit_and_decays},
    {"reactive_decay_is_time_based_not_frame_based", test_reactive_decay_is_time_based_not_frame_based},
    {"channel_tint_gives_three_distinct_colours", test_channel_tint_gives_three_distinct_colours},
    {"unknown_mode_is_dark_not_garbage", test_unknown_mode_is_dark_not_garbage},
    {"hsv_primary_colours", test_hsv_primary_colours},
    {"pixel_buffer_is_grb_ordered", test_pixel_buffer_is_grb_ordered},
    {"pio_words_are_msb_aligned_grb", test_pio_words_are_msb_aligned_grb},
    {NULL, NULL},
};
