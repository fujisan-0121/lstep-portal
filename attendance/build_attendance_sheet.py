# -*- coding: utf-8 -*-
"""
勤怠管理（休暇調整）シートを生成するスクリプト。
python3 build_attendance_sheet.py [出力先.xlsx]

構成:
  シフト表    … 年月を切り替えると自動で組み上がる月間一覧 + 人数判定
  休暇申請    … 唯一の入力元（1休暇1行）
  有給管理    … 承認済み申請から自動集計
  設定        … メンバー、勤務曜日、営業曜日、記号、最低出勤人数、祝日
  使い方      … 運用ルールと入力手順

ファイルを小さく保つため、行・列単位の数式は配列数式で書いている
（Excel / Google スプレッドシート / LibreOffice すべてで動く標準形式）。
"""
import sys
from datetime import date
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.formula import ArrayFormula
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.workbook.defined_name import DefinedName

OUT = sys.argv[1] if len(sys.argv) > 1 else "勤怠管理_休暇調整シート.xlsx"
FONT = "Meiryo"

NAVY, ORANGE, SAND, BORDER, MUTED = "1C1C3A", "E8630A", "F2EDE4", "E0D9CE", "8A8078"
INPUT_FILL = PatternFill("solid", fgColor="FFF6DD")
AUTO_FILL = PatternFill("solid", fgColor="F3F3F3")
HEAD_FILL = PatternFill("solid", fgColor=NAVY)
SUB_FILL = PatternFill("solid", fgColor=SAND)
OFF_FILL = PatternFill("solid", fgColor="FADBD8")
HALF_FILL = PatternFill("solid", fgColor="FCF3CF")
REMOTE_FILL = PatternFill("solid", fgColor="D6EAF8")
PEND_FILL = PatternFill("solid", fgColor="FDEBD0")
CLOSED_FILL = PatternFill("solid", fgColor="D9D9D9")
NG_FILL = PatternFill("solid", fgColor="E74C3C")
WARN_FILL = PatternFill("solid", fgColor="F39C12")
OK_FILL = PatternFill("solid", fgColor="D5F5E3")
thin = Side(style="thin", color=BORDER)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WHITE_BOLD = Font(name=FONT, bold=True, color="FFFFFF")


def f(bold=False, color="000000", size=10):
    return Font(name=FONT, bold=bold, color=color, size=size)


def head(ws, row, col, text, width=None):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(name=FONT, bold=True, color="FFFFFF", size=10)
    c.fill = HEAD_FILL
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    if width:
        ws.column_dimensions[get_column_letter(col)].width = width
    return c


def title(ws, text, sub=None):
    ws["B1"] = text
    ws["B1"].font = Font(name=FONT, bold=True, size=16, color=NAVY)
    if sub:
        ws["B2"] = sub
        ws["B2"].font = f(color=MUTED, size=9)
    ws.column_dimensions["A"].width = 2
    ws.sheet_view.showGridLines = False


def cell(ws, ref, value, fill=None, bold=False, color="000000", align=None, fmt=None, border=True):
    c = ws[ref]
    c.value = value
    c.font = f(bold=bold, color=color)
    if fill:
        c.fill = fill
    if align:
        c.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        c.number_format = fmt
    if border:
        c.border = BOX
    return c


def section(ws, ref, text):
    ws[ref] = text
    ws[ref].font = f(bold=True, size=11, color=NAVY)


wb = Workbook()


def add_name(name, ref):
    dn = DefinedName(name, attr_text=ref)
    try:
        wb.defined_names[name] = dn
    except TypeError:
        wb.defined_names.append(dn)


# =============================================================================
# 設定
# =============================================================================
st = wb.active
st.title = "設定"
title(st, "設定", "黄色のセルを編集する。メンバーは最大6名まで。")
for col, w in zip("BCDEFGHIJK", [16, 10, 5, 5, 5, 5, 5, 5, 5, 30]):
    st.column_dimensions[col].width = w
st.column_dimensions["M"].width = 3
st.column_dimensions["N"].width = 14
st.column_dimensions["O"].width = 22

section(st, "B2", "メンバー（氏名・区分・勤務曜日 ○×）")
for i in range(7):  # 曜日番号（HLOOKUP 用）
    c = st.cell(row=3, column=4 + i, value=i + 1)
    c.font = f(color="BBBBBB", size=8)
    c.alignment = Alignment(horizontal="center")
head(st, 4, 2, "氏名")
head(st, 4, 3, "区分")
for i, d in enumerate("月火水木金土日"):
    head(st, 4, 4 + i, d)
head(st, 4, 11, "備考")
members = [
    ("正社員A", "正社員", "○○○○○××", "氏名を実名に書き換える"),
    ("正社員B", "正社員", "○○○○○××", ""),
    ("派遣A", "派遣", "○○○○○××", "契約の勤務曜日に合わせて○×を直す"),
    ("派遣B", "派遣", "○○○○○××", ""),
    ("", "", "×××××××", "増員したらここに追加"),
    ("", "", "×××××××", ""),
]
for i, (name, kind, days, memo) in enumerate(members):
    row = 5 + i
    cell(st, f"B{row}", name, INPUT_FILL)
    cell(st, f"C{row}", kind, INPUT_FILL, align="center")
    for j in range(7):
        cell(st, f"{get_column_letter(4 + j)}{row}", days[j], INPUT_FILL, align="center")
    cell(st, f"K{row}", memo or None, INPUT_FILL, color=MUTED)
dv_kind = DataValidation(type="list", formula1='"正社員,派遣"', allow_blank=True)
dv_ox = DataValidation(type="list", formula1='"○,×"', allow_blank=True)
st.add_data_validation(dv_kind)
st.add_data_validation(dv_ox)
dv_kind.add("C5:C10")
dv_ox.add("D5:J10")
dv_ox.add("D15:J15")

section(st, "B12", "営業曜日（×の曜日は休業日。祝日は右の一覧で指定）")
cell(st, "B13", "曜日", SUB_FILL, bold=True)
cell(st, "B14", "曜日番号", SUB_FILL, color=MUTED)
cell(st, "B15", "営業", SUB_FILL, bold=True)
cell(st, "B16", "勤務予定人数（自動）", SUB_FILL, color=MUTED)
for i, d in enumerate("月火水木金土日"):
    L = get_column_letter(4 + i)
    cell(st, f"{L}13", d, SUB_FILL, bold=True, align="center")
    cell(st, f"{L}14", i + 1, None, color="BBBBBB", align="center")
    cell(st, f"{L}15", "○" if i < 5 else "×", INPUT_FILL, align="center")
    cell(st, f"{L}16", f'=COUNTIF({L}$5:{L}$10,"○")', AUTO_FILL, align="center")
st.merge_cells("B13:C13"); st.merge_cells("B14:C14"); st.merge_cells("B15:C15"); st.merge_cells("B16:C16")

section(st, "B18", "ルール（人数の下限）")
cell(st, "B19", "最低出勤人数（1日あたり）")
cell(st, "C19", 2, INPUT_FILL, align="center")
cell(st, "B20", "最低正社員出勤人数")
cell(st, "C20", 1, INPUT_FILL, align="center")
cell(st, "B21", "申請期限の目安")
cell(st, "C21", "休みたい日の1週間前まで", INPUT_FILL)
st.merge_cells("C21:K21")
cell(st, "D19", "← 4名体制で2なら、同じ日に休めるのは最大2名", None, color=MUTED, border=False)
cell(st, "D20", "← 派遣だけの出勤日（指揮命令者不在）を防ぐ", None, color=MUTED, border=False)

section(st, "B23", "記号（休暇申請の種別）　出勤係数: 1=出勤 / 0=休み / 0.5=半日")
head(st, 24, 2, "記号")
head(st, 24, 3, "意味")
head(st, 24, 4, "係数")
st.merge_cells("D24:E24")
head(st, 24, 6, "備考")
st.merge_cells("F24:K24")
symbols = [
    ("有", "有給休暇", 0, "正社員は年5日取得義務の対象"),
    ("午前", "午前半休", 0.5, "0.5日の有給として集計"),
    ("午後", "午後半休", 0.5, "0.5日の有給として集計"),
    ("休", "公休・希望休", 0, "無給の休み・シフト調整による休み"),
    ("特", "特別休暇（慶弔など）", 0, ""),
    ("代", "代休・振替休日", 0, ""),
    ("欠", "欠勤", 0, "事後登録用"),
    ("在", "在宅勤務", 1, "出勤扱い。所在把握のために記録"),
    ("外", "外出・出張", 1, "出勤扱い。事務所が無人になる場合は別途注意"),
]
SYM_FIRST = 25
SYM_LAST = SYM_FIRST + len(symbols) - 1
for i, (s, mean, coef, memo) in enumerate(symbols):
    row = SYM_FIRST + i
    cell(st, f"B{row}", s, align="center", bold=True)
    cell(st, f"C{row}", mean)
    cell(st, f"D{row}", coef, INPUT_FILL, align="center", fmt="0.0")
    st.merge_cells(f"D{row}:E{row}")
    cell(st, f"F{row}", memo or None, color=MUTED)
    st.merge_cells(f"F{row}:K{row}")

section(st, "N2", "祝日・会社休業日（追加可）")
st["N3"] = "2026/9〜2027年の祝日を入力済み。年末年始など会社休業日も追加できる"
st["N3"].font = f(color=MUTED, size=9)
head(st, 4, 14, "日付")
head(st, 4, 15, "名称")
holidays = [
    (date(2026, 9, 21), "敬老の日"), (date(2026, 9, 22), "国民の休日"), (date(2026, 9, 23), "秋分の日"),
    (date(2026, 10, 12), "スポーツの日"), (date(2026, 11, 3), "文化の日"), (date(2026, 11, 23), "勤労感謝の日"),
    (date(2026, 12, 29), "年末休業（例）"), (date(2026, 12, 30), "年末休業（例）"), (date(2026, 12, 31), "年末休業（例）"),
    (date(2027, 1, 1), "元日"), (date(2027, 1, 2), "年始休業（例）"), (date(2027, 1, 3), "年始休業（例）"),
    (date(2027, 1, 11), "成人の日"), (date(2027, 2, 11), "建国記念の日"), (date(2027, 2, 23), "天皇誕生日"),
    (date(2027, 3, 22), "春分の日 振替休日"), (date(2027, 4, 29), "昭和の日"),
    (date(2027, 5, 3), "憲法記念日"), (date(2027, 5, 4), "みどりの日"), (date(2027, 5, 5), "こどもの日"),
    (date(2027, 7, 19), "海の日"), (date(2027, 8, 11), "山の日"), (date(2027, 9, 20), "敬老の日"),
    (date(2027, 9, 23), "秋分の日"), (date(2027, 10, 11), "スポーツの日"), (date(2027, 11, 3), "文化の日"),
    (date(2027, 11, 23), "勤労感謝の日"),
]
for i, (d, name) in enumerate(holidays):
    row = 5 + i
    cell(st, f"N{row}", d, None, fmt="yyyy/m/d", align="center", border=False)
    cell(st, f"O{row}", name, None, border=False)
st.conditional_formatting.add("N5:O80", FormulaRule(formula=["TRUE"], fill=INPUT_FILL))
st.freeze_panes = "B5"

add_name("STAFF_NAMES", "設定!$B$5:$B$10")
add_name("STAFF_WD", "設定!$D$3:$J$10")      # 1行目=曜日番号, 3行目以降=メンバー
add_name("BIZ_TABLE", "設定!$D$14:$J$16")     # 1行目=曜日番号, 2=営業, 3=勤務予定人数
add_name("HOLIDAYS", "設定!$N$5:$N$80")
add_name("MIN_ALL", "設定!$C$19")
add_name("MIN_FT", "設定!$C$20")
add_name("SYM_TBL", f"設定!$B${SYM_FIRST}:$D${SYM_LAST}")

# =============================================================================
# 休暇申請
# =============================================================================
lg = wb.create_sheet("休暇申請")
title(lg, "休暇申請（ここだけ入力する）",
      "1休暇につき1行。連休は日ごとに1行。状態を「承認」にするとシフト表・有給管理に反映される。行の挿入はせず、下に追記する。")
L0, L1 = 5, 124
cols = [("申請日", 11), ("氏名", 12), ("休暇日", 11), ("種別", 8), ("理由・備考", 28),
        ("状態", 9), ("承認者", 10), ("同日の他の休み", 10), ("出勤見込み", 9), ("判定", 12),
        ("キー承認", 16), ("キー申請中", 16), ("種別", 6)]
for i, (name, w) in enumerate(cols):
    head(lg, 4, 2 + i, name, w)
lg.row_dimensions[4].height = 30
lg["B3"] = "黄色 = 入力     灰色 = 自動（触らない）     同日の他の休み = 承認＋申請中の人数（半休も1人と数える）     出勤見込み = 勤務予定人数 − 休む人数"
lg["B3"].font = f(color=MUTED, size=9)
samples = [
    (date(2026, 9, 1), "正社員A", date(2026, 9, 10), "有", "私用", "承認", "正社員B"),
    (date(2026, 9, 2), "派遣A", date(2026, 9, 10), "有", "通院", "申請中", ""),
    (date(2026, 9, 2), "正社員B", date(2026, 9, 15), "午前", "役所手続き", "承認", "正社員A"),
    (date(2026, 9, 2), "派遣B", date(2026, 9, 10), "休", "私用（希望休）", "申請中", ""),
]
for i, s in enumerate(samples):
    row = L0 + i
    cell(lg, f"B{row}", s[0], None, fmt="yyyy/m/d", align="center", border=False)
    cell(lg, f"C{row}", s[1], None, border=False)
    cell(lg, f"D{row}", s[2], None, fmt="yyyy/m/d", align="center", border=False)
    cell(lg, f"E{row}", s[3], None, align="center", border=False)
    cell(lg, f"F{row}", s[4], None, border=False)
    cell(lg, f"G{row}", s[5], None, align="center", border=False)
    cell(lg, f"H{row}", s[6] or None, None, border=False)
D, G, C, E = f"D{L0}:D{L1}", f"G{L0}:G{L1}", f"C{L0}:C{L1}", f"E{L0}:E{L1}"
arrays = {
    "I": f'=IF({D}="","",COUNTIFS(LOG_DATE,{D},LOG_STATE,"承認")+COUNTIFS(LOG_DATE,{D},LOG_STATE,"申請中")-IF({G}="却下",0,1))',
    "J": f'=IF({D}="","",IFERROR(HLOOKUP(WEEKDAY({D},2),BIZ_TABLE,3,0)-I{L0}:I{L1}-IF({G}="却下",0,1),"日付を確認"))',
    "K": f'=IF({D}="","",IFERROR(IF((HLOOKUP(WEEKDAY({D},2),BIZ_TABLE,2,0)="×")+(COUNTIF(HOLIDAYS,{D})>0)>0,"休業日",IF(J{L0}:J{L1}<MIN_ALL,"要確認","OK")),"日付を確認"))',
    "L": f'=IF(({G}="承認")*({C}<>"")*({D}<>""),{C}&"|"&TEXT({D},"yyyymmdd"),"")',
    "M": f'=IF(({G}="申請中")*({C}<>"")*({D}<>""),{C}&"|"&TEXT({D},"yyyymmdd"),"")',
    "N": f'=IF({E}="","",{E})',
}
for col, formula in arrays.items():
    lg[f"{col}{L0}"] = ArrayFormula(f"{col}{L0}:{col}{L1}", formula)
    lg[f"{col}{L0}"].font = f(color=MUTED if col in "LMN" else "000000", bold=(col == "K"))
    lg[f"{col}{L0}"].alignment = Alignment(horizontal="center")
add_name("LOG_NAME", f"休暇申請!$C${L0}:$C${L1}")
add_name("LOG_DATE", f"休暇申請!$D${L0}:$D${L1}")
add_name("LOG_SYM", f"休暇申請!$E${L0}:$E${L1}")
add_name("LOG_STATE", f"休暇申請!$G${L0}:$G${L1}")
add_name("KEYTAB_A", f"休暇申請!$L${L0}:$N${L1}")
add_name("KEYTAB_P", f"休暇申請!$M${L0}:$N${L1}")

dv_name = DataValidation(type="list", formula1="=設定!$B$5:$B$10", allow_blank=True)
dv_sym = DataValidation(type="list", formula1=f"=設定!$B${SYM_FIRST}:$B${SYM_LAST}", allow_blank=True)
dv_state = DataValidation(type="list", formula1='"申請中,承認,却下"', allow_blank=True)
dv_date = DataValidation(type="date", operator="greaterThan", formula1="40000", allow_blank=True,
                         error="日付を 2026/9/10 の形式で入力してください", showErrorMessage=True)
for dv in (dv_name, dv_sym, dv_state, dv_date):
    lg.add_data_validation(dv)
dv_name.add(f"C{L0}:C{L1}")
dv_sym.add(f"E{L0}:E{L1}")
dv_state.add(f"G{L0}:G{L1}")
dv_date.add(f"B{L0}:B{L1}")
dv_date.add(f"D{L0}:D{L1}")
lg.conditional_formatting.add(f"B{L0}:H{L1}", FormulaRule(formula=["TRUE"], fill=INPUT_FILL))
lg.conditional_formatting.add(f"I{L0}:N{L1}", FormulaRule(formula=["TRUE"], fill=AUTO_FILL))
lg.conditional_formatting.add(f"K{L0}:K{L1}", CellIsRule(operator="equal", formula=['"要確認"'], fill=WARN_FILL, font=WHITE_BOLD))
lg.conditional_formatting.add(f"K{L0}:K{L1}", CellIsRule(operator="equal", formula=['"OK"'], fill=OK_FILL))
lg.conditional_formatting.add(f"G{L0}:G{L1}", CellIsRule(operator="equal", formula=['"申請中"'], fill=PEND_FILL))
lg.conditional_formatting.add(f"G{L0}:G{L1}", CellIsRule(operator="equal", formula=['"承認"'], fill=OK_FILL))
lg.conditional_formatting.add(f"G{L0}:G{L1}", CellIsRule(operator="equal", formula=['"却下"'], fill=CLOSED_FILL))
lg.freeze_panes = "B5"
lg.sheet_view.showGridLines = True

# =============================================================================
# シフト表
# =============================================================================
sh = wb.create_sheet("シフト表")
title(sh, "シフト表（自動）", "年と月を変えるだけ。休暇申請の内容が自動で入る。( ) 付きは申請中。空欄 = 通常出勤、－ = その人の勤務曜日ではない日。")
sh.column_dimensions["B"].width = 14
sh.column_dimensions["C"].width = 8
for c in range(4, 35):
    sh.column_dimensions[get_column_letter(c)].width = 4.6
sh.column_dimensions["AI"].width = 2

cell(sh, "B3", "年", SUB_FILL, bold=True, align="center")
cell(sh, "C3", 2026, INPUT_FILL, bold=True, align="center", fmt="0")
cell(sh, "D3", "月", SUB_FILL, bold=True, align="center")
cell(sh, "E3", 9, INPUT_FILL, bold=True, align="center", fmt="0")
sh.merge_cells("E3:F3")
cell(sh, "H3", "最低出勤", SUB_FILL, bold=True, align="center")
sh.merge_cells("H3:J3")
cell(sh, "K3", "=MIN_ALL", AUTO_FILL, align="center", color="008000")
cell(sh, "L3", "最低正社員", SUB_FILL, bold=True, align="center")
sh.merge_cells("L3:O3")
cell(sh, "P3", "=MIN_FT", AUTO_FILL, align="center", color="008000")

R_DATE, R_WD, R_CLOSED = 5, 6, 7
S0, S1 = 8, 13                 # メンバー行
R_CNT, R_CNT_FT, R_CNT_TMP, R_JUDGE, R_CNT_PEND, R_JUDGE_PEND = 15, 16, 17, 18, 19, 20
H0, H1 = 23, 28                # 出勤係数（自動）
DAYS = "D$5:AH$5"
CLOSED = "D$7:AH$7"

head(sh, R_DATE, 2, "氏名")
head(sh, R_DATE, 3, "区分")
sh.merge_cells("B5:B7"); sh.merge_cells("C5:C7")
for col, text in zip((36, 37, 38, 39), ("所定日数", "出勤日数", "休暇日数", "有給日数")):
    head(sh, R_DATE, col, text, 8)
    sh.merge_cells(start_row=R_DATE, start_column=col, end_row=R_CLOSED, end_column=col)

# 見出し行（配列数式）
sh["D5"] = ArrayFormula("D5:AH5", '=IF(DATE($C$3,$E$3,1)+COLUMN(D$5:AH$5)-COLUMN($D$5)>EOMONTH(DATE($C$3,$E$3,1),0),"",DATE($C$3,$E$3,1)+COLUMN(D$5:AH$5)-COLUMN($D$5))')
sh["D6"] = ArrayFormula("D6:AH6", f'=IF({DAYS}="","",MID("月火水木金土日",WEEKDAY({DAYS},2),1))')
sh["D7"] = ArrayFormula("D7:AH7", f'=IF({DAYS}="","",IF((HLOOKUP(WEEKDAY({DAYS},2),BIZ_TABLE,2,0)="×")+(COUNTIF(HOLIDAYS,{DAYS})>0)>0,"休業",""))')
for ref, fill, color in (("D5", SUB_FILL, "000000"), ("D6", SUB_FILL, "000000"), ("D7", SUB_FILL, MUTED)):
    sh[ref].fill = fill
    sh[ref].font = f(bold=(ref == "D5"), color=color)
    sh[ref].alignment = Alignment(horizontal="center")
sh["D5"].number_format = "d"

for i in range(6):
    r, h = S0 + i, H0 + i
    cell(sh, f"B{r}", f'=IF(設定!B{5 + i}="","",設定!B{5 + i})', None, bold=True, color="008000")
    cell(sh, f"C{r}", f'=IF(設定!C{5 + i}="","",設定!C{5 + i})', None, color="008000", align="center")
    ROW = f"D{r}:AH{r}"
    key = f'$B{r}&"|"&TEXT({DAYS},"yyyymmdd")'
    sh[f"D{r}"] = ArrayFormula(ROW,
        f'=IF($B{r}="","",IF({DAYS}="","",IF({CLOSED}="休業","",'
        f'IF(HLOOKUP(WEEKDAY({DAYS},2),STAFF_WD,MATCH($B{r},STAFF_NAMES,0)+2,0)="×","－",'
        f'IFERROR(VLOOKUP({key},KEYTAB_A,3,0),IFERROR("("&VLOOKUP({key},KEYTAB_P,2,0)&")",""))))))')
    sh[f"D{r}"].alignment = Alignment(horizontal="center")
    sh[f"D{r}"].font = f()
    sh[f"D{h}"] = ArrayFormula(f"D{h}:AH{h}",
        f'=IF($B{r}="","",IF({DAYS}="","",IF({CLOSED}="休業","",IF({ROW}="－","",'
        f'IF({ROW}="",1,IFERROR(VLOOKUP({ROW},SYM_TBL,3,0),1))))))')
    sh[f"D{h}"].font = f(color=MUTED)
    sh[f"D{h}"].alignment = Alignment(horizontal="center")
    sh[f"D{h}"].number_format = "0.#"
    cell(sh, f"B{h}", f"=B{r}", AUTO_FILL, color=MUTED)
    cell(sh, f"C{h}", "係数", AUTO_FILL, color=MUTED, align="center")
    HROW = f"D{h}:AH{h}"
    cell(sh, f"AJ{r}", f'=IF($B{r}="","",COUNT({HROW}))', AUTO_FILL, align="center")
    cell(sh, f"AK{r}", f'=IF($B{r}="","",SUM({HROW}))', AUTO_FILL, align="center", fmt="0.#")
    cell(sh, f"AL{r}", f'=IF($B{r}="","",AJ{r}-AK{r})', AUTO_FILL, align="center", fmt="0.#")
    cell(sh, f"AM{r}", f'=IF($B{r}="","",COUNTIF({ROW},"有")+0.5*(COUNTIF({ROW},"午前")+COUNTIF({ROW},"午後")))', AUTO_FILL, align="center", fmt="0.#")

# 集計行（列ごとの通常数式）
for c in range(4, 35):
    L = get_column_letter(c)
    HA = f"{L}{H0}:{L}{H1}"
    GR = f"{L}{S0}:{L}{S1}"
    KIND = f"$C${S0}:$C${S1}"
    closed = f'{L}$5="","",IF({L}$7="休業","－",'
    cell(sh, f"{L}{R_CNT}", f'=IF({closed}SUM({HA})))', AUTO_FILL, bold=True, align="center", fmt="0.#")
    cell(sh, f"{L}{R_CNT_FT}", f'=IF({closed}SUMIF({KIND},"正社員",{HA})))', AUTO_FILL, align="center", fmt="0.#")
    cell(sh, f"{L}{R_CNT_TMP}", f'=IF({closed}SUMIF({KIND},"派遣",{HA})))', AUTO_FILL, align="center", fmt="0.#")
    cell(sh, f"{L}{R_JUDGE}", f'=IF({closed}IF(OR({L}{R_CNT}<MIN_ALL,{L}{R_CNT_FT}<MIN_FT),"NG","OK")))', AUTO_FILL, bold=True, align="center")
    cell(sh, f"{L}{R_CNT_PEND}", f'=IF({closed}{L}{R_CNT}-SUMPRODUCT((LEFT({GR},1)="(")*1)))', AUTO_FILL, align="center", fmt="0.#")
    cell(sh, f"{L}{R_JUDGE_PEND}",
         f'=IF({closed}IF(OR({L}{R_CNT_PEND}<MIN_ALL,{L}{R_CNT_FT}-SUMPRODUCT(({KIND}="正社員")*(LEFT({GR},1)="("))<MIN_FT),"要注意","OK")))',
         AUTO_FILL, bold=True, align="center")
labels = {
    R_CNT: "出勤人数（承認済み反映）", R_CNT_FT: "　うち正社員", R_CNT_TMP: "　うち派遣",
    R_JUDGE: "判定（NG = 下限割れ）", R_CNT_PEND: "申請中も休みにした場合の出勤人数", R_JUDGE_PEND: "申請中を承認した場合の判定",
}
for r, text in labels.items():
    cell(sh, f"B{r}", text, SUB_FILL, bold=r in (R_CNT, R_JUDGE, R_JUDGE_PEND))
    sh.merge_cells(f"B{r}:C{r}")
cell(sh, "B22", "自動計算エリア（出勤係数。編集不要。申請中は1日休み扱いで安全側に計算）", None, color=MUTED, border=False)

# 配列数式の出力先（E..AH）にも見出し・グリッド・係数行と同じ書式を入れる
for c in range(5, 35):
    L = get_column_letter(c)
    for r in list(range(5, 14)) + list(range(H0, H1 + 1)):
        src = sh[f"D{r}"]
        dst = sh[f"{L}{r}"]
        dst.font = src.font.copy()
        dst.fill = src.fill.copy()
        dst.alignment = src.alignment.copy()
        dst.number_format = src.number_format
GRID = f"D{S0}:AH{S1}"
sh.conditional_formatting.add(f"D5:AH{R_JUDGE_PEND}", FormulaRule(formula=['D$7="休業"'], fill=CLOSED_FILL, stopIfTrue=True))
sh.conditional_formatting.add("D6:AH6", FormulaRule(formula=['D6="日"'], font=Font(name=FONT, color="C0392B", bold=True)))
sh.conditional_formatting.add("D6:AH6", FormulaRule(formula=['D6="土"'], font=Font(name=FONT, color="2E86C1", bold=True)))
sh.conditional_formatting.add(GRID, FormulaRule(formula=['LEFT(D8,1)="("'], fill=PEND_FILL, stopIfTrue=True))
sh.conditional_formatting.add(GRID, FormulaRule(formula=['OR(D8="有",D8="休",D8="特",D8="代",D8="欠")'], fill=OFF_FILL, font=Font(name=FONT, bold=True, color="922B21")))
sh.conditional_formatting.add(GRID, FormulaRule(formula=['OR(D8="午前",D8="午後")'], fill=HALF_FILL))
sh.conditional_formatting.add(GRID, FormulaRule(formula=['OR(D8="在",D8="外")'], fill=REMOTE_FILL))
sh.conditional_formatting.add(GRID, FormulaRule(formula=['D8="－"'], font=Font(name=FONT, color="BBBBBB")))
sh.conditional_formatting.add(f"D{H0}:AH{H1}", FormulaRule(formula=["TRUE"], fill=AUTO_FILL))
sh.conditional_formatting.add(f"D{R_JUDGE}:AH{R_JUDGE}", CellIsRule(operator="equal", formula=['"NG"'], fill=NG_FILL, font=WHITE_BOLD))
sh.conditional_formatting.add(f"D{R_JUDGE}:AH{R_JUDGE}", CellIsRule(operator="equal", formula=['"OK"'], fill=OK_FILL))
sh.conditional_formatting.add(f"D{R_JUDGE_PEND}:AH{R_JUDGE_PEND}", CellIsRule(operator="equal", formula=['"要注意"'], fill=WARN_FILL, font=WHITE_BOLD))
sh.conditional_formatting.add(f"D{R_JUDGE_PEND}:AH{R_JUDGE_PEND}", CellIsRule(operator="equal", formula=['"OK"'], fill=OK_FILL))
for col, (text, fill) in enumerate([("有/休/特/代/欠", OFF_FILL), ("午前/午後", HALF_FILL), ("在/外", REMOTE_FILL), ("(申請中)", PEND_FILL), ("休業日", CLOSED_FILL)], start=36):
    c = sh.cell(row=3, column=col, value=text)
    c.fill = fill
    c.font = f(size=9)
    c.alignment = Alignment(horizontal="center")
sh.column_dimensions["AN"].width = 10
sh.freeze_panes = "D8"
sh.sheet_properties.tabColor = ORANGE

# =============================================================================
# 有給管理
# =============================================================================
pm = wb.create_sheet("有給管理")
title(pm, "有給管理（自動集計）", "承認済みの「有」「午前」「午後」を基準日以降で数える。派遣の残数は派遣元が管理するため、ここでは取得日数の把握のみ。")
for i, (name, w) in enumerate([("氏名", 14), ("区分", 9), ("基準日（付与日）", 14), ("付与日数", 9), ("繰越日数", 9),
                               ("取得日数（承認済）", 12), ("残日数", 12), ("年5日取得義務", 14), ("備考", 34)]):
    head(pm, 4, 2 + i, name, w)
pm.row_dimensions[4].height = 30
pm["B3"] = "黄色 = 入力（付与日・付与日数・繰越）　年10日以上付与される人は付与日から1年以内に5日取得させる義務あり（労基法39条7項）"
pm["B3"].font = f(color=MUTED, size=9)
defaults = [(date(2026, 4, 1), 10, 0), (date(2026, 4, 1), 11, 3)] + [(None, None, None)] * 4
for i in range(6):
    r = 5 + i
    cell(pm, f"B{r}", f'=IF(設定!B{5 + i}="","",設定!B{5 + i})', None, bold=True, color="008000")
    cell(pm, f"C{r}", f'=IF(設定!C{5 + i}="","",設定!C{5 + i})', None, color="008000", align="center")
    d, grant, carry = defaults[i]
    cell(pm, f"D{r}", d, INPUT_FILL, fmt="yyyy/m/d", align="center")
    cell(pm, f"E{r}", grant, INPUT_FILL, align="center", fmt="0.#")
    cell(pm, f"F{r}", carry, INPUT_FILL, align="center", fmt="0.#")
    since = f'">="&IF(D{r}="",0,D{r})'
    cnt = lambda s: f'COUNTIFS(LOG_NAME,B{r},LOG_DATE,{since},LOG_SYM,"{s}",LOG_STATE,"承認")'
    cell(pm, f"G{r}", f'=IF(B{r}="","",{cnt("有")}+0.5*({cnt("午前")}+{cnt("午後")}))', AUTO_FILL, align="center", fmt="0.#")
    cell(pm, f"H{r}", f'=IF(B{r}="","",IF(C{r}="派遣","派遣元で管理",E{r}+F{r}-G{r}))', AUTO_FILL, align="center", fmt="0.#")
    cell(pm, f"I{r}", f'=IF(B{r}="","",IF(C{r}="派遣","対象外（派遣元）",IF(E{r}>=10,IF(G{r}>=5,"達成","あと"&(5-G{r})&"日"),"対象外")))', AUTO_FILL, align="center")
    cell(pm, f"J{r}", "付与日数・繰越は例。実際の値に直す" if i == 0 else None, INPUT_FILL, color=MUTED)
pm.conditional_formatting.add("I5:I10", FormulaRule(formula=['LEFT(I5,2)="あと"'], fill=WARN_FILL, font=WHITE_BOLD))
pm.conditional_formatting.add("I5:I10", CellIsRule(operator="equal", formula=['"達成"'], fill=OK_FILL))
pm.conditional_formatting.add("H5:H10", FormulaRule(formula=['AND(ISNUMBER(H5),H5<=2)'], fill=OFF_FILL))
pm.freeze_panes = "B5"

# =============================================================================
# 使い方
# =============================================================================
ws = wb.create_sheet("使い方")
title(ws, "使い方", "正社員2名 + 派遣2名の少人数チーム向け。誰がいつ休むかを一箇所で見える化し、出勤人数が最低ラインを割らないように調整する。")
ws.column_dimensions["B"].width = 4
ws.column_dimensions["C"].width = 110
rows = [
    ("■ 基本の考え方", True),
    ("・入力するのは「休暇申請」シートだけ。1休暇につき1行（連休は日ごとに1行）。行の挿入はせず下に追記する。", False),
    ("・「シフト表」は年・月を切り替えるだけで自動で組み上がる。「有給管理」は承認済みの申請から自動集計。", False),
    ("・黄色のセル = 入力する場所。灰色のセル = 自動計算（触らない）。", False),
    ("■ 最初にやること（5分）", True),
    ("1. 「設定」でメンバー4名の氏名・区分（正社員／派遣）・勤務曜日（○×）を入れる。", False),
    ("2. 「設定」の最低出勤人数（初期値 2名）と最低正社員出勤人数（初期値 1名）を確認する。", False),
    ("3. 「有給管理」に各人の付与日・付与日数・繰越を入れる（派遣の残数は派遣元管理なので不要）。", False),
    ("4. サンプルの申請4行（9/10に3人が重なって「要確認」が出る例）は削除してよい。", False),
    ("■ 休みを取りたいとき（申請者）", True),
    ("1. 「休暇申請」に申請日・氏名・休暇日・種別・理由を1行追加。状態は「申請中」。", False),
    ("2. 「判定」列に「要確認」と出たら、その日は既に誰かが休む予定。日程をずらせないか先に相談する。", False),
    ("■ 承認するとき（管理者）", True),
    ("1. 「シフト表」の「申請中を承認した場合の判定」行が「要注意」なら、承認すると最低人数を割る。", False),
    ("2. 問題なければ状態を「承認」に変え、承認者名を入れる。却下なら「却下」。", False),
    ("3. 派遣メンバーの休みは、承認と同時に派遣元（派遣会社）にも連絡する。派遣元にとって勤怠実績は請求根拠。", False),
    ("■ 運用ルールの例", True),
    ("・申請は原則、休みたい日の1週間前まで。急な体調不良は当日連絡＋事後に「欠」または「有」で登録。", False),
    ("・同じ日に希望が重なったら「先に申請した人」より「直近3か月の休み取得が少ない人」を優先すると不公平感が出にくい。", False),
    ("・派遣2名だけの出勤日は作らない（指揮命令者が不在になる）。最低正社員出勤人数=1 はそのための設定。", False),
    ("・正社員は年5日の有給取得義務あり。「年5日義務」列が「あと○日」のままなら管理者側から取得日を提案する。", False),
    ("■ 注意", True),
    ("・休暇申請の日付は必ず日付形式（2026/9/10）で入力。文字として入ると集計に乗らない。", False),
    ("・自動列は120行分。超える場合は「休暇申請」の各自動列の数式の範囲（5:124）を広げる。", False),
    ("・半休は「同日の他の休み」「申請中の判定」では1人分の休みとして数える（安全側）。承認後の出勤人数は0.5で数える。", False),
]
r = 4
for text, bold in rows:
    c = ws.cell(row=r, column=3, value=text)
    c.font = Font(name=FONT, bold=bold, size=11 if bold else 10, color=NAVY if bold else "000000")
    c.alignment = Alignment(wrap_text=True, vertical="top")
    if bold:
        ws.cell(row=r, column=2).fill = PatternFill("solid", fgColor=ORANGE)
    r += 1

wb._sheets = [wb["シフト表"], wb["休暇申請"], wb["有給管理"], wb["設定"], wb["使い方"]]
wb.active = 0
wb.save(OUT)
print("saved", OUT)


# =============================================================================
# 後処理: 同じパターンの数式を共有数式にまとめて小さくする
# =============================================================================
def compact_shared_formulas(path):
    import re
    import zipfile
    import xml.etree.ElementTree as ET
    from openpyxl.formula.translate import Translator
    from openpyxl.utils.cell import coordinate_from_string, column_index_from_string

    NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    ET.register_namespace("", NS)
    ET.register_namespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    q = lambda t: f"{{{NS}}}{t}"

    def key(ref):
        col, row = coordinate_from_string(ref)
        return (row, column_index_from_string(col))

    src = zipfile.ZipFile(path)
    items = {n: src.read(n) for n in src.namelist()}
    src.close()
    for name in list(items):
        if not re.match(r"xl/worksheets/sheet\d+\.xml$", name):
            continue
        root = ET.fromstring(items[name])
        cells = {}
        for c in root.iter(q("c")):
            fe = c.find(q("f"))
            if fe is not None and fe.text and fe.get("t") is None:
                cells[key(c.get("r"))] = (c, fe)
        done, si = set(), 0
        for k in sorted(cells):
            if k in done:
                continue
            c, fe = cells[k]
            tr = Translator("=" + fe.text, origin=c.get("r"))

            def run(step):
                out, nk = [k], (k[0] + step[0], k[1] + step[1])
                while nk in cells and nk not in done:
                    cc, ff = cells[nk]
                    if tr.translate_formula(cc.get("r")) != "=" + ff.text:
                        break
                    out.append(nk)
                    nk = (nk[0] + step[0], nk[1] + step[1])
                return out

            best = max(run((1, 0)), run((0, 1)), key=len)
            if len(best) < 3:
                done.add(k)
                continue
            fe.set("t", "shared")
            fe.set("ref", f"{c.get('r')}:{cells[best[-1]][0].get('r')}")
            fe.set("si", str(si))
            for kk in best[1:]:
                cc, ff = cells[kk]
                ff.text = None
                ff.set("t", "shared")
                ff.set("si", str(si))
            done.update(best)
            si += 1
        # 空の <v/> は不要
        for v in root.iter(q("v")):
            pass
        items[name] = ET.tostring(root, xml_declaration=True, encoding="UTF-8")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as dst:
        for n, data in items.items():
            dst.writestr(n, data)


compact_shared_formulas(OUT)
print("compacted", OUT)
