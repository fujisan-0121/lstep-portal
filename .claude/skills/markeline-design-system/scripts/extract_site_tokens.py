#!/usr/bin/env python3
"""Pull the live colors / fonts from a MARKELINE web property and diff them against tokens.json.

Use this whenever the corporate site (https://www.lstepoffcial.com/) or a client-facing
LP is updated, so the token file never silently drifts from what is actually published.
It needs outbound HTTPS to the site; the session that authored this skill had no egress
to lstepoffcial.com, which is why the site itself is NOT a provenance source in
references/provenance.md yet. Run it once from a machine that can reach the site and
paste the report into provenance.md.

    python3 scripts/extract_site_tokens.py https://www.lstepoffcial.com/ [more urls...]
    python3 scripts/extract_site_tokens.py https://www.lstepoffcial.com/ --json > site_tokens.json
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).parent))
from colorlib import contrast, norm_hex, rgb_to_hex  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PALETTE = {l.strip().upper() for l in (ROOT / "tokens" / "palette.txt").read_text().splitlines() if l.strip()}
UA = "Mozilla/5.0 (compatible; markeline-design-system token audit)"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "ignore")


def collect(url: str) -> dict:
    html = fetch(url)
    css_texts = [html]
    for href in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)', html, re.I) + \
                re.findall(r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)["\']', html, re.I):
        try:
            css_texts.append(fetch(urljoin(url, href)))
        except Exception as e:  # noqa: BLE001
            print(f"  ! could not fetch {href}: {e}", file=sys.stderr)
    blob = "\n".join(css_texts)
    colors: Counter[str] = Counter()
    for m in re.finditer(r"(?<![\w&])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])", blob):
        colors[norm_hex("#" + m.group(1)).upper()] += 1
    for m in re.finditer(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", blob):
        colors[rgb_to_hex(tuple(int(x) for x in m.groups())).upper()] += 1
    fonts: Counter[str] = Counter()
    for m in re.finditer(r"font-family\s*:\s*([^;}]+)", blob, re.I):
        for f in m.group(1).split(","):
            f = f.strip().strip("\"'")
            if f and not f.startswith("var("):
                fonts[f] += 1
    gfonts = sorted(set(re.findall(r"fonts\.googleapis\.com/css2?\?[^\"' )]+", blob)))
    custom_props = dict(re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))", blob))
    return {"url": url, "colors": colors, "fonts": fonts, "google_fonts": gfonts, "custom_properties": custom_props}


def main(argv: list[str]) -> int:
    urls = [a for a in argv if a.startswith("http")]
    if not urls:
        print(__doc__)
        return 2
    report = []
    for u in urls:
        print(f"== {u}")
        r = collect(u)
        report.append({**r, "colors": dict(r["colors"]), "fonts": dict(r["fonts"])})
        print("  top colors (count, in-token?):")
        for h, n in r["colors"].most_common(25):
            print(f"    {h}  x{n:<4} {'TOKEN' if h in PALETTE else 'NOT IN TOKENS'}")
        print("  fonts:", ", ".join(f"{f} x{n}" for f, n in r["fonts"].most_common(10)))
        print("  google fonts:", r["google_fonts"] or "none")
        if r["custom_properties"]:
            print("  custom properties:")
            for k, v in list(r["custom_properties"].items())[:40]:
                print(f"    {k}: {v}")
        brand = [h for h, _ in r["colors"].most_common(60) if h in PALETTE]
        print(f"  brand tokens seen on site: {brand or 'NONE  <- investigate: site may use non-token values'}")
    if "--json" in argv:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
