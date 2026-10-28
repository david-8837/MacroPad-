/*
 * oled_frames.h — GENERATED FILE, DO NOT EDIT.
 *
 * Source of truth: src/oled/modes.ts (the same renderer the desktop preview and
 * the in-app simulator use). Regenerate with:
 *
 *   node scripts/export-oled-frames.mjs
 *
 * One frame = 128x32 pixels in SSD1306 page order = 512 bytes.
 * Baked loops: 7. Total flash: 65024 B (63.5 KiB)
 * of the 240-frame (120 KiB) region reserved for frames
 * at BOARD_OLED_FRAME_REGION_OFFSET. Capacity maths: src/oled/capacity.ts.
 */
#ifndef OLED_FRAMES_H
#define OLED_FRAMES_H

#include <stdint.h>

#define OLED_FRAME_W 128
#define OLED_FRAME_H 32
#define OLED_FRAME_PAGES (OLED_FRAME_H / 8)
#define OLED_FRAME_BYTES (OLED_FRAME_W * OLED_FRAME_PAGES)

/* Mode ids, in catalogue order. Kept in sync by the exporter. */
typedef enum {
    OLED_MODE_KADOWAZ = 0,
    OLED_MODE_SYSTEM = 1,
    OLED_MODE_MEDIA = 2,
    OLED_MODE_CHANNEL = 3,
    OLED_MODE_LOADER = 4,
    OLED_MODE_CREATURE = 5,
    OLED_MODE_WAVE = 6,
    OLED_MODE_STARFIELD = 7,
    OLED_MODE_RAIN = 8,
    OLED_MODE_CLOCK = 9,
    OLED_MODE_RADAR = 10,
    OLED_MODE_PULSE = 11,
    OLED_MODE_COUNT
} oled_mode_t;

/* One baked loop: a rate, a length, and the frames themselves. */
typedef struct {
    uint8_t mode;   /* oled_mode_t */
    uint8_t fps;
    uint8_t frames;
    const uint8_t *data; /* frames * OLED_FRAME_BYTES, page order */
} oled_anim_t;

extern const oled_anim_t OLED_ANIMS[];
extern const unsigned OLED_ANIM_COUNT;
/* Bytes of flash the tables occupy — checked by the host tests. */
extern const unsigned OLED_ANIM_BYTES;
/* Same value as a preprocessor constant, so oled_playlist.c can assert at
 * compile time that the tables still fit the reserved flash region. */
#define OLED_ANIM_TOTAL_BYTES 65024u
#define OLED_ANIM_SLOTS_USED (OLED_ANIM_TOTAL_BYTES / OLED_FRAME_BYTES)
/* Hard ceiling from the flash map, mirrored from board.h. */
#define OLED_FRAME_REGION_TOTAL_BYTES 122880u

#endif /* OLED_FRAMES_H */
