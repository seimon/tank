// ---------------------------------------------------------------- 탱크 물리 (강체 + 접촉점 페널티)
// 질량 1로 정규화. 궤도 접촉점은 벨트 속도만큼 지면을 밀어 추진하고, 마찰 한계를 넘으면 미끄러진다
const G = 9.8, K = 300, C = 8, KT = 25, MU = 0.75, MU_LAT = 0.6;
const PC = CFG.player, PM = CFG.playerMax;
const INIT_ELEV = PC.initElev * DEG;   // 포각 처음 값
const VMAX = PC.maxSpeed, ACC = PC.accel, PHYS_H = 1 / 480;   // 최고 속도·가속 (내 탱크 처음 값. 적은 배율로)
const TURN_RATE = PC.turnRate * DEG, TURN_ACC = 6, YAW_GAIN = 40, YAW_TQ = 30, VTURN = TURN_RATE * TRACK_X;
const MUZZLE = PC.muzzle, RECOIL = 0.9, BALL_R = 0.54;   // 쇠구슬 지름 1.08m
const COM = new THREE.Vector3(0, 0.02, 0);   // 무게중심을 궤도 접지면 높이까지 낮춤: 빠르게 돌아도 옆으로 넘어가려는 힘이 거의 없다   // 질량의 90%가 차체·궤도: 포탑과 포는 거의 무게가 없다
const INV_I = new THREE.Vector3(1 / 2.55, 1 / 2.7, 1 / 1.83);
const CPTS = [];
const addCP = (x, y, z, side = 0) => CPTS.push({ r: new THREE.Vector3(x, y, z).sub(COM), side });
for (const s of [1, -1]) {
  for (const z of [-1.4, -0.7, 0, 0.7, 1.4]) addCP(s * TRACK_X, 0.02, z, s);
  for (const z of [-1.9, 1.9]) addCP(s * TRACK_X, 0.5, z, s);
  for (const z of [-1.9, -0.95, 0, 0.95, 1.9]) addCP(s * 1.44, 0.8, z);
  addCP(s * 1.45, 1.3, 1.95); addCP(s * 1.45, 1.3, -1.95);
  addCP(s * 1.15, 2.78, 1.23); addCP(s * 1.15, 2.78, -0.57); addCP(s * 1.15, 2.08, 0.33); addCP(s * 0.8, 1.9, -0.9);
}
for (const x of [-0.9, 0, 0.9]) { addCP(x, 0.8, 1.95); addCP(x, 0.8, -1.95); }
addCP(0, 2.78, 0.33);

const tank = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
  sL: 0, sR: 0, dL: 0, dR: 0, yawCmd: 0, wet: false, load: 0, elev: INIT_ELEV, cool: 0, recoil: 0, contacts: 0, solid: true,
  hp: PC.hp, maxHp: PC.hp, armor: PC.armor, falling: false, vy: 0, landY: 0, group: tankGroup, P: parts,   // hp: 체력 (0이 되면 폭발)
};
const TANKS = [tank];   // 서로 부딪히는 탱크들 (적 탱크도 여기에)
const UP = new THREE.Vector3(0, 1, 0);
const _rw = new THREE.Vector3(), _pw = new THREE.Vector3(), _vp = new THREE.Vector3(), _n = new THREE.Vector3();
const _vt = new THREE.Vector3(), _bd = new THREE.Vector3(), _lat = new THREE.Vector3(), _ft = new THREE.Vector3();
const _f = new THREE.Vector3(), _F = new THREE.Vector3(), _T = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _loc = new THREE.Vector3(), _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion();
function groundAt(x, z) {
  if (Math.abs(x) <= HALF && Math.abs(z) <= HALF) return Math.max(heightAt(x, z), bridgeDeckAt(x, z));
  return -1e9;
}
function normalAt(x, z, out) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return out.set(0, 1, 0);
  const e = 0.3;
  if (bridgeDeckAt(x, z) > heightAt(x, z)) {   // 다리 위: 상판 경사를 따른다
    const sf = (x, z) => Math.max(heightAt(x, z), bridgeDeckAt(x, z));
    return out.set(sf(x - e, z) - sf(x + e, z), 2 * e, sf(x, z - e) - sf(x, z + e)).normalize();
  }
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}
// 물리 계산 대상 탱크 (내 탱크 / 적 탱크). 아래 함수들은 이 몸체를 움직인다
let B = tank;
const _qo = new THREE.Quaternion();
function resetTank(x, z, yaw, body = tank) {
  B = body;
  // 경사면에 맞춰 기울여 놓고, 네 모서리가 땅에 박히지 않을 만큼 들어 올린다
  const e = 1.5;
  _n.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  B.q.setFromAxisAngle(UP, yaw).premultiply(_qi.setFromUnitVectors(UP, _n));
  const base = new THREE.Vector3(x, heightAt(x, z), z);
  let lift = 0;
  const hx = B.hx ?? HULL_HX, hz = B.hz ?? HULL_HZ;
  for (const [a, b] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) {
    const p = _tmp.set(a, 0, b).applyQuaternion(B.q).add(base);
    lift = Math.max(lift, heightAt(p.x, p.z) - p.y);
  }
  B.pos.copy(COM).applyQuaternion(B.q).add(base);
  B.pos.y += lift + 0.08;
  B.vel.set(0, 0, 0); B.w.set(0, 0, 0); B.sL = B.sR = B.yawCmd = 0;
}
function applyAngularImpulse(L, body = tank) {
  B = body;
  _tmp.copy(L).applyQuaternion(_qi.copy(B.q).invert()).multiply(B.invI || INV_I).applyQuaternion(B.q);
  B.w.add(_tmp);
}
// 접촉 한 점의 힘: 법선 스프링-댐퍼 + 쿨롱 마찰. 궤도 점은 벨트 속도를 빼서 미끄럼을 계산
function contactForce(cp, pen, n, wall) {
  const vn = _vp.dot(n), fn = K * pen - C * vn;
  if (fn <= 0) return;
  _vt.copy(_vp).addScaledVector(n, -vn);
  if (cp.side && !wall) {
    _bd.copy(_fwd).addScaledVector(n, -_fwd.dot(n)).normalize();
    _vt.addScaledVector(_bd, -(cp.side > 0 ? B.sL : B.sR));
    const sl = _vt.dot(_bd);
    _lat.copy(_vt).addScaledVector(_bd, -sl);
    const fl = Math.max(-MU * fn, Math.min(MU * fn, -sl * KT));
    _ft.copy(_lat).multiplyScalar(-KT);
    const lm = _ft.length(), lmax = MU_LAT * fn;
    if (lm > lmax) _ft.multiplyScalar(lmax / lm);
    _ft.addScaledVector(_bd, fl);
  } else {
    _ft.copy(_vt).multiplyScalar(-KT);
    const m = _ft.length(), mx = MU * fn * (wall ? 0.3 : 1);
    if (m > mx) _ft.multiplyScalar(mx / m);
  }
  _f.copy(n).multiplyScalar(fn).add(_ft);
  _F.add(_f); _T.add(_tmp.crossVectors(_rw, _f));
}
// 쇠끼리 부딪힌 순간 한 번만 스파크: 접촉점이 1.2m/s 이상으로 파고들 때, 같은 탱크는 0.35초에 한 번
// 나무(집·전봇대)에 부딪힌 순간: 둔탁한 소리만 (스파크 없음)
function woodHit() {
  if (-_vp.dot(_n) < 1.0 || U.uTime.value - (B.woodAt || -9) < 0.35) return;
  B.woodAt = U.uTime.value;
  if (B === tank) padRumble(0.3, 0.45, 90);   // 패드 진동: 부딪힘
  sfx.wood(_pw, Math.min(1.4, 0.5 - _vp.dot(_n) * 0.25));
}
function metalHit() {
  if (-_vp.dot(_n) < 1.2 || U.uTime.value - (B.sparkAt || -9) < 0.35) return;
  B.sparkAt = U.uTime.value;
  if (B === tank) padRumble(0.4, 0.55, 100);   // 패드 진동: 쇠끼리 부딪힘
  sparks(_pw, _n);
}
// 불똥: 작고 밝은 점이 빠르게 사방으로 튀고, 날아가는 자리마다 더 작은 점을 흘려 선처럼 보이게 (뿌연 덩어리 없이)
// 노랗게 시작해 붉게 식는다. 중력 없이 곧은 직선으로 팍 퍼졌다가 빠르게 느려지며 사라진다
const SPARK_COL0 = [1, 0.92, 0.45, 1], SPARK_COL1 = [0.85, 0.08, 0.02, 0];
function sparks(p, n) {
  for (let k = 0; k < 46; k++) {
    _tmp.set(n.x * 0.9 + rr(-1, 1), rr(-0.2, 1), n.z * 0.9 + rr(-1, 1)).normalize();
    const s = rr(14, 30), vx = _tmp.x * s, vy = _tmp.y * s, vz = _tmp.z * s, ttl = rr(0.15, 0.38);
    glowP.spawn(p.x, p.y, p.z, vx, vy, vz, ttl, SPARK_COL0, SPARK_COL1, rr(0.22, 0.32), 0.05, 0, 4.5);
    for (let j = 1; j <= 3; j++) {   // 꼬리: 같은 방향으로 조금씩 늦게 출발한 더 작은 점
      const d = j * 0.012;
      glowP.spawn(p.x - vx * d, p.y - vy * d, p.z - vz * d, vx, vy, vz, ttl * (1 - j * 0.15), SPARK_COL0, SPARK_COL1, 0.16 - j * 0.03, 0.03, 0, 4.5);
    }
  }
  flashes.push({ p: p.clone(), t: 0, dur: 0.1, I: 70, range: 10, color: 0xffd890 });
  sfx.metal(p);
}
function physStep(h, thr, turn, body = tank) {
  B = body;
  // 몸체마다 성능 배율 (성장 테스트 슬라이더: 내 탱크만). 시냇물 안에서는 절반 속도
  const vmax = VMAX * (B.spdM || 1) * (B.wet ? B.waterSpeed ?? PC.waterSpeed : 1), acc = ACC * (B.accM || 1), vturn = VTURN * (B.turnM || 1);
  // 빠를 때는 덜 꺾이게 (초속 7m를 넘으면 그만큼 선회를 줄인다): 고속 급선회로 차체가 뒤집히지 않게
  turn *= Math.min(1, 7 / Math.max(7, Math.abs(B.vel.dot(_fwd.set(0, 0, 1).applyQuaternion(B.q)))));
  const tgtL = thr * vmax - turn * vturn, tgtR = thr * vmax + turn * vturn;
  B.sL += Math.max(-acc * h, Math.min(acc * h, tgtL - B.sL));
  B.sR += Math.max(-acc * h, Math.min(acc * h, tgtR - B.sR));
  _fwd.set(0, 0, 1).applyQuaternion(B.q);
  _qi.copy(B.q).invert();
  _F.set(0, -G, 0); _T.set(0, 0, 0);
  B.contacts = 0;
  for (const cp of B.cpts || CPTS) {
    _rw.copy(cp.r).applyQuaternion(B.q);
    _pw.copy(B.pos).add(_rw);
    _vp.crossVectors(B.w, _rw).add(B.vel);
    let pen = groundAt(_pw.x, _pw.z) - _pw.y;
    if (pen > 0) {
      if (Math.abs(_pw.x) <= HALF && Math.abs(_pw.z) <= HALF) normalAt(_pw.x, _pw.z, _n); else _n.set(0, 1, 0);
      contactForce(cp, pen, _n, false);
      if (cp.side) B.contacts++;
    }
    // 보드 경계 = 하늘 끝까지 막힌 투명한 벽
    const ox = Math.abs(_pw.x) - WALL, oz = Math.abs(_pw.z) - WALL;
    if (ox > 0) { _n.set(-Math.sign(_pw.x), 0, 0); contactForce(cp, ox, _n, true); }
    if (oz > 0) { _n.set(0, 0, -Math.sign(_pw.z)); contactForce(cp, oz, _n, true); }
    for (const fp of footprints) {
      if (_pw.y >= fp.top || _pw.y <= fp.y0 - 1) continue;
      fpLocal(fp, _pw.x, _pw.z, _fl);
      const ox = fp.hx - Math.abs(_fl.x), oz = fp.hz - Math.abs(_fl.z);
      if (ox > 0 && oz > 0) {
        // 부딪혀 부서질 대상은 막지 않고 지나간다 (멈칫하지 않게): 잔해 (1.2m/s 이상이면 ramWrecks가 부순다),
        // '충돌 공격'으로 한 번에 깨질 보급품
        const sp = Math.hypot(B.vel.x, B.vel.z);
        if (fp.wreck && sp >= 1.2) continue;
        if (fp.sandbag) { fp.sandbag.ram = true; continue; }   // 모래주머니: 닿으면 부서진다 (ramSandbags)
        if (fp.tgt && B === tank && B.ram && sp * 3.6 >= ramSpeed() && (fp.tgt.hp ?? CFG.box.hp) <= boxDmg(ramDamage())) { (B.touch || (B.touch = new Set())).add(fp); continue; }
        // 회전된 사각형의 가까운 면 법선 (로컬 x → (c,-s), 로컬 z → (s,c))
        if (ox < oz) { const k = Math.sign(_fl.x); _n.set(k * fp.c, 0, -k * fp.s); }
        else { const k = Math.sign(_fl.z); _n.set(k * fp.s, 0, k * fp.c); }
        if (fp.metal || fp.target) metalHit();   // 쇠끼리(잔해·보급품·급수탑·풍차) 부딪힘
        else if (fp.group) woodHit();             // 나무 집
        if (fp.target && B === tank) (B.touch || (B.touch = new Set())).add(fp);   // '충돌 공격'용: 이번 프레임에 닿은 보급품
        contactForce(cp, Math.min(ox, oz), _n, true);
      }
    }
    // 다른 탱크: 그 차체 상자 안으로 들어간 접촉점을 가까운 옆면 밖으로 민다 (서로 상대 쪽에서 똑같이 밀린다)
    for (const O of TANKS) {
      if (O === B || !O.solid) continue;
      _loc.copy(_pw).sub(O.pos).applyQuaternion(_qo.copy(O.q).invert()).add(COM);
      if (_loc.y < -0.2 || _loc.y > (O.ht ?? 2.8)) continue;
      const ox = (O.hx ?? HULL_HX) - Math.abs(_loc.x), oz = (O.hz ?? HULL_HZ) - Math.abs(_loc.z);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) _n.set(Math.sign(_loc.x), 0, 0); else _n.set(0, 0, Math.sign(_loc.z));
      _n.applyQuaternion(O.q); _n.y = 0; _n.normalize();
      metalHit();
      if (B === tank) (B.touch || (B.touch = new Set())).add(O);   // '충돌 공격'용: 이번 프레임에 닿은 적
      contactForce(cp, Math.min(ox, oz) * (O.jeep && !B.jeep ? 0.3 : B.jeep && !O.jeep ? 2.5 : 1), _n, true);   // 가벼운 지프는 탱크를 조금밖에 못 밀고, 탱크에는 확 밀려난다
    }
  }
  // 전봇대: 탱크 박스 안으로 들어오면 밀어낸다
  for (let pi = 0; pi < allPoles.length; pi++) {
    const pp = allPoles[pi], dx = pp.x - B.pos.x, dz = pp.z - B.pos.z;
    if (dx * dx + dz * dz > 9 || B.pos.y > pp.y + 8) continue;
    _loc.set(dx, 0, dz).applyQuaternion(_qi);
    const px = (B.hx ?? HULL_HX) + 0.1 - Math.abs(_loc.x), pz = (B.hz ?? HULL_HZ) + 0.1 - Math.abs(_loc.z);
    if (px <= 0 || pz <= 0) continue;
    let pen;
    if (px < pz) { _n.set(-Math.sign(_loc.x), 0, 0); pen = px; } else { _n.set(0, 0, -Math.sign(_loc.z)); pen = pz; }
    _n.applyQuaternion(B.q); _n.y = 0; _n.normalize();
    _rw.set(dx, 0, dz);
    _vp.crossVectors(B.w, _rw).add(B.vel);
    const fn = Math.max(0, 2 * K * pen - 2 * C * _vp.dot(_n));
    if (fn > 3) {
      const sp = Math.abs(_vp.dot(_n));
      shakePoleWires(pi, Math.min(1.3, 0.5 + sp * 0.3));   // 들이받으면 전선이 출렁
      // 전봇대는 밀린 방향(탱크가 받는 힘의 반대)으로 휘청. 한 번 부딪힐 때 한 번만
      if (U.uTime.value - poleHit[pi] > 0.4) { kickPole(pi, -_n.x, -_n.z, Math.min(0.9, 0.35 + sp * 0.175)); sfx.wood(_tmp.set(pp.x, B.pos.y + 1, pp.z), Math.min(1.3, 0.5 + sp * 0.2)); }
      poleHit[pi] = U.uTime.value;
    }
    _f.copy(_n).multiplyScalar(fn);
    _F.add(_f); _T.add(_tmp.crossVectors(_rw, _f));
  }
  // 조향: 궤도 마찰만으로는 출발이 굼뜨고 점점 빨라지므로, 목표 회전속도로 바로 수렴시킨다
  B.yawCmd += Math.max(-TURN_ACC * h, Math.min(TURN_ACC * h, turn * TURN_RATE * (B.turnM || 1) - B.yawCmd));
  if (B.contacts > 0) {
    _n.set(0, 1, 0).applyQuaternion(B.q);
    const tq = Math.max(-YAW_TQ, Math.min(YAW_TQ, (B.yawCmd - B.w.dot(_n)) * YAW_GAIN));
    _T.addScaledVector(_n, tq * Math.min(1, B.contacts / 6));
  }
  _F.addScaledVector(B.vel, -0.05);
  B.vel.addScaledVector(_F, h);
  B.pos.addScaledVector(B.vel, h);
  _tmp.copy(_T).applyQuaternion(_qi).multiply(B.invI || INV_I).applyQuaternion(B.q);
  B.w.addScaledVector(_tmp, h).multiplyScalar(1 - 0.4 * h);
  if (B.contacts > 0) {   // 땅에 닿아 있을 때 좌우·앞뒤 흔들림(차체 세로축이 아닌 회전)을 더 빨리 가라앉힌다
    _n.set(0, 1, 0).applyQuaternion(B.q);
    const wy = B.w.dot(_n);
    B.w.addScaledVector(_n, -wy).multiplyScalar(1 - 6 * h).addScaledVector(_n, wy);
  }
  _dq.set(B.w.x, B.w.y, B.w.z, 0).multiply(B.q);
  B.q.set(B.q.x + _dq.x * h * 0.5, B.q.y + _dq.y * h * 0.5, B.q.z + _dq.z * h * 0.5, B.q.w + _dq.w * h * 0.5).normalize();
}

const spawnTank = () => resetTank(SPAWN_X, SPAWN_Z, SPAWN.yaw * DEG);
spawnTank();

// ---------------------------------------------------------------- 포탄, 폭발, 그을음
const ballGeo = new THREE.SphereGeometry(BALL_R, 10, 8);
const ballMat = lambert({ color: 0x232428, emissive: 0x060607 });
const balls = [];
const raycaster = new THREE.Raycaster();
raycaster.camera = camera;
const scorchTex = canvasTex(32, 32, (g) => {
  // 가운데는 짙고 바깥으로 갈수록 작고 옅은 얼룩: 네모난 텍스처 가장자리가 드러나지 않게
  for (let i = 0; i < 80; i++) {
    const a = rand() * 6.283, r = Math.sqrt(rand()) * 10, k = 1 - r / 11;
    g.fillStyle = `rgba(8,6,5,${(0.2 + rand() * 0.35) * (0.4 + 0.6 * k)})`;
    g.beginPath(); g.arc(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 1 + rand() * 4 * k + 1, 0, 7); g.fill();
  }
});
const decalGeo = new THREE.PlaneGeometry(1, 1);
const decalMat = ps1(new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, ...DECAL, polygonOffsetFactor: -4 }));
const decals = [];
// 건물 그을음: 맞은 물체의 면에 투영해 스티커처럼 붙인다 (모서리에 맞아도 허공에 뜨지 않고 꺾인 면을 따라 감긴다)
const _dproj = new THREE.Object3D(), _dsize = new THREE.Vector3(), _dsc = new THREE.Vector3();
// 데칼 상자(가로·세로 s, 깊이 2.2)에 닿을 수 있는 메시만 고른다: 메시 경계 구가 데칼 둘레 구와 겹치는 것만 (모든 메시에 투영하면 수백 ms가 걸렸다)
function scorchTargets(group, p, s, out) {
  const R = Math.hypot(s / 2, s / 2, 1.1);
  group.traverse((o) => {
    if (!o.isMesh || o.material.transparent) return;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    _dsc.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
    if (_dsc.distanceTo(p) <= g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() + R) out.push(o);
  });
  return out;
}
// 데칼 둘레(반지름 R)에 닿는 삼각형만 골라 작은 임시 메시로 (DecalGeometry는 삼각형마다 자르기를 해서 느리다: 건물은 AO로 잘게 나뉘어 수만 개).
// 거르기는 메시 자기 좌표에서 삼각형 경계 상자로만 (꼭짓점 변환 없이). 닿는 삼각형이 없으면 null
const _scInv = new THREE.Matrix4(), _scLp = new THREE.Vector3(), _cullMesh = new THREE.Mesh(), _scM3 = new THREE.Matrix3(), _scR = new THREE.Matrix4(), _scA = new THREE.Vector3(), _scB = new THREE.Vector3(), _scC = new THREE.Vector3();
_cullMesh.matrixAutoUpdate = false;
function decalCulled(o, p, R, rot, size) {
  _scInv.copy(o.matrixWorld).invert(); _scLp.copy(p).applyMatrix4(_scInv);
  const r = R * 1.05 / Math.max(1e-6, o.matrixWorld.getMaxScaleOnAxis()), px = _scLp.x, py = _scLp.y, pz = _scLp.z;
  // 데칼 상자 축을 메시 자기 좌표로 (꼭짓점 차이와 내적하면 데칼 상자 기준 좌표): 둘레 상자로 거른 뒤 데칼 상자 방향으로 한 번 더
  _scM3.setFromMatrix4(o.matrixWorld).transpose(); _scR.makeRotationFromEuler(rot); _scR.extractBasis(_scA, _scB, _scC);
  _scA.applyMatrix3(_scM3); _scB.applyMatrix3(_scM3); _scC.applyMatrix3(_scM3);
  const hx = size.x * 0.53, hy = size.y * 0.53, hz = size.z * 0.53;
  const off = (A, h, a, b, c) => {   // 삼각형이 이 축 방향으로 상자 밖인가
    const da = (P[a] - px) * A.x + (P[a + 1] - py) * A.y + (P[a + 2] - pz) * A.z, db = (P[b] - px) * A.x + (P[b + 1] - py) * A.y + (P[b + 2] - pz) * A.z, dc = (P[c] - px) * A.x + (P[c + 1] - py) * A.y + (P[c + 2] - pz) * A.z;
    return Math.max(da, db, dc) < -h || Math.min(da, db, dc) > h;
  };
  const g = o.geometry, P = g.attributes.position.array, N = g.attributes.normal && g.attributes.normal.array, I = g.index && g.index.array;
  const cnt = I ? I.length : P.length / 3, outP = [], outN = [];
  for (let t = 0; t < cnt; t += 3) {
    const a = (I ? I[t] : t) * 3, b = (I ? I[t + 1] : t + 1) * 3, c = (I ? I[t + 2] : t + 2) * 3;
    const x0 = Math.min(P[a], P[b], P[c]), x1 = Math.max(P[a], P[b], P[c]);
    if (px < x0 - r || px > x1 + r) continue;
    const y0 = Math.min(P[a + 1], P[b + 1], P[c + 1]), y1 = Math.max(P[a + 1], P[b + 1], P[c + 1]);
    if (py < y0 - r || py > y1 + r) continue;
    const z0 = Math.min(P[a + 2], P[b + 2], P[c + 2]), z1 = Math.max(P[a + 2], P[b + 2], P[c + 2]);
    if (pz < z0 - r || pz > z1 + r) continue;
    if (off(_scC, hz, a, b, c) || off(_scA, hx, a, b, c) || off(_scB, hy, a, b, c)) continue;
    for (const k of [a, b, c]) { outP.push(P[k], P[k + 1], P[k + 2]); if (N) outN.push(N[k], N[k + 1], N[k + 2]); else outN.push(0, 1, 0); }
  }
  if (!outP.length) return null;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3)); tg.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  _cullMesh.geometry = tg; _cullMesh.matrixWorld.copy(o.matrixWorld);
  const geo = new DecalGeometry(_cullMesh, p, rot, size);
  tg.dispose();
  return geo;
}
function addScorchDecal(p, n, group, s = rr(4.4, 6.4), keep = false) {
  if (!group) return;
  if (group.userData.ray) group = group.userData.ray;   // 건물: 잘게 쪼개기 전 저해상도 사본에 투영 (보이는 건물과 같은 면)
  _dproj.position.copy(p); _dproj.lookAt(_tmp.copy(p).add(n)); _dproj.rotateZ(rand() * 6.283);
  _dsize.set(s, s, 2.2);
  const g = new THREE.Group();
  group.updateMatrixWorld(true);
  for (const o of scorchTargets(group, p, s, [])) {
    const geo = decalCulled(o, p, Math.hypot(s / 2, s / 2, 1.1), _dproj.rotation, _dsize);
    if (geo && geo.attributes.position.count) g.add(new THREE.Mesh(geo, decalMat)); else if (geo) geo.dispose();
  }
  scene.add(g);
  if (keep) return g;   // 영구 자국은 오래된 순 삭제 대상이 아니다
  decals.push(g);
  if (decals.length > 40) { const old = decals.shift(); scene.remove(old); old.traverse(o => o.geometry && o.geometry.dispose()); }
}
// 투명한 벽에 남는 그을음: 한동안 허공에 떠 있다가 옅어지며 사라진다
const wallDecals = [];
// 부서진 탱크에는 폭발 자국이 영구히 몇 군데 붙어 있다.
// 잔해는 모두 같은 모델이라, 로딩 때 잔해 기준 좌표로 자국 묶음을 3벌 만들어 두고 잔해마다 하나를 자식으로 붙인다
// (예전엔 탱크가 터질 때마다 그 자리에서 투영해 한 프레임에 수십~수백 ms가 걸려 끊겼다). 기하는 모든 잔해가 같이 쓴다
const WRECK_SCORCH = (() => {
  let sd = 4242;
  const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646, rrr = (a, b) => a + (b - a) * r();   // (전역 난수 순서를 건드리지 않게)
  const src = wreckModel.clone(); src.position.set(0, 0, 0); src.rotation.set(0, 0, 0); src.updateMatrixWorld(true);
  const c = new THREE.Vector3(0, 1.6, 0), dir = new THREE.Vector3(), out = [];
  for (let v = 0; v < 3; v++) {
    const geos = [];
    for (let k = 0, got = 0; k < 20 && got < 5; k++) {
      dir.set(rrr(-1, 1), rrr(0.15, 1), rrr(-1, 1)).normalize();
      raycaster.set(c.clone().addScaledVector(dir, 7), dir.clone().negate()); raycaster.far = 10;
      const h = raycaster.intersectObject(src, true).find((o) => o.face && !o.object.material.transparent);
      if (!h) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld), s = rrr(1.3, 2.3);
      _dproj.position.copy(h.point); _dproj.lookAt(_tmp.copy(h.point).add(n)); _dproj.rotateZ(r() * 6.283);
      _dsize.set(s, s, 2.2);
      for (const o of scorchTargets(src, h.point, s, [])) {
        const geo = decalCulled(o, h.point, Math.hypot(s / 2, s / 2, 1.1), _dproj.rotation, _dsize);
        if (geo && geo.attributes.position.count) geos.push(geo); else if (geo) geo.dispose();
      }
      got++;
    }
    out.push(geos.length ? mergeGeometries(geos) : null);   // 한 벌 = 메시 하나 (그리기 1번)
  }
  raycaster.far = Infinity;
  return out;
})();
function wreckScorch(w) {   // 잔해에 미리 만든 자국 한 벌을 붙인다 (어느 벌인지는 자리로 정한다)
  const geo = WRECK_SCORCH[Math.abs(Math.round(w.x * 7 + w.z * 13)) % WRECK_SCORCH.length];
  if (geo) { const m = new THREE.Mesh(geo, decalMat); m.userData.noOutline = true; w.group.add(m); }
}
for (const w of WRECKS) wreckScorch(w);
// 벽 평면 위의 격자로 만들고, 보드 모서리를 넘는 부분은 옆 벽으로 꺾어 붙인다 (경계 밖으로 삐져나가지 않게)
function addWallScorch(p, n) {
  const s = rr(4.4, 6.4), a = rand() * 6.283, ca = Math.cos(a), sa = Math.sin(a), G = 8, E = HALF - 0.03;
  const T = new THREE.Vector3(-n.z, 0, n.x), q = new THREE.Vector3(), pos = [], uv = [], idx = [];
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
    const u = i / G - 0.5, v = j / G - 0.5;
    q.copy(p).addScaledVector(n, 0.03).addScaledVector(T, (u * ca - v * sa) * s).addScaledVector(UP, (u * sa + v * ca) * s);
    for (const ax of ['x', 'z']) { const e = Math.abs(q[ax]) - E; if (e > 0) { q[ax] = Math.sign(q[ax]) * E; q.addScaledVector(n, e); } }
    pos.push(q.x, q.y, q.z); uv.push(u + 0.5, v + 0.5);
    if (i < G && j < G) { const k = j * (G + 1) + i; idx.push(k, k + 1, k + G + 1, k + 1, k + G + 2, k + G + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = decalMat.clone(); mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  scene.add(m); wallDecals.push({ m, t: 0 });
}
function updateWallDecals(dt) {
  for (let i = wallDecals.length - 1; i >= 0; i--) {
    const d = wallDecals[i]; d.t += dt;
    if (d.t > 12) { scene.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); wallDecals.splice(i, 1); continue; }
    d.m.material.opacity = 1 - smooth(8, 12, d.t);
  }
}
let shake = 0, screenFlash = 0;
// 큰 폭발의 첫 순간: 화면 전체를 덮는 섬광 스프라이트
const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
flashSprite.visible = false; flashSprite.renderOrder = 10; scene.add(flashSprite);
const bigFlash = { t: 1, dur: 0.45 };
// 풀 눕히기 폭풍 (가장 오래된 슬롯을 덮어씀). 땅 가까이에서 생긴 것만
let blastSlot = 0;
function addBlast(x, y, z, r) {
  if (y - groundAt(x, z) > 4) return;
  U.uBlast.value[blastSlot].set(x, z, U.uTime.value, r);
  blastSlot = (blastSlot + 1) % 4;
}
// power 1 = 땅에 떨어진 포탄, 3 = 공격 대상 직격
function explode(p, n, decal, power = 1, noPush = false) {   // noPush: 내 탱크를 밀어내지 않음 (들이받아 깬 보급품)
  vfStamp(p.x, p.z, VF.blastRadius * Math.min(1.5, Math.max(0.5, power)));   // 복셀 안개를 밀어낸다
  sfx.boom(p, power);
  const P = power, S = 1 + (P - 1) * 0.45, R = 3.6 * (1 + (P - 1) * 0.5);
  if (P > 1) {
    // 하얗게 타오르는 중심: 아주 밝고 짧게
    for (let k = 0; k < 20; k++) {
      _tmp.set(rr(-1, 1), rr(-0.3, 1), rr(-1, 1)).normalize();
      const s = rr(1, 6);
      glowP.spawn(p.x, p.y + 1, p.z, _tmp.x * s, _tmp.y * s, _tmp.z * s, rr(0.12, 0.3), [1, 1, 1, 1], [1, 0.85, 0.5, 0], rr(5, 8), 3, 0, 2);
    }
    flashSprite.position.copy(p).y += 2; bigFlash.t = 0;
    screenFlash = 0.55;
  }
  for (let k = 0; k < 54 * P; k++) {
    _tmp.set(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)).normalize();
    const s = rr(3, 10) * S;
    glowP.spawn(p.x, p.y + 0.4, p.z, _tmp.x * s, _tmp.y * s + 2, _tmp.z * s, rr(0.4, 0.85) * (1 + (P - 1) * 0.3), [1, 0.95, 0.6, 1], [0.8, 0.2, 0.05, 0], rr(1.8, 3.0) * S, 0.6 * S, -1, 3);
  }
  for (let k = 0; k < 33 * P; k++) {
    _tmp.set(rr(-1, 1), rr(0.2, 1), rr(-1, 1)).normalize();
    const s = rr(10, 20) * S;
    glowP.spawn(p.x, p.y + 0.3, p.z, _tmp.x * s, _tmp.y * s, _tmp.z * s, rr(0.6, 1.2) * S, [1, 0.9, 0.5, 1], [1, 0.4, 0.1, 0], 0.28, 0.12, 12, 0.5);
  }
  for (let k = 0; k < 18 * P; k++) {
    _tmp.set(rr(-1, 1), rr(0.5, 1.5), rr(-1, 1)).normalize();
    const s = rr(5, 12) * S;
    smokeP.spawn(p.x, p.y + 0.3, p.z, _tmp.x * s, _tmp.y * s, _tmp.z * s, rr(1.2, 1.9), [0.22, 0.16, 0.1, 1], [0.18, 0.14, 0.1, 0.8], rr(0.4, 0.7), 0.4, 14, 0.3);
  }
  // 땅을 따라 퍼지는 충격파 먼지
  for (let k = 0; k < 14 * P; k++) {
    const a = k / (14 * P) * Math.PI * 2, s = rr(9, 13) * S;
    smokeP.spawn(p.x, p.y + 0.3, p.z, Math.cos(a) * s, rr(0.3, 1), Math.sin(a) * s, rr(0.9, 1.4) * S, [0.3, 0.25, 0.18, 0.55], [0.3, 0.27, 0.22, 0], 0.8 * S, 2.6 * S, 0, 3.5, 0.5);
  }
  for (let k = 0; k < 14 * P; k++)
    smokeP.spawn(p.x + rr(-1.5, 1.5) * S, p.y + rr(0.5, 2) * S, p.z + rr(-1.5, 1.5) * S, rr(-1.5, 1.5), rr(2.25, 5.25) * S, rr(-1.5, 1.5), rr(1.3, 1.9) * S, [0.07, 0.065, 0.06, 0.7], [0.12, 0.12, 0.12, 0], rr(1, 1.6) * S, rr(5, 7) * S, -0.3, 0.6, 0.5);
  const fp = p.clone().addScaledVector(n || UP, 1.2);
  if (P > 1) {
    flashes.push({ p: fp.clone(), t: 0, dur: 0.2, I: 15000, range: 100, color: 0xfff4e0 });   // 순간 백색광
    flashes.push({ p: fp, t: 0, dur: 1.1, I: 2500, range: 60, color: 0xffa050 });
  } else flashes.push({ p: fp, t: 0, dur: 0.55, I: 1400, range: 40, color: 0xffc070 });
  if (p.y - groundAt(p.x, p.z) < 3.5 * S) scorchField(p.x, p.z, R);
  addBlast(p.x, p.y, p.z, R * 3);
  if (decal) addScorchDecal(p, n);
  shakeWiresNear(p, 20 * S, Math.min(1.3, 1.1 * S));   // 근처 폭발도 들이받은 만큼 출렁

  // 폭풍: 가까운 탱크를 밀어낸다 (무거워서 잘 날아가지는 않음)
  _loc.copy(tank.pos).sub(p);
  const d = _loc.length(), reach = 10 * S;
  if (d < reach && !noPush) {
    const s = 5 * S * (1 - d / reach);
    _loc.normalize(); _loc.y += 0.4; _loc.normalize();
    tank.vel.addScaledVector(_loc, s);
    applyAngularImpulse(new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(s * 0.15));
  }
  // 가벼운 지프는 폭풍에 훨씬 크게 밀려난다 (대미지는 따로. 밀리기만)
  for (const J of ENEMIES) {
    if (!J.jeep || !J.solid) continue;
    _loc.copy(J.pos).sub(p);
    const dj = _loc.length();
    if (dj >= reach) continue;
    const s = 13 * S * (1 - dj / reach);
    _loc.normalize(); _loc.y += 0.5; _loc.normalize();
    J.vel.addScaledVector(_loc, s);
    applyAngularImpulse(new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(s * 0.12), J);
  }
  shake = Math.min(1.6 * S, shake + Math.max(0.25, 1.5 * S - camera.position.distanceTo(p) / 60));
  { const k = S * (1 - tank.pos.distanceTo(p) / 30); if (k > 0.05) padRumble(Math.min(1, k * 0.9), Math.min(1, k), 120 + 220 * Math.min(1, k)); }   // 패드 진동: 가까운 폭발일수록 세고 길게
}
// 물에 떨어지면 물기둥만
function splash(p) {
  sfx.splash(p);
  for (let k = 0; k < 70; k++) {
    const a = rand() * 6.283, r = rr(0, 1), up = rr(5, 13) * (1 - r * 0.6);
    smokeP.spawn(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, Math.cos(a) * rr(1, 4), up, Math.sin(a) * rr(1, 4),
      rr(0.8, 1.6), [0.85, 0.9, 0.92, 0.85], [0.7, 0.78, 0.82, 0], rr(0.3, 0.6), rr(0.8, 1.5), 9.8, 0.3);
  }
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * 6.283;
    smokeP.spawn(p.x, p.y + 0.1, p.z, Math.cos(a) * 5, 0.3, Math.sin(a) * 5, 1.2, [0.8, 0.85, 0.88, 0.5], [0.7, 0.75, 0.8, 0], 0.5, 1.6, 0, 3);
  }
  flashes.push({ p: p.clone(), t: 0, dur: 0.2, I: 200, range: 15, color: 0xfff0d0 });
  forCells(p.x, p.z, 4, (k, d) => { fTr[k] = Math.max(fTr[k], 1 - d / 5); });
  shake = Math.min(1.2, shake + 0.2);
}

// 직격당한 상자: 큰 폭발 + 금화와 파편이 튀어나옴 + 한동안 짙은 검은 연기
const COIN_R = 0.536, COIN_FLOAT = 1.2, COIN_LIFE = CFG.box.coinLife, COIN_TIME = 2;   // 수명은 동전마다 ±5초   // 비행은 2배속으로 경쾌하게
const MAGNET_R = PC.magnetRange, PICK_R = 1.3;   // 자석 범위: 이 안에 내려앉은 동전은 끌려온다
const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.256, 16);
coinGeo.rotateX(Math.PI / 2);   // 동전 면이 세로로 서도록
// 금화: 돌다가 면이 카메라를 향하는 순간 하얗게 번쩍이는 가짜 금속 반사광
const coinMat = ps1(new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0x4a2c00 }), (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float glint = max(normal.z, 0.0);
    totalEmissiveRadiance += vec3(1.0, 0.9, 0.55) * (pow(glint, 24.0) * 1.8 + pow(glint, 4.0) * 0.25);`);
}, 'coin');
const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 200);
coinMesh.count = 0; coinMesh.frustumCulled = false; scene.add(coinMesh);
// 수리 도구: 금색 스패너 (자루 + 입 벌린 머리 + 손잡이 띠). 동전처럼 튀어나와 돌다가 사라진다
const kitGeo = (() => {
  const parts = [
    new THREE.BoxGeometry(0.2, 0.95, 0.12).translate(0, -0.1, 0),               // 자루
    new THREE.BoxGeometry(0.56, 0.22, 0.14).translate(0, 0.44, 0),              // 머리
    new THREE.BoxGeometry(0.15, 0.3, 0.14).translate(-0.2, 0.68, 0),            // 입 (왼쪽 이)
    new THREE.BoxGeometry(0.15, 0.3, 0.14).translate(0.2, 0.68, 0),             // 입 (오른쪽 이)
    new THREE.BoxGeometry(0.26, 0.3, 0.16).translate(0, -0.42, 0),              // 손잡이 띠
  ];
  const cols = [0xd8dde0, 0xd8dde0, 0xd8dde0, 0xd8dde0, 0x48c868].map(h => new THREE.Color(h));
  parts.forEach((g, i) => { const c = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < c.length; k += 3) cols[i].toArray(c, k); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); });
  return mergeGeometries(parts).scale(1.3, 1.3, 1.3);
})();
const kitMat = ps1(new THREE.MeshLambertMaterial({ color: 0x46d060, emissive: 0x0c3a16 }), (sh) => {   // 수리 도구: 초록 (금화와 같은 반짝임)
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float glint = max(normal.z, 0.0);
    totalEmissiveRadiance += vec3(0.75, 1.0, 0.8) * (pow(glint, 24.0) * 1.8 + pow(glint, 4.0) * 0.25);`);
}, 'kit');
const kitMesh = new THREE.InstancedMesh(kitGeo, kitMat, 40);
kitMesh.count = 0; kitMesh.frustumCulled = false; scene.add(kitMesh);
const shardMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert({ color: 0xffffff }), 480);
shardMesh.userData.noOutline = true;
shardMesh.count = 0; shardMesh.frustumCulled = false; scene.add(shardMesh);
shardMesh.setColorAt(0, new THREE.Color(1, 1, 1));   // 인스턴스 색 버퍼를 처음부터 (첫 파편 때 셰이더가 바뀌어 다시 컴파일되지 않게)
const coins = [], shards = [], smokers = [];
for (const w of WRECKS) smokers.push({ x: w.x, y: w.y, z: w.z, t: 10, dur: Infinity, acc: 0, weak: true });   // 부서진 탱크: 끝없이 약한 연기
for (const B of BUNKERS) bunkerSmoke(B);   // 부서진 벙커도
let gold = 0;
const SHARD_COLS = [0xc8261c, 0x8a1810, 0xd8a640, 0x26221e].map(h => new THREE.Color(h));
const REPAIR_COLS = [0xc9ced2, 0x9aa0a4, 0x3ccc5a, 0xf2f4f4].map(h => new THREE.Color(h));
const METAL_COLS = [0x8e8e88, 0x5c5c58, 0xb4b2aa, 0x3a3936].map(h => new THREE.Color(h));
const WOOD_COLS = [0x8a6440, 0x6e4e30, 0xa07850, 0x4a3422].map(h => new THREE.Color(h));
const CONCRETE_COLS = [0x9a988e, 0x7a7870, 0xb0aea4, 0x55534e].map(h => new THREE.Color(h));
// 파편: 튀었다가 한 번 튕기고 작아지며 사라진다. 세기·각도·무게·공기저항이 제각각. dir을 주면 그쪽으로 쏠림
function spawnShards(p, n, cols, vmin, vmax, dir, smin, smax, spread = 0.4) {
  for (let k = 0; k < n && shards.length < 480; k++) {
    _tmp.set(rr(-1, 1), rr(0.1, 2), rr(-1, 1)).normalize();
    if (dir) _tmp.addScaledVector(dir, 1.3).normalize();
    shards.push({ p: p.clone().add(new THREE.Vector3(rr(-spread, spread), rr(-spread, spread), rr(-spread, spread))), v: _tmp.clone().multiplyScalar(rr(vmin, vmax)),
      g: rr(0.6, 1.6), drag: rr(0, 1.5),
      q: new THREE.Quaternion().random(), w: new THREE.Vector3(rr(-14, 14), rr(-14, 14), rr(-14, 14)),
      s: rr(smin, smax), sx: rr(0.4, 1.6), t: 0, ttl: rr(0.9, 1.7), col: cols[k % cols.length] });
  }
}
// 바닥 그림자 대상: 탱크, 부서진 탱크, 땅 위(또는 떨어지는 중)의 보급품. 카메라에 가까운 12개
const _shList = [];
function updateShadows() {
  _shList.length = 0;
  const push = (x, z, yaw, hx, hz, k) => { if (k > 0.02) _shList.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hx, hz, k, d: (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2 }); };
  for (const T of TANKS) {
    _fwd.set(0, 0, 1).applyQuaternion(T.q);
    const yaw = Math.atan2(_fwd.x, _fwd.z);
    if (T.falling) {   // 하늘에서 떨어지는 탱크: 보급품처럼 높을수록 넓고 옅게 = 떨어질 자리 예고
      const h = T.pos.y - T.landY;
      push(T.pos.x, T.pos.z, yaw, 1.85 + h * 0.03, 2.45 + h * 0.03, 0.9 * (1 - smooth(2, 45, h) * 0.75));
    } else if (T.solid) {
      const th = T.pos.y - COM.y - groundAt(T.pos.x, T.pos.z);   // 탱크가 뜨면 옅어지고 퍼진다
      push(T.pos.x, T.pos.z, yaw, 1.85 + th * 0.15, 2.45 + th * 0.15, 0.95 * (1 - smooth(0.3, 4, th)));
    }
  }
  for (const w of WRECKS) push(w.x, w.z, Math.atan2(w.group.matrixWorld.elements[8], w.group.matrixWorld.elements[10]), 1.9, 2.5, 0.8);
  for (const t of targets) {
    if (!t.alive || t.roof) continue;
    const h = t.y - (t.floor + TARGET_S / 2);   // 떨어지는 보급품: 높을수록 넓고 옅게 = 떨어질 자리 예고
    push(t.x, t.z, t.rot, 1.95 + h * 0.03, 1.95 + h * 0.03, 0.9 * (1 - smooth(2, 45, h) * 0.75));
  }
  _shList.sort((a, b) => a.d - b.d);
  for (let i = 0; i < 12; i++) {
    const e = _shList[i];
    if (!e) { U.uSh1.value[i].z = 0; continue; }
    U.uSh0.value[i].set(e.x, e.z, e.c, e.s); U.uSh1.value[i].set(e.hx, e.hz, e.k, 0);
  }
}
// 터지고 몇 초 뒤 지도 아무 데나 하늘에서 새 공격 대상이 떨어진다 (지붕 위에 떨어져도 된다)
const respawns = [];
function updateTargets(dt) {
  for (let i = respawns.length - 1; i >= 0; i--) {
    if ((respawns[i].t -= dt) > 0) continue;
    const kind = respawns[i].kind;
    respawns.splice(i, 1);
    dropSafe(kind);
  }
  for (const t of targets.slice()) {
    if (t.alive && !t.falling) updateTip(t, dt);
    if (!t.alive || !t.falling) continue;
    t.vy -= 22 * dt; t.y += t.vy * dt;
    // 떨어지다 탱크나 다른 보급품에 닿으면 그 자리에서 부서진다
    const bottom = t.y - TARGET_S / 2;
    if (TANKS.some(T => T.solid && Math.hypot(T.pos.x - t.x, T.pos.z - t.z) < 2.9 && bottom < T.pos.y + 2.3 && t.y > T.pos.y) ||
        targets.some(o => o !== t && o.alive && !o.falling && Math.hypot(o.mesh.position.x - t.x, o.mesh.position.z - t.z) < TARGET_S && bottom < o.y + TARGET_S / 2)) {
      destroyTarget(t, true); continue;
    }
    const land = t.floor + TARGET_S / 2;
    if (t.y <= land) {
      t.y = land; t.falling = false; seatTarget(t);
      t.tipT = 0; t.tipA = rr(0.07, 0.11); t.tipS = rand() < 0.5 ? -1 : 1;
      sfx.thud(t.mesh.position, 0.8);
      // 쿵: 흙먼지 고리, 주변 풀 눕힘, 깔린 상자는 부서짐, 가까우면 화면 흔들림
      for (let k = 0; k < 22; k++) {
        const a = k / 22 * 6.283, s = rr(4, 7);
        smokeP.spawn(t.x + Math.cos(a) * 1.6, t.floor + 0.2, t.z + Math.sin(a) * 1.6, Math.cos(a) * s, rr(0.2, 0.8), Math.sin(a) * s, rr(0.8, 1.3), [0.32, 0.27, 0.2, 0.6], [0.3, 0.27, 0.22, 0], 0.6, 2.2, 0, 3.5, 0.5);
      }
      addBlast(t.x, t.floor, t.z, 10);
      for (const c of crates) if (c.alive && Math.hypot(c.x - t.x, c.z - t.z) < 2.3 && Math.abs(c.y - t.floor) < 2.5) breakCrate(c, false);
      shake = Math.min(1.2, shake + Math.max(0, 0.6 - camera.position.distanceTo(t.mesh.position) / 120));
    }
    if (t.falling) { t.mesh.position.y = t.y; t.fp.y0 = t.y - TARGET_S / 2; t.fp.top = t.y + TARGET_S / 2; }
  }
}
// 보급품을 하늘에서 떨어뜨린다: 건물·잔해·다른 보급품 4m 안, 절벽·물길·탱크 근처는 피해서. near를 주면 그 둘레에
function dropSafe(kind, near) {
  const s = landSpot((x, z) => !TANKS.some(T => (T.solid || T.falling) && Math.hypot(T.pos.x - x, T.pos.z - z) < 8), near, 4);
  if (!s) return;
  addTarget(s.x, s.z, groundTop(s.x, s.z) - 0.2, rand() * Math.PI / 2, DROP_H, kind); colDirty = true;
}
// 보급품 파괴. broken = 떨어지다 부딪혀 깨짐: 폭발 없이 부서지는 효과만, 내용물은 바로 튀어나온다
function destroyTarget(t, broken = false, rammed = false) {   // rammed: 내 탱크가 들이받아 깸 → 폭풍이 내 탱크를 밀지 않는다 (멈칫하지 않게)
  t.alive = false;
  if (t.shadow) scene.remove(t.shadow);
  respawns.push({ t: rr(...(t.kind === 'repair' ? CFG.box.repairRespawn : CFG.box.goldRespawn)), kind: t.kind });   // 수리 보급품은 조금 더 늦게 다시 떨어진다
  scene.remove(t.mesh);
  footprints.splice(footprints.indexOf(t.fp), 1); colDirty = true;
  const c = new THREE.Vector3(t.x, t.y, t.z), cols = t.kind === 'repair' ? REPAIR_COLS : SHARD_COLS;
  if (broken) {
    sfx.crack(c);
    spawnShards(c, 40, cols, 2, 9, null, 0.2, 0.55, 1.3);
    for (let k = 0; k < 14; k++) smokeP.spawn(c.x + rr(-1.4, 1.4), c.y + rr(-1, 1), c.z + rr(-1.4, 1.4), rr(-2, 2), rr(0, 1.5), rr(-2, 2), rr(0.6, 1.1), [0.32, 0.28, 0.22, 0.6], [0.3, 0.27, 0.22, 0], 0.6, 1.8, 0, 2.5, 0.5);
  } else {
    // 폭발 세기·동전 퍼짐은 70%
    explode(c, UP, false, 1.7, rammed);
    blastDamage(c, CFG.box.explodeRadius, CFG.box.explodeDamage, null, t);   // 보급품 폭발: 둘레의 탱크·상자도 (방어력 적용)
    spawnShards(c, 36, cols, 3, 13, null, 0.25, 0.6, 1);
    smokers.push({ x: t.x, y: t.y - TARGET_S / 2 + 0.3, z: t.z, t: 0, dur: 9, acc: 0 });
  }
  if (t.kind === 'repair') spawnCoins(c, CFG.box.repairKits, true); else spawnCoins(c, SAFE_COINS * (tank.coinMul || 1), false, SAFE_SPREAD);   // '탐욕': 금화 x2
}
// 상자(골드·수리 보급품, 나무 상자)와 잔해의 체력: 대미지 = 방어력 적용 후 소수점 버림. 0이 되면 부서진다
const boxDmg = (d) => Math.floor(d * (1 - CFG.box.armor) + 1e-6);
// kind: 대미지 플로터에 보일 공격 종류 ('blast' 범위, 'mg' 기관총, 'ram' 충돌. 없으면 포탄 직격)
function damageTarget(t, d, kind) {
  if (!t.alive) return;
  t.hp = (t.hp ?? CFG.box.hp) - boxDmg(d);
  if (aiShow) addFloater(t.mesh.position, 2, `${KIND_KO[kind] || KIND_KO.shell} 보급품 -${boxDmg(d)} = ${fmtN(d)} · 방어 ${Math.round(CFG.box.armor * 100)}% · HP ${Math.max(0, t.hp)}`, '#ffc23a', t);
  if (t.hp <= 0) destroyTarget(t, false, kind === 'ram');
}
function damageCrate(c, d, boom = true) {
  if (!c.alive) return;
  c.hp = (c.hp ?? CFG.box.crateHp) - boxDmg(d);
  if (c.hp <= 0) breakCrate(c, boom);
}
function damageWreck(w, d) {
  w.hp = (w.hp ?? CFG.box.hp) - boxDmg(d);
  if (w.hp <= 0) removeWreck(w, 'explode');
}
// 금화: 대략 고르게 나눈 방향에 크게 흔든 각도·세기·높이로 제멋대로 튀게 (내려앉으면 서로 밀어내 겹치지 않음)
// 팡 터지듯 빠르게 나갔다가 공중에서 옆으로 확 느려진다: 땅에 닿을 때 수평 속도는 처음의 약 40%
const SAFE_COINS = CFG.box.goldCoins;
// 퍼지는 세기 1이면 금화가 가장 멀리 약 24m까지 날아간다 (드물게 더 튀는 것 제외). 보급품은 설정의 m를 이 비율로
const COIN_REACH = 24, SAFE_SPREAD = (CFG.box.goldSpread ?? 13.5) / COIN_REACH;
const COIN_LAND_T = 0.45;
const easeOutBack = (t) => { const k = 1.70158; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
const KIT_HEAL = CFG.box.kitHeal;
// 충돌 공격 기준 속도·대미지 ('불도저' 조합: 대미지 x2, 기준 속도 절반)
const ramSpeed = () => PC.ramSpeed * (tank.dozer ? 0.5 : 1), ramDamage = () => PC.ramDamage * (tank.dozer || 1);   // 수리 도구 하나에 회복하는 HP
// vals: 동전마다 골드 값 (내 탱크가 터지며 뱉는 골드: 골드 배수를 다시 곱하지 않는다). 없으면 1개씩
function spawnCoins(c, n, kit = false, scale = 1, vals = null) {
  const a0 = rand() * 6.283, spread = (kit ? 0.35 : 1) * scale;   // 수리 도구는 좁게 퍼진다
  for (let k = 0; k < n && coins.length < 200; k++) {
    const a = a0 + k / n * 6.283 + rr(-0.35, 0.35), vy = lerp(4.5, 15.5, rand() ** 1.3), T = 2 * vy / G, drag = 0.9 / T;
    const hs = rr(2.5, 7) * 1.5 * (rand() < 0.2 ? rr(0.5, 1.4) : 1) * spread;
    coins.push({ p: c.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, rr(0.5, 1), Math.sin(a) * 0.6)),
      v: new THREE.Vector3(Math.cos(a) * hs, vy, Math.sin(a) * hs), drag, life: COIN_LIFE + rr(-5, 5), drift: rr(-3, 3) * spread,
      q: new THREE.Quaternion().random(), w: new THREE.Vector3(rr(-12, 12), rr(-12, 12), rr(-12, 12)),
      rest: false, spin: rand() * 6.28, bob: rand() * 6.28, age: 0, pull: 0, kit, val: vals ? vals[k] : 0, magT: 0.1 + Math.random() * 0.1 });   // magT: 이만큼 튀어 오른 뒤부터 자석에 끌린다
  }
}
const _cs = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cu = new THREE.Vector3(0, 1, 0), _ct = new THREE.Vector3();
function updateCoins(dt) {
  const T = U.uTime.value, fdt = dt * COIN_TIME;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.age += dt;
    if (c.age > c.life) {   // 오래 안 먹으면 반짝 사라진다
      for (let k = 0; k < 6; k++) glowP.spawn(c.p.x, c.p.y, c.p.z, rr(-1, 1), rr(0.5, 2), rr(-1, 1), rr(0.3, 0.5), [1, 0.9, 0.5, 1], [1, 0.6, 0.2, 0], 0.15, 0.05, 0, 1);
      coins.splice(i, 1); continue;
    }
    // 튀어 오르는 중이라도 내 탱크 자석 범위에 들면 바로 끌려온다 (적은 내려앉은 것만)
    if (!c.pull && !c.rest && tank.solid && c.age > (c.magT ?? 0.15) && Math.hypot(c.p.x - tank.pos.x, c.p.y - tank.pos.y - 0.6, c.p.z - tank.pos.z) < (tank.magnetR || MAGNET_R)) { c.to = tank; c.pull = 1; }
    // 내려앉은 동전은 자석 범위 안의 가장 가까운 탱크(나 또는 적)가 끌어간다
    if (!c.pull && c.rest) {
      let best = Infinity;
      for (const TK of TANKS) {
        if (!TK.solid || TK.jeep) continue;   // 지프는 골드에 관심 없다
        const d = Math.hypot(c.p.x - TK.pos.x, c.p.y - TK.pos.y - 0.6, c.p.z - TK.pos.z);
        if (d < (TK.magnetR || MAGNET_R) && d < best) { best = d; c.to = TK; }   // 내 탱크는 성장으로 자석 범위가 넓어진다
      }
    }
    const TK = c.to || tank;
    if (c.pull > 0 && !TK.solid) { c.pull = 0; c.to = null; }   // 끌어가던 탱크가 터졌다
    _ct.set(TK.pos.x, TK.pos.y + 0.6, TK.pos.z);
    const dist = c.p.distanceTo(_ct);
    if (c.pull > 0 || (c.rest && c.to)) {
      // 탱크에 끌려가며 점점 빨라진다
      c.pull += dt * 30;
      c.p.addScaledVector(_ct.sub(c.p).normalize(), Math.min(dist, c.pull * dt));
      c.spin += dt * 14;
      c.q.setFromAxisAngle(_cu, c.spin);
      if (dist < PICK_R) {
        const v = c.val || (TK === tank ? tank.goldMul || 1 : 1);   // 뱉은 골드는 값 그대로, 새 골드는 골드 배수만큼
        const hp0 = TK.hp;
        if (c.kit) TK.hp = Math.min(TK.maxHp, TK.hp + (TK === tank && tank.berserk ? Math.max(1, Math.floor(KIT_HEAL / 2)) : KIT_HEAL));   // '광전사': 수리 절반 (최소 1)
        else if (TK === tank) { goldGain(v); dmgTextGold(v, c.p); if (tank.scrap) tank.hp = Math.min(tank.maxHp, tank.hp + tank.scrap); }   // '고물상': 금화 하나에 HP (골드 배수와 무관)
        else TK.gold += v;
        dmgTextHeal(TK, TK.hp - hp0, c.p);   // 대미지 숫자: 회복 (+). 날아온 쪽 반대로
        if (TK === tank) { if (c.kit) { sfx.kit(); padRumble(0.1, 0.4, 60); } else { sfx.coin(); padRumble(0, 0.22, 35); } }   // 패드 진동: 줍기 (톡)
        for (let k = 0; k < 10; k++)
          glowP.spawn(c.p.x, c.p.y, c.p.z, rr(-2, 2), rr(1, 4), rr(-2, 2), rr(0.3, 0.6), c.kit ? [0.6, 1, 0.65, 1] : [1, 0.9, 0.4, 1], c.kit ? [0.1, 0.6, 0.2, 0] : [1, 0.6, 0.1, 0], 0.18, 0.05, 4, 1);
        coins.splice(i, 1);
      }
      continue;
    }
    if (!c.rest) {
      // 튀어 날아가며 텀블링, 떨어지면 땅 위에 떠서 선 채로 빙글빙글
      c.v.y -= G * fdt;
      const dk = Math.exp(-c.drag * fdt); c.v.x *= dk; c.v.z *= dk;
      _tmp.set(-c.v.z, 0, c.v.x).normalize();   // 진행 방향 옆으로 살짝 휘며 날아간다
      c.v.addScaledVector(_tmp, c.drift * fdt);
      c.p.addScaledVector(c.v, fdt);
      // 투명한 벽에 맞으면 튕겨 나온다
      for (const ax of ['x', 'z']) if (Math.abs(c.p[ax]) > WALL - COIN_R) { c.p[ax] = Math.sign(c.p[ax]) * (WALL - COIN_R); c.v[ax] *= -0.5; }
      _cq.setFromAxisAngle(_tmp.copy(c.w).normalize(), c.w.length() * fdt); c.q.premultiply(_cq);
      if (c.v.y < 0 && c.p.y < groundAt(c.p.x, c.p.z) + COIN_FLOAT) {
        // 착지: 딱 멈추지 않고 EaseOutBack처럼 조금 더 미끄러졌다 살짝 되돌아오고, 높이는 스프링으로 출렁
        c.rest = true; c.land = 0;
        c.lx0 = c.p.x; c.lz0 = c.p.z; c.ldx = c.v.x * 0.22; c.ldz = c.v.z * 0.22;
        c.by = c.p.y - (groundAt(c.p.x, c.p.z) + COIN_FLOAT); c.bv = c.v.y * 0.3;
      }
    } else {
      c.spin += dt * 3.2;
      if (c.land !== undefined && c.land < COIN_LAND_T) {
        c.land = Math.min(COIN_LAND_T, c.land + dt);
        const e = easeOutBack(c.land / COIN_LAND_T);
        c.p.x = c.lx0 + c.ldx * e; c.p.z = c.lz0 + c.ldz * e;
      }
      c.bv += (-180 * (c.by || 0) - 9 * (c.bv || 0)) * Math.min(dt, 0.033); c.by = (c.by || 0) + c.bv * Math.min(dt, 0.033);   // 덜 감쇠된 스프링: 한 번 튀고 가라앉는다
      c.p.y = groundAt(c.p.x, c.p.z) + COIN_FLOAT + Math.sin(T * 2.0 + c.bob) * 0.28 + c.by;   // 바닥 위에서 둥실둥실
      c.q.setFromAxisAngle(_cu, c.spin);
      // 내려앉은 동전끼리 겹치면 살짝 밀어낸다
      for (const o of coins) {
        if (o === c || !o.rest || o.pull) continue;
        const dx = c.p.x - o.p.x, dz = c.p.z - o.p.z, d2 = dx * dx + dz * dz, m = COIN_R * 2.3;
        if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) * 0.5 * Math.min(1, dt * 8) / d; c.p.x += dx * k; c.p.z += dz * k; }
      }
      // 착지 미끄러짐·밀어내기로 투명한 벽 밖(땅이 없는 곳)으로 나가지 않게. 벽 밖 동전은 아무도 못 주워 적이 그쪽으로 끝없이 가려 했다
      for (const ax of ['x', 'z']) if (Math.abs(c.p[ax]) > WALL - COIN_R) { c.p[ax] = Math.sign(c.p[ax]) * (WALL - COIN_R); if (ax === 'x') c.lx0 = c.p.x - c.ldx; else c.lz0 = c.p.z - c.ldz; }
    }
  }
  let nc = 0, nk = 0;
  for (const c of coins) {
    // 사라지기 4초 전부터 깜빡임
    const hide = c.age > c.life - 4 && Math.floor(T * (c.age > c.life - 1.5 ? 16 : 8)) % 2;
    _m4.compose(c.p, c.q, _cs.setScalar(hide ? 0 : 1));
    if (c.kit) { if (nk < 40) kitMesh.setMatrixAt(nk++, _m4); } else coinMesh.setMatrixAt(nc++, _m4);
  }
  coinMesh.count = nc; kitMesh.count = nk;
  coinMesh.instanceMatrix.needsUpdate = kitMesh.instanceMatrix.needsUpdate = true;
  // 파편
  for (let i = shards.length - 1; i >= 0; i--) {
    const f = shards[i];
    f.t += dt;
    if (f.t > f.ttl) { shards.splice(i, 1); continue; }
    f.v.multiplyScalar(1 - f.drag * dt); f.v.y -= G * f.g * dt; f.p.addScaledVector(f.v, dt);
    _cq.setFromAxisAngle(_tmp.copy(f.w).normalize(), f.w.length() * dt); f.q.premultiply(_cq);
    const gy = groundAt(f.p.x, f.p.z) + f.s * 0.4;
    if (f.p.y < gy) { f.p.y = gy; f.v.y = Math.abs(f.v.y) * 0.35; f.v.x *= 0.6; f.v.z *= 0.6; }
  }
  shards.forEach((f, i) => {
    const k = 1 - smooth(0.6, 1, f.t / f.ttl);
    shardMesh.setMatrixAt(i, _m4.compose(f.p, f.q, _cs.set(f.s * k * f.sx, f.s * k, f.s * k / f.sx)));
    shardMesh.setColorAt(i, f.col);
  });
  shardMesh.count = shards.length;
  if (shards.length) { shardMesh.instanceMatrix.needsUpdate = true; shardMesh.instanceColor.needsUpdate = true; }
}
// 부서진 탱크: 포탑 위에서 불이 이글거리고, 연기는 불빛을 받아 붉게 피어올랐다가 멀어지면 어두운 잿빛으로
function wreckFire(s, dt) {
  const wd = U.uWindDir.value, far = (s.x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2 > 130 * 130;
  // 위로 솟는 기둥은 원래처럼 어두운 잿빛, 불꽃 바로 위의 짧은 덩어리만 불빛을 받아 붉게 (짧게 살다 잿빛으로 식으며 사라진다)
  for (s.acc += dt * 4.2; s.acc >= 1; s.acc--)
    smokeP.spawn(s.x + rr(-0.8, 0.8), s.y + 1.4 + rr(0, 0.5), s.z + rr(-0.8, 0.8), wd.x * rr(0.5, 1.5) + rr(-0.4, 0.4), rr(2.1, 3.8), wd.y * rr(0.5, 1.5) + rr(-0.4, 0.4),
      rr(2.9, 4.5), [0.006, 0.006, 0.006, 0.66], [0.02, 0.02, 0.02, 0], rr(1.2, 1.8), rr(2.4, 3.5), -0.15, 0.25, 0);   // 처음부터 옅어지고, 크기·수명 80%
  for (s.red = (s.red || 0) + dt * 5; s.red >= 1; s.red--)
    smokeP.spawn(s.x + rr(-0.5, 0.5), s.y + 0.8 + rr(0, 0.3), s.z + rr(-0.5, 0.5), wd.x * rr(0.3, 0.8) + rr(-0.3, 0.3), rr(1.8, 2.8), wd.y * rr(0.3, 0.8) + rr(-0.3, 0.3),
      rr(0.9, 1.4), [0.26, 0.07, 0.02, 0.8], [0.02, 0.018, 0.016, 0], rr(0.8, 1.1), rr(1.5, 2.1), -0.1, 0.5, 0.5);
  if (far) return;   // 멀면 불꽃 입자는 생략 (연기만)
  for (s.fire = (s.fire || 0) + dt * 28; s.fire >= 1; s.fire--) {
    const big = rand() < 0.15;
    glowP.spawn(s.x + rr(-0.55, 0.55), s.y + rr(0.1, 0.5), s.z + rr(-0.55, 0.55), wd.x * 0.4 + rr(-0.3, 0.3), rr(1.4, 2.8), wd.y * 0.4 + rr(-0.3, 0.3),
      rr(0.3, 0.6) * (big ? 1.4 : 1), [1, 0.72, 0.28, 1], [0.85, 0.16, 0.02, 0], rr(0.6, 1.1) * (big ? 1.6 : 1), 0.15, -1.5, 1.5);
  }
  if (rand() < dt * 6) glowP.spawn(s.x + rr(-0.5, 0.5), s.y + 0.6, s.z + rr(-0.5, 0.5), wd.x + rr(-0.8, 0.8), rr(2.5, 4.5), wd.y + rr(-0.8, 0.8), rr(0.8, 1.5), [1, 0.7, 0.3, 1], [1, 0.3, 0.05, 0], 0.12, 0.06, -0.3, 0.5);   // 튀는 불티
}
function updateSmokers(dt) {
  const wd = U.uWindDir.value;
  for (let i = smokers.length - 1; i >= 0; i--) {
    const s = smokers[i]; s.t += dt;
    if (s.t > s.dur) { smokers.splice(i, 1); continue; }
    const k = 1 - s.t / s.dur, rate = (s.weak ? 5 : 10) * Math.sqrt(k);
    if (s.weak) { wreckFire(s, dt); continue; }
    for (s.acc += dt * rate; s.acc >= 1; s.acc--) {
      smokeP.spawn(s.x + rr(-1.2, 1.2), s.y + rr(0, 0.8), s.z + rr(-1.2, 1.2), wd.x * rr(0.5, 1.5) + rr(-0.4, 0.4), rr(3, 5.4), wd.y * rr(0.5, 1.5) + rr(-0.4, 0.4),
        rr(2.9, 4.5), [0.006, 0.006, 0.006, Math.min(1, k * 1.6)], [0.02, 0.02, 0.02, 0], rr(1.4, 2.2), rr(2.9, 4.3), -0.15, 0.25, 0);   // 처음부터 옅어지고, 크기·수명 80%
    }
    if (s.t < 4 && rand() < dt * 25)
      glowP.spawn(s.x + rr(-1.2, 1.2), s.y, s.z + rr(-1.2, 1.2), rr(-0.3, 0.3), rr(0.6, 1.6), rr(-0.3, 0.3), rr(0.4, 0.8), [1, 0.6, 0.2, 1], [0.7, 0.15, 0.02, 0], rr(0.4, 0.8), 0.2, 0, 1);
  }
}
const _seg = new THREE.Box3(), _dir = new THREE.Vector3(), _tl = {};
const _hu = new THREE.Vector3(), _hv = new THREE.Vector3(), _ho = new THREE.Vector3(), RAY_OFS = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]], RAY_ONE = [[0, 0]];
// 상자(보급품·나무 상자)에 맞은 면: 상자 좌표에서 가장 많이 튀어나온 축이 그 면. 맞은 점은 그 면 위로 옮긴다
const _bc = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bxl = new THREE.Vector3(), _bqi = new THREE.Quaternion();
function boxFace(c, q, half, p) {
  _bxl.copy(p).sub(c).applyQuaternion(_bqi.copy(q).invert());
  const ax = ['x', 'y', 'z'].reduce((m, k) => Math.abs(_bxl[k]) > Math.abs(_bxl[m]) ? k : m, 'x');
  const n = new THREE.Vector3(); n[ax] = Math.sign(_bxl[ax]) || 1;
  _bxl[ax] = n[ax] * half;
  for (const k of ['x', 'y', 'z']) if (k !== ax) _bxl[k] = Math.max(-half, Math.min(half, _bxl[k]));
  return { p: _bxl.applyQuaternion(q).add(c).clone(), n: n.applyQuaternion(q) };
}
const _bhL = new THREE.Vector3(), _bhF = new THREE.Vector3(), _bhQ = new THREE.Quaternion();
function ballHit(a, p, b) {
  const R = BALL_R;
  // 보드 경계의 투명한 벽: 지나간 지점에서 터진다
  if (Math.abs(p.x) > HALF || Math.abs(p.z) > HALF) {
    let t = 1;
    const n = new THREE.Vector3();
    if (Math.abs(p.x) > HALF) { const tt = (Math.sign(p.x) * HALF - a.x) / (p.x - a.x); if (tt < t) { t = tt; n.set(-Math.sign(p.x), 0, 0); } }
    if (Math.abs(p.z) > HALF) { const tt = (Math.sign(p.z) * HALF - a.z) / (p.z - a.z); if (tt < t) { t = tt; n.set(0, 0, -Math.sign(p.z)); } }
    const q = a.clone().lerp(p, Math.max(0, Math.min(1, t)));
    if (q.y > groundAt(Math.max(-HALF, Math.min(HALF, q.x)), Math.max(-HALF, Math.min(HALF, q.z))) - 0.5) return { p: q, n, wall: true };
  }
  for (const t of targets) {
    if (!t.alive || Math.abs(p.y - t.y) > TARGET_S / 2 + R) continue;
    fpLocal(t.fp, p.x, p.z, _tl);
    if (Math.abs(_tl.x) < TARGET_S / 2 + R && Math.abs(_tl.z) < TARGET_S / 2 + R) return { ...boxFace(t.mesh.position, t.mesh.quaternion, TARGET_S / 2, p), target: t };
  }
  for (const c of crates) {
    if (!c.alive || Math.abs(p.y - c.y) > c.s / 2 + R) continue;
    const dx = p.x - c.x, dz = p.z - c.z, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    if (Math.abs(dx * cs - dz * sn) < c.s / 2 + R && Math.abs(dx * sn + dz * cs) < c.s / 2 + R) return { ...boxFace(_bc.set(c.x, c.y, c.z), _bq.setFromAxisAngle(UP, c.rot), c.s / 2, p), crate: c };
  }
  // 탱크(나·적): 차체 상자. 쏜 탱크 자신은 막 쏜 직후 잠깐 제외.
  // 맞은 면(정면/측면/후면)은 포탄이 날아온 방향으로 가린다: 위에서 떨어져 윗면에 맞아도 날아온 쪽이 기준
  for (const E of TANKS) {
    if (!E.solid || (E === b.owner && b.age <= 0.25)) continue;
    _bhQ.copy(E.q).invert();   // 조준선 계산이 _loc·_tmp를 쓰고 있으니 여기서는 전용 벡터만
    _bhL.copy(p).sub(E.pos).applyQuaternion(_bhQ).add(COM);
    if (Math.abs(_bhL.x) < (E.hx ?? HULL_HX) + R && _bhL.y > -R && _bhL.y < (E.ht ?? 2.8) + R && Math.abs(_bhL.z) < (E.hz ?? HULL_HZ) + R) {
      const from = _bhF.copy(b.v || _bhF.copy(p).sub(a)).negate().applyQuaternion(_bhQ);   // 탱크 좌표에서 포탄이 온 쪽
      // 위아래로 45도보다 가파르게 날아왔으면 상단(위에서)·하단(아래에서), 아니면 수평 방향으로 정면/측면/후면
      const fh = Math.hypot(from.x, from.z);
      const face = from.y > fh ? 'top' : -from.y > fh ? 'bottom' : Math.abs(from.z) > Math.abs(from.x) ? (from.z > 0 ? 'front' : 'rear') : 'side';
      return { p: p.clone(), enemy: E, face };
    }
  }
  const wy = waterAt(p.x, p.z);
  if (p.y - R * 0.3 < wy) return { p: new THREE.Vector3(p.x, wy, p.z), water: true };
  const gy = groundAt(p.x, p.z);
  if (p.y - R < gy) return { p: new THREE.Vector3(p.x, gy - p.y < 1 ? gy : p.y, p.z) };
  for (const pp of allPoles)
    if (Math.hypot(p.x - pp.x, p.z - pp.z) < 0.3 + R && p.y > pp.y && p.y < pp.y + 9.2) return { p: p.clone() };
  _seg.setFromPoints([a, p]).expandByScalar(R);
  for (const fp of footprints) {
    if (!fp.group || !_seg.intersectsBox(fp.box)) continue;
    if (fp.bunker) {   // 벙커: 상자로 판정. 맞은 면 방향으로 터진다
      fpLocal(fp, p.x, p.z, _tl);
      if (Math.abs(_tl.x) < fp.hx + R && Math.abs(_tl.z) < fp.hz + R && p.y > fp.y0 - R && p.y < fp.top + R) {
        const n = new THREE.Vector3();
        if (p.y > fp.top - 0.5) n.set(0, 1, 0);
        else if (Math.abs(_tl.x) / fp.hx > Math.abs(_tl.z) / fp.hz) { const k = Math.sign(_tl.x); n.set(k * fp.c, 0, -k * fp.s); }
        else { const k = Math.sign(_tl.z); n.set(k * fp.s, 0, k * fp.c); }
        return { p: p.clone(), n, group: fp.group, bunker: fp.bunker };
      }
      continue;
    }
    if (fp.sandbag) {   // 모래주머니: 상자로 판정
      fpLocal(fp, p.x, p.z, _tl);
      if (Math.abs(_tl.x) < fp.hx + R && Math.abs(_tl.z) < fp.hz + R && p.y > fp.y0 - R && p.y < fp.top + R) return { p: p.clone(), n: UP.clone(), sandbag: fp.sandbag };
      continue;
    }
    if (fp.wreck) {   // 잔해: 잘게 쪼갠 모델 대신 상자로 판정 (맞으면 어차피 통째로 터진다)
      fpLocal(fp, p.x, p.z, _tl);
      if (Math.abs(_tl.x) < fp.hx + R && Math.abs(_tl.z) < fp.hz + R && p.y > fp.y0 - R && p.y < fp.y0 + 2.6 + R) return { p: p.clone(), n: UP.clone(), group: fp.group, metal: true };
      continue;
    }
    // 철골 기둥: 바깥면에 닿으면 터진다 (그을음은 아래에서 철골 면에만 투영되어 묻는다)
    const so = fp.solid;
    if (so && p.y > so.y0 && p.y < so.y0 + so.h) {
      fpLocal(fp, p.x, p.z, _tl);
      const half = lerp(so.b0, so.b1, (p.y - so.y0) / so.h) + R;
      if (Math.abs(_tl.x) < half && Math.abs(_tl.z) < half) {
        const n = new THREE.Vector3();
        if (Math.abs(_tl.x) > Math.abs(_tl.z)) { const k = Math.sign(_tl.x); n.set(k * fp.c, 0, -k * fp.s); }
        else { const k = Math.sign(_tl.z); n.set(k * fp.s, 0, k * fp.c); }
        return { p: p.clone().addScaledVector(n, -R), n, decal: true, group: fp.group, metal: true };
      }
    }
    // 건물: 경계 상자는 간판·현관까지 품어 크니, 구간 끝점이 실제 건물 자리(+여유 2m) 안에 들 때만 광선을 쏜다
    if (fp.ray) {
      const nearFp = (q) => { fpLocal(fp, q.x, q.z, _tl); return Math.abs(_tl.x) < fp.hx + 2 && Math.abs(_tl.z) < fp.hz + 2; };
      if ((!nearFp(p) && !nearFp(a)) || Math.min(a.y, p.y) > fp.top + R) continue;   // 지붕보다 높이 지나가는 구간도 건너뛴다
    }
    _dir.copy(p).sub(a);
    const len = _dir.length(); _dir.normalize();
    // 가운데 + 포탄 반지름만큼 둘레로 비껴 쏜 광선 4개: 격자탑 기둥·날개처럼 가는 부재에 포탄 가장자리가 닿아도 맞는다
    _hu.set(0, 1, 0); if (Math.abs(_dir.y) > 0.9) _hu.set(1, 0, 0);
    _hu.cross(_dir).normalize(); _hv.crossVectors(_dir, _hu);
    let hit = null;
    for (const [ou, ov] of fp.ray ? RAY_ONE : RAY_OFS) {   // 건물은 넓은 면이라 가운데 광선 하나로 충분 (비껴 쏘기는 가는 철골용)
      raycaster.set(_ho.copy(a).addScaledVector(_hu, ou * R).addScaledVector(_hv, ov * R), _dir); raycaster.far = len + R;
      const h = raycaster.intersectObject(fp.ray || fp.group, true).find(x => x.object.isMesh && x.face);
      if (h && (!hit || h.distance < hit.distance)) hit = h;
    }
    if (hit) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(_dir) > 0) n.negate();
      return { p: hit.point.clone(), n, decal: true, group: fp.group, metal: !!fp.metal };
    }
  }
  return null;
}
const _prev = new THREE.Vector3();
// 지도 사방은 유리벽: 포탄은 터지지 않고 튕긴다 (벽에 수직인 속도만 80%로 뒤집음). 맞은 점에 쇠 불똥, 유리 면을 따라 퍼지는 반짝임과 하얀 빛, 퉁 소리
const _gt1 = new THREE.Vector3(), _gt2 = new THREE.Vector3();
function glassBounce(b, hit) {
  const n = hit.n;
  b.v.addScaledVector(n, -1.8 * b.v.dot(n));
  b.p.copy(hit.p).addScaledVector(n, BALL_R + 0.05);
  b.bounce = (b.bounce || 0) + 1;
  sparks(hit.p, n);
  _gt1.set(0, 1, 0); _gt2.crossVectors(n, _gt1).normalize();   // 유리 면 위의 두 방향 (위, 옆)
  for (let k = 0; k < 28; k++) {
    const a = k / 28 * 6.283, s = rr(3, 9);
    glowP.spawn(hit.p.x, hit.p.y, hit.p.z, (Math.cos(a) * _gt1.x + Math.sin(a) * _gt2.x) * s, Math.cos(a) * s, (Math.cos(a) * _gt1.z + Math.sin(a) * _gt2.z) * s,
      rr(0.25, 0.5), [0.85, 0.95, 1, 1], [0.45, 0.75, 1, 0], rr(0.18, 0.3), 0.04, 0, 5);
  }
  glowP.spawn(hit.p.x, hit.p.y, hit.p.z, 0, 0, 0, 0.18, [1, 1, 1, 1], [0.6, 0.85, 1, 0], 2.4, 0.6, 0, 0);
  flashes.push({ p: hit.p.clone().addScaledVector(n, 0.5), t: 0, dur: 0.25, I: 260, range: 16, color: 0xd8f0ff });
  sfx.glass(hit.p);
  shake = Math.min(1.2, shake + Math.max(0, 0.35 - camera.position.distanceTo(hit.p) / 120));
}
function updateBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], h = dt / 4;
    let hit = null;
    for (let s = 0; s < 4 && !hit; s++) {
      _prev.copy(b.p);
      b.v.y -= G * h; b.p.addScaledVector(b.v, h); b.age += h;
      hit = ballHit(_prev, b.p, b);
      if (hit && hit.wall && (b.bounce || 0) < 3) { glassBounce(b, hit); hit = null; }   // 사방 유리벽: 퉁 튕겨 나온다 (세 번까지)
      // 하얀 연기 꼬리: 궤적을 가늠할 수 있게
      for (b.trail += h; b.trail > 0.05; b.trail -= 0.05)
        smokeP.spawn(b.p.x + rr(-0.1, 0.1), b.p.y + rr(-0.1, 0.1), b.p.z + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(0, 0.3), rr(-0.2, 0.2),
          rr(1.8, 2.6), [0.8, 0.8, 0.77, 0.55], [0.62, 0.62, 0.62, 0], 0.55, 1.8, -0.2, 1);
    }
    b.mesh.position.copy(b.p);
    if (b.p.y - groundAt(b.p.x, b.p.z) < 1.8) forCells(b.p.x, b.p.z, 0.8, (k) => { fTr[k] = 1; });
    // '저격수': 쏜 자리에서 멀리 맞힐수록 대미지 (15m부터 1m에 2%씩, 최대 설정값)
    if (hit && b.owner && b.owner.sniper && b.from) b.dmg *= 1 + Math.min(b.owner.sniper, Math.max(0, b.p.distanceTo(b.from) - 15) * 0.02);
    if (hit) {
      const pw = 1 + (b.blast || 0) * 0.1;   // 폭발 범위가 넓을수록 커 보이게
      const wreck = hit.group && hit.group.userData.wreck;
      if (b.harmless) { if (hit.water) splash(hit.p); else explode(hit.p, hit.n || UP, false, pw); }   // 타이틀 포탄: 터지기만 한다
      else if (hit.target) { damageTarget(hit.target, b.dmg); if (hit.target.alive) explode(hit.p, hit.n, false, pw); }
      else if (hit.enemy) hitTank(hit.enemy, hit, b);
      else if (hit.bunker) { explode(hit.p, hit.n, false, pw); spawnShards(hit.p, 14, CONCRETE_COLS, 4, 12, hit.n, 0.15, 0.45); damageBunker(hit.bunker, b.dmg, b.owner); }
      else if (hit.crate) { explode(hit.p, UP, false, pw); const cc = crateCols(hit.crate); spawnShards(hit.p, 14, cc, 7, 22, null, 0.18, 0.48); spawnShards(hit.p, 16, cc, 8, 26, null, 0.035, 0.08); damageCrate(hit.crate, b.dmg); }   // 폭발은 지면과 같고 조각(+잔 부스러기)만 더
      else if (hit.sandbag) { explode(hit.p, UP, false, pw); damageSandbag(hit.sandbag, b.dmg); }
      else if (hit.water) splash(hit.p);
      else if (hit.wall) { explode(hit.p, hit.n, false, pw); addWallScorch(hit.p, hit.n); }
      else if (wreck) { damageWreck(wreck, b.dmg); if (WRECKS.includes(wreck)) explode(hit.p, hit.n, false, pw); }   // 잔해는 체력이 다하면 완전히 터진다
      else {
        explode(hit.p, hit.n, false, pw);
        if (hit.decal) addScorchDecal(hit.p, hit.n, hit.group);
        if (hit.decal) spawnShards(hit.p, 18, hit.metal ? METAL_COLS : WOOD_COLS, 4, 13, hit.n, 0.15, 0.45);   // 판자 조각 / 쇳조각
      }
      // 폭발 범위: 둘레의 탱크(피아 구분 없음)·상자·잔해에 포탄 대미지 × 비율 (직격당한 것은 빼고)
      if (!hit.water && b.blast > 0 && !b.harmless) blastDamage(hit.p, b.blast, b.dmg * b.blastRatio, b.owner, hit.target || hit.enemy || hit.crate || wreck || hit.bunker || hit.sandbag);
    }
    if (hit || b.p.y < BOTTOM - 25) { scene.remove(b.mesh); balls.splice(i, 1); }
  }
}
const _tip = new THREE.Vector3(), _piv = new THREE.Vector3();
// 탱크 상태 → 모델 (내 탱크·적 탱크 공용: T.group, T.P)
function syncBody(T) {
  T.P.pivot.rotation.x = -T.elev;
  T.P.turret.rotation.y = T.tyaw || 0;
  T.group.quaternion.copy(T.q);
  T.group.position.copy(T.pos).sub(_tmp.copy(COM).applyQuaternion(T.q));
}
function syncTankVisual() { syncBody(tank); }
function muzzle(T = tank) {
  syncBody(T);
  T.group.updateMatrixWorld(true);
  T.P.tip.getWorldPosition(_tip); T.P.pivot.getWorldPosition(_piv);
  return _dir.copy(_tip).sub(_piv).normalize();
}
const TURRET_RATE = PC.turretRate * DEG, TURRET_ACC = 3.5, TURRET_SNAP = 15 * Math.PI / 180;   // 포탑 회전: 최고 속도(rad/s), 가감속(rad/s²), 정면 보정 범위
// 포탑 회전: 누르면 서서히 빨라지고 떼면 서서히 멈춘다. 정면 쪽으로 돌리다가 ±15도 안에서 손을 떼면 정면(0도)에 맞춰 멈춘다
function turretStep(T, tq, dt) {
  let a = Math.atan2(Math.sin(T.tyaw || 0), Math.cos(T.tyaw || 0)), v = T.tvel || 0;
  if (tq) T.tsnap = false;
  else if (!T.tsnap && Math.abs(a) < TURRET_SNAP && a * v < 0) T.tsnap = true;
  const rate = T.turretRate || TURRET_RATE;
  let want = tq * rate;
  if (T.tsnap) want = -Math.sign(a) * Math.min(rate, Math.sqrt(2 * TURRET_ACC * Math.abs(a)));   // 딱 0도에 서도록 줄여 가며
  v += Math.max(-TURRET_ACC * dt, Math.min(TURRET_ACC * dt, want - v));
  const na = a + v * dt;
  if (T.tsnap && (Math.abs(na) < 0.003 || na * a < 0)) { a = 0; v = 0; T.tsnap = false; } else a = na;
  T.tyaw = a; T.tvel = v;
}
const VEL_INHERIT = 0.5;   // 포탄은 탱크 속도의 절반만 이어받는다
// spread: 일부러 흩뜨리는 각도 (적 탱크 명중률 조절용)
function fireCannon(T = tank, spread = 0) {
  const dir = muzzle(T).clone();
  if (spread) { dir.applyAxisAngle(UP, rr(-spread, spread)); dir.y += rr(-spread, spread) * 0.6; dir.normalize(); }
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.position.copy(_tip); scene.add(mesh);
  const berserk = T.berserk ? 1 + T.berserk * Math.max(0, 1 - T.hp / T.maxHp) : 1;   // '광전사': HP가 낮을수록
  const ball = { mesh, p: _tip.clone(), v: dir.clone().multiplyScalar(T.muzzle || MUZZLE).addScaledVector(T.vel, VEL_INHERIT), age: 0, trail: 0, owner: T,
    dmg: T.shellDmg * berserk, blast: T.blastR || 0, blastRatio: T.blastRatio || 0, from: _tip.clone() };
  balls.push(ball);
  if (T === tank && titleState === 'play') for (const E of ENEMIES) if (E.solid && !E.spg && E.pos.distanceTo(T.pos) < HEAR_SHOT_R) { E.seenX = T.pos.x; E.seenZ = T.pos.z; E.lost = Math.min(E.lost || 0, 1); }   // 포성: 가까운 적이 소리 난 곳으로 온다
  // 반동: 몸통이 뒤로 밀리고 앞이 들린다
  T.vel.addScaledVector(dir, -RECOIL);
  vfPush(_tip.x + dir.x * 2.5, _tip.z + dir.z * 2.5, 5, 4, dir.x * VF.cannonPush, dir.z * VF.cannonPush, 0.5);   // 복셀 안개: 포구 앞으로 풍압
  applyAngularImpulse(_tmp.copy(_tip).sub(T.pos).cross(dir.clone().multiplyScalar(-RECOIL)), T);
  T.recoil = 1;
  // 포구를 중심으로 풀이 바깥으로 확 눕고 (범위 9.6m), 땅에서 흙먼지 고리가 퍼진다 (탱크·상자 착지와 같은 먼지, 2배 빠르게)
  addBlast(_tip.x, _tip.y, _tip.z, 9.6);
  const mgy = groundAt(_tip.x, _tip.z);
  if (_tip.y - mgy < 4) for (let k = 0; k < 26; k++) {
    const a = k / 26 * 6.283, s = rr(12, 24);   // 처음 속도만 1.5배: 감속은 같으니 1.5배 멀리 퍼진다
    smokeP.spawn(_tip.x + Math.cos(a) * 1.2, mgy + 0.2, _tip.z + Math.sin(a) * 1.2, Math.cos(a) * s, rr(0.2, 0.8), Math.sin(a) * s, rr(0.8, 1.3), [0.32, 0.27, 0.2, 0.6], [0.3, 0.27, 0.22, 0], 0.7, 2.4, 0, 3.5, 0.5);
  }
  for (let k = 0; k < 16; k++) {
    const s = rr(3, 9);
    glowP.spawn(_tip.x, _tip.y, _tip.z, dir.x * s + rr(-1, 1), dir.y * s + rr(-1, 1), dir.z * s + rr(-1, 1), rr(0.12, 0.3), [1, 0.95, 0.7, 1], [1, 0.4, 0.1, 0], rr(1.4, 2.2), 0.3, 0, 4);
  }
  for (let k = 0; k < 5; k++) {
    const s = rr(1, 4);
    smokeP.spawn(_tip.x, _tip.y, _tip.z, dir.x * s + rr(-0.5, 0.5), dir.y * s + rr(0, 0.8), dir.z * s + rr(-0.5, 0.5), rr(1.2, 2.2), [0.5, 0.48, 0.45, 0.6], [0.4, 0.4, 0.4, 0], 1.0, 3.2, -0.2, 1.5);
  }
  flashes.push({ p: _tip.clone(), t: 0, dur: 0.45, I: 700, range: 36, color: 0xffd08a });   // 포구 섬광 (광원). 기관총보다 크고 밝고, 0.45초에 걸쳐 사그라든다
  shake = Math.min(1.2, shake + 0.25 * (T === tank ? 1 : Math.max(0, 1 - camera.position.distanceTo(_tip) / 60)));
  sfx.fire(_tip);
  return ball;
}
// 풀이 타는 동안은 잔불 정도만: 낮고 작은 불씨와 가끔 피어오르는 옅은 연기
function spawnFire(dt) {
  if (!burning.length) return;
  const wd = U.uWindDir.value, rate = Math.min(30, burning.length * dt * 0.6);
  const n = Math.floor(rate) + (rand() < rate % 1 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const c = burning[(rand() * burning.length) | 0];
    const x = -HALF + ((c % FN) + rand()) * FCELL, z = -HALF + (((c / FN) | 0) + rand()) * FCELL, y = heightAt(x, z) + rr(0, 0.25);
    glowP.spawn(x, y, z, wd.x * 0.4 + rr(-0.2, 0.2), rr(0.5, 1.1), wd.y * 0.4 + rr(-0.2, 0.2), rr(0.3, 0.6), [1, 0.75, 0.3, 1], [0.8, 0.18, 0.03, 0], rr(0.3, 0.45), 0.1, 0, 1);
    if (rand() < 0.06) smokeP.spawn(x, y + 0.5, z, wd.x * 1.2, rr(0.6, 1.2), wd.y * 1.2, rr(1.5, 2.5), [0.07, 0.065, 0.06, 0.22], [0.1, 0.1, 0.1, 0], 0.5, 1.8, 0, 0.3);
    if (rand() < 0.1) glowP.spawn(x, y + 0.3, z, wd.x * 1.5 + rr(-0.6, 0.6), rr(1.5, 3), wd.y * 1.5 + rr(-0.6, 0.6), rr(0.8, 1.5), [1, 0.7, 0.3, 1], [1, 0.3, 0.05, 0], 0.1, 0.06, -0.3, 0.5);
  }
}
// 궤도 자국 + 지면에 맞는 주행 이펙트 (풀밭: 풀 부스러기가 뒤로 튐, 맨땅: 흙먼지, 물: 물보라)
const _wp = new THREE.Vector3();
let marksDirty = false;
function driveEffects(dt) {
  stampMeshes.forEach(m => { m.visible = false; });
  if (dt > 0) enemySpray(dt);
  if (tank.contacts === 0) return;
  tankGroup.updateMatrixWorld(true);
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  [tank.sL, tank.sR].forEach((sp, si) => {
    const x = (si === 0 ? 1 : -1) * TRACK_X;
    // 땅에 닿아 있는 궤도 구간만 궤도판 무늬로 찍는다. 무늬 위상은 벨트 이동량에 묶여 있어
    // 미끄러지지 않으면 땅 위에 그대로 고정되고, 헛돌면 번진다
    let z0 = 9, z1 = -9;
    for (let z = -1.4; z <= 1.41; z += 0.35) {
      tankGroup.localToWorld(_wp.set(x, 0, z));
      if (_wp.y - groundAt(_wp.x, _wp.z) < 0.25) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    }
    if (z1 >= z0 && !tank.wet) {
      z0 -= 0.45; z1 += 0.45;
      const m = stampMeshes[si], pa = m.geometry.attributes.position, va = m.geometry.attributes.aV;
      const d = si === 0 ? tank.dL : tank.dR;
      [[x - 0.36, z0], [x + 0.36, z0], [x - 0.36, z1], [x + 0.36, z1]].forEach(([lx, lz], k) => {
        tankGroup.localToWorld(_wp.set(lx, 0, lz));
        pa.setXYZ(k, _wp.x, 0, _wp.z);
        va.setX(k, (lz + d) / TREAD);
      });
      pa.needsUpdate = va.needsUpdate = true;
      m.visible = true; marksDirty = true;
    }
    trackSpray(tank, sp, x, dt);
  });
}
// 적 탱크·지프도 바퀴 뒤로 흙·물이 튄다 (카메라가 보는 곳 둘레만)
function enemySpray(dt) {
  for (const E of ENEMIES) {
    if (!E.solid || E.contacts === 0 || E.pos.distanceTo(controls.target) > 55) continue;
    E.group.updateMatrixWorld(true);
    trackSpray(E, E.sL, E.jeep ? 0.85 : TRACK_X, dt);
    trackSpray(E, E.sR, E.jeep ? -0.85 : -TRACK_X, dt);
  }
}
// 바퀴(궤도) 뒤로 튀는 흙·풀·물보라: sp = 그쪽 궤도 속도, x = 궤도 가로 위치 (탱크 기준)
function trackSpray(T, sp, x, dt) {
  const rate = Math.abs(sp) * dt * (T.wet ? 9 : 4);
  const n = Math.floor(rate) + (rand() < rate % 1 ? 1 : 0);
  if (!n) return;
  _fwd.set(0, 0, 1).applyQuaternion(T.q);
  const back = sp >= 0 ? -1 : 1;
  T.group.localToWorld(_wp.set(x, 0.1, back * (T.jeep ? 1.5 : 1.9)));
  if (_wp.y - groundAt(_wp.x, _wp.z) > 0.4 && !T.wet) return;
  const c = cellOf(_wp.x, _wp.z), grassy = c >= 0 && fCap[c] > 0.5 && fGrow[c] > 0.5;
  for (let k = 0; k < n; k++) {
    if (T.wet) {
      const wy = Math.max(waterAt(_wp.x, _wp.z), _wp.y), s = rr(1, 3);
      smokeP.spawn(_wp.x + rr(-0.4, 0.4), wy, _wp.z + rr(-0.4, 0.4),
        _fwd.x * back * s + rr(-1.2, 1.2), rr(2, 4.5), _fwd.z * back * s + rr(-1.2, 1.2),
        rr(0.5, 0.9), [0.82, 0.88, 0.9, 0.8], [0.7, 0.78, 0.82, 0], rr(0.15, 0.3), 0.5, 9.8, 0.3);
      if (rand() < 0.3) smokeP.spawn(_wp.x, wy + 0.05, _wp.z, rr(-1, 1), 0.1, rr(-1, 1), rr(1, 1.6), [0.75, 0.8, 0.82, 0.35], [0.7, 0.75, 0.8, 0], 0.4, 1.8, 0, 2);
    } else if (grassy) {
      const s = rr(2, 4.5);
      smokeP.spawn(_wp.x + rr(-0.3, 0.3), _wp.y + rr(0, 0.3), _wp.z + rr(-0.3, 0.3),
        _fwd.x * back * s + rr(-1, 1), rr(2, 4.5), _fwd.z * back * s + rr(-1, 1),
        rr(0.5, 0.9), [0.42, 0.34, 0.17, 1], [0.32, 0.26, 0.14, 1], rr(0.1, 0.16), 0.1, 9, 0.3);
      if (rand() < 0.15) smokeP.spawn(_wp.x, _wp.y + 0.3, _wp.z, _fwd.x * back, rr(0.3, 0.8), _fwd.z * back,
        rr(0.8, 1.4), [0.2, 0.17, 0.11, 0.18], [0.22, 0.2, 0.16, 0], 0.5, 1.6, -0.1, 1.5);
    } else if (rand() < 0.5) {
      smokeP.spawn(_wp.x + rr(-0.3, 0.3), _wp.y + rr(0, 0.3), _wp.z + rr(-0.3, 0.3),
        _fwd.x * back * rr(0.5, 1.5) + rr(-0.4, 0.4), rr(0.4, 1.0), _fwd.z * back * rr(0.5, 1.5) + rr(-0.4, 0.4),
        rr(1.2, 2.0), [0.2, 0.16, 0.11, 0.3], [0.22, 0.19, 0.15, 0], rr(0.5, 0.8), rr(1.8, 2.5), -0.1, 1.5);
    }
  }
}
// 궤도 자국 마스크 갱신: 이번 프레임 찍기 + 30/255초마다 1/255씩 빼서 30초에 걸쳐 사라짐
let fadeAcc = 0;
function updateTrackMap(dt) {
  const ac = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(trackRT);
  if (stampMeshes[0].visible || stampMeshes[1].visible) renderer.render(stampScene, stampCam);
  for (fadeAcc += dt; fadeAcc >= 30 / 255; fadeAcc -= 30 / 255) if (marksDirty && titleState !== 'title') renderer.render(fadeScene, stampCam);   // 타이틀 동안은 지우지 않는다
  renderer.setRenderTarget(null);
  renderer.autoClear = ac;
}
// 굴뚝 연기: 전진/후진을 누르고 있으면 엔진이 돈다. 힘을 많이 줄수록(오르막, 속도가 안 붙을 때) 짙고 많이
const _sp = new THREE.Vector3(), _sd = new THREE.Vector3(), _ef = new THREE.Vector3();
let exhaustAcc = 0;
function exhaust(dt, thr, turn) {
  let want = turn ? 0.25 : 0;
  if (thr) {
    _ef.set(0, 0, 1).applyQuaternion(tank.q);
    const dir = Math.sign(thr), vmax = VMAX * (tank.spdM || 1) * (tank.wet ? 0.5 : 1);
    const hill = Math.max(0, Math.min(1, _ef.y * dir / 0.22));                         // 오르막 (약 13도에서 최대)
    const lag = Math.max(0, Math.min(1, 1 - tank.vel.dot(_ef) * dir / vmax));         // 속도가 덜 붙은 만큼
    want = 0.45 + 0.55 * Math.min(1, Math.max(hill, lag * 0.75) + hill * lag * 0.5);
  }
  if (titleState === 'title') want = Math.max(want, TDET.smoke);   // 타이틀: 굴뚝 연기를 짙게
  tank.load += (want - tank.load) * Math.min(1, dt * (want > tank.load ? 6 : 2.5));
  const L = tank.load, wd = U.uWindDir.value;
  parts.stack.getWorldPosition(_sp);
  const sd = _sd.copy(STACK_DIR).applyQuaternion(tank.q);   // 굴뚝 끝이 향한 방향 (뒤로 60도)
  // 간격·크기·색·속도를 입자마다 흔들고, 가끔 덩어리째 뿜어 규칙적인 줄로 보이지 않게
  for (exhaustAcc += dt * (2 + L * 11) * rr(0.3, 1.7); exhaustAcc >= 1; exhaustAcc--) {
    const puff = rand() < 0.12 ? rr(1.3, 1.7) : 1, k = rr(0.6, 1.35) * puff, sp = (1.4 + L * 2.8) * rr(0.7, 1.3);
    const g = Math.max(0.005, lerp(0.16, 0.012, Math.min(1, L * 1.5)) * rr(0.6, 1.4) * (puff > 1 ? 0.6 : 1));
    smokeP.spawn(_sp.x + rr(-0.08, 0.08), _sp.y, _sp.z + rr(-0.08, 0.08),
      tank.vel.x * 0.4 + wd.x * 0.6 + sd.x * sp + rr(-0.4, 0.4), sd.y * sp + 0.3, tank.vel.z * 0.4 + wd.y * 0.6 + sd.z * sp + rr(-0.4, 0.4),
      (0.9 + L * 1.1) * rr(0.7, 1.4), [g, g, g * rr(0.9, 1.1), 1], [g + 0.04, g + 0.04, g + 0.04, 0],
      (0.28 + 0.4 * L) * k, (0.6 + 1.5 * L) * k, -0.25, 0.8, 0.2);   // 수명 20%까지는 불투명, 그 뒤 옅어진다
  }
}
// 깜빡이는 가로등: 대부분 켜져 있다가 가끔 지직거리며 꺼졌다 켜진다
function updateLamps() {
  const t = U.uTime.value;
  for (const l of lamps) {
    if (!l.flicker) continue;
    const tt = t + l.phase;
    const burst = Math.sin(tt * 0.9) + Math.sin(tt * 2.3) * 0.5 > 0.7;      // 고장 구간
    const on = !burst || Math.sin(tt * 37) * Math.sin(tt * 23 + 1.3) > 0.15;
    const k = on ? (burst ? 0.6 : 1) : 0.03;
    l.light.intensity = l.base * k;
    l.glow.material.opacity = k;
  }
}
function updateLights(dt) {
  updateLamps();
  const src = [];
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt;
    if (f.t >= f.dur) { flashes.splice(i, 1); continue; }
    const k = 1 - f.t / f.dur;
    src.push({ x: f.p.x, y: f.p.y, z: f.p.z, I: f.I * k * k, range: f.range, color: f.color });
  }
  const t = U.uTime.value;
  // 불타는 풀의 불빛: 큰 구역 4곳. 구역마다 빛을 기억해 두고 자리·밝기를 천천히 따라가며, 빠진 구역은 서서히 꺼진다
  for (const g of fireGlow.values()) g.tI = 0;
  for (const b of fireBins.slice(0, 4)) {
    let g = fireGlow.get(b.b);
    if (!g) fireGlow.set(b.b, g = { x: b.x, z: b.z, I: 0 });
    g.tx = b.x; g.tz = b.z; g.tI = 16 * Math.min(1, b.s / 8);
  }
  const kp = 1 - Math.exp(-dt * 2), ki = 1 - Math.exp(-dt * 3);
  for (const [key, g] of fireGlow) {
    g.x += (g.tx - g.x) * kp; g.z += (g.tz - g.z) * kp; g.I += (g.tI - g.I) * ki;
    if (!g.tI && g.I < 0.3) { fireGlow.delete(key); continue; }
    const flick = 0.8 + 0.2 * Math.sin(t * 17 + g.x) * Math.sin(t * 11 + g.z);
    src.push({ x: g.x, y: heightAt(g.x, g.z) + 1.6, z: g.z, I: g.I * flick, range: 12, color: 0xff7a30 });
  }
  // 가까운 잔해 두 곳의 불빛 (폭발 섬광보다 약해서 섬광이 있으면 자리를 내준다)
  smokers.filter(s => s.weak).map(s => ({ s, d: (s.x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2 })).filter(o => o.d < 70 * 70)
    .sort((a, b) => a.d - b.d).slice(0, 2).forEach(({ s }) => {
      const flick = 0.7 + 0.3 * Math.sin(t * 21 + s.x) * Math.sin(t * 9 + s.z);
      src.push({ x: s.x, y: s.y + 1.2, z: s.z, I: 26 * flick, range: 11, color: 0xff7a30 });
    });
  // 경보 중인 벙커 사이렌: 빛줄기 쪽으로 빨간 빛이 돌며 벽·땅을 쓸고 지나간다 (카메라 가까운 2곳)
  BUNKERS.filter((B) => B.alarmOn && B.siren).map((B) => ({ B, d: (B.x - camera.position.x) ** 2 + (B.z - camera.position.z) ** 2 })).filter((o) => o.d < 90 * 90)
    .sort((a, b) => a.d - b.d).slice(0, 2).forEach(({ B }) => {
      B.siren.getWorldPosition(_tmp);
      const a = B.rot + B.sirenA, dx = Math.cos(a), dz = -Math.sin(a);   // 빛줄기 하나의 방향 (지붕 기준 +x를 돌린 것)
      src.push({ x: _tmp.x + dx * 3.5, y: _tmp.y - 0.8, z: _tmp.z + dz * 3.5, I: 55, range: 16, color: 0xff2412 });
    });
  for (const s of smokers) if (s.t < 4) {   // 부서진 상자 밑에서 이글거리는 불빛
    const flick = 0.75 + 0.25 * Math.sin(t * 19 + s.x) * Math.sin(t * 7 + s.z);
    src.push({ x: s.x, y: s.y + 1.2, z: s.z, I: 70 * (1 - s.t / 4) * flick, range: 20, color: 0xff6a20 });
  }
  // 큰 폭발 섬광 스프라이트 + 화면 전체 번쩍임
  bigFlash.t += dt;
  if (bigFlash.t < bigFlash.dur) {
    const k = 1 - bigFlash.t / bigFlash.dur;
    flashSprite.visible = true; flashSprite.scale.setScalar(8 + 24 * (1 - k * k)); flashSprite.material.opacity = k * k;
  } else flashSprite.visible = false;
  screenFlash = Math.max(0, screenFlash - dt * 3.5);
  postMat.uniforms.uFlash.value = screenFlash * screenFlash;
  src.sort((a, b) => b.I - a.I);
  fxLights.forEach((l, i) => {
    const s = src[i];
    if (!s) { l.intensity = 0; return; }
    l.position.set(s.x, s.y, s.z); l.intensity = s.I; l.distance = s.range; l.color.setHex(s.color);
  });
  fxLights.forEach((l, i) => {
    FXL.uLPos.value[i].copy(l.position);
    FXL.uLCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * 0.01);
  });
}

// 조준 궤적 미리보기: 화면에서 항상 같은 간격(저해상도 3.5픽셀)으로 찍은 1픽셀 점 (. . . .)
const AIM_N = 300, AIM_GAP_PX = 3.5;
const aimGeo = new THREE.BufferGeometry();
aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
aimGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(AIM_N * 3), 3).setUsage(THREE.DynamicDrawUsage));   // 점마다 색 (장전 게이지)
// 색: 발사 가능 = 노란빛, 장전 중 = 흐린 회청색. 궤적 끝 맞을 자리의 표면에 포탄 지름만 한 원
const AIM_READY = new THREE.Color(0xffe0a0), AIM_WAIT = new THREE.Color(0x6e7a8c), AIM_ENEMY = new THREE.Color(0xff3a2a);   // 쏠 수 있고 보급품·적·벙커를 겨누면 빨강
const aimMat = new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, size: 1, sizeAttenuation: false, fog: false });
const aimDots = new THREE.Points(aimGeo, aimMat);
aimDots.frustumCulled = false;
scene.add(aimDots);
// 맞을 자리: 포탄 지름만 한 원. 외곽선 + 속은 30% 칠. 풀에 묻혀도 보이도록 깊이 검사 없이 맨 위에 그린다
const aimRing = new THREE.Group();
const aimLine = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 0.84, BALL_R, 20), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false, depthTest: false, side: THREE.DoubleSide }));
const aimFill = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 0.84, 20), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
for (const m of [aimLine, aimFill]) { m.frustumCulled = false; m.renderOrder = 5; m.userData.noOutline = true; aimRing.add(m); }
aimRing.visible = false;
const _rz = new THREE.Vector3(0, 0, 1);
scene.add(aimRing);
const _sp1 = new THREE.Vector3(), _sp0 = new THREE.Vector2(), _sp2 = new THREE.Vector2();
const _aimA = new THREE.Vector3(), _rn = new THREE.Vector3(), _ru = new THREE.Vector3(), _rv = new THREE.Vector3(), AIM_BALL = { age: 0, owner: tank };
let aimHitP = null;
function updateAim() {
  if (!tank.solid) { aimGeo.setDrawRange(0, 0); aimRing.visible = false; aimHitP = null; return; }   // 내 탱크가 없으면 조준선도 없다
  const dir = muzzle(), a = aimGeo.attributes.position;
  const p = _prev.copy(_tip), v = _loc.copy(dir).multiplyScalar(tank.muzzle || MUZZLE).addScaledVector(tank.vel, VEL_INHERIT);
  const hw = rt.width / 2, hh = rt.height / 2;
  let n = 0, run = AIM_GAP_PX, has = false, hit = null, bounce = 0;
  _aimA.copy(p);
  for (let it = 0; it < 3000 && n < AIM_N; it++) {
    // 화면 좌표로 투영해 지나온 픽셀 거리만큼 쌓다가 간격이 차면 점 하나
    _sp1.copy(p).project(camera);
    if (_sp1.z < 1) {
      _sp2.set(_sp1.x * hw, _sp1.y * hh);
      if (has) run += _sp2.distanceTo(_sp0);
      _sp0.copy(_sp2); has = true;
      if (run >= AIM_GAP_PX) { a.setXYZ(n++, p.x, p.y, p.z); run = 0; }
    } else has = false;
    // 포탄과 같은 충돌 판정을 몇 걸음마다: 맞을 자리와 그 면의 방향
    if (it % 6 === 5) {
      hit = ballHit(_aimA, p, AIM_BALL);
      if (hit && hit.wall && bounce < 3) { v.addScaledVector(hit.n, -1.8 * v.dot(hit.n)); p.copy(hit.p).addScaledVector(hit.n, BALL_R + 0.05); bounce++; hit = null; }   // 유리벽에서 튕긴 궤적도 그린다
      else if (hit) break;
      _aimA.copy(p);
    }
    const h = 0.004;
    v.y -= G * h; p.addScaledVector(v, h);
  }
  // 장전 중에는 궤적이 게이지: 끝까지 회색 점을 찍되 장전된 만큼 포구 쪽부터 노란색. 맞을 자리·폭발 범위는 숨긴다 (보이는 순간 = 쏠 수 있다)
  const reloading = tank.cool > 0, frac = reloading ? Math.max(0, 1 - tank.cool / (tank.reload || PC.reload)) : 1;
  aimGeo.setDrawRange(0, n);
  a.needsUpdate = true;
  aimRing.visible = !!hit && !reloading;
  aimHitP = hit && !reloading ? hit.p : null;   // 폭발 범위 원형 빛 자리 (updateRings)
  const col = tank.cool > 0 ? AIM_WAIT : hit && (hit.target || hit.enemy || (hit.bunker && !hit.bunker.ruin)) ? AIM_ENEMY : AIM_READY;   // 보급품·적·벙커(부서진 것 빼고)를 겨누면 빨강
  aimLine.material.color.copy(col); aimFill.material.color.copy(col);
  const ca = aimGeo.attributes.color, nk = reloading ? Math.floor(n * frac) : n;
  for (let i = 0; i < n; i++) { const c = reloading ? (i < nk ? AIM_READY : AIM_WAIT) : col; ca.setXYZ(i, c.r, c.g, c.b); }
  ca.needsUpdate = true;
  if (hit) {
    if (hit.n) _rn.copy(hit.n); else if (hit.water) _rn.copy(UP); else normalAt(hit.p.x, hit.p.z, _rn);
    aimRing.quaternion.setFromUnitVectors(_rz, _rn);
    aimRing.position.copy(hit.p).addScaledVector(_rn, 0.06);
  }
}

// ---------------------------------------------------------------- 기관총 (내 탱크: 성장 '기관총' 최대 2정 / 적 탱크: 레벨 2는 1정, 레벨 3은 2정)
// 1정은 포탑 지붕 오른쪽, 2정은 지붕 왼쪽 (대칭). 사거리 안에서 땅·건물에 가리지 않은 가장 가까운 표적을 자동으로 쏜다.
// 내 기관총: 지프 → 적 탱크(자주포 포함) → 보급품 순서. 나무 상자는 쏘지 않는다. 적 기관총(탱크·지프): 내 탱크만.
// 전봇대는 무시 (총알이 뚫고 지나간다). 맞히는 데는 한 발에 바로 (탄도 없음)
const gunDark = lambert({ color: 0x2c2c28 }), gunBody = lambert({ color: 0x4e4e44 });
function buildGuns(turret, n) {
  const out = [];
  for (const x of [-0.45, 0.45].slice(0, n)) {   // +x가 왼쪽
    const group = new THREE.Group(), pitch = new THREE.Group(), tip = new THREE.Object3D();
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.36, 6).translate(0, 0.18, 0), gunDark));   // 받침 기둥
    pitch.position.y = 0.42; group.add(pitch);
    pitch.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.6), gunBody));
    pitch.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 6).rotateX(Math.PI / 2).translate(0, 0.02, 0.7), gunDark));   // 총열
    tip.position.set(0, 0.02, 1.15); pitch.add(tip);
    group.position.set(x, DECK_TOP + 0.7 + 0.82, 0.3);   // 지붕 위, 해치보다 조금 앞
    turret.add(markOutline(group));
    out.push({ group, pitch, tip, t: rand(), scan: 0, tgt: null });
  }
  return out;
}
const MG_GUNS = buildGuns(parts.turret, 2);
const showGuns = (n) => MG_GUNS.forEach((g, i) => { g.group.visible = i < n; });
const _mgW = new THREE.Vector3(), _mgL = new THREE.Vector3(), _mgT = new THREE.Vector3(), _mgN = new THREE.Vector3(), _mgP = new THREE.Vector3();
const mgTargetPos = (g, out) => g.E ? out.set(g.E.pos.x, g.E.pos.y + 0.9, g.E.pos.z) : out.copy(g.t.mesh.position);
const mgAlive = (g) => g && (g.E ? g.E.solid : g.t.alive && !g.t.falling);
// 총구에서 표적까지 0.6m 간격으로 짚어 가며 땅·건물(충돌 상자)에 막히는지. skip = 표적 자신의 충돌 상자
function mgClear(a, b, skip) {
  const n = Math.ceil(a.distanceTo(b) / 0.6);
  for (let i = 1; i < n; i++) {
    const f = i / n, x = lerp(a.x, b.x, f), y = lerp(a.y, b.y, f), z = lerp(a.z, b.z, f);
    if (y < groundAt(x, z)) return false;
    for (const fp of footprints) {
      if (fp === skip || y < fp.y0 || y > fp.top) continue;
      fpLocal(fp, x, z, _fl);
      if (Math.abs(_fl.x) < fp.hx && Math.abs(_fl.z) < fp.hz) return false;
    }
  }
  return true;
}
// 내 기관총의 표적: 가까운 순으로 보며 처음으로 가리지 않은 것. avoid = 다른 총의 표적 (다른 게 있으면 피한다)
function mgPick(from, range, avoid) {
  const list = [];   // pr: 먼저 쏠 순서 (0 지프, 1 적 탱크·자주포, 2 보급품). 같은 순서끼리는 가까운 것부터, 가려진 것은 건너뛴다
  for (const E of ENEMIES) if (E.solid) { const d = E.pos.distanceTo(from); if (d < range) list.push({ E, d, pr: E.jeep ? 0 : 1 }); }
  for (const t of targets) if (t.alive && !t.falling) { const d = t.mesh.position.distanceTo(from); if (d < range) list.push({ t, d, pr: 2 }); }
  list.sort((a, b) => a.pr - b.pr || a.d - b.d);
  let first = null;
  for (const g of list) {
    if (!mgClear(from, mgTargetPos(g, _mgP), g.t ? g.t.fp : null)) continue;
    if (!avoid || (g.E || g.t) !== (avoid.E || avoid.t)) return g;
    first = first || g;
  }
  return first;
}
// 적 기관총의 표적: 사거리 안에 가리지 않은 내 탱크
const enemyMgPick = (from, range) => tank.solid && tank.pos.distanceTo(from) < range && mgClear(from, mgTargetPos({ E: tank }, _mgP), null) ? { E: tank } : null;
// 예광탄: 총구에서 표적으로 빠르게 날아가는 짧고 밝은 선 (점보다 잘 보이게)
const TRACER_T = 0.12, TRACER_LEN = 0.22, mgTracers = [];
const tracerLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 6), 3).setUsage(THREE.DynamicDrawUsage)),
  new THREE.LineBasicMaterial({ color: 0xffe48a, fog: false }));
tracerLines.frustumCulled = false; scene.add(tracerLines);
function updateTracers(dt) {
  const a = tracerLines.geometry.attributes.position;
  let n = 0;
  for (let i = mgTracers.length - 1; i >= 0; i--) if ((mgTracers[i].t += dt) > TRACER_T * (1 + TRACER_LEN)) mgTracers.splice(i, 1);
  for (const t of mgTracers) {
    if (n >= 48) break;
    const k = t.t / TRACER_T, f1 = Math.min(1, k), f0 = Math.max(0, Math.min(1, k - TRACER_LEN));   // 머리는 표적까지, 꼬리는 거리의 22% 뒤에서 따라간다
    _tmp.lerpVectors(t.a, t.b, f0); a.setXYZ(n * 2, _tmp.x, _tmp.y, _tmp.z);
    _tmp.lerpVectors(t.a, t.b, f1); a.setXYZ(n * 2 + 1, _tmp.x, _tmp.y, _tmp.z);
    n++;
  }
  tracerLines.geometry.setDrawRange(0, n * 2);
  a.needsUpdate = true;
}
// 한 탱크의 기관총들: 표적 고르기(pick) → 총 돌리기 → 쏘기. st = { rate, damage, range }
function runGuns(T, guns, count, st, pick, dt) {
  T.P.turret.updateWorldMatrix(true, false);
  for (let gi = 0; gi < count; gi++) {
    const G = guns[gi];
    G.pitch.getWorldPosition(_mgW);
    if ((G.scan -= dt) <= 0 || !mgAlive(G.tgt)) {   // 0.25초마다 표적을 다시 고른다 (지금 표적이 가려졌는지도)
      G.scan = 0.25;
      G.tgt = pick(_mgW, st.range, gi ? guns[0].tgt : null);
    }
    // 총을 표적 쪽으로 돌린다 (포탑 좌표에서). 표적이 없으면 앞으로
    let wy = 0, wp = 0;
    if (G.tgt) {
      mgTargetPos(G.tgt, _mgT);
      _mgL.copy(_mgT); T.P.turret.worldToLocal(_mgL); _mgL.sub(G.group.position); _mgL.y -= G.pitch.position.y;
      wy = Math.atan2(_mgL.x, _mgL.z); wp = -Math.atan2(_mgL.y, Math.hypot(_mgL.x, _mgL.z));
    }
    let d = wy - G.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    G.group.rotation.y += Math.max(-7 * dt, Math.min(7 * dt, d));
    G.pitch.rotation.x += Math.max(-4 * dt, Math.min(4 * dt, wp - G.pitch.rotation.x));
    G.t -= dt;
    if (!G.tgt || G.t > 0 || Math.abs(d) > 0.12) continue;
    G.t = 1 / st.rate;
    G.tip.getWorldPosition(_mgW);
    // 예광탄 선 + 맞은 자리 불똥 + 총구 섬광
    mgTracers.push({ a: _mgW.clone(), b: _mgT.clone(), t: 0 });
    sparks(_mgT, _mgN.copy(_mgW).sub(_mgT).normalize());   // 맞은 자리: 쇠끼리 부딪힐 때와 같은 불똥·소리
    flashes.push({ p: _mgW.clone(), t: 0, dur: 0.07, I: 90, range: 10, color: 0xffd08a });   // 총구 섬광 (광원)
    glowP.spawn(_mgW.x, _mgW.y, _mgW.z, 0, 0, 0, 0.05, [1, 0.95, 0.7, 1], [1, 0.6, 0.2, 0], 0.5, 0.2, 0, 0);
    sfx.mg(_mgW);
    // 맞은 소리: 대미지가 들어가면 쇳소리, 장갑에 막혀 0이면 튕기는 도탄음
    let hurt;
    if (G.tgt.E) hurt = damageTank(G.tgt.E, st.damage, faceAt(G.tgt.E, _mgW), T, 'mg') > 0;
    else { hurt = boxDmg(st.damage) > 0; damageTarget(G.tgt.t, st.damage, 'mg'); }
    if (hurt) sfx.mgHit(_mgT); else sfx.mgPing(_mgT);
  }
}
function updateMG(dt) {
  updateTracers(dt);
  if (tank.mg && tank.solid) runGuns(tank, MG_GUNS, tank.mg.count, tank.mg, mgPick, dt);
  if (!aiFrozen) for (const E of ENEMIES) if (E.solid && E.guns.length) runGuns(E, E.guns, E.guns.length, E.mgSt || EC.mg, enemyMgPick, dt);
}

// ---------------------------------------------------------------- 충돌 박스 표시 (HUD 토글): 녹색 선
const colMat = new THREE.LineBasicMaterial({ color: 0x30ff50, fog: false });
const colTank = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(HULL_HX * 2, 2.8, HULL_HZ * 2).translate(0, 1.4, 0)), colMat);
colTank.visible = false; tankGroup.add(colTank);
let colLines = null, colDirty = false;
function buildCollisionLines() {
  const p = [], seg = (a, b) => p.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  // 회전된 사각기둥: 바닥/윗면 사각형 + 세로 모서리
  const prism = (x, z, hx, hz, c, s, y0, y1) => {
    const cs = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
      seg([ax, y0, az], [bx, y0, bz]); seg([ax, y1, az], [bx, y1, bz]); seg([ax, y0, az], [ax, y1, az]);
    }
  };
  for (const f of footprints) prism(f.x, f.z, f.hx, f.hz, f.c, f.s, f.y0, f.top);
  for (const q of allPoles) prism(q.x, q.z, 0.15, 0.15, 1, 0, q.y, q.y + 9.2);
  for (const c of crates) if (c.alive) prism(c.x, c.z, c.s / 2, c.s / 2, Math.cos(c.rot), Math.sin(c.rot), c.y - c.s / 2, c.y + c.s / 2);
  // 보드 경계의 투명한 벽
  for (let y = 0; y <= 40; y += 10) prism(0, 0, WALL, WALL, 1, 0, y, y);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) seg([x * WALL, BOTTOM, z * WALL], [x * WALL, 40, z * WALL]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  if (colLines) { colLines.geometry.dispose(); colLines.geometry = g; }
  else { colLines = new THREE.LineSegments(g, colMat); colLines.frustumCulled = false; scene.add(colLines); }
}
function toggleCollisionView() {
  colTank.visible = !colTank.visible;
  if (colTank.visible) buildCollisionLines();
  colLines.visible = colTank.visible;
}
function updateCollisionView() {
  if (colTank.visible && colDirty) buildCollisionLines();
  colDirty = false;
}

