/*
 * oled.c — canvas maths, baked-loop playback, and the SSD1306 push.
 *
 * The drawing and playback halves are board independent and are covered by the
 * host tests. The hardware half is compiled only when a panel is actually
 * declared in board.h (BOARD_OLED_PRESENT) and the host build has not stubbed it
 * out (OLED_NO_HW), so `make -f Makefile.host test` never needs pico-sdk.
 */
#include <string.h>

#include "board.h"
#include "oled.h"

static int in_bounds(int x, int y) {
    return x >= 0 && y >= 0 && x < OLED_FRAME_W && y < OLED_FRAME_H;
}

void oled_clear(oled_canvas_t *c) {
    memset(c->fb, 0, sizeof(c->fb));
}

void oled_fill(oled_canvas_t *c, int on) {
    memset(c->fb, on ? 0xff : 0x00, sizeof(c->fb));
}

void oled_px(oled_canvas_t *c, int x, int y, int on) {
    if (!in_bounds(x, y)) return;
    uint8_t *byte = &c->fb[(y >> 3) * OLED_FRAME_W + x];
    uint8_t bit = (uint8_t)(1u << (y & 7));
    if (on) {
        *byte |= bit;
    } else {
        *byte &= (uint8_t)~bit;
    }
}

static int oled_get(const oled_canvas_t *c, int x, int y) {
    if (!in_bounds(x, y)) return 0;
    return (c->fb[(y >> 3) * OLED_FRAME_W + x] >> (y & 7)) & 1;
}

void oled_hline(oled_canvas_t *c, int x, int y, int w, int on) {
    for (int i = 0; i < w; i++) oled_px(c, x + i, y, on);
}

void oled_vline(oled_canvas_t *c, int x, int y, int h, int on) {
    for (int i = 0; i < h; i++) oled_px(c, x, y + i, on);
}

void oled_rect(oled_canvas_t *c, int x, int y, int w, int h, int on) {
    oled_hline(c, x, y, w, on);
    oled_hline(c, x, y + h - 1, w, on);
    oled_vline(c, x, y, h, on);
    oled_vline(c, x + w - 1, y, h, on);
}

void oled_fill_rect(oled_canvas_t *c, int x, int y, int w, int h, int on) {
    for (int j = 0; j < h; j++) oled_hline(c, x, y + j, w, on);
}

void oled_invert_rect(oled_canvas_t *c, int x, int y, int w, int h) {
    for (int j = 0; j < h; j++) {
        for (int i = 0; i < w; i++) {
            oled_px(c, x + i, y + j, !oled_get(c, x + i, y + j));
        }
    }
}

void oled_blit_pages(oled_canvas_t *c, const uint8_t *pages) {
    memcpy(c->fb, pages, OLED_FRAME_BYTES);
}

int oled_ink(const oled_canvas_t *c) {
    int n = 0;
    for (unsigned i = 0; i < OLED_FRAME_BYTES; i++) {
        uint8_t b = c->fb[i];
        while (b) {
            n += b & 1;
            b >>= 1;
        }
    }
    return n;
}

/* ---- baked loops ---------------------------------------------------------- */

const oled_anim_t *oled_anim_for(uint8_t mode) {
    for (unsigned i = 0; i < OLED_ANIM_COUNT; i++) {
        if (OLED_ANIMS[i].mode == mode) return &OLED_ANIMS[i];
    }
    return NULL;
}

int oled_anim_index(const oled_anim_t *a, uint32_t ms) {
    if (!a || a->frames == 0 || a->fps == 0) return 0;
    /* frame = (ms * fps) / 1000, wrapped into the loop. 64-bit maths keeps the
     * multiply from overflowing after ~9 hours of uptime. */
    uint32_t frame = (uint32_t)(((uint64_t)ms * a->fps) / 1000u);
    return (int)(frame % a->frames);
}

int oled_play(oled_canvas_t *c, uint8_t mode, uint32_t ms) {
    const oled_anim_t *a = oled_anim_for(mode);
    if (!a) return 0;
    int frame = oled_anim_index(a, ms);
    oled_blit_pages(c, a->data + (size_t)frame * OLED_FRAME_BYTES);
    return 1;
}

/* ---- hardware ------------------------------------------------------------- */

#if !defined(OLED_NO_HW) && BOARD_OLED_PRESENT

#include "hardware/i2c.h"
#include "pico/stdlib.h"

static uint8_t contrast_level = 0x8f;

static void oled_cmd(uint8_t cmd) {
    uint8_t buf[2] = {0x00, cmd}; /* 0x00 = command stream */
    i2c_write_blocking(BOARD_OLED_I2C_INST ? i2c1 : i2c0, BOARD_OLED_ADDR, buf, 2, false);
}

int oled_hw_present(void) { return 1; }

void oled_set_contrast(uint8_t level) {
    contrast_level = level;
    oled_cmd(0x81); /* set contrast */
    oled_cmd(level);
}

void oled_flush(const oled_canvas_t *c) {
    static const uint8_t init[] = {
        0xAE,       /* display off */
        0xD5, 0x80, /* clock divide */
        0xA8, 0x1F, /* multiplex = 32 rows */
        0xD3, 0x00, /* display offset */
        0x40,       /* start line 0 */
        0x8D, 0x14, /* charge pump on */
        0x20, 0x00, /* horizontal addressing */
        0xA1,       /* segment remap */
        0xC8,       /* COM scan dec */
        0xDA, 0x02, /* COM pins for 128x32 */
        0x81, 0x8F, /* contrast */
        0xD9, 0xF1, /* pre-charge */
        0xDB, 0x40, /* VCOMH */
        0xA4,       /* resume from RAM */
        0xA6,       /* not inverted */
        0xAF        /* display on */
    };
    static int initialised = 0;
    if (!initialised) {
        for (unsigned i = 0; i < sizeof(init); i++) oled_cmd(init[i]);
        initialised = 1;
    }

    oled_cmd(0x21); oled_cmd(0x00); oled_cmd(0x7F); /* column window 0..127 */
    oled_cmd(0x22); oled_cmd(0x00); oled_cmd(0x03); /* page window 0..3 */

    /* One 0x40-prefixed data write for the whole 512-byte frame. */
    uint8_t chunk[17];
    chunk[0] = 0x40;
    i2c_inst_t *i2c = BOARD_OLED_I2C_INST ? i2c1 : i2c0;
    for (unsigned off = 0; off < OLED_FRAME_BYTES; off += 16) {
        memcpy(&chunk[1], &c->fb[off], 16);
        i2c_write_blocking(i2c, BOARD_OLED_ADDR, chunk, sizeof(chunk), false);
    }
}

#else /* no panel fitted, or the host test build */

int oled_hw_present(void) { return 0; }

void oled_set_contrast(uint8_t level) { (void)level; }

void oled_flush(const oled_canvas_t *c) { (void)c; }

#endif
