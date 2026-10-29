/* Minimal fake TinyUSB declarations to compile the real HID delivery branch.
 * Descriptor macros here are placeholders; tools/check_usb_descriptors.py checks
 * the real descriptor source separately. USB scheduling is faked in test_hid_hw.c. */
#ifndef TEST_TUSB_H
#define TEST_TUSB_H
#include <stdbool.h>
#include <stdint.h>

#define CFG_TUD_CDC 1
#define CFG_TUD_HID 2
#define CFG_TUD_ENDPOINT0_SIZE 64
#define CFG_TUD_HID_EP_BUFSIZE 64
#define CFG_TUD_CDC_EP_BUFSIZE 64
#define TUD_CONFIG_DESC_LEN 9
#define TUD_HID_DESC_LEN 9
#define TUD_CDC_DESC_LEN 66
#define TUSB_DESC_DEVICE 1
#define TUSB_DESC_STRING 3
#define TUSB_CLASS_MISC 0xEF
#define MISC_SUBCLASS_COMMON 2
#define MISC_PROTOCOL_IAD 1
#define TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP 0x20
#define HID_ITF_PROTOCOL_KEYBOARD 1
#define HID_ITF_PROTOCOL_NONE 0
#define HID_USAGE_PAGE_CONSUMER 0x0C
#define HID_USAGE_CONSUMER_CONTROL 1
#define HID_COLLECTION_APPLICATION 1
#define HID_DATA 0
#define HID_ARRAY 0
#define HID_ABSOLUTE 0

#define TUD_HID_REPORT_DESC_KEYBOARD(...) 0x05, 0x01, 0x85, 0x01, 0xC0
#define HID_USAGE_PAGE(x) 0x05, (x)
#define HID_USAGE(x) 0x09, (x)
#define HID_COLLECTION(x) 0xA1, (x)
#define HID_REPORT_ID(x) 0x85, (x),
#define HID_LOGICAL_MIN(x) 0x15, (x)
#define HID_LOGICAL_MAX_N(x, n) 0x26, 0xFF, 0xFF
#define HID_USAGE_MIN_N(x, n) 0x1A, 0x00, 0x00
#define HID_USAGE_MAX_N(x, n) 0x2A, 0xFF, 0xFF
#define HID_REPORT_COUNT(x) 0x95, (x)
#define HID_REPORT_SIZE(x) 0x75, (x)
#define HID_INPUT(x) 0x81, (x)
#define HID_COLLECTION_END 0xC0
#define TUD_CONFIG_DESCRIPTOR(...) 9, 2
#define TUD_HID_DESCRIPTOR(...) 9, 0x21
#define TUD_CDC_DESCRIPTOR(...) 9, 0x02

typedef struct {
    uint8_t bLength, bDescriptorType;
    uint16_t bcdUSB;
    uint8_t bDeviceClass, bDeviceSubClass, bDeviceProtocol, bMaxPacketSize0;
    uint16_t idVendor, idProduct, bcdDevice;
    uint8_t iManufacturer, iProduct, iSerialNumber, bNumConfigurations;
} tusb_desc_device_t;

typedef enum {
    HID_REPORT_TYPE_INVALID = 0,
    HID_REPORT_TYPE_INPUT = 1,
    HID_REPORT_TYPE_OUTPUT = 2,
    HID_REPORT_TYPE_FEATURE = 3,
} hid_report_type_t;

void tusb_init(void);
void tud_task(void);
bool tud_mounted(void);
bool tud_hid_n_ready(uint8_t instance);
bool tud_hid_n_report(uint8_t instance, uint8_t report_id, const void *report, uint16_t len);

/* Test invokes the actual callbacks exposed by hid_dev.c. */
void tud_mount_cb(void);
void tud_umount_cb(void);
void tud_suspend_cb(bool remote_wakeup_en);
void tud_resume_cb(void);
void tud_hid_report_complete_cb(uint8_t instance, const uint8_t *report, uint16_t len);
void tud_hid_report_failed_cb(uint8_t instance, hid_report_type_t report_type,
                              const uint8_t *report, uint16_t xferred_bytes);
uint16_t tud_hid_get_report_cb(uint8_t instance, uint8_t report_id,
                               hid_report_type_t report_type, uint8_t *buffer, uint16_t reqlen);
const uint8_t *tud_hid_descriptor_report_cb(uint8_t instance);
#endif
