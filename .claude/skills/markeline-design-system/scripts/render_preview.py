#!/usr/bin/env python3
"""Screenshot an HTML deliverable at a MARKELINE canvas preset with Playwright/Chromium.

    python3 scripts/render_preview.py out/lp.html --preset lp_desktop --full
    python3 scripts/render_preview.py out/slides.html --preset slide_16_9 --each .slide
    python3 scripts/render_preview.py out/banner.html --preset line_rich_menu_large --out banner.png

--each SELECTOR   screenshot every element matching SELECTOR (slides, banner cells) as N files
--full            full-page screenshot (LPs)
--scale N         device scale factor (default 1; use 2 for retina previews)
Presets come from tokens/tokens.json > canvas_presets_px. Prints the output paths.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESETS = json.loads((ROOT / "tokens" / "tokens.json").read_text(encoding="utf-8"))["canvas_presets_px"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--preset", default="lp_desktop", choices=sorted(PRESETS))
    ap.add_argument("--each", default=None)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("pip install playwright  (Chromium is preinstalled in Claude Code web; elsewhere run `playwright install chromium`)")
        return 2
    w, h = PRESETS[a.preset]
    h = h or 900
    src = Path(a.html).resolve()
    out = Path(a.out) if a.out else src.with_suffix("")
    outputs = []
    # Honour a preinstalled Chromium (Claude Code web ships one at /opt/pw-browsers/chromium)
    # so a pip-installed playwright with a different pinned build still works.
    import os
    exe = os.environ.get("PW_CHROMIUM") or ("/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None)
    launch_kwargs = {"executable_path": exe} if exe else {}
    with sync_playwright() as p:
        b = p.chromium.launch(**launch_kwargs)
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=a.scale)
        pg.goto(src.as_uri())
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts && document.fonts.ready")
        if a.each:
            els = pg.query_selector_all(a.each)
            for i, el in enumerate(els, 1):
                f = out.parent / f"{out.name}-{i:02d}.png"
                el.screenshot(path=str(f))
                outputs.append(f)
        else:
            f = out.with_suffix(".png")
            pg.screenshot(path=str(f), full_page=a.full)
            outputs.append(f)
        b.close()
    for f in outputs:
        print(f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
