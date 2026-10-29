#ifndef TEST_PICO_I2C_H
#define TEST_PICO_I2C_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
typedef unsigned int uint;
typedef struct { int index; } i2c_inst_t;
extern i2c_inst_t *i2c0;
extern i2c_inst_t *i2c1;
uint i2c_init(i2c_inst_t *i2c, uint baudrate);
int i2c_write_timeout_us(i2c_inst_t *i2c, uint8_t addr, const uint8_t *data,
                         size_t len, bool nostop, uint timeout_us);
#endif
