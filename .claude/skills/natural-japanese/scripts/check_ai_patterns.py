#!/usr/bin/env python3
"""日本語テキストからAI特有の癖を検出して行番号つきで報告する。

使い方:
    python3 check_ai_patterns.py draft.md
    cat draft.md | python3 check_ai_patterns.py -
    python3 check_ai_patterns.py draft.md --json

終了コード: 指摘があれば1、なければ0。
検出は「疑わしい箇所の提示」であり、直すかどうかは文脈で判断する。
"""

import json
import re
import sys
from collections import Counter

# ---- 検出ルール -----------------------------------------------------------

TEMPLATE_OPENERS = [
    r"^近年[、,]",
    r"^本記事では",
    r"^この記事では.*(解説|紹介|まとめ)",
    r"^ここでは.*(解説|紹介|まとめ|説明)",
    r"^今回は.*(解説|紹介|ご紹介)",
    r"をご存知でしょうか",
    r"が注目を集めて",
    r"^昨今[、,]",
]

TEMPLATE_CLOSERS = [
    r"今後の展開が注目",
    r"が期待され(ます|る)",
    r"と言えるでしょう",
    r"ではないでしょうか",
    r"ぜひ.*(試して|活用して|参考にして)みてください",
    r"いかがでしたか",
    r"参考になれば幸い",
    r"一助となれば",
]

STOCK_EVALUATIONS = [
    "浮き彫り",
    "重要な示唆",
    "注目に値",
    "多面的",
    "包括的",
    "画期的",
    "鍵となる",
    "カギを握",
    "計り知れ",
    "極めて重要",
    "非常に重要",
]

PREFACE_PHRASES = [
    "ここで重要なのは",
    "重要なのは",
    "注意すべき点として",
    "理解しておく必要があ",
    "押さえておきたい",
    "まず前提として",
    "以下にまとめ",
    "上記を踏まえ",
    "以上のことから",
    "以上を踏まえ",
]

INTENSIFIERS = [
    "非常に", "極めて", "大変", "とても", "様々な", "さまざまな", "幅広い",
    "効果的な", "効果的に", "最適な", "最適化", "豊富な", "圧倒的", "大幅に",
    "劇的に", "しっかりと", "しっかり", "きちんと", "積極的に", "効率的に",
    "効率化", "適切な", "適切に", "強力な", "革新的",
]

CONJUNCTIONS = [
    "一方で", "しかしながら", "加えて", "このように", "さらに", "とりわけ",
    "そのため", "また、", "したがって", "つまり", "なお、", "ただし、",
]

ABSTRACT_NOUNS = ["ソリューション", "取り組み", "施策", "価値提供", "最適化", "効率化", "課題解決"]

RE_DEKIMASU = re.compile(r"することができ(ます|る|ません|ない)")
RE_EMDASH = re.compile(r"[—–―]{1,2}")
RE_BOLD_COLON = re.compile(r"\*\*[^*]+\*\*\s*[:：]")
RE_ASTERISK = re.compile(r"\*")
RE_KATAKANA_RUN = re.compile(r"(?:[ァ-ヴー]{3,}[・\s]?){3,}")
RE_TRIPLE = re.compile(r"(3つの|三つの|3点|3ステップ|3つに|は3つ|が3つ)")
RE_NI_OITE = re.compile(r"におい(て|ては)|における")
RE_TO_NARIMASU = re.compile(r"となります|となっております")
RE_TOIU = re.compile(r"という")
RE_SENTENCE_SPLIT = re.compile(r"(?<=[。！？!?])")

# 語尾の分類。連続判定はこの単位で行う。
ENDINGS = [
    ("でしょう", r"でしょう[。！？!?]?$"),
    ("ます", r"(ます|ました|ません|ましょう)[。！？!?]?$"),
    ("です", r"(です|でした)[。！？!?]?$"),
    ("できます", r"できます[。！？!?]?$"),
    ("だ", r"(だ|だった|である|であった)[。！？!?]?$"),
    ("体言止め", r"[ぁ-んァ-ヴ一-龥A-Za-z0-9]$"),
]


def classify_ending(sentence: str) -> str:
    s = sentence.strip().rstrip("」』）)")
    for name, pat in ENDINGS:
        if re.search(pat, s):
            return name
    return "その他"


def split_sentences(text: str):
    """(行番号, 文) のリスト。コードブロックとURLは除外する。"""
    out = []
    in_code = False
    for lineno, line in enumerate(text.splitlines(), 1):
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code or not line.strip():
            continue
        clean = re.sub(r"https?://\S+", "", line)
        for sent in RE_SENTENCE_SPLIT.split(clean):
            sent = sent.strip()
            if len(sent) >= 6:
                out.append((lineno, sent))
    return out


def check(text: str):
    findings = []
    lines = text.splitlines()
    sentences = split_sentences(text)

    def add(kind, lineno, detail, severity="warn"):
        findings.append({"kind": kind, "line": lineno, "detail": detail, "severity": severity})

    # 行単位のチェック
    in_code = False
    for lineno, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if RE_ASTERISK.search(line):
            add("アスタリスク", lineno, "出力にアスタリスクを入れない（太字含む）", "error")
        if RE_BOLD_COLON.search(line):
            add("太字＋コロン", lineno, "ラベルを消して内容だけにする", "error")
        if RE_EMDASH.search(line):
            add("全角ダッシュ", lineno, "カッコか読点に置き換える", "error")
        for m in RE_DEKIMASU.finditer(line):
            add("することができます", lineno, f"「{m.group(0)}」→ 短くする", "error")
        for pat in TEMPLATE_OPENERS:
            m = re.search(pat, stripped)
            if m:
                add("冒頭テンプレ", lineno, f"「{m.group(0)}」 場面か数字から始める", "error")
                break
        for pat in TEMPLATE_CLOSERS:
            m = re.search(pat, stripped)
            if m:
                add("締めテンプレ", lineno, f"「{m.group(0)}」 次の行動か本音で終える", "error")
                break
        for w in STOCK_EVALUATIONS:
            if w in line:
                add("定型評価語", lineno, f"「{w}」 具体に置き換える")
        for w in PREFACE_PHRASES:
            if w in line:
                add("前置き", lineno, f"「{w}」 消して内容だけ残す")
        for w in ABSTRACT_NOUNS:
            if w in line:
                add("抽象語", lineno, f"「{w}」 固有名か動作に置き換える")
        if RE_KATAKANA_RUN.search(line):
            add("カタカナ連続", lineno, "和語で言い直せないか")
        if RE_TRIPLE.search(line):
            add("3点セット", lineno, "本当に3つか。4つなら4つ、1つなら1つ")
        for m in RE_NI_OITE.finditer(line):
            add("翻訳調", lineno, f"「{m.group(0)}」→「では」「の」")
        for m in RE_TO_NARIMASU.finditer(line):
            add("となります", lineno, "状態なら「です」")

    # 文書全体の頻度チェック
    body = "\n".join(l for l in lines if not l.strip().startswith("```"))
    total_sentences = max(len(sentences), 1)

    intens = Counter()
    for w in INTENSIFIERS:
        c = body.count(w)
        if c:
            intens[w] = c
    if sum(intens.values()) >= max(3, total_sentences // 5):
        top = "、".join(f"{w}×{c}" for w, c in intens.most_common(6))
        add("形容詞・副詞の盛り", 0, f"{sum(intens.values())}回（{top}） 数字か事実に置き換えるか、削る")

    conj = Counter()
    for w in CONJUNCTIONS:
        c = body.count(w)
        if c:
            conj[w] = c
    if sum(conj.values()) >= 3 and sum(conj.values()) >= total_sentences // 4:
        top = "、".join(f"{w.rstrip('、')}×{c}" for w, c in conj.most_common(6))
        add("接続詞の多用", 0, f"{sum(conj.values())}回（{top}） 半分は削って順序で語る")

    toiu = len(RE_TOIU.findall(body))
    if toiu >= 3 and toiu >= total_sentences // 4:
        add("「という」の多用", 0, f"{toiu}回 半分は消して直接つなぐ")

    # 語尾の連続
    run = []
    for lineno, sent in sentences:
        kind = classify_ending(sent)
        if run and run[-1][1] == kind and kind in ("ます", "です", "でしょう", "できます"):
            run.append((lineno, kind))
        else:
            if len(run) >= 3:
                add("語尾の連続", run[0][0], f"「{run[0][1]}」が{len(run)}文連続（{run[0][0]}〜{run[-1][0]}行） 1つを体言止めか言い切りに", "error")
            run = [(lineno, kind)]
    if len(run) >= 3:
        add("語尾の連続", run[0][0], f"「{run[0][1]}」が{len(run)}文連続（{run[0][0]}〜{run[-1][0]}行） 1つを体言止めか言い切りに", "error")

    # 文長の均一さ
    lengths = [len(s) for _, s in sentences]
    if len(lengths) >= 6:
        mean = sum(lengths) / len(lengths)
        var = sum((l - mean) ** 2 for l in lengths) / len(lengths)
        sd = var ** 0.5
        if sd < mean * 0.35 and mean > 25:
            add("文長の均一", 0, f"平均{mean:.0f}字、ばらつき{sd:.0f}字 長い文のあとに短い文を置く")

    findings.sort(key=lambda f: (f["line"], f["kind"]))
    return findings, {"sentences": len(sentences), "lines": len(lines)}


def main(argv):
    as_json = "--json" in argv
    args = [a for a in argv[1:] if a != "--json"]
    if not args or args[0] == "-":
        text = sys.stdin.read()
        name = "stdin"
    else:
        name = args[0]
        with open(name, encoding="utf-8") as f:
            text = f.read()

    findings, stats = check(text)

    if as_json:
        print(json.dumps({"file": name, "stats": stats, "findings": findings}, ensure_ascii=False, indent=2))
    else:
        print(f"{name}: {stats['sentences']}文 / 指摘 {len(findings)}件")
        for f in findings:
            loc = f"L{f['line']}" if f["line"] else "全体"
            mark = "!!" if f["severity"] == "error" else "  "
            print(f"{mark} {loc:>6} [{f['kind']}] {f['detail']}")
        if not findings:
            print("機械的に拾える癖は見当たらない。あとは声に出して読む。")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
