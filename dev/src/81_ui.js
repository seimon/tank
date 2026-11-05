// ---------------------------------------------------------------- 픽셀 UI (한글)
// 글꼴: 갈무리11 장체 (fonts/galmuri11c.js, OFL). 한글은 7x11칸 글자에 8칸 간격, 줄 높이 15칸(글자 11 + 간격 4)
// 표현은 HUD와 같다: 색 한 가지(기본 HC.color)를 블렌딩(HC.blend)으로 얹고, 밑에 검은 그림자(HC.shadow)를 오른쪽 아래 1칸 깐다.
// 패널 바탕은 그림자 캔버스에 반투명 검정으로 깔아 뒤 장면을 어둡게 한다 (더하기 블렌딩은 어둡게 할 수 없어서)
// UI 칸 = 게임 화면 1픽셀 × hk (HUD와 같은 배율). 1칸 = 1픽셀 캔버스 세 장(색·그림자·바탕)에 그려 두고 화면 캔버스로 늘려 옮긴다.
// 화면 하나 = { draw(ui), click(id), key(e) }. uiShow(화면)으로 띄우고, 내용이 바뀌면 uiDirty() → 다음 프레임에 다시 그린다
const GF = { map: null, u8: null };
const GF_BASE = 11, GF_LINE = 15;   // 줄 맨 위에서 글자 바닥선까지, 줄 높이
function gfInit() {
  if (GF.map) return;
  GF.map = new Map();
  const F = window.GALMURI11C;
  if (!F) return;   // 폰트 파일이 없으면 글자 없이 (상자는 그려진다)
  const bin = atob(F.data), u = GF.u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  for (let o = 0, cp = 0; o < u.length;) {
    let d = 0, sh = 0, b;
    do { b = u[o++]; d |= (b & 127) << sh; sh += 7; } while (b & 128);
    cp += d;
    const g = { dw: u[o], w: u[o + 1], h: u[o + 2], xo: u[o + 3] - 8, yo: u[o + 4] - 8, off: o + 5 };
    GF.map.set(cp, g); o = g.off + ((g.w * g.h + 7) >> 3);
  }
}
const gfGlyph = (ch) => { gfInit(); return GF.map.get(ch.codePointAt(0)) || GF.map.get(63) || null; };   // 없는 글자는 '?'
const gfWidth = (t) => { let w = 0; for (const ch of String(t)) w += gfGlyph(ch)?.dw ?? 0; return Math.max(0, w - 1); };   // 마지막 글자 뒤 1칸 간격은 뺀다
// 글자를 칸마다 plot(x, y)로 찍는다 (y = 줄 맨 위). 다음 글자 자리를 돌려준다
function gfDraw(t, x, y, plot) {
  for (const ch of String(t)) {
    const g = gfGlyph(ch);
    if (!g) continue;
    const top = y + GF_BASE - (g.yo + g.h);
    for (let j = 0, k = 0; j < g.h; j++) for (let i = 0; i < g.w; i++, k++) if (GF.u8[g.off + (k >> 3)] & (128 >> (k & 7))) plot(x + g.xo + i, top + j);
    x += g.dw;
  }
  return x;
}
// 글자 하나를 칠한 칸의 왼쪽 위가 (x, y)에 오게 찍는다 (상자 안 가운데 맞춤용)
function gfGlyphDraw(g, x, y, plot) {
  for (let j = 0, k = 0; j < g.h; j++) for (let i = 0; i < g.w; i++, k++) if (GF.u8[g.off + (k >> 3)] & (128 >> (k & 7))) plot(x + i, y + j);
}
// 폭 maxW칸 안으로 줄바꿈: 띄어쓰기에서 나누고, 한 어절이 너무 길면 글자 단위로. '\n'은 그대로 줄바꿈
function gfWrap(t, maxW) {
  const out = [];
  for (const para of String(t).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (gfWidth(cand) <= maxW) { line = cand; continue; }
      if (line) out.push(line);
      line = '';
      for (const ch of word) { if (line && gfWidth(line + ch) > maxW) { out.push(line); line = ''; } line += ch; }
    }
    out.push(line);
  }
  return out;
}

const pui = document.getElementById('pui'), ug = pui.getContext('2d');
const puiS = document.getElementById('puiS'), usg = puiS.getContext('2d');
pui.style.mixBlendMode = HC.blend;
const uiC = document.createElement('canvas'), ucx = uiC.getContext('2d');   // 색
const uiK = document.createElement('canvas'), ukx = uiK.getContext('2d');   // 글자·선 그림자
const uiB = document.createElement('canvas'), ubx = uiB.getContext('2d');   // 패널 바탕 (반투명 검정)
const UI = { screen: null, dirty: false, hits: [], hover: null, w: 0, h: 0, u: 1, shown: false, closing: null, glitchT: 0, noHit: false, pressId: null, pressT: 0 };
// 키보드로 버튼을 누르면 그 버튼을 잠깐 마우스를 올린 것처럼 (사라지는 창에서도 보이게)
const UI_PRESS_MS = 180;
function uiPress(id) { UI.pressId = id; UI.pressT = performance.now() + UI_PRESS_MS; uiDirty(); }
function uiSet(screen) {
  UI.screen = screen; UI.hover = null; UI.dirty = true; pausedDrawn = false;
  pui.style.mixBlendMode = (screen && screen.blend) || HC.blend;   // 화면마다 블렌딩을 따로 둘 수 있다 (작전 정보 = normal)   // 멈춰 있어도 바뀐 화면을 그리러 루프를 깨운다
  if (screen && screen.win) UI.glitchT = HC.glitchTime;   // 창: 치지직하며 나타난다
  document.body.style.cursor = '';   // 모든 화면은 passive: 화면을 덮지 않고 항목을 누를 때만 가로챈다
}
// 화면 바꾸기. 지금 화면이 창이면 바로 바꾸지 않고 치지직 + 디더링으로 사라진 뒤에 (UI.closing)
// 창이 열리고 닫힐 때 소리
function uiShow(screen) {
  const w0 = winUp(), s0 = UI.closing ? UI.closing.next : UI.screen;
  uiShow0(screen);
  if (screen === s0) return;
  if (screen && screen.win) sfx.ui('open');
  else if (w0 && !winUp()) sfx.ui('close');
}
function uiShow0(screen) {
  pausedDrawn = false;
  if (UI.closing) {
    if (screen === UI.screen) { UI.closing = null; UI.dirty = true; return; }   // 닫히던 창을 다시 띄움
    UI.closing.next = screen; return;
  }
  if (UI.screen && (UI.screen.win || (UI.screen === offerUI && screen && screen.win)) && screen !== UI.screen) {   // 창이 닫힐 때, 그리고 선택지 위로 창이 뜰 때
    UI.closing = { next: screen, t: 0 }; UI.glitchT = HC.glitchTime; UI.dirty = true;
    document.body.style.cursor = '';
    return;
  }
  uiSet(screen);
}
// 가운데 창이 떠 있는가 (사라지는 중이어도 다음이 창이면 그대로 떠 있는 것으로)
const keyButtonW = (key, label) => 5 + gfWidth(key) + 4 + 4 + gfWidth(label) + 6;   // 키 칸 버튼 폭
const winUp = () => !!(UI.closing ? UI.closing.next && UI.closing.next.win : UI.screen && UI.screen.win);
const uiDirty = () => { UI.dirty = true; pausedDrawn = false; };
// 그리기 도구 (모두 UI 칸 단위, 정수로 맞춘다). col을 주면 그 색으로, 아니면 HUD 색
const ui = {
  get w() { return UI.w; }, get h() { return UI.h; },
  // 색 + 그림자
  fill(x, y, w, h, col) { if (col) ucx.fillStyle = col; ucx.fillRect(x | 0, y | 0, w | 0, h | 0); ukx.fillRect(x | 0, y | 0, w | 0, h | 0); if (col) ucx.fillStyle = HC.color; },
  // 1칸 테두리
  box(x, y, w, h, col) { this.fill(x, y, w, 1, col); this.fill(x, y + h - 1, w, 1, col); this.fill(x, y, 1, h, col); this.fill(x + w - 1, y, 1, h, col); },
  // 뒤 장면을 어둡게 (a = 0~1)
  dim(x, y, w, h, a = 0.6) { ubx.fillStyle = `rgba(0,0,0,${a})`; ubx.fillRect(x | 0, y | 0, w | 0, h | 0); },
  // 글자 한 줄. align: 'left' | 'center' | 'right' (x 기준). 오른쪽 끝 x를 돌려준다
  text(t, x, y, col, align = 'left') {
    const w = gfWidth(t), sx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    if (col) ucx.fillStyle = col;
    gfDraw(t, sx, y | 0, (a, b) => { ucx.fillRect(a, b, 1, 1); ukx.fillRect(a, b, 1, 1); });
    if (col) ucx.fillStyle = HC.color;
    return sx + w;
  },
  // k배 크게 쓴 글자 한 줄 (제목용. 글자 칸 하나를 k×k로). 오른쪽 끝 x를 돌려준다
  textK(t, x, y, k, col, align = 'left') {
    const w = gfWidth(t) * k, sx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    if (col) ucx.fillStyle = col;
    gfDraw(t, 0, 0, (a, b) => { ucx.fillRect(sx + a * k, (y | 0) + b * k, k, k); ukx.fillRect(sx + a * k, (y | 0) + b * k, k, k); });
    if (col) ucx.fillStyle = HC.color;
    return sx + w;
  },
  // 각진 패널: 어두운 바탕 + 1칸 테두리 (모서리까지 꽉)
  panelSq(x, y, w, h, col, a = 0.6) { this.dim(x, y, w, h, a); this.box(x, y, w, h, col); },
  // 글자 키 칸 (SPACE·ESC처럼 여러 글자도): 칠한 칸 안에 검은 글자, 위아래 1칸·좌우 2칸 여유. y = 글자 줄 맨 위. 폭을 돌려준다
  keyText(x, y, label, col) {
    const w = gfWidth(label) + 4;
    this.fill(x, y - 1, w, 12, col);
    this.knock(() => this.text(label, x + 2, y));
    return w;
  },
  // 키 칸이 붙은 버튼: [G] 재출격. 마우스를 올리면 색으로 꽉 채우고 글자를 비워 뒤집는다
  keyButton(id, x, y, key, label, col) {   // 키 칸: 글자 줄 위아래 1칸, 좌우 2칸 여유 (ESC처럼 여러 글자도)
    const kw = gfWidth(key), w = keyButtonW(key, label), h = 21, hot = this.hit(id, x, y, w, h), lx = x + 5 + kw + 4 + 4;
    this.dim(x, y, w, h, 0.6);
    if (hot) {
      this.fill(x, y, w, h, col);
      this.knock(() => { ucx.fillRect(x + 5, y + 4, kw + 4, 12); this.text(label, lx, y + 5); });   // 키 칸은 통째로 비워 검게, 이름은 뒤집어
      this.text(key, x + 7, y + 5, col);   // 검은 키 칸 안에 창 색 글자
    } else {
      this.box(x, y, w, h, col);
      this.fill(x + 5, y + 4, kw + 4, 12, col);
      this.knock(() => this.text(key, x + 7, y + 5));
      this.text(label, lx, y + 5, col);
    }
    return w;
  },
  // 사각형 안에만 그리기 (색·그림자 모두. 그림자는 오른쪽 아래 1칸까지)
  clip(x, y, w, h, fn) {
    for (const g of [ucx, ukx]) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); }
    fn();
    for (const g of [ucx, ukx]) g.restore();
  },
  // 색만 지우며 그리기 (꽉 칠한 칸 안에 '검은 글자': 바탕과 그림자가 비쳐 보인다)
  knock(fn) { ucx.globalCompositeOperation = 'destination-out'; fn(); ucx.globalCompositeOperation = 'source-over'; },
  // 클릭 영역 등록 (마우스를 올리면 UI.hover = id)
  hit(id, x, y, w, h) {
    if (id == null) return false;
    const pressed = UI.pressId === id && performance.now() < UI.pressT;
    if (UI.noHit) return pressed;
    UI.hits.push({ id, x, y, w, h }); return pressed || UI.hover === id;
  },   // 사라지는 중에는 누를 수 없다
};
// 화면 좌표(CSS 픽셀) → UI 칸
const uiAt = (e) => ({ x: (e.clientX - VR.x) / UI.u, y: (e.clientY - VR.y) / UI.u });
const uiPick = (p) => { for (let i = UI.hits.length - 1; i >= 0; i--) { const r = UI.hits[i]; if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return r.id; } return null; };
// passive 화면 (게임을 계속하는 동안 뜨는 것): 화면을 덮지 않고, 누른 곳이 항목일 때만 가로챈다 (마우스·터치)
addEventListener('pointerdown', (e) => {
  if (!UI.screen || !UI.screen.passive || !UI.screen.click || e.target.closest?.('#hud')) return;
  const id = uiPick(uiAt(e));
  if (id) { e.stopImmediatePropagation(); e.preventDefault(); if (UI.screen.win) sfx.ui('button'); UI.screen.click(id); }
}, true);
// passive 화면의 마우스 올림 (버튼이 뒤집혀 보이게): 화면을 덮지 않으니 창 전체에서 본다
addEventListener('pointermove', (e) => {
  if (!UI.screen || !UI.screen.passive || !UI.hits.length) return;
  const id = uiPick(uiAt(e));
  if (id !== UI.hover) { UI.hover = id; uiDirty(); document.body.style.cursor = id ? 'pointer' : ''; }
});
// 매 프레임: 화면 크기가 바뀌었거나 내용이 바뀌었을 때만 다시 그린다
function uiUpdate() {
  const H = rt.height, dpr = devicePixelRatio || 1, DW = Math.max(1, Math.round(VR.w * dpr)), DH = Math.max(1, Math.round(VR.h * dpr));
  const k = Math.max(1, Math.floor(H / 360)), w = Math.floor(rt.width / k), h = Math.floor(H / k);
  if (!UI.screen) {
    if (UI.shown) { ug.clearRect(0, 0, pui.width, pui.height); usg.clearRect(0, 0, puiS.width, puiS.height); UI.shown = false; }
    return;
  }
  if (pui.width !== DW || pui.height !== DH || UI.w !== w || UI.h !== h) {
    pui.width = puiS.width = DW; pui.height = puiS.height = DH;
    uiC.width = uiK.width = uiB.width = UI.w = w; uiC.height = uiK.height = uiB.height = UI.h = h;
    UI.dirty = true;
  }
  UI.u = k * VR.h / H;   // UI 한 칸의 CSS 픽셀 수
  if (UI.pressId && performance.now() >= UI.pressT) { UI.pressId = null; UI.dirty = true; }   // 키로 누른 표시 끝
  if (UI.closing) {   // 사라지는 중
    UI.closing.t += uiDt; UI.dirty = true;
    if (UI.closing.t >= POP.fade) { const nx = UI.closing.next; UI.closing = null; uiSet(nx); if (!UI.screen) return uiUpdate(); }
  } else if (UI.screen.tick) { UI.screen.tick(); if (!UI.screen) return uiUpdate(); }   // 시간에 따라 바뀌는 화면 (닫혔으면 지우러 한 번 더)
  if (UI.glitchT > 0) { UI.glitchT = Math.max(0, UI.glitchT - uiDt); UI.dirty = true; }
  if (!UI.dirty) return;
  UI.dirty = false; UI.shown = true; UI.hits.length = 0; UI.noHit = !!UI.closing;
  ucx.clearRect(0, 0, w, h); ukx.clearRect(0, 0, w, h); ubx.clearRect(0, 0, w, h);
  ucx.fillStyle = HC.color; ukx.fillStyle = '#000';
  UI.screen.draw(ui);
  // 화면으로: 바탕 → 그림자(제자리에 옅게 + 오른쪽 아래 1칸) → 색(블렌딩은 CSS mix-blend-mode)
  // 사라지는 중이면 (UI.screen.th 1~16) 세 장 모두 같은 4x4 디더링 무늬로 비운다
  const cth = UI.closing ? Math.min(16, Math.floor(UI.closing.t / Math.max(0.01, POP.fade) * 16)) : 0;
  const u = k * DH / H, th = Math.max(UI.screen.th || 0, cth), dm = (c) => th > 0 ? ditherMask(c, th) : c;
  // 치지직 (HUD와 같은 방식): 1~4칸 높이 띠마다 좌우로 몇 칸씩 어긋나게. 세 장 모두 같은 띠로
  const gk = UI.glitchT > 0 ? 0.8 * Math.min(1, UI.glitchT / HC.glitchTime * 1.5) : 0, bands = [];
  if (gk > 0) for (let sy = 0; sy < h;) {
    const sh = Math.min(h - sy, 1 + (Math.random() * 4 | 0));
    bands.push([sy, sh, Math.random() < 0.2 + 0.5 * gk ? Math.round((Math.random() * 2 - 1) * HC.glitchPx * gk) : 0]); sy += sh;
  } else bands.push([0, h, 0]);
  const put = (g, src, o) => { for (const [sy, sh, dx] of bands) sharpDraw(g, src, (dx + o) * u, (sy + o) * u, w * u, sh * u, 0, sy, w, sh); };
  ug.clearRect(0, 0, DW, DH); usg.clearRect(0, 0, DW, DH);
  put(usg, dm(uiB), 0);
  const shA = UI.screen.shadow ?? HC.shadow;   // 화면마다 그림자 진하기 (없으면 HUD 값)
  if (shA > 0) {
    const sk = dm(uiK);
    usg.globalAlpha = shA * 0.5; put(usg, sk, 0);
    usg.globalAlpha = shA; put(usg, sk, 1);
    usg.globalAlpha = 1;
  }
  put(ug, dm(uiC), 0);
}

// ---- 성장 선택지 (우상단, 세로 3칸 + 안내 한 줄). 게임은 계속되고, 화면을 덮지 않는다 (항목을 누를 때만 가로챔)
// 항목: 테두리 상자 안에 [레어도 색 키 칸 + 검은 키 글자] 이름(레어도 색) / 설명(밝은 회색, 줄바꿈).
// 키 글자는 키보드면 1·2·3, 게임패드를 쓰고 있으면 ←·↑·→. 키 칸은 세 글자를 모두 담는 같은 크기 (위아래 1칸, 좌우 2칸 여유)이고 글자마다 정가운데.
// 화면 가장자리에서 6칸 안쪽, 폭은 HUD 오른쪽 끝에 닿지 않을 만큼 (최대 200칸).
// 나타날 때: 위에서부터 0.1초 간격으로 화면 오른쪽 밖에서 제자리로 0.3초 (EaseOutExpo). 안내 줄은 네 번째로.
// 고르면 나머지(안내 줄 포함)는 곧바로 어두운 회색, OFFER_HOLD초 뒤 OFFER_FADE초에 걸쳐 디더링으로 사라진다
const OFFER_TXT = '#9c9c9c', OFFER_OFF = '#464646', OFFER_HOLD = 1.0, OFFER_FADE = 0.4, OFFER_IN = 0.3, OFFER_STEP = 0.1, OFFER_W = 200;
// 조합 완성 카드는 COMBO_HOLD초 더 보인다. 고른 카드 테두리는 PICK_BLINK초마다 회색 ↔ 흰색
const COMBO_HOLD = 2.0, PICK_BLINK = 0.12, BAD_C = (GC.rarity.risky || {}).color || '#e0533c', COMBO_C = (GC.rarity.combo || {}).color || '#ffd25a';
// 숫자 뒤 '으로/로': 끝자리를 읽은 소리에 받침이 있으면(0 영·3 삼·6 육, 10 십·100 백…) '으로', 없거나 ㄹ이면 '로'
// 숫자 뒤 '을/를': 끝자리를 읽은 소리에 받침이 있으면(0 영·1 일·3 삼·6 육·7 칠·8 팔, 10 십…) '을'
const josaUl = (n) => [0, 1, 3, 6, 7, 8].includes(n % 10) ? '을' : '를';
const josaRo = (n) => [0, 3, 6].includes(n % 10) ? '으로' : '로';
const easeOutExpo = (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
let inputPad = false;   // 마지막으로 쓴 입력이 게임패드인가 (화면에 보이는 키 글자를 바꾼다: 선택지·창·타이틀)
// 바뀌는 즉시 다시 그린다 (멈춘 창·타이틀도)
function setInputPad(v) {
  if (inputPad === v) return;
  inputPad = v;
  uiDirty(); pausedDrawn = false;
  drawTitleKeys(v);
}
const PK = (kbd, pad) => inputPad ? pad : kbd;   // 화면에 보일 키 글자 (키보드 / 게임패드. 패드는 Xbox 이름)
addEventListener('keydown', (e) => { if (!e.fromPad) setInputPad(false); });   // (패드가 대신 누른 키는 빼고)
addEventListener('pointerdown', () => setInputPad(false));
// ---- 작전 정보 (게임 시작 직후, 화면 가운데): 위 한 줄(흰색) + 한 줄 띄우고 아래 1~5줄(밝은 회색).
// 한 글자씩 나타나고(타자 소리), hold초 뒤 fade초 동안 치지직 + 4x4 디더링으로 한꺼번에 사라진다. 다 사라지면 HUD
const MIS = Object.assign({ enabled: true, top: 37, titleColor: '#ffffff', lineColor: '#e0533c', textColor: '#c8c8c8', blend: 'normal', shadow: 0.5, title: '', lines: [], typeSpeed: 30, hold: 3, fade: 2 }, CFG.mission);
let missionDone = !MIS.enabled;
const missionUI = {
  passive: true, t: 0, th: 0, shown: -1, blend: MIS.blend, shadow: MIS.shadow,   // 이 화면만 블렌딩·그림자를 따로
  rows() { return [[MIS.title, MIS.titleColor], ['', ''], ...MIS.lines.slice(0, 5).map((l) => [l, MIS.textColor])]; },
  total() { return this.rows().reduce((n, [t]) => n + t.length, 0); },
  draw(ui) {
    let left = Math.floor(this.t * MIS.typeSpeed);   // 지금까지 나타난 글자 수
    const rows = this.rows(), y0 = MIS.top;
    // 작전명이 다 나오면 바로 아래 빈 줄 가운데에 빨간 가로줄 (가장 긴 줄 폭, 글자처럼 그림자)
    if (left >= MIS.title.length) { const lw = Math.max(...rows.map(([t]) => gfWidth(t))); ui.fill(Math.round((ui.w - lw) / 2), y0 + GF_LINE + Math.floor(GF_LINE / 2) - 1, lw, 1, MIS.lineColor); }
    rows.forEach(([t, col], i) => {
      if (!t || left <= 0) return;
      const part = t.slice(0, left); left -= t.length;
      ui.text(part, Math.round((ui.w - gfWidth(t)) / 2), y0 + i * GF_LINE, col);   // 줄 전체 폭으로 가운데 맞춘 자리에서 왼쪽부터 (글자가 늘어도 흔들리지 않게)
    });
  },
  tick() {
    const dt = clock.running ? lastDt : 0, typeEnd = this.total() / Math.max(1, MIS.typeSpeed);
    this.t += dt;
    const n = Math.min(this.total(), Math.floor(this.t * MIS.typeSpeed));
    if (n !== this.shown) { if (n > this.shown && n % 2) sfx.ui('type'); this.shown = n; uiDirty(); }
    const f = (this.t - typeEnd - MIS.hold) / Math.max(0.01, MIS.fade);
    if (f > 0) {
      const th = Math.min(16, Math.floor(f * 16));
      UI.glitchT = HC.glitchTime * Math.max(0.15, 1 - f) * 0.7;   // 사라지는 동안 계속 치지직 (점점 약하게)
      if (th !== this.th) { this.th = th; uiDirty(); }
      if (f >= 1) { this.th = 0; UI.glitchT = 0; endMission(); }
    }
  },
};
window.dbg.mission = missionUI;
function startMission() {
  if (missionDone) return;
  Object.assign(missionUI, { t: 0, th: 0, shown: -1 });
  hudRevealT = 1e9;   // HUD는 작전 정보가 사라진 뒤에
  uiShow(missionUI);
}
function endMission() {
  missionDone = true; hudRevealT = 0;
  if (UI.screen === missionUI) uiShow(null);
  if (pauseUI.under === missionUI) pauseUI.under = null;
}
// 플레이가 시작되면 (타이틀 전환이 끝나거나, 타이틀을 건너뛰면 로딩 화면이 걷힌 뒤) 한 번
function missionCheck() { if (!missionDone && !UI.screen && !UI.closing && titleState === 'play' && !document.getElementById('loading')) startMission(); }
const offerUI = {
  passive: true, th: 0, freezeT: null,
  draw(ui) {
    const c = curOffer;
    if (!c) return;
    const m = 6, gap = 8, w = Math.max(110, Math.min(OFFER_W, ui.w - m - (hudRight || 170) - gap)), x = ui.w - m - w;
    // 키 칸 크기: 세 글자의 칠한 폭·높이를 모두 담고, 글자마다 정가운데에 오도록 (폭 차이가 홀수면 1칸 더)
    const keys = (inputPad ? ['←', '↑', '→'] : ['1', '2', '3']).map(gfGlyph);
    const kw = Math.max(...keys.map((g) => g.w)), kh = Math.max(...keys.map((g) => g.h));
    const KW = kw + 4 + (keys.some((g) => (kw - g.w) % 2) ? 1 : 0), KH = kh + 2 + (keys.some((g) => (kh - g.h) % 2) ? 1 : 0);
    const slide = (k) => { const t = Math.max(0, Math.min(1, (c.showT - OFFER_STEP * k) / OFFER_IN)); return Math.round((1 - easeOutExpo(t)) * (ui.w - x + 2)); };
    let y = m;
    c.choices.forEach((ch, i) => {
      const off = c.picked >= 0 && c.picked !== i, rc = (GC.rarity[ch.u.rarity] || {}).color || HC.color;
      const nameC = off ? OFFER_OFF : rc, txtC = off ? OFFER_OFF : OFFER_TXT, X = x + slide(i);
      // 설명(회색) + 단점(빨강, 위험 선택지)
      const lines = gfWrap(ch.desc, w - 10).map((t) => [t, txtC]).concat(ch.bad ? gfWrap(ch.bad, w - 10).map((t) => [t, off ? OFFER_OFF : BAD_C]) : []);
      const h = 21 + lines.length * GF_LINE;   // 위아래 안쪽 여백 5칸 + 이름 줄 + 설명 줄들
      // 고른 카드·조합 카드: 사라질 때까지 테두리가 회색 ↔ 흰색으로 깜빡인다
      const boxC = c.picked === i ? (Math.floor(Math.max(0, c.pickT) / PICK_BLINK) % 2 ? '#ffffff' : OFFER_TXT) : txtC;
      ui.dim(X, y, w, h, 0.5);
      ui.box(X, y, w, h, boxC);
      let nx = X + 5;
      if (!c.combo) {   // 키 칸: 이름 줄(글자 11칸) 가운데에 세로로 맞춘다
        const kx = X + 5, ky = y + 5 + Math.floor((11 - KH) / 2), g = keys[i];
        ui.fill(kx, ky, KW, KH, nameC);
        ui.knock(() => gfGlyphDraw(g, kx + (KW - g.w) / 2, ky + (KH - g.h) / 2, (a, b) => ucx.fillRect(a, b, 1, 1)));
        nx = kx + KW + 4;
      }
      ui.text(ch.label, nx, y + 5, nameC);
      if (!c.combo && ch.combo !== false && (ch._cc ??= completesCombo(ch.u))) ui.text('조합 완성', X + w - 5, y + 5, off ? OFFER_OFF : COMBO_C, 'right');   // 고르면 조합이 열린다
      lines.forEach(([l, col], k) => ui.text(l, X + 5, y + 5 + GF_LINE * (k + 1), col));
      if (c.picked < 0) ui.hit('o' + i, X, y, w, h);
      y += h + 4;
    });
    if (c.combo) { ui.text(c.choices[0].reason, x + w + slide(1), y, COMBO_C, 'right'); return; }   // 조합 카드: 아래에 열린 이유 (카드 오른쪽에 맞춤)
    const lv = growLevel + (c.picked >= 0 ? 0 : 1);   // 고르면 이미 한 단계 올라 있다
    ui.text(`LV. ${lv}${josaRo(lv)} 성장! ${inputPad ? '방향키' : '숫자키'}로 고르기`, x + w + slide(3), y, c.picked >= 0 ? OFFER_OFF : HC.color, 'right');
  },
  click(id) { pickOffer(+id.slice(1)); },
  // 나타나는 중: 매 프레임 다시 그림. 고른 뒤: 잠시 그대로 → 디더링으로 사라짐 → 닫고 다음 선택지
  tick() {
    const c = curOffer;
    if (!c) { this.th = 0; return; }
    const dt = clock.running ? lastDt : 0, inEnd = OFFER_IN + OFFER_STEP * 3;
    if (this.freezeT != null) c.showT = this.freezeT;
    else if (c.showT < inEnd) { c.showT = Math.min(inEnd, c.showT + dt); uiDirty(); }
    if (c.picked < 0) { this.th = 0; return; }
    const b0 = Math.floor(Math.max(0, c.pickT) / PICK_BLINK);
    c.pickT += dt;
    if (Math.floor(Math.max(0, c.pickT) / PICK_BLINK) !== b0) uiDirty();   // 고른 카드·조합 카드 테두리 깜빡임
    const t = c.pickT - OFFER_HOLD, th = t <= 0 ? 0 : Math.min(16, Math.floor(t / OFFER_FADE * 16));
    if (th >= 16) { this.th = 0; curOffer = null; uiShow(null); nextOffer(); return; }
    if (th !== this.th) { this.th = th; uiDirty(); }
  },
};

// ---- 끝 창 (전투 불능 / 적군 섬멸)과 일시정지 창: 화면 정가운데, 각진 패널. 큰 제목(갈무리 2배) / 회색 내용 / [키] 버튼.
// 끝 창은 0.3초에 걸쳐 4x4 디더링으로 나타난다. 버튼은 마우스·터치로도 누를 수 있다 (화면을 덮지는 않음)
const ENDC = { txt: OFFER_TXT, warn: POP.dead, clear: POP.clear, pause: POP.pause, confirm: POP.confirm, idle: '#7c7c7c' };   // idle: 지금 동작하지 않는 키 칸   // 창마다 색 (popup.*Color)
const centerBox = (ui, pw, ph) => ({ x: Math.round((ui.w - pw) / 2), y: Math.round((ui.h - ph) / 2) });
const deadUI = {
  win: true, passive: true,
  // 재출격은 player.continues번까지. 다 쓰면 재출격 버튼은 회색 (누를 수 없음)
  draw(ui) {
    const left = continuesLeft, title = '전투 불능';
    const body = '전차가 너무 많은 손상을 입어 더 이상 임무를 수행할 수 없습니다.\n' + (left > 0 ? `이어서 다시 작전을 수행할 수 있습니다. (${left}회 남음)` : '더이상 작전을 수행할 수 없습니다.');
    const kG = PK('G', 'Y'), kT = PK('T', 'BACK');
    const lines = gfWrap(body, Math.min(ui.w - 48, 340)), b1 = keyButtonW(kG, '재출격'), b2 = keyButtonW(kT, '첫 화면으로'), bgap = 8;
    const pw = Math.max(gfWidth(title) * 2, b1 + bgap + b2, ...lines.map(gfWidth)) + 28, ph = 12 + 22 + 8 + lines.length * GF_LINE + 6 + 21 + 12;
    const { x, y } = centerBox(ui, pw, ph), by = y + ph - 12 - 21, bx = x + Math.round((pw - (b1 + bgap + b2)) / 2);
    ui.panelSq(x, y, pw, ph, ENDC.warn);
    ui.textK(title, x + pw / 2, y + 12, 2, ENDC.warn, 'center');
    lines.forEach((l, i) => ui.text(l, x + pw / 2, y + 42 + i * GF_LINE, ENDC.txt, 'center'));
    ui.keyButton(left > 0 ? 'respawn' : null, bx, by, kG, '재출격', left > 0 ? ENDC.warn : ENDC.idle);
    ui.keyButton('title', bx + b1 + bgap, by, kT, '첫 화면으로', ENDC.warn);
  },
  click(id) { if (id === 'respawn') respawn(); else if (id === 'title') restartGame(true); },
};
const clearUI = {
  win: true, passive: true, info: { kills: 20, jeeps: 0, time: 0, lv: 0 },
  draw(ui) {
    const I = this.info, rows = [['격파한 적 탱크', `${I.kills}대`], ['격파한 적 지프', `${I.jeeps}대`], ['걸린 시간', fmtTime(I.time)], ['성장', `LV. ${I.lv}`]];
    const kG = PK('G', 'Y'), kT = PK('T', 'BACK');
    const title = '적군 섬멸', b1 = keyButtonW(kG, '새로 시작'), b2 = keyButtonW(kT, '첫 화면으로'), bgap = 8;
    const rw = Math.max(150, b1 + bgap + b2, ...rows.map(([a, b]) => gfWidth(a) + 16 + gfWidth(b)));
    const pw = Math.max(gfWidth(title) * 2, rw) + 28, ph = 12 + 22 + 8 + rows.length * GF_LINE + 6 + 21 + 12;
    const { x, y } = centerBox(ui, pw, ph), rx = x + Math.round((pw - rw) / 2);
    ui.panelSq(x, y, pw, ph, ENDC.clear);
    ui.textK(title, x + pw / 2, y + 12, 2, ENDC.clear, 'center');
    rows.forEach(([a, b], i) => { const ry = y + 42 + i * GF_LINE; ui.text(a, rx, ry, ENDC.txt); ui.text(b, rx + rw, ry, ENDC.clear, 'right'); });
    const by = y + ph - 12 - 21, bx = x + Math.round((pw - (b1 + bgap + b2)) / 2);
    ui.keyButton('restart', bx, by, kG, '새로 시작', ENDC.clear);
    ui.keyButton('title', bx + b1 + bgap, by, kT, '첫 화면으로', ENDC.clear);
  },
  click(id) { if (id === 'restart') restartGame(false); else if (id === 'title') restartGame(true); },
};
// 조종법 탭에 보이는 키와 설명 (일시정지 중에는 동작하지 않는 키라 회색 칸으로)
const PAUSE_HELP = [[['W', 'S'], '전진 · 후진'], [['A', 'D'], '차체 회전'], [['Q', 'E'], '포탑 회전'], [['R', 'F'], '포신 올리기 · 내리기'],
  [['SPACE'], '발사'], [['G'], '뒤집힌 전차 세우기'], [['1', '2', '3'], '성장 고르기'], [['ESC'], '일시정지'],
  [['마우스 끌기'], '카메라 돌리기'], [['휠'], '카메라 당기기 · 밀기']];
const PAUSE_HELP_PAD = [[['L 스틱'], '전진 · 후진 · 차체 회전'], [['R 스틱'], '포탑 회전 · 포신 올리기·내리기'], [['LB', 'RB'], '포탑 회전'],
  [['RT', 'A'], '발사'], [['Y'], '뒤집힌 전차 세우기'], [['←', '↑', '→'], '성장 고르기'], [['START'], '일시정지']];
// 일시정지 창 = 게임 정보 창: 탭 세 개 (탱크 성능 · 강화 기록 · 조종법). 넘치면 W/S로 위아래로 넘겨 보고, 강화 기록은 맨 아래(최근)부터.
// 넘기기는 픽셀 단위: 한 번 누르면 한 줄만큼 부드럽게, 누르고 있으면 계속 미끄러진다 (위아래 끝의 줄은 칸에 잘려 보인다)
const LOG_PL = 11, LOG_SB = 7, LOG_PR = 15;   // 스크롤 영역: 왼쪽 글자 시작, 스크롤 막대(창 오른쪽에서), 오른쪽 글자 끝 (막대와 8칸 띄움)
const LOG_SPEED = POPC.logScrollSpeed ?? 300;   // 누르고 있을 때 1초에 넘어가는 칸 수 (popup.logScrollSpeed. 1칸 = 게임 화면 1픽셀, HUD와 같은 배율)
const pauseUI = {
  win: true, passive: true, under: null, scroll: 0, target: 0, maxS: 0, holdT: 0,   // scroll: 지금 위치(칸), target: 가려는 위치
  tab: 0,   // 0 = 탱크 성능 (처음), 1 = 강화 기록, 2 = 조종법 (Q·E로 바꾼다)
  open() { this.tab = 0; this.home(); },   // 일시정지를 열 때마다 탱크 성능부터
  home() { this.scroll = this.target = this.tab === 1 ? 1e9 : 0; this.holdT = 0; },   // 탱크 성능은 맨 위부터, 강화 기록은 맨 아래(최근)부터
  setTab(t) { t = Math.max(0, Math.min(2, t)); if (t === this.tab) return; this.tab = t; this.home(); uiDirty(); sfx.ui('tab'); },
  busy() { return keys.has('KeyW') || keys.has('KeyS') || this.target !== this.scroll; },   // 움직이는 중이면 멈춘 화면에서도 루프를 계속 돌린다
  toEnd(bottom) { this.target = bottom ? this.maxS : 0; uiDirty(); },   // 맨 위 / 맨 아래로 (부드럽게)
  nudge(d) { this.target = Math.max(0, Math.min(this.maxS, this.target + d * GF_LINE)); uiDirty(); },   // 한 줄만큼
  tick() {   // 멈춘 동안에도 돈다 (uiDt)
    const up = keys.has('KeyW'), dn = keys.has('KeyS');
    if (up !== dn) {
      this.holdT += uiDt;
      if (this.holdT > 0.25) this.target = Math.max(0, Math.min(this.maxS, this.target + (dn ? 1 : -1) * LOG_SPEED * uiDt));   // 누르고 있으면 계속
      uiDirty();   // 누르고 있는 동안은 계속 깨어 있는다
    } else this.holdT = 0;
    const d = this.target - this.scroll;
    if (Math.abs(d) > 0.25) { this.scroll += d * Math.min(1, uiDt * 16); uiDirty(); }   // 부드럽게 따라간다
    else if (d) { this.scroll = this.target; uiDirty(); }
  },
  click(id) { if (id === 'title') uiShow(confirmUI); else if (id === 'resume') pauseSet(false); else if (id.startsWith('tab')) this.setTab(+id.slice(3)); },
  // 강화 기록 줄들: [n. + 이름(레어도 색)] 다음 줄부터 설명(회색, 줄바꿈). dw = 설명 줄 폭
  logLines(dw) {
    const out = [];
    let n = 0;   // 번호는 성장만 (조합은 '조합 완성.')
    (tank.pickLog || []).forEach((c) => {
      out.push({ lv: c.combo ? '조합 완성.' : `${++n}.`, name: c.label, col: (GC.rarity[c.u.rarity] || {}).color || HC.color });
      for (const l of gfWrap(c.desc, dw)) out.push({ desc: l });
      if (c.bad) for (const l of gfWrap(c.bad, dw)) out.push({ desc: l, col: BAD_C });
      if (c.reason) for (const l of gfWrap(c.reason, dw)) out.push({ desc: l, col: COMBO_C });
    });
    return out;
  },
  // 탱크 성능 줄들: 이름(회색) · 값(창 색, 오른쪽 맞춤). 특수 능력은 가진 것만
  statLines(w) {
    const T = tank, f1 = (v) => (Math.round(v * 10) / 10).toString(), mg = T.mg;
    const out = [
      ['최대 HP', `${T.maxHp}`], ['최대 속도', `${Math.round(VMAX * (T.spdM || 1) * 3.6)}km/h`], ['가속도', `${f1(ACC * (T.accM || 1))}m/s²`],
      ['차체 회전', `${Math.round(PC.turnRate * (T.turnM || 1))}°/s`], ['포탑 회전', `${Math.round((T.turretRate || TURRET_RATE) / DEG)}°/s`],
      ['재장전', `${f1(T.reload ?? PC.reload)}초`], ['포탄 속도', `${f1(T.muzzle ?? PC.muzzle)}m/s`], ['포탄 대미지', `${Math.round(T.shellDmg ?? PC.shellDamage)}`],
      ['폭발 범위', T.blastR > 0 ? `${f1(T.blastR)}m` : '없음'], ['범위 대미지', T.blastR > 0 ? `${Math.round((T.blastRatio || 0) * 100)}%` : '-'],
      ['받는 피해', ''],   // 맞은 면마다: (1 - 그 면의 방어력) × 장갑 강화 배율
      ...[['front', '앞'], ['side', '옆'], ['rear', '뒤'], ['top', '위'], ['bottom', '아래']].map(([f, k]) => [k, `${Math.round((1 - ((T.armor || {})[f] ?? 0)) * (T.armorM ?? 1) * 100)}%`, 1]),
      ['장갑 관통', `${Math.round((T.pierce || 0) * 100)}%p`],
      ['골드 끌어오기', `${f1(T.magnetR ?? MAGNET_R)}m`], ['골드 배수', `x${T.goldMul || 1}`],
      ['기관총', mg ? `${mg.count}정` : '없음'],
    ];
    if (mg) out.push(['연사', `${mg.rate}발/초`, 1], ['대미지', `${mg.damage}`, 1], ['사거리', `${mg.range}m`, 1]);
    const sp = [T.ram && '충돌 공격', T.waterSpeed === 1 && '수륙양용', T.goldKeep && '골드 보존', T.autoRepair && '자동 수리', T.berserk && '광전사', T.coinMul > 1 && '탐욕',
      ...(T.combos || []).map((id) => (COMBOS.find((C) => C.id === id) || {}).name)].filter(Boolean);
    out.push(['특수 능력', sp.length ? sp.join(' · ') : '없음']);
    // sub: 위 항목에 딸린 줄 (글머리표 + 들여쓰기). 값이 이름과 겹치면 이름만 두고 값은 다음 줄부터 오른쪽 맞춤으로 줄바꿈
    const res = [];
    for (const [label, value, sub] of out) {
      const lw = (sub ? 14 : 0) + gfWidth(label), room = w - LOG_PL - LOG_PR - lw - 8;
      if (gfWidth(value) <= room) { res.push({ label, value, sub }); continue; }
      res.push({ label, value: '', sub });
      for (const l of gfWrap(value, w - LOG_PL - LOG_PR - 14)) res.push({ label: '', value: l, cont: true });
    }
    return res;
  },
  tabNames() { return ['탱크 성능', `LV. ${growLevel} 강화 기록`, '조종법']; },
  // 조종법 줄들: [키 칸(회색)들] 설명. 설명은 가장 넓은 키 묶음 오른쪽에 한 줄로 맞춘다
  controlLines() {
    const H = inputPad ? PAUSE_HELP_PAD : PAUSE_HELP;   // 키보드 / 게임패드
    const kw = (ks) => ks.reduce((n, k) => n + gfWidth(k) + 4, 0) + (ks.length - 1) * 2, KW = Math.max(...H.map(([ks]) => kw(ks)));
    return H.map(([keys, desc]) => ({ keys, desc, kx: KW }));
  },
  // 창 하나: 탭 머리 / 내용(넘치면 W·S로 넘김) / 아래 [ESC] 계속하기 [T] 첫 화면으로. '일시정지'는 기능만 남고 창은 게임 정보를 보는 곳
  draw(ui) {
    const tabs = this.tabNames(), tabW = tabs.reduce((n, t) => n + gfWidth(t) + 12, 0) - 2;
    const kEsc = PK('ESC', 'B'), kT = PK('T', 'Y'), kQ = PK('Q', 'LB'), kE = PK('E', 'RB');
    const b1 = keyButtonW(kEsc, '계속하기'), b2 = keyButtonW(kT, '첫 화면으로'), bgap = 8;
    const pw = Math.min(ui.w - 16, Math.max(260, 8 + gfWidth(kQ) + 4 + 6 + tabW + 8 + gfWidth(kE) + 4 + 8, b1 + bgap + b2 + 28));
    const ph = Math.min(ui.h - 16, 250);
    const { x, y } = centerBox(ui, pw, ph), by = y + ph - 12 - 21;
    ui.panelSq(x, y, pw, ph, ENDC.pause);
    this.drawLog(ui, x, y, pw, by - 4 - y);   // 탭 머리 + 내용 (버튼 위까지)
    const bx = x + Math.round((pw - (b1 + bgap + b2)) / 2);
    ui.keyButton('resume', bx, by, kEsc, '계속하기', ENDC.pause);
    ui.keyButton('title', bx + b1 + bgap, by, kT, '첫 화면으로', ENDC.pause);
  },
  drawLog(ui, x, y, w, h) {
    // 탭 머리: [Q] 탱크 성능 | 강화 기록 | 조종법 [E]. 고른 탭은 위·좌우 테두리로 감싸고 밑은 열어 둔다 (나머지 아래는 가로줄)
    const ty = y + 12, lineY = ty + 13, tabs = this.tabNames();
    const kQ = PK('Q', 'LB'), kE = PK('E', 'RB');
    const qw = ui.keyText(x + 8, ty, kQ, ENDC.pause), ew = gfWidth(kE) + 4, ex0 = x + w - 8 - ew;
    ui.keyText(ex0, ty, kE, ENDC.pause);
    let tx = x + 8 + qw + 6, gap0 = 0, gap1 = 0;
    tabs.forEach((label, i) => {
      const tw = gfWidth(label) + 10, on = i === this.tab, hot = ui.hit('tab' + i, tx, ty - 5, tw, 18), col = on || hot ? ENDC.pause : ENDC.txt;
      if (on) { ui.fill(tx, ty - 5, tw, 1, ENDC.pause); ui.fill(tx, ty - 5, 1, 18, ENDC.pause); ui.fill(tx + tw - 1, ty - 5, 1, 18, ENDC.pause); gap0 = tx + 1; gap1 = tx + tw - 1; }   // 글자 위 5칸에 위 테두리
      ui.text(label, tx + 5, ty, col);
      tx += tw + 2;
    });
    ui.fill(x + 8 + qw + 2, lineY, gap0 - (x + 8 + qw + 2), 1, ENDC.pause);   // 고른 탭 왼쪽 가로줄
    ui.fill(gap1, lineY, ex0 - 2 - gap1, 1, ENDC.pause);   // 오른쪽 가로줄
    const top = y + 12 + GF_LINE + 6 + 4, bottom = y + h - 12;   // 내용은 탭 머리 아래 4칸 더 띄운다
    const lines = this.tab === 1 ? this.logLines(w - LOG_PL - 10 - LOG_PR) : this.tab === 2 ? this.controlLines() : this.statLines(w);   // 설명은 10칸 더 들여 쓰고, 오른쪽은 스크롤 막대까지 6칸 이상 띄운다
    if (!lines.length) { ui.text('아직 강화하지 않았어요', x + LOG_PL, top, ENDC.txt); return; }
    // 넘치면 맨 아래에 조작 안내: [W S] 위·아래로  [A D] 위·아래 끝으로 (한 줄에 안 들어가면 두 줄)
    const keyW = (a, b) => gfWidth(a) + 4 + 2 + gfWidth(b) + 4, H1 = [PK('W', '↑'), PK('S', '↓'), '위·아래로'], H2 = [PK('A', '←'), PK('D', '→'), '위·아래 끝으로'];
    const hw = (h) => keyW(h[0], h[1]) + 6 + gfWidth(h[2]), oneLine = hw(H1) + 12 + hw(H2) <= w - 16;
    const hintN = oneLine ? 1 : 2;
    const totalH = lines.length * GF_LINE - 4, more = totalH > bottom - top;
    const viewH = more ? bottom - hintN * GF_LINE - 4 - top : bottom - top;
    this.maxS = Math.max(0, totalH - viewH);
    this.target = Math.max(0, Math.min(this.maxS, this.target)); this.scroll = Math.max(0, Math.min(this.maxS, this.scroll));
    const sy = Math.round(this.scroll), first = Math.floor(sy / GF_LINE);
    ui.clip(x, top - 1, w, viewH + 2, () => {   // 칸 밖으로 나간 줄은 잘라낸다 (키 칸은 글자보다 위아래 1칸 커서 그만큼 넉넉히)
      for (let i = first; i < lines.length; i++) {
        const L = lines[i], ly = top + i * GF_LINE - sy;
        if (ly >= top + viewH) break;
        if (L.keys) {   // 조종법: 키 칸(회색)들 + 설명
          let kx = x + LOG_PL;
          for (const k of L.keys) kx += ui.keyText(kx, ly, k, ENDC.idle) + 2;
          ui.text(L.desc, x + LOG_PL + L.kx + 8, ly, ENDC.txt);
        } else if (L.label !== undefined) {   // 탱크 성능: 이름(회색) · 값(창 색, 오른쪽). 딸린 줄은 글머리표
          if (L.sub) ui.text('·', x + LOG_PL + 4, ly, ENDC.txt);   // 딸린 줄: 가운뎃점 (글머리표보다 덜 튀게)
          if (L.label) ui.text(L.label, x + LOG_PL + (L.sub ? 14 : 0), ly, ENDC.txt);
          if (L.value) ui.text(L.value, x + w - LOG_PR, ly, ENDC.pause, 'right');
        }
        else if (L.lv) { const ex = ui.text(L.lv, x + LOG_PL, ly, ENDC.txt); ui.text(L.name, ex + 5, ly, L.col); }
        else ui.text(L.desc, x + LOG_PL + 10, ly, L.col || ENDC.txt);
      }
    });
    if (more) {
      // 오른쪽 끝 스크롤 막대 (1칸 폭): 어두운 길 + 보이는 만큼의 밝은 손잡이
      const th = viewH, bx = x + w - LOG_SB, hh = Math.max(6, Math.round(th * viewH / totalH)), hy = top + Math.round((th - hh) * this.scroll / this.maxS);
      ui.fill(bx, top, 1, th, OFFER_OFF); ui.fill(bx, hy, 1, hh, ENDC.pause);
      const hint = (h, hx, hy) => { let ex = hx; ex += ui.keyText(ex, hy, h[0], ENDC.pause) + 2; ex += ui.keyText(ex, hy, h[1], ENDC.pause); ui.text(h[2], ex + 6, hy, ENDC.txt); };
      const ky = bottom - hintN * GF_LINE + 8;   // 안내는 맨 아래로 조금 더
      hint(H1, x + 8, ky);
      if (oneLine) hint(H2, x + 8 + hw(H1) + 12, ky); else hint(H2, x + 8, ky + GF_LINE);
    }
  },
};
// 확인 창: 일시정지에서 [T] 첫 화면으로 → 정말 돌아갈지 묻는다 ([Y] 예 = 처음부터, [N] 아니오 = 일시정지로)
const confirmUI = {
  win: true, passive: true,
  click(id) { if (id === 'yes') restartGame(true); else if (id === 'no') uiShow(pauseUI); },
  draw(ui) {
    const title = '첫 화면으로 돌아갈까요?', body = '작전 진행 상황이 모두 수포로 돌아갑니다!';
    const kY = PK('Y', 'A'), kN = PK('N', 'B');
    const b1 = keyButtonW(kY, '예'), b2 = keyButtonW(kN, '아니오'), bgap = 8;
    const pw = Math.max(gfWidth(title) * 2, gfWidth(body), b1 + bgap + b2) + 28, ph = 12 + 22 + 8 + GF_LINE + 6 + 21 + 12;
    const { x, y } = centerBox(ui, pw, ph);
    ui.panelSq(x, y, pw, ph, ENDC.confirm);
    ui.textK(title, x + pw / 2, y + 12, 2, ENDC.confirm, 'center');
    ui.text(body, x + pw / 2, y + 42, ENDC.txt, 'center');
    const by = y + ph - 12 - 21, bx = x + Math.round((pw - (b1 + bgap + b2)) / 2);
    ui.keyButton('yes', bx, by, kY, '예', ENDC.confirm);
    ui.keyButton('no', bx + b1 + bgap, by, kN, '아니오', ENDC.confirm);
  },
};
// 게임패드 (표준 배치. 매 프레임 읽는다. 일시정지 중에도). 버튼 이름은 Xbox 기준이고, PS 패드도 브라우저가 같은 자리로 맞춰 준다
//   (A = ✕, B = ○, Y = △, X = □, LB·RB = L1·R1, START = OPTIONS, BACK = SHARE/CREATE)
//  플레이: 왼쪽 스틱 = 주행·선회, 오른쪽 스틱 = 포탑(좌우)·포각(위아래), RT 또는 A = 발사, LB·RB = 포탑 돌리기,
//          방향키 ←·↑·→ = 성장 선택 1·2·3, Y = 세우기(G), START = 일시정지(ESC)
//  타이틀: A = 시작, LB·RB = 위장색
//  일시정지(정보 창): LB·RB = 탭, 방향키 ↑↓ = 한 줄씩 넘기기(누르고 있으면 계속), ←→ = 맨 위·맨 아래, B 또는 START = 계속하기, Y 또는 BACK = 첫 화면으로
//  첫 화면으로 확인 창: A = 예, B = 아니오
//  전투 불능·적군 섬멸 창: Y = 재출격·새로 시작(G), BACK = 첫 화면으로(T)
//  버튼 하나짜리 동작은 그 키를 누른 것처럼 키 입력을 만들어 보낸다 (키보드와 같은 처리를 탄다. e.fromPad)
const padPrev = {}, padHeld = new Set();
function padSend(type, code) { const ev = new KeyboardEvent(type, { code, key: code, bubbles: true }); ev.fromPad = true; dispatchEvent(ev); }
function padKey(code) { padSend('keydown', code); padSend('keyup', code); }
function padHold(code, on) {   // 누르고 있는 동안 키를 누른 채로 (일시정지 창의 넘기기)
  if (on && !padHeld.has(code)) { padHeld.add(code); padSend('keydown', code); }
  else if (!on && padHeld.has(code)) { padHeld.delete(code); padSend('keyup', code); }
}
const padDz = (v) => Math.abs(v || 0) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8;   // 스틱 가운데 흔들림은 무시
function padPoll() {
  pad.thr = pad.steer = pad.tq = pad.de = 0; pad.fire = false;
  if (!navigator.getGamepads) return;
  let up = false, dn = false;
  for (const gp of navigator.getGamepads()) {
    if (!gp || gp.mapping !== 'standard') continue;
    if (!inputPad && (gp.buttons.some((b) => b.pressed) || gp.axes.some((v) => Math.abs(v) > 0.5))) setInputPad(true);   // 패드를 만지면 바로 패드 글자로
    const B = (i) => !!gp.buttons[i]?.pressed, E = {};
    for (const i of [0, 1, 3, 4, 5, 8, 9, 12, 13, 14, 15]) { const k = gp.index * 100 + i, p = B(i); E[i] = p && !padPrev[k]; padPrev[k] = p; }   // 누르는 순간
    const scr = UI.screen;
    if (titleState === 'title') { if (E[0]) padKey('Space'); if (E[4]) padKey('KeyQ'); if (E[5]) padKey('KeyE'); continue; }   // 위장색: LB·RB
    if (scr === confirmUI) { if (E[0]) padKey('KeyY'); if (E[1] || E[9]) padKey('KeyN'); continue; }
    if (scr === pauseUI) {
      if (E[4]) padKey('KeyQ'); if (E[5]) padKey('KeyE');
      up = up || B(12); dn = dn || B(13);
      if (E[14]) padKey('KeyA'); if (E[15]) padKey('KeyD');
      if (E[1] || E[9]) padKey('Escape');
      if (E[3] || E[8]) padKey('KeyT');
      continue;
    }
    if (winUp()) { if (E[3]) padKey('KeyG'); if (E[8]) padKey('KeyT'); continue; }   // 전투 불능·적군 섬멸 창
    // 플레이
    pad.thr = pad.thr || -padDz(gp.axes[1]); pad.steer = pad.steer || -padDz(gp.axes[0]);
    pad.tq = pad.tq || -padDz(gp.axes[2]) || (B(4) ? 1 : 0) - (B(5) ? 1 : 0); pad.de = pad.de || -padDz(gp.axes[3]);
    pad.fire = pad.fire || B(7) || B(0);
    if (scr === offerUI) [14, 12, 15].forEach((b, i) => { if (E[b]) pickOffer(i); });
    if (E[9]) padKey('Escape');
    if (E[3]) padKey('KeyG');
  }
  padHold('KeyW', up && UI.screen === pauseUI); padHold('KeyS', dn && UI.screen === pauseUI);
}

// 설정 메뉴: 내 탱크를 바로 파괴 / 적군을 바로 섬멸 (남은 증원도 없앤다. 지프는 섬멸 조건이 아님)
document.getElementById('dbgDie').onclick = (e) => { if (tank.solid) damageTank(tank, 1e6, null, null, 'test'); e.target.blur(); };
document.getElementById('dbgWipe').onclick = (e) => {
  enemyDrops = Math.max(enemyDrops, MAX_DROPS); dropTimers.length = 0; spgTimers.length = 0;
  for (const E of ENEMIES.slice()) if (!E.jeep && E.solid) destroyTankBody(E);
  checkMissionClear(); e.target.blur();
};

// 바람에 날리는 마른 풀 부스러기와 흙먼지: 카메라가 보는 곳 둘레에서 바람 방향으로 흘러간다.
// windDebris 0이면 없음, 1이면 빽빽하게 (HUD 슬라이더). 바람 세기만큼 빠르고 많이
let windDebris = MAP0.debris, debrisAcc = 0, dustAcc = 0;
// 타이틀 낙엽: 8x8 나뭇잎 그림 4가지(갸름한 잎·단풍잎·버들잎·둥근 잎)를 붙인 작은 판이 빙글빙글 돌며 떨어진다.
// 움직임은 바람에 날리는 풀 부스러기와 같게: 바람 방향으로 같은 빠르기(2.5~6m/s × 바람 세기)로 흘러가고, 좌우로 하늘하늘 흔들린다.
// 타이틀 동안만 새로 생기고, 시작하면 남은 것만 마저 떨어지다가 플레이로 넘어가면 모두 지운다
const LEAF_N = 16, LEAF_COLS = [0xb0581a, 0xc8901e, 0x7a3010, 0x9c7a34];   // 모양마다 최대 16장
const LEAF_SHAPES = [
  ['....##..', '...####.', '..######', '.###.##.', '.##.###.', '.#####..', '..##....', '.#......'],
  ['...#....', '.#.#.#..', '.#####..', '#######.', '.#####..', '..###...', '...#....', '...#....'],
  ['......##', '.....###', '....###.', '...###..', '..###...', '.###....', '.##.....', '#.......'],
  ['..###...', '.#####..', '#######.', '#######.', '.#####..', '..###...', '...#....', '...#....'],
];
const leafMeshes = LEAF_SHAPES.map((rows) => {
  const tex = canvasTex(8, 8, (g) => rows.forEach((r, y) => { for (let x = 0; x < 8; x++) if (r[x] === '#') { g.fillStyle = (x * 7 + y * 3) % 5 ? '#ffffff' : '#d8d0c0'; g.fillRect(x, y, 1, 1); } }));
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), lambert({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }), LEAF_N);
  m.frustumCulled = false; m.count = 0; m.visible = false; m.userData.noOutline = true;
  LEAF_COLS.forEach((c, i) => m.setColorAt(i, new THREE.Color(c)));
  scene.add(m);   // 처음부터 장면에 두어 로딩 때 셰이더를 미리 컴파일 (안 쓸 땐 숨김)
  return m;
});
const leaves = [], _lq = new THREE.Quaternion(), _lm = new THREE.Matrix4(), _ls = new THREE.Vector3(1, 1, 1), _lc = new THREE.Color(), _ln = [0, 0, 0, 0];
let leafAcc = 0;
function updateLeaves(dt) {
  if (titleState === 'play') { if (leafMeshes[0].visible) { leaves.length = 0; for (const m of leafMeshes) { m.count = 0; m.visible = false; } } return; }
  const c = controls.target, wd = U.uWindDir.value, ws = U.uWind.value, t = U.uTime.value;
  if (titleState === 'title' && TDET.leaves > 0) for (leafAcc += dt * TDET.leaves; leafAcc >= 1 && leaves.length < LEAF_N * 4; leafAcc--) {
    const x = c.x + rr(-16, 16) - wd.x * 10, z = c.z + rr(-16, 16) - wd.y * 10;   // 바람 위쪽에서 생겨 화면을 가로질러 간다 (풀 부스러기와 같은 식)
    leaves.push({ p: new THREE.Vector3(x, groundAt(x, z) + rr(3, 8), z), sp: rr(2.5, 6), fall: rr(0.4, 0.8), ph: rand() * 6.283, fr: rr(1.2, 2.2),
      axis: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), ang: rand() * 6.283, spin: rr(2, 5), col: (rand() * LEAF_COLS.length) | 0, kind: (rand() * 4) | 0 });
  }
  for (let i = leaves.length - 1; i >= 0; i--) {
    const L = leaves[i], sway = Math.sin(t * L.fr + L.ph), v = L.sp * (0.4 + ws);
    L.p.x += (wd.x * v - wd.y * sway * 0.8) * dt;   // 바람 방향으로 흘러가며 옆으로 흔들린다
    L.p.z += (wd.y * v + wd.x * sway * 0.8) * dt;
    L.p.y -= L.fall * (0.7 + 0.3 * Math.abs(sway)) * dt;
    L.ang += L.spin * dt;
    if (L.p.y < groundAt(L.p.x, L.p.z) + 0.05 || Math.abs(L.p.x) > HALF || Math.abs(L.p.z) > HALF) leaves.splice(i, 1);
  }
  _ln.fill(0);
  for (const L of leaves) {
    const m = leafMeshes[L.kind], i = _ln[L.kind]++;
    if (i >= LEAF_N) continue;
    m.setMatrixAt(i, _lm.compose(L.p, _lq.setFromAxisAngle(L.axis, L.ang), _ls));
    m.setColorAt(i, _lc.setHex(LEAF_COLS[L.col]));
  }
  leafMeshes.forEach((m, k) => {
    m.count = Math.min(LEAF_N, _ln[k]); m.visible = true;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
}
document.getElementById('debris').value = windDebris; document.getElementById('debrisV').textContent = windDebris.toFixed(2);
function updateWindDebris(dt) {
  if (windDebris <= 0 || dt <= 0) return;
  const wd = U.uWindDir.value, ws = U.uWind.value, c = controls.target;
  const spawnAt = (out) => { const x = c.x + rr(-34, 34) - wd.x * 10, z = c.z + rr(-34, 34) - wd.y * 10; if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return null; out.set(x, groundAt(x, z), z); return out; };
  for (debrisAcc += dt * windDebris * 70 * (0.3 + ws); debrisAcc >= 1; debrisAcc--) {
    if (!spawnAt(_tmp)) continue;
    const sp = rr(2.5, 6) * (0.4 + ws), g = rr(0.4, 0.6);
    const i = smokeP.spawn(_tmp.x, _tmp.y, _tmp.z, wd.x * sp + rr(-0.4, 0.4), 0, wd.y * sp + rr(-0.4, 0.4),
      rr(2.4, 4.2), [g, g * 0.82, g * 0.48, 1], [g, g * 0.82, g * 0.48, 0], rr(0.09, 0.16), rr(0.07, 0.12), -0.05, 0, 0.75);
    smokeP.float(i, rr(0.9, 2.4), rr(0.5, 1.3), rr(1.6, 3.2));   // 지면 위 1~2m에서 크게 오르내리며 바람 따라 떠간다
  }
  for (dustAcc += dt * windDebris * 5 * (0.2 + ws); dustAcc >= 1; dustAcc--) {   // 가끔 흙먼지가 낮게 일었다 흩어진다
    if (!spawnAt(_tmp)) continue;
    const sp = rr(2, 4) * (0.4 + ws);
    smokeP.spawn(_tmp.x, _tmp.y + 0.3, _tmp.z, wd.x * sp, rr(0.1, 0.5), wd.y * sp, rr(2, 3.2), [0.36, 0.31, 0.24, 0.32], [0.34, 0.3, 0.25, 0], rr(0.8, 1.4), rr(2.2, 3.4), -0.05, 0.2, 0);
  }
}
// 끊김 기록: 한 프레임이 60ms를 넘으면 어느 단계가 오래 걸렸는지 콘솔에 남긴다 (dbg.perfLog에 최근 30개)
const perfT = [], perfLog = [], perfStart = performance.now();
let perfLast = 0;
function perfMark(name) { const t = performance.now(); perfT.push([name, t - perfLast]); perfLast = t; }
function perfFrame(frameMs, renderMs, progs) {
  if (frameMs < 60 || frameMs > 5000 || performance.now() - perfStart < 3000) return;   // 창을 다시 연 직후와 시작 3초는 빼고
  const top = perfT.filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, t]) => `${n} ${t.toFixed(1)}`).join(', ');
  const e = { at: U.uTime.value.toFixed(1), frame: Math.round(frameMs), render: renderMs.toFixed(1), newShaders: progs, top };
  perfLog.push(e); if (perfLog.length > 30) perfLog.shift();
  console.warn(`[끊김] ${e.frame}ms · 그리기 ${e.render}ms${progs ? ` · 새 셰이더 ${progs}개 컴파일` : ''} · 오래 걸린 단계: ${top || '없음'}`);
}
