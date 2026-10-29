#include "oled_stream.h"

#include <string.h>

#include "protocol.h" /* crc32_ieee */
#include "oled_playlist.h" /* OLED_SCREEN_COUNT */

static uint8_t s_staging[OLED_FRAME_BYTES];
static uint8_t s_active[OLED_FRAME_BYTES];
static uint16_t s_staging_seq;
static uint16_t s_last_seq;
static uint8_t s_staging_mode;
static uint8_t s_active_mode;
static uint32_t s_staging_crc;
static uint32_t s_staging_at;
static uint32_t s_completed_at;
static bool s_staging_open;
static bool s_active_valid;
static bool s_have_last_seq;

static uint16_t le16(const uint8_t *p) {
    return (uint16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

static uint32_t le32(const uint8_t *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static bool sequence_after(uint16_t a, uint16_t b) {
    /* Serial number arithmetic: wrap is fine, an exact duplicate or a value
     * more than half the sequence space behind the last complete frame isn't. */
    uint16_t delta = (uint16_t)(a - b);
    return delta != 0u && delta < 0x8000u;
}

void oled_stream_init(void) {
    s_staging_open = false;
    s_active_valid = false;
    s_have_last_seq = false;
    s_staging_seq = 0;
    s_last_seq = 0;
    s_staging_at = 0;
    s_completed_at = 0;
}

void oled_stream_invalidate(void) {
    s_staging_open = false;
    s_active_valid = false;
    /* Keep the sequence until the old frame's TTL elapses: a delayed USB
     * packet must not revive an old canvas after a rapid away/back switch. */
}

const uint8_t *oled_stream_frame(uint8_t current_mode, uint32_t now_ms) {
    if (!s_active_valid || s_active_mode != current_mode) return NULL;
    if ((uint32_t)(now_ms - s_completed_at) > OLED_STREAM_TTL_MS) {
        s_active_valid = false;
        return NULL;
    }
    return s_active;
}

oled_stream_result_t oled_stream_accept(const uint8_t *payload, uint16_t len,
                                        uint32_t now_ms, uint8_t current_mode,
                                        bool panel_present) {
    if (payload == NULL || len != OLED_STREAM_PAYLOAD_BYTES || !panel_present ||
        current_mode >= OLED_SCREEN_COUNT || oled_anim_for(current_mode) != NULL) {
        s_staging_open = false;
        return OLED_STREAM_BAD_ARG;
    }

    uint16_t seq = le16(payload);
    uint8_t mode = payload[2];
    uint8_t index = payload[3];
    uint8_t count = payload[4];
    uint32_t crc = le32(payload + 5);
    if (mode != current_mode || count != OLED_STREAM_CHUNK_COUNT || index >= count) {
        s_staging_open = false;
        return OLED_STREAM_BAD_ARG;
    }

    if (index == 0u) {
        if (s_have_last_seq && (uint32_t)(now_ms - s_completed_at) <= OLED_STREAM_TTL_MS &&
            !sequence_after(seq, s_last_seq)) {
            return OLED_STREAM_STALE;
        }
        s_staging_seq = seq;
        s_staging_mode = mode;
        s_staging_crc = crc;
        s_staging_at = now_ms;
        memcpy(s_staging, payload + OLED_STREAM_HEADER_BYTES, OLED_STREAM_CHUNK_BYTES);
        s_staging_open = true;
        return OLED_STREAM_WAITING;
    }

    if (!s_staging_open || (uint32_t)(now_ms - s_staging_at) > OLED_STREAM_STAGING_TIMEOUT_MS ||
        seq != s_staging_seq || mode != s_staging_mode || crc != s_staging_crc) {
        s_staging_open = false;
        return OLED_STREAM_BAD_ARG;
    }
    s_staging_open = false;
    memcpy(s_staging + OLED_STREAM_CHUNK_BYTES,
           payload + OLED_STREAM_HEADER_BYTES, OLED_STREAM_CHUNK_BYTES);
    if (crc32_ieee(s_staging, OLED_FRAME_BYTES) != crc) return OLED_STREAM_BAD_CRC;

    memcpy(s_active, s_staging, OLED_FRAME_BYTES);
    s_active_mode = mode;
    s_active_valid = true;
    s_completed_at = now_ms;
    s_have_last_seq = true;
    s_last_seq = seq;
    return OLED_STREAM_COMPLETE;
}
