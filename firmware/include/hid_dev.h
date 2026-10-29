/*
 * hid_dev.h — the USB composite device: HID keyboard + HID consumer + CDC.
 *
 * Three interfaces on one cable:
 *   0: HID keyboard  (boot protocol, 6KRO + modifiers)  -> what your macros send
 *   1: HID consumer  (media keys)                       -> volume, play, mute
 *   2: CDC-ACM serial                                    -> the config protocol
 *
 * The CDC interface is NOT the keyboard. That split matters: your app talks to
 * interface 2, and if the app crashes or you close it mid-write, the keyboard
 * keeps working because it never went through the serial path. It also means the
 * OS sees a normal HID keyboard, so no driver, and the app can be a plain
 * Web Serial page.
 *
 * VID/PID below are placeholders. Do not ship someone else's VID; for a personal
 * build it is harmless, but if you ever sell these, get your own from
 * usb.org or use the pid.codes free allocation.
 */
#ifndef HID_DEV_H
#define HID_DEV_H

#include <stdbool.h>
#include <stdint.h>

#define MPAD_VID 0x1209 /* pid.codes open-source VID */
#define MPAD_PID 0xC0FF /* pid.codes-allocated range; change to your own */

/* Boot-protocol keyboard report. 8 bytes, matches TUD_HID_REPORT_DESC_KEYBOARD.
 *
 * Named mpad_kbd_report_t and NOT hid_keyboard_report_t on purpose: TinyUSB
 * already defines that name in class/hid/hid.h with fields `modifier` and
 * `keycode`. Sharing the name is a compile error the moment both headers are in
 * one translation unit, and sharing the LAYOUT while differing in field names is
 * worse — it compiles and then quietly sends zeroes. */
#define HID_KEY_MAX 6

typedef struct __attribute__((packed)) {
    uint8_t modifier;            /* MOD_* bitmask from actions.h */
    uint8_t reserved;            /* must stay 0 per the boot protocol */
    uint8_t keycode[HID_KEY_MAX];
} mpad_kbd_report_t;

void hid_dev_init(void);

/* Queue a full keyboard report. Passing an all-zero report releases every key,
 * which is the correct and only way to do it — do not try to send "the key that
 * changed". The target branch delivers queued reports in order and retains an
 * uncompleted release while USB is busy. No host can receive reports while
 * physically disconnected or indefinitely unresponsive. */
void hid_dev_keyboard(const mpad_kbd_report_t *report);

/* Queue a consumer (media) report on its separate USB interface. 0 releases. */
void hid_dev_consumer(uint16_t usage);

/* Service TinyUSB, retry rejected/failed submissions and advance each queue
 * after its transfer-complete callback. Call regularly from the main loop. If a
 * queue fills, intermediate taps may be coalesced behind a neutral report so a
 * final release is never silently evicted. */
void hid_dev_task(void);

/* True once the host has finished enumeration and set the configuration.
 * Offline presses are intentionally discarded rather than replayed on remount;
 * mount/resume queues neutral reports on both HID interfaces. */
bool hid_dev_mounted(void);
/* Changes on every mount, unmount, suspend and resume, even when two happen
 * between scan ticks. */
uint32_t hid_dev_connection_epoch(void);

/* Reboot into the RP2040's USB bootloader (BOOTSEL mass storage). Does not
 * return. */
void hid_dev_enter_bootloader(void);

#endif /* HID_DEV_H */
