/*
 * oled_stream.h — volatile PC-rendered frames for the required SSD1306.
 *
 * Two fixed 256-byte chunks carry ONE 512-byte page-order frame. The MPAD3
 * frame CRC-16 checks each USB packet; this header also carries a CRC-32 over
 * the entire canvas, so a missing, mismatched or stale half can never appear
 * on the panel. No flash writes; offline/baked rendering remains autonomous.
 */
#ifndef OLED_STREAM_H
#define OLED_STREAM_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "oled.h"

#define OLED_STREAM_CHUNK_BYTES 256u
#define OLED_STREAM_CHUNK_COUNT 2u
#define OLED_STREAM_HEADER_BYTES 9u
#define OLED_STREAM_PAYLOAD_BYTES (OLED_STREAM_HEADER_BYTES + OLED_STREAM_CHUNK_BYTES)
#define OLED_STREAM_STAGING_TIMEOUT_MS 350u
#define OLED_STREAM_TTL_MS 1200u

_Static_assert(OLED_FRAME_BYTES == OLED_STREAM_CHUNK_BYTES * OLED_STREAM_CHUNK_COUNT,
               "OLED stream must cover exactly one 128x32 page-order canvas");
_Static_assert(OLED_STREAM_PAYLOAD_BYTES <= 512u, "OLED chunk exceeds MPAD3 MTU");

typedef struct __attribute__((packed)) {
    uint16_t seq; /* monotonically increasing modulo 65536 within a session */
    uint8_t mode; /* firmware/src/core/oled_playlist.c catalogue index */
    uint8_t index; /* 0, then 1; no gaps or duplicates */
    uint8_t count; /* always 2 */
    uint32_t crc32; /* CRC-32/IEEE over ALL 512 page-order bytes */
    uint8_t pages[OLED_STREAM_CHUNK_BYTES];
} oled_stream_chunk_t;
_Static_assert(sizeof(oled_stream_chunk_t) == OLED_STREAM_PAYLOAD_BYTES, "OLED payload layout changed");
_Static_assert(offsetof(oled_stream_chunk_t, pages) == OLED_STREAM_HEADER_BYTES,
               "OLED payload header layout changed");

typedef struct __attribute__((packed)) {
    uint8_t mode;
    uint16_t epoch; /* increases on every physical mode change, including timer */
} oled_state_t;
_Static_assert(sizeof(oled_state_t) == 3, "OLED state payload layout changed");

typedef enum {
    OLED_STREAM_WAITING = 0,
    OLED_STREAM_COMPLETE = 1,
    OLED_STREAM_BAD_ARG = -1,
    OLED_STREAM_BAD_CRC = -2,
    OLED_STREAM_STALE = -3,
} oled_stream_result_t;

void oled_stream_init(void);
/* The mode must still be the current physical screen and NOT a baked loop.
 * Return COMPLETE only when both halves and the full-frame CRC have passed. */
oled_stream_result_t oled_stream_accept(const uint8_t *payload, uint16_t len,
                                        uint32_t now_ms, uint8_t current_mode,
                                        bool panel_present);
/* NULL after 1.2s without a complete frame, after a mode/layer switch, or if
 * the requested mode differs. Caller uses local offline rendering instead. */
const uint8_t *oled_stream_frame(uint8_t current_mode, uint32_t now_ms);
void oled_stream_invalidate(void);

#endif /* OLED_STREAM_H */
