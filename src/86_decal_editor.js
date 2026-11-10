// ---------------------------------------------------------------- 데칼 편집 모드 (설정 메뉴 '데칼 편집 모드', 타이틀 화면에서만. 개발용)
// 배경을 모두 끄고 내 탱크만 남긴다. 카메라는 마우스로 돌린다. 오른쪽 위 목록에서 그림을 고르면 지금 보이는 포탑 옆면 가운데에 붙는다.
// 고른 데칼: WASD 옮기기 · QE 돌리기 · RF 크기 (Shift 잘게) · Del 지우기. 아무것도 안 골랐을 때: A/D 셋 바꾸기 · N 새 셋 · T 포탑 뒤집기 · C decals.js 복사
let decalMode = false, decalSel = null, decalFlip = false, decalMsg = '', decalMsgT = 0, decalBg = null;
const decalHidden = [];   // 편집하는 동안 숨긴 장면 물체와 원래 보임
const decalSelLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => new THREE.Vector3(x, y, 0.01))),
  new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, fog: false }));   // 고른 데칼 테두리 (깜빡인다)
decalSelLine.renderOrder = 7; decalSelLine.userData.noOutline = true;
function decalNote(t) { decalMsg = t; decalMsgT = 2.5; uiDirty(); }
const decalBtn = document.getElementById('decalEditBtn');
function setDecalMode(on) {
  if (on === decalMode) return;
  if (on && titleState !== 'title') { decalBtn.textContent = '데칼 편집 모드 (타이틀에서만)'; return; }
  decalMode = on;
  if (on) {
    for (const o of scene.children) if (o !== tankGroup && !o.isLight && !o.isCamera && o.visible) { decalHidden.push(o); o.visible = false; }
    document.getElementById('title').style.visibility = 'hidden';
    decalBg = scene.background; scene.background = new THREE.Color(0x34373a);   // 배경은 어두운 회색 (하늘·안개 대신)
    controls.enabled = true; decalFlip = false;
    decalView(1);
    uiShow(decalUI);
  } else {
    for (const o of decalHidden) o.visible = true;
    decalHidden.length = 0;
    document.getElementById('title').style.visibility = '';
    scene.background = decalBg; applyEnv();   // 배경·그라데이션 되돌리기
    controls.enabled = false; decalSelect(null); decalFlip = false;
    if (UI.screen === decalUI) uiShow(null);
  }
  decalBtn.textContent = decalMode ? '데칼 편집 모드 끝내기' : '데칼 편집 모드';
}
decalBtn.onclick = (e) => { setDecalMode(!decalMode); e.target.blur(); };
// 카메라를 포탑 옆(sd = 1 왼쪽 / -1 오른쪽)에서 바라보게
const _dv = new THREE.Vector3(), _dv2 = new THREE.Vector3();
function decalView(sd) {
  tankGroup.updateMatrixWorld(true);
  parts.turret.localToWorld(_dv.set(0, TUR.y, 0));
  parts.turret.localToWorld(_dv2.set(sd * 9, TUR.y + 1.2, 0));
  controls.target.copy(_dv); camera.position.copy(_dv2); camera.lookAt(_dv);
}
// 지금 카메라 쪽 포탑 옆면 (1 = 왼쪽 +x / -1 = 오른쪽)
const decalSide = () => parts.turret.worldToLocal(_dv.copy(camera.position)).x >= 0 ? 1 : -1;
function decalSelect(m) {
  decalSelLine.removeFromParent();
  decalSel = m || null;
  if (decalSel) decalSel.add(decalSelLine);
  uiDirty();
}
function decalSet() { return DECAL_SETS[decalIdx]; }
function decalAdd(i) {
  const name = DECAL_NAMES[i];
  if (!name) return;
  const d = { img: name, side: decalSide(), z: 0, y: 0, rot: 0, s: 0.6 };
  decalSet().decals.push(d);
  decalSelect(addDecalMesh(d));
  decalNote(`${name} 추가 (${d.side > 0 ? '왼쪽' : '오른쪽'})`);
}
function decalDelete() {
  const d = decalSel.userData.decal, L = decalSet().decals;
  L.splice(L.indexOf(d), 1);
  const m = decalSel; decalSelect(null); m.removeFromParent();
  decalNote(`${d.img} 지웠어요`);
}
function decalChange(fn) {   // 고른 데칼 값을 바꾸고 다시 놓는다 (옆면 밖으로 너무 나가지 않게)
  const d = decalSel.userData.decal;
  fn(d);
  d.s = Math.max(0.1, Math.min(1.4, d.s));
  d.z = Math.max(-TUR.d / 2, Math.min(TUR.d / 2, d.z)); d.y = Math.max(-TUR.h / 2, Math.min(TUR.h / 2, d.y));
  decalPose(d, decalSel); uiDirty();
}
function decalSwitch(dir) { decalSelect(null); setDecalSet(decalIdx + dir); decalNote(`셋: ${decalSet().name}`); }
function decalNewSet() {
  let n = DECAL_SETS.length, name;
  do name = `SET ${n++}`; while (DECAL_SETS.some((s) => s.name === name));
  DECAL_SETS.push({ name, decals: [] });
  decalSwitch(DECAL_SETS.length - 1 - decalIdx);
  decalNote(`새 셋 '${name}' (이름은 decals.js에서 고친다)`);
}
// ---- decals.js 형식으로 복사
const dn2 = (v) => Math.round(v * 1000) / 1000;
function decalFileText() {
  const sets = DECAL_SETS.map((s) => `  { name: '${s.name.replace(/'/g, "\\'")}', decals: [${s.decals.length ? '\n' + s.decals.map((d) =>
    `    { img: '${d.img}', side: ${d.side}, z: ${dn2(d.z)}, y: ${dn2(d.y)}, rot: ${Math.round(d.rot)}, s: ${dn2(d.s)} },`).join('\n') + '\n  ' : ''}] },`).join('\n');
  return `// 데칼 셋: 내 탱크 포탑 좌우에 붙이는 그림 묶음. 타이틀에서 A/D(패드 방향키 ←→)로 고른다 (위장색 × 데칼 셋).
// 게임의 설정 메뉴(~ 키) → 타이틀 화면에서 '데칼 편집 모드'로 고친 뒤 C를 누르면 이 파일 내용 전체가 복사된다. 그대로 덮어 붙여 넣으면 된다.
//   name: 셋 이름 (타이틀에 보인다. 영어 대문자·숫자)
//   img: 그림 이름 = images/decals/의 PNG 파일 이름 (확장자 빼고). 그림을 고치거나 더하면 python tools/build.py (decal_images.js를 다시 만든다)
//   side: 1 = 왼쪽(탱크 기준) · -1 = 오른쪽     z: 앞뒤 위치 (m, 포탑 가운데 0, 앞이 +)     y: 높이 (m, 포탑 옆면 가운데 0)
//   rot: 돌림 (°, 바깥에서 볼 때 시계 반대 방향 +)     s: 세로 크기 (m. 가로는 그림 비율대로)
window.DECAL_SETS = [
${sets}
];
`;
}
function decalCopy() {
  const t = decalFileText();
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); return ok; };
  const done = (ok) => decalNote(ok ? 'decals.js 전체 복사했어요' : '복사하지 못했어요');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => done(true), () => done(fallback()));
  else done(fallback());
}
// ---- 입력: 편집 중에는 키를 모두 가로챈다 (설정 메뉴 \` 키·Ctrl 조합은 그대로)
addEventListener('keydown', (e) => {
  if (!decalMode || e.code === 'Backquote' || e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (/^Digit[1-9]$/.test(e.code)) { decalAdd(+e.code.slice(5) - 1); return; }
  if (e.code === 'Escape') { decalSelect(null); return; }
  if (e.code === 'KeyT') { decalFlip = !decalFlip; decalNote(decalFlip ? '포탑을 뒤로 돌렸어요' : '포탑을 앞으로 돌렸어요'); return; }
  if (e.code === 'KeyC') { decalCopy(); return; }
  if (!decalSel) {
    if (e.code === 'KeyA' || e.code === 'KeyD') decalSwitch(e.code === 'KeyD' ? 1 : -1);
    else if (e.code === 'KeyN') decalNewSet();
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') { decalDelete(); return; }
  const fine = e.shiftKey, step = fine ? 0.005 : 0.02, sd = decalSel.userData.decal.side;
  if (e.code === 'KeyW') decalChange((d) => { d.y += step; });
  if (e.code === 'KeyS') decalChange((d) => { d.y -= step; });
  if (e.code === 'KeyD') decalChange((d) => { d.z -= sd * step; });   // 화면 오른쪽 = 그 옆면의 오른쪽
  if (e.code === 'KeyA') decalChange((d) => { d.z += sd * step; });
  if (e.code === 'KeyQ') decalChange((d) => { d.rot += fine ? 1 : 5; });
  if (e.code === 'KeyE') decalChange((d) => { d.rot -= fine ? 1 : 5; });
  if (e.code === 'KeyR') decalChange((d) => { d.s *= fine ? 1.01 : 1.06; });
  if (e.code === 'KeyF') decalChange((d) => { d.s /= fine ? 1.01 : 1.06; });
}, true);
// 클릭(끌지 않고 누름)으로 고르기. 끌면 카메라 돌리기
let decalDown = null;
const _dRay = new THREE.Raycaster();
addEventListener('pointerdown', (e) => { if (decalMode && e.target === renderer.domElement) decalDown = { x: e.clientX, y: e.clientY }; }, true);
addEventListener('pointerup', (e) => {
  if (!decalMode || !decalDown || e.target !== renderer.domElement) { decalDown = null; return; }
  const moved = Math.hypot(e.clientX - decalDown.x, e.clientY - decalDown.y); decalDown = null;
  if (moved > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  const cp = crtPoint(e.clientX, e.clientY);   // CRT 화면 휨을 되짚어서
  _dRay.setFromCamera({ x: (cp.x - r.left) / r.width * 2 - 1, y: -((cp.y - r.top) / r.height) * 2 + 1 }, camera);
  const hit = _dRay.intersectObjects(decalGroup.children, false)[0];
  decalSelect(hit ? hit.object : null);
}, true);
// 매 프레임: 포탑 자세는 titlePose가, 카메라는 마우스(OrbitControls)가. 여기서는 테두리 깜빡임과 알림만
function decalUpdate(dt) {
  if (decalMsgT > 0 && (decalMsgT -= dt) <= 0) { decalMsg = ''; uiDirty(); }
  decalSelLine.visible = (performance.now() % 600) < 400;
  postMat.uniforms.uGrad.value = 0;   // 타이틀 화면 위쪽 흰 그라데이션 끄기 (끝내면 applyEnv가 되돌린다)
}
// ---- 화면: 오른쪽 위 그림 목록 (번호 · 작은 그림 · 이름), 왼쪽 위 셋 이름, 아래 조작키 안내·고른 데칼 정보·알림
const DEC_C = '#9c9c9c';
const decalUI = {
  passive: true,
  draw(ui) {
    // 오른쪽 위: 그림 목록
    const rowH = 18, lw = Math.max(...DECAL_NAMES.map((n) => gfWidth(n)), gfWidth('데칼 편집 · 붙이기')) + 44, x = ui.w - 6 - lw;
    let y = 6;
    ui.dim(x - 4, y - 3, lw + 8, 19 + DECAL_NAMES.length * rowH, 0.55);
    ui.text('데칼 편집 · 붙이기', x, y, HC.color); y += GF_LINE + 4;
    DECAL_NAMES.forEach((n, i) => {
      const hot = ui.hit('add' + i, x - 4, y - 2, lw + 8, rowH);
      const kw = ui.keyText(x, y + 2, `${i + 1}`, HC.color);
      const img = decalTex(n).image;
      if (img && img.complete && img.naturalWidth) { const a = img.naturalWidth / img.naturalHeight, tw = a >= 1 ? 16 : Math.round(16 * a), th = a >= 1 ? Math.round(16 / a) : 16; ucx.imageSmoothingEnabled = false; ucx.drawImage(img, x + kw + 4 + (16 - tw) / 2, y - 1 + (16 - th) / 2, tw, th); }   // 비율 그대로
      ui.text(n, x + kw + 24, y + 2, hot ? '#ffffff' : DEC_C);
      y += rowH;
    });
    // 왼쪽 위: 셋 이름 (A/D로 바꾼다)
    const s = decalSet(), st = `셋 ${decalIdx + 1}/${DECAL_SETS.length}  ${s.name}  (데칼 ${s.decals.length}장)`;
    ui.dim(2, 3, gfWidth(st) + 60, 19, 0.55);
    let sx = 6;
    sx += ui.keyText(sx, 7, 'A', HC.color) + 2; sx += ui.keyText(sx, 7, 'D', HC.color) + 6;
    ui.text(st, sx, 7, '#ffffff');
    // 아래: 조작키
    const help = decalSel
      ? [['W A S D', '옮기기'], ['Q E', '돌리기'], ['R F', '크기'], ['Shift', '잘게'], ['Del', '지우기'], ['Esc', '선택 해제']]
      : [['클릭', '고르기'], [`1~${DECAL_NAMES.length}`, '붙이기'], ['A D', '셋 바꾸기'], ['N', '새 셋'], ['T', '포탑 뒤집기'], ['C', 'decals.js 복사'], ['마우스 끌기', '카메라']];
    const itemW = ([k, l]) => gfWidth(k) + 4 + 4 + gfWidth(l), gap = 10, maxW = ui.w - 16, rows = [[]];
    let rw = 0;
    for (const h of help) { const w = itemW(h); if (rows[rows.length - 1].length && rw + gap + w > maxW) { rows.push([]); rw = 0; } rw += (rw ? gap : 0) + w; rows[rows.length - 1].push(h); }
    const d = decalSel && decalSel.userData.decal;
    const info = d ? `${d.img}  ${d.side > 0 ? '왼쪽' : '오른쪽'}   z ${d.z.toFixed(3)}   y ${d.y.toFixed(3)}   ${Math.round(d.rot)}°   크기 ${d.s.toFixed(2)}` : '고른 데칼 없음';
    const lines = rows.length + 1 + (decalMsg ? 1 : 0), y0 = ui.h - 6 - lines * GF_LINE;
    ui.dim(0, y0 - 4, ui.w, ui.h - y0 + 4, 0.55);
    let ly = y0;
    if (decalMsg) { ui.text(decalMsg, ui.w / 2, ly, '#ffd25a', 'center'); ly += GF_LINE; }
    ui.text(info, ui.w / 2, ly, d ? '#ffffff' : DEC_C, 'center'); ly += GF_LINE;
    for (const row of rows) {
      const w = row.reduce((n, h, i) => n + itemW(h) + (i ? gap : 0), 0);
      let hx = Math.round((ui.w - w) / 2);
      for (const [k, l] of row) { hx += ui.keyText(hx, ly, k, HC.color) + 4; hx = ui.text(l, hx, ly, DEC_C) + gap; }
      ly += GF_LINE;
    }
  },
  click(id) { if (id.startsWith('add')) decalAdd(+id.slice(3)); },
};
Object.assign(window.dbg, { setDecalMode, decalFileText, DECAL_SETS, setDecalSet });
