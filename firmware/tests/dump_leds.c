/*
 * dump_leds.c — print the engine's output for a table of scenarios, as JSON.
 *
 * The port in `src/lighting/engine.ts` has to produce the same bytes as
 * `leds.c`, or the browser preview is lying about what the pad will show. This
 * program is the C half of that comparison: `make -f Makefile.host ledvectors`
 * writes build-host/led-vectors.json, and tests/ledEngine.test.cjs asserts the
 * TypeScript against it. Keep the scenario list and the TS one in step; the test
 * fails if the names do not match, so a scenario cannot be silently dropped.
 */
#include <stdio.h>

#include "actions.h"
#include "config.h"
#include "leds.h"

typedef struct {
    const char *name;
    uint8_t mode;
    uint8_t brightness;
    uint8_t speed;
    uint8_t r, g, b;
    uint16_t per_key_mask;
    uint8_t per_key0[3];
    uint8_t per_key8[3];
    uint8_t channel;
    uint32_t now_ms;
    uint16_t hit_mask;
    uint8_t master_brightness;
    uint8_t idle_override;
    /* Number of frames to run, with this many ms between them. More than one
     * frame is how the reactive decay path gets exercised. */
    uint8_t frames;
    uint16_t frame_gap_ms;
} scenario_t;

static const scenario_t SCENARIOS[] = {
    {"off", LED_MODE_OFF, 90, 128, 32, 96, 255, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"static_dim", LED_MODE_STATIC, 90, 128, 32, 96, 255, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"static_full", LED_MODE_STATIC, 255, 128, 255, 128, 0, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"static_zero_brightness", LED_MODE_STATIC, 0, 128, 255, 255, 255, 0, {0}, {0}, 0, 0, 0, 255, 255,
     1, 0},
    {"per_key_two", LED_MODE_PER_KEY, 200, 128, 10, 20, 30, (1u << 0) | (1u << 8), {255, 0, 0},
     {0, 0, 255}, 0, 0, 0, 255, 255, 1, 0},
    {"breath_t0", LED_MODE_BREATH, 180, 128, 200, 40, 10, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"breath_t500", LED_MODE_BREATH, 180, 128, 200, 40, 10, 0, {0}, {0}, 0, 500, 0, 255, 255, 1, 0},
    {"breath_t1000", LED_MODE_BREATH, 180, 128, 200, 40, 10, 0, {0}, {0}, 0, 1000, 0, 255, 255, 1, 0},
    {"rainbow_t0", LED_MODE_RAINBOW, 255, 128, 0, 0, 0, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"rainbow_t12345", LED_MODE_RAINBOW, 255, 128, 0, 0, 0, 0, {0}, {0}, 0, 12345, 0, 255, 255, 1, 0},
    {"spectrum_t0", LED_MODE_SPECTRUM, 255, 96, 0, 0, 0, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"spectrum_t777", LED_MODE_SPECTRUM, 255, 96, 0, 0, 0, 0, {0}, {0}, 0, 777, 0, 255, 255, 1, 0},
    {"reactive_idle", LED_MODE_REACTIVE, 255, 128, 240, 240, 240, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"reactive_hit", LED_MODE_REACTIVE, 255, 128, 240, 240, 240, 0, {0}, {0}, 0, 100, 0x1FF, 255,
     255, 1, 0},
    {"reactive_decay_3", LED_MODE_REACTIVE, 255, 128, 240, 240, 240, 0, {0}, {0}, 0, 100, 0x1FF, 255,
     255, 3, 120},
    {"channel_tint_ch0", LED_MODE_CHANNEL_TINT, 255, 128, 200, 200, 200, 0, {0}, {0}, 0, 0, 0, 255,
     255, 1, 0},
    {"channel_tint_ch1", LED_MODE_CHANNEL_TINT, 255, 128, 200, 200, 200, 0, {0}, {0}, 1, 0, 0, 255,
     255, 1, 0},
    {"channel_tint_ch2", LED_MODE_CHANNEL_TINT, 255, 128, 200, 200, 200, 0, {0}, {0}, 2, 0, 0, 255,
     255, 1, 0},
    {"unknown_mode_9", 9, 255, 128, 200, 200, 200, 0, {0}, {0}, 0, 0, 0, 255, 255, 1, 0},
    {"idle_override_caps", LED_MODE_STATIC, 200, 128, 255, 255, 255, 0, {0}, {0}, 0, 0, 0, 255, 40,
     1, 0},
    {"master_brightness_caps", LED_MODE_STATIC, 200, 128, 255, 255, 255, 0, {0}, {0}, 0, 0, 0, 64,
     255, 1, 0},
};

int main(void) {
    const size_t n = sizeof(SCENARIOS) / sizeof(SCENARIOS[0]);

    printf("{\n  \"scenarios\": [\n");
    for (size_t s = 0; s < n; s++) {
        const scenario_t *sc = &SCENARIOS[s];

        cfg_lighting_t L;
        if (sc->frames > 1) {
            /* The decay cases start from a lit frame, so the second call has
             * something to decay. */
        }
        L.mode = sc->mode;
        L.brightness = sc->brightness;
        L.speed = sc->speed;
        L.r = sc->r;
        L.g = sc->g;
        L.b = sc->b;
        L.per_key_mask = sc->per_key_mask;
        for (int i = 0; i < CFG_LED_COUNT; i++) {
            L.per_key[i][0] = 0;
            L.per_key[i][1] = 0;
            L.per_key[i][2] = 0;
        }
        L.per_key[0][0] = sc->per_key0[0];
        L.per_key[0][1] = sc->per_key0[1];
        L.per_key[0][2] = sc->per_key0[2];
        L.per_key[8][0] = sc->per_key8[0];
        L.per_key[8][1] = sc->per_key8[1];
        L.per_key[8][2] = sc->per_key8[2];

        led_engine_t eng;
        led_engine_init(&eng);

        /* Inputs are printed alongside the output so the TypeScript test replays
         * this table instead of keeping a copy of it in step by hand. */
        printf("    {\"name\": \"%s\", \"lighting\": {\"mode\": %u, \"brightness\": %u, "
               "\"speed\": %u, \"r\": %u, \"g\": %u, \"b\": %u, \"perKeyMask\": %u, "
               "\"perKey\": [",
               sc->name, (unsigned)L.mode, (unsigned)L.brightness, (unsigned)L.speed, (unsigned)L.r,
               (unsigned)L.g, (unsigned)L.b, (unsigned)L.per_key_mask);
        for (int i = 0; i < CFG_LED_COUNT; i++) {
            if (i) printf(", ");
            printf("[%u, %u, %u]", L.per_key[i][0], L.per_key[i][1], L.per_key[i][2]);
        }
        printf("]}, \"state\": {\"channel\": %u, \"nowMs\": %u, \"hitMask\": %u, "
               "\"masterBrightness\": %u, \"idleOverride\": %u, \"frames\": %u, "
               "\"gapMs\": %u}, \"frames\": [",
               (unsigned)sc->channel, (unsigned)sc->now_ms, (unsigned)sc->hit_mask,
               (unsigned)sc->master_brightness, (unsigned)sc->idle_override, (unsigned)sc->frames,
               (unsigned)sc->frame_gap_ms);

        for (uint8_t f = 0; f < sc->frames; f++) {
            led_state_t st;
            st.key_down_mask = sc->hit_mask;
            st.key_hit_mask = f == 0 ? sc->hit_mask : 0;
            st.channel = sc->channel;
            st.now_ms = sc->now_ms + (uint32_t)f * sc->frame_gap_ms;
            st.master_brightness = sc->master_brightness;
            st.idle_override = sc->idle_override;

            led_frame_t frame;
            led_compute_frame(&eng, &L, &st, &frame);

            if (f) printf(", ");
            printf("[");
            for (int i = 0; i < CFG_LED_COUNT; i++) {
                if (i) printf(", ");
                printf("[%u, %u, %u]", frame.px[i].r, frame.px[i].g, frame.px[i].b);
            }
            printf("]");
        }
        printf("]}%s\n", s + 1 < n ? "," : "");
    }
    printf("  ]\n}\n");
    return 0;
}
