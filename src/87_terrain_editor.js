// @dev-file (배포판 index.html에서는 빠진다: tools/build.py)
// ---------------------------------------------------------------- 지형 편집 모드 (설정 메뉴 '지형 편집 모드'): 높낮이·풀·도로·절벽을 붓으로 칠하고, 시냇물 줄기를 손잡이로 옮긴다.
// 맵 편집 모드 위에서 돈다 (editMode도 켜짐: 적 없음·AI 정지·탱크 조작 막힘, WASD·QE 카메라는 85_editor.js의 editUpdate 그대로).
// 고친 값은 TD(10_world.js)에 바로 쓰고, 땅 모양·도로·절벽은 지형 메시를 바로 고쳐 보인다(terrRefresh). 풀·시냇물·다리·물체 높이·옆 단면은
// 로딩 때 만드는 것이라 Enter(적용)로 초안을 브라우저에 저장하고 다시 읽어야 바뀐다 (다시 읽으면 지형 편집 모드로 돌아온다).
// 끝나면 R로 terrain.js 내용을 복사해 붙여 넣는다 (같은 내용이면 초안은 다음에 읽을 때 저절로 버린다)
let terrMode = false, terrTool = 0, terrMsg = '', terrMsgT = 0, terrDirty = false;
const TB = { r: 6, blur: 0.5, k: 1 };   // 붓: 반경(m), 경계 흐림(0~1, 반경 바깥쪽 몇 %가 흐린가), 세기
const TERR_TOOLS = [
  { name: '올리기', kind: 'h', dir: 1 }, { name: '내리기', kind: 'h', dir: -1 }, { name: '평탄화', kind: 'flat' }, { name: '부드럽게', kind: 'smooth' },
  { name: '풀 없음', kind: 'grass', v: 1 }, { name: '풀 있음', kind: 'grass', v: 2 }, { name: '도로', kind: 'road' },
  { name: '절벽으로', kind: 'cliff', v: 1 }, { name: '절벽 아님', kind: 'cliff', v: 2 }, { name: '시냇물 줄기', kind: 'creek' },
];
const TERR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const TERR_RESUME = 'MightyMolly.terrResume';
const TH_MIN = BOTTOM + 0.6, TH_MAX = 80;   // 땅 높이 범위 (옆 단면 바닥보다 위)
function terrNote(t) { terrMsg = t; terrMsgT = 2.5; uiDirty(); }
const terrBtn = $el('terrEditBtn');
let terrGrassVis = null, terrMouseBtns = null;
function setTerrMode(on) {
  if (on === terrMode) return;
  if (!on) { terrOff(); setEditMode(false); return; }
  if (!editMode) setEditMode(true);
  if (!editMode) { console.log('[지형 편집] 플레이 화면에서만 켤 수 있어요'); return; }
  terrMode = true;
  editSelect(null);
  uiShow(terrUI);
  TERR.edit.value = terrView ? 1 : 0;
  terrGrassVis = grassCard.map((cm) => cm.visible); for (const cm of grassCard) cm.visible = false;   // 풀은 땅을 따라오지 않으니 숨긴다 (적용하면 새로 심는다)
  terrMouseBtns = { ...controls.mouseButtons };
  controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };   // 왼쪽 = 붓, 오른쪽 끌기 = 카메라 돌리기
  controls.enableRotate = true; controls.enableZoom = true;
  scene.add(terrRing, terrCreekGrp); terrCreekBuild();
  terrBtn.textContent = '지형 편집 모드 끝내기';
}
function terrOff() {   // 지형 편집만 끝낸다 (맵 편집 모드는 부르는 쪽이)
  if (!terrMode) return;
  terrStrokeEnd(); terrMode = false; terrDown = null; terrCreekDrag = -1;
  TERR.edit.value = 0;
  if (terrGrassVis) grassCard.forEach((cm, i) => { cm.visible = terrGrassVis[i]; });
  if (terrMouseBtns) controls.mouseButtons = terrMouseBtns;
  camLimits();
  scene.remove(terrRing, terrCreekGrp);
  if (UI.screen === terrUI) uiShow(null);
  terrBtn.textContent = '지형 편집 모드';
}
terrBtn.onclick = (e) => { setTerrMode(!terrMode); e.target.blur(); };
let terrView = true;   // 칠한 곳 색으로 보기 (V)

// ---- 마우스가 가리키는 땅: 화면 광선을 따라 땅 밑으로 들어가는 곳 (heightAt로 걷고 반으로 좁힌다)
const _tR = new THREE.Raycaster(), terrHit = new THREE.Vector3();
let terrMouse = null, terrHitOk = false;
function terrRay(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect(), cp = crtPoint(cx, cy);
  _tR.setFromCamera({ x: (cp.x - r.left) / r.width * 2 - 1, y: -((cp.y - r.top) / r.height) * 2 + 1 }, camera);
  return _tR.ray;
}
function terrPick(cx, cy, out) {
  const { origin: o, direction: d } = terrRay(cx, cy);
  let t = 0, pt = 0;
  for (let k = 0; k < 1500 && t < 600; k++) {
    pt = t; t += Math.max(0.25, t * 0.01);
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) continue;
    if (o.y + d.y * t < heightAt(x, z)) {
      for (let j = 0; j < 8; j++) { const m = (pt + t) / 2, mx = o.x + d.x * m, mz = o.z + d.z * m; if (o.y + d.y * m < heightAt(mx, mz)) t = m; else pt = m; }
      out.set(o.x + d.x * t, 0, o.z + d.z * t); out.y = heightAt(out.x, out.z);
      return inBoard(out.x, out.z, -1);
    }
  }
  return false;
}

// ---- 붓 둘레 표시: 바깥(반경) · 안쪽(흐림이 시작하는 곳) 두 고리, 땅을 따라
const TRING_SEG = 48;
const terrRing = new THREE.Group();
for (const col of [0xffffff, 0xffd25a]) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRING_SEG * 3), 3));
  const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, depthTest: false, fog: false, transparent: true }));
  l.frustumCulled = false; l.renderOrder = 999; l.userData.noOutline = true; terrRing.add(l);
}
function terrRingSync() {
  const T = TERR_TOOLS[terrTool];
  terrRing.visible = terrHitOk && T.kind !== 'creek';
  if (!terrRing.visible) return;
  [TB.r, TB.r * (1 - TB.blur)].forEach((R, n) => {
    const a = terrRing.children[n].geometry.attributes.position;
    terrRing.children[n].visible = R > 0.05;
    for (let k = 0; k < TRING_SEG; k++) {
      const t = k / TRING_SEG * Math.PI * 2, x = terrHit.x + Math.cos(t) * R, z = terrHit.z + Math.sin(t) * R;
      a.setXYZ(k, x, heightAt(x, z) + 0.15, z);
    }
    a.needsUpdate = true;
  });
}

// ---- 되돌리기: 붓 한 번(누르고 뗄 때까지)마다 건드린 16×16 칸 묶음만 원래 값을 보관한다
const TTL = 16, TTN = Math.ceil(N / TTL), terrUndo = [], terrRedo = [];
let terrStroke = null;   // { tiles: Map(칸 묶음 → 보관한 값), creek }
function tileSave(k) {
  const tx = k % TTN, tz = (k / TTN) | 0, o = { k, h: new Float32Array(TTL * TTL), d: new Float32Array(TTL * TTL), g: new Uint8Array(TTL * TTL), c: new Uint8Array(TTL * TTL), r: new Uint8Array(TTL * TTL) };
  for (let j = 0; j < TTL; j++) for (let i = 0; i < TTL; i++) {
    const ix = tx * TTL + i, iz = tz * TTL + j;
    if (ix >= N || iz >= N) continue;
    const g = iz * N + ix, q = j * TTL + i;
    o.h[q] = hG[g]; o.d[q] = TD.h[g]; o.g[q] = TD.grass[g]; o.c[q] = TD.cliff[g]; o.r[q] = TD.road[g];
  }
  return o;
}
function tileLoad(o) {
  const tx = o.k % TTN, tz = (o.k / TTN) | 0;
  for (let j = 0; j < TTL; j++) for (let i = 0; i < TTL; i++) {
    const ix = tx * TTL + i, iz = tz * TTL + j;
    if (ix >= N || iz >= N) continue;
    const g = iz * N + ix, q = j * TTL + i;
    hG[g] = o.h[q]; TD.h[g] = o.d[q]; TD.grass[g] = o.g[q]; TD.cliff[g] = o.c[q]; TD.road[g] = o.r[q];
  }
  terrRefresh(tx * TTL - 1, tz * TTL - 1, tx * TTL + TTL, tz * TTL + TTL);
}
function terrTouch(g) {
  const k = (((g / N) | 0) / TTL | 0) * TTN + ((g % N) / TTL | 0);
  if (!terrStroke.tiles.has(k)) terrStroke.tiles.set(k, tileSave(k));
}
function terrStrokeEnd() {
  if (!terrStroke) return;
  const s = terrStroke; terrStroke = null;
  if (!s.tiles.size && !s.creek) return;
  terrUndo.push(s); if (terrUndo.length > 60) terrUndo.shift();
  terrRedo.length = 0; terrDirty = true;
  TERR.geo.computeBoundingSphere();
  terrSaveDraft(); uiDirty();
}
function terrUndoStep(from, to, what) {
  terrStrokeEnd();
  const s = from.pop();
  if (!s) { terrNote(`${what}할 것이 없어요`); return; }
  const back = { tiles: new Map(), creek: s.creek ? { dz: TD.dz.slice(), w: TD.w.slice() } : null };
  for (const k of s.tiles.keys()) back.tiles.set(k, tileSave(k));
  for (const o of s.tiles.values()) tileLoad(o);
  if (s.creek) { TD.dz.set(s.creek.dz); TD.w.set(s.creek.w); terrCreekBuild(); }
  to.push(back); terrDirty = true; terrSaveDraft();
  terrNote(what === '되돌리기' ? '되돌렸어요' : '다시 했어요');
}

// ---- 붓 칠하기 (누르고 있는 동안 매 프레임)
let terrDown = null;   // { erase, flatY }
const terrRect = { x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9 };
function terrSetH(g, h) {
  h = Math.max(TH_MIN, Math.min(TH_MAX, h));
  TD.h[g] += h - hG[g]; hG[g] = h;
}
function terrBrush(dt) {
  const T = TERR_TOOLS[terrTool], R = TB.r, R0 = R * (1 - TB.blur), er = terrDown.erase;
  const ix0 = Math.max(1, Math.floor((terrHit.x - R + HALF) / STEP)), ix1 = Math.min(N - 2, Math.ceil((terrHit.x + R + HALF) / STEP));
  const iz0 = Math.max(1, Math.floor((terrHit.z - R + HALF) / STEP)), iz1 = Math.min(N - 2, Math.ceil((terrHit.z + R + HALF) / STEP));
  const rate = 3 * TB.k * dt;   // 올리기·내리기: 초당 3m × 세기 (붓 가운데)
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const x = -HALF + ix * STEP, z = -HALF + iz * STEP, d = Math.hypot(x - terrHit.x, z - terrHit.z);
    if (d > R) continue;
    const w = d <= R0 ? 1 : 1 - smooth(R0, R, d), g = iz * N + ix;
    if (w <= 0) continue;
    terrTouch(g);
    if (T.kind === 'h') terrSetH(g, hG[g] + T.dir * (er ? -1 : 1) * w * rate);
    else if (T.kind === 'flat') terrSetH(g, hG[g] + (terrDown.flatY - hG[g]) * Math.min(1, w * 6 * TB.k * dt));
    else if (T.kind === 'smooth') { const a = (hG[g - 1] + hG[g + 1] + hG[g - N] + hG[g + N]) / 4; terrSetH(g, hG[g] + (a - hG[g]) * Math.min(1, w * 10 * TB.k * dt)); }
    else if (T.kind === 'grass') { if (w >= 0.5) TD.grass[g] = er ? 0 : T.v; }
    else if (T.kind === 'cliff') { if (w >= 0.5) TD.cliff[g] = er ? 0 : T.v; }
    else if (T.kind === 'road') TD.road[g] = Math.max(0, Math.min(255, Math.round(TD.road[g] + (er ? -1 : 1) * w * 600 * TB.k * dt)));
  }
  terrRefresh(ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1);
}
// 격자 [ix0..ix1]×[iz0..iz1]의 땅 메시를 TD·hG에 맞춰 다시 (높이·색·도로·절벽·물 깊이·칠 표시). 법선은 프레임마다 한 번 (terrUpdate)
let terrNormals = false;
const _tc = new THREE.Color();
function terrRefresh(ix0, iz0, ix1, iz1) {
  ix0 = Math.max(0, ix0); iz0 = Math.max(0, iz0); ix1 = Math.min(N - 1, ix1); iz1 = Math.min(N - 1, iz1);
  const A = TERR.geo.attributes, P = A.position, C = A.color, Rd = A.aRoad, K = A.aCreek, L = A.aCliff, E = A.aPaint;
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const g = iz * N + ix;
    roadDV[g] = roadVisAt(g);
  }
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const g = iz * N + ix, p = TD.cliff[g], raw = cliffRawAt(g);
    cliffG[g] = p === 1 ? raw : p === 2 ? 0 : cliffKeep[g] ? raw : 0;   // 자동: 처음 읽을 때 절벽으로 남은 덩어리만 (새 덩어리 판정은 적용하면)
    const v = TERR.vid[g];
    if (v < 0) continue;
    const x = -HALF + ix * STEP, z = -HALF + iz * STEP, cd = creekD[g];
    P.setY(v, hG[g]); L.setX(v, cliffG[g]);
    Rd.setX(v, cd < CREEK_HW + 1.2 ? 99 : roadDV[g]);
    K.setY(v, cd < CREEK_HW + 2 ? Math.max(0, waterY[g] - hG[g]) : 0);
    TERR.color(_tc, x, z, TERR.noise[g], roadDV[g], cd); C.setXYZ(v, _tc.r, _tc.g, _tc.b);
    E.setXY(v, TERR.paintG(g), TERR.paintC(g));
  }
  for (const a of [P, C, Rd, K, L, E]) a.needsUpdate = true;
  terrNormals = true;
}

// ---- 시냇물 줄기: x 방향 10m마다 손잡이 (가운데 줄 + 양쪽 둑 선). 손잡이를 끌어 z를, [ ]로 그 자리 폭을 바꾼다
const terrCreekGrp = new THREE.Group(), terrKnots = [];
let terrCreekSel = -1, terrCreekHot = -1, terrCreekDrag = -1;
const tKnotGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const tKnotMat = [0xffffff, 0xffd25a, 0x7fe8ff].map((c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, fog: false, transparent: true }));
const TCL_N = 171;   // 줄 점 수 (x -85~85, 1m)
const tLines = [0xffffff, 0x7fe8ff, 0x7fe8ff].map((c) => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TCL_N * 3), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthTest: false, fog: false, transparent: true }));
  l.frustumCulled = false; l.renderOrder = 998; l.userData.noOutline = true; terrCreekGrp.add(l); return l;
});
for (let k = 0; k < TD_CREEK_N; k++) { const m = new THREE.Mesh(tKnotGeo, tKnotMat[0]); m.renderOrder = 999; m.frustumCulled = false; m.userData.noOutline = true; terrKnots.push(m); terrCreekGrp.add(m); }
const knotX = (k) => TD_CREEK_X0 + k * TD_CREEK_STEP;
const creekNowZ = (x) => creekZ0(x) + tdCurve(TD.dz, x);
function terrCreekBuild() {
  const on = TERR_TOOLS[terrTool].kind === 'creek';
  terrCreekGrp.visible = on;
  if (!on) return;
  for (let n = 0; n < TCL_N; n++) {
    const x = -85 + n, z = creekNowZ(x), hw = creekW(x);
    [0, -1, 1].forEach((s, li) => { const zz = z + s * hw; tLines[li].geometry.attributes.position.setXYZ(n, x, heightAt(x, zz) + 0.3, zz); });
  }
  for (const l of tLines) l.geometry.attributes.position.needsUpdate = true;
  terrKnots.forEach((m, k) => {
    const x = knotX(k), z = creekNowZ(x);
    m.visible = Math.abs(x) < BOARD_R;
    m.position.set(x, heightAt(x, z) + 0.6, z);
    m.material = tKnotMat[k === terrCreekDrag || k === terrCreekSel ? 1 : k === terrCreekHot ? 2 : 0];
  });
}
const _tv = new THREE.Vector3();
function terrKnotAt(cx, cy) {   // 화면에서 마우스와 가장 가까운 손잡이 (20px 안)
  const r = renderer.domElement.getBoundingClientRect(), cp = crtPoint(cx, cy);
  let best = -1, bd = 20;
  terrKnots.forEach((m, k) => {
    if (!m.visible) return;
    _tv.copy(m.position).project(camera);
    if (_tv.z > 1) return;
    const d = Math.hypot((_tv.x + 1) / 2 * r.width + r.left - cp.x, (1 - _tv.y) / 2 * r.height + r.top - cp.y);
    if (d < bd) { bd = d; best = k; }
  });
  return best;
}
const _tPl = new THREE.Plane(), _tPt = new THREE.Vector3();
function terrCreekMove(cx, cy) {
  const k = terrCreekDrag, x = knotX(k), m = terrKnots[k];
  _tPl.set(UP, -m.position.y);
  if (!terrRay(cx, cy).intersectPlane(_tPl, _tPt)) return;
  TD.dz[k] = Math.max(-18, Math.min(18, Math.round((_tPt.z - creekZ0(x)) * 10) / 10));
  terrCreekBuild(); uiDirty();
}
function terrCreekWidth(f) {
  const k = terrCreekSel >= 0 ? terrCreekSel : terrCreekHot;
  if (k < 0) { terrNote('폭을 바꿀 손잡이를 먼저 고르세요'); return; }
  terrStroke = { tiles: new Map(), creek: { dz: TD.dz.slice(), w: TD.w.slice() } };
  TD.w[k] = Math.max(0.4, Math.min(2.5, Math.round(TD.w[k] * f * 100) / 100));
  terrStrokeEnd(); terrCreekBuild();
}

// ---- 저장: 초안(localStorage) · terrain.js 글
function terrData() {
  const hc = new Int16Array(N * N);
  for (let i = 0; i < N * N; i++) hc[i] = Math.max(-32767, Math.min(32767, Math.round(TD.h[i] * 100)));
  const r2 = (v) => Math.round(v * 100) / 100;
  return { v: 1, h: tdPack(hc), grass: tdPack(TD.grass), cliff: tdPack(TD.cliff), road: tdPack(TD.road),
    creek: { x0: TD_CREEK_X0, step: TD_CREEK_STEP, dz: Array.from(TD.dz, r2), w: Array.from(TD.w, r2) } };
}
function terrSaveDraft() {
  try { localStorage.setItem(TD_KEY, JSON.stringify(terrData())); }
  catch (e) { terrNote('초안을 저장하지 못했어요 (브라우저 저장 공간)'); console.warn('[지형 편집]', e); }
}
function terrFileText() {
  const d = terrData();
  return `// 지형 고친 값: 지형 편집 모드(개발판 dev.html의 설정 메뉴 ~ → '지형 편집 모드')에서 고친 뒤 R을 누르면 이 파일 내용 전체가 복사된다. 그대로 덮어 붙여 넣으면 된다.
// 코드가 만드는 지형 위에 고친 만큼만 겹친다 (10_world.js의 TD). 0.5m 격자마다:
//   h = 높이 차이(cm) · grass = 풀(0 자동·1 없음·2 있음) · cliff = 절벽(0 자동·1 절벽으로·2 아님) · road = 도로 칠(0~255)   (줄인 정수 배열을 base64로)
//   creek = 시냇물 줄기: x0부터 step m마다 손잡이, dz = z 어긋남(m), w = 폭 배율
// window.TERRAIN_DATA를 지우면(또는 이 파일이 없으면) 고치기 전 지형 그대로
window.TERRAIN_DATA = {
  v: ${d.v},
  h: '${d.h}',
  grass: '${d.grass}',
  cliff: '${d.cliff}',
  road: '${d.road}',
  creek: { x0: ${d.creek.x0}, step: ${d.creek.step}, dz: [${d.creek.dz.join(', ')}], w: [${d.creek.w.join(', ')}] },
};
`;
}
function terrApply() {   // 초안을 저장하고 다시 읽는다 (지형 편집 모드·카메라·붓 그대로 돌아온다)
  terrStrokeEnd(); terrSaveDraft();
  try {
    sessionStorage.setItem('MightyMolly.skipTitle', '1');
    sessionStorage.setItem(TERR_RESUME, JSON.stringify({ tool: terrTool, r: TB.r, blur: TB.blur, k: TB.k, view: terrView, cam: [...camera.position.toArray(), ...controls.target.toArray()] }));
  } catch (_) {}
  location.reload();
}
function terrDiscard() {
  if (!confirm('지형 편집 초안(브라우저에 저장된 것)을 버리고 terrain.js 그대로 다시 읽을까요?')) return;
  try { localStorage.removeItem(TD_KEY); sessionStorage.setItem('MightyMolly.skipTitle', '1'); sessionStorage.setItem(TERR_RESUME, JSON.stringify({ tool: terrTool, r: TB.r, blur: TB.blur, k: TB.k, view: terrView, cam: [...camera.position.toArray(), ...controls.target.toArray()] })); } catch (_) {}
  location.reload();
}
// 다시 읽은 뒤: 플레이 화면이 되면 지형 편집 모드로 돌아온다
{
  let rs = null;
  try { rs = JSON.parse(sessionStorage.getItem(TERR_RESUME) || 'null'); sessionStorage.removeItem(TERR_RESUME); } catch (_) {}
  if (rs) {
    const iv = setInterval(() => {
      if (titleState !== 'play' || $el('loading')) return;
      clearInterval(iv);
      terrTool = rs.tool | 0; Object.assign(TB, { r: rs.r ?? TB.r, blur: rs.blur ?? TB.blur, k: rs.k ?? TB.k }); terrView = rs.view ?? true;
      setTerrMode(true);
      if (rs.cam?.length === 6) { camera.position.fromArray(rs.cam, 0); controls.target.fromArray(rs.cam, 3); controls.update(); }
      terrNote(TD.draft ? '초안을 적용했어요' : 'terrain.js 그대로예요');
    }, 200);
  }
}

// ---- 입력: 키 (85_editor.js가 넘겨준다), Ctrl 조합은 따로
function terrKey(e) {
  if (/^Digit\d$/.test(e.code)) { terrSetTool(TERR_KEYS.indexOf(e.code.slice(5))); return; }
  const creek = TERR_TOOLS[terrTool].kind === 'creek';
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const up = e.code === 'BracketRight';
    if (creek) terrCreekWidth(up ? 1.1 : 1 / 1.1);
    else { TB.r = Math.max(0.5, Math.min(40, Math.round(TB.r * (up ? 1.15 : 1 / 1.15) * 10) / 10)); uiDirty(); }
    return;
  }
  if (e.code === 'Semicolon' || e.code === 'Quote') { TB.blur = Math.max(0, Math.min(1, Math.round((TB.blur + (e.code === 'Quote' ? 0.1 : -0.1)) * 10) / 10)); uiDirty(); return; }
  if (e.code === 'Minus' || e.code === 'Equal') { TB.k = Math.max(0.1, Math.min(5, Math.round(TB.k * (e.code === 'Equal' ? 1.25 : 0.8) * 100) / 100)); uiDirty(); return; }
  if (e.code === 'KeyV') { terrView = !terrView; TERR.edit.value = terrView ? 1 : 0; terrNote(terrView ? '칠한 곳 보기 켜짐' : '칠한 곳 보기 꺼짐'); return; }
  if (e.code === 'KeyR') { copyText(terrFileText(), 'terrain.js 전체'); return; }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { terrApply(); return; }
  if (e.code === 'KeyX') { terrDiscard(); return; }
  if (e.code === 'Escape') { if (creek && terrCreekSel >= 0) { terrCreekSel = -1; terrCreekBuild(); uiDirty(); } else setTerrMode(false); }
}
function terrSetTool(i) {
  if (!TERR_TOOLS[i]) return;
  terrStrokeEnd(); terrTool = i; terrCreekSel = -1; terrCreekBuild(); uiDirty();
}
addEventListener('keydown', (e) => {
  if (!terrMode || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.code === 'KeyZ' && !e.shiftKey) terrUndoStep(terrUndo, terrRedo, '되돌리기');
  else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) terrUndoStep(terrRedo, terrUndo, '다시 하기');
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
// 마우스: 왼쪽 누르고 있는 동안 칠하기 (시냇물 줄기 도구면 손잡이 끌기). 오른쪽 끌기·휠은 OrbitControls (카메라)
addEventListener('pointermove', (e) => { if (terrMode) terrMouse = { x: e.clientX, y: e.clientY }; }, true);
addEventListener('pointerdown', (e) => {
  if (!terrMode || e.button !== 0 || e.target !== renderer.domElement) return;
  terrMouse = { x: e.clientX, y: e.clientY };
  if (TERR_TOOLS[terrTool].kind === 'creek') {
    const k = terrKnotAt(e.clientX, e.clientY);
    terrCreekSel = k; terrCreekDrag = k;
    if (k >= 0) terrStroke = { tiles: new Map(), creek: { dz: TD.dz.slice(), w: TD.w.slice() } };
    terrCreekBuild(); uiDirty();
    return;
  }
  if (!terrPick(e.clientX, e.clientY, terrHit)) return;
  terrHitOk = true;
  terrStroke = { tiles: new Map(), creek: null };
  terrDown = { erase: e.shiftKey, flatY: terrHit.y };
}, true);
addEventListener('pointerup', (e) => {
  if (!terrMode || e.button !== 0) return;
  if (terrCreekDrag >= 0) { terrCreekDrag = -1; terrCreekBuild(); }
  terrDown = null; terrStrokeEnd();
}, true);
addEventListener('blur', () => { if (terrMode) { terrDown = null; terrCreekDrag = -1; terrStrokeEnd(); } });

// ---- 매 프레임 (editUpdate가 부른다)
function terrUpdate(dt) {
  if (terrMsgT > 0 && (terrMsgT -= dt) <= 0) { terrMsg = ''; uiDirty(); }
  const creek = TERR_TOOLS[terrTool].kind === 'creek';
  if (terrMouse) {
    if (creek) {
      if (terrCreekDrag >= 0) terrCreekMove(terrMouse.x, terrMouse.y);
      else { const h = terrKnotAt(terrMouse.x, terrMouse.y); if (h !== terrCreekHot) { terrCreekHot = h; terrCreekBuild(); uiDirty(); } }
      terrHitOk = false;
    } else terrHitOk = terrPick(terrMouse.x, terrMouse.y, terrHit);
  }
  if (terrDown && terrHitOk && !creek) { if (terrDown.erase !== (editKeys.has('ShiftLeft') || editKeys.has('ShiftRight'))) terrDown.erase = !terrDown.erase; terrBrush(Math.min(dt, 0.05)); }
  if (terrNormals) { terrNormals = false; TERR.geo.computeVertexNormals(); }
  terrRingSync();
}

// ---- 화면: 오른쪽 위 도구 목록, 아래 붓 값·상태·조작키·알림
const terrUI = {
  passive: true,
  draw(ui) {
    const lw = Math.max(...TERR_TOOLS.map((t) => gfWidth(t.name))) + 26, x = ui.w - 6 - lw;
    let y = 6;
    ui.dim(x - 4, y - 3, lw + 8, 19 + TERR_TOOLS.length * GF_LINE, 0.55);
    ui.text('지형 편집 · 도구', x, y, HC.color); y += GF_LINE + 4;
    TERR_TOOLS.forEach((t, i) => {
      const hot = ui.hit('tool' + i, x - 4, y - 2, lw + 8, GF_LINE);
      const kw = ui.keyText(x, y, TERR_KEYS[i], HC.color);
      ui.text(t.name, x + kw + 6, y, i === terrTool ? '#ffd25a' : hot ? '#ffffff' : EDIT_C);
      y += GF_LINE;
    });
    const T = TERR_TOOLS[terrTool], creek = T.kind === 'creek';
    const help = creek
      ? [['좌클릭 끌기', '손잡이 옮기기'], ['[ ]', '고른 손잡이 폭'], ['우클릭 끌기', '카메라 돌리기'], ['W A S D', '카메라 옮기기'], ['Ctrl+Z', '되돌리기'], ['Enter', '적용'], ['R', 'terrain.js 복사'], ['Esc', '끝내기']]
      : [['좌클릭', '칠하기'], ['Shift', T.kind === 'h' ? '반대로' : '지우기'], ['우클릭 끌기', '카메라 돌리기'], ['W A S D', '카메라 옮기기'], ['[ ]', '반경'], ["; '", '흐림'], ['- =', '세기'], ['V', '칠 보기'], ['Ctrl+Z', '되돌리기'], ['Enter', '적용'], ['R', 'terrain.js 복사'], ['X', '초안 버리기'], ['Esc', '끝내기']];
    const itemW = ([k, l]) => gfWidth(k) + 4 + 4 + gfWidth(l), gap = 10, maxW = ui.w - 16, rows = [[]];
    let rw = 0;
    for (const h of help) { const w = itemW(h); if (rows[rows.length - 1].length && rw + gap + w > maxW) { rows.push([]); rw = 0; } rw += (rw ? gap : 0) + w; rows[rows.length - 1].push(h); }
    const ck = terrCreekSel >= 0 ? terrCreekSel : terrCreekHot;
    const info = creek
      ? (ck >= 0 ? `시냇물 손잡이 x ${knotX(ck)}   어긋남 ${TD.dz[ck].toFixed(1)}m   폭 ×${TD.w[ck].toFixed(2)}` : '시냇물 줄기: 손잡이를 고르세요')
      : `${T.name}   반경 ${TB.r.toFixed(1)}m   흐림 ${Math.round(TB.blur * 100)}%   세기 ${TB.k.toFixed(2)}`;
    const state = `${TD.draft || terrDirty ? '초안 (브라우저에 저장)' : 'terrain.js'}${terrDirty ? ' · 풀·물·다리·물체는 Enter(적용)하면 바뀌어요' : ''}`;
    const lines = rows.length + 2 + (terrMsg ? 1 : 0), y0 = ui.h - 6 - lines * GF_LINE;
    ui.dim(0, y0 - 4, ui.w, ui.h - y0 + 4, 0.55);
    let ly = y0;
    if (terrMsg) { ui.text(terrMsg, ui.w / 2, ly, '#ffd25a', 'center'); ly += GF_LINE; }
    ui.text(info, ui.w / 2, ly, '#ffffff', 'center'); ly += GF_LINE;
    ui.text(state, ui.w / 2, ly, terrDirty ? '#ffd25a' : EDIT_C, 'center'); ly += GF_LINE;
    for (const row of rows) {
      const w = row.reduce((n, h, i) => n + itemW(h) + (i ? gap : 0), 0);
      let hx = Math.round((ui.w - w) / 2);
      for (const [k, l] of row) { hx += ui.keyText(hx, ly, k, HC.color) + 4; hx = ui.text(l, hx, ly, EDIT_C) + gap; }
      ly += GF_LINE;
    }
  },
  click(id) { if (id.startsWith('tool')) terrSetTool(+id.slice(4)); },
};
Object.assign(DBG, { setTerrMode, terrData, terrFileText, TD, TB, terrTools: TERR_TOOLS, terr: () => ({ terrMode, terrTool, terrHit, terrHitOk }) });
