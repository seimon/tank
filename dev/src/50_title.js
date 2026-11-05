// ---------------------------------------------------------------- 타이틀 화면
// 처음엔 타이틀: 밝은 낮에 흰 안개, 탱크를 옆에서 낮게 잡은 카메라, 네 귀퉁이에 로고·브랜드·배지·안내 (images/의 SVG).
// 아무 키나 누르거나 클릭하면 시작: 카메라·안개·조명이 EaseInOutCubic으로 플레이용으로 넘어간다 (title.transition 초).
// 타이틀 동안 적은 움직이지 않고, HUD·조준선은 숨긴다
let titleState = titleK >= 1 ? 'play' : 'title', titleT = 0, titleWait = 0;   // titleWait: 타이틀이 보인 뒤 흐른 시간 (로딩 화면이 걷힌 뒤부터)
const TITLE_DELAY = TT.inputDelay ?? 2;   // 이 시간이 지나야 아무 키나 눌러 시작할 수 있다
const titleEl = document.getElementById('title');
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
function showPlayHud(v) { for (const id of ['phud', 'phudS', 'touchUI']) document.getElementById(id).style.visibility = v ? '' : 'hidden'; }
// HUD는 게임이 시작되고 hud.showDelay초 뒤에, 피해 입을 때와 같은 치지직과 함께 나타난다
let hudRevealT = titleState === 'play' ? CFG.hud?.showDelay ?? 3 : -1;
showPlayHud(false);
let titleHideT = 0, titleFadeTh = 0, titleFadeF = 0, titleFadeQ = 0;   // titleFadeTh: 타이틀 그림을 지운 정도 (4x4 디더링 0~16)
const TITLE_FADE = 0.8;   // 시작할 때 타이틀 그림이 사라지는 시간 (초)
if (titleState === 'title') controls.enabled = false; else titleEl.style.display = 'none';
// 설정 메뉴 '타이틀 화면으로': 내 탱크 상태(위치·체력·골드·성장·카메라)를 처음으로 되돌리고 타이틀로 (적은 그대로 두고 멈춘다)
function resetPlayer() {
  resetGrowth(); cancelOffer(); gold = 0;
  Object.assign(tank, { hp: tank.maxHp, cool: 0, elev: INIT_ELEV, tyaw: 0, tvel: 0, tsnap: false, recoil: 0, hop: null, falling: false, solid: true, vy: 0, sL: 0, sR: 0, yawCmd: 0, dL: 0, dR: 0 });
  tank.group.visible = true; tank.vel.set(0, 0, 0); tank.w.set(0, 0, 0);
  spawnTank(); syncBody(tank);
  if (endState) { endState = null; uiShow(null); }
  hudWaitLand = false;
  resetCamera();
}
function goTitle() {
  clearTimeout(titleHideT);
  resetPlayer();
  titleState = 'title'; titleT = 0; titleK = 0; titleWait = 0; applyEnv();
  titleEl.style.display = ''; titleFadeTh = 0; titleFadeF = 0; titleFadeQ = 0;
  showPlayHud(false); hudRevealT = -1; controls.enabled = false;
  layoutTitle();
  buildTitleDeco();
}
document.getElementById('toTitle').onclick = (e) => { goTitle(); e.target.blur(); };
// 설정 메뉴 '적 AI 정지': 모든 적이 그 자리에 멈춘다 (움직임·사격·증원 모두. 떨어지던 것은 마저 떨어진다)
let aiFrozen = false;
function setAiFrozen(on) { aiFrozen = on; document.getElementById('aiStopBtn').textContent = on ? '적 AI 정지 켜짐' : '적 AI 정지 꺼짐'; }   // 버튼 글자도 같이
document.getElementById('aiStopBtn').onclick = (e) => { setAiFrozen(!aiFrozen); e.target.blur(); };
function updateHudReveal(dt) { if (hudRevealT >= 0 && (hudRevealT -= dt) < 0) hudRevealT = -1; }
// HUD를 켤지: 시작 뒤 showDelay초가 지났고, 가운데 창이 떠 있지 않을 때. 켜질 때마다 피해 입을 때처럼 치지직하며 나타난다
let hudOn = false, hudOffAt = 0, hudWaitLand = false;   // hudWaitLand: 재출격해서 떨어지는 중 (착지하면 HUD)   // hudOffAt: 이 시각(ms)에 HUD를 끈다 (끄기 전에 치지직)
function syncHud() {
  const want = titleState !== 'title' && hudRevealT < 0 && !winUp() && !endState && !hudWaitLand, now = performance.now();
  if (want !== hudOn) {
    hudOn = want;
    if (want) { hudOffAt = 0; showPlayHud(true); hudHit(30); }   // 켤 때: 치지직하며 나타남
    else if (titleState === 'title') { hudOffAt = 0; showPlayHud(false); }   // 타이틀로 갈 때는 바로
    else { hudHit(30); hudOffAt = now + POP.fade * 1000; }   // 끌 때: 치지직하면서 popup.fadeTime초 동안 4x4 디더링으로 사라짐 (창이 사라질 때와 같게)
  }
  if (hudOffAt && now >= hudOffAt) { hudOffAt = 0; showPlayHud(false); }
}
// ---- 타이틀 꾸밈: 탱크가 지나온 궤도 자국 (낙엽은 updateLeaves, 포즈는 titlePose)
function buildTitleDeco() { if (TENT.enabled && TENT.distance > 0) startEntrance(); else { entr = null; if (TDET.trail > 0) stampTrail(TDET.trail); } }
// ---- 타이틀 등장: 탱크가 distance m 뒤(안개 속)에서 처음 자리까지 달려와 선다. 오는 동안 포탑을 좌우로 돌리고,
// 서면 포탑·포신을 포즈로 돌린 뒤 firstShot초 뒤 첫 발, 그 뒤 shotEvery초마다 쏜다 (타이틀 포탄은 아무것도 부수지 않는다)
const TENT = Object.assign({ enabled: true, distance: 30, speed: 0.6, sweep: 50, sweepTime: 5, firstShot: 1, shotEvery: 5 }, CFG.title?.entrance);
let entr = null;   // { phase: 'drive' | 'arrived', home: 처음 자리(무게중심), yaw, t, arrT, shot, ty0, el0 }
function startEntrance() {
  spawnTank(); syncBody(tank);
  const y = SPAWN.yaw * DEG, d = TENT.distance;
  entr = { phase: 'drive', home: tank.pos.clone(), yaw: y, t: 0, arrT: 0, shot: TENT.firstShot, ty0: 0, el0: INIT_ELEV };
  tank.tyaw = 0; tank.tvel = 0; tank.elev = INIT_ELEV;
  resetTank(SPAWN_X - Math.sin(y) * d, SPAWN_Z - Math.cos(y) * d, y); syncBody(tank);
}
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const stepTo = (v, to, r) => v + Math.max(-r, Math.min(r, to - v));
// 타이틀·전환 동안 매 프레임: 달려오는 중이면 [thr, turn]을 돌려준다 (null이면 손대지 않음)
function entranceDrive(dt) {
  if (!entr || titleState === 'play') return null;
  const poseT = TDET.pose ? TDET.turret * DEG : 0, poseE = TDET.pose ? TDET.elev * DEG : INIT_ELEV;
  if (entr.phase === 'drive') {
    entr.t += dt;
    const hx = Math.sin(entr.yaw), hz = Math.cos(entr.yaw), dx = entr.home.x - tank.pos.x, dz = entr.home.z - tank.pos.z;
    const d = dx * hx + dz * hz, side = dx * hz - dz * hx, v = tank.vel.x * hx + tank.vel.z * hz;   // 남은 거리, 옆으로 벗어난 정도(+ = 왼쪽), 앞 방향 속도
    if (d < 0.3 && Math.abs(v) < 0.3) { entr.phase = 'arrived'; entr.arrT = 0; return null; }
    _fwd.set(0, 0, 1).applyQuaternion(tank.q);
    const err = wrapA(entr.yaw + Math.max(-0.3, Math.min(0.3, side * 0.25)) - Math.atan2(_fwd.x, _fwd.z));
    const thr = d > 0 ? Math.min(TENT.speed * VMAX, Math.sqrt(2 * 1.6 * d)) / VMAX : 0;   // 서서히 줄여 제자리에 선다
    if (titleState === 'title') {   // 포탑을 좌우로 훑는다 (가까워질수록 폭이 줄어 포즈 각도로 모인다)
      const want = poseT + TENT.sweep * DEG * Math.sin(entr.t * 6.283 / Math.max(0.5, TENT.sweepTime)) * Math.min(1, d / 8);
      tank.tyaw = stepTo(tank.tyaw, want, (tank.turretRate || TURRET_RATE) * dt); tank.tvel = 0;
    }
    return [thr, Math.max(-1, Math.min(1, err * 3))];
  }
  if (titleState !== 'title' || decalMode) return null;   // 데칼 편집 중에는 포즈·포 쏘기 없이 (포탑은 titlePose가)
  entr.arrT += dt;
  const back = (entr.home.x - tank.pos.x) * Math.sin(entr.yaw) + (entr.home.z - tank.pos.z) * Math.cos(entr.yaw);   // 쏠 때 반동으로 밀려난 거리
  if (back > 0.25) entr.creep = true; else if (back < 0.05) entr.creep = false;
  const creep = entr.creep ? [Math.min(0.12, back * 0.3), 0] : null;
  tank.tyaw = stepTo(tank.tyaw, poseT, (tank.turretRate || TURRET_RATE) * dt); tank.tvel = 0;
  tank.elev = stepTo(tank.elev, poseE, 0.55 * dt);
  if (TENT.shotEvery > 0 && (entr.shot -= dt) <= 0) {
    entr.shot += TENT.shotEvery;
    const b = fireCannon(); b.harmless = true; tank.cool = 0;
  }
  return creep;
}
// 내 탱크 뒤로 len m 곧게 지나온 궤도 자국을 한 번에 찍는다 (평소 주행 자국과 같은 무늬)
function stampTrail(len) {
  syncBody(tank); tankGroup.updateMatrixWorld(true);
  [0, 1].forEach((si) => {
    const x = (si === 0 ? 1 : -1) * TRACK_X, m = stampMeshes[si], pa = m.geometry.attributes.position, va = m.geometry.attributes.aV;
    [[x - 0.36, -len], [x + 0.36, -len], [x - 0.36, 1.4], [x + 0.36, 1.4]].forEach(([lx, lz], k) => {
      tankGroup.localToWorld(_wp.set(lx, 0, lz)); pa.setXYZ(k, _wp.x, 0, _wp.z); va.setX(k, lz / TREAD);
    });
    pa.needsUpdate = va.needsUpdate = true; m.visible = true;
  });
  const ac = renderer.autoClear; renderer.autoClear = false;
  renderer.setRenderTarget(trackRT); renderer.render(stampScene, stampCam); renderer.setRenderTarget(null);
  renderer.autoClear = ac;
  stampMeshes.forEach((m) => { m.visible = false; }); marksDirty = true;
}
// 타이틀 동안 포탑·포신 포즈. 시작하면 전환(title.transition초) 동안 처음 값으로 되돌린다. 타이틀·전환 동안 조작은 막힌다 (true = 막힘)
function titlePose() {
  if (titleState === 'play') return false;
  if (decalMode) { tank.tyaw = decalFlip ? Math.PI : 0; tank.elev = INIT_ELEV; tank.tvel = 0; return true; }   // 데칼 편집: 포탑 정면(뒤집으면 뒤), 포신 기본
  if (entr) {   // 등장 연출 중: 타이틀 동안은 entranceDrive가 돌리고, 전환 동안 시작할 때 각도에서 처음 값으로
    if (titleState === 'trans') { tank.tyaw = lerp(entr.ty0, 0, titleK); tank.elev = lerp(entr.el0, INIT_ELEV, titleK); tank.tvel = 0; }
  } else if (TDET.pose) {
    const k = titleState === 'title' ? 0 : titleK;   // titleK: 전환 진행 (EaseInOutCubic)
    tank.tyaw = lerp(TDET.turret * DEG, 0, k); tank.elev = lerp(TDET.elev * DEG, INIT_ELEV, k); tank.tvel = 0;
  }
  return true;
}
if (titleState === 'title') buildTitleDeco();
function startGame() {
  if (titleState !== 'title') return;
  titleState = 'trans'; titleT = 0;
  if (entr) { entr.ty0 = wrapA(tank.tyaw); entr.el0 = tank.elev; }
  clearTimeout(titleHideT);
  hudRevealT = CFG.mission?.enabled === false ? CFG.hud?.showDelay ?? 3 : 1e9;   // 작전 정보가 사라진 뒤에 HUD
}
// 타이틀 그림 하나를 지금 사라진 정도(titleFadeF)로: 화면 아래쪽 줄부터
function titleWipe(c) {
  if (!c || !c._src || !c._css) return;
  if (titleFadeF <= 0) { sharpBlit(c, c._src, c._css[0], c._css[1]); return; }
  const r = c.getBoundingClientRect(), H = c._src.height;
  sharpBlit(c, ditherWipe(c._src, titleFadeF, (y) => 1 - (r.top + y / H * r.height) / innerHeight), c._css[0], c._css[1]);
}
const tPressEl = document.getElementById('tPress'), tCamoEl = document.getElementById('tCamo');
tCamoEl.style.visibility = 'hidden';
function updateTitle(dt) {
  if (titleState === 'title') {   // PRESS ANY KEY: 입력을 받기 시작할 때 나타나 깜빡인다
    if (!document.getElementById('loading')) titleWait += dt;
    const t = titleWait - TITLE_DELAY;
    tPressEl.style.visibility = t >= 0 && t % 1.1 < 0.72 ? '' : 'hidden';
    tCamoEl.style.visibility = t >= 0 ? '' : 'hidden';   // 위장색 안내는 깜빡이지 않는다
  }
  if (titleState !== 'trans') return;
  titleT = Math.min(1, titleT + dt / (TT.transition ?? 2.2));
  // 타이틀 그림: 4x4 디더링 무늬로 점점 비워 가며 사라진다
  if (titleEl.style.display !== 'none') {
    // 화면 아래에서 위로 쓸어 올리며 (ditherWipe). 그림마다 화면 속 자리로 높이를 잰다
    const f = Math.min(1, titleT * (TT.transition ?? 2.2) / TITLE_FADE), q = Math.floor(f * 48);
    if (q !== titleFadeQ) {
      titleFadeQ = q; titleFadeF = f; titleFadeTh = Math.min(16, Math.floor(f * 16));
      if (f >= 1) titleEl.style.display = 'none';
      else for (const id of ['tLogo', 'tBrand', 'tBadge', 'tVer', 'tPress', 'tCamo']) titleWipe(document.getElementById(id));
    }
  }
  titleK = easeInOutCubic(titleT); applyEnv();
  if (titleT >= 1) { titleState = 'play'; controls.enabled = true; }
}
// 타이틀에서는 키·클릭이 게임에 가지 않는다 (설정 메뉴 ` 키와 메뉴 클릭은 그대로): SPACE(또는 클릭·터치)로 시작, Q/E로 위장색
addEventListener('keydown', (e) => {
  if (titleState !== 'title' || e.code === 'Backquote' || decalMode) return;   // 데칼 편집 중이면 그쪽 처리로
  if (!e.fromPad) setInputPad(false);   // 키보드를 누르면 키 글자도 키보드로 (아래에서 다른 처리를 막으니 여기서)
  sfx.unlock();
  if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;   // 새로고침 등 브라우저 단축키는 그대로
  e.stopImmediatePropagation();
  if (['Space', 'KeyQ', 'KeyE', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();   // 소리는 첫 입력부터 (브라우저 규칙)
  if (titleWait < TITLE_DELAY) return;   // 그 전에는 눌러도 무시 (로딩 중에 눌러도 여기서 끝)
  if (e.code === 'KeyQ' || e.code === 'KeyE') { if (!e.repeat) { setCamo(camoIdx + (e.code === 'KeyE' ? 1 : -1)); drawCamoText(); sfx.ui('tab'); } return; }
  if (e.code === 'KeyA' || e.code === 'KeyD') { if (!e.repeat) { setDecalSet(decalIdx + (e.code === 'KeyD' ? 1 : -1)); drawCamoText(); sfx.ui('tab'); } return; }   // 데칼 셋
  if (e.code !== 'Space') return;
  if (paused) pauseSet(false);
  startGame();
}, true);
addEventListener('pointerdown', (e) => {   // 클릭·터치는 게임에 가지 않고 소리만 켠다 (시작은 SPACE로만)
  if (titleState !== 'title' || e.target.closest('#hud') || decalMode) return;   // 데칼 편집 중엔 카메라 돌리기·고르기로
  setInputPad(false);
  e.stopImmediatePropagation();
  sfx.unlock();
}, true);
// 카메라: 플레이 카메라는 늘 하던 대로 따라가게 두고(값은 따로 보관), 화면에는 타이틀 카메라와 섞은 자리를 쓴다.
// 섞기는 화면 가운데 점과 거리·내려다보는 각·방향을 따로 보간 (탱크 둘레로 호를 그리며 넘어간다)
const playCamPos = new THREE.Vector3(), playCamTgt = new THREE.Vector3(), _ttg = new THREE.Vector3();
let camSaved = false;
function titleCamBegin() { if (camSaved) { camera.position.copy(playCamPos); controls.target.copy(playCamTgt); } }
function titleCamEnd() {
  if (titleK >= 1) {
    if (camSaved) { camSaved = false; camera.fov = CC.fov; camera.updateProjectionMatrix(); resize(); }
    return;
  }
  playCamPos.copy(camera.position); playCamTgt.copy(controls.target); camSaved = true;
  const tc = TT.camera || {}, k = titleK;
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  const tYaw = (entr ? entr.yaw : Math.atan2(_fwd.x, _fwd.z)) + (tc.yaw ?? 65) * DEG, tPitch = (tc.pitch ?? 8) * DEG, tDist = tc.distance ?? 16;
  _ttg.copy(entr ? entr.home : tank.pos); _ttg.y += tc.height ?? 2;
  _tmp.copy(playCamPos).sub(playCamTgt);
  const pDist = _tmp.length(), pPitch = Math.asin(_tmp.y / pDist), pYaw = Math.atan2(-_tmp.x, -_tmp.z);
  let dy = pYaw - tYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const yaw = tYaw + dy * k, pitch = lerp(tPitch, pPitch, k), dist = lerp(tDist, pDist, k);
  controls.target.lerpVectors(_ttg, playCamTgt, k);
  camera.position.copy(controls.target).add(_tmp.set(-Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, -Math.cos(yaw) * Math.cos(pitch) * dist));
  camera.lookAt(controls.target);
  const fov = lerp(tc.fov ?? 30, CC.fov, k);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); U.uPointScale.value = lowH / (2 * Math.tan(fov * DEG / 2)); }
}

// ---------------------------------------------------------------- 루프
const statsEl = document.getElementById('stats');
const clock = new THREE.Clock();
let frames = 0, acc = 0, physAcc = 0, fieldAcc = 0, lastDt = 0, uiDt = 0, grayK = 0;
const _shake = new THREE.Vector3();
// 한 프레임 분량의 게임 갱신 (렌더 제외)
await loadStep(0.94, 'ALMOST THERE...');
