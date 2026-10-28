/*
 * ascii_cmd.c — see ascii_cmd.h for why this exists at all.
 *
 * Rules, in one place:
 *   OLED:NEXT          step the rotation forward (the documented host step)
 *   OLED:MODE:<n>      pin catalogue screen n
 *   OLED:AUTO:<s>      dwell seconds: 0 = off, otherwise 3..255
 *   OLED:PL:<mask>     rotation mask, bit i = screen i, 0 = everything
 *   OLED:CH:<n>        switch page (what the app sends on a layer change)
 *
 * Rotation settings are written into the live config and marked dirty, not
 * committed: a host that spams AUTO while you drag a slider must not wear the
 * config sector out. The app's Save Display button is what commits, via the
 * normal config path.
 */
#include "ascii_cmd.h"

#include <string.h>

#include "channel.h"
#include "config.h"
#include "oled_playlist.h"
#include "storage.h"

/* Longest prefix we match, so a line is compared once. */
#define PREFIX_OLED "OLED:"

static char s_line[ASCII_CMD_MAX + 1];
static uint8_t s_len;
static bool s_overflow;

void ascii_cmd_reset(void) {
    s_len = 0;
    s_overflow = false;
    s_line[0] = '\0';
}

bool ascii_cmd_feed(uint8_t byte) {
    if (byte == '\r') return false; /* tolerate CRLF hosts */
    if (byte != '\n') {
        if (s_len < ASCII_CMD_MAX) {
            s_line[s_len++] = (char)byte;
        } else {
            s_overflow = true;
        }
        return false;
    }
    s_line[s_len] = '\0';
    bool handled = false;
    if (!s_overflow && s_len > 0) handled = ascii_cmd_handle(s_line);
    ascii_cmd_reset();
    return handled;
}

/* Decimal digits only, no sign, saturating at `max`. Returns false when there
 * was no digit at all — an empty field is a typo, not zero. */
static bool parse_u32(const char *s, uint32_t max, uint32_t *out) {
    if (!s || !*s) return false;
    uint32_t v = 0;
    bool any = false;
    while (*s) {
        if (*s < '0' || *s > '9') {
            /* Anything after the digits means this was not a number we sent. */
            return false;
        }
        uint32_t d = (uint32_t)(*s - '0');
        v = v * 10u + d;
        if (v > max) v = max;
        any = true;
        s++;
    }
    if (!any) return false;
    *out = v;
    return true;
}

static bool starts_with(const char *s, const char *prefix) {
    size_t n = strlen(prefix);
    return strncmp(s, prefix, n) == 0;
}

/* Dwell seconds: 0 turns the rotation off, 1 and 2 are below the documented
 * floor, so they are raised to 3 rather than left as a 1-second strobe. */
static uint8_t sanitise_auto_cycle(uint32_t s) {
    if (s == 0) return 0;
    if (s < OLED_AUTO_CYCLE_MIN_S) return OLED_AUTO_CYCLE_MIN_S;
    return (uint8_t)s;
}

static void set_global_u8(uint8_t *field, uint8_t value) {
    if (*field == value) return;
    *field = value;
    config_reseal(config_mutable());
    storage_mark_dirty();
}

bool ascii_cmd_handle(const char *line) {
    if (!line) return false;
    if (!starts_with(line, PREFIX_OLED)) return false;

    const char *body = line + strlen(PREFIX_OLED);
    uint32_t v = 0;

    if (strcmp(body, "NEXT") == 0) {
        (void)oled_playlist_advance(1);
        return true;
    }

    if (starts_with(body, "MODE:")) {
        if (!parse_u32(body + 5, 255, &v)) return false;
        return oled_playlist_select((uint8_t)v);
    }

    if (starts_with(body, "AUTO:")) {
        if (!parse_u32(body + 5, 255, &v)) return false;
        cfg_blob_t *cfg = config_mutable();
        if (!cfg) return false;
        set_global_u8(&cfg->global.oled_auto_cycle_s, sanitise_auto_cycle(v));
        return true;
    }

    if (starts_with(body, "PL:")) {
        if (!parse_u32(body + 3, 0xFFFFu, &v)) return false;
        cfg_blob_t *cfg = config_mutable();
        if (!cfg) return false;
        uint16_t mask = oled_playlist_sanitise((uint16_t)v);
        if (cfg->global.oled_playlist == mask) return true;
        cfg->global.oled_playlist = mask;
        config_reseal(cfg);
        storage_mark_dirty();
        return true;
    }

    if (starts_with(body, "CH:")) {
        if (!parse_u32(body + 3, 255, &v)) return false;
        if (v >= CFG_CHANNEL_COUNT) return false;
        channel_set((uint8_t)v);
        return true;
    }

    /* Everything else under OLED: is text for a live screen. The shipping
     * screens are baked frames with fixed copy, so a custom string has nowhere to
     * go yet; it is dropped rather than half-applied. */
    return false;
}
