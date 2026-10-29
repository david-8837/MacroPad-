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
1389 assertions run in 0.3 s instead of requiring a board, a cable, and a human
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

Normal unflagged keyboard slots are an exception to gesture-triggered actions:
the dispatcher sends HID key-down on the debounced physical press and key-up on
release. Simultaneous slots are combined in a 6-key rollover report. The OS
provides typing repeat. Gesture events are still reported but do not replay the
keyboard action. Layer changes, live config replacement and USB reconnect release
held keys; a switch already held must be released and pressed again. Flagged
legacy actions and non-keyboard actions retain their gesture behavior. This is in
the repository firmware and the updated Keys & Knob image; the original supplied
Full Deck binary is unchanged and its hold behavior is unverified.

Two rules prevent the two worst failure modes for gesture-based actions:

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

`led_compute_frame()` is pure: config + state in, 27 bytes out, no hardware. The
browser simulates its result, but **default firmware does not drive any strip**:
GP10 is held LOW only after initialization, `CAP_LED_OUTPUT` is absent and physical
preview/raw commands return `LED_DISABLED`. A bench-enabled build restores the
PIO/DMA path under an external current-limited supply; this compile flag is not a
power-budget or startup-darkness guarantee. The strip has not been selected yet.

Colour space is HSV with hue as a 16-bit value, so a hue ramp is an integer
increment and there is no floating point anywhere in the frame path. Gamma is a
256-byte table in flash — without it a linear 0–255 ramp looks like "off, off, off,
ON" and `BREATH` stalls at the bottom then snaps.

The four-instruction PIO program runs at 10 MHz (100 ns/cycle). Each of the
zero- and one-bit paths takes 13 cycles = 1.30 µs, within the named Normand
SK6812MINI-E Rev.02 minimum 1.20 µs symbol period. Simulated pulses are
T0H/T0L = 300/1000 ns and T1H/T1L = 700/600 ns; each satisfies its separate
datasheet limit. A 32-bit FIFO word carries one pixel with the GRB bytes in
bits **31..8**, because the PIO shifts MSB-first and autopulls after 24 bits.
Actual GP10 and buffered DIN timing still require scope measurement.

The bit loop needs **four** instructions and the reason is worth stating because the
three-instruction version looks obviously correct. A `jmp`'s `[n]` delay applies
whether or not the branch is taken, so a delay on the `jmp` lengthens the high pulse
for *both* bit values. The extra one-bit time therefore has to live in an
instruction the zero-bit **skips**, which means the not-taken path needs somewhere
to go. With only a `jmp` to the immediately-following instruction, both paths run
the same instructions for the same duration and T0H equals T1H: the wire carries no
data at all. `tools/pio_timing.py` simulates the loop and fails on exactly that.

The reset/latch requirement is **>80 µs LOW** for the named LED. When DMA ends,
the PIO stalls LOW on an empty TX FIFO; the driver waits for that FIFO to empty,
then allows up to one final pixel plus a guarded 100 µs LOW interval before
starting another frame. This also protects back-to-back raw LED test commands;
the normal 60 Hz animation has much more time between frames.

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

HID delivery has a **separate bounded FIFO for each interface** (64 keyboard
reports, 16 consumer reports). Each TEXT action is at most 31 characters, hence
62 keyboard down/up reports fit even while the action's inter-character delay
blocks the superloop. `hid_dev_task()` services USB and submits the head of each
ready interface; the queue advances only on TinyUSB's successful INPUT completion
callback. Submission rejection or transfer failure leaves that head available for
retry; a busy keyboard endpoint does not stall consumer release. If a queue fills,
intermediate taps are sacrificed: preserve an already in-flight report, insert a
neutral all-up/consumer-zero barrier, then retain the latest requested state.
The last release must survive until USB recovers. On disconnect/suspend, old
queued presses are discarded; remount/resume starts with neutral reports instead
of replaying stale downs. BOOTSEL supersedes unsent presses with zeros and waits
up to 100 ms for completions before detaching. A permanently busy or disconnected
host **cannot be guaranteed** to receive a report; no firmware queue changes
that hardware fact. Test this policy on a real OS/USB host before release.

The normal `HID_DEV_NO_HW` test recorder cannot reproduce endpoint stalls, so
`tests/test_hid_hw.c` also compiles the **production** HID, actions and channel
paths with controllable fake TinyUSB endpoints. It checks sustained busy states,
rejected submissions, successful/failed callbacks, per-interface ordering,
overflow, channel-switch releases, disconnect/resume and the bounded BOOTSEL path.
This is transport-logic validation, **not** an ARM build or a physical USB trace.

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

### Which paths the app actually uses

The CDC port speaks the binary MPAD3 frame protocol, and the app now uses it for
every direction except the OLED settings:

| What | Frames | Code |
| :--- | :--- | :--- |
| Upload the deck | `GET_CONFIG` (one per chunk) → `SET_CONFIG` ×9 → `COMMIT` | `App.handleSyncEEPROM` → `hardwareBridge.uploadDeck` → `src/utils/deckToConfig.ts`; locked decks and OLED NEXT without a detected panel fail before writes |
| Lighting | `GET_LIGHTING`, gated `PREVIEW_LIGHTING`, `SET_LIGHTING` | `ViaLightingPanel` → `hardwareBridge` → `Mpad3Link`; Save persists even with output off |
| Raw LED bench test | `LED_TEST` requires `CAP_LED_OUTPUT`, returns `SET_ACK`/`LED_DISABLED` and auto-expires in 300 ms | Explicit diagnostic API, **not** a "Clear" button |
| Physical input | unsolicited `KEY_EVENT` (0xC0) | `Mpad3Link.dispatch` → `hardwareBridge.handleLinkEvent` → `notifyInput` / `notifyChannel`; non-empty firmware `OLED_NEXT` actions are not replayed on PC |
| Legacy/diagnostic OLED ASCII | `OLED:NEXT`, `OLED:MODE:<n>`, `OLED:AUTO:<s>`, `OLED:PL:<mask>`, `OLED:CH:<n>` (no application-level channel ACK) | `firmware/src/core/ascii_cmd.c`; editor layer clicks **never** send `OLED:CH` |

Two paths used to exist and no longer do:

- **`SYNC_KEYMAP`** — a JSON object written straight to the serial port. Nothing on
  the device parses JSON, so it "succeeded" whenever the port accepted the bytes
  and changed nothing on the pad. Upload is now a real config write, and the number
  it reports is what the pad acknowledged with `COMMIT_ACK`.
- **Serial text events (`KEY:0:DOWN`, `ENV:CW`, `CHANNEL:2`)** — the app subscribed
  to lines this firmware never sends, so a physical key press never reached the
  editor. Those notifications now come from `KEY_EVENT` frames. The line parser is
  kept only because `ascii_cmd.c` still answers the `OLED:` family.

Only reviewed MPAD3 quick assignments are offered: keyboard taps, consumer HID media, absolute `CHANNEL` keys, clearing a slot, and **PC-owned M0–M15**. A macro uploads as firmware `NONE`, so an unsolicited `KEY_EVENT` (with the event's own channel and `firmwareAction=NONE`) runs its saved PC steps through the native desktop executor. Firmware `CAP_EVENTS` reports support independently of `global.usbReportEvents` (the current on/off setting is in `GET_CONFIG`). The upload preflight rejects missing/unsupported macro steps, absent native shell or event capability, and an event-disabled pad unless the user explicitly enables `usbReportEvents` in the same verified transaction. The PC must remain open and connected. Shortcuts like Ctrl+C still fit one firmware `cfg_action_t` (HID modifier mask in `code`'s high byte).

The upload report distinguishes **desktop** actions (apps, PC macros, long text, safety confirmations) from **unavailable** legacy QMK keycodes or unmappable actions. It never claims raw `MO(1)`/RESET/mouse codes or unimplemented MIDI run on this pad or the PC. Editor/sidebar/palette/twin layer clicks only select an editing preview. Only an actual `CHANNEL_CHANGE` event can update the separate *device-reported* channel (unknown until received); a physical knob hold or uploaded `CHANNEL` key changes the pad.

## Scheduling

Superloop, no RTOS. Five things to do, one core, and an RTOS would add a scheduler,
stack sizing, and priority inversion on the flash write in exchange for nothing.

| Task | Cost | Period |
|---|---:|---|
| scan + debounce | ~3 µs | 1 ms |
| gesture engine | ~5 µs | 1 ms |
| dispatch | ~10 µs | on gesture |
| LED frame | ~150 µs source estimate, including a conservative 132 µs latch wait | 16 ms (60 Hz) |
| USB pump | ~20 µs | every loop |
| flash commit | ~50 ms | on save only |

These are source-side estimates, not measured CPU load. The required OLED's
512-byte I²C frame at 400 kHz takes about 12 ms on the bus; local animations
use a lower refresh rate rather than competing with the 1 ms scan tick.

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
  as 2272 raw bytes (format v3). The JS builds its own; they are compared **byte
  for byte**, with a `describeOffset()` helper that names the field in failures.
- Neither dump is committed: `firmware/build-host/` is build output, so
  `npm test` starts with `node scripts/host-artifacts.mjs`, which runs
  `make -C firmware -f Makefile.host hostartifacts` when either file is missing.

That last one is the strongest check in the project. It catches the case where both
sides are individually self-consistent and jointly wrong — which is the case that
actually ships bugs.

## What the tests cannot reach

The normal host build compiles out `#ifndef *_NO_HW` branches. Separate fake-SDK
host tests now compile and execute the production OLED I²C path, LED PIO/DMA
initialization/packing path, and TinyUSB HID delivery branch; the PIO instruction
loop has its own source simulator. These are stronger source checks, **not** proof
of signal voltage, clock accuracy, USB behavior on a real host, soldering or power
draw on the RP2040-Zero.

Five real bugs were found in those blocks after the original suite was green at
946 assertions. None of them was exercised by that recorder-only host suite:

| Bug | Symptom on hardware | Why the tests could not see it |
|---|---|---|
| `XIP_BASE + 0x10000000 + off` | config never survived a reboot | `XIP_BASE` *is* `0x10000000`, so the read came from the far end of SRAM, and the verify-after-write always mismatched so every save reported failure. The host build has no `XIP_BASE` and the path is `#ifndef STORAGE_NO_HW`. |
| Original PIO bit loop with T0H == T1H | every LED one uniform colour | old host tests exercised colour maths only, not actual PIO instructions or MSB-aligned DMA words |
| one report descriptor shared by two HID interfaces | keyboard or knob silently dead, OS-dependent | `HID_DEV_NO_HW` replaces the whole file with a recording array |
| all parse errors reported as `BAD_CRC` | app misdiagnoses a version mismatch as line noise | the reply is built inside the CDC pump, which is `#ifndef USB_PROTO_NO_HW` |
| pin map documented against a 22-pin header | you solder every key from GP10 down to the wrong pin | not firmware at all — a documentation error, and the tests only ever check code |

Three of those are now machine-checked rather than merely commented on, because a
comment is not a test:

- **`tools/pio_timing.py`** follows both conditional and unconditional PIO
  branches, counts each 0/1 symbol's exact instruction cycles, and treats the
  timeline as circular so low time includes the following bit's leading LOW.
  It fails on any named Normand Rev.02 high/low or 1.20 µs symbol-period limit,
  unequal path lengths, an out-of-range delay, or a C clock/reset guard that
  disagrees with the PIO program. `tools/test_pio_timing.py` mutates known-bad
  paths to prove the checker rejects them. The fake-SDK `test_led_hw.c` compiles
  the real `% c-sdk` init block and DMA driver and checks normal GPIO polarity,
  MSB-aligned GRB words, source-buffer lifetime and the inter-frame reset wait.
  `test_led_locked.c` compiles the other real target branch: it checks GP10's
  output latch is LOW before enabling output and that full-white frame requests
  cannot touch PIO/DMA. Firmware protocol tests run in **both** gated and bench
  builds, checking capability, rejected preview/raw commands, saved settings and
  a 300-ms wrap-safe raw expiry. These are source tests; boot/reset level, strip
  5 V waveform, latched pixels and current still need physical instruments.
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

What would close the gap is physical commissioning **after** choosing a cuttable
strip and 5 V supply, deriving the LED-only budget and measuring startup/reset
levels, waveforms and current. Only a deliberately bench-enabled firmware build
may accept a short `CMD_LED_TEST` on a current-limited supply; the normal build
rejects it. The required board and instruments are not available to these tests.

### The desktop side's Windows calls

The same honesty applies to the Electron half. Everything that talks to Windows —
`typeperf`, the GPU counters, the ACPI thermal zone, the media session (SMTC), the
WASAPI interop in `audio.cs` — is a `powershell.exe` call, and none of it can run on
a Linux runner or in this container.

The split is deliberate: **the parsing is pure and tested, the call is not.**
`tests/media.test.cjs` feeds `parseNowPlaying()` the payload shapes Windows actually
returns (ticks, `hh:mm:ss`, ISO timestamps, `PlaybackStatus` as both enum name and
number) and checks the extrapolation, the 5 s drift cap and the empty-session case;
`tests/systemMetrics.test.cjs` checks that an unmeasured value is `null` and that a
measured one names its source. The PowerShell invocation itself is only exercised on
a Windows machine, which is why `audioControl` skips rather than fails elsewhere and
why the drawer prints `--` instead of a number when the bridge is absent.

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
