// ---------------------------------------------------------------- 입력
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (UI.screen === pauseUI && e.code === 'KeyT' && !pauseUI.titleMode) { sfx.ui('button'); uiPress('title'); confirmUI.mode = 'title'; uiShow(confirmUI); }
  else if (UI.screen === pauseUI && pauseUI.tab === 3 && e.code === 'KeyR') { sfx.ui('button'); uiPress('reset'); confirmUI.mode = 'reset'; uiShow(confirmUI); }   // 설정: R = 모두 초기 값으로 (확인 창)   // 일시정지: T = 첫 화면으로 (확인 창)
  else if (UI.screen === pauseUI && pauseUI.tab === 3 && ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) pauseUI.setKey(e.code);   // '설정' 탭: W/S 항목, A/D 값
  else if (UI.screen === pauseUI && (e.code === 'KeyW' || e.code === 'KeyS') && !e.repeat) pauseUI.nudge(e.code === 'KeyW' ? -1 : 1);   // 강화 기록 넘겨 보기 (누르고 있으면 tick이 계속 넘긴다)
  else if (UI.screen === pauseUI && (e.code === 'KeyA' || e.code === 'KeyD')) pauseUI.toEnd(e.code === 'KeyD');   // 강화 기록 맨 위(A) / 맨 아래(D)
  else if (UI.screen === pauseUI && (e.code === 'KeyQ' || e.code === 'KeyE')) pauseUI.step(e.code === 'KeyE' ? 1 : -1);   // 탭: Q 왼쪽, E 오른쪽
  else if (UI.screen === confirmUI) { if (e.code === 'KeyY') { sfx.ui('button'); uiPress('yes'); confirmUI.yes(); } else if (e.code === 'KeyN') { sfx.ui('button'); uiPress('no'); uiShow(pauseUI); } }
  if (paused) return;
  if (e.code === 'KeyG' && titleState === 'play') {   // G: 적군 섬멸이면 새로 시작, 파괴됐으면 재출격, 아니면 세우기
    if (endState === 'clear') { sfx.ui('button'); uiPress('restart'); restartGame(false); }
    else if (endState === 'dead') { if (continuesLeft > 0) { sfx.ui('button'); uiPress('respawn'); } respawn(); }
    else if (!winUp()) uprightTank();   // 창이 떠 있으면 세우기도 안 됨
  }
  if (e.code === 'KeyT' && (endState === 'clear' || endState === 'dead') && winUp()) { sfx.ui('button'); uiPress('title'); restartGame(true); }   // T: 첫 화면으로 (전투 불능·적군 섬멸 창)
});
// 뒤집혔을 때 세운다 (G키, 터치 '세우기' 버튼): 포탄 한 발을 쏜 것처럼 장전돼 있을 때만 되고, 하면 한 발 소모 (포탄은 안 나감)
function uprightTank() {
  if (!tank.solid || tank.cool > 0) return;
  tank.cool = tank.reload;
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  if (Math.abs(tank.pos.x) < HALF - 2 && Math.abs(tank.pos.z) < HALF - 2) {
    const yaw = Math.atan2(_fwd.x, _fwd.z), o = openHopSpot(tank.pos.x, tank.pos.z);   // 주변이 트여 있으면 null → 제자리
    if (o) hopUpright(tank, o.x, o.z, yaw, true);   // 밀려나도 차체 방향은 그대로
    else hopUpright(tank, tank.pos.x, tank.pos.z, yaw);
    // 세우는 값: 남은 HP가 1이 되도록 (이미 1이면 대미지 없음). 대미지 숫자도
    const hp = Math.round(tank.hp);
    if (hp > 1 && !rulesLocked()) { tank.hp = 1; dmgTextHit(tank, hp - 1, null); hudHit(hp - 1); }
  } else spawnTank();
}
// 건물 사이에 낀 탱크가 G로 빠져나올 수 있게: 주변이 이미 트여 있으면 null(제자리에서 세운다), 막혀 있으면 가장 트인 쪽으로 (고른 자리까지의 절반만큼) 튀어올라 차체 방향 그대로 내려앉는다.
// 트임 = 그 자리에서 16방향 중 6m 넘게 막힘 없는 방향 수 (8방향 이상이면 트인 곳). 길이 열렸다 = 건물에서 1.6m 넘게 떨어져 탱크가 지나갈 수 있다
const OPEN_N = 16, OPEN_LEN = 6, OPEN_NEED = 8, PATH_M = 1.6;
function pathFree(x, z) {
  if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3 || inFootprint(x, z, PATH_M) || cliffG[gridIndex(x, z)] > 0.3) return false;
  for (const p of allPoles) if (Math.hypot(p.x - x, p.z - z) < 1.8) return false;
  return true;   // (시냇물은 건너갈 수 있으니 막지 않는다)
}
function freeLen(x, z, a, max = 24) {   // 그 방향으로 막힘 없이 몇 m 가는가 (0.75m 간격)
  const sx = Math.sin(a), cz = Math.cos(a);
  for (let d = 0.75; d <= max; d += 0.75) if (!pathFree(x + sx * d, z + cz * d)) return d - 0.75;
  return max;
}
function openCount(x, z) {
  let n = 0;
  for (let i = 0; i < OPEN_N; i++) if (freeLen(x, z, i / OPEN_N * 6.2832, OPEN_LEN) >= OPEN_LEN) n++;
  return n;
}
function hopLandOK(x, z) {   // 떨어져 앉을 수 있는 자리 (landSpot과 같은 조건: 땅 위, 물길·다리·절벽·급경사·전봇대·다른 탱크와 떨어진 곳)
  if (Math.abs(x) > HALF - 7 || Math.abs(z) > HALF - 7 || creekD[gridIndex(x, z)] < CREEK_HW + 1 || bridgeDeckAt(x, z) > -1e8 || inFootprint(x, z, 2.6)) return false;
  if (allPoles.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) return false;
  if (TANKS.some((T) => T !== tank && (T.solid || T.falling) && Math.hypot(T.pos.x - x, T.pos.z - z) < 6)) return false;
  let cliff = 0;
  for (const [a, b] of [[0, 0], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) cliff = Math.max(cliff, cliffG[gridIndex(x + a, z + b)]);
  if (cliff > 0.05) return false;
  const hs = [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].map(([a, b]) => heightAt(x + a, z + b));
  return Math.max(...hs) - Math.min(...hs) <= 1.4;
}
function openHopSpot(x, z) {
  if (bridgeDeckAt(x, z) > -1e8) return null;   // 다리 위에서는 제자리
  const here = openCount(x, z);
  if (here >= OPEN_NEED) return null;
  let best = null;
  for (let i = 0; i < OPEN_N; i++) {
    const a = i / OPEN_N * 6.2832, len = freeLen(x, z, a);
    for (const d of [4.5, 6.5, 9, 12, 16, 20, 24]) {
      if (len < d) break;   // 그 방향 길이 열려 있는 만큼만 (건물 너머 안뜰로 넘어가지 않는다)
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (!hopLandOK(px, pz)) continue;
      const score = openCount(px, pz) * 100 - d;   // 더 트인 곳, 같으면 가까운 곳 (트인 정도가 같으면 가장 가까운 자리)
      if (!best || score > best.score) best = { x: px, z: pz, yaw: a, dist: d, score, n: Math.round((score + d) / 100) };
    }
  }
  if (!best || best.n <= here) return null;   // 지금보다 더 트인 곳이 없으면 제자리
  // 밀리는 거리는 고른 자리까지의 절반. 그 자리에 앉을 수 없으면 조금씩 더 멀리 (끝은 고른 자리)
  for (const f of [0.5, 0.6, 0.7, 0.8, 0.9]) {
    const px = x + (best.x - x) * f, pz = z + (best.z - z) * f;
    if (hopLandOK(px, pz)) return { ...best, x: px, z: pz, dist: best.dist * f };
  }
  return best;
}
// 그 자리에서 resetLift(m)만큼 붕 떠올랐다가 떨어지며 자세를 잡는다. 올라가는 동안 바른 자세로 돌아가고, 착지는 낙하와 같은 처리
const _hq = new THREE.Quaternion(), _hp = new THREE.Vector3();
// move: 다른 자리로 넘어간다 → 그쪽으로 45도로 쏘아 올린 포물선 (수평으로 줄곧 나아가며 떠올랐다 내려앉는다)
function hopUpright(T, x, z, yaw, move = false) {
  _hq.copy(T.q); _hp.copy(T.pos);
  resetTank(x, z, yaw, T);   // 바른 자세와 착지 높이
  const g = 22, dh = T.pos.y - _hp.y, D = Math.hypot(T.pos.x - _hp.x, T.pos.z - _hp.z);
  T.hop = { q0: _hq.clone(), q1: T.q.clone(), p0: _hp.clone(), p1: T.pos.clone(), t: 0 };
  if (move && D > 0.5) {
    // 45도: 처음 위로 가는 속도 = 수평 속도 = v. D만큼 나아가 dh 높이에 닿는 v. 내려앉을 곳이 높아 45도로 못 닿으면 더 가파르게
    let vy, vh;
    if (D - dh > 0.6) vy = vh = Math.sqrt(g * D * D / (2 * (D - dh)));
    else { vy = Math.sqrt(2 * g * (Math.max(0, dh) + 1.5)); vh = D / ((vy + Math.sqrt(Math.max(0, vy * vy - 2 * g * dh))) / g); }
    const fly = D / vh;
    Object.assign(T.hop, { fly, vx: (T.pos.x - _hp.x) / fly, vz: (T.pos.z - _hp.z) / fly, vy0: vy, up: fly * 0.7 });   // 자세는 날아가는 시간의 70% 동안 바로잡는다
    T.vy = vy;
  } else {
    const lift = PC.resetLift ?? 4;
    T.hop.up = Math.sqrt(2 * g * (lift + Math.max(0, dh))) / g;
    T.vy = T.hop.up * g;
  }
  T.landY = T.pos.y; T.pos.copy(_hp); T.q.copy(_hq);
  T.falling = true; T.solid = false;
  landFx(T, true);   // 떠오르는 순간: 내려앉을 때와 같은 흙먼지·소리 (원래 있던 바닥에서)
  syncBody(T);
}
// 터치 조작: 아날로그 패드(위 = 전진, 좌우 = 선회)와 누르고 있는 동안 유지되는 버튼들. 마우스로도 된다
const touch = { thr: 0, steer: 0, up: false, down: false, fire: false, tl: false, tr: false };
// 게임패드 (81_ui.js padPoll이 매 프레임 채운다): 주행·선회·포탑·포각은 아날로그, fire = 발사 버튼을 누르고 있음
const pad = { thr: 0, steer: 0, tq: 0, de: 0, fire: false };
{
  const stick = document.getElementById('stick'), knob = document.getElementById('knob'), R = 50;
  let id = null;
  const move = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = (v) => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;   // 가운데 살짝은 무시
    touch.thr = dead(-dy / R); touch.steer = dead(-dx / R);
  };
  const end = () => { id = null; touch.thr = touch.steer = 0; knob.style.transform = ''; };
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (_) {} };   // 손가락이 패드 밖으로 나가도 계속 따라가게
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; capture(stick, e); move(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const hold = (btnId, key) => {
    const b = document.getElementById(btnId);
    const on = (v) => (e) => { touch[key] = v; b.classList.toggle('on', v); if (v) capture(b, e); e.preventDefault(); };
    b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointercancel', on(false));
  };
  hold('tUp', 'up'); hold('tDown', 'down'); hold('tFire', 'fire'); hold('tTL', 'tl'); hold('tTR', 'tr');
  document.getElementById('tFix').addEventListener('pointerdown', (e) => { uprightTank(); e.preventDefault(); });
  // 메뉴 토글. 처음엔 숨기고, 화면을 손가락으로 만지면 나타나고 키보드·게임패드를 쓰면 다시 숨긴다 (아이패드에 키보드를 연결해 할 때 계속 보이지 않게)
  const ui = document.getElementById('touchUI'), btn = document.getElementById('touchBtn');
  const show = (v) => { if ((ui.style.display !== 'none') === v) return; ui.style.display = v ? '' : 'none'; btn.textContent = v ? '터치 버튼 켜짐' : '터치 버튼 꺼짐'; };
  btn.onclick = (e) => { show(ui.style.display === 'none'); e.target.blur(); };
  show(false);
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') show(true); }, true);
  addEventListener('keydown', () => show(false), true);
}
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- PS1 후처리: 저해상도 + 15비트 색 + 디더링
const rt = new THREE.WebGLRenderTarget(2, 2, {
  type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
});
rt.depthTexture = new THREE.DepthTexture(2, 2);   // 외곽선: 풀·땅에 가려진 가장자리는 긋지 않도록 화면 깊이와 비교
// 외곽선용 깊이: 레이어 1 물체만 색 없이 깊이로 (정점 떨림은 화면과 같게)
const olRT = new THREE.WebGLRenderTarget(2, 2, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthTexture: new THREE.DepthTexture(2, 2) });
// 임무 완료: 내 탱크만 따로 그린 화면 (배경은 clear.background 단색). 후처리가 4x4 디더링으로 이쪽으로 바꿔 간다 (52_clear.js)
const cutRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
cutRT.depthTexture = new THREE.DepthTexture(2, 2);
const olMat = ps1(new THREE.MeshBasicMaterial({ colorWrite: false }), null, 'outlineDepth');
let outlineOn = false;
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 가운데 창(전투 불능·적군 섬멸·일시정지·확인) 설정: 배경 회색조 두 색과 전환 시간, 창이 사라지는 시간, 창 색
const POPC = CFG.popup || {};
const POP = { dark: POPC.grayDark || '#191d20', light: POPC.grayLight || '#7b919b', grayTime: POPC.grayTime ?? 0.4, fade: POPC.fadeTime ?? 0.4,
  pause: POPC.pauseColor || '#cc8000', confirm: POPC.confirmColor || '#e0533c', dead: POPC.deadColor || '#e0533c', clear: POPC.clearColor || '#00b37d' };
const hexV3 = (h) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));   // 색 그대로 (sRGB, 후처리도 sRGB에서 섞는다)
// 복셀 안개 (설정 메뉴 '복셀 안개', config voxelFog): 땅을 따라 height m 두께로 cell m 크기의 각진 안개 덩어리가 깔리고 천천히 흘러간다.
// 후처리에서 깊이로 화면 픽셀마다 보이는 자리를 되찾고, 거기서 카메라 쪽으로 march번 거슬러 올라가며 지나는 칸(복셀)마다 짙기를 쌓는다
// (칸 가운데에서 3D 노이즈 × 땅에서 높이 × 걷힘). 칸 안은 한 값이라 옆면까지 각진 덩어리로 보인다.
// 땅 높이는 지형 격자를 1m 텍스처(VF_TEX)로 한 번 굽는다.
// 걷힘은 '흉내 유체'(GPU, 128×128 = 보드 150m): 칸마다 걷힘(r)과 흐름 속도(g, b, m/s). 매 프레임 한 번 그려서
//   흐름을 따라 옮기고(semi-Lagrangian) → 잔잔한 소용돌이(curl 노이즈) → 바람 쪽으로 가라앉음 → 밀기(내 탱크·대포·폭발) → 천천히 다시 참.
//   압력 계산은 하지 않는다 (가볍게). 안개 무늬도 흐름만큼 살짝 밀려 보인다(flowWarp)
const VF = Object.assign({ enabled: false, height: 2.5, cell: 1.5, density: 1.0, scale: 0.09, speed: 0.35, color: '#94a0b0', steps: 4, march: 6,
  tankRadius: 3, blastRadius: 7, refill: 6, swirl: 1.5, damping: 1.2, windFollow: 0.3, cannonPush: 14, flowWarp: 0.4 }, CFG.voxelFog);
let vfOn = !!VF.enabled;
const VF_N = 151;
// 땅 높이 텍스처·유체 격자는 처음 켤 때 만든다 (꺼져 있으면 아무것도 만들지 않고, 매 프레임 일도 하지 않는다)
let VF_TEX = null, vfFluid = null;
function vfInit() {
  if (vfFluid) return;
  const d = new Uint16Array(VF_N * VF_N);
  for (let z = 0; z < VF_N; z++) for (let x = 0; x < VF_N; x++) d[z * VF_N + x] = THREE.DataUtils.toHalfFloat(heightAt(x - HALF, z - HALF));
  VF_TEX = new THREE.DataTexture(d, VF_N, VF_N, THREE.RedFormat, THREE.HalfFloatType);
  VF_TEX.magFilter = VF_TEX.minFilter = THREE.LinearFilter; VF_TEX.needsUpdate = true;
  vfFluid = [0, 1].map(() => new THREE.WebGLRenderTarget(VF_FN, VF_FN, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false }));
  postMat.uniforms.tHgt.value = VF_TEX; postMat.uniforms.tClr.value = vfFluid[0].texture;
}
const VF_FN = 128, VF_IMP = 8;
let vfCur = 0, vfT = 0;
const vfImps = [];   // 다음 한 번만 넣을 밀기: { x, z, r, push(바깥으로 m/s), dx, dz(그 방향으로 m/s), clear(0~1) }
const vfFluidMat = new THREE.ShaderMaterial({
  uniforms: { tPrev: { value: null }, uDt: { value: 0 }, uT: { value: 0 }, uSwirl: { value: VF.swirl }, uDamp: { value: VF.damping }, uRefill: { value: VF.refill },
    uWind: { value: new THREE.Vector2() }, uImp: { value: Array.from({ length: VF_IMP }, () => new THREE.Vector4()) }, uImpD: { value: Array.from({ length: VF_IMP }, () => new THREE.Vector4()) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tPrev; uniform float uDt, uT, uSwirl, uDamp, uRefill; uniform vec2 uWind; uniform vec4 uImp[${VF_IMP}], uImpD[${VF_IMP}]; varying vec2 vUv;
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    vec2 curl(vec2 p) { const float e = 0.5; return vec2(n2(p + vec2(0, e)) - n2(p - vec2(0, e)), n2(p - vec2(e, 0)) - n2(p + vec2(e, 0))) / (2.0 * e); }
    void main() {
      vec4 s = texture2D(tPrev, vUv - texture2D(tPrev, vUv).gb * uDt / 150.0);   // 흐름을 따라 거슬러 가서 가져온다
      float c = s.r; vec2 v = s.gb, w = vUv * 150.0 - 75.0;   // w = 월드 xz
      v += curl(w * 0.12 + uT * 0.15) * uSwirl * uDt;   // 잔잔한 소용돌이
      v = uWind + (v - uWind) * exp(-uDamp * uDt);   // 바람 쪽으로 가라앉는다
      for (int i = 0; i < ${VF_IMP}; i++) {   // 밀기
        vec4 I = uImp[i]; if (I.z <= 0.0) continue;
        vec2 d = w - I.xy; float r = length(d), k = 1.0 - smoothstep(0.0, I.z, r);
        if (k <= 0.0) continue;
        vec4 D = uImpD[i];
        v += ((r > 0.01 ? d / r : vec2(0.0)) * I.w + D.xy) * k;
        c = max(c, D.z * k);
      }
      c = max(0.0, c - uDt / uRefill);   // 다시 찬다
      gl_FragColor = vec4(c, clamp(v, -25.0, 25.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const vfFluidScene = new THREE.Scene(), vfFluidCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
vfFluidScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vfFluidMat));
// 한 번 밀기 (대포·폭발): push = 바깥으로, (dx, dz) = 그 방향으로 (m/s), clear = 가운데를 걷는 정도
function vfPush(x, z, r, push, dx = 0, dz = 0, clear = 0) { if (vfOn && vfImps.length < VF_IMP - 1) vfImps.push({ x, z, r, push, dx, dz, clear }); }
function vfStamp(x, z, r) { vfPush(x, z, r, 16 * r / Math.max(1, VF.blastRadius), 0, 0, 0.9); }   // 폭발
// 유체 한 걸음 (게임이 멈추면 안 부른다). 내 탱크는 매 프레임 밀고, 한 번짜리 밀기는 이번에 넣고 비운다
function vfStep(dt) {
  if (!vfOn || !vfFluid || dt <= 0) return;
  vfT += dt;
  const u = vfFluidMat.uniforms, list = [];
  if (tank && tank.pos) { const sp = Math.hypot(tank.vel.x, tank.vel.z); list.push({ x: tank.pos.x, z: tank.pos.z, r: VF.tankRadius, push: (0.3 + sp * 0.5) * dt * 3, dx: tank.vel.x * dt * 2, dz: tank.vel.z * dt * 2, clear: 1 }   /* 서 있으면 거의 안 민다 (구멍만), 달릴수록 옆·앞으로 */); }
  list.push(...vfImps.splice(0));
  for (let i = 0; i < VF_IMP; i++) {
    const m = list[i];
    if (m) { u.uImp.value[i].set(m.x, m.z, m.r, m.push); u.uImpD.value[i].set(m.dx, m.dz, m.clear, 0); } else u.uImp.value[i].set(0, 0, 0, 0);
  }
  const wd = U.uWindDir.value, ws = U.uWind.value * VF.windFollow;
  u.uWind.value.set(wd.x * ws, wd.y * ws); u.uDt.value = Math.min(dt, 0.05); u.uT.value = vfT;
  const prev = vfFluid[vfCur], next = vfFluid[vfCur ^ 1];
  u.tPrev.value = prev.texture;
  renderer.setRenderTarget(next); renderer.render(vfFluidScene, vfFluidCam); renderer.setRenderTarget(null);
  vfCur ^= 1;
  postMat.uniforms.tClr.value = next.texture;
}
function vfReset() {   // 안개를 끄면 유체를 비운다 (지우는 색은 원래대로 돌려 둔다)
  if (!vfFluid) return;
  const c = renderer.getClearColor(new THREE.Color()), al = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const t of vfFluid) { renderer.setRenderTarget(t); renderer.clear(); }
  renderer.setRenderTarget(null); renderer.setClearColor(c, al);
}
const _vfM = new THREE.Matrix4();
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDrop: { value: LDROP_TEX }, uDrop: { value: 0 }, uDropR: { value: 0.035 * (LD.refract ?? 1) }, tDiffuse: { value: rt.texture }, tCut: { value: cutRT.texture }, tCutD: { value: cutRT.depthTexture }, uCut: { value: 0 }, uFlash: { value: 0 }, tDepth: { value: rt.depthTexture }, tOL: { value: olRT.depthTexture },
    uOL: { value: 0 }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTexel: { value: new THREE.Vector2(1, 1) },
    uFogN: FOGN, uFogF: FOGF, uFogC: { value: FOG },
    uGrad: { value: 0 }, uGradA: { value: 0.6 }, uGradB: { value: 0.9 }, uGradC: { value: new THREE.Color(1, 1, 1) },
    uGray: { value: 0 }, uGrayA: { value: hexV3(POP.dark) }, uGrayB: { value: hexV3(POP.light) }, uBright: { value: 1 },
    tHgt: { value: null }, tClr: { value: null }, uVFWarp: { value: VF.flowWarp }, uCamP: { value: new THREE.Vector3() }, uVFMarch: { value: VF.march }, uInvPV: { value: new THREE.Matrix4() }, uVF: { value: 0 }, uVFTop: { value: VF.height }, uVFCell: { value: VF.cell }, uVFDen: { value: VF.density },
    uVFScale: { value: VF.scale }, uVFT: { value: 0 }, uVFSteps: { value: VF.steps }, uVFC: { value: new THREE.Color(VF.color) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tHgt, tClr; uniform vec3 uCamP; uniform float uVFMarch, uVFWarp; uniform mat4 uInvPV; uniform float uVF, uVFTop, uVFCell, uVFDen, uVFScale, uVFT, uVFSteps; uniform vec3 uVFC;
    uniform sampler2D tDiffuse, tDepth, tOL, tCut, tCutD, tDrop; uniform float uCut, uDrop, uDropR, uFlash, uOL, uNear, uFar, uFogN, uFogF, uGrad, uGradA, uGradB, uGray, uBright; uniform vec2 uTexel; uniform vec3 uFogC, uGradC, uGrayA, uGrayB; varying vec2 vUv;
    float lin(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }   // 깊이 버퍼 값 → 카메라에서 거리
    float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float vfH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vfNoise(vec3 p) {   // 3D 값 노이즈 (0~1)
      vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(vfH(i), vfH(i + vec3(1, 0, 0)), f.x), mix(vfH(i + vec3(0, 1, 0)), vfH(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(vfH(i + vec3(0, 0, 1)), vfH(i + vec3(1, 0, 1)), f.x), mix(vfH(i + vec3(0, 1, 1)), vfH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    // 임무 완료: 지운 픽셀(cut)은 탱크만 그린 화면에서 (외곽선도 그 깊이로)
    float olD(vec2 uv, bool cut) { return cut ? texture2D(tCutD, uv).r : texture2D(tOL, uv).r; }
    float scD(vec2 uv, bool cut) { return cut ? texture2D(tCutD, uv).r : texture2D(tDepth, uv).r; }
    vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      bool cut = uCut > 0.0 && bayer4(gl_FragCoord.xy) < clamp(uCut * 2.0 - vUv.y, 0.0, 1.0);   // 화면 아래에서 위로 쓸어 올리며
      vec2 uvR = vUv; float dA = 0.0;
      if (uDrop > 0.0) { vec4 dr = texture2D(tDrop, vUv); dA = dr.a; uvR = clamp(vUv + (dr.rg - 0.5) * 2.0 * uDropR * dA, 0.0, 1.0); }   // 화면에 맺힌 빗방울: 그만큼 어긋나게 읽는다 (22_weather.js)
      vec3 lc = cut ? texture2D(tCut, uvR).rgb : texture2D(tDiffuse, uvR).rgb;
      if (dA > 0.0) { float b = texture2D(tDrop, vUv).b, db = (b - 0.5) * 2.0; lc = b > 0.99 ? mix(lc, vec3(0.75), dA) : lc * (1.0 + db * 0.6 * dA) + max(db - 0.2, 0.0) * 0.1 * dA; }   // 방울 밝기 (b): 둘레 어둡게, 초승달 밝게, 1 = 반짝 점(단색)
      if (uOL > 0.5) {
        // 외곽선: 물체 픽셀인데 이웃 중 훨씬 먼 곳(배경·뒤의 물체)이 있으면 1픽셀 선. 풀·땅에 가려진 곳은 빼고
        float d0 = olD(vUv, cut);
        if (d0 < 1.0) {
          float d = lin(d0);
          float m = max(max(lin(olD(vUv + vec2(uTexel.x, 0.0), cut)), lin(olD(vUv - vec2(uTexel.x, 0.0), cut))),
                        max(lin(olD(vUv + vec2(0.0, uTexel.y), cut)), lin(olD(vUv - vec2(0.0, uTexel.y), cut))));
          float seen = step(d - 0.3 - d * 0.02, lin(scD(vUv, cut)));
          float fk = max(d - uFogN, 0.0) * 2.0 / max(uFogF - uFogN, 0.001), fogK = 1.0 - exp(-fk * fk);   // 지형과 같은 안개: 멀수록 선 색이 안개 색으로 묻힌다
          if (m - d > 0.6 + d * 0.06) lc = mix(lc, mix(vec3(0.012, 0.01, 0.008), uFogC, fogK), 0.9 * seen);
        }
      }
      if (uVF > 0.0) {   // 복셀 안개: 보이는 자리에서 카메라 쪽으로 거슬러 올라가며 지나는 칸마다 짙기를 쌓는다
        float d = texture2D(tDepth, vUv).r;
        vec4 w = uInvPV * vec4(vUv * 2.0 - 1.0, (d < 1.0 ? d : 0.9999) * 2.0 - 1.0, 1.0);
        vec3 P = w.xyz / w.w, dir = normalize(uCamP - P);
        float len = min(distance(uCamP, P), uVFTop * 2.5 / max(dir.y, 0.25)), st = len / uVFMarch, tr = 1.0;   // 안개 층을 지나는 만큼만
        for (int i = 0; i < 12; i++) {
          if (float(i) >= uVFMarch) break;
          vec3 q = (floor((P + dir * (st * (float(i) + 0.5))) / uVFCell) + 0.5) * uVFCell;   // 칸 가운데
          vec2 tu = (q.xz + 75.0) / 151.0 + 0.5 / 151.0;
          float hy = q.y - texture2D(tHgt, tu).r;   // 땅에서 높이
          if (hy > uVFTop || hy < -uVFCell) continue;
          vec3 fl = texture2D(tClr, (q.xz + 75.0) / 150.0).rgb;   // 흉내 유체: r = 걷힘, gb = 흐름 (m/s)
          vec2 qw = q.xz - fl.gb * uVFWarp;   // 흐름만큼 무늬가 밀려 보인다
          float n = vfNoise(vec3(qw.x * uVFScale + uVFT, qw.y * uVFScale + uVFT * 0.6, q.y * uVFScale * 2.0 + uVFT * 0.25));
          float den = smoothstep(0.4, 0.7, n) * (1.0 - smoothstep(uVFTop * 0.4, uVFTop, hy)) * (1.0 - fl.r);
          tr *= exp(-den * uVFDen * st * 0.9);
        }
        float a = (1.0 - tr) * uVF;
        a = clamp(floor(a * uVFSteps + bayer4(gl_FragCoord.xy)) / uVFSteps, 0.0, 1.0);   // uVFSteps단계 + 4x4 디더
        lc = mix(lc, uVFC, a);
      }
      lc = mix(lc, uGradC, uGrad * smoothstep(uGradA, uGradB, vUv.y));   // 타이틀: 화면 위쪽으로 갈수록 흰색 (아래 → 위, 0~1)
      vec3 c = toSRGB(lc);
      c = pow(c, vec3(1.0 / uBright));   // 화면 밝기 (설정)
      c = mix(c, vec3(1.0, 0.94, 0.82), uFlash * 0.7);
      if (uGray > 0.0) c = mix(c, mix(uGrayA, uGrayB, dot(c, vec3(0.299, 0.587, 0.114))), uGray);   // 끝 창·일시정지: 밝기를 두 색 사이로 (그라디언트 맵)
      c = floor(c * 31.0 + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5)) / 31.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
postMat.uniforms.uVFC.value.convertSRGBToLinear();   // 장면 색(선형)에 섞는다
postMat.onBeforeRender = () => {   // 복셀 안개: 화면 → 월드 행렬, 흐르는 시간(게임 시간: 멈추면 같이 멈춘다)
  const u = postMat.uniforms;
  u.uVF.value = vfOn ? titleK : 0;   // 타이틀에서는 안 보이고 플레이로 넘어가며 나타난다
  if (!vfOn) return;
  camera.updateMatrixWorld();
  u.uInvPV.value.copy(camera.matrixWorld).multiply(_vfM.copy(camera.projectionMatrix).invert());
  u.uCamP.value.setFromMatrixPosition(camera.matrixWorld);
  u.uVFT.value = playTime * VF.speed * VF.scale * 4;
};
function setVoxelFog(v) { vfOn = v; if (v) vfInit(); else vfReset(); document.getElementById('vfBtn').textContent = v ? '복셀 안개 켜짐' : '복셀 안개 꺼짐'; pausedDrawn = false; pauseScene = false; }
if (vfOn) vfInit();   // config에서 켜 두었으면 처음부터
document.getElementById('vfBtn').onclick = (e) => { setVoxelFog(!vfOn); e.target.blur(); };
// 화면으로 늘리기: 후처리(디더링·32단계 색)까지는 게임 해상도 버퍼(postRT)에서 끝내고, 마지막에 기기 픽셀 크기 캔버스로 옮긴다.
// 샤프 바이리니어: 정수 배까지는 니어리스트처럼 또렷하게, 남는 소수 배만 경계에서 부드럽게 (픽셀마다 텍스처 한 번, 하드웨어 선형 필터)
const postRT = new THREE.WebGLRenderTarget(2, 2, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false });
const upMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: postRT.texture }, uSrc: { value: new THREE.Vector2(2, 2) }, uK: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tSrc; uniform vec2 uSrc; uniform float uK; varying vec2 vUv;
    void main() {
      vec2 t = vUv * uSrc, c = fract(t) - 0.5, r = vec2(0.5 - 0.5 / uK);   // uK = 정수 배율 (화면 픽셀 ÷ 게임 픽셀의 정수 부분)
      gl_FragColor = texture2D(tSrc, (floor(t) + (c - clamp(c, -r, r)) * uK + 0.5) / uSrc);
    }`,
  depthTest: false, depthWrite: false,
});
const upScene = new THREE.Scene();
upScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), upMat));

// 화면 환경 두 벌: 타이틀(밝은 낮, 가까운 흰 안개, 위쪽 흰 그라데이션)과 플레이(밤. 설정 메뉴 값). titleK로 섞는다 (0 = 타이틀, 1 = 플레이)
const TT = CFG.title || {};
const ENV_PLAY = { fog: new THREE.Color(MAP0.fogColor), near: 0, far: 2 / MAP0.fog, moon: MAP0.moon, moonC: new THREE.Color(MAP0.moonColor),
  sky: MAP0.sky, skyC: new THREE.Color(MAP0.skyColor), gndC: new THREE.Color(MAP0.groundColor), grad: 0 };
const ENV_TITLE = { fog: new THREE.Color(TT.fogColor ?? '#ffffff'), near: TT.fogNear ?? 20, far: TT.fogFar ?? 60, moon: TT.moon ?? 2.6, moonC: new THREE.Color(TT.moonColor ?? '#fff2dc'),
  sky: TT.sky ?? 2.2, skyC: new THREE.Color(TT.skyColor ?? '#eef2f8'), gndC: new THREE.Color(TT.groundColor ?? '#8a7a62'), grad: TT.gradient?.strength ?? 1 };
postMat.uniforms.uGradA.value = TT.gradient?.from ?? 0.64; postMat.uniforms.uGradB.value = TT.gradient?.to ?? 0.9;
postMat.uniforms.uGradC.value.copy(ENV_TITLE.fog);
let titleK = TT.enabled === false ? 1 : 0;
let clearSeq = null;   // 임무 완료 연출 { t, k(카메라·조명 0~1), cut(배경 지움 0~1), ... } (52_clear.js)
try { if (sessionStorage.getItem('MightyMolly.skipTitle')) { sessionStorage.removeItem('MightyMolly.skipTitle'); titleK = 1; } } catch (_) {}   // '새로 시작'으로 다시 읽었으면 타이틀 없이
function applyEnv() {
  const A = ENV_TITLE, B = ENV_PLAY, k = titleK;
  FOG.lerpColors(A.fog, B.fog, k); scene.fog.color.copy(FOG);
  scene.fog.near = FOGN.value = lerp(A.near, B.near, k); scene.fog.far = FOGF.value = lerp(A.far, B.far, k);
  moon.intensity = lerp(A.moon, B.moon, k); moon.color.lerpColors(A.moonC, B.moonC, k);
  hemi.intensity = lerp(A.sky, B.sky, k); hemi.color.lerpColors(A.skyC, B.skyC, k); hemi.groundColor.lerpColors(A.gndC, B.gndC, k);
  postMat.uniforms.uGrad.value = lerp(A.grad, B.grad, k);
  if (clearSeq && clearSeq.k > 0) {   // 임무 완료: 주광·하늘빛을 타이틀 조명으로 (52_clear.js)
    const c = clearSeq.k;
    moon.intensity = lerp(moon.intensity, A.moon, c); moon.color.lerp(A.moonC, c);
    hemi.intensity = lerp(hemi.intensity, A.sky, c); hemi.color.lerp(A.skyC, c); hemi.groundColor.lerp(A.gndC, c);
  }
}
applyEnv();

let resMax = false;   // 해상도 '최대': 화면 픽셀 그대로
let pixelPerfect = false;   // 게임 화면 한 픽셀 = 화면 픽셀 정수 배 (남는 곳은 검게)
// 화면 비율 제한: 가로:세로가 screen.aspectMin~aspectMax(1:1~2:1) 밖이면 넘치는 쪽을 잘라 내고, 남는 곳은 검은 레터박스.
// VR = 게임 화면이 차지하는 창 안의 사각형 (CSS 픽셀). 게임 캔버스와 픽셀 HUD를 그 자리에 놓는다
const SCR = CFG.screen || {}, VR = { x: 0, y: 0, w: 1, h: 1 };
function viewRect() {
  const W = innerWidth, H = innerHeight, a = Math.min(SCR.aspectMax ?? 2, Math.max(SCR.aspectMin ?? 1, W / H));
  VR.w = Math.min(W, Math.round(H * a)); VR.h = Math.min(H, Math.round(W / a));
  VR.x = Math.floor((W - VR.w) / 2); VR.y = Math.floor((H - VR.h) / 2);
  // Pixel Perfect: 게임 화면 한 픽셀 = 기기 픽셀 k×k (k는 정수). 해상도 설정은 세로 줄 수(lowH)만 정하므로 세로만 맞춘다:
  // 높이는 lowH × k (창에 들어가는 가장 큰 k, 남는 위아래는 검게), 가로는 그 높이에서 화면 비율 범위 안으로 창을 꽉 채우되 k의 배수로
  if (pixelPerfect && !resMax) {
    const dpr = devicePixelRatio || 1, k = Math.max(1, Math.floor(VR.h * dpr / lowH)), h = lowH * k / dpr;
    const rw = Math.max(2, Math.floor(Math.min(W, h * (SCR.aspectMax ?? 2)) * dpr / k));
    VR.w = rw * k / dpr; VR.h = h;
    VR.x = Math.round((W * dpr - rw * k) / 2) / dpr; VR.y = Math.round((H * dpr - lowH * k) / 2) / dpr;
  }
  for (const el of [renderer.domElement, document.getElementById('phud'), document.getElementById('phudS'), document.getElementById('pui'), document.getElementById('puiS'), document.getElementById('title')])
    if (el) Object.assign(el.style, { left: `${VR.x}px`, top: `${VR.y}px`, width: `${VR.w}px`, height: `${VR.h}px` });
  layoutTitle();
}
// 타이틀 네 귀퉁이: 좌상 로고, 우상 브랜드, 좌하 배지(옆에 버전·빌드), 우하 안내. 모두 게임 픽셀 단위 도트 그림(_src)이고
// HUD와 같은 배율(해상도 360줄마다 1배씩)로 늘린다. 버전·빌드는 배지 옆에 자리가 없으면 배지 위로
function layoutTitle() {
  const el = (id) => document.getElementById(id);
  if (!el('tLogo') || !el('tLogo')._src || !el('tPress')._src) return;
  const u = Math.max(1, Math.floor(lowH / 360)) * VR.h / lowH, m = 10 * u;   // u = 게임 픽셀 한 칸의 CSS 크기
  const put = (id, side, v, dx = 0, dy = 0) => {
    const c = el(id);
    c._css = [c._src.width * u, c._src.height * u];   // 사라질 때 다시 그리려고 보관
    Object.assign(c.style, { left: '', right: '', top: '', bottom: '', [side]: `${m + dx}px`, [v]: `${m + dy}px` });
    titleWipe(c);   // 사라지는 중이면 그 정도로
    return c._src.width * u;
  };
  put('tLogo', 'left', 'top'); put('tBrand', 'right', 'top');
  // 아래 요소들은 오른쪽 아래로 1칸 그림자가 있다: 여백 10칸은 그림자를 빼고 잰다
  // 맨 아래 위장색·데칼·설정 안내, 그 위에 게임 시작 (줄 간격 15칸)
  const camoH = el('tCamo') && el('tCamo')._src ? (put('tCamo', 'right', 'bottom', -u, -u), el('tCamo')._src.height * u + 2 * u) : 0;   // 한글 줄 높이 15칸에 맞춰 (안내 4줄이 한 목록처럼)
  const bw = put('tBadge', 'left', 'bottom', 0, -u), pw = put('tPress', 'right', 'bottom', -u, -u + camoH);
  const vw = el('tVer')._src.width * u, vx = bw + 6 * u;
  if (m + vx + vw + 10 * u + pw + m <= VR.w) put('tVer', 'left', 'bottom', vx, -u);
  else put('tVer', 'left', 'bottom', 0, el('tBadge')._src.height * u + 4 * u - u);
}
let paused = false, pausedDrawn = false, pauseScene = false;   // pauseScene: 멈춘 뒤 장면을 한 번 그렸다 (그 뒤로는 HUD·창·회색조만 다시 그린다)   // 일시정지 (창이 비활성이거나 ESC). 멈춘 직후 한 번만 다시 그린다
function resize() {
  if (!innerWidth || !innerHeight) return;   // 창이 접혀 크기가 0이면 다음 크기 변경 때
  viewRect();
  if (resMax) lowH = Math.round(VR.h * (devicePixelRatio || 1));
  layerScale = crtOn ? lowH / VR.h : 0;   // CRT 표현: HUD·UI를 게임 픽셀 크기로 (00_core.js)
  const w = Math.max(2, Math.round(lowH * VR.w / VR.h)), dpr = crtOn ? crtDpr() : devicePixelRatio || 1, dw = Math.max(2, Math.round(VR.w * dpr)), dh = Math.max(2, Math.round(VR.h * dpr));   // CRT는 crt.maxScale 배율까지만
  renderer.setSize(dw, dh, false);   // 캔버스는 기기 픽셀 크기 (게임은 rt에 저해상도로 그리고 마지막에 늘린다)
  rt.setSize(w, lowH); cutRT.setSize(w, lowH); olRT.setSize(w, lowH); postRT.setSize(w, lowH);
  upMat.uniforms.uSrc.value.set(w, lowH); upMat.uniforms.uK.value = Math.max(1, Math.floor(dh / lowH + 1e-6));
  postMat.uniforms.uTexel.value.set(1 / w, 1 / lowH);
  U.uSnap.value.set(w / 2, lowH / 2);
  camera.aspect = w / lowH; camera.updateProjectionMatrix();
  U.uPointScale.value = lowH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  layoutTitle();   // 해상도가 바뀌면 타이틀 그림도 다시
  pausedDrawn = false; pauseScene = false;   // 멈춰 있어도 바뀐 크기로 한 번 다시 그린다 (장면까지)
}
addEventListener('resize', resize);
document.getElementById('res').onchange = (e) => { resMax = e.target.value === 'max'; if (!resMax) lowH = +e.target.value; resize(); e.target.blur(); };
document.getElementById('olBtn').onclick = (e) => {   // 외곽선 (풀 제외)
  outlineOn = !outlineOn; postMat.uniforms.uOL.value = outlineOn ? 1 : 0;
  e.target.textContent = outlineOn ? '외곽선 켜짐' : '외곽선 꺼짐'; e.target.blur();
};
let grassMode = 0;   // 텍스처 종류 (0부터). grassCardMats.length = 풀 끔 (성능 비교용: 메시만 숨긴다)
function setGrass(m) {
  grassMode = m;
  const off = m >= grassCardMats.length;
  for (const cm of grassCard) { cm.visible = !off; if (!off) cm.material = grassCardMats[m]; }
  document.getElementById('grassBtn').textContent = off ? '풀: 끔' : `풀: 텍스처${grassCardNames[m]}`;
}
document.getElementById('grassBtn').onclick = (e) => { setGrass((grassMode + 1) % (grassCardMats.length + 1)); e.target.blur(); };   // 텍스처1 → 2 → 3 → 끔 → 1
setGrass(1);   // 처음엔 텍스처2 (이삭 풀)
document.getElementById('ppBtn').onclick = (e) => {
  pixelPerfect = !pixelPerfect; e.target.textContent = pixelPerfect ? 'Pixel Perfect 켜짐' : 'Pixel Perfect 꺼짐';
  resize(); e.target.blur();
};
document.getElementById('aaBtn').onclick = (e) => {   // 안티에일리어싱: 저해상도 화면 버퍼를 4배 다중 샘플로
  rt.samples = rt.samples ? 0 : 4; rt.dispose();
  e.target.textContent = rt.samples ? 'AA 켜짐' : 'AA 꺼짐'; e.target.blur();
};
document.getElementById('camModeBtn').onclick = (e) => {   // 보는 방향 기준: 자동 → 차체 → 포탑 → 자동
  setCamMode(CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]); e.target.blur();
};
document.getElementById('fogC').oninput = (e) => { ENV_PLAY.fog.set(e.target.value); applyEnv(); };
document.getElementById('fogC').onchange = (e) => e.target.blur();
document.getElementById('vol').oninput = (e) => setVolume(+e.target.value);
document.getElementById('debris').oninput = (e) => { windDebris = +e.target.value; document.getElementById('debrisV').textContent = windDebris.toFixed(2); };
for (const id of ['vol', 'debris']) document.getElementById(id).onchange = (e) => e.target.blur();
// 성장 테스트: 상자·적 떨구기 (내 탱크 둘레 12~32m), 내 탱크 성능 슬라이더 (오른쪽일수록 강하게)
document.getElementById('tDropGold').onclick = (e) => { dropSafe('gold', tank.pos); e.target.blur(); };
document.getElementById('tDropRepair').onclick = (e) => { dropSafe('repair', tank.pos); e.target.blur(); };
for (const lv of [1, 2, 3]) document.getElementById('tDropEnemy' + lv).onclick = (e) => { startDrop(newEnemy(false, Math.min(EC.clearKills, enemyDrops + 2), lv), tank.pos); e.target.blur(); };   // 적 탱크 레벨 1~3   // 다음 순번 레벨로
document.getElementById('tDropSpg').onclick = (e) => { spawnSpg(); e.target.blur(); };
document.getElementById('tDropJeep').onclick = (e) => { startDrop(newJeep()); e.target.blur(); };
// 슬라이더: [id, 최소, 최대(config의 최대값), 처음 값(config), 적용]. 재장전은 짧을수록 오른쪽이 되게 음수로
const GROW = [
  ['gReload', -8, -PM.reloadMin, -PC.reload, (v) => { tank.reload = -v; return `${(-v).toFixed(1)}초`; }],
  ['gMuzzle', 8, PM.muzzle, PC.muzzle, (v) => { tank.muzzle = v; return `${v.toFixed(1)}m/s`; }],
  ['gDmg', 20, PM.shellDamage, PC.shellDamage, (v) => { tank.shellDmg = v; return `${Math.round(v)}`; }],
  ['gSplash', 0, PM.blastRadius, PC.blastRadius, (v) => { tank.blastR = v; return `${v.toFixed(1)}m`; }],
  ['gBlastDmg', 0, PM.blastRatio, PC.blastRatio, (v) => { tank.blastRatio = v; return `${Math.round(v * 100)}%`; }],
  ['gAcc', 2, PM.accel, PC.accel, (v) => { tank.accM = v / ACC; return `${v.toFixed(2)}m/s²`; }],
  ['gSpd', 3, PM.maxSpeed, PC.maxSpeed, (v) => { tank.spdM = v / VMAX; return `${(v * 3.6).toFixed(0)}km/h`; }],
  ['gTurn', 20, PM.turnRate, PC.turnRate, (v) => { tank.turnM = v / PC.turnRate; return `${Math.round(v)}°/s`; }],
  ['gTurret', 15, PM.turretRate, PC.turretRate, (v) => { tank.turretRate = v * DEG; return `${Math.round(v)}°/s`; }],
];
for (const [id, min, max, init, apply] of GROW) {
  const el = document.getElementById(id), lab = document.getElementById(id + 'V');
  el.min = min; el.max = max; el.value = el.defaultValue = init;
  el.oninput = () => { lab.textContent = apply(+el.value); };
  el.onchange = () => el.blur();
  el.oninput();
}
// 기관총 (내 탱크에 기관총이 있을 때만): 초당 발사 수 · 대미지. 성장으로 바뀌면 dbgSync가 따라 맞춘다
const mgSl = [['gMgRate', 1, Math.max(PM.mgRate, 30), (v) => { if (tank.mg) tank.mg.rate = v; return `${v}발/초`; }], ['gMgDmg', 1, Math.max(PM.mgDamage, 40), (v) => { if (tank.mg) tank.mg.damage = v; return `${v}`; }]];
for (const [id, min, max, apply] of mgSl) { const el = document.getElementById(id); el.min = min; el.max = max; el.oninput = () => { document.getElementById(id + 'V').textContent = apply(+el.value); }; el.onchange = () => el.blur(); }
document.getElementById('gMgAdd').onclick = (e) => { UP_FX.mg.apply(); dbgSync(); e.target.blur(); };   // 기관총 하나 더 (최대 2정)
document.getElementById('gRegen').oninput = (e) => { tank.regen = +e.target.value; document.getElementById('gRegenV').textContent = `${tank.regen}`; };
document.getElementById('gRegen').onchange = (e) => e.target.blur();
// 설정 메뉴 버튼·게이지 상태 맞추기 (메뉴가 열려 있을 때 0.2초마다): 할 수 없는 것은 흐리게
function dbgSync() {
  const mg = tank.mg, n = mg ? mg.count : 0;
  const add = document.getElementById('gMgAdd'); add.disabled = n >= 2; add.textContent = n >= 2 ? '기관총 추가 (최대 2정)' : `기관총 추가 (${n}정)`;
  for (const [id, , , apply] of mgSl) {
    const el = document.getElementById(id); el.disabled = !mg;
    if (mg && document.activeElement !== el) { el.value = id === 'gMgRate' ? mg.rate : mg.damage; document.getElementById(id + 'V').textContent = apply(+el.value); }
    if (!mg) document.getElementById(id + 'V').textContent = '없음';
  }
}
const sliderAt = (id) => { const el = document.getElementById(id); return +el.value >= +el.max - 1e-6; };   // 최대값에 닿았는가
// 성장으로 바뀌는 내 탱크 값을 모두 처음으로 (슬라이더 + 고른 성장 항목)
function resetGrowth() {
  for (const [id] of GROW) { const el = document.getElementById(id); el.value = el.defaultValue; el.oninput(); }
  Object.assign(tank, { maxHp: PC.hp, hp: Math.min(tank.hp, PC.hp), magnetR: MAGNET_R, armorM: 1, goldMul: 1, pierce: 0, ram: false, waterSpeed: undefined, goldKeep: false, autoRepair: false, repairAcc: 0, mg: null, picks: {}, pickLog: [],
    berserk: 0, coinMul: 1, combos: [], apMg: false, dozer: 0, fieldRepair: false, scrap: 0, sniper: 0,
    bunkerMul: 1, kitMul: 1, supplyBlast: null, twin: 0, twinT: 0, crit: 0, critMul: 2, offerN: 3 });
  comboQueue.length = 0;
  drawPickLog();
  showGuns(0);
  growLevel = 0;
}
document.getElementById('gReset').onclick = (e) => { resetGrowth(); e.target.blur(); };
// 성장 선택지: 골드가 100(설정)개 모이면 3개 중 하나 (게임은 멈추지 않는다). 우상단에 픽셀 UI로 세로로 뜨고 (offerUI),
// 숫자키 1·2·3, 게임패드 방향키 ←·↑·→, 또는 항목을 눌러 고른다.
// 고르면 골드 100을 내고, 나머지는 곧바로 어두운 회색이 됐다가 잠시 뒤 모두 4x4 디더링으로 사라진다. 그래도 100개 이상 남았으면 이어서 다음 선택지.
// 선택지는 레어도 가중치(일반 100 / 고급 70 / 희귀 30 / 전설 10, 설정)로 겹치지 않게 뽑는다
// 성장 한 번에 드는 골드: 0~9단계는 100, 10~19단계는 200, … (설정)
const GC = CFG.growth, offerCost = () => GC.goldPerOffer + Math.floor(growLevel / GC.goldStepEvery) * GC.goldStepAdd;
const bumpSlider = (id, f) => { const el = document.getElementById(id); el.value = Math.max(+el.min, Math.min(+el.max, f(+el.value))); el.oninput(); };
// 항목별 효과 (v = config의 value)와 지금 고를 수 있는지
const UP_FX = {
  speed:      { apply: (v) => bumpSlider('gSpd', x => x * (1 + v / 100)), ok: () => !sliderAt('gSpd') },
  accel:      { apply: (v) => bumpSlider('gAcc', x => x * (1 + v / 100)), ok: () => !sliderAt('gAcc') },
  turn:       { apply: (v) => bumpSlider('gTurn', x => x * (1 + v / 100)), ok: () => !sliderAt('gTurn') },
  turret:     { apply: (v) => bumpSlider('gTurret', x => x * (1 + v / 100)), ok: () => !sliderAt('gTurret') },
  reload:     { apply: (v) => bumpSlider('gReload', x => x * (1 - v / 100)), ok: () => !sliderAt('gReload') },
  muzzle:     { apply: (v) => bumpSlider('gMuzzle', x => x * (1 + v / 100)), ok: () => !sliderAt('gMuzzle') },
  damage:     { apply: (v) => bumpSlider('gDmg', x => x * (1 + v / 100)), ok: () => !sliderAt('gDmg') },
  blast:      { apply: (v) => bumpSlider('gSplash', x => x + v), ok: () => !sliderAt('gSplash') },
  blastDmg:   { apply: (v) => bumpSlider('gBlastDmg', x => x + v / 100), ok: () => tank.blastR > 0 && !sliderAt('gBlastDmg') },   // 폭발 범위가 있을 때만
  magnet:     { apply: (v) => { tank.magnetR = Math.min(PM.magnetRange, tank.magnetR * (1 + v / 100)); }, ok: () => tank.magnetR < PM.magnetRange },
  armor:      { apply: (v) => { tank.armorM = Math.max(PM.armorMul, tank.armorM * (1 - v / 100)); }, ok: () => tank.armorM > PM.armorMul + 1e-6 },
  heal:       { apply: () => { tank.hp = tank.maxHp; } },   // 최대 HP까지 완전히 수리
  maxHp:      { apply: (v) => { tank.maxHp += v; tank.hp += v; } },
  ram:        { apply: () => { tank.ram = true; } },
  water:      { apply: () => { tank.waterSpeed = 1; } },
  gold:       { apply: () => { tank.goldMul++; }, ok: () => tank.goldMul < PM.goldMul },
  goldKeep:   { apply: () => { tank.goldKeep = true; } },
  mg:         { apply: () => { if (tank.mg) tank.mg.count = 2; else tank.mg = { rate: PC.mg.rate, damage: PC.mg.damage, range: PC.mg.range, count: 1 }; showGuns(tank.mg.count); } },   // 두 번째는 포탑 왼쪽에
  mgRange:    { apply: (v) => { tank.mg.range = Math.min(PM.mgRange, tank.mg.range + v); }, ok: () => tank.mg && tank.mg.range < PM.mgRange },
  mgRate:     { apply: (v) => { tank.mg.rate = Math.min(PM.mgRate, tank.mg.rate + v); }, ok: () => tank.mg && tank.mg.rate < PM.mgRate },
  mgDmg:      { apply: (v) => { tank.mg.damage = Math.min(PM.mgDamage, tank.mg.damage + v); }, ok: () => tank.mg && tank.mg.damage < PM.mgDamage },
  pierce:     { apply: (v) => { tank.pierce += v / 100; } },
  superPierce:{ apply: (v) => { tank.pierce += v / 100; } },
  autoRepair: { apply: () => { tank.autoRepair = true; tank.repairAcc = 0; } },
  bunkerBuster:{ apply: (v) => { tank.bunkerMul = (tank.bunkerMul || 1) + v / 100; }, ok: () => BUNKERS.some((B) => !B.ruin) },   // 남은 벙커가 있을 때만
  repairKit:  { apply: (v) => { tank.kitMul = v || 2; } },
  supplyBlast:{ apply: () => { const u = GC.upgrades.find((x) => x.id === 'supplyBlast') || {}; tank.supplyBlast = { r: u.explodeRadius ?? 10, d: u.explodeDamage ?? 200 }; } },
  twin:       { apply: (v) => { tank.twin = v || 0.15; } },
  crit:       { apply: (v, w) => { tank.crit = (v ?? 20) / 100; tank.critMul = w || 2; } },
  // 위험 (v = 장점, w = 단점의 양)
  glass:      { apply: (v, w) => { bumpSlider('gDmg', x => x * (1 + v / 100)); tank.maxHp = Math.max(1, Math.round(tank.maxHp * (1 - w / 100))); tank.hp = Math.min(tank.hp, tank.maxHp); } },
  light:      { apply: (v, w) => { bumpSlider('gSpd', x => x * (1 + v / 100)); bumpSlider('gAcc', x => x * (1 + v / 100)); tank.armorM *= 1 + w / 100; } },
  heavy:      { apply: (v, w) => { tank.armorM *= 1 - v / 100; bumpSlider('gSpd', x => x * (1 - w / 100)); bumpSlider('gTurn', x => x * (1 - w / 100)); } },   // 장갑 강화 최대값보다 더 내려갈 수 있다
  rapid:      { apply: (v, w) => { bumpSlider('gReload', x => x * (1 - v / 100)); bumpSlider('gDmg', x => x * (1 - w / 100)); } },
  berserk:    { apply: (v) => { tank.berserk = v / 100; } },
  wide:       { apply: (v) => { tank.offerN = Math.min(4, 3 + (v || 1)); } },   // '폭넓은 선택': 다음부터 선택지 4개 (화면·키는 4개까지)
  greed:      { apply: (v, w) => { tank.coinMul = 2; tank.magnetR *= 1 - w / 100; } },
};
const upText = (s, u) => s.replaceAll('{v}', u.value ?? '').replaceAll('{w}', u.value2 ?? '').replaceAll('{n}', tank.goldMul + 1);
// 이번에 고르면 마지막 단계인가: 고를 수 있는 횟수(max)를 다 채우거나, 성능이 최대값에 닿는다
const willMax = (id, f) => { const el = document.getElementById(id); return f(+el.value) >= +el.max - 1e-6; };
const UP_LAST = {
  speed: (v) => willMax('gSpd', x => x * (1 + v / 100)), accel: (v) => willMax('gAcc', x => x * (1 + v / 100)), turn: (v) => willMax('gTurn', x => x * (1 + v / 100)),
  turret: (v) => willMax('gTurret', x => x * (1 + v / 100)), reload: (v) => willMax('gReload', x => x * (1 - v / 100)), muzzle: (v) => willMax('gMuzzle', x => x * (1 + v / 100)),
  damage: (v) => willMax('gDmg', x => x * (1 + v / 100)), blast: (v) => willMax('gSplash', x => x + v), blastDmg: (v) => willMax('gBlastDmg', x => x + v / 100),
  magnet: (v) => tank.magnetR * (1 + v / 100) >= PM.magnetRange, armor: (v) => tank.armorM * (1 - v / 100) <= PM.armorMul + 1e-6, gold: () => tank.goldMul + 1 >= PM.goldMul,
  mgRate: (v) => tank.mg.rate + v >= PM.mgRate, mgDmg: (v) => tank.mg.damage + v >= PM.mgDamage, mgRange: (v) => tank.mg.range + v >= PM.mgRange,
};
const upLast = (u) => (u.max > 1 && (tank.picks[u.id] || 0) + 1 >= u.max) || (UP_LAST[u.id] ? UP_LAST[u.id](u.value) : false);
const upAvail = (u) => { const fx = UP_FX[u.id]; return fx && (u.max == null || (tank.picks[u.id] || 0) < u.max) && (!fx.ok || fx.ok()); };
const upWeight = (u) => (GC.rarity[u.rarity] ? GC.rarity[u.rarity].weight : 0) * (u.weight ?? 1);
// 레어도 조건: minLevel(이번 선택지의 LV가 이 이상일 때만), perOffer(한 번에 이 개수까지. '위험'은 1개)
const rarityOk = (u, out) => { const R = GC.rarity[u.rarity] || {}; return growLevel + 1 >= (R.minLevel ?? 0) && out.filter((o) => o.rarity === u.rarity).length < (R.perOffer ?? 3); };
function rollChoices() {
  const pool = GC.upgrades.filter(u => upAvail(u) && upWeight(u) > 0), out = [];
  for (;;) {
    for (let i = pool.length - 1; i >= 0; i--) if (!rarityOk(pool[i], out)) pool.splice(i, 1);
    if (out.length >= (tank.offerN || 3) || !pool.length) break;
    let r = Math.random() * pool.reduce((s, u) => s + upWeight(u), 0), k = 0;
    while (k < pool.length - 1 && (r -= upWeight(pool[k])) > 0) k++;
    out.push(pool.splice(k, 1)[0]);
  }
  return out.map(u => ({ u, label: upText(u.name, u), desc: upText(u.desc, u) + (upLast(u) ? ' (최대)' : ''), bad: u.bad ? upText(u.bad, u) : '' }));
}
// ---- 조합 보너스: need의 성장을 모두 갖추면 열린다. 고른 순간 효과가 들어가고, 선택지가 사라진 뒤 카드로 알린다 (comboQueue)
const COMBOS = GC.combos || [];
const COMBO_FX = {
  apMg: () => { tank.apMg = true; },
  dozer: (v) => { tank.dozer = v || 2; },
  fieldRepair: () => { tank.fieldRepair = true; },
  scrap: (v) => { tank.scrap = v || 1; },
  sniper: (v) => { tank.sniper = (v || 80) / 100; },
};
const comboQueue = [];
const needCount = (picks, k) => k.split('|').reduce((n, id) => n + (picks[id] || 0), 0);
const comboReady = (C, picks) => Object.entries(C.need || {}).every(([k, n]) => needCount(picks, k) >= n);
// 조합이 열린 이유: '자석 3회 + 골드 x3'
function comboReason(C) {
  return Object.entries(C.need || {}).map(([k, n]) => {
    const id = k.split('|')[0], u = GC.upgrades.find((x) => x.id === id), nm = u ? u.name : id;
    if (id === 'gold') return nm.replaceAll('{n}', n + 1);
    return n > 1 ? `${nm} ${n}회` : nm;
  }).join(' + ');
}
// 이 성장을 하나 더 고르면 새로 열리는 조합이 있는가 (선택지 카드의 '조합 완성' 표시)
const completesCombo = (u) => { const p = { ...tank.picks, [u.id]: (tank.picks[u.id] || 0) + 1 }; return COMBOS.some((C) => !(tank.combos || []).includes(C.id) && !comboReady(C, tank.picks) && comboReady(C, p)); };
function checkCombos() {
  for (const C of COMBOS) {
    if ((tank.combos || []).includes(C.id) || !comboReady(C, tank.picks)) continue;
    tank.combos.push(C.id);
    if (COMBO_FX[C.id]) COMBO_FX[C.id](C.value);
    const card = { u: { id: C.id, rarity: 'combo' }, label: C.name, desc: upText(C.desc, C), reason: comboReason(C), combo: true };
    tank.pickLog.push(card); comboQueue.push(card);
  }
}
let testOffers = 0, curOffer = null, growLevel = 0, heldOffer = null;   // curOffer.combo: 조합 완성 알림 카드 (choices 한 장, 고를 것 없음)   // heldOffer: 고르기 전에 터져서 접어 둔 선택지 (다시 착지하면 띄운다)
function drawOffer() { if (rulesLocked()) return; if (UI.screen !== offerUI) uiShow(offerUI); else uiDirty(); }   // 적군 섬멸 창은 성장 선택지로 바뀌지 않는다
// 다음 선택지: 테스트 버튼으로 예약한 것 먼저, 아니면 골드가 100 이상일 때
function nextOffer() {
  if (rulesLocked()) return;   // 적군 섬멸 창이 떠 있으면 선택지를 띄우지 않는다 (창이 선택지로 바뀌어 버린다)
  if (curOffer && curOffer.picked >= 0 && UI.screen !== offerUI) curOffer = null;   // 고른 선택지가 다른 창에 밀려 끝나지 못하고 남았으면 거둔다
  if (curOffer || heldOffer || !tank.solid) return;   // 터져 있거나 떨어지는 중이면 착지한 뒤에
  if (comboQueue.length) {   // 열린 조합이 있으면 그 카드부터 (고를 것 없이 잠시 보였다 사라진다)
    curOffer = { choices: [comboQueue.shift()], combo: true, picked: 0, showT: 0, pickT: -COMBO_HOLD };
    drawOffer(); sfx.ui('combo');
    return;
  }
  if (testOffers > 0) testOffers--;
  else if (gold < offerCost()) return;
  const choices = rollChoices();
  if (!choices.length) return;
  curOffer = { choices, picked: -1, showT: 0 };
  drawOffer();
  sfx.kit();
}
function goldGain(n) { if (rulesLocked()) return; gold += n; nextOffer(); }   // 섬멸 창 동안은 주워도 골드가 안 는다 (날아가는 모습은 그대로)
function pickOffer(i) {
  if (!curOffer || curOffer.picked >= 0 || !curOffer.choices[i]) return;
  curOffer.picked = i;
  const u = curOffer.choices[i].u;
  UP_FX[u.id].apply(u.value, u.value2);
  tank.picks[u.id] = (tank.picks[u.id] || 0) + 1;
  tank.pickLog.push(curOffer.choices[i]); checkCombos(); drawPickLog();
  if (!curOffer.paid) gold = Math.max(0, gold - offerCost());   // 성장 값으로 골드를 낸다 (고르기 전 단계 기준. 0 아래로는 안 내려감. 터질 때 미리 낸 선택지는 빼고)
  growLevel++;   // 테스트 버튼으로 띄운 선택지도 똑같이 한 단계
  curOffer.pickT = 0;   // 고른 뒤 흐른 시간 (offerUI.tick: 게임이 멈추면 같이 멈춘다)
  drawOffer();   // 나머지는 곧바로 어두운 회색
  sfx.coin();
}
// 고르기 전의 선택지를 거둔다 (처음부터 다시 할 때)
function cancelOffer() {
  heldOffer = null;
  if (!curOffer) return;
  curOffer = null; if (UI.screen === offerUI) uiShow(null);
}
// 내 탱크가 고르기 전에 터졌을 때: 선택지를 접어 둔다. 골드를 흩뿌릴 거라면 성장 값은 지금 미리 낸다 (흩뿌린 골드를 다시 주워 또 쓰지 않게)
function holdOffer(spill) {
  // 이미 고른 선택지가 사라지는 중이었다면: 효과는 이미 들어갔으니 그냥 거둔다 (남겨 두면 다음 선택지가 영영 안 뜬다)
  if (curOffer && curOffer.picked >= 0) { curOffer = null; if (UI.screen === offerUI) uiShow(null); return; }
  if (!curOffer) return;
  heldOffer = curOffer; curOffer = null;
  if (spill && !heldOffer.paid) { heldOffer.paid = true; gold = Math.max(0, gold - offerCost()); }
  if (UI.screen === offerUI) uiShow(null);
}
// 다시 떨어져 착지했을 때: 접어 둔 선택지를 처음처럼 띄우고, 없으면 골드가 모였는지 본다
function landOffer() {
  if (heldOffer) { curOffer = heldOffer; heldOffer = null; curOffer.showT = 0; drawOffer(); sfx.kit(); }
  else nextOffer();
}
addEventListener('keydown', (e) => { const m = /^(Digit|Numpad)([1-4])$/.exec(e.code); if (m && UI.screen === offerUI) pickOffer(+m[2] - 1); });   // 숫자 1~4 (위쪽 숫자 줄 또는 숫자 키패드. 4는 '폭넓은 선택'). 선택지가 보일 때만 (일시정지 창 아래에 있으면 안 됨)
document.getElementById('gOffer').onclick = (e) => { testOffers++; nextOffer(); e.target.blur(); };   // 테스트: 골드 없이 바로 선택지
// 테스트: 성장 10단계를 한 번에. 단계마다 평소처럼 선택지 3개를 뽑아 그중 하나를 무작위로 고른다 (골드는 쓰지 않음. 떠 있는 선택지는 그대로)
document.getElementById('gRand10').onclick = (e) => {
  for (let k = 0; k < 10; k++) {
    const ch = rollChoices();
    if (!ch.length) break;   // 더 고를 것이 없다
    const c = ch[Math.floor(Math.random() * ch.length)];
    UP_FX[c.u.id].apply(c.u.value, c.u.value2);
    tank.picks[c.u.id] = (tank.picks[c.u.id] || 0) + 1;
    tank.pickLog.push(c); checkCombos();
    growLevel++;
  }
  drawPickLog(); sfx.coin(); e.target.blur();
};
document.getElementById('gReroll').onclick = (e) => {   // 테스트: 떠 있는 선택지 3개를 확률대로 다시 뽑는다
  if (curOffer && curOffer.picked < 0) { curOffer.choices = rollChoices(); drawOffer(); }
  e.target.blur();
};
// 맵 설정의 처음 값 (config.js)
const setInput = (id, v) => { const el = document.getElementById(id); el.value = v; if (el.oninput) el.oninput({ target: el }); };
let windDir = MAP0.windDir;   // 바람이 불어 가는 쪽 (°): 0 = +x, 90 = +z(북쪽)
document.getElementById('windDir').value = windDir; document.getElementById('windDirV').textContent = `${windDir}°`;
document.getElementById('windDir').oninput = (e) => { windDir = +e.target.value; document.getElementById('windDirV').textContent = `${windDir}°`; };
document.getElementById('wind').oninput = (e) => { U.uWind.value = +e.target.value; document.getElementById('windV').textContent = (+e.target.value).toFixed(2); };
document.getElementById('wind').onchange = (e) => e.target.blur();
document.getElementById('fog').oninput = (e) => { ENV_PLAY.far = 2 / Math.max(1e-4, +e.target.value); applyEnv(); document.getElementById('fogV').textContent = (+e.target.value).toFixed(4); };
document.getElementById('fog').onchange = (e) => e.target.blur();
document.getElementById('cbox').onclick = (e) => { toggleCollisionView(); e.target.blur(); };
// 설정 메뉴: ` 키로 열고 닫는다 (늘 펼쳐진 상태)
const hudEl = document.getElementById('hud');
addEventListener('keydown', (e) => { if (e.code === 'Backquote' && e.shiftKey) { hudEl.style.display = hudEl.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); } });   // 설정 메뉴: ~ (Shift + `. 숫자 1 옆이라 잘못 눌러 열리지 않게)
document.getElementById('camreset').onclick = (e) => { resetCamera(); e.target.blur(); };
// 마우스 오른쪽 끌기로 카메라 옮기기: 평소엔 끔 (설정 메뉴에서 켠다)
controls.enablePan = false;
document.getElementById('camPanBtn').onclick = (e) => { controls.enablePan = !controls.enablePan; e.target.textContent = controls.enablePan ? '우클릭 카메라 이동 켜짐' : '우클릭 카메라 이동 꺼짐'; e.target.blur(); };
// 자동 카메라 (설정, 기본 켜기): 마우스로 돌리거나 당긴 카메라가 손을 뗀 뒤 2초가 지나면 기본 방향·거리로 EaseInOutCubic(1.5초)으로 돌아온다.
// 끄면 바꾼 방향·거리를 그대로 둔다. camBack()을 frame이 부른다
const CAM_BACK_WAIT = 2000, CAM_BACK_T = 1.5;
let camDrag = false, camBackAt = 0, camRet = null;
controls.addEventListener('start', () => { camDrag = true; camBackAt = 0; camRet = null; });
controls.addEventListener('end', () => { camDrag = false; camBackAt = autoCam ? performance.now() + CAM_BACK_WAIT : 0; });
function camBack(dt) {
  if (camDrag || !autoCam) return;
  if (!camRet) {
    if (!camBackAt || performance.now() < camBackAt) return;
    _tmp.copy(camera.position).sub(controls.target);
    const r = _tmp.length();
    camRet = { yaw: Math.atan2(-_tmp.x, -_tmp.z), pit: Math.asin(Math.max(-1, Math.min(1, _tmp.y / r))), r, t: 0 };   // 돌아오기 시작한 자리
    camBackAt = 0;
  }
  camRet.t += dt;
  const e = easeInOutCubic(Math.min(1, camRet.t / CAM_BACK_T));
  let dy = camYaw - camRet.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));   // 기본 방향은 탱크를 따라 계속 바뀐다
  const yaw = camRet.yaw + dy * e, pit = camRet.pit + (CC.pitch * DEG - camRet.pit) * e, r = camRet.r + (CC.distance - camRet.r) * e;
  camera.position.copy(controls.target).add(_tmp.set(-Math.sin(yaw) * Math.cos(pit) * r, Math.sin(pit) * r, -Math.cos(yaw) * Math.cos(pit) * r));
  if (camRet.t >= CAM_BACK_T) camRet = null;
}
// AO 한 줄: 켜기/끄기, 세기, 흰색 보기
let aoOn = true;
const aoK = document.getElementById('aoK'), aoKv = document.getElementById('aoKv');
const applyAO = () => { U.uAO.value = aoOn ? +aoK.value : 0; aoKv.textContent = (+aoK.value).toFixed(1); };
document.getElementById('aoBtn').onclick = (e) => { aoOn = !aoOn; e.target.textContent = aoOn ? '켜짐' : '꺼짐'; applyAO(); e.target.blur(); };
aoK.oninput = applyAO; aoK.onchange = (e) => e.target.blur();
document.getElementById('aoWhite').onclick = (e) => { U.uWhite.value = 1 - U.uWhite.value; e.target.textContent = U.uWhite.value ? '색 보기' : '흰색 보기'; e.target.blur(); };
document.getElementById('moonI').oninput = (e) => { ENV_PLAY.moon = +e.target.value; applyEnv(); document.getElementById('moonIV').textContent = (+e.target.value).toFixed(2); };
document.getElementById('moonC').oninput = (e) => { ENV_PLAY.moonC.set(e.target.value); applyEnv(); };
for (const id of ['moonI', 'moonC']) document.getElementById(id).onchange = (e) => e.target.blur();
setInput('aoK', CFG.map.ao);
// 맵 셋팅 바꾸기: 설정 메뉴 슬라이더·하늘빛·날씨를 그 셋팅 값으로 (슬라이더는 그 뒤에 따로 만져 볼 수 있다)
function applyMapPreset(i) {
  mapIdx = (i + MAP_PRESETS.length) % MAP_PRESETS.length;
  const p = MAP_PRESETS[mapIdx];
  for (const [id, v] of [['wind', p.wind], ['windDir', p.windDir], ['debris', p.debris], ['fog', p.fog], ['fogC', p.fogColor], ['moonI', p.moon], ['moonC', p.moonColor]]) setInput(id, v);
  ENV_PLAY.sky = p.sky; ENV_PLAY.skyC.set(p.skyColor); ENV_PLAY.gndC.set(p.groundColor); applyEnv();
  setWeather(p);
  for (const [id, v] of [['rainA', p.rain], ['sandA', p.sand], ['boltA', p.lightning]]) setInput(id, v);
  document.getElementById('sandC').value = p.sandColor ?? '#c8a070';
  document.getElementById('mapBtn').textContent = `맵 셋팅: ${p.name} (${mapIdx + 1}/${MAP_PRESETS.length})`;
}
// 남은 적이 map.stormAt대 이하가 되면 map.stormPreset 셋팅으로 stormTime초에 걸쳐 바뀐다 (클리어가 가깝다는 신호, 분위기 전환). 한 판에 한 번
let storm = null, stormDone = false;
const _sc1 = new THREE.Color(), _sc2 = new THREE.Color();
const mixHex = (a, b, e) => '#' + _sc1.set(a ?? '#000000').lerp(_sc2.set(b ?? '#000000'), e).getHexString();
function stormTick(dt) {
  if (!storm) {
    if (stormDone || titleState !== 'play' || editMode || !(CFG.map.stormAt > 0) || enemyLeft() > CFG.map.stormAt) return;
    stormDone = true;
    const bi = MAP_PRESETS.findIndex((p) => p.name === CFG.map.stormPreset);
    if (bi < 0 || bi === mapIdx) return;
    storm = { a: MAP_PRESETS[mapIdx], b: MAP_PRESETS[bi], bi, t: 0 };
  }
  storm.t += dt;
  const k = Math.min(1, storm.t / Math.max(0.01, CFG.map.stormTime ?? 6)), e = k * k * (3 - 2 * k), A = storm.a, B = storm.b;
  if (k >= 1) { applyMapPreset(storm.bi); storm = null; return; }   // 끝: 셋팅 그대로 (설정 메뉴 슬라이더까지)
  const L = (n) => lerp(A[n] ?? 0, B[n] ?? 0, e);
  let wd = (B.windDir ?? 0) - (A.windDir ?? 0); wd = ((wd % 360) + 540) % 360 - 180;   // 바람 방향은 가까운 쪽으로 돈다
  for (const [id, v] of [['wind', L('wind')], ['windDir', Math.round((A.windDir ?? 0) + wd * e)], ['debris', L('debris')], ['fog', L('fog')], ['fogC', mixHex(A.fogColor, B.fogColor, e)],
    ['moonI', L('moon')], ['moonC', mixHex(A.moonColor, B.moonColor, e)]]) setInput(id, v);
  ENV_PLAY.sky = L('sky'); ENV_PLAY.skyC.set(mixHex(A.skyColor, B.skyColor, e)); ENV_PLAY.gndC.set(mixHex(A.groundColor, B.groundColor, e)); applyEnv();
  WEATHER.rain = L('rain'); WEATHER.sand = L('sand'); WEATHER.lightning = L('lightning');
  rainFx.u.uColor.value.set(mixHex(A.rainColor ?? '#a8b8d0', B.rainColor ?? '#a8b8d0', e)).multiplyScalar(CFG.map.rainBright ?? 0.7);
  WEATHER.sandCol.set(mixHex(A.sandColor ?? '#c8a070', B.sandColor ?? '#c8a070', e));
}
// 날씨 양 슬라이더 (비 · 모래바람 · 번개)
for (const [id, key] of [['rainA', 'rain'], ['sandA', 'sand'], ['boltA', 'lightning']]) {
  const el = document.getElementById(id);
  el.oninput = (e) => { WEATHER[key] = +e.target.value; document.getElementById(id + 'V').textContent = (+e.target.value).toFixed(2); };
  el.onchange = (e) => e.target.blur();
}
document.getElementById('sandC').oninput = (e) => WEATHER.sandCol.set(e.target.value);   // 모래 색 (설정 메뉴에서 바로)
document.getElementById('sandC').onchange = (e) => e.target.blur();
document.getElementById('mapBtn').onclick = (e) => { applyMapPreset(mapIdx + 1); e.target.blur(); };   // 처음 셋팅은 90_loop.js에서 (뒤 파일의 값이 다 준비된 뒤)
resetGrowth();
resize();
Object.assign(window.dbg, { U, ballHit, cliffG, mainRoadX, addScorchDecal, resetCamera, renderer, scene, rt, tank, keys, fireCannon, physStep, updateBalls, fieldTick, burning, fFire, fChar, fGrow, footprints, spawnTank, resetTank, heightAt, PHYS_H, driveEffects, syncTankVisual, smokeP, glowP, targets, destroyTarget, BRIDGE, waterAt, creekPoly, explode, trackRT, balls, ballGeo, ballMat, crates, wireSpans, allPoles, WRECKS, PUDDLES, poleTilt, kickPole, toggleCollisionView, CREEK_UP: () => CREEK_UP, creekPoly, aoMs: () => aoMs, aoHits: () => aoHits, gapData });

// 카메라는 탱크 뒤에서 시작해 탱크를 따라 이동. 마우스로 자유롭게 돌릴 수 있다.
// 화면 가운데에는 탱크가 아니라 탱크가 바라보는 쪽 9m 앞을 둔다: 기본 시점에서 탱크는 화면 세로 2/3쯤 아래에 보이고
// 앞이 넓게 보인다. 바라보는 쪽 = 포탑이 겨눈 방향(기본) 또는 차체 앞 (HUD 토글). 탱크·포탑이 돌면 부드럽게 따라 돈다
const CC = CFG.camera, CAM_LEAD = CC.lead, CAM_YAW = CC.yaw * DEG, camLead = new THREE.Vector3(), _cf = new THREE.Vector3(), _cl2 = new THREE.Vector3();
// 보는 방향 기준: 'auto' 자동(키보드 = 포탑, 게임패드 = 차체) · 'hull' 차체 방향 · 'turret' 포탑 방향. 고른 것은 localStorage에 기억
const CAM_MODES = ['auto', 'hull', 'turret'], CAM_MODE_KO = { auto: '자동', hull: '차체 방향', turret: '포탑 방향' };
let camMode = 'auto';
try { const m = localStorage.getItem('MightyMolly.camMode'); if (CAM_MODES.includes(m)) camMode = m; } catch (_) {}
const camTurret = () => { if (camMode !== 'auto') return camMode === 'turret'; try { return !inputPad; } catch (_) { return true; } };
function setCamMode(m) {
  camMode = m; try { localStorage.setItem('MightyMolly.camMode', m); } catch (_) {}
  document.getElementById('camModeBtn').textContent = `시점: ${CAM_MODE_KO[m]}`;
}
setCamMode(camMode);
// 소리 크기 (0~1): 일시정지 창 '설정' 탭과 설정 메뉴 게이지가 같이 쓴다. 기억해 둔다
let volNow = 0.5;
try { const v = parseFloat(localStorage.getItem('MightyMolly.volume')); if (v >= 0 && v <= 1) volNow = v; } catch (_) {}
function setVolume(v) {
  volNow = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
  try { sfx.setVolume(volNow); } catch (_) {}   // (로딩 중엔 소리가 아직 없다: 60_audio.js 뒤에서 다시 맞춘다)
  try { localStorage.setItem('MightyMolly.volume', String(volNow)); } catch (_) {}
  const el = document.getElementById('vol'); el.value = volNow; document.getElementById('volV').textContent = volNow.toFixed(2);
}
setVolume(volNow);
// 켜기/끄기 설정 (일시정지 창 '설정' 탭): 기억해 두었다가 다시 쓴다
const saveOpt = (k, v) => { try { localStorage.setItem('MightyMolly.' + k, v ? '1' : '0'); } catch (_) {} };
let autoCam = loadOpt('autoCam', true), shakeOn = loadOpt('shake', true), rumbleOn = loadOpt('rumble', true);
const setAutoCam = (v) => { autoCam = v; saveOpt('autoCam', v); if (!v) { camBackAt = 0; camRet = null; } };
const setShakeOn = (v) => { shakeOn = v; saveOpt('shake', v); };
const setRumbleOn = (v) => { rumbleOn = v; saveOpt('rumble', v); if (v) padRumbleNow(0.5, 0.7, 160); };   // 켜면 한 번 울려서 되는지 알 수 있게
// 화면 밝기 (0.5~1.5, 1 = 그대로): 후처리에서 감마로 (어두운 곳이 밝아진다)
let brightness = 1;
try { const b = parseFloat(localStorage.getItem('MightyMolly.bright')); if (b >= 0.5 && b <= 1.5) brightness = b; } catch (_) {}
// 설정 탭 모두 초기 값으로 (일시정지 → 설정 → [R], 확인 창에서 예)
function resetSettings() {
  setVolume(0.5); setCamMode('auto'); setAutoCam(true); setShakeOn(true); setRumbleOn(true); setDmgTextOn(!!DTC.enabled); setBright(1);
  if (crtOn !== !!CRT.enabled) setCrt(!!CRT.enabled);
}
function setBright(b) { brightness = Math.max(0.5, Math.min(1.5, Math.round(b * 20) / 20)); postMat.uniforms.uBright.value = brightness; try { localStorage.setItem('MightyMolly.bright', String(brightness)); } catch (_) {} }
const camFocus = (out) => out.copy(tank.pos).add(camLead);
function updateCamLead(dt, snap = false) {
  const ty = camTurret() ? tank.tyaw || 0 : 0;
  _cl2.set(Math.sin(ty), 0, Math.cos(ty)).applyQuaternion(tank.q); _cl2.y = 0;
  if (_cl2.lengthSq() < 1e-4) return;
  _cl2.normalize().multiplyScalar(CAM_LEAD);
  if (snap) camLead.copy(_cl2); else camLead.lerp(_cl2, Math.min(1, dt * 2.5));
}
const lastFollow = tank.pos.clone();
// 카메라는 탱크가 도는 방향을 레이싱 게임처럼 한 박자 늦게 느슨하게 따라 돈다
const tankYaw = () => { _fwd.set(0, 0, 1).applyQuaternion(tank.q); return Math.atan2(_fwd.x, _fwd.z) + (camTurret() ? tank.tyaw || 0 : 0); };   // 카메라가 따라 도는 방향
let camYaw = 0;
// 기본 위치: 화면 가운데에서 42.6m, 내려다보는 각 33.6도, 탱크 뒤에서 오른쪽으로 20도 돌아가 탱크 오른쪽 옆면이 살짝 보인다 (설정. 카메라 초기화 버튼도 이것)
function resetCamera() {
  camYaw = tankYaw() + CAM_YAW;
  updateCamLead(0, true);
  camFocus(controls.target);
  const hd = CC.distance * Math.cos(CC.pitch * DEG);
  camera.position.copy(controls.target).add(_tmp.set(-Math.sin(camYaw) * hd, CC.distance * Math.sin(CC.pitch * DEG), -Math.cos(camYaw) * hd));
  lastFollow.copy(controls.target);
  controls.update();
}
resetCamera();
window.dbg.lastFollow = lastFollow;
// 카메라가 땅 속으로 들어가지 않게: 카메라 자리와 화면 가운데 쪽으로 조금 나아간 두 곳의 땅 높이 + minHeight 아래로는 못 내려간다
// (가까운 면이 화면 앞을 가로막지 않게 앞쪽도 본다). 마우스로 낮게 돌려도 여기서 막힌다
const CAM_MIN_H = CC.minHeight ?? 2;
function camAboveGround() {
  const p = camera.position, t = controls.target;
  let dx = t.x - p.x, dz = t.z - p.z;
  const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const g = Math.max(heightAt(p.x, p.z), heightAt(p.x + dx * 2, p.z + dz * 2), heightAt(p.x + dx * 4, p.z + dz * 4)) + CAM_MIN_H;
  if (p.y < g) p.y = g;
}
// 전환이 끝났을 때의 플레이 카메라 자리: 포탑이 정면(전환 동안 가운데로 돌아온다)일 때의 기본 자리
function playRestCam() {
  const ty = tank.tyaw; tank.tyaw = 0;
  resetCamera();
  tank.tyaw = ty;
}
function followYaw(dt) {
  let d = tankYaw() + CAM_YAW - camYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const step = d * Math.min(1, dt * CC.follow);
  camYaw += step;
  _tmp.copy(camera.position).sub(controls.target).applyAxisAngle(UP, step);
  camera.position.copy(controls.target).add(_tmp);
}

