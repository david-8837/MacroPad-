/*
 * usb_proto.c — the config protocol over CDC.
 *
 * Request/response over a byte stream, driven from the main loop rather than
 * from a USB callback. Reason: the handlers touch storage (which blocks for
 * ~50 ms during a flash erase) and the config in RAM. Doing that inside an
 * interrupt context is how you get a pad that reboots once a month.
 *
 * Concurrency model: single threaded. usb_proto_pump() is called from the same
 * loop as the scan and the LEDs, so nothing here needs a lock. The only shared
 * state with the interrupt side is the TinyUSB CDC FIFO, which is internally
 * protected.
 */
#include "usb_proto.h"

#include <string.h>

#include "actions.h"
#include "channel.h"
#include "config.h"
#include "dispatch.h"
#include "events.h"
#include "hid_dev.h"
#include "ascii_cmd.h"
#include "protocol.h"
#include "leds.h"
#include "storage.h"

#ifndef USB_PROTO_NO_HW
#include "tusb.h"
#endif

/* TinyUSB's `tud_cdc_n_*` functions take the CDC INSTANCE index (0 ..
 * CFG_TUD_CDC-1), NOT the USB interface number. This device has exactly one CDC
 * interface, so the instance index is 0 even though hid_dev.c numbers that
 * interface ITF_NUM_CDC = 2 in the configuration descriptor. The two numbers
 * mean different things and are supposed to differ; conflating them is the
 * mistake this comment exists to prevent.
 *
 * The static assert in hid_dev.c pins CFG_TUD_CDC to 1, which is the only
 * assumption this constant rests on. */
#define CDC_INSTANCE 0

static protocol_parser_t s_parser;
static config_assembler_t s_assembler;
static bool s_rx_open;          /* a SET_CONFIG stream is in progress */
static uint32_t s_rx_opened_at; /* for the timeout below */

/* A half-finished SET_CONFIG must not wedge the pad forever: if the host
 * disappears mid-stream (browser tab closed, cable pulled) the assembler would
 * keep rejecting every later command as "out of order". 2 seconds of silence
 * abandons the stream. */
#define SET_CONFIG_TIMEOUT_MS 2000

/* TX ring. Replies are queued rather than sent inline, for two reasons:
 *   1. CDC can be momentarily full (the host is not reading yet) and a reply
 *      must not be dropped just because of that.
 *   2. A GET_CONFIG sweep produces 7 frames back to back, and the handlers
 *      should not have to care about pacing.
 * 4 slots of max frame size is ~2.1 kB of RAM. The RP2040 has 264 kB. */
#define TX_RING_SLOTS 4

typedef struct {
    uint8_t buf[CFG_PROTOCOL_MTU + FRAME_OVERHEAD];
    size_t len;
    size_t sent;
} tx_slot_t;

static tx_slot_t s_tx[TX_RING_SLOTS];
static uint8_t s_tx_head, s_tx_tail, s_tx_count;

static uint16_t s_fw_build = 1;
static uint32_t s_now_ms; /* last value passed to usb_proto_pump */

/* Retire the head slot once it has gone out completely. */
static void tx_advance(void) {
    if (s_tx_count == 0) return;
    tx_slot_t *s = &s_tx[s_tx_head];
    if (s->sent >= s->len) {
        s_tx_head = (uint8_t)((s_tx_head + 1) % TX_RING_SLOTS);
        s_tx_count--;
    }
}

static bool tx_push(const frame_out_t *f) {
    if (!f || f->len == 0) return false;
    if (s_tx_count >= TX_RING_SLOTS) return false; /* host is not reading at all */
    tx_slot_t *s = &s_tx[s_tx_tail];
    memcpy(s->buf, f->buf, f->len);
    s->len = f->len;
    s->sent = 0;
    s_tx_tail = (uint8_t)((s_tx_tail + 1) % TX_RING_SLOTS);
    s_tx_count++;
    return true;
}

static bool tx_queue(const uint8_t cmd, const void *payload, uint16_t len) {
    frame_out_t f;
    if (!frame_build(&f, cmd, (const uint8_t *)payload, len)) return false;
    return tx_push(&f);
}

static void tx_error(uint8_t code) {
    frame_out_t f;
    if (frame_build_error(&f, code)) tx_push(&f);
}

void usb_proto_init(void) {
    protocol_parser_init(&s_parser);
    config_assembler_init(&s_assembler);
    s_rx_open = false;
    s_tx_head = s_tx_tail = s_tx_count = 0;
}

void usb_proto_set_build(uint16_t build) { s_fw_build = build; }

/* ---- command handlers --------------------------------------------------- */
static uint8_t capabilities(void) {
    uint8_t c = CAP_ENCODER | CAP_FLASH;
    if (BOARD_OLED_PRESENT) c |= CAP_OLED;
    if (config_get()->global.usb_report_events) c |= CAP_EVENTS;
    return c;
}

static void handle_ping(void) { tx_queue(CMD_PONG, NULL, 0); }

static void handle_get_info(void) {
    frame_out_t f;
    if (frame_build_info(&f, s_fw_build, capabilities())) tx_push(&f);
}

static void handle_get_config(const uint8_t *payload, uint16_t len) {
    uint8_t index = (len >= 1) ? payload[0] : 0;
    const cfg_blob_t *cfg = config_get();
    if (index >= CFG_CHUNK_COUNT) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    uint32_t off = (uint32_t)index * CFG_CHUNK_SIZE;
    uint32_t remain = (uint32_t)sizeof(cfg_blob_t) - off;
    uint16_t n = (remain > CFG_CHUNK_SIZE) ? CFG_CHUNK_SIZE : (uint16_t)remain;

    /* Chunk framing: [index][count][n_lo][n_hi][bytes...]. The host needs index
     * and count to know when it is done and to reject a reorder. */
    uint8_t buf[CFG_CHUNK_SIZE + 4];
    buf[0] = index;
    buf[1] = CFG_CHUNK_COUNT;
    buf[2] = (uint8_t)(n & 0xFF);
    buf[3] = (uint8_t)(n >> 8);
    memcpy(buf + 4, ((const uint8_t *)cfg) + off, n);
    tx_queue(CMD_CONFIG_CHUNK, buf, (uint16_t)(n + 4));
}

static void handle_set_config(const uint8_t *payload, uint16_t len) {
    if (len < 5) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    uint8_t index = payload[0];
    uint8_t count = payload[1];
    uint16_t n = (uint16_t)(payload[2] | ((uint16_t)payload[3] << 8));
    if (count != CFG_CHUNK_COUNT || (uint16_t)(len - 4) != n || n > CFG_CHUNK_SIZE) {
        s_rx_open = false;
        tx_error(STATUS_BAD_ARG);
        return;
    }
    if (index == 0) {
        config_assembler_init(&s_assembler);
        s_rx_open = true;
    }
    if (!s_rx_open) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    s_rx_opened_at = s_now_ms;

    if (!config_assembler_add(&s_assembler, index, payload + 4, n)) {
        s_rx_open = false;
        tx_error(s_assembler.error ? STATUS_BAD_CRC : STATUS_BAD_ARG);
        return;
    }
    if (s_assembler.done) {
        s_rx_open = false;
        if (!storage_stage(&s_assembler.blob)) {
            tx_error(STATUS_BAD_CRC);
            return;
        }
        /* Applied to RAM immediately so the pad behaves as configured even if
         * the host never sends COMMIT. Flash write waits for COMMIT, or happens
         * automatically here if the host asked for one-shot semantics. */
        gesture_apply_config_from_live();
        tx_queue(CMD_SET_ACK, (const uint8_t[]){STATUS_OK}, 1);
    }
}

static void handle_commit(void) {
    uint8_t status = storage_commit() ? STATUS_OK : STATUS_FLASH_FAIL;
    tx_queue(CMD_COMMIT_ACK, &status, 1);
}

static void handle_reset_config(void) {
    uint8_t status = storage_reset() ? STATUS_OK : STATUS_FLASH_FAIL;
    gesture_apply_config_from_live();
    tx_queue(CMD_SET_ACK, &status, 1);
}

static void handle_get_channel(void) {
    uint8_t ch = channel_active();
    tx_queue(CMD_CHANNEL, &ch, 1);
}

static void handle_set_channel(const uint8_t *payload, uint16_t len) {
    if (len < 1 || payload[0] >= CFG_CHANNEL_COUNT) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    channel_set(payload[0]);
    tx_queue(CMD_SET_ACK, (const uint8_t[]){STATUS_OK}, 1);
}

static void handle_get_lighting(const uint8_t *payload, uint16_t len) {
    if (len < 1 || payload[0] >= CFG_CHANNEL_COUNT) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    const cfg_lighting_t *L = &config_get()->channels[payload[0]].lighting;
    uint8_t buf[1 + sizeof(cfg_lighting_t)];
    buf[0] = payload[0];
    memcpy(buf + 1, L, sizeof(*L));
    tx_queue(CMD_LIGHTING, buf, (uint16_t)sizeof(buf));
}

static void handle_set_lighting(uint8_t cmd, const uint8_t *payload, uint16_t len) {
    if (len < 1 + (uint16_t)sizeof(cfg_lighting_t)) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    uint8_t ch = payload[0];
    if (ch >= CFG_CHANNEL_COUNT) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    cfg_blob_t *cfg = config_mutable();
    memcpy(&cfg->channels[ch].lighting, payload + 1, sizeof(cfg_lighting_t));
    config_reseal(cfg);
    /* PREVIEW does not mark dirty: it is for the app's live colour picker and
     * must not survive a power cycle unless the user then saves. */
    if (cmd == CMD_SET_LIGHTING) storage_mark_dirty();
    tx_queue(CMD_SET_ACK, (const uint8_t[]){STATUS_OK}, 1);
}

static void handle_led_test(const uint8_t *payload, uint16_t len) {
    if (len < CFG_LED_COUNT * 3) {
        tx_error(STATUS_BAD_ARG);
        return;
    }
    /* Bypasses the lighting engine entirely: this is the "is my wiring right"
     * command. If LED 3 does not light when this says it should, the problem is
     * solder, not firmware. */
    led_host_test_override(payload);
    tx_queue(CMD_SET_ACK, (const uint8_t[]){STATUS_OK}, 1);
}

static void handle_bootloader(void) {
    tx_queue(CMD_SET_ACK, (const uint8_t[]){STATUS_OK}, 1);
    /* Give the host a moment to read the ack before the device disappears. */
    usb_proto_flush_blocking(50);
    hid_dev_enter_bootloader();
}

static void dispatch_command(const frame_in_t *f) {
    switch (f->cmd) {
    case CMD_PING: handle_ping(); break;
    case CMD_GET_INFO: handle_get_info(); break;
    case CMD_GET_CONFIG: handle_get_config(f->payload, f->len); break;
    case CMD_SET_CONFIG: handle_set_config(f->payload, f->len); break;
    case CMD_COMMIT: handle_commit(); break;
    case CMD_RESET_CONFIG: handle_reset_config(); break;
    case CMD_GET_CHANNEL: handle_get_channel(); break;
    case CMD_SET_CHANNEL: handle_set_channel(f->payload, f->len); break;
    case CMD_GET_LIGHTING: handle_get_lighting(f->payload, f->len); break;
    case CMD_SET_LIGHTING:
    case CMD_PREVIEW_LIGHTING: handle_set_lighting(f->cmd, f->payload, f->len); break;
    case CMD_LED_TEST: handle_led_test(f->payload, f->len); break;
    case CMD_BOOTLOADER: handle_bootloader(); break;
    default: tx_error(STATUS_UNKNOWN_CMD); break;
    }
}

/* ---- pump --------------------------------------------------------------- */
void usb_proto_pump(uint32_t now_ms) {
    s_now_ms = now_ms;
    /* Abandon a stalled SET_CONFIG stream. */
    if (s_rx_open && (now_ms - s_rx_opened_at) > SET_CONFIG_TIMEOUT_MS) {
        s_rx_open = false;
        config_assembler_init(&s_assembler);
    }

#ifndef USB_PROTO_NO_HW
    /* TX first: draining the reply for the previous command keeps the host from
     * waiting on us while we read the next one. */
    while (s_tx_count > 0) {
        tx_slot_t *s = &s_tx[s_tx_head];
        uint32_t avail = tud_cdc_n_write_available(CDC_INSTANCE);
        if (avail == 0) {
            tud_cdc_n_write_flush(CDC_INSTANCE);
            break;
        }
        uint32_t n = (uint32_t)(s->len - s->sent);
        if (n > avail) n = avail;
        uint32_t wrote = tud_cdc_n_write(CDC_INSTANCE, s->buf + s->sent, n);
        s->sent += wrote;
        if (wrote == 0) break;
        if (s->sent >= s->len) {
            tud_cdc_n_write_flush(CDC_INSTANCE);
            tx_advance();
            continue;
        }
        break;
    }

    /* RX: feed the parser one byte at a time. A full frame arrives across
     * several CDC reads; the parser holds its own state between calls. */
    frame_in_t f;
    for (;;) {
        uint8_t b;
        uint32_t n = tud_cdc_n_read(CDC_INSTANCE, &b, 1);
        if (n == 0) break;
        /* Two protocols, one wire. While no frame is in flight, printable bytes
         * belong to a text command line (OLED:NEXT, OLED:MODE:3, ...); a binary
         * frame can never start with one, because SOF0 is 0xA5. Once the parser
         * has a partial frame, every byte goes to it. */
        if (protocol_parser_hunting(&s_parser) && b >= 0x20 && b != 0x7f) {
            (void)ascii_cmd_feed(b);
            continue;
        }
        parse_result_t r = protocol_parser_push(&s_parser, b, &f);
        if (r == PARSE_OK) {
            dispatch_command(&f);
        } else {
            /* Report the reason, not a catch-all. magic.h defines a distinct
             * status for each of these, and collapsing them onto BAD_CRC - which
             * this used to do - sends the app chasing line noise when the real
             * problem was a protocol version mismatch or a truncated frame. The
             * three causes have three different fixes and the host cannot tell
             * them apart any other way.
             *
             * PARSE_NEED_MORE is the normal case mid-frame and PARSE_RESYNC means
             * junk was dropped while hunting for the start-of-frame magic. Neither
             * gets a reply: answering RESYNC would mean replying to bytes that were
             * never a frame, which is how a line glitch turns into a flood. */
            switch (r) {
            case PARSE_BAD_CRC:     tx_error(STATUS_BAD_CRC);     break;
            case PARSE_BAD_LEN:     tx_error(STATUS_BAD_LENGTH);  break;
            case PARSE_BAD_VERSION: tx_error(STATUS_BAD_VERSION); break;
            default:                                              break;
            }
        }
    }

#endif

    /* Stream pending events. Deliberately OUTSIDE the hardware guard: this is
     * protocol logic, not CDC plumbing, so the host tests exercise the real
     * code path instead of a copy of it. */
    if (config_get()->global.usb_report_events) {
        key_event_t ev;
        int budget = 4; /* do not let event traffic starve command replies */
        while (budget-- > 0 && events_pop(&ev)) {
            if (!tx_queue(CMD_KEY_EVENT, &ev, sizeof(ev))) {
                /* Ring full: put it back rather than lose it, and try next tick. */
                events_push(ev.source, ev.index, ev.event, ev.channel, ev.value, ev.action);
                break;
            }
        }
    }
}

void usb_proto_flush_blocking(uint32_t max_ms) {
#ifndef USB_PROTO_NO_HW
    uint32_t waited = 0;
    while ((s_tx_count > 0) && waited < max_ms) {
        usb_proto_pump(s_now_ms + waited);
        waited += 2;
    }
    tud_cdc_n_write_flush(CDC_INSTANCE);
#else
    (void)max_ms;
#endif
}

/* Accessors the host-side diagnostics like to have. */
uint32_t usb_proto_frames_ok(void) { return s_parser.frames_ok; }
uint32_t usb_proto_frames_bad_crc(void) { return s_parser.frames_bad_crc; }
uint32_t usb_proto_frames_resync(void) { return s_parser.frames_resync; }
bool usb_proto_rx_open(void) { return s_rx_open; }

/* Feed bytes in without CDC (used by host tests against the real handler code). */
void usb_proto_inject(const uint8_t *data, size_t len) {
    frame_in_t f;
    for (size_t i = 0; i < len; i++) {
        parse_result_t r = protocol_parser_push(&s_parser, data[i], &f);
        if (r == PARSE_OK) dispatch_command(&f);
    }
}

/* Pull the pending reply (host tests). Returns ONE frame per call, which is
 * what the tests want: each asserts on a single frame's header. */
size_t usb_proto_drain(uint8_t *out, size_t max) {
    if (s_tx_count == 0 || !out) return 0;
    tx_slot_t *s = &s_tx[s_tx_head];
    size_t n = s->len - s->sent;
    if (n > max) n = max;
    if (n) memcpy(out, s->buf + s->sent, n);
    s->sent += n;
    tx_advance();
    return n;
}
