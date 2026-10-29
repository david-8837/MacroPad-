/* Exercise production leds.c AND the actual % c-sdk block from the .pio file.
 * Fake DMA deliberately waits to copy its source until the next show/blank:
 * packing into the buffer before waiting would corrupt an in-flight frame.
 * No scope, pioasm or physical LED is involved in this host test. */
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "board.h"
#include "leds.h"
#include "hardware/clocks.h"
#include "hardware/dma.h"
#include "hardware/pio.h"
#include "pico/stdlib.h"

static pio_hw_t pio_regs;
PIO pio0 = &pio_regs;
static bool program_available, sm_enabled;
static uint oe_override = 99, out_override = 99;
static uint init_pin, pio_sm, pio_offset;
static pio_sm_config sm_cfg;
static bool sm_dir_output;
static dma_channel_config dma_cfg;
static bool dma_configured, dma_active;
static const uint32_t *dma_src;
static uint dma_count, completed_frames;
static uint32_t captured[4][CFG_LED_COUNT];
static unsigned fifo_checks, latch_waits;
static uint64_t last_latch_us;

uint32_t clock_get_hz(int clock_index) {
    assert(clock_index == clk_sys);
    return BOARD_SYS_CLOCK_KHZ * 1000u;
}
bool pio_can_add_program(PIO p, const struct pio_program *program) {
    assert(p == pio0 && program);
    return program_available;
}
uint pio_add_program(PIO p, const struct pio_program *program) {
    assert(p == pio0 && program && program_available);
    return 4;
}
uint pio_claim_unused_sm(PIO p, bool required) {
    assert(p == pio0 && required);
    return 1;
}
void pio_gpio_init(PIO p, uint pin) {
    assert(p == pio0);
    init_pin = pin;
}
void pio_sm_set_consecutive_pindirs(PIO p, uint sm, uint pin, uint n, bool out) {
    assert(p == pio0 && sm == 1 && pin == BOARD_LED_PIN && n == 1);
    sm_dir_output = out;
}
void sm_config_set_sideset_pins(pio_sm_config *c, uint pin) { c->sideset_pin = pin; }
void sm_config_set_out_shift(pio_sm_config *c, bool right, bool autopull, uint threshold) {
    c->shift_right = right;
    c->autopull = autopull;
    c->pull_threshold = threshold;
}
void sm_config_set_fifo_join(pio_sm_config *c, uint join) { c->fifo_join = join; }
void sm_config_set_clkdiv(pio_sm_config *c, float div) { c->clkdiv = div; }
void pio_sm_init(PIO p, uint sm, uint offset, const pio_sm_config *c) {
    assert(p == pio0 && sm == 1 && offset == 4 && c);
    pio_sm = sm;
    pio_offset = offset;
    sm_cfg = *c;
}
void pio_sm_set_enabled(PIO p, uint sm, bool enabled) {
    assert(p == pio0 && sm == 1 && enabled);
    assert(oe_override == GPIO_OVERRIDE_NORMAL && out_override == GPIO_OVERRIDE_NORMAL);
    sm_enabled = true;
}
bool pio_sm_is_tx_fifo_empty(PIO p, uint sm) {
    assert(p == pio0 && sm == 1 && sm_enabled && !dma_active);
    fifo_checks++;
    return true; /* all pending words are in the fake OSR */
}
uint pio_get_dreq(PIO p, uint sm, bool is_tx) {
    assert(p == pio0 && sm == 1 && is_tx);
    return 123;
}
void gpio_set_oeover(uint pin, uint value) {
    assert(pin == BOARD_LED_PIN);
    oe_override = value;
}
void gpio_set_outover(uint pin, uint value) {
    assert(pin == BOARD_LED_PIN);
    out_override = value;
}

int dma_claim_unused_channel(bool required) { assert(required); return 2; }
dma_channel_config dma_channel_get_default_config(uint channel) {
    assert(channel == 2);
    dma_channel_config c = {0};
    return c;
}
void channel_config_set_transfer_data_size(dma_channel_config *c, uint size) { c->size = size; }
void channel_config_set_read_increment(dma_channel_config *c, bool inc) { c->read_increment = inc; }
void channel_config_set_write_increment(dma_channel_config *c, bool inc) { c->write_increment = inc; }
void channel_config_set_dreq(dma_channel_config *c, uint dreq) { c->dreq = dreq; }
void dma_channel_configure(uint channel, const dma_channel_config *c,
                           volatile void *write_addr, const void *read_addr,
                           uint count, bool start) {
    assert(channel == 2 && c && write_addr == &pio_regs.txf[1]);
    assert(read_addr && count == CFG_LED_COUNT && !start);
    dma_configured = true;
    dma_cfg = *c;
    dma_src = read_addr;
    dma_count = count;
}
void dma_channel_wait_for_finish_blocking(uint channel) {
    assert(channel == 2 && dma_configured && dma_active);
    assert(completed_frames < 4);
    memcpy(captured[completed_frames++], dma_src, dma_count * sizeof(uint32_t));
    dma_active = false;
}
void dma_channel_set_read_addr(uint channel, const void *read_addr, bool trigger) {
    assert(channel == 2 && dma_configured && !dma_active && trigger);
    assert(read_addr);
    dma_src = read_addr;
    dma_active = true; /* fake DMA holds the buffer until the next wait */
}
void busy_wait_us(uint64_t delay_us) {
    assert(!dma_active && fifo_checks > latch_waits);
    last_latch_us = delay_us;
    latch_waits++;
}
void tight_loop_contents(void) { /* FIFO is immediately empty in the fake. */ }

int main(void) {
    led_frame_t f1 = {.count = CFG_LED_COUNT};
    led_frame_t f2 = {.count = CFG_LED_COUNT};
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        f1.px[i].r = (uint8_t)(i + 1);
        f1.px[i].g = (uint8_t)(0x80 + i);
        f1.px[i].b = (uint8_t)(0x40 + i);
        f2.px[i].r = (uint8_t)(0xE0 + i);
        f2.px[i].g = (uint8_t)(0x30 + i);
        f2.px[i].b = (uint8_t)(0x10 + i);
    }

    /* Failure to allocate the PIO program must not launch a DMA or touch pin. */
    led_hw_init();
    led_hw_show(&f1);
    led_hw_blank();
    assert(!sm_enabled && !dma_configured && !dma_active);

    program_available = true;
    led_hw_init();
    assert(sm_enabled && sm_dir_output && init_pin == BOARD_LED_PIN);
    assert(pio_sm == 1 && pio_offset == 4 && sm_cfg.sideset_pin == BOARD_LED_PIN);
    assert(oe_override == GPIO_OVERRIDE_NORMAL && out_override == GPIO_OVERRIDE_NORMAL);
    assert(!sm_cfg.shift_right && sm_cfg.autopull && sm_cfg.pull_threshold == 24);
    assert(sm_cfg.fifo_join == PIO_FIFO_JOIN_TX);
    const float expected_div = (float)clock_get_hz(clk_sys) / 10000000.0f;
    assert(sm_cfg.clkdiv > expected_div - 0.001f && sm_cfg.clkdiv < expected_div + 0.001f);
    assert(dma_cfg.size == DMA_SIZE_32 && dma_cfg.read_increment && !dma_cfg.write_increment);
    assert(dma_cfg.dreq == 123 && dma_count == CFG_LED_COUNT);

    led_hw_show(&f1);
    assert(dma_active && completed_frames == 0 && latch_waits == 0);
    led_hw_show(&f2); /* first DMA must finish BEFORE f2 overwrites its source */
    assert(dma_active && completed_frames == 1 && latch_waits == 1);
    assert(last_latch_us >= 113); /* ceil(24 * 1.30 us) + strictly >80 us */
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        uint32_t a = captured[0][i];
        assert(a == ((uint32_t)f1.px[i].g << 24 | (uint32_t)f1.px[i].r << 16 |
                     (uint32_t)f1.px[i].b << 8));
        /* The first bits clocked from the 32-bit OSR are G7..G0, then R, B. */
        assert((a >> 24) == f1.px[i].g);
        assert(((a >> 16) & 0xffu) == f1.px[i].r);
        assert(((a >> 8) & 0xffu) == f1.px[i].b);
        assert((a & 0xffu) == 0);
        uint32_t transmitted = 0;
        for (int bit = 31; bit >= 8; bit--) {
            transmitted = (transmitted << 1) | ((a >> bit) & 1u);
        }
        assert(transmitted == ((uint32_t)f1.px[i].g << 16 |
                               (uint32_t)f1.px[i].r << 8 | f1.px[i].b));
    }
    led_hw_blank(); /* second DMA finishes before s_dma_buf is zeroed */
    assert(completed_frames == 2 && latch_waits == 2);
    for (int i = 0; i < CFG_LED_COUNT; i++) {
        assert(captured[1][i] == led_pack_pio_word(f2.px[i].r, f2.px[i].g, f2.px[i].b));
    }
    led_hw_show(&f1); /* the blank frame should have sent nine ZERO words */
    assert(completed_frames == 3 && latch_waits == 3);
    for (int i = 0; i < CFG_LED_COUNT; i++) assert(captured[2][i] == 0);
    puts("LED PIO init, GPIO polarity, DMA packing, buffer lifetime and reset guard: OK");
    return 0;
}
