#ifndef TEST_PICO_PIO_H
#define TEST_PICO_PIO_H
#include <stdbool.h>
#include <stdint.h>
#include "hardware/i2c.h"  /* shared test-only uint typedef */

typedef struct {
    volatile uint32_t txf[4];
} pio_hw_t;
typedef pio_hw_t *PIO;
extern PIO pio0;
struct pio_program { uint8_t length; };

typedef struct {
    uint sideset_pin;
    bool shift_right;
    bool autopull;
    uint pull_threshold;
    uint fifo_join;
    float clkdiv;
} pio_sm_config;
#define PIO_FIFO_JOIN_TX 1u
#define GPIO_OVERRIDE_NORMAL 0u
#define GPIO_OVERRIDE_INVERT 1u

bool pio_can_add_program(PIO pio, const struct pio_program *program);
uint pio_add_program(PIO pio, const struct pio_program *program);
uint pio_claim_unused_sm(PIO pio, bool required);
void pio_gpio_init(PIO pio, uint pin);
void pio_sm_set_consecutive_pindirs(PIO pio, uint sm, uint pin, uint n, bool out);
void sm_config_set_sideset_pins(pio_sm_config *c, uint pin);
void sm_config_set_out_shift(pio_sm_config *c, bool shift_right, bool autopull, uint threshold);
void sm_config_set_fifo_join(pio_sm_config *c, uint join);
void sm_config_set_clkdiv(pio_sm_config *c, float div);
void pio_sm_init(PIO pio, uint sm, uint offset, const pio_sm_config *c);
void pio_sm_set_enabled(PIO pio, uint sm, bool enabled);
bool pio_sm_is_tx_fifo_empty(PIO pio, uint sm);
uint pio_get_dreq(PIO pio, uint sm, bool is_tx);
void gpio_set_oeover(uint pin, uint value);
void gpio_set_outover(uint pin, uint value);
#endif
