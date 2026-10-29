/*
 * flash_store.c — raw QSPI flash access for the config sectors.
 *
 * Two facts that make this code look stranger than it should:
 *
 * 1. The RP2040 executes from this same flash (XIP). You cannot erase a sector
 *    while the CPU is fetching instructions from it. pico-sdk solves that with
 *    flash_range_erase/flash_range_program, which disable XIP and run the erase
 *    from RAM. The cost is that NOTHING may execute from flash during the call —
 *    no interrupts with flash-resident handlers, no audio, no USB ISR doing real
 *    work. That is why storage_commit() is called from the main loop and never
 *    from a callback.
 *
 * 2. Erase granularity is 4 KiB and write granularity is 256 bytes, page
 *    aligned. Our blob is ~1.7 kB so it spans 7 pages; flash_range_program
 *    handles the page splitting for us as long as the length is a multiple of
 *    FLASH_PAGE_SIZE and the offset is a multiple of FLASH_SECTOR_SIZE.
 *
 * A full erase+program of one sector takes roughly 45-60 ms. During that time
 * the pad is deaf: key presses are missed. That is why the protocol stages the
 * whole config in RAM and commits once, rather than committing per chunk.
 */
#include "storage.h"

#include <string.h>

#include "board.h"
#include "magic.h"

#ifndef STORAGE_NO_HW
#include "hardware/flash.h"
#include "pico/mutex.h"

/* The SDK board header is the authority on how much flash the chip actually has;
 * board.h decides where inside it we put the config. If they disagree, the
 * sectors move off the end of the chip (or on top of the firmware image) and the
 * UF2 still flashes happily. Fail at compile time instead. */
_Static_assert(BOARD_FLASH_SIZE_BYTES == PICO_FLASH_SIZE_BYTES,
               "board.h flash size does not match the SDK board header");
_Static_assert(BOARD_CONFIG_SECTOR_B_OFFSET + BOARD_CONFIG_SECTOR_SIZE
                   <= BOARD_FLASH_SIZE_BYTES,
               "config sectors do not fit in flash");
_Static_assert(BOARD_CONFIG_SECTOR_A_OFFSET % FLASH_SECTOR_SIZE == 0 &&
               BOARD_CONFIG_SECTOR_B_OFFSET % FLASH_SECTOR_SIZE == 0,
               "config sectors must be 4 KiB aligned");
#endif

#define STORE_LEN (SECTOR_HEADER_SIZE + sizeof(cfg_blob_t))
/* Round up to a whole number of 256-byte pages, which is what
 * flash_range_program requires. */
#define STORE_PADDED_LEN (((STORE_LEN + FLASH_PAGE_SIZE_PAD) / FLASH_PAGE_SIZE_PAD) * FLASH_PAGE_SIZE_PAD)
#define FLASH_PAGE_SIZE_PAD 256u

#ifndef STORAGE_NO_HW

static mutex_t s_flash_mutex;
static bool s_mutex_ready;

static uint32_t slot_offset(uint8_t slot) {
    return (slot == 0) ? BOARD_CONFIG_SECTOR_A_OFFSET : BOARD_CONFIG_SECTOR_B_OFFSET;
}

bool storage_flash_read_slot(uint8_t slot, uint8_t *buf, uint32_t len) {
    if (!buf || slot > 1 || len > STORE_LEN) return false;
    /* Reading is just a memcpy from the XIP window. XIP_BASE is ALREADY
     * 0x10000000 — it is the CPU's view of flash, not a base to add a flash
     * address to. Adding 0x10000000 again lands at 0x20000000, which on the
     * RP2040 is the far end of SRAM, so every read came back as garbage and no
     * config ever survived a reboot. (This line is inside #ifndef STORAGE_NO_HW,
     * so the host tests cannot see it — which is exactly why the offset is
     * spelled out in the assert below.)
     * No mutex needed for a read because the only thing that can change it is
     * our own write, which runs in the same thread. */
    const uint8_t *src = (const uint8_t *)(XIP_BASE + slot_offset(slot));
    memcpy(buf, src, len);
    return true;
}

bool storage_flash_write_slot(uint8_t slot, const uint8_t *buf, uint32_t len) {
    if (!buf || slot > 1 || len > STORE_LEN) return false;
    if (!s_mutex_ready) {
        mutex_init(&s_flash_mutex);
        s_mutex_ready = true;
    }
    mutex_enter_blocking(&s_flash_mutex);

    /* Pad to a page multiple with 0xFF, which is the erased state — padding with
     * zeroes would look like real data to a future reader. */
    static uint8_t staged[STORE_PADDED_LEN];
    memset(staged, 0xFF, sizeof(staged));
    memcpy(staged, buf, len);

    uint32_t off = slot_offset(slot);
    bool ok = true;

    /* Erase must cover whole 4 KiB sectors. Our padded length is under one
     * sector, so a single erase is enough; the loop keeps that true if the blob
     * ever grows past 4 KiB. */
    for (uint32_t e = 0; e < STORE_PADDED_LEN; e += FLASH_SECTOR_SIZE) {
        flash_range_erase(off + e, FLASH_SECTOR_SIZE);
    }
    flash_range_program(off, staged, STORE_PADDED_LEN);

    /* Verify by reading back. Flash writes on the RP2040 are reliable but not
     * infallible — a brown-out mid-program leaves a sector that reads as
     * plausible garbage, and this is the only place we can catch it. */
    if (memcmp((const void *)(XIP_BASE + off), staged, STORE_LEN) != 0) {
        ok = false;
    }

    mutex_exit(&s_flash_mutex);
    return ok;
}

#else /* host build: emulate two sectors in RAM so the A/B logic is testable */

static uint8_t s_slots[2][STORE_PADDED_LEN];
static bool s_slot_erased[2];
static int s_write_count;
static bool s_fail_next_write;

void storage_host_reset(void) {
    memset(s_slots, 0xFF, sizeof(s_slots));
    s_slot_erased[0] = s_slot_erased[1] = false;
    s_write_count = 0;
    s_fail_next_write = false;
}
void storage_host_fail_next_write(bool fail) { s_fail_next_write = fail; }
int storage_host_write_count(void) { return s_write_count; }

bool storage_flash_read_slot(uint8_t slot, uint8_t *buf, uint32_t len) {
    if (!buf || slot > 1 || len > STORE_LEN) return false;
    memcpy(buf, s_slots[slot], len);
    return true;
}

bool storage_flash_write_slot(uint8_t slot, const uint8_t *buf, uint32_t len) {
    if (!buf || slot > 1 || len > STORE_LEN) return false;
    if (s_fail_next_write) {
        s_fail_next_write = false;
        /* Brown-out after erasing/programming part of the TARGET sector. The
         * other A/B slot must still boot; a no-op failure would not exercise
         * CRC rejection of a plausible but truncated sector header/blob. */
        memset(s_slots[slot], 0xFF, sizeof(s_slots[slot]));
        memcpy(s_slots[slot], buf, len / 2u);
        return false;
    }
    /* Model the erase: anything not written reads as 0xFF. */
    memset(s_slots[slot], 0xFF, sizeof(s_slots[slot]));
    memcpy(s_slots[slot], buf, len);
    s_slot_erased[slot] = true;
    s_write_count++;
    return true;
}

#endif
