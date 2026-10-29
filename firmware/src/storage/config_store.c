/*
 * config_store.c — live config, validation, and the A/B flash ping-pong.
 */
#include "config.h"
#include "storage.h"

#include <string.h>

#include "protocol.h" /* crc32_ieee */
#include "oled_playlist.h"

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
    if (cfg->global.oled_boot_mode >= OLED_SCREEN_COUNT) return false;
    if (cfg->global.oled_inverted > 1 || cfg->global._oled_pad != 0) return false;
    if (cfg->global.oled_auto_cycle_s != 0 &&
        cfg->global.oled_auto_cycle_s < OLED_AUTO_CYCLE_MIN_S) return false;
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

/* v2's first 16 global bytes and all four channels are byte-for-byte the
 * same as v3. Its CRC was at offset 2264, not v3's 2268. Keep the old layout
 * pinned and validate BOTH old CRCs before copying any user bindings. */
typedef struct __attribute__((packed)) {
    uint32_t magic;
    uint16_t version;
    uint16_t length;
    uint8_t global[16];
    cfg_channel_t channels[CFG_CHANNEL_COUNT];
    uint32_t crc32;
} cfg_blob_v2_t;
_Static_assert(sizeof(cfg_blob_v2_t) == 2268, "v2 migration layout changed");
_Static_assert(offsetof(cfg_blob_v2_t, channels) == 24, "v2 channel offset changed");

/* Keep large config buffers out of the core-0 boot stack. Calls are all on the
 * single-threaded superloop; slot_write can reuse the read buffer after both
 * reads have returned. */
static uint8_t s_sector_bytes[SECTOR_HEADER_SIZE + sizeof(cfg_blob_t)];
static cfg_blob_t s_second_slot;
enum { SLOT_BAD = 0, SLOT_V2 = 2, SLOT_V3 = 3 };

static int slot_read(uint8_t slot, cfg_blob_t *out, uint32_t *seq_out) {
    if (!storage_flash_read_slot(slot, s_sector_bytes, sizeof(s_sector_bytes))) return SLOT_BAD;
    sector_header_t h;
    memcpy(&h, s_sector_bytes, sizeof(h));
    if (h.magic != MAGIC_SECTOR || h.hdr_crc != hdr_crc(&h)) return SLOT_BAD;
    const uint8_t *body = s_sector_bytes + SECTOR_HEADER_SIZE;
    const cfg_blob_t *current = (const cfg_blob_t *)body;
    if (current->version == CONFIG_FORMAT_VERSION && h.blob_crc == current->crc32 &&
        config_validate(current)) {
        memcpy(out, current, sizeof(*out));
        if (seq_out) *seq_out = h.seq;
        return SLOT_V3;
    }

    const cfg_blob_v2_t *old = (const cfg_blob_v2_t *)body;
    if (old->magic != MAGIC_CONFIG || old->version != 2 || old->length != sizeof(*old) ||
        h.blob_crc != old->crc32 ||
        crc32_ieee(body, sizeof(*old) - sizeof(old->crc32)) != old->crc32) {
        return SLOT_BAD;
    }
    config_defaults(out);
    memcpy(&out->global, old->global, sizeof(old->global));
    memcpy(out->channels, old->channels, sizeof(old->channels));
    /* Older tools could store 1-2 s; v3 validates the 3 s floor. */
    if (out->global.oled_auto_cycle_s > 0 &&
        out->global.oled_auto_cycle_s < OLED_AUTO_CYCLE_MIN_S) {
        out->global.oled_auto_cycle_s = OLED_AUTO_CYCLE_MIN_S;
    }
    config_reseal(out);
    if (!config_validate(out)) return SLOT_BAD;
    if (seq_out) *seq_out = h.seq;
    return SLOT_V2;
}

static bool slot_write(uint8_t slot, uint32_t seq, const cfg_blob_t *blob) {
    sector_header_t h = {0};
    h.magic = MAGIC_SECTOR;
    h.seq = seq;
    h.blob_crc = blob->crc32;
    h.hdr_crc = hdr_crc(&h);
    memcpy(s_sector_bytes, &h, SECTOR_HEADER_SIZE);
    memcpy(s_sector_bytes + SECTOR_HEADER_SIZE, blob, sizeof(cfg_blob_t));
    return storage_flash_write_slot(slot, s_sector_bytes, sizeof(s_sector_bytes));
}

/* ---- public ------------------------------------------------------------- */
bool storage_init(void) {
    memset(&s_stats, 0, sizeof(s_stats));
    s_loaded = false;

    uint32_t seq_a = 0, seq_b = 0;
    int kind_a = slot_read(0, &s_cfg, &seq_a);
    if (kind_a == SLOT_BAD) s_stats.recoveries++;
    int kind_b = slot_read(1, &s_second_slot, &seq_b);
    if (kind_b == SLOT_BAD) s_stats.recoveries++;

    int selected_kind = SLOT_BAD;
    if (kind_a != SLOT_BAD || kind_b != SLOT_BAD) {
        /* Highest valid sequence wins; ties prefer A. A v2 slot stays intact
         * until its upgraded v3 copy is fully programmed in the OTHER slot. */
        if (kind_b != SLOT_BAD && (kind_a == SLOT_BAD || seq_b > seq_a)) {
            s_cfg = s_second_slot;
            s_stats.seq = seq_b;
            s_stats.active_slot = 1;
            selected_kind = kind_b;
        } else {
            s_stats.seq = seq_a;
            s_stats.active_slot = 0;
            selected_kind = kind_a;
        }
        s_stats.valid = true;
    } else {
        config_defaults(&s_cfg);
        s_stats.seq = 1;
        s_stats.active_slot = 0;
        s_stats.valid = false;
        s_stats.dirty = true;
        (void)slot_write(0, s_stats.seq, &s_cfg);
    }

    s_loaded = true;
    if (selected_kind == SLOT_V2) {
        /* Failed write/brown-out leaves the original v2 sector bootable. Keep
         * RAM marked dirty and retry migration on the next power cycle. */
        s_stats.dirty = true;
        (void)storage_commit();
    }
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
