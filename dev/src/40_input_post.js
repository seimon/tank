// ---------------------------------------------------------------- 입력
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (UI.screen === pauseUI && e.code === 'KeyT') uiShow(confirmUI);   // 일시정지: T = 첫 화면으로 (확인 창)
  else if (UI.screen === pauseUI && (e.code === 'KeyW' || e.code === 'KeyS') && !e.repeat) pauseUI.nudge(e.code === 'KeyW' ? -1 : 1);   // 강화 기록 넘겨 보기 (누르고 있으면 tick이 계속 넘긴다)
  else if (UI.screen === pauseUI && (e.code === 'KeyA' || e.code === 'KeyD')) pauseUI.toEnd(e.code === 'KeyD');   // 강화 기록 맨 위(A) / 맨 아래(D)
  else if (UI.screen === pauseUI && (e.code === 'KeyQ' || e.code === 'KeyE')) pauseUI.setTab(pauseUI.tab + (e.code === 'KeyE' ? 1 : -1));   // 탭: Q 왼쪽, E 오른쪽
  else if (UI.screen === confirmUI) { if (e.code === 'KeyY') restartGame(true); else if (e.code === 'KeyN') uiShow(pauseUI); }
  if (paused) return;
  if (e.code === 'KeyG' && titleState === 'play') {   // G: 적군 섬멸이면 새로 시작, 파괴됐으면 재출격, 아니면 세우기
    if (endState === 'clear') restartGame(false);
    else if (endState === 'dead') respawn();
    else if (!winUp()) uprightTank();   // 창이 떠 있으면 세우기도 안 됨
  }
  if (e.code === 'KeyT' && endState === 'clear') restartGame(true);   // T: 첫 화면으로
});
// 뒤집혔을 때 세운다 (G키, 터치 '세우기' 버튼): 포탄 한 발을 쏜 것처럼 장전돼 있을 때만 되고, 하면 한 발 소모 (포탄은 안 나감)
function uprightTank() {
  if (!tank.solid || tank.cool > 0) return;
  tank.cool = tank.reload;
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  if (Math.abs(tank.pos.x) < HALF - 2 && Math.abs(tank.pos.z) < HALF - 2) hopUpright(tank, tank.pos.x, tank.pos.z, Math.atan2(_fwd.x, _fwd.z));
  else spawnTank();
}
// 그 자리에서 resetLift(m)만큼 붕 떠올랐다가 떨어지며 자세를 잡는다. 올라가는 동안 바른 자세로 돌아가고, 착지는 낙하와 같은 처리
const _hq = new THREE.Quaternion(), _hp = new THREE.Vector3();
function hopUpright(T, x, z, yaw) {
  _hq.copy(T.q); _hp.copy(T.pos);
  resetTank(x, z, yaw, T);   // 바른 자세와 착지 높이
  const lift = PC.resetLift ?? 4;
  T.hop = { q0: _hq.clone(), q1: T.q.clone(), p0: _hp.clone(), p1: T.pos.clone(), t: 0, up: Math.sqrt(2 * 22 * (lift + Math.max(0, T.pos.y - _hp.y))) / 22 };
  T.landY = T.pos.y; T.pos.copy(_hp); T.q.copy(_hq);
  T.vy = T.hop.up * 22;
  T.falling = true; T.solid = false;
  sfx.thud(T.pos, 0.5);
  syncBody(T);
}
// 터치 조작: 아날로그 패드(위 = 전진, 좌우 = 선회)와 누르고 있는 동안 유지되는 버튼들. 마우스로도 된다
const touch = { thr: 0, steer: 0, up: false, down: false, fire: false, tl: false, tr: false };
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
  // 메뉴 토글. 터치 화면 기기에서는 처음부터 켠다
  const ui = document.getElementById('touchUI'), btn = document.getElementById('touchBtn');
  const show = (v) => { ui.style.display = v ? '' : 'none'; btn.textContent = v ? '터치 버튼 켜짐' : '터치 버튼 꺼짐'; };
  btn.onclick = (e) => { show(ui.style.display === 'none'); e.target.blur(); };
  show(matchMedia('(pointer: coarse)').matches);
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
const olMat = ps1(new THREE.MeshBasicMaterial({ colorWrite: false }), null, 'outlineDepth');
let outlineOn = false;
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 가운데 창(전투 불능·적군 섬멸·일시정지·확인) 설정: 배경 회색조 두 색과 전환 시간, 창이 사라지는 시간, 창 색
const POPC = CFG.popup || {};
const POP = { dark: POPC.grayDark || '#191d20', light: POPC.grayLight || '#7b919b', grayTime: POPC.grayTime ?? 0.4, fade: POPC.fadeTime ?? 0.4,
  pause: POPC.pauseColor || '#cc8000', confirm: POPC.confirmColor || '#e0533c', dead: POPC.deadColor || '#e0533c', clear: POPC.clearColor || '#00b37d' };
const hexV3 = (h) => new THREE.Vector3(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));   // 색 그대로 (sRGB, 후처리도 sRGB에서 섞는다)
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uFlash: { value: 0 }, tDepth: { value: rt.depthTexture }, tOL: { value: olRT.depthTexture },
    uOL: { value: 0 }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTexel: { value: new THREE.Vector2(1, 1) },
    uFogN: FOGN, uFogF: FOGF, uFogC: { value: FOG },
    uGrad: { value: 0 }, uGradA: { value: 0.6 }, uGradB: { value: 0.9 }, uGradC: { value: new THREE.Color(1, 1, 1) },
    uGray: { value: 0 }, uGrayA: { value: hexV3(POP.dark) }, uGrayB: { value: hexV3(POP.light) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDepth, tOL; uniform float uFlash, uOL, uNear, uFar, uFogN, uFogF, uGrad, uGradA, uGradB, uGray; uniform vec2 uTexel; uniform vec3 uFogC, uGradC, uGrayA, uGrayB; varying vec2 vUv;
    float lin(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }   // 깊이 버퍼 값 → 카메라에서 거리
    float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec3 lc = texture2D(tDiffuse, vUv).rgb;
      if (uOL > 0.5) {
        // 외곽선: 물체 픽셀인데 이웃 중 훨씬 먼 곳(배경·뒤의 물체)이 있으면 1픽셀 선. 풀·땅에 가려진 곳은 빼고
        float d0 = texture2D(tOL, vUv).r;
        if (d0 < 1.0) {
          float d = lin(d0);
          float m = max(max(lin(texture2D(tOL, vUv + vec2(uTexel.x, 0.0)).r), lin(texture2D(tOL, vUv - vec2(uTexel.x, 0.0)).r)),
                        max(lin(texture2D(tOL, vUv + vec2(0.0, uTexel.y)).r), lin(texture2D(tOL, vUv - vec2(0.0, uTexel.y)).r)));
          float seen = step(d - 0.3 - d * 0.02, lin(texture2D(tDepth, vUv).r));
          float fk = max(d - uFogN, 0.0) * 2.0 / max(uFogF - uFogN, 0.001), fogK = 1.0 - exp(-fk * fk);   // 지형과 같은 안개: 멀수록 선 색이 안개 색으로 묻힌다
          if (m - d > 0.6 + d * 0.06) lc = mix(lc, mix(vec3(0.012, 0.01, 0.008), uFogC, fogK), 0.9 * seen);
        }
      }
      lc = mix(lc, uGradC, uGrad * smoothstep(uGradA, uGradB, vUv.y));   // 타이틀: 화면 위쪽으로 갈수록 흰색 (아래 → 위, 0~1)
      vec3 c = toSRGB(lc);
      c = mix(c, vec3(1.0, 0.94, 0.82), uFlash * 0.7);
      if (uGray > 0.0) c = mix(c, mix(uGrayA, uGrayB, dot(c, vec3(0.299, 0.587, 0.114))), uGray);   // 끝 창·일시정지: 밝기를 두 색 사이로 (그라디언트 맵)
      c = floor(c * 31.0 + 0.5 + (bayer4(gl_FragCoord.xy) - 0.5)) / 31.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
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
const ENV_PLAY = { fog: new THREE.Color(CFG.map.fogColor), near: 0, far: 2 / CFG.map.fog, moon: CFG.map.moon, moonC: new THREE.Color(CFG.map.moonColor),
  sky: 1.5, skyC: new THREE.Color(0x7d8aac), gndC: new THREE.Color(0x4a3a2a), grad: 0 };
const ENV_TITLE = { fog: new THREE.Color(TT.fogColor ?? '#ffffff'), near: TT.fogNear ?? 20, far: TT.fogFar ?? 60, moon: TT.moon ?? 2.6, moonC: new THREE.Color(TT.moonColor ?? '#fff2dc'),
  sky: TT.sky ?? 2.2, skyC: new THREE.Color(TT.skyColor ?? '#eef2f8'), gndC: new THREE.Color(TT.groundColor ?? '#8a7a62'), grad: TT.gradient?.strength ?? 1 };
postMat.uniforms.uGradA.value = TT.gradient?.from ?? 0.64; postMat.uniforms.uGradB.value = TT.gradient?.to ?? 0.9;
postMat.uniforms.uGradC.value.copy(ENV_TITLE.fog);
let titleK = TT.enabled === false ? 1 : 0;
try { if (sessionStorage.getItem('littleIron.skipTitle')) { sessionStorage.removeItem('littleIron.skipTitle'); titleK = 1; } } catch (_) {}   // '새로 시작'으로 다시 읽었으면 타이틀 없이
function applyEnv() {
  const A = ENV_TITLE, B = ENV_PLAY, k = titleK;
  FOG.lerpColors(A.fog, B.fog, k); scene.fog.color.copy(FOG);
  scene.fog.near = FOGN.value = lerp(A.near, B.near, k); scene.fog.far = FOGF.value = lerp(A.far, B.far, k);
  moon.intensity = lerp(A.moon, B.moon, k); moon.color.lerpColors(A.moonC, B.moonC, k);
  hemi.intensity = lerp(A.sky, B.sky, k); hemi.color.lerpColors(A.skyC, B.skyC, k); hemi.groundColor.lerpColors(A.gndC, B.gndC, k);
  postMat.uniforms.uGrad.value = lerp(A.grad, B.grad, k);
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
    sharpBlit(c, titleFadeTh > 0 ? ditherMask(c._src, titleFadeTh) : c._src, c._css[0], c._css[1]);
    Object.assign(c.style, { left: '', right: '', top: '', bottom: '', [side]: `${m + dx}px`, [v]: `${m + dy}px` });
    return c._src.width * u;
  };
  put('tLogo', 'left', 'top'); put('tBrand', 'right', 'top');
  // 아래 요소들은 오른쪽 아래로 1칸 그림자가 있다: 여백 10칸은 그림자를 빼고 잰다
  const bw = put('tBadge', 'left', 'bottom', 0, -u), pw = put('tPress', 'right', 'bottom', -u, -u);
  const vw = el('tVer')._src.width * u, vx = bw + 6 * u;
  if (m + vx + vw + 10 * u + pw + m <= VR.w) put('tVer', 'left', 'bottom', vx, -u);
  else put('tVer', 'left', 'bottom', 0, el('tBadge')._src.height * u + 4 * u - u);
}
let paused = false, pausedDrawn = false, pauseScene = false;   // pauseScene: 멈춘 뒤 장면을 한 번 그렸다 (그 뒤로는 HUD·창·회색조만 다시 그린다)   // 일시정지 (창이 비활성이거나 ESC). 멈춘 직후 한 번만 다시 그린다
function resize() {
  if (!innerWidth || !innerHeight) return;   // 창이 접혀 크기가 0이면 다음 크기 변경 때
  viewRect();
  if (resMax) lowH = Math.round(VR.h * (devicePixelRatio || 1));
  const w = Math.max(2, Math.round(lowH * VR.w / VR.h)), dpr = devicePixelRatio || 1, dw = Math.max(2, Math.round(VR.w * dpr)), dh = Math.max(2, Math.round(VR.h * dpr));
  renderer.setSize(dw, dh, false);   // 캔버스는 기기 픽셀 크기 (게임은 rt에 저해상도로 그리고 마지막에 늘린다)
  rt.setSize(w, lowH); olRT.setSize(w, lowH); postRT.setSize(w, lowH);
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
let grassMode = 0;   // 텍스처 종류 (0부터)
function setGrass(m) {
  grassMode = m;
  for (const cm of grassCard) cm.material = grassCardMats[m];
  document.getElementById('grassBtn').textContent = `풀: 텍스처${grassCardNames[m]}`;
}
document.getElementById('grassBtn').onclick = (e) => { setGrass((grassMode + 1) % grassCardMats.length); e.target.blur(); };   // 텍스처1 → 2 → 3 → 1
setGrass(1);   // 처음엔 텍스처2 (이삭 풀)
document.getElementById('ppBtn').onclick = (e) => {
  pixelPerfect = !pixelPerfect; e.target.textContent = pixelPerfect ? 'Pixel Perfect 켜짐' : 'Pixel Perfect 꺼짐';
  resize(); e.target.blur();
};
document.getElementById('aaBtn').onclick = (e) => {   // 안티에일리어싱: 저해상도 화면 버퍼를 4배 다중 샘플로
  rt.samples = rt.samples ? 0 : 4; rt.dispose();
  e.target.textContent = rt.samples ? 'AA 켜짐' : 'AA 꺼짐'; e.target.blur();
};
document.getElementById('camModeBtn').onclick = (e) => {   // 화면 가운데·카메라 방향을 포탑 기준 / 차체 기준으로
  camByTurret = !camByTurret; e.target.textContent = camByTurret ? '시점: 포탑 방향' : '시점: 차체 방향'; e.target.blur();
};
document.getElementById('fogC').oninput = (e) => { ENV_PLAY.fog.set(e.target.value); applyEnv(); };
document.getElementById('fogC').onchange = (e) => e.target.blur();
document.getElementById('vol').oninput = (e) => { sfx.setVolume(+e.target.value); document.getElementById('volV').textContent = (+e.target.value).toFixed(2); };
document.getElementById('debris').oninput = (e) => { windDebris = +e.target.value; document.getElementById('debrisV').textContent = windDebris.toFixed(2); };
for (const id of ['vol', 'debris']) document.getElementById(id).onchange = (e) => e.target.blur();
// 성장 테스트: 상자·적 떨구기 (내 탱크 둘레 12~32m), 내 탱크 성능 슬라이더 (오른쪽일수록 강하게)
document.getElementById('tDropGold').onclick = (e) => { dropSafe('gold', tank.pos); e.target.blur(); };
document.getElementById('tDropRepair').onclick = (e) => { dropSafe('repair', tank.pos); e.target.blur(); };
document.getElementById('tDropEnemy').onclick = (e) => { startDrop(newEnemy(false, Math.min(EC.clearKills, enemyDrops + 2)), tank.pos); e.target.blur(); };   // 다음 순번 레벨로
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
const sliderAt = (id) => { const el = document.getElementById(id); return +el.value >= +el.max - 1e-6; };   // 최대값에 닿았는가
// 성장으로 바뀌는 내 탱크 값을 모두 처음으로 (슬라이더 + 고른 성장 항목)
function resetGrowth() {
  for (const [id] of GROW) { const el = document.getElementById(id); el.value = el.defaultValue; el.oninput(); }
  Object.assign(tank, { maxHp: PC.hp, hp: Math.min(tank.hp, PC.hp), magnetR: MAGNET_R, armorM: 1, goldMul: 1, pierce: 0, ram: false, waterSpeed: undefined, goldKeep: false, autoRepair: false, repairAcc: 0, mg: null, picks: {}, pickLog: [] });
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
};
const upText = (s, u) => s.replaceAll('{v}', u.value ?? '').replaceAll('{n}', tank.goldMul + 1);
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
function rollChoices() {
  const pool = GC.upgrades.filter(u => upAvail(u) && upWeight(u) > 0), out = [];
  while (out.length < 3 && pool.length) {
    let r = Math.random() * pool.reduce((s, u) => s + upWeight(u), 0), k = 0;
    while (k < pool.length - 1 && (r -= upWeight(pool[k])) > 0) k++;
    out.push(pool.splice(k, 1)[0]);
  }
  return out.map(u => ({ u, label: upText(u.name, u), desc: upText(u.desc, u) + (upLast(u) ? ' (최대)' : '') }));
}
let testOffers = 0, curOffer = null, growLevel = 0, heldOffer = null;   // heldOffer: 고르기 전에 터져서 접어 둔 선택지 (다시 착지하면 띄운다)
function drawOffer() { if (UI.screen !== offerUI) uiShow(offerUI); else uiDirty(); }
// 다음 선택지: 테스트 버튼으로 예약한 것 먼저, 아니면 골드가 100 이상일 때
function nextOffer() {
  if (curOffer || heldOffer || !tank.solid) return;   // 터져 있거나 떨어지는 중이면 착지한 뒤에
  if (testOffers > 0) testOffers--;
  else if (gold < offerCost()) return;
  const choices = rollChoices();
  if (!choices.length) return;
  curOffer = { choices, picked: -1, showT: 0 };
  drawOffer();
  sfx.kit();
}
function goldGain(n) { gold += n; nextOffer(); }
function pickOffer(i) {
  if (!curOffer || curOffer.picked >= 0 || !curOffer.choices[i]) return;
  curOffer.picked = i;
  const u = curOffer.choices[i].u;
  UP_FX[u.id].apply(u.value);
  tank.picks[u.id] = (tank.picks[u.id] || 0) + 1;
  tank.pickLog.push(curOffer.choices[i]); drawPickLog();
  if (!curOffer.paid) gold = Math.max(0, gold - offerCost());   // 성장 값으로 골드를 낸다 (고르기 전 단계 기준. 0 아래로는 안 내려감. 터질 때 미리 낸 선택지는 빼고)
  growLevel++;   // 테스트 버튼으로 띄운 선택지도 똑같이 한 단계
  curOffer.pickT = 0;   // 고른 뒤 흐른 시간 (offerUI.tick: 게임이 멈추면 같이 멈춘다)
  drawOffer();   // 나머지는 곧바로 어두운 회색
  sfx.coin();
}
// 고르기 전의 선택지를 거둔다 (처음부터 다시 할 때)
function cancelOffer() {
  heldOffer = null;
  if (!curOffer || curOffer.picked >= 0) return;
  curOffer = null; if (UI.screen === offerUI) uiShow(null);
}
// 내 탱크가 고르기 전에 터졌을 때: 선택지를 접어 둔다. 골드를 흩뿌릴 거라면 성장 값은 지금 미리 낸다 (흩뿌린 골드를 다시 주워 또 쓰지 않게)
function holdOffer(spill) {
  if (!curOffer || curOffer.picked >= 0) return;
  heldOffer = curOffer; curOffer = null;
  if (spill && !heldOffer.paid) { heldOffer.paid = true; gold = Math.max(0, gold - offerCost()); }
  if (UI.screen === offerUI) uiShow(null);
}
// 다시 떨어져 착지했을 때: 접어 둔 선택지를 처음처럼 띄우고, 없으면 골드가 모였는지 본다
function landOffer() {
  if (heldOffer) { curOffer = heldOffer; heldOffer = null; curOffer.showT = 0; drawOffer(); sfx.kit(); }
  else nextOffer();
}
addEventListener('keydown', (e) => { const k = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (k >= 0 && UI.screen === offerUI) pickOffer(k); });   // 선택지가 보일 때만 (일시정지 창 아래에 있으면 안 됨)
document.getElementById('gOffer').onclick = (e) => { testOffers++; nextOffer(); e.target.blur(); };   // 테스트: 골드 없이 바로 선택지
// 테스트: 성장 10단계를 한 번에. 단계마다 평소처럼 선택지 3개를 뽑아 그중 하나를 무작위로 고른다 (골드는 쓰지 않음. 떠 있는 선택지는 그대로)
document.getElementById('gRand10').onclick = (e) => {
  for (let k = 0; k < 10; k++) {
    const ch = rollChoices();
    if (!ch.length) break;   // 더 고를 것이 없다
    const c = ch[Math.floor(Math.random() * ch.length)];
    UP_FX[c.u.id].apply(c.u.value);
    tank.picks[c.u.id] = (tank.picks[c.u.id] || 0) + 1;
    tank.pickLog.push(c);
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
let windDir = CFG.map.windDir ?? 215;   // 바람이 불어 가는 쪽 (°): 0 = +x, 90 = +z(북쪽)
document.getElementById('windDir').value = windDir; document.getElementById('windDirV').textContent = `${windDir}°`;
document.getElementById('windDir').oninput = (e) => { windDir = +e.target.value; document.getElementById('windDirV').textContent = `${windDir}°`; };
document.getElementById('wind').oninput = (e) => { U.uWind.value = +e.target.value; document.getElementById('windV').textContent = (+e.target.value).toFixed(2); };
document.getElementById('wind').onchange = (e) => e.target.blur();
document.getElementById('fog').oninput = (e) => { ENV_PLAY.far = 2 / Math.max(1e-4, +e.target.value); applyEnv(); document.getElementById('fogV').textContent = (+e.target.value).toFixed(4); };
document.getElementById('fog').onchange = (e) => e.target.blur();
document.getElementById('cbox').onclick = (e) => { toggleCollisionView(); e.target.blur(); };
// 설정 메뉴: ` 키로 열고 닫는다 (늘 펼쳐진 상태)
const hudEl = document.getElementById('hud');
addEventListener('keydown', (e) => { if (e.code === 'Backquote') { hudEl.style.display = hudEl.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); } });
document.getElementById('camreset').onclick = (e) => { resetCamera(); e.target.blur(); };
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
for (const [id, v] of [['wind', CFG.map.wind], ['fog', CFG.map.fog], ['fogC', CFG.map.fogColor], ['aoK', CFG.map.ao], ['moonI', CFG.map.moon], ['moonC', CFG.map.moonColor]]) setInput(id, v);
resetGrowth();
resize();
Object.assign(window.dbg, { U, ballHit, cliffG, mainRoadX, addScorchDecal, resetCamera, renderer, scene, rt, tank, keys, fireCannon, physStep, updateBalls, fieldTick, burning, fFire, fChar, fGrow, footprints, spawnTank, resetTank, heightAt, PHYS_H, driveEffects, syncTankVisual, smokeP, glowP, targets, destroyTarget, BRIDGE, waterAt, creekPoly, explode, trackRT, balls, ballGeo, ballMat, crates, wireSpans, allPoles, WRECKS, PUDDLES, poleTilt, kickPole, toggleCollisionView, CREEK_UP: () => CREEK_UP, creekPoly, aoMs: () => aoMs, aoHits: () => aoHits, gapData });

// 카메라는 탱크 뒤에서 시작해 탱크를 따라 이동. 마우스로 자유롭게 돌릴 수 있다.
// 화면 가운데에는 탱크가 아니라 탱크가 바라보는 쪽 9m 앞을 둔다: 기본 시점에서 탱크는 화면 세로 2/3쯤 아래에 보이고
// 앞이 넓게 보인다. 바라보는 쪽 = 포탑이 겨눈 방향(기본) 또는 차체 앞 (HUD 토글). 탱크·포탑이 돌면 부드럽게 따라 돈다
const CC = CFG.camera, CAM_LEAD = CC.lead, CAM_YAW = CC.yaw * DEG, camLead = new THREE.Vector3(), _cf = new THREE.Vector3(), _cl2 = new THREE.Vector3();
let camByTurret = CC.byTurret;
document.getElementById('camModeBtn').textContent = camByTurret ? '시점: 포탑 방향' : '시점: 차체 방향';
const camFocus = (out) => out.copy(tank.pos).add(camLead);
function updateCamLead(dt, snap = false) {
  const ty = camByTurret ? tank.tyaw || 0 : 0;
  _cl2.set(Math.sin(ty), 0, Math.cos(ty)).applyQuaternion(tank.q); _cl2.y = 0;
  if (_cl2.lengthSq() < 1e-4) return;
  _cl2.normalize().multiplyScalar(CAM_LEAD);
  if (snap) camLead.copy(_cl2); else camLead.lerp(_cl2, Math.min(1, dt * 2.5));
}
const lastFollow = tank.pos.clone();
// 카메라는 탱크가 도는 방향을 레이싱 게임처럼 한 박자 늦게 느슨하게 따라 돈다
const tankYaw = () => { _fwd.set(0, 0, 1).applyQuaternion(tank.q); return Math.atan2(_fwd.x, _fwd.z) + (camByTurret ? tank.tyaw || 0 : 0); };   // 카메라가 따라 도는 방향
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
function followYaw(dt) {
  let d = tankYaw() + CAM_YAW - camYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const step = d * Math.min(1, dt * CC.follow);
  camYaw += step;
  _tmp.copy(camera.position).sub(controls.target).applyAxisAngle(UP, step);
  camera.position.copy(controls.target).add(_tmp);
}

