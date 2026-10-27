# ─────────────────────────────────────────────────────────────────────────────
# mpad3 — top-level convenience targets.
#
#   make test      everything that needs no toolchain: unit tests, protocol suite,
#                  PIO waveform simulation, USB descriptor checks
#   make arm       cross-compile firmware/build/mpad3.uf2       (needs setup.sh first)
#   make all       test, then arm
#   make verify    the three checkers for code/docs the unit tests cannot reach
#   make docs      regenerate docs/PROTOCOL.md and the TypeScript types
#   make clean     remove host build artifacts (leaves firmware/build alone)
#   make distclean remove every build artifact including firmware/build
#
# scripts/test-all.sh does the same as `make all` with nicer output, a UF2
# validation step, and a non-zero exit wired per-step. Use either.
# ─────────────────────────────────────────────────────────────────────────────

PICO_SDK_PATH ?= $(CURDIR)/pico-sdk
export PICO_SDK_PATH

.PHONY: all test arm docs clean distclean layout defaults verify pio usb board

all: test arm

# Host artifacts first: the Node suite diffs against layout.json and defaults.bin,
# which are produced from the compiled C. Running them out of order would test
# against a stale dump and pass for the wrong reason.
test: layout defaults
	@$(MAKE) -C firmware -f Makefile.host test
	@node host/tests/run.mjs
	@$(MAKE) -s verify

# The two checkers for code the unit tests structurally cannot reach: everything
# inside #ifndef *_NO_HW is compiled out of the host build. See
# docs/ARCHITECTURE.md, "What the tests cannot reach".
verify: board pio usb

pio:
	@python3 tools/pio_timing.py

usb:
	@python3 tools/check_usb_descriptors.py

board:
	@python3 tools/check_board.py

layout:
	@$(MAKE) -s -C firmware -f Makefile.host layout

defaults:
	@$(MAKE) -s -C firmware -f Makefile.host defaults

arm:
	@cmake -S firmware -B firmware/build -DPICO_BOARD=waveshare_rp2040_zero
	@cmake --build firmware/build -j4
	@ls -l firmware/build/mpad3.uf2

docs:
	@python3 tools/gen_protocol.py

clean:
	@$(MAKE) -s -C firmware -f Makefile.host clean

distclean: clean
	@rm -rf firmware/build
