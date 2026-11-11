function tick(dt) {
  perfT.length = 0; perfLast = performance.now();
  if (clearHold()) { clearTick(dt); return; }   // 임무 완료: 배경을 다 지운 뒤로는 월드를 멈추고 탱크 포즈만 (52_clear.js)
  U.uTime.value += dt;
  // 바람 방향이 windDir 둘레(±23도)로 천천히 바뀐다
  const a = windDir * DEG + Math.sin(U.uTime.value * 0.05) * 0.4;
  U.uWindDir.value.set(Math.cos(a), Math.sin(a));

  // 입력 → 물리
  // 키보드가 우선, 키가 없으면 터치 패드 값 (아날로그)
  const lockIn = titlePose() || winUp() || editMode;   // 타이틀·전환 동안, 그리고 가운데 창(정보·전투 불능·적군 섬멸·확인)이 떠 있으면 조작 막힘
  const auto = entranceDrive(dt);   // 타이틀 등장: 저절로 달려온다
  const thr = auto ? auto[0] : lockIn ? 0 : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) || touch.thr || pad.thr;
  const steer = lockIn ? 0 : (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0) || touch.steer || pad.steer;
  // 후진할 땐 자동차처럼 좌우가 반대: 후진 입력이 있고 실제로도 뒤로 가거나 거의 멈췄을 때만 (아직 앞으로 굴러가는 동안 뒤집으면 엉뚱한 쪽으로 돌았다)
  const tq0 = tank.q, tAlong = tank.vel.x * 2 * (tq0.x * tq0.z + tq0.w * tq0.y) + tank.vel.z * (1 - 2 * (tq0.x * tq0.x + tq0.y * tq0.y));
  const turn = auto ? auto[1] : thr < 0 && tAlong < 0.5 ? -steer : steer;
  const de = lockIn ? 0 : (keys.has('ArrowUp') || keys.has('KeyR') || touch.up ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyF') || touch.down ? 1 : 0) || pad.de;   // 포각: R·↑ 올림, F·↓ 내림
  tank.elev = Math.max(-0.1, Math.min(0.96, tank.elev + de * 0.55 * dt));
  const tq = (keys.has('KeyQ') || keys.has('ArrowLeft') || touch.tl ? 1 : 0) - (keys.has('KeyE') || keys.has('ArrowRight') || touch.tr ? 1 : 0) || pad.tq;   // 포탑 회전: Q·← 왼쪽, E·→ 오른쪽 (오른손만으로 포탑·포각도)
  if (tank.solid && !lockIn) turretStep(tank, tq, dt);
  tank.cool -= dt;
  if (tank.solid && !lockIn && (keys.has('Space') || touch.fire || pad.fire) && tank.cool <= 0) { fireCannon(); tank.cool = tank.reload; if (tank.twin) tank.twinT = tank.twin; }
  if (tank.twinT > 0 && (tank.twinT -= dt) <= 0) { tank.twinT = 0; if (tank.solid && !lockIn) fireCannon(); }   // '쌍열포': 조금 뒤 한 발 더
  if (tank.falling) updateFall(tank, dt);
  if (deadEndAt && U.uTime.value >= deadEndAt) { deadEndAt = 0; if (!tank.solid) showEnd('dead'); }   // 내 탱크가 터지고 2초 뒤에 전투 불능 창
  perfMark('입력');
  stormTick(dt);   // 남은 적이 적으면 폭풍우로 (40_input_post.js)
  if (titleState !== 'title' && !enemyAiOff()) updateEnemies(dt);
  else for (const E of ENEMIES) { if (E.falling && titleState !== 'title') updateFall(E, dt); E.thr = 0; E.turn = 0; }   // 타이틀·AI 정지 동안 적은 가만히 (주행 입력은 0으로. 비워 두면 물리가 NaN이 된다)
  updateBunkers(dt);
  perfMark('적 AI');
  for (const T of TANKS) T.wet = T.pos.y - COM.y < waterAt(T.pos.x, T.pos.z) + 0.1;   // 차체 바닥이 물에 잠기면 감속
  const spd0 = Math.hypot(tank.vel.x, tank.vel.z);
  for (physAcc += dt; physAcc >= PHYS_H; physAcc -= PHYS_H) {
    if (tank.solid && !clearSeq) physStep(PHYS_H, thr, turn);   // (임무 완료: 내 탱크는 52_clear.js가 세운다)
    for (const E of ENEMIES) if (E.solid) physStep(PHYS_H, E.thr, E.turn, E);
  }
  // 충돌 공격: 10km/h(설정) 이상으로 적 탱크나 보급품에 부딪히면 대미지 (같은 대상은 0.6초에 한 번)
  if (tank.touch && tank.touch.size) {
    if (tank.ram && spd0 * 3.6 >= ramSpeed())
      for (const O of tank.touch) {
        if (U.uTime.value - (O.ramAt || -9) <= 0.6) continue;
        if (O.pos) { if (O.solid) { O.ramAt = U.uTime.value; sfx.clang(O.pos, 0.8); damageTank(O, ramDamage(), null, tank, 'ram'); } continue; }
        const t = targets.find(t => t.fp === O);   // 보급품 (충돌 상자로 닿았다)
        if (t && t.alive) { O.ramAt = U.uTime.value; sfx.clang(t.mesh.position, 0.8); damageTarget(t, ramDamage(), 'ram'); }
      }
    tank.touch.clear();
  }
  // 자동 수리: 10초(설정)마다 HP 1
  // '야전 정비' 조합: 주기 절반. ('광전사'도 자동 수리는 그대로: 한 번에 1이라 더 줄이지 않는다)
  const repEvery = PC.autoRepairEvery * (tank.fieldRepair ? 0.5 : 1);
  if (tank.regen > 0 && tank.solid && tank.hp < tank.maxHp) { tank.regenAcc = (tank.regenAcc || 0) + tank.regen * dt; const n = Math.floor(tank.regenAcc); if (n) { tank.regenAcc -= n; tank.hp = Math.min(tank.maxHp, tank.hp + n); } }   // 설정 메뉴 '초당 자동 회복' (시험용)
  if (tank.autoRepair && tank.solid && tank.hp < tank.maxHp && (tank.repairAcc += dt) >= repEvery) { tank.repairAcc -= repEvery; tank.hp = Math.min(tank.maxHp, tank.hp + 1); dmgTextHeal(tank, 1); }
  perfMark('물리');
  if (tank.solid && tank.pos.y < BOTTOM - 20) spawnTank();
  for (const E of ENEMIES) {
    if (E.solid && E.pos.y < BOTTOM - 20) startDrop(E);
    if (E.solid) (E.jeep ? jeepVisual : enemyVisual)(E, dt, E.thr);
  }
  ramWrecks(); ramSandbags();
  updateTankLamps(thr);

  // 탱크 표시: 궤도 텍스처를 벨트 이동 거리만큼 흘린다
  tank.dL += tank.sL * dt; tank.dR += tank.sR * dt;
  parts.belts[0].offset.x = tank.dL / TREAD; parts.belts[1].offset.x = tank.dR / TREAD;
  tank.recoil = Math.max(0, tank.recoil - dt * 3);
  parts.barrel.position.z = -0.5 * tank.recoil;
  syncTankVisual();

  trampleUnder(tank);
  driveEffects(dt);
  if (tank.solid) exhaust(dt, thr, turn);
  sfx.engine(tank.solid, tank.load || 0, Math.hypot(tank.vel.x, tank.vel.z));

  perfMark('탱크 표시');
  updateBalls(dt);
  perfMark('포탄');
  spawnFire(dt);
  updateWindDebris(dt);
  updateLeaves(dt);
  glowP.update(dt); smokeP.update(dt);
  perfMark('파티클');
  for (fieldAcc += dt; fieldAcc >= 0.05; fieldAcc -= 0.05) fieldTick(0.05);
  perfMark('풀·불 필드');
  updateTrackMap(dt);
  perfMark('궤도 자국');
  updateTargets(dt); updateShadows(); updateCoins(dt); updateSmokers(dt); updateCrates(dt); updateWires(dt); updateWallDecals(dt); updateWindmill(dt);
  perfMark('보급품·동전·기타');
  updateLights(dt);
  if (titleState !== 'title') { updateRings(); updateMG(dt); }
  if (titleState === 'play' && endState !== 'clear') updateAim(); else { aimGeo.setDrawRange(0, 0); aimRing.visible = false; aimHitP = null; }   // 조준선은 타이틀 → 플레이 전환이 끝나면 (적군 섬멸 창 동안은 숨김)
  perfMark('조명·조준');
  updateCollisionView();
}
window.dbg.tick = tick;
Object.assign(window.dbg, { ENEMIES, newEnemy, TANKS, startDrop, destroyTankBody, hitTank, spawnCoins, coins, battle: () => ({ enemyDrops, enemyKills, dropTimers, missionClear, gold, playTime, growLevel }), targets });
Object.assign(window.dbg, { spawnSpg, spgWarns, damageTank, blastDamage, rollChoices, pickOffer, goldGain, crates, setAi: (v) => { aiShow = v; }, drawHud, gold: () => gold });
// 디버그: 원하는 항목으로 성장 선택지 띄우기 (id 3개), HUD + 픽셀 UI를 게임 해상도 그림 한 장으로 (배경은 단색)
Object.assign(window.dbg, {
  setOffer(ids) {
    const ch = ids.map((id) => GC.upgrades.find((u) => u.id === id)).filter(Boolean).map((u) => ({ u, label: upText(u.name, u), desc: upText(u.desc, u) + (upLast(u) ? ' (최대)' : ''), bad: u.bad ? upText(u.bad, u) : '' }));
    curOffer = { choices: ch, picked: -1, showT: 9 }; drawOffer();
  },
  setOfferRaw(list) {   // [{ name, rarity, desc }] 그대로 (설정에 없는 긴 설명 시험용)
    curOffer = { choices: list.map((o) => ({ u: { id: 'test', rarity: o.rarity }, label: o.name, desc: o.desc })), picked: -1, showT: 9 }; drawOffer();
  },
  offerPad(v) { inputPad = v; uiDirty(); },
  showClear(info) { Object.assign(clearUI.info, info); clearUI.reset(); uiShow(clearUI); },   // 시안용 (게임 상태는 그대로)
  showPause() { pauseUI.under = UI.screen; pauseUI.open(); uiShow(pauseUI); },
  fillPickLog(n) { tank.pickLog.length = 0; for (let i = 0; i < n; i++) { const c = rollChoices()[0]; if (c) tank.pickLog.push(c); } },   // 시안용: 강화 기록을 아무거나 n개로
  hideUI() { uiShow(null); },
  offerFreeze(t) { offerUI.freezeT = t; if (curOffer && t != null) curOffer.showT = t; uiDirty(); },
  holdPick(i) { if (curOffer) { curOffer.picked = i; curOffer.pickT = -1e9; drawOffer(); } },   // 고른 모습만 (사라지지 않게)
  uiShot(bg = '#3a3a3a') {
    drawHud(); UI.dirty = true; uiUpdate();
    const w = UI.w, h = UI.h, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.drawImage(uiB, 0, 0);
    for (const k of [hudK, uiK]) { g.globalAlpha = HC.shadow * 0.5; g.drawImage(k, 0, 0); g.globalAlpha = HC.shadow; g.drawImage(k, 1, 1); }
    g.globalAlpha = 1; g.globalCompositeOperation = HC.blend === 'normal' ? 'source-over' : HC.blend === 'screen' ? 'screen' : 'lighter';
    g.drawImage(hudC, 0, 0); g.drawImage(uiC, 0, 0);
    return c.toDataURL('image/png');
  },
});
Object.defineProperty(window.dbg, 'enemy', { get: () => ENEMIES[0] });
window.dbg.perfLog = perfLog; window.dbg.perfT = perfT;
Object.assign(window.dbg, { addTarget, dropSafe, removeWreck, sparks });
aoSave();   // 이번에 새로 구운 AO가 있으면 저장 (다음 로딩부터 바로 씀)
await loadStep(1, 'WARMING UP SHADERS...');
applyMapPreset(mapIdx);   // 처음 맵 셋팅 (config map.preset)
markOutline(scene);
// 미리 컴파일은 실제로 그리는 곳(저해상도 렌더 타깃 rt)에 맞춰서: 화면(캔버스)에 맞추면 출력 색 공간이 달라(srgb ↔ srgb-linear)
// 미리 만든 셰이더를 하나도 못 쓰고, 처음 보이는 순간마다 다시 컴파일해 끊긴다
function warmCompile() {
  renderer.setRenderTarget(rt); renderer.compile(scene, camera); renderer.setRenderTarget(null);
  // 텍스처도 미리 GPU로 올린다 (처음 보이는 순간 올리느라 멈칫하지 않게)
  const seen = new Set();
  scene.traverse((o) => {
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
      for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) { const tx = m[k]; if (tx && tx.isTexture && !seen.has(tx)) { seen.add(tx); renderer.initTexture(tx); } }
  });
  for (const ms of BK_CRACK_MATS) for (const m of ms) if (m.map && !seen.has(m.map)) { seen.add(m.map); renderer.initTexture(m.map); }   // 벙커 금 간 무늬 (맞기 전엔 장면에 없다)
}
{ // 떨어지며 나타날 때 쓰는 디더 재질도 미리: 탱크·적·자주포·지프·보급품 복제본에 씌워 함께 컴파일하고 치운다
  const warm = new THREE.Group();
  for (const r of [tankGroup.clone(), enemyTemplate.clone(), spgTemplate.clone(), buildJeep().root, safeModel.clone(), repairModel.clone()]) { warm.add(r); fadeIn(r); }
  const ch = makeChute(); ch.g.position.set(0, -200, 0); warm.add(ch.g); chutePool.push(ch);   // 낙하산도
  scene.add(warm); warmCompile(); scene.remove(warm); warm.remove(ch.g);
  // 미리 컴파일한 디더 재질(복제본)은 버리지 않고 계속 쥐고 있는다. three.js는 재질을 dispose할 때 그 재질만 쓰던 셰이더 프로그램도 지운다(usedTimes 0).
  // 정리해 버리면(예전 updateFadeIns(0)) 로딩 때 컴파일해 둔 낙하용 셰이더가 곧바로 사라져서, 재출격·적 낙하 때마다 셰이더를 처음부터 다시 컴파일해 크게 멈칫한다.
  // 같은 셰이더(customProgramCacheKey)를 쓰는 진짜 낙하 재질이 끝나며 dispose돼도, 이 복제본이 쥐고 있어 프로그램이 남는다
  fadeKeep.push(...fadeIns.splice(0));
}
setBright(brightness);   // 기억해 둔 화면 밝기
warmCompile();   // 처음 보는 재질 때문에 게임 중에 멈칫하지 않게 미리 컴파일
{ // 궤도 자국 마스크(trackRT)를 찍고 지우는 두 장면(stampScene·fadeScene)은 scene 밖이라 위 warmCompile에 안 들어 있다: 게임을 시작하는 순간(타이틀이 끝나 지우기가 처음 돌 때)
  // 처음 쓰이며 컴파일·링크가 끝나길 기다리느라 1.5초나 멈췄다. 그려질 렌더 타깃을 맞춰 미리 컴파일하고, 끝날 때까지 로딩 화면에서 기다린다
  // (병렬 컴파일 때문에 compile()은 시작만 하고 돌아온다. 끝나지 않은 프로그램을 처음 그리는 순간 거기서 멈춘다)
  const pending = [];
  if (renderer.compileAsync) {
    renderer.setRenderTarget(rt); pending.push(renderer.compileAsync(scene, camera));
    renderer.setRenderTarget(trackRT); pending.push(renderer.compileAsync(stampScene, stampCam), renderer.compileAsync(fadeScene, stampCam));
    renderer.setRenderTarget(null);
  } else { renderer.setRenderTarget(trackRT); renderer.compile(stampScene, stampCam); renderer.compile(fadeScene, stampCam); renderer.setRenderTarget(null); }
  await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 8000))]);   // (끝나지 않아도 8초 뒤엔 넘어간다)
  clrFloor.visible = false;   // 임무 완료 바닥: 위에서 함께 미리 컴파일하고 숨긴다 (52_clear.js)
}
fadeLoading();
// 로딩 화면은 바로 끄지 않고 1초 동안 4x4 디더링 무늬로 점점 비워 가며 사라진다 (게임 해상도 픽셀 단위)
function fadeLoading() {
  const LOAD_FADE = 1333;   // 사라지는 시간 (ms). 아래에서 위로 쓸어 올리며
  const el = document.getElementById('loading'), cv = document.getElementById('loadCv');
  removeEventListener('resize', drawLoading);
  if (!cv || !cv._src) { el.remove(); return; }
  el.style.background = 'transparent'; el.style.pointerEvents = 'none';
  const t0 = performance.now();
  const done = () => { if (el.isConnected) el.remove(); };
  setTimeout(done, LOAD_FADE + 1000);   // 창이 가려져 그리기가 멈춰도 결국 지운다
  const step = () => {
    if (!el.isConnected) return;
    const f = Math.min(1, (performance.now() - t0) / LOAD_FADE);
    sharpBlit(cv, ditherWipe(cv._src, f), innerWidth, innerHeight);
    if (f < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
}
// 월드가 멈춘 상태: 지금은 일시정지(ESC)뿐. 게임 시간이 흐르지 않고, 연출이 끝나면 멈춘 화면으로 고정한다.
// (적군 섬멸 창은 월드를 멈추지 않는다: 월드는 계속 돌고 값만 잠근다 — rulesLocked, 70_enemies.js)
const worldFrozen = () => paused;
// 일시정지 (ESC): 정보 창을 띄우고 게임 진행을 멈춘다. 창·회색조 연출은 계속 그린다
const setPaused = (v) => {
  if (paused === v) return;
  paused = v; pausedDrawn = false; pauseScene = false;
  // 일시정지 창은 떠 있던 화면(성장 선택지·끝 창) 위에 잠깐 올렸다가, 계속하면 되돌린다
  // 다른 창(전투 불능·적군 섬멸)이 떠 있으면 일시정지 창은 띄우지 않는다. 확인 창에서 계속해도 일시정지 아래 화면으로
  const inPause = UI.closing ? UI.closing.next === pauseUI || UI.closing.next === confirmUI : UI.screen === pauseUI || UI.screen === confirmUI;   // 다른 창으로 넘어가는 중이면 그대로 둔다
  const atTitle = titleState === 'title';   // 타이틀: 키를 받기 시작한 뒤부터 메뉴 창 (조종법·설정 탭만, 설정 탭으로). 편집 모드에서는 안 연다
  if (v && (!atTitle || (titleWait >= TITLE_DELAY && !decalMode && !editMode)) && !winUp()) {
    pauseUI.titleMode = atTitle;
    // 아래에 둘 화면: 사라지는 중이면 그다음 화면. 일시정지·확인 창 자신은 아래 화면이 될 수 없다 (ESC를 연타하면 닫히던 창을 다시 여는 경우)
    const under = UI.closing ? UI.closing.next : UI.screen;
    pauseUI.under = under === pauseUI || under === confirmUI ? null : under;
    pauseUI.open(); uiShow(pauseUI);   // 탱크 성능부터
  }
  else if (v) { paused = false; return; }   // 열 수 없을 때 (타이틀 대기 중·편집 모드·다른 창)
  else if (!v && inPause) { uiShow(pauseUI.under || null); pauseUI.under = null; }
  if (!v) clock.getDelta();
};
function pauseSet(u) { setPaused(u); }
addEventListener('keydown', (e) => {   // ESC: 정보 창 열기(일시정지) / 닫기(계속). 확인 창에서는 정보 창으로 되돌아감. 다른 창이 떠 있으면 무시
  if (e.code !== 'Escape' || suspended) return;
  if (UI.screen === confirmUI) { sfx.ui('button'); uiPress('no'); uiShow(pauseUI); }
  else if (paused) { sfx.ui('button'); uiPress('resume'); pauseSet(false); }
  else if (!winUp()) pauseSet(true);
});
// 정지 (브라우저 창이 포커스를 잃음 · 탭이 가려짐): 루프 자체를 멈춰 아무것도 계산하거나 그리지 않는다 (마지막 화면 그대로).
// 정보 창과는 상관없다: 정보 창이 뜬 채로 정지했다가 돌아오면 그대로. 진행 중이던 연출(치지직 등)도 멈췄던 자리에서 이어진다
let suspended = false, suspendT = 0, suspendAfterFrame = false;
function suspend() {
  if (suspended) return;
  suspended = true; suspendT = performance.now();
  keys.clear(); sfx.pause(true);
  renderer.setAnimationLoop(null);
}
function resume() {
  if (!suspended) return;
  suspended = false;
  const away = performance.now() - suspendT;   // 실제 시각으로 재던 연출은 멈춰 있던 만큼 미룬다
  if (glitchUntil) glitchUntil += away;
  if (hudOffAt) hudOffAt += away;
  clock.getDelta();   // 멈춰 있던 시간은 게임에 넣지 않는다
  sfx.pause(false);
  renderer.setAnimationLoop(frame);
}
addEventListener('blur', suspend);
addEventListener('focus', resume);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else if (document.hasFocus()) resume(); });
// 포커스를 되찾는 클릭은 '되돌리기'로만: 그 클릭이 버튼·탭을 누르거나 게임을 시작하지 않게 (정지 중에 들어온 pointerdown은 버린다)
addEventListener('pointerdown', (e) => { if (suspended) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// 회색조 · HUD 켜고 끄기 · 픽셀 UI (멈춘 동안에도 돈다). 연출이 다 끝나면 멈춘 화면으로 고정 (pausedDrawn)
function overlayFrame() {
  // 회색조: 가운데 창이 떠 있으면 popup.grayTime초에 걸쳐 회색조로, 닫히면 같은 시간에 걸쳐 원래대로
  const gT = winUp() && !rulesLocked() ? 1 : 0;   // (적군 섬멸 창은 배경 색을 그대로 둔다)
  grayK += Math.sign(gT - grayK) * Math.min(Math.abs(gT - grayK), uiDt / Math.max(0.01, POP.grayTime));
  postMat.uniforms.uGray.value = grayK;
  syncHud();
  uiUpdate();
  dmgTextUpdate(worldFrozen() ? 0 : uiDt);   // 대미지 숫자 (멈춘 동안은 그대로)
  leaveUpdate(uiDt);   // 화면 나가기 덮개 (52_clear.js)
  if (worldFrozen()) pausedDrawn = !leaving && !(UI.closing || UI.glitchT > 0 || UI.dirty || grayK !== gT || hudOffAt || performance.now() < glitchUntil || (UI.screen && UI.screen.busy && UI.screen.busy()));   // busy: 화면이 움직이는 중 (강화 기록 넘기기)
}
function frame() {
  const fj0 = performance.now();   // 이 프레임 JS 전체 시간 (끊김 기록용)
  if (perfHudOn) renderer.info.reset();   // 성능 표시: 한 프레임 전체를 센다
  // 일시정지(정보 창) 동안 게임 시간은 흐르지 않고 (재개 때 한꺼번에 몰아 계산하지 않음), 창·회색조 연출만 그린다
  const raw = clock.getDelta();
  uiDt = Math.min(raw, 0.05);   // 창·회색조 연출 시간: 멈춘 동안에도 흐른다
  sfx.game(!paused); sfx.keepAlive();   // 일시정지(정보·확인 창) 중에는 게임 소리를 끈다 (UI 소리만). 전투 불능·적군 섬멸 창에서는 그대로
  padPoll();   // 게임패드: 일시정지로 일찍 돌아가기 전에 (창 조작도 패드로)
  if (paused) pauseUI.wake();   // 설정 탭 커서 깜빡임: 멈춰 쉬는 화면도 깨운다
  const frozen = worldFrozen();
  if (frozen && pausedDrawn) { crtPresent(); return; }   // CRT 표현은 멈춰 있어도 돈다 (게임 화면은 그대로)
  if (frozen && pauseScene) {   // 멈춘 뒤에는 장면을 다시 그리지 않는다 (카메라·흔들림이 다시 계산돼 배경이 움찔이지 않게): HUD·창·회색조만
    drawHud(); overlayFrame();
    renderer.setRenderTarget(postRT); renderer.render(postScene, postCam);   // 회색조는 후처리라 마지막 장면(rt)에서 다시
    renderer.setRenderTarget(null); finalPass();
    return;
  }
  const rawDt = frozen ? 0 : raw, dt = Math.min(rawDt, 0.05);
  lastDt = dt;
  if (!missionClear) playTime += Math.min(rawDt, 2);   // 혹시 모를 아주 큰 간격(창이 멈췄다 돌아옴)만 빼고
  const progs0 = renderer.info.programs.length;
  tick(dt);   // 멈춰 있을 때는 dt = 0: 모델 위치만 맞추고 시간은 그대로
  updateFadeIns(dt); updateChutes(dt);

  // 카메라 추적 + 흔들림 (타이틀·전환 중에는 타이틀 카메라와 섞는다)
  if (!decalMode) titleCamBegin();
  if (decalMode) decalUpdate(uiDt);   // 데칼 편집: 카메라는 마우스로 (타이틀 카메라를 섞지 않는다)
  else if (editMode) editUpdate(uiDt);   // 맵 편집: 카메라는 탱크를 따라가지 않는다
  else if (clearSeq) clearUpdate(dt);   // 임무 완료 카메라·포즈·조명 (52_clear.js)
  else if (titleState === 'trans') playRestCam();   // 타이틀 → 플레이 전환: 섞을 플레이 카메라는 끝났을 때 자리에 고정 (움직이는 카메라와 섞으면 출렁인다)
  else {
    updateCamLead(dt);
    camFocus(_cf);
    _tmp.copy(_cf).sub(lastFollow);
    camera.position.add(_tmp); controls.target.add(_tmp); lastFollow.copy(_cf);
    followYaw(dt);
    camBack(dt);   // 마우스로 돌린 카메라: 1초 뒤 기본 각도로
  }
  controls.update();
  camAboveGround();
  perfMark('카메라');
  U.uOccR.value = titleK >= 1 && tank.solid && !clearSeq ? CC.seeThrough ?? 3.2 : 0; U.uOccP.value.set(tank.pos.x, tank.pos.y + 0.6, tank.pos.z);   // 가리는 물체 비춰 보기 (플레이 중에만)
  updateTitle(dt);
  perfMark('기타');
  updateWeather(dt);
  perfMark('날씨');
  missionCheck();
  if (!decalMode) { titleCamEnd(); drawCallouts(); }
  updateHudReveal(dt);
  shake = Math.max(0, shake - dt * 2.5);
  _shake.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(shakeOn ? shake * 0.35 : 0);   // 화면 흔들림 (설정에서 끌 수 있다)
  camera.position.add(_shake);
  updateAiView();
  updateFloaters(dt);
  updateTankPos(dt);
  perfMark('기타');
  drawHud();
  perfMark('HUD');
  overlayFrame();
  perfMark('UI·대미지 숫자');

  const tr0 = performance.now();
  if (!clearHold()) {   // (임무 완료로 배경을 다 지웠으면 장면은 그리지 않고 탱크만)
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    if (outlineOn) {   // 외곽선: 레이어 1 물체만 깊이로 한 번 더
      camera.layers.set(OUTLINE_LAYER); scene.overrideMaterial = olMat;
      renderer.setRenderTarget(olRT); renderer.render(scene, camera);
      scene.overrideMaterial = null; camera.layers.set(0);
    }
  }
  perfMark('장면 그리기');
  if (clearSeq && clearSeq.cut > 0) clearRenderCut();   // 임무 완료: 탱크만 따로 (후처리가 디더링으로 바꿔 간다)
  postMat.uniforms.uCut.value = clearSeq ? clearSeq.cut : 0;
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  vfStep(dt);   // 복셀 안개 흉내 유체 (멈추면 dt = 0)
  renderer.setRenderTarget(postRT);
  renderer.render(postScene, postCam);
  renderer.setRenderTarget(null);
  perfMark('후처리');
  finalPass();   // 게임 해상도 → 화면 (샤프 바이리니어, CRT 표현이면 HUD·UI와 합쳐 CRT로)
  perfMark('화면 늘리기');   // (CRT면 그 단계들은 10a_crt.js가 따로 표시하고 여기엔 거의 남지 않는다)
  camera.position.sub(_shake);
  if (frozen) pauseScene = true;   // 멈춘 장면을 한 번 그렸다
  if (!frozen) perfFrame(rawDt * 1000, performance.now() - tr0, renderer.info.programs.length - progs0, performance.now() - fj0);
  perfHud(raw * 1000, performance.now() - fj0);   // 화면 성능 표시 (켜져 있을 때만)

  frames++; acc += dt;
  if (acc > 0.5) {
    statsEl.textContent = `${Math.round(frames / acc)} fps · ${rt.width}x${rt.height} · 광원 ${lightCount} · draw ${calls} · tri ${(tris / 1000).toFixed(0)}k`;
    frames = 0; acc = 0;
  }
  if (suspendAfterFrame) { suspendAfterFrame = false; suspend(); }
}
renderer.setAnimationLoop(frame);
if (!document.hasFocus()) suspendAfterFrame = true;   // 포커스 없이 열렸으면: 로딩·첫 화면까지는 그리고 정지
