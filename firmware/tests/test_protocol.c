/*
 * test_protocol.c — framing, resynchronisation, chunking, and the command
 * handlers themselves (through usb_proto_inject, so this exercises the REAL
 * dispatch code rather than a copy of it).
 *
 * The bytes are checked against the values host/tests/test_protocol.mjs asserts
 * independently in JavaScript. Two implementations of the same spec agreeing is
 * the actual drift guard; a comment saying "keep in sync" is not.
 */
#include <string.h>

#include "channel.h"
#include "config.h"
#include "events.h"
#include "leds.h"
#include "protocol.h"
#include "storage.h"
#include "test.h"
#include "test_runner.h"
#include "usb_proto.h"

extern void storage_host_reset(void);

/* ---- CRC vectors -------------------------------------------------------- */

static void test_crc16_matches_known_vectors(void) {
    g_current = __func__;
    /* CRC-16/CCITT-FALSE: check value for "123456789" is 0x29B1. If this ever
     * fails, the host and device disagree about every frame. */
    const uint8_t v[] = "123456789";
    ASSERT_EQ(crc16_ccitt(v, 9), 0x29B1);
    ASSERT_EQ(crc16_ccitt(v, 0), CRC16_INIT);
}

static void test_crc32_matches_known_vectors(void) {
    g_current = __func__;
    /* CRC-32/IEEE: check value for "123456789" is 0xCBF43926. */
    const uint8_t v[] = "123456789";
    ASSERT_EQ(crc32_ieee(v, 9), 0xCBF43926u);
    ASSERT_EQ(crc32_ieee(v, 0), 0u);
}

/* ---- framing ------------------------------------------------------------ */

static void test_frame_layout_is_exactly_as_specified(void) {
    g_current = __func__;
    frame_out_t f;
    const uint8_t payload[] = {0xDE, 0xAD, 0xBE, 0xEF};
    ASSERT(frame_build(&f, CMD_PING, payload, 4));

    ASSERT_EQ(f.buf[0], FRAME_SOF0);
    ASSERT_EQ(f.buf[1], FRAME_SOF1);
    ASSERT_EQ(f.buf[2], CMD_PING);
    ASSERT_EQ(f.buf[3], 4);   /* len low */
    ASSERT_EQ(f.buf[4], 0);   /* len high */
    ASSERT_EQ(f.buf[5], PROTOCOL_VERSION);
    ASSERT_EQ(f.buf[6], 0xDE);
    ASSERT_EQ(f.buf[9], 0xEF);
    ASSERT_EQ((int)f.len, FRAME_OVERHEAD + 4);

    /* CRC is little endian and covers buf[2..10). */
    uint16_t want = crc16_ccitt(&f.buf[2], 4 + 4);
    ASSERT_EQ(f.buf[10], (uint8_t)(want & 0xFF));
    ASSERT_EQ(f.buf[11], (uint8_t)(want >> 8));
}

static void test_empty_payload_frame_round_trips(void) {
    g_current = __func__;
    frame_out_t f;
    ASSERT(frame_build(&f, CMD_PING, NULL, 0));
    ASSERT_EQ((int)f.len, FRAME_OVERHEAD);

    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r = PARSE_NEED_MORE;
    for (size_t i = 0; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_OK);
    ASSERT_EQ(in.cmd, CMD_PING);
    ASSERT_EQ(in.len, 0);
    ASSERT_EQ(p.frames_ok, 1u);
    ASSERT_EQ(p.frames_bad_crc, 0u);
}

static void test_oversized_payload_is_refused_not_truncated(void) {
    g_current = __func__;
    frame_out_t f;
    static uint8_t big[CFG_PROTOCOL_MTU + 1];
    memset(big, 0x5A, sizeof(big));
    ASSERT(!frame_build(&f, CMD_SET_CONFIG, big, CFG_PROTOCOL_MTU + 1));
    ASSERT(frame_build(&f, CMD_SET_CONFIG, big, CFG_PROTOCOL_MTU)); /* exactly fits */
}

static void test_corrupted_payload_byte_is_rejected(void) {
    g_current = __func__;
    frame_out_t f;
    const uint8_t payload[] = {1, 2, 3};
    ASSERT(frame_build(&f, CMD_SET_CHANNEL, payload, 3));
    f.buf[7] ^= 0x01; /* flip a payload bit in transit */

    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r = PARSE_NEED_MORE;
    for (size_t i = 0; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_BAD_CRC);
    ASSERT_EQ(p.frames_bad_crc, 1u);
    ASSERT_EQ(p.frames_ok, 0u);
}

static void test_parser_resyncs_after_garbage(void) {
    g_current = __func__;
    /* 500 bytes of noise, then a valid frame. A parser that cannot recover here
     * needs a replug, which is the failure mode users describe as "the app
     * stopped working until I unplugged it". */
    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r = PARSE_NEED_MORE;
    for (int i = 0; i < 500; i++) r = protocol_parser_push(&p, (uint8_t)(i * 7 + 3), &in);
    ASSERT(r != PARSE_OK);

    frame_out_t f;
    const uint8_t payload[] = {0x42};
    ASSERT(frame_build(&f, CMD_GET_CHANNEL, payload, 1));
    for (size_t i = 0; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_OK);
    ASSERT_EQ(in.cmd, CMD_GET_CHANNEL);
    ASSERT_EQ(in.payload[0], 0x42);
}

static void test_false_start_of_frame_bytes_are_handled(void) {
    g_current = __func__;
    /* 0xA5 followed by something that is not 0x5A must not consume the next real
     * frame's SOF. */
    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r;

    r = protocol_parser_push(&p, FRAME_SOF0, &in);
    ASSERT_EQ(r, PARSE_NEED_MORE);
    r = protocol_parser_push(&p, 0x00, &in); /* not SOF1 */
    ASSERT_EQ(r, PARSE_NEED_MORE);

    /* 0xA5 0xA5 0x5A: the first 0xA5 is noise, the second starts a real frame. */
    protocol_parser_push(&p, FRAME_SOF0, &in);
    protocol_parser_push(&p, FRAME_SOF0, &in);
    frame_out_t f;
    ASSERT(frame_build(&f, CMD_PING, NULL, 0));
    /* Feed from SOF1 onward: the parser already has SOF0 pending. */
    r = protocol_parser_push(&p, f.buf[1], &in); /* SOF1 */
    for (size_t i = 2; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_OK);
    ASSERT_EQ(in.cmd, CMD_PING);
}

static void test_oversized_declared_length_is_rejected(void) {
    g_current = __func__;
    /* A frame claiming 60000 bytes of payload would make a naive parser wait
     * forever (or overflow). Ours must reject on the length byte itself. */
    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r = PARSE_NEED_MORE;
    r = protocol_parser_push(&p, FRAME_SOF0, &in);
    r = protocol_parser_push(&p, FRAME_SOF1, &in);
    r = protocol_parser_push(&p, CMD_SET_CONFIG, &in);
    r = protocol_parser_push(&p, 0xFF, &in);
    r = protocol_parser_push(&p, 0xFF, &in); /* len = 65535 */
    /* The reject fires on the version byte, because the length is only complete
     * after both of its bytes have arrived. */
    r = protocol_parser_push(&p, PROTOCOL_VERSION, &in);
    ASSERT_EQ(r, PARSE_BAD_LEN);
    /* And it must still work afterwards. */
    frame_out_t f;
    ASSERT(frame_build(&f, CMD_PING, NULL, 0));
    for (size_t i = 0; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_OK);
}

static void test_wrong_version_is_reported(void) {
    g_current = __func__;
    frame_out_t f;
    ASSERT(frame_build(&f, CMD_PING, NULL, 0));
    f.buf[5] = PROTOCOL_VERSION + 1; /* a newer host talking to older firmware */
    /* The CRC still has to match, so rebuild it over the edited header. */
    uint16_t crc = crc16_ccitt(&f.buf[2], f.len - FRAME_OVERHEAD + 4);
    f.buf[f.len - 2] = (uint8_t)(crc & 0xFF);
    f.buf[f.len - 1] = (uint8_t)(crc >> 8);

    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    parse_result_t r = PARSE_NEED_MORE;
    for (size_t i = 0; i < f.len; i++) r = protocol_parser_push(&p, f.buf[i], &in);
    ASSERT_EQ(r, PARSE_BAD_VERSION); /* told the host, did not silently drop */
}

static void test_two_frames_back_to_back_both_parse(void) {
    g_current = __func__;
    frame_out_t a, b;
    ASSERT(frame_build(&a, CMD_PING, NULL, 0));
    const uint8_t pl[] = {2};
    ASSERT(frame_build(&b, CMD_SET_CHANNEL, pl, 1));

    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t in;
    int ok = 0;
    parse_result_t r;
    for (size_t i = 0; i < a.len; i++) {
        r = protocol_parser_push(&p, a.buf[i], &in);
        if (r == PARSE_OK) { ok++; ASSERT_EQ(in.cmd, CMD_PING); }
    }
    for (size_t i = 0; i < b.len; i++) {
        r = protocol_parser_push(&p, b.buf[i], &in);
        if (r == PARSE_OK) { ok++; ASSERT_EQ(in.cmd, CMD_SET_CHANNEL); }
    }
    ASSERT_EQ(ok, 2);
}

/* ---- info payload ------------------------------------------------------- */

static void test_info_frame_describes_the_device(void) {
    g_current = __func__;
    frame_out_t f;
    ASSERT(frame_build_info(&f, 7, CAP_ENCODER | CAP_FLASH));
    ASSERT_EQ(f.buf[2], CMD_INFO);
    ASSERT_EQ(f.len, (size_t)(FRAME_OVERHEAD + INFO_SIZE));
    const uint8_t *p = &f.buf[FRAME_HEADER_SIZE];
    ASSERT_EQ(p[0], (uint8_t)(MAGIC_U32 & 0xFF));
    ASSERT_EQ(p[8], CFG_CHANNEL_COUNT); /* 3 channels */
    ASSERT_EQ(p[9], CFG_KEY_COUNT);     /* 9 keys */
    ASSERT_EQ(p[10], CFG_LED_COUNT);    /* 9 LEDs */
    ASSERT_EQ(p[11], CAP_ENCODER | CAP_FLASH);
    uint16_t csz = (uint16_t)(p[12] | (p[13] << 8));
    ASSERT_EQ(csz, (int)sizeof(cfg_blob_t));
    uint16_t build = (uint16_t)(p[14] | (p[15] << 8));
    ASSERT_EQ(build, 7);
}

/* ---- config chunking ---------------------------------------------------- */

static void test_config_chunks_reassemble_exactly(void) {
    g_current = __func__;
    cfg_blob_t src;
    config_defaults(&src);
    src.channels[1].keys[3].type = ACTION_TYPE_TEXT;
    strcpy((char *)src.channels[1].keys[3].text, "hello world");
    config_reseal(&src);

    config_assembler_t a;
    config_assembler_init(&a);
    const uint8_t *raw = (const uint8_t *)&src;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        uint32_t off = (uint32_t)i * CFG_CHUNK_SIZE;
        uint32_t remain = sizeof(cfg_blob_t) - off;
        uint16_t n = remain > CFG_CHUNK_SIZE ? CFG_CHUNK_SIZE : (uint16_t)remain;
        ASSERT(config_assembler_add(&a, i, raw + off, n));
    }
    ASSERT(a.done);
    ASSERT(!a.error);
    ASSERT_EQ(memcmp(&a.blob, &src, sizeof(src)), 0);
}

static void test_out_of_order_chunk_is_rejected(void) {
    g_current = __func__;
    cfg_blob_t src;
    config_defaults(&src);
    config_assembler_t a;
    config_assembler_init(&a);
    const uint8_t *raw = (const uint8_t *)&src;
    /* Skipping chunk 0 and offering chunk 1 would silently zero the first 256
     * bytes, which includes the header. Must refuse. */
    ASSERT(!config_assembler_add(&a, 1, raw + CFG_CHUNK_SIZE, CFG_CHUNK_SIZE));
    ASSERT(a.error);
}

static void test_truncated_stream_never_reports_done(void) {
    g_current = __func__;
    cfg_blob_t src;
    config_defaults(&src);
    config_assembler_t a;
    config_assembler_init(&a);
    const uint8_t *raw = (const uint8_t *)&src;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT - 1; i++) {
        ASSERT(config_assembler_add(&a, i, raw + (uint32_t)i * CFG_CHUNK_SIZE, CFG_CHUNK_SIZE));
    }
    ASSERT(!a.done); /* missing the tail: must not validate a partial blob */
    ASSERT(!a.error);
}

static void test_final_chunk_with_bad_crc_is_rejected(void) {
    g_current = __func__;
    cfg_blob_t src;
    config_defaults(&src);
    src.crc32 ^= 0xFF; /* corrupt, as if flash bit-rotted in transit */
    config_assembler_t a;
    config_assembler_init(&a);
    const uint8_t *raw = (const uint8_t *)&src;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        uint32_t off = (uint32_t)i * CFG_CHUNK_SIZE;
        uint32_t remain = sizeof(cfg_blob_t) - off;
        uint16_t n = remain > CFG_CHUNK_SIZE ? CFG_CHUNK_SIZE : (uint16_t)remain;
        config_assembler_add(&a, i, raw + off, n);
    }
    ASSERT(a.done);
    ASSERT(a.error); /* completed but invalid */
}

/* ---- end-to-end through the real command handlers ----------------------- */

static size_t drain(uint8_t *out, size_t max) { return usb_proto_drain(out, max); }

static void send_frame(uint8_t cmd, const uint8_t *payload, uint16_t len) {
    frame_out_t f;
    ASSERT(frame_build(&f, cmd, payload, len));
    usb_proto_inject(f.buf, f.len);
}

static void test_handler_ping_replies_pong(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    send_frame(CMD_PING, NULL, 0);
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT_EQ((int)n, FRAME_OVERHEAD);
    ASSERT_EQ(buf[2], CMD_PONG);
}

static void test_handler_get_info_reports_four_channels(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    send_frame(CMD_GET_INFO, NULL, 0);
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT_EQ((int)n, FRAME_OVERHEAD + INFO_SIZE);
    ASSERT_EQ(buf[2], CMD_INFO);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 8], 4);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 9], 9);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 10], 9);
    /* Compiled board support is not proof of a responding SSD1306. The LED
     * capability states a bench compile flag, never measured safe current. */
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 11] & CAP_OLED, 0);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 11] & CAP_LED_OUTPUT,
              BOARD_LED_OUTPUT_ENABLED ? CAP_LED_OUTPUT : 0);
}

/* CAP_EVENTS means firmware can report events, NOT that the current config
 * already enables streaming. Otherwise an event-disabled pad cannot be opted
 * back in during an authenticated full-config upload: INFO would say it lacks
 * the very capability the user is trying to enable. */
static void test_info_event_capability_survives_disabled_stream(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    cfg_blob_t *cfg = config_mutable();
    cfg->global.usb_report_events = 0;
    config_reseal(cfg);
    events_enable(false);
    usb_proto_init();
    send_frame(CMD_GET_INFO, NULL, 0);
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT_EQ((int)n, FRAME_OVERHEAD + INFO_SIZE);
    ASSERT_EQ(buf[2], CMD_INFO);
    ASSERT_EQ(config_get()->global.usb_report_events, 0);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE + 11] & CAP_EVENTS, CAP_EVENTS);
    events_enable(true);
}

static void test_handler_unknown_command_reports_error(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    send_frame(0x77, NULL, 0);
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT(n >= (size_t)FRAME_OVERHEAD + 1);
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_UNKNOWN_CMD);
}

static void test_handler_get_config_streams_the_whole_blob(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();

    cfg_blob_t assembled;
    memset(&assembled, 0, sizeof(assembled));
    uint16_t filled = 0;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        send_frame(CMD_GET_CONFIG, &i, 1);
        uint8_t buf[CFG_CHUNK_SIZE + 64];
        size_t n = drain(buf, sizeof(buf));
        ASSERT(n > (size_t)FRAME_OVERHEAD + 4);
        ASSERT_EQ(buf[2], CMD_CONFIG_CHUNK);
        const uint8_t *pl = buf + FRAME_HEADER_SIZE;
        ASSERT_EQ(pl[0], i);                                  /* index */
        ASSERT_EQ(pl[1], CFG_CHUNK_COUNT);                    /* total */
        uint16_t len = (uint16_t)(pl[2] | ((uint16_t)pl[3] << 8));
        ASSERT_EQ((int)(n - FRAME_OVERHEAD - 4), len);
        memcpy((uint8_t *)&assembled + filled, pl + 4, len);
        filled = (uint16_t)(filled + len);
    }
    ASSERT_EQ(filled, (int)sizeof(cfg_blob_t));
    ASSERT(config_validate(&assembled));
    ASSERT_EQ(memcmp(&assembled, config_get(), sizeof(assembled)), 0);
}

static void test_handler_get_config_rejects_bad_chunk_index(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    uint8_t bad = CFG_CHUNK_COUNT; /* one past the end */
    send_frame(CMD_GET_CONFIG, &bad, 1);
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_BAD_ARG);
    ASSERT(n >= (size_t)FRAME_OVERHEAD + 1);
}

static void test_handler_set_channel_switches_and_replies(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    events_init();
    usb_proto_init();
    channel_set(0);

    uint8_t ch = 2;
    send_frame(CMD_SET_CHANNEL, &ch, 1);
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    ASSERT_EQ(channel_active(), 2);

    /* Out of range must be refused, not wrapped silently: an app bug that asks
     * for channel 9 should be visible. */
    ch = 9;
    send_frame(CMD_SET_CHANNEL, &ch, 1);
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(channel_active(), 2);
}

static void test_handler_get_channel_reports_active(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    events_init();
    usb_proto_init();
    channel_set(1);
    send_frame(CMD_GET_CHANNEL, NULL, 0);
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_CHANNEL);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], 1);
}

static void test_handler_preview_respects_led_output_gate(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    ASSERT(storage_commit());
    const uint8_t original_mode = config_get()->channels[0].lighting.mode;
    ASSERT_EQ(original_mode, LED_MODE_REACTIVE);

    cfg_lighting_t L;
    memset(&L, 0, sizeof(L));
    L.mode = LED_MODE_RAINBOW;
    L.brightness = 123;
    L.speed = 200;
    L.r = 1; L.g = 2; L.b = 3;

    uint8_t pl[1 + sizeof(cfg_lighting_t)];
    pl[0] = 0;
    memcpy(pl + 1, &L, sizeof(L));
    send_frame(CMD_PREVIEW_LIGHTING, pl, (uint16_t)sizeof(pl));
    uint8_t buf[64];
    drain(buf, sizeof(buf));
#if BOARD_LED_OUTPUT_ENABLED
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(config_get()->channels[0].lighting.mode, LED_MODE_RAINBOW);
#else
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_LED_DISABLED);
    ASSERT_EQ(config_get()->channels[0].lighting.mode, original_mode);
#endif
    /* A preview never marks flash dirty, including when refused. */
    ASSERT(!storage_stats()->dirty);

    /* Saving an inactive preset is useful even when physical output is gated. */
    send_frame(CMD_SET_LIGHTING, pl, (uint16_t)sizeof(pl));
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    ASSERT_EQ(config_get()->channels[0].lighting.mode, LED_MODE_RAINBOW);
    ASSERT(storage_stats()->dirty);
    send_frame(CMD_COMMIT, NULL, 0);
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_COMMIT_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    storage_init(); /* flashed settings survive, but the output gate remains */
    ASSERT_EQ(config_get()->channels[0].lighting.mode, LED_MODE_RAINBOW);
}

static void test_handler_set_lighting_rejects_bad_channel(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    cfg_lighting_t L;
    memset(&L, 0, sizeof(L));
    uint8_t pl[1 + sizeof(cfg_lighting_t)];
    pl[0] = 4; /* only 0..3 exist */
    memcpy(pl + 1, &L, sizeof(L));
    send_frame(CMD_SET_LIGHTING, pl, (uint16_t)sizeof(pl));
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_BAD_ARG);
}

static void test_handler_set_lighting_rejects_short_payload(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    uint8_t pl[4] = {0, 1, 2, 3}; /* far short of 1 + sizeof(cfg_lighting_t) */
    send_frame(CMD_SET_LIGHTING, pl, sizeof(pl));
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
}

static void test_handler_full_set_config_round_trip(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();

    cfg_blob_t src;
    config_defaults(&src);
    src.channels[0].keys[0].type = ACTION_TYPE_KEYCODE;
    src.channels[0].keys[0].code = HID_F1;
    src.channels[2].knob_tap.type = ACTION_TYPE_MEDIA;
    src.channels[2].knob_tap.code = MEDIA_PLAY_PAUSE;
    src.channels[1].lighting.mode = LED_MODE_SPECTRUM;
    src.channels[1].lighting.per_key_mask = 0x0001;
    src.channels[1].lighting.per_key[0][0] = 200;
    config_reseal(&src);

    const uint8_t *raw = (const uint8_t *)&src;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        uint32_t off = (uint32_t)i * CFG_CHUNK_SIZE;
        uint32_t remain = sizeof(cfg_blob_t) - off;
        uint16_t n = remain > CFG_CHUNK_SIZE ? CFG_CHUNK_SIZE : (uint16_t)remain;
        uint8_t pl[CFG_CHUNK_SIZE + 4];
        pl[0] = i;
        pl[1] = CFG_CHUNK_COUNT;
        pl[2] = (uint8_t)(n & 0xFF);
        pl[3] = (uint8_t)(n >> 8);
        memcpy(pl + 4, raw + off, n);
        send_frame(CMD_SET_CONFIG, pl, (uint16_t)(n + 4));
    }

    uint8_t buf[64];
    size_t got = drain(buf, sizeof(buf));
    ASSERT(got > 0);
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);

    /* Applied to RAM immediately. */
    ASSERT_EQ(config_get()->channels[0].keys[0].code, HID_F1);
    ASSERT_EQ(config_get()->channels[2].knob_tap.code, MEDIA_PLAY_PAUSE);
    ASSERT_EQ(config_get()->channels[1].lighting.mode, LED_MODE_SPECTRUM);
    ASSERT(storage_stats()->dirty);

    /* And persists on COMMIT. */
    send_frame(CMD_COMMIT, NULL, 0);
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_COMMIT_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    ASSERT(!storage_stats()->dirty);

    storage_init(); /* reboot */
    ASSERT_EQ(config_get()->channels[0].keys[0].code, HID_F1);
    ASSERT_EQ(config_get()->channels[1].lighting.per_key[0][0], 200);
}

static void test_handler_set_config_rejects_corrupt_stream(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();

    cfg_blob_t src;
    config_defaults(&src);
    src.channels[0].keys[0].code = HID_TAB;
    config_reseal(&src);
    src.crc32 ^= 0xFF; /* corrupt after sealing */

    const uint8_t *raw = (const uint8_t *)&src;
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        uint32_t off = (uint32_t)i * CFG_CHUNK_SIZE;
        uint32_t remain = sizeof(cfg_blob_t) - off;
        uint16_t n = remain > CFG_CHUNK_SIZE ? CFG_CHUNK_SIZE : (uint16_t)remain;
        uint8_t pl[CFG_CHUNK_SIZE + 4];
        pl[0] = i; pl[1] = CFG_CHUNK_COUNT;
        pl[2] = (uint8_t)(n & 0xFF); pl[3] = (uint8_t)(n >> 8);
        memcpy(pl + 4, raw + off, n);
        send_frame(CMD_SET_CONFIG, pl, (uint16_t)(n + 4));
    }
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR); /* refused, not half-applied */
    ASSERT_EQ(config_get()->channels[0].keys[0].code, 0u); /* RAM untouched */
}

static void test_handler_reset_config_restores_defaults(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    usb_proto_init();
    config_mutable()->channels[0].keys[0].type = ACTION_TYPE_KEYCODE;
    config_mutable()->channels[0].keys[0].code = HID_Z;
    config_reseal(config_mutable());
    ASSERT(storage_commit());

    send_frame(CMD_RESET_CONFIG, NULL, 0);
    uint8_t buf[64];
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    ASSERT_EQ(config_get()->channels[0].keys[0].type, ACTION_TYPE_NONE);

    storage_init(); /* reboot: still defaults, so it was written to flash */
    ASSERT_EQ(config_get()->channels[0].keys[0].type, ACTION_TYPE_NONE);
}

static void test_handler_led_test_gate_timeout_and_restore(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    events_init();
    usb_proto_init();
    usb_proto_pump(1000);
    uint8_t rgb[CFG_LED_COUNT * 3];
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        rgb[i * 3 + 0] = (uint8_t)(i * 10);
        rgb[i * 3 + 1] = 0;
        rgb[i * 3 + 2] = 255;
    }
    send_frame(CMD_LED_TEST, rgb, sizeof(rgb));
    uint8_t buf[64];
    drain(buf, sizeof(buf));
#if BOARD_LED_OUTPUT_ENABLED
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_OK);
    ASSERT(led_host_test_active(1000));
    ASSERT_EQ(led_host_last_frame()->px[0].b, 255);
    ASSERT(led_host_test_active(1000 + LED_TEST_HOLD_MS - 1));
    ASSERT(!led_host_test_active(1000 + LED_TEST_HOLD_MS));
    /* The next main.c LED tick resumes normal rendering. Raw data cannot
     * stick indefinitely (even if the host disconnects). */
    usb_proto_pump(UINT32_MAX - 99u);
    send_frame(CMD_LED_TEST, rgb, sizeof(rgb));
    drain(buf, sizeof(buf));
    ASSERT(led_host_test_active(UINT32_MAX - 99u + LED_TEST_HOLD_MS - 1u));
    ASSERT(!led_host_test_active(UINT32_MAX - 99u + LED_TEST_HOLD_MS));
    usb_proto_pump(1500);
    send_frame(CMD_LED_TEST, rgb, sizeof(rgb));
    drain(buf, sizeof(buf));
    ASSERT(led_host_test_active(1500));
    cfg_lighting_t L = config_get()->channels[0].lighting;
    L.mode = LED_MODE_STATIC;
    uint8_t settings[1 + sizeof(cfg_lighting_t)] = {0};
    memcpy(settings + 1, &L, sizeof(L));
    send_frame(CMD_SET_LIGHTING, settings, sizeof(settings));
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_SET_ACK);
    ASSERT(!led_host_test_active(1500)); /* explicit setting wins immediately */
    send_frame(CMD_LED_TEST, rgb, sizeof(rgb));
    drain(buf, sizeof(buf));
    ASSERT(led_host_test_active(1500));
    usb_proto_init();
    ASSERT(!led_host_test_active(1500)); /* USB reinitialization clears test */
#else
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_LED_DISABLED);
    ASSERT(!led_host_test_active(1000));
    /* Even a valid all-white raw frame is rejected; saved config unchanged. */
    ASSERT_EQ(config_get()->channels[0].lighting.mode, LED_MODE_REACTIVE);
#endif

    uint8_t short_pl[9] = {0};
    send_frame(CMD_LED_TEST, short_pl, sizeof(short_pl));
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_BAD_ARG);
    uint8_t long_pl[CFG_LED_COUNT * 3 + 1] = {0};
    send_frame(CMD_LED_TEST, long_pl, sizeof(long_pl));
    drain(buf, sizeof(buf));
    ASSERT_EQ(buf[2], CMD_ERROR);
    ASSERT_EQ(buf[FRAME_HEADER_SIZE], STATUS_BAD_ARG);
}

static void test_key_events_stream_when_enabled(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    events_init();
    usb_proto_init();
    ASSERT(config_get()->global.usb_report_events == 1);

    events_push(EV_SOURCE_KEY, 4, EV_TAP, 1, 0, ACTION_TYPE_KEYCODE);
    usb_proto_pump(1000); /* the pump is what serialises events */
    uint8_t buf[64];
    size_t n = drain(buf, sizeof(buf));
    ASSERT_EQ((int)n, FRAME_OVERHEAD + KEY_EVENT_SIZE);
    ASSERT_EQ(buf[2], CMD_KEY_EVENT);
    const uint8_t *p = buf + FRAME_HEADER_SIZE;
    ASSERT_EQ(p[0], EV_SOURCE_KEY);
    ASSERT_EQ(p[1], 4);
    ASSERT_EQ(p[2], EV_TAP);
    ASSERT_EQ(p[3], 1); /* channel */
    ASSERT_EQ(p[6] | (p[7] << 8), ACTION_TYPE_KEYCODE);
}


/* The RX path uses this to decide whether a printable byte is the start of a
 * text command line or part of a frame. Getting it backwards would make every
 * OLED:NEXT line look like a corrupt frame, or every frame look like text. */
static void test_hunting_reports_only_between_frames(void) {
    protocol_parser_t p;
    protocol_parser_init(&p);
    frame_in_t f;
    ASSERT(protocol_parser_hunting(&p));
    ASSERT(!protocol_parser_hunting(NULL));

    const uint8_t *frame = 0;
    uint8_t payload[1] = {0x00};
    frame_out_t out;
    ASSERT(frame_build(&out, CMD_PING, payload, 1));
    frame = out.buf;

    /* Mid-frame — including right after the first start byte — it is not
     * hunting, so those bytes go to the parser and never to the text scanner. */
    ASSERT_EQ(protocol_parser_push(&p, frame[0], &f), PARSE_NEED_MORE);
    ASSERT(!protocol_parser_hunting(&p));
    for (size_t i = 1; i + 1 < out.len; i++) {
        ASSERT_EQ(protocol_parser_push(&p, frame[i], &f), PARSE_NEED_MORE);
        ASSERT(!protocol_parser_hunting(&p));
    }
    ASSERT_EQ(protocol_parser_push(&p, frame[out.len - 1], &f), PARSE_OK);
    ASSERT(protocol_parser_hunting(&p));
}

const test_case_t protocol_tests[] = {
    {"crc16_matches_known_vectors", test_crc16_matches_known_vectors},
    {"crc32_matches_known_vectors", test_crc32_matches_known_vectors},
    {"frame_layout_is_exactly_as_specified", test_frame_layout_is_exactly_as_specified},
    {"empty_payload_frame_round_trips", test_empty_payload_frame_round_trips},
    {"oversized_payload_is_refused_not_truncated", test_oversized_payload_is_refused_not_truncated},
    {"corrupted_payload_byte_is_rejected", test_corrupted_payload_byte_is_rejected},
    {"parser_resyncs_after_garbage", test_parser_resyncs_after_garbage},
    {"hunting_reports_only_between_frames", test_hunting_reports_only_between_frames},
    {"false_start_of_frame_bytes_are_handled", test_false_start_of_frame_bytes_are_handled},
    {"oversized_declared_length_is_rejected", test_oversized_declared_length_is_rejected},
    {"wrong_version_is_reported", test_wrong_version_is_reported},
    {"two_frames_back_to_back_both_parse", test_two_frames_back_to_back_both_parse},
    {"info_frame_describes_the_device", test_info_frame_describes_the_device},
    {"config_chunks_reassemble_exactly", test_config_chunks_reassemble_exactly},
    {"out_of_order_chunk_is_rejected", test_out_of_order_chunk_is_rejected},
    {"truncated_stream_never_reports_done", test_truncated_stream_never_reports_done},
    {"final_chunk_with_bad_crc_is_rejected", test_final_chunk_with_bad_crc_is_rejected},
    {"handler_ping_replies_pong", test_handler_ping_replies_pong},
    {"handler_get_info_reports_four_channels", test_handler_get_info_reports_four_channels},
    {"info_event_capability_survives_disabled_stream", test_info_event_capability_survives_disabled_stream},
    {"handler_unknown_command_reports_error", test_handler_unknown_command_reports_error},
    {"handler_get_config_streams_the_whole_blob", test_handler_get_config_streams_the_whole_blob},
    {"handler_get_config_rejects_bad_chunk_index", test_handler_get_config_rejects_bad_chunk_index},
    {"handler_set_channel_switches_and_replies", test_handler_set_channel_switches_and_replies},
    {"handler_get_channel_reports_active", test_handler_get_channel_reports_active},
    {"handler_preview_respects_led_output_gate", test_handler_preview_respects_led_output_gate},
    {"handler_set_lighting_rejects_bad_channel", test_handler_set_lighting_rejects_bad_channel},
    {"handler_set_lighting_rejects_short_payload", test_handler_set_lighting_rejects_short_payload},
    {"handler_full_set_config_round_trip", test_handler_full_set_config_round_trip},
    {"handler_set_config_rejects_corrupt_stream", test_handler_set_config_rejects_corrupt_stream},
    {"handler_reset_config_restores_defaults", test_handler_reset_config_restores_defaults},
    {"handler_led_test_gate_timeout_and_restore", test_handler_led_test_gate_timeout_and_restore},
    {"key_events_stream_when_enabled", test_key_events_stream_when_enabled},
    {NULL, NULL},
};
