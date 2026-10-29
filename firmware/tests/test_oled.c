/*
 * test_oled.c — the panel canvas and the baked frame tables.
 *
 * These tests are what let the desktop preview be trusted: the frames the host
 * renders go through the same 512-byte page layout that is asserted here, so a
 * packing mistake or a truncated table fails the build instead of showing up as
 * a garbled OLED in the field.
 */
#include <stddef.h>
#include <string.h>

#include "oled.h"
#include "oled_runtime.h"
#include "test.h"
#include "test_runner.h"

static oled_canvas_t C;

static void pixel_packing(void) {
    oled_clear(&C);
    oled_px(&C, 0, 0, 1);
    ASSERT_EQ(C.fb[0] & 0x01, 1);        /* page 0, column 0, bit 0 */
    oled_px(&C, 127, 31, 1);
    ASSERT_EQ(C.fb[3 * OLED_FRAME_W + 127] & 0x80, 0x80); /* page 3, bit 7 */
    oled_px(&C, 127, 31, 0);
    ASSERT_EQ(C.fb[3 * OLED_FRAME_W + 127], 0);
}

static void out_of_bounds_is_ignored(void) {
    oled_clear(&C);
    oled_px(&C, -1, 0, 1);
    oled_px(&C, 0, -1, 1);
    oled_px(&C, OLED_FRAME_W, 0, 1);
    oled_px(&C, 0, OLED_FRAME_H, 1);
    ASSERT_EQ(oled_ink(&C), 0);
}

static void clear_and_fill(void) {
    oled_fill(&C, 1);
    ASSERT_EQ(oled_ink(&C), OLED_FRAME_W * OLED_FRAME_H);
    oled_clear(&C);
    ASSERT_EQ(oled_ink(&C), 0);
}

static void rects(void) {
    oled_clear(&C);
    oled_rect(&C, 2, 2, 6, 4, 1);
    /* 6x4 outline = 6 + 6 + 2 + 2 */
    ASSERT_EQ(oled_ink(&C), 16);

    oled_clear(&C);
    oled_fill_rect(&C, 10, 10, 5, 5, 1);
    ASSERT_EQ(oled_ink(&C), 25);

    /* Inverting a filled block leaves it dark, and inverting twice is a no-op. */
    oled_invert_rect(&C, 10, 10, 5, 5);
    ASSERT_EQ(oled_ink(&C), 0);
    oled_invert_rect(&C, 10, 10, 5, 5);
    ASSERT_EQ(oled_ink(&C), 25);
}

static void blit_copies_a_frame(void) {
    const oled_anim_t *a = oled_anim_for(OLED_MODE_LOADER);
    ASSERT(a != NULL);
    if (!a) return;
    oled_clear(&C);
    oled_blit_pages(&C, a->data);
    ASSERT(memcmp(C.fb, a->data, OLED_FRAME_BYTES) == 0);
    ASSERT(oled_ink(&C) > 0);
}

static void every_table_is_well_formed(void) {
    ASSERT(OLED_ANIM_COUNT > 0);
    unsigned total = 0;
    for (unsigned i = 0; i < OLED_ANIM_COUNT; i++) {
        const oled_anim_t *a = &OLED_ANIMS[i];
        ASSERT(a->data != NULL);
        ASSERT(a->frames > 0);
        ASSERT(a->fps > 0);
        ASSERT(a->mode < OLED_MODE_COUNT);
        /* A loop shorter than half a second would read as a flicker. */
        ASSERT(a->frames * 2 >= a->fps);
        total += (unsigned)a->frames * OLED_FRAME_BYTES;

        /* No blank frames: a black frame mid-loop looks like a glitch. */
        for (int f = 0; f < a->frames; f++) {
            oled_blit_pages(&C, a->data + (size_t)f * OLED_FRAME_BYTES);
            ASSERT(oled_ink(&C) > 0);
        }
    }
    ASSERT_EQ(total, OLED_ANIM_BYTES);
    /* Flash budget: the tables must stay inside the frame region reserved below
     * the config sectors (BOARD_OLED_FRAME_REGION_BYTES, 120 KiB). */
    ASSERT(OLED_ANIM_BYTES <= 96u * 1024u);
}

static void anim_index(void) {
    const oled_anim_t *a = oled_anim_for(OLED_MODE_LOADER);
    ASSERT(a != NULL);
    if (!a) return;
    ASSERT_EQ(oled_anim_index(a, 0), 0);
    /* One frame later at its own rate. */
    ASSERT_EQ(oled_anim_index(a, (uint32_t)(1000 / a->fps)), 1);
    /* A whole loop comes back to the first frame. */
    uint32_t loop_ms = (uint32_t)((1000 * (uint32_t)a->frames) / a->fps);
    ASSERT_EQ(oled_anim_index(a, loop_ms), 0);
    /* And it keeps wrapping after long uptimes. */
    ASSERT_EQ(oled_anim_index(a, loop_ms * 1000u + 0), 0);
}

static void play_reports_whether_it_drew(void) {
    /* Baked: the decorative loops. */
    ASSERT_EQ(oled_play(&C, OLED_MODE_STARFIELD, 500), 1);
    ASSERT(oled_ink(&C) > 0);
    /* Not baked: these are drawn from live values at runtime. */
    ASSERT_EQ(oled_play(&C, OLED_MODE_KADOWAZ, 500), 0);
    ASSERT_EQ(oled_play(&C, OLED_MODE_SYSTEM, 500), 0);
    ASSERT_EQ(oled_play(&C, OLED_MODE_CLOCK, 500), 0);
    ASSERT_EQ(oled_play(&C, OLED_MODE_CHANNEL, 500), 0);
    /* Unknown id is not a crash. */
    ASSERT_EQ(oled_play(&C, 200, 500), 0);
}

static void host_build_has_no_panel(void) {
    ASSERT_EQ(oled_hw_init(), 0);
    ASSERT_EQ(oled_hw_present(), 0);
    oled_flush(&C); /* safe with no Pico SDK or physical panel */
}

static void offline_runtime_screens_show_something_real(void) {
    uint8_t earlier[OLED_FRAME_BYTES];
    for (int mode = 0; mode < OLED_MODE_COUNT; mode++) {
        oled_render_local(&C, (uint8_t)mode, 4523000, 2);
        ASSERT(oled_ink(&C) > 0); /* no PC data must not produce a blank panel */
    }
    oled_render_local(&C, OLED_MODE_CHANNEL, 2000, 0);
    memcpy(earlier, C.fb, sizeof(earlier));
    oled_render_local(&C, OLED_MODE_CHANNEL, 2000, 3);
    ASSERT(memcmp(earlier, C.fb, sizeof(earlier)) != 0);
    oled_render_layer_overlay(&C, 3);
    ASSERT(oled_ink(&C) > 0);
    oled_render_local(&C, OLED_MODE_CLOCK, 2000, 0);
    memcpy(earlier, C.fb, sizeof(earlier));
    oled_render_local(&C, OLED_MODE_CLOCK, 62000, 0);
    ASSERT(memcmp(earlier, C.fb, sizeof(earlier)) != 0);
}

static void frame_is_page_ordered(void) {
    /* Row 30 lives in page 3: a preview bug that transposed the buffer would
     * put ink in the wrong page and this catches it. */
    oled_clear(&C);
    oled_hline(&C, 0, 30, OLED_FRAME_W, 1);
    for (unsigned i = 0; i < OLED_FRAME_W; i++) {
        ASSERT_EQ(C.fb[3 * OLED_FRAME_W + i], 0x40); /* bit 6 of page 3 */
    }
}

const test_case_t oled_tests[] = {
    {"oled pixel packing", pixel_packing},
    {"oled out of bounds", out_of_bounds_is_ignored},
    {"oled clear and fill", clear_and_fill},
    {"oled rects", rects},
    {"oled blit copies a frame", blit_copies_a_frame},
    {"oled bake tables are well formed", every_table_is_well_formed},
    {"oled anim index", anim_index},
    {"oled play reports whether it drew", play_reports_whether_it_drew},
    {"oled frame layout is page ordered", frame_is_page_ordered},
    {"oled host build has no panel", host_build_has_no_panel},
    {"oled offline runtime screens", offline_runtime_screens_show_something_real},
    {NULL, NULL},
};
