/*
 * storage.h — where config lives between power cycles.
 *
 * Two flash sectors, A and B, ping-ponged. Every write goes to the sector that
 * is NOT currently authoritative, with an incremented sequence number. Power
 * loss during a write therefore destroys only the copy you were not using, and
 * boot always finds a valid one. This is the cheapest thing that survives
 * someone yanking the USB cable mid-save, which on a hand-built pad is a real
 * scenario and not a theoretical one.
 *
 * The blob carries its own CRC-32, so a torn write is detected rather than
 * silently applied.
 */
#ifndef STORAGE_H
#define STORAGE_H

#include <stdbool.h>
#include <stdint.h>

#include "config.h"

/* Sector header, prepended inside each flash sector before the blob. */
typedef struct __attribute__((packed)) {
    uint32_t magic;    /* MAGIC_SECTOR */
    uint32_t seq;      /* monotonically increasing; higher wins */
    uint32_t blob_crc; /* duplicate of the blob's own CRC, read before parsing */
    uint32_t hdr_crc;  /* CRC-32 over the 12 bytes above */
} sector_header_t;

#define MAGIC_SECTOR 0x53454331u /* 'SEC1' */
#define SECTOR_HEADER_SIZE 16

typedef struct {
    bool valid;          /* a usable config was found at boot */
    uint32_t seq;        /* sequence of the authoritative copy */
    uint8_t active_slot; /* 0 = sector A, 1 = sector B */
    uint32_t writes;     /* total successful saves since boot */
    uint32_t recoveries; /* times a corrupt slot was skipped */
    bool dirty;          /* RAM copy differs from flash */
} storage_stats_t;

/* Read flash, pick the best sector, populate the live config. Falls back to
 * factory defaults (and marks itself dirty) if both sectors are bad — the pad
 * must always come up usable. */
bool storage_init(void);

/* Save the live config to the inactive sector. Returns false on flash error;
 * the RAM config stays valid either way. */
bool storage_commit(void);

/* Overwrite the live config from a validated blob and mark dirty. Does NOT
 * write flash; call storage_commit() explicitly so a host that streams 7 chunks
 * triggers one erase, not seven. */
bool storage_stage(const cfg_blob_t *blob);

/* Restore factory defaults in RAM and write them to flash. */
bool storage_reset(void);

const storage_stats_t *storage_stats(void);

/* Flag the RAM config as differing from flash, without writing. Used by
 * SET_LIGHTING (persistent) but not PREVIEW_LIGHTING (transient). */
void storage_mark_dirty(void);

/* Direct flash access, isolated so the rest of the firmware never touches
 * XIP. Host builds get an in-RAM stub (storage_host.c). */
bool storage_flash_read_slot(uint8_t slot, uint8_t *buf, uint32_t len);
bool storage_flash_write_slot(uint8_t slot, const uint8_t *buf, uint32_t len);

#endif /* STORAGE_H */
