/*
 * protocol.h — USB CDC framing.
 *
 * Binary, not JSON. Reason: the config blob is 2,272 bytes and you want the whole
 * thing to survive a flaky cable in one shot, with corruption detected rather
 * than silently half-applied. A JSON parser on a microcontroller is also a
 * 10 kB dependency and a heap allocator you would have to defend.
 *
 * The host side (Node/Python/browser) does the JSON. This is the only place
 * bytes are defined, and magic.h holds the constants.
 *
 * ── Frame layout ──────────────────────────────────────────────────────────
 *   offset  size  field
 *   0       1     SOF0 = 0xA5
 *   1       1     SOF1 = 0x5A
 *   2       1     cmd
 *   3       2     len (little endian, payload byte count, 0..MTU)
 *   5       1     proto version (lets a newer host talk to older firmware)
 *   6       len   payload
 *   6+len   2     crc16 CCITT-FALSE over bytes [2 .. 6+len) i.e. cmd..payload
 *
 * Total overhead = 8 bytes. A 2,272-byte config uses 9 indexed 256-byte chunks.
 * One volatile OLED frame uses two 265-byte payloads with a full-frame CRC-32.
 *
 * ── Why CRC covers cmd and len but not the SOF ────────────────────────────
 * The SOF is for resynchronisation only; if it is corrupt the receiver is
 * hunting for the next 0xA5 0x5A anyway. Including it in the CRC would make a
 * corrupted SOF indistinguishable from a corrupted payload, which complicates
 * the recovery logic for no gain.
 *
 * ── Resync rule ───────────────────────────────────────────────────────────
 * The parser is a byte-at-a-time state machine. On any malformed frame (bad
 * SOF, len > MTU, bad version, bad CRC) it discards and re-hunts for SOF. It
 * never desynchronises permanently, so a single noisy byte costs one command,
 * not a replug.
 */
#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "config.h"
#include "magic.h"

/* ---- CRC ---------------------------------------------------------------- */
uint16_t crc16_ccitt(const uint8_t *data, size_t len);
uint32_t crc32_ieee(const uint8_t *data, size_t len);

/* ---- frame assembly (device -> host) ----------------------------------- */
typedef struct {
    uint8_t buf[CFG_PROTOCOL_MTU + FRAME_OVERHEAD];
    size_t len;
} frame_out_t;

/* Build a frame. Returns false if payload_len > MTU (caller must chunk). */
bool frame_build(frame_out_t *out, uint8_t cmd, const uint8_t *payload, uint16_t payload_len);

/* Convenience builders used all over the firmware. */
bool frame_build_info(frame_out_t *out, uint16_t fw_build, uint8_t capabilities);
bool frame_build_error(frame_out_t *out, uint8_t code);
bool frame_build_ack(frame_out_t *out, uint8_t cmd, uint8_t status);

/* ---- frame parsing (host -> device) ------------------------------------ */
typedef enum {
    PARSE_NEED_MORE = 0, /* byte buffered, frame incomplete */
    PARSE_OK,            /* a complete valid frame is available */
    PARSE_BAD_CRC,
    PARSE_BAD_LEN,
    PARSE_BAD_VERSION,
    PARSE_RESYNC, /* garbage discarded while hunting SOF */
} parse_result_t;

typedef struct {
    uint8_t cmd;
    uint16_t len;
    const uint8_t *payload; /* points into the parser's own buffer */
} frame_in_t;

typedef struct {
    enum {
        PS_HUNT_SOF0 = 0,
        PS_HUNT_SOF1,
        PS_CMD,
        PS_LEN_LO,
        PS_LEN_HI,
        PS_VER,
        PS_PAYLOAD,
        PS_CRC_LO,
        PS_CRC_HI,
    } state;
    uint8_t cmd;
    uint8_t ver;
    uint16_t len;
    uint16_t got;
    uint16_t crc_rx;
    uint8_t payload[CFG_PROTOCOL_MTU];
    /* Statistics, exposed to the host through CMD_GET_INFO diagnostics. */
    uint32_t frames_ok;
    uint32_t frames_bad_crc;
    uint32_t frames_resync;
} protocol_parser_t;

/* True while the parser is waiting for a start-of-frame byte, i.e. it holds no
 * partial frame. The RX path uses this to route printable bytes to the ASCII
 * command parser: a frame cannot begin with a printable byte (SOF0 is 0xA5). */
bool protocol_parser_hunting(const protocol_parser_t *p);

void protocol_parser_init(protocol_parser_t *p);
/* Feed one byte. On PARSE_OK, `out` is populated and valid until the next call. */
parse_result_t protocol_parser_push(protocol_parser_t *p, uint8_t byte, frame_in_t *out);

/* ---- config chunking --------------------------------------------------- */
/* GET_CONFIG / SET_CONFIG stream the blob in CFG_CHUNK_SIZE pieces so a single
 * frame never exceeds the MTU and the host can show progress. */
#define CFG_CHUNK_SIZE 256
#define CFG_CHUNK_COUNT ((sizeof(cfg_blob_t) + CFG_CHUNK_SIZE - 1) / CFG_CHUNK_SIZE)

/* Assemble chunks into a full blob. Feed it in order; it validates CRC when the
 * last chunk lands. `done` is set true on completion. */
typedef struct {
    cfg_blob_t blob;
    uint16_t filled;
    uint8_t next_chunk;
    bool done;
    bool error;
} config_assembler_t;

void config_assembler_init(config_assembler_t *a);
/* Add one chunk. `index` must equal next_chunk; out-of-order chunks are
 * rejected because a missing chunk would silently zero a region. */
bool config_assembler_add(config_assembler_t *a, uint8_t index, const uint8_t *data,
                          uint16_t len);

#endif /* PROTOCOL_H */
