/*
 * oled.h — the 128x32 monochrome panel.
 *
 * The panel is an SSD1306 with the 32-row RAM layout: 4 pages of 128 columns,
 * where bit `y & 7` of byte `page * 128 + x` is the pixel at (x, y). Everything
 * here works in that layout so a finished canvas can be pushed out without a
 * transpose.
 *
 * Two ways to fill it:
 *   1. `oled_play()` steps through the baked loops in oled_frames.c (generated
 *      from src/oled/modes.ts by scripts/export-oled-frames.mjs). Use this for
 *      the decorative animations — they are pure art, so the desktop and the
 *      hardware show identical pixels for free.
 *   2. Draw yourself with the primitives below, or `oled_blit_pages()` a frame
 *      the host rendered and pushed over the wire. Use this for the screens that
 *      depend on live values (clock, telemetry, media, deck status, layer track).
 *
 * Memory: one canvas is 512 B. The baked tables are ~64 KiB of flash, all `const`
 * so they stay in XIP flash and never touch the 264 KiB of RAM.
 */
#ifndef OLED_H
#define OLED_H

#include <stdint.h>

#include "oled_frames.h"

typedef struct {
    uint8_t fb[OLED_FRAME_BYTES];
} oled_canvas_t;

/* ---- drawing (page layout, clipped to the panel) -------------------------- */

void oled_clear(oled_canvas_t *c);
void oled_fill(oled_canvas_t *c, int on);
void oled_px(oled_canvas_t *c, int x, int y, int on);
void oled_hline(oled_canvas_t *c, int x, int y, int w, int on);
void oled_vline(oled_canvas_t *c, int x, int y, int h, int on);
void oled_rect(oled_canvas_t *c, int x, int y, int w, int h, int on);
void oled_fill_rect(oled_canvas_t *c, int x, int y, int w, int h, int on);
void oled_invert_rect(oled_canvas_t *c, int x, int y, int w, int h);

/* Copy a full frame in page order (from the host, or a baked table). */
void oled_blit_pages(oled_canvas_t *c, const uint8_t *pages);

/* Number of lit pixels — a blank-screen check for tests and diagnostics. */
int oled_ink(const oled_canvas_t *c);

/* ---- baked loop playback -------------------------------------------------- */

/* NULL when the mode has no baked frames (it is drawn at runtime instead). */
const oled_anim_t *oled_anim_for(uint8_t mode);

/* Frame index for a timestamp; wraps, so the caller keeps no state. */
int oled_anim_index(const oled_anim_t *a, uint32_t ms);

/*
 * Blit the frame that `mode` should be showing at `ms`. Returns 1 when a baked
 * loop was found and blitted, 0 when the caller has to draw the mode itself.
 */
int oled_play(oled_canvas_t *c, uint8_t mode, uint32_t ms);

/* ---- hardware -------------------------------------------------------------- */

/* Configure I2C0 on GP28/GP29 and send the SSD1306 128x32 init sequence.
 * Returns 1 only after a real ACK; safe to retry if a panel is plugged in later.
 * Host tests compiled with OLED_NO_HW return 0. */
int oled_hw_init(void);
/* True only while the physical panel acknowledges writes (not a build flag). */
int oled_hw_present(void);
#ifdef OLED_NO_HW
/* SDK-free endpoint tests: simulate I2C ACK/loss without a physical panel. */
void oled_host_set_present(int present);
#endif

/* SSD1306 contrast and polarity. Errors mark the panel offline for retry. */
void oled_set_contrast(uint8_t level);
void oled_set_inverted(int inverted);

/* Push all 512 page-order bytes at 400 kHz; a failed write marks it offline.
 * No-op in host-only builds or until oled_hw_init() succeeds. */
void oled_flush(const oled_canvas_t *c);

#endif /* OLED_H */
