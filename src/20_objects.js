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
        #ifdef RIVET_LIGHT
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 2.4 + 0.07, cov);   // 어두운 판: 리벳이 밝게 도드라진다
        #else
        diffuseColor.rgb *= mix(mix(1.0, 0.4, cov), 0.62, core);
        #endif
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
// ---------------------------------------------------------------- 위장색 (내 탱크만. 타이틀에서 Q/E로 바꾼다)
// 단색: 차체·포탑·포신 등 부품 색을 그 색으로 (부품끼리 밝기 차이는 그대로). 무늬: 탱크 기준 좌표(정점에 구워 둔 aCamo)로 얼룩을 그려
// 포탑이 돌면 무늬도 같이 돈다. 셰이더는 하나 (무늬는 uCamoOn으로 켜고 끔): 바꿔도 다시 컴파일하지 않는다
const CAMO_LIST = (CFG.camo?.list?.length ? CFG.camo.list : [{ name: 'OLIVE' }]);
const CAMO_KEYS = ['hull', 'low', 'turret', 'barrel', 'plate', 'top', 'muzzle'];   // 바퀴는 그대로
const CAMO_U = {
  uCamoA: { value: new THREE.Color() }, uCamoB: { value: new THREE.Color() }, uCamoC: { value: new THREE.Color() },
  uCamoS: { value: CFG.camo?.density ?? 1.35 }, uCamoOn: { value: 0 }, uCamoT1: { value: 0.55 }, uCamoT2: { value: 2 }, uCamoStripe: { value: 0 },
};
const CAMO_GLSL = `
uniform vec3 uCamoA, uCamoB, uCamoC; uniform float uCamoS, uCamoOn, uCamoT1, uCamoT2, uCamoStripe;
varying vec3 vCamo;
float camoH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float camoN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(camoH(i), camoH(i + vec3(1, 0, 0)), f.x), mix(camoH(i + vec3(0, 1, 0)), camoH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(camoH(i + vec3(0, 0, 1)), camoH(i + vec3(1, 0, 1)), f.x), mix(camoH(i + vec3(0, 1, 1)), camoH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;
const camoMats = new Map();   // 재질 → 부품 이름 (TC의 키)
{
  const byHex = new Map(CAMO_KEYS.map((k) => [TC[k], k]));
  tankGroup.updateMatrixWorld(true);
  const inv = tankGroup.matrixWorld.clone().invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  tankGroup.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const k = byHex.get(o.material.color.getHex());
    if (!k) return;
    camoMats.set(o.material, k);
    const g = o.geometry, p = g.attributes.position;
    if (g.attributes.aCamo) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); a.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute('aCamo', new THREE.BufferAttribute(a, 3));   // 탱크 기준 (가만히 선 자세) 위치
  });
  for (const mat of camoMats.keys()) {
    const base = mat.onBeforeCompile, key = mat.customProgramCacheKey.call(mat);
    mat.userData.camoBase = mat.color.clone();
    mat.onBeforeCompile = function (sh, r) {
      base.call(this, sh, r);
      Object.assign(sh.uniforms, CAMO_U);
      sh.vertexShader = 'attribute vec3 aCamo; varying vec3 vCamo;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = aCamo;');
      sh.fragmentShader = CAMO_GLSL + sh.fragmentShader.replace('#include <emissivemap_fragment>', `if (uCamoOn > 0.5) {
        vec3 q = vCamo * uCamoS;
        if (uCamoStripe > 0.5) q = vec3(q.x * 0.45 + q.y * 0.9, q.y * 0.3, q.z * 0.45 + q.y * 0.9);   // 비스듬한 줄
        float n1 = camoN(q) * 0.65 + camoN(q * 2.3 + 7.0) * 0.35;
        float n2 = camoN(q * 1.1 + 31.0) * 0.65 + camoN(q * 2.5 + 3.0) * 0.35;
        vec3 pc = mix(uCamoA, uCamoB, step(uCamoT1, n1));
        pc = mix(pc, uCamoC, step(uCamoT2, n2));
        float lum = dot(diffuse, vec3(0.3, 0.59, 0.11)) / max(dot(uCamoA, vec3(0.3, 0.59, 0.11)), 0.001);   // 부품끼리 밝기 차이는 남긴다
        diffuseColor.rgb *= pc * clamp(lum, 0.6, 1.5) / max(diffuse, vec3(0.001));
      }
      #include <emissivemap_fragment>`);
    };
    mat.customProgramCacheKey = () => key + '|camo';
    mat.needsUpdate = true;
  }
}
let camoIdx = 0;
try { camoIdx = Math.max(0, CAMO_LIST.findIndex((c) => c.name === localStorage.getItem('MightyMolly.camoName'))); } catch (_) {}   // 이름으로 기억 (목록 순서가 바뀌어도)
function setCamo(i) {
  camoIdx = (i + CAMO_LIST.length) % CAMO_LIST.length;
  try { localStorage.setItem('MightyMolly.camoName', CAMO_LIST[camoIdx].name); } catch (_) {}
  const C = CAMO_LIST[camoIdx], hsl = (c) => { const o = {}; new THREE.Color(c).getHSL(o, THREE.SRGBColorSpace); return o; };
  const H0 = hsl(TC.hull), base = C.pattern ? C.pattern[0] : C.color;
  for (const [mat, k] of camoMats) {
    if (!base) { mat.color.copy(mat.userData.camoBase); continue; }
    const B = hsl(base), K = hsl(TC[k]);   // 고른 색에 부품마다 원래 밝기·채도 차이를 더한다
    mat.color.setHSL(B.h, Math.max(0, Math.min(1, B.s + (K.s - H0.s) * 0.6)), Math.max(0, Math.min(1, B.l + (K.l - H0.l))), THREE.SRGBColorSpace);
  }
  const P = C.pattern;
  CAMO_U.uCamoOn.value = P ? 1 : 0;
  if (P) {
    CAMO_U.uCamoA.value.set(P[0]); CAMO_U.uCamoB.value.set(P[1]); CAMO_U.uCamoC.value.set(P[2] ?? P[1]);
    CAMO_U.uCamoT1.value = C.t1 ?? 0.55; CAMO_U.uCamoT2.value = P[2] ? (C.t2 ?? 0.64) : 2; CAMO_U.uCamoStripe.value = C.stripe ? 1 : 0;
  }
}
setCamo(camoIdx);

await loadStep(0.74, 'PLACING SAFES...');
// ---------------------------------------------------------------- 공격 대상 (한 변 3m 빨간 보급품)
const TARGET_S = 3;
// 보급품 모델 공통: 글씨 판(5x7 글꼴), 면 위 테두리 줄. 한 번 합쳐 두고 복제해 쓴다
const txtTex = (t, fg, bg, pad = 2) => {
  const w = fontDraw(t, 0, 0, 1, () => {}) + pad * 2 - 1, h = 7 + pad * 2;
  return canvasTex(w, h, (g) => { if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } g.fillStyle = fg; fontDraw(t, pad, pad, 1, (x, y, k) => g.fillRect(x, y, k, k)); });
};
const decalPlane = (tex, w, h, extra = {}) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({ map: tex, transparent: true, alphaTest: 0.5, ...DECAL, ...extra }));
function supplyModel(build) {
  const g = new THREE.Group();
  const add = (m, x, y, z, par = g) => { m.position.set(x, y, z); par.add(m); return m; };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const cyl = (r, h, seg, mat) => { const c = new THREE.CylinderGeometry(r, r, h, seg); c.rotateX(Math.PI / 2); return new THREE.Mesh(c, mat); };
  // 면 위의 사각형 테두리 (가는 상자 네 개). 앞면(z) 기준, rotY로 옆면에도
  const frame = (w, h, t, mat, x, y, z, rotY = 0) => {
    const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = rotY; g.add(f);
    add(box(w, t, 0.03, mat), 0, h / 2 - t / 2, 0, f); add(box(w, t, 0.03, mat), 0, -h / 2 + t / 2, 0, f);
    add(box(t, h, 0.03, mat), -w / 2 + t / 2, 0, 0, f); add(box(t, h, 0.03, mat), w / 2 - t / 2, 0, 0, f);
  };
  build({ g, add, box, cyl, frame });
  g.traverse((o) => { if (o.isMesh && !o.geometry.attributes.aRiv) o.geometry.setAttribute('aRiv', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 4), 4)); });
  return bake(g, null, ['aRiv']);
}
// 도트 그림 한 장 (문자열 줄: '#' = 칠함)을 k배로 찍는다
const pixArt = (g, rows, x, y, k, col) => { g.fillStyle = col; rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') g.fillRect(x + i * k, y + j * k, k, k); }); };
const WRENCH = [   // 수리 도구 (스패너): 오른쪽 위 벌린 입, 왼쪽 아래 고리
  '................', '..........##.##.', '.........###.###', '.........###.###', '.........#######', '..........#####.', '.........###....', '........###.....',
  '.......###......', '......###.......', '.....###........', '....###.........', '.#####..........', '##..##..........', '##..##..........', '.####...........',
];
// 골드 보급품: 붉은 칠 금고. 금박 테두리·금화 문장, 어두운 받침과 리벳 박힌 윗 테 (가운데 금색 원에 별 모양 구멍), 황동 다이얼
const goldIconTex = canvasTex(32, 32, (g) => {   // 금색으로 채운 원에 ★ 모양으로 뚫린 구멍 (구멍으로 윗판이 보인다. 흰색은 재질의 금색으로 물든다)
  const st = [];   // 다섯 꼭짓점 별 (위가 꼭짓점): 바깥 11.5, 안쪽 4.8
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.8 : 11.5, a = -Math.PI / 2 + i * Math.PI / 5; st.push([16 + Math.cos(a) * r, 16.6 + Math.sin(a) * r]); }
  const inStar = (x, y) => {   // 다각형 안쪽 판정 (광선 교차)
    let inside = false;
    for (let i = 0, j = st.length - 1; i < st.length; j = i++) {
      const [xi, yi] = st[i], [xj, yj] = st[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  g.fillStyle = '#ffffff';
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (Math.hypot(x - 15.5, y - 15.5) <= 15.2 && !inStar(x + 0.5, y + 0.5)) g.fillRect(x, y, 1, 1);
});
const safeModel = supplyModel(({ add, box, cyl, frame }) => {
  const S = TARGET_S, fz = S / 2;
  const red = lambert({ color: 0xa8241a, emissive: 0x340604, map: plateTex }), dark = lambert({ color: 0x473d3d, map: plateTex }), darkRiv = rivetMat({ color: 0x473d3d, map: plateTex });   // 위아래 판 (15% 밝게)
  darkRiv.defines = { RIVET_LIGHT: '' };   // 검은 판이라 리벳을 밝게
  const gold = lambert({ color: 0xe0b450, emissive: 0x3a2808 }), brass = lambert({ color: 0xd0a040, emissive: 0x2a1a04 }), black = lambert({ color: 0x141010 });
  add(box(S, S - 0.5, S, red), 0, 0.05, 0);
  add(plateBox(S + 0.14, 0.24, S + 0.14, darkRiv), 0, S / 2 - 0.08, 0);   // 윗 테 (윗면 가장자리에 리벳)
  const icon = add(new THREE.Mesh(new THREE.PlaneGeometry(1.04, 1.04), lambert({ map: goldIconTex, color: 0xe0b450, emissive: 0x3a2808, transparent: true, alphaTest: 0.5, ...DECAL })), 0, S / 2 + 0.045, 0);
  icon.rotation.x = -Math.PI / 2;
  add(box(S + 0.1, 0.34, S + 0.1, dark), 0, -S / 2 + 0.37, 0);           // 받침
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.4, 0.2, 0.4, black), sx * (S / 2 - 0.28), -S / 2 + 0.1, sz * (S / 2 - 0.28));   // 발
  add(box(S - 0.5, S - 1.15, 0.1, red), 0, 0.05, fz + 0.05);            // 문
  frame(S - 0.5, S - 1.15, 0.05, gold, 0, 0.05, fz + 0.11);
  for (const s of [1, -1]) frame(S - 0.4, S - 1.0, 0.05, gold, s * (fz + 0.01), 0.05, 0, s * Math.PI / 2);   // 양옆 테두리
  add(cyl(0.34, 0.06, 16, gold), -0.45, 0.05, fz + 0.13);                 // 금화 문장
  add(decalPlane(txtTex('$', '#6a3a08'), 0.32, 0.4), -0.45, 0.05, fz + 0.17);
  add(cyl(0.26, 0.1, 14, brass), 0.5, 0.25, fz + 0.15); add(cyl(0.15, 0.1, 10, black), 0.5, 0.25, fz + 0.21);   // 다이얼
  for (const y of [0.5, -0.5]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 8), black), -1.02, y, fz + 0.1);   // 경첩
});
// 수리 보급품: 꼭짓점 8개를 깎아 낸 밝은 회색 상자 하나에 그림 한 장 (옆면 / 앞·뒷면 / 윗면 세 칸). 초록 띠·초록 원·수리 도구는 모두 텍스처에 (폴리곤 없음).
// 발만 따로
const REP_T = 128, REP_BAND = [0.527, 0.255];   // 칸 크기(px), 띠 가운데 높이·두께 (면 높이 비율)
const REP_GREEN = '#2f6a3e';   // 초록 띠·원·윗면 수리 도구 (진하고 채도 낮게)
const repairTex = canvasTex(REP_T * 3, REP_T, (g) => {
  let sd = 0x1234567;
  const r01 = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };   // 지형 배치 난수와 섞이지 않게 따로
  for (let k = 0; k < 3; k++) {
    const x0 = k * REP_T;
    g.fillStyle = '#b4b8b2'; g.fillRect(x0, 0, REP_T, REP_T);   // 밝은 회색 바탕 (재질 색은 흰색: 흰 원이 바탕보다 밝게)
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(60,58,50,${0.06 + r01() * 0.1})`; g.fillRect(x0 + Math.floor(r01() * REP_T), Math.floor(r01() * REP_T), 1 + Math.floor(r01() * 3), 1); }   // 얼룩
    if (k < 2) {   // 옆면·앞면: 가운데를 두른 초록 띠
      const y0 = Math.round((1 - REP_BAND[0] - REP_BAND[1] / 2) * REP_T), h = Math.round(REP_BAND[1] * REP_T);
      g.fillStyle = REP_GREEN; g.fillRect(x0, y0, REP_T, h);
    }
    if (k === 1) {   // 앞면: 띠 가운데 초록 원 + 회색(겉면 색) 수리 도구
      const cx = x0 + REP_T / 2, cy = (1 - REP_BAND[0]) * REP_T, R = 0.62 * 1.2 / TARGET_S * REP_T;
      g.fillStyle = REP_GREEN;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R) g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
      pixArt(g, WRENCH, Math.round(cx - 16), Math.round(cy - 16), 2, '#b4b8b2');
    }
    if (k === 2) pixArt(g, WRENCH, x0 + REP_T / 2 - 32, REP_T / 2 - 32, 4, REP_GREEN);   // 윗면: 큰 수리 도구 (멀리서도 보이게. 칸의 절반 크기)
  }
});
repairTex.generateMipmaps = true; repairTex.minFilter = THREE.NearestMipmapNearestFilter;   // 멀리서 반짝이지 않게
const repairModel = supplyModel(({ add, box }) => {
  const S = TARGET_S, fz = S / 2, H = S - 0.25, C = 0.3;   // C: 꼭짓점을 깎은 길이 (모서리마다)
  const hh = { x: S / 2, y: H / 2, z: S / 2 }, P = [], U = [], RV = [];
  const tri = (a, b, c, out) => {   // 바깥(out)을 보게 넣는다. a·b·c = { p, uv, riv }
    const e1 = [b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z], e2 = [c.p.x - a.p.x, c.p.y - a.p.y, c.p.z - a.p.z];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const q of n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [a, c, b] : [a, b, c]) { P.push(q.p.x, q.p.y, q.p.z); U.push(...q.uv); RV.push(...q.riv); }
  };
  // 면 6개: 네 귀퉁이를 깎은 팔각형. a·b = 면 위 가로·세로 축 (부호는 밖에서 볼 때 오른쪽·위), tile = 그림 칸 (0 옆, 1 앞·뒤, 2 위)
  for (const f of [{ n: 'x', sg: 1, a: 'z', as: -1, b: 'y', bs: 1, tile: 0 }, { n: 'x', sg: -1, a: 'z', as: 1, b: 'y', bs: 1, tile: 0 },
    { n: 'y', sg: 1, a: 'x', as: 1, b: 'z', bs: -1, tile: 2 }, { n: 'y', sg: -1, a: 'x', as: 1, b: 'z', bs: 1, tile: 0 },
    { n: 'z', sg: 1, a: 'x', as: 1, b: 'y', bs: 1, tile: 1 }, { n: 'z', sg: -1, a: 'x', as: -1, b: 'y', bs: 1, tile: 1 }]) {   // 뒷면도 초록 원·수리 도구
    const A = hh[f.a], B = hh[f.b], out = { x: 0, y: 0, z: 0 }; out[f.n] = f.sg;
    const v = [[-A + C, -B], [A - C, -B], [A, -B + C], [A, B - C], [A - C, B], [-A + C, B], [-A, B - C], [-A, -B + C]].map(([u, w]) => {
      const p = { x: 0, y: 0, z: 0 }; p[f.n] = f.sg * hh[f.n]; p[f.a] = u * f.as; p[f.b] = w * f.bs;
      const fu = (u + A) / (2 * A), fv = (w + B) / (2 * B);
      return { p, uv: [(f.tile + fu) / 3, fv], riv: [fu * 2 * A, fv * 2 * B, 2 * A, 2 * B] };   // 리벳 좌표는 예전 상자 면과 같게
    });
    for (let i = 1; i < 7; i++) tri(v[0], v[i], v[i + 1], [out.x, out.y, out.z]);
  }
  // 깎인 꼭짓점: 삼각형 8개 (바탕 회색, 리벳 없음)
  const flat = { uv: [0.03, 0.97], riv: [0, 0, 0, 0] };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const X = hh.x * sx, Y = hh.y * sy, Z = hh.z * sz;
    tri({ ...flat, p: { x: X - C * sx, y: Y, z: Z } }, { ...flat, p: { x: X, y: Y - C * sy, z: Z } }, { ...flat, p: { x: X, y: Y, z: Z - C * sz } }, [sx, sy, sz]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aRiv', new THREE.Float32BufferAttribute(RV, 4));
  g.computeVertexNormals();
  add(new THREE.Mesh(g, rivetMat({ color: 0xffffff, emissive: 0x161816, map: repairTex })), 0, 0.125, 0);
  const iron = lambert({ color: 0x3a3c3c, map: plateTex });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.42, 0.25, 0.42, iron), sx * (S / 2 - 0.3), -S / 2 + 0.125, sz * (S / 2 - 0.3));   // 발
});
// ---------------------------------------------------------------- 낙하산: 하늘에서 떨어지는 탱크·보급품 위에 펼쳐진다 (떨어지는 빠르기는 그대로)
// 물체와 함께 디더링으로 나타나고, 땅에 닿으면 접히며 디더링으로 스르륵 사라진다. 다 쓴 것은 모아 두었다 다시 쓴다
const CHUTE_R = 2.6, CHUTE_H = 5.2, CHUTE_OUT = 0.8;   // 덮개 반지름, 매단 점에서 덮개 아래 가장자리까지 높이, 사라지는 시간 (초)
const chuteTex = canvasTex(16, 4, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f0eee8' : '#e2dfd6'; g.fillRect(i, 0, 1, 4); } });   // 흰 천 (조각마다 아주 살짝 다르게)
// 덮개: 꼭대기는 납작하고 옆은 둥글게 내려와 가장자리가 살짝 안으로 말린 모양 (구를 반구보다 조금 더(105°) 잘라 세로로 납작하게).
// 꼭대기 가운데는 작은 구멍 (공기 빠지는 구멍, 0.16 rad). 떨어지는 동안 b1(기본) ↔ b2(넓고 낮게) 모양을 EaseInOutSine으로 오간다
const CHUTE_T0 = 0.16, CHUTE_TH = 1.83, CHUTE_SY = 0.62;
const CHUTE_BREATH = 0.44, CHUTE_B2 = [1.1, 0.8];   // 한쪽 모양에서 다른 쪽까지 걸리는 시간 (초), b2 = 가로·세로 배율
const chuteGeo = new THREE.SphereGeometry(CHUTE_R, 16, 6, 0, Math.PI * 2, CHUTE_T0, CHUTE_TH - CHUTE_T0).scale(1, CHUTE_SY, 1);
const CHUTE_RIM_Y = Math.cos(CHUTE_TH) * CHUTE_R * CHUTE_SY, CHUTE_RIM_R = Math.sin(CHUTE_TH) * CHUTE_R * 0.97;
// 덮개 가장자리 8곳 → 매단 점 (0, -CHUTE_H, 0). 덮개 모양이 바뀌면 가장자리 끝을 따라 옮기므로 낙하산마다 따로
function chuteLines(c, sx, sy) {
  const a = c.lineGeo.attributes.position;
  for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; a.setXYZ(k * 2, Math.cos(t) * CHUTE_RIM_R * sx, CHUTE_RIM_Y * sy, Math.sin(t) * CHUTE_RIM_R * sx); a.setXYZ(k * 2 + 1, 0, -CHUTE_H, 0); }
  a.needsUpdate = true;
}
const chuteCanopyMat = lambert({ map: chuteTex, side: THREE.DoubleSide, emissive: 0x1e1e1c });
const chuteLineMat = new THREE.LineBasicMaterial({ color: 0x2a2822 });
const chutes = [], chutePool = [];
function makeChute() {
  const u = { value: 0 }, g = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48), 3));
  const canopy = new THREE.Mesh(chuteGeo, fadeMat(chuteCanopyMat, u)), lines = new THREE.LineSegments(lineGeo, fadeMat(chuteLineMat, u));
  canopy.userData.noOutline = lines.userData.noOutline = true;
  g.add(canopy, lines);
  const c = { g, u, canopy, lineGeo };
  chuteLines(c, 1, 1);
  return c;
}
// at(out): 매단 점 (물체 위 가운데) 월드 위치. falling(): 아직 떨어지는 중인가. 물체와 같이 dropFadeIn초 동안 나타난다
function attachChute(at, falling) {
  const c = chutePool.pop() || makeChute(), dur = CFG.screen?.dropFadeIn ?? 0.3;
  Object.assign(c, { at, falling, t: 0, dur: Math.max(0.01, dur), out: -1, ph: rand() * 6.28 });
  c.u.value = 0; c.g.scale.set(1, 1, 1); c.g.rotation.set(0, rand() * 6.28, 0);
  at(c.g.position); c.g.position.y += CHUTE_H;
  scene.add(c.g); chutes.push(c);
}
const _chP = new THREE.Vector3();
function updateChutes(dt) {
  for (let i = chutes.length - 1; i >= 0; i--) {
    const c = chutes[i];
    c.t += dt;
    if (c.out < 0) {
      c.u.value = Math.max(0, Math.min(1, c.t / c.dur));
      c.at(_chP); c.g.position.set(_chP.x, _chP.y + CHUTE_H, _chP.z);
      c.g.rotation.x = Math.sin(c.t * 1.7 + c.ph) * 0.06; c.g.rotation.z = Math.cos(c.t * 1.3 + c.ph) * 0.06;   // 살랑살랑
      // 숨 쉬듯: b1 → b2 → b1 (EaseInOutSine)
      const e = 0.5 - 0.5 * Math.cos(Math.PI * (c.t + c.ph) / CHUTE_BREATH), sx = 1 + (CHUTE_B2[0] - 1) * e, sy = 1 + (CHUTE_B2[1] - 1) * e;
      c.canopy.scale.set(sx, sy, sx); chuteLines(c, sx, sy);
      if (!c.falling()) c.out = 0;   // 착지 (또는 공중에서 부서짐): 접히며 사라진다
    } else {
      c.out += dt;
      const k = Math.min(1, c.out / CHUTE_OUT);
      c.u.value = Math.min(c.u.value, 1 - k);
      c.g.scale.set(1 + k * 0.25, 1 - k * 0.6, 1 + k * 0.25);   // 바람 빠지듯 납작해지며
      c.g.position.y -= dt * 2.5;   // 조금 내려앉는다
      if (k >= 1) { scene.remove(c.g); chutes.splice(i, 1); chutePool.push(c); }
    }
  }
}
const targets = [];
// 지형이 아닌 곳(지붕)에 놓인 보급품은 반투명 그림자 판 한 장을 깐다
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
  else { fadeIn(mesh); attachChute((o) => o.set(t.x, t.y + TARGET_S / 2, t.z), () => t.falling && t.alive); }   // 하늘에서: 낙하산을 펴고 디더링으로 스르륵 나타난다
  return t;
}
// 땅 위에 놓인 보급품은 그 자리 경사에 맞춰 기울인다 (지붕·다른 보급품 위는 수평). 놓일 때 한 번만 계산
// 그 자리 땅에서 가장 높은 곳 (네 귀퉁이와 가운데). 보급품이 놓일 면이 이보다 높으면 지붕 위
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
  const w = { x, z, y: wg.position.y + 2.4, group: wg, fp, decals: [], yaw };
  fp.wreck = w; wg.userData.wreck = w;
  footprints.push(fp);
  WRECKS.push(w);
  return w;
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
// 수리 보급품: 처음에는 살롱 뒤 잔해 근처에 (config box.repairCount개. 첫 하나는 여기서, 나머지는 다른 배치가 끝난 뒤에 — 뒤 배치의 난수 순서가 바뀌지 않게)
function placeRepair(far = 0) {   // far: 다른 보급품과 이만큼은 떨어지게
  const w = WRECKS[0];
  for (let k = 0; k < 400; k++) {
    const a = rand() * 6.283, r = rr(6, 10 + far), x = w.x + Math.sin(a) * r, z = w.z + Math.cos(a) * r;
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6 || creekD[gridIndex(x, z)] < CREEK_HW + 4 || inFootprint(x, z, 2.5)) continue;
    if (allPoles.some(q => Math.hypot(q.x - x, q.z - z) < 3.5)) continue;
    if (far && targets.some((t) => Math.hypot(t.x - x, t.z - z) < far)) continue;
    const hs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].map(([a, b]) => heightAt(x + a, z + b));
    if (Math.max(...hs) - Math.min(...hs) > 1.3) continue;
    addTarget(x, z, Math.min(...hs) - 0.2, rand() * Math.PI / 2, 0, 'repair');
    return;
  }
}
placeRepair();

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
crateMesh.count = 0; crateMesh.frustumCulled = false; scene.add(crateMesh);   // 인스턴스 메시는 경계 구를 처음 한 번만 계산한다 → 나중에 놓은 상자가 화면 밖으로 잘못 걸러지지 않게 끈다 (그리기 1번이라 비용 거의 없음)
// 드럼통: 나무 상자 목록에 함께 든다 (c.drum). 충돌·쌓기·부서짐은 한 변 DRUM_S짜리 상자와 같고, 그리기만 8각 원기둥 (삼각형 32개, 그리기 1번)
const DRUM_S = 1.1 * 1.2;   // 높이(= 충돌 상자 한 변)
const drumSideTex = canvasTex(32, 32, (g) => {
  g.fillStyle = '#dcdcd4'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 90; i++) { const x = (i * 37) % 32, y = (i * 53 + (i >> 2)) % 32; g.fillStyle = i % 3 ? 'rgba(255,255,250,.18)' : 'rgba(60,56,48,.14)'; g.fillRect(x, y, 2, 1); }
  g.fillStyle = 'rgba(40,38,34,.55)'; g.fillRect(0, 0, 32, 2); g.fillRect(0, 30, 32, 2);   // 위아래 테
  for (const y of [10, 21]) { g.fillStyle = 'rgba(40,38,34,.5)'; g.fillRect(0, y, 32, 1); g.fillStyle = 'rgba(255,255,250,.35)'; g.fillRect(0, y + 1, 32, 1); }   // 두른 띠 2줄
  for (const [x, y, h] of [[5, 2, 9], [18, 22, 7], [27, 12, 6]]) for (let k = 0; k < h; k++) { g.fillStyle = `rgba(110,58,24,${0.4 * (1 - k / h)})`; g.fillRect(x, y + k, 1, 1); }   // 녹물 자국
});
const drumCapTex = canvasTex(16, 16, (g) => {
  g.fillStyle = '#d0d0c8'; g.fillRect(0, 0, 16, 16);
  g.strokeStyle = 'rgba(40,38,34,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(8, 8, 6.5, 0, 7); g.stroke();   // 뚜껑 테
  g.fillStyle = 'rgba(30,28,24,.8)'; g.fillRect(4, 5, 2, 2); g.fillRect(10, 9, 1, 1);   // 마개
});
const drumMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 8, 1), [lambert({ map: drumSideTex }), lambert({ map: drumCapTex }), lambert({ map: drumCapTex })], CRATE_MAX);
drumMesh.count = 0; drumMesh.frustumCulled = false; scene.add(drumMesh);
drumMesh.setColorAt(0, new THREE.Color(1, 1, 1));   // 인스턴스 색 버퍼를 처음부터 (드럼통이 없는 지도에서 처음 놓을 때 다시 컴파일되지 않게)   // (나무 상자와 같은 이유)
const DRUM_COLS = [0x46502c, 0x283644, 0x6a5c26].map((h) => new THREE.Color(h));   // 국방색·짙은 파랑·바랜 노랑 (진하게)
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
  // 비탈에 놓여 한쪽이 뜨는 상자는 뺀다 (네 귀퉁이 땅 높이 차가 크면). 그 위에 얹은 상자도 같이. 난수는 그대로 (뒤의 배치가 바뀌지 않게)
  const tilted = (c) => { const h = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => heightAt(c.x + a * c.s / 2, c.z + b * c.s / 2)); return Math.max(...h) - Math.min(...h) > 0.3; };
  const drop = new Set(crates.filter((c) => !c.below && tilted(c)));
  for (const c of crates) if (c.below && drop.has(c.below)) drop.add(c);
  for (let i = crates.length - 1; i >= 0; i--) if (drop.has(crates[i])) crates.splice(i, 1);
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
const crateCols = (c) => c.drum ? [DRUM_COLS[c.dc || 0], METAL_COLS[1], METAL_COLS[3]] : WOOD_COLS;   // 부서질 때 조각 색 (드럼통은 쇳조각)
function writeCrates() {
  let n = 0, m = 0;
  crates.forEach((c, i) => {
    _m4.compose(_v3.set(c.x, c.y, c.z), _cq0.setFromAxisAngle(UPV, c.rot), _cs0.setScalar(c.alive ? c.s : 0));
    if (c.drum) { drumMesh.setMatrixAt(m, _m4); drumMesh.setColorAt(m, DRUM_COLS[c.dc || 0]); m++; return; }   // 드럼통
    crateMesh.setMatrixAt(n, _m4);
    crateMesh.setColorAt(n, c.big ? _cc.setRGB(0.5, 0.47, 0.42) : _cc.setScalar(0.6 + (i * 0.37 % 1) * 0.25));   // 큰 상자는 묵은 판자색
    n++;
  });
  crateMesh.count = n; drumMesh.count = m;
  for (const im of [crateMesh, drumMesh]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}
const _cq0 = new THREE.Quaternion(), _cs0 = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
writeCrates();
// 부서짐: boom이면 포탄/폭발로 터진 것 (파편 많이, 세게), 아니면 탱크가 밟은 것 (조금, 약하게)
function breakCrate(c, boom) {
  if (!c.alive) return;
  c.alive = false;
  const p = new THREE.Vector3(c.x, c.y, c.z);
  const cols = crateCols(c);
  if (c.drum) sfx.clang(p, 0.5);
  spawnShards(p, boom ? 24 : 12, cols, boom ? 6 : 2, boom ? 20 : 7, null, 0.144 * c.s, 0.36 * c.s, c.s * 0.5);   // 조각 (예전의 40% 크기, 더 멀리)
  spawnShards(p, boom ? 30 : 14, cols, boom ? 8 : 3, boom ? 26 : 10, null, 0.035, 0.08, c.s * 0.4);              // 잔 부스러기
  // 먼지: 밟아 부술 때만 (예전의 2배 크기). 나무 상자는 흙빛, 드럼통은 잿빛
  const d0 = c.drum ? [0.3, 0.29, 0.27, 0.55] : [0.36, 0.3, 0.22, 0.55], d1 = c.drum ? [0.28, 0.28, 0.27, 0] : [0.32, 0.29, 0.24, 0];
  for (let k = 0; k < (boom ? 0 : 6); k++)
    smokeP.spawn(c.x + rr(-0.6, 0.6) * c.s, c.y - c.s / 2 + rr(0.1, 0.6) * c.s, c.z + rr(-0.6, 0.6) * c.s, rr(-1.6, 1.6), rr(0.4, 1.3), rr(-1.6, 1.6), rr(1.2, 2.0), d0, d1, 0.5, 1.6, 0, 2);
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

// ---------------------------------------------------------------- 지도 물체 넣고·옮기고·지우기 (map.js와 맵 편집 모드가 쓴다): 나무 상자, 탱크 잔해, 벙커
// 나무 상자: 겹치는 다른 상자가 있으면 그 위에, 없으면 땅 위에. 옮기면 위에 얹힌 상자도 함께 따라온다
const crateOn = (c, o) => { for (let b = o; b; b = b.below) if (b === c) return true; return false; };   // o가 c 위에 (얹혀) 있는가
function crateBase(c) {
  let best = null;
  for (const o of crates) {
    if (o === c || !o.alive || crateOn(c, o)) continue;
    if (Math.hypot(o.x - c.x, o.z - c.z) < (o.s + c.s) * 0.35 && (!best || o.y > best.y)) best = o;
  }
  return best;
}
function seatCrate(c) {
  c.below = crateBase(c);
  c.y = c.below ? c.below.y + c.below.s / 2 + c.s / 2 : heightAt(c.x, c.z) + c.s / 2; c.vy = 0;
  for (const o of crates) if (o.below === c && o.alive) seatCrate(o);   // 위에 얹힌 상자도
  cratesDirty = true;
}
function addCrate(x, z, rot, s, drum = false) {   // drum: 드럼통 (크기는 DRUM_S 하나)
  if (crates.length >= CRATE_MAX) return null;
  const c = { x, z, y: 0, s: drum ? DRUM_S : s, big: !drum && s >= 2, rot, alive: true, below: null, vy: 0 };
  if (drum) { c.drum = true; c.dc = Math.floor(Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5)) % DRUM_COLS.length; }   // 색은 자리로 정한다
  crates.push(c); seatCrate(c);
  return c;
}
function moveCrate(c, dx, dz, dr) {
  for (const o of crates) if (o === c || crateOn(c, o)) { o.x += dx; o.z += dz; }
  c.rot += dr;
  seatCrate(c);
}
function deleteCrate(c) {
  const i = crates.indexOf(c);
  if (i < 0) return;
  crates.splice(i, 1);
  for (const o of crates) if (o.below === c) seatCrate(o);   // 위에 있던 상자는 내려앉는다
  cratesDirty = true;
}
// 탱크 잔해 (placeWreck이 만든 것)
function deleteWreck(w) {
  if (!WRECKS.includes(w)) return;
  scene.remove(w.group);
  for (const d of w.decals) scene.remove(d);
  footprints.splice(footprints.indexOf(w.fp), 1);
  WRECKS.splice(WRECKS.indexOf(w), 1);
  try { for (let i = smokers.length - 1; i >= 0; i--) if (smokers[i].x === w.x && smokers[i].z === w.z) smokers.splice(i, 1); } catch (_) {}   // 연기 (로딩 중이면 아직 없다)
}
function moveWreck(w, dx, dz, dr) {
  const ox = w.x, oz = w.z, g = w.group;
  w.x += dx; w.z += dz; w.yaw += dr;
  g.position.set(w.x, heightAt(w.x, w.z) - 0.75, w.z); g.rotation.y = w.yaw; g.updateMatrixWorld(true);
  w.y = g.position.y + 2.4;
  Object.assign(w.fp, { x: w.x, z: w.z, c: Math.cos(w.yaw), s: Math.sin(w.yaw), y0: g.position.y, top: g.position.y + 3 });
  w.fp.box.setFromObject(g);
  for (const d of w.decals) scene.remove(d);   // 그을음은 지운다
  w.decals.length = 0;
  try { for (const s of smokers) if (s.x === ox && s.z === oz) { s.x = w.x; s.y = w.y; s.z = w.z; } } catch (_) {}
}

// ---------------------------------------------------------------- 벙커: 팔각(네모의 모서리를 깎은) 콘크리트 토치카. 지붕 둘레는 비스듬히 깎였다.
// 앞(+z)의 사격 구멍은 기관총이 위아래·좌우로 겨눌 수 있게 바깥으로 갈수록 넓어지는 나팔 모양 (뚫린 면은 어둡게). 아래쪽 벽에는 흐린 얼룩.
// 몸통은 땅속까지 이어져 비탈에도 놓을 수 있다. 부서지면 팔각 벽 아랫부분만 들쭉날쭉 남고 속이 드러난 잔해로 바뀌어 계속 연기가 난다 (잔해는 부서지지 않음)
const BK = Object.assign({ hp: 1000, armor: 0.8, gold: 30, sight: 28, angle: 50, turn: 70, alarm: 15, mg: { rate: 5, damage: 4 } }, CFG.bunker);
const BK_S = 1.1;                                          // 크기 배율 (아래 치수에 곱한다. 땅속 깊이는 그대로)
const BK_A = 2.6 * BK_S, BK_C = 1.0 * BK_S, BK_DEEP = 2.5;   // 반폭(정사각), 모서리 깎은 길이, 땅속 깊이
const BK_W = BK_A * 2, BK_D = BK_A * 2;                   // 폭·깊이
const BK_SLIT_Y = 3.45 * BK_S;                             // 사격 구멍(안쪽 벽) 가운데 높이 = 기관총 높이
const BK_HOLE = { z: BK_A - 1.3 * BK_S, w: 1.8 * BK_S, y0: 3.3 * BK_S, y1: 3.6 * BK_S, k: 0.21, s: 2.0 };   // 구멍 안쪽 벽 z·반폭·아래·위, 바깥으로 1m 갈 때 위아래로 벌어지는 양, 좌우로 벌어지는 양
const BK_BAND = 4.2 * BK_S, BK_H = 5.1 * BK_S, BK_ROOF_IN = 1.0 * BK_S;   // 지붕 경사가 시작하는 높이, 땅 위 전체 높이, 지붕 경사 안쪽 들어감
const BK_RUIN_H = 3.6 * BK_S;                              // 잔해 가장 높은 곳
const BK_GUN_Z = BK_HOLE.z + 0.15;                         // 기관총 자리 (구멍 안쪽 벽 바로 앞)
const BK_EYE_Z = BK_A / 2;                                 // 시야 기준점: 앞 테두리에서 안쪽으로 깊이의 1/4 (시야 판단·AI 표시 부채꼴)
// 팔각형 (x, z) 꼭짓점, 앞이 +z. 안쪽으로 d만큼 평행하게 줄인 팔각형도 (경사면이 평면이 되게)
const bkOct = (a, c) => [[a - c, a], [a, a - c], [a, c - a], [a - c, -a], [c - a, -a], [-a, c - a], [-a, a - c], [c - a, a]];
const bkOctIn = (a, c, d) => bkOct(a - d, c - d * (2 - Math.SQRT2));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const bkBox = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
// 벙커 벽 텍스처 (가로 2.5m, 세로 = 땅속 바닥~지붕). 땅에서부터 위로 옅게 번지는 그을음과, 위장 무늬 같은 큼직하고 흐릿한 얼룩.
// (전역 난수 순서를 건드리지 않게 자체 난수)
let _bkSeed = 7;
const bkRnd = () => ((_bkSeed = (_bkSeed * 16807) % 2147483647) - 1) / 2147483646;
const BK_TEX_H = 192, bkRow = (y) => (1 - (y + BK_DEEP) / (BK_H + BK_DEEP)) * BK_TEX_H;   // 높이(m) → 텍스처 줄
const bkWallTex = canvasTex(64, BK_TEX_H, (g) => {
  g.fillStyle = '#ebebe6'; g.fillRect(0, 0, 64, BK_TEX_H);
  for (let i = 0; i < 1600; i++) { const v = 180 + Math.floor(bkRnd() * 60); g.fillStyle = `rgba(${v},${v},${v - 8},.35)`; g.fillRect(Math.floor(bkRnd() * 64), Math.floor(bkRnd() * BK_TEX_H), 1 + Math.floor(bkRnd() * 3), 1); }
  // 땅에서 위로 부드럽게 옅어지는 그을음. 땅속 부분은 땅 높이의 진하기 그대로 끝까지 (비탈·절벽 가에서 드러나도 이어지게)
  const gr = g.createLinearGradient(0, bkRow(2.6), 0, bkRow(0));
  gr.addColorStop(0, 'rgba(70,66,54,0)'); gr.addColorStop(0.6, 'rgba(70,66,54,.12)'); gr.addColorStop(1, 'rgba(70,66,54,.3)');
  g.fillStyle = gr; g.fillRect(0, bkRow(2.6), 64, bkRow(0) - bkRow(2.6));
  g.fillStyle = 'rgba(70,66,54,.3)'; g.fillRect(0, bkRow(0), 64, BK_TEX_H - bkRow(0));
  // 얼룩: 가장자리가 흐린 덩어리 몇 개씩. 아래쪽일수록 많고 진하며, 위로 갈수록 드물고 옅다 (가로로 이어지게 좌우로 한 번 더)
  const blob = (x, y, r, a) => {
    for (const o of [-64, 0, 64]) {
      const rg = g.createRadialGradient(x + o, y, 0, x + o, y, r);
      rg.addColorStop(0, `rgba(74,70,58,${a})`); rg.addColorStop(0.6, `rgba(74,70,58,${a * 0.7})`); rg.addColorStop(1, 'rgba(74,70,58,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x + o, y, r, r * 0.8, 0, 0, 7); g.fill();
    }
  };
  for (let k = 0; k < 14; k++) {
    const h = 3.2 * Math.pow(bkRnd(), 1.3), x = bkRnd() * 64, y = bkRow(h), n = 2 + Math.floor(bkRnd() * 3), a = 0.22 * (1 - h / 3.6);
    for (let j = 0; j < n; j++) blob(x + (bkRnd() - 0.5) * 18, y + (bkRnd() - 0.5) * 12, 4 + bkRnd() * 6, a);
  }
  for (let k = 0; k < 10; k++) {   // 땅속 부분: 땅 높이와 같은 진하기로 고르게
    const x = bkRnd() * 64, y = bkRow(-BK_DEEP * bkRnd()), n = 2 + Math.floor(bkRnd() * 3);
    for (let j = 0; j < n; j++) blob(x + (bkRnd() - 0.5) * 18, y + (bkRnd() - 0.5) * 12, 4 + bkRnd() * 6, 0.22);
  }
}, true);
bkWallTex.wrapT = THREE.ClampToEdgeWrapping;
// 금 간 무늬 (벙커 체력에 따라 0~3단계). 단계가 오르면 앞 단계의 금에 더 그려진다 (단계마다 정해진 난수).
// 금마다 모양을 다르게: 구불구불한 금 / 꺾이며 뻗는 금 / 한 점에서 거미줄처럼 퍼지는 금, 휘는 정도·길이·갈라지는 정도도 제각각
function bkCracks(g, w, h, stage, y0, y1, seed, nMul = 1) {
  let sd = 1;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(((Math.floor(x) % w) + w) % w, Math.floor(y), 1, 1); };
  const DARK = 'rgba(58,55,48,.92)', DARK2 = 'rgba(58,55,48,.4)', LIGHT = 'rgba(255,252,240,.45)';
  const crack = (x, y, len, a, depth, st) => {   // st: { wob 휘는 정도, jag 꺾임 간격(0 = 안 꺾임), br 갈라질 확률 }
    for (let i = 0, seg = 0; i < len; i++) {
      px(x, y, DARK); if (depth < 2) px(x + 1, y, DARK2);   // 진한 줄 + 옆에 옅은 줄 (가지는 가늘게)
      if (rnd() < 0.5) px(x - 1, y + 1, LIGHT);           // 깨진 가장자리는 밝게
      if (st.jag && ++seg >= st.jag) { seg = Math.floor(rnd() * 2); a += (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7); }
      else a += (rnd() - 0.5) * st.wob;
      x += Math.cos(a); y += Math.sin(a);
      if (y < y0 || y > y1) break;
      if (depth < 2 && rnd() < st.br) crack(x, y, len * (0.25 + 0.45 * rnd()), a + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.8), depth + 1, st);
    }
  };
  const style = () => { const r = rnd(); return r < 0.4 ? { wob: 0.4 + rnd() * 0.9, jag: 0, br: 0.03 + rnd() * 0.08 } : { wob: 0.2, jag: 3 + Math.floor(rnd() * 5), br: 0.04 + rnd() * 0.1 }; };
  const N = [0, 2, 3, 4.5], L = [0, 24, 30, 39];   // 단계별로 더하는 금 수(64×64칸마다), 길이(픽셀)
  const area = w * (y1 - y0) / (64 * 64) * nMul;
  for (let s = 1; s <= stage; s++) {
    sd = seed + s * 7919;
    for (let k = 0, n = Math.round(N[s] * area); k < n; k++) {
      const x = rnd() * w, y = y0 + rnd() * (y1 - y0), len = L[s] * (0.4 + rnd() * 1.0);
      if (s >= 2 && rnd() < 0.25) {   // 거미줄: 한 점에서 3~5갈래
        const m = 3 + Math.floor(rnd() * 3), a0 = rnd() * 6.283;
        for (let j = 0; j < m; j++) crack(x, y, len * (0.35 + rnd() * 0.4), a0 + j / m * 6.283 + (rnd() - 0.5) * 0.8, 1, style());
      } else crack(x, y, len, rnd() * 6.283, 0, style());
    }
    if (s === 3) for (let k = 0, n = Math.round(7 * area); k < n; k++) {   // 떨어져 나간 조각 (크기 제각각)
      const cw = 2 + Math.floor(rnd() * 4), ch = 2 + Math.floor(rnd() * 3), x = Math.floor(rnd() * (w - cw)), y = Math.floor(y0 + rnd() * (y1 - y0 - ch));
      g.fillStyle = 'rgba(80,77,70,.7)'; g.fillRect(x, y, cw, ch);
      px(x - 1, y - 1, LIGHT); px(x + cw, y - 1, LIGHT);
    }
  }
}
// 볼록 다각형 자르기: 평면 { n, d }의 n·p <= d 쪽만 남긴다
const bkPl = (n, d) => ({ n, d });
const bkFlip = (p) => ({ n: p.n.clone().negate(), d: -p.d });
function bkClip(poly, pl) {
  const out = [], E = 1e-6;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], fp = pl.n.dot(p) - pl.d, fq = pl.n.dot(q) - pl.d;
    if (fp <= E) out.push(p);
    if ((fp > E) !== (fq > E)) out.push(p.clone().lerp(q, fp / (fp - fq)));
  }
  return out;
}
const _bkU = new THREE.Vector3(), _bkV = new THREE.Vector3();
function bkPlaneQuad(pl) {   // 그 평면 위의 아주 큰 사각형 (다른 평면들로 잘라 면을 얻는다)
  const c = pl.n.clone().multiplyScalar(pl.d / pl.n.lengthSq());
  _bkU.crossVectors(pl.n, Math.abs(pl.n.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize().multiplyScalar(40);
  _bkV.crossVectors(pl.n, _bkU).normalize().multiplyScalar(40);
  return [c.clone().add(_bkU).add(_bkV), c.clone().sub(_bkU).add(_bkV), c.clone().sub(_bkU).sub(_bkV), c.clone().add(_bkU).sub(_bkV)];
}
const bkArea = (f) => { if (f.length < 3) return 0; const s = V3(0, 0, 0); for (let i = 1; i < f.length - 1; i++) s.add(V3(0, 0, 0).subVectors(f[i], f[0]).cross(V3(0, 0, 0).subVectors(f[i + 1], f[0]))); return s.length() / 2; };
// 면(꼭짓점 목록)을 재질별로 모아 평평한 면 기하로. hint = 바깥 방향 (면 방향을 맞춘다).
// uv: 위를 보는 면은 바닥 평면 투영, 벽은 가로(2.5m 반복) × 높이(땅속 바닥~지붕 = 0~1, 벽 텍스처용)
function bkBuilder() {
  const faces = new Map(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const face = (mat, pts, hint) => {
    pts = pts.filter((p, i) => p.distanceToSquared(pts[(i + 1) % pts.length]) > 1e-8);   // 겹친 점 지우기 (잘라 낸 자리에 생긴다)
    if (bkArea(pts) < 1e-4) return;
    _a.set(0, 0, 0);   // 다각형 전체 법선 (앞 세 점이 한 줄이어도 맞게)
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; _a.x += (p.y - q.y) * (p.z + q.z); _a.y += (p.z - q.z) * (p.x + q.x); _a.z += (p.x - q.x) * (p.y + q.y); }
    if (_a.dot(hint) < 0) pts.reverse();
    if (!faces.has(mat)) faces.set(mat, []);
    faces.get(mat).push({ pts, n: hint.clone().normalize() });
  };
  const build = () => {
    const g = new THREE.Group();
    for (const [mat, fs] of faces) {
      const P = [], U = [];
      for (const { pts: f, n } of fs) {
        const up = Math.abs(n.y) > 0.5, useZ = Math.abs(n.x) > Math.abs(n.z);
        const off = Math.atan2(n.x, n.z) * 1.37;   // 벽마다 가로로 밀어 둔다 (마주 보는 벽에 같은 무늬가 되풀이되지 않게)
        const uv = (p) => up ? [p.x / 2.5, p.z / 2.5] : [(useZ ? p.z : p.x) / 2.5 + off, (p.y + BK_DEEP) / (BK_H + BK_DEEP)];
        for (let i = 1; i < f.length - 1; i++) for (const p of [f[0], f[i], f[i + 1]]) { P.push(p.x, p.y, p.z); U.push(...uv(p)); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
    }
    return g;
  };
  return { face, build };
}
// 멀쩡한 벙커: 몸통(볼록: 팔각기둥 + 지붕 뿔대)을 평면들로 만들고, 사격 구멍(볼록: 나팔 모양)을 빼낸다
const BK_WALL_MAT = lambert({ color: 0x8c8a82, map: bkWallTex }), BK_ROOF_MAT = lambert({ color: 0x8c8a82, map: plateTex });
const BK_CRACK_MATS = [[BK_WALL_MAT, BK_ROOF_MAT]];   // [단계][0 = 벽, 1 = 지붕]
for (let s = 1; s <= 3; s++) {   // 금 텍스처는 바탕을 2×(지붕 2×2) 붙인 넓은 판에 그리고 반만큼 늘려 붙인다 → 금 무늬는 5m마다 되풀이
  const wt = canvasTex(128, BK_TEX_H, (g) => { g.drawImage(bkWallTex.image, 0, 0); g.drawImage(bkWallTex.image, 64, 0); bkCracks(g, 128, BK_TEX_H, s, bkRow(BK_H), bkRow(0.15), 101); }, true);
  wt.wrapT = THREE.ClampToEdgeWrapping; wt.repeat.set(0.5, 1);
  const rfT = canvasTex(128, 128, (g) => { for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) g.drawImage(plateTex.image, x, y); bkCracks(g, 128, 128, s, 0, 128, 202, 0.6); }, true);
  rfT.repeat.set(0.5, 0.5);
  BK_CRACK_MATS.push([lambert({ color: 0x8c8a82, map: wt }), lambert({ color: 0x8c8a82, map: rfT })]);
}
const bunkerModel = (() => {
  const wall = BK_WALL_MAT, roof = BK_ROOF_MAT;
  const hole = lambert({ color: 0x62615b, map: plateTex }), back = lambert({ color: 0x0e0e0c });
  const oct = bkOct(BK_A, BK_C), inn = bkOctIn(BK_A, BK_C, BK_ROOF_IN), body = [];
  for (let i = 0; i < 8; i++) {
    const p = oct[i], q = oct[(i + 1) % 8], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    const n = V3(q[1] - p[1], 0, -(q[0] - p[0])); if (n.x * mx + n.z * mz < 0) n.negate();
    body.push(bkPl(n, n.x * p[0] + n.z * p[1]));   // 옆면
    const P1 = V3(p[0], BK_BAND, p[1]), Q1 = V3(q[0], BK_BAND, q[1]), R = V3(inn[i][0], BK_H, inn[i][1]);
    const rn = V3(0, 0, 0).subVectors(Q1, P1).cross(V3(0, 0, 0).subVectors(R, P1)); if (rn.x * mx + rn.y + rn.z * mz < 0) rn.negate();
    body.push(bkPl(rn, rn.dot(P1)));               // 지붕 경사
  }
  body.push(bkPl(V3(0, 1, 0), BK_H), bkPl(V3(0, -1, 0), BK_DEEP));
  const h = BK_HOLE, cut = [
    bkPl(V3(0, 0, -1), -h.z),                        // 안쪽 벽
    bkPl(V3(0, 1, -h.k), h.y1 - h.k * h.z),          // 천장 (바깥으로 갈수록 높아진다)
    bkPl(V3(0, -1, -h.k), -(h.y0 + h.k * h.z)),      // 바닥 (바깥으로 갈수록 낮아진다)
    bkPl(V3(1, 0, -h.s), h.w - h.s * h.z),           // 오른쪽 (바깥으로 갈수록 넓어진다)
    bkPl(V3(-1, 0, -h.s), h.w - h.s * h.z)];         // 왼쪽
  const B = bkBuilder();
  for (const pl of body) {   // 몸통 면 = 그 평면 ∩ 다른 몸통 평면들, 구멍 부분은 빼고
    let f = bkPlaneQuad(pl);
    for (const o of body) if (o !== pl) f = bkClip(f, o);
    const mat = pl.n.y / pl.n.length() > 0.5 ? roof : wall;
    for (const c of cut) {   // 볼록 구멍 빼기: 각 구멍 평면의 바깥쪽 조각은 남기고, 안쪽으로 계속
      if (f.length < 3) break;
      B.face(mat, bkClip(f, bkFlip(c)), pl.n);
      f = bkClip(f, c);
    }
  }
  for (const c of cut) {     // 구멍 안쪽 면 = 그 평면 ∩ 다른 구멍 평면들 ∩ 몸통 (어둡게, 안쪽 벽은 더 어둡게)
    let f = bkPlaneQuad(c);
    for (const o of cut) if (o !== c) f = bkClip(f, o);
    for (const o of body) f = bkClip(f, o);
    B.face(c === cut[0] ? back : hole, f, c.n.clone().negate());
  }
  return bake(B.build());
})();
// 부서진 벙커: 같은 팔각 벽이 아랫부분만 남고 위가 들쭉날쭉 깨졌다 (앞이 더 많이 날아감). 속은 어둡게
const bunkerRuinModel = (() => {
  const con = lambert({ color: 0x6e6c66, map: bkWallTex }), soot = lambert({ color: 0x4e4c48, map: bkWallTex }), inside = lambert({ color: 0x252422, map: plateTex });
  const top = lambert({ color: 0x5c5a55, map: plateTex }), rub = lambert({ color: 0x6e6c66, map: plateTex }), rubS = lambert({ color: 0x4e4c48, map: plateTex });
  const S = BK_S, B = bkBuilder(), T = 0.5 * S, FLOOR = 0.5 * S;   // 크기 배율, 벽 두께, 안쪽 바닥 높이
  const out = bkOct(BK_A, BK_C), inn = bkOctIn(BK_A, BK_C, T);
  const hv = [2.2, 3.0, 3.4, 2.6, 3.1, 2.4, 1.6, 1.9].map((v) => v * S), hm = [1.5, 2.6, 2.9, 3.6, 2.2, 3.3, 1.9, 1.3].map((v) => v * S);   // 꼭짓점·변 가운데의 남은 높이 (변 7 = 앞)
  const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, hs = [hv[i], hm[i], hv[j]], ts = [0, 0.5, 1];
    const sootSide = i === 7 || i === 0 || i === 6;   // 앞쪽 바깥 벽은 그을렸다
    const nrm = V3((out[i][0] + out[j][0]) / 2, 0, (out[i][1] + out[j][1]) / 2);
    for (let k = 0; k < 2; k++) {
      const o0 = lerp2(out[i], out[j], ts[k]), o1 = lerp2(out[i], out[j], ts[k + 1]);
      const n0 = lerp2(inn[i], inn[j], ts[k]), n1 = lerp2(inn[i], inn[j], ts[k + 1]), h0 = hs[k], h1 = hs[k + 1];
      B.face(sootSide ? soot : con, [V3(o0[0], -BK_DEEP, o0[1]), V3(o1[0], -BK_DEEP, o1[1]), V3(o1[0], h1, o1[1]), V3(o0[0], h0, o0[1])], nrm);       // 바깥 벽
      B.face(inside, [V3(n0[0], FLOOR, n0[1]), V3(n1[0], FLOOR, n1[1]), V3(n1[0], h1, n1[1]), V3(n0[0], h0, n0[1])], nrm.clone().negate());            // 안쪽 벽 (어둡게)
      B.face(top, [V3(o0[0], h0, o0[1]), V3(o1[0], h1, o1[1]), V3(n1[0], h1, n1[1]), V3(n0[0], h0, n0[1])], V3(0, 1, 0));                              // 깨진 윗면
    }
  }
  B.face(inside, inn.map((p) => V3(p[0], FLOOR, p[1])), V3(0, 1, 0));   // 안쪽 바닥
  const g = B.build(), add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  const slab = add(bkBox(1.4 * S, 0.45 * S, 1.2 * S, lambert({ color: 0x3a3835, map: plateTex })), -1.15 * S, 1.05 * S, -1.15 * S); slab.rotation.set(0.45, 0.8, 0.35);   // 무너진 지붕 조각 (뒤쪽 벽에 기대 두어 가운데 불빛이 보이게)
  for (const [x, y, z, s, r] of [[-1.3, FLOOR, 0.9, 0.7, 0.4], [0.3, FLOOR, 1.6, 0.5, 1.1], [1.4, FLOOR, 1.0, 0.6, 0.7], [1.2, FLOOR, -1.3, 0.55, 2.0],   // 안쪽 덩어리
    [0.8, 0, 3.3, 0.6, 0.3], [-1.6, 0, 3.0, 0.5, 1.4], [2.0, 0, 2.8, 0.45, 2.5], [-3.1, 0, 1.2, 0.5, 0.9], [3.0, 0, -0.8, 0.4, 1.7]])   // 바깥 (앞에 많이)
    add(bkBox(s * S, s * 0.6 * S, s * 0.8 * S, r > 1 ? rubS : rub), x * S, (y + s * 0.3) * S, z * S).rotation.set(r * 0.3, r, r * 0.2);
  return bake(g);
})();
// 부서진 벙커는 탱크 잔해처럼 계속 불·연기 (smokers는 30_combat.js에 있어 로딩 중에는 아직 없다 → 거기서 다시 부른다)
function bunkerSmoke(B) {
  try {
    if (B.ruin && !B.smk) { const s = { x: B.x, y: B.y, z: B.z, t: 10, dur: Infinity, acc: 0, weak: true }; smokers.push(s); B.smk = s; }   // (넣은 뒤에 표시: 로딩 중엔 push가 실패하니 표시도 안 남는다)
    if (B.smk) { B.smk.x = B.x; B.smk.y = B.y + 0.4; B.smk.z = B.z; }
  } catch (_) {}
}
const bunkerGunMat = lambert({ color: 0x2a2a26 });
// 지붕 위 사이렌: 어두운 받침 + 빨간 덮개. 경보가 켜지면 덮개가 빛나고, 빨간 빛줄기 두 개(가산 블렌딩 원뿔)가 빙빙 돌며
// 빛줄기 쪽으로 효과용 점광원 하나가 따라 돈다 (30_combat.js updateLights. 새 광원을 만들지 않는다)
const SIREN_BASE = new THREE.CylinderGeometry(0.2, 0.25, 0.16, 8);
const SIREN_DOME = new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.4, 1);
const SIREN_BEAM = (() => {   // +x로 뻗는 원뿔 (멀수록 넓게 퍼지고 투명해진다), 조금 아래로 기울어 땅을 쓸고 지나간다
  const L = 9.6, g = new THREE.CylinderGeometry(L * Math.tan(15 * DEG), 0.1, L, 8, 1, true).rotateZ(-Math.PI / 2).translate(L / 2, 0, 0).rotateZ(-0.1);   // 길이 9.6m, 퍼지는 각 30°
  const p = g.attributes.position, c = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { const a = Math.max(0, 1 - p.getX(i) / L); c.set([1, 1, 1, a * a], i * 4); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  return g;
})();
const sirenBaseMat = lambert({ color: 0x2a2a26 });
const sirenBeamMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.3, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
// 금 간 단계: 체력 100% = 0 (깨끗), 100% 미만 = 1, 70% 미만 = 2, 30% 미만 = 3. 바뀔 때만 벽·지붕 재질을 그 단계 것으로 바꿔 끼운다
const bkCrackStage = (B) => B.hp >= BK.hp ? 0 : B.hp >= BK.hp * 0.7 ? 1 : B.hp >= BK.hp * 0.3 ? 2 : 3;
const bkBaseMat = new WeakMap();
function bunkerCrack(B) {
  if (B.ruin) return;
  const s = bkCrackStage(B);
  if (B.crack === s) return;
  B.crack = s;
  B.group.traverse((o) => {
    if (!o.isMesh) return;
    if (!bkBaseMat.has(o)) bkBaseMat.set(o, o.material);
    const i = [BK_WALL_MAT, BK_ROOF_MAT].indexOf(bkBaseMat.get(o));
    if (i >= 0) o.material = BK_CRACK_MATS[s][i];
  });
}
const BUNKERS = [];
function placeBunker(x, z, rot, ruin = false) {
  const B = { x, z, rot, ruin, ruinAtStart: ruin, hp: ruin ? 0 : BK.hp, y: 0, group: null, gun: null, tip: null, fp: null, gunYaw: 0, cool: 0, seeT: 0, sees: false, want: 0 };
  BUNKERS.push(B);
  bunkerMesh(B);
  return B;
}
// 모델(멀쩡한/부서진)을 지금 자리·방향으로 다시 놓고, 충돌 상자도 맞춘다
function bunkerMesh(B) {
  if (B.group) scene.remove(B.group);
  const g = markOutline((B.ruin ? bunkerRuinModel : bunkerModel).clone());
  B.gun = B.tip = null;
  if (!B.ruin) {   // 기관총: 사격 구멍 안에서 좌우로 돈다
    const gun = new THREE.Group(); gun.position.set(0, BK_SLIT_Y, BK_GUN_Z);
    gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.6), bunkerGunMat));
    gun.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6).rotateX(Math.PI / 2).translate(0, 0.02, 0.7), bunkerGunMat));
    const tip = new THREE.Object3D(); tip.position.set(0, 0.02, 1.2); gun.add(tip);
    g.add(gun); B.gun = gun; B.tip = tip; gun.rotation.y = B.gunYaw;
    const siren = new THREE.Group(); siren.position.set(0, BK_H, -BK_A * 0.25);   // 지붕 위 (가운데에서 조금 뒤)
    const sb = new THREE.Mesh(SIREN_BASE, sirenBaseMat); sb.position.y = 0.08; siren.add(sb);
    B.sirenMat = lambert({ color: 0x8a1810, emissive: 0x1a0000 });   // 벙커마다 (경보 때 이 벙커 것만 빛나게)
    const sd = new THREE.Mesh(SIREN_DOME, B.sirenMat); sd.position.y = 0.16; siren.add(sd);
    const beams = new THREE.Group(); beams.position.y = 0.32; beams.visible = false;
    for (const r of [0, Math.PI]) { const m = new THREE.Mesh(SIREN_BEAM, sirenBeamMat); m.rotation.y = r; m.userData.noOutline = true; m.frustumCulled = false; beams.add(m); }
    siren.add(beams);
    markOutline(siren); g.add(siren); B.siren = siren; B.beams = beams;
  } else { B.siren = B.beams = B.sirenMat = null; }
  B.group = g; g.userData.bunker = B; B.crack = -1;
  scene.add(g);
  bunkerCrack(B);
  bunkerPlace(B);
}
function bunkerPlace(B) {
  const g = B.group;
  B.y = heightAt(B.x, B.z);
  g.position.set(B.x, B.y, B.z); g.rotation.y = B.rot; g.updateMatrixWorld(true);
  if (!B.fp) { B.fp = { bunker: B, noCrates: true }; footprints.push(B.fp); }
  Object.assign(B.fp, { x: B.x, z: B.z, hx: BK_A + 0.3, hz: BK_A + 0.3, c: Math.cos(B.rot), s: Math.sin(B.rot), y0: B.y - 1, top: B.y + (B.ruin ? BK_RUIN_H : BK_H), group: g, box: new THREE.Box3().setFromObject(g) });
  bunkerSmoke(B);
}
function moveBunker(B, dx, dz, dr) { B.x += dx; B.z += dz; B.rot += dr; bunkerPlace(B); }
function deleteBunker(B) {
  if (!BUNKERS.includes(B)) return;
  scene.remove(B.group);
  if (B.smk) smokers.splice(smokers.indexOf(B.smk), 1);
  footprints.splice(footprints.indexOf(B.fp), 1);
  BUNKERS.splice(BUNKERS.indexOf(B), 1);
}

// ---------------------------------------------------------------- 모래주머니: 살짝 ) 모양으로 굽게 3단(5·4·3개) 쌓았다. 앞(+z)으로 볼록. 폭 약 5.5m, 높이 약 1.4m
// 자리마다 가방 하나하나를 땅 높이에 앉혀 메시 하나로 만든다 (가방 = 아래가 넓고 위가 좁은 육면체, 바닥면 없이 삼각형 10개 → 12개에 120개, 그리기 1번). 부서지지 않는 낮은 벽
const SB_R = 3.2 * 1.5, SB_L = 0.78 * 1.5, SB_W = 0.44 * 1.5, SB_H = 0.48, SB_ROWS = [5, 4, 3];   // 굽은 반지름, 가방 길이·폭·높이, 단마다 개수 (풀 위에서도 보이게 크게: 가로 1.5배, 높이 2배)
const sackTex = canvasTex(32, 32, (g) => {   // 불규칙한 점 무늬 (자루 얼룩·흙)
  g.fillStyle = '#d8d0b8'; g.fillRect(0, 0, 32, 32);
  let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(r() * 32), y = Math.floor(r() * 32), w = r() < 0.25 ? 2 : 1, h = r() < 0.2 ? 2 : 1, k = r();
    g.fillStyle = k < 0.55 ? `rgba(90,78,56,${0.18 + r() * 0.25})` : k < 0.8 ? `rgba(255,250,235,${0.12 + r() * 0.18})` : `rgba(60,52,38,${0.3 + r() * 0.25})`;
    g.fillRect(x, y, w, h);
  }
}, true);
const sackMat = lambert({ color: 0xffffff, map: sackTex, vertexColors: true });
const SANDBAGS = [];
const sbHash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function sandbagGeo(S) {
  const P = [], U = [], C = [], c = Math.cos(S.rot), s = Math.sin(S.rot);
  const tri = (a, b, d, ctr) => {   // 바깥을 보게 돌려서 넣는다
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const m = new THREE.Vector3().add(a).add(b).add(d).divideScalar(3).sub(ctr);
    for (const p of n.dot(m) < 0 ? [a, d, b] : [a, b, d]) { P.push(p.x, p.y, p.z); U.push(p.u, p.v); }
  };
  SB_ROWS.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const h = sbHash(r * 7 + i, S.x * 0.1 + S.z * 0.13), th = (i - (n - 1) / 2) * (SB_L * 0.97 / SB_R) + (h - 0.5) * 0.06;
      const lx = Math.sin(th) * SB_R, lz = Math.cos(th) * SB_R - SB_R + (h - 0.5) * 0.06;
      const wx = S.x + lx * c + lz * s, wz = S.z - lx * s + lz * c;
      const y0 = heightAt(wx, wz) - S.y - 0.04 + r * SB_H * 0.9, y1 = y0 + SB_H * (0.9 + h * 0.2);   // 그 자리 땅 위에, 단마다 한 가방 높이씩 위로
      const yaw = th + (h - 0.5) * 0.12, tx = Math.cos(yaw), tz = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);   // 가방 길이 방향 · 바깥 방향
      const L = SB_L * (0.93 + h * 0.1) / 2, W = SB_W / 2;
      const ou = h * 7.3, ov = sbHash(i * 3 + r, h) * 5.1;   // 가방마다 무늬 자리를 밀어 둔다
      const V = (a, b, y, u, v) => { const p = new THREE.Vector3(lx + tx * a + nx * b, y, lz + tz * a + nz * b); p.u = u * 0.7 + ou; p.v = v * 0.5 + ov; return p; };
      const b0 = V(-L, -W, y0, 0, 0), b1 = V(L, -W, y0, 1, 0), b2 = V(L, W, y0, 1, 0), b3 = V(-L, W, y0, 0, 0);
      const t0 = V(-L * 0.84, -W * 0.68, y1, 0.08, 1), t1 = V(L * 0.84, -W * 0.68, y1, 0.92, 1), t2 = V(L * 0.84, W * 0.68, y1, 0.92, 1), t3 = V(-L * 0.84, W * 0.68, y1, 0.08, 1);
      const ctr = new THREE.Vector3(lx, (y0 + y1) / 2, lz);
      tri(t0, t1, t2, ctr); tri(t0, t2, t3, ctr);   // 위
      for (const [a, b, d, e] of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2], [b3, b0, t0, t3]]) { tri(a, b, d, ctr); tri(a, d, e, ctr); }   // 옆
      const k = 0.82 + h * 0.22;   // 가방마다 조금씩 다른 색
      for (let j = 0; j < 30; j++) C.push(0.66 * k, 0.6 * k, 0.44 * k);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeVertexNormals();
  return geo;
}
function sandbagMesh(S) {   // 지금 자리·방향으로 다시 만들고 충돌 상자도 맞춘다
  S.y = heightAt(S.x, S.z);
  if (!S.group) { S.group = new THREE.Group(); S.group.userData.sandbag = S; scene.add(S.group); }
  const g = S.group;
  for (const m of g.children.slice()) { m.geometry.dispose(); g.remove(m); }
  g.add(markOutline(new THREE.Mesh(sandbagGeo(S), sackMat)));
  g.position.set(S.x, S.y, S.z); g.rotation.y = S.rot; g.updateMatrixWorld(true);
  const th = (SB_ROWS[0] - 1) / 2 * (SB_L * 0.97 / SB_R), sag = SB_R * (1 - Math.cos(th)), cz = -sag / 2;   // 굽은 만큼 가운데를 뒤로
  if (!S.fp) { S.fp = { sandbag: S, noCrates: true }; footprints.push(S.fp); }
  Object.assign(S.fp, { x: S.x + cz * Math.sin(S.rot), z: S.z + cz * Math.cos(S.rot), hx: SB_R * Math.sin(th) + SB_L / 2, hz: sag / 2 + SB_W / 2 + 0.05, c: Math.cos(S.rot), s: Math.sin(S.rot),
    y0: S.y - 0.5, top: S.y + SB_ROWS.length * SB_H * 0.95, group: g, box: new THREE.Box3().setFromObject(g) });
}
function placeSandbag(x, z, rot) { const S = { x, z, rot, y: 0, group: null, fp: null, hp: null, ram: false }; SANDBAGS.push(S); sandbagMesh(S); return S; }
// 나무 상자처럼 쉽게 부서진다: 포탄·폭발 (체력 = 나무 상자 체력), 탱크가 닿으면 (막지 않고 지나가며 부순다)
const SAND_COLS = [0xb0a07a, 0x8c7c58, 0xc8b88e, 0x6a5c40].map((h) => new THREE.Color(h));
function damageSandbag(S, d) {
  if (!SANDBAGS.includes(S)) return;
  S.hp = (S.hp ?? CFG.box.crateHp) - boxDmg(d);
  if (S.hp <= 0) breakSandbag(S);
}
function breakSandbag(S) {
  if (!SANDBAGS.includes(S)) return;
  const c = new THREE.Vector3(S.fp.x, S.y + 0.6, S.fp.z), ax = Math.cos(S.rot), az = -Math.sin(S.rot);   // ax/az: 벽 길이 방향
  for (let k = -2; k <= 2; k++) {   // 벽을 따라 흙먼지와 자루 조각
    const p = c.clone().add(new THREE.Vector3(ax * k * 1.1, 0, az * k * 1.1));
    spawnShards(p, 6, SAND_COLS, 2, 9, null, 0.1, 0.26, 0.5);
    spawnShards(p, 8, SAND_COLS, 3, 12, null, 0.03, 0.07, 0.5);
    for (let j = 0; j < 4; j++) smokeP.spawn(p.x + rr(-0.6, 0.6), p.y + rr(-0.3, 0.4), p.z + rr(-0.6, 0.6), rr(-1.2, 1.2), rr(0.4, 1.6), rr(-1.2, 1.2), rr(0.9, 1.6), [0.62, 0.56, 0.42, 0.6], [0.5, 0.46, 0.38, 0], 0.5, 1.8, 0, 2, 0.4);
  }
  sfx.crack(c);
  deleteSandbag(S);
}
function ramSandbags() { for (const S of SANDBAGS.slice()) if (S.ram) breakSandbag(S); }
function moveSandbag(S, dx, dz, dr) { S.x += dx; S.z += dz; S.rot += dr; sandbagMesh(S); }
function deleteSandbag(S) {
  if (!SANDBAGS.includes(S)) return;
  for (const m of S.group.children) m.geometry.dispose();
  scene.remove(S.group);
  footprints.splice(footprints.indexOf(S.fp), 1);
  SANDBAGS.splice(SANDBAGS.indexOf(S), 1);
}

for (let n = 1; n < (CFG.box.repairCount ?? 1); n++) placeRepair(6);   // 나머지 수리 보급품

// ---------------------------------------------------------------- 지도 데이터 (map.js의 window.MAP_DATA): 있으면 나무 상자·탱크 잔해·벙커는 이 목록대로 놓는다.
// (자동 배치는 뒤의 다른 배치가 바뀌지 않게 난수 순서대로 그대로 돌린 뒤, 상자·잔해만 지우고 목록으로 바꾼다)
const MAP_OBJ = window.MAP_DATA && Array.isArray(window.MAP_DATA.objects) ? window.MAP_DATA.objects : null;
if (MAP_OBJ) {
  crates.length = 0;
  for (const w of WRECKS.slice()) deleteWreck(w);
  for (const o of MAP_OBJ) {
    if (o.type === 'crate') addCrate(o.x, o.z, o.rot || 0, o.s || 1.5);
    else if (o.type === 'drum') addCrate(o.x, o.z, o.rot || 0, DRUM_S, true);
    else if (o.type === 'sandbag') placeSandbag(o.x, o.z, o.rot || 0);
    else if (o.type === 'wreck') placeWreck(o.x, o.z, o.rot || 0);
    else if (o.type === 'bunker' || o.type === 'bunkerRuin') placeBunker(o.x, o.z, o.rot || 0, o.type === 'bunkerRuin');
  }
  writeCrates();
}

await loadStep(0.8, 'PLANTING GRASS...');
