# BDF 비트맵 폰트 → 게임이 <script>로 읽는 작은 JS 데이터 파일.
# file://로 열어도 읽히도록 fetch 대신 전역 변수에 담는다. BDF를 고쳤으면 다시 실행:
#   python fonts/bdf2js.py fonts/Galmuri11-Condensed.bdf fonts/galmuri11c.js GALMURI11C
#
# 형식 (base64 한 줄):
#   글자마다 머리 6바이트 이상 = 코드포인트 차이(가변 길이 정수), 진행폭, 비트맵 폭, 높이, x오프셋+8, y오프셋+8
#   그 뒤 비트맵을 왼쪽 위부터 한 칸 1비트로 이어 붙인다 (글자 경계에서 바이트를 맞추지 않음: 머리 다음 바이트부터 시작)
#
# 게임에 필요한 글자만 남긴다 (한글 + 영문·숫자 + 자주 쓰는 기호). 더 필요하면 KEEP에 범위를 추가하고 다시 변환.
# BDF 원본은 저장소에 두지 않는다: https://github.com/quiple/galmuri 의 dist/Galmuri11-Condensed.bdf
import re, sys, base64

KEEP = [
    (0x0020, 0x007E),   # 영문·숫자·기본 문장부호
    (0x00A0, 0x00FF),   # · × ÷ ° ± « » 같은 라틴 보충 기호
    (0x2010, 0x2027),   # ‐ – — ‘ ’ “ ” • …
    (0x2030, 0x203B),   # ‰ ′ ″ ※
    (0x2190, 0x2199),   # 화살표 ← ↑ → ↓
    (0x2460, 0x2473),   # ① ~ ⑳ (갈무리에는 ① ~ ⑩만 있다)
    (0x25A0, 0x25FF),   # ■ □ ▲ △ ▶ ▼ ◀ ◆ ◇ ○ ● 등 도형
    (0x2600, 0x266F),   # ★ ☆ ♠ ♡ ♥ ♣ ♪ 등
    (0x3000, 0x3011),   # 、 。 〈 〉 《 》 「 」 『 』 【 】
    (0x3131, 0x318E),   # 한글 자모 ㄱ ~ ㅣ
    (0xAC00, 0xD7A3),   # 한글 완성형 11,172자
    (0xFF01, 0xFF5E),   # 전각 문장부호·영문 (！ ？ ～ 등)
]
keep = lambda cp: any(a <= cp <= b for a, b in KEEP)

src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8').read()
ascent = int(re.search(r'FONT_ASCENT (\d+)', s).group(1))
descent = int(re.search(r'FONT_DESCENT (\d+)', s).group(1))
glyphs = []
for blk in s.split('STARTCHAR')[1:]:
    cp = int(re.search(r'ENCODING (-?\d+)', blk).group(1))
    if cp < 0 or not keep(cp):
        continue
    dw = int(re.search(r'DWIDTH (-?\d+)', blk).group(1))
    w, h, xo, yo = map(int, re.search(r'BBX (-?\d+) (-?\d+) (-?\d+) (-?\d+)', blk).groups())
    rows = blk.split('BITMAP')[1].split('ENDCHAR')[0].split()
    bits = []
    for r in rows[:h]:
        v, n = int(r, 16), len(r) * 4
        bits += [(v >> (n - 1 - i)) & 1 for i in range(w)]
    glyphs.append((cp, dw, w, h, xo, yo, bits))
glyphs.sort()

out, prev = bytearray(), 0
for cp, dw, w, h, xo, yo, bits in glyphs:
    d = cp - prev; prev = cp
    while d >= 0x80:
        out.append((d & 0x7f) | 0x80); d >>= 7
    out.append(d)
    out += bytes([dw, w, h, xo + 8, yo + 8])
    b = bytearray((len(bits) + 7) // 8)
    for i, v in enumerate(bits):
        if v:
            b[i >> 3] |= 0x80 >> (i & 7)
    out += b

data = base64.b64encode(bytes(out)).decode()
with open(dst, 'w', encoding='utf-8', newline='\n') as f:
    f.write('// Galmuri11 Condensed — Copyright (c) 2019–2025 Lee Minseo (quiple@quiple.dev), SIL Open Font License 1.1 (fonts/LICENSE.txt).\n')
    f.write(f'// {src.replace(chr(92), "/").split("/")[-1]}에서 fonts/bdf2js.py로 변환. 글자 {len(glyphs)}개\n')
    f.write(f'window.{name} = {{ ascent: {ascent}, descent: {descent}, count: {len(glyphs)}, data: "{data}" }};\n')
print(len(glyphs), 'glyphs,', len(out), 'bytes raw,', len(data), 'base64')
