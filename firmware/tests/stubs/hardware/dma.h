#ifndef TEST_PICO_DMA_H
#define TEST_PICO_DMA_H
#include <stdbool.h>
#include <stdint.h>
#include "hardware/pio.h"

typedef struct {
    uint size;
    bool read_increment;
    bool write_increment;
    uint dreq;
} dma_channel_config;
#define DMA_SIZE_32 32u

int dma_claim_unused_channel(bool required);
dma_channel_config dma_channel_get_default_config(uint channel);
void channel_config_set_transfer_data_size(dma_channel_config *c, uint size);
void channel_config_set_read_increment(dma_channel_config *c, bool inc);
void channel_config_set_write_increment(dma_channel_config *c, bool inc);
void channel_config_set_dreq(dma_channel_config *c, uint dreq);
void dma_channel_configure(uint channel, const dma_channel_config *c,
                           volatile void *write_addr, const void *read_addr,
                           uint count, bool start);
void dma_channel_wait_for_finish_blocking(uint channel);
void dma_channel_set_read_addr(uint channel, const void *read_addr, bool trigger);
#endif
