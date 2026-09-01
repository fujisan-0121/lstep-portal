#!/usr/bin/env python3
"""
メンバーPINのハッシュを生成し、index.html の MEMBER_PINS に貼る JS を出力する。

PIN の平文は tools/pins.csv（git 管理外。.gitignore 済み）にだけ置く。
  形式: 氏名,PIN   （氏名は index.html の MEMBERS と完全一致。「事務局」は特別扱いで -1）

使い方:
  python3 tools/gen-pins.py --generate   # MEMBERS から pins.csv を新規生成（既存があれば上書き確認）
  python3 tools/gen-pins.py              # pins.csv からハッシュを計算して JS を標準出力に出す
  python3 tools/gen-pins.py --apply      # 計算結果を index.html の MEMBER_PINS に書き込む

ハッシュ = sha256(PIN_SALT + PIN)。PIN_SALT は index.html の値を読む。
4桁PINは総当たりが容易なので、これは「URLを知った部外者が中を見られない」程度の鍵。
"""
import csv, hashlib, os, re, secrets, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
CSV  = os.path.join(ROOT, 'tools', 'pins.csv')

def read_html():
    with open(HTML, 'rb') as f:
        return f.read().decode('utf-8')

def members(html):
    block = re.search(r'const MEMBERS = \[(.*?)\n\];', html, re.S).group(1)
    return re.findall(r"name:'([^']+)'", block)

def salt(html):
    return re.search(r"const PIN_SALT = '([^']+)';", html).group(1)

def generate(html):
    if os.path.exists(CSV) and input(f'{CSV} を上書きしますか？ [y/N] ').lower() != 'y':
        sys.exit('中止')
    names = members(html) + ['事務局']
    used = set()
    rows = []
    for n in names:
        while True:
            pin = f'{secrets.randbelow(10000):04d}'
            if pin in used or len(set(pin)) == 1 or pin in ('1234', '0123', '4321', '9876', '2025', '2026'):
                continue
            used.add(pin); rows.append((n, pin)); break
    with open(CSV, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)
    print(f'{CSV} に {len(rows)} 件書き出しました。このファイルはコミットしないこと。')
    for n, p in rows:
        print(f'  {n}\t{p}')

def build_js(html):
    names = members(html)
    s = salt(html)
    entries = []
    with open(CSV, newline='', encoding='utf-8') as f:
        for name, pin in csv.reader(f):
            name, pin = name.strip(), pin.strip()
            if name == '事務局': idx = -1
            elif name in names: idx = names.index(name)
            else: sys.exit(f'MEMBERS に存在しない氏名: {name}')
            h = hashlib.sha256((s + pin).encode('utf-8')).hexdigest()
            entries.append(f"  '{h}': {idx}, // {name}")
    return 'const MEMBER_PINS = {\n' + '\n'.join(entries) + '\n};'

def main():
    html = read_html()
    if '--generate' in sys.argv:
        generate(html); return
    if not os.path.exists(CSV):
        sys.exit(f'{CSV} がありません。--generate で作成してください。')
    js = build_js(html)
    if '--apply' in sys.argv:
        new, n = re.subn(r'const MEMBER_PINS = \{.*?\n\};', js.replace('\\', '\\\\'), html, count=1, flags=re.S)
        if n != 1: sys.exit('index.html に MEMBER_PINS が見つかりません')
        crlf = '\r\n' in html
        if crlf: new = new.replace('\r\n', '\n').replace('\n', '\r\n')
        with open(HTML, 'wb') as f: f.write(new.encode('utf-8'))
        print('index.html の MEMBER_PINS を更新しました')
    else:
        print(js)

if __name__ == '__main__':
    main()
