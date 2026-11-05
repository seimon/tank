// ---------------------------------------------------------------- 마른 풀
let grassCount = 0;
const grassCard = [], grassCardMats = [], grassCardNames = [];   // 풀 메시: 1비트 알파 텍스처 카드 (종류마다 재질만 바꿔 낀다)
const grassHt = new Float32Array(FN * FN);   // 0.5m 칸마다 가장 큰 풀 높이 배율 (빗방울이 풀 위에서 튀게)
{
  // (예전 폴리곤 풀잎 모양을 만들 때 쓰던 배치 난수 9개: 뒤따르는 마을·상자 배치가 그대로 나오도록 같은 개수만큼 흘려보낸다)
  for (let k = 0; k < 9; k++) rand();
  // 풀 셰이더 (텍스처 카드 재질들이 이 onBeforeCompile을 같이 쓴다): 땅 기울기 조명, 불탄·눌린 풀, 폭풍, 바람, 그늘, 빛
  const mat = { onBeforeCompile: null };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime; uniform vec2 uSnap; uniform vec2 uWindDir; uniform float uWind; uniform vec4 uBlast[4];\n' +
      'uniform sampler2D uField, uGap; uniform float uAO, uWhite; varying float vFire; varying vec3 vLampC; attribute vec3 aGround, aRoot;\n' +
      sh.vertexShader
      // 조명은 풀잎 방향 대신 서 있는 땅의 기울기로: 달을 향한 비탈은 밝고 반대편은 어둡게
      .replace('#include <normal_vertex>', '#include <normal_vertex>\nvNormal = normalize((viewMatrix * vec4(aGround, 0.0)).xyz);')
      .replace('#include <project_vertex>', `
        vec4 b4 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 base = b4.xz;
        vec4 fld = texture2D(uField, ${UVW("base")});
        float grow = max(fld.a, 0.06), tr = fld.r;
        vec3 rel = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz - b4.xyz;
        // 불탄 풀은 짧게, 눌린 풀은 임의 방향으로 눕힌다
        rel.y *= grow * (1.0 - tr * 0.8);
        float hsh = fract(sin(dot(base, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        rel.xz += vec2(cos(hsh), sin(hsh)) * position.y * tr * 0.75 * grow;
        // 포구 화염·폭발 폭풍: 중심에서 바깥으로 퍼지는 충격파가 지나가면 확 넘어졌다가 천천히 일어선다
        for (int i = 0; i < 4; i++) {
          vec4 B = uBlast[i];
          vec2 bd = base - B.xy;
          float bl = length(bd), t = uTime - B.z - bl / 45.0;
          if (t < 0.0 || t > 1.5 || bl > B.w) continue;
          float env = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.12, 1.5, t)) * (1.0 - smoothstep(B.w * 0.4, B.w, bl));
          rel.xz += bd / max(bl, 0.05) * env * position.y * 0.9 * grow;
          rel.y *= 1.0 - env * 0.55;
        }
        float hw = position.y * position.y;
        // 들판을 가로질러 굴러가는 돌풍 + 개별 잎의 떨림
        float wave = sin(dot(base, uWindDir) * 0.16 - uTime * 1.5) * 0.5 + 0.5;
        wave *= 0.6 + 0.4 * sin(dot(base, vec2(-uWindDir.y, uWindDir.x)) * 0.07 + uTime * 0.3);
        float flutter = sin(uTime * 4.3 + base.x * 1.7 + base.y * 1.3) * 0.1;
        float bend = ((0.12 + wave * 0.6) + flutter) * uWind * (1.0 - tr) * grow;
        rel.xz += uWindDir * bend * hw;
        rel.y -= bend * bend * hw * 0.3;
        vec4 wp = vec4(b4.xyz + rel, 1.0);
        vColor.rgb = mix(aRoot, vColor.rgb, position.y);   // 뿌리는 그 자리 땅 색 그대로: 풀과 땅 경계가 지저분하게 튀지 않게
        vColor.rgb *= 1.0 + wave * uWind * 0.11 * position.y;
        // 멀리 있는 풀은 평균색으로 모아서, 저해상도에서 잎마다 색이 튀며 반짝이는 것을 줄인다
        vColor.rgb = mix(vColor.rgb, vec3(0.3, 0.255, 0.165), smoothstep(10.0, 50.0, distance(cameraPosition, wp.xyz)) * 0.45 * position.y);
        vColor.rgb *= 1.0 - tr * 0.45;   // 밟힌 풀은 진하게
        float shade = 1.0 - 0.72 * contactShadow(base) * (1.0 - 0.4 * position.y);   // 바닥 그림자 속 풀은 아래쪽부터 어둡게
        shade *= mix(1.0, pow(texture2D(uGap, ${UVW("base")}).r, uAO), 1.0 - 0.5 * position.y);   // 건물 사이 틈의 그늘
        vColor.rgb *= shade;
        vColor.rgb = mix(vColor.rgb, vec3(0.045, 0.04, 0.035), fld.b);
        vColor.rgb = mix(vColor.rgb, vec3(0.9) * shade, uWhite);   // 흰색 보기: 그늘만 남긴다
        vFire = fld.g * (0.35 + 0.65 * position.y) * (0.75 + 0.25 * sin(uTime * 23.0 + base.x * 5.0 + base.y * 3.0));
        vLampC = lampGlow(base) * (0.45 + 0.9 * position.y) + ringGlow(wp.xz) * 0.65;   // 풀은 끝이 더 밝게 받는다. 하늘에서 비추는 원형 빛도
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        ${SNAP.replaceAll('uSnap', '(uSnap * 2.0)')}
      `);
    sh.vertexShader = SHADOW_GLSL + RING_GLSL + sh.vertexShader;
    // 양면 풀의 뒷면이 어둡게 뒤집히지 않도록 법선을 항상 위로 (흔들릴 때마다 밝기가 튀던 주원인)
    sh.fragmentShader = 'varying float vFire; varying vec3 vLampC;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.7, 0.6, 0.15) * vFire + diffuseColor.rgb * vLampC * 2.6;');
  };
  // 25m 구역별 InstancedMesh: 화면 밖 구역은 통째로 건너뛴다
  const CH = 6, CW = HALF * 2 / CH, chunks = Array.from({ length: CH * CH }, () => []);
  const PALETTE = [0xbda366, 0xa8925a, 0x968854, 0xb3995e, 0x8a844e, 0xc2ad76].map(h => new THREE.Color(h));
  // 색은 자리마다: 큰 얼룩(올리브빛/누런 들판) + 중간 얼룩(붉게 마른 곳) + 작은 덤불(바랜 색), 잎마다 조금씩 흔들기. 생성할 때 한 번만 계산
  const vn2 = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    return lerp(lerp(h(xi, zi), h(xi + 1, zi), sx), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), sx), sz);
  };
  const cStraw = new THREE.Color(0xc2a868), cOlive = new THREE.Color(0x8c8c50), cRust = new THREE.Color(0xa47a4a), cPale = new THREE.Color(0xd0c08e);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  // 풀 자리는 따로 만든 난수로: 기본 난수(곱셈 합동식)는 연달아 뽑은 두 값(x, z)이 비스듬한 줄 위에 늘어서는 성질이 있어
  // 어떤 방향에서 보면 줄지어 심은 무늬가 드러난다. mulberry32는 그런 줄이 없고 비용도 같다
  let gseed = 0x9e3779b9;
  const grand = () => { gseed = (gseed + 0x6d2b79f5) | 0; let t = Math.imul(gseed ^ (gseed >>> 15), 1 | gseed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const grr = (a, b) => a + (b - a) * grand();
  for (let tries = 0; grassCount < GRASS_TARGET && tries < GRASS_TARGET * 3; tries++) {
    const x = grr(-HALF + 0.2, HALF - 0.2), z = grr(-HALF + 0.2, HALF - 0.2);
    const gi = gridIndex(x, z), d = roadD[gi];
    if (d < ROAD_HW + 0.1 || creekD[gi] < CREEK_HW + 0.9 || cliffG[gi] > 0.2) continue;   // 절벽엔 풀이 없다
    if (cliffNear[gi] && creekD[gi] < CREEK_HW + 7) continue;   // 강가 절벽 발치의 좁은 땅도
    if (WRECKS.some(w => Math.hypot(w.x - x, w.z - z) < 3.6)) continue;   // 부서진 탱크 주변은 맨땅
    const n1 = vn2(x * 0.05, z * 0.05), n2 = vn2(x * 0.13 + 17, z * 0.13 + 5), n3 = vn2(x * 0.31 + 3, z * 0.31 + 11);
    let hScale = grr(1.05, 1.8) * (0.8 + 0.4 * n2);
    if (d < ROAD_HW + 1.4) { if (grand() > 0.45) continue; hScale *= 0.6; }
    const tw = townAt(x, z);   // 마을 쪽으로 갈수록 점점 성기고 짧게
    if (tw > 0) { if (grand() > lerp(1, 0.3, tw)) continue; hScale *= lerp(1, 0.55, tw); }
    if (inFootprint(x, z, 0.2)) continue;
    v.set(x, heightAt(x, z) - 0.05, z);
    q.setFromAxisAngle(yAxis, grand() * Math.PI * 2);
    const sw = grr(0.8, 1.3);
    s.set(sw, hScale, sw);
    { const gc = cellOf(x, z); if (gc >= 0 && hScale > grassHt[gc]) grassHt[gc] = hScale; }
    const ci = Math.min(CH - 1, Math.floor((x + HALF) / CW)) + Math.min(CH - 1, Math.floor((z + HALF) / CW)) * CH;
    // 땅 법선 (1m 폭으로 부드럽게, 기울기를 1.4배 과장해 굴곡이 잘 보이게)
    const gn = new THREE.Vector3((heightAt(x - 1, z) - heightAt(x + 1, z)) * 1.4, 2, (heightAt(x, z - 1) - heightAt(x, z + 1)) * 1.4).normalize();
    c.copy(cStraw).lerp(cOlive, smooth(0.35, 0.75, n1)).lerp(cRust, smooth(0.55, 0.85, n2) * 0.6).lerp(cPale, smooth(0.6, 0.9, n3) * 0.45);
    c.lerp(PALETTE[Math.floor(grand() * PALETTE.length)], 0.25).multiplyScalar(grr(0.9, 1.06));
    const root = new THREE.Vector3().fromArray(terrainCol, gi * 3);
    chunks[ci].push(m4.compose(v, q, s).clone(), c.clone(), gn, root);
    grassCount++;
  }
  // 텍스처 카드: 엇갈린 사각형 두 장에 풀잎 10개쯤 그린 1비트 알파 텍스처 (알파 0.5 기준으로 보이거나 안 보이거나).
  // 풀잎 폴리곤과 같은 자리·색·흔들림을 쓰고 개수는 절반 (카드 한 장이 훨씬 많은 풀잎을 그린다)
  // 텍스처 종류 (설정 메뉴 버튼으로 폴리곤 → 텍스처1 → … → 폴리곤 순서로 돌아간다). 32x32, 뿌리가 아래.
  // 풀 끝은 위쪽 0~5칸 안에 모아 키를 고르게 맞춘다. tall = 카드 높이 배율
  const crand = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blade = (g, bx, lean, top, w, v) => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.moveTo(bx - w, 32); g.lineTo(bx + w, 32); g.lineTo(bx + lean, top); g.closePath(); g.fill(); };
  const stalk = (g, x0, x1, top, v) => { g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, 32); g.lineTo(x1, top); g.stroke(); };
  // 이삭 풀: 풀마다 밝기 차이를 크게, 일부는 누렇게 더 마른 색. 낟알은 불그스름하게, 포기 간격은 조금 넓게
  const seedGrass = (g, r) => {
    const tint = (v, dry) => dry ? `rgb(${v},${Math.round(v * 0.9)},${Math.round(v * 0.66)})` : `rgb(${v},${v},${Math.round(v * 0.94)})`;
    for (let k = 0; k < 7; k++) {
      const bx = (k + 0.2 + r() * 0.6) / 7 * 30 + 1, lean = (r() - 0.5) * 10, top = 7 + r() * 5, w = 1 + r() * 1.2;
      g.fillStyle = tint(Math.round(150 + r() * 105), r() < 0.35);
      g.beginPath(); g.moveTo(bx - w, 32); g.lineTo(bx + w, 32); g.lineTo(bx + lean, top); g.closePath(); g.fill();
    }
    for (let k = 0; k < 4; k++) {
      const x0 = (k + 0.25 + r() * 0.5) / 4 * 28 + 2, lean = (r() - 0.5) * 8, top = 1 + r() * 3, v = Math.round(185 + r() * 70), dry = r() < 0.4;
      g.strokeStyle = tint(v, dry); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, 32); g.lineTo(x0 + lean, top + 3); g.stroke();
      g.fillStyle = `rgb(${Math.round(v * 0.96)},${Math.round(v * 0.8)},${Math.round(v * 0.66)})`;
      for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(x0 + lean + (j % 2 ? 1.3 : -1.3), top + j * 1.6, 1.2, 0, 6.283); g.fill(); }
    }
  };
  const GRASS_TEX = [
    { name: '갈대', label: '1', seed: 1, draw(g, r) {   // 아래쪽 넓은 잎 + 가는 줄기 끝의 길쭉한 깃털 이삭
      for (let k = 0; k < 6; k++) blade(g, 2 + r() * 28, (r() - 0.5) * 8, 11 + r() * 5, 1 + r(), Math.round(200 + r() * 30));
      for (let k = 0; k < 5; k++) {
        const x0 = 3 + r() * 26, lean = (r() - 0.5) * 6, top = 1 + r() * 2, v = Math.round(225 + r() * 30);
        stalk(g, x0, x0 + lean, top + 7, v);
        g.fillStyle = `rgb(${v},${v - 8},${v - 24})`;
        g.beginPath(); g.ellipse(x0 + lean * 1.1, top + 4, 1.7, 4.2, lean * 0.08, 0, 6.283); g.fill();
      }
    } },
    { name: '이삭 풀', label: '2', seed: 4, tall: 1.3, draw(g, r) { seedGrass(g, r); } },
    { name: '키 큰 풀', label: '3', seed: 5, tall: 1.5, draw(g, r) { for (let k = 0; k < 14; k++) blade(g, 1 + r() * 30, (r() - 0.5) * 8, r() * 4, 0.9 + r() * 1.2, Math.round(205 + r() * 50)); } },
  ];
  const cardGeo = new THREE.BufferGeometry();
  {
    const p = [], uv = [], cl = [], nr = [], idx = [];
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + 0.3, cx = Math.cos(a) * 0.45, cz = Math.sin(a) * 0.45, b = k * 4;
      p.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      cl.push(0.41, 0.38, 0.33, 0.41, 0.38, 0.33, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8);
      nr.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    cardGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    cardGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    cardGeo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    cardGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
    cardGeo.setIndex(idx);
  }
  const cardMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 });
  GRASS_TEX.forEach((t, i) => {
    const m = i ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5 }) : cardMat;
    m.map = canvasTex(32, 32, (g) => t.draw(g, crand(0x51ab3d + t.seed * 7919)));   // seed: 예전 순번 (무늬가 바뀌지 않게)
    const k = t.tall || 1;
    // 키 큰 풀: 카드를 위로 늘린다 (흔들림·색은 원래 높이 기준 그대로라 끝이 과하게 휘거나 밝아지지 않는다)
    m.onBeforeCompile = k === 1 ? mat.onBeforeCompile : (sh) => {
      mat.onBeforeCompile(sh);
      sh.vertexShader = sh.vertexShader.replace('vec4(transformed, 1.0)).xyz - b4.xyz', `vec4(transformed * vec3(1.0, ${k.toFixed(2)}, 1.0), 1.0)).xyz - b4.xyz`);
    };
    m.customProgramCacheKey = () => 'grassCard' + k;
    grassCardMats.push(m); grassCardNames.push(`${t.label} (${t.name})`);
  });
  for (const list of chunks) {
    if (!list.length) continue;
    const n = list.length / 4, cg = cardGeo.clone(), gnA = new Float32Array(n * 3), rtA = new Float32Array(n * 3);
    const cm = new THREE.InstancedMesh(cg, cardMat, n);
    for (let i = 0; i < n; i++) { cm.setMatrixAt(i, list[i * 4]); cm.setColorAt(i, list[i * 4 + 1]); list[i * 4 + 2].toArray(gnA, i * 3); list[i * 4 + 3].toArray(rtA, i * 3); }
    cg.setAttribute('aGround', new THREE.InstancedBufferAttribute(gnA, 3));
    cg.setAttribute('aRoot', new THREE.InstancedBufferAttribute(rtA, 3));
    cm.computeBoundingSphere(); cm.boundingSphere.radius += 2;
    cm.count = Math.ceil(n * 0.5);   // 카드 한 장이 풀잎 여러 개를 그리니 절반만 (심은 순서가 무작위라 앞의 절반도 고르게 퍼져 있다)
    cm.userData.noOutline = true;
    scene.add(cm); grassCard.push(cm);
  }
}

// ---------------------------------------------------------------- 불 번짐 / 재생
for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
  const x = -HALF + (i + 0.5) * FCELL, z = -HALF + (j + 0.5) * FCELL, k = j * FN + i;
  const gi = gridIndex(x, z);
  let cap = roadD[gi] < ROAD_HW + 0.1 || creekD[gi] < CREEK_HW + 0.9 || cliffG[gi] > 0.2 || (cliffNear[gi] && creekD[gi] < CREEK_HW + 7) ? 0 : 1;
  cap *= lerp(1, 0.3, townAt(x, z));   // 마을은 풀이 성기다
  if (inFootprint(x, z)) cap = 0;
  fCap[k] = fFuel[k] = cap;
}
const burning = [];    // 이번 틱에 타고 있는 칸
let fireBins = [];     // 화재 광원 배치용 (10x10 구역별 합)
const fireGlow = new Map();   // 구역 번호 → 지금 비추는 불빛 { x, z, I } (updateLights가 부드럽게 따라간다)
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 0.7], [1, -1, 0.7], [-1, 1, 0.7], [-1, -1, 0.7]];
function fieldTick(dt) {
  burning.length = 0;
  const wd = U.uWindDir.value;
  for (let k = 0; k < FN * FN; k++) {
    if (fTr[k] > 0) fTr[k] = Math.max(0, fTr[k] - dt / CFG.map.grassTrampleTime);   // 밟혀 눌린 풀은 30초(설정)에 걸쳐 일어선다
    if (fFire[k] > 0) {
      if (fFuel[k] > 0) {
        fFire[k] = Math.min(1, fFire[k] + dt * 5);
        fFuel[k] -= dt * 0.7;   // 타는 시간은 짧게
        fGrow[k] = Math.max(0.08, fFuel[k] / Math.max(fCap[k], 0.01));
        fChar[k] = Math.max(fChar[k], 1 - fGrow[k]);
        // 이웃으로 번지되 세대마다 힘이 약해져서 결국 멈춘다. 바람 방향으로 더 잘 번짐
        if (fPower[k] > 0.05) {
          const i = k % FN, j = (k / FN) | 0;
          for (const [di, dj, w] of NB) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= FN || nj >= FN) continue;
            const n = nj * FN + ni;
            if (fFire[n] > 0 || fFuel[n] < 0.15) continue;
            const wb = Math.max(0.15, 1 + 1.8 * (di * wd.x + dj * wd.y) / Math.hypot(di, dj));
            if (rand() < 1.9 * dt * w * wb * fFire[k] * fFuel[n]) { fFire[n] = 0.05; fPower[n] = fPower[k] * 0.72; }   // 세대마다 0.72배: 번지는 범위 약 85%
          }
        }
        if (fFuel[k] <= 0) { fFuel[k] = 0; fGrow[k] = 0.08; fChar[k] = 1; fRegrow[k] = rr(20, 35); }
      } else fFire[k] = Math.max(0, fFire[k] - dt * 3);
      if (fFire[k] > 0.2) burning.push(k);
    } else if (fRegrow[k] > 0) {
      fRegrow[k] -= dt;
    } else if (fGrow[k] < 1 || fChar[k] > 0) {
      fGrow[k] = Math.min(1, fGrow[k] + dt / 15);
      fFuel[k] = fCap[k] * fGrow[k];
      fChar[k] = Math.max(0, fChar[k] - dt / 10);
    }
  }
  for (let k = 0, o = 0; k < FN * FN; k++, o += 4) {
    fieldData[o] = fTr[k] * 255; fieldData[o + 1] = fFire[k] * 255;
    fieldData[o + 2] = fChar[k] * 255; fieldData[o + 3] = fGrow[k] * 255;
  }
  fieldTex.needsUpdate = true;
  const bins = new Map();
  for (const k of burning) {
    const i = k % FN, j = (k / FN) | 0, b = ((j / 20) | 0) * 10 + ((i / 20) | 0), w = fFire[k];
    let e = bins.get(b); if (!e) bins.set(b, e = { x: 0, z: 0, s: 0 });
    e.x += (-HALF + (i + 0.5) * FCELL) * w; e.z += (-HALF + (j + 0.5) * FCELL) * w; e.s += w;
  }
  fireBins = [...bins].map(([b, e]) => ({ b, x: e.x / e.s, z: e.z / e.s, s: e.s })).sort((a, b) => b.s - a.s);
}
function scorchField(x, z, r) {
  forCells(x, z, r * 2, (k, d) => { fTr[k] = Math.max(fTr[k], 1 - d / (r * 4)); });   // 폭풍에 풀이 눕는다
  forCells(x, z, r, (k, d) => {
    if (d < r * 0.55) { fFuel[k] = 0; fFire[k] = Math.max(fFire[k], 0.6); fGrow[k] = 0.08; fChar[k] = 1; fRegrow[k] = rr(20, 35); }
    else if (fFuel[k] > 0.15) { fFire[k] = 1; fPower[k] = 1; }
    else fChar[k] = Math.max(fChar[k], 0.6);
  });
}

await loadStep(0.88, 'ALMOST THERE...');
// ---------------------------------------------------------------- 파티클 (점 하나 = 픽셀 덩어리, 시스템당 draw 1회)
// 연기 입자가 받는 주변 광원 (폭발/화재용 fx 광원 4개). 입자마다 정점 셰이더에서 한 번만 계산
const FXL = { uLPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -1e4, 0)) }, uLCol: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) } };
class Particles {
  constructor(n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-1e4); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.ttl = new Float32Array(n);
    this.c0 = new Float32Array(n * 4); this.c1 = new Float32Array(n * 4);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.fade = new Float32Array(n);   // 연기가 옅어지기 시작하는 수명 비율
    this.bobA = new Float32Array(n); this.bobH = new Float32Array(n); this.bobF = new Float32Array(n);   // 둥실 모드: 지면 위 높이 bobH ± bobA, 진동수 bobF (0이면 일반 입자)
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('pcolor', this.aCol); geo.setAttribute('psize', this.aSize);
    geo.setAttribute('pseed', new THREE.BufferAttribute(new Float32Array(n).map(() => rand()), 1));   // 입자 칸마다 고정된 모양 씨앗
    this.additive = additive;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: U.uPointScale, uFogN: FOGN, uFogF: FOGF, uFogColor: { value: FOG }, ...FXL },
      defines: additive ? { ADD: 1 } : {},
      // 연기는 반투명 블렌딩 대신 망점(디더) 불투명 입자: 깊이 정렬이 정확하고 카툰 느낌
      transparent: !!additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NoBlending,
      vertexShader: `
        attribute vec4 pcolor; attribute float psize, pseed; uniform float uScale, uFogN, uFogF; varying float vS;
        uniform vec3 uLPos[4], uLCol[4];
        varying vec4 vC; varying float vF; varying vec3 vLit; varying vec2 vLDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          #ifdef ADD
            gl_PointSize = max(1.0, psize * uScale / -mv.z);
          #else
            gl_PointSize = max(1.0, psize * 1.6 * uScale / -mv.z);   // 감자 모양은 원보다 덜 차니 크게
          #endif
          vC = pcolor; vS = pseed; float fk = max(-mv.z - uFogN, 0.0) * 2.0 / max(uFogF - uFogN, 0.001); vF = exp(-fk * fk);
          #ifndef ADD
            // 가까운 광원의 밝기 합과, 화면에서 빛이 오는 방향
            vec3 lit = vec3(0.0); vec2 ld = vec2(0.0);
            for (int i = 0; i < 4; i++) {
              vec3 l = uLPos[i] - position;
              vec3 c = uLCol[i] / (1.0 + dot(l, l));
              lit += c;
              ld += normalize((viewMatrix * vec4(l, 0.0)).xy + 1e-4) * (c.r + c.g + c.b);
            }
            vLit = min(lit, vec3(1.2)); vLDir = normalize(ld + 1e-5);
          #endif
        }`,
      fragmentShader: `
        uniform vec3 uFogColor; varying vec4 vC; varying float vF, vS; varying vec3 vLit; varying vec2 vLDir;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25 || vC.a <= 0.0) discard;
          #ifndef ADD
            // 감자 모양: 큰 동그라미 하나에 크기가 다른 동그라미 1~2개를 입자마다 다른 방향으로 어긋나게 겹친 덩어리
            float h1 = fract(vS * 13.7) * 6.2832, h2 = fract(vS * 71.3), h3 = fract(vS * 193.1);
            vec2 c1 = 0.17 * vec2(cos(h1), sin(h1)), c2 = 0.16 * vec2(cos(h1 + 2.2 + h2 * 1.6), sin(h1 + 2.2 + h2 * 1.6));
            float m = min(length(d - c1 * -0.35) - 0.3, length(d - c1) - (0.19 + 0.08 * h2));
            if (h3 > 0.35) m = min(m, length(d - c2) - (0.16 + 0.08 * h3));
            if (m > 0.0) discard;
          #endif
          #ifdef ADD
            gl_FragColor = vec4(vC.rgb * vC.a * vF, 1.0);
          #else
            // 알파 = 망점 밀도. 아래쪽은 어둡게, 광원을 향한 쪽은 그 빛으로 살짝 밝게
            if (bayer4(gl_FragCoord.xy) >= min(1.0, vC.a * 1.4)) discard;
            vec3 c = vC.rgb * (0.85 - d.y * 0.5);
            c += vLit * (0.25 + 0.75 * clamp(dot(vec2(d.x, -d.y) * 2.0, vLDir), 0.0, 1.0)) * 0.6;
            gl_FragColor = vec4(mix(uFogColor, c, vF), 1.0);
          #endif
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, ttl, c0, c1, s0, s1, grav = 0, drag = 0, fade = 0.8) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.c0.set(c0, i * 4); this.c1.set(c1, i * 4);
    this.life[i] = 0; this.ttl[i] = ttl; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag; this.fade[i] = fade;
    this.bobA[i] = 0;
    return i;
  }
  // 바람 먼지처럼 지면을 따라 둥실둥실 떠가는 입자: 높이 = 그 자리 지면 + h + a·sin(f·t + 위상)
  float(i, h, a, f) { this.bobA[i] = a; this.bobH[i] = h; this.bobF[i] = f; }
  update(dt) {
    const wd = U.uWindDir.value, ws = this.additive ? 0 : U.uWind.value * 2.2;
    for (let i = 0; i < this.n; i++) {
      if (this.ttl[i] <= 0) continue;
      this.life[i] += dt;
      const t = this.life[i] / this.ttl[i], p = i * 3, c = i * 4;
      if (t >= 1) { this.ttl[i] = 0; this.pos[p + 1] = -1e4; this.col[c + 3] = 0; continue; }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[p] *= k; this.vel[p + 2] *= k; this.vel[p + 1] = this.vel[p + 1] * k - this.grav[i] * dt;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.bobA[i] > 0) {   // 높이는 지면을 따라가며 크게 출렁인다 (지면 높이 조회 1번: 가볍다)
        const x = this.pos[p], z = this.pos[p + 2];
        this.pos[p + 1] = (Math.abs(x) < HALF && Math.abs(z) < HALF ? heightAt(x, z) : 0) + this.bobH[i] + this.bobA[i] * Math.sin(this.life[i] * this.bobF[i] + i);
      }
      if (ws && this.grav[i] <= 0) { const w = ws * dt * Math.min(1, this.life[i] * 2); this.pos[p] += wd.x * w; this.pos[p + 2] += wd.y * w; }
      for (let q = 0; q < 3; q++) this.col[c + q] = lerp(this.c0[c + q], this.c1[c + q], t);
      // 연기: 수명의 fade 비율(기본 80%)까지는 진하게 유지하다가 이후 옅어진다
      this.col[c + 3] = this.additive ? lerp(this.c0[c + 3], this.c1[c + 3], t)
        : lerp(this.c0[c + 3], this.c1[c + 3], smooth(this.fade[i], 1, t));
      this.size[i] = lerp(this.s0[i], this.s1[i], t);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}
const glowP = new Particles(4000, true);    // 불꽃, 섬광, 불티
const smokeP = new Particles(6000, false);  // 연기, 흙, 먼지

// 폭발/화재용 동적 광원 풀. 개수가 바뀌면 셰이더가 재컴파일되므로 미리 만들어 두고 세기만 바꾼다
const fxLights = [];
for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 16, 2); scene.add(l); fxLights.push(l); }
lightCount += fxLights.length;
const flashes = [];   // {p, t, dur, I, range, color}

const HULL_HX = 1.5, HULL_HZ = 2.0;   // 충돌용 차체 반폭/반길이 (탱크. 지프처럼 크기가 다른 몸체는 hx·hz·ht를 따로 가진다)

