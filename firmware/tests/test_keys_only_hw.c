/* Compile target branches with no GPIO/I2C implementations linked: any hardware
 * call from these entry points is a link error, not just a simulated success. */
#include <assert.h>
#include <stdio.h>
#include "board.h"
#include "leds.h"
#include "oled.h"

int main(void) {
    assert(BOARD_KEYS_ONLY && !BOARD_OLED_PRESENT && !BOARD_LED_OUTPUT_ENABLED);
    led_frame_t frame = {0};
    oled_canvas_t canvas = {0};
    led_hw_init();
    led_hw_show(&frame);
    led_hw_blank();
    assert(!oled_hw_init());
    assert(!oled_hw_present());
    oled_set_contrast(255);
    oled_set_inverted(1);
    oled_flush(&canvas);
    puts("keys-only target drivers: no GPIO, PIO, DMA or I2C calls");
    return 0;
}
