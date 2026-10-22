/* ============================================================
   scanCapture.js — Scan peau « Face ID » : vérifications + capture vidéo guidée (étape 2)
   1) Anneau autour du visage (rouge → orange → vert) : lumière, netteté, cadrage, tête droite.
      Le scan démarre tout seul quand l'anneau reste vert.
   2) Rotation guidée (gauche puis droite) : arc de progression, voix française, vibration si possible.
   3) Pendant la rotation, on garde en mémoire seulement les images les plus nettes, rangées par angle
      de tête (3 par tranche de 5°). La vidéo elle-même n'est ni envoyée ni enregistrée : tout reste ici.
   Dépend de : window.ScanConfig, window.ScanMath, MediaPipe Face Landmarker (chargé à la demande).
   ============================================================ */
'use strict';

const ScanCapture = (() => {
  const C = () => window.ScanConfig;
  const M = () => window.ScanMath;
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  // ─── Suivi du visage (chargé une seule fois) ───────────────
  let _landmarker = null;
  async function getLandmarker() {
    if (_landmarker) return _landmarker;
    const { FaceLandmarker, FilesetResolver } = await import(MP + '/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks(MP + '/wasm');
    const make = delegate => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1
    });
    try { _landmarker = await make('GPU'); } catch (e) { _landmarker = await make('CPU'); }
    return _landmarker;
  }

  // ─── Caméra ────────────────────────────────────────────────
  async function openCamera(video) {
    if (video.srcObject && video.videoWidth) return video.srcObject;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: C().VIDEO.width }, height: { ideal: C().VIDEO.height } }, audio: false
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try { await video.play(); } catch (e) { /* lecture déjà demandée (autoplay) */ }
    if (!video.videoWidth) await new Promise(r => { video.onloadedmetadata = () => r(); });
    return stream;
  }
  function stopCamera(video) {
    const s = video && video.srcObject;
    if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    if (video) video.srcObject = null;
  }

  // ─── Voix et vibration ─────────────────────────────────────
  const Voice = (() => {
    let voice = null;
    function pick() {
      if (voice || !('speechSynthesis' in window)) return;
      const fr = speechSynthesis.getVoices().filter(v => String(v.lang).toLowerCase().indexOf('fr') === 0);
      voice = fr.find(v => C().VOICE_PREFERRED.some(n => v.name.indexOf(n) >= 0)) || fr[0] || null;
    }
    function say(text) {
      if (!('speechSynthesis' in window)) return;
      try {
        pick();
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        if (voice) u.voice = voice;
        u.rate = 0.95;
        speechSynthesis.speak(u);
      } catch (e) { /* la voix est un confort, jamais bloquant */ }
    }
    return { say };
  })();
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ─── Mesures sur chaque image ──────────────────────────────
  const _small = document.createElement('canvas');
  const _sg = _small.getContext('2d', { willReadFrequently: true });

  // Boîte du visage (px de la vidéo) d'après le contour du visage
  function faceBox(pts, W, H) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    C().LM.FACE_OVAL.forEach(i => {
      const p = pts[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    });
    return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
  }

  // Lumière (moyenne, écart gauche/droite) et netteté du visage, sur une image réduite
  function sampleFace(video, box) {
    const w = C().CHECK.sampleWidth, h = Math.max(40, Math.round(w * box.h / box.w));
    _small.width = w; _small.height = h;
    _sg.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, w, h);
    const d = _sg.getImageData(0, 0, w, h).data;
    const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8), y0 = Math.round(h * 0.2), y1 = Math.round(h * 0.8), xm = Math.round(w / 2);
    const gray = new Float32Array(w * h), valid = new Uint8Array(w * h);
    let sl = 0, cl = 0, sr = 0, cr = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x, p = i * 4;
        const g = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        gray[i] = g; valid[i] = 1;
        if (x < xm) { sl += g; cl++; } else { sr += g; cr++; }
      }
    }
    const lumL = cl ? sl / cl : 0, lumR = cr ? sr / cr : 0, lum = (lumL + lumR) / 2;
    const sharp = M().laplacianVariance(gray, w, h, valid);
    return { lum, lrDiff: lum ? Math.abs(lumL - lumR) / lum : 0, sharp: sharp == null ? 0 : sharp };
  }

  // Note l'image avant le scan : score 0–100 + conseil principal + famille du problème
  function evaluate(m, phase) {
    const K = C().CHECK;
    let score = 100, hint = null, cause = null, worst = 0;
    const bad = (pen, text, c) => { score -= pen; if (pen > worst) { worst = pen; hint = text; cause = c; } };
    if (m.faceW < K.faceWidthMin) bad(40, 'Rapproche un peu le téléphone', 'cadre');
    else if (m.faceW > K.faceWidthMax) bad(25, 'Recule un peu', 'cadre');
    if (Math.abs(m.centerOff) > K.centerMaxOffset) bad(20, 'Centre ton visage dans le cadre', 'cadre');
    if (Math.abs(m.roll) > K.tiltMaxDeg) bad(20, 'Redresse un peu la tête', 'cadre');
    if (phase === 'check' && Math.abs(m.yaw) > K.yawMaxDeg) bad(25, 'Regarde droit devant toi', 'cadre');
    if (m.lum < K.lumMin) bad(45, 'Il faut plus de lumière', 'lumiere');
    else if (m.lum > K.lumMax) bad(30, 'Trop de lumière : décale-toi un peu', 'lumiere');
    if (m.lrDiff > K.lrDiffMax) bad(35, 'La lumière vient d\'un seul côté : place-toi face à elle', 'lumiere');
    if (m.sharp < K.sharpMin) bad(35, 'Image floue : tiens le téléphone bien immobile', 'flou');
    return { score: Math.max(0, score), hint, cause };
  }

  // ─── Dessin : anneau et arc de progression ─────────────────
  // Le miroir : la vidéo est affichée en miroir (comme un selfie), donc x → W − x.
  function drawOverlay(canvas, pts, W, H, color, progress) {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, W, H);
    if (!pts) return;
    const oval = C().LM.FACE_OVAL;
    // anneau = contour du visage
    g.lineWidth = Math.max(6, W * 0.008); g.lineJoin = 'round'; g.strokeStyle = color;
    g.beginPath();
    let cx = 0, cy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    oval.forEach((i, k) => {
      const x = W - pts[i].x * W, y = pts[i].y * H;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
      cx += x; cy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    });
    g.closePath(); g.stroke();
    if (!progress) return;
    // arc de progression : 60 repères autour du visage, gauche = tourne à gauche, droite = tourne à droite
    cx /= oval.length; cy /= oval.length;
    const rx = (maxX - minX) / 2 * 1.28, ry = (maxY - minY) / 2 * 1.12;
    const N = 60, half = N / 2;
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * 2 * Math.PI;                  // 0 = en haut, sens horaire
      const onRight = i < half;
      const rank = onRight ? i : (N - i);                               // 0 en haut → 30 en bas, de chaque côté
      const p = onRight ? progress.right : progress.left;               // à l'écran (miroir) : gauche = côté gauche
      const lit = rank / half < p && rank > 0;
      const x0 = cx + Math.cos(a) * rx, y0 = cy + Math.sin(a) * ry;
      const x1 = cx + Math.cos(a) * (rx + W * (lit ? 0.045 : 0.03)), y1 = cy + Math.sin(a) * (ry + W * (lit ? 0.045 : 0.03));
      g.lineWidth = Math.max(4, W * 0.007); g.lineCap = 'round';
      g.strokeStyle = lit ? '#B4482E' : 'rgba(120,100,90,0.35)';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }

  // ─── Rangement d'une image (les plus nettes de chaque tranche d'angle) ──
  function storeFrame(state, video, pts, W, H, box, yaw, roll, sharp, now) {
    const K = C().CAPTURE;
    if (Math.abs(yaw) > K.binMaxDeg + K.binDeg / 2) return;
    if (sharp < K.storeSharpMin) return;
    const bin = M().binOf(yaw, K.binDeg, K.binMaxDeg);
    let list = state.bins.get(bin);
    if (!list) { list = []; state.bins.set(bin, list); }
    if (list.length >= K.framesPerBin) {
      let min = Infinity; list.forEach(r => { if (r.sharp < min) min = r.sharp; });
      if (sharp <= min) return;                                  // pas assez nette : on ne la dessine même pas
    }
    const mx = box.w * 0.12, my = box.h * 0.12;                   // marge autour du visage
    const sx = Math.max(0, box.x - mx), sy = Math.max(0, box.y - my);
    const sw = Math.min(W - sx, box.w + 2 * mx), sh = Math.min(H - sy, box.h + 2 * my);
    const s = Math.min(1, K.faceCropMaxWidth / sw);
    const c = document.createElement('canvas');
    c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const lm = new Float32Array(478 * 3);
    for (let i = 0; i < 478 && i < pts.length; i++) { lm[i * 3] = pts[i].x; lm[i * 3 + 1] = pts[i].y; lm[i * 3 + 2] = pts[i].z; }
    const rec = { canvas: c, sx, sy, s, W, H, lm, yaw, roll, sharp, t: now };
    const out = M().insertTop(list, rec, K.framesPerBin, 'sharp');
    if (out) { out.canvas.width = 0; out.canvas.height = 0; }     // libère la mémoire de l'image éjectée
  }

  function allFrames(state) {
    const out = [];
    state.bins.forEach(list => list.forEach(r => out.push(r)));
    return out;
  }
  function releaseFrames(frames) {
    (frames || []).forEach(r => { if (r.canvas) { r.canvas.width = 0; r.canvas.height = 0; } });
  }

  // ─── Le scan ───────────────────────────────────────────────
  // opts : { video, overlay, onStatus(info) }  →  { promise, cancel() }
  // La promesse donne { ok:true, frames, W, H, coverage:{left,right}, … } ou { ok:false, reason, message }
  function start(opts) {
    const video = opts.video, overlay = opts.overlay, onStatus = opts.onStatus || function () {};
    let cancelled = false, finished = false, resolveFn;
    const promise = new Promise(r => { resolveFn = r; });

    const state = {
      phase: 'check', checkStart: 0, greenSince: 0, causes: { lumiere: 0, flou: 0, cadre: 0 },
      bins: new Map(), captureStart: 0, dir: 'left', maxLeft: 0, maxRight: 0,
      lastYaw: null, lastT: 0, speedWarn: 0, lastSpeedMsg: 0, restarts: 0, frames: 0, fpsT: 0, fps: 0
    };

    function finish(result) {
      if (finished) return;
      finished = true;
      try { overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height); } catch (e) {}
      resolveFn(result);
    }
    function fail(reason, message) {
      releaseFrames(allFrames(state));
      finish({ ok: false, reason, message });
    }

    (async () => {
      let lm;
      try {
        onStatus({ phase: 'loading', text: 'Chargement…', level: 'none' });
        await openCamera(video);
        lm = await getLandmarker();
      } catch (e) {
        return fail('camera', 'La caméra n\'a pas pu démarrer : ' + (e && e.message ? e.message : e));
      }
      if (cancelled) return finish({ ok: false, reason: 'annule', message: 'Scan annulé' });

      const W = video.videoWidth, H = video.videoHeight;
      state.checkStart = performance.now();

      // Délai maximal de la rotation (vérifié même si le visage sort du cadre)
      const checkCaptureTimeout = (now) => {
        const K = C().CAPTURE;
        if (now - state.captureStart <= K.maxMs) return false;
        const enough = state.maxLeft >= K.partialMinDeg && state.maxRight >= K.partialMinDeg;
        if (enough) { done(true, now - state.captureStart); return true; }
        if (state.restarts < K.maxRestarts) {
          state.restarts++;
          releaseFrames(allFrames(state)); state.bins = new Map();
          state.maxLeft = 0; state.maxRight = 0; state.dir = 'left'; state.lastYaw = null;
          state.captureStart = now;
          Voice.say('On recommence, un peu plus doucement. Tourne à gauche.');
          return false;
        }
        fail('incomplet', 'La rotation n\'a pas pu être complétée. Tourne la tête lentement, jusqu\'à ce que ton nez pointe presque vers le côté.');
        return true;
      };

      const loop = (now) => {
        if (cancelled) return finish({ ok: false, reason: 'annule', message: 'Scan annulé' });
        if (finished) return;

        let res = null;
        try { res = lm.detectForVideo(video, now); } catch (e) { res = null; }
        const pts = res && res.faceLandmarks && res.faceLandmarks[0];
        state.frames++;
        if (now - state.fpsT > 1000) { state.fps = state.frames; state.frames = 0; state.fpsT = now; }

        if (!pts) {
          drawOverlay(overlay, null, W, H, '#ccc', null);
          if (state.phase === 'check') onStatus({ phase: 'check', text: 'Place ton visage dans le cadre', level: 'none', debug: { fps: state.fps } });
          else {
            onStatus({ phase: 'capture', text: 'Je ne te vois plus : reviens dans le cadre', level: 'orange', debug: { fps: state.fps } });
            state.lastYaw = null;
            checkCaptureTimeout(now);
          }
          state.greenSince = 0;
          if (state.phase === 'check' && now - state.checkStart > C().CHECK.timeoutMs) return fail(topCause(), messageFor(topCause()));
          return;
        }

        const box = faceBox(pts, W, H);
        const yaw = M().yawDeg(pts, W), roll = M().rollDeg(pts, W, H);
        const sm = sampleFace(video, box);
        const m = {
          faceW: Math.abs(pts[454].x - pts[234].x), centerOff: pts[1].x - 0.5,
          roll, yaw, lum: sm.lum, lrDiff: sm.lrDiff, sharp: sm.sharp
        };
        const ev = evaluate(m, state.phase);
        const debug = { fps: state.fps, yaw, roll, lum: sm.lum, lrDiff: sm.lrDiff, sharp: sm.sharp, faceW: m.faceW };

        if (state.phase === 'check') {
          const level = ev.hint ? (ev.score >= C().CHECK.orangeScore ? 'orange' : 'red') : 'green';
          if (ev.cause) state.causes[ev.cause]++;
          drawOverlay(overlay, pts, W, H, level === 'green' ? '#2f9e5a' : level === 'orange' ? '#e08a1e' : '#c0392b', null);
          if (!ev.hint) {
            // image bonne : on la garde (surtout utile pour l'image « de face »)
            storeFrame(state, video, pts, W, H, box, yaw, roll, sm.sharp, now);
            if (!state.greenSince) state.greenSince = now;
            const held = now - state.greenSince;
            onStatus({ phase: 'check', text: 'Parfait, ne bouge pas…', level, hold: Math.min(1, held / C().CHECK.holdMs), debug });
            if (held >= C().CHECK.holdMs) beginCapture(now);
          } else {
            state.greenSince = 0;
            onStatus({ phase: 'check', text: ev.hint, level, debug });
            if (now - state.checkStart > C().CHECK.timeoutMs) return fail(topCause(), messageFor(topCause()));
          }
          return;
        }

        // ── Phase de capture (rotation) ──
        const K = C().CAPTURE;
        const t = now - state.captureStart;
        if (yaw > state.maxLeft) state.maxLeft = Math.min(yaw, K.yawTargetDeg);
        if (-yaw > state.maxRight) state.maxRight = Math.min(-yaw, K.yawTargetDeg);
        storeFrame(state, video, pts, W, H, box, yaw, roll, sm.sharp, now);

        // vitesse de rotation
        if (state.lastYaw != null && now > state.lastT) {
          const speed = Math.abs(yaw - state.lastYaw) / ((now - state.lastT) / 1000);
          if (speed > K.maxYawSpeed && now - state.lastSpeedMsg > K.voiceEverySpeedMs) {
            state.speedWarn++; state.lastSpeedMsg = now; Voice.say('Un peu plus doucement.');
          }
        }
        state.lastYaw = yaw; state.lastT = now;

        const prog = { left: state.maxLeft / K.yawTargetDeg, right: state.maxRight / K.yawTargetDeg };
        drawOverlay(overlay, pts, W, H, '#2f9e5a', prog);

        if (state.dir === 'left' && state.maxLeft >= K.yawTargetDeg - 0.5) {
          state.dir = 'right'; buzz(30); Voice.say('Parfait, maintenant à droite.');
        } else if (state.dir === 'right' && state.maxRight >= K.yawTargetDeg - 0.5) {
          buzz([30, 60, 30]); Voice.say('C\'est terminé !');
          return done(false, t);
        }
        onStatus({
          phase: 'capture', level: 'green', yaw, progress: prog, debug,
          text: state.dir === 'left' ? 'Tourne doucement vers la gauche' : 'Maintenant vers la droite'
        });

        checkCaptureTimeout(now);
      };

      // boucle pilotée par les images de la vidéo (une analyse par nouvelle image)
      if (typeof video.requestVideoFrameCallback === 'function') {
        const cb = (now) => { loop(now); if (!finished) video.requestVideoFrameCallback(cb); };
        video.requestVideoFrameCallback(cb);
      } else {
        let lastTime = -1;
        const raf = (now) => {
          if (finished) return;
          if (video.currentTime !== lastTime) { lastTime = video.currentTime; loop(now); }
          if (!finished) requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
      }

      function beginCapture(now) {
        state.phase = 'capture'; state.captureStart = now; state.dir = 'left'; state.lastYaw = null;
        buzz(30);
        Voice.say('C\'est parti. Tourne doucement à gauche.');
      }
      function topCause() {
        const c = state.causes;
        return c.lumiere >= c.flou && c.lumiere >= c.cadre ? 'lumiere' : (c.flou >= c.cadre ? 'flou' : 'cadre');
      }
      function done(partial, t) {
        const frames = allFrames(state);
        finish({
          ok: true, frames, W, H, partial, durationMs: Math.round(t), restarts: state.restarts,
          speedWarnings: state.speedWarn, coverage: { left: Math.round(state.maxLeft), right: Math.round(state.maxRight) }
        });
      }
    })();

    return { promise, cancel() { cancelled = true; } };
  }

  // Messages d'aide quand l'anneau ne devient pas vert (textes demandés)
  function messageFor(cause) {
    if (cause === 'lumiere') return 'La lumière est un peu faible. Place-toi face à une fenêtre en journée, ou face à une lampe le soir.';
    if (cause === 'flou') return 'L\'image est floue. Tiens le téléphone bien immobile, à bout de bras, et nettoie l\'objectif si besoin.';
    return 'Je n\'arrive pas à bien voir ton visage. Tiens le téléphone à bout de bras, visage entier dans le cadre, face à la lumière.';
  }
  const MSG_MAKEUP = 'Le maquillage masque certains détails de ta peau. Fais ton scan démaquillée pour un résultat fiable — le soir avant de dormir, c\'est le moment idéal.';

  return { start, stopCamera, releaseFrames, say: Voice.say, messageFor, MSG_MAKEUP };
})();

window.ScanCapture = ScanCapture;
