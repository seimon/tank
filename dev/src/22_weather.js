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
function updateWeather(dt) {
  const show = titleK > 0.5;   // 타이틀(밝은 낮)에서는 날씨 없음. 시작하면 나타난다
  updateStreaks(rainFx, WEATHER.rain, dt, show);
  // 모래바람: 바닥 가까이 낮게 깔려 바람 따라 흘러가는 큼직한 모래 연기 (바람 먼지와 같은 식, 더 크고 많이)
  if (show && WEATHER.sand > 0 && dt > 0) {
    const wd = U.uWindDir.value, ws = U.uWind.value, c = controls.target, sc = WEATHER.sandCol;
    const lk = Math.min(1.6, Math.max(0.35, lightLum(moon.intensity, moon.color, hemi.intensity, hemi.color) / WX_LREF)) * 0.55;   // 조명만큼 (밤엔 어둡게)
    const c0 = [sc.r * lk, sc.g * lk, sc.b * lk, 0.34], c1 = [sc.r * lk * 0.9, sc.g * lk * 0.9, sc.b * lk * 0.9, 0];
    for (WEATHER.sandAcc += dt * WEATHER.sand * 26 * (0.3 + ws); WEATHER.sandAcc >= 1; WEATHER.sandAcc--) {
      const x = c.x + rr(-34, 34) - wd.x * 14, z = c.z + rr(-34, 34) - wd.y * 14;   // 바람 위쪽에서 생겨 화면을 가로질러 간다
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      const sp = rr(3, 6) * (0.4 + ws);
      smokeP.spawn(x, groundAt(x, z) + rr(0.1, 0.7), z, wd.x * sp + rr(-0.5, 0.5), rr(0, 0.35), wd.y * sp + rr(-0.5, 0.5), rr(2.6, 4.2), c0, c1, rr(2.2, 3.4), rr(5.5, 8.5), -0.04, 0.15, 0);
    }
  }
  // 빗방울이 튀는 물보라 (카메라가 보는 곳 둘레. 맨 위 표면에서. 빗줄기와 따로, 빗줄기 수에 비례): 납작하게 퍼지는 물방울 + 사방으로 튀는 작은 방울 둘
  if (show && WEATHER.rain > 0 && dt > 0) {
    const c = controls.target, rc = rainFx.u.uColor.value, lk = rainFx.u.uLight.value * 1.4;   // 빗줄기와 같은 색·조명
    const c0 = [rc.r * lk, rc.g * lk, rc.b * lk, 0.75], c1 = [rc.r * lk, rc.g * lk, rc.b * lk, 0];
    for (WEATHER.splashAcc += dt * WEATHER.rain * (CFG.map.rainCount ?? 1600) * 0.1; WEATHER.splashAcc >= 1; WEATHER.splashAcc--) {
      const x = c.x + rr(-24, 24), z = c.z + rr(-24, 24);
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      const y = rainTop(x, z) + 0.04;   // 탱크·상자·건물·풀 위에서도 튄다
      smokeP.spawn(x, y, z, 0, 0.15, 0, rr(0.2, 0.3), c0, c1, 0.08, rr(0.32, 0.48), 0, 0, 0.4);   // 퍼지는 물방울
      for (let k = 0; k < 2; k++) { const a = rand() * 6.283, s = rr(0.5, 1.1); smokeP.spawn(x, y, z, Math.cos(a) * s, rr(1.4, 2.4), Math.sin(a) * s, rr(0.28, 0.4), c0, c1, 0.08, 0.06, 9, 0, 0.6); }   // 튀는 방울
    }
  }
  // 번개: 하늘 전체가 번쩍 (주광·하늘빛을 잠깐 크게), 조금 뒤 천둥
  if (show && WEATHER.lightning > 0 && dt > 0 && (WEATHER.nextBolt -= dt) <= 0) {
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
    const on = show ? 1 : 0;
    sfx.weather(WEATHER.rain * on, U.uWind.value * on, WEATHER.sand * on);
  }
}
