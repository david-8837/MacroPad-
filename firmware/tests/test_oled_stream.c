/* SDK-free tests of the SAME atomic assembler and USB handlers as production.
 * A fake I2C ACK exposes the complete endpoint without needing an RP2040. */
#include <stdint.h>
#include <string.h>

#include "config.h"
#include "events.h"
#include "oled.h"
#include "oled_playlist.h"
#include "oled_stream.h"
#include "protocol.h"
#include "storage.h"
#include "test.h"
#include "test_runner.h"
#include "usb_proto.h"

extern void storage_host_reset(void);

static void pattern(uint8_t pages[OLED_FRAME_BYTES]) {
    for (unsigned i = 0; i < OLED_FRAME_BYTES; i++) pages[i] = (uint8_t)(i * 37u + (i >> 6));
}

static void chunk(uint8_t payload[OLED_STREAM_PAYLOAD_BYTES], const uint8_t *pages,
                  uint16_t seq, uint8_t mode, uint8_t index) {
    uint32_t crc = crc32_ieee(pages, OLED_FRAME_BYTES);
    payload[0] = (uint8_t)seq;
    payload[1] = (uint8_t)(seq >> 8);
    payload[2] = mode;
    payload[3] = index;
    payload[4] = OLED_STREAM_CHUNK_COUNT;
    payload[5] = (uint8_t)crc;
    payload[6] = (uint8_t)(crc >> 8);
    payload[7] = (uint8_t)(crc >> 16);
    payload[8] = (uint8_t)(crc >> 24);
    memcpy(payload + OLED_STREAM_HEADER_BYTES,
           pages + index * OLED_STREAM_CHUNK_BYTES, OLED_STREAM_CHUNK_BYTES);
}

static void test_two_halves_publish_atomically_and_expire(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 513, OLED_SCREEN_SYSTEM, 0);
    chunk(p1, pages, 513, OLED_SCREEN_SYSTEM, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 1000, OLED_SCREEN_SYSTEM, true), OLED_STREAM_WAITING);
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 1000) == NULL);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 1001, OLED_SCREEN_SYSTEM, true), OLED_STREAM_COMPLETE);
    const uint8_t *live = oled_stream_frame(OLED_SCREEN_SYSTEM, 1001);
    ASSERT(live != NULL);
    if (live) {
        ASSERT_EQ(memcmp(live, pages, sizeof(pages)), 0); /* all four SSD1306 pages */
        ASSERT_EQ(live[127], pages[127]);
        ASSERT_EQ(live[128], pages[128]);
        ASSERT_EQ(live[511], pages[511]);
    }
    ASSERT(oled_stream_frame(OLED_SCREEN_MEDIA, 1001) == NULL);
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 2201) != NULL); /* inclusive */
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 2202) == NULL); /* local fallback */
}

static void test_lost_half_and_staging_timeout_never_publish(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 1, OLED_SCREEN_CLOCK, 0);
    chunk(p1, pages, 1, OLED_SCREEN_CLOCK, 1);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 500, OLED_SCREEN_CLOCK, true), OLED_STREAM_BAD_ARG);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 500, OLED_SCREEN_CLOCK, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 850, OLED_SCREEN_CLOCK, true), OLED_STREAM_COMPLETE);
    oled_stream_init();
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 500, OLED_SCREEN_CLOCK, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 851, OLED_SCREEN_CLOCK, true), OLED_STREAM_BAD_ARG);
    ASSERT(oled_stream_frame(OLED_SCREEN_CLOCK, 851) == NULL);
}

static void test_wrong_seq_mode_or_crc_rejects_both_halves(void) {
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    for (int variant = 0; variant < 4; variant++) {
        oled_stream_init();
        chunk(p0, pages, 22, OLED_SCREEN_KADOWAZ, 0);
        chunk(p1, pages, 22, OLED_SCREEN_KADOWAZ, 1);
        ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 100, OLED_SCREEN_KADOWAZ, true), OLED_STREAM_WAITING);
        if (variant == 0) p1[0]++;                  /* other sequence */
        if (variant == 1) p1[2] = OLED_SCREEN_CLOCK; /* different screen */
        if (variant == 2) p1[5] ^= 1;               /* other declared CRC */
        if (variant == 3) p1[4] = 3;                /* wrong chunk count */
        ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 101, OLED_SCREEN_KADOWAZ, true), OLED_STREAM_BAD_ARG);
        ASSERT(oled_stream_frame(OLED_SCREEN_KADOWAZ, 101) == NULL);
    }
}

static void test_full_crc_catches_corruption_with_valid_packet_crc(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 3, OLED_SCREEN_MEDIA, 0);
    chunk(p1, pages, 3, OLED_SCREEN_MEDIA, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 300, OLED_SCREEN_MEDIA, true), OLED_STREAM_WAITING);
    p1[OLED_STREAM_HEADER_BYTES + 255] ^= 0x80;
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 301, OLED_SCREEN_MEDIA, true), OLED_STREAM_BAD_CRC);
    ASSERT(oled_stream_frame(OLED_SCREEN_MEDIA, 301) == NULL);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1) - 1, 302, OLED_SCREEN_MEDIA, true), OLED_STREAM_BAD_ARG);
}

static void test_invalid_modes_missing_panel_and_switch_evict_pixels(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 7, OLED_SCREEN_SYSTEM, 0);
    chunk(p1, pages, 7, OLED_SCREEN_SYSTEM, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 10, OLED_SCREEN_SYSTEM, false), OLED_STREAM_BAD_ARG);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 11, OLED_SCREEN_SYSTEM, true), OLED_STREAM_BAD_ARG);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 20, OLED_SCREEN_SYSTEM, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 21, OLED_SCREEN_SYSTEM, true), OLED_STREAM_COMPLETE);
    oled_stream_invalidate();
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 22) == NULL);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 23, OLED_SCREEN_MEDIA, true), OLED_STREAM_BAD_ARG);
    chunk(p0, pages, 8, OLED_SCREEN_LOADER, 0); /* baked art is autonomous */
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 24, OLED_SCREEN_LOADER, true), OLED_STREAM_BAD_ARG);
    chunk(p0, pages, 9, OLED_SCREEN_COUNT, 0);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 25, OLED_SCREEN_COUNT, true), OLED_STREAM_BAD_ARG);
}

static void test_sequences_wrap_and_replays_do_not_refresh_frame(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 0xffff, OLED_SCREEN_SYSTEM, 0);
    chunk(p1, pages, 0xffff, OLED_SCREEN_SYSTEM, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 10, OLED_SCREEN_SYSTEM, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 11, OLED_SCREEN_SYSTEM, true), OLED_STREAM_COMPLETE);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 12, OLED_SCREEN_SYSTEM, true), OLED_STREAM_STALE);
    chunk(p0, pages, 0, OLED_SCREEN_SYSTEM, 0);
    chunk(p1, pages, 0, OLED_SCREEN_SYSTEM, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 13, OLED_SCREEN_SYSTEM, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 14, OLED_SCREEN_SYSTEM, true), OLED_STREAM_COMPLETE);
    oled_stream_invalidate();
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 15, OLED_SCREEN_SYSTEM, true), OLED_STREAM_STALE);
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 15) == NULL);
    /* Sequence is a per-session aid, not a persistent lockout after a cable
     * swap: a new host starts at 0 after the old frame's TTL. */
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), 1215, OLED_SCREEN_SYSTEM, true), OLED_STREAM_WAITING);
}

static void test_millisecond_counter_wraps_safely(void) {
    oled_stream_init();
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 11, OLED_SCREEN_CLOCK, 0);
    chunk(p1, pages, 11, OLED_SCREEN_CLOCK, 1);
    ASSERT_EQ(oled_stream_accept(p0, sizeof(p0), UINT32_MAX - 10u, OLED_SCREEN_CLOCK, true), OLED_STREAM_WAITING);
    ASSERT_EQ(oled_stream_accept(p1, sizeof(p1), 5u, OLED_SCREEN_CLOCK, true), OLED_STREAM_COMPLETE);
    ASSERT(oled_stream_frame(OLED_SCREEN_CLOCK, 1205u) != NULL);
    ASSERT(oled_stream_frame(OLED_SCREEN_CLOCK, 1206u) == NULL);
}

static void send_command(uint8_t command, const uint8_t *payload, uint16_t len) {
    frame_out_t f;
    ASSERT(frame_build(&f, command, payload, len));
    if (f.len) usb_proto_inject(f.buf, f.len);
}

static size_t receive(uint8_t *out, size_t cap) { return usb_proto_drain(out, cap); }

static void test_mode_events_coalesce_without_a_serial_reader(void) {
    storage_host_reset(); storage_init(); events_init();
    usb_proto_init();
    oled_playlist_set_listener(usb_proto_oled_mode_changed);
    oled_playlist_init(OLED_SCREEN_SYSTEM, 100);
    usb_proto_pump(100); /* one boot event in TX; pretend CDC is unplugged */
    for (int i = 0; i < 25; i++) {
        oled_playlist_advance(1);
        usb_proto_pump((uint32_t)(101 + i));
    }
    uint8_t expected = oled_playlist_current();
    send_command(CMD_PING, NULL, 0);
    uint8_t reply[32];
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_MODE_EVENT);
    ASSERT_EQ(reply[6], expected); /* latest, not 25 stale events */
    ASSERT_EQ(reply[7], 26);       /* boot plus 25 changes */
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD);
    ASSERT_EQ(reply[2], CMD_PONG); /* a new host can still handshake */
    ASSERT_EQ(receive(reply, sizeof(reply)), 0u);
    oled_playlist_set_listener(NULL);
}

static void test_corrupt_usb_packet_cannot_leave_orphan_error(void) {
    storage_host_reset(); storage_init(); events_init();
    oled_host_set_present(1);
    oled_playlist_set_listener(NULL);
    oled_playlist_init(OLED_SCREEN_MEDIA, 100);
    usb_proto_init();
    usb_proto_pump(100);
    uint8_t out[600], pages[OLED_FRAME_BYTES];
    uint8_t p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 1, OLED_SCREEN_MEDIA, 0);
    chunk(p1, pages, 1, OLED_SCREEN_MEDIA, 1);
    frame_out_t bad;
    ASSERT(frame_build(&bad, CMD_OLED_FRAME, p0, sizeof(p0)));
    bad.buf[FRAME_HEADER_SIZE + OLED_STREAM_HEADER_BYTES] ^= 1;
    usb_proto_inject(bad.buf, bad.len); /* frame-level CRC fails on first half */
    ASSERT_EQ(receive(out, sizeof(out)), 0u);
    send_command(CMD_OLED_FRAME, p1, sizeof(p1));
    ASSERT_EQ(receive(out, sizeof(out)), FRAME_OVERHEAD + 1);
    ASSERT_EQ(out[2], CMD_ERROR);
    ASSERT_EQ(out[6], STATUS_BAD_ARG);
    ASSERT_EQ(receive(out, sizeof(out)), 0u); /* no orphan ERROR */
    ASSERT(oled_stream_frame(OLED_SCREEN_MEDIA, 100) == NULL);

    chunk(p0, pages, 2, OLED_SCREEN_MEDIA, 0);
    chunk(p1, pages, 2, OLED_SCREEN_MEDIA, 1);
    send_command(CMD_OLED_FRAME, p0, sizeof(p0));
    ASSERT(frame_build(&bad, CMD_OLED_FRAME, p1, sizeof(p1)));
    bad.buf[FRAME_HEADER_SIZE + OLED_STREAM_HEADER_BYTES] ^= 1;
    usb_proto_inject(bad.buf, bad.len); /* corrupt final half: host times out */
    ASSERT_EQ(receive(out, sizeof(out)), 0u);
    ASSERT(oled_stream_frame(OLED_SCREEN_MEDIA, 101) == NULL);
    oled_host_set_present(0);
}

static void test_usb_handler_ack_mode_event_and_local_fallback(void) {
    storage_host_reset();
    storage_init();
    events_init();
    oled_host_set_present(1); /* fake I2C ACK — the protocol advertises OLED */
    usb_proto_init();
    oled_playlist_set_listener(usb_proto_oled_mode_changed);
    oled_playlist_init(OLED_SCREEN_SYSTEM, 100);
    usb_proto_pump(100);
    uint8_t reply[600];
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_MODE_EVENT);
    ASSERT_EQ(reply[6], OLED_SCREEN_SYSTEM);

    send_command(CMD_GET_INFO, NULL, 0);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + INFO_SIZE);
    ASSERT_EQ(reply[2], CMD_INFO);
    ASSERT((reply[6 + 11] & (CAP_OLED | CAP_OLED_STREAM)) == (CAP_OLED | CAP_OLED_STREAM));
    send_command(CMD_GET_OLED_STATE, NULL, 0);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_STATE);
    ASSERT_EQ(reply[6], OLED_SCREEN_SYSTEM);
    ASSERT_EQ(reply[7], 1); /* epoch */

    const bool was_dirty = storage_stats()->dirty; /* factory first boot may be dirty */
    const uint32_t writes_before = storage_stats()->writes;
    uint8_t pages[OLED_FRAME_BYTES], p0[OLED_STREAM_PAYLOAD_BYTES], p1[OLED_STREAM_PAYLOAD_BYTES];
    pattern(pages);
    chunk(p0, pages, 32, OLED_SCREEN_SYSTEM, 0);
    chunk(p1, pages, 32, OLED_SCREEN_SYSTEM, 1);
    send_command(CMD_OLED_FRAME, p0, sizeof(p0));
    ASSERT_EQ(receive(reply, sizeof(reply)), 0u); /* no premature ACK */
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 100) == NULL);
    send_command(CMD_OLED_FRAME, p1, sizeof(p1));
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + 3);
    ASSERT_EQ(reply[2], CMD_OLED_FRAME_ACK);
    ASSERT_EQ(reply[6] | (reply[7] << 8), 32);
    ASSERT_EQ(reply[8], OLED_SCREEN_SYSTEM);
    ASSERT_EQ(memcmp(oled_stream_frame(OLED_SCREEN_SYSTEM, 100), pages, sizeof(pages)), 0);
    ASSERT_EQ(storage_stats()->dirty, was_dirty); /* pixels never touch flash */
    ASSERT_EQ(storage_stats()->writes, writes_before);

    /* Physical NEXT and autoplay both use the playlist listener, not key events
     * (which users may disable). No old SYSTEM canvas survives the switch. */
    oled_playlist_advance(1);
    usb_proto_pump(110);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_MODE_EVENT);
    ASSERT_EQ(reply[6], OLED_SCREEN_MEDIA);
    ASSERT_EQ(reply[7], 2);
    ASSERT(oled_stream_frame(OLED_SCREEN_SYSTEM, 110) == NULL);
    ASSERT(oled_stream_frame(OLED_SCREEN_MEDIA, 110) == NULL);

    send_command(CMD_SET_OLED_MODE, (const uint8_t[]){OLED_SCREEN_CLOCK}, 1);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_STATE);
    ASSERT_EQ(reply[6], OLED_SCREEN_CLOCK);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_CLOCK);
    usb_proto_pump(120);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_MODE_EVENT);
    ASSERT_EQ(reply[6], OLED_SCREEN_CLOCK);
    ASSERT_EQ(reply[7], 3);

    /* Rotation still notifies the app even if ordinary KEY_EVENT reports are
     * disabled; this is display state, not a key event subscription. */
    cfg_blob_t *cfg = config_mutable();
    cfg->global.usb_report_events = 0;
    cfg->global.oled_auto_cycle_s = 3;
    config_reseal(cfg);
    oled_playlist_touch(120);
    ASSERT(oled_playlist_tick(3121));
    usb_proto_pump(3121);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + sizeof(oled_state_t));
    ASSERT_EQ(reply[2], CMD_OLED_MODE_EVENT);
    ASSERT_EQ(reply[6], OLED_SCREEN_RADAR);
    ASSERT_EQ(reply[7], 4);

    oled_host_set_present(0);
    send_command(CMD_OLED_FRAME, p0, sizeof(p0));
    ASSERT_EQ(receive(reply, sizeof(reply)), 0u); /* only the final half can reject */
    send_command(CMD_OLED_FRAME, p1, sizeof(p1));
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + 1);
    ASSERT_EQ(reply[2], CMD_ERROR);
    ASSERT_EQ(reply[6], STATUS_BAD_ARG);
    ASSERT_EQ(receive(reply, sizeof(reply)), 0u); /* no second stale ERROR */
    send_command(CMD_SET_OLED_MODE, (const uint8_t[]){OLED_SCREEN_SYSTEM}, 1);
    ASSERT_EQ(receive(reply, sizeof(reply)), FRAME_OVERHEAD + 1);
    ASSERT_EQ(reply[2], CMD_ERROR);
    ASSERT_EQ(oled_playlist_current(), OLED_SCREEN_RADAR);
    send_command(CMD_GET_INFO, NULL, 0);
    receive(reply, sizeof(reply));
    ASSERT((reply[6 + 11] & (CAP_OLED | CAP_OLED_STREAM)) == 0);

    oled_playlist_set_listener(NULL);
    oled_host_set_present(0);
}

const test_case_t oled_stream_tests[] = {
    {"two_halves_publish_atomically_and_expire", test_two_halves_publish_atomically_and_expire},
    {"lost_half_and_staging_timeout_never_publish", test_lost_half_and_staging_timeout_never_publish},
    {"wrong_seq_mode_or_crc_rejects_both_halves", test_wrong_seq_mode_or_crc_rejects_both_halves},
    {"full_crc_catches_corruption_with_valid_packet_crc", test_full_crc_catches_corruption_with_valid_packet_crc},
    {"invalid_modes_missing_panel_and_switch_evict_pixels", test_invalid_modes_missing_panel_and_switch_evict_pixels},
    {"sequences_wrap_and_replays_do_not_refresh_frame", test_sequences_wrap_and_replays_do_not_refresh_frame},
    {"millisecond_counter_wraps_safely", test_millisecond_counter_wraps_safely},
    {"mode_events_coalesce_without_a_serial_reader", test_mode_events_coalesce_without_a_serial_reader},
    {"corrupt_usb_packet_cannot_leave_orphan_error", test_corrupt_usb_packet_cannot_leave_orphan_error},
    {"usb_handler_ack_mode_event_and_local_fallback", test_usb_handler_ack_mode_event_and_local_fallback},
    {NULL, NULL},
};
