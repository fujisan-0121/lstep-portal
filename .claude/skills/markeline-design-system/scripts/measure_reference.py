import numpy as np, json
from PIL import Image, ImageDraw, ImageFont
SCALE=1920/2046
def mask(im, cls):
    R,G,B=im[...,0],im[...,1],im[...,2]
    if cls=='ink': return (R<120)&(G<120)&(B<120)
    if cls=='white': return (R>215)&(G>215)&(B>215)
    if cls=='teal': return (R<110)&(G>100)&(B>100)&(G-R>50)
    if cls=='yellow': return (R>190)&(G>130)&(B<110)&(R-B>100)
def lines(im, box, cls, minfrac=0.01):
    x0,y0,x1,y1=box; sub=im[y0:y1,x0:x1]; m=mask(sub,cls)
    prof=m.sum(axis=1); thr=max(2,(x1-x0)*minfrac)
    runs=[]; start=None
    for i,v in enumerate(prof):
        if v>=thr and start is None: start=i
        if v<thr and start is not None:
            if i-start>=8: runs.append((y0+start,y0+i,i-start))
            start=None
    if start is not None and len(prof)-start>=8: runs.append((y0+start,y1,len(prof)-start))
    return runs
# calibration: ink height ratio for Noto Sans JP Black
def calib(text, weight='Black', size=200):
    f=ImageFont.truetype(f'NotoSansJP-{weight}.ttf', size)
    im=Image.new('L',(size*len(text)+100,size*2),0); d=ImageDraw.Draw(im); d.text((20,size//2),text,font=f,fill=255)
    a=np.array(im)>128; rows=np.where(a.any(axis=1))[0]; return (rows.max()-rows.min()+1)/size
R_JP=calib('本日のゴール時間'); R_KANA=calib('のまま'); R_DIG=calib('2〜3'); R_DIG2=calib('1,000'); R_DIG3=calib('30')
print(f'calibration (Noto Sans JP Black): JP mixed {R_JP:.3f}  kana {R_KANA:.3f}  digits "2〜3" {R_DIG:.3f}  "1,000" {R_DIG2:.3f}  "30" {R_DIG3:.3f}')
REG={
 2:[('タイトル帯 本日のゴール','white',(650,60,1400,200),R_JP),
    ('ゴール本文 黒','ink',(430,380,1800,500),R_JP),
    ('ゴール強調 黄','yellow',(430,500,1200,600),R_JP),
    ('ゴール本文 続き 黒','ink',(1200,500,1950,600),R_JP),
    ('番号丸の数字 1','white',(200,400,360,560),R_DIG3)],
 3:[('見出し ティール','teal',(50,50,1200,170),R_JP),
    ('サブ見出し','teal',(70,170,1100,240),R_JP),
    ('カード見出し 担当者依存','ink',(440,360,800,460),R_JP),
    ('カード箇条書き','ink',(380,500,980,600),R_JP),
    ('番号丸の数字','white',(340,370,420,450),R_DIG3)],
 4:[('タイトル帯 白','white',(200,20,1700,160),R_JP),
    ('巨大数字 2〜3 ティール','teal',(370,220,800,380),R_DIG),
    ('単位 時間 ティール','teal',(800,220,1000,380),R_JP),
    ('説明 黒 1行目','ink',(1120,230,1700,310),R_JP),
    ('説明 黒 2行目','ink',(1120,300,1700,370),R_JP),
    ('注記 小','ink',(1500,520,2000,590),R_JP),
    ('巨大数字 1,000 黄','yellow',(330,830,830,960),R_DIG2),
    ('単位 万円 黄','yellow',(830,830,1000,960),R_JP),
    ('結論帯 黒','ink',(350,1030,1700,1130),R_JP)],
 7:[('見出し ティール','teal',(300,30,1900,140),R_JP),
    ('表ヘッダ 白','white',(250,210,600,280),R_JP),
    ('表 業務名','ink',(220,310,800,380),R_JP),
    ('表 業務名 補足','ink',(220,380,800,430),R_JP),
    ('表 打ち手','ink',(860,330,1400,400),R_JP),
    ('表 効果 黄','yellow',(1500,330,2000,400),R_JP)],
 11:[('タイトル帯 白','white',(60,40,1400,140),R_JP),
    ('カード見出し 白','white',(270,640,800,720),R_JP),
    ('巨大数字 30 白','white',(350,760,680,900),R_DIG3),
    ('単位 万円 白','white',(680,760,800,900),R_JP),
    ('黄カード見出し 黒','ink',(1330,210,1800,290),R_JP),
    ('巨大数字 120 黒','ink',(1380,300,1750,450),R_DIG3),
    ('黄カード補足 黒','ink',(1300,490,1900,560),R_JP),
    ('下段注記 黒','ink',(240,980,900,1050),R_JP)],
}
rows=[]
for n,regs in REG.items():
    im=np.array(Image.open(f'full{n:02d}.jpeg').convert('RGB')).astype(int)
    for name,cls,box,ratio in regs:
        ls=lines(im,box,cls)
        if not ls: print(f'slide{n:2d} {name:16s} (no line found)'); continue
        h=max(l[2] for l in ls)  # tallest run = the text line
        fs=h/ratio; px=fs*SCALE; pt=px*720/1920
        rows.append((n,name,h,round(px),round(pt,1)))
        print(f'slide{n:2d} {name:18s} glyphH={h:4d}px(src)  font-size≈{px:5.0f}px @1920  ≈{pt:5.1f}pt')
json.dump(rows,open('measurements.json','w'),ensure_ascii=False,indent=1)
