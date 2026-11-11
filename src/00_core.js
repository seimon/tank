import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
// ---------------------------------------------------------------- 도트 글꼴 · 2D 늘리기 (로딩 화면부터 쓴다)
// 글자: 5x7 고정폭 (한 글자 6칸). 일곱 줄, 줄마다 다섯 칸을 비트로 (16 = 왼쪽 끝 … 1 = 오른쪽 끝)
const FONT = {
  0: [14, 17, 19, 21, 25, 17, 14], 1: [28, 4, 4, 4, 4, 4, 31], 2: [14, 17, 1, 2, 4, 8, 31], 3: [14, 17, 1, 6, 1, 17, 14], 4: [2, 6, 10, 18, 18, 31, 2],
  5: [31, 16, 30, 1, 1, 17, 14], 6: [14, 16, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 1, 14],
  A: [4, 10, 17, 17, 31, 17, 17], B: [28, 18, 18, 28, 18, 18, 28], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [30, 16, 16, 30, 16, 16, 30],
  F: [30, 16, 16, 30, 16, 16, 16], G: [15, 16, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [2, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 30], M: [17, 27, 21, 17, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [28, 18, 18, 28, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [14, 16, 16, 12, 2, 2, 28], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 17, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 10, 4, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31], '/': [0, 1, 2, 4, 8, 16, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8], ':': [0, 8, 0, 0, 0, 8, 0], '.': [0, 0, 0, 0, 0, 0, 8], '-': [0, 0, 0, 14, 0, 0, 0],
  '+': [0, 4, 4, 31, 4, 4, 0], '%': [24, 25, 2, 4, 8, 19, 3], '°': [8, 20, 8, 0, 0, 0, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0], '*': [0, 4, 21, 14, 21, 4, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4], ',': [0, 0, 0, 0, 0, 4, 8],
};
// 글자 간격: 5x7 칸 안에서 실제로 칠해진 폭만큼 + 1칸 (I·L처럼 좁은 글자도 다른 글자와 간격이 같게).
// 문장부호와 빈칸은 일부러 넓게 (5칸 + 1, 빈칸 4)
const _fspan = {};
function fontSpan(ch) {
  let sp = _fspan[ch];
  if (sp) return sp;
  const g = FONT[ch] || FONT[' '];
  let m = 0; for (const r of g) m |= r;
  if (m && /[A-Z0-9]/.test(ch)) {
    let l = 0, r = 4;
    while (!(m & (16 >> l))) l++;
    while (!(m & (16 >> r))) r--;
    sp = { off: -l, adv: r - l + 2 };
  } else sp = { off: 0, adv: ch === ' ' ? 4 : 6 };
  return (_fspan[ch] = sp);
}
const fontWidth = (t) => [...String(t).toUpperCase()].reduce((n, ch) => n + fontSpan(ch).adv, 0) - 1;
// 글자를 칸마다 plot(x, y, k)로 찍는다 (k = 배율). 다음 글자 자리를 돌려준다
function fontDraw(t, x, y, k, plot) {
  for (const ch of String(t).toUpperCase()) {
    const g = FONT[ch] || FONT[' '], sp = fontSpan(ch);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) plot(x + (c + sp.off) * k, y + r * k, k);
    x += sp.adv * k;
  }
  return x;
}
// 2D 캔버스 샤프 바이리니어: 작은 그림(src의 일부)을 정수 배까지는 니어리스트로 키운 뒤, 남는 배율만 부드럽게 늘려 dst 영역에 그린다
const _sbT = document.createElement('canvas'), _sbG = _sbT.getContext('2d');
function sharpDraw(g, src, dx, dy, dw, dh, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  if (!sw || !sh || dw <= 0 || dh <= 0) return;
  const K = Math.max(1, Math.floor(Math.min(dw / sw, dh / sh) + 1e-6)), tw = sw * K, th = sh * K;
  if (_sbT.width < tw + 2) _sbT.width = tw + 2;
  if (_sbT.height < th + 2) _sbT.height = th + 2;
  _sbG.clearRect(0, 0, tw + 2, th + 2); _sbG.imageSmoothingEnabled = false;
  _sbG.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  g.drawImage(_sbT, 0, 0, tw, th, dx, dy, dw, dh);
}
// 치지직 띠 합성 (HUD·UI 공통). 띠마다 sharpDraw를 부르면 작업 캔버스를 지우고·그리고·옮기는 일이 띠 수(100개 넘게) × 그림 수만큼
// 매 프레임 일어나 크게 느려진다. 그래서 그림 전체를 샤프하게 한 번만 키워 두고(sharpScaled), 띠마다는 그대로 오려 붙인다(bandBlit).
// bands = [[시작 줄, 줄 수, 좌우로 민 칸 수], ...] (src 칸 단위), u = 한 칸의 화면 픽셀 수, o = 그림자처럼 오른쪽 아래로 밀 칸 수
function sharpScaled(src, u) {
  const dw = Math.max(1, Math.round(src.width * u)), dh = Math.max(1, Math.round(src.height * u));
  const s = src._gs || (src._gs = document.createElement('canvas'));
  sharpDraw(reuseCanvas(s, dw, dh), src, 0, 0, dw, dh);
  s._cw = src.width; s._ch = src.height;
  return s;
}
function bandBlit(g, sc, bands, u, o = 0) {
  const k = sc.height / sc._ch, oy = Math.round(o * u);
  for (const [sy, sh, dx] of bands) {
    const y0 = Math.round(sy * k), y1 = Math.round((sy + sh) * k);
    if (y1 > y0) g.drawImage(sc, 0, y0, sc.width, y1 - y0, Math.round((dx + o) * u), y0 + oy, sc.width, y1 - y0);
  }
}
// 화면에 보이는 캔버스(dst)를 CSS 크기 × 기기 픽셀로 맞추고 src 전체를 꽉 채워 그린다
// 4x4 디더링으로 지우기: 무늬값(0~15)이 th보다 작은 칸을 비운 사본 (th 16이면 전부 빈다). 그림마다 사본 캔버스 하나를 다시 쓴다.
// 픽셀을 읽지 않고 '지우개 무늬'를 덮어 그려 비운다 (destination-out): 파일로 열어(file://) 그림 픽셀을 읽을 수 없어도 똑같이 된다
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], _ditherPat = [];
function ditherPattern(g, th) {   // th단계 지우개: 4x4 칸 중 무늬값이 th보다 작은 칸만 칠한 반복 무늬
  if (!_ditherPat[th]) {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const cg = c.getContext('2d'); cg.fillStyle = '#000';
    for (let i = 0; i < 16; i++) if (BAYER4[i] < th) cg.fillRect(i & 3, i >> 2, 1, 1);
    _ditherPat[th] = c;
  }
  return g.createPattern(_ditherPat[th], 'repeat');
}
// 사본 캔버스는 크기가 같으면 width를 다시 대입하지 않고 지우기만 한다 (width 대입은 GPU 버퍼를 새로 잡아 프레임마다 하면 크게 느려진다)
function reuseCanvas(t, w, h) {
  const g = t.getContext('2d');
  if (t.width !== w || t.height !== h) { t.width = w; t.height = h; } else g.clearRect(0, 0, w, h);
  return g;
}
function ditherMask(src, th) {
  const t = src._dm || (src._dm = document.createElement('canvas'));
  const g = reuseCanvas(t, src.width, src.height);
  if (th >= 16) return t;
  g.drawImage(src, 0, 0);
  if (th > 0) { g.globalCompositeOperation = 'destination-out'; g.fillStyle = ditherPattern(g, th); g.fillRect(0, 0, t.width, t.height); g.globalCompositeOperation = 'source-over'; }
  return t;
}
// 아래에서 위로 쓸어 올리며 사라지는 4x4 디더링 (로딩·타이틀 공통): f = 0 그대로 ~ 1 다 지움.
// 화면 아래쪽 줄부터 지워지기 시작하고, 맨 위는 WIPE_SPAN만큼 늦게 시작한다. vOf(y) = 원본 y줄의 화면 높이 (0 맨 아래 ~ 1 맨 위. 없으면 원본 안에서)
const WIPE_SPAN = 0.55;
function ditherWipe(src, f, vOf) {
  const t = src._dw || (src._dw = document.createElement('canvas'));
  const g = reuseCanvas(t, src.width, src.height);
  if (f >= 1) return t;
  g.drawImage(src, 0, 0);
  if (f <= 0) return t;
  g.globalCompositeOperation = 'destination-out';
  const H = src.height, pats = [];
  for (let y = 0; y < H; y += 2) {
    const v = vOf ? vOf(y + 1) : 1 - (y + 1) / H;
    const th = Math.floor(Math.max(0, Math.min(1, (f - v * WIPE_SPAN) / (1 - WIPE_SPAN))) * 16);
    if (th <= 0) continue;
    g.fillStyle = th >= 16 ? '#000' : (pats[th] || (pats[th] = ditherPattern(g, th)));
    g.fillRect(0, y, t.width, 2);
  }
  g.globalCompositeOperation = 'source-over';
  return t;
}
// CRT 표현(41_crt.js)이 켜져 있으면 HUD·UI·타이틀 캔버스를 기기 픽셀이 아니라 게임 픽셀 크기로 그리고(layerScale = 게임 픽셀 ÷ CSS 픽셀),
// 화면에는 숨긴 채 41_crt.js가 한 장으로 합쳐 3D 화면과 함께 CRT 셰이더를 거친다. crtDirty = 레이어가 바뀌었다 (다시 합친다)
const CRT_LAYER = new Set();   // sharpBlit으로 그리는 레이어 캔버스 (타이틀 그림)
let crtOn = false, layerScale = 0, crtDirty = true, crtDirtyLo = true, crtDirtyHi = true, crtLoadHook = null;   // crtDirty = 두 묶음 모두, Lo = 아래 묶음(HUD·대미지 숫자·타이틀), Hi = 위 묶음(UI·로딩·나가기 덮개)
// HUD·UI·CRT 레이어 캔버스의 2D 그리기 판. (CPU 쪽에 두는 willReadFrequently를 아이패드에서 시험했으나 오히려 느려져 기본으로 되돌림. 한곳에서 바꿀 수 있게 남겨 둔다)
const cv2d = (c) => c.getContext('2d');
//   // crtLoadHook: 로딩 그림을 CRT로 (10a_crt.js)
function sharpBlit(dst, src, cssW, cssH) {
  const lay = CRT_LAYER.has(dst); if (lay) { if (dst._crtHi) crtDirtyHi = true; else crtDirtyLo = true; }
  const dpr = (lay && layerScale) || devicePixelRatio || 1, dw = Math.max(1, Math.round(cssW * dpr)), dh = Math.max(1, Math.round(cssH * dpr));
  if (dst.width !== dw || dst.height !== dh) { dst.width = dw; dst.height = dh; }
  Object.assign(dst.style, { width: `${cssW}px`, height: `${cssH}px` });
  const g = lay ? cv2d(dst) : dst.getContext('2d');
  g.clearRect(0, 0, dw, dh);
  sharpDraw(g, src, 0, 0, dw, dh);
}

// 로딩 표시: 무거운 준비 작업(지형·마을·AO 굽기) 사이사이에 잠깐 쉬어 진행 막대를 그린다.
// 게임 화면처럼 300줄 해상도 캔버스에 HUD 글꼴·게이지로 그리고 샤프 바이리니어로 창에 늘린다 (영어만)
let loadLabel = 'LOADING...', loadK = 0;
const loadImg0 = new Image();   // 로딩 그림 (그림이 없거나 못 읽어도 로딩은 그대로)
loadImg0.onload = () => { if (document.getElementById('loading')) drawLoading(); };
// images/*.png는 build.py가 title_images.js에 data URL로도 담는다: file://로 열면 PNG 파일을 그린 캔버스가 '오염'돼 WebGL(CRT 표현)로 못 올리기 때문
const imgSrc = (p) => (window.TITLE_IMAGES || {})[p.replace(/^images\//, '').replace(/\.png$/, '')] || p;
loadImg0.src = imgSrc('images/loading_tank.png');
function drawLoading() {
  const cv = document.getElementById('loadCv');
  if (!cv || !innerWidth || !innerHeight) return;
  let cr = crtOn ? document.getElementById('c').getBoundingClientRect() : null;   // CRT면 게임 화면 자리에 맞춰
  if (!cr || cr.width < 2 || cr.height < 2) cr = { width: innerWidth, height: innerHeight };
  let H = 300, W = Math.round(H * cr.width / cr.height);   // 세로 300줄. 창이 아주 좁으면 가로 200칸에 맞춰 세로를 늘린다 (픽셀은 늘 정사각형)
  if (W < 200) { W = 200; H = Math.round(W * cr.height / cr.width); }
  const src = cv._src || (cv._src = document.createElement('canvas'));
  src.width = W; src.height = H;
  const g = src.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // 검은 바탕에 모두 흰색. 게이지(7칸)는 화면 정가운데, 위로 8칸 띄워 탱크 그림(images/loading_tank.png), 아래로 8칸 띄워 글자 (HUD 글꼴 기본 크기)
  const put = (t, y) => fontDraw(t, Math.round((W - fontWidth(t)) / 2), y, 1, (a, b) => g.fillRect(a, b, 1, 1));
  const bw = Math.min(240, W - 20), bx = Math.round((W - bw) / 2), by = Math.round(H / 2) - 3, GAP = 8;
  g.fillStyle = '#fff';
  if (loadImg0.complete && loadImg0.naturalWidth) g.drawImage(loadImg0, Math.round((W - loadImg0.naturalWidth) / 2), by - GAP - loadImg0.naturalHeight);
  g.fillRect(bx, by, bw, 1); g.fillRect(bx, by + 6, bw, 1); g.fillRect(bx, by, 1, 7); g.fillRect(bx + bw - 1, by, 1, 7);   // HUD 게이지처럼
  g.fillRect(bx, by, Math.round(bw * loadK), 7);
  put(loadLabel, by + 7 + GAP);
  put(`VERSION ${VERSION}`, H - 18);
  sharpBlit(cv, src, innerWidth, innerHeight);
  if (crtLoadHook) crtLoadHook(src);
}
addEventListener('resize', drawLoading);
function loadStep(k, label) {
  loadK = k; if (label) loadLabel = label;
  drawLoading();
  return new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 0); } }; requestAnimationFrame(go); setTimeout(go, 40); });
}

// ---------------------------------------------------------------- 기본 설정
// 세부 설정은 config.js (window.CONFIG). 숫자를 바꿔 가며 테스트하는 값은 모두 그쪽에
const CFG = window.CONFIG;
// 저장 키 이름이 바뀌었다 (littleIron. → MightyMolly.): 예전 값을 한 번 옮긴다 (새 키가 비어 있을 때만)
try {
  for (const k of Object.keys(localStorage)) if (k.startsWith('littleIron.')) {
    const n = 'MightyMolly.' + k.slice(11);
    if (localStorage.getItem(n) === null) localStorage.setItem(n, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
} catch (_) {}
// 설정 탭 켜기/끄기 값 읽기: 설정에서 바꾸면 기억하지만, config의 처음 값이 바뀌었으면 config를 따른다 (기억해 둔 값을 버린다)
function loadOpt(k, d) {
  try {
    const K = 'MightyMolly.' + k, D = d ? '1' : '0';
    if (localStorage.getItem(K + '.cfg') !== D) { localStorage.setItem(K + '.cfg', D); localStorage.removeItem(K); return d; }
    const v = localStorage.getItem(K);
    return v === null ? d : v === '1';
  } catch (_) { return d; }
}
crtOn = loadOpt('crt', !!(CFG && CFG.crt && CFG.crt.enabled));   // CRT 표현
document.body.classList.toggle('crt', crtOn);
// 맵 셋팅: config map.presets 중 하나 (빠진 값은 첫 번째 셋팅 값). 설정 메뉴 '맵 셋팅' 버튼으로 돌아가며 바꾼다
const MAP_PRESETS = (CFG.map.presets?.length ? CFG.map.presets : [CFG.map]).map((p, i, all) => ({
  wind: 1, windDir: 215, debris: 0.3, fog: 0.0105, fogColor: '#414a5e', moon: 1.5, moonColor: '#9aaad0', sky: 1.5, skyColor: '#7d8aac', groundColor: '#4a3a2a',
  ...all[0], rain: 0, sand: 0, lightning: 0, ...p, name: p.name ?? `셋팅 ${i + 1}` }));
let mapIdx = Math.min(MAP_PRESETS.length - 1, Math.max(0, CFG.map.preset ?? 0));
const MAP0 = MAP_PRESETS[mapIdx];
if (!CFG) { loadLabel = 'CONFIG.JS NOT FOUND - PUT IT NEXT TO INDEX.HTML'; drawLoading(); throw new Error('config.js 없음'); }
const DEG = Math.PI / 180;
const HALF = 75;              // 보드 반경 (150m x 150m)
const N = 301, STEP = 0.5;    // 지형 격자 (0.5m 간격)
const ROAD_HW = 2.2;          // 도로 반폭
const CREEK_HW = 2.4;         // 시냇물 기준 반폭 (다리 자리, 탱크 길이의 1.5배 정도). 상류로 갈수록 넓어진다
let CREEK_UP = 1;             // 상류 쪽 x 방향
const BOTTOM = -6;            // 보드 바닥 높이
const SPAWN = CFG.player.start || { x: -22, z: -41.1, yaw: 55 }, SPAWN_X = SPAWN.x, SPAWN_Z = SPAWN.z;   // 탱크 출발 지점·방향 (본도로 남쪽. 설정)
const WALL = HALF - 0.05;     // 보드 경계의 투명한 벽
const params = new URLSearchParams(location.search);
const GRASS_TARGET = Math.round((+params.get('grass') || 1) * 165000);
const UVW = (v) => `((${v} + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)})`;   // 월드 xz → 필드 텍스처 uv (GLSL)
let lowH = 300;

let seed = 20261027;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + (b - a) * rand();
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 모든 머티리얼이 공유하는 유니폼
const RING_N = 5;   // 원형 빛 슬롯: 0 = 내 조준, 1~4 = 자주포 포격 예고
const U = {
  uTime: { value: 0 },
  uSnap: { value: new THREE.Vector2(160, 120) },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uOccP: { value: new THREE.Vector3() }, uOccR: { value: 0 },   // 내 탱크를 가리는 물체 비춰 보기: 탱크 가운데, 반지름 (0 = 끔)
  uWind: { value: MAP0.wind },
  uField: { value: null },
  uTrack: { value: null },
  uPointScale: { value: 300 },
  uAO: { value: CFG.map.ao },   // 구운 그늘(버텍스 컬러 AO) 세기: 0 = 없음, 1 = 구운 그대로, 그 이상은 더 진하게
  uWhite: { value: 0 },  // 1이면 연기·불꽃 말고 모든 물체의 색·텍스처를 흰색으로 (그늘만 보기)
  uGap: { value: null }, // 건물 사이 틈·벽 밑동의 바닥 그늘 텍스처
  uBlast: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -100, 1)) },   // 풀을 눕히는 폭풍: x, z, 시각, 반경
  // 바닥 그림자(컨택트 쉐도우): 0 = x, z, cos, sin(방향) / 1 = 반폭, 반길이, 진하기
  uSh0: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
  uSh1: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
  uLamp0: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },   // 탱크 뒷등·지프 전조등 빛 (LAMP_N개)
  uLamp1: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
  // 하늘에서 비추는 원형 빛 (조준 폭발 범위, 자주포 포격 예고): 0 = x, z, 반경, 세기(0이면 꺼짐) / 1 = 색 rgb
  uRing0: { value: Array.from({ length: RING_N }, () => new THREE.Vector4()) },
  uRing1: { value: Array.from({ length: RING_N }, () => new THREE.Vector4()) },
};
// 탱크·보급품 밑의 부드러운 둥근 사각형 그림자. 지면과 풀 셰이더가 같은 식으로 어둡게 한다 (겹친 면이 없어 z-fighting 없음)
const SHADOW_GLSL = `
  uniform vec4 uSh0[12], uSh1[12];
  float contactShadow(vec2 p) {
    float s = 0.0;
    for (int i = 0; i < 12; i++) {
      vec4 a = uSh0[i], b = uSh1[i];
      if (b.z <= 0.0) continue;
      vec2 d = p - a.xy, l = vec2(d.x * a.z - d.y * a.w, d.x * a.w + d.y * a.z);
      float r = min(b.x, b.y) * 0.6;
      vec2 q = abs(l) - b.xy + r;
      float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      s = max(s, (1.0 - smoothstep(-0.4, 1.5, dist)) * b.z);
    }
    return s;
  }
  // 브레이크등·후진등이 탱크 뒤 바닥에 드리우는 빛: 탱크 방향을 따라 뒤로 길쭉하게, 뒷면에 가까울수록 밝게
  // uLamp0 = (x, z, cos yaw, sin yaw), uLamp1 = (빛 색 rgb, 뻗는 길이. 0이면 꺼짐)
  uniform vec4 uLamp0[12], uLamp1[12];
  vec3 lampGlow(vec2 p) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      vec4 a = uLamp0[i], b = uLamp1[i];
      if (b.w <= 0.0) continue;
      vec2 d = p - a.xy;
      float lx = d.x * a.z - d.y * a.w, back = -(d.x * a.w + d.y * a.z) - 2.0;   // back: 차체 뒷면에서 뒤로 잰 거리
      float k = smoothstep(-0.4, 0.3, back) * (1.0 - smoothstep(0.0, b.w, back)) * (1.0 - smoothstep(1.2 + back * 0.25, 2.6 + back * 0.4, abs(lx)));
      s += b.rgb * k * k;
    }
    return s;
  }
`;

// 하늘에서 내리쬐는 원형 빛. 위에서 아래로 비추는 빛이라 땅·건물·탱크 등 무엇에 닿든 같은 원으로 보인다.
// 원 안은 은은하게, 테두리는 밝은 띠. 같은 셰이더에 두 번 들어가지 않게 막아 둔다
const RING_GLSL = `
#ifndef RING_GLSL
#define RING_GLSL
  uniform vec4 uRing0[${RING_N}], uRing1[${RING_N}];
  vec3 ringGlow(vec2 p) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < ${RING_N}; i++) {
      vec4 a = uRing0[i];
      if (a.w <= 0.0) continue;
      float d = length(p - a.xy), r = a.z, w = 0.16 + r * 0.025;
      float fill = (1.0 - smoothstep(r - w, r, d)) * (0.26 + 0.12 * d / max(r, 0.01));   // 테두리 없이 원 안만 고르게
      s += uRing1[i].rgb * fill * a.w;
    }
    return s;
  }
#endif
`;
// 내 탱크를 가리는 물체: 카메라와 탱크 사이(탱크보다 4m 넘게 앞)에 있고, 화면에서 탱크 둘레 원 안이면 4x4 디더링으로 절반쯤 비운다
// (원 가장자리로 갈수록 덜 비운다). 계산은 셰이더에서만: 광선 검사 없음
const OCC_GLSL = `uniform vec3 uOccP; uniform float uOccR;
float occBayer(vec2 a) { a = floor(mod(a, 4.0)); vec2 b = floor(a * 0.5); vec2 c = a - b * 2.0;
  return (4.0 * (2.0 * c.y + mod(c.x + c.y, 2.0)) + (2.0 * b.y + mod(b.x + b.y, 2.0))) / 16.0; }
`;
const OCC_MAIN = `if (uOccR > 0.0) {
    vec4 ovp = viewMatrix * vec4(vRingW, 1.0), ocp = viewMatrix * vec4(uOccP, 1.0);
    if (-ovp.z < -ocp.z - 4.0) {
      float orr = length(ovp.xy / -ovp.z - ocp.xy / -ocp.z) * -ocp.z / uOccR;
      if (occBayer(gl_FragCoord.xy) < 0.6 * (1.0 - smoothstep(0.65, 1.0, orr))) discard;
    }
  }
`;
// PS1식 정점 스내핑: 클립 좌표를 저해상도 격자에 맞춰 떨림을 만든다
const SNAP = 'gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;';
// PS1_NOSNAP이 켜진 동안 만든 재질은 스내핑하지 않는다 (탱크: AO를 굽느라 잘게 나눈 삼각형이 제각각 끌려가
// 리벳·얼룩이 일그러져 떨리고 가는 삼각형이 뒤집혀 겹쳐 보였다)
let PS1_NOSNAP = false;
function ps1(mat, extra, key) {
  const snap = !PS1_NOSNAP;
  mat.onBeforeCompile = function (sh) {   // this = 컴파일되는 재질 (복제본도 같은 함수를 쓴다)
    sh.uniforms.uSnap = U.uSnap;
    const lit = sh.fragmentShader.includes('totalEmissiveRadiance');   // 빛을 받는 재질만 원형 빛도 받는다
    sh.vertexShader = 'uniform vec2 uSnap;\n' + (lit ? 'varying vec3 vRingW;\n' : '') +
      sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + (snap ? SNAP : '') +
        (lit ? '\n{ vec4 rw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrw = instanceMatrix * rw;\n#endif\nvRingW = (modelMatrix * rw).xyz; }' : ''));
    if (extra) extra(sh);
    if (lit) {
      sh.uniforms.uRing0 = U.uRing0; sh.uniforms.uRing1 = U.uRing1;
      sh.fragmentShader = RING_GLSL + 'varying vec3 vRingW;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += ringGlow(vRingW.xz) * (diffuseColor.rgb * 1.6 + 0.12);');
      if (!(this && this.userData.noOcc)) {   // 땅은 빼고
        sh.uniforms.uOccP = U.uOccP; sh.uniforms.uOccR = U.uOccR;
        sh.fragmentShader = OCC_GLSL + sh.fragmentShader.replace('void main() {', 'void main() {\n' + OCC_MAIN);
      }
    }
    sh.uniforms.uAO = U.uAO; sh.uniforms.uWhite = U.uWhite;
    sh.fragmentShader = 'uniform float uAO, uWhite;\n' + sh.fragmentShader;
    if (this && this.defines && 'AO_BAKED' in this.defines) {
      // AO를 구운 재질: 정점 색을 uAO 거듭제곱으로 곱한다. 세기를 1보다 올려도 음수가 되지 않고 어두운 곳일수록 더 진해진다.
      // 값만 바뀌니 토글·슬라이더로 셰이더를 다시 만들지 않는다
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), uWhite);\ndiffuseColor.rgb *= pow(vColor, vec3(uAO));');
    } else if (!(this && this.userData.ownWhite)) {
      // 나머지 재질은 모든 색 처리가 끝난 뒤 흰색으로 (발광은 그대로)
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), uWhite);\n#include <emissivemap_fragment>');
    }
  };
  if (key || !snap) mat.customProgramCacheKey = () => (key || '') + (snap ? '' : '|nosnap');
  return mat;
}
const lambert = (o) => ps1(new THREE.MeshLambertMaterial(o));
// 떨어지며 나타나기: 물체가 4x4 디더링 무늬로 점점 채워진다 (게임 해상도 픽셀 단위).
// 그동안만 그 물체의 재질을 '디더 복제본'으로 바꿔 끼우고(물체마다 자기 값), 다 나타나면 원래 재질로 되돌린다. 외곽선도 그동안은 뺀다
const BAYER4_GLSL = `float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;
function fadeMat(src, u) {
  const m = src.clone();
  if (src.defines) m.defines = { ...src.defines };
  const base = src.onBeforeCompile, key = src.customProgramCacheKey.call(src);
  m.onBeforeCompile = function (sh, r) {
    base.call(this, sh, r);
    sh.uniforms.uFadeIn = u;
    sh.fragmentShader = `uniform float uFadeIn;\n${BAYER4_GLSL}` + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (bayer4(gl_FragCoord.xy) + 0.03 > uFadeIn) discard;');
  };
  m.customProgramCacheKey = () => key + '|fadein';
  return m;
}
const fadeIns = [];   // { root, u, t, swaps: [[mesh, 원래 재질, 복제본, 외곽선이었나]] }
const fadeKeep = [];   // 로딩 때 미리 컴파일하려고 만든 디더 복제본: 셰이더 프로그램이 지워지지 않게 계속 쥐어 둔다 (90_loop.js)
// 하늘에 나타나자마자 dropFadeIn초 동안 디더링으로 나타난다
// 떨어질 높이: dropFade초 만에 땅에 닿도록 (떨어지는 가속도 22m/s²)
const DROP_H = 0.5 * 22 * (CFG.screen?.dropFade ?? 2) ** 2;
function fadeIn(root) {
  const dur = CFG.screen?.dropFadeIn ?? 0.3, t0 = 0;
  let f = fadeIns.find((e) => e.root === root);
  if (f) { f.t = t0; f.u.value = 0; return; }
  if (dur <= 0) return;
  f = { root, u: { value: 0 }, t: t0, dur, swaps: [] };
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || o.material.isShaderMaterial) return;
    const ol = o.layers.isEnabled(OUTLINE_LAYER), m = fadeMat(o.material, f.u);
    f.swaps.push([o, o.material, m, ol]);
    o.material = m; if (ol) o.layers.disable(OUTLINE_LAYER);
  });
  fadeIns.push(f);
}
function endFadeIn(f) {
  for (const [o, src, m, ol] of f.swaps) {
    if (o.material === m) { o.material = src; if (ol) o.layers.enable(OUTLINE_LAYER); }   // 그새 다른 재질(잔해 등)로 바뀌었으면 그대로 둔다
    m.dispose();
  }
  fadeIns.splice(fadeIns.indexOf(f), 1);
}
function updateFadeIns(dt) {
  for (let i = fadeIns.length - 1; i >= 0; i--) {
    const f = fadeIns[i];
    f.t += dt; f.u.value = Math.max(0, Math.min(1, f.t / f.dur));
    if (f.t >= f.dur || !f.root.parent) endFadeIn(f);
  }
}
// 외곽선 대상: 레이어 1에 올린 불투명 물체 (땅·풀·물·돌·파티클·데칼·조준 표시는 userData.noOutline이나 투명이라 빠짐).
// 외곽선을 켜면 이 레이어만 깊이로 한 번 더 그려서, 깊이가 크게 끊기는 가장자리에 1픽셀 선을 긋는다
const OUTLINE_LAYER = 1;
function markOutline(root) {
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && o.material && !o.material.transparent && !o.material.isShaderMaterial) o.layers.enable(OUTLINE_LAYER); });
  return root;
}

await loadStep(0.04, 'SHAPING TERRAIN...');
