#ifndef TEST_PICO_STDLIB_H
#define TEST_PICO_STDLIB_H
#include "hardware/i2c.h"
#define GPIO_FUNC_I2C 3
#define GPIO_OUT 1u
void gpio_init(uint gpio);
void gpio_put(uint gpio, bool value);
void gpio_set_dir(uint gpio, bool out);
void gpio_set_function(uint gpio, uint fn);
void gpio_pull_up(uint gpio);
void busy_wait_us(uint64_t delay_us);
void sleep_ms(uint32_t delay_ms);
void tight_loop_contents(void);
#endif
