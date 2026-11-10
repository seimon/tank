// ---------------------------------------------------------------- 소리 (WebAudio로 즉석 합성: 파일 없음)
// 밀리터리 느낌: 걸러낸 잡음 + 낮은 사인파 쿵 + 긴 잔향(합성한 공간 울림). 전자음 같은 사각파는 줍기 소리에만.
// 브라우저는 사용자가 한 번 누르거나 클릭해야 소리를 낼 수 있어서 첫 입력 때 켠다.
// 멀리서 난 소리는 작고 먹먹하게 (듣는 위치 = 카메라가 바라보는 곳, 보통 내 탱크)
const sfx = (() => {
  // out = 전체 음량 → 압축기. master = 게임 소리 묶음 (가운데 창이 뜨면 끈다). UI 소리는 out으로 바로
  let paused0 = false;   // 창이 포커스를 잃어 멈췄는가 (sfx.pause)
  let ctx = null, out = null, master = null, verb = null, noiseBuf = null, eng = null, vol = 0.5, amb = null, gameOn = true, siren = null, sirenWant = 0;
  const SIREN_VOL = 0.07 * 0.8 * 0.5;   // 경보 크기 (사각파가 삼각파보다 커서 반으로 맞춘 뒤 80%)
  const ambWant = [0, 0, 0];   // 빗소리 · 바람 · 모래바람 (소리가 켜지기 전에 정해진 값도 기억)
  const srr = (a, b) => a + (b - a) * Math.random();   // 소리용 난수 (게임 배치 난수와 섞이지 않게)
  const init = () => {
    if (ctx) { if (ctx.state !== 'running' && ctx.state !== 'closed' && !paused0) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // 큰 소리끼리 겹쳐도 찢어지지 않게 압축기 → 출력
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    out = ctx.createGain(); out.gain.value = vol; out.connect(comp); comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = gameOn ? 1 : 0; master.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 잔향: 2.8초 동안 사그라드는 잡음을 공간 울림으로 (먼 산·건물에 부딪혀 돌아오는 느낌)
    const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); for (let i = 0; i < len; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb = ctx.createConvolver(); verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.55; verb.connect(vg); vg.connect(master);
    // 엔진: 디젤 — 낮은 톱니파 두 개를 점화 박자로 떨리게(진폭 변조) + 저역 통과. 궤도 철컥임은 잡음을 속도 박자로 끊어서
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 32; o2.frequency.value = 32.7;
    const am = ctx.createGain(); am.gain.value = 0.6;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.type = 'square'; lfo.frequency.value = 16; lfoG.gain.value = 0.4;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    o1.connect(am); o2.connect(am); am.connect(lp); lp.connect(g); g.connect(master);
    const tn = ctx.createBufferSource(); tn.buffer = noiseBuf; tn.loop = true;
    const tb = ctx.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 900; tb.Q.value = 1.2;
    const tg = ctx.createGain(); tg.gain.value = 0;
    const tlfo = ctx.createOscillator(), tlfoG = ctx.createGain(); tlfo.type = 'square'; tlfo.frequency.value = 6; tlfoG.gain.value = 0;
    tlfo.connect(tlfoG); tlfoG.connect(tg.gain);
    tn.connect(tb); tb.connect(tg); tg.connect(master);
    for (const o of [o1, o2, lfo, tlfo]) o.start(); tn.start();
    eng = { o1, o2, lfo, g, lp, tg, tlfo, tlfoG };
    // 날씨 소리: 같은 잡음을 서로 다른 자리에서 틀어 걸러 낸다. 빗소리 = 높은 쏴아 + 낮은 웅웅, 바람 = 가운데 대역이 돌풍처럼 오르내림
    const loop = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(b); b.connect(g); g.connect(master); s.start(0, srr(0, 1.9));
      return { b, g };
    };
    amb = { hi: loop('highpass', 2200, 0.5), lo: loop('lowpass', 420, 0.6), wind: loop('bandpass', 360, 0.9) };
    setAmb();
    // 벙커 경보: 같은 높이의 '삐~ 삐~' (사각파를 조금 깎은 소리를 1초에 한 번, 반은 울리고 반은 쉰다). 평소엔 소리 0
    {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.7;
      const a = ctx.createOscillator(), b = ctx.createOscillator(); a.type = b.type = 'square';
      a.frequency.value = 920; b.frequency.value = 924;   // 살짝 어긋나 조금 굵게
      const gate = ctx.createGain(); gate.gain.value = 0.5;   // 0.5 ± 0.5 → 울림·쉼
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.type = 'square'; lfo.frequency.value = 1.1; lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(gate.gain);
      a.connect(gate); b.connect(gate); gate.connect(lp); lp.connect(g); g.connect(master);
      const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(verb);   // 멀리 울려 퍼지게 잔향 조금
      for (const o of [a, b, lfo]) o.start();
      siren = { g, lp }; g.gain.value = sirenWant * SIREN_VOL;   // 소리가 켜지기 전에 정해진 크기
    }
  };
  function setAmb() {
    if (!amb) return;
    const t = ctx.currentTime, [rain, wind, sand] = ambWant, gust = 0.75 + 0.25 * Math.sin(t * 0.7) * Math.sin(t * 0.23);
    amb.hi.g.gain.setTargetAtTime(rain * 0.025, t, 0.5);   // 빗소리 (0.05의 절반)
    amb.lo.g.gain.setTargetAtTime(rain * 0.025, t, 0.5);
    amb.wind.g.gain.setTargetAtTime((Math.max(0, wind - 0.6) * 0.03 + sand * 0.05) * gust, t, 0.4);
    amb.wind.b.frequency.setTargetAtTime(260 + 260 * gust * (0.5 + wind * 0.3) + sand * 120, t, 0.4);
  }
  addEventListener('keydown', init); addEventListener('pointerdown', init);
  setTimeout(init, 0);   // 열자마자 켜 본다: 이 사이트에서 소리를 자주 들었으면 브라우저가 바로 허락한다 (안 되면 멈춘 채로 있다가 첫 입력 때 다시 켠다)
  const dist = (p) => p ? Math.max(0, p.distanceTo(controls.target) - 4) : 0;
  const att = (p) => 1 / (1 + dist(p) / 14);
  // 걸러낸 잡음 한 방: 주파수가 f0 → f1로 내려가며 dur초 동안 사그라든다. rv = 잔향으로 보내는 양. 멀수록 높은 소리를 깎는다
  function noise(p, dur, f0, f1, gain, { q = 0.8, type = 'lowpass', rv = 0, delay = 0, atk = 0.004 } = {}) {
    if (!ctx) return;
    const k = att(p) * gain;
    if (k < 0.005) return;
    const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    const far = 1 / (1 + dist(p) / 40);
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(type === 'lowpass' ? f0 * (0.35 + 0.65 * far) : f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k, t + atk); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    if (rv) { const s = ctx.createGain(); s.gain.value = rv * (1.4 - far * 0.6); g.connect(s); s.connect(verb); }   // 멀수록 잔향 비율이 크다
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  // 음 하나: f0 → f1로 미끄러지며
  function tone(p, type, f0, f1, dur, gain, delay = 0, rv = 0) {
    if (!ctx) return;
    const k = att(p) * gain;
    if (k < 0.005) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(master);
    if (rv) { const s = ctx.createGain(); s.gain.value = rv; g.connect(s); s.connect(verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  // UI 소리: 짧은 사각파 삑 (게임 소리를 꺼도 들리게 out으로). 치지직 창 연출에 맞춰 잡음을 살짝
  function blip(f0, f1, dur, gain, delay = 0, type = 'square') {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function crackle(dur, gain, f = 3000) {
    const t = ctx.currentTime, s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 0.7;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(b); b.connect(g); g.connect(out); s.start(t, srr(0, 1.5)); s.stop(t + dur + 0.05);
  }
  // 초저음: 사인파를 살짝 일그러뜨려(배음을 더해) 작은 스피커에서도 묵직하게 들리게
  let shaper = null;
  function sub(p, f0, f1, dur, gain) {
    if (!ctx) return;
    const k = att(p) * gain;
    if (k < 0.005) return;
    if (!shaper) { shaper = ctx.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 2.5); } shaper.curve = c; shaper.connect(master); }
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(shaper);
    const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(verb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // 금속 울림: 정수배가 아닌 배음 여러 개가 높을수록 빨리 사그라든다 (종·쇳덩이 소리)
  function bell(p, freqs, dur, gain) {
    if (!ctx) return;
    const k = att(p) * gain;
    if (k < 0.005) return;
    const t = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), d = dur / (1 + i * 0.5);
      o.type = 'sine'; o.frequency.value = f * srr(0.98, 1.02);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(k / (1 + i * 0.4), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0003, t + d);
      o.connect(g); g.connect(master);
      const s = ctx.createGain(); s.gain.value = 0.25; g.connect(s); s.connect(verb);
      o.start(t); o.stop(t + d + 0.05);
    });
  }
  return {
    boom(p, power = 1) {   // 폭발: 무겁게 깔리는 초저음(살짝 일그러뜨려 묵직하게) + 오래 구르는 굉음 + 흩어지는 파편 + 큰 잔향
      const s = Math.min(2.2, power);
      noise(p, 0.1, 5000, 1500, 0.22 + s * 0.06, { type: 'highpass', q: 0.5, rv: 0.4 });
      noise(p, 2.2 + s * 0.9, 900, 30, 0.85 + s * 0.15, { q: 1.3, rv: 1.0, atk: 0.012 });
      sub(p, 48, 18, 1.5 + s * 0.5, 0.95 + s * 0.15);
      for (let k = 0; k < 3 + s * 2; k++) noise(p, srr(0.04, 0.1), srr(1800, 3500), 900, 0.1, { type: 'bandpass', q: 2, delay: srr(0.2, 1.0), rv: 0.35 });
    },
    fire(p) {   // 대포 발사: 짧고 육중한 포구 폭음 + 땅을 울리는 초저음 + 낮게 깔리는 메아리
      noise(p, 0.07, 6000, 2000, 0.32, { type: 'highpass', q: 0.4, rv: 0.6 });
      noise(p, 1.5, 1300, 35, 0.95, { q: 1.1, rv: 1.2, atk: 0.004 });
      sub(p, 55, 20, 1.1, 1.05);
      noise(p, 0.9, 400, 50, 0.3, { delay: 0.4, rv: 0.9 });   // 산에 부딪혀 돌아오는 메아리
    },
    clang(p, k = 1) {   // 포탄이 장갑에 맞음: 둔탁한 쿵 + 두꺼운 강철이 울리는 소리
      noise(p, 0.25, 800, 100, 0.6 * k, { q: 1.2, rv: 0.4 });
      bell(p, [210, 540, 980, 1530], 0.9, 0.35 * k);
      sub(p, 90, 40, 0.3, 0.5 * k);
    },
    metal(p, k = 1) {   // 두꺼운 쇠끼리 부딪힘 (k: 세기, 부딪히는 속도에 따라): 몸통을 울리는 쿵 + 둔한 충격 + 좁은 대역 잡음 여러 개가 짧게 울림 (맑은 종소리 대신 탁한 쇳소리)
      noise(p, 0.05, 6000, 2500, 0.2 * k, { type: 'highpass', q: 0.6, rv: 0.2 });
      noise(p, 0.22, 600, 80, 0.45 * k, { q: 1.1, rv: 0.25 });
      sub(p, 110, 42, 0.28, 0.45 * k);
      for (const [f, d, g] of [[310, 0.4, 0.2], [780, 0.3, 0.16], [1240, 0.22, 0.13], [1930, 0.15, 0.1], [2870, 0.1, 0.08]])
        noise(p, d * srr(0.8, 1.2), f * srr(0.95, 1.05), f * 0.97, g * k, { type: 'bandpass', q: 28, rv: 0.3, atk: 0.002 });
    },
    wood(p, k = 1) {   // 나무(집·전봇대)에 부딪힘: 둔탁한 퍽 + 짧은 나무 울림
      noise(p, 0.18, 700, 120, 0.55 * k, { q: 1.4, rv: 0.25 });
      noise(p, 0.3, 230, 210, 0.3 * k, { type: 'bandpass', q: 7, rv: 0.2 });
      noise(p, 0.2, 470, 430, 0.18 * k, { type: 'bandpass', q: 6 });
      tone(p, 'sine', 120, 70, 0.2, 0.35 * k);
    },
    thud(p, k = 1) {   // 무거운 착지: 땅이 울리는 저음
      tone(p, 'sine', 55, 22, 0.6, 0.85 * k, 0, 0.3);
      noise(p, 0.5, 500, 50, 0.5 * k, { q: 1, rv: 0.5 });
    },
    crack(p) {   // 부서짐 (폭발 아님): 쇠·판자가 우그러지며 쏟아지는 소리
      for (let k = 0; k < 4; k++) noise(p, srr(0.08, 0.2), srr(1500, 3200), 300, 0.3, { q: 1.4, delay: k * srr(0.03, 0.07), rv: 0.3 });
      noise(p, 0.4, 400, 60, 0.3, { rv: 0.3 });
    },
    glass(p) {   // 두꺼운 유리벽에 포탄이 튕김: 둔한 퉁 + 맑게 울리는 유리 배음
      noise(p, 0.2, 700, 120, 0.5, { q: 1.2, rv: 0.5 });
      sub(p, 110, 60, 0.35, 0.6);
      bell(p, [880, 1990, 3310, 4870], 1.1, 0.28);
    },
    mg(p) {   // 기관총 한 발 '탕!': 귀를 때리는 아주 짧은 파열음 + 짧게 꺾이는 금속성 울림 + 가슴을 치는 몸통 + 짧은 메아리
      noise(p, 0.025, 7000, 3000, 0.42, { type: 'highpass', q: 0.7, rv: 0.35, atk: 0.001 });
      tone(p, 'square', 1400, 260, 0.045, 0.07);
      noise(p, 0.1, 1600, 200, 0.38, { q: 1.2, rv: 0.45, atk: 0.002 });
      tone(p, 'sine', 170, 55, 0.11, 0.32);
      noise(p, 0.35, 700, 90, 0.08, { delay: 0.08, rv: 0.6 });
    },
    mgHit(p) {   // 기관총이 쇠를 뚫고 들어감 (대미지 있음): 딱딱한 '땅' + 짧고 높은 쇳소리 (포탄 맞는 소리보다 훨씬 가볍게)
      noise(p, 0.03, 5000, 2000, 0.2, { type: 'highpass', q: 0.8, rv: 0.12, atk: 0.001 });
      noise(p, 0.07, 1100, 250, 0.16, { q: 1.4, rv: 0.15 });
      for (const [f, d, g] of [[1350, 0.12, 0.07], [2240, 0.09, 0.05], [3480, 0.06, 0.04]])
        noise(p, d * srr(0.8, 1.2), f * srr(0.93, 1.07), f * 0.96, g, { type: 'bandpass', q: 24, rv: 0.15, atk: 0.001 });
    },
    mgPing(p) {   // 장갑에 튕김 (대미지 0): 가벼운 '틱' + 높게 미끄러지며 사라지는 도탄음 '피융'
      noise(p, 0.02, 6000, 3000, 0.12, { type: 'highpass', q: 0.8, atk: 0.001 });
      tone(p, 'sine', srr(2600, 3200), srr(1100, 1500), srr(0.22, 0.32), 0.07, 0.01, 0.2);
    },
    coin() { tone(null, 'square', 1320, 1320, 0.07, 0.06); tone(null, 'square', 1760, 1760, 0.12, 0.06, 0.06); },
    kit() { tone(null, 'triangle', 660, 660, 0.1, 0.12); tone(null, 'triangle', 990, 990, 0.18, 0.12, 0.09); },
    engine(on, load, speed) {
      if (!eng) return;
      const t = ctx.currentTime;
      eng.g.gain.setTargetAtTime(on ? 0.08 + load * 0.12 : 0, t, 0.1);
      const f = 26 + load * 18 + speed * 1.6;   // 힘을 줄수록, 빠를수록 회전수가 오른다
      eng.o1.frequency.setTargetAtTime(f, t, 0.15); eng.o2.frequency.setTargetAtTime(f * 1.021, t, 0.15);
      eng.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.15);   // 점화 박자
      eng.lp.frequency.setTargetAtTime(160 + load * 220, t, 0.15);
      eng.tlfo.frequency.setTargetAtTime(2 + speed * 2.4, t, 0.1);   // 궤도판이 땅을 치는 박자
      const clank = on ? Math.min(1, speed / 6) * 0.05 : 0;
      eng.tg.gain.setTargetAtTime(clank, t, 0.1); eng.tlfoG.gain.setTargetAtTime(clank, t, 0.1);
    },
    // 날씨 소리 양 (0이면 안 들림): 비 양, 바람 세기, 모래바람 양
    weather(rain, wind, sand) { ambWant[0] = rain; ambWant[1] = wind; ambWant[2] = sand; setAmb(); },
    // 사이렌 크기 (0 = 끔). k = 가까운 경보 벙커의 거리로 정한 크기, far = 멀수록 먹먹하게 (0~1)
    siren(k, far = 1) {
      if (Math.abs(k - sirenWant) < 0.003 || !siren) { if (!siren) sirenWant = k; return; }
      sirenWant = k;
      const t = ctx.currentTime;
      siren.g.gain.setTargetAtTime(k * SIREN_VOL, t, 0.15);
      siren.lp.frequency.setTargetAtTime(800 + 1800 * far, t, 0.2);
    },
    // 천둥: 번개 delay초 뒤 낮게 우르릉 (멀리서 굴러오는 소리)
    thunder(delay) {
      if (!ctx) return;
      noise(null, 0.6, 2500, 300, 0.25, { delay, rv: 0.8, atk: 0.01 });
      noise(null, 3.6, 260, 30, 0.9, { q: 1.1, delay: delay + 0.05, rv: 1.2, atk: 0.15 });
      noise(null, 2.2, 150, 40, 0.5, { delay: delay + srr(0.5, 1.2), rv: 1.0, atk: 0.3 });
    },
    setVolume(v) { vol = v; if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
    unlock: init,   // 첫 입력 때 소리 켜기 (타이틀처럼 입력을 가로채는 곳에서 직접 부른다)
    // 게임 소리 켜고 끄기 (가운데 창이 떠 있으면 끈다. UI 소리는 그대로)
    game(on) { if (on === gameOn) return; gameOn = on; if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.04); },
    // UI 소리: open 창 열림, close 창 닫힘, tab 탭 이동, button 버튼 누름
    ui(kind) {
      if (!ctx || ctx.state !== 'running') return;
      if (kind === 'open') { crackle(0.12, 0.05); blip(520, 520, 0.05, 0.05); blip(780, 780, 0.07, 0.05, 0.05); }
      else if (kind === 'close') { crackle(0.14, 0.04, 2200); blip(700, 700, 0.05, 0.045); blip(440, 440, 0.08, 0.045, 0.05); }
      else if (kind === 'tab') blip(1250, 1250, 0.03, 0.04);
      else if (kind === 'type') blip(1900, 1700, 0.018, 0.018);   // 작전 정보 타자
      else if (kind === 'combo') [660, 880, 1100, 1320].forEach((f, i) => blip(f, f, 0.09, 0.05, i * 0.07));   // 조합 완성: 올라가는 아르페지오
      else if (kind === 'button') { blip(980, 980, 0.03, 0.05); blip(1470, 1470, 0.05, 0.04, 0.035); }
    },
    pause(p) { paused0 = p; if (!ctx) return; if (p) ctx.suspend(); else ctx.resume(); },
    // 소리가 켜져 있어야 하는데 브라우저가 멈춰 두었으면 다시 켠다 (한 번이라도 입력한 뒤라면 입력 없이도 된다). 매 프레임 불러도 가볍다
    keepAlive() {
      if (!ctx || paused0 || ctx.state === 'running' || ctx.state === 'closed') return;
      const t = performance.now();
      if (t - (this._kt || 0) < 500) return;
      this._kt = t;
      if (!navigator.userActivation || navigator.userActivation.hasBeenActive) ctx.resume();
    },
    // 물에 떨어진 포탄: 낮게 퐁 + 물 튀는 쏴아
    splash(p) {
      noise(p, 0.5, 900, 120, 0.6, { q: 1.2, rv: 0.5, atk: 0.006 });
      noise(p, 0.9, 5000, 1200, 0.32, { type: 'highpass', q: 0.4, rv: 0.4, delay: 0.03, atk: 0.02 });
      tone(p, 'sine', 180, 55, 0.35, 0.5, 0, 0.3);
    },
  };
})();
sfx.setVolume(volNow);   // 기억해 둔 소리 크기 (설정 탭·설정 메뉴. 40_input_post.js의 setVolume)
