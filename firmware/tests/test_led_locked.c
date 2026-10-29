/* Compile the REAL target driver with LED output gated off, not LEDS_NO_HW.
 * A software gate is not a power switch or a boot/reset guarantee; this test
 * only proves the post-initialisation GPIO behavior and absence of PIO/DMA. */
#include <assert.h>
#include <stdio.h>

#include "board.h"
#include "leds.h"
#include "pico/stdlib.h"

#if BOARD_LED_OUTPUT_ENABLED
#error "locked driver test must be built with BOARD_LED_OUTPUT_ENABLED=0"
#endif

static unsigned init_calls, put_calls, dir_calls;
static bool low_latch, output_enabled;

void gpio_init(uint pin) {
    assert(pin == BOARD_LED_PIN);
    assert(!init_calls && !put_calls && !dir_calls);
    init_calls++;
}
void gpio_put(uint pin, bool value) {
    assert(pin == BOARD_LED_PIN && !value);
    assert(init_calls);
    if (!put_calls) assert(!output_enabled); /* initial latch LOW before OE */
    low_latch = true;
    put_calls++;
}
void gpio_set_dir(uint pin, bool out) {
    assert(pin == BOARD_LED_PIN && out && init_calls && low_latch);
    output_enabled = true;
    dir_calls++;
}

int main(void) {
    led_frame_t bright = {.count = CFG_LED_COUNT};
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        bright.px[i].r = bright.px[i].g = bright.px[i].b = 255;
    }
    led_hw_show(&bright);
    assert(!init_calls && !put_calls && !dir_calls);

    led_hw_init();
    assert(init_calls == 1 && put_calls == 1 && dir_calls == 1);
    assert(output_enabled && low_latch);
    led_hw_show(&bright); /* even full-white requests must not toggle data */
    assert(put_calls == 1);
    led_hw_blank();
    assert(put_calls == 2 && low_latch);

    uint8_t rgb[CFG_LED_COUNT * 3];
    for (unsigned i = 0; i < sizeof(rgb); i++) rgb[i] = 255;
    led_host_test_override(rgb, 123);
    assert(!led_host_test_active(123));
    assert(!led_host_test_active(100000));
    puts("LED default gate: GP10 LOW after init, no PIO/DMA, bright/raw requests inert: OK");
    return 0;
}
