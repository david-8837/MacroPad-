# Architecture

The organising rule is one sentence: **each module is defined by what it is not
allowed to know.** Everything else follows.

```
        ┌──────────────────────────────────────────────────┐
        │                     main.c                       │
        │        superloop: 1 ms scan, 60 Hz LED, USB      │
        └───────┬───────────┬──────────┬───────────┬───────┘
                │           │          │           │
          ┌─────▼────┐ ┌────▼─────┐ ┌──▼──────┐ ┌──▼────────┐
          │ scan.c   │ │ gesture.c│ │ leds.c  │ │usb_proto.c│
          │ pins +   │ │ edges -> │ │ colour  │ │ frames -> │
          │ debounce │ │ meaning  │ │ maths + │ │ commands  │
          └──────────┘ └────┬─────┘ │ PIO     │ └──┬────────┘
                            │       └─────────┘    │
                       ┌────▼──────────────────────▼───┐
                       │           dispatch.c          │
                       │  the only module allowed to   │
                       │  know about everything at once│
                       └──┬─────────┬──────────┬───────┘
                          │         │          │
                   ┌──────▼──┐ ┌────▼─────┐ ┌──▼──────────┐
                   │channel.c│ │ actions.c│ │config_store.c│
                   │ 3 pages │ │ -> bytes │ │ A/B flash    │
                   └─────────┘ └────┬─────┘ └─────────────┘
                                    │
                             ┌──────▼──────┐
                             │  hid_dev.c  │
                             │ TinyUSB HID │
                             └─────────────┘
```

## What each module may not know

| Module | Knows | Must NOT know |
|---|---|---|
| `gesture.c` | milliseconds, bitmasks | GPIO, PIO, USB, config layout, what an action is |
| `scan.c` | pin numbers, bouncing | what a key press *means* |
| `actions.c` | action structs | TinyUSB, channels, flash |
| `leds.c` (maths) | lighting structs, time | PIO, DMA, channels |
| `channel.c` | config, gesture kinds | HID, flash, USB |
| `config_store.c` | blobs, CRC, sectors | what a key binding does |
| `usb_proto.c` | frames, commands | gesture logic, LED maths |
| `dispatch.c` | **everything** | — |

The payoff is that `gesture.c`, `actions.c`, `leds.c` and `config_store.c` compile
and run on a PC with gcc and no SDK. That is not a purity exercise: it is why
946 assertions run in 0.3 s instead of requiring a board, a cable, and a human
pressing keys.

## Two seams make this work

**Time is an argument.** `gesture_process(engine, input, now_ms, queue)` takes the
clock from the caller. There is no `sleep`, no timer read, no `time_us_64()` inside
the engine. Tests drive it with a fake clock and get deterministic results; a
300 ms hold threshold can be asserted without waiting 300 ms.

**Output goes through a vtable.** `actions.c` never calls TinyUSB. It calls
`action_backend_t`, which `main.c` fills with real HID functions and tests fill with
a recorder. Same for the LED hardware layer, guarded by `LEDS_NO_HW`, and flash,
guarded by `STORAGE_NO_HW` with a two-sector RAM model behind it.

The guards are what let `make -f Makefile.host test` compile the *same* `.c` files
the RP2040 runs. Not a port, not a reimplementation — the same bytes, with the
hardware layer swapped.

## The gesture engine

The interesting part, and the reason this file is the one worth reading.

A single physical press can mean three different things, and you cannot know which
until time has passed:

```
press ─────────── release            released before holdMs   -> TAP
press ──(holdMs)─── …held…           crossed holdMs           -> HOLD
press ─release  press ─release       second press in window   -> DOUBLE_TAP
```

So a tap can only be *committed* when the double-tap window expires — unless
double-tap is unconfigured, in which case it commits on release with zero added
latency. That single optimisation is why `doubleTapMs == 0` is a meaningful default
and not just "disabled".

Two rules prevent the two worst failure modes:

- **Tap window is `min(holdMs, 200 ms)`.** Without the `min`, setting `holdMs` to
  60 would make a 100 ms press fire *both* a hold and a tap. One press, two actions,
  and no way to predict which one the OS sees first.
- **`HOLD` fires at the threshold, not on release.** `HOLD_RELEASE` then fires on
  release so a hold-down action can be undone. This is why the state machine has
  `KS_HELD` as a distinct state rather than a flag.

### The knob is a different animal

Rotation and pressing are tracked **together** because they interfere:

- Rotation during a press cancels the pending hold. Otherwise every long scroll
  where your thumb rests on the shaft changes your channel.
- A press cancels pending rotation batching, so a tap is never preceded by a stray
  volume step.
- Rotation that happened *while* pressed is delivered on release, so the host sees
  press → scroll → release in that order.

The quadrature decoder scores illegal transitions (both lines changing at once) as
**zero** rather than guessing. On a hand-soldered encoder with bouncing contacts,
guessing produces phantom volume changes; ignoring costs at worst one lost click.

Detents are batched and flushed on either `knobBatch` accumulated or `knobIdleMs`
of stillness. The idle flush is the part people forget, and without it a single slow
click sits in the accumulator forever — which the user experiences as a dead knob.

## Storage: A/B ping-pong

Two 4 KiB sectors at the end of flash. Every write goes to the sector that is *not*
currently authoritative, with an incremented sequence number. Higher sequence wins
at boot.

Power loss during a write therefore destroys only the copy you were not using. Both
sectors corrupt → factory defaults, and the pad still boots.

`SET_CONFIG` streams 7 chunks into RAM and applies them on completion; flash is
written only on `COMMIT`. A full erase+program is ~50 ms during which the pad is
deaf, because `flash_range_erase` disables XIP and nothing may execute from flash
while it runs. Seven chunks triggering seven erases would be 350 ms of deafness for
one save.

Both the sector header and the blob carry CRC-32, and validation **fails closed**:
an unknown action type, an out-of-range channel index, or an unterminated text field
is rejected rather than applied. For an input device, firing garbage is worse than
refusing to start.

## Lighting

`led_compute_frame()` is pure: config + state in, 27 bytes out, no hardware. That
means the same function can drive the pad and a browser preview, and means the unit
tests assert exact RGB values instead of eyeballing a photo.

Colour space is HSV with hue as a 16-bit value, so a hue ramp is an integer
increment and there is no floating point anywhere in the frame path. Gamma is a
256-byte table in flash — without it a linear 0–255 ramp looks like "off, off, off,
ON" and `BREATH` stalls at the bottom then snaps.

The PIO program is 4 instructions at an 8 MHz bit clock (1 cycle = 125 ns), giving
T0H = 250 ns, T1H = 625 ns, T0L = 375 ns, T1L = 375 ns. Three of those four are
inside the SK6812MINI-E's printed ±150 ns window and T1L is 75 ns under it, which
is forced rather than careless — the four windows have no common solution for this
loop shape, and `leds.c` carries the arithmetic next to the divisor. One 32-bit
FIFO word per LED, low 24 bits used: it wastes a quarter of the DMA bandwidth and
buys a much simpler packer.

The bit loop needs **four** instructions and the reason is worth stating because the
three-instruction version looks obviously correct. A `jmp`'s `[n]` delay applies
whether or not the branch is taken, so a delay on the `jmp` lengthens the high pulse
for *both* bit values. The extra one-bit time therefore has to live in an
instruction the zero-bit **skips**, which means the not-taken path needs somewhere
to go. With only a `jmp` to the immediately-following instruction, both paths run
the same instructions for the same duration and T0H equals T1H: the wire carries no
data at all. `tools/pio_timing.py` simulates the loop and fails on exactly that.

The reset/latch code (>50 µs low) is not emitted at all. DMA stops, the pin stays
low between frames, and at 60 Hz that is ~16 ms of low — the standard trick, and it
burns no state machine time.

## USB

Three interfaces on one cable: HID keyboard, HID consumer (media), CDC serial.

**Each HID interface gets its own report descriptor**, and
`tud_hid_descriptor_report_cb()` switches on its `itf` argument to return the right
one. This is the part that is easy to get wrong, because TinyUSB has examples of
both shapes: `hid_composite` puts several collections on *one* interface and returns
the same descriptor for every call, while `hid_multiple_interface` — our shape —
returns a different one per interface. Doing the first thing in the second shape
advertises the consumer collection on the keyboard interface and vice versa, so the
host finds report ID 1 and report ID 2 each declared twice and picks a binding on
its own. It enumerates fine and one of the two functions silently does nothing.
`tools/check_usb_descriptors.py` checks for it.

Report payloads carry **no** leading report-ID byte. `tud_hid_n_report()` prepends
it (`hid_device.c`: `if (report_id) epin[0] = report_id`), so `mpad_kbd_report_t`
stays the plain 8-byte boot-keyboard layout. Adding the ID by hand sends 9 bytes
for an 8-byte report and the host discards all of them.

The CDC port is addressed by TinyUSB **instance** index (`CDC_INSTANCE` = 0), which
is not the USB interface number (`ITF_NUM_CDC` = 2). Both are correct and they are
meant to differ; a `_Static_assert` in `hid_dev.c` pins `CFG_TUD_CDC == 1`, which is
the only thing keeping the instance index at 0.

The split matters. The app talks to CDC. If the app crashes or you close it
mid-write, the keyboard keeps working, because key reports never went through the
serial path. And the OS sees a standard HID keyboard, so there is no driver and the
app can be a plain web page.

`stdio_init_all()` is deliberately **never called**. The pico-sdk's `stdio_usb`
spins up its own TinyUSB device with its own CDC interface, which collides with
ours: the host would see two serial ports and the app would open the wrong one, or
both stacks would fight over the USB hardware and enumeration would fail. This is
a real footgun and it is commented in `main.c` for that reason.

Replies go into a 4-slot TX ring rather than being sent inline, because CDC can be
momentarily full and a reply must not be dropped just because the host was not
reading yet — and because a `GET_CONFIG` sweep produces 7 frames that the handlers
should not have to pace themselves.

A malformed frame is answered with the status that says *why* — `BAD_CRC`,
`BAD_LENGTH` or `BAD_VERSION` — rather than one catch-all, because the three have
three different fixes and the app cannot tell them apart any other way. Bytes that
never formed a frame are dropped silently while the parser hunts for `A5 5A`:
replying to garbage would let one line glitch generate a flood of error frames.

## Scheduling

Superloop, no RTOS. Five things to do, one core, and an RTOS would add a scheduler,
stack sizing, and priority inversion on the flash write in exchange for nothing.

| Task | Cost | Period |
|---|---:|---|
| scan + debounce | ~3 µs | 1 ms |
| gesture engine | ~5 µs | 1 ms |
| dispatch | ~10 µs | on gesture |
| LED frame | ~25 µs | 16 ms (60 Hz) |
| USB pump | ~20 µs | every loop |
| flash commit | ~50 ms | on save only |

Idle load is well under 5%. The OLED, when you add it, is what will eat the budget:
I²C at 400 kHz for a 128×32 frame is ~1.5 ms, so render at 10 Hz, not 60.

Timing uses signed comparison against a target — `(int32_t)(now - next) >= 0` —
which is correct across the 32-bit ms wraparound at ~49.7 days of uptime. There is a
unit test for a hold that starts before the wrap and fires after it.

## Where the drift guards are

Three things have to agree or the app writes into the wrong bytes: the C structs,
`protocol.json`, and the JS codec. Nothing generates one from another, because that
would need a C parser or a template engine. Instead:

- `make -C firmware -f Makefile.host layout` dumps real `sizeof`/`offsetof` output
  from the compiled C to `layout.json`.
- `node host/tests/run.mjs` compares every size and offset in the JS codec against
  that dump, **in both directions** — a field in C that JS does not describe is a
  failure too.
- Both CRCs are re-implemented in JS and checked against the published standard
  test vectors (`"123456789"` → `0x29B1` and `0xCBF43926`). Two independent
  implementations agreeing is evidence; one agreeing with itself is not.
- `make -C firmware -f Makefile.host defaults` dumps the firmware's factory config
  as 1708 raw bytes, and the JS builds its own and they are compared **byte for
  byte**, with a `describeOffset()` helper that names the field in the failure
  message.

That last one is the strongest check in the project. It catches the case where both
sides are individually self-consistent and jointly wrong — which is the case that
actually ships bugs.

## What the tests cannot reach

The module split buys a lot, and it is worth being precise about what it does not
buy. Every `#ifndef *_NO_HW` block is compiled out of the host build, so the tests
never execute it. That is roughly 300 lines, and it is where the hardware-specific
bugs live, because the logic around it is the part that got tested.

Five real bugs were found in those blocks after the suite was green at 946
assertions. None of them could have been caught by a C unit test:

| Bug | Symptom on hardware | Why the tests could not see it |
|---|---|---|
| `XIP_BASE + 0x10000000 + off` | config never survived a reboot | `XIP_BASE` *is* `0x10000000`, so the read came from the far end of SRAM, and the verify-after-write always mismatched so every save reported failure. The host build has no `XIP_BASE` and the path is `#ifndef STORAGE_NO_HW`. |
| PIO bit loop with T0H == T1H | every LED one uniform colour | the tests assert on the packed DMA buffer, which was correct |
| one report descriptor shared by two HID interfaces | keyboard or knob silently dead, OS-dependent | `HID_DEV_NO_HW` replaces the whole file with a recording array |
| all parse errors reported as `BAD_CRC` | app misdiagnoses a version mismatch as line noise | the reply is built inside the CDC pump, which is `#ifndef USB_PROTO_NO_HW` |
| pin map documented against a 22-pin header | you solder every key from GP10 down to the wrong pin | not firmware at all — a documentation error, and the tests only ever check code |

Three of those are now machine-checked rather than merely commented on, because a
comment is not a test:

- **`tools/pio_timing.py`** parses `ws2812minie.pio`, resolves labels, and walks the
  bit loop once as a 0 and once as a 1 — treating the timeline as circular, because
  the datasheet's low time spans the bit boundary. It fails on T0H == T1H, on a high
  pulse outside 80–750 ns, on T1H < 2× T0H, on a low period near the 50 µs reset, on
  a mean bit rate far from 800 kHz, and on the divisor in `leds.c` no longer matching
  the loop. Reintroducing the original three-instruction loop makes it fail with a
  message naming the cause.
- **`tools/check_usb_descriptors.py`** verifies that each HID interface names its own
  descriptor array, that the callback actually switches on `itf`, that every
  `wDescriptorLength` is `sizeof()` of the array that interface returns, that report
  IDs are unique and each declared in exactly one descriptor, that no two endpoints
  share an address, that `CONFIG_TOTAL_LEN` budgets the descriptors listed, and that
  `CDC_INSTANCE` is in range for `CFG_TUD_CDC`.

- **`tools/check_board.py`** reads the pin map out of `board.h`, out of
  `protocol.json`, and out of the markdown table in `docs/HARDWARE.md`, and requires
  all three to agree. It derives the RP2040-Zero's header numbering rather than
  storing it, asserts GP0 = pin 23 and GP29 = pin 4, rejects any pin not on the main
  header, rejects GP16, and rejects collisions. Its failure message names the
  consequence: *"HARDWARE.md says K7 is GP26 but board.h says GP11 — you would solder
  it to the wrong pin."* The pin-map row in the table above is the bug that motivated
  it: the header numbers were wrong in all three places at once, consistently, so
  nothing internal disagreed.

All three run in `scripts/test-all.sh` alongside the C and JS suites, and via
`make verify`.

The other two are guarded differently. The `XIP_BASE` arithmetic cannot be checked
without hardware, so it is spelled out in a comment at the point of use; the status
mapping is documented in `docs/PROTOCOL.md` where an app author will actually read
it. Neither is as good as a test, and it is better to say so than to imply the
coverage is complete.

The pin-map checker is worth dwelling on because it is a different kind of test from
the other two. It does not check code at all — it checks that three documents agree.
That is normally not something you automate, and here it is the highest-value check
in the repository per line, because a wrong pin number is the one defect that is
invisible until you have a soldering iron in your hand and a multimeter in the other.

What would close the remaining gap properly is hardware-in-the-loop: flash the board, drive
`CMD_LED_TEST`, and photograph or instrument the result. That is a real option for
this project — the protocol already has a command whose only purpose is to put known
bytes on known LEDs — but it needs a board on a runner, which this repository does
not assume.

## Bugs the tests caught while this was being written

Worth recording, because they are the argument for the module split:

1. **A zero-length payload desynchronised the parser.** `PING` has no payload, so
   the parser sat in "reading payload" and swallowed the CRC low byte as data. The
   handshake was the first thing broken. Fixed in C, then found again in the JS
   decoder, which is exactly what having two implementations is for.
2. **Only LED 0 animated in `REACTIVE` mode.** The frame delta was computed inside
   the per-pixel loop and `last_ms` was updated on the first pixel, so `dt` was zero
   for pixels 1–8 and their flash never decayed.
3. **A wrong protocol version broke every subsequent frame.** Rejecting at the
   version byte left `len` unread bytes in the stream, so the next frame was hunted
   for inside someone else's payload. Version is now checked *after* the payload is
   consumed.
4. **The quadrature accumulator was a file static**, so it survived
   `gesture_init()` and a previous test's residue swallowed the first detent.
5. **Sticky modifiers were implemented as a down/up pair**, which does nothing at
   all — the OS sees Shift tapped with no key in between. Sticky now latches and is
   OR-ed into every subsequent report.
6. **The knob hold fired on the same tick the user started scrolling**, because the
   hold threshold was checked before rotation was decoded, so the "rotation cancels
   the hold" flag was not set yet.
7. **A single TX slot silently dropped replies** whenever a previous frame had not
   drained. Now a ring.

The four in `#ifndef *_NO_HW` blocks are listed in the section above, and are more
interesting: they were found after the suite was green, by reading the hardware-only
paths line by line once the board changed. Changing boards is a good moment for that
read, because a migration forces every hardware assumption back into view.
