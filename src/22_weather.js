// ---------------------------------------------------------------- 날씨: 비 · 모래바람 · 번개
// 비는 '줄'(게임 화면 1픽셀 선) 수천 개를 GPU에서만 움직인다. 카메라가 보는 곳 둘레의 상자 안에서 떨어지고,
// 상자를 벗어나면 반대편에서 다시 나온다 (CPU 계산 없음, 그리기 1번). 양은 그리는 줄 수로 정한다.
// 바람(세기·방향)을 따라 기울고, 줄마다 방향·빠르기가 조금씩 다르며 시간에 따라 흔들린다 (돌풍).
// 바람에 밀린 거리는 CPU가 매 프레임 쌓아서 넘긴다: 바람이 바뀌어도 줄이 한꺼번에 튀지 않게.
// 색: 줄마다 밝기·빛깔이 조금씩 다르고, 장면 조명(달빛·하늘빛, 번개)만큼 밝아지며, 멀수록 안개 색에 묻힌다
const STREAK_VS = `
uniform float uTime, uLen, uFall, uJit, uSway, uSwayY, uAlpha, uWindS, uFar, uLight, uFogN, uFogF;
uniform vec3 uCenter, uSize, uColor, uFogC;
uniform vec2 uWindOfs, uWindD;
attribute vec4 aSeed;
attribute float aEnd;
varying float vA, vF;
varying vec3 vC;
void main() {
  float r = aSeed.w;
  float k = 0.8 + 0.4 * fract(r * 5.31);                     // 바람에 밀리는 정도 (줄마다)
  float sp = uFall * (0.75 + 0.5 * fract(r * 7.37));          // 떨어지는 빠르기 (줄마다)
  vec2 d0 = vec2(cos(r * 91.7), sin(r * 91.7)) * uJit;        // 줄마다 조금씩 다른 방향
  float f = 0.6 + 1.6 * fract(r * 3.17), ph = r * 53.0;       // 흔들림 빠르기·위상
  vec2 side = vec2(-uWindD.y, uWindD.x);
  float sw = sin(uTime * f + ph), cw = cos(uTime * f + ph);
  float sy = sin(uTime * f * 1.3 + ph * 2.0), cy = cos(uTime * f * 1.3 + ph * 2.0);
  vec3 head = aSeed.xyz * uSize;
  head.xz += uWindOfs * k + d0 * uTime + side * uSway * sw;
  head.y += -sp * uTime + uSwayY * sy;
  // 상자(카메라가 보는 곳 둘레) 안으로 감아 넣는다
  vec3 lo = uCenter - uSize * 0.5;
  head = lo + mod(head - lo, uSize);
  // 꼬리 = 머리에서 지금 움직이는 방향 반대로 (줄이 날아가는 방향으로 기운다)
  vec3 v = vec3(uWindD * uWindS * k + d0 + side * uSway * f * cw, -sp + uSwayY * f * 1.3 * cy);
  v = vec3(v.x, v.z, v.y);
  vec3 p = aEnd > 0.5 ? head : head - v * uLen;
  // 상자 가장자리·카메라 바로 앞·먼 곳은 옅게 (감아 넣을 때 툭 생기고 사라지지 않게)
  vec3 e = min(head - lo, lo + uSize - head);
  float edge = smoothstep(0.0, 4.0, min(e.x, e.z)) * smoothstep(0.0, 3.0, e.y);
  float dist = distance(p, cameraPosition);
  vA = uAlpha * edge * smoothstep(2.0, 9.0, dist) * (0.7 + 0.6 * fract(r * 17.9));   // 카메라 가까운 줄은 크고 굵게 보이니 더 옅게. 진하기도 줄마다
  vF = 1.0 - smoothstep(0.0, uFar * 0.9, dist);   // 멀수록 4x4 디더링으로 성기게 (게임 화면 픽셀 단위)
  float t = fract(r * 13.7) - 0.5;
  vec3 c = uColor * (0.8 + 0.45 * fract(r * 29.3)) * vec3(1.0 - 0.12 * t, 1.0, 1.0 + 0.12 * t);   // 밝기·빛깔 (조금 붉게 ~ 조금 푸르게)
  vC = mix(c * uLight, uFogC, clamp((dist - uFogN) / max(1.0, uFogF - uFogN), 0.0, 1.0));       // 조명만큼 밝게, 멀수록 안개 색으로
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const STREAK_FS = BAYER4_GLSL + `
varying float vA, vF;
varying vec3 vC;
void main() {
  if (bayer4(gl_FragCoord.xy) >= vF) discard;
  gl_FragColor = vec4(vC, vA);
}`;
function makeStreaks(o) {
  const N = o.max, seed = new Float32Array(N * 8), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const a = [Math.random(), Math.random(), Math.random(), Math.random()];   // 지형 배치 난수(rand)와 섞이지 않게
    seed.set(a, i * 8); seed.set(a, i * 8 + 4); end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const u = {
    uTime: { value: 0 }, uLen: { value: o.len }, uFall: { value: o.fall }, uJit: { value: o.jit }, uSway: { value: o.sway }, uSwayY: { value: o.swayY },
    uAlpha: { value: o.alpha }, uWindS: { value: 0 }, uFar: { value: o.far }, uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(...o.size) },
    uWindOfs: { value: new THREE.Vector2() }, uWindD: { value: new THREE.Vector2(1, 0) }, uColor: { value: new THREE.Color() },
    uLight: { value: 1 }, uFogC: { value: new THREE.Color() }, uFogN: { value: 0 }, uFogF: { value: 100 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false });
  const m = new THREE.LineSegments(g, mat);
  m.frustumCulled = false; m.userData.noOutline = true; m.renderOrder = 2;
  m.geometry.setDrawRange(0, 0);
  scene.add(m);   // 처음부터 장면에 두어 로딩 때 셰이더를 미리 컴파일 (그릴 줄 수 0이면 안 그림)
  return { m, u, o, amount: 0 };
}
// 비: 거의 곧게 빨리 떨어지고, 바람만큼 기운다 (줄 길이 = 빠르기 × len)
const rainFx = makeStreaks({ max: 6000, per: CFG.map.rainCount ?? 1600, fall: 36, wind: 10, len: 0.06, jit: 0.6, sway: 0.5, swayY: 0, alpha: CFG.map.rainAlpha ?? 0.2, far: 70, size: [64, 34, 64] });   // 양·진하기는 config map
const WX_REF_D = 38;   // 빗줄기 성기게 하는 거리의 기준 카메라 거리 (m, 기본 카메라쯤)
const WEATHER = { rain: 0, sand: 0, lightning: 0, flash: 0, flashT: 0, nextBolt: 6, splashAcc: 0, sndT: 0, sandAcc: 0, sandCol: new THREE.Color() };
// 조명 밝기 (달빛·하늘빛 세기 × 빛깔 밝기). 처음 맵 셋팅일 때를 1로 두고 비 색에 곱한다
const lightLum = (mi, mc, si, sc) => mi * (0.3 * mc.r + 0.59 * mc.g + 0.11 * mc.b) + si * (0.3 * sc.r + 0.59 * sc.g + 0.11 * sc.b);
const WX_LREF = Math.max(0.01, lightLum(MAP0.moon, new THREE.Color(MAP0.moonColor), MAP0.sky, new THREE.Color(MAP0.skyColor)));
window.dbg.WEATHER = WEATHER;
function setWeather(p) {
  WEATHER.rain = p.rain ?? 0; WEATHER.sand = p.sand ?? 0; WEATHER.lightning = p.lightning ?? 0;
  rainFx.u.uColor.value.set(p.rainColor ?? '#a8b8d0').multiplyScalar(CFG.map.rainBright ?? 0.7);   // 색은 config 밝기 배율만큼 어둡게
  WEATHER.sandCol.set(p.sandColor ?? '#c8a070');
  WEATHER.nextBolt = rr(3, 8); WEATHER.flash = 0;
}
const _wxC = new THREE.Vector3();
function updateStreaks(S, amount, dt, show) {
  const n = show ? Math.min(S.o.max, Math.round(S.o.per * amount)) : 0;
  S.m.geometry.setDrawRange(0, n * 2);
  S.m.visible = n > 0;
  if (!n) return;
  const u = S.u, wd = U.uWindDir.value, ws = U.uWind.value * S.o.wind;
  u.uTime.value = U.uTime.value;
  u.uWindD.value.copy(wd); u.uWindS.value = ws;
  u.uWindOfs.value.x += wd.x * ws * dt; u.uWindOfs.value.y += wd.y * ws * dt;
  u.uLight.value = Math.min(5, Math.max(0.3, lightLum(moon.intensity, moon.color, hemi.intensity, hemi.color) / WX_LREF));   // 조명 (번개 때 밝게)
  u.uFogC.value.copy(scene.fog.color); u.uFogN.value = scene.fog.near; u.uFogF.value = scene.fog.far;
  // 멀수록 성기게 하는 거리(o.far)는 카메라 → 화면 가운데 거리가 WX_REF_D m일 때 기준: 카메라가 멀면(미니어처) 그만큼 늘린다 (안 그러면 상자가 통째로 지워져 비가 안 보인다)
  u.uFar.value = S.o.far * Math.max(1, camera.position.distanceTo(controls.target) / WX_REF_D);
  // 상자 가운데: 화면 가운데와 카메라 사이 (카메라에 가까운 쪽이 크게 보이니 그쪽으로 조금 당긴다), 높이는 땅 위 조금
  _wxC.lerpVectors(controls.target, camera.position, 0.3);
  _wxC.y = controls.target.y + S.o.size[1] * 0.3;
  u.uCenter.value.copy(_wxC);
}
// 빗방울이 떨어지는 맨 위 표면: 탱크 위, 상자·드럼통 위, 보급품 위, 건물·벙커·잔해 지붕(경계 상자 안일 때만 아래로 광선), 아니면 풀 끝(밟히거나 탔으면 낮게) 또는 땅·물
function rainTop(x, z) {
  const g = groundAt(x, z), w = waterAt(x, z);
  let y = Math.max(g, w), hit = false;
  for (const T of TANKS) {
    if (!T.solid || Math.abs(T.pos.x - x) > 2.6 || Math.abs(T.pos.z - z) > 2.6) continue;
    if (Math.hypot(T.pos.x - x, T.pos.z - z) < (T.hx ?? HULL_HX) + 0.3) { y = Math.max(y, T.pos.y + (T.ht ?? 2.8) * rr(0.55, 0.85)); hit = true; }   // 차체 둘레 (대충 원으로)
  }
  for (const c of crates) {
    if (!c.alive || Math.abs(c.x - x) > c.s || Math.abs(c.z - z) > c.s) continue;
    const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    if (Math.abs(dx * cs - dz * sn) < c.s / 2 && Math.abs(dx * sn + dz * cs) < c.s / 2) { y = Math.max(y, c.y + c.s / 2); hit = true; }
  }
  for (const f of footprints) {
    if (f.target) { fpLocal(f, x, z, _fl); if (Math.abs(_fl.x) < f.hx && Math.abs(_fl.z) < f.hz) { y = Math.max(y, f.top); hit = true; } continue; }
    if (!f.group || !f.box || x < f.box.min.x || x > f.box.max.x || z < f.box.min.z || z > f.box.max.z) continue;
    _rayDown.set(_rdo.set(x, f.box.max.y + 1, z), _rdd); _rayDown.far = f.box.max.y - f.box.min.y + 2;
    const h = _rayDown.intersectObject(f.ray || f.group, true).find((o) => o.face);
    if (h) { y = Math.max(y, h.point.y); hit = true; }
  }
  if (!hit && w <= g) {   // 풀 끝 (풀잎 사이로도 떨어지니 높이는 섞는다)
    const k = cellOf(x, z);
    if (k >= 0 && grassHt[k] > 0) y = g + grassHt[k] * rr(0.3, 0.9) * fGrow[k] * (1 - 0.75 * fTr[k]);
  }
  return y;
}
// ---- 화면에 맺히는 빗방울 (config map.lensDrops): 게임 해상도 '물방울 지도'(rt와 같은 크기, rg = 굴절 방향, b = 밝기, a = 진하기. 방울 안은 모두 같은 값: 납작한 PS1 느낌)를 JS로 그려
// 후처리가 그만큼 화면을 어긋나게 읽는다 (방울 전체를 같은 만큼 어긋나게: 납작하게). 비 양 × 카메라가 비 오는 쪽을 볼수록 많이 맺히고,
// 큰 방울은 중력(화면 아래)과 카메라 기준 바람(화면 좌우)으로 흘러내린다. 방울이 없으면 아무것도 하지 않는다 (지도 올리기도 안 함)
const LD = Object.assign({ amount: 1, max: 50, refract: 1, life: 6, size: [2.5, 7.5], rim: [0.2, 1], rimDark: 0.34, highlight: 0.5, crescent: 0.3, morph: 1 }, CFG.map.lensDrops);
// 테두리 밝기 → 물방울 지도 b 값 (후처리: 화면 × (1 + (b/255 − 0.5) × 2 × 0.6)). k = 밝기 배율 − 1 (−면 어둡게)
const ldB = (k) => Math.max(0, Math.min(250, 127.5 * (1 + k / 0.6)));
const LD_RIM0 = LD.rim?.[0] ?? 0.2, LD_RIM1 = Math.max(LD_RIM0, LD.rim?.[1] ?? 1);
const LD_BD = ldB(-(LD.rimDark ?? 0.34)), LD_BH = ldB(LD.highlight ?? 0.5), LD_BC = ldB(LD.crescent ?? 0.3), LD_BT = ldB((LD.highlight ?? 0.5) * 1.15);   // 어두운 옆 · 하이라이트 · 초승달 · 하이라이트의 가는 곳
const LD_R0 = (LD.size?.[0] ?? 2.5) / 3, LD_R1 = Math.max(LD_R0, (LD.size?.[1] ?? 7.5) / 3), LD_SLIDE = LD_R0 + (LD_R1 - LD_R0) * 0.52;   // 반지름 (방울 단위 = 세로 300줄 기준 3픽셀), 이보다 크면 흘러내린다
// 방울의 움직임·크기는 '방울 단위'(화면 높이 = 100, 폭 = 100 × 화면 비율)로 셈하고, 찍을 때만 게임 픽셀로 늘린다 (LDS = 게임 픽셀 ÷ 방울 단위)
let LDROP_W = 160, LDROP_H = 100, LDS = 3;
const lensDrops = [];
let LDROP_TEX = makeDropTex(2, 2);
function makeDropTex(w, h) {
  const t = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h);
  t.magFilter = t.minFilter = THREE.NearestFilter;   // 게임 픽셀 그대로 또렷하게
  t.needsUpdate = true;
  return t;
}
// 지도 크기를 게임 화면(rt)에 맞춘다. 크기가 바뀌면 텍스처를 새로 만든다 (three.js는 처음 올린 크기로 잡아 두고 덮어쓰기만 한다)
function fitDropTex() {
  const w = rt.width, h = rt.height;
  LDROP_H = 100; LDROP_W = 100 * w / h; LDS = h / 100;
  if (LDROP_TEX.image.width === w && LDROP_TEX.image.height === h) return;
  LDROP_TEX.dispose(); LDROP_TEX = makeDropTex(w, h);
  postMat.uniforms.tDrop.value = LDROP_TEX;
}
let dropAcc = 0, dropShown = false;
const _ldF = new THREE.Vector3(), _ldR = new THREE.Vector3();
function updateLensDrops(dt, amount) {
  fitDropTex();
  if (dt > 0 && amount > 0 && LD.amount > 0) {
    // 비가 오는 방향(바람만큼 기운 아래쪽)을 카메라가 마주 볼수록 많이: 마주 봄 = 카메라 앞 방향 · (비가 오는 쪽)
    const wd = U.uWindDir.value, ws = U.uWind.value * 10 / 36;   // 빗줄기와 같은 기울기 (rainFx: wind 10, fall 36)
    camera.getWorldDirection(_ldF);
    _ldR.set(-wd.x * ws, 1, -wd.y * ws).normalize();
    const face = 0.25 + 1.5 * Math.max(0, _ldF.dot(_ldR));
    for (dropAcc += dt * amount * face * 6 * LD.amount; dropAcc >= 1; dropAcc--) {
      if (lensDrops.length >= LD.max) { dropAcc = 0; break; }
      const r = rr(LD_R0, LD_R1) * (Math.random() < 0.15 ? 1.6 : 1), P = () => Math.random() * 6.283;   // (반지름: 방울 단위. 가끔 큰 방울)
      // 모양: 원에 각도마다 다른 물결(2·3·5번 꺾임)을 얹어 조금 불규칙하게. 테두리 두께도 각도마다 0.5~1.5픽셀 (h, w)
      lensDrops.push({ x: Math.random() * LDROP_W, y: Math.random() * LDROP_H, r, age: 0, life: rr(0.6, 1.3) * LD.life, wob: P(),
        h: [rr(0.04, 0.1), P(), rr(0.03, 0.08), P(), rr(0.02, 0.05), P()], w: [P(), P(), rr(0.3, 0.7)] });
    }
  }
  if (!lensDrops.length) { if (dropShown) { LDROP_TEX.image.data.fill(0); LDROP_TEX.needsUpdate = true; dropShown = false; postMat.uniforms.uDrop.value = 0; } return; }
  // 흘러내림: 반지름 LD_SLIDE 넘는 방울만 (클수록 빠르게, 가다 서다). 좌우는 카메라 오른쪽으로 부는 바람만큼.
  // 흐르는 동안 0.7칸마다 조금씩 작아진다 (지나온 자리에 물을 흘리는 셈. 작아지면 멈춘다)
  camera.getWorldDirection(_ldF); _ldR.set(-_ldF.z, 0, _ldF.x).normalize();   // 화면 오른쪽 (월드 수평)
  const wd = U.uWindDir.value, side = (wd.x * _ldR.x + wd.y * _ldR.z) * U.uWind.value;
  const d = LDROP_TEX.image.data; d.fill(0);
  // 주광 방향을 화면에서 본 쪽 (테두리의 그쪽은 밝게): 빛 방향을 카메라 오른쪽·위쪽에 맞대 본다
  _ldF.copy(moon.position).sub(moon.target.position).normalize();
  const me = camera.matrixWorld.elements, lx = _ldF.x * me[0] + _ldF.y * me[1] + _ldF.z * me[2], ly = _ldF.x * me[4] + _ldF.y * me[5] + _ldF.z * me[6], ll = Math.hypot(lx, ly) || 1;
  ldLight.x = lx / ll; ldLight.y = ly / ll;
  // 합쳐짐: 두 방울 가장자리가 게임 화면 1픽셀 이내로 가까워지면 큰 쪽이 작은 쪽을 흡수 (넓이 = 물의 양은 그대로 → 커져서 흘러내리기도 한다)
  for (let i = lensDrops.length - 1; i > 0; i--) for (let j = i - 1; j >= 0; j--) {
    const A = lensDrops[i], B = lensDrops[j];
    if (Math.hypot(A.x - B.x, A.y - B.y) > A.r + B.r + 1 / LDS) continue;
    const [big, small] = A.r >= B.r ? [A, B] : [B, A], wa = big.r * big.r, wb = small.r * small.r;
    big.x = (big.x * wa + small.x * wb) / (wa + wb); big.y = (big.y * wa + small.y * wb) / (wa + wb);
    big.r = Math.sqrt(wa + wb); big.life = Math.max(big.life - big.age, small.life - small.age) + big.age;   // 남은 시간은 긴 쪽으로
    lensDrops.splice(lensDrops.indexOf(small), 1);
    break;   // (i번째가 바뀌었을 수 있으니 다음 i로)
  }
  for (let i = lensDrops.length - 1; i >= 0; i--) {
    const p = lensDrops[i];
    if ((p.age += dt) >= p.life) { lensDrops.splice(i, 1); continue; }
    if (p.r > LD_SLIDE) {
      const v = (p.r - LD_SLIDE) * 13 * (0.55 + 0.45 * Math.sin(p.age * 3 + p.wob)), mx = side * v * 0.25 * dt, my = -v * dt;
      p.x += mx; p.y += my;
      { const m = Math.hypot(mx, my) * 0.53 * (LD.morph ?? 1); p.h[1] += m; p.h[3] -= m * 0.7; p.h[5] += m * 1.3; p.w[0] += m * 1.1; p.w[1] -= m * 0.8; }   // 흘러내리는 동안 테두리 모양·두께가 꿈틀꿈틀 바뀐다
      for (p.tr = (p.tr || 0) + Math.hypot(mx, my); p.tr >= 0.7; p.tr -= 0.7) p.r -= 0.012;
    }
    if (p.y < -p.r || p.x < -p.r || p.x > LDROP_W + p.r) { lensDrops.splice(i, 1); continue; }
    const fade = Math.min(1, p.age * 6) * Math.min(1, (p.life - p.age) / 1.2);   // 맺히자마자 선명, 마르며 옅어진다
    stampDrop(d, p, Math.round(255 * fade), true);
  }
  LDROP_TEX.needsUpdate = true; dropShown = true;
  postMat.uniforms.uDrop.value = 1;
}
// 방울 하나를 지도에 찍는다: 안쪽은 모두 같은 값(납작하게, 뒤 화면을 조금 위에서 읽고 살짝 밝게).
// 방울 아래쪽은 조금 길쭉하게 (흘러내리는 무게), 테두리는 각도마다 조금씩 들쭉날쭉 (p.h). rim이면 가장자리(0.5~1.5픽셀, p.w)를
// 둘레 띠만 음영 + 조금 더 어긋나게 = 물방울의 '약간의 두께': 주광 쪽으로 갈수록 밝은 하이라이트, 반대쪽은 초승달, 옆은 어둡게 (점진적으로).
const ldLight = { x: -0.5, y: 0.8 };
function stampDrop(d, p, a, rim) {
  if (a <= 0) return;
  const S = LDS, TW = LDROP_TEX.image.width, TH = LDROP_TEX.image.height, h = p.h, w = p.w;
  const R = p.r * (h ? 1 + h[0] + h[2] + h[4] : 1);   // 물결까지 담는 크기
  const x0 = Math.max(0, Math.floor((p.x - R) * S)), x1 = Math.min(TW - 1, Math.ceil((p.x + R) * S));
  const y0 = Math.max(0, Math.floor((p.y - R * 1.15) * S)), y1 = Math.min(TH - 1, Math.ceil((p.y + R) * S));   // (지도는 아래 줄이 0)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const sx = (x + 0.5) / S, sy = (y + 0.5) / S;   // 방울 단위로
    const dx = (sx - p.x) / p.r, dy = (sy - p.y) / (p.r * (sy < p.y ? 1.15 : 1)), q = dx * dx + dy * dy;
    if (q >= 1.4) continue;
    const ang = h || rim ? Math.atan2(dy, dx) : 0;
    const f = h ? 1 + h[0] * Math.sin(2 * ang + h[1]) + h[2] * Math.sin(3 * ang + h[3]) + h[4] * Math.sin(5 * ang + h[5]) : 1;   // 그 각도의 반지름 배율
    const nr = Math.sqrt(q) / f;
    if (nr >= 1) continue;
    const k = (y * TW + x) * 4;
    if (a <= d[k + 3]) continue;
    // 테두리 두께 (게임 픽셀, lensDrops.rim 범위): 두 물결을 섞어 1.8배로 키운 뒤 잘라, 굵은 곳·가는 곳이 또렷하게 갈린다
    const rwt = w ? 0.5 + 0.5 * Math.max(-1, Math.min(1, 1.8 * (Math.sin(2 * ang + w[0]) * w[2] + Math.sin(3 * ang + w[1]) * (1 - w[2])))) : 1;   // 0 = 가장 가늘게, 1 = 가장 굵게
    const rw = LD_RIM0 + (LD_RIM1 - LD_RIM0) * rwt;
    // 음영은 둘레(두께) 띠에만, 단색 3단: 주광 쪽은 밝은 하이라이트, 반대쪽은 조금 밝은 초승달, 그 사이(옆)는 어둡게. 안쪽은 평평하게
    const edge = (1 - nr) * p.r * f * S;   // 가장자리까지 (게임 픽셀)
    if (rim && edge < rw) {
      const n = Math.hypot(dx, dy) || 1, lit = (dx * ldLight.x + dy * ldLight.y) / n;
      d[k] = 128 + dx * 50; d[k + 1] = 168 + dy * 50;   // 바깥쪽으로 조금 더 어긋나게
      // 밝기는 점진적으로: 주광 쪽으로 갈수록 하이라이트, 반대쪽으로 갈수록 초승달, 옆은 어둡게. 하이라이트의 가는 곳은 조금 더 밝게
      const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      const hl = sm(0.15, 0.95, lit), cr = sm(0.2, 1, -lit), thin = 1 - rwt;
      d[k + 2] = Math.round(Math.min(250, LD_BD + hl * (LD_BH + (LD_BT - LD_BH) * thin - LD_BD) + cr * (LD_BC - LD_BD)));
    } else { d[k] = 128; d[k + 1] = 168; d[k + 2] = 146; }
    d[k + 3] = a;
  }
}
function updateWeather(dt) {
  const show = titleK > 0.5;   // 타이틀(밝은 낮)에서는 날씨 없음. 시작하면 나타난다
  const wk = clearSeq ? 1 - clearSeq.k : 1;   // 임무 완료: 카메라가 넘어가는 동안 날씨를 서서히 끈다
  updateStreaks(rainFx, WEATHER.rain * wk, dt, show);
  updateLensDrops(dt, show ? WEATHER.rain * wk : 0);   // 화면에 맺히는 빗방울
  // 모래바람: 바닥 가까이 낮게 깔려 바람 따라 흘러가는 큼직한 모래 연기 (바람 먼지와 같은 식, 더 크고 많이)
  if (show && WEATHER.sand * wk > 0 && dt > 0) {
    const wd = U.uWindDir.value, ws = U.uWind.value, c = controls.target, sc = WEATHER.sandCol;
    const lk = Math.min(1.6, Math.max(0.35, lightLum(moon.intensity, moon.color, hemi.intensity, hemi.color) / WX_LREF)) * 0.55;   // 조명만큼 (밤엔 어둡게)
    const c0 = [sc.r * lk, sc.g * lk, sc.b * lk, 0.34], c1 = [sc.r * lk * 0.9, sc.g * lk * 0.9, sc.b * lk * 0.9, 0];
    for (WEATHER.sandAcc += dt * WEATHER.sand * wk * 26 * (0.3 + ws); WEATHER.sandAcc >= 1; WEATHER.sandAcc--) {
      const x = c.x + rr(-34, 34) - wd.x * 14, z = c.z + rr(-34, 34) - wd.y * 14;   // 바람 위쪽에서 생겨 화면을 가로질러 간다
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      const sp = rr(3, 6) * (0.4 + ws);
      smokeP.spawn(x, groundAt(x, z) + rr(0.1, 0.7), z, wd.x * sp + rr(-0.5, 0.5), rr(0, 0.35), wd.y * sp + rr(-0.5, 0.5), rr(2.6, 4.2), c0, c1, rr(2.2, 3.4), rr(5.5, 8.5), -0.04, 0.15, 0);
    }
  }
  // 빗방울이 튀는 물보라 (카메라가 보는 곳 둘레. 맨 위 표면에서. 빗줄기와 따로, 빗줄기 수에 비례): 납작하게 퍼지는 물방울 + 사방으로 튀는 작은 방울 둘
  if (show && WEATHER.rain * wk > 0 && dt > 0) {
    const c = controls.target, rc = rainFx.u.uColor.value, lk = rainFx.u.uLight.value * 1.4;   // 빗줄기와 같은 색·조명
    const c0 = [rc.r * lk, rc.g * lk, rc.b * lk, 0.75], c1 = [rc.r * lk, rc.g * lk, rc.b * lk, 0];
    for (WEATHER.splashAcc += dt * WEATHER.rain * wk * (CFG.map.rainCount ?? 1600) * 0.1; WEATHER.splashAcc >= 1; WEATHER.splashAcc--) {
      const x = c.x + rr(-24, 24), z = c.z + rr(-24, 24);
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      const y = rainTop(x, z) + 0.04;   // 탱크·상자·건물·풀 위에서도 튄다
      smokeP.spawn(x, y, z, 0, 0.15, 0, rr(0.2, 0.3), c0, c1, 0.08, rr(0.32, 0.48), 0, 0, 0.4);   // 퍼지는 물방울
      for (let k = 0; k < 2; k++) { const a = rand() * 6.283, s = rr(0.5, 1.1); smokeP.spawn(x, y, z, Math.cos(a) * s, rr(1.4, 2.4), Math.sin(a) * s, rr(0.28, 0.4), c0, c1, 0.08, 0.06, 9, 0, 0.6); }   // 튀는 방울
    }
  }
  // 번개: 하늘 전체가 번쩍 (주광·하늘빛을 잠깐 크게), 조금 뒤 천둥
  if (show && !clearSeq && WEATHER.lightning > 0 && dt > 0 && (WEATHER.nextBolt -= dt) <= 0) {   // (임무 완료 화면에서는 번개 없음)
    WEATHER.nextBolt = rr(4, 16) / WEATHER.lightning;
    WEATHER.flashT = 0; WEATHER.flash = 1;
    sfx.thunder(rr(0.4, 2.2));
  }
  if (WEATHER.flash > 0) {
    WEATHER.flashT += dt;
    const t = WEATHER.flashT;   // 두 번 번쩍: 0~0.08초, 0.16~0.3초
    const k = t < 0.08 ? 1 : t < 0.16 ? 0.15 : t < 0.3 ? 0.7 * (1 - (t - 0.16) / 0.14) : 0;
    applyEnv();
    moon.intensity += k * 14 * titleK; hemi.intensity += k * 3 * titleK;
    if (t >= 0.3) { WEATHER.flash = 0; applyEnv(); }
  }
  // 빗소리·바람 소리 (0.25초마다 맞춘다)
  if ((WEATHER.sndT -= dt) <= 0) {
    WEATHER.sndT = 0.25;
    const on = show ? wk : 0;   // 임무 완료 화면: 빗소리·바람 소리도 서서히 끈다
    sfx.weather(WEATHER.rain * on, U.uWind.value * on, WEATHER.sand * on);
  }
}
