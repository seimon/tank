// ---------------------------------------------------------------- 텍스처 헬퍼
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 손으로 켠 판자: 폭이 제각각이고 이음매가 살짝 들쭉날쭉, 맞댄 자리·옹이·못 자국
const plankTex = canvasTex(64, 64, (g) => {
  const ws = [];
  for (let t = 0; t < 64;) { const w = Math.min(64 - t, 5 + Math.floor(rand() * 5)); ws.push(w); t += w; }
  if (ws[ws.length - 1] < 4) { ws[ws.length - 2] += ws.pop(); }
  let y = 0;
  for (const w of ws) {
    const v = 175 + Math.floor(rand() * 65);
    g.fillStyle = `rgb(${v},${v - 4},${v - 8})`; g.fillRect(0, y, 64, w);
    // 결
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.15})`;
      g.fillRect(Math.floor(rand() * 64), y + 1 + Math.floor(rand() * (w - 2)), 3 + Math.floor(rand() * 12), 1);
    }
    // 아래 이음매: 몇 픽셀마다 한 칸씩 오르내린다
    g.fillStyle = 'rgba(0,0,0,.5)';
    let off = 0;
    for (let x = 0; x < 64;) {
      const run = 6 + Math.floor(rand() * 14);
      g.fillRect(x, y + w - 1 + off, run, 1);
      x += run; off = off === 0 ? (rand() < 0.5 ? -1 : 0) : 0;
    }
    // 맞댄 자리 + 못
    for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) {
      const jx = Math.floor(rand() * 64);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(jx, y, 1, w - 1);
      g.fillStyle = 'rgba(30,20,10,.7)'; g.fillRect(jx - 2, y + 1, 1, 1); g.fillRect(jx + 2, y + w - 3, 1, 1);
    }
    if (rand() < 0.35) { g.fillStyle = 'rgba(40,25,10,.45)'; g.fillRect(Math.floor(rand() * 60), y + Math.floor(w / 2) - 1, 2, 2); }
    y += w;
  }
}, true);
const windowTex = (lit, bars) => canvasTex(16, 20, (g) => {
  g.fillStyle = '#2a1c12'; g.fillRect(0, 0, 16, 20);
  if (lit) { const gr = g.createLinearGradient(0, 2, 0, 18); gr.addColorStop(0, '#ffe09a'); gr.addColorStop(1, '#e8963e'); g.fillStyle = gr; }
  else g.fillStyle = '#1c2332';
  g.fillRect(2, 2, 12, 16);
  g.fillStyle = '#2a1c12'; g.fillRect(7, 2, 2, 16); g.fillRect(2, 9, 12, 2);
  if (bars) for (let x = 3; x < 14; x += 3) g.fillRect(x, 2, 1, 16);
});
const signTex = (text, bg, fg) => canvasTex(128, 28, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, 128, 28);
  g.strokeStyle = '#2a1a10'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 125, 25);
  g.fillStyle = fg; g.font = 'bold 19px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 15);
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(70,45,20,${rand() * 0.3})`; g.fillRect(rand() * 128, rand() * 28, 1 + rand() * 3, 1); }
});
const glowTex = canvasTex(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,230,170,1)'); gr.addColorStop(0.3, 'rgba(255,190,100,.45)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
});

const matCache = new Map();
function woodMat(color) {
  if (!matCache.has(color)) matCache.set(color, lambert({ map: plankTex, color, side: THREE.DoubleSide }));
  return matCache.get(color);
}
// 지붕 널: 엇갈려 겹친 너와 줄, 줄마다 아래쪽 그림자, 가끔 빠지거나 색이 다른 조각
const shingleTex = canvasTex(64, 64, (g) => {
  for (let row = 0; row < 8; row++) {
    const y = row * 8, off = (row % 2) * 5;
    for (let x = -off; x < 64; ) {
      const w = 7 + Math.floor(rand() * 7), v = 150 + Math.floor(rand() * 70);
      g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(x, y, w, 8);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + w - 1, y, 1, 7);       // 조각 사이 틈
      if (rand() < 0.5) { g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x + 2, y + 1 + Math.floor(rand() * 4), 1, 3); }
      if (rand() < 0.04) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y, w, 8); }   // 빠진 조각
      x += w;
    }
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y + 7, 64, 1);          // 겹친 아랫단 그림자
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y, 64, 1);
  }
}, true);
const roofCache = new Map();
function roofMat(color) {
  if (!roofCache.has(color)) roofCache.set(color, lambert({ map: shingleTex, color, side: THREE.DoubleSide }));
  return roofCache.get(color);
}
// 판자 텍스처가 3m마다 반복되도록 UV를 면 크기에 맞추고, 면마다 몇 도씩 비뚤게 돌려 손으로 붙인 느낌을 낸다
function woodBox(w, h, d, color, slant = 0.05, mat = woodMat(color), rep = 3) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const a = rr(-slant, slant), ca = Math.cos(a), sa = Math.sin(a), ou = rand(), ov = rand();
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, u = uv.getX(i) * dims[f][0] / rep, v = uv.getY(i) * dims[f][1] / rep;
      uv.setXY(i, u * ca - v * sa + ou, u * sa + v * ca + ov);
    }
  }
  return new THREE.Mesh(g, mat);
}
// 지붕판 (너와 무늬, 2.5m 반복)
const roofBox = (w, h, d, color) => woodBox(w, h, d, color, 0.015, roofMat(color), 2.5);
// 비뚤게 박힌 부재
function crooked(m, a = 0.04) { m.rotation.x += rr(-a, a); m.rotation.z += rr(-a, a); m.rotation.y += rr(-a, a) * 0.5; return m; }
// 벽에 붙는 창문/간판/문은 깊이 오프셋으로 z-fighting 방지
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
const litWinMat = ps1(new THREE.MeshBasicMaterial({ map: windowTex(true), ...DECAL }));
const darkWinMat = lambert({ map: windowTex(false), ...DECAL });
const barWinMat = ps1(new THREE.MeshBasicMaterial({ map: windowTex(true, true), ...DECAL }));
const doorMat = lambert({ map: plankTex, color: 0x3e2a1a, ...DECAL });
const posterMat = lambert({ map: canvasTex(12, 16, (g) => {
  g.fillStyle = '#d8cca4'; g.fillRect(0, 0, 12, 16);
  g.fillStyle = '#3a2a1a'; g.fillRect(2, 1, 8, 2); g.fillRect(3, 5, 6, 5); g.fillRect(2, 12, 8, 1); g.fillRect(3, 14, 6, 1);
}), ...DECAL });
function plane(w, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.z = rr(-0.025, 0.025); return m;
}

// ---------------------------------------------------------------- 조명 (가로등, 랜턴)
const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdc96 });
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd28a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
let lightCount = 0;
const lamps = [];
function addLamp(parent, x, y, z, intensity = 120, range = 26) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), bulbMat);
  bulb.position.set(x, y, z); parent.add(bulb);
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(x, y, z); glow.scale.setScalar(1.3); parent.add(glow);
  const light = new THREE.PointLight(0xffb062, intensity, range, 2);
  light.position.set(x, y - 0.15, z); parent.add(light);
  lightCount++;
  const lamp = { light, glow, base: intensity, flicker: false };
  lamps.push(lamp);
  return lamp;
}

// 그룹 안의 메시를 머티리얼별로 하나씩 합친다 (draw call 절약). deform을 주면 정점마다 적용
const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3();
// 삼각형을 maxE(m)보다 짧은 변이 되도록 잘게 쪼갠다. 모든 속성을 무게중심 보간 (평면이라 정확)
function subdivide(g, maxE) {
  g = g.index ? g.toNonIndexed() : g;
  const names = Object.keys(g.attributes), src = names.map(n => g.attributes[n]), out = names.map(() => []);
  const P = g.attributes.position.array, d = (i, j) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
  for (let t = 0; t < g.attributes.position.count; t += 3) {
    const n = Math.max(1, Math.ceil(Math.max(d(t, t + 1), d(t + 1, t + 2), d(t + 2, t)) / maxE));
    const emit = (i, j) => {
      const u = i / n, v = j / n, w = 1 - u - v;
      src.forEach((a, k) => { const s = a.itemSize, A = a.array; for (let c = 0; c < s; c++) out[k].push(A[t * s + c] * w + A[(t + 1) * s + c] * u + A[(t + 2) * s + c] * v); });
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      emit(i, j); emit(i + 1, j); emit(i, j + 1);
      if (i + j < n - 1) { emit(i + 1, j); emit(i + 1, j + 1); emit(i, j + 1); }
    }
  }
  const o = new THREE.BufferGeometry();
  names.forEach((nm, k) => o.setAttribute(nm, new THREE.Float32BufferAttribute(out[k], src[k].itemSize)));
  return o;
}
// 구운 그늘(AO)을 버텍스 컬러로: 정점마다 법선 쪽 반구로 광선 몇 개를 쏴서, 다른 부품 상자나 바닥(y=0)에
// 가까이 막히는 만큼 어둡게. 부품은 경계 상자로 어림하고, 광선이 상자 안에서 출발하면 그 상자는 무시
const AO_DIRS = (() => {
  const out = [], N = 16;
  for (let i = 0; i < N; i++) {   // 코사인 가중 반구 (피보나치 배치)
    const r = Math.sqrt((i + 0.5) / N), a = i * 2.39996;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - r * r)));
  }
  return out;
})();
// 가리개 상자: 역행렬 성분과 상자 범위를 숫자로 풀어 둔다 (광선이 수십만 개라 벡터 객체 없이 계산)
function aoOccluder(b, inv) {
  return { e: inv.elements, x0: b.min.x, y0: b.min.y, z0: b.min.z, x1: b.max.x, y1: b.max.y, z1: b.max.z };
}
// (ox,oy,oz)에서 법선 n 쪽 반구로 AO_DIRS를 쏴서 near 상자들(과 높이 groundY의 바닥)에 maxd 안에서 막히는 정도 0~1.
// 출발점이 상자 안이면 그 상자는 무시
const _aoQ = new THREE.Quaternion(), _aoD = new THREE.Vector3(), _aoZ = new THREE.Vector3(0, 0, 1), _aoL = [];
function aoTrace(ox, oy, oz, n, near, maxd, groundY) {
  let m = 0;
  for (const c of near) {
    const e = c.e;
    const x = e[0] * ox + e[4] * oy + e[8] * oz + e[12], y = e[1] * ox + e[5] * oy + e[9] * oz + e[13], z = e[2] * ox + e[6] * oy + e[10] * oz + e[14];
    if (x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1 && z > c.z0 && z < c.z1) continue;
    const L = _aoL[m] || (_aoL[m] = {}); L.c = c; L.x = x; L.y = y; L.z = z; m++;
  }
  if (!m && groundY === null) return 0;
  _aoQ.setFromUnitVectors(_aoZ, n);
  let sum = 0;
  for (const D of AO_DIRS) {
    _aoD.copy(D).applyQuaternion(_aoQ);
    const dx = _aoD.x, dy = _aoD.y, dz = _aoD.z;
    let t = groundY !== null && dy < -1e-4 ? Math.min(maxd, (oy - groundY) / -dy) : maxd;
    for (let k = 0; k < m; k++) {
      const L = _aoL[k], c = L.c, e = c.e;
      const ux = e[0] * dx + e[4] * dy + e[8] * dz, uy = e[1] * dx + e[5] * dy + e[9] * dz, uz = e[2] * dx + e[6] * dy + e[10] * dz;
      let t0 = 0, t1 = t, a, b, s;
      if (Math.abs(ux) < 1e-8) { if (L.x < c.x0 || L.x > c.x1) continue; }
      else { a = (c.x0 - L.x) / ux; b = (c.x1 - L.x) / ux; if (a > b) { s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (Math.abs(uy) < 1e-8) { if (L.y < c.y0 || L.y > c.y1) continue; }
      else { a = (c.y0 - L.y) / uy; b = (c.y1 - L.y) / uy; if (a > b) { s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (Math.abs(uz) < 1e-8) { if (L.z < c.z0 || L.z > c.z1) continue; }
      else { a = (c.z0 - L.z) / uz; b = (c.z1 - L.z) / uz; if (a > b) { s = a; a = b; b = s; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      t = t0;
    }
    if (t < maxd) sum += 1 - t / maxd;
  }
  return sum / AO_DIRS.length;
}
let aoMs = 0;   // AO 굽는 데 쓴 시간 (확인용)
// AO 캐시: 구운 결과를 브라우저에 저장해 두고 다음 로딩부터 그대로 쓴다. 굽는 순서대로 한 덩어리씩(정점당 1바이트).
// 덩어리 길이(정점 수)가 다르면 모델이 바뀐 것이니 그 덩어리만 다시 굽고 통째로 새로 저장. 굽는 방식을 바꾸면 AO_VER를 올린다
const AO_VER = 'ao-2', AO_KEY = 'minitank.ao';
const aoStore = (() => { try { const s = JSON.parse(localStorage.getItem(AO_KEY) || 'null'); return s && s.ver === AO_VER ? s.chunks : []; } catch (_) { return []; } })();
const aoOut = [];
let aoMiss = false, aoHits = 0;
const aoB64 = (a) => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
function aoChunk(len, compute) {
  const s = aoStore[aoOut.length];
  if (s) {
    try {
      const b = atob(s);
      if (b.length === len) { const a = new Uint8Array(len); for (let k = 0; k < len; k++) a[k] = b.charCodeAt(k); aoOut.push(s); aoHits++; return a; }
    } catch (_) {}
  }
  const a = compute();
  aoMiss = true; aoOut.push(aoB64(a));
  return a;
}
function aoSave() {
  if (!aoMiss) return;
  try { localStorage.setItem(AO_KEY, JSON.stringify({ ver: AO_VER, chunks: aoOut })); } catch (_) {}
}
function bakeAO(root, maxd = 1.1, strength = 0.9, maxE = 0.28) {
  const t0 = performance.now();
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const occ = meshes.map((m) => {
    if (m.material.isMeshBasicMaterial) return null;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox, sz = b.getSize(new THREE.Vector3());
    if (Math.min(sz.x, sz.y, sz.z) < 0.05) return null;
    // 경계 상자로 어림해도 되는 꽉 찬 모양만 가리개로 (상자·원기둥, 표시한 것). 박공 삼각형 두 장처럼 속이 빈 모양은 상자가 지붕 위로 삐져나와 테두리를 까맣게 만든다
    if (m.geometry.type === 'BufferGeometry' && !m.geometry.userData.aoSolid) return null;
    return { ...aoOccluder(b, m.matrixWorld.clone().invert()), wb: b.clone().applyMatrix4(m.matrixWorld).expandByScalar(maxd) };
  });
  for (const m of meshes) m.geometry = subdivide(m.geometry, maxE);
  const total = meshes.reduce((s, m) => s + m.geometry.attributes.position.count, 0);
  const ao = aoChunk(total, () => {
    const out = new Uint8Array(total), near = [];
    const o = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(), cache = new Map();
    let j = 0;
    meshes.forEach((m, mi) => {
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal;
      nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        const key = `${mi}|${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}|${n.x.toFixed(1)},${n.y.toFixed(1)},${n.z.toFixed(1)}`;
        let v = cache.get(key);
        if (v === undefined) {
          let a = 0;
          if (!m.material.isMeshBasicMaterial) {
            o.copy(p).addScaledVector(n, 0.03);
            near.length = 0;
            for (let k = 0; k < occ.length; k++) if (occ[k] && k !== mi && occ[k].wb.containsPoint(o)) near.push(occ[k]);
            a = aoTrace(o.x, o.y, o.z, n, near, maxd, 0);   // 바닥 = y 0
          }
          v = Math.round(255 * Math.max(0.28, 1 - strength * a));
          cache.set(key, v);
        }
        out[j++] = v;
      }
    });
    return out;
  });
  let j = 0;
  for (const m of meshes) {
    const cnt = m.geometry.attributes.position.count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[j++] / 255;
    m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  aoMs += performance.now() - t0;
}
function bake(g, deform, keepAttrs = []) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), byMat = new Map(), keep = [];
  g.traverse((o) => {
    if (o.isMesh) {
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(_m4.multiplyMatrices(inv, o.matrixWorld));
      if (deform) {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) { deform(_v3.fromBufferAttribute(p, i)); p.setXYZ(i, _v3.x, _v3.y, _v3.z); }
        geo.computeVertexNormals();
      }
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', ...keepAttrs].includes(k)) geo.deleteAttribute(k);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
    } else if (o.isSprite || o.isLight) keep.push(o);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) out.add(new THREE.Mesh(mergeGeometries(geos), mat));
  for (const o of keep) {
    _v3.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    if (deform) deform(_v3);
    o.removeFromParent(); o.position.copy(_v3); out.add(o);
  }
  return out;
}
// 건물마다 다른 기울기와 위로 갈수록 살짝 좁아지는 모양. 아핀 변형이라 벽면은 평면 그대로라
// 창문·간판이 벽에서 떨어지지 않는다
function leaner() {
  const ax = rr(-0.022, 0.022), az = rr(-0.018, 0.018), kx = rr(0, 0.012), kz = rr(0, 0.01);
  return (v) => { const y = v.y; v.x = v.x * (1 - kx * y) + ax * y; v.z = v.z * (1 - kz * y) + az * y; };
}

await loadStep(0.22, 'BUILDING THE TOWN...');
// ---------------------------------------------------------------- 마을
const footprints = [];   // 충돌/배치 제외 영역 (회전된 사각형) {x,z,hx,hz,c,s,y0,top,box,group}
const fpLocal = (f, x, z, out) => {
  const dx = x - f.x, dz = z - f.z;
  out.x = dx * f.c - dz * f.s; out.z = dx * f.s + dz * f.c;
  return out;
};
const _fl = {};
const inFootprint = (x, z, m = 0) => footprints.some(f => { fpLocal(f, x, z, _fl); return Math.abs(_fl.x) < f.hx + m && Math.abs(_fl.z) < f.hz + m; });

const ironMat = lambert({ color: 0x2a2622 }), waterMat = lambert({ color: 0x24343c, ...DECAL });
function barrel(g, x, z) {
  const b = new THREE.Group();
  b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 8), woodMat(0x6a4a30)));
  for (const y of [-0.25, 0.25]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.34, 0.06, 8), ironMat); r.position.y = y; b.add(r); }
  b.position.set(x, 0.45, z); crooked(b, 0.05); g.add(b);
}
function crate(g, x, z, s = rr(0.6, 0.85), y = 0) {
  const c = woodBox(s, s, s, 0x7a5c3a, 0.1); c.position.set(x, y + s / 2, z); c.rotation.y = rr(-0.5, 0.5); g.add(c);
}
function hitchRail(g, x, z, len) {
  for (const s of [-1, 1]) { const p = crooked(woodBox(0.14, 1.1, 0.14, 0x4e3a28), 0.06); p.position.set(x + s * len / 2, 0.55, z); g.add(p); }
  const r = crooked(woodBox(len + 0.3, 0.1, 0.1, 0x4e3a28), 0.02); r.position.set(x, 1.05, z); g.add(r);
}
function trough(g, x, z) {
  const t = woodBox(1.8, 0.5, 0.6, 0x5a4330, 0.1); t.position.set(x, 0.25, z); g.add(t);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), waterMat); w.rotation.x = -Math.PI / 2; w.position.set(x, 0.46, z); g.add(w);
}
// 삐뚤빼뚤한 말뚝 울타리 (gate 위치는 비워 둔다)
function fence(g, x0, x1, z, gate = 1e9) {
  for (let x = x0; x <= x1; x += 0.28) {
    if (Math.abs(x - gate) < 0.6 || rand() < 0.06) continue;
    const p = crooked(woodBox(0.1, rr(0.8, 1.0), 0.04, 0xb0a48a, 0.2), 0.08); p.position.set(x, 0.45, z); g.add(p);
  }
  for (const y of [0.3, 0.7]) {
    const segs = Math.ceil((x1 - x0) / 2.4);
    for (let k = 0; k < segs; k++) {
      const a = x0 + (x1 - x0) * k / segs, b = x0 + (x1 - x0) * (k + 1) / segs;
      const r = crooked(woodBox(b - a + 0.1, 0.07, 0.05, 0x8a7e66), 0.03); r.position.set((a + b) / 2, y, z - 0.04); g.add(r);
    }
  }
}
// 창틀: 위 상인방, 아래 창턱, 양옆 틀 (+ 덧문)
function win(g, x, y, ww, hh, mat, z, shutters = 0) {
  g.add(plane(ww, hh, mat, x, y, z));
  const fc = 0x3a2a1e;
  const top = crooked(woodBox(ww + 0.32, 0.12, 0.08, fc), 0.02); top.position.set(x, y + hh / 2 + 0.06, z); g.add(top);
  const sill = crooked(woodBox(ww + 0.36, 0.08, 0.18, fc), 0.02); sill.position.set(x, y - hh / 2 - 0.04, z + 0.04); g.add(sill);
  for (const s of [-1, 1]) {
    const f = woodBox(0.08, hh, 0.06, fc); f.position.set(x + s * (ww / 2 + 0.04), y, z); g.add(f);
    if (shutters) { const sh = crooked(woodBox(ww * 0.45, hh, 0.04, shutters, 0.15), 0.03); sh.position.set(x + s * (ww * 0.75 + 0.1), y, z - 0.01); sh.rotation.y += s * 0.12; g.add(sh); }
  }
}
function cornerTrim(g, w, d, h, color) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = woodBox(0.2, h, 0.2, color); t.position.set(sx * (w / 2 + 0.02), h / 2 - 1, sz * (d / 2 + 0.02)); g.add(t);
  }
}
function gableRoof(w, d, rise, o, roofColor, wallColor) {
  const g = new THREE.Group(), half = d / 2 + o, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  for (const s of [1, -1]) {
    const m = roofBox(w + 2 * o + rr(-0.1, 0.1), 0.12, len + 0.08, roofColor);
    m.rotation.x = s * ang; m.position.set(rr(-0.05, 0.05), rise / 2, s * half / 2); m.rotation.z = rr(-0.012, 0.012); g.add(m);
  }
  const ridge = crooked(woodBox(w + 2 * o + 0.1, 0.14, 0.3, 0x2e2620), 0.01); ridge.position.y = rise + 0.03; g.add(ridge);
  const top = rise * (1 - o / half) * 0.98;
  const tri = new THREE.BufferGeometry();
  const p = [], uv = [];
  for (const x of [-w / 2, w / 2]) {
    p.push(x, -0.01, -d / 2, x, -0.01, d / 2, x, top, 0);
    uv.push(-d / 6, 0, d / 6, 0, 0, top / 3);
  }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tri.computeVertexNormals();
  const gm = new THREE.Mesh(tri, woodMat(wallColor)); gm.position.y = rise * o / half; g.add(gm);
  g.userData.drop = rise * o / half;
  return g;
}
function porch(g, w, d, depth, h) {
  const fl = woodBox(w, 0.25, depth, 0x5a4330, 0.08); fl.position.set(0, 0.12, d / 2 + depth / 2); g.add(fl);
  const n = Math.max(2, Math.round(w / 3.2) + 1);
  for (let i = 0; i < n; i++) {
    const post = crooked(woodBox(0.16, h, 0.16, 0x4e3a28), 0.035);
    post.position.set(lerp(-w / 2 + 0.2, w / 2 - 0.2, i / (n - 1)) + rr(-0.1, 0.1), h / 2, d / 2 + depth - 0.15); g.add(post);
  }
  const aw = crooked(roofBox(w + 0.3, 0.1, depth + 0.3, 0x5a483a), 0.015);
  aw.position.set(0, h + 0.05, d / 2 + depth / 2); aw.rotation.x += 0.08; g.add(aw);
  const fascia = crooked(woodBox(w + 0.3, 0.26, 0.06, 0x3a2a1e), 0.012); fascia.position.set(0, h - 0.06, d / 2 + depth + 0.13); g.add(fascia);
  const step = crooked(woodBox(1.5, 0.13, 0.5, 0x54402e, 0.1), 0.03); step.position.set(rr(-w / 5, w / 5), 0.065, d / 2 + depth + 0.25); g.add(step);
}
// 서부식 가짜 정면(false front)이 있는 상점 건물
function makeStore({ w, d, h, ff, color, sign, signBg, signFg, porchD = 2, lit = [], barred = false }) {
  const g = new THREE.Group(), trimC = 0x3a2a1e;
  const body = woodBox(w, h + 1, d, color); body.position.y = (h + 1) / 2 - 1; g.add(body);
  cornerTrim(g, w, d, h + 1, trimC);
  // 지붕판은 두툼하게: 몸통 윗면이 판 안에 묻혀 어디서도 지붕을 뚫고 나오지 않게 (z-fighting 방지)
  const roof = crooked(roofBox(w + 0.4, 0.46, d + 0.3, 0x4a3e34), 0.004); roof.position.set(0, h + 0.045, -0.1); roof.rotation.x -= 0.03; g.add(roof);
  // 옆·뒷벽의 작은 창 (불빛 없이 밋밋함만 덜어 준다)
  for (const sd of [-1, 1]) {
    const side = new THREE.Group(); side.rotation.y = sd * Math.PI / 2; g.add(side);
    for (const zz of [-d * 0.22, d * 0.22]) if (rand() < 0.8) win(side, zz, h > 5 ? (rand() < 0.5 ? 1.7 : 4.6) : 1.7, 0.55, 0.7, darkWinMat, w / 2 + 0.04);
  }
  { const back = new THREE.Group(); back.rotation.y = Math.PI; g.add(back); win(back, rr(-w / 4, w / 4), 1.8, 0.6, 0.7, darkWinMat, d / 2 + 0.04); }
  const front = woodBox(w + 0.3, ff + 1, 0.2, color); front.position.set(0, (ff + 1) / 2 - 1, d / 2 + 0.1); g.add(front);
  // 가짜 정면 꼭대기: 처마 장식 + 가운데 솟은 박공
  const cap = crooked(woodBox(w + 0.6, 0.25, 0.35, trimC), 0.01); cap.position.set(0, ff, d / 2 + 0.12); g.add(cap);
  const ped = woodBox(w * 0.42, 0.7, 0.2, color); ped.position.set(0, ff + 0.45, d / 2 + 0.1); g.add(ped);
  const pedCap = crooked(woodBox(w * 0.42 + 0.3, 0.16, 0.3, trimC), 0.015); pedCap.position.set(0, ff + 0.85, d / 2 + 0.12); g.add(pedCap);
  for (const s of [-1, 1]) { const t = woodBox(0.22, ff + 1, 0.26, trimC); t.position.set(s * (w / 2 + 0.1), (ff + 1) / 2 - 1, d / 2 + 0.16); g.add(t); }
  // 간판: 테두리 판 위에 글자판
  const sw = Math.min(w - 1, 7);
  const frame = crooked(woodBox(sw + 0.24, 1.74, 0.06, trimC), 0.012); frame.position.set(0, ff - 1.0, d / 2 + 0.23); g.add(frame);
  const sm = lambert({ map: signTex(sign, signBg, signFg), emissive: 0xffffff, emissiveIntensity: 0.25, ...DECAL });
  sm.emissiveMap = sm.map;
  const sgn = plane(sw, 1.5, sm, 0, ff - 1.0, d / 2 + 0.28); sgn.rotation.z = frame.rotation.z; g.add(sgn);
  porch(g, w, d, porchD, 3.1);
  for (const [x, y, ww, hh, on] of lit) win(g, x, y, ww, hh, on ? (barred && y < 3 && x > 0 ? barWinMat : litWinMat) : darkWinMat, d / 2 + 0.24);
  return g;
}
function makeSaloon() {
  const w = 11, d = 10;
  const g = makeStore({
    w, d, h: 7, ff: 9, color: 0x8a5a38, sign: 'SALOON', signBg: '#d9c79c', signFg: '#7a1f12',
    lit: [[-3.4, 1.5, 1.6, 1.4, 1], [3.4, 1.5, 1.6, 1.4, 1], [-4, 5, 0.9, 1.3, 1], [-1.4, 5, 0.9, 1.3, 0], [1.4, 5, 0.9, 1.3, 1], [4, 5, 0.9, 1.3, 1]],
  });
  g.add(plane(1.7, 2.2, litWinMat, 0, 1.1, d / 2 + 0.24));
  for (const s of [-1, 1]) { const bw = crooked(woodBox(0.78, 1.1, 0.05, 0x5a3a22), 0.04); bw.position.set(s * 0.42, 1.3, d / 2 + 0.3); bw.rotation.y += s * 0.25; g.add(bw); }
  // 2층 출입문 + 가로등, 앞마당 소품
  g.add(plane(0.9, 1.9, doorMat, 0, 4.15, d / 2 + 0.24));
  addLamp(g, -2.6, 2.8, d / 2 + 1.2, 45, 16);
  addLamp(g, 2.6, 2.8, d / 2 + 1.2, 45, 16);
  barrel(g, w / 2 - 0.4, d / 2 + 0.5); barrel(g, w / 2 - 1.1, d / 2 + 0.45);
  crate(g, -w / 2 - 0.6, d / 2 - 0.8); crate(g, -w / 2 - 0.7, d / 2 - 1.7); crate(g, -w / 2 - 0.65, d / 2 - 1.2, 0.55, 0.75);
  return g;
}
function makeSheriff() {
  const w = 7.5, d = 8;
  const g = makeStore({
    w, d, h: 3.6, ff: 5.2, color: 0x6e6252, sign: 'SHERIFF', signBg: '#cfc6aa', signFg: '#1d1a16', barred: true,
    lit: [[2, 1.6, 1.4, 1.3, 1], [-2.2, 1.6, 1.0, 1.3, 0]],
  });
  g.add(plane(1.0, 2.1, doorMat, -0.6, 1.05, d / 2 + 0.24));
  // 현상수배 전단, 벤치, 말 매는 기둥
  for (const [x, y] of [[0.55, 1.7], [0.95, 1.45], [-3.2, 1.4]]) g.add(plane(0.36, 0.48, posterMat, x, y, d / 2 + 0.25));
  const bench = crooked(woodBox(1.6, 0.08, 0.4, 0x5a4330), 0.03); bench.position.set(2.1, 0.68, d / 2 + 0.55); g.add(bench);
  for (const s of [-1, 1]) { const l = woodBox(0.08, 0.45, 0.35, 0x4e3a28); l.position.set(2.1 + s * 0.65, 0.45, d / 2 + 0.55); g.add(l); }
  barrel(g, -w / 2 + 0.5, d / 2 + 0.5);
  addLamp(g, 0.4, 2.6, d / 2 + 0.5, 35, 14);
  return g;
}
function makeHouse({ w, d, h = 3, color, roof = 0x463a32, ridgeZ = false, lit = 1, chimney = false, porchD = 0, shutters = 0, picket = false }) {
  const g = new THREE.Group();
  const body = woodBox(w, h + 1, d, color); body.position.y = (h + 1) / 2 - 1; g.add(body);
  cornerTrim(g, w, d, h + 1, 0x3e2e22);
  const rise = ridgeZ ? w * 0.45 : d * 0.4;
  const r = ridgeZ ? gableRoof(d, w, rise, 0.4, roof, color) : gableRoof(w, d, rise, 0.4, roof, color);
  if (ridgeZ) r.rotation.y = Math.PI / 2;
  r.position.y = h - r.userData.drop; r.rotation.z += rr(-0.012, 0.012); g.add(r);
  const dx = -w * 0.18;
  g.add(plane(0.95, 2.0, doorMat, dx, 1.0, d / 2 + 0.04));
  const dtop = crooked(woodBox(1.25, 0.12, 0.08, 0x3a2a1e), 0.02); dtop.position.set(dx, 2.06, d / 2 + 0.04); g.add(dtop);
  win(g, w * 0.25, 1.7, 0.9, 1.1, lit > 0 ? litWinMat : darkWinMat, d / 2 + 0.04, shutters);
  const side = new THREE.Group(); side.rotation.y = Math.PI / 2; g.add(side);
  win(side, 0, 1.7, 0.9, 1.1, lit > 1 ? litWinMat : darkWinMat, w / 2 + 0.04, shutters);
  // 반대쪽 옆벽과 뒷벽에도 작은 창 (불빛 없이)
  const side2 = new THREE.Group(); side2.rotation.y = -Math.PI / 2; g.add(side2);
  win(side2, rr(-d * 0.2, d * 0.2), 1.8, 0.55, 0.65, darkWinMat, w / 2 + 0.04);
  const back = new THREE.Group(); back.rotation.y = Math.PI; g.add(back);
  for (const bx of rand() < 0.5 ? [rr(-w * 0.25, w * 0.25)] : [-w * 0.25, w * 0.22]) win(back, bx, 1.8, 0.55, 0.65, darkWinMat, d / 2 + 0.04);
  if (chimney) {
    const c = crooked(woodBox(0.6, rise + 1.6, 0.6, 0x5a4a44, 0.1), 0.03); c.position.set(-w * 0.3, h + rise * 0.5, -d * 0.15); g.add(c);
    const cc = woodBox(0.78, 0.16, 0.78, 0x2e2622); cc.position.set(-w * 0.3, h + rise * 0.5 + (rise + 1.6) / 2, -d * 0.15); cc.rotation.copy(c.rotation); g.add(cc);
  }
  if (porchD) porch(g, w, d, porchD, 2.5);
  else { const st = crooked(woodBox(1.3, 0.14, 0.5, 0x54402e, 0.1), 0.04); st.position.set(dx, 0.07, d / 2 + 0.3); g.add(st); }
  if (picket) fence(g, -w / 2 - 0.3, w / 2 + 0.3, d / 2 + porchD + 2.2, dx);
  if (rand() < 0.6) barrel(g, w / 2 + 0.5, -d / 2 + 0.8);
  if (rand() < 0.5) crate(g, -w / 2 - 0.55, -d / 4);
  return g;
}
// 본도로를 바라보도록 배치하되 3~10도씩 불규칙하게 돌린다. side=+1 동쪽(서쪽을 바라봄), -1 서쪽
const FRONT = 6.5;
// 충돌 영역은 건물 몸통 + 앞쪽(로컬 +z) 현관만. 뒤쪽은 벽에 딱 붙인다
// 버텍스 컬러(구운 그늘)를 쓰는 재질 짝: 같은 재질을 다른 곳(전봇대, 다리)과 함께 쓰므로 따로 복제
const vcCache = new Map();
function vcMat(m) {
  if (m.isMeshBasicMaterial) return m;
  if (!vcCache.has(m)) {
    const c = m.clone(); c.vertexColors = true; c.defines = { AO_BAKED: '' }; c.onBeforeCompile = m.onBeforeCompile;
    if (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
    vcCache.set(m, c);
  }
  return vcCache.get(m);
}
function place(g0, x, z, rotY, w, d, extra = 0, porchD = 0) {
  // 몸통 = 가장 큰 상자. 이웃 건물 벽·바닥 틈의 그늘을 구울 때 이 상자가 가린다 (쪼개기 전에 찾아 둔다)
  let body = null;
  g0.updateMatrixWorld(true);
  for (const o of g0.children) if (o.isMesh && o.geometry.type === 'BoxGeometry') {
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(_v3), vol = sz.x * sz.y * sz.z;
    if (!body || vol > body.vol) body = { b, vol };
  }
  // 포탄·조준선 충돌 판정용 저해상도 복사본: AO 때문에 잘게 쪼갠 모델(살롱은 삼각형 6만여 개)에 광선을 쏘면
  // 판정 한 번에 몇 ms씩 걸려 조준선이 건물을 스칠 때 프레임이 크게 끊긴다. 쪼개기 전 모양을 같은 기울기로 따로 굽는다
  const lean = leaner(), rayG0 = g0.clone();
  bakeAO(g0, 1.8, 0.85, 0.5);   // 처마 밑, 현관 지붕 밑, 벽 밑동, 통·상자 뒤가 어둑하게
  const g = bake(g0, lean, ['color']), ray = bake(rayG0, lean);
  g.children.forEach((o) => { if (o.isMesh) o.material = vcMat(o.material); });
  rotY += (rand() < 0.5 ? -1 : 1) * rr(3, 10) * Math.PI / 180;
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rotY; scene.add(g);
  g.updateMatrixWorld(true);
  ray.position.copy(g.position); ray.rotation.copy(g.rotation); ray.updateMatrixWorld(true);   // 씬에는 넣지 않는다
  const box = new THREE.Box3().setFromObject(g), c = Math.cos(rotY), s = Math.sin(rotY), off = porchD / 2;
  footprints.push({ x: x + s * off, z: z + c * off, hx: w / 2 + extra, hz: d / 2 + off + extra, c, s, y0: g.position.y, top: box.max.y, box, group: g, ray,
    aoBox: body && { b: body.b, inv: g.matrixWorld.clone().invert() } });
}
function street(g, side, z, w, d, porchD = 0) {
  const x = side * (FRONT + d / 2);
  place(g, x, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, w, d, 0.3, porchD);
}
street(makeHouse({ w: 6, d: 7, color: 0x7a5a3c, chimney: true, shutters: 0x3c4a34 }), 1, -15, 6, 7);
await loadStep(0.25);
street(makeSheriff(), 1, -6.5, 7.5, 8, 2);
await loadStep(0.28);
street(makeSaloon(), 1, 4, 11, 10, 2);
await loadStep(0.31);
street(makeHouse({ w: 6, d: 7, color: 0x8e8270, ridgeZ: true, lit: 2, porchD: 1.6 }), 1, 14, 6, 7, 1.6);
await loadStep(0.34);
street(makeHouse({ w: 6.5, d: 7, color: 0x6e5440, ridgeZ: true, porchD: 1.6, shutters: 0x5a2a20 }), -1, -13, 6.5, 7, 1.6);
await loadStep(0.37);
street(makeHouse({ w: 5.5, d: 6, color: 0x9a7a58, lit: 0 }), -1, -6, 5.5, 6);
await loadStep(0.40);
street(makeHouse({ w: 6, d: 7, color: 0x7a3e2c, chimney: true, lit: 2, shutters: 0x2c3a40 }), -1, 7.5, 6, 7);
await loadStep(0.43);
street(makeHouse({ w: 6, d: 6.5, color: 0x8a7a64, ridgeZ: true }), -1, 14.5, 6, 6.5);
await loadStep(0.46);
place(makeHouse({ w: 6, d: 6, color: 0x6a5a48, chimney: true, shutters: 0x3c4a34 }), -18, 11.6, Math.PI, 6, 6, 0.3);   // 서쪽 갈림길에서 물러나 도로를 침범하지 않게
await loadStep(0.49);
place(makeHouse({ w: 5.5, d: 6, color: 0x84684a, ridgeZ: true, lit: 2 }), -20, -7.5, 0, 5.5, 6, 0.3);
await loadStep(0.52);
// 마을 전체 AO: 건물을 다 세운 뒤, 서로의 몸통 상자가 가리는 만큼 (1) 마주 보는 벽을 (2) 그 사이 바닥을 어둡게
{
  const t0 = performance.now(), MAXD = 3.2, K = 0.9;
  const blds = footprints.filter(f => f.aoBox);
  for (const f of blds) { f.aoBox.wb = f.aoBox.b.clone().applyMatrix4(f.group.matrixWorld).expandByScalar(MAXD); f.aoBox.occ = aoOccluder(f.aoBox.b, f.aoBox.inv); }
  const _bu0 = new THREE.Vector3(0, 1, 0), near = [];
  // o(월드)에서 법선 n 쪽 반구로 쏜 광선이 다른 건물 몸통에 가까이 막히는 정도 (0~1)
  const occl = (o, n, self) => {
    near.length = 0;
    for (const f of blds) if (f !== self && f.aoBox.wb.containsPoint(o)) near.push(f.aoBox.occ);
    return near.length ? aoTrace(o.x, o.y, o.z, n, near, MAXD, null) : 0;
  };
  // 캐시: 건물 정점 색(벽 그늘을 곱한 뒤) + 바닥 그늘을 한 덩어리로
  const cms = []; for (const f of blds) for (const m of f.group.children) if (m.isMesh && m.geometry.attributes.color) cms.push(m);
  const total = cms.reduce((s, m) => s + m.geometry.attributes.position.count, 0) + GN * GN;
  const res = aoChunk(total, () => {
    // (1) 벽: 이미 구운 정점 색에 곱한다
    const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const f of blds) for (const m of f.group.children) {
      const nbr = blds.filter(f2 => f2 !== f).map(f2 => f2.aoBox.wb);
      if (!m.isMesh || !m.geometry.attributes.color) continue;
      m.updateMatrixWorld(true); nm.getNormalMatrix(m.matrixWorld);
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, col = m.geometry.attributes.color, cache = new Map();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (!nbr.some(b => b.containsPoint(p))) continue;   // 이웃 건물에서 먼 정점은 건너뛴다
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        const key = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}|${n.x.toFixed(1)},${n.y.toFixed(1)},${n.z.toFixed(1)}`;
        let k = cache.get(key);
        if (k === undefined) { k = 1 - K * occl(p.addScaledVector(n, 0.03), n, f); cache.set(key, k); }
        if (k < 1) { const v = Math.max(0.28, col.getX(i) * k); col.setXYZ(i, v, v, v); }
      }
      col.needsUpdate = true;
    }
    // (2) 바닥: 0.5m 칸마다 위쪽 반구
    const bb = new THREE.Box3();
    for (const f of blds) bb.union(f.aoBox.wb);
    for (let iz = 0; iz < GN; iz++) for (let ix = 0; ix < GN; ix++) {
      const x = -HALF + (ix + 0.5) * HALF * 2 / GN, z = -HALF + (iz + 0.5) * HALF * 2 / GN;
      if (x < bb.min.x || x > bb.max.x || z < bb.min.z || z > bb.max.z) continue;
      p.set(x, heightAt(x, z) + 0.05, z);
      const a = occl(p, _bu0, null);
      if (a > 0) gapData[iz * GN + ix] = Math.round(255 * Math.max(0.28, 1 - K * a));
    }
    const out = new Uint8Array(total); let j = 0;
    for (const m of cms) { const c = m.geometry.attributes.color; for (let i = 0; i < c.count; i++) out[j++] = Math.round(c.getX(i) * 255); }
    out.set(gapData, j);
    return out;
  });
  let j = 0;
  for (const m of cms) { const c = m.geometry.attributes.color; for (let i = 0; i < c.count; i++) { const v = res[j++] / 255; c.setXYZ(i, v, v, v); } c.needsUpdate = true; }
  gapData.set(res.subarray(j));
  gapTex.needsUpdate = true;
  aoMs += performance.now() - t0;
}

await loadStep(0.6, 'BUILDING THE TOWN...');
// ---------------------------------------------------------------- 풍차, 급수탑 (T자 교차로 강 쪽 모서리 건물들 뒤)
const _bu = new THREE.Vector3(0, 1, 0), _bd0 = new THREE.Vector3();
// a→b를 잇는 각목
function beam(g, a, b, t, color, slant = 0.06) {
  const m = woodBox(t, a.distanceTo(b), t, color, slant);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_bu, _bd0.copy(b).sub(a).normalize());
  g.add(m); return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 사각 격자탑: 네 기둥이 위로 갈수록 좁아지고, 층마다 띠장 + X자 가새
function lattice(g, h, b0, b1, levels, t, color) {
  const half = (y) => lerp(b0, b1, y / h);
  const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of cs) beam(g, V(sx * b0, -0.4, sz * b0), V(sx * b1, h, sz * b1), t, color);
  for (let i = 0; i < levels.length; i++) {
    const y = levels[i], hy = half(y), py = i ? levels[i - 1] : 0.3, hp = half(py);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
      beam(g, V(ax * hy, y, az * hy), V(bx * hy, y, bz * hy), t * 0.6, color);
      beam(g, V(ax * hp, py, az * hp), V(bx * hy, y, bz * hy), t * 0.45, color);
      beam(g, V(bx * hp, py, bz * hp), V(ax * hy, y, az * hy), t * 0.45, color);
    }
  }
}
const MILL_H = 17, metalMat = lambert({ color: 0x8e8e86, side: THREE.DoubleSide }), darkMetal = lambert({ color: 0x3e3c38 });
let millHead, millRotor, millYaw = 0, millSpin = 0;
{
  const x = -18.5, z = 20.5, g = new THREE.Group();
  lattice(g, MILL_H, 1.7, 0.42, [3.2, 6.6, 10, 13.4, MILL_H - 0.3], 0.2, 0x6e6252);
  const deck = woodBox(1.9, 0.12, 1.9, 0x54483a); deck.position.y = MILL_H - 0.25; g.add(deck);
  // 사다리
  for (const s of [-0.22, 0.22]) beam(g, V(s, 0, 1.75), V(s, MILL_H - 0.3, 0.47), 0.06, 0x4e4234);
  for (let y = 0.4; y < MILL_H - 0.5; y += 0.45) { const t = y / MILL_H; beam(g, V(-0.22, y, lerp(1.75, 0.47, t)), V(0.22, y, lerp(1.75, 0.47, t)), 0.04, 0x4e4234); }
  // 펌프 막대 + 땅의 우물 상자
  beam(g, V(0, 0.2, 0), V(0, MILL_H, 0), 0.05, 0x3a3630);
  const well = woodBox(1.1, 0.6, 1.1, 0x5a4a3a); well.position.y = 0.3; g.add(well);
  const tg = bake(g);   // 꼭대기에 돌아가는 머리가 얹히니 기울이지 않는다
  const y = Math.min(...[[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].map(([a, b]) => heightAt(x + a, z + b)));
  tg.position.set(x, y, z); scene.add(tg);
  // 머리: 바람 쪽을 바라보는 날개바퀴 + 뒤로 뻗은 꼬리 날개. 바람 방향을 따라 돌고, 바람 세기만큼 날개가 돈다
  const hg = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.0), darkMetal); hg.add(box);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), darkMetal); shaft.rotation.x = Math.PI / 2; shaft.position.z = 1.2; hg.add(shaft);
  beam(hg, V(0, 0, -0.4), V(0, 0.2, -4.2), 0.09, 0x3e3c38).material = darkMetal;
  const vane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), metalMat); vane.rotation.y = Math.PI / 2; vane.position.set(0, 0.3, -4.4); hg.add(vane);
  const head = bake(hg);
  const rg = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 8), darkMetal); hub.rotation.x = Math.PI / 2; rg.add(hub);
  const NB = 18, R0 = 0.8, R1 = 3.45;   // 날개 지름 6.9m
  for (let i = 0; i < NB; i++) {
    const bl = new THREE.Group(); bl.rotation.z = i / NB * Math.PI * 2; rg.add(bl);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, R1 - R0, 0.05), metalMat); b.position.y = (R0 + R1) / 2; b.rotation.y = 0.45; bl.add(b);
  }
  for (const r of [1.85, 3.3]) rg.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 28), darkMetal));
  millRotor = bake(rg); millRotor.position.z = 2.0;   // 기둥에서 떨어뜨림
  head.add(millRotor);
  millHead = head; head.position.set(0, MILL_H + 0.35, 0); tg.add(head);
  footprints.push({ x, z, hx: 1.8, hz: 1.8, c: 1, s: 0, y0: y, top: y + MILL_H + 3, box: new THREE.Box3().setFromObject(tg), group: tg, metal: true,
    solid: { y0: y - 0.4, h: MILL_H + 0.4, b0: 1.7, b1: 0.42 } });   // 격자탑은 포탄 판정만 바깥면이 막힌 사각뿔로
}
// 급수탑: 굵은 나무 기둥 위에 높이≈지름인 통나무 물탱크. 꼭대기는 풍차 날개 아래쪽보다 낮게
{
  const x = -11.8, z = 22.5, g = new THREE.Group(), LEG = 7.6, R = 2.0, TH = 3.9;   // 꼭대기 약 13m < 풍차 날개 아래 약 13.9m
  lattice(g, LEG, 1.65, 1.4, [3.0, 6.0, LEG - 0.2], 0.3, 0x584636);
  const deck = woodBox(4.3, 0.22, 4.3, 0x4e3e30); deck.position.y = LEG + 0.05; g.add(deck);
  // 세로 널(통판): 판자 무늬가 세로로 서도록 UV를 돌린다
  const cyl = new THREE.CylinderGeometry(R, R * 1.03, TH, 16, 1, true), uv = cyl.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * TH / 3, uv.getX(i) * 2 * Math.PI * R / 3);
  const tank = new THREE.Mesh(cyl, woodMat(0x7a6048)); tank.position.y = LEG + 0.16 + TH / 2; g.add(tank);
  const lidG = new THREE.CircleGeometry(R, 16); lidG.rotateX(-Math.PI / 2);
  const lid = new THREE.Mesh(lidG, woodMat(0x5a4636)); lid.position.y = LEG + 0.16 + TH - 0.05; g.add(lid);
  for (let k = 0; k < 4; k++) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.035 + 0.02, R * 1.035 + 0.02, 0.09, 16, 1, true), ironMat);
    hoop.position.y = LEG + 0.5 + k * (TH - 0.7) / 3; g.add(hoop);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 0.3, 1.25, 16, 1, true), roofMat(0x4a3e34)); roof.position.y = LEG + 0.16 + TH + 0.6; g.add(roof);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), ironMat); cap.position.y = LEG + 0.16 + TH + 1.25; g.add(cap);
  // 물 내리는 주둥이 + 사다리
  beam(g, V(R * 0.95, LEG + 0.6, 0), V(R + 1.4, LEG - 1.3, 0), 0.22, 0x3a3630).material = ironMat;
  for (const s of [-0.25, 0.25]) beam(g, V(s, 0, -1.9), V(s, LEG + TH, -R - 0.08), 0.07, 0x4e4234);
  for (let y = 0.4; y < LEG + TH - 0.3; y += 0.45) { const t = y / (LEG + TH); beam(g, V(-0.25, y, lerp(-1.9, -R - 0.08, t)), V(0.25, y, lerp(-1.9, -R - 0.08, t)), 0.045, 0x4e4234); }
  const tg = bake(g, leaner());
  const y = Math.min(...[[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]].map(([a, b]) => heightAt(x + a, z + b)));
  const rot = rr(-0.3, 0.3);
  tg.position.set(x, y, z); tg.rotation.y = rot; scene.add(tg); tg.updateMatrixWorld(true);
  footprints.push({ x, z, hx: 1.9, hz: 1.9, c: Math.cos(rot), s: Math.sin(rot), y0: y, top: y + LEG + TH + 2, box: new THREE.Box3().setFromObject(tg), group: tg, metal: true,
    solid: { y0: y - 0.4, h: LEG + 0.4, b0: 1.65, b1: 1.4 } });
}
function updateWindmill(dt) {
  const wd = U.uWindDir.value;
  let d = Math.atan2(-wd.x, -wd.y) - millYaw;   // 날개바퀴(로컬 +z)는 바람이 불어오는 쪽으로
  d = Math.atan2(Math.sin(d), Math.cos(d));
  millYaw += d * Math.min(1, dt * 1.5);
  millHead.rotation.y = millYaw;
  millSpin += (U.uWind.value * 2.4 - millSpin) * Math.min(1, dt * 0.8);   // 바람 세기를 천천히 따라간다
  millRotor.rotation.z -= millSpin * dt;
}

// ---------------------------------------------------------------- 나무 다리
{
  const g = new THREE.Group(), { hl, hw } = BRIDGE;
  const deckAt = deckProfile;
  for (let u = -hl + 0.15; u < hl; u += 0.31) {
    const p = woodBox(2 * hw + rr(-0.2, 0.15), 0.12, 0.27, [0x6a5038, 0x5e4630, 0x74583c][Math.floor(rand() * 3)], 0.1);
    p.position.set(rr(-0.08, 0.08), deckAt(u) - 0.06 + rr(-0.015, 0.015), u);
    p.rotation.x = -Math.atan2(deckAt(u + 0.05) - deckAt(u - 0.05), 0.1);
    crooked(p, 0.02); g.add(p);
  }
  // 받침보: 경사-평지-경사 세 토막이 상판을 따라간다
  const flat = hl * 0.38, knots = [-hl + 0.3, -flat, flat, hl - 0.3];
  for (const x of [-2.8, -0.95, 0.95, 2.8]) for (let k = 0; k < 3; k++) {
    const u0 = knots[k], u1 = knots[k + 1], y0 = deckAt(u0) - 0.28, y1 = deckAt(u1) - 0.28;
    const b = woodBox(0.26, 0.3, Math.hypot(u1 - u0, y1 - y0) + 0.1, 0x3e2e20);
    b.position.set(x, (y0 + y1) / 2, (u0 + u1) / 2); b.rotation.x = -Math.atan2(y1 - y0, u1 - u0); g.add(b);
  }
  // 물속 말뚝 + 가새
  for (const u of [-hl * 0.6, 0, hl * 0.6]) for (const x of [-2.8, 2.8]) {
    const wx = BRIDGE.x + x * BRIDGE.c + u * BRIDGE.s, wz = BRIDGE.z - x * BRIDGE.s + u * BRIDGE.c;
    const top = deckAt(u), bot = heightAt(wx, wz) - 0.4, len = top - 0.4 - bot;
    if (len < 0.3) continue;
    const p = crooked(woodBox(0.26, len, 0.26, 0x34281c), 0.03); p.position.set(x, bot + len / 2, u); g.add(p);
    if (x > 0 && len > 1) { const br = woodBox(5.8, 0.12, 0.1, 0x3a2c20); br.position.set(0, top - 0.9, u); br.rotation.z = rr(0.2, 0.3) * (rand() < 0.5 ? 1 : -1); g.add(br); }
  }
  const bg = bake(g);
  bg.position.set(BRIDGE.x, 0, BRIDGE.z); bg.rotation.y = BRIDGE.ang; scene.add(bg);
  bg.traverse((o) => { o.userData.noOutline = true; });   // 다리는 외곽선 없음 (가는 난간·판자가 지저분해진다)
}

// ---------------------------------------------------------------- 전봇대, 전깃줄, 가로등
const poleMat = woodMat(0x5a4532), insMat = lambert({ color: 0x6a8a7a }), shadeMat = lambert({ color: 0x2c3830, side: THREE.DoubleSide });
const poleGroup = new THREE.Group();
scene.add(poleGroup);
function polesAlong(poly, start, spacing, skip) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z));
  const at = (s) => {   // 도로 위 s(m) 지점
    s = Math.max(0, Math.min(cum[cum.length - 1], s));
    let i = 1; while (i < poly.length - 1 && cum[i] < s) i++;
    const a = poly[i - 1], b = poly[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
  };
  const out = [];
  for (let s = start; s < cum[cum.length - 1]; s += spacing + rr(-1.5, 1.5)) {
    // 도로 방향은 앞뒤 4m씩 떨어진 두 점으로 (짧게 꺾인 마디에 걸려 전봇대가 옆으로 돌아가지 않게)
    const p = at(s), p0 = at(s - 4), p1 = at(s + 4);
    const l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, tx = (p1.x - p0.x) / l, tz = (p1.z - p0.z) / l;
    const nx = tz, nz = -tx;   // 진행 방향 오른쪽
    const x = p.x + nx * 3.2, z = p.z + nz * 3.2;
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2 || inFootprint(x, z, 0.5) || (skip && skip(x, z))) continue;
    if (creekD[gridIndex(x, z)] < CREEK_HW + 3) continue;
    out.push(makePole(x, z, nx, nz));
  }
  return out;
}
const _tiltQ = new THREE.Quaternion(), _axis = new THREE.Vector3();
let poleCount = 0;
function makePole(x, z, nx, nz) {
  const g = new THREE.Group(), idx = poleCount++;
  g.position.set(x, heightAt(x, z), z);
  // 굵은 나무 기둥이 제각각 2~5도 삐딱하게
  const ta = rr(0.035, 0.09), td = rand() * Math.PI * 2;
  g.quaternion.setFromAxisAngle(_axis.set(0, 1, 0), Math.atan2(nx, nz))   // 로컬 +z = 도로 반대쪽
    .premultiply(_tiltQ.setFromAxisAngle(_axis.set(Math.cos(td), 0, Math.sin(td)), ta));
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 10.6, 7), poleMat); post.position.y = 4; g.add(post);
  const armTilt = rr(-0.05, 0.05);
  const arm = woodBox(0.18, 0.18, 2.0, 0x4e3a28); arm.position.y = 8.75; arm.rotation.x = armTilt; g.add(arm);
  const endY = (s) => 8.88 - s * 0.85 * Math.sin(armTilt);
  for (const s of [-1, 1]) { const ins = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), insMat); ins.position.set(0, endY(s), s * 0.85); g.add(ins); }
  const lampArm = crooked(woodBox(0.09, 0.09, 1.6, 0x3a2c20), 0.03); lampArm.position.set(0, 5.3, -0.95); g.add(lampArm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 6, 1, true), shadeMat);
  shade.position.set(0, 5.2, -1.65); g.add(shade);
  const lamp = addLamp(g, 0, 5.02, -1.65);
  lamp.glow.userData.pole = lamp.light.userData.pole = idx;
  g.userData.lamp = lamp;
  // 정점마다 어느 전봇대인지 표시: 합친 뒤에도 셰이더가 전봇대별로 흔든다
  g.traverse((o) => { if (o.isMesh) o.geometry.setAttribute('aPole', new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count).fill(idx), 1)); });
  poleGroup.add(g);
  g.updateMatrixWorld(true);
  g.userData.ends = [-1, 1].map(s => g.localToWorld(new THREE.Vector3(0, endY(s) + 0.07, s * 0.85)));
  g.userData.base = g.position.clone();
  g.userData.idx = idx;
  return g;
}
const nearBridge = (x, z) => Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < BRIDGE.hl + 3;
const mainPoles = polesAlong(mainPoly, 6, 15, (x, z) => distPoly(branchPoly, x, z) < 4 || nearBridge(x, z));
const branchPoles = polesAlong(branchPoly, 8, 15);
// 줄의 끝 전봇대 너머로 보드 안에 자리가 남으면 전봇대를 더 세운다 (보드 안에서 전선이 허공에 걸려 보이지 않게)
function extendPoles(list, atStart) {
  for (let k = 0; k < 4 && list.length > 1; k++) {
    const end = atStart ? list[0] : list.at(-1), prev = atStart ? list[1] : list.at(-2);
    const d = end.position.clone().sub(prev.position); d.y = 0; d.normalize();
    const x = end.position.x + d.x * 15, z = end.position.z + d.z * 15;
    if (Math.abs(x) > HALF - 1.5 || Math.abs(z) > HALF - 1.5 || inFootprint(x, z, 0.5) || creekD[gridIndex(x, z)] < CREEK_HW + 3) break;
    const p = atStart ? makePole(x, z, -d.z, d.x) : makePole(x, z, d.z, -d.x);
    if (atStart) list.unshift(p); else list.push(p);
  }
}
extendPoles(mainPoles, true); extendPoles(mainPoles, false); extendPoles(branchPoles, false);
// 가로대 방향 바로잡기: 앞뒤 전봇대를 잇는 방향과 40도 넘게 어긋난 전봇대(도로가 짧게 꺾인 곳)는 그 방향에 맞게 세로축으로 돌린다 (전깃줄이 꼬이지 않게)
for (const list of [mainPoles, branchPoles]) list.forEach((g, i) => {
  if (list.length < 2) return;
  const a = list[Math.max(0, i - 1)].position, b = list[Math.min(list.length - 1, i + 1)].position;
  const want = Math.atan2(b.z - a.z, -(b.x - a.x));   // 진행 방향 오른쪽 = 로컬 +z
  _axis.set(0, 0, 1).applyQuaternion(g.quaternion);
  const d = Math.atan2(Math.sin(want - Math.atan2(_axis.x, _axis.z)), Math.cos(want - Math.atan2(_axis.x, _axis.z)));
  if (Math.abs(d) < 40 * DEG) return;
  const local = g.userData.ends.map(e => g.worldToLocal(e.clone()));
  g.quaternion.premultiply(_tiltQ.setFromAxisAngle(_axis.set(0, 1, 0), d));
  g.updateMatrixWorld(true);
  g.userData.ends = local.map(l => g.localToWorld(l));
});
// 전봇대 번호(만든 순서) = allPoles 순서 = 셰이더 배열 순서
const allPoles = [...mainPoles, ...branchPoles].sort((a, b) => a.userData.idx - b.userData.idx).map(p => p.userData.base);
// 고장 나서 깜빡이는 가로등 두 개
for (const p of [mainPoles[Math.floor(mainPoles.length * 0.3)], branchPoles[Math.floor(branchPoles.length * 0.6)]]) {
  if (!p) continue;
  const l = p.userData.lamp;
  l.flicker = true; l.phase = rand() * 100; l.glow.material = glowMat.clone();
}
// 전봇대 흔들림: 뿌리를 축으로 위쪽이 부딪힌 방향으로 크게 휘청였다가 스프링처럼 돌아온다
const NP = poleCount;
const poleTilt = new Float32Array(NP * 2), poleVel = new Float32Array(NP * 2), poleHit = new Float32Array(NP).fill(-10);   // 마지막으로 탱크에 닿은 시각
const uPB = { value: allPoles.map(p => new THREE.Vector4(p.x, p.y, p.z, 0)) };
const uPT = { value: allPoles.map(() => new THREE.Vector4()) };   // 회전축 x, z, 각도
let polesMoving = false;
function kickPole(i, dx, dz, s) {
  const l = Math.hypot(dx, dz) || 1;
  poleVel[i * 2] += dx / l * s; poleVel[i * 2 + 1] += dz / l * s;
  polesMoving = true;
}
// 전봇대 i의 기울기만큼 점 v0를 뿌리 기준으로 돌린다
const _pk = new THREE.Vector3(), _pr = new THREE.Vector3();
function poleXform(i, v0, out) {
  const tx = poleTilt[i * 2], tz = poleTilt[i * 2 + 1], a = Math.hypot(tx, tz);
  if (a < 1e-5) return out.copy(v0);
  _pk.set(tz / a, 0, -tx / a);   // 축 × 위쪽 = 기울어지는 방향
  return out.copy(v0).sub(allPoles[i]).applyAxisAngle(_pk, a).add(allPoles[i]);
}
// 전선: 구간마다 처짐 + 흔들림. 전봇대에 탱크가 부딪히거나 근처에서 터지면 출렁이다 잦아든다
const WIRE_SEG = 16, wireSpans = [];
function wire(a, b, pa, pb) {
  // 보드 밖으로 나가는 구간은 경계까지만 그린다 (xz 직선이 경계와 만나는 비율)
  let tEnd = 1;
  for (const [qa, qb] of [[a.x, b.x], [a.z, b.z]]) {
    if (Math.abs(qb) > HALF) tEnd = Math.min(tEnd, (Math.sign(qb) * HALF - qa) / (qb - qa));
  }
  const len = a.distanceTo(b), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  const sag = 0.9 + Math.min(len, 18) * 0.045;   // 축 늘어진 줄: 흔들림이 잘 보이게
  // 처진 줄을 진자로 보면 흔들림 주기는 처짐 깊이로 정해진다 (느릿하게 출렁)
  wireSpans.push({ a: a.clone(), b: b.clone(), a0: a, b0: b, pa, pb, poles: [pa, pb].filter(i => i >= 0), tEnd, sag,
    side: new THREE.Vector3(-dz / l, 0, dx / l), amp: 0, ph: rand() * 6.28, w: Math.sqrt(9.8 / (sag * 1.6 + 0.4)) });
}
function linkPoles(p, q) {
  const [a0, a1] = p.userData.ends, [b0, b1] = q.userData.ends, i = p.userData.idx, j = q.userData.idx;
  // 교차하지 않도록 가까운 끝끼리 연결
  if (a0.distanceTo(b0) + a1.distanceTo(b1) <= a0.distanceTo(b1) + a1.distanceTo(b0)) { wire(a0, b0, i, j); wire(a1, b1, i, j); }
  else { wire(a0, b1, i, j); wire(a1, b0, i, j); }
}
// 끝 전봇대에서 바깥으로 보이지 않는 전봇대를 15m마다 이어 가다가 보드 경계에서 끊긴다
function wireToEdge(end, prev) {
  const d = end.position.clone().sub(prev.position); d.y = 0; d.normalize();
  for (const e of end.userData.ends) {
    let cur = e, first = true;
    for (let k = 0; k < 12; k++) {
      const nxt = cur.clone().addScaledVector(d, 15);
      wire(cur, nxt, first ? end.userData.idx : -1, -1);
      first = false; cur = nxt;
      if (Math.abs(nxt.x) > HALF || Math.abs(nxt.z) > HALF) break;
    }
  }
}
for (const list of [mainPoles, branchPoles])
  for (let i = 1; i < list.length; i++) if (list[i].position.distanceTo(list[i - 1].position) < 50) linkPoles(list[i - 1], list[i]);   // 시냇물 위로도 이어진다
if (branchPoles.length) {
  const first = branchPoles[0];
  const near = mainPoles.reduce((m, p) => p.position.distanceTo(first.position) < m.position.distanceTo(first.position) ? p : m);
  linkPoles(near, first);
}
if (mainPoles.length > 1) { wireToEdge(mainPoles[0], mainPoles[1]); wireToEdge(mainPoles.at(-1), mainPoles.at(-2)); }
if (branchPoles.length > 1) wireToEdge(branchPoles.at(-1), branchPoles.at(-2));
const wireGeo = new THREE.BufferGeometry();
wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wireSpans.length * WIRE_SEG * 6), 3).setUsage(THREE.DynamicDrawUsage));
const wireLines = new THREE.LineSegments(wireGeo, ps1(new THREE.LineBasicMaterial({ color: 0x1a1612 })));
wireLines.frustumCulled = false;
scene.add(wireLines);
const _wq = new THREE.Vector3();
function writeWires() {
  const arr = wireGeo.attributes.position.array, T = U.uTime.value;
  let o = 0;
  for (const sp of wireSpans) {
    // 늘어진 곡선이 양 끝을 잇는 축을 중심으로 그네처럼 돌고, 출렁일 때 처짐도 조금 늘었다 줄었다 한다
    const th = sp.amp * Math.sin(T * sp.w + sp.ph);
    const drop = sp.sag * (1 + sp.amp * 0.35 * Math.sin(T * sp.w * 2 + sp.ph));
    const cy = Math.cos(th), sx = Math.sin(th);
    for (let i = 0; i < WIRE_SEG; i++) for (const k of [i, i + 1]) {
      const t = sp.tEnd * k / WIRE_SEG, bell = 4 * t * (1 - t);
      _wq.lerpVectors(sp.a, sp.b, t);
      _wq.y -= drop * bell * cy;
      _wq.addScaledVector(sp.side, drop * bell * sx);
      arr[o++] = _wq.x; arr[o++] = _wq.y; arr[o++] = _wq.z;
    }
  }
  wireGeo.attributes.position.needsUpdate = true;
}
writeWires();
let wiresMoving = false;
function shakePoleWires(idx, s) {
  for (const sp of wireSpans) if (sp.poles.includes(idx) && sp.amp < s) { sp.amp = s; wiresMoving = true; }
}
const _wa = new THREE.Vector3();
function shakeWiresNear(p, r, s) {
  for (const sp of wireSpans) {
    _wa.lerpVectors(sp.a, sp.b, sp.tEnd * 0.5);
    const d = _wa.distanceTo(p);
    const k = s * (1 - (d / r) ** 2);
    if (d < r && sp.amp < k) { sp.amp = k; wiresMoving = true; }
  }
  // 전봇대도 폭발 반대쪽으로 휘청
  allPoles.forEach((pp, i) => {
    const dx = pp.x - p.x, dz = pp.z - p.z, d = Math.hypot(dx, dz);
    if (d < r) kickPole(i, dx, dz, s * 0.6 * (1 - d / r) ** 2);
  });
}
const lampObjs = [];   // 전봇대에 달린 불빛(스프라이트·광원)도 같이 흔든다
function updatePoles(dt) {
  if (!polesMoving) return;
  let any = false;
  for (let i = 0; i < NP; i++) {
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      poleVel[j] += (-32 * poleTilt[j] - 1.3 * poleVel[j]) * dt;
      poleTilt[j] = Math.max(-0.2, Math.min(0.2, poleTilt[j] + poleVel[j] * dt));
      if (Math.abs(poleTilt[j]) > 1e-4 || Math.abs(poleVel[j]) > 1e-3) any = true;
      else poleTilt[j] = poleVel[j] = 0;
    }
    const tx = poleTilt[i * 2], tz = poleTilt[i * 2 + 1], a = Math.hypot(tx, tz);
    uPT.value[i].set(a > 1e-5 ? tz / a : 0, a > 1e-5 ? -tx / a : 0, a, 0);
  }
  for (const o of lampObjs) poleXform(o.pole, o.p0, o.obj.position);
  for (const sp of wireSpans) {
    if (sp.pa >= 0) poleXform(sp.pa, sp.a0, sp.a);
    if (sp.pb >= 0) poleXform(sp.pb, sp.b0, sp.b);
  }
  writeWires();
  polesMoving = any;
}
function updateWires(dt) {
  updatePoles(dt);
  if (!wiresMoving) return;
  let any = false;
  for (const sp of wireSpans) { sp.amp *= Math.exp(-dt * 0.45); if (sp.amp < 0.003) sp.amp = 0; else any = true; }
  writeWires();
  wiresMoving = any;
}
// 전봇대 전부를 머티리얼별 메시 몇 개로 합치고, 정점 셰이더에서 전봇대별 기울기로 돌린다
scene.remove(poleGroup);
{
  const pg = bake(poleGroup, null, ['aPole']);
  const SWAY = `
    attribute float aPole; uniform vec4 uPB[${NP}], uPT[${NP}];
    vec3 poleRot(vec3 v, vec4 t) { vec3 k = vec3(t.x, 0.0, t.y); float c = cos(t.z), s = sin(t.z); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
  `;
  pg.children.forEach((m) => {
    if (!m.isMesh) return;
    const src = m.material, mat = src.clone(), base = src.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      base.call(mat, sh);
      sh.uniforms.uPB = uPB; sh.uniforms.uPT = uPT;
      sh.vertexShader = SWAY + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = poleRot(objectNormal, uPT[int(aPole + 0.5)]);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 pB = uPB[int(aPole + 0.5)].xyz; transformed = pB + poleRot(transformed - pB, uPT[int(aPole + 0.5)]);');
    };
    mat.customProgramCacheKey = () => 'pole' + src.uuid;
    m.material = mat;
    if (src !== poleMat) m.userData.noOutline = true;   // 외곽선은 굵은 기둥에만 (가로대·애자·가로등 팔·갓은 전깃줄 쪽이 지저분해진다)
  });
  pg.traverse((o) => { if (o.userData.pole !== undefined) lampObjs.push({ obj: o, pole: o.userData.pole, p0: o.position.clone() }); });
  scene.add(pg);
}

await loadStep(0.66, 'ASSEMBLING TANKS...');
