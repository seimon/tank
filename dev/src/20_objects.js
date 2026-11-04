// ---------------------------------------------------------------- 탱크 모델 (SD: 큰 포탑, 큰 구경)
const TC = { hull: 0x6f7c3c, low: 0x66683a, turret: 0x84924c, wheel: 0x3c3c36, barrel: 0x66723a, plate: 0x5e6a32, top: 0x93a25a, muzzle: 0x55602e };
const treadTex = canvasTex(8, 8, (g) => {
  g.fillStyle = '#24221e'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#5e5a50'; g.fillRect(0, 0, 4, 3); g.fillRect(7, 3, 1, 2); g.fillRect(0, 3, 3, 2); g.fillRect(0, 5, 4, 3);   // 궤도판: 가운데가 한 칸 들어간 {
  g.fillStyle = '#3c3a34'; g.fillRect(4, 0, 1, 3); g.fillRect(3, 3, 1, 2); g.fillRect(4, 5, 1, 3);
}, true);
// 철판 (1.2m 반복): 흘러내린 녹물, 벗겨진 칠, 먼지 얼룩. 리벳은 셰이더가 면 모서리 근처에만 찍는다
const plateTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#ebebe6'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 600; i++) { const v = 180 + Math.floor(rand() * 60); g.fillStyle = `rgba(${v},${v},${v - 8},.35)`; g.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 64), 1 + Math.floor(rand() * 3), 1); }
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(${70 + Math.floor(rand() * 40)},${58 + Math.floor(rand() * 25)},36,${0.07 + rand() * 0.08})`;
    g.beginPath(); g.arc(rand() * 64, rand() * 64, 4 + rand() * 10, 0, 7); g.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * 64), y0 = Math.floor(rand() * 30), len = 6 + rand() * 24;
    for (let y = 0; y < len; y++) { g.fillStyle = `rgba(105,58,24,${0.35 * (1 - y / len)})`; g.fillRect(x, y0 + y, 1, 1); }
  }
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(240,235,220,${0.35 + rand() * 0.35})`; g.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 64), 1 + Math.floor(rand() * 2), 1); }
  for (let i = 0; i < 4; i++) { const x = rand() * 58, y = rand() * 58; g.fillStyle = 'rgba(40,35,28,.3)'; for (let t = 0; t < 6; t++) g.fillRect(Math.floor(x + t), Math.floor(y + t * 0.4), 1, 1); }
}, true);
plateTex.generateMipmaps = true; plateTex.minFilter = THREE.NearestMipmapNearestFilter;   // 멀리서 얼룩이 반짝이지 않게
// 리벳: 정점마다 (면 안의 위치 m, 면 크기 m)를 받아, 네 변을 따라 가장자리에서 0.1m 안쪽에 약 0.5m 간격으로 (네 모서리 포함).
// 작고(반지름 약 5cm) 진한 점: 가운데만 살짝 밝게
function rivetMat(o) {
  return ps1(new THREE.MeshLambertMaterial(o), (sh) => {
    sh.vertexShader = 'attribute vec4 aRiv; varying vec4 vRiv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiv = aRiv;');
    sh.fragmentShader = 'varying vec4 vRiv;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vRiv.z > 0.0) {
        vec2 p = vRiv.xy, s = vRiv.zw, q = min(p, s - p);
        const float IN = 0.1;   // 가장자리에서 안쪽
        vec2 len = max(s - 2.0 * IN, vec2(0.001)), n = max(floor(len / 0.5 + 0.49), vec2(1.0)), sp = len / n;   // 변마다 간격 (반올림 경계를 0.5에서 살짝 비킨다: 길이가 딱 x.5칸이면 보간 오차로 픽셀마다 개수가 바뀌어 리벳이 흩어졌다)
        vec2 k = clamp(floor((p - IN) / sp + 0.5), vec2(0.0), n), at = IN + k * sp;   // 가장 가까운 리벳 자리
        float r = min(length(vec2(p.x - at.x, q.y - IN)), length(vec2(q.x - IN, p.y - at.y)));
        float px = max(length(fwidth(p)), 1e-4);   // 화면 한 픽셀이 면 위에서 몇 m인가
        // 픽셀이 리벳에 덮인 만큼만 어둡게 (가장자리 1픽셀을 부드럽게): 1~2픽셀짜리 작은 점이 움직일 때 생겼다 사라졌다 깜빡이지 않게.
        // 픽셀보다 작으면 그만큼 옅게, 가운데 밝은 점은 2픽셀 넘게 클 때만
        float cov = clamp((0.053 - r) / px + 0.5, 0.0, 1.0) * min(1.0, 0.053 / px);
        float core = clamp((0.022 - r) / px + 0.5, 0.0, 1.0) * clamp(0.022 / px - 1.0, 0.0, 1.0);
        diffuseColor.rgb *= mix(mix(1.0, 0.4, cov), 0.62, core);
      }`);
  }, 'rivet');
}
// 리벳 속성: 상자 면마다 uv(0~1) × 면 크기. 너무 좁은 면에는 찍지 않는다
function setRivets(g, dims) {
  const uv = g.attributes.uv, a = new Float32Array(uv.count * 4);
  for (let i = 0; i < uv.count; i++) {
    const [w, h] = dims[Math.floor(i / 4)], ok = Math.min(w, h) > 0.3;
    a.set(ok ? [uv.getX(i) * w, uv.getY(i) * h, w, h] : [0, 0, 0, 0], i * 4);
  }
  g.setAttribute('aRiv', new THREE.BufferAttribute(a, 4));
}
// 포탑 뒷면에 가로로 묶은 삽 한 자루 (사각형 한 장)
const shovelTex = canvasTex(32, 8, (g) => {
  g.fillStyle = '#7a5530'; g.fillRect(4, 3, 18, 2);
  g.fillStyle = '#5a3c20'; g.fillRect(4, 4, 18, 1);
  g.fillStyle = '#4a3420'; g.fillRect(0, 2, 2, 4); g.fillRect(2, 2, 2, 1); g.fillRect(2, 5, 2, 1);
  g.fillStyle = '#6e6e66'; g.fillRect(22, 1, 8, 6); g.fillStyle = '#8e8e84'; g.fillRect(22, 1, 8, 1);
  g.fillStyle = '#4a4a44'; g.fillRect(30, 2, 2, 4); g.fillRect(22, 6, 8, 1);
});
const TREAD = 0.3;   // 궤도판 간격 (m)
// 궤도 벨트: 바닥 직선 → 앞 반원 → 윗 직선 → 뒤 반원. u = 둘레 길이 / 궤도판 간격
function beltGeo(len, r, width) {
  const half = len / 2 - r, pts = [[0, -half, -1, 0], [0, half, -1, 0]];
  for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 + Math.PI * i / 8; pts.push([r + Math.sin(a) * r, half + Math.cos(a) * r, Math.sin(a), Math.cos(a)]); }
  pts.push([2 * r, half, 1, 0], [2 * r, -half, 1, 0]);
  for (let i = 1; i < 8; i++) { const a = Math.PI / 2 + Math.PI * i / 8; pts.push([r + Math.sin(a) * r, -half + Math.cos(a) * r, Math.sin(a), Math.cos(a)]); }
  pts.push([0, -half, -1, 0]);
  const pos = [], nor = [], uv = [], idx = [];
  let s = 0;
  pts.forEach(([y, z, ny, nz], i) => {
    if (i) s += Math.hypot(y - pts[i - 1][0], z - pts[i - 1][1]);
    for (const x of [-width / 2, width / 2]) { pos.push(x, y, z); nor.push(0, ny, nz); uv.push(s / TREAD, x > 0 ? 1 : 0); }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const TRACK_X = 1.08;
// 철판 상자: 얼룩 무늬가 면 크기에 맞춰 1.2m마다 반복되도록 UV를 맞추고, 면마다 리벳 속성
function plateBox(w, h, d, mat, topX = 1) {
  const g = new THREE.BoxGeometry(w, h, d), dims = [[d, h], [d, h], [w * topX, d], [w, d], [w, h], [w, h]];
  setRivets(g, dims);
  if (topX !== 1) {   // 윗면만 좁혀 옆면이 기운다
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * topX);
    g.computeVertexNormals();
  }
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const ou = rand(), ov = rand();
    for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 1.2 + ou, uv.getY(i) * dims[f][1] / 1.2 + ov); }
  }
  return new THREE.Mesh(g, mat);
}
// 차체 상판 옆모습 /‾\ : 뒤 경사가 앞 경사보다 2배 길고 경사는 10도. 포탑은 가운데 평평한 곳 위
const DECK_T = Math.tan(10 * Math.PI / 180), DECK_Z0 = -0.642, DECK_Z1 = 1.308, DECK_TOP = 1.38, TURRET_Z = 0.333;
const deckY = (z) => z < DECK_Z0 ? DECK_TOP - (DECK_Z0 - z) * DECK_T : z > DECK_Z1 ? DECK_TOP - (z - DECK_Z1) * DECK_T : DECK_TOP;
function deckGeo(hx) {
  const prof = [[-1.975, 1.0], [1.975, 1.0], [1.975, deckY(1.975)], [DECK_Z1, DECK_TOP], [DECK_Z0, DECK_TOP], [-1.975, deckY(-1.975)]];
  const pos = [], nor = [], uv = [], riv = [], n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (a, b, c, ua, ub, uc, ra, rb, rc) => {
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2).normalize();
    // 바깥을 보도록 감기 방향을 맞춘다
    if (n.dot(e1.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(new THREE.Vector3(0, 1.19, 0))) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [rb, rc] = [rc, rb]; n.negate(); }
    for (const [p, u, r] of [[a, ua, ra], [b, ub, rb], [c, uc, rc]]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(...u); riv.push(...r); }
  };
  const P = (x, [z, y]) => new THREE.Vector3(x, y, z);
  for (let i = 0; i < prof.length; i++) {
    const A = prof[i], B = prof[(i + 1) % prof.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]), ok = len > 0.3 ? 1 : 0;
    const v = [P(-hx, A), P(hx, A), P(hx, B), P(-hx, B)];
    const u = [[0, 0], [2 * hx / 1.2, 0], [2 * hx / 1.2, len / 1.2], [0, len / 1.2]];
    const r = [[0, 0], [2 * hx, 0], [2 * hx, len], [0, len]].map(([a, b]) => ok ? [a, b, 2 * hx, len] : [0, 0, 0, 0]);
    tri(v[0], v[1], v[2], u[0], u[1], u[2], r[0], r[1], r[2]); tri(v[0], v[2], v[3], u[0], u[2], u[3], r[0], r[2], r[3]);
  }
  const zs = [...new Set([...Array.from({ length: 17 }, (_, k) => -1.975 + 3.95 * k / 16), DECK_Z0, DECK_Z1])].sort((a, b) => a - b);
  const sideV = (x, z, y) => [P(x, [z, y]), [z / 1.2, y / 1.2], [z + 1.975, y - 1.0, 3.95, 0.2]];   // 높이를 0.2로 쳐서 리벳이 아래에서 0.1m 한 줄만
  for (const x of [-hx, hx]) for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1], c = [sideV(x, z0, 1.0), sideV(x, z1, 1.0), sideV(x, z1, deckY(z1)), sideV(x, z0, deckY(z0))];
    for (const [a, b, d] of [[0, 1, 2], [0, 2, 3]]) tri(c[a][0], c[b][0], c[d][0], c[a][1], c[b][1], c[d][1], c[a][2], c[b][2], c[d][2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aRiv', new THREE.Float32BufferAttribute(riv, 4));
  g.userData.aoSolid = true;   // 상판은 거의 상자 모양이라 AO 가리개로 써도 된다
  return g;
}
// 내 탱크와 부서진 탱크가 같은 모델을 쓴다. wreck이면 새카맣게 그을린 색
const _wc = new THREE.Color(0x4a4440);   // 그을린 잿빛: 원래 색을 어둡게 한 뒤 이쪽으로 섞는다 (너무 새카매서 안 보이지 않을 만큼)
const BRAKE_OFF = 0x3a1210, BRAKE_STOP = 0xff2a1c, BRAKE_REV = 0xfff2dc;
// 등 색 + 후광 + 바닥 빛 (U.uLamp 슬롯: 내 탱크 0, 적 1). 꺼졌거나 탱크가 없으면 바닥 빛도 끈다
const LAMP_STOP = [0.55, 0.06, 0.04, 3.6], LAMP_REV = [0.85, 0.8, 0.7, 6.5], LAMP_HEAD = [0.9, 0.82, 0.62, 6.5], LAMP_N = 12;   // LAMP_HEAD: 지프 전조등 (후진등만큼)
const _lf = new THREE.Vector3();
// 등 색·후광. 켜졌으면 바닥 빛 색을 돌려준다 (꺼졌으면 null)
function setBrake(T, thr, on) {
  T.P.brake.color.setHex(!on || thr > 0 ? BRAKE_OFF : thr < 0 ? BRAKE_REV : BRAKE_STOP);
  const lit = on && thr <= 0;
  if (T.P.halo) { T.P.halo.color.setHex(thr < 0 ? BRAKE_REV : BRAKE_STOP); T.P.halo.opacity = lit ? (thr < 0 ? 0.9 : 0.7) : 0; }
  return lit ? (thr < 0 ? LAMP_REV : LAMP_STOP) : null;
}
// 바닥 빛 슬롯은 12개. 화면(카메라 시야) 밖의 빛은 빼고, 켜진 빛을 모아 순서대로 채운다:
// 내 탱크 → 지프 전조등(늘 켜져 있어 빠졌다 들어왔다 하면 깜빡여 보인다) → 적 브레이크등 (카메라에 가까운 것부터)
const _lamps = [], _lFr = new THREE.Frustum(), _lFm = new THREE.Matrix4(), _lFs = new THREE.Sphere();
function updateTankLamps(thr) {
  _lamps.length = 0;
  _lFr.setFromProjectionMatrix(_lFm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const put = (T, col, pr, back = 0) => {
    if (!col) return;
    _lFs.center.copy(T.pos); _lFs.radius = 9;   // 빛이 뻗는 6.5m + 차체
    if (!_lFr.intersectsSphere(_lFs)) return;
    _lamps.push({ T, col, pr, back, d: T.pos.distanceToSquared(camera.position) });
  };
  put(tank, setBrake(tank, thr, tank.solid), 0);
  for (const E of ENEMIES) {
    put(E, setBrake(E, E.thr, E.solid), 2);
    if (E.jeep && E.solid) put(E, LAMP_HEAD, 1, Math.PI);   // 지프 전조등: 뒷등 빛을 앞쪽으로 돌려 쓴다
  }
  _lamps.sort((a, b) => a.pr - b.pr || a.d - b.d);
  for (let i = 0; i < LAMP_N; i++) {
    const L = _lamps[i];
    if (!L) { U.uLamp1.value[i].w = 0; continue; }
    _lf.set(0, 0, 1).applyQuaternion(L.T.q);
    const yaw = Math.atan2(_lf.x, _lf.z) + L.back;
    U.uLamp0.value[i].set(L.T.pos.x, L.T.pos.z, Math.cos(yaw), Math.sin(yaw));
    U.uLamp1.value[i].fromArray(L.col);
  }
}
const STACK_DIR = new THREE.Vector3(0, Math.cos(Math.PI / 3), -Math.sin(Math.PI / 3));   // 굴뚝 끝은 뒤로 60도 꺾였다
// spg = 자주포: 포탑이 차체 뒤쪽, 포신이 3배 길다 (굴뚝은 포탑에 가리지 않게 앞쪽 옆으로)
function buildTank(wreck, tc = TC, spg = false) {
  PS1_NOSNAP = true;   // 탱크 재질은 스내핑 없이 (아래 return 앞에서 되돌린다)
  const root = new THREE.Group(), P = { belts: [] }, cache = new Map();
  const M = (c, map = plateTex, side = THREE.FrontSide) => {
    const k = `${c}|${map && map.uuid}|${side}`;
    const o = { color: wreck ? new THREE.Color(c).multiplyScalar(0.6).lerp(_wc, 0.4) : c, map, side, vertexColors: true };
    if (!cache.has(k)) cache.set(k, map === plateTex ? rivetMat(o) : lambert(o));
    return cache.get(k);
  };
  const add = (m, x, y, z, par = root) => { m.position.set(x, y, z); par.add(m); return m; };
  const cyl = (r0, r1, h, seg, mat, open = false) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), mat);
  [1, -1].forEach((side) => {   // +x = 왼쪽
    let bm;
    if (wreck) bm = M(0x777777, treadTex, THREE.DoubleSide);
    else { const tex = treadTex.clone(); tex.needsUpdate = true; P.belts.push(tex); bm = lambert({ map: tex, side: THREE.DoubleSide, vertexColors: true }); }
    add(new THREE.Mesh(beltGeo(3.8, 0.5, 0.72), bm), side * TRACK_X, 0, 0).name = 'belt';
    for (const [z, y, r] of [[-1.4, 0.5, 0.43], [-0.72, 0.36, 0.34], [0, 0.36, 0.34], [0.72, 0.36, 0.34], [1.4, 0.5, 0.43]]) {
      add(cyl(r, r, 0.6, 8, M(tc.wheel, null)), side * TRACK_X, y, z).rotation.z = Math.PI / 2;
      add(cyl(r * 0.42, r * 0.42, 0.64, 6, M(0x2a2a26, null)), side * TRACK_X, y, z).rotation.z = Math.PI / 2;   // 바퀴 허브
    }
  });
  add(plateBox(1.5, 0.7, 3.4, M(tc.low)), 0, 0.7, 0);
  add(new THREE.Mesh(deckGeo(1.45), M(tc.hull)), 0, 0, 0);
  add(plateBox(2.6, 0.28, 0.55, M(tc.plate)), 0, 1.12, 2.0).rotation.x = 0.5;
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.26), M(0x2e2e2a, null)), s * 0.6, 0.78, 1.82);   // 견인 고리
  // 포탑: 큼직한 상자, 상판 평평한 곳 위
  // 포탑은 따로 묶어 세로축으로 돈다 (QE). 포탑 위·뒤에 붙은 것과 포는 모두 이 안에
  const TZ = spg ? TURRET_Z - 0.95 : TURRET_Z, TY = DECK_TOP + 0.7, PT = P.turret = add(new THREE.Group(), 0, 0, TZ);
  const BL = spg ? 2 : 0;   // 늘어난 포신 길이 (1m → 3m)
  add(plateBox(2.3, 1.4, 1.8, M(tc.turret), 0.75), 0, TY, 0, PT);   // 윗면 폭 75%: 앞에서 보면 사다리꼴
  add(plateBox(1.55, 0.12, 1.55, M(tc.top), 0.92), 0, TY + 0.76, 0, PT);
  add(cyl(0.34, 0.38, 0.22, 8, M(tc.hull, null)), 0, TY + 0.9, -0.3, PT);   // 해치 (가로 가운데)
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.08), wreck ? M(0x333333, null) : new THREE.MeshBasicMaterial({ color: 0xffe6a8 })), s * 0.85, 1.14, 1.98);
  // 뒷면 브레이크등: 좌우 궤도 바로 위. 멈춤 = 빨강, 후진 = 흰색, 전진 = 꺼짐 (조작 기준, setBrake)
  P.brake = wreck ? M(0x2a1c18, null) : new THREE.MeshBasicMaterial({ color: BRAKE_OFF });
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), P.brake), s * TRACK_X, 1.08, -2.0).name = 'brake';
  if (!wreck) {   // 켜진 등 둘레의 작은 후광
    P.halo = new THREE.SpriteMaterial({ map: glowTex, color: BRAKE_STOP, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (const s of [-1, 1]) { const sp = add(new THREE.Sprite(P.halo), s * TRACK_X, 1.08, -2.08); sp.scale.setScalar(0.9); sp.name = 'halo'; }
  }
  // 여분 바퀴 두 개: 포탑 뒷벽에 기대 세워 둠 (포탑과 함께 돈다)
  const wz = TZ - 1.03;
  for (const s of [-1, 1]) {
    add(cyl(0.34, 0.34, 0.22, 8, M(tc.wheel, null)), s * 0.48, deckY(wz) + 0.34, -1.03, PT).rotation.x = Math.PI / 2;
    add(cyl(0.15, 0.15, 0.26, 6, M(0x2a2a26, null)), s * 0.48, deckY(wz) + 0.34, -1.03, PT).rotation.x = Math.PI / 2;
  }
  // 포탑 뒷면의 삽 + 고정쇠
  const sh = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), lambert({ map: shovelTex, alphaTest: 0.5, side: THREE.DoubleSide, color: wreck ? 0x6a6058 : 0xffffff, vertexColors: true })), 0.05, TY + 0.38, -0.915, PT);
  sh.rotation.y = Math.PI; P.shovel = sh;
  for (const x of [-0.35, 0.4]) add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.05), M(0x2e2e2a, null)), x, TY + 0.38, -0.92, PT);
  // 포: 피벗은 포탑 앞면. 구경 1.08m, 포신은 짧고 뭉툭하게
  P.pivot = add(new THREE.Group(), 0, TY, 0.9, PT);
  P.barrel = add(new THREE.Group(), 0, 0, 0, P.pivot);
  // 포신 뿌리: 가로로 누운 원기둥. 위아래로 도는 축이 원기둥 중심
  const mant = new THREE.CylinderGeometry(0.62, 0.62, 1.3, 12); mant.rotateZ(Math.PI / 2);
  add(new THREE.Mesh(mant, M(tc.barrel)), 0, 0, 0, P.barrel);
  const tube = new THREE.CylinderGeometry(0.44, 0.47, 1.0 + BL, 12, 1, true); tube.rotateX(Math.PI / 2);
  add(new THREE.Mesh(tube, M(tc.barrel, null, THREE.DoubleSide)), 0, 0, 0.85 + BL / 2, P.barrel);
  const ring = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 12, 1, true); ring.rotateX(Math.PI / 2);
  add(new THREE.Mesh(ring, M(tc.muzzle, null, THREE.DoubleSide)), 0, 0, 1.2 + BL, P.barrel);
  add(new THREE.Mesh(new THREE.RingGeometry(0.36, 0.52, 12), M(tc.muzzle, null)), 0, 0, 1.36 + BL, P.barrel);
  add(new THREE.Mesh(new THREE.RingGeometry(0.44, 0.52, 12), M(tc.muzzle, null)), 0, 0, 1.04 + BL, P.barrel).rotation.y = Math.PI;   // 고리 뒷면 (포신과의 틈을 막는다)
  // 포구 안쪽은 새카맣게: 안벽 + 막힌 바닥
  const bore = new THREE.CylinderGeometry(0.36, 0.36, 0.5, 12, 1, true); bore.rotateX(Math.PI / 2);
  const boreMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide });
  add(new THREE.Mesh(bore, boreMat), 0, 0, 1.105 + BL, P.barrel);
  add(new THREE.Mesh(new THREE.CircleGeometry(0.37, 12), new THREE.MeshBasicMaterial({ color: 0x050505 })), 0, 0, 0.9 + BL, P.barrel);
  P.tip = add(new THREE.Object3D(), 0, 0, 2.0 + BL, P.barrel);
  // 뒤 경사면 양쪽의 열 배출구: 차체 가로 방향으로 길쭉한 검은 홈 4줄 (자주포는 굴뚝 자리가 달라 넣지 않는다)
  if (!spg) {
    const tilt = -Math.atan(DECK_T), vents = [];
    for (const vx of [0.66, -0.66]) for (let i = 0; i < 4; i++) {
      const vz = -1.72 + i * 0.2;
      vents.push(new THREE.BoxGeometry(0.62, 0.02, 0.06).rotateX(tilt).translate(vx, deckY(vz) + 0.01, vz));
    }
    add(new THREE.Mesh(mergeGeometries(vents), lambert({ color: M(0x23221d, null).color.clone(), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })), 0, 0, 0);
  }
  // 뒤 경사 가운데의 짧은 굴뚝: 위에서 뒤로 60도 꺾인다
  const sz = spg ? 1.0 : -1.65, sx = spg ? 0.75 : 0, sy = deckY(sz), H = 0.45, top = new THREE.Vector3(sx, sy + H, sz);
  add(cyl(0.17, 0.2, H, 8, M(0x34322c, null)), sx, sy + H / 2, sz);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), M(0x34322c, null)), top.x, top.y, top.z);
  const elbow = add(cyl(0.17, 0.17, 0.4, 8, M(0x34322c, null)), sx, top.y + STACK_DIR.y * 0.2, top.z + STACK_DIR.z * 0.2);
  elbow.rotation.x = -Math.PI / 3;
  const end = top.clone().addScaledVector(STACK_DIR, 0.4);
  add(cyl(0.22, 0.19, 0.14, 8, M(0x26241f, null)), end.x, end.y, end.z).rotation.x = -Math.PI / 3;
  const hole = add(new THREE.Mesh(new THREE.CircleGeometry(0.15, 8), new THREE.MeshBasicMaterial({ color: 0x050505 })), end.x + STACK_DIR.x * 0.075, end.y + STACK_DIR.y * 0.075, end.z + STACK_DIR.z * 0.075);
  hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), STACK_DIR);   // 굴뚝 구멍 안쪽이 새카맣게
  P.stack = add(new THREE.Object3D(), end.x, end.y + STACK_DIR.y * 0.08, end.z + STACK_DIR.z * 0.08);
  // 합칠 때 속성이 같아야 하므로 리벳 속성이 없는 메시는 0으로 채운다
  root.traverse((o) => { if (o.isMesh && !o.geometry.attributes.aRiv) o.geometry.setAttribute('aRiv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 4), 4)); });
  bakeAO(root);
  root.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.material.defines = { AO_BAKED: '' }; });
  for (const k of ['pivot', 'barrel', 'turret', 'tip', 'stack', 'shovel']) P[k].name = k;   // 복제본에서 다시 찾을 수 있게
  PS1_NOSNAP = false;
  return { root, P };
}
const { root: tankGroup, P: parts } = buildTank(false);
scene.add(tankGroup);

await loadStep(0.74, 'PLACING SAFES...');
// ---------------------------------------------------------------- 공격 대상 (한 변 3m 빨간 금고)
const TARGET_S = 3;
// 빨간 철제 무법자 금고: 리벳 박힌 몸통, 앞문, 황동 다이얼과 손잡이 바퀴, 경첩, 해골 표시, 네 발. 한 번 합쳐 두고 복제해 쓴다
const skullTex = canvasTex(16, 16, (g) => {
  g.fillStyle = '#efe6cc';
  g.fillRect(4, 2, 8, 7); g.fillRect(3, 3, 10, 5); g.fillRect(5, 9, 6, 3);
  g.fillStyle = '#2a0c08'; g.fillRect(5, 5, 2, 2); g.fillRect(9, 5, 2, 2); g.fillRect(7, 8, 2, 1);
  g.fillRect(6, 11, 1, 1); g.fillRect(9, 11, 1, 1);
  g.fillStyle = '#efe6cc';   // 엇갈린 뼈
  for (let k = 0; k < 4; k++) { g.fillRect(2 + k * 3, 12 + (k % 2), 2, 1); g.fillRect(12 - k * 3, 12 + (k % 2), 2, 1); }
});
const safeModel = (() => {
  const g = new THREE.Group(), S = TARGET_S;
  const red = rivetMat({ color: 0xc02a1e, emissive: 0x3a0604, map: plateTex });
  const door = rivetMat({ color: 0x8e1a12, emissive: 0x240302, map: plateTex });
  const brass = lambert({ color: 0xd8a640, emissive: 0x2a1a04 }), iron = lambert({ color: 0x26221e }), gun = lambert({ color: 0x4a4744, emissive: 0x0a0908 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const cyl = (r, h, seg, mat) => { const c = new THREE.CylinderGeometry(r, r, h, seg); c.rotateX(Math.PI / 2); return new THREE.Mesh(c, mat); };
  add(plateBox(S, S - 0.25, S, red), 0, 0.125, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.25, 0.42), iron), sx * (S / 2 - 0.3), -S / 2 + 0.125, sz * (S / 2 - 0.3));   // 발
    add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), gun), sx * (S / 2 - 0.12), S / 2 - 0.05, sz * (S / 2 - 0.12));   // 모서리 덮개: 어두운 쇠
  }
  const fz = S / 2;
  add(plateBox(S - 0.6, S - 0.85, 0.14, door), 0.05, 0.15, fz + 0.07);
  add(cyl(0.46, 0.12, 16, brass), 0.55, 0.65, fz + 0.2);          // 다이얼
  add(cyl(0.3, 0.1, 12, iron), 0.55, 0.65, fz + 0.28);
  add(cyl(0.1, 0.12, 8, brass), 0.55, 0.65, fz + 0.36);
  for (let k = 0; k < 12; k++) {   // 다이얼 눈금
    const a = k / 12 * Math.PI * 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), iron), 0.55 + Math.cos(a) * 0.38, 0.65 + Math.sin(a) * 0.38, fz + 0.27).rotation.z = a + Math.PI / 2;
  }
  // 손잡이 바퀴: 테 + 살 세 개
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), brass); add(wheel, 0.55, -0.45, fz + 0.32);
  add(cyl(0.08, 0.3, 8, iron), 0.55, -0.45, fz + 0.22);
  for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.64, 0.05), brass), 0.55, -0.45, fz + 0.32).rotation.z = k * Math.PI / 3;
  // 경첩 + 해골 표시
  for (const y of [0.8, -0.5]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 8), iron); add(h, -1.2, y, fz + 0.12); }
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), lambert({ map: skullTex, transparent: true, alphaTest: 0.5, emissive: 0x332a1c, ...DECAL })), -0.45, 0.55, fz + 0.15);
  g.traverse((o) => { if (o.isMesh && !o.geometry.attributes.aRiv) o.geometry.setAttribute('aRiv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 4), 4)); });
  return bake(g, null, ['aRiv']);
})();
// 수리 금고: 밝은 회색 몸통에 초록 십자, 앞문 가운데 스패너 표시. 터지면 수리 도구 3개
const repairModel = (() => {
  const g = new THREE.Group(), S = TARGET_S;
  const body = rivetMat({ color: 0xc9ced2, emissive: 0x16181a, map: plateTex });
  const door = rivetMat({ color: 0xb2b8bc, emissive: 0x121416, map: plateTex });
  const green = lambert({ color: 0x3ccc5a, emissive: 0x0e5a1e }), white = lambert({ color: 0xf2f4f4, emissive: 0x2a2c2c }), iron = lambert({ color: 0x3a3c3e });
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  add(plateBox(S, S - 0.25, S, body), 0, 0.125, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(box(0.42, 0.25, 0.42, iron), sx * (S / 2 - 0.3), -S / 2 + 0.125, sz * (S / 2 - 0.3));   // 발
    add(box(0.34, 0.34, 0.34, white), sx * (S / 2 - 0.12), S / 2 - 0.05, sz * (S / 2 - 0.12));  // 모서리 덮개
  }
  const fz = S / 2;
  add(plateBox(S - 0.6, S - 0.85, 0.14, door), 0, 0.15, fz + 0.07);
  // 앞문: 흰 원판 위 초록 십자
  const disc = new THREE.CylinderGeometry(0.78, 0.78, 0.06, 20); disc.rotateX(Math.PI / 2);
  add(new THREE.Mesh(disc, white), 0, 0.2, fz + 0.17);
  add(box(1.0, 0.32, 0.08, green), 0, 0.2, fz + 0.22); add(box(0.32, 1.0, 0.08, green), 0, 0.2, fz + 0.22);
  // 윗면·옆면에도 초록 십자 (멀리서도 수리 금고로 보이게)
  add(box(1.3, 0.06, 0.4, green), 0, S / 2 + 0.03, 0); add(box(0.4, 0.06, 1.3, green), 0, S / 2 + 0.03, 0);
  for (const sx of [-1, 1]) { add(box(0.06, 0.32, 1.0, green), sx * (S / 2 + 0.03), 0.2, 0); add(box(0.06, 1.0, 0.32, green), sx * (S / 2 + 0.03), 0.2, 0); }
  // 경첩 + 손잡이
  for (const y of [0.8, -0.5]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 8), iron), -1.2, y, fz + 0.12);
  add(box(0.12, 0.6, 0.12, iron), 1.05, 0.2, fz + 0.22);
  g.traverse((o) => { if (o.isMesh && !o.geometry.attributes.aRiv) o.geometry.setAttribute('aRiv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 4), 4)); });
  return bake(g, null, ['aRiv']);
})();
const targets = [];
// 지형이 아닌 곳(지붕)에 놓인 금고는 반투명 그림자 판 한 장을 깐다
const blobShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, ...DECAL, polygonOffsetFactor: -3,
  map: canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 4, 16, 16, 16); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }) });
const blobShadowGeo = new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2);
const _sq = new THREE.Quaternion(), _sn = new THREE.Vector3(), _sup = new THREE.Vector3(0, 1, 0);
for (let tries = 0; targets.length < 10 && tries < 6000; tries++) {
  const x = rr(-HALF + 8, HALF - 8), z = rr(-HALF + 8, HALF - 8), gi = gridIndex(x, z);
  if (roadD[gi] < 6 || creekD[gi] < CREEK_HW + 5 || Math.hypot(x, z) < 34) continue;
  if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < 18 || targets.some(t => Math.hypot(t.x - x, t.z - z) < 20)) continue;
  const hs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].map(([a, b]) => heightAt(x + a, z + b));
  if (Math.max(...hs) - Math.min(...hs) > 1.3 || inFootprint(x, z, 3) || allPoles.some(p => Math.hypot(p.x - x, p.z - z) < 4)) continue;
  addTarget(x, z, Math.min(...hs) - 0.2, rand() * Math.PI / 2);
}
function addTarget(x, z, floor, rot, dropFrom = 0, kind = 'gold') {
  const y = floor + TARGET_S / 2 + dropFrom;
  const mesh = markOutline((kind === 'repair' ? repairModel : safeModel).clone());
  mesh.position.set(x, y, z); mesh.rotation.y = rot; scene.add(mesh);
  const fp = { x, z, hx: TARGET_S / 2, hz: TARGET_S / 2, c: Math.cos(rot), s: Math.sin(rot), y0: y - TARGET_S / 2, top: y + TARGET_S / 2, target: true };
  footprints.push(fp);
  const t = { x, y, z, fp, mesh, alive: true, floor, vy: 0, falling: dropFrom > 0, rot, kind };
  fp.tgt = t;
  targets.push(t);
  if (!t.falling) seatTarget(t);
  return t;
}
// 땅 위에 놓인 금고는 그 자리 경사에 맞춰 기울인다 (지붕·다른 금고 위는 수평). 놓일 때 한 번만 계산
// 그 자리 땅에서 가장 높은 곳 (네 귀퉁이와 가운데). 금고가 놓일 면이 이보다 높으면 지붕 위
function groundTop(x, z) { return Math.max(...[[0, 0], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map(([a, b]) => heightAt(x + a, z + b))); }
function seatTarget(t) {
  t.mesh.quaternion.setFromAxisAngle(_sup, t.rot);
  if (t.floor > groundTop(t.x, t.z) + 0.3) {
    t.y = t.floor + TARGET_S / 2; t.mesh.position.y = t.y; t.roof = true;
    t.shadow = new THREE.Mesh(blobShadowGeo, blobShadowMat); t.shadow.position.set(t.x, t.floor + 0.04, t.z); t.shadow.rotation.y = t.rot; scene.add(t.shadow);
    return;
  }
  const e = 1.5, hc = heightAt(t.x, t.z);
  _sn.set(heightAt(t.x - e, t.z) - heightAt(t.x + e, t.z), 2 * e, heightAt(t.x, t.z - e) - heightAt(t.x, t.z + e)).normalize();
  t.mesh.quaternion.premultiply(_sq.setFromUnitVectors(_sup, _sn));
  t.mesh.position.set(t.x, hc, t.z).addScaledVector(_sn, TARGET_S / 2 - 0.15);
  t.y = t.mesh.position.y;
  t.fp.y0 = t.y - TARGET_S / 2; t.fp.top = t.y + TARGET_S / 2;
  t.fp.x = t.mesh.position.x; t.fp.z = t.mesh.position.z;   // 기울며 옆으로 밀린 만큼 충돌 상자도 따라간다
  t.baseQ = t.mesh.quaternion.clone(); t.baseP = t.mesh.position.clone();
}
// 착지 반동: 한쪽 아래 모서리를 축으로 반대쪽이 살짝 들렸다가 내려앉는다 (한 번 크게, 한 번 작게)
const TIP_T = 0.5, _tipQ = new THREE.Quaternion(), _tipV = new THREE.Vector3(), _tipZ = new THREE.Vector3(0, 0, 1);
function updateTip(t, dt) {
  if (t.tipT === undefined || t.tipT >= TIP_T || !t.baseQ) return;
  t.tipT = Math.min(TIP_T, t.tipT + dt);
  const k = t.tipT / TIP_T, th = (k < 0.62 ? Math.sin(Math.PI * k / 0.62) : Math.sin(Math.PI * (k - 0.62) / 0.38) * 0.28) * t.tipA * t.tipS;
  _tipQ.setFromAxisAngle(_tipZ, th);
  const pv = _tipV.set(-t.tipS * TARGET_S / 2, -TARGET_S / 2, 0);   // 땅에 붙어 있는 모서리
  const off = pv.clone().sub(pv.applyQuaternion(_tipQ)).applyQuaternion(t.baseQ);
  t.mesh.quaternion.copy(t.baseQ).multiply(_tipQ);
  t.mesh.position.copy(t.baseP).add(off);
}
// 그 자리에서 가장 높은 면 (땅, 건물 지붕, 다른 공격 대상). 상자 네 귀퉁이와 가운데를 내려 쏴서 본다
const _rayDown = new THREE.Raycaster(), _rdo = new THREE.Vector3(), _rdd = new THREE.Vector3(0, -1, 0);
_rayDown.camera = camera;
function surfaceTop(x, z) {
  let y = -1e9;
  for (const [a, b] of [[0, 0], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const px = x + a, pz = z + b;
    y = Math.max(y, heightAt(px, pz));
    _rayDown.set(_rdo.set(px, 80, pz), _rdd); _rayDown.far = 120;
    for (const f of footprints) {
      if (f.target) { fpLocal(f, px, pz, _fl); if (Math.abs(_fl.x) < f.hx && Math.abs(_fl.z) < f.hz) y = Math.max(y, f.top); continue; }
      if (!f.group || px < f.box.min.x || px > f.box.max.x || pz < f.box.min.z || pz > f.box.max.z) continue;
      const h = _rayDown.intersectObject(f.ray || f.group, true).find(o => o.face);
      if (h) y = Math.max(y, h.point.y);
    }
  }
  return y;
}

// ---------------------------------------------------------------- 부서진 탱크 (내 탱크와 같은 모델, 새카맣게 그을림. 계속 연기를 피움)
const WRECKS = [];
const wreckModel = (() => { const { root, P } = buildTank(true); P.pivot.rotation.x = 0.16; P.turret.rotation.y = 0.45;   // 포신이 축 처지고 포탑이 비뚤게 돌아갔다
  return bake(root, null, ['aRiv', 'color']);
})();
function placeWreck(x, z, yaw) {
  const wg = markOutline(wreckModel.clone());
  // 앞이 땅에 처박혀 비스듬히 반쯤 묻혔다
  wg.rotation.order = 'YXZ';
  wg.position.set(x, heightAt(x, z) - 0.75, z); wg.rotation.set(rr(0.2, 0.28), yaw, rr(0.1, 0.16) * (rand() < 0.5 ? -1 : 1)); scene.add(wg);
  wg.updateMatrixWorld(true);
  const fp = { x, z, hx: 1.6, hz: 2.1, c: Math.cos(yaw), s: Math.sin(yaw), y0: wg.position.y, top: wg.position.y + 3, box: new THREE.Box3().setFromObject(wg), group: wg, noCrates: true, metal: true };
  const w = { x, z, y: wg.position.y + 2.4, group: wg, fp, decals: [] };
  fp.wreck = w; wg.userData.wreck = w;
  footprints.push(fp);
  WRECKS.push(w);
}
// 잔해 없애기. 'explode' = 포탄에 맞아 터짐 (맨땅 폭발 + 쇳조각 많이), 'break' = 탱크가 들이받아 부서짐 (파편만)
function removeWreck(w, mode) {
  if (!WRECKS.includes(w)) return;
  scene.remove(w.group);
  for (const d of w.decals) scene.remove(d);
  footprints.splice(footprints.indexOf(w.fp), 1);
  WRECKS.splice(WRECKS.indexOf(w), 1);
  for (let i = smokers.length - 1; i >= 0; i--) if (smokers[i].x === w.x && smokers[i].z === w.z) smokers.splice(i, 1);
  colDirty = true;
  const c = new THREE.Vector3(w.x, w.y - 1, w.z);
  if (mode === 'explode') { explode(c, UP, false, 1); spawnShards(c, 48, METAL_COLS, 5, 17, null, 0.2, 0.6, 1.4); }
  else {
    sfx.crack(c); sfx.clang(c, 0.6);
    spawnShards(c, 40, METAL_COLS, 2, 8, null, 0.2, 0.6, 1.6);
    for (let k = 0; k < 16; k++) smokeP.spawn(c.x + rr(-1.6, 1.6), c.y + rr(-0.5, 1), c.z + rr(-1.6, 1.6), rr(-2, 2), rr(0, 1.5), rr(-2, 2), rr(0.6, 1.1), [0.2, 0.18, 0.16, 0.6], [0.24, 0.22, 0.2, 0], 0.6, 1.9, 0, 2.5, 0.5);
  }
}
// 탱크가 잔해를 들이받으면 (속도 1.2m/s 이상으로 닿으면) 부서진다
function ramWrecks() {
  for (const T of TANKS) {
    if (!T.solid || Math.hypot(T.vel.x, T.vel.z) < 1.2) continue;
    for (const w of WRECKS.slice()) {
      fpLocal(w.fp, T.pos.x, T.pos.z, _fl);
      if (Math.abs(_fl.x) < w.fp.hx + 1.7 && Math.abs(_fl.z) < w.fp.hz + 1.7) removeWreck(w, 'break');
    }
  }
}
{
  // 가장 큰 건물 뒤(로컬 -z) 10m
  const big = footprints.filter(f => f.group && !f.bridge).reduce((m, f) => f.hx * f.hz > m.hx * m.hz ? f : m);
  const back = big.hz + 10;
  placeWreck(big.x - big.s * back, big.z - big.c * back, rand() * 6.28);
}
// 수리 금고: 처음에는 살롱 뒤 잔해 근처에
{
  const w = WRECKS[0];
  for (let k = 0; k < 400; k++) {
    const a = rand() * 6.283, r = rr(6, 10), x = w.x + Math.sin(a) * r, z = w.z + Math.cos(a) * r;
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6 || creekD[gridIndex(x, z)] < CREEK_HW + 4 || inFootprint(x, z, 2.5)) continue;
    if (allPoles.some(q => Math.hypot(q.x - x, q.z - z) < 3.5)) continue;
    const hs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].map(([a, b]) => heightAt(x + a, z + b));
    if (Math.max(...hs) - Math.min(...hs) > 1.3) continue;
    addTarget(x, z, Math.min(...hs) - 0.2, rand() * Math.PI / 2, 0, 'repair');
    break;
  }
}

// 살롱 지붕 위에도 공격 대상 하나
{
  const sal = footprints.filter(f => f.group && !f.noCrates && !f.metal).reduce((m, f) => f.hx * f.hz > m.hx * m.hz ? f : m);
  const x = sal.group.position.x, z = sal.group.position.z;
  addTarget(x, z, surfaceTop(x, z), Math.atan2(sal.s, sal.c) + rr(-0.2, 0.2));
}

// ---------------------------------------------------------------- 나무 상자 (마을 건물 주변, 일부는 쌓여 있음)
const crateTex = canvasTex(32, 32, (g) => {
  for (let y = 0; y < 32; y += 8) {
    const v = 120 + Math.floor(rand() * 40);
    g.fillStyle = `rgb(${v},${v - 32},${v - 70})`; g.fillRect(0, y, 32, 8);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, y + 7, 32, 1);
  }
  g.fillStyle = '#5a3c22'; g.fillRect(0, 0, 32, 3); g.fillRect(0, 29, 32, 3); g.fillRect(0, 0, 3, 32); g.fillRect(29, 0, 3, 32);
  g.strokeStyle = '#5a3c22'; g.lineWidth = 3; g.beginPath(); g.moveTo(3, 29); g.lineTo(29, 3); g.stroke();
  g.fillStyle = '#2a1c12'; for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30]]) g.fillRect(x, y, 1, 1);
});
const CRATE_MAX = 80;
const crateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert({ map: crateTex }), CRATE_MAX);
crateMesh.count = 0; scene.add(crateMesh);
const crates = [];
{
  const ok = (x, z, s) => !inFootprint(x, z, s * 0.6) && roadD[gridIndex(x, z)] > ROAD_HW + 1 && creekD[gridIndex(x, z)] > CREEK_HW + 2 &&
    !crates.some(c => Math.hypot(c.x - x, c.z - z) < (c.s + s) * 0.55) && !allPoles.some(p => Math.hypot(p.x - x, p.z - z) < 1.5);
  for (const f of footprints) {
    if (!f.group || f.bridge || f.noCrates) continue;
    for (let cl = 0; cl < 3; cl++) {
      // 건물 옆/뒤 벽을 따라 1~3개 늘어놓고, 가끔 위에 하나 더
      const side = Math.floor(rand() * 3), along = rr(-0.8, 0.8);
      const n = 1 + Math.floor(rand() * 3), base = [];
      let off = 0;
      for (let k = 0; k < n; k++) {
        // 보통 상자(1.1~1.5m) 사이에 가끔 큰 상자(1.75~2.05m)가 섞인다. 벽에서 조금 띄워 나란히
        const big = rand() < 0.22, s = (big ? rr(1.75, 2.05) : rr(1.1, 1.5)) * 1.2, out = s / 2 + rr(0.1, 0.35);   // 크기 120%
        let px, pz;
        if (side === 2) { px = along * f.hx + off + s / 2; pz = -(f.hz + out); }
        else { px = (side ? 1 : -1) * (f.hx + out); pz = along * f.hz + off + s / 2; }
        off += s + rr(0.05, 0.25);
        const x = f.x + px * f.c + pz * f.s, z = f.z - px * f.s + pz * f.c;
        if (!ok(x, z, s)) continue;
        const c = { x, z, y: heightAt(x, z) + s / 2, s, big, rot: Math.atan2(f.s, f.c) + rr(-0.25, 0.25), alive: true, below: null, vy: 0 };
        crates.push(c); base.push(c);
      }
      for (const b of base) if (rand() < 0.4 && crates.length < CRATE_MAX) {
        const s = Math.min(b.s * 0.85, rr(1.0, 1.25) * 1.2);
        crates.push({ x: b.x + rr(-0.1, 0.1), z: b.z + rr(-0.1, 0.1), y: b.y + b.s / 2 + s / 2, s, rot: b.rot + rr(-0.4, 0.4), alive: true, below: b, vy: 0 });
      }
    }
  }
  crates.length = Math.min(crates.length, CRATE_MAX);
}
// 시작 지점 옆 나무 상자 셋 (둘 위에 하나): 타이틀 화면에서 탱크 왼쪽 길가
{
  const cy = SPAWN.yaw * DEG + (CFG.title?.camera?.yaw ?? 65) * DEG, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
  rand();   // (뒤의 배치가 바뀌지 않게 난수는 예전처럼 하나 쓴다)
  // 화면에서 탱크 왼쪽, 전봇대 옆 길가. 두 개를 화면 가로로 나란히 → 그 사이 위에 하나 (삼각형이 정면으로 보이게).
  // 묶음 가운데를 축으로 위에서 볼 때 반시계 방향으로 25도 돌려 놓는다
  const s = 1.2, rot = Math.atan2(-rz, rx) + 25 * DEG, cx = SPAWN_X + fx * 3 - rx * 4.2 + rx * 0.65, cz = SPAWN_Z + fz * 3 - rz * 4.2 + rz * 0.65;   // 카메라에서 먼 쪽으로 조금 물려 풀숲에 살짝 가리게 (부품 설명 글자가 잘 보이게)
  const along = (d) => [cx + Math.cos(rot) * d, cz - Math.sin(rot) * d];
  const base = [-0.65, 0.65].map((d) => {
    const [x, z] = along(d);
    const c = { x, z, y: heightAt(x, z) + s / 2, s, big: false, rot: rot + rr(-0.15, 0.15), alive: true, below: null, vy: 0 };
    crates.push(c); return c;
  });
  const b = base[0], top = s * 0.9, [tx, tz] = along(0);
  crates.push({ x: tx, z: tz, y: b.y + s / 2 + top / 2, s: top, rot: rot + 0.2, alive: true, below: b, vy: 0 });
  crates.length = Math.min(crates.length, CRATE_MAX);
}
const _cc = new THREE.Color();
function writeCrates() {
  crates.forEach((c, i) => {
    crateMesh.setMatrixAt(i, _m4.compose(_v3.set(c.x, c.y, c.z), _cq0.setFromAxisAngle(UPV, c.rot), _cs0.setScalar(c.alive ? c.s : 0)));
    crateMesh.setColorAt(i, c.big ? _cc.setRGB(0.5, 0.47, 0.42) : _cc.setScalar(0.6 + (i * 0.37 % 1) * 0.25));   // 큰 상자는 묵은 판자색
  });
  crateMesh.count = crates.length;
  crateMesh.instanceMatrix.needsUpdate = true;
  if (crateMesh.instanceColor) crateMesh.instanceColor.needsUpdate = true;
}
const _cq0 = new THREE.Quaternion(), _cs0 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
writeCrates();
// 부서짐: boom이면 포탄/폭발로 터진 것 (파편 많이, 세게), 아니면 탱크가 밟은 것 (조금, 약하게)
function breakCrate(c, boom) {
  if (!c.alive) return;
  c.alive = false;
  const p = new THREE.Vector3(c.x, c.y, c.z);
  spawnShards(p, boom ? 24 : 12, WOOD_COLS, boom ? 5 : 1.5, boom ? 14 : 4.5, null, 0.12 * c.s, 0.3 * c.s, c.s * 0.4);
  for (let k = 0; k < (boom ? 0 : 5); k++)
    smokeP.spawn(c.x + rr(-0.4, 0.4), c.y - c.s / 2 + 0.2, c.z + rr(-0.4, 0.4), rr(-1, 1), rr(0.3, 1), rr(-1, 1), rr(0.6, 1.0), [0.32, 0.27, 0.2, 0.5], [0.3, 0.27, 0.22, 0], 0.4, 1.2, 0, 2);
  for (const o of crates) if (o.below === c) o.below = null;   // 위에 있던 상자는 떨어진다
  cratesDirty = true;
}
let cratesDirty = false;
const _cl = new THREE.Vector3();
function updateCrates(dt) {
  for (const c of crates) {
    if (!c.alive) continue;
    // 받침이 없어진 상자는 떨어진다
    const floor = c.below ? c.below.y + c.below.s / 2 + c.s / 2 : heightAt(c.x, c.z) + c.s / 2;
    if (c.y > floor + 0.001) { c.vy -= G * dt; c.y = Math.max(floor, c.y + c.vy * dt); if (c.y === floor) c.vy = 0; cratesDirty = true; }
    // 탱크(나·적)가 밟으면 그냥 부서진다
    for (const T of TANKS) {
      if (!T.solid) continue;
      const dx = c.x - T.pos.x, dz = c.z - T.pos.z;
      if (dx * dx + dz * dz > 16) continue;
      _cl.set(dx, c.y - T.pos.y, dz).applyQuaternion(_qi.copy(T.q).invert()).add(COM);
      const m = c.s * 0.4;
      if (Math.abs(_cl.x) < (T.hx ?? HULL_HX) + m && Math.abs(_cl.z) < (T.hz ?? HULL_HZ) + m && _cl.y > -m && _cl.y < (T.ht ?? 2.8) + m) { breakCrate(c, false); break; }
    }
  }
  if (cratesDirty) { writeCrates(); cratesDirty = false; colDirty = true; }
}

await loadStep(0.8, 'PLANTING GRASS...');
