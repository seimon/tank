// ---------------------------------------------------------------- 픽셀 HUD
// 게임 화면과 같은 저해상도에, 노란주황색 한 가지와 5x7 고정폭 글자로. 줄 높이 7칸, 줄 간격 4칸.
// HUD 칸 = 1픽셀인 작은 캔버스 두 장(색, 검은 그림자)에 값이 바뀔 때만 다시 그려 두고, 화면 캔버스로 늘려 옮긴다.
// 색은 스크린(또는 더하기) 블렌딩, 그 밑에 그림자를 살짝 깐다. 피해를 입으면 몇 칸 높이 띠마다 좌우로 치지직 어긋난다
const phud = document.getElementById('phud'), pg = cv2d(phud);
const phudS = document.getElementById('phudS'), sg = cv2d(phudS);
const HC = Object.assign({ color: '#ffb43a', blend: 'screen', shadow: 0.55, glitchTime: 0.45, glitchPx: 6 }, CFG.hud);
phud.style.mixBlendMode = HC.blend;
const hudC = document.createElement('canvas'), hc = cv2d(hudC);   // 색
const hudK = document.createElement('canvas'), kc = cv2d(hudK);   // 그림자
const HUD_H = 140;   // 평소 HUD 캔버스 높이 (칸). 카메라 모드 알림이 떠 있는 동안만 화면 높이만큼
hudC.width = hudK.width = 240; hudC.height = hudK.height = HUD_H;
// 카메라 모드 알림 (C키, 40_input_post.js nextCamPreset): HUD의 일부라 색·블렌딩·그림자·피격 치지직·꺼질 때 디더링 모두 HUD 설정(config hud)대로.
// 좌하단(가장자리에서 TOAST_M칸)에 한글 한 줄. 화면 왼쪽 밖에서 TOAST_IN초 만에 날아 들어오고(EaseOutExpo, 성장 선택지처럼), TOAST_HOLD초 뒤 TOAST_FADE초 동안 4x4 디더링으로 사라진다
const TOAST_IN = 0.3, TOAST_HOLD = 2, TOAST_FADE = 0.4, TOAST_M = 8;
let hudToast = null;
function showCamToast(text) { hudToast = { text, t0: performance.now(), x: 0, th: 0 }; }
let hudKey = '', hk = 1, glitchUntil = 0, glitchPow = 0, hudGlitched = false, hudRight = 0;   // hudRight: HUD가 그린 가장 오른쪽 칸 (성장 선택지가 닿지 않게)
const px = (x, y, w = 1, h = 1) => { hc.fillRect(x, y, w, h); kc.fillRect(x, y, w, h); if (x + w > hudRight) hudRight = x + w; };
function htext(s, x, y) { return fontDraw(s, x, y, 1, (a, b) => px(a, b)); }
// 게이지: 1칸 테두리 + 채운 만큼 꽉 칠한 막대 (높이 7칸). dots면 채운 부분을 격자 도트로
function hbar(x, y, w, f, dots) {
  const fw = Math.round(w * Math.max(0, Math.min(1, f)));
  px(x, y, w, 1); px(x, y + 6, w, 1); px(x, y, 1, 7); px(x + w - 1, y, 1, 7);
  if (!dots) { if (fw > 0) px(x, y, fw, 7); }
  else for (let yy = y + 1; yy < y + 6; yy++) for (let xx = x + 1; xx < x + fw; xx++) if ((xx + yy) % 2 === 0) px(xx, yy);
}
// 타이틀 우하단 키 안내 (한글, 갈무리11 장체: gfDraw·gfWidth는 81_ui.js): 줄마다 [키 칸]들 + 설명. 오른쪽 끝을 맞춘다.
// 키 칸은 흰 칸에 검은 글자 (일시정지 창의 키 칸과 같은 모양: 글자 줄 위아래 1칸·좌우 2칸 여유, 칸 사이 2칸), 줄 높이는 한글 줄 높이(15칸), 오른쪽 아래 1칸 검은 그림자
// rows = [[[키, ...], '설명'], ...]
function titleKeyRows(cv, rows) {
  const src = cv._src || (cv._src = document.createElement('canvas'));   // 1칸 = 1픽셀. 화면에는 layoutTitle이 늘려 그린다
  const kw = (k) => gfWidth(k) + 4, rowW = (r) => r[0].reduce((n, k) => n + kw(k) + 2, 0) - 2 + 6 + gfWidth(r[1]);
  const W = Math.max(...rows.map(rowW));
  src.width = W + 1; src.height = rows.length * GF_LINE - 2;   // (width를 다시 대입하면 비워진다)
  const g = src.getContext('2d');
  for (const [col, d] of [['rgba(0,0,0,.75)', 1], ['#ffffff', 0]]) {   // 검은 그림자 → 흰색
    g.fillStyle = col;
    rows.forEach((r, li) => {
      const y = li * GF_LINE + 1;
      let x = W - rowW(r) + d;
      for (const k of r[0]) { g.fillRect(x, y - 1 + d, kw(k), 12); x += kw(k) + 2; }
      gfDraw(r[1], x + 4, y + d, (a, b) => g.fillRect(a, b, 1, 1));
    });
  }
  g.fillStyle = '#000000';   // 키 칸 안의 글자는 검게
  rows.forEach((r, li) => {
    let x = W - rowW(r);
    for (const k of r[0]) { gfDraw(k, x + 2, li * GF_LINE + 1, (a, b) => g.fillRect(a, b, 1, 1)); x += kw(k) + 2; }
  });
}
// 타이틀 화면 글자: HUD와 같은 5x7 글꼴 (흰색)에 검은 그림자, 1칸 = 1픽셀 캔버스 (줄 높이 7, 줄 간격 4)
function pixelText(cv, lines, col = '#ffffff', align = 'left') {   // align 'right': 줄마다 오른쪽 끝을 맞춘다
  const src = cv._src || (cv._src = document.createElement('canvas'));   // 1칸 = 1픽셀. 화면에는 layoutTitle이 늘려 그린다
  const W = Math.max(...lines.map(fontWidth));
  src.width = W + 1; src.height = lines.length * 11 - 3;
  const g = src.getContext('2d');
  for (const [c, d] of [['rgba(0,0,0,.75)', 1], [col, 0]]) {   // 검은 그림자(오른쪽 아래 1칸) → 글자
    g.fillStyle = c;
    lines.forEach((t, li) => fontDraw(t, d + (align === 'right' ? W - fontWidth(t) : 0), d + li * 11, 1, (a, b) => g.fillRect(a, b, 1, 1)));
  }
}
// ---- 타이틀 그림: 제목·MIYACAT 로고는 images/의 도트 PNG (직접 고쳐 쓸 수 있게 따로 둔다), 제목 아래 설명 한 줄은 HUD 글꼴,
// 좌하단 배지는 사각형 + HUD 글꼴. 모두 게임 픽셀 단위 캔버스(_src)에 한 번 그리고 layoutTitle이 늘려 보인다
const titleSrc = (id, w, h) => { const c = document.getElementById(id), s = c._src || (c._src = document.createElement('canvas')); s.width = w; s.height = h; return s.getContext('2d'); };
const fontText = (g, t, x, y, k = 1) => fontDraw(t, x, y, k, (a, b, kk) => g.fillRect(a, b, kk, kk));
const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = imgSrc(src); });
const TGREEN = '#2e6a40', TINK = '#1b1b19', TCREAM = '#f6f1e3';
async function drawTitleArt() {
  const [logo, brand, deco] = await Promise.all(['title_logo', 'title_brand', 'title_deco'].map((n) => loadImg(`images/${n}.png`)));
  // 로고 + 6칸 아래 설명 (먹색 HUD 글꼴)
  // 설명 줄은 HUD 글꼴을 세로로 2배 늘리고 글자 간격을 1칸 더 벌린다 (세로로 길쭉한 도트 글씨)
  const sub = 'MINI TANK IN DIORAMA: BATTLE, UPGRADE, CONQUER', lw = logo ? logo.width : 0, lh = logo ? logo.height : 0;
  const subW = fontWidth(sub) + sub.length - 1;
  const dy = lh + 6 + 14 + 6;   // title_deco.png: 설명 줄 6칸 아래 (왼쪽 위 기준이라 그림 크기가 바뀌어도 그대로)
  let g = titleSrc('tLogo', Math.max(lw, subW, deco ? deco.width : 0), deco ? dy + deco.height : lh + 6 + 14);
  if (logo) g.drawImage(logo, 0, 0);
  if (deco) g.drawImage(deco, 0, dy);
  g.fillStyle = TINK;
  let sx = 0;
  for (const ch of sub) { fontDraw(ch, sx, lh + 6, 1, (a, b) => g.fillRect(a, b * 2 - (lh + 6), 1, 2)); sx += fontSpan(ch).adv + 1; }
  // MIYACAT 로고 (아래 작은 글자까지 한 장)
  g = titleSrc('tBrand', brand ? brand.width : 1, brand ? brand.height : 1);
  if (brand) g.drawImage(brand, 0, 0);
  // 배지: 초록 테두리(2칸)의 크림색 칸에 초록 글씨, 아래 초록 칸에 흰 글씨 (모서리는 모두 각지게).
  // 아래쪽 다른 글자들처럼 오른쪽 아래 1칸 검은 그림자
  const b1 = 'FULL-OPTION KIT', b2 = 'PLAY-READY UNIT', W = Math.max(fontWidth(b1), fontWidth(b2)) + 10, H = 28;
  g = titleSrc('tBadge', W + 1, H + 1);
  g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(1, 1, W, H);
  g.fillStyle = TGREEN; g.fillRect(0, 0, W, H);
  g.fillStyle = TCREAM; g.fillRect(2, 2, W - 4, 13);
  g.fillStyle = TGREEN; fontText(g, b1, Math.round((W - fontWidth(b1)) / 2), 5);
  g.fillStyle = '#ffffff'; fontText(g, b2, Math.round((W - fontWidth(b2)) / 2), 18);
  layoutTitle();
}
let titlePad = false;   // 타이틀 키 안내가 게임패드 글자인가
if (document.getElementById('tPress')) {
  // (타이틀 우하단 키 안내는 한글 글꼴이 있는 81_ui.js 맨 끝에서 처음 그린다)
  pixelText(document.getElementById('tVer'), [`VERSION ${VERSION}`, `BUILD ${BUILD}`]);
  drawTitleArt();
  layoutTitle();
}
// 타이틀 키 안내: 마지막에 쓴 입력(키보드 / 게임패드)에 맞춰 SPACE·Q·E ↔ A·LB·RB
function drawTitleKeys(pad) {
  titlePad = pad;
  const c = document.getElementById('tPress');
  if (!c) return;
  titleStartButton(c, pad ? 'A' : 'SPACE');
  drawCamoText();
  if (c._css) layoutTitle();
}
// 타이틀 '게임 시작' 버튼: 메뉴 창 아래 버튼과 같은 모양 (테두리 + 키 칸 + 이름, 흰색). 클릭·터치로도 시작한다 (50_title.js)
// hot = 마우스를 올림: 창 버튼처럼 통째로 칠하고 키 칸은 검게, 이름은 뒤집어 (이때는 깜빡이지 않는다)
let titleBtnHot = false;
function titleStartButton(cv, key) {
  const src = cv._src || (cv._src = document.createElement('canvas'));
  const label = '게임 시작', kw = gfWidth(key), w = keyButtonW(key, label), h = 21, col = '#ffffff', lx = 5 + kw + 4 + 4, px = (a, b) => g.fillRect(a, b, 1, 1);
  src.width = w; src.height = h;
  const g = src.getContext('2d');
  if (titleBtnHot) {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000000'; g.fillRect(5, 4, kw + 4, 12); gfDraw(label, lx, 5, px);
    g.fillStyle = col; gfDraw(key, 7, 5, px);
  } else {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, w, h);
    g.fillStyle = col; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    g.fillRect(5, 4, kw + 4, 12);
    g.fillStyle = '#000000'; gfDraw(key, 7, 5, px);
    g.fillStyle = col; gfDraw(label, lx, 5, px);
  }
}
// 타이틀 위장색 안내 (PRESS SPACE 아래, 깜빡이지 않음): 지금 고른 위장색 이름
function drawCamoText() {
  const c = document.getElementById('tCamo');
  if (!c) return;
  titleKeyRows(c, [   // 우하단 키 안내: 오른쪽 정렬
    [titlePad ? ['LB', 'RB'] : ['Q', 'E'], `위장색 변경: ${CAMO_LIST[camoIdx].name}`],
    [titlePad ? ['←', '→'] : ['A', 'D'], `데칼 변경: ${DECAL_SETS[decalIdx].name}`],
    [[titlePad ? 'START' : 'ESC'], '설정'],
  ]);
  if (c._css) layoutTitle();
}
// 타이틀 부품 설명: 부품 한 점에서 비스듬한 지시선 → 글자 밑줄. 글자는 짙은 먹색에 흰 테두리 (게임 해상도 그대로 그려 늘린다)
const CALLOUTS = [
  { at: () => tank.P.stack.getWorldPosition(_cw), dx: -50, dy: 40, lines: ['EXHAUST STACK', 'PUFFS ENGINE SMOKE'] },
  { at: () => tank.P.barrel.localToWorld(_cw.set(0, 0.5, 1.1)), dx: 50, dy: -14, lines: ['108MM SHORT CANNON', 'AT 1/35 SCALE, TRUST US'] },
  { at: () => tank.P.shovel.getWorldPosition(_cw), dx: -90, dy: -8, lines: ['SHOVEL BOLTED ON', 'JUST IN CASE'] },
];
const _cw = new THREE.Vector3(), INK = '#1b1b19';
function drawCallouts() {
  const out = document.getElementById('tCall');
  if (!out || titleState === 'play') return;
  const cv = out._src || (out._src = document.createElement('canvas'));   // 게임 해상도. 화면에는 샤프 바이리니어로
  if (cv.width !== rt.width || cv.height !== rt.height) { cv.width = rt.width; cv.height = rt.height; }
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, s = Math.max(1, Math.floor(H / 360));
  g.clearRect(0, 0, W, H);
  const inTh = entr ? (entr.phase === 'arrived' ? Math.max(0, 16 - Math.floor(entr.arrT / 0.4 * 16)) : 16) : 0;   // 등장 연출: 선 뒤 0.4초에 걸쳐 나타난다
  const th = Math.max(titleFadeTh, inTh);
  if (th >= 16) { if (out._shown) { sharpBlit(out, cv, VR.w, VR.h); out._shown = false; } return; }
  out._shown = true;
  camera.updateMatrixWorld();
  const dot = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) dot(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, s, s, c); };
  const text = (t, x, y, c) => { g.fillStyle = c; fontDraw(t, x, y, s, (a, b, k) => g.fillRect(Math.round(a), Math.round(b), k, k)); };
  for (const C of CALLOUTS) {
    const p = C.at().project(camera);
    if (p.z > 1) continue;
    const ax = (p.x + 1) / 2 * W, ay = (1 - p.y) / 2 * H;
    const ex = ax + C.dx * s * 0.45, ey = ay + C.dy * s;   // 꺾이는 점
    const tw = Math.max(...C.lines.map(fontWidth)) * s, left = C.dx < 0;
    const tx = Math.max(4 * s, Math.min(W - tw - 4 * s, left ? ex - tw : ex)), x0 = Math.min(tx, ex), x1 = Math.max(tx + tw, ex);   // 글자는 화면 안으로
    const ty = ey - C.lines.length * 9 * s - 2 * s;
    line(ax, ay, ex, ey, INK); line(x0, ey, x1, ey, INK);
    C.lines.forEach((t, i) => text(t, tx + (left ? tw - fontWidth(t) * s : 0), ty + i * 9 * s, INK));
    dot(ax - s, ay - s, 3 * s, 3 * s, INK);   // 부품 쪽 끝점
  }
  sharpBlit(out, th > 0 ? ditherMask(cv, th) : cv, VR.w, VR.h);
}
function hline(x0, y0, x1, y1) {   // 1칸 굵기 직선
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n));
}
// ---- 상단 가운데 나침반: 호 하나 + 호 바깥에 카메라 방향 기준 N·E·W·S, 그 사이에 호에서 1칸 안쪽 점들.
// 호 위의 자리 = 원 위에서 그 방향의 각도 (가운데 = 카메라가 보는 쪽). 글자·표시는 좌우 끝에서 잘리지 않게 다 들어갈 때만 그린다.
// 카메라 앞 range도(180) 안의 것을 보이는 호 길이 안에 모아 보인다 (각도를 같은 비율로 줄인다).
// 호 안쪽에 적 (늘 표시) (탱크·자주포 3x3 ■ · 지프 2x2 ■ · 벙커 4x4 그림)
// 화면에서 보이는 대로: 카메라가 +z(북)를 보면 오른쪽이 -x → 동 = -x
const CMP = Object.assign({ radius: 90, width: 120, top: 6, dots: 3, range: 180, scoutRange: 0 }, HC.compass);
const BUNKER_ICON = ['.##.', '####', '#..#', '####'];   // 벙커 표시 (4x4)
const CMP_DIRS = [['N', 0, 1], ['E', -1, 0], ['S', 0, -1], ['W', 1, 0]];
const _cmpF = new THREE.Vector3();
const pxC = (x, y, w = 1, h = 1) => { hc.fillRect(x, y, w, h); kc.fillRect(x, y, w, h); };   // (hudRight에 넣지 않는다: 성장 선택지 자리와 상관없게)
function compassState(cw) {
  camera.getWorldDirection(_cmpF);
  const fl = Math.hypot(_cmpF.x, _cmpF.z) || 1, fx = _cmpF.x / fl, fz = _cmpF.z / fl, rx = -fz, rz = fx;   // 앞·오른쪽 (땅 위)
  const R = CMP.radius, hw = Math.min(Math.floor(CMP.width / 2), R - 1), cx = Math.floor(cw / 2), cy = CMP.top + 9 + R;
  const half = Math.min(179.9, (CMP.range || 180) / 2) * DEG, K = Math.asin(hw / R) / half;   // 앞 range도 → 보이는 호 각도로
  const ang = (dx, dz) => { const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); return Math.abs(a) > half ? 9 : a * K; };   // + = 오른쪽. 범위 밖이면 9 (안 그림)
  const fits = (l, w) => Math.abs(l - cx) <= hw && Math.abs(l + w - 1 - cx) <= hw;   // 좌우로 다 들어가는가
  const marks = [];   // [종류, x, y]
  const at = (a, r) => [Math.round(cx + Math.sin(a) * r), Math.round(cy - Math.cos(a) * r)];
  for (const [ch, dx, dz] of CMP_DIRS) {   // 글자: 호에서 2칸 띄워 바깥 (가운데 기준)
    const a = ang(dx, dz); if (Math.abs(a) >= Math.PI / 2) continue;
    const [x, y] = at(a, R + 6); if (fits(x - 2, 5)) marks.push([ch, x - 2, y - 3]);
  }
  const n = Math.max(0, CMP.dots | 0);
  for (let q = 0; q < 4; q++) for (let i = 1; i <= n; i++) {   // 점: 호에서 1칸 띄워 바깥
    const t = (q + i / (n + 1)) * Math.PI / 2, a = ang(Math.sin(-t) * 1, Math.cos(t));   // N(0,1)에서 E(-1,0) 쪽으로 돈다
    if (Math.abs(a) >= Math.PI / 2) continue;
    const [x, y] = at(a, R + 2); if (fits(x, 1)) marks.push(['.', x, y]);
  }
  if (titleState === 'play') {
    const add = (kind, px, pz, w) => {   // w: 표시 폭 (가운데 = x, 짝수 폭은 왼쪽으로 한 칸 더)
      const dx = px - tank.pos.x, dz = pz - tank.pos.z;
      if (CMP.scoutRange > 0 && Math.hypot(dx, dz) > CMP.scoutRange) return;
      const a = ang(dx, dz); if (Math.abs(a) >= Math.PI / 2) return;
      const [x, y] = at(a, R - 7);
      if (fits(x - (w >> 1), w)) marks.push([kind, x, y]);
    };
    for (const B of BUNKERS) if (!B.ruin) add('b', B.x, B.z, 4);   // 벙커 먼저 (적이 겹치면 적이 위에)
    for (const E of ENEMIES) if (E.solid) add(E.jeep ? 'j' : 't', E.pos.x, E.pos.z, E.jeep ? 2 : 3);   // 탱크·자주포 3x3, 지프 2x2
  }
  return { cx, cy, R, hw, marks, key: cx + ',' + marks.map((m) => m.join(':')).join(',') };
}
function drawCompass(c) {
  const yAt = (dx) => Math.round(c.cy - Math.sqrt(c.R * c.R - dx * dx));
  for (let dx = -c.hw; dx <= c.hw; dx++) {   // 호 (1칸 굵기. 가파른 곳은 가운데 쪽 옆 칸까지 세로로 이어 칠한다)
    const y = yAt(dx), yi = dx === 0 ? y : yAt(dx - Math.sign(dx));
    pxC(c.cx + dx, Math.min(y, yi + 1), 1, Math.max(1, y - yi));
  }
  for (const [k, x, y] of c.marks) {
    if (k === '.') pxC(x, y);
    else if (k === 't') pxC(x - 1, y - 1, 3, 3);   // 적 탱크·자주포 3x3
    else if (k === 'j') pxC(x - 1, y - 1, 2, 2);   // 지프 2x2
    else if (k === 'b') { for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) if (BUNKER_ICON[r][q] === '#') pxC(x - 2 + q, y - 2 + r); }   // 벙커 4x4
    else fontDraw(k, x, y, 1, (a, b) => pxC(a, b));
  }
}
// 내 탱크가 피해를 입었을 때: 클수록 세게, glitchTime 동안 HUD가 치지직
function hudHit(d) {
  glitchUntil = performance.now() + HC.glitchTime * 1000;
  glitchPow = Math.min(1, 0.45 + d / 40);
}
function drawHud() {
  const W = rt.width, H = rt.height, now = performance.now(), dpr = layerScale || devicePixelRatio || 1, DW = Math.max(1, Math.round(VR.w * dpr)), DH = Math.max(1, Math.round(VR.h * dpr));
  if (phud.width !== DW || phud.height !== DH) { phud.width = phudS.width = DW; phud.height = phudS.height = DH; hudKey = ''; }   // 화면에 보이는 크기 그대로 (늘리지 않음)
  hk = Math.max(1, Math.floor(H / 360));
  const CWn = Math.ceil(W / hk) + 2;   // 화면 폭만큼 (상단 가운데 나침반)
  let toastKey = '';
  if (hudToast) {   // 알림: 날아 들어오는 자리·사라지는 디더링 단계
    const t = (now - hudToast.t0) / 1000;
    if (t >= TOAST_IN + TOAST_HOLD + TOAST_FADE || clearSeq) hudToast = null;
    else {
      hudToast.x = TOAST_M - Math.round((1 - easeOutExpo(Math.min(1, t / TOAST_IN))) * (gfWidth(hudToast.text) + TOAST_M + 2));
      hudToast.th = Math.max(0, Math.min(16, Math.floor((t - TOAST_IN - TOAST_HOLD) / TOAST_FADE * 16)));
      toastKey = `${hudToast.text}|${hudToast.x}|${hudToast.th}`;
    }
  }
  const CHn = hudToast ? Math.ceil(H / hk) + 2 : HUD_H;   // (알림이 있을 때만 화면 높이만큼)
  if (hudC.width !== CWn || hudC.height !== CHn) { hudC.width = hudK.width = CWn; hudC.height = hudK.height = CHn; hudKey = ''; }
  const alive = tank.solid || tank.falling;
  const hp = alive ? Math.max(0, Math.round(tank.hp)) : 0;
  const elev = Math.round(THREE.MathUtils.radToDeg(tank.elev));
  const spd = Math.round(Math.hypot(tank.vel.x, tank.vel.z) * 3.6), spdMax = VMAX * (tank.spdM || 1) * 3.6;
  const ta = Math.round(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(tank.tyaw || 0), Math.cos(tank.tyaw || 0))));   // + = 왼쪽
  const rl = tank.cool > 0 ? Math.round((1 - tank.cool / tank.reload) * 40) : 40;
  const blink = rl < 40 ? Math.floor(now / 250) % 2 : 0;   // RELOAD 글자 깜빡임
  const hpBlink = alive && hp > 0 && hp <= 10 ? Math.floor(now / 250) % 2 : 0;   // HP 10 이하: 숫자 깜빡임 (RELOAD와 같은 빠르기)
  const bkAll = BUNKERS.length, bkLeft = BUNKERS.reduce((n, B) => n + (B.ruin ? 0 : 1), 0);
  const cmp = compassState(Math.ceil(W / hk));
  const key = [hp, tank.maxHp, alive, gold, offerCost(), tank.goldMul, rl, blink, hpBlink, spd, Math.round(spdMax), elev, ta, growLevel, enemyLeft(), bkLeft, bkAll, cmp.key, toastKey].join('|');
  const glitch = now < glitchUntil;
  if (key !== hudKey) {
    hudKey = key;
    hc.clearRect(0, 0, hudC.width, hudC.height); kc.clearRect(0, 0, hudK.width, hudK.height); hudRight = 0;
    hc.fillStyle = HC.color; kc.fillStyle = '#000';
    const x0 = 8, L = 11, vx = 36, bw = 48, tx = vx + bw + 4;   // 이름 칸(화면 가장자리에서 8칸), 줄 간격(7 + 4), 값·게이지 칸 (가장 긴 이름 4글자 + 5칸)
    let y = 8;
    htext('HP', x0, y); hbar(vx, y, bw, hp / tank.maxHp); htext(alive ? (hpBlink ? '' : hp) : 'KO', tx, y); y += L;
    htext('GOLD', x0, y); hbar(vx, y, bw, gold / offerCost()); htext(`${gold}/${offerCost()}${tank.goldMul > 1 ? ' X' + tank.goldMul : ''}`, tx, y); y += L;
    htext('AMMO', x0, y); hbar(vx, y, bw, rl / 40, rl < 40); htext(rl < 40 ? (blink ? '' : 'RELOAD') : 'READY', tx, y); y += L;
    htext('SPD', x0, y); hbar(vx, y, bw, spd / spdMax); htext(`${spd}KM/H`, tx, y); y += L;
    // 포각·포탑: 글자 오른쪽에 두 줄 높이(18칸)의 상자 하나. 왼쪽은 옆에서 본 탱크(포신이 포각만큼 기운다), 오른쪽은 위에서 본 탱크(포신이 포탑 방향)
    htext('ELV', x0, y); htext(`${elev < 0 ? '-' : '+'}${Math.abs(elev)}°`, vx, y);
    htext('TUR', x0, y + L); htext(`${ta < 0 ? 'R' : 'L'}${String(Math.abs(ta)).padStart(3, '0')}°`, vx, y + L);
    {
      const bx = vx + 27, by = y, BW = 34, BH = L + 7;
      px(bx, by, BW, 1); px(bx, by + BH - 1, BW, 1); px(bx, by, 1, BH); px(bx + BW - 1, by, 1, BH);
      // 옆모습: 포탑(3칸·5칸) 위에 얹힌 차체(7칸 × 3줄), 아래 한 줄 띄워 바퀴 점선. 포신은 차체 윗줄 오른쪽에서 (각도 1.5배로 과장)
      const hx = bx + 5, ea = Math.max(-0.35, tank.elev) * 1.5;
      px(hx + 2, by + 8, 3, 1); px(hx + 1, by + 9, 5, 1); px(hx, by + 10, 7, 3);
      for (let k = -2; k <= 8; k += 2) px(hx + k, by + 14);
      hline(hx + 6, by + 10, hx + 6 + Math.round(Math.cos(ea) * 4), by + 10 - Math.round(Math.sin(ea) * 4));
      // 위모습: 좌우 궤도 점선 + 둥근 포탑(5칸) + 포신 (위 = 차체 앞, 포탑을 왼쪽으로 돌리면 왼쪽으로)
      const cx = bx + 24, cy = by + 8, tr = tank.tyaw || 0;
      for (let k = -2; k <= 6; k += 2) { px(cx - 4, cy + k); px(cx + 4, cy + k); }
      px(cx - 1, cy - 2, 3, 1); px(cx - 2, cy - 1, 5, 3); px(cx - 1, cy + 2, 3, 1);
      hline(cx, cy, cx - Math.round(Math.sin(tr) * 6), cy - Math.round(Math.cos(tr) * 6));
    }
    y += 2 * L;
    htext('LV', x0, y); htext(growLevel, vx, y); y += L;
    htext('TGT', x0, y); htext(enemyLeft(), vx, y); y += L;
    drawCompass(cmp);
    if (hudToast) {   // 카메라 모드 알림 (좌하단)
      const c = hudToast, y = Math.floor(H / hk) - TOAST_M - 11;
      gfDraw(c.text, c.x, y, (a, b) => { if (a >= 0 && !(c.th && BAYER4[(b & 3) * 4 + (a & 3)] < c.th)) pxC(a, b); });
    }
  } else if (!glitch && !hudGlitched && !hudOffAt) return;
  hudGlitched = glitch;
  // 꺼지는 중이면 (syncHud의 hudOffAt) 4x4 디더링으로 점점 비운다
  const fth = hudOffAt ? Math.max(0, Math.min(16, Math.floor((1 - (hudOffAt - now) / (POP.fade * 1000)) * 16))) : 0;
  const srcC = fth ? ditherMask(hudC, fth) : hudC, srcK = fth ? ditherMask(hudK, fth) : hudK;
  // 화면으로 옮기기: 평소엔 통째로, 치지직일 땐 1~4칸 높이 띠마다 좌우로 몇 칸씩 어긋나게
  pg.clearRect(0, 0, DW, DH); sg.clearRect(0, 0, DW, DH); crtDirtyLo = true;
  const u = hk * DH / H;   // HUD 한 칸의 화면 픽셀 수 (정수 배는 또렷하게, 나머지만 부드럽게: sharpDraw)
  const k = glitch ? glitchPow * Math.min(1, (glitchUntil - now) / (HC.glitchTime * 1000) * 1.5) : 0;
  const CW = hudC.width, CH = hudC.height;
  if (!glitch) {   // 평소: 통째로 한 번
    sharpDraw(pg, srcC, 0, 0, CW * u, CH * u, 0, 0, CW, CH);
    if (HC.shadow > 0) {
      sg.globalAlpha = HC.shadow * 0.5; sharpDraw(sg, srcK, 0, 0, CW * u, CH * u, 0, 0, CW, CH);
      sg.globalAlpha = HC.shadow; sharpDraw(sg, srcK, u, u, CW * u, CH * u, 0, 0, CW, CH);
    }
    return;
  }
  // 치지직: 띠를 먼저 정하고, 그림은 한 번만 키워 띠마다 오려 붙인다 (sharpScaled·bandBlit: 00_core.js)
  const bands = [];
  for (let sy = 0; sy < CH;) {
    const sh = Math.min(CH - sy, 1 + (Math.random() * 4 | 0));
    bands.push([sy, sh, Math.random() < 0.2 + 0.5 * k ? Math.round((Math.random() * 2 - 1) * HC.glitchPx * k) : 0]);
    sy += sh;
  }
  bandBlit(pg, sharpScaled(srcC, u), bands, u, 0);
  if (HC.shadow > 0) {
    const sK = sharpScaled(srcK, u);
    sg.globalAlpha = HC.shadow * 0.5; bandBlit(sg, sK, bands, u, 0);
    sg.globalAlpha = HC.shadow; bandBlit(sg, sK, bands, u, 1);
  }
}

