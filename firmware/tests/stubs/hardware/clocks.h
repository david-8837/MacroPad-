#ifndef TEST_PICO_CLOCKS_H
#define TEST_PICO_CLOCKS_H
#include <stdint.h>
#define clk_sys 0
uint32_t clock_get_hz(int clock_index);
#endif
