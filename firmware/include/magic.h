/*
 * magic.h — the single source of truth for protocol identifiers.
 *
 * This file is deliberately dependency-free C so that tools/gen_protocol.py can
 * parse it with a regex and emit the host-side JSON/TypeScript/markdown. Do not
 * add logic, includes, or computed values here; keep it to plain #defines with
 * an integer literal or a string literal on the right.
 *
 * Bump PROTOCOL_VERSION for any change to frame layout or command semantics.
 * Bump CONFIG_FORMAT_VERSION for any change to cfg_blob_t's byte layout.
 * They are independent: a new command does not invalidate a saved config.
 */
#ifndef MAGIC_H
#define MAGIC_H

#define MAGIC_STRING "MPAD3"
#define MAGIC_U32 0x4D504144u /* 'M','P','A','D' little-endian */
#define MAGIC_CONFIG 0x43464733u /* 'CFG3' — start of a saved config blob */

#define PROTOCOL_VERSION 3 /* LED output gate/capability and status; config stays v3 */
/* v2: four channels. v3 adds OLED boot mode, contrast and inversion. The
 * storage loader migrates CRC-valid v2 A/B sectors without erasing bindings;
 * host SET_CONFIG requires the current v3 wire format. */
#define CONFIG_FORMAT_VERSION 3

#define FRAME_SOF0 0xA5
#define FRAME_SOF1 0x5A

/* Frame header is 6 bytes: SOF0 SOF1 CMD LEN_LO LEN_HI VER, then LEN payload
 * bytes, then 2 bytes of CRC-16/CCITT-FALSE over CMD..payload inclusive.
 * Max LEN is CFG_PROTOCOL_MTU (512). */
#define FRAME_HEADER_SIZE 6
#define FRAME_CRC_SIZE 2
#define FRAME_OVERHEAD (FRAME_HEADER_SIZE + FRAME_CRC_SIZE)

/* CRC polynomials — both are standard, spelled out so host and device agree. */
#define CRC16_POLY 0x1021
#define CRC16_INIT 0xFFFF
/* CRC-32 (IEEE 802.3, reflected, init 0xFFFFFFFF, xorout 0xFFFFFFFF) for the
 * config blob. Table-driven implementation in crc.c. */

/* ---- commands (host -> device unless marked) ----------------------------- */
#define CMD_PING 0x00          /* payload empty -> replies PONG */
#define CMD_PONG 0x80          /* device -> host */
#define CMD_GET_INFO 0x01      /* -> info_t */
#define CMD_INFO 0x81          /* device -> host */
#define CMD_GET_CONFIG 0x02    /* payload: 1 byte chunk index -> config chunk */
#define CMD_CONFIG_CHUNK 0x82  /* device -> host */
#define CMD_SET_CONFIG 0x03    /* payload: config chunk (host streams all) */
#define CMD_SET_ACK 0x83       /* device -> host: 1 byte status */
#define CMD_RESET_CONFIG 0x04  /* -> restore factory defaults, saves to flash */
#define CMD_COMMIT 0x05        /* -> write staged config to flash now */
#define CMD_COMMIT_ACK 0x85    /* device -> host: 1 byte status */
#define CMD_GET_CHANNEL 0x06   /* -> 1 byte current channel */
#define CMD_SET_CHANNEL 0x07   /* payload: 1 byte channel index */
#define CMD_GET_LIGHTING 0x08  /* payload: 1 byte channel -> cfg_lighting_t */
#define CMD_SET_LIGHTING 0x09  /* payload: channel byte + cfg_lighting_t */
#define CMD_PREVIEW_LIGHTING 0x0A /* like SET_LIGHTING but does not save */
#define CMD_LED_TEST 0x0B      /* payload: 9 x 3 bytes raw RGB, bypasses engine */
#define CMD_OLED_FRAME 0x0C    /* two 265-byte chunks -> one CRC-checked 512-byte canvas */
#define CMD_GET_OLED_STATE 0x0D /* -> OLED_STATE, actual physical mode + epoch */
#define CMD_SET_OLED_MODE 0x0E /* payload: 1 byte mode -> OLED_STATE */
#define CMD_OLED_FRAME_ACK 0x8C /* device -> host: u16 sequence + u8 mode */
#define CMD_OLED_STATE 0x8D    /* device -> host: u8 mode + u16 epoch */
#define CMD_CHANNEL 0x86       /* device -> host: 1 byte current channel */
#define CMD_LIGHTING 0x88      /* device -> host: 1 byte channel + cfg_lighting_t */
#define CMD_KEY_EVENT 0xC0     /* device -> host: key_event_t, if enabled */
#define CMD_OLED_MODE_EVENT 0xC1 /* device -> host: OLED_STATE after pad mode change */
#define CMD_BOOTLOADER 0xFE    /* -> reboot into USB bootloader */
#define CMD_ERROR 0xFF         /* device -> host: 1 byte error_code_t */

/* ---- status / error bytes ------------------------------------------------ */
#define STATUS_OK 0x00
#define STATUS_BAD_CRC 0x01
#define STATUS_BAD_MAGIC 0x02
#define STATUS_BAD_VERSION 0x03
#define STATUS_BAD_LENGTH 0x04
#define STATUS_FLASH_FAIL 0x05
#define STATUS_BUSY 0x06
#define STATUS_UNKNOWN_CMD 0x07
#define STATUS_BAD_ARG 0x08
#define STATUS_LED_DISABLED 0x09 /* physical LED output is gated in this build */

/* ---- info_t, the reply to CMD_GET_INFO ---------------------------------- */
/* 16 bytes. Tells the host what it is talking to without parsing anything. */
#define INFO_SIZE 16
/* layout:
 *   u32 magic           = MAGIC_U32
 *   u16 proto_version
 *   u16 cfg_version
 *   u8  channels        = 4
 *   u8  keys            = 9
 *   u8  leds            = 9
 *   u8  capabilities    = bit0 encoder, bit1 oled, bit2 flash, bit3 events,
 *                         bit4 OLED stream (if ACK), bit5 LED data output enabled
 *                         (BENCH flag only; NOT a safety/current certification)
 *   u16 config_size     = sizeof(cfg_blob_t)
 *   u16 fw_build        = firmware build number
 *   u8  _pad
 */
#define CAP_ENCODER 0x01
#define CAP_OLED 0x02
#define CAP_FLASH 0x04
#define CAP_EVENTS 0x08 /* event protocol supported even when usb_report_events=0 */
#define CAP_OLED_STREAM 0x10
#define CAP_LED_OUTPUT 0x20 /* compiled LED drive, not certified 5 V supply */

/* ---- key_event_t, the payload of CMD_KEY_EVENT -------------------------- */
/* 8 bytes, streamed only when cfg_global_t.usb_report_events is 1.
 *   u8  source   : 0 = key, 1 = knob
 *   u8  index    : key index 0..8, or 0 for the knob
 *   u8  event    : key_event_kind_t
 *   u8  channel  : active channel at the time of the event
 *   i16 value    : rotation delta for ENC_CW/ENC_CCW, else 0
 *   u16 action   : action_type_t that fired, 0 if none
 */
#define KEY_EVENT_SIZE 8
#define EV_SOURCE_KEY 0
#define EV_SOURCE_KNOB 1
/* key_event_kind_t */
#define EV_NONE 0
#define EV_PRESS 1
#define EV_RELEASE 2
#define EV_TAP 3
#define EV_HOLD 4
#define EV_HOLD_RELEASE 5
#define EV_DOUBLE_TAP 6
#define EV_ENC_CW 7
#define EV_ENC_CCW 8
#define EV_CHANNEL_CHANGE 9

#endif /* MAGIC_H */
