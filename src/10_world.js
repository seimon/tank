// ---------------------------------------------------------------- 지형
const HILLS = [
  { x: -46, z: -45, a: 8, r: 13 }, { x: 50, z: 50, a: 9.5, r: 15 }, { x: 54, z: -42, a: 6, r: 10 },
  { x: -54, z: 50, a: 7, r: 14 }, { x: -14, z: 62, a: 4.5, r: 9 }, { x: 21, z: -63, a: 5, r: 10 },
  { x: -60, z: -5, a: 4, r: 9 }, { x: 30, z: -20, a: 3, r: 8 },
  { x: 55, z: 6, a: 6, r: 8 },     // 둥근 언덕
];
function baseH(x, z) {
  let h = 4;
  h += 2.8 * Math.sin(x * 0.03 + 1.3) * Math.cos(z * 0.033 - 0.7);
  h += 1.3 * Math.sin(x * 0.075 + z * 0.05 + 2.1);
  h += 0.5 * Math.sin(x * 0.2 - z * 0.17 + 0.4);
  for (const k of HILLS) h += k.a * Math.exp(-((x - k.x) ** 2 + (z - k.z) ** 2) / (2 * k.r * k.r));
  return h;
}
const TOWN_H = baseH(0, 0);
// 마을 주변은 평평하게
const preH = (x, z) => lerp(TOWN_H, baseH(x, z), smooth(24, 36, Math.hypot(x, z)));
// 마을 영향 (1=마을 한가운데). 경계를 노이즈로 흔들어 정확한 원이 보이지 않게
function townAt(x, z) {
  const n = Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.17 + 0.4) * 0.6 + Math.sin(x * 0.47 - z * 0.39 + 2.0) * 0.4;
  return 1 - smooth(14, 30, Math.hypot(x, z) + n * 7);
}

// S자 본도로: 마을 구간(|z|<14)은 곧게, 바깥은 휘어지며 약간 울퉁불퉁
function mainRoadX0(z) {
  const a = Math.abs(z);
  const s = Math.sign(z) * smooth(14, 60, a);
  const j = (2.2 * Math.sin(z * 0.17 + 0.5) + 1.1 * Math.sin(z * 0.41 + 1.7) + 0.5 * Math.sin(z * 0.93 + 0.2)) * smooth(16, 26, a);
  return 33 * s + j;
}
// 다리 자리 = 원래 도로가 시냇물과 만나는 곳. 그 앞뒤로 도로를 시냇물과 수직이 되게 펴서 다리가 똑바로 건넌다
const creekZ = (x) => 33 + 3.5 * Math.sin(x * 0.055 + 0.8) + 1.8 * Math.sin(x * 0.13 + 2.3) + 0.7 * Math.sin(x * 0.31);
let XB_Z = 33;
for (let k = 0; k < 40; k++) XB_Z = creekZ(mainRoadX0(XB_Z));
const XB_X = mainRoadX0(XB_Z), XB_SLOPE = -(creekZ(XB_X + 0.5) - creekZ(XB_X - 0.5));
function mainRoadX(z) {
  return lerp(mainRoadX0(z), XB_X + (z - XB_Z) * XB_SLOPE, 1 - smooth(6, 20, Math.abs(z - XB_Z)));
}
// 마을 중앙에서 서쪽으로 T자 갈림길
function branchZ(x) {
  const a = Math.abs(x);
  return (4.5 * Math.sin(a * 0.05) + 1.6 * Math.sin(a * 0.23 + 1.1) + 0.6 * Math.sin(a * 0.6)) * smooth(8, 20, a);
}
// 마을 북쪽을 서→동으로 가로지르는 시냇물 (creekZ는 위에)
const mainPoly = [], branchPoly = [], creekPoly = [];
for (let z = -HALF - 4; z <= HALF + 4; z += 0.75) mainPoly.push({ x: mainRoadX(z), z });
for (let x = 0; x >= -HALF - 4; x -= 0.75) branchPoly.push({ x, z: branchZ(x) });
for (let x = -HALF - 4; x <= HALF + 4; x += 0.75) creekPoly.push({ x, z: creekZ(x) });

// 길 방향으로 높이를 부드럽게
function smoothHeights(poly, passes, win) {
  let ys = poly.map(p => preH(p.x, p.z));
  for (let pass = 0; pass < passes; pass++) {
    ys = ys.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < ys.length) { s += ys[j]; c++; } }
      return s / c;
    });
  }
  poly.forEach((p, i) => p.y = ys[i]);
}
smoothHeights(mainPoly, 4, 6); smoothHeights(branchPoly, 4, 6); smoothHeights(creekPoly, 8, 10);
// 물은 지면보다 1m쯤 아래로, 높은 쪽에서 낮은 쪽으로만 흐르게
{
  const c = creekPoly, down = c[0].y > c[c.length - 1].y;
  const order = down ? c : [...c].reverse();
  order[0].y -= 1.1;
  for (let i = 1; i < order.length; i++) order[i].y = Math.min(order[i].y - 1.1, order[i - 1].y - 0.004);
  // 반폭: 상류 쪽으로 갈수록 넓어져 끝에서 2배, 군데군데 불규칙하게 넓었다 좁았다. 다리 근처는 원래 폭
  CREEK_UP = down ? -1 : 1;
  const span = HALF - CREEK_UP * XB_X;
  for (const p of c) {
    const far = smooth(4, 14, Math.abs(p.x - XB_X));
    const wob = 1 + (0.22 * Math.sin(p.x * 0.19 + 0.7) + 0.12 * Math.sin(p.x * 0.53 + 2.1)) * far;
    p.w = CREEK_HW * (1 + 3 * smooth(4, span, (p.x - XB_X) * CREEK_UP)) * wob;
  }
  // 물길을 따라 잰 거리 (물결 무늬가 흐르는 방향)
  c.forEach((p, i) => { p.s = i ? c[i - 1].s + Math.hypot(p.x - c[i - 1].x, p.z - c[i - 1].z) : 0; });
}
// 본도로와 시냇물이 만나는 곳 = 다리. 물은 다리 밑으로 충분히 낮게
let ci = 0;
creekPoly.forEach((p, i) => { if (Math.hypot(p.x - XB_X, p.z - XB_Z) < Math.hypot(creekPoly[ci].x - XB_X, creekPoly[ci].z - XB_Z)) ci = i; });
const BRIDGE = { x: XB_X, z: XB_Z };
{
  const rp = mainPoly.reduce((m, p) => Math.hypot(p.x - BRIDGE.x, p.z - BRIDGE.z) < Math.hypot(m.x - BRIDGE.x, m.z - BRIDGE.z) ? p : m);
  BRIDGE.roadY = rp.y;
  const lack = creekPoly[ci].y - (rp.y - 1.4);
  if (lack > 0) creekPoly.forEach((p, i) => { p.y -= lack * Math.exp(-(((i - ci) * 0.75 / 9) ** 2)); });
  const dz = 1, ang = Math.atan2(mainRoadX(BRIDGE.z + dz) - mainRoadX(BRIDGE.z - dz), 2 * dz);
  BRIDGE.ang = ang; BRIDGE.c = Math.cos(ang); BRIDGE.s = Math.sin(ang);
  // 비스듬히 건너면 그만큼 다리가 길어진다
  const a = creekPoly[ci - 1], b = creekPoly[ci + 1], cl = Math.hypot(b.x - a.x, b.z - a.z);
  BRIDGE.sinX = Math.max(0.5, Math.abs(BRIDGE.s * (b.z - a.z) - BRIDGE.c * (b.x - a.x)) / cl);
  BRIDGE.hl = (creekPoly[ci].w + 2.2) / BRIDGE.sinX; BRIDGE.hw = 3.6; BRIDGE.top = rp.y + 0.28;
}

// 격자마다 도로/시냇물까지의 거리, 도로 높이, 수면 높이
function nearestOnSegs(segs, x, z, out) {
  let best = 1e9, by = 0, bw = 0, bs = 0, side = 1;
  for (let s = 0; s < segs.length; s += 2) {
    const a = segs[s], b = segs[s + 1];
    const ex = b.x - a.x, ez = b.z - a.z;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - a.x - ex * t, dz = z - a.z - ez * t, d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2; by = a.y + (b.y - a.y) * t;
      if (a.w !== undefined) { bw = a.w + (b.w - a.w) * t; bs = a.s + (b.s - a.s) * t; side = ex * dz - ez * dx < 0 ? -1 : 1; }
    }
  }
  out.d = Math.sqrt(best); out.y = by; out.w = bw; out.s = bs; out.side = side;
  return out;
}
const toSegs = (polys) => { const s = []; for (const p of polys) for (let i = 1; i < p.length; i++) s.push(p[i - 1], p[i]); return s; };
const roadSegs = toSegs([mainPoly, branchPoly]), creekSegs = toSegs([creekPoly]);
const roadD = new Float32Array(N * N), hG = new Float32Array(N * N);
const creekD = new Float32Array(N * N), waterY = new Float32Array(N * N);
const creekS = new Float32Array(N * N), creekLat = new Float32Array(N * N), creekWd = new Float32Array(N * N);   // 물결 좌표: 물길 방향 거리, 가로 위치, 기준보다 넓은 폭
{
  const r = {}, c = {};
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = -HALF + ix * STEP, z = -HALF + iz * STEP, i = iz * N + ix;
    nearestOnSegs(roadSegs, x, z, r);
    // 시냇물은 대략 z=26~42 띠 안에만 있으니 멀면 계산 생략
    if (Math.abs(z - creekZ(x)) < 28) nearestOnSegs(creekSegs, x, z, c); else { c.d = 99; c.y = -99; c.w = CREEK_HW; c.s = 0; c.side = 1; }
    creekS[i] = c.s; creekLat[i] = c.d * c.side; creekWd[i] = c.w - CREEK_HW;
    // 시냇물 거리는 기준 폭으로 환산 (넓은 곳은 바닥이 평평하게 넓어지고 깊이와 둑 모양은 같다)
    const cd = Math.max(0, c.d - (c.w - CREEK_HW));
    roadD[i] = r.d; creekD[i] = cd; waterY[i] = c.y;
    let h = lerp(r.y, preH(x, z), smooth(ROAD_HW + 0.6, ROAD_HW + 4.5, r.d));
    if (cd < 30) {
      // 도로가 지나는 곳은 둑을 가파르게 (다리 받침)
      const bankW = lerp(1.4, 4, smooth(ROAD_HW + 1, ROAD_HW + 6, r.d));
      const e = smooth(CREEK_HW - 0.4, CREEK_HW + bankW, cd);
      const inner = c.y - 0.12 - 0.5 * Math.max(0, 1 - (cd / CREEK_HW) ** 2);
      const lev = c.y + 0.3 - 0.6 * Math.max(0, cd - CREEK_HW - bankW * 0.5);
      h = lerp(inner, Math.max(h, lev), e);
      // 물길 밖의 땅은 수면보다 낮아지지 않게 (강물이 둑 밖으로 새어 나가 보이지 않도록).
      // 강에서 멀어지면 이 바닥을 비탈로 낮춰, 계산 범위 끝에서 턱이 지지 않게
      if (cd > CREEK_HW + 1.2) h = Math.max(h, c.y + 0.15 * smooth(CREEK_HW + 1.2, CREEK_HW + 2.2, cd) - 0.5 * Math.max(0, cd - CREEK_HW - 4));
    }
    hG[i] = h;
  }
}
// 다리 양 끝은 그 자리 지면보다 조금 아래(묻힘), 가운데는 둑보다 높게
{
  const hAt = (u) => { const x = BRIDGE.x + u * BRIDGE.s, z = BRIDGE.z + u * BRIDGE.c, fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    return hG[Math.round(fz) * N + Math.round(fx)]; };
  BRIDGE.endA = hAt(-BRIDGE.hl) - 0.12; BRIDGE.endB = hAt(BRIDGE.hl) - 0.12;
  BRIDGE.top = Math.max(BRIDGE.endA, BRIDGE.endB, BRIDGE.roadY) + 0.9;
}
// 절벽: 경사가 심한 곳은 풀 없이 바위 벽으로 (0~1)
const cliffG = new Float32Array(N * N);
for (let iz = 1; iz < N - 1; iz++) for (let ix = 1; ix < N - 1; ix++) {
  const i = iz * N + ix, gx = (hG[i + 1] - hG[i - 1]) / (2 * STEP), gz = (hG[i + N] - hG[i - N]) / (2 * STEP);
  cliffG[i] = smooth(0.62, 0.95, Math.hypot(gx, gz)) * smooth(ROAD_HW + 0.3, ROAD_HW + 1.2, roadD[i]);
}
// 큰 절벽(시작 지점 근처, 강 옆)만 남기고 자잘한 것은 그냥 풀 덮인 경사면으로. 이어진 덩어리 단위로 판단
const cliffNear = new Uint8Array(N * N);   // 강가 절벽 발치: 절벽과 강 사이 좁은 땅 (풀 없음)
{
  const seen = new Uint8Array(N * N), sx = SPAWN_X;
  for (let s0 = 0; s0 < N * N; s0++) {
    if (seen[s0] || cliffG[s0] < 0.02) continue;
    const comp = [s0], stack = [s0]; seen[s0] = 1;
    let near = false;
    while (stack.length) {
      const i = stack.pop(), ix = i % N, iz = (i / N) | 0, x = -HALF + ix * STEP, z = -HALF + iz * STEP;
      if (creekD[i] < CREEK_HW + 8 || Math.hypot(x - sx, z - SPAWN_Z) < 30) near = true;
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (j < 0 || j >= N * N || seen[j] || cliffG[j] < 0.02 || Math.abs((j % N) - ix) > 1) continue;
        seen[j] = 1; stack.push(j); comp.push(j);
      }
    }
    let big = 0;
    for (const i of comp) if (cliffG[i] > 0.2) big++;
    if (!(near && big >= 150)) for (const i of comp) cliffG[i] = 0;
  }
  for (let i = 0; i < N * N; i++) {
    if (cliffG[i] < 0.2 || creekD[i] > CREEK_HW + 8) continue;
    const ix = i % N, iz = (i / N) | 0;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const jx = ix + dx, jz = iz + dz;
      if (jx >= 0 && jz >= 0 && jx < N && jz < N && dx * dx + dz * dz <= 36) cliffNear[jz * N + jx] = 1;
    }
  }
}
function gridIndex(x, z) {
  const ix = Math.min(N - 1, Math.max(0, Math.round((x + HALF) / STEP)));
  const iz = Math.min(N - 1, Math.max(0, Math.round((z + HALF) / STEP)));
  return iz * N + ix;
}
function heightAt(x, z) {
  const fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
  const ix = Math.min(N - 2, Math.max(0, Math.floor(fx))), iz = Math.min(N - 2, Math.max(0, Math.floor(fz)));
  const tx = fx - ix, tz = fz - iz, i = iz * N + ix;
  return lerp(lerp(hG[i], hG[i + 1], tx), lerp(hG[i + N], hG[i + N + 1], tx), tz);
}
// 수면 높이 (물 밖이면 -1e9)
function waterAt(x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return -1e9;
  const i = gridIndex(x, z);
  return creekD[i] < CREEK_HW + 2 && waterY[i] > heightAt(x, z) ? waterY[i] : -1e9;
}
// 다리 좌표계: u = 도로 방향, v = 가로
function bridgeLocal(x, z, out) {
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  out.u = dx * BRIDGE.s + dz * BRIDGE.c; out.v = dx * BRIDGE.c - dz * BRIDGE.s;
  return out;
}
const _bl = {};
// 다리 상판 프로필 / ‾ \ : 가운데 평평한 구간에서 양 끝 땅속으로 비스듬히 내려간다
function deckProfile(u) {
  const flat = BRIDGE.hl * 0.38, a = Math.abs(u);
  if (a <= flat) return BRIDGE.top;
  return lerp(BRIDGE.top, u < 0 ? BRIDGE.endA : BRIDGE.endB, (a - flat) / (BRIDGE.hl - flat));
}
// 다리 상판 높이 (상판 밖이면 -1e9)
function bridgeDeckAt(x, z) {
  bridgeLocal(x, z, _bl);
  if (Math.abs(_bl.u) > BRIDGE.hl || Math.abs(_bl.v) > BRIDGE.hw) return -1e9;
  return deckProfile(_bl.u);
}
function distPoly(poly, x, z) {
  let best = 1e9;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], ex = b.x - a.x, ez = b.z - a.z;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez);
    t = Math.min(1, Math.max(0, t));
    best = Math.min(best, Math.hypot(x - a.x - ex * t, z - a.z - ez * t));
  }
  return best;
}

// ---------------------------------------------------------------- 필드 상태 (0.5m 격자)
// R=눌림, G=불, B=그을림, A=풀 성장도. 셰이더가 이 텍스처를 읽어 풀/지면을 표현한다
const FN = 300, FCELL = 0.5;
const fTr = new Float32Array(FN * FN), fFire = new Float32Array(FN * FN), fChar = new Float32Array(FN * FN);
const fGrow = new Float32Array(FN * FN).fill(1), fFuel = new Float32Array(FN * FN), fCap = new Float32Array(FN * FN);
const fPower = new Float32Array(FN * FN), fRegrow = new Float32Array(FN * FN);
const fieldData = new Uint8Array(FN * FN * 4);
const fieldTex = new THREE.DataTexture(fieldData, FN, FN, THREE.RGBAFormat, THREE.UnsignedByteType);
fieldTex.magFilter = fieldTex.minFilter = THREE.LinearFilter;
U.uField.value = fieldTex;
// 바닥 그늘: 0.5m 칸, 255 = 그늘 없음. 건물을 다 세운 뒤 한 번 굽는다
const GN = Math.round(HALF * 4), gapData = new Uint8Array(GN * GN).fill(255);
const gapTex = new THREE.DataTexture(gapData, GN, GN, THREE.RedFormat, THREE.UnsignedByteType);
gapTex.magFilter = gapTex.minFilter = THREE.LinearFilter; gapTex.needsUpdate = true;
U.uGap.value = gapTex;
const cellOf = (x, z) => {
  const ix = Math.floor((x + HALF) / FCELL), iz = Math.floor((z + HALF) / FCELL);
  return ix < 0 || iz < 0 || ix >= FN || iz >= FN ? -1 : iz * FN + ix;
};
function forCells(x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r + HALF) / FCELL)), i1 = Math.min(FN - 1, Math.floor((x + r + HALF) / FCELL));
  const j0 = Math.max(0, Math.floor((z - r + HALF) / FCELL)), j1 = Math.min(FN - 1, Math.floor((z + r + HALF) / FCELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = -HALF + (i + 0.5) * FCELL, cz = -HALF + (j + 0.5) * FCELL, d = Math.hypot(cx - x, cz - z);
    if (d <= r) fn(j * FN + i, d, cx, cz);
  }
}

await loadStep(0.12, 'SHAPING TERRAIN...');
// ---------------------------------------------------------------- 씬
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
// 안개: near부터 시작해 far에서 거의 다 덮는 부드러운 안개. 짙기 = 1 - exp(-k²), k = 2·(거리 - near) / (far - near) (far에서 98%).
// 플레이는 near 0 (설정 메뉴 농도 → far = 2 / 농도. 예전 FogExp2와 같은 모양), 타이틀은 흰 안개를 가깝게 깐다.
// three.js 재질의 안개 계산을 이 식으로 바꾸고, 파티클·외곽선 셰이더도 같은 식 (FOGN, FOGF)
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fogK = max(vFogDepth - fogNear, 0.0) * 2.0 / max(fogFar - fogNear, 0.001);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fogK * fogK));
#endif`;
const FOG = new THREE.Color(MAP0.fogColor);
scene.background = FOG;
scene.fog = new THREE.Fog(FOG, 0, 2 / MAP0.fog);
const FOGN = { value: 0 }, FOGF = { value: scene.fog.far };
const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.5, 600);
camera.position.set(100, TOWN_H + 100, 130);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, TOWN_H, 0);
controls.enableDamping = true;
controls.minDistance = 8; controls.maxDistance = CFG.camera.maxDistance ?? 70; controls.maxPolarAngle = 1.52;
window.dbg = { camera, controls };

// 궤도 자국: 위에서 내려다본 2048² 마스크에 궤도판 무늬를 GPU로 찍고, 조금씩 빼서 30초에 걸쳐 지운다
const trackRT = new THREE.WebGLRenderTarget(2048, 2048, {
  format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false,
  magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false,
});
U.uTrack.value = trackRT.texture;
renderer.setRenderTarget(trackRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.setRenderTarget(null);
const stampScene = new THREE.Scene(), stampCam = new THREE.Camera();
// 정점은 월드 xz를 그대로 클립 좌표로: 지면 셰이더가 같은 식으로 읽는다
const stampVS = `attribute float aV; varying float vV; varying vec2 vUv;
  void main() { vUv = uv; vV = aV; gl_Position = vec4(position.x / ${HALF.toFixed(1)}, position.z / ${HALF.toFixed(1)}, 0.0, 1.0); }`;
const stampMat = new THREE.ShaderMaterial({
  vertexShader: stampVS,
  fragmentShader: `varying float vV; varying vec2 vUv;
    void main() {
      float bar = step(fract(vV - 0.22 * smoothstep(0.3, 0.12, abs(vUv.x - 0.5))), 0.55);   // 궤도판 하나하나가 }}}}} 로 찍힌다 (가운데가 튀어나옴)
      float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
      gl_FragColor = vec4(vec3((0.45 + 0.55 * bar) * edge), 1.0);
    }`,
  blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide,
});
const stampMeshes = [0, 1].map(() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  g.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(4), 1));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const m = new THREE.Mesh(g, stampMat); m.frustumCulled = false; m.visible = false; stampScene.add(m);
  return m;
});
const fadeScene = new THREE.Scene();
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(1.0 / 255.0); }',
    blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    depthTest: false, depthWrite: false,
  }));
  m.frustumCulled = false; fadeScene.add(m);
}

const hemi = new THREE.HemisphereLight(0x7d8aac, 0x4a3a2a, 1.5);
scene.add(hemi);
// 낮게 비스듬히 비추는 달: 비탈마다 명암 차가 커져 지형 굴곡이 드러난다
const moon = new THREE.DirectionalLight(MAP0.moonColor, MAP0.moon);
moon.position.set(-70, 38, -45);
scene.add(moon);
// 타이틀 꾸밈 (config title.details): 탱크 포즈, 짙은 굴뚝 연기, 지나온 궤도 자국, 낙엽
const TDET = Object.assign({ pose: true, turret: 25, elev: 14, smoke: 0.8, trail: 22, leaves: 6 }, CFG.title?.details);

// 길 위의 물웅덩이 자리. 웅덩이는 없앴지만 뒤에 오는 배치(보급품·상자 등)가 바뀌지 않도록 난수는 예전처럼 소비한다
const PUDDLES = [];
for (let tries = 0; PUDDLES.length < 4 && tries < 400; tries++) {
  const poly = rand() < 0.7 ? mainPoly : branchPoly, p = poly[Math.floor(rand() * poly.length)];
  const x = p.x + rr(-1, 1), z = p.z + rr(-1, 1);
  if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4 || Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < BRIDGE.hl + 4) continue;
  if (PUDDLES.some(q => Math.hypot(q.x - x, q.y - z) < 12)) continue;
  PUDDLES.push(new THREE.Vector3(x, z, rr(0.9, 1.7)));
}
let terrainCol;
// 지형 메시
{
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = terrainCol = new Float32Array(pos.count * 3);
  const cSoil = new THREE.Color(0x5e4c32), cSoil2 = new THREE.Color(0x46392a), cTown = new THREE.Color(0x85704e);
  const cRoad = new THREE.Color(0x9a8360), c = new THREE.Color(), rc = new THREE.Color();
  // 풀 밑 흙은 풀색에 가깝게: 풀 사이 틈이 깜빡여 보이는 대비를 줄인다
  const cUnder = new THREE.Color(0x5a5034), cBed = new THREE.Color(0x3a3a33), cMud = new THREE.Color(0x40352a);
  const road = new Float32Array(pos.count), creek = new Float32Array(pos.count * 2), cliff = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), gi = gridIndex(x, z), d = roadD[gi], cd = creekD[gi], n = rand();
    pos.setY(i, hG[gi]); cliff[i] = cliffG[gi];
    road[i] = cd < CREEK_HW + 1.2 ? 99 : d;
    // 시냇물까지 거리, 수심 (물길 밖의 낮은 땅은 물이 없으니 물속 표현도 없다)
    creek[i * 2] = cd; creek[i * 2 + 1] = cd < CREEK_HW + 2 ? Math.max(0, waterY[gi] - hG[gi]) : 0;
    c.copy(cSoil).lerp(cSoil2, n);
    const town = townAt(x, z);
    c.lerp(cUnder, smooth(ROAD_HW + 0.5, ROAD_HW + 2.5, d) * (1 - town) * 0.6);
    c.lerp(cTown, town * 0.7);
    rc.copy(cRoad).multiplyScalar(0.92 + n * 0.14);
    c.lerp(rc, 1 - smooth(ROAD_HW - 0.3, ROAD_HW + 0.6, d));
    c.lerp(cMud, 1 - smooth(CREEK_HW + 0.5, CREEK_HW + 2.2, cd));
    rc.copy(cBed).multiplyScalar(0.8 + n * 0.4);
    c.lerp(rc, 1 - smooth(CREEK_HW - 0.6, CREEK_HW + 0.4, cd));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aRoad', new THREE.BufferAttribute(road, 1));
  geo.setAttribute('aCreek', new THREE.BufferAttribute(creek, 2));
  geo.setAttribute('aCliff', new THREE.BufferAttribute(cliff, 1));
  geo.computeVertexNormals();
  // 픽셀 단위로: 흙 알갱이, 구불구불 끊기는 바퀴 자국, 탱크 궤도 자국, 그을림, 잉걸불
  const mat = ps1(new THREE.MeshLambertMaterial({ vertexColors: true }), (sh) => {
    sh.uniforms.uField = U.uField;
    sh.uniforms.uTrack = U.uTrack;
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uSh0 = U.uSh0; sh.uniforms.uSh1 = U.uSh1; sh.uniforms.uLamp0 = U.uLamp0; sh.uniforms.uLamp1 = U.uLamp1;
    sh.vertexShader = 'attribute float aRoad, aCliff; attribute vec2 aCreek; varying float vRoad, vCliff, vY; varying vec2 vXZ, vCreek;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(transformed, 1.0)).xz; vY = transformed.y; vRoad = aRoad; vCreek = aCreek; vCliff = aCliff;');
    sh.uniforms.uGap = U.uGap;
    sh.fragmentShader = SHADOW_GLSL + `uniform sampler2D uField, uTrack, uGap; uniform float uTime; varying vec2 vXZ, vCreek; varying float vRoad, vCliff, vY;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // 자갈: 셀마다 흔들린 중심점 중 가장 가까운 것 = 돌 하나. 두 번째로 가까운 것과의 차이가 작으면 틈
      vec2 pebble(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float d1 = 9.0, d2 = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(x, y), c = i + o;
          vec2 r = o + vec2(hash(c), hash(c + 17.0)) * 0.8 + 0.1 - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; id = hash(c + 5.0); } else if (d < d2) d2 = d;
        }
        return vec2(id, d2 - d1);
      }
    ` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 강바닥 자갈: 수면 아래에만
        float gravel = smoothstep(0.0, 0.06, vCreek.y);
        if (gravel > 0.01) {
          // 크기가 제각각인 돌: 큰 돌 → 중간 돌 → 그 틈을 잔자갈이 메운다. 좌표를 살짝 비틀어 모양도 들쭉날쭉
          vec2 q = vXZ + (vec2(vnoise(vXZ * 1.7), vnoise(vXZ * 1.7 + 9.3)) - 0.5) * 0.45;
          vec2 pb = pebble(q * 10.0), pm = pebble(q * 4.6 + 3.1), pg = pebble(q * 2.0 + 7.7);
          if (pm.x > 0.4) pb = vec2(fract(pm.x * 13.7), pm.y);
          if (pg.x > 0.72) pb = vec2(fract(pg.x * 7.3), pg.y);
          vec3 stone = mix(vec3(0.48, 0.45, 0.4), vec3(0.24, 0.22, 0.2), pb.x) * mix(vec3(1.0), vec3(1.1, 0.95, 0.8), step(0.7, hash(vec2(pb.x * 91.0))));
          stone *= mix(0.35, 1.0, smoothstep(0.02, 0.12, pb.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, smoothstep(0.0, 0.5, gravel));
        }
        // 절벽: 층층이 쌓인 바위 결 + 턱마다 어두운 줄 + 세로로 갈라진 틈
        if (vCliff > 0.01) {
          float wob = vnoise(vXZ * 0.35) * 0.9;
          float strata = vnoise(vec2((vXZ.x + vXZ.y) * 0.2, vY * 2.0 + wob));
          float band = fract(vY * 1.4 + wob);
          vec3 rock = mix(vec3(0.36, 0.355, 0.34), vec3(0.17, 0.17, 0.175), strata);   // 회색 바위
          rock *= 0.72 + 0.32 * smoothstep(0.0, 0.18, band);
          float crack = 1.0 - smoothstep(0.0, 0.04, abs(vnoise(vec2(vXZ.x - vXZ.y, vY * 0.4) * 1.6) - 0.5));
          rock *= 1.0 - crack * 0.45;
          rock *= 0.85 + 0.3 * vnoise(vXZ * 4.0 + vY * 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, rock, smoothstep(0.0, 0.45, vCliff));
        }
        // 물속: 깊을수록 푸르게 가라앉는 색
        float depth = vCreek.y;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.84, 0.88), smoothstep(0.0, 0.6, depth));
        float roadM = 1.0 - smoothstep(${(ROAD_HW - 0.4).toFixed(2)}, ${(ROAD_HW + 0.5).toFixed(2)}, vRoad + (vnoise(vXZ * 0.9) - 0.5) * 0.8);
        float rutC = 0.95 + (vnoise(vXZ * 0.3) - 0.5) * 0.7 + (vnoise(vXZ * 1.1 + 7.0) - 0.5) * 0.25;
        float rut = (1.0 - smoothstep(0.06, 0.32, abs(vRoad - rutC))) * smoothstep(0.3, 0.65, vnoise(vXZ * 0.45 + 31.0));
        float hump = (1.0 - smoothstep(0.0, 0.45, vRoad)) * vnoise(vXZ * 2.3);
        float grain = vnoise(vXZ * 3.3) * 0.6 + vnoise(vXZ * 9.0) * 0.4;
        diffuseColor.rgb *= 0.9 + 0.2 * grain;
        diffuseColor.rgb *= 1.0 - roadM * (rut * 0.3 - hump * 0.08 + (vnoise(vXZ * 0.6 + 3.0) - 0.5) * 0.25);
        diffuseColor.rgb *= 1.0 - texture2D(uTrack, ${UVW("vXZ")}).r * 0.5;
        vec4 fld = texture2D(uField, ${UVW("vXZ")});
        diffuseColor.rgb *= 1.0 - fld.b * 0.8;
        float shade = (1.0 - 0.8 * contactShadow(vXZ)) * pow(texture2D(uGap, ${UVW("vXZ")}).r, uAO);   // 바닥 그림자 × 건물 사이 그늘
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), uWhite) * shade;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.4, 0.4, 0.08) * fld.g * 0.7;
        totalEmissiveRadiance += diffuseColor.rgb * lampGlow(vXZ) * 2.6;   // 뒷등 빛을 받은 땅
        // 흐르는 물빛이 바닥에 일렁이는 무늬 (커스틱)
        if (depth > 0.01) {
          vec2 q = vXZ * 1.4;
          float cs = 1.0 - abs(vnoise(q + vec2(uTime * 0.7, uTime * 0.2)) - vnoise(q * 1.3 - vec2(uTime * 0.3, uTime * 0.5)));
          totalEmissiveRadiance += vec3(0.35, 0.5, 0.55) * pow(cs, 16.0) * smoothstep(0.0, 0.15, depth) * 0.04;   // 아주 은은하게
        }`);
  }, 'terrain');
  mat.userData.ownWhite = true;   // 흰색 보기는 위 셰이더가 그늘을 남기며 직접 처리
  mat.userData.noOcc = true;   // 땅은 내 탱크를 가려도 비우지 않는다
  // 그리는 격자는 config map.terrainStep칸마다 하나만 (2 = 1m 간격, 삼각형 1/4). 세로 300줄 화면에서는 거의 구분이 안 되는데 GPU 부담은 크다.
  // 위의 계산(난수 순서·terrainCol·물리 높이)은 원래 0.5m 격자 그대로 두고, 같은 자리의 값을 골라 옮긴다
  let tgeo = geo;
  const TS = Math.max(1, Math.round(CFG.map?.terrainStep ?? 2));
  if (TS > 1 && (N - 1) % TS === 0) {
    const M = (N - 1) / TS + 1, g2 = new THREE.PlaneGeometry(HALF * 2, HALF * 2, M - 1, M - 1);
    g2.rotateX(-Math.PI / 2);
    const p2 = g2.attributes.position, c2 = new Float32Array(M * M * 3), r2 = new Float32Array(M * M), k2 = new Float32Array(M * M * 2), l2 = new Float32Array(M * M);
    for (let b = 0; b < M; b++) for (let a = 0; a < M; a++) {
      const i = b * M + a, j = b * TS * N + a * TS;   // PlaneGeometry는 줄(z)마다 x 순서: 성긴 (a, b) = 원래 (a·TS, b·TS)
      p2.setY(i, pos.getY(j)); c2[i * 3] = col[j * 3]; c2[i * 3 + 1] = col[j * 3 + 1]; c2[i * 3 + 2] = col[j * 3 + 2];
      r2[i] = road[j]; k2[i * 2] = creek[j * 2]; k2[i * 2 + 1] = creek[j * 2 + 1]; l2[i] = cliff[j];
    }
    g2.setAttribute('color', new THREE.BufferAttribute(c2, 3));
    g2.setAttribute('aRoad', new THREE.BufferAttribute(r2, 1));
    g2.setAttribute('aCreek', new THREE.BufferAttribute(k2, 2));
    g2.setAttribute('aCliff', new THREE.BufferAttribute(l2, 1));
    g2.computeVertexNormals();
    tgeo = g2; geo.dispose();
  }
  { const m = new THREE.Mesh(tgeo, mat); m.userData.noOutline = true; scene.add(m); }   // 땅은 외곽선 없음
}

// 디오라마 단면 (지층 3단): 위 겉흙 / 가운데 흙(자갈·잔뿌리) / 아래 암반(바위). 디테일은 단면 텍스처 두 장에 그려 둔다
{
  // 텍스처 256px = 16m 한 장: 반복 간격이 길어 같은 무늬가 줄지어 보이지 않게. 무늬 난수는 따로 (배치용 난수와 섞이지 않게)
  let tseed = 0x2545f491;
  const tr = () => { tseed = (tseed + 0x6d2b79f5) | 0; let t = Math.imul(tseed ^ (tseed >>> 15), 1 | tseed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const trr = (a, b) => a + (b - a) * tr();
  const TS = 256, secTex = (draw) => { const t = canvasTex(TS, TS, draw, true); t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapNearestFilter; return t; };
  const blob = (g, x, y, rx, ry, col, hi) => {
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, tr() * 3, 0, 7); g.fill();
    if (hi) { g.fillStyle = hi; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.45, ry * 0.3, 0, 0, 7); g.fill(); }
  };
  // 흙: 알갱이 + 크기 제각각 자갈 + 잔뿌리
  const soilTex = secTex((g) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 3600; i++) { const v = 150 + Math.floor(tr() * 100); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.floor(tr() * TS), Math.floor(tr() * TS), 1, 1); }
    for (let i = 0; i < 240; i++) { const v = 160 + Math.floor(tr() * 90), k = tr() ** 2.2 * 3 + 0.6; blob(g, tr() * TS, tr() * TS, k * trr(1, 2.2), k * trr(0.8, 1.5), `rgb(${v},${v - 6},${v - 14})`, 'rgba(255,255,255,.35)'); }
    g.strokeStyle = 'rgba(40,28,18,.55)'; g.lineWidth = 1;
    for (let i = 0; i < 56; i++) { let x = tr() * TS, y = tr() * TS; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += trr(-5, 5); y += trr(2, 7); g.lineTo(x, y); } g.stroke(); }
  });
  // 암반: 크기·모양이 제각각인 바위 덩어리 + 잔돌 + 금 (화석 없음)
  const rockTex = secTex((g) => {
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, TS, TS);
    for (let i = 0; i < 2800; i++) { const v = 140 + Math.floor(tr() * 110); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.floor(tr() * TS), Math.floor(tr() * TS), 1 + Math.floor(tr() * 2), 1); }
    for (let i = 0; i < 30; i++) { const v = 115 + Math.floor(tr() * 70), k = trr(0.5, 1.6); blob(g, tr() * TS, tr() * TS, (5 + tr() * 9) * k, (3 + tr() * 6) * k, `rgb(${v},${v},${v + 6})`, 'rgba(255,255,255,.22)'); }
    for (let i = 0; i < 140; i++) { const v = 150 + Math.floor(tr() * 80); blob(g, tr() * TS, tr() * TS, 1 + tr() ** 2 * 4, 0.8 + tr() * 2, `rgb(${v},${v},${v})`, null); }
    g.strokeStyle = 'rgba(30,26,22,.6)';
    for (let i = 0; i < 22; i++) { let x = tr() * TS, y = tr() * TS; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 2 + Math.floor(tr() * 5); k++) { x += trr(-9, 9); y += trr(-3, 7); g.lineTo(x, y); } g.stroke(); }
  });
  const soil = { pos: [], nor: [], col: [], uv: [] }, rock = { pos: [], nor: [], col: [], uv: [] }, water = { pos: [], nor: [], col: [], uv: [] };
  const LAYERS = [0x3b2e1f, 0x6a4c30, 0x6c665c].map(h => new THREE.Color(h));
  const edges = [
    { n: [0, 0, 1], pt: (s) => [s, HALF] },          // +z, x 증가
    { n: [0, 0, -1], pt: (s) => [-s, -HALF] },       // -z, x 감소
    { n: [1, 0, 0], pt: (s) => [HALF, -s] },         // +x, z 감소
    { n: [-1, 0, 0], pt: (s) => [-HALF, s] },        // -x, z 증가
  ];
  const quad = (o, A, B, ya0, ya1, yb0, yb1, n, c) => {
    o.pos.push(A.x, ya0, A.z, A.x, ya1, A.z, B.x, yb0, B.z, B.x, yb0, B.z, A.x, ya1, A.z, B.x, yb1, B.z);
    o.uv.push(A.s / 16, ya0 / 16, A.s / 16, ya1 / 16, B.s / 16, yb0 / 16, B.s / 16, yb0 / 16, A.s / 16, ya1 / 16, B.s / 16, yb1 / 16);   // 16m에 한 장
    for (let v = 0; v < 6; v++) { o.nor.push(...n); o.col.push(c.r, c.g, c.b); }
  };
  for (const e of edges) {
    const cols = [];
    for (let k = 0; k < N; k++) {
      const s = -HALF + k * STEP, [x, z] = e.pt(s), h = heightAt(x, z);
      const w = (a, b) => 0.5 * Math.sin(s * 0.21 + a) + 0.3 * Math.sin(s * 0.67 + b);
      const ys = [h, h - 0.45, Math.min(h - 1.4, 0.8 + w(3, 4) * 1.6), BOTTOM];
      for (let j = 1; j < 3; j++) ys[j] = Math.max(BOTTOM + 0.5, Math.min(ys[j], ys[j - 1] - 0.15));
      cols.push({ x, z, s, ys, n: rand(), w: waterAt(x, z) });
    }
    const cW = new THREE.Color(0x4a6e7c);
    for (let k = 0; k < N - 1; k++) {
      const A = cols[k], B = cols[k + 1];
      // 단면에 드러난 시냇물
      if (A.w > A.ys[0] || B.w > B.ys[0]) quad(water, A, B, Math.max(A.w, A.ys[0]), A.ys[0], Math.max(B.w, B.ys[0]), B.ys[0], e.n, cW);
      for (let b = 0; b < 3; b++) {
        const c = LAYERS[b].clone().multiplyScalar(0.92 + A.n * 0.16);
        quad(b < 2 ? soil : rock, A, B, A.ys[b], A.ys[b + 1], B.ys[b], B.ys[b + 1], e.n, c);
      }
    }
  }
  for (const [o, map] of [[soil, soilTex], [rock, rockTex], [water, null]]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    scene.add(new THREE.Mesh(geo, lambert({ vertexColors: true, map })));
  }
}

// 시냇물: 물길을 따라 흐르는 잔물결과 반짝임. 둑 지형이 가장자리를 가린다
{
  // 수면은 지형 격자(1m 간격) 위에 깔고 둑 지형이 가장자리를 가린다: 넓고 굽은 곳에서도 접히지 않고, 보드 경계에서 그대로 끊긴다
  const pos = [], uv = [], idx = [], K = 2, M = (N - 1) / K + 1, vid = new Int32Array(M * M).fill(-1);
  const near = (i) => creekD[i] < CREEK_HW + 2.5;
  const vert = (mx, mz) => {
    const k = mz * M + mx;
    if (vid[k] < 0) {
      const i = mz * K * N + mx * K;
      vid[k] = pos.length / 3;
      pos.push(-HALF + mx * K * STEP, waterY[i], -HALF + mz * K * STEP);
      uv.push(creekLat[i], creekS[i], creekWd[i], creekD[i]);
    }
    return vid[k];
  };
  for (let mz = 0; mz < M - 1; mz++) for (let mx = 0; mx < M - 1; mx++) {
    const i00 = mz * K * N + mx * K, i10 = i00 + K, i01 = i00 + K * N, i11 = i01 + K;
    if (!(near(i00) || near(i10) || near(i01) || near(i11))) continue;
    const a = vert(mx, mz), b = vert(mx + 1, mz), c = vert(mx, mz + 1), d = vert(mx + 1, mz + 1);
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aW', new THREE.Float32BufferAttribute(uv, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = ps1(new THREE.MeshLambertMaterial({ color: 0x6f9aa6, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }), (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'attribute vec4 aW; varying vec4 vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;');
    sh.fragmentShader = `uniform float uTime; varying vec4 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
    ` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (vW.w > ${(CREEK_HW + 2.0).toFixed(1)}) discard;   // 물길 밖으로는 그리지 않는다
      vec2 fl = vec2(vW.x * 1.3, vW.y * 0.9 + ${CREEK_UP.toFixed(1)} * uTime * 1.1);   // 상류에서 하류로
      float rip = vnoise(fl * 1.6) * 0.6 + vnoise(fl * 4.0 + vec2(uTime * 0.3, 0.0)) * 0.4;
      float glint = smoothstep(0.72, 0.8, rip);
      float foam = smoothstep(${(CREEK_HW - 0.6).toFixed(2)}, ${(CREEK_HW + 0.4).toFixed(2)}, abs(vW.x) - vW.z + (vnoise(fl * 2.5) - 0.5) * 0.8);
      diffuseColor.rgb *= 0.85 + 0.3 * rip;
      diffuseColor.a = min(1.0, diffuseColor.a + glint * 0.5 + foam * 0.35);   // 반짝임과 거품만 진하게 떠 흐른다
      totalEmissiveRadiance += vec3(0.5, 0.62, 0.7) * glint * 0.5 + vec3(0.35) * foam * 0.25;`);
  }, 'water');
  const water = new THREE.Mesh(geo, mat);
  water.renderOrder = -1;   // 투명 물체 중 가장 먼저 그려서, 물 위에 겹친 연기·불꽃을 덮지 않게
  scene.add(water);
  // 물속/둑의 돌멩이
  const stones = [];
  for (let k = 0; k < 140; k++) {
    const p = creekPoly[2 + Math.floor(rand() * (creekPoly.length - 4))];
    const off = rr(-p.w - 1.2, p.w + 1.2), x = p.x + rr(-0.4, 0.4), z = p.z + off;
    if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5 || Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 4) continue;
    const g = new THREE.DodecahedronGeometry(rr(0.12, 0.38), 0);
    g.scale(1, rr(0.4, 0.7), rr(0.7, 1.2)); g.rotateY(rand() * 6.28);
    g.translate(x, heightAt(x, z) + 0.02, z);
    stones.push(g.index ? g.toNonIndexed() : g);
  }
  { const m = new THREE.Mesh(mergeGeometries(stones), lambert({ color: 0x6e6a60, flatShading: true })); m.userData.noOutline = true; scene.add(m); }
}

