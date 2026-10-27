/*
 * crc.c — CRC-16/CCITT-FALSE (frames) and CRC-32/IEEE (config blob).
 *
 * Both are the standard, widely documented variants. Spelled out here rather
 * than pulled from a library so the host implementation can be checked against
 * them bit for bit — see host/tests/test_protocol.mjs.
 */
#include "protocol.h"

uint16_t crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = CRC16_INIT;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);
        for (int b = 0; b < 8; b++) {
            if (crc & 0x8000u) {
                crc = (uint16_t)((crc << 1) ^ CRC16_POLY);
            } else {
                crc = (uint16_t)(crc << 1);
            }
        }
    }
    return crc;
}

uint32_t crc32_ieee(const uint8_t *data, size_t len) {
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            /* Reflected algorithm: shift right, xor with reversed polynomial. */
            uint32_t mask = (uint32_t)(-(int32_t)(crc & 1u));
            crc = (crc >> 1) ^ (0xEDB88320u & mask);
        }
    }
    return crc ^ 0xFFFFFFFFu;
}
