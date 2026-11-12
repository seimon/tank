// ---------------------------------------------------------------- 대미지 숫자 (config damageText)
// 맞은 대상 머리 위에서 숫자가 뿅 튀어 오른다 (EaseOutExpo). 오르는 쪽은 화면에서 본 공격 방향의 반대쪽으로 기울고(↗), 각도는 조금씩 제각각.
// 피해 = 빨강 '14' (bigDamage 이상은 bigScale배 크게), 막힘 = 회색 'NO DAMAGE', 회복 = 초록 '+20', 골드 = 금색 '1G'.
// 금화·수리 도구는 날아온 쪽을 공격 방향처럼 본다. 픽셀 UI와 같은 배율(1칸 = 게임 화면 1픽셀 × hk)의 따로 된 캔버스에 HUD 글꼴(5x7)로 (블렌딩·그림자는 config)
const DTC = Object.assign({ enabled: false, blend: 'normal', shadow: 0.3, letterSpacing: 1, bigDamage: 100, bigScale: 2, damageColor: '#ff4a3a', noDamageColor: '#9c9c9c', healColor: '#4ad86a', goldColor: '#ffd040',
  noDamageText: 'NO DAMAGE', height: 3.2, rise: 26, moveTime: 0.6, time: 1.0, push: 0.55, spread: 18 }, CFG.damageText);
let dmgTextOn = !!DTC.enabled, dmgFromP = null;   // (켜고 끄기는 config만: 설정 탭에서 뺐다)   // dmgFromP: 다음 대미지의 공격 위치 (폭발 자리·벙커 총구처럼 쏜 탱크 자리가 아닐 때 부르는 쪽이 넣는다)
const dmgCv = document.createElement('canvas'), dmgG = cv2d(dmgCv);
dmgCv.id = 'pdmg'; Object.assign(dmgCv.style, { position: 'fixed', pointerEvents: 'none', zIndex: 3,   /* HUD(2) 위, 픽셀 UI·창(5) 아래 */ imageRendering: 'pixelated', mixBlendMode: DTC.blend });
document.body.appendChild(dmgCv);
const dmgTexts = [];
const _dtA = new THREE.Vector3(), _dtB = new THREE.Vector3();
// 숫자 하나 띄우기. at = 머리 위 기준점 (월드), from = 공격한 자리 (월드, 없으면 바로 위로)
function dmgText(at, text, color, from = null, scale = 1) {   // scale: 글자 배율
  if (!dmgTextOn || clearSeq) return null;   // (임무 완료 화면에서는 띄우지 않는다)
  at = at.clone();   // (기준점 벡터는 아래 계산에 다시 쓰이니 먼저 복사)
  // 화면에서: 공격 자리 → 맞은 자리 방향으로 밀려난다 (위쪽은 늘 지킨다). 바로 위와 섞는 비율 = push
  let dx = 0, dy = -1;
  if (from) {
    _dtA.copy(at).project(camera); _dtB.copy(from).project(camera);
    let vx = (_dtA.x - _dtB.x) * camera.aspect, vy = -(_dtA.y - _dtB.y);   // 화면 좌표 (아래가 +), 가로세로 비율 맞춤
    const L = Math.hypot(vx, vy);
    if (L > 1e-4) { vx /= L; vy /= L; dx = vx * DTC.push; dy = -(1 - DTC.push) + vy * DTC.push; }
  }
  if (dy > -0.25) dy = -0.25 - Math.abs(dy) * 0.5;   // 아래로는 가지 않게
  const a = (Math.random() * 2 - 1) * DTC.spread * DEG, ca = Math.cos(a), sa = Math.sin(a), L2 = Math.hypot(dx, dy);
  const R = DTC.rise, rise = Array.isArray(R) ? R[0] + Math.random() * ((R[1] ?? R[0]) - R[0]) : R;   // 떠오르는 거리: [최소, 최대]면 숫자마다 무작위
  const f = { at: at.clone(), text, color, scale, rise, dx: (dx * ca - dy * sa) / L2, dy: (dx * sa + dy * ca) / L2, t: 0 };
  dmgTexts.push(f);
  if (dmgTexts.length > 60) dmgTexts.shift();
  return f;
}
// 탱크·벙커 머리 위 자리
const dtHead = (T) => _dtA.set(T.pos.x, T.pos.y + DTC.height, T.pos.z);
// crit: '치명적인 명중' → 'CRITICAL 100'. kill: 이 대미지로 터졌다 → 숫자 아래에 'DESTROYED' (같은 색, 같은 방향으로 함께 떠오른다)
function dmgTextHitAt(p, d, from, crit = false, kill = false) {
  if (!dmgTextOn) return;
  const f = dmgText(p, d > 0 ? (crit ? `CRITICAL ${d}` : `${d}`) : DTC.noDamageText, d > 0 ? DTC.damageColor : DTC.noDamageColor, from, d >= DTC.bigDamage ? DTC.bigScale : 1);   // 큰 피해는 크게
  if (f && kill) { dmgTexts.push({ ...f, text: DTC.destroyedText || 'DESTROYED', scale: 1, oy: 7 * (f.scale || 1) + 2 }); if (dmgTexts.length > 60) dmgTexts.shift(); }
}
function dmgTextHit(T, d, from, crit, kill) { dmgTextHitAt(dtHead(T), d, from, crit, kill); }
// 회복·골드: from = 날아온 자리 (금화·수리 도구가 오던 쪽을 공격 방향처럼 본다)
const _dtF = new THREE.Vector3();
function dtFrom(T, p) {   // 날아온 자리 p를 머리 높이로 옮기고 탱크에서 5m 떨어뜨린다 (탱크 바로 옆에서 먹어도 방향이 뚜렷하게)
  if (!p) return null;
  const dx = p.x - T.pos.x, dz = p.z - T.pos.z, L = Math.hypot(dx, dz);
  return L < 1e-3 ? null : _dtF.set(T.pos.x + dx / L * 5, T.pos.y + DTC.height, T.pos.z + dz / L * 5);
}
function dmgTextHeal(T, n, from = null) { if (dmgTextOn && n > 0) dmgText(dtHead(T), `+${n}`, DTC.healColor, dtFrom(T, from)); }
function dmgTextGold(v, from = null) { if (dmgTextOn) dmgText(dtHead(tank), `${v}G`, DTC.goldColor, dtFrom(tank, from)); }
let dmgShown = false;
// HUD 글꼴로 한 줄: 글자 사이를 letterSpacing칸 더 띄운다 (fontDraw는 간격을 못 바꿔 한 글자씩)
const dtSp = () => Math.round(DTC.letterSpacing || 0);
const dtWidth = (t) => fontWidth(t) + Math.max(0, [...String(t)].length - 1) * dtSp();
function dtDraw(t, x, y, k, plot) { for (const ch of String(t).toUpperCase()) { fontDraw(ch, x, y, k, plot); x += (fontSpan(ch).adv + dtSp()) * k; } }   // k = 배율
function dmgTextUpdate(dt) {
  for (let i = dmgTexts.length - 1; i >= 0; i--) if ((dmgTexts[i].t += dt) >= DTC.time) dmgTexts.splice(i, 1);   // 시간이 다 되면 바로 사라진다
  if (!dmgTexts.length) { if (dmgShown) { dmgG.clearRect(0, 0, dmgCv.width, dmgCv.height); dmgShown = false; crtDirtyLo = true; } return; }
  // 크기·자리: 픽셀 UI와 같은 배율
  const H = rt.height, dpr = layerScale || devicePixelRatio || 1, DW = Math.max(1, Math.round(VR.w * dpr)), DH = Math.max(1, Math.round(VR.h * dpr));
  const k = Math.max(1, Math.floor(H / 360)), w = Math.floor(rt.width / k), h = Math.floor(H / k), u = k * DH / H;
  if (dmgCv.width !== DW || dmgCv.height !== DH) { dmgCv.width = DW; dmgCv.height = DH; }
  Object.assign(dmgCv.style, { left: `${VR.x}px`, top: `${VR.y}px`, width: `${VR.w}px`, height: `${VR.h}px` });
  dmgG.clearRect(0, 0, DW, DH); dmgShown = true; crtDirtyLo = true;
  for (const f of dmgTexts) {
    _dtA.copy(f.at).project(camera);
    if (_dtA.z > 1 || _dtA.z < -1) continue;
    const e = easeOutExpo(Math.min(1, f.t / Math.max(0.01, DTC.moveTime))) * f.rise;
    const k2 = f.scale || 1, x = Math.round((_dtA.x + 1) / 2 * w + f.dx * e - dtWidth(f.text) * k2 / 2), y = Math.round((1 - _dtA.y) / 2 * h + f.dy * e - 4 * k2 + (f.oy || 0));   // oy: 숫자 아래 줄 (DESTROYED)
    const plot = (a, b, kk) => dmgG.fillRect(a * u, b * u, Math.ceil(kk * u), Math.ceil(kk * u));
    if (DTC.shadow > 0) { dmgG.fillStyle = `rgba(0,0,0,${DTC.shadow})`; dtDraw(f.text, x + 1, y + 1, k2, plot); }   // 그림자: 오른쪽 아래 1칸
    dmgG.fillStyle = f.color;
    dtDraw(f.text, x, y, k2, plot);
  }
}
Object.assign(window.dbg, { dmgText, dmgTexts, setDmgText: (v) => { dmgTextOn = v; } });
