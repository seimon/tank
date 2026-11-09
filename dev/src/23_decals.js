// ---------------------------------------------------------------- 데칼: 내 탱크 포탑 좌우에 붙이는 그림 (타이틀에서 A/D로 셋을 고른다. 위장색 × 데칼 셋)
// 셋은 decals.js(window.DECAL_SETS), 그림은 decal_images.js(window.DECAL_IMAGES = images/decals/*.png를 build.py가 담은 것).
// file://로 열면 PNG 파일을 WebGL 텍스처로 못 올리므로 그림을 JS 안에 담아 쓴다. 고치는 법: PNG를 고치고 python tools/build.py
// 데칼 한 장 = { img, side(1 = 왼쪽 +x, -1 = 오른쪽), z(앞뒤, 포탑 가운데 0, 앞 +), y(높이, 옆면 가운데 0), rot(°), s(세로 크기 m. 가로는 그림 비율대로) }
const DECAL_IMG = window.DECAL_IMAGES || {};
const DECAL_NAMES = Object.keys(DECAL_IMG).sort();
const DECAL_SETS = (Array.isArray(window.DECAL_SETS) && window.DECAL_SETS.length ? window.DECAL_SETS : [{ name: 'NONE', decals: [] }])
  .map((s) => ({ name: String(s.name || 'SET'), decals: (s.decals || []).map((d) => ({ img: d.img, side: d.side < 0 ? -1 : 1, z: +d.z || 0, y: +d.y || 0, rot: +d.rot || 0, s: +d.s || 0.6 })) }));
let decalIdx = 0;
try { decalIdx = Math.max(0, DECAL_SETS.findIndex((s) => s.name === localStorage.getItem('MightyMolly.decalSet'))); } catch (_) {}   // 이름으로 기억
const decalTexs = new Map(), tankDecalMats = new Map();
function decalTex(name) {
  if (!decalTexs.has(name)) {
    const img = new Image(), t = new THREE.Texture(img);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    img.onload = () => { t.needsUpdate = true; t.userData.aspect = img.naturalWidth / Math.max(1, img.naturalHeight); for (const m of decalGroup.children) if (m.userData.decal && m.userData.decal.img === name) decalPose(m.userData.decal, m); try { uiDirty(); } catch (_) {} };   // 직사각형 그림이면 비율대로 다시 놓는다   // (편집 창 그림 목록도 다시 그린다. 로딩 중이면 아직 없다)
    img.src = DECAL_IMG[name] || '';
    decalTexs.set(name, t);
  }
  return decalTexs.get(name);
}
function tankDecalMat(name) {   // 그림마다 재질 하나 (탱크처럼 스내핑 없이: 포탑과 같이 움직여야 떨리지 않는다)
  if (!tankDecalMats.has(name)) {
    const was = PS1_NOSNAP; PS1_NOSNAP = true;
    tankDecalMats.set(name, lambert({ map: decalTex(name), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    PS1_NOSNAP = was;
  }
  return tankDecalMats.get(name);
}
// 포탑 옆면: buildTank의 포탑 상자 (폭 2.3, 높이 1.4, 깊이 1.8, 윗면 폭 75%) → 옆면은 위로 갈수록 안쪽으로 기운다
const TUR = { y: DECK_TOP + 0.7, hw0: 1.15, hw1: 1.15 * 0.75, h: 1.4, d: 1.8 };
const TUR_K = (TUR.hw0 - TUR.hw1) / TUR.h, TUR_A = Math.atan(TUR_K);
const DECAL_GEO = new THREE.PlaneGeometry(1, 1);
const _dm = new THREE.Matrix4(), _dcQ = new THREE.Quaternion(), _dzA = new THREE.Vector3(0, 0, 1), _dr = new THREE.Vector3(), _du = new THREE.Vector3(), _dn = new THREE.Vector3();
// 데칼 한 장을 옆면에 맞춰 놓는다 (면에서 1.5cm 띄워 겹쳐 깜빡이지 않게. 판의 +z = 바깥, +y = 옆면 위쪽)
function decalPose(d, o) {
  const sd = d.side < 0 ? -1 : 1, yy = TUR.y + d.y, x = TUR.hw0 - (yy - (TUR.y - TUR.h / 2)) * TUR_K + 0.015;
  o.position.set(sd * x, yy, d.z);
  _dn.set(sd * Math.cos(TUR_A), Math.sin(TUR_A), 0); _du.set(-sd * Math.sin(TUR_A), Math.cos(TUR_A), 0); _dr.set(0, 0, -sd);
  o.quaternion.setFromRotationMatrix(_dm.makeBasis(_dr, _du, _dn)).multiply(_dcQ.setFromAxisAngle(_dzA, d.rot * DEG));
  o.scale.set(d.s * ((decalTexs.get(d.img) || { userData: {} }).userData.aspect || 1), d.s, 1);   // s = 세로 크기, 가로는 그림 비율대로
}
const decalGroup = new THREE.Group();
parts.turret.add(decalGroup);
function addDecalMesh(d) {
  if (!DECAL_IMG[d.img]) return null;
  const m = new THREE.Mesh(DECAL_GEO, tankDecalMat(d.img));
  m.userData.noOutline = true; m.userData.decal = d;
  decalPose(d, m); decalGroup.add(m);
  return m;
}
function applyDecals() {
  for (const m of decalGroup.children.slice()) decalGroup.remove(m);
  for (const d of (DECAL_SETS[decalIdx] || { decals: [] }).decals) addDecalMesh(d);
}
function setDecalSet(i) {
  decalIdx = (i + DECAL_SETS.length) % DECAL_SETS.length;
  try { localStorage.setItem('MightyMolly.decalSet', DECAL_SETS[decalIdx].name); } catch (_) {}
  applyDecals();
}
applyDecals();
for (const n of DECAL_NAMES) { const w = new THREE.Mesh(DECAL_GEO, tankDecalMat(n)); w.visible = false; w.userData.noOutline = true; parts.turret.add(w); }   // 셰이더·텍스처 미리 준비용 (보이지 않음)
