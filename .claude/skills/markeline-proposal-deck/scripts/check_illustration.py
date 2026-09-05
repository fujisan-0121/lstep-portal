#!/usr/bin/env python3
"""Report how much of an illustration falls outside the MARKELINE palette hues.

    python3 scripts/check_illustration.py image.png [more.png ...]

Counts opaque pixels by hue family: teal (170-200°), yellow (38-55°), neutral (low
saturation), skin (10-35° with mid saturation, tolerated), other. "other" above 15% is a
fail: the illustration will look like it came from a different brand.
"""
from __future__ import annotations

import colorsys
import sys

from PIL import Image


def analyze(path: str) -> dict:
    im = Image.open(path).convert("RGBA")
    im.thumbnail((400, 400))
    counts = {"teal": 0, "yellow": 0, "neutral": 0, "skin": 0, "other": 0}
    total = 0
    for r, g, b, a in im.getdata():
        if a < 200:
            continue
        total += 1
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        deg = h * 360
        if s < 0.12 or v < 0.12:
            counts["neutral"] += 1
        elif 168 <= deg <= 200:
            counts["teal"] += 1
        elif 38 <= deg <= 55 and s > 0.5:
            counts["yellow"] += 1
        elif 10 <= deg <= 38 and s < 0.6:
            counts["skin"] += 1
        else:
            counts["other"] += 1
    return {k: (v / total if total else 0) for k, v in counts.items()}


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    bad = 0
    for p in argv:
        r = analyze(p)
        verdict = "OK" if r["other"] <= 0.15 else "FAIL"
        bad += verdict == "FAIL"
        print(f"{verdict}  {p}: teal {r['teal']:.0%}  yellow {r['yellow']:.0%}  neutral {r['neutral']:.0%}  skin {r['skin']:.0%}  other {r['other']:.0%}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
