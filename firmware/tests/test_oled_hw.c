/* SDK-free fake I2C: exercises the real SSD1306 init/flush/error path. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "board.h"
#include "oled.h"
#include "hardware/i2c.h"
#include "pico/stdlib.h"

static i2c_inst_t i2c0_value = {0}, i2c1_value = {1};
i2c_inst_t *i2c0 = &i2c0_value;
i2c_inst_t *i2c1 = &i2c1_value;
static uint32_t speed;
static uint32_t gpio_pins, gpio_pulls;
static int calls, fail_at;
static uint8_t captured[32][OLED_FRAME_W + 1];
static size_t sizes[32];
uint i2c_init(i2c_inst_t *bus, uint baudrate) {
    assert(bus == i2c0);
    speed = baudrate;
    return baudrate;
}
void gpio_set_function(uint pin, uint fn) {
    assert(fn == GPIO_FUNC_I2C);
    gpio_pins |= 1u << pin;
}
void gpio_pull_up(uint pin) { gpio_pulls |= 1u << pin; }
int i2c_write_timeout_us(i2c_inst_t *bus, uint8_t addr, const uint8_t *data,
                         size_t len, bool nostop, uint timeout_us) {
    assert(bus == i2c0);
    assert(addr == 0x3C);
    assert(!nostop);
    assert(timeout_us > 0 && timeout_us <= 20000);
    assert(len <= sizeof(captured[0]));
    assert(calls < 32);
    memcpy(captured[calls], data, len);
    sizes[calls] = len;
    ++calls;
    return calls == fail_at ? -1 : (int)len;
}

int main(void) {
    assert(BOARD_OLED_PRESENT == 1);
    fail_at = 1;
    assert(!oled_hw_init()); /* NACK must not advertise an OLED */
    assert(!oled_hw_present());
    oled_canvas_t frame;
    oled_fill(&frame, 1);
    oled_flush(&frame);
    assert(calls == 1); /* never write frame data to an absent module */

    fail_at = 0;
    calls = 0;
    assert(oled_hw_init());
    assert(oled_hw_present());
    assert(speed == 400000);
    assert((gpio_pins & ((1u << 28) | (1u << 29))) == ((1u << 28) | (1u << 29)));
    assert((gpio_pulls & ((1u << 28) | (1u << 29))) == ((1u << 28) | (1u << 29)));
    assert(calls == 1 && captured[0][0] == 0x00);
    assert(memcmp(captured[0] + 1, (const uint8_t[]){0xAE, 0xD5, 0x80, 0xA8, 0x1F}, 5) == 0);
    assert(captured[0][sizes[0] - 1] == 0xAF);

    for (unsigned i = 0; i < OLED_FRAME_BYTES; ++i) frame.fb[i] = (uint8_t)i;
    calls = 0;
    oled_flush(&frame);
    assert(calls == 5);
    assert(sizes[0] == 7);
    assert(memcmp(captured[0], (const uint8_t[]){0x00, 0x21, 0, 127, 0x22, 0, 3}, 7) == 0);
    for (unsigned page = 0; page < OLED_FRAME_PAGES; ++page) {
        assert(sizes[page + 1] == OLED_FRAME_W + 1);
        assert(captured[page + 1][0] == 0x40);
        assert(memcmp(captured[page + 1] + 1, frame.fb + page * OLED_FRAME_W, OLED_FRAME_W) == 0);
    }
    calls = 0;
    oled_set_contrast(100);
    oled_set_inverted(1);
    assert(calls == 2);
    assert(memcmp(captured[0], (const uint8_t[]){0x00, 0x81, 100}, 3) == 0);
    assert(memcmp(captured[1], (const uint8_t[]){0x00, 0xA7}, 2) == 0);

    calls = 0;
    fail_at = 3; /* NACK the second page: stop immediately and withdraw capability */
    oled_flush(&frame);
    assert(calls == 3 && !oled_hw_present());
    oled_flush(&frame);
    assert(calls == 3);
    fail_at = 0;
    assert(oled_hw_init()); /* recovery re-sends the complete init sequence */
    assert(oled_hw_present());
    puts("SSD1306 I2C init, page order, NACK and recovery: OK");
    return 0;
}
