"""Small, dependency-free color helpers shared by the MARKELINE design-system scripts.

Everything here is deterministic so that every derived token can be re-computed
and audited from the two brand primaries measured in the logo master data.
"""
from __future__ import annotations

import colorsys
import re

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:  # drop alpha
        h = h[:6]
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb) -> str:
    r, g, b = (max(0, min(255, int(round(x)))) for x in rgb)
    return f"#{r:02X}{g:02X}{b:02X}"


def norm_hex(h: str) -> str:
    return rgb_to_hex(hex_to_rgb(h))


def mix(a: str, b: str, t: float) -> str:
    """Linear sRGB mix: t=0 -> a, t=1 -> b (matches CSS color-mix in srgb)."""
    ra, ga, ba = hex_to_rgb(a)
    rb, gb, bb = hex_to_rgb(b)
    return rgb_to_hex((ra + (rb - ra) * t, ga + (gb - ga) * t, ba + (bb - ba) * t))


def hsl(h_deg: float, s_pct: float, l_pct: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h_deg / 360.0, l_pct / 100.0, s_pct / 100.0)
    return rgb_to_hex((r * 255, g * 255, b * 255))


def to_hsl(h: str) -> tuple[float, float, float]:
    r, g, b = (x / 255.0 for x in hex_to_rgb(h))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    return round(hh * 360, 1), round(ss * 100, 1), round(ll * 100, 1)


def cmyk_to_rgb_naive(c, m, y, k) -> str:
    """Naive conversion (0-100 inputs). Only for sanity checks; the canonical
    RGB of a brand color always comes from the master file, never from this."""
    r = 255 * (1 - c / 100) * (1 - k / 100)
    g = 255 * (1 - m / 100) * (1 - k / 100)
    b = 255 * (1 - y / 100) * (1 - k / 100)
    return rgb_to_hex((r, g, b))


def _lin(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(h: str) -> float:
    r, g, b = hex_to_rgb(h)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg: str, bg: str) -> float:
    l1, l2 = luminance(fg), luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)


def wcag_level(ratio: float) -> str:
    """Return the strictest WCAG 2.2 text level a ratio satisfies."""
    if ratio >= 7:
        return "AAA"
    if ratio >= 4.5:
        return "AA"
    if ratio >= 3:
        return "AA-large"  # >= 24px, or >= 18.66px bold; also UI components / graphics
    return "fail"
