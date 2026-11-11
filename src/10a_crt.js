// ---------------------------------------------------------------- CRT 표현 (설정 'CRT 표현', config crt): snapCRT의 '아케이드' 셋팅을 그대로 옮긴 것
// 게임 화면 전체(3D + HUD·UI·대미지 숫자·타이틀)를 한 장으로 만든 뒤 snapCRT와 같은 두 단계로 그린다. 게임 상태와는 따로 매 프레임 돈다
// (일시정지 중에도. 창이 포커스를 잃어 루프가 멈출 때만 멈춘다).
//   0) 합치기: 3D(postRT) → 아래 묶음(HUD·대미지 숫자·타이틀 그림: 보통 crtA + 더하기 crtB) → 위 묶음(UI 창·선택지·로딩: 보통 crtC + 더하기 crtD) → compRT (게임 해상도).
//      창은 늘 HUD·대미지 숫자·타이틀 그림보다 위 (일반 화면의 z-index 순서와 같게)
//      HUD·UI 캔버스는 CRT를 켜면 게임 픽셀 크기로 그리고(00_core.js layerScale) 화면에서는 숨긴다(body.crt). 바뀐 때만 다시 합친다
//   1) prep: compRT를 샤프 바이리니어로 늘려 읽어 → 화면 폭 × 가상 스캔라인 수(L). 줄 띠 평균, 가로 흐림, RGB 어긋남, 색 번짐, 채도, 잔상(이전 prep), 테이프 노이즈
//   2) crt: prep → 화면. 화면 휨, 스캔라인 빔, 섀도 마스크, 빛 번짐, 테두리 밖 빛 번짐, 롤링 바, 깜빡임, 비네트, 노이즈, 둥근 모서리
// 스캔라인 수는 게임 해상도와 상관없이 화면 높이 ÷ lineSize(CSS px). 화면 비율 제한·Pixel Perfect의 게임 화면(캔버스) 안에서만 걸린다.
// (snapCRT에서 뺀 것은 유리에 비친 방 반사뿐: 아케이드 셋팅에서 쓰지 않는다)
// 로딩 화면에도 걸려고 renderer(10_world.js)를 만든 바로 뒤에 둔다. 그 전에는 화면이 검다 (body.crt가 일반 로딩 그림을 숨긴다).
// 그래서 뒤 파일의 이름(postRT·upScene·HUD·UI 캔버스·resize 등)은 함수 안에서 부를 때만 쓴다
const CRT = Object.assign({ enabled: false, lineSize: 4, scan: 0.85, maskType: 3, maskStr: 0.55, maskSize: 1, curv: 0.04, corner: 0.07, bloom: 0.55, vig: 0.4,
  soft: 0.8, conv: 0.5, bleed: 0, persist: 0.5, sat: 1.15, noise: 0.08, flicker: 0.2, roll: 0.4, tape: 0.2, bright: 1.25, margin: 8, maxScale: 1.5 }, CFG.crt);
// CRT 계산 해상도: 화면 배율(devicePixelRatio)이 maxScale보다 크면 그만큼만 (아이패드 2배 화면에서 CRT 두 단계를 기기 해상도 그대로 계산하던 게 무거웠다). 브라우저가 부드럽게 늘린다
// 성능 표시용 단계 표시. 로딩 중(81_ui.js의 perfT가 아직 없을 때)에도 CRT가 돌아서 오류를 삼킨다
const crtMark = (n) => { try { perfMark(n); } catch (_) {} };
const crtDpr = () => Math.min(devicePixelRatio || 1, CRT.maxScale || 99);
const crtA = document.createElement('canvas'), crtAg = crtA.getContext('2d');   // 보통(source-over)으로 얹는 레이어
const crtB = document.createElement('canvas'), crtBg = crtB.getContext('2d');   // 스크린·더하기로 얹는 레이어
const crtC = document.createElement('canvas'), crtCg = crtC.getContext('2d');   // 위 묶음 (UI): 보통
const crtD = document.createElement('canvas'), crtDg = crtD.getContext('2d');   // 위 묶음 (UI): 스크린·더하기
const CRT_CV = [crtA, crtB, crtC, crtD], CRT_G = [crtAg, crtBg, crtCg, crtDg];
const crtTex = (c) => { const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.premultiplyAlpha = true; return t; };
const crtTexA = crtTex(crtA), crtTexB = crtTex(crtB), crtTexC = crtTex(crtC), crtTexD = crtTex(crtD), CRT_TX = [crtTexA, crtTexB, crtTexC, crtTexD];
const compRT = new THREE.WebGLRenderTarget(2, 2, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false });
const crtPrep = [0, 1].map(() => new THREE.WebGLRenderTarget(2, 2, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: false }));
let crtCur = 0;
const CRT_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const crtBlack = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); crtBlack.needsUpdate = true;   // 로딩 중 (3D 화면이 아직 없다)
const crtCompMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, tA: { value: crtTexA }, tB: { value: crtTexB }, tC: { value: crtTexC }, tD: { value: crtTexD }, uScreen: { value: 1 }, uScreen2: { value: 1 } },
  vertexShader: CRT_VERT,
  fragmentShader: `
    uniform sampler2D tSrc, tA, tB, tC, tD; uniform float uScreen, uScreen2; varying vec2 vUv;
    vec3 lay(vec3 c, vec4 a, vec3 b, float scr) { c = c * (1.0 - a.a) + a.rgb; return scr > 0.5 ? 1.0 - (1.0 - c) * (1.0 - b) : c + b; }   // 레이어는 미리 곱한 알파
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb;
      c = lay(c, texture2D(tA, vUv), texture2D(tB, vUv).rgb, uScreen);    // 아래: HUD·대미지 숫자
      c = lay(c, texture2D(tC, vUv), texture2D(tD, vUv).rgb, uScreen2);   // 위: UI 창·선택지·타이틀
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// ---- snapCRT shaders.js PREP_FRAG (소스 읽기만 게임 화면용 샤프 바이리니어로)
const crtPrepMat = new THREE.ShaderMaterial({
  uniforms: { uSrc: { value: compRT.texture }, uPrev: { value: null }, uSrcRes: { value: new THREE.Vector2(2, 2) }, uK: { value: 1 }, uOutRes: { value: new THREE.Vector2(2, 2) },
    uLines: { value: 270 }, uSoft: { value: 0 }, uConv: { value: 0 }, uBleed: { value: 0 }, uSat: { value: 1 }, uPersist: { value: 0 }, uTime: { value: 0 }, uTape: { value: 0 } },
  vertexShader: CRT_VERT,
  fragmentShader: `
    uniform sampler2D uSrc, uPrev; uniform vec2 uSrcRes, uOutRes; uniform float uK, uLines, uSoft, uConv, uBleed, uSat, uPersist, uTime, uTape; varying vec2 vUv;
    float gBand, gY;
    float thash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(float t, float seed) { float i = floor(t), f = fract(t); return mix(thash(vec2(i, seed)), thash(vec2(i + 1.0, seed)), f * f * (3.0 - 2.0 * f)) - 0.5; }
    // 게임 화면이 실제 화면에 보이는 그대로 (샤프 바이리니어: 정수 배까지 또렷하게, 남는 배율만 부드럽게)
    vec3 tap(vec2 uv) {
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
      vec2 t = uv * uSrcRes, c = fract(t) - 0.5, r = vec2(0.5 - 0.5 / uK);
      return texture(uSrc, (floor(t) + (c - clamp(c, -r, r)) * uK + 0.5) / uSrcRes).rgb;
    }
    vec3 band(float x) { return (tap(vec2(x, gY - gBand)) + tap(vec2(x, gY)) + tap(vec2(x, gY + gBand))) / 3.0; }
    vec3 hblur(float x, float dx) {
      return band(x) * 0.4026 + (band(x - dx) + band(x + dx)) * 0.2442 + (band(x - 2.0 * dx) + band(x + 2.0 * dx)) * 0.0545;
    }
    const mat3 RGB2YIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 YIQ2RGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    void main() {
      gBand = 1.0 / (3.0 * uLines);
      float px = 1.0 / uOutRes.x, dx = max(uSoft, 0.001) * px * 0.6;
      // 낡은 테이프: 줄마다 옆으로 조금씩 흔들리고, 가끔 3프레임 동안 그림이 휘고 위아래로 튀며 색이 빠진다
      gY = vUv.y;
      float x = vUv.x, row = floor(vUv.y * uLines), tick = mod(floor(uTime * 30.0), 1000.0), chew = 0.0;
      if (uTape > 0.0) {
        float tm = mod(uTime, 1000.0);
        x += (thash(vec2(row, tick)) - 0.5) * uTape * 6.0 * px;
        float cslot = floor(tm * 0.4), cOn = step(1.0 - 0.6 * uTape, thash(vec2(cslot, 21.0)));
        chew = cOn * step(fract(tm * 0.4), 0.04);
        if (chew > 0.0) {
          float seed = tick * 3.0;
          x += (vnoise(vUv.y * 4.0, seed) * 0.06 + vnoise(vUv.y * 13.0, seed + 1.0) * 0.03 + vnoise(vUv.y * 41.0, seed + 2.0) * 0.012) * chew;
          gY += (thash(vec2(tick, 11.0)) - 0.5) * 0.05 * chew;
        }
      }
      vec3 c;
      if (uConv > 0.01) { float o = uConv * px; c = vec3(hblur(x - o, dx).r, hblur(x, dx).g, hblur(x + o, dx).b); }
      else c = hblur(x, dx);
      if (uBleed > 0.01) {
        vec3 wide = hblur(x + uBleed * 3.0 * px, dx + uBleed * 4.0 * px), yiq = RGB2YIQ * c, wyiq = RGB2YIQ * wide;
        yiq.yz = mix(yiq.yz, wyiq.yz, uBleed);
        c = clamp(YIQ2RGB * yiq, 0.0, 1.0);
      }
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = clamp(mix(vec3(lum), c, uSat), 0.0, 1.0);
      if (uPersist > 0.0) c = max(c, texture(uPrev, vUv).rgb * uPersist);   // 잔상
      if (chew > 0.0) { float cl = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(c, vec3(cl) * 0.8, chew * 0.7); }
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// ---- snapCRT shaders.js CRT_FRAG (방 반사만 뺌)
const crtMat = new THREE.ShaderMaterial({
  uniforms: { uPrep: { value: null }, uRes: { value: new THREE.Vector2(2, 2) }, uLines: { value: 270 }, uTime: { value: 0 }, uScan: { value: 0 }, uCurv: { value: 0 },
    uMaskType: { value: 0 }, uMaskStr: { value: 0 }, uMaskSize: { value: 1 }, uBloom: { value: 0 }, uBright: { value: 1 }, uVig: { value: 0 }, uNoise: { value: 0 },
    uFlicker: { value: 0 }, uCorner: { value: 0 }, uRoll: { value: 0 }, uMargin: { value: 0 } },
  vertexShader: CRT_VERT,
  fragmentShader: `
    uniform sampler2D uPrep; uniform vec2 uRes; uniform float uLines, uTime, uScan, uCurv, uMaskStr, uMaskSize, uBloom, uBright, uVig, uNoise, uFlicker, uCorner, uRoll, uMargin;
    uniform int uMaskType; varying vec2 vUv;
    vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec3 mask(vec2 fc) {
      vec2 p = floor(fc / uMaskSize);
      float dark = 1.0 - uMaskStr; vec3 m = vec3(dark);
      if (uMaskType == 1) { float i = mod(p.x, 3.0); if (i < 0.5) m.r = 1.0; else if (i < 1.5) m.g = 1.0; else m.b = 1.0; }
      else if (uMaskType == 2) {
        float i = mod(p.x, 3.0); if (i < 0.5) m.r = 1.0; else if (i < 1.5) m.g = 1.0; else m.b = 1.0;
        float triad = floor(p.x / 3.0); if (mod(p.y + mod(triad, 2.0) * 2.0, 4.0) < 1.0) m *= dark;
      } else if (uMaskType == 3) {
        vec2 q = floor(p * vec2(1.0, 0.5)); q.x += q.y * 3.0;
        float f = fract(q.x / 6.0); if (f < 0.333) m.r = 1.0; else if (f < 0.666) m.g = 1.0; else m.b = 1.0;
      } else return vec3(1.0);
      return m;
    }
    void main() {
      vec2 c = vUv * 2.0 - 1.0;
      vec2 padv = 2.0 * uMargin / uRes; float pad = padv.y;   // 그림 둘레의 어두운 테두리 (uMargin px)
      c *= 1.0 + padv;
      c *= (1.0 + uCurv * dot(c, c)) / (1.0 + uCurv);
      vec2 uv = c * 0.5 + 0.5;
      float rc = uCorner * 1.5; vec2 q = abs(c) - (1.0 - rc), m2 = max(q, 0.0) * max(q, 0.0);
      float sdf = sqrt(sqrt(m2.x * m2.x + m2.y * m2.y)) + min(max(q.x, q.y), 0.0) - rc;
      float soft = 2.0 / uRes.y + 0.016 * uBloom, edge = 1.0 - smoothstep(-soft, 0.0, sdf);
      vec3 spill = vec3(0.0);   // 테두리 밖으로 번지는 빛
      if (uBloom > 0.0 && sdf > -soft) {
        float d = max(sdf, 0.0), fade = exp(-d / (pad * 0.3)) * (1.0 - smoothstep(pad * 0.6, pad, d));
        if (fade > 0.001) {
          vec2 suv = clamp(uv, 0.0, 1.0);
          vec3 g = lin(textureLod(uPrep, suv, 3.5).rgb) * 0.6 + lin(textureLod(uPrep, suv, 5.0).rgb) * 0.4;
          spill = pow(clamp(g * uBloom * 0.12 * uBright * fade, 0.0, 1.0), vec3(1.0 / 2.2));
        }
      }
      if (edge <= 0.0) { gl_FragColor = vec4(spill, 1.0); return; }
      float y = uv.y * uLines - 0.5, r0 = floor(y), f = y - r0;
      float wDark = mix(0.5, 0.17, uScan), wBright = mix(0.5, 0.36, uScan);
      vec3 col = vec3(0.0);
      for (int i = -1; i <= 2; i++) {
        float row = r0 + float(i);
        vec3 s = lin(texture(uPrep, vec2(uv.x, (row + 0.5) / uLines)).rgb), w = mix(vec3(wDark), vec3(wBright), sqrt(s));
        float d = f - float(i);
        col += s * exp(-0.5 * d * d / (w * w)) / (w * 2.5066);
      }
      if (uBloom > 0.0) col += (lin(textureLod(uPrep, uv, 2.5).rgb) * 0.5 + lin(textureLod(uPrep, uv, 4.5).rgb) * 0.5) * uBloom * 0.6;
      if (uMaskType > 0) { float dark = 1.0 - uMaskStr; col *= mask(gl_FragCoord.xy) * mix(1.0, 3.0 / (1.0 + 2.0 * dark), 0.85); }
      if (uRoll > 0.0) { float d = uv.y - fract(mod(uTime, 1000.0) * 0.22); d -= floor(d + 0.5); col *= 1.0 - uRoll * 0.55 * exp(-d * d / (2.0 * 0.08 * 0.08)); }
      if (uFlicker > 0.0) {
        float ft = mod(uTime, 1000.0) * 16.8, fi = floor(ft), ff = fract(ft);
        col *= 1.0 - uFlicker * 0.4 * mix(hash(vec2(fi, 7.0)), hash(vec2(fi + 1.0, 7.0)), ff * ff * (3.0 - 2.0 * ff));
      }
      float v = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
      col *= mix(1.0, pow(clamp(v, 0.0, 1.0), 0.35), uVig);
      col *= uBright;
      vec3 outc = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
      if (uNoise > 0.0) outc += (hash(gl_FragCoord.xy + fract(uTime * 13.7) * 811.0) - 0.5) * uNoise;
      gl_FragColor = vec4(mix(spill, outc, edge), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const crtQuad = (m) => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
const crtCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const crtCompScene = crtQuad(crtCompMat), crtPrepScene = crtQuad(crtPrepMat), crtScene = crtQuad(crtMat);
const CRT_TITLE = ['tCall', 'tLogo', 'tBrand', 'tBadge', 'tVer', 'tPress', 'tCamo'].map((id) => document.getElementById(id)).filter(Boolean);
for (const c of CRT_TITLE) CRT_LAYER.add(c);
const crtLoadCv = document.getElementById('loadCv');
if (crtLoadCv) CRT_LAYER.add(crtLoadCv);   // 로딩 화면이 사라지는 동안 (fadeLoading)
const _crtRes = new THREE.Vector2();
let crtKey = '', crtReady = false;
let crtLeave = null;   // 화면 나가기 검정 디더링 덮개 (게임 픽셀 크기 캔버스, 52_clear.js). 맨 위에 얹는다
const crtVis = (el) => !!el && el.style.visibility !== 'hidden' && el.style.display !== 'none' && el.width !== 0;   // (#title은 div라 width가 없다)
// 레이어 캔버스 크기: 바뀌면 텍스처도 새로 만든다 (three.js는 처음 올린 크기로 GPU 자리를 잡아 두고 그 뒤로는 덮어쓰기만 해서,
// 크기가 바뀐 그림은 올라가지 않는다. 로딩 그림 → 게임 화면처럼 크기가 바뀌면 옛 그림이 남는다)
function crtSize(W, H) {
  if (crtA.width === W && crtA.height === H) return;
  for (const c of CRT_CV) { c.width = W; c.height = H; }
  for (const t of CRT_TX) t.dispose();
}
// 화면 캔버스들을 게임 해상도 두 장으로 합친다 (화면에 쌓인 순서대로: HUD → 대미지 숫자 → UI → 타이틀)
function crtLayers(W, H) {
  const pdmg = document.getElementById('pdmg'), showT = crtVis(document.getElementById('title'));
  let key = `${W},${H},${pui.style.mixBlendMode},${showT}`;
  for (const el of [phudS, phud, puiS, pui, pdmg, ...CRT_TITLE]) key += crtVis(el) ? 1 : 0;
  const ld = document.getElementById('loading'); key += ld ? 'L' : '';
  if (crtLeave) key += 'X';
  if (!crtDirty && key === crtKey) return;
  crtDirty = false; crtKey = key;
  crtSize(W, H);
  for (const g of CRT_G) { g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false; }
  crtBg.globalCompositeOperation = crtDg.globalCompositeOperation = 'lighter';
  const put = (el, normal, up) => { if (crtVis(el)) (up ? (normal ? crtCg : crtDg) : (normal ? crtAg : crtBg)).drawImage(el, 0, 0, W, H); };
  put(phudS, true); put(phud, HC.blend === 'normal');   // 아래 묶음
  put(pdmg, DTC.blend === 'normal');
  put(puiS, true, true); put(pui, (pui.style.mixBlendMode || 'normal') === 'normal', true);   // 위 묶음
  if (showT) for (const c of CRT_TITLE) if (crtVis(c)) {   // 타이틀 그림 (아래 묶음: 메뉴 창보다 아래): 화면 속 자리를 게임 픽셀로
    const r = c.getBoundingClientRect();
    crtAg.drawImage(c, Math.round((r.left - VR.x) * layerScale), Math.round((r.top - VR.y) * layerScale));
  }
  if (ld && crtLoadCv && crtLoadCv._src) {   // 로딩 화면 (맨 위). 사라지는 중이면 디더링으로 비운 사본
    const img = ld.style.background === 'transparent' ? crtLoadCv._src._dw : crtLoadCv._src;
    if (img) crtCg.drawImage(img, 0, 0, W, H);
  }
  if (crtLeave) {   // 화면 나가기 덮개 (맨 위). 더하기 레이어(UI 글자)는 보통 레이어 위에 더해지니, 덮인 칸은 거기서 지운다
    crtCg.drawImage(crtLeave, 0, 0, W, H);
    crtDg.globalCompositeOperation = 'destination-out'; crtDg.drawImage(crtLeave, 0, 0, W, H); crtDg.globalCompositeOperation = 'lighter';
  }
  for (const t of CRT_TX) t.needsUpdate = true;
}
// 로딩 중 (게임 루프가 돌기 전): 로딩 그림 한 장을 CRT로 (drawLoading이 부른다)
crtLoadHook = (src) => { try { crtLoad(src); } catch (e) { crtFail(e); } };
function crtLoad(src) {
  if (!crtOn || !src.width || !src.height) return;
  if (!layerScale) {   // 화면 크기를 정하는 resize(40_input_post.js)가 아직이면 직접
    const r = renderer.domElement.getBoundingClientRect(), dpr = crtDpr();
    renderer.setSize(Math.max(2, Math.round(r.width * dpr)), Math.max(2, Math.round(r.height * dpr)), false);
  }
  const W = src.width, H = src.height;
  crtSize(W, H);
  for (const g of CRT_G) g.clearRect(0, 0, W, H);
  crtCg.drawImage(src, 0, 0);
  for (const t of CRT_TX) t.needsUpdate = true; crtDirty = true;
  if (compRT.width !== W || compRT.height !== H) compRT.setSize(W, H);
  crtCompMat.uniforms.tSrc.value = crtBlack;
  renderer.setRenderTarget(compRT); renderer.render(crtCompScene, crtCam); renderer.setRenderTarget(null);
  crtReady = true;
  crtPresent();
}
// 게임이 화면을 새로 그렸을 때: 게임 해상도(postRT) → 화면 (CRT면 합쳐 두고 CRT로)
function finalPass() {
  if (crtOn && layerScale) try { crtFinal(); return; } catch (e) { crtFail(e); }
  renderer.setRenderTarget(null); renderer.render(upScene, postCam);
}
// CRT에서 오류가 나면 CRT를 끄고 원래 화면으로 돌아간다 (게임·로딩이 멈추지 않게). 원인은 콘솔에
function crtFail(e) {
  console.error('[CRT] 오류로 CRT 표현을 끕니다:', e);
  crtOn = false; crtReady = false; layerScale = 0; document.body.classList.remove('crt');
  try { resize(); } catch (_) {}   // (로딩 중이면 resize가 아직 없다)
}
function crtFinal() {
  const W = postRT.width, H = postRT.height;
  crtLayers(W, H);
  crtMark('CRT 레이어');   // HUD·UI 캔버스를 텍스처로 올리기 (성능 표시)
  if (compRT.width !== W || compRT.height !== H) compRT.setSize(W, H);
  crtCompMat.uniforms.uScreen.value = HC.blend === 'screen' ? 1 : 0; crtCompMat.uniforms.uScreen2.value = (pui.style.mixBlendMode || HC.blend) === 'screen' ? 1 : 0; crtCompMat.uniforms.tSrc.value = postRT.texture;
  renderer.setRenderTarget(compRT); renderer.render(crtCompScene, crtCam); renderer.setRenderTarget(null);
  crtMark('CRT 합치기');
  crtReady = true;
  crtPresent();
}
// CRT 한 프레임 (마지막에 합친 게임 화면으로). 게임이 멈춰 화면을 다시 그리지 않아도 매 프레임 부른다
function crtPresent() {
  if (!crtOn || !crtReady) return;
  try { crtPresent0(); } catch (e) { crtFail(e); }
}
function crtPresent0() {
  const dpr = crtDpr();
  renderer.getDrawingBufferSize(_crtRes);
  const W = _crtRes.x, H = _crtRes.y, lines = Math.max(16, Math.round(H / (CRT.lineSize * dpr))), t = (performance.now() / 1000) % 1000;
  const prev = crtPrep[crtCur], next = crtPrep[crtCur ^ 1];
  if (next.width !== W || next.height !== lines) for (const p of crtPrep) p.setSize(W, lines);
  const P = crtPrepMat.uniforms;
  P.uPrev.value = prev.texture; P.uSrcRes.value.set(compRT.width, compRT.height); P.uK.value = Math.max(1, Math.floor(H / compRT.height + 1e-6));
  P.uOutRes.value.set(W, H); P.uLines.value = lines; P.uSoft.value = CRT.soft * dpr; P.uConv.value = CRT.conv * dpr; P.uBleed.value = CRT.bleed;
  P.uSat.value = CRT.sat; P.uPersist.value = CRT.persist; P.uTime.value = t; P.uTape.value = CRT.tape;
  renderer.setRenderTarget(next); renderer.render(crtPrepScene, crtCam); renderer.setRenderTarget(null);
  crtMark('CRT 1단계');
  crtCur ^= 1;
  const C = crtMat.uniforms;
  C.uPrep.value = next.texture; C.uRes.value.set(W, H); C.uLines.value = lines; C.uTime.value = t;
  C.uScan.value = CRT.scan; C.uCurv.value = CRT.curv; C.uMaskType.value = CRT.maskType | 0; C.uMaskStr.value = CRT.maskStr; C.uMaskSize.value = CRT.maskSize;
  C.uBloom.value = CRT.bloom; C.uBright.value = CRT.bright; C.uVig.value = CRT.vig; C.uNoise.value = CRT.noise; C.uFlicker.value = CRT.flicker;
  C.uCorner.value = CRT.corner; C.uRoll.value = CRT.roll; C.uMargin.value = CRT.margin * dpr;
  renderer.render(crtScene, crtCam);
  crtMark('CRT 2단계');
}
// 화면 좌표(CSS) → CRT 화면 휨·테두리를 되짚은 좌표 (클릭이 보이는 자리에 맞게)
function crtPoint(x, y) {
  if (!crtOn) return { x, y };
  let cx = (x - VR.x) / VR.w * 2 - 1, cy = (y - VR.y) / VR.h * 2 - 1;
  cx *= 1 + 2 * CRT.margin / VR.w; cy *= 1 + 2 * CRT.margin / VR.h;
  const k = (1 + CRT.curv * (cx * cx + cy * cy)) / (1 + CRT.curv);
  return { x: VR.x + (cx * k + 1) / 2 * VR.w, y: VR.y + (cy * k + 1) / 2 * VR.h };
}
function setCrt(v) {
  crtOn = !!v; saveOpt('crt', crtOn); crtDirty = true; crtReady = false;
  document.body.classList.toggle('crt', crtOn);
  resize();   // 레이어 크기가 바뀐다 (HUD·UI·타이틀이 알아서 다시 그린다)
}
