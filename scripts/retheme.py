#!/usr/bin/env python3
"""
retheme.py — migrate MacroPad's UI to the Reality-First design system.

Deterministic, idempotent pass over src/**/*.{tsx,ts,css}:

  1. every colour hex is remapped into the cream/ink/blue/gray/muted palette
  2. every radius utility is deleted (0px is a rule, not a preference)
  3. every shadow utility is deleted (depth = 1px rules + flat blocks)
  4. backdrop-blur / gradients are deleted (no glass, no gradients)
  5. white/black alpha overlays become explicit flat tones
  6. `glass-panel` becomes `panel`

Run: python3 scripts/retheme.py
"""
import re
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# ---------------------------------------------------------------- palette ----
BLUE = "#1351AA"
INK = "#141414"
CREAM = "#E3E2DE"
GRAY = "#444343"
MUTED = "#7A7A7A"
LINE = "#C7C7C7"
SURFACE = "#FFFFFF"
WELL = "#EDECE8"

# Families, most specific first.
FAMILY = {
    # --- orange / amber / gold  -> cobalt (the single accent) -----------------
    "orange": """FF5E00 FF7A1A FF6A00 FF9100 FF8A00 FF8C00 FF8000 FF7F00 FF701A
        FF8A2A FFA024 FFA033 FFB04D FFB800 E65100 D44400 EA5400 B83600
        F59E0B E5C158 D4AF37 8C6D1F 7D5B14 423207 3B2904""".split(),
    # --- cyan / azure / blue -> cobalt ---------------------------------------
    "cyan": """00F0FF 06B6D4 0284C7 00A3FF 3B82F6 818CF8 0000FF""".split(),
    # --- green / success -> cobalt (no second hue) ----------------------------
    "green": """38EF7D 10B981 2DD36F 2ED56B 00FF00""".split(),
    # --- purple / magenta / pink -> deep gray (de-emphasised) ----------------
    "violet": """BD00FF A855F7 9D00FF 9400D3 7E22CE 8B5CF6 4B0082 EC4899
        F472B6 FF3366 F43F5E""".split(),
    # --- red / danger -> ink (destructive = heavyweight black, not red) ------
    "danger": """FF2A2A EF4444 FF0000 FFFF00""".split(),
}

# Layer accents stay monochrome: blue / ink / muted keep three layers distinguishable
# without introducing a second hue.
HEX_MAP = {}
for family, hexes in FAMILY.items():
    for h in hexes:
        HEX_MAP[h.upper()] = {
            "orange": BLUE, "cyan": BLUE, "green": BLUE,
            "violet": GRAY, "danger": INK,
        }[family]

# Dark chassis / surface greys -> white panels.
DARK = """0C0E14 10131B 121620 161B26 0F1218 121622 141824 0E1118 181C26
    0B0D13 12151C 151923 0B0E16 0C0F16 242A38 202636 1E2436 181D2A 141720
    131722 12151F 171A24 171920 161D2C 161922 161224 160B0E 151A26 15171C
    141926 141722 13161F 12141C 0F1217 0F1117 0E1119 0D1217 0D101A 0A0C12
    0A0C10 090B10 080B10 080A0E 07090E 090C12 0A0D14 0D1017 11141C 101420
    0F131D 12161F 141822 151924 171D2B 191012 191D2A 191F2D 1A1D24 1A1F2B
    1B202B 1C2232 1E2330 222838 242C3E 2C3345 2D3546 1B2533 181D2D 212733
    281F3B 1D172A 252830 2B2F38 2A2E3D 414652 4A4F5B 7C8392 8B93A3 7E8594
    251518 242A38 23273% """  # placeholder trimmed below
DARK = """0C0E14 10131B 121620 161B26 0F1218 121622 141824 0E1118 181C26
    0B0D13 12151C 151923 0B0E16 0C0F16 242A38 202636 1E2436 181D2A 141720
    131722 12151F 171A24 171920 161D2C 161922 161224 160B0E 151A26 15171C
    141926 141722 13161F 12141C 0F1217 0F1117 0E1119 0D1217 0D101A 0A0C12
    0A0C10 090B10 080B10 080A0E 07090E 090C12 0A0D14 0D1017 11141C 101420
    0F131D 12161F 141822 151924 171D2B 191012 191D2A 191F2D 1A1D24 1A1F2B
    1B202B 1C2232 1E2330 222838 242C3E 2C3345 2D3546 1B2533 181D2D 212733
    281F3B 1D172A 252830 2B2F38 2A2E3D 414652 4A4F5B 7C8392 8B93A3 7E8594
    251518 23273 1E2430 1C1E24 262A33 121316 05070A 0D1217 090A0C 171920
    0D1017 090B10""".split()
for h in DARK:
    HEX_MAP.setdefault(h.upper(), SURFACE)

# --- alpha overlays ---------------------------------------------------------
# text-white/90 = body · /60 = secondary · /40 = label · /20 = disabled
TEXT_ALPHA = [
    ("100", INK), ("90", GRAY), ("80", GRAY), ("70", GRAY),
    ("60", GRAY), ("50", MUTED), ("40", MUTED), ("30", MUTED),
    ("20", MUTED), ("10", MUTED), ("5", MUTED),
]
BG_ALPHA = [
    ("5", "#F4F3F0"), ("10", WELL), ("15", WELL), ("20", CREAM),
    ("30", LINE), ("40", LINE), ("50", LINE),
]
BORDER_ALPHA = [
    ("5", CREAM), ("10", CREAM), ("15", LINE), ("20", LINE),
    ("30", MUTED), ("40", MUTED), ("50", MUTED),
]


def remap_hexes(text: str) -> str:
    def sub(m):
        h = m.group(0)[1:].upper()
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return HEX_MAP.get(h, m.group(0))
    return re.sub(r"#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}\b", sub, text)


RGBA_MAP = {
    (255, 94, 0): (19, 81, 170), (255, 106, 0): (19, 81, 170),
    (234, 84, 0): (19, 81, 170), (212, 68, 0): (19, 81, 170),
    (0, 240, 255): (19, 81, 170), (16, 185, 129): (19, 81, 170),
    (56, 239, 125): (19, 81, 170), (189, 0, 255): (68, 67, 67),
    (168, 85, 247): (68, 67, 67), (255, 42, 42): (20, 20, 20),
    (239, 68, 68): (20, 20, 20),
}


def remap_rgba(text: str) -> str:
    def sub(m):
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if (r, g, b) in RGBA_MAP:
            nr, ng, nb = RGBA_MAP[(r, g, b)]
            return f"rgba({nr}, {ng}, {nb}{m.group(4)}"
        return m.group(0)
    return re.sub(r"rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})((?:,\s*[\d.]+)?\))", sub, text)


def remap_alpha(text: str) -> str:
    for val, hexv in TEXT_ALPHA:
        text = re.sub(rf"text-white/{val}\b", f"text-[{hexv}]", text)
        text = re.sub(rf"text-black/{val}\b", f"text-[{hexv}]", text)
    for val, hexv in BG_ALPHA:
        text = re.sub(rf"bg-white/{val}\b", f"bg-[{hexv}]", text)
        text = re.sub(rf"bg-black/{val}\b", f"bg-[{hexv}]", text)
    for val, hexv in BORDER_ALPHA:
        text = re.sub(rf"border-white/{val}\b", f"border-[{hexv}]", text)
        text = re.sub(rf"border-black/{val}\b", f"border-[{hexv}]", text)
        text = re.sub(rf"divide-white/{val}\b", f"divide-[{hexv}]", text)
        text = re.sub(rf"ring-white/{val}\b", f"ring-[{hexv}]", text)
        text = re.sub(rf"placeholder-white/{val}\b", f"placeholder-[{hexv}]", text)

    # white surface with an alpha suffix (from bg-white/90 after hex remap)
    text = re.sub(r"(bg-\[#FFFFFF\])/\d+", r"\1", text)
    text = re.sub(r"(bg-\[#E3E2DE\])/\d+", r"\1", text)

    # bare white / black utilities
    text = re.sub(r"\btext-white\b", f"text-[{INK}]", text)
    text = re.sub(r"\btext-black\b", f"text-[{CREAM}]", text)
    text = re.sub(r"\bbg-white\b", f"bg-[{SURFACE}]", text)
    text = re.sub(r"\bbg-black\b", f"bg-[{WELL}]", text)
    text = re.sub(r"\bborder-white\b", f"border-[{LINE}]", text)
    text = re.sub(r"\bborder-black\b", f"border-[{LINE}]", text)
    text = re.sub(r"\bdivide-white\b", f"divide-[{LINE}]", text)
    text = re.sub(r"\bring-white\b", f"ring-[{LINE}]", text)
    text = re.sub(r"\bplaceholder-white\b", f"placeholder-[{MUTED}]", text)
    text = re.sub(r"\bcaret-white\b", f"caret-[{BLUE}]", text)
    text = re.sub(r"\bfrom-white\b", f"from-[{SURFACE}]", text)
    text = re.sub(r"\bvia-white\b", f"via-[{SURFACE}]", text)
    text = re.sub(r"\bto-white\b", f"to-[{SURFACE}]", text)
    return text


VARIANT = r"(?:[a-zA-Z0-9-]+:)*"          # hover: focus: group-hover: md: ...
RADIUS = re.compile(
    rf"(?:^|\s){VARIANT}(?:-)?rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e))?(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?\b")
SHADOW = re.compile(
    rf"(?:^|\s){VARIANT}(?:-)?(?:drop-)?shadow(?:-(?:none|sm|md|lg|xl|2xl|inner|key|key-raised|key-pressed|chassis|knob|orange-glow|\[[^\]]+\]))?\b")
BLUR = re.compile(rf"(?:^|\s){VARIANT}backdrop-blur(?:-[a-zA-Z0-9]+)?\b")
GRADIENT = re.compile(
    r"(?:^|\s)bg-gradient-to-[a-z]{2}\b|(?:^|\s)(?:from|via|to)-(?:transparent|[a-zA-Z0-9]+(?:-\[[^\]]+\])?(?:/\d+)?)\b")


def strip_utilities(text: str) -> str:
    text = RADIUS.sub(" ", text)
    text = SHADOW.sub(" ", text)
    text = BLUR.sub(" ", text)
    # only strip from/via/to- modifiers that belong to a gradient utility name
    text = re.sub(r"(?:^|\s)bg-gradient-to-[a-z]{2}\b", " ", text)
    text = re.sub(r"(?:^|\s)from-(?:transparent|[a-z]+-\d+|\[[^\]]+\])\b", " ", text)
    text = re.sub(r"(?:^|\s)via-(?:transparent|[a-z]+-\d+|\[[^\]]+\])\b", " ", text)
    text = re.sub(r"(?:^|\s)to-(?:transparent|[a-z]+-\d+|\[[^\]]+\])\b", " ", text)
    return text


def tidy(text: str) -> str:
    # collapse runs of spaces inside className string literals only
    def collapse(m):
        return re.sub(r"[ \t]{2,}", " ", m.group(0))
    text = re.sub(r'"[^"\n]*"', collapse, text)
    text = re.sub(r"'[^'\n]*'", collapse, text)
    text = re.sub(r"`[^`]*`", collapse, text)
    return text


# Matches className="..."  className={'...'}  className={ ... }  class="..."
CLASS_ATTR = re.compile(
    r"""(className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})""",
    re.S,
)


def transform_classes(m: re.Match) -> str:
    """Rewrite only the class-list payload of a className attribute."""
    head = m.group(1)
    body = next(g for g in m.groups()[1:] if g is not None)

    body = remap_alpha(body)
    body = remap_rgba(body)
    # arbitrary-value shadow remnants: -[inset_0_0_15px_rgba(...)]
    body = re.sub(r"\s-\[inset_[^\]]*\]", "", body)
    body = re.sub(r"\s-\[0_0_[^\]]*\]", "", body)
    body = remap_hexes(body)
    body = strip_utilities(body)
    body = re.sub(r"\bglass-panel\b", "panel", body)
    body = re.sub(r"[ \t]{2,}", " ", body)

    if m.group(2) is not None:
        return f'{head}="{body}"'
    if m.group(3) is not None:
        return f"{head}='{body}'"
    if m.group(4) is not None:
        return f"{head}={{`{body}`}}"
    return f"{head}={{{body}}}"


def process(path: pathlib.Path) -> bool:
    original = path.read_text()
    text = original
    if path.suffix == ".css":
        text = remap_hexes(text)
        text = text.replace("border-radius: 3px", "border-radius: 0")
        text = text.replace("glass-panel", "panel")
    else:
        # 1. colour hexes anywhere (colours are colours, even in data files)
        text = remap_hexes(text)
        text = remap_rgba(text)
        # 2. structural utility cleanup, class attributes only — never prose
        if "className" in text or "class=" in text:
            text = CLASS_ATTR.sub(transform_classes, text)
    if text != original:
        path.write_text(text)
        return True
    return False


def main():
    changed = []
    for p in sorted(SRC.rglob("*")):
        if p.suffix in {".tsx", ".ts", ".css"} and p.is_file():
            if p.name == "index.css":       # hand-authored, already on-system
                continue
            if process(p):
                changed.append(p.relative_to(ROOT))
    print(f"rethemed {len(changed)} files")
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    sys.exit(main())
