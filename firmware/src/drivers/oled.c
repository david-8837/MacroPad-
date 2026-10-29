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

#define OLED_I2C_HZ 400000u
#define OLED_I2C_TIMEOUT_US 20000u /* finite even when the bus is stuck */

static int s_ready;
static i2c_inst_t *bus(void) { return BOARD_OLED_I2C_INST ? i2c1 : i2c0; }

/* 0x00: command stream; 0x40: page data. Each transaction has its own
 * control byte. No unbounded blocking I2C calls on the input-device loop. */
static int send_commands(const uint8_t *cmd, unsigned n) {
    if (n > 31) return 0;
    uint8_t buf[32] = {0x00};
    memcpy(buf + 1, cmd, n);
    return i2c_write_timeout_us(bus(), BOARD_OLED_ADDR, buf, n + 1, false,
                                OLED_I2C_TIMEOUT_US) == (int)(n + 1);
}

int oled_hw_init(void) {
    static const uint8_t init[] = {
        0xAE,       /* off during setup */
        0xD5, 0x80, /* clock divide */
        0xA8, 0x1F, /* multiplex: 32 rows */
        0xD3, 0x00, /* offset zero */
        0x40,       /* start line zero */
        0x8D, 0x14, /* internal charge pump (3V3 modules) */
        0x20, 0x00, /* horizontal addressing */
        0xA1, 0xC8, /* segment remap, COM scan reversed */
        0xDA, 0x02, /* 128x32 COM pins */
        0x81, 0x8F, /* default contrast */
        0xD9, 0xF1, /* pre-charge */
        0xDB, 0x40, /* VCOMH */
        0xA4, 0xA6, /* display RAM, not inverted */
        0xAF        /* on */
    };
    s_ready = 0;
    i2c_init(bus(), OLED_I2C_HZ);
    gpio_set_function(BOARD_OLED_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(BOARD_OLED_SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(BOARD_OLED_SDA_PIN);
    gpio_pull_up(BOARD_OLED_SCL_PIN);
    /* A missing module NACKs; expose that truth in CAP_OLED instead of claiming
     * the display works simply because the firmware was compiled with I2C. */
    s_ready = send_commands(init, sizeof(init));
    return s_ready;
}

int oled_hw_present(void) { return s_ready; }

void oled_set_contrast(uint8_t level) {
    if (!s_ready) return;
    const uint8_t cmd[] = {0x81, level};
    if (!send_commands(cmd, sizeof(cmd))) s_ready = 0;
}

void oled_set_inverted(int inverted) {
    if (!s_ready) return;
    const uint8_t cmd = inverted ? 0xA7 : 0xA6;
    if (!send_commands(&cmd, 1)) s_ready = 0;
}

void oled_flush(const oled_canvas_t *c) {
    if (!s_ready || !c) return;
    const uint8_t window[] = {0x21, 0x00, 0x7F, 0x22, 0x00, 0x03};
    if (!send_commands(window, sizeof(window))) { s_ready = 0; return; }

    /* Four transactions of 128 data bytes, each with the SSD1306 0x40 control
     * byte. The 400 kHz transfer takes ~12 ms; a NACK/stuck bus fails closed. */
    uint8_t chunk[OLED_FRAME_W + 1];
    chunk[0] = 0x40;
    for (unsigned page = 0; page < OLED_FRAME_PAGES; page++) {
        memcpy(chunk + 1, c->fb + page * OLED_FRAME_W, OLED_FRAME_W);
        if (i2c_write_timeout_us(bus(), BOARD_OLED_ADDR, chunk, sizeof(chunk), false,
                                 OLED_I2C_TIMEOUT_US) != (int)sizeof(chunk)) {
            s_ready = 0;
            return;
        }
    }
}

#else /* SDK-free host test build */

static int s_host_present;
int oled_hw_init(void) { return s_host_present; }
int oled_hw_present(void) { return s_host_present; }
void oled_host_set_present(int present) { s_host_present = !!present; }
void oled_set_contrast(uint8_t level) { (void)level; }
void oled_set_inverted(int inverted) { (void)inverted; }
void oled_flush(const oled_canvas_t *c) { (void)c; }

#endif
