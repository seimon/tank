// ---------------------------------------------------------------- 벙커 (map.js로 놓는다. 모델·배치는 20_objects.js)
// 정해진 방향으로 시야각(좌우 angle°)·시야 거리 안에 내 탱크가 보이면(땅·건물에 가리지 않으면) 기관총을 빠르게 쏜다.
// 체력 BK.hp, 방어력 BK.armor (관통탄만큼 깎인다). 부서지면 잔해 모델로 바뀌고 금화가 나온다. 잔해는 부서지지 않는다
const _bkA = new THREE.Vector3(), _bkT = new THREE.Vector3(), _bkN = new THREE.Vector3();
const BK_SRC = { pierce: 0 };   // 벙커 기관총은 관통 없음
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function updateBunkers(dt) {
  const active = !editMode && !aiFrozen && titleState === 'play' && tank.solid && !missionClear;
  let sirenD = Infinity;   // 경보 중인 가장 가까운 벙커까지 (사이렌 소리 크기)
  for (const B of BUNKERS) {
    // 사이렌: 경보 중이면 빛줄기가 돌고 덮개가 깜박이며 빛난다
    B.alarmOn = !B.ruin && !!B.beams && B.alarmT > U.uTime.value;
    if (B.beams) {
      B.beams.visible = B.alarmOn;
      if (B.alarmOn) {
        B.sirenA = ((B.sirenA || 0) + dt * 7.5) % (Math.PI * 2);   // 1초에 1바퀴 남짓
        B.beams.rotation.y = B.sirenA;
        B.sirenMat.emissive.setRGB(0.9 + 0.1 * Math.sin(B.sirenA * 2), 0.08, 0.04);
        sirenD = Math.min(sirenD, Math.hypot(B.x - controls.target.x, B.z - controls.target.z));
      } else B.sirenMat.emissive.setRGB(0.1, 0, 0);
    }
    if (B.ruin || !B.gun) continue;
    B.cool -= dt;
    if ((B.seeT -= dt) <= 0) {   // 시야 검사는 0.15초마다 (가볍게)
      B.seeT = 0.15; B.sees = false;
      if (active) {
        _bkA.set(B.x + Math.sin(B.rot) * BK_EYE_Z, B.y + BK_SLIT_Y, B.z + Math.cos(B.rot) * BK_EYE_Z);   // 시야 기준점 (앞 테두리에서 안쪽으로 1/4)
        _bkT.set(tank.pos.x, tank.pos.y + 0.9, tank.pos.z);
        const dx = _bkT.x - _bkA.x, dz = _bkT.z - _bkA.z, rel = wrapPi(Math.atan2(dx, dz) - B.rot);
        if (Math.hypot(dx, dz) < BK.sight && Math.abs(rel) < BK.angle * DEG && mgClear(_bkA, _bkT, B.fp)) { B.sees = true; B.want = rel; }
      }
    }
    // 총구는 시야각 안에서만 돈다. 못 보면 천천히 가운데로
    const want = B.sees ? B.want : 0, turn = BK.turn * DEG * dt * (B.sees ? 1 : 0.3);
    B.gunYaw += Math.max(-turn, Math.min(turn, want - B.gunYaw));
    B.gun.rotation.y = B.gunYaw;
    if (B.sees && Math.abs(want - B.gunYaw) < 0.1 && B.cool <= 0) { B.cool = 1 / BK.mg.rate; bunkerFire(B); }
  }
  const wk = clearSeq ? 1 - clearSeq.k : 1;   // 임무 완료: 카메라가 넘어가는 동안 사이렌도 서서히 끈다 (날씨 소리와 같이)
  sfx.siren(sirenD < Infinity ? wk / (1 + Math.max(0, sirenD - 6) / 22) : 0, 1 / (1 + sirenD / 60));   // 가까울수록 크고 또렷하게
}
function bunkerFire(B) {
  B.tip.getWorldPosition(_bkA);
  _bkT.set(tank.pos.x + rr(-0.7, 0.7), tank.pos.y + rr(0.5, 1.7), tank.pos.z + rr(-0.7, 0.7));
  mgSurface({ E: tank }, _bkA, _bkT, _bkT);   // 맞은 자리 = 내 탱크 표면 (빗나간 자리면 그대로)
  mgTracers.push({ a: _bkA.clone(), b: _bkT.clone(), t: 0, en: true });
  sparks(_bkT, _bkN.copy(_bkA).sub(_bkT).normalize(), 0.35);   // (연사라 작게)
  flashes.push({ p: _bkT.clone().addScaledVector(_bkN, 0.25), t: 0, dur: 0.06, I: 45, range: 6, color: 0xffc890 });   // 맞은 자리 불빛
  flashes.push({ p: _bkA.clone(), t: 0, dur: 0.07, I: 90, range: 10, color: 0xffd08a });
  sfx.mg(_bkA);
  dmgFromP = _bkA;   // 대미지 숫자: 벙커 총구 반대쪽으로
  const hurt = damageTank(tank, BK.mg.damage, faceAt(tank, _bkA), BK_SRC, 'mg') > 0;
  if (hurt) sfx.mgHit(_bkT); else sfx.mgPing(_bkT);
}
// 대미지: 방어력(관통탄만큼 덜)을 적용하고 소수점 버림
function damageBunker(B, raw, src, kind) {   // kind 'mg': 기관총 (관통은 '철갑 기관총' 조합이 있을 때만, damageTank와 같다)
  if (B.ruin || editMode || rulesLocked()) { dmgCrit = false; return 0; }   // 섬멸 창 동안은 값이 안 바뀐다
  if (src === tank && tank.bunkerMul > 1) raw *= tank.bunkerMul;   // '벙커버스터'
  const pierce = kind !== 'mg' || (src && src.apMg) ? (src && src.pierce) || 0 : 0;
  const a = Math.max(0, BK.armor - pierce), d = Math.floor(raw * (1 - a) + 1e-6);
  if (aiShow) addFloater(_bkT.set(B.x, B.y + BK_H, B.z), 2, `벙커 -${d} · 방어 ${Math.round(a * 100)}% · HP ${Math.max(0, B.hp - d)}`, '#ff8a5a', B);
  if (src === tank) B.alarmT = U.uTime.value + BK.alarm;   // 내가 공격하면 경보: 적이 지원하러 달려온다 (막혀 대미지가 0이어도)
  dmgTextHitAt(_bkT.set(B.x, B.y + BK_H + 0.6, B.z), Math.max(0, d), dmgFromP || (src && src.pos) || null, dmgCrit, d > 0 && B.hp - d <= 0); dmgFromP = null; dmgCrit = false;   // 대미지 숫자 (지붕 위. 치명타·파괴 표시)
  if (d <= 0) return 0;
  B.hp -= d;
  if (B.hp <= 0) ruinBunker(B); else bunkerCrack(B);   // 체력에 따라 금 간 무늬
  return d;
}
// 경보 중인 가장 가까운 벙커 (부서지면 끝)
function bunkerAlarm(E) {
  let best = null, bd = Infinity;
  for (const B of BUNKERS) {
    if (B.ruin || !(B.alarmT > U.uTime.value)) continue;
    const d = Math.hypot(B.x - E.pos.x, B.z - E.pos.z);
    if (d < bd) { bd = d; best = B; }
  }
  return best;
}
function ruinBunker(B) {
  B.ruin = true; B.hp = 0; B.sees = false;
  bunkerMesh(B);   // 부서진 모델로
  const c = new THREE.Vector3(B.x, B.y + 1.4, B.z);
  explode(c, UP, true, 2.2);
  spawnShards(c, 60, CONCRETE_COLS, 4, 15, null, 0.25, 0.8, 2.2);
  for (let k = 0; k < 20; k++) smokeP.spawn(c.x + rr(-2.5, 2.5), c.y + rr(-0.5, 1.5), c.z + rr(-2, 2), rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), rr(1.2, 2.2), [0.42, 0.4, 0.37, 0.7], [0.3, 0.3, 0.3, 0], 1, 3, -0.2, 1.5, 0.5);
  if (BK.gold > 0) spawnCoins(c, BK.gold);
  shake = Math.min(1.4, shake + Math.max(0.2, 0.9 - camera.position.distanceTo(c) / 80));
}
