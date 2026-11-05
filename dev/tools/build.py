# src/ → index.html: template.html의 @GAME 자리에 src/*.js를 파일 이름 순서대로 이어 붙여 넣는다.
# 브라우저는 파일로 연 페이지(file://)에서 로컬 모듈 파일(import)을 읽지 못하므로, 게임 코드는 한 덩어리 <script type="module">로 합친다.
# 모든 파일은 같은 범위(모듈 하나)를 나눠 쓴다: import/export 없이 앞 파일의 이름을 그대로 쓰고, 순서가 곧 실행 순서.
#   python tools/build.py            합치기
#   python tools/build.py --watch    src/가 바뀔 때마다 다시 합치기
import os, sys, glob, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'src'), os.path.join(ROOT, 'index.html')
MARK = '<!-- @GAME'
NOTE = '<!-- 자동으로 만든 파일입니다. 직접 고치지 말고 src/를 고친 뒤 python tools/build.py 로 다시 만드세요. -->'

def build():
    tpl = open(os.path.join(SRC, 'template.html'), encoding='utf-8').read().split('\n')
    at = next(i for i, l in enumerate(tpl) if l.startswith(MARK))
    js = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.js'))):
        name = os.path.basename(f)
        js.append(f'// ===== src/{name} =====')
        t = open(f, encoding='utf-8').read()
        js.extend((t[:-1] if t.endswith('\n') else t).split('\n'))   # 마지막 줄바꿈 하나만 뗀다 (빈 줄은 그대로)
    out = tpl[:1] + [NOTE] + tpl[1:at] + js + tpl[at + 1:]
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
    return len(out)

# 데칼 그림: images/decals/*.png → decal_images.js (window.DECAL_IMAGES = { 이름: 'data:image/png;base64,...' }).
# file://로 연 페이지는 PNG 파일을 WebGL 텍스처로 올리지 못해서 그림을 JS 안에 담는다. PNG를 고치거나 더하면 build.py를 다시 돌린다
def build_decals():
    import base64
    d = os.path.join(ROOT, 'images', 'decals')
    files = sorted(glob.glob(os.path.join(d, '*.png')))
    lines = ['// 자동으로 만든 파일입니다. images/decals/*.png를 고친 뒤 python tools/build.py 로 다시 만드세요.', 'window.DECAL_IMAGES = {']
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        lines.append(f"  '{name}': 'data:image/png;base64,{base64.b64encode(open(f, 'rb').read()).decode()}',")
    lines.append('};')
    open(os.path.join(ROOT, 'decal_images.js'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    return len(files)

def stamp():
    return max(os.path.getmtime(f) for f in glob.glob(os.path.join(SRC, '*')))

if __name__ == '__main__':
    print('index.html', build(), '줄 · 데칼 그림', build_decals(), '장')
    if '--watch' in sys.argv:
        last = stamp()
        while True:
            time.sleep(0.5)
            if stamp() != last:
                last = stamp()
                try: print(time.strftime('%H:%M:%S'), 'index.html', build(), '줄'); build_decals()
                except Exception as e: print('실패:', e)
