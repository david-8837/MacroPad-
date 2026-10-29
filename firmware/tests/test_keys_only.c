/* Integration checks against the real headless firmware protocol handlers. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "board.h"
#include "config.h"
#include "events.h"
#include "oled.h"
#include "protocol.h"
#include "storage.h"
#include "usb_proto.h"

static uint8_t reply[CFG_CHUNK_SIZE + 64];
static size_t request(uint8_t cmd, const uint8_t *payload, uint16_t len) {
    frame_out_t frame;
    assert(frame_build(&frame, cmd, payload, len));
    usb_proto_inject(frame.buf, frame.len);
    return usb_proto_drain(reply, sizeof(reply));
}

int main(void) {
    assert(BOARD_KEYS_ONLY && !BOARD_OLED_PRESENT && !BOARD_LED_OUTPUT_ENABLED);
    storage_init();
    events_init();
    usb_proto_init();
    oled_host_set_present(1); /* cannot spoof hardware on a headless build */
    assert(!oled_hw_init() && !oled_hw_present());
    assert(request(CMD_GET_INFO, NULL, 0) == FRAME_OVERHEAD + INFO_SIZE);
    assert(reply[2] == CMD_INFO);
    assert(reply[FRAME_HEADER_SIZE + 8] == 4);
    assert(reply[FRAME_HEADER_SIZE + 9] == 9);
    assert(reply[FRAME_HEADER_SIZE + 10] == 0);
    uint8_t caps = reply[FRAME_HEADER_SIZE + 11];
    assert((caps & (CAP_ENCODER | CAP_FLASH | CAP_EVENTS)) == (CAP_ENCODER | CAP_FLASH | CAP_EVENTS));
    assert(!(caps & (CAP_OLED | CAP_OLED_STREAM | CAP_LED_OUTPUT)));

    assert(request(CMD_PING, NULL, 0) == FRAME_OVERHEAD && reply[2] == CMD_PONG);
    assert(request(CMD_GET_OLED_STATE, NULL, 0) && reply[2] == CMD_ERROR);
    uint8_t mode = 0;
    assert(request(CMD_SET_OLED_MODE, &mode, 1) && reply[2] == CMD_ERROR);
    uint8_t oled_chunk[4] = {0};
    assert(request(CMD_OLED_FRAME, oled_chunk, sizeof(oled_chunk)) == 0);
    oled_chunk[3] = 1;
    assert(request(CMD_OLED_FRAME, oled_chunk, sizeof(oled_chunk)) && reply[2] == CMD_ERROR);
    uint8_t rgb[CFG_LED_COUNT * 3] = {0};
    assert(request(CMD_LED_TEST, rgb, sizeof(rgb)) && reply[2] == CMD_ERROR);
    assert(reply[FRAME_HEADER_SIZE] == STATUS_LED_DISABLED);

    cfg_blob_t cfg;
    config_defaults(&cfg);
    cfg.channels[0].keys[0].type = ACTION_TYPE_KEYCODE;
    cfg.channels[0].keys[0].code = HID_F1;
    cfg.channels[2].knob_tap.type = ACTION_TYPE_MEDIA;
    cfg.channels[2].knob_tap.code = MEDIA_PLAY_PAUSE;
    config_reseal(&cfg);
    for (uint8_t i = 0; i < CFG_CHUNK_COUNT; i++) {
        size_t off = i * CFG_CHUNK_SIZE;
        size_t n = sizeof(cfg) - off;
        if (n > CFG_CHUNK_SIZE) n = CFG_CHUNK_SIZE;
        uint8_t payload[4 + CFG_CHUNK_SIZE] = {i, CFG_CHUNK_COUNT, (uint8_t)n, (uint8_t)(n >> 8)};
        memcpy(payload + 4, (const uint8_t *)&cfg + off, n);
        size_t got = request(CMD_SET_CONFIG, payload, (uint16_t)(n + 4));
        if (i + 1 == CFG_CHUNK_COUNT) assert(got && reply[2] == CMD_SET_ACK && reply[FRAME_HEADER_SIZE] == STATUS_OK);
        else assert(got == 0);
    }
    assert(request(CMD_COMMIT, NULL, 0) && reply[2] == CMD_COMMIT_ACK && reply[FRAME_HEADER_SIZE] == STATUS_OK);
    storage_init();
    assert(memcmp(config_get(), &cfg, sizeof(cfg)) == 0);
    puts("keys-only protocol: truthful capabilities, rejected peripherals, key/knob config commit/readback OK");
    return 0;
}
