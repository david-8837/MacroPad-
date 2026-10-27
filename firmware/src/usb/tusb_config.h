/*
 * tusb_config.h — TinyUSB device configuration.
 *
 * Sized for what this pad actually is, not for a generic keyboard. The numbers
 * here directly set USB RAM usage on the RP2040 (which has 264 kB, so we are
 * nowhere near the limit), but a too-large CFG_TUD_HID_EP_BUFSIZE silently
 * truncates reports and a too-small one drops them.
 */
#ifndef TUSB_CONFIG_H
#define TUSB_CONFIG_H

#ifdef __cplusplus
extern "C" {
#endif

/* ---- board / MCU ---- */
#define CFG_TUSB_RHPORT0_MODE OPT_MODE_DEVICE
#define CFG_TUSB_OS OPT_OS_PICO
#define CFG_TUSB_MEM_SECTION
#define CFG_TUSB_MEM_ALIGN __attribute__((aligned(4)))

/* ---- device stack ---- */
#define CFG_TUD_ENDPOINT0_SIZE 64

/* Interface count: HID keyboard + HID consumer + CDC (2 interfaces: data+ctrl) */
#define CFG_TUD_HID 2
#define CFG_TUD_CDC 1
#define CFG_TUD_MSC 0
#define CFG_TUD_MIDI 0
#define CFG_TUD_VENDOR 0

/* HID report buffer. 16 is enough for an 8-byte boot keyboard report and a
 * 2-byte consumer report with room to spare. Setting this smaller than your
 * largest report is the usual cause of "the first keypress does nothing". */
#define CFG_TUD_HID_EP_BUFSIZE 16

/* CDC: the config protocol frames are up to CFG_PROTOCOL_MTU + 8 bytes. The
 * endpoint buffer must be at least one full frame or a GET_CONFIG reply gets
 * split mid-frame by the USB layer, which the parser can recover from but which
 * costs a round trip. 576 covers a 512-byte payload frame plus overhead. */
#define CFG_TUD_CDC_EP_BUFSIZE 576
#define CFG_TUD_CDC_RX_BUFSIZE 1024
#define CFG_TUD_CDC_TX_BUFSIZE 1024

#ifdef __cplusplus
}
#endif

#endif /* TUSB_CONFIG_H */
