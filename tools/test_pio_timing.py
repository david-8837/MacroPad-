#!/usr/bin/env python3
"""Regression tests for the Normand SK6812MINI-E source-waveform checker."""

import unittest

import pio_timing as timing


class TimingChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = timing.PIO_FILE.read_text()
        cls.driver = timing.LEDS_C.read_text()
        cls.constants = timing.c_driver_constants(cls.driver)

    def evaluate(self, text, constants=None):
        _, instrs, wt, wp = timing.parse_pio(text)
        ns = 1000 / self.constants["LED_PIO_CLOCK_MHZ"]
        results = {}
        for bit in (0, 1):
            high, low, period, _ = timing.timeline_for_bit(instrs, wt, wp, bit)
            results[bit] = {"high": high * ns, "low": low * ns,
                            "period": period * ns, "period_c": period}
        return results, timing.check_spec(results, constants or self.constants)

    def test_current_program_meets_each_detailed_limit(self):
        results, violations = self.evaluate(self.source)
        self.assertEqual(violations, [])
        self.assertEqual(results[0], {"high": 300, "low": 1000,
                                      "period": 1300, "period_c": 13})
        self.assertEqual(results[1], {"high": 700, "low": 600,
                                      "period": 1300, "period_c": 13})

    def test_old_short_bit_period_is_rejected(self):
        old = """.program ws2812minie
.side_set 1
.wrap_target
bitloop:
    out x, 1          side 0
    jmp !x, do_zero   side 1 [1]
    nop               side 1 [2]
do_zero:
    nop               side 0 [1]
.wrap
"""
        _, violations = self.evaluate(old)
        self.assertTrue(any("T0L" in v for v in violations), violations)
        self.assertTrue(any("period" in v for v in violations), violations)

    def test_t0h_outside_window_is_a_failure_not_a_note(self):
        mutant = self.source.replace("jmp !x do_zero    side 1 [2]",
                                     "jmp !x do_zero    side 1 [0]")
        self.assertNotEqual(mutant, self.source)
        _, violations = self.evaluate(mutant)
        self.assertTrue(any("T0H" in v for v in violations), violations)

    def test_unequal_bit_periods_are_rejected(self):
        mutant = self.source.replace("jmp bitloop       side 1 [3]",
                                     "jmp bitloop       side 1 [5]")
        self.assertNotEqual(mutant, self.source)
        _, violations = self.evaluate(mutant)
        self.assertTrue(any("periods differ" in v for v in violations), violations)

    def test_jumps_and_delays_must_be_understood(self):
        bad_condition = self.source.replace("jmp !x do_zero", "jmp x do_zero")
        with self.assertRaisesRegex(timing.PioParseError, "unsupported jump condition"):
            timing.parse_pio(bad_condition)
        bad_delay = self.source.replace("side 0 [5]", "side 0 [16]")
        with self.assertRaisesRegex(timing.PioParseError, "side-set delay"):
            timing.parse_pio(bad_delay)

    def test_divider_and_reset_guard_are_cross_checked(self):
        bad_clock = self.driver.replace("LED_PIO_CLOCK_MHZ * 1000000.0f",
                                        "8.0f * 1000000.0f")
        with self.assertRaisesRegex(timing.PioParseError, "clock divider"):
            timing.c_driver_constants(bad_clock)
        bad_reset = dict(self.constants, LED_RESET_GUARD_US=80)
        results, _ = self.evaluate(self.source)
        violations = timing.check_spec(results, bad_reset)
        self.assertTrue(any("reset guard" in v for v in violations), violations)
        bad_cycles = dict(self.constants, LED_SYMBOL_CYCLES=12)
        violations = timing.check_spec(results, bad_cycles)
        self.assertTrue(any("LED_SYMBOL_CYCLES" in v for v in violations), violations)


if __name__ == "__main__":
    unittest.main()
