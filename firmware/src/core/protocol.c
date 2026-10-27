/*
 * protocol.c — framing, parsing, and config chunking.
 */
#include "protocol.h"

#include <string.h>

#include "board.h"

/* ---- frame build -------------------------------------------------------- */
static bool build(frame_out_t *out, uint8_t cmd, const uint8_t *payload, uint16_t len) {
    if (!out || len > CFG_PROTOCOL_MTU) return false;
    if (len > 0 && !payload) return false;

    uint8_t *b = out->buf;
    size_t i = 0;
    b[i++] = FRAME_SOF0;
    b[i++] = FRAME_SOF1;
    b[i++] = cmd;
    b[i++] = (uint8_t)(len & 0xFF);
    b[i++] = (uint8_t)((len >> 8) & 0xFF);
    b[i++] = PROTOCOL_VERSION;
    if (len) {
        memcpy(&b[i], payload, len);
        i += len;
    }
    /* CRC covers cmd..payload, i.e. buf[2 .. i). */
    uint16_t crc = crc16_ccitt(&b[2], i - 2);
    b[i++] = (uint8_t)(crc & 0xFF);
    b[i++] = (uint8_t)((crc >> 8) & 0xFF);
    out->len = i;
    return true;
}

bool frame_build(frame_out_t *out, uint8_t cmd, const uint8_t *payload, uint16_t payload_len) {
    return build(out, cmd, payload, payload_len);
}

bool frame_build_info(frame_out_t *out, uint16_t fw_build, uint8_t capabilities) {
    uint8_t p[INFO_SIZE];
    memset(p, 0, sizeof(p));
    size_t i = 0;
    p[i++] = (uint8_t)(MAGIC_U32 & 0xFF);
    p[i++] = (uint8_t)((MAGIC_U32 >> 8) & 0xFF);
    p[i++] = (uint8_t)((MAGIC_U32 >> 16) & 0xFF);
    p[i++] = (uint8_t)((MAGIC_U32 >> 24) & 0xFF);
    p[i++] = (uint8_t)(PROTOCOL_VERSION & 0xFF);
    p[i++] = (uint8_t)(PROTOCOL_VERSION >> 8);
    p[i++] = (uint8_t)(CONFIG_FORMAT_VERSION & 0xFF);
    p[i++] = (uint8_t)(CONFIG_FORMAT_VERSION >> 8);
    p[i++] = CFG_CHANNEL_COUNT;
    p[i++] = CFG_KEY_COUNT;
    p[i++] = CFG_LED_COUNT;
    p[i++] = capabilities;
    uint16_t csz = (uint16_t)sizeof(cfg_blob_t);
    p[i++] = (uint8_t)(csz & 0xFF);
    p[i++] = (uint8_t)(csz >> 8);
    p[i++] = (uint8_t)(fw_build & 0xFF);
    p[i++] = (uint8_t)(fw_build >> 8);
    return build(out, CMD_INFO, p, INFO_SIZE);
}

bool frame_build_error(frame_out_t *out, uint8_t code) {
    return build(out, CMD_ERROR, &code, 1);
}

bool frame_build_ack(frame_out_t *out, uint8_t cmd, uint8_t status) {
    /* Ack frames echo the command they acknowledge in the low nibble so the host
     * can match a reply to a request without a sequence number. */
    uint8_t ack_cmd = (uint8_t)(cmd | 0x80);
    return build(out, ack_cmd, &status, 1);
}

/* ---- frame parse -------------------------------------------------------- */
void protocol_parser_init(protocol_parser_t *p) {
    if (!p) return;
    memset(p, 0, sizeof(*p));
    p->state = PS_HUNT_SOF0;
}

static void reset_hunt(protocol_parser_t *p) {
    p->state = PS_HUNT_SOF0;
    p->got = 0;
    p->len = 0;
}

parse_result_t protocol_parser_push(protocol_parser_t *p, uint8_t byte, frame_in_t *out) {
    if (!p) return PARSE_RESYNC;

    switch (p->state) {
    case PS_HUNT_SOF0:
        if (byte == FRAME_SOF0) {
            p->state = PS_HUNT_SOF1;
        } else {
            /* Junk between frames. Only count it if we were mid-frame, which we
             * are not here, so a noisy host does not inflate the counter. */
            p->frames_resync++;
        }
        return PARSE_NEED_MORE;

    case PS_HUNT_SOF1:
        if (byte == FRAME_SOF1) {
            p->state = PS_CMD;
        } else if (byte == FRAME_SOF0) {
            /* 0xA5 0xA5 0x5A: the first was noise, stay hunting for SOF1. */
            p->state = PS_HUNT_SOF1;
            p->frames_resync++;
        } else {
            reset_hunt(p);
            p->frames_resync++;
        }
        return PARSE_NEED_MORE;

    case PS_CMD:
        p->cmd = byte;
        p->state = PS_LEN_LO;
        return PARSE_NEED_MORE;

    case PS_LEN_LO:
        p->len = byte;
        p->state = PS_LEN_HI;
        return PARSE_NEED_MORE;

    case PS_LEN_HI:
        p->len |= (uint16_t)((uint16_t)byte << 8);
        p->state = PS_VER;
        return PARSE_NEED_MORE;

    case PS_VER:
        p->ver = byte;
        if (p->len > CFG_PROTOCOL_MTU) {
            /* Length is outside the payload, so the CRC has not been checked yet.
             * Reject now — but note this is the ONE rejection that cannot be
             * distinguished from corruption, since a corrupt len byte looks
             * exactly like an oversized frame. */
            reset_hunt(p);
            p->frames_bad_crc++;
            return PARSE_BAD_LEN;
        }
        /* Version is checked AFTER the payload is consumed, never here.
         * Rejecting early would leave len bytes of payload sitting in the stream,
         * and the next frame would be hunted for inside someone else's payload —
         * one bad version byte would then break every frame after it. */
        p->got = 0;
        /* len == 0 must skip PS_PAYLOAD entirely. Waiting for a payload byte
         * that does not exist would swallow the CRC low byte as payload and
         * desynchronise every subsequent frame — PING is exactly such a frame,
         * so this bug breaks the handshake first. */
        p->state = (p->len == 0) ? PS_CRC_LO : PS_PAYLOAD;
        return PARSE_NEED_MORE;

    case PS_PAYLOAD:
        if (p->got < CFG_PROTOCOL_MTU) p->payload[p->got] = byte;
        p->got++;
        if (p->got >= p->len) p->state = PS_CRC_LO;
        return PARSE_NEED_MORE;

    case PS_CRC_LO:
        p->crc_rx = byte;
        p->state = PS_CRC_HI;
        return PARSE_NEED_MORE;

    case PS_CRC_HI: {
        p->crc_rx |= (uint16_t)((uint16_t)byte << 8);
        /* Recompute over cmd..payload: the 4 header bytes we kept, then payload. */
        uint8_t tmp[CFG_PROTOCOL_MTU + 4];
        tmp[0] = p->cmd;
        tmp[1] = (uint8_t)(p->len & 0xFF);
        tmp[2] = (uint8_t)(p->len >> 8);
        tmp[3] = p->ver;
        if (p->len) memcpy(tmp + 4, p->payload, p->len);
        uint16_t crc = crc16_ccitt(tmp, 4 + p->len);
        /* Capture what the frame said before reset_hunt clears the parse state —
         * the caller still needs the payload pointer, which lives in the parser
         * and stays valid until the next push. */
        uint8_t ver = p->ver;
        uint8_t cmd = p->cmd;
        uint16_t len = p->len;
        reset_hunt(p);
        if (crc != p->crc_rx) {
            p->frames_bad_crc++;
            return PARSE_BAD_CRC;
        }
        /* CRC is valid, so this genuinely is a well-formed frame from a peer
         * speaking a different protocol version. Report it as such rather than
         * as corruption: the host can then decide to downgrade. */
        if (ver != PROTOCOL_VERSION) return PARSE_BAD_VERSION;
        p->frames_ok++;
        if (out) {
            out->cmd = cmd;
            out->len = len;
            out->payload = p->payload;
        }
        return PARSE_OK;
    }

    default:
        reset_hunt(p);
        return PARSE_RESYNC;
    }
}

/* ---- config chunking ---------------------------------------------------- */
void config_assembler_init(config_assembler_t *a) {
    if (!a) return;
    memset(a, 0, sizeof(*a));
    a->next_chunk = 0;
}

bool config_assembler_add(config_assembler_t *a, uint8_t index, const uint8_t *data,
                          uint16_t len) {
    if (!a || !data) return false;
    if (a->error || a->done) return false;
    if (index != a->next_chunk) {
        a->error = true; /* out of order: refuse rather than leave a hole */
        return false;
    }
    if (len == 0 || len > CFG_CHUNK_SIZE) {
        a->error = true;
        return false;
    }
    if ((size_t)a->filled + len > sizeof(cfg_blob_t)) {
        a->error = true;
        return false;
    }
    memcpy(((uint8_t *)&a->blob) + a->filled, data, len);
    a->filled = (uint16_t)(a->filled + len);
    a->next_chunk++;

    if (a->filled >= sizeof(cfg_blob_t)) {
        a->done = true;
        if (!config_validate(&a->blob)) {
            a->error = true;
            return false;
        }
    }
    return true;
}
