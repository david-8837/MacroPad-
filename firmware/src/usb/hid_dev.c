/*
 * hid_dev.c — USB composite device: keyboard + consumer + CDC.
 *
 * HID_DEV_NO_HW replaces the real USB implementation with a recorder for the
 * normal host suite. test_hid_hw.c also compiles the real branch against a fake
 * per-interface TinyUSB transport so busy/failure behavior is exercised.
 */
#include "hid_dev.h"

#ifndef HID_DEV_NO_HW

#include <string.h>

#include "bsp/board_api.h"
#include "hardware/flash.h"
#include "hardware/watchdog.h"
#include "pico/bootrom.h"
#include "pico/stdlib.h"
#include "tusb.h"

#include "actions.h"
#include "board.h"
#include "magic.h"

/* ---- descriptors -------------------------------------------------------- */
enum { ITF_NUM_HID_KBD, ITF_NUM_HID_CONSUMER, ITF_NUM_CDC, ITF_NUM_CDC_DATA, ITF_NUM_TOTAL };

/* Report IDs. Declaring them in the descriptor is what lets the host tell the two
 * collections apart; tud_hid_n_report() then prepends the ID byte itself (see
 * hid_device.c: if (report_id) epin[0] = report_id), so the payload we pass is
 * the bare report with no leading ID. Getting that backwards sends 9 bytes for an
 * 8-byte report and the host discards every one of them. */
enum { RPT_ID_KEYBOARD = 1, RPT_ID_CONSUMER = 2 };

/* usb_proto.c addresses the CDC port by TinyUSB INSTANCE index (0), which is not
 * the same numbering as ITF_NUM_CDC below and is only valid while there is
 * exactly one CDC interface. Fail here rather than there if that ever changes. */
_Static_assert(CFG_TUD_CDC == 1,
               "usb_proto.c assumes a single CDC instance (CDC_INSTANCE 0)");
_Static_assert(CFG_TUD_HID == 2,
               "two HID interfaces are assumed: keyboard and consumer");

#define CONFIG_TOTAL_LEN (TUD_CONFIG_DESC_LEN + (2 * TUD_HID_DESC_LEN) + TUD_CDC_DESC_LEN)
#define EPNUM_HID_KBD 0x81
#define EPNUM_HID_CONSUMER 0x82
#define EPNUM_CDC_NOTIF 0x83
#define EPNUM_CDC_OUT 0x04
#define EPNUM_CDC_IN 0x84

/* One report descriptor PER HID INTERFACE.
 *
 * This is the part that is easy to get wrong, and it was wrong here first. There
 * are two shapes a multi-function HID device can take and they are not
 * interchangeable:
 *
 *   (a) ONE HID interface whose descriptor holds several Application collections,
 *       each with its own report ID. The callback returns that one descriptor for
 *       every interface, because there is only one. This is TinyUSB's
 *       hid_composite example.
 *   (b) SEVERAL HID interfaces, one per function, each with its own descriptor.
 *       The callback must switch on `itf`. This is TinyUSB's
 *       hid_multiple_interface and hid_boot_interface examples.
 *
 * We are shape (b): two interfaces, two endpoints, two descriptors. Returning one
 * concatenated descriptor for both - which is what this file did - advertises the
 * consumer collection on the keyboard interface and the keyboard collection on
 * the consumer interface. The host then finds report ID 1 declared twice and
 * report ID 2 declared twice, and which interface a given report gets routed to
 * stops being determined by us. On Linux it often limps along; on Windows it
 * typically binds one of the two functions to nothing, so either the keys or the
 * volume knob silently does nothing, with no error anywhere.
 *
 * tools/check_usb_descriptors.py verifies the two descriptors are distinct and
 * that each interface's wDescriptorLength matches its own array, because a
 * mismatch there is the same class of silent failure. */
static const uint8_t desc_hid_kbd_report[] = {
    /* Standard 8-byte boot keyboard report. HID_ITF_PROTOCOL_KEYBOARD above
     * means the host may put this interface in boot protocol, where the report is
     * exactly modifier/reserved/6 keycodes with no report ID - which is what
     * mpad_kbd_report_t is. */
    TUD_HID_REPORT_DESC_KEYBOARD(HID_REPORT_ID(RPT_ID_KEYBOARD)),
};

/* Consumer / media page, hand-written rather than using
 * TUD_HID_REPORT_DESC_CONSUMER. The only reason is the logical range: that macro
 * caps LOGICAL_MAX at 0x03FF, and cfg_action_t stores the usage as a uint16_t, so
 * a config could legitimately ask for a Consumer usage above 0x03FF (the
 * AL_* application-launch usages run past it). Declaring 16 bits here means the
 * descriptor cannot quietly truncate what the config says. Everything else is the
 * macro's shape verbatim. */
static const uint8_t desc_hid_consumer_report[] = {
    HID_USAGE_PAGE ( HID_USAGE_PAGE_CONSUMER     ),
    HID_USAGE      ( HID_USAGE_CONSUMER_CONTROL  ),
    HID_COLLECTION ( HID_COLLECTION_APPLICATION  ),
      /* No comma after this one: HID_REPORT_ID is the single TinyUSB descriptor
       * macro that already expands with a trailing comma (hid.h defines it as
       * `HID_REPORT_ITEM(...),`). Adding one here is a syntax error, which is at
       * least loud - unlike most of the other ways to get a descriptor wrong. */
      HID_REPORT_ID    ( RPT_ID_CONSUMER          )
      HID_LOGICAL_MIN  ( 0x00                     ),
      HID_LOGICAL_MAX_N( 0xFFFF, 3                ),
      HID_USAGE_MIN_N  ( 0x00, 2                  ),
      HID_USAGE_MAX_N  ( 0xFFFF, 3                ),
      HID_REPORT_COUNT ( 1                        ),
      HID_REPORT_SIZE  ( 16                       ),
      HID_INPUT        ( HID_DATA | HID_ARRAY | HID_ABSOLUTE ),
    HID_COLLECTION_END
};

/* TinyUSB asks for each HID interface's report descriptor separately, which is
 * the whole point of the `itf` argument.
 *
 * This callback is application-provided with no weak stub in TinyUSB, so
 * forgetting it entirely is a link error naming hid_device.c. Getting it to
 * return the wrong thing is much worse: it links, enumerates, and then one
 * function does nothing. */
uint8_t const *tud_hid_descriptor_report_cb(uint8_t itf) {
    if (itf == ITF_NUM_HID_KBD) return desc_hid_kbd_report;
    if (itf == ITF_NUM_HID_CONSUMER) return desc_hid_consumer_report;
    return desc_hid_kbd_report; /* unreachable: CFG_TUD_HID is 2 */
}

static const uint8_t desc_configuration[] = {
    TUD_CONFIG_DESCRIPTOR(1, ITF_NUM_TOTAL, 0, CONFIG_TOTAL_LEN,
                          TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 250),

    TUD_HID_DESCRIPTOR(ITF_NUM_HID_KBD, 0, HID_ITF_PROTOCOL_KEYBOARD,
                       sizeof(desc_hid_kbd_report), EPNUM_HID_KBD, CFG_TUD_HID_EP_BUFSIZE, 10),

    TUD_HID_DESCRIPTOR(ITF_NUM_HID_CONSUMER, 0, HID_ITF_PROTOCOL_NONE,
                       sizeof(desc_hid_consumer_report), EPNUM_HID_CONSUMER,
                       CFG_TUD_HID_EP_BUFSIZE, 10),

    /* CDC on its own interface pair. This is the channel your app talks to. */
    TUD_CDC_DESCRIPTOR(ITF_NUM_CDC, 4, EPNUM_CDC_NOTIF, 8, EPNUM_CDC_OUT, EPNUM_CDC_IN,
                       CFG_TUD_CDC_EP_BUFSIZE),
};

/* Manufacturer / product / serial strings. UTF-16LE. */
static const char *desc_strings[] = {
    (const char[]){0x09, 0x04}, /* langid = US English */
    "mpad3",                    /* vendor */
    "Macropad 3x3 + Knob",      /* product */
    "MPAD3-0001",               /* serial, overwritten at init from flash ID */
    "Config Port",              /* CDC interface name */
};

static char s_serial[24];

/* A full 31-character TEXT action makes at most 62 down/up keyboard reports
 * before main.c next services TinyUSB. Leave room for all of them; two separate
 * FIFOs let media release proceed even if the keyboard endpoint is busy.
 *
 * A report stays at the head until TinyUSB reports TRANSFER SUCCESS, not merely
 * until tud_hid_n_report() accepts it. Rejected submissions and failed transfers
 * are retried on later main-loop tasks without reordering down/up pairs.
 *
 * An indefinitely busy USB host cannot be forced to accept a release. On finite
 * queue overflow, preserve an already-in-flight head, discard intermediate
 * transitions, and queue a zero report BEFORE the newest requested state. This
 * sacrifices some taps under overload, but never discards the eventual all-up.
 * Disconnect/suspend cancels old presses; mount/resume begins with neutral reports
 * on both interfaces so old downs cannot replay in a new USB session. */
enum { KBD_PENDING_CAP = 64, CONSUMER_PENDING_CAP = 16, BOOT_RELEASE_WAIT_MS = 100 };
static mpad_kbd_report_t s_kbd_pending[KBD_PENDING_CAP];
static uint16_t s_consumer_pending[CONSUMER_PENDING_CAP];
static uint8_t s_kbd_head, s_kbd_count, s_consumer_head, s_consumer_count;
static bool s_kbd_inflight, s_consumer_inflight;
/* Logical state for GET_REPORT; a pending release is already logically up. */
static mpad_kbd_report_t s_last_kbd;
static uint16_t s_last_consumer;
static bool s_mounted;

static void kbd_append(const mpad_kbd_report_t *report) {
    s_kbd_pending[(s_kbd_head + s_kbd_count) % KBD_PENDING_CAP] = *report;
    s_kbd_count++;
}

static void consumer_append(uint16_t usage) {
    s_consumer_pending[(s_consumer_head + s_consumer_count) % CONSUMER_PENDING_CAP] = usage;
    s_consumer_count++;
}

static void kbd_enqueue(const mpad_kbd_report_t *report) {
    if (s_kbd_count &&
        memcmp(&s_kbd_pending[(s_kbd_head + s_kbd_count - 1) % KBD_PENDING_CAP],
               report, sizeof(*report)) == 0) return;
    if (s_kbd_count == KBD_PENDING_CAP) {
        /* Do not remove a report TinyUSB has already accepted: its completion
         * callback still needs that head. A neutral barrier clears any skipped
         * intermediate key state before the newest report is sent. */
        s_kbd_count = s_kbd_inflight ? 1 : 0;
        mpad_kbd_report_t zero = {0};
        kbd_append(&zero);
    }
    if (!s_kbd_count ||
        memcmp(&s_kbd_pending[(s_kbd_head + s_kbd_count - 1) % KBD_PENDING_CAP],
               report, sizeof(*report)) != 0) kbd_append(report);
}

static void consumer_enqueue(uint16_t usage) {
    if (s_consumer_count &&
        s_consumer_pending[(s_consumer_head + s_consumer_count - 1) % CONSUMER_PENDING_CAP] == usage) return;
    if (s_consumer_count == CONSUMER_PENDING_CAP) {
        s_consumer_count = s_consumer_inflight ? 1 : 0;
        consumer_append(0); /* neutral barrier before the newest consumer usage */
    }
    if (!s_consumer_count ||
        s_consumer_pending[(s_consumer_head + s_consumer_count - 1) % CONSUMER_PENDING_CAP] != usage)
        consumer_append(usage);
}

static void delivery_reset(bool enqueue_neutral) {
    s_kbd_head = s_kbd_count = s_consumer_head = s_consumer_count = 0;
    s_kbd_inflight = s_consumer_inflight = false;
    memset(&s_last_kbd, 0, sizeof(s_last_kbd));
    s_last_consumer = 0;
    if (enqueue_neutral) {
        kbd_append(&s_last_kbd);
        consumer_append(0);
    }
}

static void delivery_force_release(void) {
    /* BOOTSEL must not replay old queued presses on its way out. Preserve only
     * a transfer that has already been accepted by TinyUSB, then send zero. */
    s_kbd_count = s_kbd_inflight && s_kbd_count ? 1 : 0;
    s_consumer_count = s_consumer_inflight && s_consumer_count ? 1 : 0;
    memset(&s_last_kbd, 0, sizeof(s_last_kbd));
    s_last_consumer = 0;
    kbd_enqueue(&s_last_kbd);
    consumer_enqueue(0);
}

static bool kbd_inflight_matches(const uint8_t *report) {
    return s_kbd_inflight && s_kbd_count && report && report[0] == RPT_ID_KEYBOARD &&
           memcmp(report + 1, &s_kbd_pending[s_kbd_head], sizeof(mpad_kbd_report_t)) == 0;
}

static bool consumer_inflight_matches(const uint8_t *report) {
    return s_consumer_inflight && s_consumer_count && report && report[0] == RPT_ID_CONSUMER &&
           memcmp(report + 1, &s_consumer_pending[s_consumer_head], sizeof(uint16_t)) == 0;
}

/* ---- TinyUSB callbacks -------------------------------------------------- */
const uint8_t *tud_descriptor_device_cb(void) {
    static const tusb_desc_device_t desc = {
        .bLength = sizeof(tusb_desc_device_t),
        .bDescriptorType = TUSB_DESC_DEVICE,
        .bcdUSB = 0x0210, /* 2.1 so the BOS/webusb paths stay available later */
        .bDeviceClass = TUSB_CLASS_MISC, /* composite: class is per-interface */
        .bDeviceSubClass = MISC_SUBCLASS_COMMON,
        .bDeviceProtocol = MISC_PROTOCOL_IAD,
        .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
        .idVendor = MPAD_VID,
        .idProduct = MPAD_PID,
        .bcdDevice = 0x0100,
        .iManufacturer = 1,
        .iProduct = 2,
        .iSerialNumber = 3,
        .bNumConfigurations = 1,
    };
    return (const uint8_t *)&desc;
}

const uint8_t *tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    return desc_configuration;
}

const uint16_t *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    (void)langid;
    static uint16_t buf[32];
    uint8_t chr_count;

    if (index == 0) {
        memcpy(&buf[1], desc_strings[0], 2);
        chr_count = 1;
    } else {
        if (index >= sizeof(desc_strings) / sizeof(desc_strings[0])) return NULL;
        const char *str = desc_strings[index];
        chr_count = (uint8_t)strlen(str);
        if (chr_count > 31) chr_count = 31;
        for (uint8_t i = 0; i < chr_count; i++) buf[1 + i] = str[i];
    }
    buf[0] = (uint16_t)((TUSB_DESC_STRING << 8) | (2 * chr_count + 2));
    return buf;
}

void tud_mount_cb(void) {
    delivery_reset(true);
    s_mounted = true;
}
void tud_umount_cb(void) {
    s_mounted = false;
    delivery_reset(false);
}
void tud_suspend_cb(bool remote_wakeup_en) {
    (void)remote_wakeup_en;
    s_mounted = false;
    delivery_reset(false);
}
void tud_resume_cb(void) {
    delivery_reset(true);
    s_mounted = true;
}

/* TinyUSB's accepted report may still fail on the bus. Pop only a successfully
 * completed INPUT transfer; a failed transfer leaves its head in place to retry
 * on the next hid_dev_task(). OUTPUT (keyboard LED) failures are unrelated. */
void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, uint16_t len) {
    if (instance == ITF_NUM_HID_KBD && kbd_inflight_matches(report)) {
        s_kbd_inflight = false;
        if (len == sizeof(mpad_kbd_report_t) + 1) {
            s_kbd_head = (uint8_t)((s_kbd_head + 1) % KBD_PENDING_CAP);
            s_kbd_count--;
        } /* an unexpected short completion is retried, never acknowledged */
    } else if (instance == ITF_NUM_HID_CONSUMER && consumer_inflight_matches(report)) {
        s_consumer_inflight = false;
        if (len == sizeof(uint16_t) + 1) {
            s_consumer_head = (uint8_t)((s_consumer_head + 1) % CONSUMER_PENDING_CAP);
            s_consumer_count--;
        }
    }
}

void tud_hid_report_failed_cb(uint8_t instance, hid_report_type_t report_type,
                              uint8_t const *report, uint16_t xferred_bytes) {
    (void)xferred_bytes; /* may be zero even though the endpoint buffer is intact */
    if (report_type != HID_REPORT_TYPE_INPUT) return;
    if (instance == ITF_NUM_HID_KBD && kbd_inflight_matches(report)) s_kbd_inflight = false;
    else if (instance == ITF_NUM_HID_CONSUMER && consumer_inflight_matches(report))
        s_consumer_inflight = false;
}

/* HID get-report: the host rarely asks, but answering correctly matters —
 * Windows queries it on resume and a wrong answer makes the device look dead. */
uint16_t tud_hid_get_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type,
                               uint8_t *buffer, uint16_t reqlen) {
    (void)report_type;
    if (itf == ITF_NUM_HID_KBD && report_id == 1) {
        uint16_t n = (uint16_t)(reqlen < sizeof(s_last_kbd) ? reqlen : sizeof(s_last_kbd));
        memcpy(buffer, &s_last_kbd, n);
        return n;
    }
    if (itf == ITF_NUM_HID_CONSUMER && report_id == 2) {
        uint16_t n = (uint16_t)(reqlen < 2 ? reqlen : 2);
        memcpy(buffer, &s_last_consumer, n);
        return n;
    }
    return 0;
}

void tud_hid_set_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type,
                           uint8_t const *buffer, uint16_t bufsize) {
    (void)itf; (void)report_id; (void)report_type; (void)buffer; (void)bufsize;
    /* Keyboard LED (caps/num) reports arrive here. A macropad has no indicators
     * to drive, but you could map them onto the key LEDs if you wanted:
     *   if (report_type == HID_REPORT_TYPE_OUTPUT && bufsize >= 1)
     *       led_set_caps(buffer[0] & 0x02);
     */
}

/* ---- public API --------------------------------------------------------- */
void hid_dev_init(void) {
    /* Serial number, so two pads built from the same firmware still enumerate
     * as different devices. Without it, an OS that has already seen one pad will
     * apply its cached HID settings to the other.
     *
     * RP2040 has no pico_get_unique_board_id() — that reads the RP2350's OTP.
     * The RP2040 equivalent is the flash chip's 64-bit JEDEC ID, read over the
     * same QSPI bus, which is unique per physical chip. flash_get_unique_id()
     * disables XIP while it talks to the chip, so it must be called before the
     * main loop starts, not from a callback. */
    uint8_t id[FLASH_UNIQUE_ID_SIZE_BYTES];
    flash_get_unique_id(id);
    static const char hex[] = "0123456789ABCDEF";
    s_serial[0] = 0;
    char *p = s_serial;
    for (int i = 0; i < FLASH_UNIQUE_ID_SIZE_BYTES; i++) {
        *p++ = hex[(id[i] >> 4) & 0xF];
        *p++ = hex[id[i] & 0xF];
    }
    *p = 0;
    desc_strings[3] = s_serial;

    s_mounted = false;
    delivery_reset(false);

    /* Board init before tusb_init: the USB PHY and the 1.1 V supply must be up
     * first or enumeration fails in a way that looks like a bad cable. */
    board_init();
    tusb_init();
}

bool hid_dev_mounted(void) { return s_mounted && tud_mounted(); }

void hid_dev_task(void) {
    tud_task(); /* completion/failure callbacks may free each interface's head */
    if (!hid_dev_mounted()) return;
    if (s_kbd_count && !s_kbd_inflight && tud_hid_n_ready(ITF_NUM_HID_KBD) &&
        tud_hid_n_report(ITF_NUM_HID_KBD, RPT_ID_KEYBOARD,
                         &s_kbd_pending[s_kbd_head], sizeof(mpad_kbd_report_t))) {
        s_kbd_inflight = true;
    }
    if (s_consumer_count && !s_consumer_inflight && tud_hid_n_ready(ITF_NUM_HID_CONSUMER) &&
        tud_hid_n_report(ITF_NUM_HID_CONSUMER, RPT_ID_CONSUMER,
                         &s_consumer_pending[s_consumer_head], sizeof(uint16_t))) {
        s_consumer_inflight = true;
    }
}

void hid_dev_keyboard(const mpad_kbd_report_t *report) {
    if (!report || !hid_dev_mounted()) return;
    s_last_kbd = *report;
    kbd_enqueue(report);
}

void hid_dev_consumer(uint16_t usage) {
    if (!hid_dev_mounted()) return;
    s_last_consumer = usage;
    consumer_enqueue(usage);
}

void hid_dev_enter_bootloader(void) {
    /* Drop unsent presses; if an endpoint already owns a report, wait for its
     * completion and then send zero. Never block forever on a dead USB host. */
    if (hid_dev_mounted()) {
        delivery_force_release();
        for (unsigned i = 0; i < BOOT_RELEASE_WAIT_MS; i++) {
            hid_dev_task();
            if (!s_kbd_count && !s_consumer_count) break;
            sleep_ms(1);
        }
    }

    /* reset_usb_boot(gpio_activity_pin_mask, disable_interface_mask) reboots
     * into the bootrom's USB mass-storage bootloader. 0 for both: no GPIO is
     * wiggled and no interface is disabled. Same call on RP2040 and RP2350. */
    reset_usb_boot(0, 0); /* does not return */
}

#else /* host build: record what was sent so tests can assert on it */

#include <stdio.h>

static mpad_kbd_report_t s_kbd_log[64];
static uint16_t s_consumer_log[64];
static int s_kbd_n, s_consumer_n;

void hid_dev_init(void) { s_kbd_n = s_consumer_n = 0; }
bool hid_dev_mounted(void) { return true; }
void hid_dev_task(void) {}

void hid_dev_keyboard(const mpad_kbd_report_t *report) {
    if (!report) return;
    if (s_kbd_n < 64) s_kbd_log[s_kbd_n++] = *report;
}

void hid_dev_consumer(uint16_t usage) {
    if (s_consumer_n < 64) s_consumer_log[s_consumer_n++] = usage;
}

void hid_dev_enter_bootloader(void) {}

int hid_dev_host_kbd_count(void) { return s_kbd_n; }
const mpad_kbd_report_t *hid_dev_host_kbd(int i) {
    return (i >= 0 && i < s_kbd_n) ? &s_kbd_log[i] : NULL;
}
int hid_dev_host_consumer_count(void) { return s_consumer_n; }
uint16_t hid_dev_host_consumer(int i) {
    return (i >= 0 && i < s_consumer_n) ? s_consumer_log[i] : 0;
}
void hid_dev_host_reset(void) { s_kbd_n = s_consumer_n = 0; }

#endif
