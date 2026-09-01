#!/usr/bin/env python3
"""Lint a deliverable for colors and fonts that are not MARKELINE tokens.

Scans .html .css .scss .svg .js .jsx .ts .tsx .vue .json .md .py .pptx .docx .xlsx
and reports every hex / rgb() color that is not in tokens/palette.txt, plus every
font-family that is not one of the token font stacks.

    python3 scripts/lint_tokens.py path/to/lp.html other/dir
    python3 scripts/lint_tokens.py --strict deck.pptx     # exit 1 on any finding

Exit code: 0 clean, 1 findings (only with --strict), 2 usage error.
Neutral pure white/black are allowed because they are tokens (paper / black).
"""
from __future__ import annotations

import io
import json
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from colorlib import norm_hex, rgb_to_hex  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PALETTE = {l.strip().upper() for l in (ROOT / "tokens" / "palette.txt").read_text().splitlines() if l.strip()}
TOKENS = json.loads((ROOT / "tokens" / "tokens.json").read_text(encoding="utf-8"))
ALLOWED_FONTS = set()
for fam in TOKENS["typography"]["families"].values():
    ALLOWED_FONTS.update(f.lower() for f in fam["stack"])
    ALLOWED_FONTS.add(fam["name"].lower())
    if fam.get("office_fallback"):
        ALLOWED_FONTS.add(fam["office_fallback"].lower())
ALLOWED_FONTS.update({"sans-serif", "monospace", "serif", "system-ui", "inherit", "initial", "ui-monospace", "ui-sans-serif"})

HEX_RE = re.compile(r"(?<![\w&])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])")
RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})")
FONT_RE = re.compile(r"font-family\s*:\s*([^;}\"']+)", re.I)
OOXML_COLOR_RE = re.compile(r'(?:srgbClr|w:color|fgColor|bgColor|color)\s+(?:val|rgb|w:val)="([0-9A-Fa-f]{6,8})"')
TEXT_EXT = {".html", ".htm", ".css", ".scss", ".svg", ".js", ".jsx", ".ts", ".tsx", ".vue", ".json", ".md", ".py", ".txt"}
OOXML_EXT = {".pptx", ".docx", ".xlsx"}


def check_text(text: str, where: str, findings: list[tuple[str, str, str]]):
    for m in HEX_RE.finditer(text):
        h = norm_hex("#" + m.group(1)).upper()
        if h not in PALETTE:
            findings.append((where, "color", f"#{m.group(1)} (not a token)"))
    for m in RGB_RE.finditer(text):
        h = rgb_to_hex(tuple(int(x) for x in m.groups())).upper()
        if h not in PALETTE:
            findings.append((where, "color", f"rgb({','.join(m.groups())}) = {h} (not a token)"))
    for m in FONT_RE.finditer(text):
        for fam in m.group(1).split(","):
            f = fam.strip().strip("\"'").lower()
            if f.startswith("var(") or not f:
                continue
            if f not in ALLOWED_FONTS:
                findings.append((where, "font", f"{fam.strip()} (not a token font)"))


def check_ooxml(path: Path, findings: list):
    z = zipfile.ZipFile(path)
    for name in z.namelist():
        if not name.endswith(".xml") or "theme" in name:
            continue
        xml = z.read(name).decode("utf-8", "ignore")
        for m in OOXML_COLOR_RE.finditer(xml):
            h = m.group(1)[-6:].upper()
            if h in {"000000", "FFFFFF"}:
                continue
            if f"#{h}" not in PALETTE:
                findings.append((f"{path.name}:{name}", "color", f"#{h} (not a token)"))
        for m in re.finditer(r'typeface="([^"]+)"', xml):
            f = m.group(1)
            # theme references (+mj-lt, +mn-ea) and symbol/bullet fonts are not text fonts
            if f.startswith("+") or f.lower().startswith(("wingdings", "symbol", "segoe ui symbol", "segoe ui emoji")):
                continue
            if f.lower() not in ALLOWED_FONTS:
                findings.append((f"{path.name}:{name}", "font", f"{f} (not a token font)"))
        for m in re.finditer(r'w:(?:ascii|hAnsi|eastAsia|cs)="([^"]+)"', xml):
            f = m.group(1)
            if f.lower() not in ALLOWED_FONTS:
                findings.append((f"{path.name}:{name}", "font", f"{f} (not a token font)"))


def scan(paths: list[Path]) -> list[tuple[str, str, str]]:
    findings: list[tuple[str, str, str]] = []
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            files += [f for f in p.rglob("*") if f.is_file()]
        else:
            files.append(p)
    for f in files:
        if f.suffix.lower() in TEXT_EXT:
            try:
                check_text(f.read_text(encoding="utf-8", errors="ignore"), str(f), findings)
            except Exception as e:  # pragma: no cover
                findings.append((str(f), "error", str(e)))
        elif f.suffix.lower() in OOXML_EXT:
            check_ooxml(f, findings)
    return findings


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    paths = [Path(a) for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    findings = scan(paths)
    # de-duplicate identical messages per file
    seen, uniq = set(), []
    for f in findings:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    if not uniq:
        print("OK: every color and font is a MARKELINE token.")
        return 0
    print(f"{len(uniq)} finding(s):")
    for where, kind, msg in uniq:
        print(f"  [{kind}] {where}: {msg}")
    print("\nFix: replace with a token from tokens/tokens.css (var(--ml-*)) or tokens/tokens.py, "
          "or add a documented token to tokens/tokens.json and rebuild.")
    return 1 if strict else 0


if __name__ == "__main__":
    import signal

    signal.signal(signal.SIGPIPE, signal.SIG_DFL)  # play nicely with `| head`
    raise SystemExit(main(sys.argv[1:]))
