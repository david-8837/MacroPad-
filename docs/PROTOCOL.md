# mpad3 wire protocol

> **Generated** by `tools/gen_protocol.py` from `host/protocol/protocol.json`.
> Edit the spec, not this file.

Protocol version **3**, config format version **3**. All integers little-endian.

The transport is USB CDC (a serial port). The device enumerates as a composite of three interfaces — HID keyboard, HID consumer, and the CDC port this protocol runs on — so the pad works as a keyboard with nothing installed, and the configurator is optional.

## Frame

```
offset  size  field
──────  ────  ─────────────────────────────────────────────
0       1     sof0   0xA5
1       1     sof1   0x5A
2       1     cmd
3       2     len   payload byte count, little endian, 0..512
5       1     version
6       len   payload
6+len   2     crc16   CRC-16/CCITT-FALSE over cmd..payload, little endian
```

**CRC-16/CCITT-FALSE** — poly `0x1021`, init `0xFFFF`, no reflection, no final xor. Check value for `"123456789"` is `0x29B1`. It covers bytes [2 .. 6+len) i.e. cmd, len, version, payload.

The SOF bytes are *not* covered. They exist only so a receiver that has lost track can hunt for the next frame; including them in the CRC would make a corrupt SOF indistinguishable from a corrupt payload and complicate recovery for no gain.

**Resynchronisation.** The parser is a byte-at-a-time state machine. Any malformed frame — bad SOF, length over the MTU, wrong version, bad CRC — is discarded and the parser hunts for the next `A5 5A`. One noisy byte costs one command, never a replug. A wrong *version* is reported separately from corruption, after the payload has been consumed, so it cannot desynchronise the stream.

## Commands

| ID | Name | Direction | Payload | Reply |
|----|------|-----------|---------|-------|
| `0x00` | **PING** | host → | — | `PONG` |
| `0x01` | **GET_INFO** | host → | — | `INFO` |
| `0x02` | **GET_CONFIG** | host → | `chunkIndex:u8` | `CONFIG_CHUNK` |
| `0x03` | **SET_CONFIG** | host → | `configChunk` | `SET_ACK on the final chunk only` |
| `0x04` | **RESET_CONFIG** | host → | — | `SET_ACK` |
| `0x05` | **COMMIT** | host → | — | `COMMIT_ACK` |
| `0x06` | **GET_CHANNEL** | host → | — | `CHANNEL` |
| `0x07` | **SET_CHANNEL** | host → | `channelIndex:u8` | `SET_ACK` |
| `0x08` | **GET_LIGHTING** | host → | `channelIndex:u8` | `LIGHTING` |
| `0x09` | **SET_LIGHTING** | host → | `channelIndex + lighting` | `SET_ACK` |
| `0x0A` | **PREVIEW_LIGHTING** | host → | `channelIndex + lighting` | `SET_ACK` |
| `0x0B` | **LED_TEST** | host → | `rawRgb24` | `SET_ACK` |
| `0x0C` | **OLED_FRAME** | host → | `oledFrameChunk` | `OLED_FRAME_ACK on chunk 1 only` |
| `0x0D` | **GET_OLED_STATE** | host → | — | `OLED_STATE` |
| `0x0E` | **SET_OLED_MODE** | host → | `oledModeIndex` | `OLED_STATE` |
| `0x80` | **PONG** | device → | — | — |
| `0x81` | **INFO** | device → | `info` | — |
| `0x82` | **CONFIG_CHUNK** | device → | `configChunk` | — |
| `0x83` | **SET_ACK** | device → | `status` | — |
| `0x85` | **COMMIT_ACK** | device → | `status` | — |
| `0x86` | **CHANNEL** | device → | `channelIndex` | — |
| `0x88` | **LIGHTING** | device → | `channelIndex + lighting` | — |
| `0x8C` | **OLED_FRAME_ACK** | device → | `oledFrameAck` | — |
| `0x8D` | **OLED_STATE** | device → | `oledState` | — |
| `0xC0` | **KEY_EVENT** | device → | `keyEvent` | — |
| `0xC1` | **OLED_MODE_EVENT** | device → | `oledState` | — |
| `0xFE` | **BOOTLOADER** | host → | — | `SET_ACK then the device reboots into BOOTSEL` |
| `0xFF` | **ERROR** | device → | `status` | — |

- **PING** (`0x00`) — handshake; also proves the cable and the CDC interface are alive
- **GET_CONFIG** (`0x02`) — one request per chunk; chunkIndex must be 0..chunkCount-1
- **SET_CONFIG** (`0x03`) — streamed in order from chunk 0; applied to RAM on completion, written to flash only on COMMIT
- **RESET_CONFIG** (`0x04`) — factory defaults, written to flash immediately
- **COMMIT** (`0x05`) — write the staged RAM config to flash. Blocks ~50 ms during the erase.
- **SET_CHANNEL** (`0x07`) — out-of-range is refused with ERROR/BAD_ARG, not wrapped
- **SET_LIGHTING** (`0x09`) — marks config dirty for COMMIT even when physical LED drive is disabled; saved settings alone do not imply illuminated or current-approved hardware
- **PREVIEW_LIGHTING** (`0x0A`) — volatile preview only when CAP_LED_OUTPUT is advertised; otherwise ERROR/LED_DISABLED without changing lighting. CAP_LED_OUTPUT is a bench compile flag, not a current or safety certification
- **LED_TEST** (`0x0B`) — bench-only 9 x 3 exact RGB bytes, accepted only when CAP_LED_OUTPUT; otherwise ERROR/LED_DISABLED. Even when enabled it bypasses brightness and gamma and auto-expires after 300 ms; use a current-limited bench supply, not an unchecked USB rail
- **OLED_FRAME** (`0x0C`) — Exactly two 265-byte payloads (index 0 then 1). The first half never replies; the final half alone yields a three-byte OLED_FRAME_ACK or one application ERROR. Parser-corrupt OLED packets have no reply and time out. A full-frame CRC-32 and per-packet framing CRC-16 prevent partial or mixed pixels. Baked screens reject frames.
- **GET_OLED_STATE** (`0x0D`) — Read current physical screen and mode epoch after handshake; do not assume saved boot mode is the active mode.
- **SET_OLED_MODE** (`0x0E`) — Select a physical screen (0..11); starts full dwell; rejected when no SSD1306 ACK; reply includes mode and epoch. Not a flash write.
- **OLED_FRAME_ACK** (`0x8C`) — Only after BOTH halves and the full-frame CRC pass; acknowledges seq and mode.
- **KEY_EVENT** (`0xC0`) — streamed unsolicited when global.usbReportEvents is 1
- **OLED_MODE_EVENT** (`0xC1`) — Unsolicited on actual physical mode change (manual, OLED_NEXT, auto timer, or host selection); coalesced under congestion, independent of KEY_EVENT setting.

## Volatile OLED runtime transport

Version 2 added volatile OLED frame streaming; version 3 adds the fail-closed LED output capability and LED_DISABLED status. The saved config format remains version 3 (2,272 bytes). The host must verify PING/INFO plus CAP_OLED and CAP_OLED_STREAM before streaming. CAP_OLED_STREAM is advertised only while the SSD1306 ACKs at 0x3C. Older protocol-v1/v2 firmware is not compatible with this v3 app; update app and firmware together.

After handshake the app requests GET_OLED_STATE: [mode:u8, epoch:u16 LE]. OLED_MODE_EVENT (0xC1) carries the same payload whenever the physical playlist changes by timer, gesture, legacy text or host selection. Unlike OLED_STATE (0x8D), the unsolicited event cannot steal a pending reply. Epochs compare modulo 65536; stale events are ignored. The host does **not** send a mode command back in response to a device event, so the autonomous dwell is not restarted. SET_OLED_MODE selects a screen immediately and replies with OLED_STATE; only an explicit config Save persists its boot selection.

A runtime 128x32 frame is **512 bytes** in SSD1306 page order: byte page*128+x, bit y&7. The host sends two OLED_FRAME packets (265-byte payload each): seq:u16 LE, mode:u8, index:u8 (0 then 1), count:u8 (always 2), full-frame CRC-32/IEEE:u32 LE, pages[256]. Both have the ordinary MPAD3 CRC-16. Firmware bounds the first-half stage to 350 ms, checks current runtime mode and the full-frame CRC, then atomically publishes all 512 bytes and ACKs [seq:u16 LE, mode:u8]. No flash writes. If a packet is corrupt or an ACK is absent, the host skips/backoffs; it never reports a completed physical frame without the final ACK.

The host renders at **most 5 complete frames/second**, on a timer independent of the canvas preview or drawer visibility. Browsers can throttle a suspended tab; in that case the pad falls back offline. Frames are low priority: they do not queue behind a config/lighting request, and a user Save/mode selection waits for a short current stream slot. The pad locally plays all seven baked animations even with a PC attached. A layer-change overlay temporarily wins over live pixels. If complete frames stop, the last expires after **1,200 ms**, then the next 200-ms runtime refresh draws the truthful local fallback (uptime rather than fabricated wall time, -- for unknown metrics, NO MEDIA). On disconnect the host producer stops and no pixel data survives reboot.

Clock uses the connected PC wall clock; telemetry and media use the desktop OS integrations when available. Missing native data renders --/NO MEDIA, not invented readings. Custom labels stay stored on the PC, but are included in volatile Deck Status pixels while the app is connected. Source/fake-CDC tests are not proof of assembled-pad performance or a bootable UF2.

## Structures

### `action` — 40 bytes

One binding slot. Fixed size so the whole config stays flat and memcpy-able; the 4 trailing pad bytes are spare room for a parameter without a format bump.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 1 | `type` | see [actionType](#actiontype) |
| 1 | 1 | `flags` | see [actionFlag](#actionflag) ORed bitmask |
| 2 | 2 | `code` | KEYCODE: (modifiers << 8) | HID usage, so one slot sends Ctrl+C; MEDIA: consumer usage; CHANNEL: channel index; LED_MODE: ledMode; LED_BRIGHT: 0-255. Meaning depends on type. |
| 4 | 32 | `text` | NUL-terminated; only meaningful for TEXT and WEBHOOK. Validation rejects an unterminated one. |
| 36 | 4 | `pad` |  |

### `lighting` — 40 bytes

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 1 | `mode` | see [ledMode](#ledmode) |
| 1 | 1 | `brightness` |  |
| 2 | 1 | `speed` |  |
| 3 | 1 | `r` |  |
| 4 | 1 | `g` |  |
| 5 | 1 | `b` |  |
| 6 | 1 | `pad0` |  |
| 7 | 2 | `perKeyMask` | bit n set -> perKey[n] is used for key n instead of the base colour |
| 9 | 27 | `perKey` | 9 x RGB |
| 36 | 4 | `pad` |  |

### `channel` — 560 bytes

One complete page: 9 key bindings, 4 knob bindings, and that page's lighting.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 360 | `keys` | key index = position on the pad, left-to-right then top-to-bottom |
| 360 | 40 | `knobCw` |  |
| 400 | 40 | `knobCcw` |  |
| 440 | 40 | `knobTap` |  |
| 480 | 40 | `knobHold` | defaults to CHANNEL_NEXT, i.e. the page switch. It is a normal slot, so you CAN repoint it — and then you lose the only hardware way to change page. |
| 520 | 40 | `lighting` |  |

### `global` — 20 bytes

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 2 | `holdMs` | default `300`. |
| 2 | 2 | `doubleTapMs` | default `0`. 0 means double-tap is disabled, which makes a single tap fire on release with zero added latency. Do not set this to a non-zero value unless you actually bind a double tap: it delays every ordinary tap by that many milliseconds. |
| 4 | 2 | `knobHoldMs` | default `500`. |
| 6 | 2 | `knobIdleMs` | default `40`. how long the knob must be still before a sub-batch rotation is delivered |
| 8 | 1 | `knobBatch` | default `4`. detents accumulated before one rotation event is emitted |
| 9 | 1 | `holdRepeatMs` | default `40`. |
| 10 | 1 | `bootChannel` | default `0`. |
| 11 | 1 | `ledInvertOutput` | default `1`. legacy stored byte retained at default 1 for config compatibility; LED GPIO output-enable and data now always drive normally through the non-inverting 74AHCT1G125. This byte is ignored by the driver and must not be used to fix wiring |
| 12 | 1 | `usbReportEvents` | default `1`. |
| 13 | 1 | `oledAutoCycleS` | default `30`. seconds each screen stays up before the panel rotates; 0 disables rotation. The panel has no touchscreen, so this timer is the default way it changes. |
| 14 | 2 | `oledPlaylist` | default `0`. bit i = screen i in the rotation, in OLED_MODES order; 0 means every screen, which is what a config saved before this field existed reads as. |
| 16 | 1 | `oledBootMode` | default `0`. catalogue mode index to show on power-up (0..11) |
| 17 | 1 | `oledContrast` | default `143`. SSD1306 contrast register (0..255) |
| 18 | 1 | `oledInverted` | default `0`. SSD1306 inverse pixels when 1 |
| 19 | 1 | `oledPad` | default `0`. reserved; must be zero |

### `config` — 2272 bytes

The v3 saved configuration streamed by SET_CONFIG. On boot firmware validates both CRCs of any older v2 A/B sectors, chooses the newest valid sequence and migrates into the other slot without erasing bindings; the host serial probe requires the matching v3 format before any write.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 4 | `magic` | always `0x43464733`. |
| 4 | 2 | `version` |  |
| 6 | 2 | `length` | always `2272`. |
| 8 | 20 | `global` |  |
| 28 | 2240 | `channels` |  |
| 2268 | 4 | `crc32` | CRC-32/IEEE over bytes 0..2267 inclusive |

Checksum: **CRC-32/IEEE** over bytes `0..2267` (2268 bytes), stored at offset 2268. Reflected poly `0xEDB88320`, init `0xFFFFFFFF`, xorout `0xFFFFFFFF`; check value for `"123456789"` is `0xCBF43926`.

### `sectorHeader` — 16 bytes

Prepended inside each of the two flash sectors, before the config blob.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 4 | `magic` | always `0x53454331`. |
| 4 | 4 | `seq` | higher wins; this is what makes the A/B ping-pong work |
| 8 | 4 | `blobCrc` |  |
| 12 | 4 | `hdrCrc` | CRC-32 over the 12 bytes above |

### `oledFrameChunk` — 265 bytes

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 2 | `seq` | serial number modulo 65536; newer than last completed frame |
| 2 | 1 | `mode` | actual active runtime catalogue index; never baked |
| 3 | 1 | `index` | chunk 0 followed by chunk 1 (no interleaving) |
| 4 | 1 | `count` | always 2 |
| 5 | 4 | `crc32` | IEEE CRC-32 of ALL 512 SSD1306 page-order bytes |
| 9 | 256 | `pages` | 256 bytes: first or second half of 4 pages x 128 columns |

### `oledState` — 3 bytes

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 1 | `mode` |  |
| 1 | 2 | `epoch` | increments on actual screen changes; compare modulo 65536; no request ID |

## Payloads

### `info` — 16 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `magic` | `u32` |  |
| 4 | `protocolVersion` | `u16` |  |
| 6 | `configVersion` | `u16` |  |
| 8 | `channels` | `u8` |  |
| 9 | `keys` | `u8` |  |
| 10 | `leds` | `u8` |  |
| 11 | `capabilities` | `u8` | CAP_EVENTS means KEY_EVENT support even if global.usbReportEvents=0; read GET_CONFIG for the current stream setting. |
| 12 | `configSize` | `u16` |  |
| 14 | `firmwareBuild` | `u16` |  |

### `configChunk` — 4 + n bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `index` | `u8` |  |
| 1 | `count` | `u8` |  |
| 2 | `n` | `u16` | byte count in this chunk; the last chunk is short |
| 4 | `bytes` | `bytes`[n] |  |

### `status` — 1 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `code` | `u8` |  |

### `channelIndex` — 1 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `index` | `u8` |  |

### `rawRgb24` — 27 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `rgb` | `bytes`[27] | 9 LEDs x 3 bytes, in R,G,B order (NOT the strip's GRB — the firmware converts) |

### `keyEvent` — 8 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `source` | `u8` |  |
| 1 | `index` | `u8` |  |
| 2 | `event` | `u8` |  |
| 3 | `channel` | `u8` |  |
| 4 | `value` | `i16` | rotation detents; key HOLD_RELEASE: held duration in ms (0 on older firmware, capped at 32767) |
| 6 | `action` | `u16` | actionType that fired, 0 if the slot was empty |

### `oledFrameChunk` — 265 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `seq` | `u16` | serial number modulo 65536; newer than last completed frame |
| 2 | `mode` | `u8` | actual active runtime catalogue index; never baked |
| 3 | `index` | `u8` | chunk 0 followed by chunk 1 (no interleaving) |
| 4 | `count` | `u8` | always 2 |
| 5 | `crc32` | `u32` | IEEE CRC-32 of ALL 512 SSD1306 page-order bytes |
| 9 | `pages` | `bytes`[256] | 256 bytes: first or second half of 4 pages x 128 columns |

### `oledFrameAck` — 3 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `seq` | `u16` |  |
| 2 | `mode` | `u8` |  |

### `oledState` — 3 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `mode` | `u8` |  |
| 1 | `epoch` | `u16` | increments on actual screen changes; compare modulo 65536; no request ID |

### `oledModeIndex` — 1 bytes

| Offset | Field | Type | Notes |
|-------:|-------|------|-------|
| 0 | `mode` | `u8` | catalogue index 0..11; no flash commit |

## Enumerations

### actionType

| Value | Name |
|-------|------|
| `0` | `NONE` |
| `1` | `KEYCODE` |
| `2` | `MODS` |
| `3` | `TEXT` |
| `4` | `MEDIA` |
| `5` | `CHANNEL` |
| `6` | `CHANNEL_NEXT` |
| `7` | `LED_MODE` |
| `8` | `LED_BRIGHT` |
| `9` | `LAYER_HOLD` |
| `10` | `WEBHOOK` |
| `11` | `BOOTLOADER` |
| `12` | `RESET_CONFIG` |
| `13` | `OLED_NEXT` |

### actionFlag

| Value | Name |
|-------|------|
| `0x01` | `HOLD_DOWN` |
| `0x02` | `ON_RELEASE` |
| `0x04` | `REPEAT` |
| `0x08` | `STICKY` |

### ledMode

| Value | Name |
|-------|------|
| `0` | `OFF` |
| `1` | `STATIC` |
| `2` | `PER_KEY` |
| `3` | `BREATH` |
| `4` | `RAINBOW` |
| `5` | `SPECTRUM` |
| `6` | `REACTIVE` |
| `7` | `CHANNEL_TINT` |

### status

| Value | Name |
|-------|------|
| `0` | `OK` |
| `1` | `BAD_CRC` |
| `2` | `BAD_MAGIC` |
| `3` | `BAD_VERSION` |
| `4` | `BAD_LENGTH` |
| `5` | `FLASH_FAIL` |
| `6` | `BUSY` |
| `7` | `UNKNOWN_CMD` |
| `8` | `BAD_ARG` |
| `9` | `LED_DISABLED` |

A malformed frame is reported with the status that says *why*, not a single catch-all. `BAD_CRC` means the frame arrived intact in shape but the checksum did not match, which points at line noise or a byte dropped in transit. `BAD_LENGTH` means the declared payload length could not be satisfied, which points at a truncated write or a host encoder bug. `BAD_VERSION` means the frame was well formed and its `ver` byte is not one this firmware accepts, which points at an app built against a different protocol revision. The three have three different fixes, so an app should surface them differently rather than printing "bad frame".

Bytes that never formed a frame at all are dropped silently while the parser hunts for the `A5 5A` start-of-frame magic. The device does not reply to them: answering garbage would let one line glitch generate a flood of error frames.

### capabilities

| Value | Name |
|-------|------|
| `0x01` | `ENCODER` |
| `0x02` | `OLED` |
| `0x04` | `FLASH` |
| `0x08` | `EVENTS` |
| `0x10` | `OLED_STREAM` |
| `0x20` | `LED_OUTPUT` |

OLED_STREAM is advertised only while a physical SSD1306 ACKs on I2C. A compatible v3 app sends volatile runtime canvases at most 5 Hz, leaving baked loops autonomous. After 1200 ms without a complete frame the device renders its truthful offline screen. A partial frame expires after 350 ms; no frame writes flash.

LED_OUTPUT is advertised only for an explicitly bench-enabled firmware build. It means GPIO/PIO LED data is allowed; it does NOT attest to the actual cuttable strip, 5 V current budget, or electrical safety. Default firmware leaves GP10 LOW after initialization and rejects PREVIEW_LIGHTING/LED_TEST; this does NOT switch off LED 5 V, guarantee boot/reset levels, or clear a previously latched pixel. The strip and LED-only current budget remain unknown.

### eventSource

| Value | Name |
|-------|------|
| `0` | `KEY` |
| `1` | `KNOB` |

### eventKind

| Value | Name |
|-------|------|
| `0` | `NONE` |
| `1` | `PRESS` |
| `2` | `RELEASE` |
| `3` | `TAP` |
| `4` | `HOLD` |
| `5` | `HOLD_RELEASE` |
| `6` | `DOUBLE_TAP` |
| `7` | `ENC_CW` |
| `8` | `ENC_CCW` |
| `9` | `CHANNEL_CHANGE` |

## Physical layout

Key indices, which is also LED indices — LED *n* sits under key *n*, so a per-key effect is a one-line lookup rather than a mapping table.

```
             ┌───────┐
             │ knob  │  encoder A/B/switch; long-press = change channel
   ┌─────────┬─────────┬─────────┐
   │  K0 GP0 │  K1 GP1 │  K2 GP2 │
   ├─────────┼─────────┼─────────┤
   │  K3 GP3 │  K4 GP4 │  K5 GP5 │
   ├─────────┼─────────┼─────────┤
   │  K6 GP6 │ K7 GP11 │ K8 GP12 │
   └─────────┴─────────┴─────────┘
```

**Waveshare RP2040-Zero** — RP2040, dual Cortex-M0+ @ 133 MHz, 264 kB RAM, 2 MB flash.

- Header: 23 on the main castellated header: 5V, GND, 3V3, then 20 GPIO (GP0-GP15 and GP26-GP29).
- GP16 drives the board's own onboard WS2812. GP17-GP25 are on two 5-pin headers on the back and on solder pads, and are unused here.
- Numbering: USB-C up, front/component side facing you, pin 1 = 5V at top-left, counter-clockwise: left column 1-11 top to bottom (5V, GND, 3V3, GP29, GP28, GP27, GP26, GP15, GP14, GP13, GP12), right column 12-23 bottom to top (GP11, GP10, GP9, GP8, GP7, GP6, GP5, GP4, GP3, GP2, GP1, GP0).
- Spare after this map: GP13, GP14, GP15, GP26, GP27. GP28/GP29 carry required OLED I2C; only GP26/GP27 remain free as ADC inputs.
- Saved config lives at 0x1FE000 and 0x1FF000 - the last two 4 KiB sectors of the 2 MB flash.

| Function | GPIO | Header pin | LED |
|----------|-----:|-----------:|----:|
| Key K0 | GP0 | 23 | LED 0 |
| Key K1 | GP1 | 22 | LED 1 |
| Key K2 | GP2 | 21 | LED 2 |
| Key K3 | GP3 | 20 | LED 3 |
| Key K4 | GP4 | 19 | LED 4 |
| Key K5 | GP5 | 18 | LED 5 |
| Key K6 | GP6 | 17 | LED 6 |
| Key K7 | GP11 | 12 | LED 7 |
| Key K8 | GP12 | 11 | LED 8 |
| Encoder A | GP7 | 16 | — |
| Encoder B | GP8 | 15 | — |
| Encoder switch | GP9 | 14 | — |
| LED data | GP10 | 13 | 9 LEDs, GRB |

LED n sits under key n, so the lighting array and the key array are indexed identically. That is a deliberate constraint: any per-key effect becomes a one-line lookup instead of a mapping table.

## Typical exchange

```
host                          device
  PING            ──────────▶
                  ◀──────────  PONG
  GET_INFO        ──────────▶
                  ◀──────────  INFO   (4 channels, 9 keys, 9 LEDs, 2272-byte config)
  GET_CONFIG 0    ──────────▶
                  ◀──────────  CONFIG_CHUNK (0/9)
       ⋮               ⋮              ⋮
  GET_CONFIG 8    ──────────▶
                  ◀──────────  CONFIG_CHUNK (8/9, short)

  SET_CONFIG 0..8 ──────────▶   (streamed; applied to RAM when chunk 8 lands)
                  ◀──────────  SET_ACK / ERROR
  COMMIT          ──────────▶   (~50 ms: erase + program one 4 KiB sector)
                  ◀──────────  COMMIT_ACK

                  ◀──────────  KEY_EVENT  (unsolicited, while usbReportEvents=1)
```

Note that `SET_CONFIG` alone changes what the pad does but not what survives a power cycle. `COMMIT` is separate on purpose: a UI that streams 9 chunks should trigger **one** flash erase, not 9, and a user who previews a binding and hates it should be able to walk away without it being written.

