#ifndef OLED_RUNTIME_H
#define OLED_RUNTIME_H
#include <stdint.h>
#include "oled.h"
/* Real offline screens for modes that otherwise need PC values. Decorative
 * modes blit their baked frames. Live host frames can override runtime modes. */
void oled_render_local(oled_canvas_t *c, uint8_t mode, uint32_t now_ms, uint8_t channel);
/* Transient feedback when the pad changes layers, even with the PC unplugged. */
void oled_render_layer_overlay(oled_canvas_t *c, uint8_t channel);
#endif
