# Hardware

Read this before you solder. Three sections matter in order:
[power](#led-power-this-is-the-one-to-get-right), [wiring](#wiring),
[things to measure](#measure-these-before-you-order).

## Bill of materials

| Qty | Part | Notes |
|----:|------|-------|
| 1 | Waveshare RP2040-Zero | RP2040, 2 MB flash, 264 kB RAM, castellated edges |
| 9 | Mechanical keys + keycaps | MX-style or choc, your call |
| 1 | Rotary encoder with push switch | EC11-style, 20 detents/rev assumed |
| 9 | SK6812MINI-E | 3.2 × 2.8 × 1.78 mm, one per key |
| 1 | 74AHCT1G125 | level shifter — **AHCT, not AHC.** See below. |
| 1 | 330 Ω | series with the LED data line |
| 1 | 10–47 µF | across the LED supply, at the *first* LED |
| 1 | Knob | for the encoder shaft |
| — | 1N4148 × 9 | **only if** you switch to a 3×3 matrix |
| 1 | OLED 128×32 I²C | optional, pins reserved, not driven yet |

Enclosure: **74 × 90 × 31 mm** including keycaps and knob. That was dimensioned
around an XIAO (21 × 17.8 mm); the RP2040-Zero is a different shape — roughly
23 × 21 mm with castellated edges on three sides and the USB-C at the top — so
re-check the board recess and, more importantly, the USB-C clearance. A castellated
module is meant to be soldered flat to a PCB; if you are mounting it on standoffs
instead, the castellations make for awkward screw clearance.

## Wiring

Keys are **direct to GPIO**, one pin each, no diodes:

```
3.3V ──┬── key ──┬── GPIO(n)      internal pull-up enabled, pin reads 1 idle
       │         │
      GND     (nothing else)

press  -> pin LOW       release -> pin HIGH
```

You can check every key with a multimeter in continuity mode without desoldering
anything, and a bridge between two adjacent pads shows up as one stuck key rather
than as a mysterious matrix ghost.

Encoder: A, B and SW each to their own GPIO with an internal pull-up, common pin
to GND. If it behaves erratically, add 100 nF from each of A/B/SW to GND **at the
encoder**, not at the board — the noise is generated at the contacts and has to be
killed where it starts.

LEDs are a **chain, not a parallel bus**. They are a shift register:

```
RP2040-Zero GP10 ──▶ 330Ω ──▶ LED0 DIN ─ LED0 DOUT ─▶ LED1 DIN ─ ... ─▶ LED8
```

LED *n* sits under key *n*. Keep that true physically or every per-key effect will
light the wrong key.

### Pin table

Header numbering is Waveshare's own for header P1: **23 pins**, USB-C pointing up,
front (component) side facing you, pin 1 = 5V at the top-left, then counter-clockwise.
The left column is pins 1–11 top to bottom and the right column is pins 12–23 bottom
to top. `tools/check_board.py` derives this table from `board.h` and fails if this
document, `board.h`, and `protocol.json` disagree, so it should not be possible to
solder from a stale copy — but confirm against your board's silkscreen anyway.

| Function | GPIO | Header pin | Notes |
|---|---:|---:|---|
| K0 | GP0 | 23 | direct to GND, pull-up |
| K1 | GP1 | 22 | |
| K2 | GP2 | 21 | |
| K3 | GP3 | 20 | |
| K4 | GP4 | 19 | |
| K5 | GP5 | 18 | |
| K6 | GP6 | 17 | |
| K7 | GP11 | 12 | |
| K8 | GP12 | 11 | |
| Encoder A | GP7 | 16 | pull-up |
| Encoder B | GP8 | 15 | pull-up |
| Encoder SW | GP9 | 14 | pull-up, active low |
| LED data | GP10 | 13 | → 330 Ω → LED0 DIN |
| OLED SDA | GP28 | 5 | I²C0, needs 4.7 k pull-ups to 3V3 |
| OLED SCL | GP29 | 4 | I²C0 |
| USB | — | USB-C | native, TinyUSB |

The left column, for reference: **1 = 5V, 2 = GND, 3 = 3V3, 4 = GP29, 5 = GP28,
6 = GP27, 7 = GP26, 8 = GP15, 9 = GP14, 10 = GP13, 11 = GP12.**

That is 14 of the 20 header GPIOs with the OLED fitted, 12 without.

**Spare: GP13, GP14, GP15, GP26, GP27.** GP26–GP29 are the ADC-capable pins
(ADC0–ADC3), and this map deliberately keeps keys off them, so all four ADC channels
are free for a later analogue knob, a battery voltage divider, or a light sensor. An
earlier revision of this pin map put K7/K8 on GP26/GP27; that was worked around a
"only 15 GPIO on the header" belief which turned out to be wrong — the pico-sdk
board header only names GP0–GP10 and GP26–GP29, which is the SDK being conservative
about constants, not a statement about the hardware.

**What is and is not on the main header.** The 23-pin castellated header carries 20
GPIO: GP0–GP15 and GP26–GP29. GP16 is *not* on it — it drives the board's own
onboard WS2812. GP17–GP25 are on two 5-pin headers on the back plus solder pads, and
this build does not use them.

So there is room here: 6 spare header GPIOs, or 8 if you drop the OLED. If you ever
want a second encoder, a couple of extra keys, or a rotary-plus-push on each of two
knobs, the pins exist and no matrix scan is needed.

The onboard WS2812 on GP16 is free status-indicator real estate if you want it —
showing the active channel on the board's own LED, for instance. It is not wired
into this firmware, and adding it means a second PIO state machine or time-sharing
the existing one. Note that if you *do* claim GP16, `BOARD_LED_PIN` must stay at
GP10: the two strips would otherwise share a data line.

The whole table is `firmware/include/board.h` and nothing else. Change it there.

## LED power — this is the one to get right

SK6812MINI-E: **VDD 3.3–5.8 V, VIH = 0.7 × VDD.**

| LED supply | Required VIH | RP2040 output (3.3 V) | Level shifter? |
|---|---:|---:|---|
| **5 V** (board 5V pin) | 3.5 V | 3.3 V — **200 mV short** | **yes, keep it** |
| **3V3** | 2.31 V | 3.3 V — fine | no, drop it |

So your instinct to include the shifter was right *if* the LEDs run from 5 V.

**The trap:** a 74A**HCT**1G125 needs VIH = 2.0 V, so the RP2040's 3.3 V drives it
comfortably. A plain 74A**HC**1G125 needs VIH = 3.5 V and **would not work** — the
same 3.3 V that is too weak for the LED is also too weak for the AHC part. Check
the marking on the chip you actually bought. The `T` is the whole point.

The shifter inverts (N-channel buffer, active-low /OE). The firmware already
handles this: `BOARD_LED_INVERT_OUTPUT 1` makes the PIO invert the output through
the pad's GPIO override, which costs zero cycles. If you drop the shifter, set it
to `0`.

### Current budget

Nine LEDs at full white draw **~540 mA** (9 × 3 × 20 mA). There are two separate
limits in the way, and it matters which one you hit.

**The 5 V rail is the real ceiling.** It comes straight off USB-C VBUS with no
diode or switch, nominally 500 mA, and the RP2040 + flash + onboard LED are fed
from it *through* the LDO. The chip itself draws maybe 50–90 mA at 133 MHz, so
LEDs on 5 V have roughly **400 mA** of budget. 540 mA is over it.

**The 3V3 rail is limited by heat, not by its rating.** The regulator is an
ME6217C33M5G, rated 800 mA — but it is a *linear* regulator in a SOT-23-5, and
from a 5 V input it burns (5 − 3.3) × I as heat. At 300 mA that is 0.51 W; at
540 mA it is 0.92 W in a package whose junction-to-ambient is roughly 250 °C/W on
normal PCB copper. It has over-current and thermal shutdown, so it will protect
itself by dropping the rail — which takes the RP2040 with it, and looks exactly
like a random reboot under bright white. Solving 1.7 V × I = 0.25 W puts the
practical continuous figure near **150 mA**, and 0.5 W near **290 mA**. Treat 3V3
as good for about 250 mA total *including the board's own ~50–90 mA*, so roughly
**150–200 mA** of LED current.

That is why the factory default brightness is **90/255, not 255** — roughly
190 mA, which fits the 3V3 rail and sits comfortably inside the 5 V one. Options
if you want brighter:

1. **Run the LEDs from 5 V and keep brightness ≲ 180.** That is about 380 mA,
   inside the 400 mA the 5 V rail can spare. This is the path the wiring diagram
   assumes, and it is why the 74AHCT1G125 is in the BOM: at 5 V the LED's VIH is
   3.5 V and the RP2040's 3.3 V output is 200 mV short of it.
2. **Feed the strip from a separate 5 V supply**, tie its GND to the board GND, and
   raise brightness to whatever you like. Do not back-feed the board's 5 V pin from
   the external supply — two sources on one rail with no diode between them is how
   you push current back into a host USB port.
3. **Cap it in software per mode.** `RAINBOW` and `SPECTRUM` at value 255 light all
   three channels of every LED, so they are roughly three times the current of a
   `STATIC` deep blue at the same brightness setting. If you want a bright
   rainbow, lower the value in the HSV, not the master brightness.

Note that none of this is enforced by the firmware. `cfg_lighting_t.brightness` is
a single byte the app can set to 255, and the device will obey it. If your app
exposes a brightness slider, cap it there, or add a current-limiting clamp in
`led_compute_frame()` — the gamma table means brightness 90 is already only ~25/255
of drive, so a clamp is cheap and invisible.

Put the 330 Ω and the 10–47 µF at the **first LED**, not near the board. Those two
parts exist to stop the first LED from flickering when the strip inrushes, and
they only do that job where the inrush is.

## Measure these before you order

You flagged three, and they are the right three. All of them are mechanical
stack-up, which no datasheet will tell you because it depends on the specific
keycap, socket and encoder you bought.

1. **Encoder neck height and shaft length.** Measure from the mounting face to the
   end of the shaft, and the shaft diameter (6 mm D-shaft is standard for EC11, but
   some are 5 mm). Detent count per revolution is usually 20; if yours clicks 12 or
   24 times, change `BOARD_ENC_DETENTS_PER_REV` in `board.h` rather than the
   half-step count.

2. **OLED thickness.** The 128×32 I²C modules vary between about 4 mm (bare glass
   + flex) and 12 mm (glass + PCB + header). With a 31 mm total height and keycaps
   eating ~12 mm of that, a 12 mm module will not fit under the deck. Measure the
   module *and* decide whether it sits above or below the key plane.

3. **RP2040-Zero footprint and USB-C clearance.** This board has castellated
   half-holes on three edges plus a staggered row on the back, and the USB-C
   connector sits proud of the board edge. Two things to model: the connector body
   (not just the PCB outline) decides where the board can sit, and the castellations
   mean the board wants to be soldered flat to a PCB rather than screwed to
   standoffs. If you are keeping standoffs, check that your supports do not land on
   a castellated pad.

   **The BOOT and RESET buttons and the onboard WS2812 are all on the front**, next
   to the USB-C connector, with the RP2040 itself between them and the key field.
   Two consequences for the case. If anything covers BOOT and RESET you lose the
   ability to reflash by hand — which is why `CMD_BOOTLOADER` exists in the
   protocol, but firmware that is dead enough cannot answer it, so keep physical
   access to BOOT. And the underside carries a staggered row of 10 solder pads
   (GP17–GP25 plus GND) and three SWD pads; if you mount the board flat against a
   plate, those need clearance or insulation, not just the four corners.

   The board is about 23.5 × 18 mm, so it is wider and shorter than an XIAO. The
   USB-C connector sits proud of the top edge — budget for the plug body and the
   cable bend radius, not just the connector, or the case will stop the plug from
   going home.

Also worth measuring, since you have not built it yet:

4. **Keycap-to-LED distance.** SK6812MINI-E is 1.78 mm tall. With a hotswap socket
   and an MX keycap, the diffuser gap decides how even the glow looks. Under ~3 mm
   you get a hot spot in the middle of the cap; 4–6 mm with a diffuser sheet is
   even. If you are printing a light guide, print it in natural/transparent, not
   white.

5. **Encoder-to-key spacing.** The knob sits above K0/K1 and is 31 mm tall in a
   74 mm-wide case. Check the knob's outer diameter against the K2 keycap — a
   20 mm knob will foul an adjacent cap.

## First power-up checklist

In this order, because each step isolates a different class of problem:

1. **Plug in with nothing soldered but the RP2040-Zero.** It should enumerate as
   "Macropad 3x3 + Knob" plus a serial port. If not, the firmware is not flashed or
   the cable is charge-only.
2. **Run `LED_TEST` from the app** (or send it by hand) with 27 raw bytes. Each LED
   should light exactly the colour you asked for, in order 0–8. This tests the data
   chain, the shifter polarity, and the GRB order at once, with no firmware logic in
   the way. If red and green are swapped, set `BOARD_LED_RGB_ORDER 1`. If nothing
   lights, the shifter is inverting the wrong way — try
   `BOARD_LED_INVERT_OUTPUT 0`.
3. **Solder one key. Test it. Then the next.** Nine keys soldered at once with a
   shared mistake costs you an afternoon; one at a time costs twenty minutes.
4. **Encoder last.** Turn it slowly, one click at a time, and watch `KEY_EVENT`s.
   One click should produce exactly one `ENC_CW` with `value: 1`. If a single click
   produces several events, you need the 100 nF caps. If it produces none, your
   half-steps-per-detent is wrong.
5. **Then** try the gestures: tap, hold for 300 ms, long-press the knob to change
   channel.

## Flashing

Hold the board's **BOOT** button, plug in USB-C (or press RESET while holding BOOT),
release. An `RPI-RP2` drive appears. Copy `firmware/build/mpad3.uf2` onto it. The
drive disappears and the pad reboots. The UF2 is tagged with family ID
`0xE48BFF56`, which is the RP2040 family — the correct bootloader will accept it and
an RP2350's will refuse it, so a wrong-board flash fails loudly rather than
half-working.

The firmware can also do this itself: `CMD_BOOTLOADER` over the protocol, or a key
bound to `ACTION_TYPE_BOOTLOADER`. Useful once the pad is inside a case with no
accessible BOOT button — which is why it is in the protocol even though you will
probably never use it.

## Config region and reflashing

Config lives in the **last two 4 KiB sectors** of the 2 MB flash
(`0x1FE000` and `0x1FF000`). The firmware image is ~43 KB at the start, so there is
no overlap and reflashing firmware never erases your config.

**This offset moved when the board changed.** An RP2350 board with 4 MB would put
the config at `0x3FE000`. `BOARD_FLASH_SIZE_BYTES` in
`firmware/include/board.h` and `PICO_FLASH_SIZE_BYTES` from the SDK board header
must agree, or you write config to flash that is not there. The UF2 flashing path
will not catch this for you — the write succeeds and the read comes back as
something else.

If you ever do erase it — or both sectors come up corrupt — the pad boots on factory
defaults rather than failing to start. You lose your bindings; you do not lose the
device.
