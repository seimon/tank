// ---------------------------------------------------------------- 임무 완료 화면 (config clear)
// 적을 모두 물리치면 (showEnd('clear') → clearBegin): 카메라가 플레이 카메라에서 임무 완료 카메라로 EaseInOutCubic으로 넘어가고
// (타이틀 → 플레이와 같은 식: 화면 가운데 점·거리·내려다보는 각·방향을 따로 보간), 탱크는 포탑·포신을 포즈로 돌린다.
// 조명은 타이틀 조명으로 (applyEnv), 배경은 4x4 디더링으로 지워 단색만 남긴다: 내 탱크만 cutRT에 따로 그리고 후처리가 그쪽으로 바꿔 간다.
// 다 지우면 장면은 더 그리지 않고 (탱크·바닥·파티클·포탄만), 월드도 멈춘다 (tick이 clearHold()면 clearTick: 탱크 포즈·대포·파티클만). 글자는 좌상단 clearUI (81_ui.js)
// 바닥: 배경색과 같은 색의 넓은 평면 (빛을 받지 않아 배경과 경계가 안 보인다). 탱크 그림자·뒷등 빛만 비친다 (지면과 같은 식, 탱크 둘레만)
const CLR = Object.assign({ transition: 2.2, pose: {}, background: '#24272b', wipeDelay: 0.4, wipeTime: 1.4, textDelay: 1 }, CFG.clear);
const CLR_CAM = Object.assign({ distance: 26, pitch: 8, yaw: 150, fov: 22, height: 1.4, shift: 0.22, spin: 2 }, CLR.camera);
const CLR_BG = new THREE.Color(CLR.background);
const clrFloor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uSh0: U.uSh0, uSh1: U.uSh1, uLamp0: U.uLamp0, uLamp1: U.uLamp1, uC: { value: CLR_BG }, uTP: { value: new THREE.Vector2() }, uFl: { value: new THREE.Vector4() }, uFlC: { value: new THREE.Color() }, uTk: { value: new THREE.Vector4() }, uTkS: { value: new THREE.Vector4() } },
  vertexShader: 'varying vec2 vXZ; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: SHADOW_GLSL + `uniform vec3 uC, uFlC; uniform vec2 uTP; uniform vec4 uFl, uTk, uTkS; varying vec2 vXZ;
    void main() {
      float near = 1.0 - smoothstep(5.0, 8.0, distance(vXZ, uTP));   // 내 탱크 둘레만 (보이지 않는 잔해·지프 그림자는 빼고)
      float fl = 1.0 - smoothstep(0.0, 10.0, distance(vXZ, uFl.xz)); fl *= fl * uFl.w;   // 포구 섬광이 바닥에 비치는 빛 (뒷등처럼 흉내: 바닥은 빛을 받지 않아서)
      if (fl > 0.0) {   // 섬광이 만드는 차체 그림자: 섬광에서 바닥 점으로 가는 선이 차체 높이(uTkS.z)의 1/3·2/3·끝에서 차체 바닥 사각형을 지나면 그늘. 멀수록 넓어진다
        float sh = 0.0;
        for (int i = 1; i <= 3; i++) {
          vec2 q = uFl.xz + (vXZ - uFl.xz) * (1.0 - uTkS.z * float(i) / 3.0 / uTkS.w);   // 그 높이에서 선이 지나는 자리 (uTkS.w = 섬광 높이)
          vec2 d = q - uTk.xy, l = vec2(d.x * uTk.z - d.y * uTk.w, d.x * uTk.w + d.y * uTk.z), e = abs(l) - uTkS.xy;
          sh = max(sh, 1.0 - smoothstep(-0.25, 0.35, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0)));
        }
        fl *= 1.0 - 0.9 * sh;
      }
      gl_FragColor = vec4(uC * (1.0 - 0.8 * contactShadow(vXZ) * near) + lampGlow(vXZ) * 0.25 * near + uFlC * fl * 0.5, 1.0);
    }`,
}));
clrFloor.position.y = -1000; clrFloor.userData.noOutline = true; clrFloor.layers.set(3); scene.add(clrFloor);   // 탱크만 그릴 때만 (레이어 3). 로딩 때 장면에 둬서 미리 컴파일하고, 다 되면 숨긴다 (90_loop.js)
// 탱크만 그리기는 카메라 레이어 3으로: 물체를 숨기면 그 안에 든 광원도 빠져 광원 수가 바뀌고, 그러면 탱크 재질을 모두 다시 컴파일해 멈칫한다.
// 그래서 광원은 모두 레이어 3에도 넣고, 탱크·바닥(·다 지운 뒤 파티클·포탄)만 레이어 3에 둔다
const CUT_LAYER = 3;
const clearHold = () => !!(clearSeq && clearSeq.cut >= 1);   // 배경을 다 지웠다: 월드를 멈추고 탱크만 그린다
function clearBegin() {
  if (clearSeq) return;
  _fwd.set(0, 0, 1).applyQuaternion(tank.q);
  _tmp.copy(camera.position).sub(controls.target);
  const d = _tmp.length();
  const fy = groundAt(tank.pos.x, tank.pos.z) + 0.02;   // 바닥 높이
  clearSeq = { t: 0, k: 0, cut: 0, yaw0: Math.atan2(_fwd.x, _fwd.z),   // 탱크 방향은 시작할 때 값으로 (돌아가도 카메라는 그대로)
    q0: tank.q.clone(), q1: new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(_fwd.x, _fwd.z)), y0: tank.pos.y, y1: fy + COM.y + 0.06,   // 자세: 경사면에서 기울어 있어도 똑바로 (방향은 그대로), 궤도 바닥이 바닥 평면에 닿게
    s: { tgt: controls.target.clone(), dist: d, pitch: Math.asin(_tmp.y / d), yaw: Math.atan2(-_tmp.x, -_tmp.z), fov: camera.fov } };
  controls.enabled = false;
  scene.traverse((o) => { if (o.isLight) o.layers.enable(CUT_LAYER); });
  tankGroup.traverse((o) => o.layers.enable(CUT_LAYER));
  clrFloor.position.set(tank.pos.x, fy, tank.pos.z); clrFloor.material.uniforms.uTP.value.set(tank.pos.x, tank.pos.z);
  dmgTexts.length = 0;   // 대미지 숫자는 지운다 (카메라가 옮겨 가니)
}
// 매 프레임 (카메라 자리): 진행, 카메라, 포즈, 조명
function clearUpdate(dt) {
  const S = clearSeq, c = CLR_CAM, T = Math.max(0.01, CLR.transition);
  S.t += dt;
  S.k = easeInOutCubic(Math.min(1, S.t / T));
  S.cut = Math.min(1, Math.max(0, (S.t - CLR.wipeDelay) / Math.max(0.01, CLR.wipeTime)));
  // 카메라: 시작 자리 → 탱크 둘레 (넘어간 뒤로는 spin°/초로 천천히 돈다)
  const k = S.k, s = S.s, tYaw = S.yaw0 + (c.yaw + c.spin * Math.max(0, S.t - T)) * DEG, tPitch = c.pitch * DEG;
  _ttg.copy(tank.pos); _ttg.y += c.height;
  let dy = tYaw - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const yaw = s.yaw + dy * k, pitch = lerp(s.pitch, tPitch, k), dist = lerp(s.dist, c.distance, k);
  controls.target.lerpVectors(s.tgt, _ttg, k);
  camera.position.copy(controls.target).add(_tmp.set(-Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, -Math.cos(yaw) * Math.cos(pitch) * dist));
  camera.lookAt(controls.target);
  const fov = lerp(s.fov, c.fov, k);
  // 탱크를 화면 오른쪽으로: 렌즈를 옆으로 밀어 (보는 방향은 그대로) 화면 폭의 shift만큼
  const asp = rt.width / rt.height;   // setViewOffset은 camera.aspect를 전체 폭÷높이로 바꾼다: 화면 비율 그대로 넘겨야 늘어나지 않는다
  camera.setViewOffset(asp, 1, -c.shift * k * asp, 0, asp, 1);
  if (camera.fov !== fov) { camera.fov = fov; U.uPointScale.value = lowH / (2 * Math.tan(fov * DEG / 2)); }
  camera.updateProjectionMatrix();
  // 포즈: 포탑·포신을 천천히 (타이틀 등장과 같은 빠르기)
  const P = CLR.pose || {}, side = wrapA((c.yaw + 180) * DEG) < 0 ? -1 : 1;   // 카메라가 있는 쪽 (포탑 각의 부호)
  tank.tyaw = stepTo(wrapA(tank.tyaw || 0), side * (P.turret ?? 15) * DEG, (tank.turretRate || TURRET_RATE) * dt); tank.tvel = 0;
  tank.elev = stepTo(tank.elev, (P.elev ?? 10) * DEG, 0.55 * dt);
  // 자세: 카메라가 넘어가는 동안 똑바로 세운다 (물리는 끈다: tick)
  if (tank.solid) { tank.q.slerpQuaternions(S.q0, S.q1, k); tank.pos.y = lerp(S.y0, S.y1, k); tank.vel.set(0, 0, 0); tank.w.set(0, 0, 0); }
  syncTankVisual();
  applyEnv();   // 조명을 타이틀 조명 쪽으로 (clearSeq.k)
}
// 탱크만 cutRT에: 다른 물체는 잠깐 숨기고, 배경은 단색, 안개는 멀리
// (배경을 다 지운 뒤로는 파티클·포탄도: 그때 남아 있던 것은 지우고 새로 쏜 것만)
function clearRenderCut() {
  const bg = scene.background, fn = scene.fog.near, ff = scene.fog.far, pn = FOGN.value, pf = FOGF.value;
  scene.background = CLR_BG; scene.fog.near = FOGN.value = 1e4; scene.fog.far = FOGF.value = 2e4; clrFloor.visible = true;
  camera.layers.set(CUT_LAYER);
  renderer.setRenderTarget(cutRT); renderer.render(scene, camera);
  camera.layers.set(0);
  scene.background = bg; scene.fog.near = fn; scene.fog.far = ff; FOGN.value = pn; FOGF.value = pf; clrFloor.visible = false;
}
// 배경을 다 지운 뒤의 tick: 월드는 멈추고 탱크 표시(포즈)만
// 대포: firstShot초 뒤부터 shotEvery초마다 (아무것도 부수지 않고, 멀리 가기 전에 터지지 않고 사라진다)
function clearTick(dt) {
  const S = clearSeq;
  if (S.shot == null) {   // 다 지운 순간: 남아 있던 파티클·포탄은 치운다
    S.shot = CLR.firstShot ?? 1;
    glowP.clearAll(); smokeP.clearAll();
    for (const b of balls) scene.remove(b.mesh);
    balls.length = 0;
    glowP.points.layers.enable(CUT_LAYER); smokeP.points.layers.enable(CUT_LAYER);   // 이제부터 파티클도 그린다
  }
  U.uTime.value += dt;
  if (tank.solid && (CLR.shotEvery ?? 5) > 0 && (S.shot -= dt) <= 0) {
    S.shot += CLR.shotEvery ?? 5;
    const b = fireCannon(); b.harmless = true; b.clearShot = true; b.mesh.layers.enable(CUT_LAYER); tank.cool = 0;
    tank.vel.set(0, 0, 0); tank.w.set(0, 0, 0);   // (물리는 멈춰 있다: 반동은 포신만)
  }
  for (let i = balls.length - 1; i >= 0; i--) if (balls[i].clearShot && balls[i].age > 0.8) { scene.remove(balls[i].mesh); balls.splice(i, 1); }
  updateBalls(dt);
  glowP.update(dt); smokeP.update(dt);
  updateLights(dt);   // 포구 섬광
  { // 바닥에 비치는 포구 섬광: 내 탱크 둘레에서 가장 밝은 섬광 하나
    let best = null, bk = 0;
    for (const f of flashes) { const k = (1 - f.t / f.dur) ** 2 * Math.min(1, f.I / 700); if (k > bk && Math.hypot(f.p.x - tank.pos.x, f.p.z - tank.pos.z) < 15) { bk = k; best = f; } }
    const u = clrFloor.material.uniforms;
    if (best) {
      u.uFl.value.set(best.p.x, best.p.y, best.p.z, bk); u.uFlC.value.set(best.color);
      _fwd.set(0, 0, 1).applyQuaternion(tank.q); const yaw = Math.atan2(_fwd.x, _fwd.z), lh = Math.max(0.5, best.p.y - clrFloor.position.y);   // 섬광 높이 (바닥에서)
      u.uTk.value.set(tank.pos.x, tank.pos.z, Math.cos(yaw), Math.sin(yaw)); u.uTkS.value.set(HULL_HX, HULL_HZ, Math.min(1.6, lh * 0.7), lh);   // 차체 바닥 사각형, 그림자를 드리우는 높이
    } else u.uFl.value.w = 0;
  }
  tank.recoil = Math.max(0, tank.recoil - dt * 3);
  parts.barrel.position.z = -0.5 * tank.recoil;
  syncTankVisual();
  updateShadows(); updateTankLamps(0);   // 바닥에 비치는 그림자·뒷등
  sfx.engine(tank.solid, 0, 0);
  sfx.siren(0, 1);   // 월드가 멈춘 뒤에는 updateBunkers가 안 돌아서, 마지막 사이렌 크기가 남지 않게 끈다
}
// ---- 화면 나가기 (새로 시작·첫 화면으로): 검정 4x4 디더링으로 위에서 아래로 덮은 뒤 다시 읽는다. 게임 픽셀 크기 캔버스 하나를
// 보통 화면에서는 맨 위에 늘려 얹고, CRT 표현이면 CRT 맨 위 레이어로 (crtLeave, 10a_crt.js)
let leaving = null;
const leaveEl = document.createElement('canvas');
Object.assign(leaveEl.style, { position: 'fixed', pointerEvents: 'none', zIndex: 50, imageRendering: 'pixelated', display: 'none' });
document.body.appendChild(leaveEl);
const BAYER16 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function leaveBegin() {
  if (leaving) return;
  leaving = { t: 0, q: -1 };
  const T = Math.max(0.05, CLR.leaveTime ?? 0.4);
  setTimeout(() => location.reload(), T * 1000 + 600);   // 루프가 멈춰 있어도 (창이 가려짐) 결국 다시 읽는다
  if (T <= 0.05) location.reload();
}
function leaveUpdate(dt) {
  if (!leaving) return;
  const T = Math.max(0.05, CLR.leaveTime ?? 0.4), f = Math.min(1, (leaving.t += dt) / T), q = Math.floor(f * 64);
  if (q !== leaving.q) {
    leaving.q = q;
    const W = rt.width, H = rt.height;
    if (leaveEl.width !== W || leaveEl.height !== H) { leaveEl.width = W; leaveEl.height = H; }
    const g = leaveEl.getContext('2d'), img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer);
    for (let y = 0; y < H; y++) {
      const lim = Math.min(1, Math.max(0, f * 2 - y / H)) * 16;   // 위에서 아래로 쓸어 내리며
      if (lim <= 0) continue;
      for (let x = 0; x < W; x++) if (BAYER16[(y & 3) * 4 + (x & 3)] < lim) px[y * W + x] = 0xff000000;
    }
    g.putImageData(img, 0, 0);
    Object.assign(leaveEl.style, { left: `${VR.x}px`, top: `${VR.y}px`, width: `${VR.w}px`, height: `${VR.h}px`, display: crtOn && layerScale ? 'none' : '' });
    crtLeave = leaveEl; crtDirty = true;
  }
  if (f >= 1 && !leaving.done) { leaving.done = true; setTimeout(() => location.reload(), 30); }   // 다 덮인 화면을 한 번 보이고
}
Object.assign(window.dbg, { clearBegin, clearSeq: () => clearSeq });
