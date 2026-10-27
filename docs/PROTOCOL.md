# mpad3 wire protocol

> **Generated** by `tools/gen_protocol.py` from `host/protocol/protocol.json`.
> Edit the spec, not this file.

Protocol version **1**, config format version **1**. All integers little-endian.

The transport is USB CDC (a serial port). The device enumerates as a composite of three interfaces — HID keyboard, HID consumer, and the CDC port this protocol runs on — so the pad works as a keyboard with nothing installed, and the configurator is optional.

## Frame

```
offset  size  field
──────  ────  ─────────────────────────────────────────────
0       1     sof0   0xA5
1       1     sof1   0x5A
2       1     cmd
3       1     len   payload byte count, little endian, 0..512
5       1     version
6       len   payload
6+len   1     crc16   CRC-16/CCITT-FALSE over cmd..payload, little endian
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
| `0x80` | **PONG** | device → | — | — |
| `0x81` | **INFO** | device → | `info` | — |
| `0x82` | **CONFIG_CHUNK** | device → | `configChunk` | — |
| `0x83` | **SET_ACK** | device → | `status` | — |
| `0x85` | **COMMIT_ACK** | device → | `status` | — |
| `0x86` | **CHANNEL** | device → | `channelIndex` | — |
| `0x88` | **LIGHTING** | device → | `channelIndex + lighting` | — |
| `0xC0` | **KEY_EVENT** | device → | `keyEvent` | — |
| `0xFE` | **BOOTLOADER** | host → | — | `SET_ACK then the device reboots into BOOTSEL` |
| `0xFF` | **ERROR** | device → | `status` | — |

- **PING** (`0x00`) — handshake; also proves the cable and the CDC interface are alive
- **GET_CONFIG** (`0x02`) — one request per chunk; chunkIndex must be 0..chunkCount-1
- **SET_CONFIG** (`0x03`) — streamed in order from chunk 0; applied to RAM on completion, written to flash only on COMMIT
- **RESET_CONFIG** (`0x04`) — factory defaults, written to flash immediately
- **COMMIT** (`0x05`) — write the staged RAM config to flash. Blocks ~50 ms during the erase.
- **SET_CHANNEL** (`0x07`) — out-of-range is refused with ERROR/BAD_ARG, not wrapped
- **SET_LIGHTING** (`0x09`) — persists: marks the config dirty so COMMIT writes it
- **PREVIEW_LIGHTING** (`0x0A`) — identical to SET_LIGHTING but does NOT mark dirty, so a colour-picker drag does not survive a power cycle
- **LED_TEST** (`0x0B`) — 9 x 3 bytes pushed straight to the strip, bypassing gamma, brightness and the lighting engine. This is the 'is my soldering right' command.
- **KEY_EVENT** (`0xC0`) — streamed unsolicited when global.usbReportEvents is 1

## Structures

### `action` — 40 bytes

One binding slot. Fixed size so the whole config stays flat and memcpy-able; the 4 trailing pad bytes are spare room for a parameter without a format bump.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 1 | `type` | see [actionType](#actiontype) |
| 1 | 1 | `flags` | see [actionFlag](#actionflag) ORed bitmask |
| 2 | 2 | `code` | HID usage, media usage, channel index, LED mode, or brightness — meaning depends on type |
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

### `global` — 16 bytes

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 2 | `holdMs` | default `300`. |
| 2 | 2 | `doubleTapMs` | default `0`. 0 means double-tap is disabled, which makes a single tap fire on release with zero added latency. Do not set this to a non-zero value unless you actually bind a double tap: it delays every ordinary tap by that many milliseconds. |
| 4 | 2 | `knobHoldMs` | default `500`. |
| 6 | 2 | `knobIdleMs` | default `40`. how long the knob must be still before a sub-batch rotation is delivered |
| 8 | 1 | `knobBatch` | default `4`. detents accumulated before one rotation event is emitted |
| 9 | 1 | `holdRepeatMs` | default `40`. |
| 10 | 1 | `bootChannel` | default `0`. |
| 11 | 1 | `ledInvertOutput` | default `1`. 1 when a 74AHCT1G125 (or any inverting buffer) is in the LED data path |
| 12 | 1 | `usbReportEvents` | default `1`. |
| 13 | 3 | `pad` |  |

### `config` — 1708 bytes

The whole saved configuration. This is what SET_CONFIG streams and what lives in flash.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 4 | `magic` | always `0x43464733`. |
| 4 | 2 | `version` |  |
| 6 | 2 | `length` | always `1708`. |
| 8 | 16 | `global` |  |
| 24 | 1680 | `channels` |  |
| 1704 | 4 | `crc32` | CRC-32/IEEE over bytes 0..1703 inclusive |

Checksum: **CRC-32/IEEE** over bytes `0..1703` (1704 bytes), stored at offset 1704. Reflected poly `0xEDB88320`, init `0xFFFFFFFF`, xorout `0xFFFFFFFF`; check value for `"123456789"` is `0xCBF43926`.

### `sectorHeader` — 16 bytes

Prepended inside each of the two flash sectors, before the config blob.

| Offset | Size | Field | Notes |
|-------:|-----:|-------|-------|
| 0 | 4 | `magic` | always `0x53454331`. |
| 4 | 4 | `seq` | higher wins; this is what makes the A/B ping-pong work |
| 8 | 4 | `blobCrc` |  |
| 12 | 4 | `hdrCrc` | CRC-32 over the 12 bytes above |

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
| 11 | `capabilities` | `u8` |  |
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
| 4 | `value` | `i16` | detent count for rotation events |
| 6 | `action` | `u16` | actionType that fired, 0 if the slot was empty |

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

A malformed frame is reported with the status that says *why*, not a single catch-all. `BAD_CRC` means the frame arrived intact in shape but the checksum did not match, which points at line noise or a byte dropped in transit. `BAD_LENGTH` means the declared payload length could not be satisfied, which points at a truncated write or a host encoder bug. `BAD_VERSION` means the frame was well formed and its `ver` byte is not one this firmware accepts, which points at an app built against a different protocol revision. The three have three different fixes, so an app should surface them differently rather than printing "bad frame".

Bytes that never formed a frame at all are dropped silently while the parser hunts for the `A5 5A` start-of-frame magic. The device does not reply to them: answering garbage would let one line glitch generate a flood of error frames.

### capabilities

| Value | Name |
|-------|------|
| `0x01` | `ENCODER` |
| `0x02` | `OLED` |
| `0x04` | `FLASH` |
| `0x08` | `EVENTS` |

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
- Spare after this map: GP13, GP14, GP15, GP26, GP27 - and GP26-GP29 are the ADC-capable pins, left free on purpose.
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
                  ◀──────────  INFO   (3 channels, 9 keys, 9 LEDs, 1708-byte config)
  GET_CONFIG 0    ──────────▶
                  ◀──────────  CONFIG_CHUNK (0/7)
       ⋮               ⋮              ⋮
  GET_CONFIG 6    ──────────▶
                  ◀──────────  CONFIG_CHUNK (6/7, short)

  SET_CONFIG 0..6 ──────────▶   (streamed; applied to RAM when chunk 6 lands)
                  ◀──────────  SET_ACK / ERROR
  COMMIT          ──────────▶   (~50 ms: erase + program one 4 KiB sector)
                  ◀──────────  COMMIT_ACK

                  ◀──────────  KEY_EVENT  (unsolicited, while usbReportEvents=1)
```

Note that `SET_CONFIG` alone changes what the pad does but not what survives a power cycle. `COMMIT` is separate on purpose: a UI that streams seven chunks should trigger **one** flash erase, not seven, and a user who previews a binding and hates it should be able to walk away without it being written.

