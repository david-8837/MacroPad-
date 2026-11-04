/* On-board, PC-independent 128x32 runtime screens. Desktop live frames (when
 * available) take precedence; these truthful fallbacks ensure every playlist
 * mode is legible when the host is closed or the serial link disappears. */
#include "oled_runtime.h"
#include "oled_font.h"
#include "oled_playlist.h"

static void text(oled_canvas_t *c, int x, int y, const char *s, int scale) {
    while (*s && x < OLED_FRAME_W) {
        unsigned char ch = (unsigned char)*s++;
        if (ch >= 'a' && ch <= 'z') ch = (unsigned char)(ch - 'a' + 'A');
        if (ch < 32 || ch > 126) ch = ' ';
        for (int col = 0; col < 5; col++) {
            const uint8_t bits = OLED_FONT_5X7[ch - 32][col];
            for (int row = 0; row < 7; row++) {
                if (bits & (1u << row)) {
                    oled_fill_rect(c, x + col * scale, y + row * scale, scale, scale, 1);
                }
            }
        }
        x += 6 * scale;
    }
}

static void title(oled_canvas_t *c, const char *s) {
    text(c, 2, 0, s, 1);
    oled_hline(c, 0, 9, OLED_FRAME_W, 1);
}

static void layer(oled_canvas_t *c, uint8_t channel) {
    const uint8_t selected = channel < 4 ? channel : 0;
    const char number[] = {(char)('0' + selected), '\0'};
    text(c, 23, 12, "LAYER", 2);
    text(c, 95, 12, number, 2);
    for (int i = 0; i < 4; i++) {
        if (i == selected) oled_fill_rect(c, 42 + i * 12, 29, 9, 2, 1);
        else oled_hline(c, 42 + i * 12, 30, 9, 1);
    }
}

void oled_render_layer_overlay(oled_canvas_t *c, uint8_t channel) {
    oled_clear(c);
    title(c, "ACTIVE LAYER");
    layer(c, channel);
}

void oled_render_local(oled_canvas_t *c, uint8_t mode, uint32_t now_ms, uint8_t channel) {
    if (oled_play(c, mode, now_ms)) return;
    oled_clear(c);
    switch (mode) {
    case OLED_SCREEN_KADOWAZ:
        title(c, "DECK STATUS");
        layer(c, channel);
        break;
    case OLED_SCREEN_SYSTEM:
        text(c, 0, 0, "SYSTEM   HOST OFFLINE", 1);
        text(c, 0, 9, "CPU --", 1);
        text(c, 0, 17, "RAM --", 1);
        text(c, 0, 25, "GPU --", 1);
        break;
    case OLED_SCREEN_MEDIA:
        title(c, "NOW PLAYING");
        text(c, 17, 14, "NO MEDIA", 2);
        break;
    case OLED_SCREEN_CHANNEL:
        title(c, "LAYER INDICATOR");
        layer(c, channel);
        break;
    case OLED_SCREEN_CLOCK: {
        /* The MCU has no battery-backed RTC. Never label uptime as wall time;
         * the desktop sends the actual HH:MM when a PC session is available. */
        title(c, "UPTIME - NO RTC");
        uint32_t seconds = now_ms / 1000u;
        uint32_t minutes = seconds / 60u;
        uint32_t hours = minutes / 60u;
        char clock[] = "00:00:00";
        clock[0] = (char)('0' + (hours / 10u) % 10u);
        clock[1] = (char)('0' + hours % 10u);
        clock[3] = (char)('0' + (minutes / 10u) % 6u);
        clock[4] = (char)('0' + minutes % 10u);
        clock[6] = (char)('0' + (seconds / 10u) % 6u);
        clock[7] = (char)('0' + seconds % 10u);
        text(c, 17, 14, clock, 2);
        break;
    }
    default:
        title(c, "UNKNOWN SCREEN");
        text(c, 2, 17, "CHECK FIRMWARE", 1);
        break;
    }
}
