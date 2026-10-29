/*
 * test_config.c — defaults, validation, CRC, and the A/B flash ping-pong.
 *
 * The A/B logic runs against the RAM-backed flash stub in flash_store.c, so a
 * torn write can be simulated exactly: storage_host_fail_next_write() makes the
 * next program fail the way a brown-out would.
 */
#include <stddef.h>
#include <string.h>

#include "config.h"
#include "protocol.h"
#include "storage.h"
#include "test.h"
#include "test_runner.h"

/* From the host stub in flash_store.c. */
extern void storage_host_reset(void);
extern void storage_host_fail_next_write(bool fail);
extern int storage_host_write_count(void);

static void test_defaults_are_valid_and_sealed(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    ASSERT_EQ(c.magic, MAGIC_CONFIG);
    ASSERT_EQ(c.version, CONFIG_FORMAT_VERSION);
    ASSERT_EQ(c.length, (int)sizeof(cfg_blob_t));
    ASSERT(config_validate(&c));
}

static void test_defaults_leave_keys_empty_and_knob_useful(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    for (int ch = 0; ch < CFG_CHANNEL_COUNT; ch++) {
        for (int k = 0; k < CFG_KEY_COUNT; k++) {
            ASSERT_EQ(c.channels[ch].keys[k].type, ACTION_TYPE_NONE);
        }
        ASSERT_EQ(c.channels[ch].knob_cw.type, ACTION_TYPE_MEDIA);
        ASSERT_EQ(c.channels[ch].knob_cw.code, MEDIA_VOLUME_UP);
        ASSERT_EQ(c.channels[ch].knob_ccw.code, MEDIA_VOLUME_DOWN);
        ASSERT_EQ(c.channels[ch].knob_tap.code, MEDIA_MUTE);
        ASSERT_EQ(c.channels[ch].knob_hold.type, ACTION_TYPE_CHANNEL_NEXT);
    }
}

static void test_four_channels_have_distinct_colours(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    /* If two channels shared a base colour you could not tell which page you are
     * on, which is the entire reason the lighting is per channel. */
    for (int a = 0; a < CFG_CHANNEL_COUNT; a++) {
        for (int b = a + 1; b < CFG_CHANNEL_COUNT; b++) {
            bool same = c.channels[a].lighting.r == c.channels[b].lighting.r &&
                        c.channels[a].lighting.g == c.channels[b].lighting.g &&
                        c.channels[a].lighting.b == c.channels[b].lighting.b;
            ASSERT(!same);
        }
    }
}

static void test_crc_detects_a_single_bit_flip(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    ASSERT(config_validate(&c));

    /* Flip one bit in a key binding — the most likely corruption in practice. */
    c.channels[1].keys[4].code ^= 0x01;
    ASSERT(!config_validate(&c));

    config_reseal(&c);
    ASSERT(config_validate(&c)); /* resealing fixes it, which is the point of reseal */
}

static void test_crc_detects_corruption_anywhere_in_the_blob(void) {
    g_current = __func__;
    /* Walk a byte across the whole struct. Any position that can be flipped
     * without detection is a hole in the checksum coverage. */
    int holes = 0;
    for (size_t i = 0; i < CFG_CRC_COVERED_BYTES; i++) {
        cfg_blob_t c;
        config_defaults(&c);
        ((uint8_t *)&c)[i] ^= 0x80;
        if (config_validate(&c)) holes++;
    }
    ASSERT_EQ(holes, 0);
}

static void test_validation_rejects_unknown_action_type(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    c.channels[0].keys[0].type = 99; /* from a newer app version */
    config_reseal(&c);
    ASSERT(!config_validate(&c)); /* must fail closed, not fire garbage */
}

static void test_validation_rejects_out_of_range_channel(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    c.channels[0].keys[0].type = ACTION_TYPE_CHANNEL;
    c.channels[0].keys[0].code = 7; /* only 3 channels exist */
    config_reseal(&c);
    ASSERT(!config_validate(&c));
}

static void test_validation_rejects_unterminated_text(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    c.channels[0].keys[0].type = ACTION_TYPE_TEXT;
    memset(c.channels[0].keys[0].text, 'A', CFG_TEXT_MAX); /* no NUL anywhere */
    config_reseal(&c);
    ASSERT(!config_validate(&c)); /* would make type_text run past the field */
}

static void test_validation_rejects_wrong_magic_and_version(void) {
    g_current = __func__;
    cfg_blob_t c;
    config_defaults(&c);
    c.magic = 0xDEADBEEF;
    ASSERT(!config_validate(&c));
    config_defaults(&c);
    c.version = CONFIG_FORMAT_VERSION + 1;
    ASSERT(!config_validate(&c));
    config_defaults(&c);
    c.length = (uint16_t)(sizeof(cfg_blob_t) - 1);
    ASSERT(!config_validate(&c));
}

static void test_struct_sizes_match_the_wire_format(void) {
    g_current = __func__;
    /* These are the numbers host/protocol/protocol.json quotes. If one changes,
     * the generator and the host tests fail too — that is the drift guard. */
    ASSERT_EQ((int)sizeof(cfg_action_t), 40);
    ASSERT_EQ((int)sizeof(cfg_lighting_t), 40);
    ASSERT_EQ((int)sizeof(cfg_channel_t), 560);
    ASSERT_EQ((int)sizeof(cfg_global_t), 20);
    ASSERT_EQ(CFG_CHANNEL_COUNT, 4);
    ASSERT_EQ((int)sizeof(cfg_blob_t), 8 + 20 + CFG_CHANNEL_COUNT * 560 + 4);
    ASSERT_EQ((int)sizeof(cfg_blob_t), 2272); /* pinned v3 wire-format size */
    ASSERT_EQ((int)CFG_CRC_OFFSET, 2268);
    ASSERT_EQ((int)offsetof(cfg_global_t, oled_boot_mode), 16);
    ASSERT_EQ((int)offsetof(cfg_global_t, oled_contrast), 17);
    ASSERT_EQ((int)offsetof(cfg_global_t, oled_inverted), 18);
    ASSERT_EQ((int)offsetof(cfg_global_t, _oled_pad), 19);
    /* Offsets the host encoder must agree with. */
    ASSERT_EQ((int)offsetof(cfg_blob_t, global), 8);
    ASSERT_EQ((int)offsetof(cfg_blob_t, channels), 28);
    ASSERT_EQ((int)offsetof(cfg_blob_t, crc32), 2268);
    ASSERT_EQ((int)offsetof(cfg_channel_t, lighting), 520);
    ASSERT_EQ((int)offsetof(cfg_channel_t, knob_cw), 360);
    ASSERT_EQ((int)offsetof(cfg_lighting_t, per_key_mask), 7);
    ASSERT_EQ((int)offsetof(cfg_lighting_t, per_key), 9);
}

static void test_first_boot_creates_a_valid_sector(void) {
    g_current = __func__;
    storage_host_reset();
    bool had = storage_init();
    ASSERT(!had); /* nothing was there */
    ASSERT(config_validate(config_get()));
    ASSERT(storage_commit());
    ASSERT(storage_stats()->valid);
    ASSERT_EQ(storage_host_write_count(), 2); /* defaults + explicit commit */
}

/* Build a real v2 sector with header+blob CRCs, not a mocked config struct. */
static void write_v2_sector(uint8_t slot, uint32_t seq, const char *label) {
    cfg_blob_t current;
    config_defaults(&current);
    current.channels[3].keys[8].type = ACTION_TYPE_TEXT;
    strcpy((char *)current.channels[3].keys[8].text, label);
    current.channels[3].lighting.brightness = 37;
    current.global.boot_channel = 3;
    current.global.hold_ms = 417;
    current.global.oled_auto_cycle_s = 13;
    current.global.oled_playlist = 0x0123;

    uint8_t body[2268] = {0};
    memcpy(body, &current, 8);
    uint16_t old_version = 2, old_length = sizeof(body);
    memcpy(body + 4, &old_version, sizeof(old_version));
    memcpy(body + 6, &old_length, sizeof(old_length));
    memcpy(body + 8, &current.global, 16);
    memcpy(body + 24, current.channels, sizeof(current.channels));
    uint32_t crc = crc32_ieee(body, 2264);
    memcpy(body + 2264, &crc, sizeof(crc));

    sector_header_t header = {.magic = MAGIC_SECTOR, .seq = seq, .blob_crc = crc};
    header.hdr_crc = crc32_ieee((const uint8_t *)&header, SECTOR_HEADER_SIZE - 4);
    uint8_t bytes[SECTOR_HEADER_SIZE + sizeof(body)];
    memcpy(bytes, &header, SECTOR_HEADER_SIZE);
    memcpy(bytes + SECTOR_HEADER_SIZE, body, sizeof(body));
    ASSERT(storage_flash_write_slot(slot, bytes, sizeof(bytes)));
}

static void test_v2_migration_preserves_settings_and_reboots_cleanly(void) {
    g_current = __func__;
    storage_host_reset();
    write_v2_sector(0, 19, "keep-my-key");
    ASSERT(storage_init());
    ASSERT_EQ(storage_stats()->seq, 20);
    ASSERT_EQ(storage_stats()->active_slot, 1);
    ASSERT_EQ(config_get()->version, 3);
    ASSERT_EQ(config_get()->global.boot_channel, 3);
    ASSERT_EQ(config_get()->global.hold_ms, 417);
    ASSERT_EQ(config_get()->global.oled_auto_cycle_s, 13);
    ASSERT_EQ(config_get()->global.oled_playlist, 0x0123);
    ASSERT_EQ(config_get()->global.oled_boot_mode, 0);
    ASSERT_EQ(config_get()->global.oled_contrast, 0x8F);
    ASSERT_EQ(config_get()->global.oled_inverted, 0);
    ASSERT_STR_EQ((const char *)config_get()->channels[3].keys[8].text, "keep-my-key");
    ASSERT_EQ(config_get()->channels[3].lighting.brightness, 37);
    ASSERT_EQ(storage_host_write_count(), 2); /* fixture + exactly one migration */
    ASSERT(storage_init());
    ASSERT_EQ(storage_stats()->seq, 20);
    ASSERT_EQ(storage_host_write_count(), 2); /* no write on every subsequent boot */
}

static void test_v2_brownout_keeps_previous_sector_bootable(void) {
    g_current = __func__;
    storage_host_reset();
    write_v2_sector(1, 81, "keep-my-key");
    storage_host_fail_next_write(true);
    ASSERT(storage_init()); /* usable old data even when upgrade fails */
    ASSERT(storage_stats()->dirty);
    ASSERT_EQ(storage_host_write_count(), 1);
    ASSERT_EQ(config_get()->channels[3].lighting.brightness, 37);
    ASSERT(storage_init()); /* reboot rejects torn target, retries intact v2 */
    ASSERT_EQ(storage_stats()->recoveries, 1); /* partial v3 sector failed CRC */
    ASSERT_EQ(storage_stats()->seq, 82);
    ASSERT_EQ(storage_stats()->active_slot, 0);
    ASSERT_EQ(storage_host_write_count(), 2);
    ASSERT_STR_EQ((const char *)config_get()->channels[3].keys[8].text, "keep-my-key");
}

static void test_v2_newest_sector_wins_before_migration(void) {
    g_current = __func__;
    storage_host_reset();
    write_v2_sector(0, 41, "older-binding");
    write_v2_sector(1, 42, "newer-binding");
    ASSERT(storage_init());
    ASSERT_EQ(storage_stats()->seq, 43);
    ASSERT_EQ(storage_stats()->active_slot, 0);
    ASSERT_STR_EQ((const char *)config_get()->channels[3].keys[8].text, "newer-binding");
    ASSERT(storage_init());
    ASSERT_STR_EQ((const char *)config_get()->channels[3].keys[8].text, "newer-binding");
    ASSERT_EQ(storage_host_write_count(), 3); /* two v2 fixtures + one v3 */
}

static void test_corrupt_v2_blob_is_not_migrated(void) {
    g_current = __func__;
    storage_host_reset();
    write_v2_sector(0, 14, "corrupt-binding");
    uint8_t raw[SECTOR_HEADER_SIZE + sizeof(cfg_blob_t)];
    ASSERT(storage_flash_read_slot(0, raw, sizeof(raw)));
    raw[SECTOR_HEADER_SIZE + 30] ^= 0x80; /* keep header CRC valid, break blob CRC */
    ASSERT(storage_flash_write_slot(0, raw, sizeof(raw)));
    ASSERT(!storage_init());
    ASSERT_EQ(config_get()->channels[3].keys[8].type, ACTION_TYPE_NONE);
    ASSERT_EQ(config_get()->global.oled_contrast, 0x8F);
}

static void test_new_oled_settings_validate_and_persist(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    cfg_blob_t *cfg = config_mutable();
    cfg->global.oled_boot_mode = 9;
    cfg->global.oled_contrast = 210;
    cfg->global.oled_inverted = 1;
    cfg->global.oled_playlist = (1u << 9) | (1u << 4);
    cfg->global.oled_auto_cycle_s = 0;
    config_reseal(cfg);
    ASSERT(config_validate(cfg));
    ASSERT(storage_commit());
    ASSERT(storage_init());
    ASSERT_EQ(config_get()->global.oled_boot_mode, 9);
    ASSERT_EQ(config_get()->global.oled_contrast, 210);
    ASSERT_EQ(config_get()->global.oled_inverted, 1);
    ASSERT_EQ(config_get()->global.oled_auto_cycle_s, 0);
    ASSERT_EQ(config_get()->global.oled_playlist, (1u << 9) | (1u << 4));
    cfg_blob_t invalid = *config_get();
    invalid.global.oled_boot_mode = 12;
    config_reseal(&invalid);
    ASSERT(!config_validate(&invalid));
    invalid.global.oled_boot_mode = 0;
    invalid.global.oled_inverted = 2;
    config_reseal(&invalid);
    ASSERT(!config_validate(&invalid));
    invalid.global.oled_inverted = 0;
    invalid.global._oled_pad = 1;
    config_reseal(&invalid);
    ASSERT(!config_validate(&invalid));
    invalid.global._oled_pad = 0;
    invalid.global.oled_auto_cycle_s = 1;
    config_reseal(&invalid);
    ASSERT(!config_validate(&invalid));
}

static void test_config_survives_a_reboot(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    cfg_blob_t *m = config_mutable();
    m->channels[2].keys[8].type = ACTION_TYPE_TEXT;
    memset(m->channels[2].keys[8].text, 0, CFG_TEXT_MAX);
    strcpy((char *)m->channels[2].keys[8].text, "obs-scene-3");
    m->channels[2].lighting.brightness = 42;
    config_reseal(m);
    ASSERT(storage_commit());

    /* "Reboot": re-read flash from scratch. */
    bool had = storage_init();
    ASSERT(had);
    ASSERT_EQ(config_get()->channels[2].keys[8].type, ACTION_TYPE_TEXT);
    ASSERT_STR_EQ((const char *)config_get()->channels[2].keys[8].text, "obs-scene-3");
    ASSERT_EQ(config_get()->channels[2].lighting.brightness, 42);
}

static void test_ab_pingpong_alternates_sectors(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    uint8_t first = storage_stats()->active_slot;
    ASSERT(storage_commit());
    ASSERT_EQ(storage_stats()->active_slot, (uint8_t)(first ^ 1));
    ASSERT(storage_commit());
    ASSERT_EQ(storage_stats()->active_slot, first);
}

static void test_a_failed_write_leaves_the_previous_copy_bootable(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    ASSERT(storage_commit()); /* slot 0 written, valid */

    cfg_blob_t good = *config_get();

    /* Change something, then make the write fail mid-save. */
    config_mutable()->channels[0].lighting.brightness = 7;
    config_reseal(config_mutable());
    storage_host_fail_next_write(true);
    ASSERT(!storage_commit()); /* reports failure rather than lying */

    /* A reboot must come up on the last GOOD config, not the half-written one. */
    bool had = storage_init();
    ASSERT(had);
    ASSERT_EQ(config_get()->channels[0].lighting.brightness,
              good.channels[0].lighting.brightness);
}

static void test_both_sectors_corrupt_falls_back_to_defaults(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    storage_commit();

    /* Simulate someone reflashing the firmware over the config region: both
     * slots read as erased flash (0xFF). */
    storage_host_reset();
    bool had = storage_init();
    ASSERT(!had);
    ASSERT(config_validate(config_get())); /* still usable: factory defaults */
    ASSERT_EQ(config_get()->channels[0].knob_tap.code, MEDIA_MUTE);
}

static void test_stage_rejects_invalid_blob_without_touching_ram(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    cfg_blob_t before = *config_get();

    cfg_blob_t bad;
    config_defaults(&bad);
    bad.channels[0].keys[0].type = 200; /* invalid */
    config_reseal(&bad);
    ASSERT(!storage_stage(&bad));
    ASSERT_EQ(memcmp(config_get(), &before, sizeof(before)), 0);

    cfg_blob_t ok;
    config_defaults(&ok);
    ok.channels[1].lighting.mode = LED_MODE_RAINBOW;
    config_reseal(&ok);
    ASSERT(storage_stage(&ok));
    ASSERT_EQ(config_get()->channels[1].lighting.mode, LED_MODE_RAINBOW);
    ASSERT(storage_stats()->dirty);
}

static void test_reset_restores_factory_and_persists(void) {
    g_current = __func__;
    storage_host_reset();
    storage_init();
    config_mutable()->channels[0].keys[0].type = ACTION_TYPE_KEYCODE;
    config_mutable()->channels[0].keys[0].code = HID_ENTER;
    config_reseal(config_mutable());
    ASSERT(storage_commit());

    ASSERT(storage_reset());
    ASSERT_EQ(config_get()->channels[0].keys[0].type, ACTION_TYPE_NONE);
    ASSERT(!storage_stats()->dirty);

    storage_init(); /* reboot */
    ASSERT_EQ(config_get()->channels[0].keys[0].type, ACTION_TYPE_NONE);
}

const test_case_t config_tests[] = {
    {"defaults_are_valid_and_sealed", test_defaults_are_valid_and_sealed},
    {"defaults_leave_keys_empty_and_knob_useful", test_defaults_leave_keys_empty_and_knob_useful},
    {"four_channels_have_distinct_colours", test_four_channels_have_distinct_colours},
    {"crc_detects_a_single_bit_flip", test_crc_detects_a_single_bit_flip},
    {"crc_detects_corruption_anywhere_in_the_blob", test_crc_detects_corruption_anywhere_in_the_blob},
    {"validation_rejects_unknown_action_type", test_validation_rejects_unknown_action_type},
    {"validation_rejects_out_of_range_channel", test_validation_rejects_out_of_range_channel},
    {"validation_rejects_unterminated_text", test_validation_rejects_unterminated_text},
    {"validation_rejects_wrong_magic_and_version", test_validation_rejects_wrong_magic_and_version},
    {"struct_sizes_match_the_wire_format", test_struct_sizes_match_the_wire_format},
    {"first_boot_creates_a_valid_sector", test_first_boot_creates_a_valid_sector},
    {"config_survives_a_reboot", test_config_survives_a_reboot},
    {"v2_migration_preserves_settings_and_reboots_cleanly", test_v2_migration_preserves_settings_and_reboots_cleanly},
    {"v2_brownout_keeps_previous_sector_bootable", test_v2_brownout_keeps_previous_sector_bootable},
    {"v2_newest_sector_wins_before_migration", test_v2_newest_sector_wins_before_migration},
    {"corrupt_v2_blob_is_not_migrated", test_corrupt_v2_blob_is_not_migrated},
    {"new_oled_settings_validate_and_persist", test_new_oled_settings_validate_and_persist},
    {"ab_pingpong_alternates_sectors", test_ab_pingpong_alternates_sectors},
    {"a_failed_write_leaves_the_previous_copy_bootable",
     test_a_failed_write_leaves_the_previous_copy_bootable},
    {"both_sectors_corrupt_falls_back_to_defaults", test_both_sectors_corrupt_falls_back_to_defaults},
    {"stage_rejects_invalid_blob_without_touching_ram", test_stage_rejects_invalid_blob_without_touching_ram},
    {"reset_restores_factory_and_persists", test_reset_restores_factory_and_persists},
    {NULL, NULL},
};
