// ---------------------------------------------------------------- 맵 편집 모드 (설정 메뉴 '맵 편집 모드'): 나무 상자(소·대), 탱크 잔해, 벙커(멀쩡한·부서진), 드럼통, 모래주머니를 넣고 옮기고 지운다.
// 결과는 R로 복사해 map.js에 붙여 넣는다 (선택한 물체가 있으면 그 한 줄, 없으면 파일 전체).
// 편집하는 동안: 적은 모두 사라지고(나중에 다시 떨어진다) 증원·AI가 멈추고, 탱크는 움직이지 않는다. 카메라는 탱크를 따라가지 않는다
let editMode = false, editSel = null, editMsg = '', editMsgT = 0, editAiWas = false;
const editKeys = new Set();
const EDIT_ITEMS = [
  { name: '나무 상자 (소)', add: (x, z) => ({ kind: 'crate', o: addCrate(x, z, 0, 1.5) }) },
  { name: '나무 상자 (대)', add: (x, z) => ({ kind: 'crate', o: addCrate(x, z, 0, 2.2) }) },
  { name: '탱크 잔해', add: (x, z) => { const w = placeWreck(x, z, 0); wreckScorch(w); smokers.push({ x: w.x, y: w.y, z: w.z, t: 10, dur: Infinity, acc: 0, weak: true }); return { kind: 'wreck', o: w }; } },
  { name: '벙커', add: (x, z) => ({ kind: 'bunker', o: placeBunker(x, z, 0, false) }) },
  { name: '부서진 벙커', add: (x, z) => ({ kind: 'bunker', o: placeBunker(x, z, 0, true) }) },
  { name: '드럼통', add: (x, z) => ({ kind: 'crate', o: addCrate(x, z, 0, DRUM_S, true) }) },
  { name: '모래주머니', add: (x, z) => ({ kind: 'sandbag', o: placeSandbag(x, z, 0) }) },
];
const editName = (s) => !s ? '' : s.kind === 'crate' ? (s.o.drum ? '드럼통' : s.o.s >= 2 ? '나무 상자 (대)' : '나무 상자 (소)') : s.kind === 'wreck' ? '탱크 잔해' : s.kind === 'sandbag' ? '모래주머니' : s.o.ruin ? '부서진 벙커' : '벙커';
const editPos = (s) => s.kind === 'wreck' ? { x: s.o.x, z: s.o.z, rot: s.o.yaw } : { x: s.o.x, z: s.o.z, rot: s.o.rot };
function editNote(t) { editMsg = t; editMsgT = 2.5; uiDirty(); }
function setEditMode(on) {
  if (on === editMode || titleState !== 'play') return;
  editMode = on;
  if (on) {
    editAiWas = aiFrozen; setAiFrozen(true);   // 편집하는 동안 '적 AI 정지' 켜짐 (버튼에도 보이게)
    if (!missionDone) endMission();   // 작전 정보는 끝낸 것으로
    // 적을 모두 없앤다 (떨어지는 중·예약 포함). 없앤 적 탱크·자주포는 편집이 끝나면 다시 떨어진다 (클리어 수에 안 셈)
    let back = dropTimers.length + spgTimers.length;
    for (const E of ENEMIES.slice()) { if (!E.jeep) back++; removeEnemy(E); }
    dropTimers.length = 0; spgTimers.length = 0; jeepTimers.length = 0;
    enemyDrops = Math.max(0, enemyDrops - back);
    cancelOffer();
    uiShow(editUI);
  } else {
    editSelect(null); editKeys.clear();
    setAiFrozen(editAiWas);
    if (UI.screen === editUI) uiShow(null);
    resetCamera();
  }
  document.getElementById('mapEditBtn').textContent = editMode ? '맵 편집 모드 끝내기' : '맵 편집 모드';
}
document.getElementById('mapEditBtn').onclick = (e) => { setEditMode(!editMode); e.target.blur(); };
// 선택 표시: 그 물체만 한 번 더, 흰색으로 뒤집어 조금 크게 그린다 (테두리처럼 보인다)
const editOutMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, fog: false });
const editBoxGeo = new THREE.BoxGeometry(1, 1, 1), editDrumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 8);   // 선택 테두리: 상자 / 드럼통
let editOut = null;
function editSelect(s) {
  if (editOut) { scene.remove(editOut); editOut = null; }
  editSel = s && s.o ? s : null;
  if (editSel) {
    if (editSel.kind === 'crate') editOut = new THREE.Mesh(editSel.o.drum ? editDrumGeo : editBoxGeo, editOutMat);
    else {   // 그 물체의 메시들을 같은 모양(기하 공유)으로 흰색만 (복제하면 userData가 서로 물려 있어 안 된다)
      const src = editSel.o.group, inv = src.matrixWorld.clone().invert();
      src.updateMatrixWorld(true); editOut = new THREE.Group();
      src.traverse((o) => { if (o.isMesh) { const m = new THREE.Mesh(o.geometry, editOutMat); m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(inv, o.matrixWorld); editOut.add(m); } });
    }
    editOut.traverse((o) => { o.userData.noOutline = true; o.layers.set(0); });
    scene.add(editOut); editSync();
  }
  uiDirty();
}
function editSync() {
  if (!editOut || !editSel) return;
  const o = editSel.o;
  if (editSel.kind === 'crate') { editOut.position.set(o.x, o.y, o.z); editOut.rotation.set(0, o.rot, 0); editOut.scale.setScalar(o.s + 0.14); }
  else { editOut.position.copy(o.group.position); editOut.quaternion.copy(o.group.quaternion); editOut.scale.setScalar(1.05); }
}
function editMove(dx, dz, dr) {
  const s = editSel, p = editPos(s), q = { x: p.x + dx, z: p.z + dz };
  boardClamp(q, 3); dx = q.x - p.x; dz = q.z - p.z;   // 판 밖으로는 못 간다
  if (s.kind === 'crate') moveCrate(s.o, dx, dz, dr);
  else if (s.kind === 'wreck') moveWreck(s.o, dx, dz, dr);
  else if (s.kind === 'sandbag') { moveSandbag(s.o, dx, dz, dr); editSelect(s); }   // 땅에 맞춰 새로 만드니 선택 표시도 새로
  else moveBunker(s.o, dx, dz, dr);
  editSync(); uiDirty();
}
function editDelete() {
  const s = editSel;
  editSelect(null);
  if (s.kind === 'crate') deleteCrate(s.o); else if (s.kind === 'wreck') deleteWreck(s.o); else if (s.kind === 'sandbag') deleteSandbag(s.o); else deleteBunker(s.o);
  editNote(`${editName(s)} 지웠어요`);
}
function editAdd(i) {
  const s = EDIT_ITEMS[i].add(controls.target.x, controls.target.z);   // 화면 가운데에
  if (!s.o) { editNote('나무 상자·드럼통은 더 놓을 수 없어요'); return; }
  editSelect(s);
  editNote(`${EDIT_ITEMS[i].name} 추가`);
}
// ---- map.js 형식으로 복사
const n2 = (v) => Math.round(v * 100) / 100, n3 = (v) => Math.round(wrapPi(v) * 1000) / 1000;
function editLine(s) {
  const o = s.o;
  if (s.kind === 'crate') return o.drum ? `{ type: 'drum', x: ${n2(o.x)}, z: ${n2(o.z)}, rot: ${n3(o.rot)} },` : `{ type: 'crate', x: ${n2(o.x)}, z: ${n2(o.z)}, rot: ${n3(o.rot)}, s: ${n2(o.s)} },`;
  if (s.kind === 'sandbag') return `{ type: 'sandbag', x: ${n2(o.x)}, z: ${n2(o.z)}, rot: ${n3(o.rot)} },`;
  if (s.kind === 'wreck') return `{ type: 'wreck', x: ${n2(o.x)}, z: ${n2(o.z)}, rot: ${n3(o.yaw)} },`;
  return `{ type: '${o.ruin ? 'bunkerRuin' : 'bunker'}', x: ${n2(o.x)}, z: ${n2(o.z)}, rot: ${n3(o.rot)} },`;
}
function mapFileText() {
  const L = [
    ...crates.filter((c) => c.alive).sort((a, b) => a.y - b.y).map((o) => editLine({ kind: 'crate', o })),   // 아래 상자부터 (위 상자가 그 위에 얹히게). 드럼통도 여기
    ...SANDBAGS.map((o) => editLine({ kind: 'sandbag', o })),
    ...WRECKS.map((o) => editLine({ kind: 'wreck', o })),
    ...BUNKERS.map((o) => editLine({ kind: 'bunker', o })),
  ];
  return `// 지도 데이터: 나무 상자 · 드럼통 · 모래주머니 · 탱크 잔해 · 벙커의 자리.
// 게임의 설정 메뉴(~ 키) → '맵 편집 모드'에서 고친 뒤, 선택한 물체가 없을 때 R을 누르면 이 파일 내용 전체가 복사된다. 그대로 덮어 붙여 넣으면 된다.
//   type: crate(나무 상자, s = 한 변 m. 2 이상이면 큰 상자) · drum(드럼통) · sandbag(모래주머니) · wreck(탱크 잔해) · bunker(벙커) · bunkerRuin(부서진 벙커)
//   x·z: 위치 (m, 판 가운데가 0)   rot: 방향 (라디안)
//   나무 상자·드럼통은 적힌 순서대로 놓으며, 다른 상자와 겹치면 그 위에 얹힌다
// window.MAP_DATA를 지우면(또는 이 파일이 없으면) 나무 상자·잔해는 예전처럼 자동으로 놓고 벙커는 없다
window.MAP_DATA = {
  objects: [
${L.map((l) => '    ' + l).join('\n')}
  ],
};
`;
}
function copyText(t, what) {
  const fallback = () => {   // file://처럼 클립보드 기능이 막힌 곳: 숨긴 글상자를 골라 복사
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  };
  const done = (ok) => editNote(ok ? `${what} 복사했어요` : '복사하지 못했어요');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => done(true), () => done(fallback()));
  else done(fallback());
}
// ---- 입력: 편집 중에는 키를 모두 가로챈다 (설정 메뉴 \` 키·Ctrl 조합은 그대로)
addEventListener('keydown', (e) => {
  if (!editMode || e.code === 'Backquote' || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  editKeys.add(e.code);
  if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (EDIT_ITEMS[i]) editAdd(i); return; }
  if (e.code === 'Escape') { editSelect(null); return; }
  if (e.code === 'KeyR') { if (editSel) copyText(editLine(editSel), '한 줄'); else copyText(mapFileText(), 'map.js 전체'); return; }
  if (!editSel) return;   // 선택한 물체가 없으면 WASD·QE는 카메라 (editUpdate)
  if (e.code === 'Delete' || e.code === 'Backspace') { editDelete(); return; }
  const step = e.shiftKey ? 0.05 : 0.25, rstep = (e.shiftKey ? 1 : 15) * DEG;
  _eF.set(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z).normalize();   // 화면 위쪽 = 앞
  let dx = 0, dz = 0, dr = 0;
  if (e.code === 'KeyW') { dx += _eF.x * step; dz += _eF.z * step; }
  if (e.code === 'KeyS') { dx -= _eF.x * step; dz -= _eF.z * step; }
  if (e.code === 'KeyA') { dx += _eF.z * step; dz -= _eF.x * step; }
  if (e.code === 'KeyD') { dx -= _eF.z * step; dz += _eF.x * step; }
  if (e.code === 'KeyQ') dr += rstep;
  if (e.code === 'KeyE') dr -= rstep;
  if (dx || dz || dr) editMove(dx, dz, dr);
}, true);
addEventListener('keyup', (e) => editKeys.delete(e.code), true);
addEventListener('blur', () => editKeys.clear());
const _eF = new THREE.Vector3(), _eR = new THREE.Raycaster(), _eRay = new THREE.Ray(), _eB = new THREE.Box3(), _eV = new THREE.Vector3();
// 클릭(끌지 않고 누름)으로 고르기: 화면 광선이 물체 상자(회전 포함)에 닿는 것 중 가장 가까운 것. 빈 곳을 누르면 선택 해제
let editDown = null;
addEventListener('pointerdown', (e) => { if (editMode && e.target === renderer.domElement) editDown = { x: e.clientX, y: e.clientY }; }, true);
addEventListener('pointerup', (e) => {
  if (!editMode || !editDown || e.target !== renderer.domElement) { editDown = null; return; }
  const moved = Math.hypot(e.clientX - editDown.x, e.clientY - editDown.y); editDown = null;
  if (moved > 5) return;   // 끌었으면 카메라 돌리기
  const r = renderer.domElement.getBoundingClientRect();
  const cp = crtPoint(e.clientX, e.clientY);   // CRT 화면 휨을 되짚어서
  _eR.setFromCamera({ x: (cp.x - r.left) / r.width * 2 - 1, y: -((cp.y - r.top) / r.height) * 2 + 1 }, camera);
  let best = null, bd = Infinity;
  const test = (kind, o, cx, cy, cz, hx, hy, hz, rot) => {
    const C = Math.cos(rot), S = Math.sin(rot), q = _eR.ray.origin, d = _eR.ray.direction, ox = q.x - cx, oz = q.z - cz;
    _eRay.origin.set(ox * C - oz * S, q.y - cy, ox * S + oz * C); _eRay.direction.set(d.x * C - d.z * S, d.y, d.x * S + d.z * C);   // 물체 기준으로 (회전 풀기)
    _eB.min.set(-hx, -hy, -hz); _eB.max.set(hx, hy, hz);
    if (_eRay.intersectBox(_eB, _eV)) { const k = _eV.distanceTo(_eRay.origin); if (k < bd) { bd = k; best = { kind, o }; } }
  };
  for (const c of crates) if (c.alive) test('crate', c, c.x, c.y, c.z, c.s / 2, c.s / 2, c.s / 2, c.rot);
  for (const w of WRECKS) test('wreck', w, w.x, w.fp.y0 + 1.4, w.z, w.fp.hx, 1.5, w.fp.hz, w.yaw ?? 0);
  for (const B of BUNKERS) test('bunker', B, B.x, B.y + BK_H / 2, B.z, BK_A + 0.3, BK_H / 2 + 0.2, BK_A + 0.3, B.rot);
  for (const S of SANDBAGS) test('sandbag', S, S.fp.x, S.y + 0.7, S.fp.z, S.fp.hx, 0.9, S.fp.hz, S.rot);
  editSelect(best);
}, true);
// 매 프레임: 선택한 물체가 없으면 WASD로 카메라 옮기기, QE로 돌리기 (Shift면 느리게)
function editUpdate(dt) {
  if (editMsgT > 0 && (editMsgT -= dt) <= 0) { editMsg = ''; uiDirty(); }
  editSync();
  if (editSel) return;
  const sp = (editKeys.has('ShiftLeft') || editKeys.has('ShiftRight') ? 6 : 24) * dt;
  _eF.set(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z).normalize();
  let dx = 0, dz = 0;
  if (editKeys.has('KeyW')) { dx += _eF.x; dz += _eF.z; }
  if (editKeys.has('KeyS')) { dx -= _eF.x; dz -= _eF.z; }
  if (editKeys.has('KeyA')) { dx += _eF.z; dz -= _eF.x; }
  if (editKeys.has('KeyD')) { dx -= _eF.z; dz += _eF.x; }
  if (dx || dz) {
    const L = Math.hypot(dx, dz), q = { x: controls.target.x + dx / L * sp, z: controls.target.z + dz / L * sp };
    boardClamp(q, 2); const nx = q.x, nz = q.z;
    _eV.set(nx - controls.target.x, 0, nz - controls.target.z);
    controls.target.add(_eV); camera.position.add(_eV);
    controls.target.y = heightAt(controls.target.x, controls.target.z);
  }
  const rot = ((editKeys.has('KeyQ') ? 1 : 0) - (editKeys.has('KeyE') ? 1 : 0)) * 1.6 * dt * (sp < 1 ? 0.4 : 1);
  if (rot) { _eV.copy(camera.position).sub(controls.target).applyAxisAngle(UP, rot); camera.position.copy(controls.target).add(_eV); }
}
// ---- 화면: 오른쪽 위 추가할 물체 목록 (번호 / 누르면 추가), 아래 조작키 안내, 선택한 물체 정보, 알림
const EDIT_C = '#9c9c9c';
const editUI = {
  passive: true,
  draw(ui) {
    // 오른쪽 위: 목록
    const lw = Math.max(...EDIT_ITEMS.map((it) => gfWidth(it.name))) + 26, x = ui.w - 6 - lw;
    let y = 6;
    ui.dim(x - 4, y - 3, lw + 8, 19 + EDIT_ITEMS.length * GF_LINE, 0.55);
    ui.text('맵 편집 · 추가하기', x, y, HC.color); y += GF_LINE + 4;
    EDIT_ITEMS.forEach((it, i) => {
      const hot = ui.hit('add' + i, x - 4, y - 2, lw + 8, GF_LINE);
      const kw = ui.keyText(x, y, `${i + 1}`, HC.color);
      ui.text(it.name, x + kw + 6, y, hot ? '#ffffff' : EDIT_C);
      y += GF_LINE;
    });
    // 아래: 조작키 (선택했을 때 / 안 했을 때)
    const help = editSel
      ? [['W A S D', '옮기기'], ['Q E', '돌리기'], ['Shift', '잘게'], ['Del', '지우기'], ['R', '이 물체 한 줄 복사'], ['Esc', '선택 해제']]
      : [['클릭', '고르기'], ['W A S D', '카메라 옮기기'], ['Q E', '카메라 돌리기'], [`1~${EDIT_ITEMS.length}`, '추가'], ['R', 'map.js 전체 복사']];
    const itemW = ([k, l]) => gfWidth(k) + 4 + 4 + gfWidth(l), gap = 10, maxW = ui.w - 16, rows = [[]];
    let rw = 0;
    for (const h of help) { const w = itemW(h); if (rows[rows.length - 1].length && rw + gap + w > maxW) { rows.push([]); rw = 0; } rw += (rw ? gap : 0) + w; rows[rows.length - 1].push(h); }
    const info = editSel ? (() => { const p = editPos(editSel); return `${editName(editSel)}   x ${p.x.toFixed(2)}   z ${p.z.toFixed(2)}   ${Math.round(((wrapPi(p.rot) / DEG) + 360) % 360)}°`; })() : '선택한 물체 없음';
    const lines = rows.length + 1 + (editMsg ? 1 : 0), y0 = ui.h - 6 - lines * GF_LINE;
    ui.dim(0, y0 - 4, ui.w, ui.h - y0 + 4, 0.55);
    let ly = y0;
    if (editMsg) { ui.text(editMsg, ui.w / 2, ly, '#ffd25a', 'center'); ly += GF_LINE; }
    ui.text(info, ui.w / 2, ly, editSel ? '#ffffff' : EDIT_C, 'center'); ly += GF_LINE;
    for (const row of rows) {
      const w = row.reduce((n, h, i) => n + itemW(h) + (i ? gap : 0), 0);
      let hx = Math.round((ui.w - w) / 2);
      for (const [k, l] of row) { hx += ui.keyText(hx, ly, k, HC.color) + 4; hx = ui.text(l, hx, ly, EDIT_C) + gap; }
      ly += GF_LINE;
    }
  },
  click(id) { if (id.startsWith('add')) editAdd(+id.slice(3)); },
};
Object.assign(window.dbg, { mapFileText, setEditMode, editAdd, editMove, editSelect, BUNKERS, damageBunker, edit: () => ({ editMode, editSel }) });
