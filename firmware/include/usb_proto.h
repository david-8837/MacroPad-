/*
 * usb_proto.h — config protocol endpoint over USB CDC.
 */
#ifndef USB_PROTO_H
#define USB_PROTO_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

void usb_proto_init(void);
void usb_proto_set_build(uint16_t build);

/* Service RX and TX. Call every main-loop iteration; `now_ms` drives the
 * stalled-SET_CONFIG timeout. */
void usb_proto_pump(uint32_t now_ms);

/* Block until the pending reply has gone out, or max_ms elapses. Only used
 * before a reboot, where losing the final ack would look like a crash. */
void usb_proto_flush_blocking(uint32_t max_ms);

/* Diagnostics, surfaced to the host so a flaky cable is provable rather than
 * mysterious. */
uint32_t usb_proto_frames_ok(void);
uint32_t usb_proto_frames_bad_crc(void);
uint32_t usb_proto_frames_resync(void);
bool usb_proto_rx_open(void);

/* Test seams: feed bytes straight to the command dispatcher and read the reply
 * without any CDC involved. This is how host/tests/test_protocol.mjs exercises
 * the REAL handler code. */
void usb_proto_inject(const uint8_t *data, size_t len);
size_t usb_proto_drain(uint8_t *out, size_t max);

#endif /* USB_PROTO_H */
