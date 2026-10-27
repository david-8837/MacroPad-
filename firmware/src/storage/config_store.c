/*
 * config_store.c — live config, validation, and the A/B flash ping-pong.
 */
#include "config.h"
#include "storage.h"

#include <string.h>

#include "protocol.h" /* crc32_ieee */

static cfg_blob_t s_cfg;
static bool s_loaded;
static storage_stats_t s_stats;

/* ---- validation --------------------------------------------------------- */
bool config_validate(const cfg_blob_t *cfg) {
    if (!cfg) return false;
    if (cfg->magic != MAGIC_CONFIG) return false;
    if (cfg->version != CONFIG_FORMAT_VERSION) return false;
    if (cfg->length != sizeof(cfg_blob_t)) return false;
    if (cfg->crc32 != crc32_ieee((const uint8_t *)cfg, CFG_CRC_COVERED_BYTES)) return false;

    /* Reject action types the firmware does not implement. Without this, a
     * config from a newer app would make the pad fire garbage — failing closed
     * is the right behaviour for an input device. */
    for (int ch = 0; ch < CFG_CHANNEL_COUNT; ch++) {
        const cfg_channel_t *c = &cfg->channels[ch];
        for (int k = 0; k < CFG_KEY_COUNT + 4; k++) {
            const cfg_action_t *a =
                (k < CFG_KEY_COUNT) ? &c->keys[k] : (&c->knob_cw + (k - CFG_KEY_COUNT));
            if (a->type > ACTION_TYPE_RESET_CONFIG) return false;
            if (a->type == ACTION_TYPE_CHANNEL && a->code >= CFG_CHANNEL_COUNT) return false;
            if (a->type == ACTION_TYPE_LED_MODE && a->code > LED_MODE_CHANNEL_TINT) return false;
        }
        /* Text must be NUL-terminated inside the field; an unterminated one
         * would make type_text run off the end into the padding bytes. */
        for (int k = 0; k < CFG_KEY_COUNT + 4; k++) {
            const cfg_action_t *a =
                (k < CFG_KEY_COUNT) ? &c->keys[k] : (&c->knob_cw + (k - CFG_KEY_COUNT));
            if (a->type != ACTION_TYPE_TEXT && a->type != ACTION_TYPE_WEBHOOK) continue;
            bool terminated = false;
            for (int i = 0; i < CFG_TEXT_MAX; i++) {
                if (a->text[i] == 0) { terminated = true; break; }
            }
            if (!terminated) return false;
        }
        if (c->lighting.mode > LED_MODE_CHANNEL_TINT) return false;
    }
    if (cfg->global.boot_channel >= CFG_CHANNEL_COUNT) return false;
    return true;
}

void config_reseal(cfg_blob_t *cfg) {
    if (!cfg) return;
    cfg->magic = MAGIC_CONFIG;
    cfg->version = CONFIG_FORMAT_VERSION;
    cfg->length = (uint16_t)sizeof(cfg_blob_t);
    cfg->crc32 = crc32_ieee((const uint8_t *)cfg, CFG_CRC_COVERED_BYTES);
}

const cfg_blob_t *config_get(void) { return &s_cfg; }
cfg_blob_t *config_mutable(void) { return &s_cfg; }

/* ---- sector header helpers --------------------------------------------- */
static uint32_t hdr_crc(const sector_header_t *h) {
    return crc32_ieee((const uint8_t *)h, SECTOR_HEADER_SIZE - 4);
}

static bool slot_read(uint8_t slot, sector_header_t *h, cfg_blob_t *blob, uint32_t *seq_out) {
    uint8_t buf[SECTOR_HEADER_SIZE + sizeof(cfg_blob_t)];
    if (!storage_flash_read_slot(slot, buf, sizeof(buf))) return false;
    memcpy(h, buf, SECTOR_HEADER_SIZE);
    memcpy(blob, buf + SECTOR_HEADER_SIZE, sizeof(cfg_blob_t));
    if (h->magic != MAGIC_SECTOR) return false;
    if (h->hdr_crc != hdr_crc(h)) return false;
    if (!config_validate(blob)) return false;
    if (seq_out) *seq_out = h->seq;
    return true;
}

static bool slot_write(uint8_t slot, uint32_t seq, const cfg_blob_t *blob) {
    uint8_t buf[SECTOR_HEADER_SIZE + sizeof(cfg_blob_t)];
    sector_header_t h;
    memset(&h, 0, sizeof(h));
    h.magic = MAGIC_SECTOR;
    h.seq = seq;
    h.blob_crc = blob->crc32;
    h.hdr_crc = hdr_crc(&h);
    memcpy(buf, &h, SECTOR_HEADER_SIZE);
    memcpy(buf + SECTOR_HEADER_SIZE, blob, sizeof(cfg_blob_t));
    return storage_flash_write_slot(slot, buf, sizeof(buf));
}

/* ---- public ------------------------------------------------------------- */
bool storage_init(void) {
    memset(&s_stats, 0, sizeof(s_stats));
    s_loaded = false;

    sector_header_t h;
    cfg_blob_t blob;
    uint32_t seq_a = 0, seq_b = 0;
    cfg_blob_t blob_a;
    memset(&blob_a, 0, sizeof(blob_a));
    bool ok_a = slot_read(0, &h, &blob, &seq_a);
    if (!ok_a) s_stats.recoveries++;
    if (ok_a) blob_a = blob;

    bool ok_b = slot_read(1, &h, &blob, &seq_b);
    if (!ok_b) s_stats.recoveries++;

    if (ok_a && ok_b) {
        /* Higher sequence wins. Equal sequences should be impossible but if it
         * happens prefer slot A so behaviour is deterministic. */
        if (seq_b > seq_a) {
            s_cfg = blob;
            s_stats.seq = seq_b;
            s_stats.active_slot = 1;
        } else {
            s_cfg = blob_a;
            s_stats.seq = seq_a;
            s_stats.active_slot = 0;
        }
        s_stats.valid = true;
    } else if (ok_a) {
        s_cfg = blob_a;
        s_stats.seq = seq_a;
        s_stats.active_slot = 0;
        s_stats.valid = true;
    } else if (ok_b) {
        s_cfg = blob;
        s_stats.seq = seq_b;
        s_stats.active_slot = 1;
        s_stats.valid = true;
    } else {
        /* Both slots unusable: first boot, or someone flashed over the config
         * region. Come up on factory defaults and write them immediately so the
         * next boot has something valid. */
        config_defaults(&s_cfg);
        s_stats.seq = 1;
        s_stats.active_slot = 0;
        s_stats.valid = false;
        s_stats.dirty = true;
        (void)slot_write(0, s_stats.seq, &s_cfg);
    }

    /* Clamp anything that could have come from a partially-written sector. */
    if (s_cfg.global.boot_channel >= CFG_CHANNEL_COUNT) s_cfg.global.boot_channel = 0;
    s_loaded = true;
    return s_stats.valid;
}

bool storage_commit(void) {
    if (!s_loaded) return false;
    config_reseal(&s_cfg);
    uint8_t target = (uint8_t)(s_stats.active_slot ^ 1u); /* write the OTHER slot */
    uint32_t seq = s_stats.seq + 1;
    if (!slot_write(target, seq, &s_cfg)) return false;
    s_stats.active_slot = target;
    s_stats.seq = seq;
    s_stats.writes++;
    s_stats.dirty = false;
    s_stats.valid = true;
    return true;
}

bool storage_stage(const cfg_blob_t *blob) {
    if (!blob || !config_validate(blob)) return false;
    s_cfg = *blob;
    s_stats.dirty = true;
    return true;
}

bool storage_reset(void) {
    config_defaults(&s_cfg);
    s_stats.dirty = true;
    return storage_commit();
}

const storage_stats_t *storage_stats(void) { return &s_stats; }

void storage_mark_dirty(void) { s_stats.dirty = true; }
