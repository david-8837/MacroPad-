#!/usr/bin/env python3
"""
check_usb_descriptors.py — structural checks on the USB descriptor code.

Why this exists
---------------
`hid_dev.c` had a bug that compiled, linked, enumerated, and then made one of the
two HID functions silently do nothing: `tud_hid_descriptor_report_cb()` returned
one concatenated keyboard+consumer descriptor for BOTH HID interfaces, so the host
saw report ID 1 declared twice and report ID 2 declared twice and picked whichever
binding it liked. There is no error path for that. The keyboard worked, or the
knob's volume did, or neither, depending on the OS.

Nothing in the C unit tests can see it either — the host build compiles
`hid_dev.c` out entirely (`HID_DEV_NO_HW`) and records report calls in an array.

These checks are textual rather than a full USB parser, deliberately: the failure
modes that matter here are structural, and a structural check that is easy to read
is worth more than a thorough one nobody trusts. It verifies

  * every HID interface in the configuration descriptor names its OWN report
    descriptor array, and no two share one
  * `tud_hid_descriptor_report_cb` returns a different array per interface, i.e.
    it actually switches on `itf` rather than ignoring it
  * every interface's wDescriptorLength is `sizeof()` of the same array it hands
    to the callback
  * report IDs are distinct per interface, and each interface's descriptor
    declares the ID its `tud_hid_n_report()` call passes
  * no two endpoints claim the same address
  * CONFIG_TOTAL_LEN adds up to the descriptors actually listed

Usage
-----
    python3 tools/check_usb_descriptors.py           # report, exit 1 on failure
    python3 tools/check_usb_descriptors.py --check   # one line, for test-all.sh
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HID_DEV = ROOT / "firmware/src/usb/hid_dev.c"


def fail(problems: list[str], check: bool, msg: str) -> int:
    if check:
        print("  FAIL usb descriptors")
    for p in problems:
        print(f"    !! {p}")
    if not problems and not check:
        print(f"  {msg}")
    return 1 if problems else 0


def main(argv: list[str]) -> int:
    check = "--check" in argv
    try:
        src = HID_DEV.read_text()
    except OSError as e:
        print(f"FAIL cannot read {HID_DEV}: {e}")
        return 1

    problems: list[str] = []
    notes: list[str] = []

    # ── the interface enum ────────────────────────────────────────────────
    m = re.search(r"enum\s*\{\s*(ITF_NUM_[^}]*)\}\s*;", src)
    if not m:
        return fail(["could not find the ITF_NUM_* enum"], check, "")
    itf_names = [n.strip() for n in m.group(1).split(",") if n.strip()]
    itf_value = {name: i for i, name in enumerate(itf_names)}
    hid_itfs = [n for n in itf_names if "HID" in n and "TOTAL" not in n]

    # ── the report descriptor arrays ──────────────────────────────────────
    arrays = re.findall(r"static const uint8_t\s+(\w+)\[\]\s*=\s*\{", src)
    report_arrays = [a for a in arrays if "report" in a.lower()]
    if len(report_arrays) < len(hid_itfs):
        problems.append(
            f"{len(hid_itfs)} HID interfaces but only {len(report_arrays)} report "
            f"descriptor arrays ({report_arrays}); each interface needs its own"
        )

    # ── the callback must switch on itf ───────────────────────────────────
    cb = re.search(
        r"uint8_t const \*tud_hid_descriptor_report_cb\(uint8_t (\w+)\)\s*\{(.*?)\n\}",
        src, re.S)
    if not cb:
        problems.append("could not find tud_hid_descriptor_report_cb")
    else:
        param, body = cb.group(1), cb.group(2)
        if f"(void) {param}" in body or f"(void){param}" in body:
            problems.append(
                f"tud_hid_descriptor_report_cb ignores its `{param}` argument. That is "
                "correct for ONE interface holding several collections, and wrong for "
                "several interfaces: each must get its own descriptor or the host sees "
                "the same report IDs declared twice."
            )
        returned = re.findall(r"return\s+(\w+)\s*;", body)
        distinct = [r for r in dict.fromkeys(returned) if r in report_arrays]
        if len(distinct) < len(hid_itfs):
            problems.append(
                f"the callback returns {len(distinct)} distinct descriptor array(s) "
                f"{distinct} for {len(hid_itfs)} HID interfaces"
            )
        # each HID interface should be named in the switch
        for itf in hid_itfs:
            if itf not in body:
                problems.append(f"the callback never tests for {itf}")

    # ── configuration descriptor: one TUD_HID_DESCRIPTOR per interface ────
    cfg = re.search(r"static const uint8_t desc_configuration\[\]\s*=\s*\{(.*?)\n\};", src, re.S)
    if not cfg:
        problems.append("could not find desc_configuration")
    else:
        cfgbody = cfg.group(1)
        hids = re.findall(
            r"TUD_HID_DESCRIPTOR\(\s*(\w+)\s*,[^,]*,[^,]*,\s*sizeof\((\w+)\)\s*,\s*(\w+)",
            cfgbody)
        if len(hids) != len(hid_itfs):
            problems.append(
                f"{len(hids)} TUD_HID_DESCRIPTOR entries for {len(hid_itfs)} HID interfaces"
            )
        seen_arrays: dict[str, str] = {}
        seen_eps: dict[str, str] = {}
        for itf, arr, ep in hids:
            if arr in seen_arrays:
                problems.append(
                    f"{itf} and {seen_arrays[arr]} both declare sizeof({arr}) — two "
                    "interfaces sharing one report descriptor is the bug this checks for"
                )
            seen_arrays[arr] = itf
            if arr not in report_arrays:
                problems.append(f"{itf} names sizeof({arr}) but there is no such array")
            if ep in seen_eps:
                problems.append(f"{itf} and {seen_eps[ep]} both use endpoint {ep}")
            seen_eps[ep] = itf
            notes.append(f"{itf} -> {arr}, endpoint {ep}")

        # endpoint addresses must be unique across the whole device
        ep_defs = dict(re.findall(r"#define\s+(EPNUM_\w+)\s+(0x[0-9A-Fa-f]+)", src))
        by_addr: dict[str, list[str]] = {}
        for name, addr in ep_defs.items():
            by_addr.setdefault(addr.lower(), []).append(name)
        for addr, names in by_addr.items():
            if len(names) > 1:
                problems.append(f"endpoint address {addr} is claimed by {names}")

        # CONFIG_TOTAL_LEN must account for the descriptors listed
        # Balanced-paren scan rather than a regex: the expression contains nested
        # parens, and a regex for those either backtracks pathologically or, as the
        # first version here did, stops at the first inner ')' and silently reads a
        # truncated expression - which then reports a missing term that is present.
        expr = None
        dm = re.search(r"#define\s+CONFIG_TOTAL_LEN\s*\(", src)
        if dm:
            i = dm.end() - 1          # at the '('
            depth = 0
            for j in range(i, len(src)):
                if src[j] == "(":
                    depth += 1
                elif src[j] == ")":
                    depth -= 1
                    if depth == 0:
                        expr = src[i + 1:j]
                        break
        if expr is None:
            problems.append("could not find CONFIG_TOTAL_LEN")
        else:
            n_hid = len(re.findall(r"TUD_HID_DESC_LEN", expr))
            mult = re.search(r"(\d+)\s*\*\s*TUD_HID_DESC_LEN", expr)
            effective = int(mult.group(1)) if mult else n_hid
            if effective != len(hids):
                problems.append(
                    f"CONFIG_TOTAL_LEN budgets {effective} HID descriptors but the "
                    f"configuration lists {len(hids)}"
                )
            for needed in ("TUD_CONFIG_DESC_LEN", "TUD_CDC_DESC_LEN"):
                if needed not in expr:
                    problems.append(f"CONFIG_TOTAL_LEN omits {needed}")

    # ── report IDs: distinct, and declared where they are sent ────────────
    rid = re.search(r"enum\s*\{\s*(RPT_ID_[^}]*)\}\s*;", src)
    if not rid:
        problems.append("could not find the RPT_ID_* enum")
    else:
        ids = {}
        for name, val in re.findall(r"(RPT_ID_\w+)\s*=\s*(\d+)", rid.group(1)):
            if val in ids:
                problems.append(f"report ID {val} is used by both {ids[val]} and {name}")
            ids[val] = name
        sent = dict.fromkeys(re.findall(
            r"tud_hid_n_report\(\s*(\w+)\s*,\s*(\w+)", src))
        for (call_itf, call_id) in sent:
            if call_id.startswith("RPT_ID_") and call_id not in ids.values():
                problems.append(f"tud_hid_n_report passes undefined {call_id}")
            notes.append(f"{call_itf} sends report ID {call_id}")
        # each declared ID should appear in exactly one descriptor array
        for val, name in ids.items():
            hits = re.findall(rf"HID_REPORT_ID\s*\(\s*{name}\s*\)", src)
            if not hits:
                problems.append(
                    f"{name} is passed to tud_hid_n_report but no descriptor declares "
                    "it, so the host will discard every report on that interface"
                )
            elif len(hits) > 1:
                problems.append(f"{name} is declared in {len(hits)} descriptors")

    # ── the CDC instance index usb_proto.c uses ───────────────────────────
    # tud_cdc_n_* takes an INSTANCE index (0..CFG_TUD_CDC-1), not the USB
    # interface number. hid_dev.c numbers CDC as ITF_NUM_CDC = 2, and
    # usb_proto.c addresses it as instance 0. Both are right and they are
    # supposed to differ; what must not happen is the instance index drifting
    # out of range, or the CFG_TUD_CDC == 1 assumption quietly going away.
    proto = ROOT / "firmware/src/usb/usb_proto.c"
    cfg_cdc = re.search(r"#define\s+CFG_TUD_CDC\s+(\d+)",
                        (ROOT / "firmware/src/usb/tusb_config.h").read_text())
    n_cdc = int(cfg_cdc.group(1)) if cfg_cdc else None
    psrc = proto.read_text()
    inst = re.search(r"#define\s+CDC_INSTANCE\s+(\d+)", psrc)
    if not inst:
        problems.append("usb_proto.c no longer defines CDC_INSTANCE")
    else:
        val = int(inst.group(1))
        if n_cdc is None:
            problems.append("could not find CFG_TUD_CDC in tusb_config.h")
        elif val >= n_cdc:
            problems.append(
                f"CDC_INSTANCE is {val} but CFG_TUD_CDC is {n_cdc}, so every "
                "tud_cdc_n_* call in usb_proto.c is out of range and silently does nothing"
            )
        # the interface number must NOT have been substituted for the instance
        cdc_itf = itf_value.get("ITF_NUM_CDC")
        if cdc_itf is not None and val == cdc_itf and n_cdc == 1:
            problems.append(
                f"CDC_INSTANCE is {val}, which is ITF_NUM_CDC (the USB interface "
                "number), not the TinyUSB instance index. With one CDC interface "
                "the instance index is 0."
            )
        if "_Static_assert(CFG_TUD_CDC == 1" not in src:
            problems.append(
                "hid_dev.c no longer asserts CFG_TUD_CDC == 1, which is the only "
                "thing keeping CDC_INSTANCE 0 valid"
            )
        notes.append(f"CDC instance {val} of {n_cdc} (USB interface ITF_NUM_CDC={cdc_itf})")

    if not check:
        print(f"{HID_DEV.relative_to(ROOT)}")
        print(f"  interfaces: {', '.join(f'{n}={v}' for n, v in itf_value.items())}")
        for n in notes:
            print(f"    {n}")

    if problems:
        return fail(problems, check, "")
    if check:
        print(f"  PASS usb descriptors — {len(hid_itfs)} HID interfaces, "
              f"{len(report_arrays)} distinct report descriptors, endpoints unique, "
              "CDC instance in range")
    else:
        print("  OK — one distinct report descriptor per HID interface, the callback "
              "switches on itf, lengths and endpoints agree, report IDs unique and declared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
