import type { Lighting } from '../../host/protocol/mpad3-protocol.mjs';
import type { LightingConfig } from '../lighting/engine';
import { LED_COUNT } from '../lighting/engine';

/** The codec expects nine RGB triples, not 27 flat bytes. */
export function lightingToWire(cfg: LightingConfig): Lighting {
  return {
    mode: cfg.mode,
    brightness: cfg.brightness,
    speed: cfg.speed,
    r: cfg.r,
    g: cfg.g,
    b: cfg.b,
    perKeyMask: cfg.perKeyMask,
    perKey: cfg.perKey.map(([r, g, b]) => [r, g, b] as [number, number, number]),
  } as Lighting;
}

export function lightingFromWire(wire: Lighting): Partial<LightingConfig> {
  const perKey: Array<[number, number, number]> = Array.from({ length: LED_COUNT }, (_, i) => {
    const color = wire.perKey[i];
    return [color?.[0] ?? 0, color?.[1] ?? 0, color?.[2] ?? 0];
  });
  return {
    mode: wire.mode,
    brightness: wire.brightness,
    speed: wire.speed,
    r: wire.r,
    g: wire.g,
    b: wire.b,
    perKey,
  };
}
