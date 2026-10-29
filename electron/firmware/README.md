# Bundled firmware images

This folder is packaged as an external firmware resource.

- `full-deck.uf2` is the user-supplied `MacroPad Full Firmware UNTESTED.uf2`
  from commit `ee2e344da24b3a87e34df14e1708acd9187b88ec`.
  SHA-256: `40b1acebd31d45ddfd070929ab9193ae75d4910e0b52f60d5e52c97f67577206`.
  It passes structural RP2040 UF2 checks but has not been verified to boot or
  confirmed against an assembled pad, wiring, firmware source, keyboard-hold
  behavior or LED settings. This original image was not replaced or patched.
- `keys-and-knob.uf2` is built from this repository's Pico SDK C firmware with
  `MPAD_KEYS_ONLY=ON`, Waveshare RP2040-Zero, Pico SDK 2.1.1 and GNU Arm
  Embedded 9.3.1. SHA-256:
  `b32365c1d4b2b9ea9e39c3f281f589aa68d37fffd16c7a6ea652802d11ef1a2f`.
  It is structurally checked and host-tested, but has **not** been boot-tested
  on a physical pad. It uses the same key and encoder pin map as the full model.
  Normal unflagged keyboard keys now stay down until physical release; the OS
  provides normal text repeat. Other action types retain gesture behavior.

To rebuild the second image with Pico SDK and an ARM compiler installed:

```sh
cmake -S firmware -B firmware/build/keys-only -DPICO_BOARD=waveshare_rp2040_zero -DMPAD_KEYS_ONLY=ON
cmake --build firmware/build/keys-only -j4
make -C firmware -f Makefile.host test-keys-only
```

Inspect and bench-test the image before replacing the bundled file; do not assume
that a new build is equivalent to the previously checked binary.

The app requires acknowledgement before flashing an untested image. Validate
board, pinout, features and boot on real hardware before marking an image tested.
The app's structural check cannot prove hardware compatibility or bootability.
