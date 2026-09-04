#!/usr/bin/env python3
"""Build a MARKELINE proposal deck (HTML + 2x PNG + vector PDF) from an outline JSON.

    python3 scripts/build_deck.py outline.json --out ./deck --render
    python3 scripts/build_deck.py outline.json --out ./deck            # HTML only
    python3 scripts/build_deck.py outline.json --check                 # validate + warnings only

The CSS, icon sprite, tokens and fonts all come from the sibling skill
`markeline-design-system` (templates/infographic.html, tokens/, assets/), so the
deck can never drift from the brand. This script only decides *what* goes on
each slide; see references/outline-schema.md for the JSON shape.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DS = HERE.parents[1] / "markeline-design-system"
if not DS.exists():  # fall back to an env override
    import os
    DS = Path(os.environ.get("MARKELINE_DS", str(DS)))

ICONS = {"clock", "users", "yen", "check", "calendar", "bulb", "doc", "phone", "chart", "building",
         "car", "person", "folder", "hands", "book", "run", "target", "sprout"}
WARN: list[str] = []


def warn(msg: str) -> None:
    WARN.append(msg)


# ---------- text ----------
def T(s: str | None, em_class: str = "em-y") -> str:
    """Escape, then apply the tiny markup: **em**, ==marker==, \\n."""
    if s is None:
        return ""
    s = html.escape(str(s), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", rf'<span class="{em_class}">\1</span>', s)
    s = re.sub(r"==(.+?)==", r'<span class="marker">\1</span>', s)
    return s.replace("\\n", "<br>").replace("\n", "<br>")


def plain(s: str | None) -> str:
    return re.sub(r"\*\*|==|\\n|\n", "", s or "")


def ico(name: str, cls: str = "ico") -> str:
    if name not in ICONS:
        warn(f"unknown icon '{name}' (using 'target')")
        name = "target"
    return f'<div class="{cls}"><svg><use href="#i-{name}"/></svg></div>'


def check_len(label: str, s: str | None, limit: int, page: int) -> None:
    n = len(plain(s))
    if n > limit:
        warn(f"slide {page}: {label} is {n} chars (limit {limit}): {plain(s)[:30]}…")


# ---------- chrome ----------
def titlebar(sl: dict, page: int) -> str:
    check_len("title", sl.get("title"), 22, page)
    sub = f'<span class="sub">{T(sl["sub"])}</span>' if sl.get("sub") else ""
    return (f'<div class="logobox"><img src="assets/markeline_logo_color.png" alt=""></div>'
            f'<div class="titlebar">{T(sl.get("title"))}{sub}</div>')


def conclusion(c, page: int) -> str:
    if not c:
        return ""
    if isinstance(c, str):
        c = {"text": c}
    tone = c.get("tone", "yellow")
    check_len("conclusion", c.get("text"), 40, page)
    em = "em" if tone == "teal" else "em-y"
    return (f'<div class="conclusion{" teal" if tone == "teal" else ""}">{ico("check", "check")}'
            f'{T(c.get("text"), em)}</div>')


def pageno(page: int, total: int, sl: dict) -> str:
    return "" if sl.get("conclusion") else f'<div class="pageno">{page:02d} / {total:02d}</div>'


# ---------- slide types ----------
def s_cover(sl, o, page, total):
    title = sl.get("title") or f'{o["client"]}{o.get("honorific", "様")} ご提案'
    label = f'<p class="label">{T(sl["label"])}</p>' if sl.get("label") else ""
    return f'''<section class="slide cover">
  <svg class="waves" viewBox="0 0 1920 1080" preserveAspectRatio="none" fill="none" stroke="#A3DADB" stroke-width="2">
    <path d="M-50 180C300 60 500 320 900 220S1500 40 1980 200"/><path d="M-50 240C300 120 500 380 900 280S1500 100 1980 260"/><path d="M-50 300C300 180 500 440 900 340S1500 160 1980 320"/>
    <path d="M-50 900C300 780 500 1040 900 940S1500 760 1980 920"/><path d="M-50 960C300 840 500 1100 900 1000S1500 820 1980 980"/></svg>
  <div class="logobox"><img src="assets/markeline_logo_color.png" alt="MARKELINE"></div>
  {label}<h1>{T(title)}</h1><p>〜 {T(sl.get("subtitle"))} 〜</p>
  <div class="company">{T(o.get("company", "株式会社MARKELINE"))}</div>
</section>'''


def s_goals(sl, o, page, total):
    items = sl.get("items", [])
    if len(items) > 3:
        warn(f"slide {page}: goals has {len(items)} items (max 3)")
    cards = "".join(f'<div class="goal"><div class="n">{i+1}</div><div class="t">{T(t)}</div></div>' for i, t in enumerate(items))
    for t in items:
        check_len("goal", t, 48, page)
    return f'<section class="slide">{titlebar(sl, page)}<div class="body center" style="gap:40px">{cards}</div>{pageno(page, total, sl)}</section>'


def s_issues(sl, o, page, total):
    items = sl.get("items", [])
    if len(items) > 4:
        warn(f"slide {page}: issues has {len(items)} cards (max 4)")
    cards = []
    for i, it in enumerate(items):
        check_len("issue head", it.get("head"), 10, page)
        for b in it.get("bullets", [])[:2]:
            check_len("issue bullet", b, 26, page)
        if len(it.get("bullets", [])) > 2:
            warn(f"slide {page}: issue '{it.get('head')}' has more than 2 bullets")
        lis = "".join(f"<li>{T(b)}</li>" for b in it.get("bullets", [])[:2])
        cards.append(f'<div class="issue">{ico(it.get("icon", "target"))}<div><h3><span class="n">{i+1}</span>{T(it.get("head"))}</h3><ul>{lis}</ul></div></div>')
    cols = "1fr 1fr" if len(items) != 3 else "1fr 1fr 1fr"
    return f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="grid2" style="grid-template-columns:{cols}">{"".join(cards)}</div></div>{pageno(page, total, sl)}</section>'


def s_kpi(sl, o, page, total):
    rows = sl.get("rows", [])
    if len(rows) > 4:
        warn(f"slide {page}: kpi has {len(rows)} rows (max 4)")
    if sum(1 for r in rows if r.get("focus")) > 1:
        warn(f"slide {page}: more than one focus row")
    out = []
    for r in rows:
        check_len("kpi label", r.get("label"), 26, page)
        note = f'<small>{T(r["note"])}</small>' if r.get("note") else ""
        out.append(f'<div class="kpirow{" focus" if r.get("focus") else ""}">{ico(r.get("icon", "chart"))}'
                   f'<div class="big num">{T(r.get("value"))}<span class="unit">{T(r.get("unit"))}</span></div>'
                   f'<div class="d">{T(r.get("label"))}{note}</div></div>')
    body = f'<div class="body" style="gap:8px;padding-top:16px;padding-bottom:16px">{"".join(out)}</div>'
    return f'<section class="slide">{titlebar(sl, page)}{body}{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>'


def s_statement(sl, o, page, total):
    check_len("statement quote", sl.get("quote"), 14, page)
    return f'''<section class="slide statement">
  <div class="tag">{ico("sprout")}{T(sl.get("tag"))}</div>
  <p class="quote"><span class="q">「</span>{T(sl.get("quote"))}<span class="q">」</span></p>
  <div class="note">{ico("bulb")}<div>{T(sl.get("note"))}</div></div>
  <img src="assets/markeline_logo_color.png" alt="" style="position:absolute;right:48px;bottom:24px;height:110px">
</section>'''


def _flow(nodes, sep, page):
    parts = []
    for i, n in enumerate(nodes):
        if i:
            cls = "x" if sep == "×" else "arrow"
            parts.append(f'<div class="{cls}">{sep}</div>')
        parts.append(f'<div class="node">{ico(n.get("icon", "doc"))}{T(n.get("text"))}</div>')
    return f'<div class="flow">{"".join(parts)}</div>'


def s_compare(sl, o, page, total):
    def panel(p, win):
        body = f"<span>{T(p['body'])}</span>" if p.get("body") else ""
        flow = _flow(p.get("flow", []), p.get("sep", "▶" if win else "×"), page)
        return (f'<div class="panel{" win" if win else ""}"><div class="head">{T(p.get("head"))}</div>'
                f'<div class="in" style="justify-content:center"><b>{T(p.get("claim"))}</b>{body}{flow}</div></div>')
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="panels">'
            f'{panel(sl["left"], False)}{panel(sl["right"], True)}</div></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_table(sl, o, page, total):
    rows = sl.get("rows", [])
    if len(rows) > 4:
        warn(f"slide {page}: table has {len(rows)} rows (max 4) — split into two slides")
    head = sl.get("head", ["御社の手作業", "MARKELINEの打ち手", "効果"])
    ths = "".join(f'<th style="width:{w}%">{T(h)}</th>' for h, w in zip(head, (34, 33, 33)))
    trs = []
    for r in rows:
        for k in ("task", "action", "effect"):
            check_len(f"table {k}", r.get(k), 20, page)
        sub = f"<small>{T(r['sub'])}</small>" if r.get("sub") else ""
        trs.append(f'<tr><td class="task"><div>{ico(r.get("icon", "doc"))}<div>{T(r.get("task"))}{sub}</div></div></td>'
                   f'<td class="action">{T(r.get("action"))}</td>'
                   f'<td class="effect"><div>{ico("check", "check")}<span>{T(r.get("effect"))}</span></div></td></tr>')
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body" style="padding-top:24px">'
            f'<table class="tbl"><thead><tr>{ths}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def _panel_list(p, win):
    lis = "".join(f"<li>{T(i)}</li>" for i in p.get("items", []))
    return (f'<div class="panel{" win" if win else ""}"><div class="head">{T(p.get("head"))}</div>'
            f'<div class="in"><b>{T(p.get("claim"))}</b><ul class="list">{lis}</ul></div></div>')


def s_before_after(sl, o, page, total):
    fx = "".join(f'<div class="fxcard">{ico(e.get("icon", "check"))}<div><b>{T(e.get("head"))}</b><span>{T(e.get("text"))}</span></div></div>'
                 for e in sl.get("effects", [])[:3])
    arrow = '<div class="bigarrow"><svg viewBox="0 0 24 24"><path d="M3 9h11V4l8 8-8 8v-5H3z"/></svg></div>'
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="ba">'
            f'{_panel_list(sl["before"], False)}{arrow}{_panel_list(sl["after"], True)}</div>'
            f'<div class="fxcards">{fx}</div></div>{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_steps(sl, o, page, total):
    steps = sl.get("steps", [])[:4]
    boxes = []
    for i, s in enumerate(steps):
        check_len("step text", s.get("text"), 44, page)
        boxes.append(f'<div class="step s{i}"><h4>{ico(s.get("icon", "run"))}{T(s.get("label", f"STEP{i}"))}</h4>'
                     f'<b>{T(s.get("head"))}</b><p>{T(s.get("text"))}</p></div>')
    rise = ('<svg class="rise" viewBox="0 0 1776 700" preserveAspectRatio="none" fill="none">'
            '<path d="M40 690 C 600 690, 1200 520, 1760 40" stroke="#F9BB00" stroke-width="16" stroke-linecap="round"/>'
            '<path d="M1700 30 L1760 40 L1745 100" stroke="#F9BB00" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="steps">{rise}{"".join(boxes)}</div></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_why_now(sl, o, page, total):
    items = sl.get("items", [])[:3]
    rows = "".join(f'<div class="wn"><div class="n">{i+1}</div>{ico(it.get("icon", "bulb"))}<div><h3>{T(it.get("head"), "em")}</h3><p>{T(it.get("text"))}</p></div></div>'
                   for i, it in enumerate(items))
    for it in items:
        check_len("why-now head", it.get("head"), 24, page)
    return f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="whynow">{rows}</div></div>{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>'


def s_pricing(sl, o, page, total):
    def card(c, cls):
        return (f'<div class="pcard {cls}"><div class="lab">{T(c.get("label"))}</div>'
                f'<div class="big num">{T(c.get("value"))}<span class="unit">{T(c.get("unit"))}</span></div>'
                f'<div class="ex">{T(c.get("text"))}</div></div>')
    cmp = sl.get("compare")
    cmp_html = ""
    if cmp:
        note = f'<br><span style="font-weight:500;color:var(--ml-sub)">{T(cmp["note"])}</span>' if cmp.get("note") else ""
        cmp_html = (f'<div class="pcard compare" style="grid-column:1 / -1;flex-direction:row;align-items:center;gap:40px">'
                    f'<div><div class="lab">{T(cmp.get("label"))}</div><div class="big num" style="font-size:110px">{T(cmp.get("value"))}<span class="unit">{T(cmp.get("unit"))}</span></div></div>'
                    f'<div class="ex" style="font-size:28px;font-weight:700;color:var(--ml-ink)">{T(cmp.get("text"))}{note}</div></div>')
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="price">'
            f'{card(sl["entry"], "entry")}{card(sl["expand"], "expand") if sl.get("expand") else ""}{cmp_html}</div></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_case_kpi(sl, o, page, total):
    rows = []
    for r in sl.get("rows", [])[:3]:
        nums = ""
        if r.get("after"):
            b = f'<span class="b">{T(r["before"])}</span>{T(r.get("before_unit"))}<span class="arr">▶</span>' if r.get("before") else ""
            nums = f'<div class="nums">{T(r.get("prefix"))}{b}<span class="a">{T(r["after"])}</span>{T(r.get("after_unit"))}</div>'
        rows.append(f'<div class="ck">{ico(r.get("icon", "check"))}<div><div class="lab">{T(r.get("label"))}</div>{nums}</div></div>')
    side = sl.get("side", {})
    side_html = f'<div class="ckside">{ico(side.get("icon", "target"))}<b>{T(side.get("text"))}</b></div>'
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body">'
            f'<div class="casehead"><span class="tag">事例</span>{T(sl.get("case"))}</div>'
            f'<div class="ckwrap"><div class="ckrows">{"".join(rows)}</div>{side_html}</div></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_case_flow(sl, o, page, total):
    b = sl["before"]
    blis = "".join(f'<li><span class="x">×</span>{T(i)}</li>' for i in b.get("items", []))
    before = (f'<div class="panel"><div class="head">{T(b.get("head"))}</div><div class="in"><b>{T(b.get("claim"))}</b>'
              f'<ul class="list">{blis}</ul></div></div>')
    a = sl["after"]
    nodes = []
    for i, n in enumerate(a.get("flow", [])[:7]):
        if i:
            nodes.append('<span class="arr">▶</span>')
        nodes.append(f'<div class="node">{ico(n.get("icon", "doc"))}{T(n.get("text"))}</div>')
    checks = "".join(f'<li>{ico("check", "check")}{T(c)}</li>' for c in a.get("checks", [])[:3])
    after = (f'<div class="panel win"><div class="head">{T(a.get("head"))}</div><div class="in">'
             f'<div class="flowtitle">{T(a.get("flow_title", "一気通貫フロー図"))}</div><div class="flow7">{"".join(nodes)}</div>'
             f'<ul class="list">{checks}</ul></div></div>')
    return (f'<section class="slide">{titlebar(sl, page)}<div class="body"><div class="cf">{before}{after}</div></div>'
            f'{conclusion(sl.get("conclusion"), page)}{pageno(page, total, sl)}</section>')


def s_closing(sl, o, page, total):
    merits = "".join(f'<li>{ico("check", "check")}{T(m)}</li>' for m in sl.get("merits", [])[:4])
    nx = sl.get("next", {})
    return f'''<section class="slide closing">
  <div class="top"><h2>{T(sl.get("title", "まとめ／次の一歩"))}</h2><img src="assets/markeline_logo_white.png" alt="MARKELINE"></div>
  <div class="cols">
    <div class="merits"><h3>【組むメリット】</h3><ul>{merits}</ul></div>
    <div class="next"><h3>{ico("run")}{T(nx.get("head", "【次の一歩】"))}</h3><p>{T(nx.get("text"))}</p></div>
  </div>
  <div class="msg"><span class="q">「</span>{T(sl.get("message"))}<span class="q">」</span>{T(sl.get("message_suffix", "を、御社に。"))}</div>
</section>'''


BUILDERS = {"cover": s_cover, "goals": s_goals, "issues": s_issues, "kpi": s_kpi, "statement": s_statement,
            "compare": s_compare, "table": s_table, "before_after": s_before_after, "steps": s_steps,
            "why_now": s_why_now, "pricing": s_pricing, "case_kpi": s_case_kpi, "case_flow": s_case_flow,
            "closing": s_closing}


# ---------- assembly ----------
def load_template_parts() -> tuple[str, str]:
    tpl = (DS / "templates" / "infographic.html").read_text(encoding="utf-8")
    style = re.search(r"<style>(.*?)</style>", tpl, re.S).group(1)
    sprite = re.search(r'(<svg width="0" height="0".*?</svg>)', tpl, re.S).group(1)
    extra = """
.cover .label{position:relative;margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:.1em;color:var(--ml-teal-100)}
.ck .lab{font-size:30px}
"""
    return style + extra, sprite


def build(outline: dict) -> str:
    slides = outline["slides"]
    total = len(slides)
    style, sprite = load_template_parts()
    body = []
    for i, sl in enumerate(slides, 1):
        t = sl.get("type")
        if t not in BUILDERS:
            warn(f"slide {i}: unknown type '{t}' skipped")
            continue
        body.append(BUILDERS[t](sl, outline, i, total))
    title = f'{outline["client"]}{outline.get("honorific", "様")} ご提案'
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<link rel="stylesheet" href="tokens.css">
<style>{style}</style>
</head>
<body>
{sprite}
{chr(10).join(body)}
</body>
</html>
'''


def stage_assets(out: Path) -> None:
    (out / "assets").mkdir(parents=True, exist_ok=True)
    css = (DS / "tokens" / "tokens.css").read_text(encoding="utf-8").replace("../assets/fonts/fonts.css", "assets/fonts/fonts.css")
    (out / "tokens.css").write_text(css, encoding="utf-8")
    fonts_src = DS / "assets" / "fonts"
    fonts_dst = out / "assets" / "fonts"
    if fonts_src.exists() and not fonts_dst.exists():
        shutil.copytree(fonts_src, fonts_dst)
    for f in ("markeline_logo_color.png", "markeline_logo_white.png"):
        shutil.copy(DS / "assets" / f, out / "assets" / f)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("outline")
    ap.add_argument("--out", default="deck")
    ap.add_argument("--render", action="store_true", help="also write 2x PNGs and a vector PDF via the design-system renderer")
    ap.add_argument("--check", action="store_true", help="validate only")
    a = ap.parse_args()
    outline = json.loads(Path(a.outline).read_text(encoding="utf-8"))
    html_out = build(outline)
    if WARN:
        print(f"{len(WARN)} warning(s):")
        for w in WARN:
            print("  -", w)
    else:
        print("no warnings")
    if a.check:
        return 0
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    stage_assets(out)
    (out / "deck.html").write_text(html_out, encoding="utf-8")
    print(f"wrote {out / 'deck.html'} ({len(outline['slides'])} slides)")
    if a.render:
        cmd = [sys.executable, str(DS / "scripts" / "render_preview.py"), str(out / "deck.html"),
               "--preset", "slide_16_9", "--each", ".slide", "--scale", "2", "--pdf", "--out", str(out / "deck")]
        subprocess.run(cmd, check=True)
        subprocess.run([sys.executable, str(DS / "scripts" / "lint_tokens.py"), "--strict", str(out / "deck.html")], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
