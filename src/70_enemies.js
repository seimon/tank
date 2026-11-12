// ---------------------------------------------------------------- 적 탱크 / 전투
// 체력·방어력·성능은 config.js. 방어력은 맞은 면(정면/측면/후면)만큼 대미지를 줄인다 (쏜 탱크의 '관통탄'만큼 깎임)
const EC = CFG.enemy, AI = EC.ai, SC = CFG.spg;
const HEAR_SHOT_R = AI.hearShotRange;
const _spl = new THREE.Vector3(), _splQ = new THREE.Quaternion();
// 같은 모델에 모래색 도장. 모델은 한 번만 만들고(AO 굽기 포함) 적마다 복제한다
const ETC = { hull: 0x8a6c3e, low: 0x6e5836, turret: 0x9e7c48, wheel: 0x3c3a34, barrel: 0x7c6038, plate: 0x6e5432, top: 0xae8c56, muzzle: 0x64502e };
const enemyTemplate = buildTank(false, ETC).root;
// 레벨: config enemy.levels. 빠진 값은 enemy의 기본값 (armor는 면마다 따로 덮어쓴다). color = 차체 색 하나 → 나머지 부위는 기본 도장의 밝기 비율대로
function enemyLevel(level) {
  const l = EC.levels.find((x) => x.level === level) || {};
  return Object.assign({ hp: EC.hp, speedMul: EC.speedMul, turnMul: EC.turnMul, reload: EC.reload, muzzle: EC.muzzle, shellDamage: EC.shellDamage,
    blastRadius: EC.blastRadius, blastRatio: EC.blastRatio, spread: EC.spread, lead: EC.lead ?? 1, mg: 0 }, l, { armor: Object.assign({}, EC.armor, l.armor), level });
}
// 몇 번째 적이 어느 레벨인가: last가 있는 칸 중 끝에서 그 대수 안에 드는 가장 작은 last. 아무 데도 안 들면 레벨 1
function levelForIdx(idx) {
  const fromEnd = EC.clearKills - idx + 1;
  const l = EC.levels.filter((x) => x.last != null).sort((a, b) => a.last - b.last).find((x) => fromEnd <= x.last);
  return l ? l.level : 1;
}
const LV_TEMPLATES = new Map();   // 레벨 → 색을 바꾼 모델 (색이 있는 레벨만, 로딩 때 한 번)
for (const l of EC.levels) if (l.color && !LV_TEMPLATES.has(l.level)) {
  const base = new THREE.Color(ETC.hull), want = new THREE.Color(l.color), tc = {};
  for (const k in ETC) {
    if (k === 'wheel') { tc[k] = ETC[k]; continue; }
    const c = new THREE.Color(ETC[k]);
    tc[k] = new THREE.Color(Math.min(1, want.r * c.r / base.r), Math.min(1, want.g * c.g / base.g), Math.min(1, want.b * c.b / base.b)).getHex();
  }
  LV_TEMPLATES.set(l.level, buildTank(false, tc).root);
}
// 자주포: 회색빛 국방색. 포탑이 뒤에 있고 포신이 3배
const STC = { hull: 0x5e6252, low: 0x52554a, turret: 0x6c705e, wheel: 0x3a3a34, barrel: 0x585c4c, plate: 0x4e5244, top: 0x7a7e6a, muzzle: 0x4a4e40 };
const spgTemplate = buildTank(false, STC, true).root;
// 복제하면 재질을 함께 쓰므로, 적마다 따로 바뀌어야 하는 것(궤도 무늬 흐름, 브레이크등, 후광)만 재질을 따로 만든다
function cloneMat(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  if (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
  if (m.defines) c.defines = { ...m.defines };
  return c;
}
const ENEMIES = [];
// idx = 몇 번째로 나온 적 탱크인가 (레벨: config enemy.levels). level을 주면 그 레벨로 (설정 메뉴 버튼)
function newEnemy(spg = false, idx = 1, level = 0) {
  const lvNo = spg ? 0 : level || levelForIdx(idx), LV = spg ? null : enemyLevel(lvNo);
  const root = markOutline((spg ? spgTemplate : LV_TEMPLATES.get(lvNo) || enemyTemplate).clone(true)), P = { belts: [] };
  for (const k of ['pivot', 'barrel', 'turret', 'tip', 'stack', 'body']) P[k] = root.getObjectByName(k);
  let brake = null, halo = null;
  root.traverse((o) => {
    if (o.name === 'belt') { o.material = cloneMat(o.material); o.material.map = o.material.map.clone(); o.material.map.needsUpdate = true; P.belts.push(o.material.map); }
    if (o.name === 'brake') { brake = brake || cloneMat(o.material); o.material = brake; }
    if (o.name === 'wheelFace') { o.material = cloneMat(o.material); o.material.userData.uRot = P.wheelRot = { value: new THREE.Vector2() }; }   // 바퀴 무늬 회전은 탱크마다
    if (o.name === 'halo') { halo = halo || o.material.clone(); o.material = halo; }
  });
  P.brake = brake; P.halo = halo;
  scene.add(root);
  const E = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    sL: 0, sR: 0, dL: 0, dR: 0, yawCmd: 0, wet: false, elev: 0.2, cool: 3, recoil: 0, contacts: 0, solid: false,
    gold: 0, falling: false, vy: 0, landY: 0, group: root, P, thr: 0,
    stuck: 0, rev: 0, revTurn: 1, puff: 0, wx: 0, wz: 0, detour: 0, dx: 0, dz: 0, spg,
  };
  // 레벨: 전체 20대(자주포 포함) 중 끝에서 몇 번째인가로 정한다 (config enemy.levels)
  E.level = lvNo; E.guns = buildGuns(P.turret, spg ? 0 : LV.mg);
  if (spg) Object.assign(E, { hp: SC.hp, maxHp: SC.hp, armor: SC.armor, turnM: SC.turnMul, muzzle: 30, shellDmg: SC.shellDamage, blastR: SC.blastRadius, blastRatio: SC.blastRatio, reload: SC.reload, elev: SC.elev * DEG });
  else Object.assign(E, { hp: LV.hp, maxHp: LV.hp, armor: LV.armor, spdM: LV.speedMul, accM: LV.speedMul, turnM: LV.turnMul, muzzle: LV.muzzle, shellDmg: LV.shellDamage, blastR: LV.blastRadius, blastRatio: LV.blastRatio, reload: LV.reload, spread: LV.spread, lead: LV.lead });
  ENEMIES.push(E); TANKS.push(E);
  return E;
}
function removeEnemy(E) {
  scene.remove(E.group);
  ENEMIES.splice(ENEMIES.indexOf(E), 1); TANKS.splice(TANKS.indexOf(E), 1);
}
// 적 탱크는 모두 20대(설정): 처음 1대 + 하늘에서 떨어지는 증원. 동시에 있을 수 있는 적은 성장 5단계마다 1대씩 늘어 최대 4대.
// 빈자리가 생기면 3~6초 뒤 증원이 떨어진다. 다 쓰고 남은 적까지 없애면 미션 클리어.
// 자주포는 따로: 성장 10단계부터 1대, 10단계마다 1대 더 (최대 4대). 부서지면 10초 뒤 내 탱크에서 먼 모서리 근처에 다시 나타난다 (클리어 수에는 안 셈)
const MAX_DROPS = EC.clearKills - 1;
const tankCount = () => ENEMIES.reduce((n, E) => n + (E.spg || E.jeep ? 0 : 1), 0);
const spgCount = () => ENEMIES.reduce((n, E) => n + (E.spg ? 1 : 0), 0), jeepCount = () => ENEMIES.reduce((n, E) => n + (E.jeep ? 1 : 0), 0);
const maxEnemies = () => Math.min(EC.concurrentMax, EC.concurrentStart + Math.floor(growLevel / EC.concurrentEvery));
const spgWanted = () => growLevel < SC.startLevel ? 0 : Math.min(4, 1 + Math.floor((growLevel - SC.startLevel) / SC.everyLevels));
let enemyDrops = 0, enemyKills = 0, jeepKills = 0, missionClear = false;
const dropTimers = [], spgTimers = [], jeepTimers = [];
let deadEndAt = 0;   // 내 탱크가 터진 뒤 전투 불능 창을 띄울 게임 시각
let endState = null;   // 'dead' 내 탱크 파괴 / 'clear' 적군 섬멸 / null. 이때는 HUD를 끄고 가운데 창 + 배경 회색조
// 적군 섬멸 창이 떠 있는 동안: 월드는 계속 돌아 생동감(폭발·날아가는 골드)은 그대로지만, 결과에 영향을 주는 값은 잠근다 (골드·대미지·처치 수·성장 선택지).
// 그래서 대미지(damageTank·damageBunker)와 골드(goldGain)는 이 값을 보고 아무것도 바꾸지 않고, 남은 적 지프의 AI(이동·사격)는 끈다. 벙커는 missionClear라 이미 쏘지 않는다
const rulesLocked = () => endState === 'clear';
const enemyAiOff = () => aiFrozen || rulesLocked();   // 적 AI를 끈다: 개발 버튼(적 AI 정지) 또는 섬멸 창
// 처음: 강 건너 본도로 위에서 나를 바라보며
{
  const E = newEnemy(false, 1), z = Math.min(HALF - 10, XB_Z + 26), x = mainRoadX(z);
  resetTank(x, z, Math.atan2(tank.pos.x - x, tank.pos.z - z), E);
  E.solid = true; syncBody(E);
}
// 떨어뜨릴 자리: 땅 위이면서 건물·잔해·보급품(모두 footprints) 근처가 아니고, 탱크·전봇대·물길·다리·절벽과 겹치지 않고, 너무 비탈지지 않은 곳.
// near를 주면 그 둘레(12~32m)에서 고른다
function landSpot(clear, near, margin = 4, r0 = 12, r1 = 32) {
  for (let k = 0; k < 900; k++) {
    let x, z;
    if (near) { const a = rand() * 6.283, r = rr(r0, r1); x = near.x + Math.sin(a) * r; z = near.z + Math.cos(a) * r; }
    else { x = rr(-HALF + 8, HALF - 8); z = rr(-HALF + 8, HALF - 8); }
    if (Math.abs(x) > HALF - 7 || Math.abs(z) > HALF - 7) continue;
    if (creekD[gridIndex(x, z)] < CREEK_HW + 4 || bridgeDeckAt(x, z) > -1e8 || inFootprint(x, z, margin)) continue;
    if (allPoles.some(p => Math.hypot(p.x - x, p.z - z) < 4)) continue;
    if (!clear(x, z)) continue;
    let cliff = 0;
    for (const [a, b] of [[0, 0], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) cliff = Math.max(cliff, cliffG[gridIndex(x + a, z + b)]);
    if (cliff > 0.05) continue;
    const hs = [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].map(([a, b]) => heightAt(x + a, z + b));
    if (Math.max(...hs) - Math.min(...hs) > 1.4) continue;
    return { x, z };
  }
  return null;
}
const tankClear = (self, d) => (x, z) => !TANKS.some(T => T !== self && (T.solid || T.falling) && Math.hypot(T.pos.x - x, T.pos.z - z) < d);
// 적은 내 탱크에서 enemy.dropMinDist(m) 밖에만 (밑으로 달려 들어와도 깔리지 않게). 못 찾으면 조건을 줄여 가며, 끝내 없으면 나에게서 먼 쪽 출발점
function dropSpot(self, near, r0, r1, drop) {   // drop = 떨어뜨릴 자리 (아니면 적이 돌아다닐 목적지)
  if (self === tank || !drop) return landSpot(tankClear(self, 14), near, 4, r0, r1) || { x: SPAWN_X, z: SPAWN_Z };
  const minD = EC.dropMinDist ?? 30, clear = tankClear(self, 14);
  const ok = (x, z) => clear(x, z) && Math.hypot(tank.pos.x - x, tank.pos.z - z) >= minD;
  if (near === tank.pos) { r0 = Math.max(r0 ?? 12, minD); r1 = Math.max(r1 ?? 32, minD + 15); }   // 내 둘레에 떨굴 때도 거리 밖으로
  return landSpot(ok, near, 4, r0, r1) || landSpot(ok, null, 2)
    || [{ x: SPAWN_X, z: SPAWN_Z }, { x: mainRoadX(-SPAWN_Z), z: -SPAWN_Z }].sort((a, b) => Math.hypot(tank.pos.x - b.x, tank.pos.z - b.z) - Math.hypot(tank.pos.x - a.x, tank.pos.z - a.z))[0];
}
function startDrop(T, near, r0, r1) {
  const { x, z } = near && near.exact ? near : dropSpot(T, near, r0, r1, true);
  let other = null, bd = Infinity;   // 가장 가까운 상대 탱크를 바라보며 떨어진다
  for (const O of TANKS) if (O !== T && O.solid && (T === tank) !== (O === tank)) { const d = Math.hypot(O.pos.x - x, O.pos.z - z); if (d < bd) { bd = d; other = O; } }
  resetTank(x, z, other ? Math.atan2(other.pos.x - x, other.pos.z - z) : rand() * 6.283, T);
  T.landY = T.pos.y; T.pos.y += DROP_H; T.vy = 0;   // dropFade초 만에 땅에 닿는 높이
  T.falling = true; T.solid = false; T.hp = T.maxHp; T.cool = T.spg ? 3 : 1.5; T.tyaw = 0; T.tvel = 0; T.tsnap = false; T.elev = T === tank ? INIT_ELEV : T.spg ? SC.elev * DEG : 0.2;
  T.aimOfs = null;
  T.group.visible = true; syncBody(T);
  fadeIn(T.group);   // 나타나자마자 4x4 디더링으로 스르륵
  attachChute((o) => o.set(T.pos.x, T.pos.y + (T.jeep ? 1.2 : 1.9), T.pos.z), () => T.falling && T.group.visible);   // 낙하산
}
// 쿵: 보급품과 같은 흙먼지 고리, 풀 눕힘, 깔린 상자 부서짐, 가까우면 화면 흔들림.
// 무게감 있게: 완전히 튀지 않고 한쪽만 살짝 들렸다 내려앉도록 수평축으로 작은 회전을 준다 (나머지는 물리가 처리)
function updateFall(T, dt) {
  T.vy -= 22 * dt; T.pos.y += T.vy * dt;
  if (T.hop) {   // 자세 리셋: 꼭대기에 닿을 때까지 바른 자세·제자리로 돌아간다
    const h = T.hop, f = Math.min(1, (h.t += dt) / h.up), e = f * f * (3 - 2 * f);
    T.q.slerpQuaternions(h.q0, h.q1, e);
    if (h.fly) {   // 45도 포물선: 수평은 일정한 속도로, 높이는 식 그대로 (끝에서 딱 내려앉을 자리 높이)
      const s = Math.min(h.t, h.fly);
      T.pos.x = h.p0.x + h.vx * s; T.pos.z = h.p0.z + h.vz * s;
      T.pos.y = h.p0.y + h.vy0 * s - 11 * s * s; T.vy = h.vy0 - 22 * s;
      if (h.t >= h.fly) { T.pos.y = Math.min(T.pos.y, T.landY); T.vy = Math.min(T.vy, -0.01); }
    }
    else { T.pos.x = lerp(h.p0.x, h.p1.x, e); T.pos.z = lerp(h.p0.z, h.p1.z, e); }
  }
  // 떨어지다 밑의 탱크·보급품을 밟으면 밟힌 쪽은 바로 부서진다 (충돌 공격과 같은 처리. 보급품 폭풍은 떨어진 탱크를 밀지 않음)
  const bottom = T.pos.y - COM.y;
  for (const O of TANKS.slice()) if (O !== T && O.solid && Math.hypot(O.pos.x - T.pos.x, O.pos.z - T.pos.z) < 3.2 && bottom < O.pos.y + 2.6) damageTank(O, Math.ceil(O.hp), null, T, 'ram');
  for (const t of targets.slice()) if (t.alive && !t.falling && Math.hypot(t.x - T.pos.x, t.z - T.pos.z) < 3.0 && bottom < t.y + TARGET_S / 2) damageTarget(t, (t.hp ?? CFG.box.hp) / (1 - CFG.box.armor || 1), 'ram');
  if (T.vy < 0 && T.pos.y <= T.landY) {
    const hop = T.hop; T.hop = null;
    if (hop) { T.q.copy(hop.q1); T.pos.x = hop.p1.x; T.pos.z = hop.p1.z; }
    T.pos.y = T.landY; T.falling = false; T.solid = true; T.vel.set(0, 0.6, 0);
    if (T === tank) { hudWaitLand = false; landOffer(); }   // 착지: 접어 둔 선택지 (자세 리셋 점프 중에 모인 골드도 여기서)
    _tmp.set(rand() < 0.5 ? 1 : 0, 0, 0); if (!_tmp.x) _tmp.z = 1;
    T.w.copy(_tmp.multiplyScalar((rand() < 0.5 ? -1 : 1) * rr(0.8, 1.1))).applyQuaternion(T.q);
    landFx(T, !!hop);
    for (const c of crates) if (c.alive && Math.hypot(c.x - T.pos.x, c.z - T.pos.z) < 3) breakCrate(c, false);
  }
  syncBody(T);
}
// 쿵 연출: 흙먼지 고리·풀 눕힘·화면 흔들림·소리 (착지, 자세 리셋으로 떠오르는 순간도)
function landFx(T, hop) {
  const gy = groundAt(T.pos.x, T.pos.z);
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * 6.283, s = rr(4, 8);
    smokeP.spawn(T.pos.x + Math.cos(a) * 2.2, gy + 0.2, T.pos.z + Math.sin(a) * 2.2, Math.cos(a) * s, rr(0.2, 0.8), Math.sin(a) * s, rr(0.8, 1.3), [0.32, 0.27, 0.2, 0.6], [0.3, 0.27, 0.22, 0], 0.7, 2.4, 0, 3.5, 0.5);
  }
  addBlast(T.pos.x, gy, T.pos.z, 12);
  shake = Math.min(1.2, shake + Math.max(0, (hop ? 0.35 : 0.7) - camera.position.distanceTo(T.pos) / 110));
  sfx.thud(T.pos, hop ? 0.7 : 1);
}
// 그 점이 탱크의 어느 면 쪽인가 (탱크 좌표에서 앞/뒤/옆). _spl에 탱크 좌표를 남긴다
function faceAt(T, p) {
  _spl.copy(p).sub(T.pos).applyQuaternion(_splQ.copy(T.q).invert()).add(COM);
  const dy = _spl.y - 1.4, h = Math.hypot(_spl.x, _spl.z);   // 차체 가운데보다 45도 넘게 위·아래면 상단·하단
  return dy > h ? 'top' : -dy > h ? 'bottom' : Math.abs(_spl.z) > Math.abs(_spl.x) ? (_spl.z > 0 ? 'front' : 'rear') : 'side';
}
// 탱크 대미지: 맞은 면의 방어력(쏜 탱크의 관통탄만큼 깎이고 0 아래로는 안 내려감)과 장갑 강화를 곱한 뒤 소수점 버림.
// face가 없으면 방어력 무시 (충돌 공격)
function damageTank(T, raw, face, src, kind) {
  if (!T.solid || rulesLocked() || (T === tank && godMode)) { dmgFromP = null; dmgCrit = false; return 0; }   // 섬멸 창 동안(또는 설정 메뉴 '무적'인 내 탱크)은 맞아도 폭발·소리만 나고 체력은 그대로
  const pierce = (src && src.pierce) || 0, mgPierce = kind !== 'mg' || (src && src.apMg);   // 관통탄은 포탄만 (기관총은 '철갑 기관총' 조합이 있어야)
  const a = face ? Math.max(0, (T.armor[face] ?? 0) - (mgPierce ? pierce : 0)) : 0;
  const d = Math.floor(raw * (1 - a) * (T.armorM || 1) + 1e-6);
  if (aiShow) floatTank(T, d, raw, face, src, a, kind);
  dmgTextHit(T, Math.max(0, d), dmgFromP || (src && src.pos) || null, dmgCrit, d > 0 && T.hp - d <= 0); dmgFromP = null; dmgCrit = false;   // 대미지 숫자 (공격한 자리 반대쪽으로. 치명타·파괴 표시)
  if (d <= 0) return 0;
  if (T === tank) runStats.dmg += Math.min(d, Math.max(0, T.hp));   // (받은 피해: 남은 HP를 넘는 몫은 빼고)
  T.hp -= d;
  if (T === tank) { shake = Math.min(1.2, shake + Math.min(0.3, 0.05 + d * 0.005)); hudHit(d); padRumble(Math.min(1, 0.25 + d * 0.02), Math.min(1, 0.4 + d * 0.02), kind === 'mg' ? 70 : 180); }   // 패드 진동: 맞은 만큼
  if (T.hp <= 0) destroyTankBody(T);
  return d;
}
// 폭발 범위: 반경 r 안의 탱크(피아 구분 없음. 차체 상자 겉면까지 거리)·상자·잔해에 dmg (방어력 적용). except = 직격당한 것 (두 번 받지 않게)
function blastDamage(p, r, dmg, src, except) {
  if (r <= 0 || dmg <= 0) return;
  for (const T of TANKS.slice()) {
    if (!T.solid || T === except) continue;
    const own = T === src, br = r, bd = dmg;   // 내 폭발에 내가 맞으면 내 관통탄은 빼고
    const face = faceAt(T, p);
    const dx = Math.max(0, Math.abs(_spl.x) - (T.hx ?? HULL_HX)), dz = Math.max(0, Math.abs(_spl.z) - (T.hz ?? HULL_HZ)), dy = Math.max(0, -_spl.y, _spl.y - (T.ht ?? 2.8));
    if (Math.hypot(dx, dy, dz) <= br) { dmgFromP = p; damageTank(T, bd, face, own ? null : src, 'blast'); }   // (대미지 숫자는 폭발 자리 반대쪽으로)
  }
  for (const t of targets.slice()) if (t !== except && t.alive && !t.falling && t.mesh.position.distanceTo(p) < r + TARGET_S / 2) damageTarget(t, dmg, 'blast');
  for (const c of crates) if (c !== except && c.alive && Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) < r + c.s / 2) damageCrate(c, dmg);
  for (const w of WRECKS.slice()) if (w !== except && Math.hypot(w.x - p.x, w.y - 1 - p.y, w.z - p.z) < r + 1.8) damageWreck(w, dmg);
  for (const S of SANDBAGS.slice()) if (S !== except && Math.hypot(S.fp.x - p.x, S.fp.z - p.z) < r + S.fp.hx * 0.7 && Math.abs(S.y + 0.6 - p.y) < r + 1) damageSandbag(S, dmg);
  for (const B of BUNKERS) if (B !== except && !B.ruin && Math.hypot(B.x - p.x, B.z - p.z) < r + BK_A + 0.2 && p.y < B.y + BK_H + 1 + r) { dmgFromP = p; damageBunker(B, dmg, src); }
}
// 포탄 직격: 맞은 면의 방어력만큼 깎인 대미지, 쇳조각
function hitTank(T, hit, b) {
  explode(hit.p, UP, false, 1 + (b.blast || 0) * 0.1);
  spawnShards(hit.p, 16, METAL_COLS, 4, 13, null, 0.15, 0.45);
  sfx.clang(hit.p, 1);
  damageTank(T, b.dmg, hit.face, b.owner);
}
function destroyTankBody(T) {
  if (!T.solid) return;
  T.solid = false; T.group.visible = false;
  const c = T.pos.clone();
  if (T.jeep) {   // 지프: 작게 터지고 잔해 없이 사라진다. 골드 1 (설정), 20대에는 안 센다. 빈자리는 updateEnemies가 10초 뒤 채운다
    jeepKills++;
    explode(c, UP, true, 1.6);
    spawnShards(c, 18, METAL_COLS, 4, 14, null, 0.2, 0.5, 1);
    if (JC.goldDrop) spawnCoins(c, JC.goldDrop);
    removeEnemy(T);
    return;
  }
  explode(c, UP, false, 3);
  spawnShards(c, 30, METAL_COLS, 5, 18, null, 0.25, 0.7, 1.2);
  _fwd.set(0, 0, 1).applyQuaternion(T.q);
  placeWreck(c.x, c.z, Math.atan2(_fwd.x, _fwd.z));   // 처음부터 있던 잔해와 같은 모양
  const w = WRECKS[WRECKS.length - 1];
  wreckScorch(w);
  smokers.push({ x: w.x, y: w.y, z: w.z, t: 0, dur: 9, acc: 0 }, { x: w.x, y: w.y, z: w.z, t: 10, dur: Infinity, acc: 0, weak: true });
  colDirty = true;
  // 골드를 뱉는다. 나: 가진 골드 전부를 상자 터지듯 흩뿌리고 0이 된다 ('골드 움켜쥐기'면 안 잃음. 동전은 최대 40개에 값을 나눠 담는다)
  // 적 탱크: 먹은 골드 (최소 10, 최대 30. 설정). 자주포: 정해진 만큼
  let n = 0, vals = null;
  if (T === tank) {
    holdOffer(!tank.goldKeep);
    if (!tank.goldKeep && gold > 0) {
      n = Math.min(40, gold);
      const base = Math.floor(gold / n), extra = gold - base * n;
      vals = Array.from({ length: n }, (_, k) => base + (k < extra ? 1 : 0));
      gold = 0;
    }
  } else if (T.spg) n = SC.goldDrop;
  else { n = Math.min(EC.goldDropMax, Math.max(EC.goldDropMin ?? 10, T.gold)); T.gold = 0; }
  if (n) spawnCoins(c, n, false, 1, vals);
  T.vel.set(0, 0, 0); T.w.set(0, 0, 0); T.sL = T.sR = T.yawCmd = 0; T.contacts = 0;
  if (T === tank) { deadEndAt = U.uTime.value + 2; return; }   // 터지는 모습을 보여 주고 2초 뒤에 창 (tick)
  removeEnemy(T);
  enemyKills++;   // 자주포도 20대에 들어간다
  if (T.spg && spgWanted() && enemyDrops < MAX_DROPS) { enemyDrops++; spgTimers.push(SC.respawnDelay); }   // 남은 자리가 있으면 10초 뒤 다시 (한 대로 센다)
  checkMissionClear();
}
// 자주포를 지도 네 모서리 중 내 탱크에서 먼 쪽(다른 자주포가 없는 곳) 근처에 떨어뜨린다
function spawnSpg() {
  const m = HALF - SC.cornerMargin, P = tank.pos;
  const corners = [[m, m], [-m, m], [m, -m], [-m, -m]].sort((a, b) => Math.hypot(b[0] - P.x, b[1] - P.z) - Math.hypot(a[0] - P.x, a[1] - P.z));
  const free = corners.filter(([x, z]) => !ENEMIES.some(E => E.spg && Math.hypot(E.pos.x - x, E.pos.z - z) < 30));
  const E = newEnemy(true);
  // 모서리 근처가 절벽·물길이면 조금씩 넓혀 가며 찾는다
  let at = null;
  for (const c of free.length ? free : corners) {
    for (const r of [12, 22, 32]) if ((at = landSpot(tankClear(E, 14), { x: c[0], z: c[1] }, 4, 0, r))) break;
    if (at) break;
  }
  startDrop(E, at ? { ...at, exact: true } : null);
  return E;
}
// 실제로 플레이한 시간 (일시정지 동안은 세지 않음. 루프에서 더한다). 미션 클리어 순간 멈춰서 함께 보여 준다
let playTime = 0;
const fmtTime = (t) => `${Math.floor(t / 60)}분 ${(t % 60).toFixed(1).padStart(4, '0')}초`;
function checkMissionClear() {
  if (missionClear || enemyDrops < MAX_DROPS || dropTimers.length || spgTimers.length || ENEMIES.length > jeepCount()) return;
  missionClear = true;
  showEnd('clear');
}
// 끝 창 띄우기: HUD를 끄고 (떠 있던 성장 선택지는 접고) 가운데에 창, 배경은 회색조로 (루프의 grayK)
function showEnd(kind) {
  if (endState === 'clear') return;   // 섬멸 창이 떠 있으면 그대로
  endState = kind;
  if (kind === 'clear') cancelOffer();   // 월드는 계속 돌지만 값은 잠긴다 (rulesLocked): 남은 골드를 주워도 레벨업하지 않는다
  if (kind === 'clear') { Object.assign(clearUI.info, { stats: { ...runStats }, kills: EC.clearKills, jeeps: jeepKills, time: playTime, lv: growLevel, bunkers: BUNKERS.filter((B) => B.ruin && !B.ruinAtStart).length, bunkerAll: BUNKERS.filter((B) => !B.ruinAtStart).length }); clearUI.reset(); clearBegin(); }   // 임무 완료 카메라·배경 (52_clear.js)
  uiShow(kind === 'dead' ? deadUI : clearUI);   // HUD는 syncHud가 끈다
}
// 재출격: 처음부터가 아니라 내 탱크만 새로 떨어뜨린다 (착지하면 접어 둔 성장 선택지가 다시 뜬다)
let continuesLeft = PC.continues ?? 3;   // 남은 재출격 횟수 (첫 화면으로 돌아가면 페이지를 다시 읽으니 다시 채워진다)
function respawn() {
  if (endState !== 'dead' || tank.solid || tank.falling || continuesLeft <= 0) return;
  continuesLeft--;
  endState = null; uiShow(null); hudWaitLand = true;   // 창은 사라지고, HUD는 착지한 뒤 치지직하며 다시 켜진다
  startDrop(tank);
  resetCamera();
}
// 새로 시작: 다시 읽되 타이틀은 건너뛴다 / 첫 화면으로: 그냥 다시 읽는다 (타이틀부터)
function restartGame(toTitle) {
  try { if (!toTitle) sessionStorage.setItem('MightyMolly.skipTitle', '1'); } catch (_) {}
  leaveBegin();   // 검정 4x4 디더링으로 위에서 아래로 덮은 뒤 다시 읽는다 (52_clear.js)
}
// 적 AI
const _eAim = { thr: 0, turn: 0 }, _eT = new THREE.Vector3();
// 시야: 두 점 사이가 키 큰 건물(3.5m 이상)에 가리는가. 보급품·잔해·상자는 낮아서 가리지 않는다
function sightClear(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 1.5);
  for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    for (const f of footprints) {
      if (!f.group || f.target || f.top - f.y0 < 3.5) continue;
      fpLocal(f, x, z, _fl);
      if (Math.abs(_fl.x) < f.hx && Math.abs(_fl.z) < f.hz) return false;
    }
  }
  return true;
}
// 시야: 25m, 앞쪽 ±45도. 5m 안은 소리로 안다. 사거리 19m. 흩뜨림 0.04rad (모두 config.js의 enemy.ai)
const SIGHT_R = AI.sightRange, SIGHT_COS = Math.cos(AI.sightAngle * DEG), HEAR_R = AI.hearRange, FIRE_R = AI.fireRange, ENEMY_SPREAD = EC.spread, PROWL_R = AI.prowlRange;
// 뒤집히거나 벽에 기대 서 버리면 2초 뒤 그 자리에서 붕 떠올라 다시 선다 (내 탱크의 G키와 같다. 적은 포탄 소모 없음)
function rescueTip(E, dt) {
  _fwd.set(0, 1, 0).applyQuaternion(E.q);
  E.tip = _fwd.y < 0.55 ? (E.tip || 0) + dt : 0;
  if (E.tip > 2) {
    _fwd.set(0, 0, 1).applyQuaternion(E.q);
    const x = Math.max(-HALF + 4, Math.min(HALF - 4, E.pos.x)), z = Math.max(-HALF + 4, Math.min(HALF - 4, E.pos.z));
    hopUpright(E, x, z, Math.atan2(_fwd.x, _fwd.z) + Math.PI); E.tip = 0;
  }
}
// 도망칠 곳: 나와 반대쪽 25m. 그쪽이 지도 밖이면 조금씩 옆으로 틀어 지도 안에 드는 쪽으로 (벽에 붙어 버둥대지 않게)
const GOAL_LIM = HALF - 7;
function fleeSpot(E, P) {
  const a0 = Math.atan2(E.pos.x - P.pos.x, E.pos.z - P.pos.z);
  for (const s of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const x = E.pos.x + Math.sin(a0 + s) * 25, z = E.pos.z + Math.cos(a0 + s) * 25;
    if (Math.abs(x) < GOAL_LIM && Math.abs(z) < GOAL_LIM) return [x, z];
  }
  return [0, 0];   // 구석에 몰렸으면 지도 가운데 쪽으로
}
// 적 AI. 우선순위:
//  (나를 보고 있지 않을 때) 내가 벙커를 공격하면 그 벙커로 달려온다 (수리보다 먼저)
//  HP 30 이하면 수리 도구 → 수리 보급품 쏘기 → 나에게서 도망
//  나를 보면 정면을 피해 옆·뒤로 돌아 들어가 멈춰서 쏜다 (오래 끌지 않고 6초 안에 공격)
//  놓친 나를 마지막 본 곳(포성 들은 곳 포함)에서 찾기 → 가까운 골드 → 45m 안에 내가 있으면 그쪽으로 어슬렁 → 보급품 사냥 → 아무 데나
function enemyAI(E, dt) {
  rescueTip(E, dt);
  _fwd.set(0, 0, 1).applyQuaternion(E.q);
  const yaw = Math.atan2(_fwd.x, _fwd.z);
  const P = tank.solid ? tank : null, dp = P ? Math.hypot(P.pos.x - E.pos.x, P.pos.z - E.pos.z) : 1e9;
  if ((E.sightT = (E.sightT || 0) - dt) <= 0) {
    E.sightT = 0.2;
    const inCone = P && ((P.pos.x - E.pos.x) * _fwd.x + (P.pos.z - E.pos.z) * _fwd.z) / Math.max(dp, 1e-3) > SIGHT_COS;
    E.sees = !!P && (dp < HEAR_R || (dp < SIGHT_R && (inCone || (E.sees && E.lost < 0.3)) && sightClear(E.pos, P.pos)));   // 이미 보던 중이면 시야각 밖으로 잠깐 벗어나도 놓치지 않음
  }
  if (!P) E.sees = false;   // 내 탱크가 방금 터졌으면 0.2초 전 판단을 쓰지 않는다
  if (E.sees && P) { E.seenX = P.pos.x; E.seenZ = P.pos.z; E.lost = 0; } else E.lost = (E.lost || 0) + dt;
  const near = (x, z) => Math.hypot(x - E.pos.x, z - E.pos.z);
  const nearest = (list, fn) => { let b = null, bd = Infinity; for (const o of list) { const d = fn(o); if (d < bd) { bd = d; b = o; } } return b; };
  let gx = null, gz = 0, aim = null, aimObj = null, hold = false, look = false;
  // 3발을 쏴도 못 깬 보급품은 20초 동안 건너뛴다 (둑·건물에 막혀 영영 못 맞히는 경우)
  const skipped = (t) => E.skip && E.skip.has(t) && E.skip.get(t) > U.uTime.value;
  E.mode = '';
  const alarm = !E.sees && bunkerAlarm(E);   // 이미 나를 공격 중이면 그대로 공격
  if (E.detour > 0) { E.detour -= dt; gx = E.dx; gz = E.dz; if (near(gx, gz) < 3) E.detour = 0; E.mode = 'detour'; }   // 막혔던 곳을 옆으로 돌아가는 중
  else if (alarm) {   // 벙커 지원: 벙커 앞쪽으로 달려가서, 닿으면 그 자리에서 두리번 (내가 보이면 다음 판단부터 공격)
    const fx = alarm.x + Math.sin(alarm.rot) * 9, fz = alarm.z + Math.cos(alarm.rot) * 9;
    if (near(fx, fz) > 5) { gx = fx; gz = fz; } else look = true;
    E.mode = 'defend';
  }
  else if (E.hp <= AI.repairAtHp) {
    // 수리: 바닥의 수리 도구 → 수리 보급품을 쏴서 깬다 → 나를 피해 달아난다
    const kit = nearest(coins.filter(c => c.kit && c.rest && !c.pull), c => near(c.p.x, c.p.z));
    const rs = !kit && nearest(targets.filter(t => t.alive && !t.falling && t.kind === 'repair' && !skipped(t)), t => near(t.mesh.position.x, t.mesh.position.z));
    if (kit) { gx = kit.p.x; gz = kit.p.z; E.mode = 'kit'; }
    else if (rs) { aim = rs.mesh.position; aimObj = rs; E.mode = 'repairSafe'; }
    else if (E.sees) { [gx, gz] = fleeSpot(E, P); E.mode = 'flee'; }
  }
  if (gx === null && !aim && E.sees) {
    // 측면 우회: 내 정면 60도 안에 있으면 옆(110도 방향 14m)으로 돌아간다. 이미 옆·뒤거나 6초가 지나면 멈춰서 쏜다.
    // 돌아갈 쪽은 처음 한 번 정해 두고 바꾸지 않는다 (정면 한가운데서 좌우가 매번 뒤집혀 갈팡질팡하지 않게)
    _eT.set(0, 0, 1).applyQuaternion(P.q); _eT.y = 0; _eT.normalize();
    const rx = (E.pos.x - P.pos.x) / dp, rz = (E.pos.z - P.pos.z) / dp, front = rx * _eT.x + rz * _eT.z > 0.5;
    E.flankT = (E.flankT || 0) + dt;
    if (front && E.flankT < AI.flankTime) {
      if (!E.flankSide) { const cr = _eT.x * rz - _eT.z * rx; E.flankSide = Math.abs(cr) > 0.15 ? Math.sign(cr) : (rand() < 0.5 ? -1 : 1); }
      const a = Math.atan2(_eT.x, _eT.z) + E.flankSide * 1.92;
      gx = P.pos.x + Math.sin(a) * AI.flankDist; gz = P.pos.z + Math.cos(a) * AI.flankDist; E.mode = 'flank';
      if (near(gx, gz) < 4) E.flankT = AI.flankTime;
    } else { aim = P.pos; E.mode = 'attack'; }
  } else if (!E.sees) { E.flankT = 0; E.flankSide = 0; }
  if (gx === null && !aim && !look) {   // (벙커 앞에 닿아 두리번거리는 중이면 건너뛴다)
    const coin = nearest(coins.filter(c => !c.kit && c.rest && !c.pull && near(c.p.x, c.p.z) < AI.goldRange), c => near(c.p.x, c.p.z));
    if (E.seenX !== undefined && E.lost < AI.searchTime) {
      // 놓쳤으면 마지막으로 본(포성을 들은) 자리까지 가서 3초 두리번
      if (near(E.seenX, E.seenZ) > 4) { gx = E.seenX; gz = E.seenZ; E.mode = 'search'; }
      else { look = true; E.mode = 'look'; if ((E.lookT = (E.lookT || 0) + dt) > 3) { E.seenX = undefined; E.lookT = 0; } }
    } else if (coin) { gx = coin.p.x; gz = coin.p.z; E.mode = 'gold'; }
    else if (P && dp < PROWL_R) { gx = P.pos.x; gz = P.pos.z; E.mode = 'prowl'; }   // 가까이 있는 기척: 그쪽으로 어슬렁
    else {
      // 보급품 사냥: 가까운 보급품을 쏴서 골드를 노린다 (지붕 위 것은 빼고)
      const safe = nearest(targets.filter(t => t.alive && !t.falling && !t.roof && t.kind !== 'repair' && !skipped(t)), t => near(t.mesh.position.x, t.mesh.position.z));
      if (safe && near(safe.mesh.position.x, safe.mesh.position.z) < AI.safeHuntRange) { aim = safe.mesh.position; aimObj = safe; E.mode = 'hunt'; }
      else {
        if (!E.wx || near(E.wx, E.wz) < 6) { const s = dropSpot(E); E.wx = s.x; E.wz = s.z; }
        gx = E.wx; gz = E.wz; E.mode = 'wander';
      }
    }
  }
  // 겨눌 대상: 사거리 안이면 멈춰서 돌려 겨누고, 멀면 그쪽으로 다가간다
  let da = Infinity;
  if (aim) {
    da = near(aim.x, aim.z);
    if (da < FIRE_R - 4 && !E.wet) hold = true; else { gx = aim.x; gz = aim.z; }   // 물속에서는 멈추지 않고 빠져나온다
    // 내 탱크를 겨눌 때는 포탄이 날아가는 동안 갈 자리를 앞질러 겨눈다 (E.lead: 0 = 지금 자리, 1 = 정확히). 멈춰 서서 쏠 때만
    if (hold && !aimObj && E.lead > 0 && P) {
      const mv0 = E.muzzle || MUZZLE;
      let t = da / mv0;
      for (let k = 0; k < 2; k++) {
        _lead.set(P.pos.x + P.vel.x * t * E.lead, P.pos.y, P.pos.z + P.vel.z * t * E.lead);
        t = near(_lead.x, _lead.z) / mv0;
      }
      aim = _lead; da = near(aim.x, aim.z);
    }
  }
  // 가려는 곳은 늘 지도 안쪽으로 자른다 (내가 가장자리에 있을 때 옆으로 돌아 들어갈 자리 등이 지도 밖이면 벽을 향해 계속 버둥댔다)
  if (gx !== null) { gx = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, gx)); gz = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, gz)); }
  const goalYaw = hold ? Math.atan2(aim.x - E.pos.x, aim.z - E.pos.z) : look ? yaw + 1 : Math.atan2(gx - E.pos.x, gz - E.pos.z);
  if (hold) { E.goalX = aim.x; E.goalZ = aim.z; } else if (look) E.goalX = undefined; else { E.goalX = gx; E.goalZ = gz; }   // AI 표시용
  // 앞을 미리 살펴 막힌 방향(건물·절벽 등)은 피해 간다 (0.12초마다 다시 고름). 겨눌 때·두리번거릴 때는 그대로
  // 장애물을 피해 꺾은 방향은 0.5초 동안 유지한다 (0.12초마다 좌우로 다시 골라 갈팡질팡하던 것). 그 방향이 막히면 바로 다시 고른다
  if (hold || look) E.steerYaw = goalYaw;
  else {
    E.steerT -= dt;
    if (E.steerT <= 0 || E.steerYaw === undefined || blockedYaw(E, E.steerYaw)) {
      const ny = clearYaw(E, goalYaw), dv = Math.atan2(Math.sin(ny - goalYaw), Math.cos(ny - goalYaw));
      E.steerYaw = ny; E.steerT = Math.abs(dv) > 0.05 ? 0.5 : 0.12;
    }
  }
  let diff = E.steerYaw - yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // 부드럽게: 많이 틀어야 하면 천천히 굴러가며 돌고, 거의 맞으면 전속
  const turn = look ? 0.6 : Math.max(-1, Math.min(1, diff * 1.8));
  let thr = hold || look ? 0 : Math.abs(diff) < 0.3 ? 1 : Math.max(0, 1 - Math.abs(diff) / 1.4) * 0.8 + 0.15;
  E.cool -= dt;
  // 포각: 포구 속도로 겨눈 대상까지 닿는 낮은 탄도각 (몸체 기울기만큼 뺀다)
  let want = 0.2;
  const mv = E.muzzle || MUZZLE;
  if (aim && da < FIRE_R + 3) {
    const h = aim.y - (E.pos.y + 1.95), v2 = mv * mv, disc = v2 * v2 - G * (G * da * da + 2 * h * v2);   // 포구는 무게중심보다 2m쯤 위
    if (disc > 0) want = Math.atan((v2 - Math.sqrt(disc)) / (G * da)) - Math.asin(Math.max(-1, Math.min(1, _fwd.y)));
  }
  // 같은 대상을 계속 겨누는 동안은 실제 탄도 시험으로 찾은 보정값을 더한다
  const aimKey = aimObj || (aim ? 'player' : null);
  if (aimKey !== E.aimKey) { E.aimKey = aimKey; E.elevBias = 0; E.blocked = 0; }
  want = Math.max(-0.1, Math.min(0.96, want + (E.elevBias || 0)));
  E.elev += Math.max(-0.55 * dt, Math.min(0.55 * dt, want - E.elev));
  // 쏘기 전에 지금 포신 그대로 쏘면 어디에 맞는지 미리 계산해 본다 (0.25초마다).
  // 겨눈 대상에 맞을 때만 쏘고, 짧거나 길면 포각을 고치고, 잔해·건물·둑에 막히면 옆으로 자리를 옮긴다
  if (hold && E.cool <= 0 && Math.abs(diff) < 0.06 && Math.abs(want - E.elev) < 0.03 && (E.predT = (E.predT || 0) - dt) <= 0) {
    E.predT = 0.25;
    // 내 탱크: 지금 맞거나, 앞질러 겨눈 자리 2.5m 안에 떨어지면 쏜다 (사이에 건물·잔해·다른 적이 막고 있으면 그 앞에 떨어지므로 안 쏜다)
    const h = predictShot(E), ok = h && (aimObj ? h.target === aimObj : h.enemy === tank || (!h.enemy && !h.target && Math.hypot(h.p.x - aim.x, h.p.z - aim.z) < 2.5));
    if (ok) {
      fireCannon(E, E.spread ?? ENEMY_SPREAD); E.cool = E.reload * AI.fireWait * rr(0.9, 1.2); E.blocked = 0;   // 맞을 각도라도 아주 조금 흩뜨린다
      if (aimObj) {
        E.shots = E.shotAt === aimObj ? (E.shots || 0) + 1 : 1; E.shotAt = aimObj;
        if (E.shots >= 3) { (E.skip = E.skip || new Map()).set(aimObj, U.uTime.value + 20); E.shots = 0; }
      }
    } else {
      const land = h ? Math.hypot(h.p.x - E.pos.x, h.p.z - E.pos.z) : Infinity;
      if (land < da - 1.5 && !h.enemy && !h.target) E.elevBias = Math.min(0.3, (E.elevBias || 0) + 0.03);   // 앞에 떨어짐: 더 높이
      else if (land > da + 1.5) E.elevBias = Math.max(-0.3, (E.elevBias || 0) - 0.03);                     // 넘어감: 더 낮게
      // 2초 동안 막혀 못 쏘면 옆으로 10m쯤 비켜 선 자리로. 움직이는 내 탱크를 놓친 것(목표 근처나 너머에 떨어짐)은 막힘으로 세지 않는다
      if ((!h || land < da - 4 || (h.enemy && h.enemy !== tank)) && ++E.blocked >= 8) {
        E.blocked = 0; E.elevBias = 0;
        const side = rand() < 0.5 ? -1 : 1;
        E.dx = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, E.pos.x + _fwd.z * side * 10));
        E.dz = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, E.pos.z - _fwd.x * side * 10));
        E.detour = 3;
      }
    }
  }
  // 끼어서 안 나가면: 막힌 곳에서 3.5m 떨어질 때까지 곧게 후진 (최대 2.5초. 뒤도 막혔으면 후진 없이) →
  // 좌우 중 더 열린 쪽으로 10m쯤 비켜 선 지점(지도 안쪽)을 거쳐 간다
  if (E.rev > 0) {
    E.rev -= dt;
    if (Math.hypot(E.pos.x - E.revX, E.pos.z - E.revZ) > 3.5) E.rev = 0;
    _eAim.thr = -1; _eAim.turn = 0; return _eAim;
  }
  if (thr > 0.3 && E.vel.dot(_fwd) < 0.5) E.stuck += dt; else E.stuck = Math.max(0, E.stuck - dt * 2);
  if (E.stuck > 1.6) {
    E.stuck = 0;
    E.rev = blockedYaw(E, yaw + Math.PI) ? 0 : 2.5; E.revX = E.pos.x; E.revZ = E.pos.z;
    const oL = openness(E, yaw + 1.3), oR = openness(E, yaw - 1.3);
    const a = yaw + (oL === oR ? (rand() < 0.5 ? 1.3 : -1.3) : oL > oR ? 1.3 : -1.3), d = rr(9, 14);
    E.dx = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, E.pos.x + Math.sin(a) * d - _fwd.x * 3));
    E.dz = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, E.pos.z + Math.cos(a) * d - _fwd.z * 3));
    E.detour = 4; E.steerT = 0;
  }
  _eAim.thr = thr; _eAim.turn = turn;
  return _eAim;
}
// 지금 포신 방향으로 쏘면 처음 맞는 것 (실제 포탄과 같은 판정)
const _lead = new THREE.Vector3(), _pp = new THREE.Vector3(), _pv = new THREE.Vector3(), _pa = new THREE.Vector3(), _pb = { age: 0, owner: null, v: null };
function predictShot(E) {
  const dir = muzzle(E);
  _pp.copy(_tip); _pa.copy(_tip); _pv.copy(dir).multiplyScalar(E.muzzle || MUZZLE).addScaledVector(E.vel, VEL_INHERIT);
  _pb.age = 0; _pb.owner = E; _pb.v = _pv;
  for (let it = 0; it < 3000; it++) {
    _pv.y -= G * 0.004; _pp.addScaledVector(_pv, 0.004); _pb.age += 0.004;
    if (it % 6 === 5) { const h = ballHit(_pa, _pp, _pb); if (h) { h.time = _pb.age; return h; } _pa.copy(_pp); }   // time: 날아가는 시간
  }
  return null;
}
// 자주포 AI: 맵 전체를 본다. 움직이지 않고 차체만 돌려 내 탱크 둘레(오차 반경 안 아무 곳)를 겨눈 뒤,
// 정해진 포각으로 그 거리에 닿는 장약(발사 속도)을 골라 쏜다. 겨누는 동안은 내 탱크를 따라 돌고, 쏘는 순간 탄착점이 정해진다.
// 탄착 예상 지점은 하늘에서 비추는 빨간 원으로 미리 보여 준다 (spgWarns → updateRings)
const _sa = { thr: 0, turn: 0 }, spgWarns = [];
function spgAI(E, dt) {
  rescueTip(E, dt);
  _fwd.set(0, 0, 1).applyQuaternion(E.q);
  const yaw = Math.atan2(_fwd.x, _fwd.z), P = tank.solid ? tank : null, want = SC.elev * DEG;
  E.cool -= dt;
  E.elev += Math.max(-0.4 * dt, Math.min(0.4 * dt, want - E.elev));
  _sa.thr = 0; _sa.turn = 0;
  if (!P) { E.mode = 'idle'; E.goalX = undefined; return _sa; }
  if (!E.aimOfs) { const a = rand() * 6.283, r = Math.sqrt(rand()) * SC.error; E.aimOfs = [Math.sin(a) * r, Math.cos(a) * r]; E.aimT = 0; }
  const ax = Math.max(-HALF + 1, Math.min(HALF - 1, P.pos.x + E.aimOfs[0])), az = Math.max(-HALF + 1, Math.min(HALF - 1, P.pos.z + E.aimOfs[1]));
  E.goalX = ax; E.goalZ = az;
  // 방향은 차체가 아니라 실제 포신이 가리키는 쪽으로 잰다: 포각이 높아 차체가 비탈에 조금만 기울어도 옆으로 크게 빗나가므로
  const bd = muzzle(E), byaw = Math.hypot(bd.x, bd.z) > 0.05 ? Math.atan2(bd.x, bd.z) : yaw;
  let diff = Math.atan2(ax - _tip.x, az - _tip.z) - byaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  _sa.turn = Math.max(-1, Math.min(1, diff * 2.2));
  E.aimT += dt;
  E.mode = E.cool > 0 ? 'reload' : 'aim';
  if (E.cool <= 0 && E.aimT > SC.aimTime && Math.abs(diff) < 0.02 && Math.abs(want - E.elev) < 0.02) {
    const dir = muzzle(E), d = Math.hypot(ax - _tip.x, az - _tip.z), h = groundAt(ax, az) - _tip.y;
    const th = Math.asin(Math.max(-1, Math.min(1, dir.y))), c = Math.cos(th), den = 2 * c * c * (d * Math.tan(th) - h);
    if (den > 0.1) {
      E.muzzle = Math.sqrt(G * d * d / den);   // 이 포각으로 그 거리에 닿는 발사 속도
      const pred = predictShot(E);
      const ball = fireCannon(E, 0);
      if (pred) spgWarns.push({ ball, x: pred.p.x, z: pred.p.z, t0: U.uTime.value, T: Math.max(0.3, pred.time) });
      E.cool = E.reload * rr(0.9, 1.1); E.aimOfs = null;
    }
  }
  return _sa;
}
// ---------------------------------------------------------------- 적 지프
// 작고 가볍고 빠른 4륜 소형차. 보닛 위 기관총으로 내 둘레를 맴돌며 귀찮게 쏜다 (설정 jeep). 탱크 모델처럼 단순하고 귀엽게:
// 둥근 바퀴 넷(앞뒤 간격은 짧게), 앞이 경사진 보닛, 접힌 캔버스 지붕, 동그란 전조등, 뒤에 브레이크등
const JC = Object.assign({ max: 3, startLevel: 5, everyLevels: 10, startDelay: 8, respawnDelay: 10, hp: 20, armor: { front: 0, side: 0, rear: 0, top: 0, bottom: 0 }, maxSpeed: 11, accel: 1.8, turnMul: 1.5,
  mg: { range: 15, rate: 1, damage: 1 }, sightRange: 32, memory: 5, orbit: 12, goldDrop: 1 }, CFG.jeep);   // config.js에 jeep이 없어도 돌아가게
const jeepWanted = () => growLevel < JC.startLevel ? 0 : Math.min(JC.max, 1 + Math.floor((growLevel - JC.startLevel) / JC.everyLevels));
let jeepsSeen = 0;
const JEEP_WR = 0.42, JEEP_WX = 0.82, JEEP_WZ = 0.95;   // 바퀴 반지름, 좌우·앞뒤 자리
const JEEP_CPTS = [];
{
  const add = (x, y, z, side = 0) => JEEP_CPTS.push({ r: new THREE.Vector3(x, y, z).sub(COM), side });
  for (const sx of [1, -1]) {
    for (const z of [JEEP_WZ, -JEEP_WZ]) add(sx * JEEP_WX, 0.02, z, sx);   // 바퀴 (구동)
    for (const z of [1.4, -1.4]) { add(sx * 0.95, 0.55, z); add(sx * 0.95, 1.1, z); }
    for (const z of [0.6, -0.6]) add(sx * 0.7, 1.85, z);
    add(sx * 1.0, 0.8, 0);
  }
  add(0, 0.8, 1.45); add(0, 0.8, -1.45);
}
const JEEP_INV_I = new THREE.Vector3(1 / 1.0, 1 / 1.05, 1 / 0.65);   // 작아서 잘 돈다
const JEEP_COL = { body: 0xb0945e, dark: 0x8c7448, canvas: 0x5e5b4c, wheel: 0x2e2c28, hub: 0x6e6450 };
function buildJeep() {
  const root = new THREE.Group(), P = { wheels: [] };
  const m = (c) => lambert({ color: c });
  const box = (w, h, l, c, x, y, z, rx = 0, par = root) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m(c)); o.position.set(x, y, z); o.rotation.x = rx; par.add(o); return o; };
  // 차체: 아래 통 + 앞 보닛(앞으로 숙임) + 뒤 엔진 덮개(뒤로 숙임)
  box(1.5, 0.55, 2.6, JEEP_COL.body, 0, 0.84, 0);
  box(1.46, 0.3, 0.95, JEEP_COL.body, 0, 1.07, 0.92, 0.3);
  box(1.46, 0.3, 0.8, JEEP_COL.body, 0, 1.06, -0.98, -0.32);
  // 흙받이 넷 (바퀴 위로 조금 넓게)
  for (const sx of [1, -1]) for (const z of [JEEP_WZ, -JEEP_WZ]) box(0.38, 0.12, 0.98, JEEP_COL.dark, sx * JEEP_WX, 0.93, z);
  // 앞 유리 틀 + 유리, 접힌 캔버스 지붕 (위가 둥그스름하게 두 단)
  box(1.44, 0.5, 0.07, JEEP_COL.dark, 0, 1.36, 0.36, -0.22);
  box(1.3, 0.38, 0.03, 0x2a3036, 0, 1.38, 0.39, -0.22);
  box(1.5, 0.34, 1.15, JEEP_COL.canvas, 0, 1.58, -0.3);
  box(1.34, 0.12, 1.0, JEEP_COL.canvas, 0, 1.8, -0.3);
  // 바퀴: 굴러가게 묶음째로 돌린다 (가운데 허브는 밝게)
  for (const sx of [1, -1]) for (const z of [JEEP_WZ, -JEEP_WZ]) {
    const g = new THREE.Group(); g.position.set(sx * JEEP_WX, JEEP_WR, z); root.add(g);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(JEEP_WR, JEEP_WR, 0.32, 10), m(JEEP_COL.wheel)); t.rotation.z = Math.PI / 2; g.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), m(JEEP_COL.hub)); h.rotation.z = Math.PI / 2; g.add(h);
    g.userData.side = sx; P.wheels.push(g);
  }
  // 동그란 전조등 둘
  for (const sx of [1, -1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0xffe6a8 })); l.rotation.x = Math.PI / 2; l.position.set(sx * 0.52, 1.08, 1.33); root.add(l); }
  // 브레이크등 + 후광 (탱크와 같은 방식: 멈춤 빨강, 후진 흰색)
  P.brake = new THREE.MeshBasicMaterial({ color: BRAKE_OFF });
  P.halo = new THREE.SpriteMaterial({ map: glowTex, color: BRAKE_STOP, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  for (const sx of [1, -1]) {
    box(0.22, 0.12, 0.06, 0, sx * 0.58, 0.95, -1.31).material = P.brake;
    const sp = new THREE.Sprite(P.halo); sp.position.set(sx * 0.58, 0.95, -1.37); sp.scale.setScalar(0.6); root.add(sp);
  }
  // 기관총: 보닛 위 (예전 스페어타이어 자리). 탱크와 같은 총을 쓰고 자리만 옮긴다
  P.turret = new THREE.Group(); root.add(P.turret);
  P.guns = buildGuns(P.turret, 1);
  P.guns[0].group.position.set(0, 1.2, 0.85);
  // 탱크와 같이 다루려고 두는 빈 자리들 (포는 없음), 배기구는 뒤 아래
  P.pivot = new THREE.Object3D(); P.tip = new THREE.Object3D(); P.barrel = new THREE.Object3D();
  P.stack = new THREE.Object3D(); P.stack.position.set(0.5, 0.55, -1.35); root.add(P.pivot, P.tip, P.barrel, P.stack);
  P.belts = [];
  return { root, P };
}
function newJeep() {
  const { root, P } = buildJeep();
  markOutline(root);
  root.traverse((o) => { if (o.isSprite) o.layers.set(0); });
  scene.add(root);
  const E = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    sL: 0, sR: 0, dL: 0, dR: 0, yawCmd: 0, wet: false, elev: 0, cool: 99, recoil: 0, contacts: 0, solid: false,
    gold: 0, falling: false, vy: 0, landY: 0, group: root, P, thr: 0, puff: 0, stuck: 0, rev: 0, jeep: true, level: 0,
    hx: 1.0, hz: 1.45, ht: 1.9, cpts: JEEP_CPTS, invI: JEEP_INV_I,
    hp: JC.hp, maxHp: JC.hp, armor: JC.armor, spdM: JC.maxSpeed / VMAX, accM: JC.accel, turnM: JC.turnMul, reload: 99,
    guns: P.guns, mgSt: JC.mg,
  };
  ENEMIES.push(E); TANKS.push(E);
  return E;
}
// 지프 AI: 골드·수리는 신경 쓰지 않고 나만 노린다. 사방 JC.sightRange m 안에서 건물에 가리지 않으면 발견.
// 발견하면 내 둘레 JC.orbit m를 돌며 내 뒤쪽으로 파고든다 (계속 움직이며 기관총이 알아서 쏜다). 놓치면 마지막 본 자리로, 그래도 없으면 지도 여기저기 정찰
const _ja = { thr: 0, turn: 0 };
function jeepAI(E, dt) {
  rescueTip(E, dt);
  _fwd.set(0, 0, 1).applyQuaternion(E.q);
  const yaw = Math.atan2(_fwd.x, _fwd.z), P = tank.solid ? tank : null;
  const dP = P ? Math.hypot(P.pos.x - E.pos.x, P.pos.z - E.pos.z) : Infinity;
  E.sees = !!P && dP < JC.sightRange && sightClear(E.pos, P.pos);
  if (E.sees) { E.lastX = P.pos.x; E.lastZ = P.pos.z; E.memT = JC.memory; } else E.memT = (E.memT || 0) - dt;
  let gx, gz;
  if (P && E.sees) {
    _tmp.set(0, 0, 1).applyQuaternion(P.q);
    const rear = Math.atan2(_tmp.x, _tmp.z) + Math.PI, a = Math.atan2(E.pos.x - P.pos.x, E.pos.z - P.pos.z);
    let d = Math.atan2(Math.sin(rear - a), Math.cos(rear - a));
    if (Math.abs(d) < 0.5) d = (E.orbitDir || (E.orbitDir = rand() < 0.5 ? -1 : 1)) * 0.6;   // 이미 뒤쪽이면 그 둘레를 계속 돈다
    const na = dP < JC.orbit * 0.6 ? a : a + Math.max(-0.8, Math.min(0.8, d));   // 너무 붙었으면 먼저 바깥으로 빠진다
    gx = P.pos.x + Math.sin(na) * JC.orbit; gz = P.pos.z + Math.cos(na) * JC.orbit;
    E.mode = dP < JC.mg.range + 2 ? 'harass' : 'chase';
  } else if (bunkerAlarm(E)) {   // 벙커 지원: 벙커 둘레를 돈다 (나를 찾으면 바로 쫓는다)
    const B = bunkerAlarm(E), a = Math.atan2(E.pos.x - B.x, E.pos.z - B.z) + 0.5;
    gx = B.x + Math.sin(a) * 10; gz = B.z + Math.cos(a) * 10; E.mode = 'defend';
  } else if (P && E.memT > 0) { gx = E.lastX; gz = E.lastZ; E.mode = 'search'; }
  else {
    if (E.wx === undefined || Math.hypot(E.wx - E.pos.x, E.wz - E.pos.z) < 6 || (E.wanderT = (E.wanderT || 0) - dt) <= 0) { const s = dropSpot(E); E.wx = s.x; E.wz = s.z; E.wanderT = 20; }
    gx = E.wx; gz = E.wz; E.mode = 'explore';
  }
  gx = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, gx)); gz = Math.max(-GOAL_LIM, Math.min(GOAL_LIM, gz));
  E.goalX = gx; E.goalZ = gz;
  const want = clearYaw(E, Math.atan2(gx - E.pos.x, gz - E.pos.z));
  const diff = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
  // 걸려서 못 나가면 1초 후진하며 돌아선다
  if (E.rev > 0) { E.rev -= dt; _ja.thr = -1; _ja.turn = -Math.sign(diff || 1); return _ja; }
  E.stuck = Math.hypot(E.vel.x, E.vel.z) < 0.8 ? E.stuck + dt : 0;
  if (E.stuck > 1.2) { E.stuck = 0; E.rev = 1; }
  _ja.turn = Math.max(-1, Math.min(1, diff * 2.5));
  _ja.thr = Math.abs(diff) > 1.6 ? 0.45 : 1;   // 크게 돌 때만 조금 늦춘다
  return _ja;
}
// 지프 표시: 바퀴 굴리기, 밟힌 풀, 배기구 연기 조금, 많이 다치면 검은 연기
function jeepVisual(E, dt, thr) {
  E.dL += E.sL * dt; E.dR += E.sR * dt;
  for (const w of E.P.wheels) w.rotation.x = (w.userData.side > 0 ? E.dL : E.dR) / JEEP_WR;
  syncBody(E);
  trampleUnder(E);
  E.group.updateMatrixWorld(true);
  E.P.stack.getWorldPosition(_esp);
  for (E.puff += dt * (1 + Math.abs(thr) * 3) * rr(0.4, 1.6); E.puff >= 1; E.puff--) {
    const g = 0.12 + rand() * 0.08;
    smokeP.spawn(_esp.x, _esp.y, _esp.z, rr(-0.3, 0.3) + U.uWindDir.value.x * 0.6, rr(0.3, 0.8), rr(-0.3, 0.3) + U.uWindDir.value.y * 0.6,
      rr(0.6, 1.1), [g, g, g, 0.7], [g + 0.05, g + 0.05, g + 0.05, 0], rr(0.2, 0.35), rr(0.6, 1.1), -0.15, 0.6, 0.2);
  }
  if (E.hp <= E.maxHp * 0.45 && rand() < dt * 6)
    smokeP.spawn(E.pos.x + rr(-0.4, 0.4), E.pos.y + 1.2, E.pos.z + rr(-0.4, 0.4), rr(-0.3, 0.3), rr(1.5, 2.5), rr(-0.3, 0.3),
      rr(1.5, 2.5), [0.02, 0.02, 0.02, 0.9], [0.05, 0.05, 0.05, 0], rr(0.5, 0.8), rr(1.6, 2.4), -0.1, 0.4);
}
// 하늘에서 비추는 원형 빛: 0번 = 내 조준의 폭발 범위 (폭발 범위가 0보다 클 때), 1~4번 = 자주포 포격 예고 (먼저 떨어질 것부터).
// 포격 예고 원은 쏜 직후 폭발 범위의 2.5배(설정)였다가 탄착 순간 실제 폭발 범위로 줄어든다.
// 밝기: 처음엔 천천히(주기 spg.warnBlink초) 환했다가 깊게 어두워지기(spg.warnDark)를 되풀이해 '아직 시간이 남았다'를 알리고, 탄착이 가까워질수록 조금 빨라지다가
// 경과 spg.warnSteady 비율부터는 어두워지는 깊이가 서서히 줄어 탄착 순간엔 점멸 없이 환하게 켜진 채로 이어진다 (밝기 0이면 원이 꺼지므로 항상 0보다 크게)
function updateRings() {
  const r0 = U.uRing0.value[0];
  if (aimHitP && tank.solid && tank.blastR > 0) { r0.set(aimHitP.x, aimHitP.z, tank.blastR, tank.cool > 0 ? 0.35 : 0.85); U.uRing1.value[0].set(1, 0.6, 0.16, 0); }
  else r0.w = 0;
  for (let i = spgWarns.length - 1; i >= 0; i--) if (!balls.includes(spgWarns[i].ball)) spgWarns.splice(i, 1);
  spgWarns.sort((a, b) => (a.t0 + a.T) - (b.t0 + b.T));
  for (let k = 1; k < RING_N; k++) {
    const w = spgWarns[k - 1], v = U.uRing0.value[k];
    if (!w) { v.w = 0; continue; }
    const f = Math.min(1, (U.uTime.value - w.t0) / w.T);
    const grow = easeOutBack(Math.min(1, (U.uTime.value - w.t0) / 0.4));   // 처음 나타날 때 0에서 톡 튀어나오듯 커진다
    const tt = U.uTime.value - w.t0, P = Math.max(0.2, SC.warnBlink ?? 2.6), dk = Math.max(0.02, Math.min(1, SC.warnDark ?? 0.12));
    const phase = (tt + 0.6 * tt * tt / (2 * w.T)) * 6.2832 / P + 1.5708;   // 환한 데서 시작, 주기는 탄착 순간 60% 빨라진다 (위상이 끊기지 않게 적분한 식)
    const sOn = 0.5 + 0.5 * Math.sin(phase), st = Math.min(0.95, SC.warnSteady ?? 0.7);
    const tp = Math.max(0, Math.min(1, (f - st) / (0.98 - st))), taper = tp * tp * (3 - 2 * tp);   // 0 → 1: 점멸이 줄어드는 정도
    const dark = lerp(dk, 1, taper), hi = 0.9 + 0.5 * f;
    v.set(w.x, w.z, SC.blastRadius * lerp(SC.warnStart, 1, f) * Math.max(0, grow), hi * (dark + (1 - dark) * Math.pow(sOn, 1.6)));   // 어두운 쪽에 오래 머물러 점멸이 또렷하게
    U.uRing1.value[k].set(1, 0.2, 0.06, 0);
  }
}
// 그 방향으로 몇 m 앞이 건물·잔해·보급품·전봇대·벽·다른 탱크·절벽에 막혔는가
function blockedYaw(E, a) {
  const sx = Math.sin(a), cz = Math.cos(a), h0 = heightAt(E.pos.x, E.pos.z);
  for (const d of [2.6, 4.4, 6.4]) {
    const x = E.pos.x + sx * d, z = E.pos.z + cz * d;
    if (Math.abs(x) > WALL - 2.5 || Math.abs(z) > WALL - 2.5 || inFootprint(x, z, 1.6)) return true;
    if (cliffG[gridIndex(x, z)] > 0.3 || Math.abs(heightAt(x, z) - h0) > d * 0.55) return true;   // 절벽·급경사
    if (allPoles.some(p => Math.abs(p.x - x) < 1.8 && Math.abs(p.z - z) < 1.8)) return true;
    for (const T of TANKS) if (T !== E && T.solid && Math.hypot(T.pos.x - x, T.pos.z - z) < 3.4) return true;
  }
  return false;
}
// 그 방향으로 얼마나 트였는가 (2m 간격으로 12m까지, 막히기 전까지 칸 수). 지도 가장자리 근처도 막힌 것으로 본다
function openness(E, a) {
  const sx = Math.sin(a), cz = Math.cos(a), h0 = heightAt(E.pos.x, E.pos.z);
  let n = 0;
  for (let d = 2; d <= 12; d += 2, n++) {
    const x = E.pos.x + sx * d, z = E.pos.z + cz * d;
    if (Math.abs(x) > GOAL_LIM || Math.abs(z) > GOAL_LIM || inFootprint(x, z, 1.6) || cliffG[gridIndex(x, z)] > 0.3 || Math.abs(heightAt(x, z) - h0) > d * 0.55) break;
    if (TANKS.some(T => T !== E && T.solid && Math.hypot(T.pos.x - x, T.pos.z - z) < 3.4)) break;
  }
  return n;
}
// 목표 방향에서 가까운 순으로 좌우를 번갈아 보며 뚫린 방향을 고른다. 지난번에 피한 쪽을 먼저 봐서 좌우로 갈팡질팡하지 않게
const AVOID_OFS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.5, -2.5];
function clearYaw(E, goal) {
  const side = E.avoidSide || 1;
  for (const o of AVOID_OFS) {
    const a = goal + o * side;
    if (!blockedYaw(E, a)) { if (o) E.avoidSide = Math.sign(o * side); else E.avoidSide = 0; return a; }
  }
  return goal + Math.PI;   // 사방이 막혔으면 돌아선다
}
// 적 탱크 표시·효과: 궤도 무늬, 반동, 밟힌 풀, 굴뚝 연기, 많이 다치면 검은 연기
const _esp = new THREE.Vector3();
function enemyVisual(E, dt, thr) {
  E.dL += E.sL * dt; E.dR += E.sR * dt;
  E.P.belts[0].offset.x = E.dL / TREAD; E.P.belts[1].offset.x = E.dR / TREAD;
  if (E.P.wheelRot) E.P.wheelRot.value.set(E.dL, E.dR);
  E.recoil = Math.max(0, E.recoil - dt * 3); E.P.barrel.position.z = -0.5 * E.recoil;
  leanStep(E, dt);
  syncBody(E);
  trampleUnder(E);
  E.group.updateMatrixWorld(true);
  E.P.stack.getWorldPosition(_esp);
  for (E.puff += dt * (2 + Math.abs(thr) * 7) * rr(0.4, 1.6); E.puff >= 1; E.puff--) {
    const g = 0.03 + rand() * 0.06;
    smokeP.spawn(_esp.x, _esp.y, _esp.z, rr(-0.4, 0.4) + U.uWindDir.value.x * 0.6, rr(0.8, 1.6), rr(-0.4, 0.4) + U.uWindDir.value.y * 0.6,
      rr(0.8, 1.6), [g, g, g, 1], [g + 0.04, g + 0.04, g + 0.04, 0], rr(0.3, 0.6), rr(0.9, 1.8), -0.25, 0.8, 0.2);
  }
  if (E.hp <= E.maxHp * 0.45 && rand() < dt * 8)
    smokeP.spawn(E.pos.x + rr(-0.6, 0.6), E.pos.y + 1.6, E.pos.z + rr(-0.6, 0.6), rr(-0.3, 0.3), rr(1.5, 2.5), rr(-0.3, 0.3),
      rr(2, 3), [0.02, 0.02, 0.02, 0.9], [0.05, 0.05, 0.05, 0], rr(0.6, 1), rr(2, 3), -0.1, 0.4);
}
// 탱크 아래 풀은 눌린다
function trampleUnder(T) {
  if (T.contacts <= 0) return;
  _fwd.set(0, 0, 1).applyQuaternion(T.q);
  forCells(T.pos.x, T.pos.z, 2.3, (k, d, cx, cz) => {
    const dx = cx - T.pos.x, dz = cz - T.pos.z;
    const lz = dx * _fwd.x + dz * _fwd.z, lx = dx * _fwd.z - dz * _fwd.x;
    if (Math.abs(lx) < (T.hx ?? HULL_HX) && Math.abs(lz) < (T.hz ?? HULL_HZ)) fTr[k] = 1;
  });
}
// 남은 적 탱크 (떨어지는 중·증원 예약 포함)
const enemyLeft = () => MAX_DROPS - enemyDrops + dropTimers.length + spgTimers.length + ENEMIES.length - jeepCount();
// 적 탱크들 한 프레임: 증원 타이머, 낙하, AI (물리는 tick의 물리 루프에서)
function updateEnemies(dt) {
  // 빈자리만큼 증원 예약 (떨어지는 중·예약된 것까지 셈)
  for (let n = tankCount() + dropTimers.length; n < maxEnemies() && enemyDrops < MAX_DROPS; n++) { enemyDrops++; dropTimers.push({ t: rr(...EC.dropDelay), idx: enemyDrops + 1 }); }   // idx: 순번 (처음 1대가 1번)
  for (let i = dropTimers.length - 1; i >= 0; i--) if ((dropTimers[i].t -= dt) <= 0) { const idx = dropTimers[i].idx; dropTimers.splice(i, 1); startDrop(newEnemy(false, idx)); }
  // 자주포: 성장 단계만큼 (모자라면 3초 뒤, 부서진 것은 10초 뒤)
  if (spgCount() + spgTimers.length < spgWanted() && enemyDrops < MAX_DROPS) { enemyDrops++; spgTimers.push(3); }   // 자주포도 20대 중 한 대
  for (let i = spgTimers.length - 1; i >= 0; i--) if ((spgTimers[i] -= dt) <= 0) { spgTimers.splice(i, 1); spawnSpg(); }
  // 지프: 성장 5단계부터 1대, 10단계마다 1대 더 (최대 3대. 설정). 처음엔 8초 뒤, 부서지면 10초 뒤 떨어진다. 미션 클리어 뒤엔 더 안 나온다
  if (!missionClear && jeepCount() + jeepTimers.length < jeepWanted()) jeepTimers.push(jeepsSeen++ ? JC.respawnDelay : JC.startDelay);
  for (let i = jeepTimers.length - 1; i >= 0; i--) if ((jeepTimers[i] -= dt) <= 0) { jeepTimers.splice(i, 1); startDrop(newJeep()); }
  for (const E of ENEMIES) {
    if (E.falling) updateFall(E, dt);
    const ai = E.solid ? (E.spg ? spgAI(E, dt) : E.jeep ? jeepAI(E, dt) : enemyAI(E, dt)) : null;
    E.thr = ai ? ai.thr : 0; E.turn = ai ? ai.turn : 0;
  }
}

// 고른 성장 목록 (설정 메뉴 버튼): 고른 순서대로, 이름은 레어도 색
function drawPickLog() {   // 성장 초기화가 이 부분보다 먼저 불리므로 요소는 그때그때 찾는다
  const pickLogEl = document.getElementById('pickLog');
  if (pickLogEl.style.display === 'none') return;
  const list = tank.pickLog || [];
  pickLogEl.innerHTML = list.length ? list.map((c, i) => `<div>${i + 1}. <span style="color:${GC.rarity[c.u.rarity].color}">${c.label}</span> <span style="opacity:.6">${c.desc}</span></div>`).join('') : '<div style="opacity:.6">아직 고른 것이 없어요</div>';
}
document.getElementById('gLog').onclick = (e) => { const pickLogEl = document.getElementById('pickLog'); pickLogEl.style.display = pickLogEl.style.display === 'none' ? '' : 'none'; drawPickLog(); e.target.blur(); };
// 설정 메뉴: 내 탱크 좌표 (m)와 바라보는 방향 (°. 0 = +z, 90 = +x). 메뉴가 열려 있을 때만 0.2초마다
const tankPosEl = document.getElementById('tankPos');
let tankPosT = 0;
function updateTankPos(dt) {
  if ((tankPosT -= dt) > 0 || hudEl.style.display !== 'block') return;
  tankPosT = 0.2;
  dbgSync();
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  const yaw = (Math.round(Math.atan2(_fwd.x, _fwd.z) / DEG) + 360) % 360;
  tankPosEl.textContent = `{ x: ${tank.pos.x.toFixed(1)}, z: ${tank.pos.z.toFixed(1)}, yaw: ${yaw} }`;
}
// 대미지 플로터 (적 AI 표시를 켰을 때): 맞은 자리 위로 떠오르며 사라지는 한 줄. 최종 대미지 = 원래 대미지 × (1 - 방어력) × 장갑 강화, 소수점 버림
const dmgEl = document.getElementById('dmgFloat'), floaters = [];
const FACE_KO = { front: '정면', side: '측면', rear: '후면', top: '상단', bottom: '하단' };
const fmtN = (v) => String(Math.round(v * 100) / 100);
function addFloater(p, up, txt, col, key) {   // key: 같은 대상에 잇달아 뜨면 위로 한 줄씩 쌓는다
  if (floaters.length >= 30) floaters.shift().el.remove();
  const el = document.createElement('div'); el.textContent = txt; el.style.color = col; dmgEl.appendChild(el);
  // 같은 대상의 앞선 줄들이 새 줄과 1m 넘게 떨어지도록 위로 밀어 올린다 (빠르게 잇달아 맞아도 글자가 겹치지 않게)
  let y = p.y + up;
  for (const f of floaters.filter(f => f.key === key).sort((a, b) => a.p.y - b.p.y)) { if (f.p.y < y + 1) f.p.y = y + 1; y = f.p.y; }
  floaters.push({ p: new THREE.Vector3(p.x, p.y + up, p.z), el, t: 0, key });
}
const KIND_KO = { shell: '[포탄]', blast: '[범위]', mg: '[기관총]', ram: '[충돌]' };
function floatTank(T, d, raw, face, src, a, kind) {
  const who = `${KIND_KO[kind] || (face ? KIND_KO.shell : KIND_KO.ram)} ${T === tank ? '나' : T.spg ? '자주포' : T.jeep ? '지프' : '적'} `;
  let s;
  if (!face) s = `-${d} = ${fmtN(raw)} · 방어 무시`;
  else {
    const base = T.armor[face] ?? 0, pierce = base - a;
    s = `-${d} = ${fmtN(raw)} × ${fmtN(1 - a)}${(T.armorM || 1) !== 1 ? ` × 장갑 ${fmtN(T.armorM)}` : ''} · ${FACE_KO[face]} 방어 ${Math.round(base * 100)}%${pierce > 1e-6 ? ` - 관통 ${Math.round(pierce * 100)}%p` : ''}`;
  }
  addFloater(T.pos, 3.2, `${who}${s} · HP ${Math.max(0, Math.round(T.hp - Math.max(0, d)))}`, T === tank ? '#ff7a6a' : '#ffe9a0', T);
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    if (f.t > 4.4 || !aiShow) { f.el.remove(); floaters.splice(i, 1); continue; }
    f.p.y += dt * 2.4;
    _tmp.copy(f.p).project(camera);
    if (_tmp.z > 1) { f.el.style.display = 'none'; continue; }
    f.el.style.display = ''; f.el.style.left = `${VR.x + (_tmp.x + 1) / 2 * VR.w}px`; f.el.style.top = `${VR.y + (1 - _tmp.y) / 2 * VR.h}px`;
    f.el.style.opacity = 1 - smooth(3.4, 4.4, f.t);
  }
}
// 적 AI 표시 (설정 메뉴 토글): 시야 범위(앞쪽 부채꼴 + 소리로 아는 거리 원)와 지금 가려는·겨눈 곳(선), 포탑 위에 행동 목표 글자와 작은 체력 게이지. 벙커도 시야 부채꼴·글자·게이지
let aiShow = false;
const aiLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fe8ff, fog: false, depthTest: false, transparent: true, opacity: 0.8 }));
aiLines.frustumCulled = false; aiLines.renderOrder = 6; aiLines.visible = false; scene.add(aiLines);
const aiTagsEl = document.getElementById('aiTags'), aiTagPool = [];
const AI_MODE = { explore: '정찰', chase: '쫓아가기', harass: '맴돌며 사격', search: '놓친 자리 찾기', detour: '막혀서 비켜 가는 중', kit: '수리 도구 줍기', repairSafe: '수리 보급품 깨기', flee: '도망', flank: '옆으로 돌아 들어가기', attack: '공격',
  search: '놓친 곳 찾아가기', look: '두리번', defend: '벙커 지원', gold: '골드 줍기', prowl: '기척 쪽으로 접근', hunt: '골드 보급품 사냥', wander: '배회', aim: '포격 조준', reload: '포격 장전', idle: '대기' };
document.getElementById('aiBtn').onclick = (e) => { aiShow = !aiShow; e.target.textContent = aiShow ? '적 AI 표시 켜짐' : '적 AI 표시 꺼짐'; e.target.blur(); };
function updateAiView() {
  aiLines.visible = aiShow;
  if (!aiShow) { for (const d of aiTagPool) d.style.display = 'none'; return; }
  const p = [];
  const gy = (x, z) => groundAt(Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z))) + 0.4;
  const seg = (a, b) => p.push(a[0], gy(a[0], a[1]), a[1], b[0], gy(b[0], b[1]), b[1]);
  const tagAt = (i) => {   // 글자 줄 + 작은 체력 게이지
    let tag = aiTagPool[i];
    if (!tag) { tag = aiTagPool[i] = document.createElement('div'); tag.innerHTML = '<span></span><i><b></b></i>'; aiTagsEl.appendChild(tag); }
    return tag;
  };
  const showTag = (tag, x, y, z, txt, hpK) => {
    _tmp.set(x, y, z).project(camera);
    if (_tmp.z > 1) { tag.style.display = 'none'; return; }
    tag.style.display = ''; tag.style.left = `${VR.x + (_tmp.x + 1) / 2 * VR.w}px`; tag.style.top = `${VR.y + (1 - _tmp.y) / 2 * VR.h}px`;
    if (tag.firstChild.textContent !== txt) tag.firstChild.textContent = txt;
    const w = `${Math.round(Math.max(0, Math.min(1, hpK)) * 100)}%`;
    if (tag.lastChild.firstChild.style.width !== w) tag.lastChild.firstChild.style.width = w;
  };
  ENEMIES.forEach((E, i) => {
    const tag = tagAt(i);
    if (!E.solid) { tag.style.display = 'none'; return; }
    _fwd.set(0, 0, 1).applyQuaternion(E.q);
    const yaw = Math.atan2(_fwd.x, _fwd.z), at = (a, r) => [E.pos.x + Math.sin(yaw + a) * r, E.pos.z + Math.cos(yaw + a) * r];
    if (E.jeep) for (let k = 0; k < 24; k++) seg(at(k / 24 * 6.283, JC.sightRange), at((k + 1) / 24 * 6.283, JC.sightRange));   // 지프는 사방을 본다
    else if (!E.spg) {   // 자주포는 맵 전체를 보니 시야 표시 없음
      const A = AI.sightAngle * DEG;
      for (let k = 0; k < 12; k++) seg(at(-A + 2 * A * k / 12, SIGHT_R), at(-A + 2 * A * (k + 1) / 12, SIGHT_R));
      seg([E.pos.x, E.pos.z], at(-A, SIGHT_R)); seg([E.pos.x, E.pos.z], at(A, SIGHT_R));
      for (let k = 0; k < 16; k++) seg(at(k / 16 * 6.283, HEAR_R), at((k + 1) / 16 * 6.283, HEAR_R));
    }
    if (E.goalX !== undefined) seg([E.pos.x, E.pos.z], [E.goalX, E.goalZ]);
    showTag(tag, E.pos.x, E.pos.y + 3.6, E.pos.z, `${E.spg ? '자주포 · ' : E.jeep ? '지프 · ' : `Lv${E.level} · `}${AI_MODE[E.mode] || E.mode || '-'} · HP ${Math.max(0, Math.round(E.hp))}${E.sees ? ' · 발견!' : ''}`, E.hp / E.maxHp);
  });
  let ti = ENEMIES.length;
  for (const B of BUNKERS) {   // 벙커: 시야 기준점에서 시야 부채꼴 (탱크와 같은 식), 지붕 위에 글자·게이지
    if (B.ruin) continue;
    const A = BK.angle * DEG, ox = B.x + Math.sin(B.rot) * BK_EYE_Z, oz = B.z + Math.cos(B.rot) * BK_EYE_Z;
    const at = (a, r) => [ox + Math.sin(B.rot + a) * r, oz + Math.cos(B.rot + a) * r];
    for (let k = 0; k < 12; k++) seg(at(-A + 2 * A * k / 12, BK.sight), at(-A + 2 * A * (k + 1) / 12, BK.sight));
    seg([ox, oz], at(-A, BK.sight)); seg([ox, oz], at(A, BK.sight));
    if (B.sees) seg([ox, oz], [tank.pos.x, tank.pos.z]);
    showTag(tagAt(ti++), B.x, B.y + BK_H + 0.8, B.z, `벙커 · HP ${Math.max(0, Math.round(B.hp))}${B.sees ? ' · 발견!' : ''}`, B.hp / BK.hp);
  }
  for (let i = ti; i < aiTagPool.length; i++) aiTagPool[i].style.display = 'none';
  aiLines.geometry.dispose();
  aiLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}

