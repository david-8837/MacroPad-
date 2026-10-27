/*
 * scan.c — key pin reading + debounce.
 *
 * Debounce method: a per-key counter of consecutive agreeing raw samples. The
 * accepted state flips only when the counter reaches the threshold. This is the
 * "integrator" debouncer rather than "ignore everything for N ms after an edge":
 * the integrator still accepts a genuinely fast double click, whereas a
 * blanking window would swallow it. On a macropad where people do press keys
 * quickly on purpose, that difference matters.
 */
#include "scan.h"

#include <string.h>

#include "config.h"

#ifndef SCAN_NO_HW
#include "hardware/gpio.h"
#endif

#define DEBOUNCE_SAMPLES (CFG_DEBOUNCE_MS / CFG_SCAN_PERIOD_MS)

#ifndef SCAN_NO_HW
static const uint8_t k_pins[BOARD_KEY_COUNT] = BOARD_KEY_PINS;
#endif

void scan_init(scan_state_t *s) {
    if (!s) return;
    memset(s, 0, sizeof(*s));
    s->raw_last = 0xFFFF; /* force every key to be evaluated on the first scan */
}

void scan_hw_init(void) {
#ifndef SCAN_NO_HW
    for (int i = 0; i < BOARD_KEY_COUNT; i++) {
        gpio_init(k_pins[i]);
        gpio_set_dir(k_pins[i], GPIO_IN);
        /* Pull-up for direct-to-GND wiring. If you flip to active-high, change
         * BOARD_KEYS_ACTIVE_LOW and this to gpio_pull_down. */
        if (BOARD_KEYS_ACTIVE_LOW) {
            gpio_pull_up(k_pins[i]);
        } else {
            gpio_pull_down(k_pins[i]);
        }
        /* A little extra drive strength on the input schmitt path costs nothing
         * and helps with long hand-soldered runs. */
        gpio_set_input_hysteresis_enabled(k_pins[i], true);
    }
#endif
}

#ifndef SCAN_NO_HW
static const uint8_t k_enc_pins[3] = {BOARD_ENC_A_PIN, BOARD_ENC_B_PIN, BOARD_ENC_SW_PIN};
#endif

void scan_hw_init_encoder(void) {
#ifndef SCAN_NO_HW
    for (int i = 0; i < 3; i++) {
        gpio_init(k_enc_pins[i]);
        gpio_set_dir(k_enc_pins[i], GPIO_IN);
        /* Mechanical encoders with no RC filter are noisy. The internal pull-up
         * plus the schmitt trigger input hysteresis handles most of it, and the
         * quadrature decoder in gesture.c rejects illegal transitions, which is
         * the second line of defence. If you still see phantom steps, add
         * 100 nF from each of A/B/SW to GND at the encoder, not at the board. */
        gpio_pull_up(k_enc_pins[i]);
        gpio_set_input_hysteresis_enabled(k_enc_pins[i], true);
    }
#endif
}

uint8_t scan_read_encoder_a(void) {
#ifdef SCAN_NO_HW
    return 1;
#else
    return gpio_get(BOARD_ENC_A_PIN) ? 1 : 0;
#endif
}

uint8_t scan_read_encoder_b(void) {
#ifdef SCAN_NO_HW
    return 1;
#else
    return gpio_get(BOARD_ENC_B_PIN) ? 1 : 0;
#endif
}

bool scan_read_encoder_sw_down(void) {
#ifdef SCAN_NO_HW
    return false;
#else
    /* Active low: the switch connects the pin to GND when pressed. */
    return !gpio_get(BOARD_ENC_SW_PIN);
#endif
}

uint16_t scan_read_raw(void) {
#ifdef SCAN_NO_HW
    return 0; /* host builds inject samples directly via scan_update() */
#else
    uint16_t mask = 0;
    for (int i = 0; i < BOARD_KEY_COUNT; i++) {
        bool level = gpio_get(k_pins[i]);
        bool down = BOARD_KEYS_ACTIVE_LOW ? !level : level;
        if (down) mask = (uint16_t)(mask | (1u << i));
    }
    return mask;
#endif
}

void scan_update(scan_state_t *s, uint16_t raw) {
    if (!s) return;
    for (int i = 0; i < BOARD_KEY_COUNT; i++) {
        uint16_t bit = (uint16_t)(1u << i);
        bool raw_down = (raw & bit) != 0;
        bool stable_down = (s->stable & bit) != 0;

        if (raw_down == stable_down) {
            /* Agreeing: decay the counter so a single clean sample after a
             * bounce storm does not immediately re-arm a flip. */
            if (s->count[i] > 0) s->count[i]--;
            continue;
        }

        s->bounces++;
        s->count[i]++;
        if (s->count[i] >= DEBOUNCE_SAMPLES) {
            s->count[i] = 0;
            s->stable ^= bit;
            s->changes++;
        }
    }
    s->raw_last = raw;
}
