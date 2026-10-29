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
| To select | **Cuttable, individually addressable 5 V LED strip** | Need nine independent pixels (one per key), usable cut points and a documented chipset, colour order, voltage, timing, maximum current and physical dimensions. No strip is selected yet; the Normand SK6812MINI-E is a **reference only**. A 12/24 V or RGBW strip is not automatically compatible. |
| 1 (planned) | 74AHCT1G125 | **Non-inverting** 3.3 V → 5 V data buffer for the referenced logic levels; verify compatibility and package pinout for the purchased strip. |
| 1 | 330 Ω | between the buffer output and first LED DIN |
| 1 | 10–47 µF | across LED 5 V/GND, at the *first* LED |
| 1 | 100 nF ceramic | across buffer VCC/GND, close to its supply pins |
| 1 (to verify) | buffer-input pull-down or hardware enable | Candidate ~10 kΩ `A` to GND so it cannot float before firmware starts; does **not** switch LED power or clear latched pixels. Verify with chosen parts. |
| 1 | Knob | for the encoder shaft |
| — | 1N4148 × 9 | **only if** you switch to a 3×3 matrix |
| 1 | SSD1306 OLED 128×32 I²C, address 0x3C | **Required** on this pad; 3.3 V module |

Enclosure: **74 × 90 × 31 mm** including keycaps and knob. That was dimensioned
around an XIAO (21 × 17.8 mm); the RP2040-Zero is a different shape — roughly
23 × 21 mm with castellated edges on three sides and the USB-C at the top — so
re-check the board recess and, more importantly, the USB-C clearance. A castellated
module is meant to be soldered flat to a PCB; if you are mounting it on standoffs
instead, the castellations make for awkward screw clearance.

## Wiring

Keys are **direct to GPIO**, one pin each, no diodes or external 3V3 wire:

```
GPIO(n) ── [normally-open switch] ── GND
     internal pull-up to 3V3 is INSIDE the RP2040
released: pin HIGH (open)      pressed: pin LOW (closed)
```

Connect **only one switch terminal to its assigned GPIO and the other to GND**
(header pin 2). Never connect either switch terminal to the board's 3V3 or 5V
header pin. The previous drawing incorrectly connected 3V3 straight to GND;
**do not wire from an old copy of that drawing**. The same two-terminal rule
applies independently to K0–K8.

**Before connecting USB or any power:** with the board unpowered, check 3V3
(header pin 3) against GND (pin 2) for a *persistent* short; a capacitor may
cause a momentary meter beep while charging. Check each key GPIO against GND:
it must be open when released and closed only while its switch is pressed.
Inspect adjacent solder joints for bridges. A continuity test cannot prove that
all later LED/USB electrical limits are safe.

Encoder: A, B and SW each to their own GPIO with an internal pull-up, common pin
to GND. If it behaves erratically, add 100 nF from each of A/B/SW to GND **at the
encoder**, not at the board — the noise is generated at the contacts and has to be
killed where it starts.

LEDs are a **chain, not a parallel bus**. The diagram is an intended 5 V
**data topology, not permission to connect 5 V yet**. First choose a strip with
nine individually addressable RGB pixels and confirm its cut points, input level,
voltage, current and colour order. The LED supply topology is **undecided**:

```
GP10 (header 13) ──▶ [74AHCT1G125: A (2) → Y (4)] ──▶ 330 Ω ──▶ LED0 DIN
                                                               LED0 DOUT ──▶ LED1 DIN ──▶ ... ──▶ LED8 DIN
5 V LED rail (SOURCE TO DESIGN) ── buffer VCC (pin 5) + each LED VDD
shared GND ── buffer GND (pin 3) + buffer /OE (pin 1) + each LED GND
```

**Do not assume the board's 5V/header 1 or USB can supply the strip.** If an
external regulated 5 V rail is chosen, isolate it from USB/board 5 V to avoid
back-feed while maintaining a common ground. A strip cuttable in 3-pixel groups
cannot be arranged as nine separate under-key segments without additional
physical redesign, even if its chipset speaks a similar serial protocol.

`/OE` is **active-low**: tie it to GND to enable the output. The buffer passes
`A` to `Y` **without inverting data**; do **not** route GP10 into `/OE` as if it
were a data input. Place a 100 nF ceramic bypass capacitor across buffer
VCC/GND close to the chip, and the 10–47 µF bulk capacitor across LED 5 V/GND
at LED0. The buffer pin numbers shown are the TI five-pin DBV/DCK/DRL *top-view*
pinout; verify the exact purchased package and LED DIN/DOUT orientation before
soldering. All 5 V LED parts and the RP2040 must share GND, but **never feed 5 V
into a GPIO or OLED I²C pin**. See the [TI SN74AHCT1G125 datasheet](https://www.ti.com/lit/gpn/SN74AHCT1G125).

**Boot/reset is not software-gated.** With `/OE` hard-wired LOW, buffer input `A`
can float while the RP2040 resets or is unpowered. Plan a verified passive
pull-down on `A` (for example, a candidate 10 kΩ to common GND) or a properly
designed hardware output/power-enable circuit; confirm startup levels and
power sequencing on the bench. GP10 LOW *after firmware initialization* neither
switches off the 5 V rail nor necessarily clears an LED state latched while its
rail stays on. Already-flashed older/bench firmware can drive data despite the
new default. Keep LED 5 V physically disconnected until commissioning, and use a
physical switch/enable if guaranteed-dark or zero-idle-current operation is
required; verify the selected buffer and strip can tolerate the chosen
power-up/down sequence.

**Source tests are not electrical validation.** The default driver initializes
GP10 as an output held LOW and has no PIO/DMA LED path. A separate, explicitly
bench-enabled build drives the non-inverting buffer with GRB bits at the tested
**reference** Normand Rev.02 timing. Neither host test measures GP10 or LED0 DIN
on a real assembly, establishes a power budget, or proves the purchased strip
is compatible. LED *n* is intended under key *n*; verify its cut segments,
physical chain order and keycap clearance before power.

### Pin table

Header numbering is Waveshare's own for header P1: **23 pins**, USB-C pointing up,
front (component) side facing you, pin 1 = 5V at the top-left, then counter-clockwise.
The left column is pins 1–11 top to bottom and the right column is pins 12–23 bottom
to top. `tools/check_board.py` cross-checks the named GPIO/header pins against
`board.h` and `protocol.json` and rejects the old unsafe key sketch. It checks
text, **not an actual circuit or solder joints**: confirm against your board's
silkscreen and use a multimeter before applying power.

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
| LED data | GP10 | 13 | → buffer A; buffer Y → 330 Ω → LED0 DIN |
| OLED SDA | GP28 | 5 | I²C0, needs 4.7 k pull-ups to 3V3 |
| OLED SCL | GP29 | 4 | I²C0 |
| USB | — | USB-C | native, TinyUSB |

**Required SSD1306 128×32 module (0x3C):** VCC → board **3V3** (header 3),
GND → **GND** (header 2), SDA → **GP28** (header 5), SCL → **GP29** (header 4).
Pull each I²C line up to **3V3**, with approximately 4.7 kΩ resistors if your
module does not already include them. **Never use 5 V pull-ups or a 5 V-only
module** on RP2040 pins. Confirm the module really is SSD1306 128×32 at 0x3C;
SH1106 and 128×64 modules need different initialization/addressing. The firmware
checks for an I²C ACK and retries after a failed transfer; no ACK means the pad
still accepts keys but does not advertise a working OLED. Protocol-v3
firmware advertises `CAP_OLED_STREAM` only with that same ACK: two bounded,
CRC-checked USB chunks provide a volatile 512-byte runtime frame, while baked
animations play locally. A stream gap longer than 1,200 ms reverts to a truthful
local screen on the next runtime refresh; pixels never touch saved config flash.
The fake-I²C/fake-CDC tests do not replace an assembled-board latency or
re-enumeration test.

The left column, for reference: **1 = 5V, 2 = GND, 3 = 3V3, 4 = GP29, 5 = GP28,
6 = GP27, 7 = GP26, 8 = GP15, 9 = GP14, 10 = GP13, 11 = GP12.**

That is **15 of the 20 header GPIOs**, with the required OLED connected.

**Spare: GP13, GP14, GP15, GP26, GP27.** Only GP26 and GP27 remain free as
ADC-capable pins: GP28 and GP29 carry the display's I²C bus. GP26/GP27 can
support a later analogue knob, a battery divider, or a light sensor. An
earlier revision of this pin map put K7/K8 on GP26/GP27; that was worked around a
"only 15 GPIO on the header" belief which turned out to be wrong — the pico-sdk
board header only names GP0–GP10 and GP26–GP29, which is the SDK being conservative
about constants, not a statement about the hardware.

**What is and is not on the main header.** The 23-pin castellated header carries 20
GPIO: GP0–GP15 and GP26–GP29. GP16 is *not* on it — it drives the board's own
onboard WS2812. GP17–GP25 are on two 5-pin headers on the back plus solder pads, and
this build does not use them.

So there is room here: **5 spare header GPIOs with the OLED installed**. If you ever
want a second encoder, a couple of extra keys, or a rotary-plus-push on each of two
knobs, the pins exist and no matrix scan is needed.

The onboard WS2812 on GP16 is free status-indicator real estate if you want it —
showing the active channel on the board's own LED, for instance. It is not wired
into this firmware, and adding it means a second PIO state machine or time-sharing
the existing one. Note that if you *do* claim GP16, `BOARD_LED_PIN` must stay at
GP10: the two strips would otherwise share a data line.

The whole table is `firmware/include/board.h` and nothing else. Change it there.

## LED power — this is the one to get right

**Current state:** the user intends to buy a cuttable strip; the exact strip,
its maximum per-pixel current, power source, wiring/isolation and current
available *for LEDs alone* are not known. Therefore there is **no defensible
numeric firmware brightness/current clamp or USB-power approval**. The normal
build (`MPAD_BENCH_LED_OUTPUT=OFF`) disables physical LED data by default:
`CAP_LED_OUTPUT` is absent, `PREVIEW_LIGHTING`/`LED_TEST` return
`ERROR/LED_DISABLED`, and GP10 is driven LOW after firmware init. Settings can
still be saved and previewed **on screen**. This is only a software data gate,
not a supply disconnect, and does not guarantee darkness at boot/reset or while
LED power remains connected after a previously latched lit frame. A build with
`-DMPAD_BENCH_LED_OUTPUT=ON` re-enables data/these commands for deliberate
current-limited bench work only. The capability means **bench firmware is
allowed to emit data**, not that its supply can safely do so.

Do not treat the part name alone as a supply specification. The cited
[SK6812MINI-E Rev. 02 datasheet](https://www.normandled.com/upload/202004/SK6812MINI-E%20LED%20Datasheet.pdf)
lists **VDD 3.7–5.5 V** and, at 5 V, input VIH ≥ 0.7 × VDD = **3.5 V**.
The earlier 3.3–5.8 V claim was not valid for this referenced variant. This is
a **timing/level example, not the selected strip**: confirm the actual strip's
IC per pixel, cut spacing, voltage, bit timing/reset, GRB-versus-RGB order,
maximum sustained channel/idle current and required power injection. Do not
connect an unknown 12/24 V, analog RGB, or RGBW strip to this 5 V RGB design.

| LED supply | Electrical implication | Wiring decision for the referenced parts |
|---|---|---|
| **5 V** | RP2040 GPIO HIGH (~3.3 V) is below the LED's specified 3.5 V VIH at 5 V. | Use the listed 74AHCT1G125 supplied at 5 V, as wired above; measure the loaded supply. |
| **3V3** | Below this LED variant's specified 3.7 V minimum VDD. | **Not a supported alternative for this variant.** Only reconsider with a separately documented 3.3 V-rated LED and a checked regulator/current budget. |

The [TI SN74AHCT1G125 datasheet](https://www.ti.com/lit/gpn/SN74AHCT1G125)
specifies VCC 4.5–5.5 V and accepts a 2.0 V HIGH on `A`, so a 3.3 V GPIO can
drive its input while it is powered at 5 V. `/OE` LOW enables its output; `Y`
follows `A` **without inversion**. Verify the `AHCT` marking, not `AHC` (which has
different logic input thresholds). The old serialized `ledInvertOutput` field
is still stored at legacy default `1` for config compatibility but is **ignored**
by the LED driver. The *bench* PIO path sets both RP2040 GPIO output-enable and
data overrides to **NORMAL** for the specified non-inverting buffer; the default
build uses GPIO LOW and never starts LED PIO/DMA. Never swap wires or treat that
stored byte as a polarity control; verify the signal at GP10 and LED0 DIN on the
current-limited bench before connecting all nine LEDs.

### Current budget — design estimate, not an approved limit

For illustration, **if** a purchased LED draws 20 mA per colour, nine full-white
LEDs demand 9 × 3 × 20 = **540 mA**, *before* the RP2040, OLED or transients.
The referenced data sheet identifies a 12 mA/channel variant; neither 20 mA
nor a brightness-slider number is a measured maximum for the parts in hand.
The host's allowed USB current and the small board regulator's thermal limits
must be checked separately. A nominal 500 mA USB figure is **not** an automatic
budget of 500 mA for the LEDs. Do not use the board's 3V3 rail as a shortcut for
this 3.7 V-minimum LED, or treat the regulator's nameplate current as a safe
continuous limit.

Before assigning a limit, record the exact strip part/datasheet, number of
**independently addressable pixels** (not merely cuttable modules), rail voltage,
worst-case full-white and idle current at that voltage, startup/inrush, and the
measured board + OLED draw. Determine the LED-only continuous budget from the
chosen supply and, for a shared rail, subtract worst-case non-LED demand and an
engineering margin. Then compare it with the purchased strip's **measured**
worst-case, including cable/connector and regulator thermal limits. Until those
numbers exist, a claim such as "90/255 is safe" or an invented mA clamp is
not defensible.

The factory setting of **90/255** is a visual default, **not a current clamp**:
the app can save 255, animated modes may produce full-white pixels, and raw
`LED_TEST` bypasses scaling. The default software gate blocks these *physical*
requests; the explicit bench build does not enforce a current ceiling. Use a
current-limited lab supply, start with one pixel at a low current limit, check
idle and each colour, and increase only if the strip/supply/thermal measurements
permit it. Test full white **only after** calculating and measuring a sufficient
budget. Do **not** assume that USB or the board's 5 V header can deliver it.
If a separate regulated 5 V supply is needed, design proper USB/external-power
isolation and a common GND; **never directly tie two independent 5 V sources
or back-feed USB VBUS**. Verify startup, reset, previous-pixel latch and
power-down behavior as well as waveform/current before enclosure assembly.

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

4. **Cuttable strip and keycap clearance.** Measure the exact candidate strip's
   PCB width, pixel-to-pixel pitch, height (including protective coating) and
   cut-point spacing against all nine key positions and the MX/hotswap stack.
   A one-pixel cut segment needs data-out-to-next-data-in and power continuity;
   don't assume a three-pixel cut section can become one independent key. Check
   optical hot spots, diffuser clearance and insulation rather than relying on
   a different manufacturer's 1.78 mm bare-LED height.

5. **Encoder-to-key spacing.** The knob sits above K0/K1 and is 31 mm tall in a
   74 mm-wide case. Check the knob's outer diameter against the K2 keycap — a
   20 mm knob will foul an adjacent cap.

## Assembly and first-power gates

1. **Before power, check continuity.** With USB and all supplies disconnected,
   confirm no persistent short between 3V3 and GND, 5 V and GND, or adjacent
   solder pads. For every key, its GPIO-to-GND path must be open until pressed.
   Verify GP10 goes to buffer `A`, buffer `/OE` goes to GND, and buffer `Y` goes
   through 330 Ω to LED0 DIN — not directly to a GPIO input.
2. **Prove the bare RP2040-Zero first.** Keep LEDs disconnected. A known-good,
   *actually built* firmware image should enumerate its HID/CDC interfaces;
   BOOTSEL recovery must remain accessible. **No boot-proven UF2 is bundled**
   in this project: a separate cross-built image has passed structural and flash-
   budget checks, but has not been flashed or booted. Do not assume the pad's
   descriptors exist until it actually enumerates and answers the protocol probe.
3. **Solder and check one key at a time.** Then verify the encoder A, B and SW
   use GP7, GP8 and GP9 to GND with internal pull-ups, and that the required
   OLED is on 3V3/GND plus GP28 SDA/GP29 SCL (I²C pull-ups to 3V3 only).
4. **Select the strip and prove power first.** With LED 5 V physically
   disconnected, confirm a freshly built/default firmware answers v3 PING/INFO
   **without** `CAP_LED_OUTPUT`; valid preview/raw requests must return
   `ERROR/LED_DISABLED`. GP10 must be LOW **after init**, but check boot/reset
   levels and the buffer-input pull-down/hardware enable independently. Record
   the selected strip, 5 V topology/isolation and measured LED-only budget.
   Only then build with `-DMPAD_BENCH_LED_OUTPUT=ON` for a current-limited bench
   setup. Probe GP10 and LED0 DIN; check the selected IC's actual 0/1/reset
   timing, one pixel at a time, then all nine and current/temperature. Full
   white is allowed **only within a verified supply budget**. `LED_TEST` uses
   unscaled RGB for up to **300 ms**, then the normal mode resumes on the next
   LED tick; it is **not** a current limiter or a permanent off switch. The
   misleading "Clear pad LEDs" UI control has been removed.
5. **Then** test tap/hold/knob and the physical OLED while watching actual USB
   events and supply current. Passing a pin-map or source test does not prove
   soldering, regulator temperature or USB reliability.

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

Baked OLED animation frames are `const` tables **inside the application UF2**,
read from XIP flash. The build caps their content at 120 KiB (240 × 512 B); this
is a *budget*, not a separate already-programmed frame store. The upper window
`0x1E0000`–`0x1FDFFF` is reserved but **currently unused**. Reflashing the app
replaces its built-in artwork. `tools/check_flash_budget.py` checks that the
whole image stays below that window; it does not verify real OLED behavior.

Config lives in the **last two 4 KiB sectors** of the 2 MB flash
(`0x1FE000` and `0x1FF000`). Normal application images stop well before those
sectors; verify the actual generated UF2 before flashing.

**This offset moved when the board changed.** An RP2350 board with 4 MB would put
the config at `0x3FE000`. `BOARD_FLASH_SIZE_BYTES` in
`firmware/include/board.h` and `PICO_FLASH_SIZE_BYTES` from the SDK board header
must agree, or you write config to flash that is not there. The UF2 flashing path
will not catch this for you — the write succeeds and the read comes back as
something else.

If you ever do erase it — or both sectors come up corrupt — the pad boots on factory
defaults rather than failing to start. You lose your bindings; you do not lose the
device.
