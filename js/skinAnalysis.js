/* ============================================================
   skinAnalysis.js — Diagnostic cutané avancé par zone
   • Analyse locale : 100% navigateur, aucune donnée envoyée
   • 5 zones (front, joues, nez, menton) × 5 métriques
   • Détection sous-tons via espace colorimétrique LAB
   • Overlay temps réel sur caméra (VIDEO mode MediaPipe)
   • Rendu : diagnostic texte expert par zone (no gauges)
   ============================================================ */

'use strict';

const SkinAnalysis = (() => {

  // ─── Constantes landmarks MediaPipe 478 pts ───────────────────

  const FACE_OVAL_IDX = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
    361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
    176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109
  ];

  const LIP_OUTER_IDX = [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
    375, 321, 405, 314, 17, 84, 181, 91, 146
  ];

  const EYE_LEFT_IDX  = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173];
  const EYE_RIGHT_IDX = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

  // Zones cutanées — landmarks définissant chaque région
  const ZONE_REGIONS = {
    forehead: {
      label: 'Front', icon: '○',
      landmarks: [10, 338, 297, 332, 284, 251, 389, 356,
                  109, 67, 103, 54, 21, 162, 127,
                  151, 9, 8, 107, 336, 66, 296, 105, 334]
    },
    leftCheek: {
      label: 'Joue gauche', icon: '◇',
      landmarks: [234, 116, 111, 117, 118, 50, 101, 205, 36, 203, 206, 187, 123,
                  93, 132, 58, 172, 136, 150, 149, 176, 148]
    },
    rightCheek: {
      label: 'Joue droite', icon: '◇',
      landmarks: [454, 323, 345, 346, 347, 280, 352, 411, 425, 266, 423, 426, 427,
                  361, 288, 397, 365, 380, 381, 382]
    },
    nose: {
      label: 'Nez', icon: '△',
      landmarks: [1, 2, 5, 4, 195, 197, 6, 168, 8, 9,
                  98, 327, 45, 275, 220, 440, 131, 360, 49, 279]
    },
    chin: {
      label: 'Menton', icon: '✦',
      landmarks: [152, 200, 199, 175, 171, 377, 378, 400, 379, 365,
                  136, 172, 58, 132, 176, 148, 149, 150]
    }
  };

  // Zone colors pour l'overlay live
  const ZONE_HUE = {
    forehead: 210, leftCheek: 350, rightCheek: 350, nose: 30, chin: 25
  };

  // ─── MediaPipe — gestion des instances ────────────────────────

  let videoDetector        = null;
  let videoDetectorLoading = false;
  let videoRaf             = null;

  async function getOrInitDetector() {
    if (window._glowFaceLandmarker) return window._glowFaceLandmarker;

    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      // Essayer GPU d'abord, puis fallback CPU si échec
      let lm;
      try {
        lm = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: false,
          runningMode: 'IMAGE',
          numFaces: 1
        });
        console.log('[SkinAnalysis] Détecteur IMAGE initialisé (GPU)');
      } catch (gpuErr) {
        console.warn('[SkinAnalysis] GPU non disponible, fallback CPU…', gpuErr);
        lm = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          outputFaceBlendshapes: false,
          runningMode: 'IMAGE',
          numFaces: 1
        });
        console.log('[SkinAnalysis] Détecteur IMAGE initialisé (CPU)');
      }

      window._glowFaceLandmarker = lm;
      return lm;
    } catch (err) {
      console.error('[SkinAnalysis] Impossible de charger MediaPipe:', err);
      return null;
    }
  }

  async function getOrInitVideoDetector() {
    if (videoDetector) return videoDetector;
    if (videoDetectorLoading) return null;
    videoDetectorLoading = true;

    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      // Essayer GPU d'abord, puis fallback CPU si échec
      try {
        videoDetector = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 1
        });
        console.log('[SkinAnalysis] Détecteur VIDEO initialisé (GPU)');
      } catch (gpuErr) {
        console.warn('[SkinAnalysis] GPU VIDEO non disponible, fallback CPU…', gpuErr);
        videoDetector = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          outputFaceBlendshapes: false,
          runningMode: 'VIDEO',
          numFaces: 1
        });
        console.log('[SkinAnalysis] Détecteur VIDEO initialisé (CPU)');
      }

      return videoDetector;
    } catch (err) {
      console.error('[SkinAnalysis] Erreur VIDEO detector:', err);
      return null;
    } finally {
      videoDetectorLoading = false;
    }
  }

  // ─── Contrôle qualité photo en temps réel ────────────────────

  let _qCanvas = null, _qCtx = null;

  function checkLiveQuality(videoEl, landmarks, w, h) {
    // Canvas basse résolution réutilisable pour l'échantillonnage pixel
    if (!_qCanvas) {
      _qCanvas = document.createElement('canvas');
      _qCanvas.width  = 160;
      _qCanvas.height = 120;
      _qCtx = _qCanvas.getContext('2d', { willReadFrequently: true });
    }
    const sw = 160, sh = 120;
    _qCtx.drawImage(videoEl, 0, 0, sw, sh);

    const issues = [];
    let score    = 100;

    // ── 1. Taille du visage (distance) ────────────────────────────
    const faceXs = FACE_OVAL_IDX.map(i => landmarks[i].x);
    const faceW  = Math.max(...faceXs) - Math.min(...faceXs);
    if (faceW < 0.26) {
      issues.push({ key: 'tooFar',   msg: 'Rapproche-toi — ton visage est trop loin',  w: 50 });
      score -= 50;
    } else if (faceW > 0.93) {
      issues.push({ key: 'tooClose', msg: 'Recule légèrement',                          w: 15 });
      score -= 15;
    }

    // ── 2. Inclinaison de la tête ─────────────────────────────────
    const eyeL  = landmarks[33];
    const eyeR  = landmarks[263];
    const tilt  = Math.abs(Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180 / Math.PI);
    if (tilt > 13) {
      issues.push({ key: 'tilted',   msg: 'Redresse légèrement la tête',               w: 25 });
      score -= 25;
    }

    // ── 3. Luminosité + ombres ────────────────────────────────────
    function sampleLum(lmPt) {
      const px = Math.round(lmPt.x * sw);
      const py = Math.round(lmPt.y * sh);
      if (px < 3 || px > sw - 3 || py < 3 || py > sh - 3) return null;
      const d = _qCtx.getImageData(px - 3, py - 3, 7, 7).data;
      let s = 0, c = 0;
      for (let i = 0; i < d.length; i += 4) {
        s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        c++;
      }
      return c ? s / c : null;
    }

    const lumSamples = [landmarks[10], landmarks[151], landmarks[234], landmarks[454]]
      .map(sampleLum).filter(v => v !== null);

    if (lumSamples.length >= 2) {
      const avgLum = lumSamples.reduce((a, b) => a + b, 0) / lumSamples.length;
      if (avgLum < 52) {
        issues.push({ key: 'tooDark',   msg: 'Besoin de plus de lumière — approche-toi d\'une fenêtre', w: 40 });
        score -= 40;
      } else if (avgLum > 218) {
        issues.push({ key: 'tooBright', msg: 'Trop de lumière directe — décale-toi légèrement',        w: 20 });
        score -= 20;
      }

      // ── Asymétrie gauche / droite (ombres latérales) ────────────
      const leftLum  = sampleLum(landmarks[234]);
      const rightLum = sampleLum(landmarks[454]);
      if (leftLum !== null && rightLum !== null && Math.abs(leftLum - rightLum) > 42) {
        issues.push({ key: 'shadows',  msg: 'Ombres latérales — place-toi face à ta source de lumière', w: 28 });
        score -= 28;
      }
    }

    // Plus grosse issue en premier
    issues.sort((a, b) => b.w - a.w);

    const ok = score >= 72 && issues.length === 0;
    return {
      ok,
      score:      Math.max(0, score),
      primaryMsg: ok ? 'Photo validée ✓' : (issues[0]?.msg || 'Ajuste ta position'),
      issues:     issues.map(i => i.msg)
    };
  }

  // ─── Analyse en temps réel (caméra) ──────────────────────────

  async function startLiveAnalysis(videoEl, overlayEl, onQuality) {
    if (videoRaf) stopLiveAnalysis();

    const detector = await getOrInitVideoDetector();
    if (!detector) return;

    const ctx = overlayEl.getContext('2d');
    let lastDetectionTs = 0;

    function loop(ts) {
      if (ts - lastDetectionTs > 120) {
        lastDetectionTs = ts;
        const w = videoEl.videoWidth  || 400;
        const h = videoEl.videoHeight || 300;
        overlayEl.width  = w;
        overlayEl.height = h;
        ctx.clearRect(0, 0, w, h);

        if (videoEl.readyState >= 2) {
          try {
            const res = detector.detectForVideo(videoEl, ts);
            if (res.faceLandmarks?.length) {
              const lm = res.faceLandmarks[0];
              drawLiveZones(ctx, lm, w, h, ts);
              if (onQuality) {
                try { onQuality(checkLiveQuality(videoEl, lm, w, h)); } catch {}
              }
            } else {
              drawFaceGuide(ctx, w, h);
              if (onQuality) onQuality({ ok: false, score: 0, primaryMsg: 'Centre ton visage dans le cadre', issues: [] });
            }
          } catch {
            drawFaceGuide(ctx, w, h);
          }
        }
      }
      videoRaf = requestAnimationFrame(loop);
    }

    videoRaf = requestAnimationFrame(loop);
  }

  function stopLiveAnalysis() {
    if (videoRaf) {
      cancelAnimationFrame(videoRaf);
      videoRaf = null;
    }
    const overlayEl = document.getElementById('cameraOverlay');
    if (overlayEl) {
      const ctx = overlayEl.getContext('2d');
      ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
    }
  }

  function drawLiveZones(ctx, landmarks, w, h, ts) {
    const pulse = 0.28 + 0.14 * Math.sin(ts * 0.003);

    Object.entries(ZONE_REGIONS).forEach(([key, zone]) => {
      const pts  = zone.landmarks.map(i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
      const hull = convexHull(pts);
      if (hull.length < 3) return;

      const hue = ZONE_HUE[key];
      ctx.save();
      ctx.beginPath();
      hull.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle   = `hsla(${hue},60%,65%,${pulse})`;
      ctx.strokeStyle = `hsla(${hue},50%,55%,${pulse + 0.3})`;
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    const scanY = (ts * 0.12) % (h * 1.6) - h * 0.3;
    if (scanY > 0 && scanY < h) {
      const grad = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
      grad.addColorStop(0,   'rgba(201,169,138,0)');
      grad.addColorStop(0.5, 'rgba(201,169,138,0.35)');
      grad.addColorStop(1,   'rgba(201,169,138,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, scanY - 18, w, 36);
    }
  }

  function drawFaceGuide(ctx, w, h) {
    const cx   = w * 0.50, cy = h * 0.47;
    const rx   = w * 0.26, ry = h * 0.35;
    const bLen = Math.min(w, h) * 0.06;

    ctx.save();

    // Corner brackets
    const corners = [
      [cx - rx, cy - ry,  1,  1],
      [cx + rx, cy - ry, -1,  1],
      [cx + rx, cy + ry, -1, -1],
      [cx - rx, cy + ry,  1, -1],
    ];
    ctx.strokeStyle = 'rgba(201,169,138,0.88)';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    corners.forEach(([bx, by, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(bx + dx * bLen, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by + dy * bLen);
      ctx.stroke();
    });

    // Oval guide — soft dashed
    ctx.strokeStyle = 'rgba(201,169,138,0.25)';
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Eye-level horizontal guide
    const eyeY = cy - ry * 0.22;
    ctx.strokeStyle = 'rgba(201,169,138,0.18)';
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.65, eyeY);
    ctx.lineTo(cx + rx * 0.65, eyeY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nose center dot
    ctx.fillStyle = 'rgba(201,169,138,0.38)';
    ctx.beginPath();
    ctx.arc(cx, cy + ry * 0.12, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(201,169,138,0.72)';
    ctx.font      = '13px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Centre ton visage', cx, cy + ry + 22);

    ctx.restore();
  }

  // ─── Analyse des cernes (zone sous les yeux) ─────────────────

  function analyzeCernes(sourceCanvas, landmarks, w, h, refR, refG, refB) {
    if (!landmarks || landmarks.length < 478) return { detected: false, type: 'none', intensity: 'léger' };

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    // Récupère les pixels d'un rectangle juste sous l'œil (zone élargie pour meilleure détection)
    function sampleBelowEye(bottomIdx, innerIdx, outerIdx) {
      const cy = landmarks[bottomIdx].y * h;
      const ix = landmarks[innerIdx].x  * w;
      const ox = landmarks[outerIdx].x  * w;
      const x1 = Math.max(0, Math.round(Math.min(ix, ox)) + 3);  // Élargi (était +6)
      const x2 = Math.min(w, Math.round(Math.max(ix, ox)) - 3);  // Élargi (était -6)
      const y1 = Math.min(h - 1, Math.round(cy) + 2);            // Plus proche de l'œil (était +4)
      const y2 = Math.min(h,     Math.round(cy) + 35);           // Plus bas (était +30)
      if (x2 - x1 < 4 || y2 - y1 < 4) return [];
      const data = ctx.getImageData(x1, y1, x2 - x1, y2 - y1).data;
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
      return pixels;
    }

    // Œil gauche (caméra) : bas=145, coins 33/133 — Œil droit : bas=374, coins 362/263
    const allPx = [
      ...sampleBelowEye(145, 33,  133),
      ...sampleBelowEye(374, 362, 263)
    ];

    if (allPx.length < 15) return { detected: false, type: 'none', intensity: 'léger' };  // Réduit (était 20)

    const avg = (arr, fn) => arr.reduce((s, p) => s + fn(p), 0) / arr.length;
    const eyeR = avg(allPx, p => p[0]);
    const eyeG = avg(allPx, p => p[1]);
    const eyeB = avg(allPx, p => p[2]);

    const eyeLum  = eyeR * 0.299 + eyeG * 0.587 + eyeB * 0.114;
    const faceLum = refR * 0.299 + refG * 0.587 + refB * 0.114;

    // Si la zone sous l'œil n'est pas significativement plus sombre → pas de cernes
    const darkening = faceLum - eyeLum;
    if (darkening < 3) return { detected: false, type: 'none', intensity: 'léger' };  // Plus sensible (était 6)

    // Écart de couleur par rapport à la peau de référence
    const dR = eyeR - refR;
    const dG = eyeG - refG;
    const dB = eyeB - refB;

    // Décalage bleu : la zone sous l'œil conserve plus de bleu → cernes bleus/violets
    const blueShift = dB - (dR + dG) / 2;
    // Décalage rouge : la zone conserve plus de rouge → cernes rouges
    const redShift  = dR - (dG + dB) / 2;

    let type = 'marron'; // pas de dominante de couleur → pigmentés/marron
    if (blueShift > 2.5)  type = 'bleu';      // Plus sensible (était 4)
    else if (redShift > 2.5) type = 'rouge';  // Plus sensible (était 4)

    // Classification d'intensité affinée
    const intensity = darkening > 16 ? 'marqué' : darkening > 8 ? 'modéré' : 'léger';  // Ajusté (était 22/12)

    return { detected: true, type, intensity };
  }

  // ─── Analyse photo statique ───────────────────────────────────

  async function analyzeFromPhoto(photoDataUrl) {
    const img = new Image();
    img.src   = photoDataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    const MAX_DIM = 960;
    const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth  * scale);
    const h = Math.round(img.naturalHeight * scale);

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width  = w;
    sourceCanvas.height = h;
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(img, 0, 0, w, h);
    AppState.face.sourceCanvas = sourceCanvas;

    let landmarks = AppState.face.landmarks;
    if (!landmarks) {
      const detector = await getOrInitDetector();
      if (!detector) return null;

      let results;
      try {
        results = detector.detect(img);
      } catch (gpuErr) {
        console.warn('[SkinAnalysis] GPU inference échouée, retry CPU…', gpuErr?.message || gpuErr);
        window._glowFaceLandmarker = null;
        const { FaceLandmarker, FilesetResolver } = await import(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
        );
        const fs = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        const cpuDet = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          outputFaceBlendshapes: false,
          runningMode: 'IMAGE',
          numFaces: 1
        });
        window._glowFaceLandmarker = cpuDet;
        console.log('[SkinAnalysis] Détecteur IMAGE CPU (fallback)');
        try { results = cpuDet.detect(img); } catch (e2) { console.error('[SkinAnalysis] CPU inference échouée aussi:', e2); return null; }
      }

      if (!results?.faceLandmarks?.length) return null;
      landmarks = results.faceLandmarks[0];
      AppState.face.landmarks = landmarks;
    }

    const zoneResults = {};
    const allSkinPixels = [];

    for (const [key, zone] of Object.entries(ZONE_REGIONS)) {
      const pixels = extractZonePixels(sourceCanvas, landmarks, w, h, zone.landmarks);
      if (pixels.length < 60) continue;

      allSkinPixels.push(...pixels);

      const pores   = computePores(sourceCanvas, srcCtx, landmarks, w, h, zone.landmarks);
      const teint   = computeTeint(pixels);
      const eclat   = computeEclat(pixels);
      const redness = computeRedness(pixels);
      const texture = computeTexture(pixels);
      const taches  = computeTaches(pixels);

      const score = Math.round(
        teint   * 0.22 +
        eclat   * 0.20 +
        pores   * 0.22 +
        (100 - redness) * 0.16 +
        texture * 0.10 +
        taches  * 0.10
      );

      zoneResults[key] = { ...zone, teint, eclat, pores, redness, texture, taches, score, pixels };
    }

    if (!Object.keys(zoneResults).length) return null;

    // Blanc des yeux → référence balance des blancs (neutralise la lumière ambiante)
    const scleraPixels = extractScleraPixels(sourceCanvas, landmarks, w, h);
    console.log('[SkinAnalysis] Sclérotique:', scleraPixels.length, 'pixels',
      scleraPixels.length >= 15
        ? `R:${Math.round(avg(scleraPixels.map(p=>p.r)))} G:${Math.round(avg(scleraPixels.map(p=>p.g)))} B:${Math.round(avg(scleraPixels.map(p=>p.b)))}`
        : '(référence insuffisante)');

    const undertone   = detectUndertone(allSkinPixels, zoneResults, scleraPixels);
    const skinType    = detectSkinType(zoneResults);
    const globalScore = Math.round(
      Object.values(zoneResults).reduce((s, z) => s + z.score, 0) /
      Object.values(zoneResults).length
    );

    const faceShape = detectFaceShape(landmarks, w, h);

    const refR = allSkinPixels.length ? allSkinPixels.reduce((s, p) => s + (p.r ?? p[0] ?? 180), 0) / allSkinPixels.length : 180;
    const refG = allSkinPixels.length ? allSkinPixels.reduce((s, p) => s + (p.g ?? p[1] ?? 140), 0) / allSkinPixels.length : 140;
    const refB = allSkinPixels.length ? allSkinPixels.reduce((s, p) => s + (p.b ?? p[2] ?? 120), 0) / allSkinPixels.length : 120;
    const cernes = analyzeCernes(sourceCanvas, landmarks, w, h, refR, refG, refB);

    // Carnation (clair / medium / foncé) — médiane LAB L, sans ombres
    const carnation = detectCarnation(allSkinPixels);

    // Contraste yeux
    const skinLumNorm = allSkinPixels.length
      ? avg(allSkinPixels.slice(0, 200).map(p => 0.299 * (p.r ?? p[0] ?? 180) / 255 + 0.587 * (p.g ?? p[1] ?? 140) / 255 + 0.114 * (p.b ?? p[2] ?? 120) / 255))
      : 0.5;
    const eyeContrast = detectEyeContrast(sourceCanvas, landmarks, w, h, skinLumNorm);

    return { zones: zoneResults, undertone, skinType, globalScore, faceShape, cernes, carnation, eyeContrast };
  }

  // ─── Extraction sclérotique (blanc des yeux) pour balance des blancs ───────
  // La sclérotique devrait être proche du blanc — si elle paraît jaune c'est
  // l'éclairage ambiant, pas la peau. On s'en sert pour corriger la photo.

  function extractScleraPixels(sourceCanvas, landmarks, w, h) {
    const leftPx  = extractZonePixels(sourceCanvas, landmarks, w, h, EYE_LEFT_IDX);
    const rightPx = extractZonePixels(sourceCanvas, landmarks, w, h, EYE_RIGHT_IDX);
    // Garder uniquement les pixels brillants (sclérotique = blanc > iris sombre)
    return [...leftPx, ...rightPx].filter(p => (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) > 145);
  }

  // Correction de balance des blancs : utilise G comme canal ancrage (le plus stable)
  // et ajuste R et B pour que la sclérotique soit perçue neutre.
  function applyWhiteBalance(pixels, scleraPixels) {
    if (!scleraPixels || scleraPixels.length < 15) return pixels;
    const scR = avg(scleraPixels.map(p => p.r));
    const scG = avg(scleraPixels.map(p => p.g));
    const scB = avg(scleraPixels.map(p => p.b));
    if (scG < 10 || scR < 10 || scB < 10) return pixels;
    // Facteurs de correction : ramenés à G. Limités pour éviter les cas extrêmes.
    const cR = clamp(scG / scR, 0.75, 1.30);
    const cB = clamp(scG / scB, 0.75, 1.30);
    return pixels.map(p => ({
      r: Math.min(255, Math.round(p.r * cR)),
      g: p.g,
      b: Math.min(255, Math.round(p.b * cB))
    }));
  }

  // ─── Extraction pixels par zone (polygon clipping) ───────────

  function extractZonePixels(sourceCanvas, landmarks, w, h, landmarkIndices) {
    const pts  = landmarkIndices.map(i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h }));
    const hull = convexHull(pts);
    if (hull.length < 3) return [];

    const minX = Math.max(0, Math.floor(Math.min(...hull.map(p => p.x)) - 2));
    const minY = Math.max(0, Math.floor(Math.min(...hull.map(p => p.y)) - 2));
    const maxX = Math.min(w, Math.ceil(Math.max(...hull.map(p => p.x)) + 2));
    const maxY = Math.min(h, Math.ceil(Math.max(...hull.map(p => p.y)) + 2));
    const bw = maxX - minX, bh = maxY - minY;
    if (bw < 4 || bh < 4) return [];

    const clip    = document.createElement('canvas');
    clip.width    = bw;
    clip.height   = bh;
    const clipCtx = clip.getContext('2d', { willReadFrequently: true });

    clipCtx.beginPath();
    hull.forEach((p, i) => {
      const lx = p.x - minX, ly = p.y - minY;
      i === 0 ? clipCtx.moveTo(lx, ly) : clipCtx.lineTo(lx, ly);
    });
    clipCtx.closePath();
    clipCtx.clip();
    clipCtx.drawImage(sourceCanvas, -minX, -minY);

    const { data } = clipCtx.getImageData(0, 0, bw, bh);
    const pixels   = [];
    for (let i = 0; i < data.length; i += 20) {
      if (data[i + 3] > 180) {
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }
    }
    return pixels;
  }

  // ─── Algorithmes métriques ────────────────────────────────────

  function computeTeint(pixels) {
    const hsls  = pixels.map(p => rgbToHsl(p.r, p.g, p.b));
    const n     = hsls.length;
    const meanS = hsls.reduce((s, h) => s + h.s, 0) / n;
    const meanL = hsls.reduce((s, h) => s + h.l, 0) / n;
    const stdS  = Math.sqrt(hsls.reduce((s, h) => s + (h.s - meanS) ** 2, 0) / n);
    const stdL  = Math.sqrt(hsls.reduce((s, h) => s + (h.l - meanL) ** 2, 0) / n);
    return Math.round(clamp(100 - stdS * 260 - stdL * 140, 8, 100));
  }

  function computeEclat(pixels) {
    const lums  = pixels.map(p => 0.2126 * p.r / 255 + 0.7152 * p.g / 255 + 0.0722 * p.b / 255);
    const mean  = avg(lums);
    const hsls  = pixels.map(p => rgbToHsl(p.r, p.g, p.b));
    const meanS = avg(hsls.map(h => h.s));

    let lumScore;
    if      (mean < 0.12) lumScore = (mean / 0.12) * 22;
    else if (mean < 0.35) lumScore = 22 + ((mean - 0.12) / 0.23) * 42;
    else if (mean < 0.65) lumScore = 64 + ((mean - 0.35) / 0.30) * 31;
    else                  lumScore = Math.max(22, 95 - ((mean - 0.65) / 0.35) * 73);

    return Math.round(clamp(lumScore + clamp(meanS * 48, 0, 11), 5, 100));
  }

  function computePores(sourceCanvas, srcCtx, landmarks, w, h, landmarkIndices) {
    const lPatch = Math.max(14, Math.floor(Math.min(w, h) * 0.04));
    let totalVar = 0, count = 0;

    const subset = landmarkIndices.slice(0, Math.min(6, landmarkIndices.length));
    subset.forEach(idx => {
      const lm = landmarks[idx];
      if (!lm) return;
      const cx = Math.floor(lm.x * w), cy = Math.floor(lm.y * h);
      const x0 = Math.max(0, cx - lPatch), y0 = Math.max(0, cy - lPatch);
      const pw = Math.min(lPatch * 2, w - x0), ph = Math.min(lPatch * 2, h - y0);
      if (pw < 6 || ph < 6) return;
      totalVar += laplacianVariance(srcCtx.getImageData(x0, y0, pw, ph).data, pw, ph);
      count++;
    });

    if (!count) return 55;
    const normVar = (totalVar / count) * ((640 * 640) / (w * h));
    return Math.round(clamp(100 - normVar * 1.05, 5, 100));
  }

  function computeRedness(pixels) {
    const reds = pixels.map(p => {
      const total = p.r + p.g + p.b;
      return total > 0 ? (p.r - (p.g + p.b) / 2) / total : 0;
    });
    // Recalibré 580→420 : la peau saine renvoie ~45/100 (et non ~70) → les rougeurs
    // ne ressortent que pour une zone réellement plus rouge que le reste du visage.
    return Math.round(clamp(avg(reds) * 420, 0, 100));
  }

  function computeTexture(pixels) {
    const lums = pixels.map(p => 0.299 * p.r / 255 + 0.587 * p.g / 255 + 0.114 * p.b / 255);
    const std  = Math.sqrt(lums.reduce((s, l) => s + (l - avg(lums)) ** 2, 0) / lums.length);
    return Math.round(clamp(100 - std * 320, 5, 100));
  }

  function computeTaches(pixels) {
    const lums = pixels.map(p => 0.2126 * p.r / 255 + 0.7152 * p.g / 255 + 0.0722 * p.b / 255);
    const mean = avg(lums);
    const std  = Math.sqrt(lums.reduce((s, l) => s + (l - mean) ** 2, 0) / lums.length);
    // Seuil abaissé 2.0σ→1.5σ : capte mieux les taches localisées (taches de
    // rousseur, marques). On soustrait le bruit statistique de base (~6,7% sous 1.5σ
    // pour une peau lisse) pour que seules les VRAIES taches en plus fassent chuter le score.
    const darkFraction = lums.filter(l => l < mean - 1.5 * std).length / lums.length;
    const excess = Math.max(0, darkFraction - 0.067);
    return Math.round(clamp(100 - excess * 900, 5, 100));
  }

  function detectUndertone(allPixels, zoneResults, scleraPixels) {
    // Préférer les joues : moins de bruit (ombres front, rouge nez)
    const cheekPixels = [
      ...(zoneResults?.leftCheek?.pixels  || []),
      ...(zoneResults?.rightCheek?.pixels || [])
    ];
    const source = cheekPixels.length >= 80 ? cheekPixels : allPixels;

    // Filtrer ombres (trop sombre) et reflets spéculaires (trop clair)
    const preFilter = source.filter(p => {
      const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
      return lum > 45 && lum < 215;
    });

    // Correction balance des blancs via la sclérotique → compense la lumière ambiante
    const filtered = applyWhiteBalance(preFilter, scleraPixels);
    if (filtered.length < 20) {
      return { type: 'neutral', label: 'Neutre', colorHex: '#D4B896',
               desc: 'Sous-tons équilibrés — l\'or et l\'argent te conviennent également.', confidence: 'low' };
    }

    // ─── Méthode 1 : chromaticité (R−B)/(R+G+B) — invariante à l'éclairage ──
    // Peau chaude : R >> B → ratio élevé. Peau froide : B relativement plus haut → ratio bas.
    const chromScores = filtered.map(p => (p.r - p.b) / ((p.r + p.g + p.b) || 1));
    const meanChrom   = avg(chromScores);

    // ─── Méthode 2 : axe LAB a/b ─────────────────────────────────────────────
    const labs  = filtered.map(p => rgbToLab(p.r, p.g, p.b));
    const meanA = avg(labs.map(l => l.a));
    const meanB = avg(labs.map(l => l.b));
    const meanL = avg(labs.map(l => l.L));

    const fitzpatrick = meanL > 72 ? 'I-II'
                      : meanL > 60 ? 'II-III'
                      : meanL > 50 ? 'III-IV'
                      : meanL > 40 ? 'IV-V'
                      : 'V-VI';

    // ─── Vote multi-méthode ──────────────────────────────────────────────────
    let warmVotes = 0, coolVotes = 0;

    // Vote chromaticité (poids 2 — plus fiable après balance des blancs)
    if      (meanChrom > 0.19)  warmVotes += 2;
    else if (meanChrom > 0.165) warmVotes += 1;
    else if (meanChrom < 0.14)  coolVotes += 2;
    else if (meanChrom < 0.16)  coolVotes += 1;

    // Vote LAB
    if (meanB > meanA + 3 && meanB > 7) warmVotes += 1;
    if (meanA > meanB + 2 && meanA > 5) coolVotes += 1;

    console.log('[SkinAnalysis] Undertone →',
      `chrom:${meanChrom.toFixed(3)} LAB a:${meanA.toFixed(1)} b:${meanB.toFixed(1)}`,
      `pixels:${filtered.length} joues:${cheekPixels.length}`,
      `votes warm:${warmVotes} cool:${coolVotes}`);

    // Confiance : à quelle distance de la frontière neutre
    const chromDiff = Math.abs(meanChrom - 0.17);
    const confidence = (warmVotes >= 3 || coolVotes >= 3 || chromDiff > 0.03) ? 'high'
                     : (warmVotes >= 2 || coolVotes >= 2 || chromDiff > 0.015) ? 'medium'
                     : 'low';

    if (warmVotes > coolVotes) {
      return { type: 'warm', label: 'Chaud · Doré / Pêche', colorHex: '#E8A87C',
               desc: 'Sous-tons dorés et pêchés — l\'or, le cuivre et le corail te subliment naturellement.', fitzpatrick, confidence };
    }
    if (coolVotes > warmVotes) {
      return { type: 'cool', label: 'Froid · Rosé / Bleuté', colorHex: '#C9A8C8',
               desc: 'Sous-tons rosés et bleutés — l\'argent, le bleu givré et le violet bordeaux t\'illuminent.', fitzpatrick, confidence };
    }
    return { type: 'neutral', label: 'Neutre · Équilibré', colorHex: '#C8A882',
             desc: 'Sous-tons équilibrés — l\'or, l\'argent et les tons terreux te vont tous.', fitzpatrick, confidence: 'low' };
  }

  function detectSkinType(zoneResults) {
    const z  = zoneResults;
    const tz = [z.forehead, z.nose].filter(Boolean);
    const lz = [z.leftCheek, z.rightCheek].filter(Boolean);

    if (!tz.length || !lz.length) return { type: 'normale', label: 'Normale', confidence: 60, icon: '◇', note: 'Peau équilibrée' };

    const tEclat = avg(tz.map(z => z.eclat));
    const lEclat = avg(lz.map(z => z.eclat));
    const tPores = avg(tz.map(z => z.pores));
    const lPores = avg(lz.map(z => z.pores));
    const gRed   = avg(Object.values(zoneResults).map(z => z.redness));
    const gEclat = avg(Object.values(zoneResults).map(z => z.eclat));

    if (tEclat > lEclat + 11 || tPores < lPores - 10) {
      return { type: 'mixte', label: 'Mixte', confidence: 78, icon: '⟡',
               note: 'Zone T grasse, joues normales à sèches' };
    }
    if (gEclat > 69 && tPores < 52) {
      return { type: 'grasse', label: 'Grasse', confidence: 74, icon: '◎',
               note: 'Brillances généralisées, pores dilatés' };
    }
    if (gRed > 40 && gEclat < 52) {
      return { type: 'sensible', label: 'Sensible', confidence: 71, icon: '△',
               note: 'Rougeurs fréquentes, réactivité cutanée' };
    }
    if (gEclat < 44 && avg(Object.values(zoneResults).map(z => z.teint)) < 52) {
      return { type: 'seche', label: 'Sèche', confidence: 69, icon: '○',
               note: 'Teint terne, manque de souplesse' };
    }
    return { type: 'normale', label: 'Normale', confidence: 67, icon: '◇',
             note: 'Peau équilibrée avec de légères variations' };
  }

  // ─── Détection forme du visage ────────────────────────────────

  // ─── Carnation : clair / medium / foncé ──────────────────────
  function detectCarnation(allSkinPixels) {
    // Filtrer ombres et reflets
    const filtered = allSkinPixels.filter(p => {
      const lum = 0.299 * (p.r ?? 180) + 0.587 * (p.g ?? 140) + 0.114 * (p.b ?? 120);
      return lum > 50 && lum < 225;
    });
    const pixels = filtered.length >= 30 ? filtered : allSkinPixels;

    // Médiane L (plus robuste que la moyenne contre les zones sombres)
    const labLs = pixels.map(p => rgbToLab(p.r ?? 180, p.g ?? 140, p.b ?? 120).L);
    labLs.sort((a, b) => a - b);
    const medianL = labLs[Math.floor(labLs.length / 2)];

    // Confiance : étroitesse de la distribution
    const p25 = labLs[Math.floor(labLs.length * 0.25)] ?? medianL;
    const p75 = labLs[Math.floor(labLs.length * 0.75)] ?? medianL;
    const confidence = (p75 - p25) < 12 ? 'high' : (p75 - p25) < 22 ? 'medium' : 'low';

    if (medianL > 62) return { type: 'clair',  label: 'Claire', confidence };
    if (medianL > 46) return { type: 'medium', label: 'Medium', confidence };
    return               { type: 'fonce',  label: 'Foncée', confidence };
  }

  // ─── Contraste yeux (iris vs peau) ───────────────────────────
  function detectEyeContrast(sourceCanvas, landmarks, w, h, skinLumNorm) {
    if (!landmarks || landmarks.length < 478) return { level: 'moyen', label: 'Moyen' };
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    function sampleIrisCenter(idx) {
      const lm = landmarks[idx];
      if (!lm) return null;
      const cx = Math.round(lm.x * w), cy = Math.round(lm.y * h);
      const r  = Math.max(5, Math.round(Math.min(w, h) * 0.014));
      const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
      const pw = Math.min(r * 2, w - x0), ph = Math.min(r * 2, h - y0);
      if (pw < 4 || ph < 4) return null;
      const data = ctx.getImageData(x0, y0, pw, ph).data;
      let sum = 0, cnt = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        sum += 0.299 * data[i] / 255 + 0.587 * data[i + 1] / 255 + 0.114 * data[i + 2] / 255;
        cnt++;
      }
      return cnt ? sum / cnt : null;
    }

    const samples = [sampleIrisCenter(468), sampleIrisCenter(473)].filter(v => v !== null);
    if (!samples.length) return { level: 'moyen', label: 'Moyen' };

    const irisLum  = avg(samples);
    const contrast = Math.abs(skinLumNorm - irisLum);
    if (contrast > 0.30) return { level: 'fort',   label: 'Fort'   };
    if (contrast > 0.15) return { level: 'moyen',  label: 'Moyen'  };
    return                      { level: 'faible', label: 'Faible' };
  }

  function detectFaceShape(landmarks, w, h) {
    const pt   = idx => ({ x: landmarks[idx].x * w, y: landmarks[idx].y * h });
    const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const foreheadL = pt(127);
    const foreheadR = pt(356);
    const cheekL    = pt(234);
    const cheekR    = pt(454);
    const jawL      = pt(58);
    const jawR      = pt(288);
    const top       = pt(10);
    const chin      = pt(152);

    const cheekW    = dist(cheekL, cheekR);
    const jawW      = dist(jawL, jawR);
    const faceH     = dist(top, chin);
    const foreheadW = dist(foreheadL, foreheadR);

    if (!cheekW) return { shape: 'oval', label: 'Ovale', diagnosis: diagFaceShape('oval') };

    const ratio         = faceH / cheekW;
    const jawRatio      = jawW / cheekW;
    const foreheadRatio = foreheadW / cheekW;

    let shape;
    if (ratio > 1.65) {
      shape = 'long';
    } else if (ratio < 1.15 && jawRatio > 0.80) {
      shape = 'round';
    } else if (jawRatio > 0.88 && foreheadRatio > 0.85 && ratio < 1.42) {
      shape = 'square';
    } else if (foreheadRatio > 1.04 && jawRatio < 0.78) {
      shape = 'heart';
    } else {
      shape = 'oval';
    }

    return { shape, label: FACE_SHAPE_LABELS[shape], diagnosis: diagFaceShape(shape) };
  }

  const FACE_SHAPE_LABELS = {
    oval:   'Ovale',
    round:  'Rond',
    square: 'Carré',
    heart:  'Cœur',
    long:   'Ovale allongé'
  };

  // ─── Génération des diagnostics — 4 zones max, 1 phrase chacune ──

  function generateDiagnostics(zones, skinType, undertone, faceShape, cernes) {
    const z       = zones;
    const vals    = Object.values(z);
    const gRed    = avg(vals.map(v => v.redness));
    const gPores  = avg(vals.map(v => v.pores));
    const gEclat  = avg(vals.map(v => v.eclat));
    const gTaches = avg(vals.map(v => v.taches));
    const gTeint  = avg(vals.map(v => v.teint));

    // Zone cutanée la plus problématique (score le plus bas)
    const sortedZones = Object.entries(z).sort((a, b) => a[1].score - b[1].score);
    const [worstKey, worstZ] = sortedZones[0] || [null, null];

    const diagnostics = [
      // 1. Profil cutané — toujours affiché
      diagProfile(skinType, gRed, gPores, gEclat),

      // 2. Zone critique — sélectionnée dynamiquement selon les métriques
      diagCriticalZone(worstKey, worstZ, skinType, gRed, gPores, gEclat, gTaches),

      // 3. Éclat & homogénéité — calculé sur l'ensemble du visage
      diagRadiance(gEclat, gTaches, gTeint, skinType),

      // 4. Morphologie & couleurs — forme + sous-tons fusionnés
      diagMorpho(faceShape, undertone)
    ];

    // 5. Cernes — ajouté si détectés
    const cernesDiag = diagCernes(cernes);
    if (cernesDiag) {
      diagnostics.splice(2, 0, cernesDiag); // Inséré après la zone critique
    }

    return diagnostics;
  }

  // Zone 1 — Profil cutané ─────────────────────────────────────────
  function diagProfile(skinType, gRed, gPores, gEclat) {
    const PROFILES = {
      grasse:   {
        text:       `Peau grasse avec pores dilatés (${Math.round(100 - gPores)}/100) et brillances généralisées.`,
        correction: 'Niacinamide 10 % matin pour réguler le sébum + BHA (Acide Salicylique) 2 soirs/semaine pour purifier les pores.'
      },
      mixte:    {
        text:       `Peau mixte — zone T séborrhéique (score pores ${Math.round(100 - gPores)}/100) avec joues normales à sèches.`,
        correction: 'Niacinamide sur la zone T, Céramides sur les joues — deux textures, une seule routine équilibrée.'
      },
      seche:    {
        text:       `Peau sèche avec éclat faible (${Math.round(gEclat)}/100) et manque de souplesse perceptible.`,
        correction: 'Acide Hyaluronique (2 % en sérum) sur peau humide, puis Céramides pour sceller l\'hydratation — matin et soir.'
      },
      sensible: {
        text:       `Peau sensible avec réactivité élevée (rougeurs ${Math.round(gRed)}/100) et barrière fragilisée.`,
        correction: 'Centella Asiatica en sérum calmant + formules sans parfum, sans alcool, sans MIT — rien d\'autre pour l\'instant.'
      },
      normale:  {
        text:       `Peau bien équilibrée — sébum maîtrisé, éclat à ${Math.round(gEclat)}/100, barrière cutanée intacte.`,
        correction: 'Vitamine C 15 % le matin pour booster l\'éclat et prévenir le vieillissement, SPF 50+ quotidien.'
      }
    };
    const p = PROFILES[skinType.type] || PROFILES.normale;
    return { id: 'profile', name: 'Profil cutané', icon: '✦', text: p.text, correction: p.correction };
  }

  // Zone 2 — Zone cutanée critique (sélection dynamique) ────────────
  function diagCriticalZone(key, z, skinType, gRed, gPores, gEclat, gTaches) {
    if (!z) return diagRadiance(gEclat, gTaches, 50, skinType); // fallback

    const ZONE_LABELS = {
      forehead:   { name: 'Front',          icon: '○' },
      leftCheek:  { name: 'Joues',          icon: '◇' },
      rightCheek: { name: 'Joues',          icon: '◇' },
      nose:       { name: 'Nez & Zone T',   icon: '△' },
      chin:       { name: 'Menton',         icon: '◉' }
    };
    const meta = ZONE_LABELS[key] || { name: 'Zone prioritaire', icon: '◈' };

    let text, correction;

    if (z.pores < 42) {
      text       = `Pores visiblement dilatés sur ${meta.name.toLowerCase()} (score ${Math.round(100 - z.pores)}/100) — sébum accumulé en surface.`;
      correction = 'Acide Salicylique 2 % en sérum — kératolytique lipophile, il pénètre dans les pores et dissout le sébum en profondeur.';
    } else if (z.redness > 55) {
      text       = `${meta.name} réactif avec rougeurs mesurées à ${Math.round(z.redness)}/100 — signe d\'inflammation localisée.`;
      correction = 'Centella Asiatica ou Azélique 10 % ciblé sur la zone — anti-inflammatoires prouvés, sans risque d\'irritation supplémentaire.';
    } else if (z.taches < 48) {
      text       = `Irrégularités de pigmentation détectées sur ${meta.name.toLowerCase()} (homogénéité ${Math.round(z.taches)}/100).`;
      correction = 'Vitamine C 10–20 % le matin + SPF 50+ obligatoire — sans filtre UV, aucun soin anti-taches ne peut fonctionner.';
    } else if (z.eclat < 46) {
      text       = `Éclat faible sur ${meta.name.toLowerCase()} (${Math.round(z.eclat)}/100) — accumulation de cellules mortes en surface.`;
      correction = 'Acide Glycolique 7 % en soin du soir, 2 fois/semaine — exfolie la surface et relance le renouvellement cellulaire.';
    } else if (z.texture < 48) {
      text       = `Texture irrégulière sur ${meta.name.toLowerCase()} (score ${Math.round(z.texture)}/100) — surface inégale au toucher.`;
      correction = 'Acide Lactique 5–10 % en exfoliant doux du soir — lisse sans agresser, idéal pour les textures rugueuses.';
    } else {
      text       = `${meta.name} en bonne santé (score global ${Math.round(z.score)}/100) — aucun problème majeur détecté.`;
      correction = 'SPF 50+ quotidien : la prévention est le soin anti-âge le plus efficace prouvé scientifiquement.';
    }

    return { id: 'critical', name: meta.name, icon: meta.icon, text, correction };
  }

  // Zone 3 — Éclat & homogénéité ────────────────────────────────────
  function diagRadiance(gEclat, gTaches, gTeint, skinType) {
    let text, correction;

    if (gTaches < 48 && gEclat < 52) {
      text       = `Teint irrégulier et éclat faible (${Math.round(gEclat)}/100) — taches et manque de luminosité combinés.`;
      correction = 'Protocole double : Vitamine C 15 % (matin, éclat + anti-taches) + Acide Glycolique 7 % (soir, exfoliation) — résultats en 4–6 semaines.';
    } else if (gTaches < 50) {
      text       = `Des inégalités de pigmentation sont présentes sur l\'ensemble du visage (homogénéité ${Math.round(gTaches)}/100).`;
      correction = 'Vitamine C stabilisée (L-ascorbique ou dérivés) le matin + SPF 50+ — le duo incontournable pour unifier durablement.';
    } else if (gEclat < 48) {
      text       = `L\'éclat global est faible (${Math.round(gEclat)}/100) — la peau manque de luminosité naturelle.`;
      correction = skinType.type === 'seche'
        ? 'Acide Hyaluronique pour l\'hydratation + Vitamine C pour l\'éclat — deux actifs complémentaires à associer le matin.'
        : 'Acide Glycolique 5–10 % en exfoliant hebdomadaire + Niacinamide quotidien — renouvellement et uniformité en 3 semaines.';
    } else if (gEclat > 72 && gTaches > 70) {
      text       = `Éclat et homogénéité excellents (${Math.round(gEclat)}/100) — teint uniforme et lumineux sur toutes les zones.`;
      correction = 'Maintiens avec Vitamine C le matin et SPF 50+ chaque jour — la constance est la clé pour préserver ces résultats.';
    } else {
      text       = `Teint globalement homogène (${Math.round(gTeint)}/100) avec un éclat satisfaisant — quelques variations mineures.`;
      correction = 'Niacinamide 5 % quotidien suffit pour stabiliser et affiner — simple, efficace, bien toléré par tous les types de peau.';
    }

    return { id: 'radiance', name: 'Éclat & Homogénéité', icon: '◈', text, correction };
  }

  // Zone 4 — Cernes (si détectés) ───────────────────────────────────
  function diagCernes(cernes) {
    if (!cernes || !cernes.detected) return null;

    const CERNES_INFO = {
      bleu: {
        label: 'Cernes bleus / violets',
        text: `Cernes vasculaires ${cernes.intensity}s — la microcirculation sous l'œil laisse transparaître les vaisseaux sanguins à travers la peau fine.`,
        correction: 'Caféine 5 % en contour des yeux pour stimuler la circulation + correcteur pêche/orangé pour neutraliser le bleu avant le fond de teint.'
      },
      rouge: {
        label: 'Cernes rouges / rosés',
        text: `Cernes inflammatoires ${cernes.intensity}s — irritation ou frottements fréquents de la zone périorbitaire.`,
        correction: 'Contour des yeux à la Vitamine K ou Arnica pour apaiser + correcteur jaune/beige pour neutraliser les rougeurs.'
      },
      marron: {
        label: 'Cernes pigmentés',
        text: `Cernes pigmentaires ${cernes.intensity}s — accumulation de mélanine sous l'œil, souvent d'origine génétique ou post-inflammatoire.`,
        correction: 'Vitamine C stabilisée + Rétinol doux (0.2-0.3 %) en contour des yeux le soir. SPF indispensable pour éviter l\'aggravation.'
      }
    };

    const info = CERNES_INFO[cernes.type] || CERNES_INFO.marron;

    return {
      id: 'cernes',
      name: info.label,
      icon: '◐',
      text: info.text,
      correction: info.correction
    };
  }

  // Zone 5 — Morphologie & sous-tons ────────────────────────────────
  function diagMorpho(faceShape, undertone) {
    const shapeAdvice = {
      oval:   'Toutes les techniques de contouring te conviennent — blush en diagonal sur les pommettes pour sublimer naturellement.',
      round:  'Blush en hauteur sur les pommettes et contouring vertical léger pour allonger visuellement le visage.',
      square: 'Blush en diagonal sur les pommettes hautes et contouring doux sur les coins de la mâchoire pour adoucir.',
      heart:  'Blush vers le bas sur les pommettes pour équilibrer le menton fin — highlighter discret sur le menton si souhaité.',
      long:   'Blush horizontal sur les joues pour créer de la largeur — évite les highlighters verticaux qui accentuent la longueur.'
    };
    const toneAdvice = {
      warm:    'teintes chaudes (corail, pêche, or, cuivre)',
      cool:    'teintes froides (bordeaux, mauve, rose, argent)',
      neutral: 'teintes universelles (nude, terracotta, bronze)'
    };

    const shape      = faceShape?.shape || 'oval';
    const shapeLabel = faceShape?.label || 'Ovale';
    const toneLabel  = undertone?.label?.split('·')[0]?.trim() || 'Neutre';
    const tone       = undertone?.type || 'neutral';

    const text       = `Visage ${shapeLabel.toLowerCase()} avec sous-tons ${toneLabel.toLowerCase()} — morphologie qui guide chaque décision maquillage.`;
    const correction = `${shapeAdvice[shape] || shapeAdvice.oval} Tes ${toneAdvice[tone] || toneAdvice.neutral} te subliment naturellement.`;

    return { id: 'morpho', name: 'Morphologie & Couleurs', icon: '⬡', text, correction };
  }

  function diagFaceShape(shape) {
    const map = {
      oval:   { text: 'Visage ovale — proportions harmonieuses.', correction: 'Blush en diagonal sur les pommettes.' },
      round:  { text: 'Visage rond — apparence juvénile et joues pleines.', correction: 'Blush en hauteur sur les pommettes pour allonger visuellement.' },
      square: { text: 'Visage carré — structure forte et mâchoire anguleuse.', correction: 'Blush en diagonal haut + contouring doux sur la mâchoire.' },
      heart:  { text: 'Visage en cœur — front large et menton fin.', correction: 'Blush vers le bas sur les pommettes pour équilibrer.' },
      long:   { text: 'Visage allongé — élégance verticale naturelle.', correction: 'Blush horizontal pour créer de la largeur visuelle.' }
    };
    return map[shape] || map.oval;
  }

  // ─── Priorités peau ────────────────────────────────────────────

  function buildSkinPriorities(skinType, zones) {
    const gRed    = avg(Object.values(zones).map(z => z.redness));
    const gPores  = avg(Object.values(zones).map(z => z.pores));
    const gEclat  = avg(Object.values(zones).map(z => z.eclat));
    const gTaches = avg(Object.values(zones).map(z => z.taches));
    const list    = [];

    if (skinType.type === 'grasse' || gPores < 50)
      list.push('Réguler le sébum et resserrer les pores');
    if (skinType.type === 'seche' || gEclat < 48)
      list.push('Hydrater en profondeur et nourrir la barrière cutanée');
    if (gRed > 48 || skinType.type === 'sensible')
      list.push('Apaiser les rougeurs et renforcer la barrière cutanée');
    if (gTaches < 52)
      list.push('Uniformiser le teint et atténuer les taches');
    if (skinType.type === 'mixte')
      list.push('Équilibrer la zone T sans assécher les joues');
    if (gEclat < 52 && gTaches >= 52)
      list.push('Retrouver de l\'éclat et de la luminosité');
    if (!list.length)
      list.push('Maintenir l\'éclat et prévenir le vieillissement prématuré');

    return list.slice(0, 3);
  }

  function getSkinSensitivity(zones) {
    const gRed = avg(Object.values(zones).map(z => z.redness));
    if (gRed > 55) return 'Élevée';
    if (gRed > 40) return 'Modérée';
    return 'Faible';
  }

  // ─── Rendu du rapport ─────────────────────────────────────────

  async function initScreen() {
    const content = document.getElementById('skinAnalysisContent');
    if (!content) return;

    if (!AppState.face.photo) {
      content.innerHTML = `
        <div class="skin-empty-state">
          <span class="skin-empty-icon">◇</span>
          <h2>Aucune photo détectée</h2>
          <p>Commence par prendre ou uploader une photo pour obtenir ton diagnostic peau.</p>
          <button class="btn btn-dark" onclick="showScreen('capture')">Ajouter une photo →</button>
          <button class="btn btn-outline" onclick="Questionnaire.startSkincare()" style="margin-top:8px">
            Passer cette étape
          </button>
        </div>`;
      return;
    }

    if (AppState.face.skinAnalysis) {
      // Si sourceCanvas manque (rechargement de page), le recréer depuis la photo
      if (!AppState.face.sourceCanvas && AppState.face.photo) {
        try {
          const img = new Image();
          img.src = AppState.face.photo;
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
          const sc = document.createElement('canvas');
          sc.width  = img.naturalWidth;
          sc.height = img.naturalHeight;
          sc.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
          AppState.face.sourceCanvas = sc;
        } catch(e) { console.warn('[SkinAnalysis] Recréation sourceCanvas échouée', e); }
      }
      renderReport(AppState.face.skinAnalysis, content);
      if (typeof window.LookGenerator !== 'undefined' && window.LookGenerator.generate && AppState.face.sourceCanvas && AppState.face.landmarks) {
        const looksEl = document.createElement('div');
        content.appendChild(looksEl);
        try { await window.LookGenerator.generate(looksEl, AppState.face.sourceCanvas, AppState.face.landmarks, AppState.face.skinAnalysis); } catch(e) {}
      }
      // MakeupAI désactivé temporairement
      // if (typeof window.MakeupAI !== 'undefined' && AppState.face.sourceCanvas && AppState.face.landmarks) {
      //   const aiEl = document.createElement('div');
      //   content.appendChild(aiEl);
      //   try { window.MakeupAI.generate(aiEl, AppState.face.sourceCanvas, AppState.face.landmarks, AppState.face.skinAnalysis); } catch(e) {}
      // }
      return;
    }

    content.innerHTML = `
      <div class="skin-loading-screen">
        <div class="skin-scan-anim">
          <div class="skin-scan-face">
            <div class="skin-scan-line"></div>
          </div>
        </div>
        <p class="skin-loading-title">Analyse de ta peau en cours…</p>
        <p class="skin-loading-sub">
          Détection des zones · Colorimétrie · Intelligence artificielle ✦
        </p>
      </div>`;

    try {
      // Analyse locale d'abord (calcule les landmarks), puis vision IA sur un
      // gros plan recadré haute déf du visage → bien meilleure détection des petites taches.
      const result = await analyzeFromPhoto(AppState.face.photo);
      const vision = await callFaceVision(AppState.face.photo, AppState.face.landmarks);

      if (!result) {
        content.innerHTML = `
          <div class="skin-empty-state">
            <span class="skin-empty-icon">○</span>
            <h2>Visage non détecté</h2>
            <p>Essaie avec une photo de face, bien éclairée, sans lunettes de soleil.</p>
            <button class="btn btn-dark" onclick="showScreen('capture')">Reprendre une photo</button>
            <button class="btn btn-outline" onclick="Questionnaire.startSkincare()" style="margin-top:8px">
              Continuer sans analyse →
            </button>
          </div>`;
        return;
      }

      result.vision = vision || {};
      _applyVisionSignals(result); // la vision IA peut faire remonter taches/imperfections
      AppState.face.skinAnalysis = result;
      renderReport(result, content);
      console.log('[LookGen] LookGenerator défini?', typeof window.LookGenerator, '| sourceCanvas?', !!AppState.face.sourceCanvas, '| landmarks?', !!AppState.face.landmarks);
      if (typeof window.LookGenerator !== 'undefined' && window.LookGenerator.generate) {
        const looksEl = document.createElement('div');
        content.appendChild(looksEl);
        try {
          await window.LookGenerator.generate(looksEl, AppState.face.sourceCanvas, AppState.face.landmarks, result);
          console.log('[LookGen] Carousel généré OK');
        } catch(e) {
          console.error('[LookGen] Erreur génération:', e);
        }
      }
      // MakeupAI désactivé temporairement
      // if (typeof window.MakeupAI !== 'undefined') {
      //   const aiEl = document.createElement('div');
      //   content.appendChild(aiEl);
      //   try { window.MakeupAI.generate(aiEl, AppState.face.sourceCanvas, AppState.face.landmarks, result); } catch(e) { console.error('[MakeupAI]', e); }
      // }
      if (typeof SkinJourney !== 'undefined' && SkinJourney.isActive()) {
        SkinJourney.addAnalysis();
      }
    } catch (err) {
      console.error('[SkinAnalysis] Erreur analyse:', err);
      content.innerHTML = `
        <div class="skin-empty-state">
          <span class="skin-empty-icon">⚠</span>
          <h2>Analyse temporairement indisponible</h2>
          <p>Le moteur d'analyse n'a pas pu se charger sur cet appareil.<br>
          <small style="color:var(--muted)">${err.message || 'Erreur inconnue'}</small></p>
          <button class="btn btn-dark" onclick="Questionnaire.startSkincare()">
            Continuer sans analyse →
          </button>
          <button class="btn btn-outline" onclick="showScreen('capture')" style="margin-top:10px">
            ← Réessayer avec une autre photo
          </button>
        </div>`;
    }
  }

  // ── Profil peau complet — croise photo + questionnaire ─────────
  function buildSkinProfile(result, answers = {}) {
    const { zones = {}, skinType, cernes } = result;
    const st  = skinType?.type || 'normale';
    const zv  = Object.values(zones);
    const n   = zv.length || 1;
    const m   = key => zv.reduce((s, z) => s + (z[key] || 60), 0) / n;

    const mPores  = m('pores');
    const mEclat  = m('eclat');
    const mRed    = m('redness');
    const mTeint  = m('teint');
    const mTaches = m('taches');

    // Zone T (front + nez) vs joues
    const zT    = ['forehead','nose'].map(k => zones[k]).filter(Boolean);
    const zJ    = ['leftCheek','rightCheek'].map(k => zones[k]).filter(Boolean);
    const mPorT = zT.length ? zT.reduce((s,z) => s+(z.pores||60),0)/zT.length : mPores;
    const mPorJ = zJ.length ? zJ.reduce((s,z) => s+(z.pores||60),0)/zJ.length : mPores;
    const mRedT = zT.length ? zT.reduce((s,z) => s+(z.redness||60),0)/zT.length : mRed;

    // Questionnaire
    const qSkin = answers.skinType   || null;
    const qConc = Array.isArray(answers.concerns) ? answers.concerns : [];
    const qObj  = answers.objectives || null;
    const qAge  = answers.ageGroup   || null;

    // ── Types de peau ─────────────────────────────────────────────
    const skinTypes = [];
    const photoST   = st;
    const quizST    = qSkin;
    if (photoST !== 'normale' && quizST && photoST === quizST) {
      skinTypes.push({ type: photoST, source: 'both', confidence: 'high' });
    } else {
      if (quizST && quizST !== 'normale') skinTypes.push({ type: quizST, source: 'questionnaire', confidence: 'medium' });
      if (photoST !== 'normale' && photoST !== quizST) skinTypes.push({ type: photoST, source: 'photo', confidence: 'medium' });
    }
    if (!skinTypes.length) skinTypes.push({ type: 'normale', source: 'both', confidence: 'medium' });
    if (qAge === '40+' || qAge === '30-40') skinTypes.push({ type: 'mature', source: 'questionnaire', confidence: qAge === '40+' ? 'high' : 'medium' });
    if (qAge === 'moins-20' || qAge === '20-25') skinTypes.push({ type: 'jeune', source: 'questionnaire', confidence: 'high' });
    if ((quizST === 'sensible' || qConc.includes('rougeurs')) && !skinTypes.find(s => s.type === 'sensible')) {
      skinTypes.push({ type: 'sensible', source: quizST === 'sensible' ? 'both' : 'questionnaire', confidence: 'medium' });
    }

    // ── Caractéristiques ──────────────────────────────────────────
    const characteristics = [];
    const add = (id, label, detected, opts = {}) => {
      if (!detected) return;
      characteristics.push({ id, label, detected: true,
        source:             opts.source     || 'photo',
        confidence:         opts.confidence || 'medium',
        zones:              opts.zones      || [],
        explanation_simple: opts.explanation|| label + '.',
        needs:              opts.needs      || []
      });
    };

    // Hydratation / déshydratation
    const isDehydrated = mTeint < 46 || qConc.includes('deshydration');
    const isSkinSeche  = st === 'seche' || qSkin === 'seche';
    add('dehydration', 'Manque d\'hydratation', isDehydrated, {
      source:      (isDehydrated && qConc.includes('deshydration')) ? 'both' : isDehydrated ? 'photo' : 'questionnaire',
      confidence:  isSkinSeche ? 'high' : 'medium',
      zones:       ['joues', 'contour des yeux'],
      explanation: isSkinSeche
        ? 'Ta peau semble manquer d\'eau — elle peut tirailler et absorber les soins très vite.'
        : 'Ta peau paraît légèrement déshydratée — un bon soin hydratant peut faire une vraie différence.',
      needs: ['hydratation', ...(isSkinSeche ? ['barriere'] : [])]
    });

    // Barrière cutanée fragilisée
    add('barriere', 'Barrière cutanée fragilisée', isSkinSeche && mRed > 38, {
      source: quizST === 'sensible' ? 'both' : 'photo',
      confidence: 'medium',
      zones: ['joues', 'front'],
      explanation: 'Ta peau semble fragilisée : elle a besoin d\'être apaisée et renforcée de l\'intérieur.',
      needs: ['barriere', 'apaisement']
    });

    // Brillance zone T / peau mixte
    const hasBrillanceT      = (st === 'mixte' || mPorT < 48) && !(st === 'grasse');
    const hasBrillanceGlobal = st === 'grasse' || (mPorT < 48 && mPorJ < 48);
    add('sebum_tzone', 'Brillance zone T', hasBrillanceT, {
      source:      (st === 'mixte' && quizST === 'mixte') ? 'both' : 'photo',
      confidence:  st === 'mixte' ? 'high' : 'medium',
      zones:       ['front', 'nez'],
      explanation: 'Ta zone T semble produire un peu plus de sébum — une formule équilibrante sera parfaite.',
      needs: ['matifiant', 'pores']
    });
    add('sebum_global', 'Peau grasse / excès de sébum', hasBrillanceGlobal, {
      source:      (st === 'grasse' && quizST === 'grasse') ? 'both' : 'photo',
      confidence:  'medium',
      zones:       ['front', 'nez', 'joues'],
      explanation: 'Ta peau semble produire un excès de sébum — des formules légères et purifiantes t\'iront mieux.',
      needs: ['matifiant', 'pores', 'purification']
    });

    // Pores / grain de peau
    add('pores_visibles', 'Pores visibles', mPores < 52 || qConc.includes('pores'), {
      source:      qConc.includes('pores') ? 'both' : 'photo',
      confidence:  mPores < 40 ? 'high' : 'medium',
      zones:       ['nez', 'front', 'joues'],
      explanation: 'Les pores paraissent légèrement visibles — un soin affinant peut lisser le grain de peau.',
      needs: ['pores', 'texture']
    });

    // Rougeurs
    const hasRougeurs = mRed > 42 || qConc.includes('rougeurs');
    add('rougeurs', 'Rougeurs visibles', hasRougeurs, {
      source:      (mRed > 42 && qConc.includes('rougeurs')) ? 'both' : mRed > 42 ? 'photo' : 'questionnaire',
      confidence:  mRed > 55 ? 'high' : 'medium',
      zones:       ['joues', 'nez'],
      explanation: 'Des rougeurs sont visibles — les formules apaisantes et sans parfum seront tes alliées.',
      needs: ['rougeurs', 'apaisement']
    });

    // Sensibilité (sans rougeurs visibles)
    const isSensible = st === 'sensible' || quizST === 'sensible';
    add('sensibilite', 'Peau sensible / réactive', isSensible && !hasRougeurs, {
      source: 'questionnaire', confidence: 'medium',
      zones: ['joues'],
      explanation: 'Ta peau semble réactive — mieux vaut privilégier des formules douces, sans parfum ni alcool.',
      needs: ['rougeurs', 'apaisement']
    });

    // Teint terne / manque d'éclat
    const hasTeintTerne = mEclat < 45 || qConc.includes('eclat_terne') || qObj === 'eclat';
    add('teint_terne', 'Teint terne', hasTeintTerne, {
      source:      (mEclat < 45 && qConc.includes('eclat_terne')) ? 'both' : mEclat < 45 ? 'photo' : 'questionnaire',
      confidence:  mEclat < 35 ? 'high' : 'medium',
      zones:       ['front', 'joues'],
      explanation: 'Ton teint paraît légèrement voilé — il a besoin d\'être réveillé et éclairé.',
      needs: ['eclat', 'uniformite']
    });

    // Taches / irrégularités
    const hasTaches = mTaches < 52 || qConc.includes('taches');
    add('taches_pigm', 'Irrégularités de teint', hasTaches, {
      source:      (mTaches < 52 && qConc.includes('taches')) ? 'both' : mTaches < 52 ? 'photo' : 'questionnaire',
      confidence:  mTaches < 40 ? 'high' : 'medium',
      zones:       ['joues', 'front'],
      explanation: 'Quelques irrégularités de teint sont visibles — un soin uniformisant peut faire une vraie différence.',
      needs: ['uniformite', 'eclat']
    });

    // Imperfections / acné
    const hasAcne = qConc.includes('acne') || (mTaches < 40 && mRed > 45);
    add('imperfections', 'Imperfections localisées', hasAcne, {
      source:      qConc.includes('acne') ? 'both' : 'photo',
      confidence:  qConc.includes('acne') ? 'high' : 'medium',
      zones:       ['menton', 'front', 'joues'],
      explanation: 'Ta peau paraît sujette aux imperfections — des actifs purifiants ciblés peuvent t\'aider.',
      needs: ['imperfections', 'purification']
    });

    // Cernes
    const hasCernes = cernes?.detected || qConc.includes('cernes');
    add('cernes', 'Cernes / contour des yeux fatigué', hasCernes, {
      source:      (cernes?.detected && qConc.includes('cernes')) ? 'both' : cernes?.detected ? 'photo' : 'questionnaire',
      confidence:  cernes?.intensity === 'marqués' ? 'high' : 'medium',
      zones:       ['contour des yeux'],
      explanation: 'Des cernes sont visibles — le contour des yeux a besoin d\'hydratation et d\'attention ciblée.',
      needs: ['cernes']
    });

    // Ridules / anti-âge
    const hasRides = qConc.includes('rides') || qAge === '40+' || (qAge === '30-40' && qObj === 'anti-age');
    add('ridules', 'Ridules / signes du temps', hasRides, {
      source:      'questionnaire', confidence: qAge === '40+' ? 'high' : 'medium',
      zones:       ['contour des yeux', 'front'],
      explanation: 'Ta peau montre des signes du temps — les formules anti-âge peuvent lisser et raffermir.',
      needs: ['ridules', 'anti_age']
    });

    // Couvrance
    add('couvrance', 'Besoin de couvrance', mTaches < 40 || mRed > 55, {
      source: 'photo', confidence: 'medium',
      zones:  ['joues', 'nez'],
      explanation: 'Des irrégularités visibles peuvent bénéficier d\'une couvrance adaptée.',
      needs: ['couvrance', 'uniformite']
    });

    // ── Besoins consolidés (déduplication) ────────────────────────
    const needs = [...new Set(characteristics.flatMap(c => c.needs))];

    return { skinTypes, characteristics, needs };
  }

  // ── Détection des besoins (rétrocompatible) ────────────────────
  function detectNeeds(result) {
    const answers = AppState?.questionnaire?.answers || {};
    return buildSkinProfile(result, answers).needs;
  }

  // ── Génère l'explication personnalisée pour un produit ────────
  function buildProductReason(product, needs, result) {
    const matched = (product.concernTags || []).filter(t => needs.includes(t));
    if (!matched.length) return null;

    const st = result.skinType?.type || 'normale';
    const LABELS = {
      rougeurs:      'des rougeurs visibles sur ton visage',
      apaisement:    'une peau qui a besoin d\'être apaisée',
      cernes:        'des cernes sous les yeux',
      pores:         'des pores visibles',
      texture:       'un grain de peau irrégulier',
      hydratation:   'une peau qui a besoin d\'hydratation',
      barriere:      'une barrière cutanée fragilisée',
      matifiant:     'une zone T qui a tendance à briller',
      purification:  'une peau sujette aux imperfections',
      imperfections: 'quelques imperfections localisées',
      ridules:       'des ridules d\'expression',
      anti_age:      'des besoins anti-âge',
      eclat:         'un teint qui manque d\'éclat',
      couvrance:     'une irrégularité de teint à corriger',
      uniformite:    'un teint légèrement irrégulier',
      deshydratation:'une peau déshydratée'
    };

    const raisons = matched.map(t => LABELS[t]).filter(Boolean);
    if (!raisons.length) return null;

    const debut = raisons.length === 1
      ? `Recommandé car tu as ${raisons[0]}.`
      : `Recommandé car tu as ${raisons.slice(0,-1).join(', ')} et ${raisons[raisons.length-1]}.`;

    return debut;
  }

  // ── Analyse détaillée du visage en 3 niveaux ──────────────────
  function buildFaceObservations(result) {
    const { zones = {}, undertone, skinType, faceShape, cernes, carnation, eyeContrast } = result;
    const ut = undertone?.type    || 'neutral';
    const st = skinType?.type     || 'normale';
    const ec = eyeContrast?.level || 'moyen';
    const fs = faceShape?.type    || 'oval';

    const zv = Object.values(zones);
    const n  = zv.length || 1;
    const m  = key => zv.reduce((s,z) => s + (z[key] || 60), 0) / n;
    const mPores = m('pores'), mEclat = m('eclat'), mRed = m('redness');
    const mTeint = m('teint'), mTaches = m('taches');

    // ── 1. Ce que ton visage montre ──────────────────────────────
    const montreParts = [];

    if (mPores < 45)       montreParts.push('un grain de peau irrégulier sur la zone T');
    else if (mPores > 75)  montreParts.push('un grain de peau fin et régulier');
    else                   montreParts.push('un grain de peau équilibré');

    if (mEclat < 40)       montreParts.push('un teint légèrement voilé qui manque d\'éclat');
    else if (mEclat > 72)  montreParts.push('une peau naturellement lumineuse');
    else                   montreParts.push('un éclat naturel présent');

    if (mRed > 42)         montreParts.push(`des rougeurs ${mRed > 58 ? 'diffuses' : 'légères'} visibles`);
    if (mTaches < 52)      montreParts.push('quelques irrégularités de teint localisées');
    if (cernes?.detected)  montreParts.push(`des cernes ${cernes.intensity === 'marqués' ? 'marqués' : 'légers'} sous les yeux`);

    const shapeLabels = { oval:'ovale', round:'rond', square:'carré', heart:'en cœur', long:'allongé', diamond:'en losange' };
    montreParts.push(`une morphologie ${shapeLabels[fs] || 'ovale'}`);

    const montre = montreParts.slice(0, 3).join(', ') + (montreParts.length > 3 ? ` et ${montreParts.slice(3).join(', ')}` : '') + '.';

    // ── 2. Ce que ça veut dire pour toi ─────────────────────────
    const veut = (() => {
      const lines = [];

      if (mEclat < 40)
        lines.push('Certaines zones absorbent la lumière au lieu de la refléter — le visage paraît plus fatigué qu\'il ne l\'est.');
      else if (mEclat > 72)
        lines.push('Ton éclat naturel est un vrai atout — une formule chargée l\'éteindrait plutôt que de l\'amplifier.');
      else
        lines.push('Ta peau a une belle base naturelle — elle n\'a pas besoin d\'être cachée, juste sublimée.');

      if (st === 'mixte')
        lines.push('Avec une peau mixte, la zone T et les joues ne demandent pas le même traitement.');
      else if (st === 'seche' || mTeint < 46)
        lines.push('La peau sèche absorbe le fond de teint de façon inégale — l\'hydratation en amont est essentielle.');

      if (cernes?.detected)
        lines.push('Les cernes fatiguent l\'ensemble du regard — c\'est la zone prioritaire à traiter en premier.');

      return lines.slice(0, 2).join(' ');
    })();

    // ── 3. Ce qui va t'aller le mieux ───────────────────────────
    const aller = (() => {
      const harmMap = {
        warm_fort:     'Les teintes chaudes et intenses te vont parfaitement — terracotta, pêche doré, nude chaud. Tu peux assumer des looks construits sans paraître trop chargée.',
        warm_moyen:    'Mise sur l\'éclat plutôt que la couvrance. Blush pêche, highlighter discret, lèvres corail ou nude chaud — tout ce qui amplifie sans alourdir.',
        warm_faible:   'Les touches légères sont tes meilleures alliées. Baume teinté nude, blush pêche très léger, mascara seul — l\'effet "peau réelle améliorée" te va parfaitement.',
        cool_fort:     'Les couleurs froides et intenses créent un impact exceptionnel sur toi. Rose framboise, bordeaux léger, prune discret — la profondeur te va naturellement.',
        cool_moyen:    'Tu portes très bien les looks structurés. Blush rose, fard taupe ou mauve doux, lèvres nude rosé — l\'élégance est dans la précision.',
        cool_faible:   'La fraîcheur naturelle de ta peau est ton charme. Rose pâle, nude bleuté, baume rosé transparent — les textures légères te mettent le plus en valeur.',
        neutral_fort:  'Tu as une grande liberté — les teintes chaudes comme froides fonctionnent. Laisse l\'occasion guider le look, ta peau s\'adapte à tout.',
        neutral_moyen: 'Ta polyvalence est rare. Tu peux porter autant un look naturel qu\'un look du soir sans contrainte de sous-ton — explore et ajuste selon l\'envie.',
        neutral_faible:'Les effets "no makeup makeup" te correspondent parfaitement. Quelques touches ciblées suffisent à créer une différence visible sans surcharger.'
      };
      return harmMap[`${ut}_${ec}`] || harmMap['neutral_moyen'];
    })();

    return { montre, veut, aller };
  }

  function renderFaceObsHTML(result) {
    const { montre, veut, aller } = buildFaceObservations(result);

    return `
      <div class="mkr-bloc fobs-bloc">
        <div class="fobs-section">
          <span class="fobs-section-label">Ce que ton visage montre</span>
          <p class="fobs-section-text">${montre}</p>
        </div>
        <div class="fobs-section">
          <span class="fobs-section-label">Ce que ça veut dire pour toi</span>
          <p class="fobs-section-text">${veut}</p>
        </div>
        <div class="fobs-section">
          <span class="fobs-section-label">Ce qui va t'aller le mieux</span>
          <p class="fobs-section-text">${aller}</p>
        </div>
      </div>`;
  }

  function renderSkinProfileHTML(skinProfile) {
    const { skinTypes, characteristics } = skinProfile;

    // ── Phrase résumé ─────────────────────────────────────────────
    const ST_LABELS = {
      normale: 'normale', grasse: 'grasse', seche: 'sèche', mixte: 'mixte',
      sensible: 'sensible', mature: 'mature', jeune: 'jeune', reactive: 'réactive'
    };
    const primaryTypes = skinTypes.filter(s => s.confidence !== 'low').map(s => ST_LABELS[s.type] || s.type);
    const summaryTypes = primaryTypes.length ? `peau ${primaryTypes.join(', ')}` : 'peau normale';

    const charLabelsShort = characteristics.slice(0, 4).map(c => c.explanation_simple);
    const summaryPhrase = charLabelsShort.length
      ? `Ta peau semble <strong>${summaryTypes}</strong>. ${charLabelsShort[0]}`
      : `Ta peau semble <strong>${summaryTypes}</strong>.`;

    // ── Besoins prioritaires ──────────────────────────────────────
    const NEED_LABELS = {
      hydratation:   { label: 'Hydrater',              icon: '💧' },
      barriere:      { label: 'Renforcer la barrière',  icon: '🛡' },
      matifiant:     { label: 'Rééquilibrer le sébum',  icon: '🌿' },
      pores:         { label: 'Affiner le grain',        icon: '✦' },
      texture:       { label: 'Lisser la texture',       icon: '✦' },
      rougeurs:      { label: 'Apaiser les rougeurs',   icon: '🌸' },
      apaisement:    { label: 'Apaiser',                 icon: '🌸' },
      eclat:         { label: 'Raviver l\'éclat',        icon: '☀' },
      uniformite:    { label: 'Uniformiser le teint',   icon: '✨' },
      imperfections: { label: 'Purifier',                icon: '🫧' },
      purification:  { label: 'Purifier',                icon: '🫧' },
      cernes:        { label: 'Défatiguer le regard',   icon: '👁' },
      ridules:       { label: 'Lisser et raffermir',     icon: '🌺' },
      anti_age:      { label: 'Action anti-âge',         icon: '🌺' },
      couvrance:     { label: 'Corriger le teint',       icon: '🎨' },
    };

    const uniqueNeeds = [...new Set(characteristics.flatMap(c => c.needs))];
    const priorityNeeds = uniqueNeeds.slice(0, 5);
    const needsHTML = priorityNeeds.map((n, i) => {
      const nl = NEED_LABELS[n];
      if (!nl) return '';
      return `<div class="skin-need-item"><span class="skin-need-num">${i+1}</span><span class="skin-need-icon">${nl.icon}</span><span class="skin-need-label">${nl.label}</span></div>`;
    }).filter(Boolean).join('');

    // ── Caractéristiques détectées ────────────────────────────────
    const SRC_LABELS = { photo: 'photo', questionnaire: 'questionnaire', both: 'photo + questionnaire' };
    const CONF_DOTS  = { high: '●●●', medium: '●●○', low: '●○○' };
    const charsHTML  = characteristics.map(c => `
      <div class="skin-char-item">
        <div class="skin-char-header">
          <span class="skin-char-label">${c.label}</span>
          <span class="skin-char-meta">${SRC_LABELS[c.source] || c.source} · <span title="${c.confidence}">${CONF_DOTS[c.confidence] || '●●○'}</span></span>
        </div>
        <p class="skin-char-explain">${c.explanation_simple}</p>
        ${c.zones.length ? `<div class="skin-char-zones">${c.zones.map(z=>`<span>${z}</span>`).join('')}</div>` : ''}
      </div>`).join('');

    if (!characteristics.length) return '';

    return `
      <div class="mkr-bloc skin-profile-bloc">
        <h2 class="mkr-bloc-title">🔍 Profil de ta peau</h2>
        <p class="skin-profile-summary">${summaryPhrase}</p>
        ${needsHTML ? `
        <div class="skin-needs-section">
          <span class="skin-needs-title">Besoins prioritaires</span>
          <div class="skin-needs-grid">${needsHTML}</div>
        </div>` : ''}
        <div class="skin-chars-list">${charsHTML}</div>
      </div>`;
  }

  // ─── Analyse vision via Haiku ────────────────────────────────

  // Recadre l'image originale sur le visage (via landmarks) en haute déf →
  // le visage occupe 100% de l'image envoyée à l'IA = bien plus de détail sur la peau.
  async function _buildFaceCrop(photoDataUrl, landmarks) {
    if (!landmarks || !landmarks.length) return photoDataUrl;
    try {
      const img = new Image();
      img.src = photoDataUrl;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const W = img.naturalWidth, H = img.naturalHeight;
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of landmarks) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      // Marge autour du visage (front + menton inclus)
      const padX = (maxX - minX) * 0.18, padY = (maxY - minY) * 0.22;
      const x0 = Math.max(0, (minX - padX)) * W;
      const y0 = Math.max(0, (minY - padY)) * H;
      const x1 = Math.min(1, (maxX + padX)) * W;
      const y1 = Math.min(1, (maxY + padY)) * H;
      const cw = x1 - x0, ch = y1 - y0;
      if (cw < 40 || ch < 40) return photoDataUrl;
      // Sortie haute déf : 1100px sur le grand côté (sans dépasser l'original)
      const target = 1100;
      const scale = Math.min(target / Math.max(cw, ch), 2);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(cw * scale);
      canvas.height = Math.round(ch * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x0, y0, cw, ch, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      return photoDataUrl;
    }
  }

  async function callFaceVision(photoDataUrl, landmarks) {
    try {
      const photoForAI = await _buildFaceCrop(photoDataUrl, landmarks);
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(apiUrl('/api/faceVision'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ photo: photoForAI }),
        signal:  controller.signal
      });
      clearTimeout(tid);
      if (!resp.ok) return {};
      return await resp.json();
    } catch(e) {
      console.warn('[FaceVision] indisponible:', e.message);
      return {};
    }
  }

  // ─── Micro-signaux & observations macro ──────────────────────

  function detectMicroSignals(result, answers = {}) {
    const { skinType, cernes } = result;
    const st  = skinType?.type || 'normale';

    // Vision Haiku — source principale de détection photo
    const vision = result.vision || {};
    const vc = vision.cernes        || {};
    const vr = vision.rougeurs      || {};
    const vi = vision.imperfections || {};

    const qConc = Array.isArray(answers.concerns) ? answers.concerns : [];
    const qSkin = answers.skinType   || null;
    const qObj  = answers.objectives || null;
    const qAge  = answers.ageGroup   || null;
    const isSkinSeche = st === 'seche' || qSkin === 'seche';

    const signals = [];
    const add = (id, label, macro, severity, detected) => {
      if (detected) signals.push({ id, label, macro, severity: Math.min(1, Math.max(0, severity)) });
    };

    // ── Regard fatigué — cernes MediaPipe (fiable) + vision en renfort ──
    const cernesDetected = cernes?.detected || vc.detected === true;
    const cernesType     = cernes?.type || (vc.type !== 'aucun' ? vc.type : null);
    const cernesInt      = cernes?.intensity || vc.intensite || null;

    add('dark_circles',         'Ombre sous les yeux',        'regard_fatigue', 0.70, cernesDetected);
    add('dark_circles_intense', 'Cernes prononcés',           'regard_fatigue', 0.92, cernesDetected && cernesInt === 'marqués');
    add('dark_circles_blue',    'Cernes bleutés (vaisseaux)', 'regard_fatigue', 0.78, cernesDetected && cernesType === 'bleu');
    add('dark_circles_brown',   'Cernes pigmentaires',        'regard_fatigue', 0.72, cernesDetected && (cernesType === 'marron' || cernesType === 'violet'));
    add('cernes_quiz',          'Fatigue signalée',           'regard_fatigue', 0.62, !cernesDetected && qConc.includes('cernes'));

    // ── Peau réactive — vision ──
    const rougeursLeg  = vr.niveau === 'légères';
    const rougeursPron = vr.niveau === 'prononcées';
    const rougeursJoues = vr.zones === 'joues';
    const hasVisionRoug = rougeursLeg || rougeursPron;

    add('redness_visible', 'Rougeurs visibles',      'peau_reactive', 0.60, rougeursLeg);
    add('redness_intense', 'Rougeurs prononcées',    'peau_reactive', 0.88, rougeursPron);
    add('couperose_joues', 'Rougeurs sur les joues', 'peau_reactive', 0.72, rougeursJoues);
    add('sensitive_quiz',  'Réactivité signalée',    'peau_reactive', 0.65, qConc.includes('rougeurs') && !hasVisionRoug);
    add('sensitive_skin',  'Peau sensible',          'peau_reactive', 0.62, (st === 'sensible' || qSkin === 'sensible') && !hasVisionRoug);
    add('barrier_damaged', 'Barrière fragilisée',    'peau_reactive', 0.70, isSkinSeche && (hasVisionRoug || qConc.includes('rougeurs')));

    // ── Manque d'éclat — vision ──
    const eclatTerne    = vision.eclat === 'terne';
    const eclatTresTerne = vision.eclat === 'très_terne';
    const hasVisionEcl  = eclatTerne || eclatTresTerne;

    add('dull_photo',      'Teint voilé',         'manque_eclat', eclatTresTerne ? 0.85 : 0.62, hasVisionEcl);
    add('dull_quiz',       'Éclat terne signalé', 'manque_eclat', 0.62, qConc.includes('eclat_terne') && !hasVisionEcl);
    add('dry_skin',        'Peau sèche',          'manque_eclat', 0.60, isSkinSeche && !vi.presentes);
    add('eclat_objective', 'Objectif éclat',      'manque_eclat', 0.55, qObj === 'eclat' && !hasVisionEcl);

    // ── Texture irrégulière — vision ──
    const texLeg   = vision.texture === 'légèrement_irrégulière';
    const texIrreg = vision.texture === 'irrégulière';
    const hasVisionTex = texLeg || texIrreg;

    add('rough_texture', 'Grain de peau irrégulier', 'texture_irreguliere', texIrreg ? 0.85 : 0.62, hasVisionTex);
    add('visible_pores', 'Pores visibles',            'texture_irreguliere', 0.70, qConc.includes('pores') && !hasVisionTex);
    add('tzone_oily',    'Zone T brillante',           'texture_irreguliere', 0.72, (st === 'mixte' || qSkin === 'mixte') && !hasVisionTex);
    add('global_oily',   'Excès de sébum',             'texture_irreguliere', 0.78, st === 'grasse' || qSkin === 'grasse');

    // ── Irrégularités de teint — vision ──
    const tachesLeg = vision.taches === 'légères';
    const tachesVis = vision.taches === 'visibles';
    const hasVisionTac = tachesLeg || tachesVis;

    add('spots_photo',   'Irrégularités détectées', 'irregularites_teint', tachesVis ? 0.82 : 0.62, hasVisionTac && !vi.presentes);
    add('spots_quiz',    'Taches signalées',         'irregularites_teint', 0.70, qConc.includes('taches'));
    add('coverage_need', 'Couvrance nécessaire',     'irregularites_teint', 0.68, tachesVis && !vi.presentes);

    // ── Imperfections acnéiques — vision + questionnaire ──
    add('acne_quiz',  'Acné ou boutons signalés', 'imperfections_acne', 0.85, qConc.includes('acne'));
    add('acne_photo', 'Imperfections visibles',   'imperfections_acne', 0.82, vi.presentes && vi.type !== 'post_acne');
    add('acne_scars', 'Marques post-acné',        'imperfections_acne', 0.68, vi.type === 'post_acne');
    add('sebum_acne', 'Excès de sébum',           'imperfections_acne', 0.72, (st === 'grasse' || qSkin === 'grasse') && (qConc.includes('acne') || vi.presentes));

    // ── Peau mature — questionnaire uniquement ──
    add('mature_age',    'Peau 35+',                  'peau_mature', 0.70, qAge === '40+' || qAge === '30-40');
    add('rides_signes',  'Signes du temps visibles',  'peau_mature', 0.80, qConc.includes('rides'));
    add('antiage_need',  'Objectif anti-âge',         'peau_mature', 0.68, qObj === 'anti-age');
    add('perte_fermete', 'Perte de fermeté',          'peau_mature', 0.78, qAge === '40+' || (qAge === '30-40' && qConc.includes('rides')));
    add('eclat_mature',  'Teint moins lumineux',      'peau_mature', 0.65, (qAge === '40+' || qAge === '30-40') && hasVisionEcl);

    return signals;
  }

  function buildMacroObservations(result, answers = {}) {
    const signals = detectMicroSignals(result, answers);

    const MACRO_CONFIG = {
      regard_fatigue: {
        name: 'Regard fatigué',
        icon: '◐',
        getExplanation(r) {
          const t = r.cernes?.type;
          if (t === 'bleu')   return 'Les vaisseaux sanguins transparaissent sous la peau fine du contour des yeux.';
          if (t === 'marron') return 'Une hyperpigmentation sous les yeux crée une zone plus foncée autour du regard.';
          return 'Le contour des yeux manque de luminosité — le regard paraît moins frais et moins reposé.';
        },
        getSolution(r) {
          const t = r.cernes?.type;
          if (t === 'bleu')   return 'Correcteur teinte saumon ou pêche pour neutraliser l\'ombre bleutée.';
          if (t === 'marron') return 'Correcteur teinte orangée pour contrer les zones pigmentées.';
          return 'Anti-cernes lumineux 1 à 2 tons plus clair que le fond de teint pour ouvrir le regard.';
        },
        concernTags:       ['cernes', 'hydratation', 'ridules', 'anti_age'],
        productCategories: ['concealer', 'eyeshadow'],
      },
      peau_reactive: {
        name: 'Peau réactive',
        icon: '◉',
        getExplanation() { return 'Ta peau réagit facilement — rougeurs, sensations d\'inconfort ou réactivité aux textures.'; },
        getSolution()    { return 'Fond de teint sans parfum avec pigments verts pour neutraliser les rougeurs.'; },
        concernTags:       ['rougeurs', 'apaisement', 'barriere', 'sensibilite'],
        productCategories: ['foundation', 'concealer', 'powder'],
      },
      manque_eclat: {
        name: 'Manque d\'éclat',
        icon: '✦',
        getExplanation() { return 'Ton teint se voile et perd en fraîcheur — la peau ne reflète plus bien la lumière.'; },
        getSolution()    { return 'Enlumineur et fond de teint lumineux pour réveiller l\'éclat instantanément.'; },
        concernTags:       ['eclat', 'teint_terne', 'uniformite', 'deshydratation'],
        productCategories: ['highlighter', 'blush', 'foundation'],
      },
      texture_irreguliere: {
        name: 'Texture irrégulière',
        icon: '◈',
        getExplanation() { return 'Pores dilatés ou grain de peau irrégulier — le fond de teint a du mal à se poser uniformément.'; },
        getSolution()    { return 'Fond de teint à texture lissante + poudre matifiante pour unifier le grain de peau.'; },
        concernTags:       ['pores', 'texture', 'matifiant', 'purification'],
        productCategories: ['foundation', 'powder'],
      },
      irregularites_teint: {
        name: 'Irrégularités de teint',
        icon: '◑',
        getExplanation() { return 'Zones pigmentées ou rosées par endroits — le teint paraît inégal et manque d\'uniformité.'; },
        getSolution()    { return 'Correcteur ciblé + fond de teint unificateur pour uniformiser le teint en douceur.'; },
        concernTags:       ['taches', 'uniformite', 'couvrance', 'eclat'],
        productCategories: ['concealer', 'foundation'],
      },
      imperfections_acne: {
        name: 'Imperfections acnéiques',
        icon: '●',
        getExplanation() { return 'Ta peau est sujette aux boutons — excès de sébum, pores obstrués ou inflammation localisée.'; },
        getSolution()    { return 'Fond de teint non-comédogène léger + correcteur précis pour couvrir sans aggraver la peau.'; },
        concernTags:       ['imperfections', 'purification', 'pores', 'matifiant'],
        productCategories: ['foundation', 'concealer', 'powder'],
      },
      peau_mature: {
        name: 'Peau mature',
        icon: '◇',
        getExplanation(r, ans) {
          if (ans?.ageGroup === '40+') return 'La peau perd en fermeté et en éclat avec le temps — les bonnes formules compensent visuellement.';
          return 'La peau commence à montrer des premiers signes du temps — ridules et légère perte d\'éclat.';
        },
        getSolution()    { return 'Fond de teint hydratant lumineux + touche d\'enlumineur stratégique pour raviver le teint.'; },
        concernTags:       ['anti_age', 'ridules', 'eclat', 'hydratation'],
        productCategories: ['foundation', 'highlighter', 'blush'],
      },
    };

    const byMacro = {};
    for (const sig of signals) {
      if (!byMacro[sig.macro]) byMacro[sig.macro] = { signals: [], maxSev: 0, totalSev: 0 };
      byMacro[sig.macro].signals.push(sig);
      byMacro[sig.macro].maxSev   = Math.max(byMacro[sig.macro].maxSev, sig.severity);
      byMacro[sig.macro].totalSev += sig.severity;
    }

    const macros = [];
    for (const [id, cfg] of Object.entries(MACRO_CONFIG)) {
      const data = byMacro[id];
      if (!data || !data.signals.length) continue;
      const avgSev  = data.totalSev / data.signals.length;
      macros.push({
        id,
        name:              cfg.name,
        icon:              cfg.icon,
        signals:           data.signals,
        explanation:       cfg.getExplanation(result, answers),
        solution:          cfg.getSolution(result, answers),
        concernTags:       cfg.concernTags,
        productCategories: cfg.productCategories,
        severity:          data.maxSev * 0.6 + avgSev * 0.4,
      });
    }

    return macros.sort((a, b) => b.severity - a.severity).slice(0, 3);
  }

  function getProductsForProblem(macro, result, answers, limit = 2) {
    const catalog   = AppState?.products?.catalog || [];
    const ut        = result.undertone?.type || 'neutral';
    const ca        = result.carnation?.type || 'medium';
    const BMAX      = { 'petits-prix': 20, 'bon-rapport': 50, 'premium': Infinity };
    const budgetMax = BMAX[answers.budget] ?? Infinity;
    const mp        = ProductCatalog.getMaturityPreference(answers);

    function buildPool(filterUT, filterCA, filterBudget) {
      return catalog.filter(p => {
        if (p.active === false || !p.imageUrl) return false;
        if (!macro.productCategories.includes(p.category)) return false;
        if (filterUT && p.undertone && p.undertone !== 'neutral' && p.undertone !== filterUT) return false;
        if (filterCA && Array.isArray(p.carnation) && p.carnation.length && !p.carnation.includes(filterCA)) return false;
        if (filterBudget && p.price && p.price > budgetMax) return false;
        return true;
      });
    }

    let pool = buildPool(ut, ca, true);
    if (pool.length < 2) pool = buildPool(ut, null, true);
    if (pool.length < 2) pool = buildPool(null, null, true);
    if (pool.length < 2) pool = buildPool(null, null, false);

    if (mp && mp !== 'all') {
      const mf = pool.filter(p => !p.maturity || p.maturity === 'all' || p.maturity === mp);
      if (mf.length >= limit) pool = mf;
    }

    pool = pool.sort((a, b) => {
      const aScore = (a.concernTags || []).filter(t => macro.concernTags.includes(t)).length;
      const bScore = (b.concernTags || []).filter(t => macro.concernTags.includes(t)).length;
      if (bScore !== aScore) return bScore - aScore;
      if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
      return (b.rating || 0) - (a.rating || 0);
    });

    const usedBrands = new Set();
    const selected   = [];
    for (const p of pool) {
      const brand = p.brand.toLowerCase().trim();
      if (usedBrands.has(brand)) continue;
      usedBrands.add(brand);
      selected.push(p);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  function renderProblemCardsHTML(macroObs, result, answers) {
    if (!macroObs || !macroObs.length) {
      return `
        <div class="mkr-bloc prob-section">
          <h2 class="mkr-bloc-title">🔎 Ce que ton visage montre</h2>
          <div class="prob-healthy">
            <span class="prob-healthy-icon">✦</span>
            <p>Ta peau est en bonne forme — aucune irrégularité majeure détectée.</p>
          </div>
        </div>`;
    }

    const cards = macroObs.map(macro => {
      const products = getProductsForProblem(macro, result, answers, 2);

      const signalsHTML = macro.signals.slice(0, 4)
        .map(s => `<span class="prob-signal">${s.label}</span>`).join('');

      const productsHTML = products.length
        ? products.map(p => `
          <div class="prob-prod-card" onclick="ProductCatalog.openProductModal('${p.id}')">
            <div class="prob-prod-img">
              <img src="${p.imageUrl}" alt="${p.name}" onerror="this.onerror=null;this.style.opacity='0'">
            </div>
            <div class="prob-prod-info">
              <span class="prob-prod-brand">${p.brand}</span>
              <p class="prob-prod-name">${p.name}</p>
              ${p.price ? `<span class="prob-prod-price">${p.price.toFixed(2)} €</span>` : ''}
            </div>
            <a class="btn btn-amazon prob-prod-buy"
               href="${p.amazonUrl}" target="_blank" rel="noopener nofollow sponsored"
               onclick="event.stopPropagation(); if(typeof Tracker!=='undefined') Tracker.trackBuyClick('${p.id}')">
              Acheter →
            </a>
          </div>`).join('')
        : '<p class="prob-no-prod">Produits bientôt disponibles.</p>';

      return `
        <div class="prob-card">
          <div class="prob-card-header">
            <span class="prob-icon">${macro.icon}</span>
            <div class="prob-card-title-wrap">
              <h3 class="prob-name">${macro.name}</h3>
              <div class="prob-signals">${signalsHTML}</div>
            </div>
          </div>
          <p class="prob-explanation">${macro.explanation}</p>
          <div class="prob-solution">
            <span class="prob-solution-label">Solution</span>
            <p>${macro.solution}</p>
          </div>
          <div class="prob-products">${productsHTML}</div>
        </div>`;
    }).join('');

    return `
      <div class="mkr-bloc prob-section">
        <h2 class="mkr-bloc-title">🔎 Ce que ton visage montre</h2>
        ${cards}
      </div>`;
  }

  function renderBudgetBloc(cart, budgetMax) {
    if (!cart || !cart.length) return '';

    const withPrice  = cart.filter(p => p.price > 0);
    const total      = withPrice.reduce((s, p) => s + p.price, 0);
    const totalStr   = total > 0 ? `${Math.round(total)} €` : null;

    const listHTML = cart.map(p => `
      <div class="budget-item">
        <div class="budget-item-img">
          <img src="${p.imageUrl}" alt="${p.name}" onerror="this.onerror=null;this.style.opacity='0'">
        </div>
        <div class="budget-item-info">
          <span class="budget-item-brand">${p.brand}</span>
          <p class="budget-item-name">${p.name}</p>
          ${p.shadeName ? `<span class="budget-item-shade">${p.shadeName}</span>` : ''}
        </div>
        <div class="budget-item-right">
          <span class="budget-item-price">${p.price ? p.price.toFixed(2) + ' €' : '—'}</span>
          <a class="btn btn-amazon budget-item-buy"
             href="${p.amazonUrl}" target="_blank" rel="noopener nofollow sponsored"
             onclick="if(typeof Tracker!=='undefined') Tracker.trackBuyClick('${p.id}')">
            Acheter →
          </a>
        </div>
      </div>`).join('');

    return `
      <div class="mkr-bloc budget-bloc">
        <h2 class="mkr-bloc-title">🛒 Ton budget total</h2>
        ${totalStr ? `
        <div class="budget-total-row">
          <span class="budget-total-label">Ta routine complète</span>
          <span class="budget-total-amount">${totalStr} environ</span>
        </div>` : ''}
        <p class="budget-sub">On a sélectionné les produits les plus adaptés à ton profil${budgetMax && budgetMax !== Infinity ? ` — tous à moins de ${budgetMax} €` : ''}.</p>
        <div class="budget-list">${listHTML}</div>
      </div>`;
  }

  // ─── Phase 2 : overlay zones cutanées sur photo ──────────────

  const OVERLAY_COLORS = {
    redness:  { css: 'rgba(220,60,40,0.38)',   dot: '#DC3C28', label: 'Rougeurs' },
    sebum:    { css: 'rgba(210,170,0,0.38)',    dot: '#D2AA00', label: 'Sébum' },
    taches:   { css: 'rgba(155,90,40,0.35)',    dot: '#9B5A28', label: 'Taches' },
    terne:    { css: 'rgba(220,110,20,0.35)',   dot: '#DC6E14', label: 'Teint terne' },
    texture:  { css: 'rgba(80,110,180,0.30)',   dot: '#506EB4', label: 'Texture' },
    cernes:   { css: 'rgba(120,60,180,0.38)',   dot: '#783CB4', label: 'Cernes' },
    ok:       { css: 'rgba(50,160,60,0.18)',    dot: '#32A03C', label: 'Sain' }
  };

  function _zoneOverlayKey(z) {
    if (z.redness  > 55)  return 'redness';
    if (z.pores    < 42)  return 'sebum';
    if (z.taches   < 48)  return 'taches';
    if (z.eclat    < 46)  return 'terne';
    if (z.texture  < 48)  return 'texture';
    return 'ok';
  }

  // ─── Personnalisation analyse : baseline visage + scoring relatif ──
  // Réglages faciles à ajuster après tests
  const INSIGHT_TUNING = {
    W_ABS:        0.3,  // poids sévérité absolue (réduit : évite que redness domine)
    W_REL:        0.7,  // poids écart relatif au visage (renforcé : personnalisation)
    REL_SCALE:    3.0,  // amplification de l'écart relatif
    THRESHOLD:    48,   // sévérité minimale pour afficher un signal (abaissé = "détecte beaucoup")
    MAX_ISSUES:   3,    // max d'observations "à chouchouter"
    ALWAYS_POSITIVE: true, // toujours afficher un point positif
    REDUNDANCY:   8,    // écart sous lequel 2 signaux même zone = doublon
  };

  // Moyennes des 5 métriques sur toutes les zones de CE visage
  function _computeFaceBaseline(zones) {
    const list = Object.values(zones || {});
    if (!list.length) return null;
    const mean = (sel) => list.reduce((s, z) => s + (sel(z) || 0), 0) / list.length;
    return {
      redness: mean(z => z.redness),
      pores:   mean(z => z.pores),
      eclat:   mean(z => z.eclat),
      texture: mean(z => z.texture),
      taches:  mean(z => z.taches),
    };
  }

  // Sévérité d'un signal pour une zone = absolu pondéré + écart relatif au visage
  // Retourne 0-100 (plus haut = plus marqué pour CETTE personne)
  // v = abs + W_REL × (écart relatif amplifié)
  function _signalSeverity(absSeverity, relDeviation) {
    const rel = clamp(relDeviation * INSIGHT_TUNING.REL_SCALE, -100, 100);
    const v = (INSIGHT_TUNING.W_ABS + INSIGHT_TUNING.W_REL) * absSeverity
            + INSIGHT_TUNING.W_REL * rel;
    return Math.round(clamp(v, 0, 100));
  }

  // Score TOUS les signaux d'une zone (pas de cascade) → tableau {key, severity}
  function _scoreZoneSignals(z, baseline) {
    const out = [];
    // direction : redness haut=pire ; pores/eclat/texture/taches bas=pire
    const defs = [
      { key: 'redness', abs: z.redness,        rel: z.redness - baseline.redness },
      { key: 'sebum',   abs: 100 - z.pores,    rel: baseline.pores   - z.pores   },
      { key: 'taches',  abs: 100 - z.taches,   rel: baseline.taches  - z.taches  },
      { key: 'terne',   abs: 100 - z.eclat,    rel: baseline.eclat   - z.eclat   },
      { key: 'texture', abs: 100 - z.texture,  rel: baseline.texture - z.texture },
    ];
    for (const d of defs) {
      out.push({ key: d.key, severity: _signalSeverity(d.abs, d.rel) });
    }
    return out;
  }

  // Point positif : l'atout le plus fort du visage → message valorisant qui VARIE
  // exclkeys = types déjà affichés en "à chouchouter" (pour ne pas se contredire)
  function _buildPositiveNote(zones, baseline, exclTypes = []) {
    if (!baseline) return null;
    // Classer les axes positifs par force, exclure ceux déjà signalés comme problème
    const axes = [
      { metric: 'eclat',   val: baseline.eclat,        excl: 'terne',   pillLabel: 'Éclat naturel',
        sentence: 'Ton teint capte joliment la lumière — il dégage un éclat naturel et une belle vitalité.',
        advice:   'Préserve-le avec une vitamine C douce le matin et un SPF au quotidien.' },
      { metric: 'texture', val: baseline.texture,      excl: 'texture', pillLabel: 'Grain de peau lisse',
        sentence: 'Ton grain de peau paraît régulier et homogène — la peau est lisse et bien entretenue.',
        advice:   'Un soin hydratant doux suffit à conserver cette belle régularité.' },
      { metric: 'taches',  val: baseline.taches,       excl: 'taches',  pillLabel: 'Teint uniforme',
        sentence: 'Ton teint est plutôt uniforme — peu d\'irrégularités pigmentaires visibles, c\'est un vrai atout.',
        advice:   'Continue à protéger ta peau du soleil pour préserver cette uniformité.' },
      { metric: 'calme',   val: 100 - baseline.redness, excl: 'redness', pillLabel: 'Peau apaisée',
        sentence: 'Ta peau paraît calme et confortable — peu de réactivité ou de rougeurs visibles.',
        advice:   'Garde des formules douces et apaisantes pour entretenir cet équilibre.' },
    ];
    const chosen = axes
      .filter(a => !exclTypes.includes(a.excl))
      .sort((a, b) => b.val - a.val)[0];
    if (!chosen) return null;
    return {
      key: 'positive', severity: 0, zones: [], rank: 99,
      zoneKey: null, zoneLabel: '', zoneSummary: '',
      pillLabel: chosen.pillLabel, sentence: chosen.sentence, advice: chosen.advice,
      positive: true,
    };
  }

  // Generate precise, location-aware phrases for each insight type (template fallback)
  function _generateInsightText(key, result, g) {
    const st    = result.skinType?.type  || 'normale';
    const ut    = result.undertone?.type || 'neutral';
    const sev   = g.severity || 50;
    const cer   = result.cernes;
    const zones = g.zones || [];

    const zoneKeys    = zones.map(z => z.zoneKey);
    const primaryZone = zones[0]?.zoneKey;
    const bothCheeks  = zoneKeys.length >= 2 && zoneKeys.every(z => z === 'leftCheek' || z === 'rightCheek');
    const hasNose     = zoneKeys.includes('nose');
    const hasForehead = zoneKeys.includes('forehead');

    const LOC = {
      leftCheek: 'sur la joue gauche', rightCheek: 'sur la joue droite',
      forehead:  'sur le front',       nose:       'au niveau du nez',
      chin:      'sur le menton',      eyes:       'sous les yeux',
    };

    const locationStr = bothCheeks
      ? (hasNose ? 'sur les joues et les ailes du nez' : 'sur les deux joues')
      : primaryZone ? (LOC[primaryZone] || '') : '';

    const DATA = {
      redness: {
        pillLabel: 'Petites rougeurs',
        sentence: () => {
          const loc = locationStr || 'sur les joues';
          if (sev > 72) return `Je remarque quelques rougeurs ${loc} — ta peau a l'air un peu sensible en ce moment.`;
          if (st === 'sensible') return `Ta peau semble réagir un peu ${loc}, rien d'inquiétant, juste un besoin de douceur.`;
          return `Il y a un léger coup de rouge ${loc} — sûrement passager.`;
        },
        advice: () => {
          return `Je te conseillerais un soin tout doux et apaisant, à la centella ou à la niacinamide, pour calmer cette zone.`;
        }
      },
      cernes: {
        pillLabel: 'Regard à réveiller',
        sentence: () => {
          if (cer?.type === 'bleu_violet') return `Le contour de tes yeux tire un peu sur le bleuté${cer.intensity === 'marqués' ? ', assez visible' : ''} — souvent un petit signe de fatigue.`;
          if (cer?.type === 'marron')      return `Le dessous de tes yeux est légèrement plus foncé${cer.intensity === 'marqués' ? ', bien visible' : ''} — c'est souvent naturel ou lié au soleil.`;
          if (cer?.type === 'rouge_rose')  return `Le contour de tes yeux est un peu rosé — peut-être un peu de sensibilité ou des frottements.`;
          if (cer?.type === 'gris')        return `Ton regard paraît un peu fatigué et le contour manque d'éclat.`;
          return `Ton regard paraît un peu fatigué — on peut facilement le réveiller.`;
        },
        advice: () => {
          if (cer?.type === 'bleu_violet') return `Un soin contour des yeux frais le matin + un correcteur pêche pour illuminer le regard.`;
          if (cer?.type === 'marron')      return `Un soin éclat pour le contour des yeux et surtout une protection solaire chaque jour.`;
          return `Un soin contour des yeux défatigant le matin réveillera ton regard en un rien de temps.`;
        }
      },
      sebum: {
        pillLabel: 'Zone qui brille un peu',
        sentence: () => {
          const loc = (hasForehead && hasNose) ? 'sur le front et le nez'
            : hasForehead ? 'surtout sur le front'
            : hasNose    ? 'surtout sur le nez'
            : 'sur le centre du visage';
          if (st === 'grasse') return `Ta peau a tendance à briller ${loc} et les pores y sont un peu plus visibles.`;
          if (st === 'mixte')  return `Le centre du visage brille un peu plus ${loc}, alors que tes joues restent équilibrées.`;
          return `Il y a une petite brillance ${loc}, rien de plus.`;
        },
        advice: () => {
          return `Un soin matifiant tout doux sur cette zone aidera à garder un joli fini sans dessécher le reste.`;
        }
      },
      taches: {
        pillLabel: 'Teint à unifier',
        sentence: () => {
          const loc = locationStr ? locationStr : 'par endroits';
          return `Ton teint est un peu irrégulier ${loc} — quelques petites variations de couleur, très courant.`;
        },
        advice: () => {
          return `Un soin éclat à la vitamine C le matin et surtout une protection solaire aideront à unifier petit à petit.`;
        }
      },
      terne: {
        pillLabel: 'Coup d\'éclat à donner',
        sentence: () => {
          if (st === 'seche') return `Ton teint manque un peu de lumière — la peau a surtout besoin d'être bien hydratée.`;
          if (sev > 65)       return `Ton teint paraît un peu fatigué aujourd'hui — un petit coup d'éclat lui ferait du bien.`;
          return `Ton teint manque juste d'un peu de fraîcheur — facile à raviver.`;
        },
        advice: () => {
          if (st === 'seche') return `Un soin bien hydratant à l'acide hyaluronique redonnera de la souplesse et de la lumière.`;
          return `Un soin éclat à la vitamine C le matin réveillera vite ton teint.`;
        }
      },
      texture: {
        pillLabel: 'Grain de peau à lisser',
        sentence: () => {
          const loc = locationStr || 'sur certaines zones';
          return `Le grain de peau est un peu plus visible ${loc} — rien qu'un soin lissant doux ne puisse arranger.`;
        },
        advice: () => {
          if (st === 'sensible') return 'Un gommage tout doux, façon enzymatique, suffira à affiner le grain sans agresser.';
          return 'Un soin exfoliant doux une à deux fois par semaine lissera joliment le grain de peau.';
        }
      }
    };

    const d = DATA[key];
    if (!d) return { pillLabel: key, sentence: '', advice: '' };
    return { pillLabel: d.pillLabel, sentence: d.sentence(), advice: d.advice() };
  }

  // ══════════════════════════════════════════════════════════════
  // PORTRAIT BEAUTÉ — bibliothèque d'observations valorisantes
  // Sélection combinatoire → 2 visages = 2 portraits différents
  // ══════════════════════════════════════════════════════════════

  // Base de ~300 commentaires valorisants répartis en 8 familles.
  // Sélection pondérée par les vraies données → 2 visages ≠ mêmes phrases.
  const PORTRAIT_LIB = {
    // 1. ÉCLAT NATUREL
    eclat: [
      'Ta peau capte déjà joliment la lumière.',
      'Ton teint a une belle luminosité naturelle.',
      'Ton visage dégage une fraîcheur très douce.',
      'Ta peau renvoie une lumière naturelle très flatteuse.',
      'Il y a déjà un joli glow naturel sur ton visage.',
      'Ton teint a cette fraîcheur qu\'on cherche à recréer en maquillage.',
      'Ta peau a une vraie vitalité lumineuse.',
      'La lumière se pose joliment sur ton visage.',
      'Ton teint paraît frais et reposé.',
      'Ta peau a un éclat naturel facile à sublimer.',
      'Ton visage a une luminosité douce, très agréable.',
      'Ton teint reflète une belle énergie.',
      'Il y a une jolie clarté naturelle dans ton teint.',
      'Ta peau a cette qualité lumineuse qui met tout de suite en valeur.',
      'Ton teint a une fraîcheur naturelle très élégante.',
      'Ton visage dégage une lumière naturelle apaisante.',
      'Ta peau a déjà un beau rayonnement.',
      'Ton éclat naturel demande très peu pour ressortir.',
    ],
    // 2. REGARD
    regard: [
      'Ton regard est naturellement expressif.',
      'La forme de tes yeux apporte beaucoup de douceur à ton visage.',
      'Ton regard structure déjà très bien ton visage.',
      'Tes yeux donnent beaucoup d\'intensité à ton expression.',
      'Ton regard attire naturellement l\'attention.',
      'Tes yeux ont une belle ouverture naturelle.',
      'Ton regard dégage de la douceur et de la profondeur.',
      'La forme de tes yeux est joliment équilibrée.',
      'Ton regard a quelque chose de très lumineux.',
      'Tes yeux apportent beaucoup de présence à ton visage.',
      'Ton regard se suffit presque à lui-même.',
      'Il y a beaucoup d\'expression dans ton regard.',
      'Tes yeux structurent naturellement le haut de ton visage.',
      'Ton regard a une jolie intensité, facile à révéler.',
      'Ton regard dégage une belle sérénité.',
      'Tes yeux ont une forme très harmonieuse.',
    ],
    // 3. SOURCILS
    sourcils: [
      'Tes sourcils encadrent naturellement bien ton regard.',
      'La ligne de tes sourcils apporte de l\'équilibre à ton visage.',
      'Tes sourcils donnent du caractère à ton expression.',
      'La forme de tes sourcils structure joliment ton regard.',
      'Tes sourcils ont une jolie ligne naturelle.',
      'Tes sourcils soulignent bien l\'harmonie de ton visage.',
      'La densité de tes sourcils met ton regard en valeur.',
      'Tes sourcils apportent une belle définition au haut du visage.',
      'L\'arche de tes sourcils donne de l\'élégance à ton regard.',
      'Tes sourcils cadrent naturellement tes yeux.',
      'Tes sourcils participent déjà à l\'équilibre de tes traits.',
      'La forme de tes sourcils est facile à mettre en valeur.',
      'Tes sourcils donnent de la structure à ton expression.',
      'Tes sourcils apportent du relief à ton regard.',
    ],
    // 4. LÈVRES
    levres: [
      'La forme de tes lèvres apporte de la douceur à ton visage.',
      'Tes lèvres équilibrent joliment tes traits.',
      'Ton sourire donne beaucoup de charme à ton visage.',
      'Le dessin de tes lèvres est naturellement harmonieux.',
      'Tes lèvres ont une jolie forme, facile à sublimer.',
      'Tes lèvres apportent de la rondeur et de la douceur à ton visage.',
      'La courbe de tes lèvres adoucit joliment ton expression.',
      'Tes lèvres s\'accordent bien avec l\'ensemble de tes traits.',
      'Le contour de tes lèvres est joliment dessiné.',
      'Tes lèvres apportent de l\'équilibre au bas du visage.',
      'Ton sourire éclaire naturellement ton visage.',
      'Tes lèvres ont un joli volume naturel.',
      'La forme de tes lèvres met en valeur ton sourire.',
    ],
    // 5. TEINT (par carnation / sous-ton + général)
    teint: {
      carnation: {
        clair: [
          'Ta carnation claire a une jolie luminosité naturelle.',
          'Ton teint clair laisse une belle place aux teintes douces.',
          'Ta peau claire a une transparence très élégante.',
          'Ton teint clair capte délicatement la lumière.',
          'Ta carnation claire dégage beaucoup de fraîcheur.',
          'Ton teint clair se prête à des couleurs lumineuses et nuancées.',
          'Ta peau claire a un fini frais et délicat.',
          'Ta carnation claire est facile à illuminer.',
        ],
        medium: [
          'Ta carnation medium a une belle chaleur naturelle.',
          'Ton teint medium a une jolie profondeur lumineuse.',
          'Ta carnation medium t\'offre une belle polyvalence de couleurs.',
          'Ton teint medium capte magnifiquement la lumière.',
          'Ta peau medium a une chaleur très flatteuse.',
          'Ton teint medium a un joli fini légèrement doré.',
          'Ta carnation medium apporte beaucoup d\'harmonie au visage.',
          'Ton teint medium met facilement en valeur les teintes chaudes.',
        ],
        fonce: [
          'Ta carnation foncée a une superbe profondeur.',
          'Ton teint foncé dégage une belle intensité lumineuse.',
          'Ta peau foncée a un éclat naturel magnifique.',
          'Ta carnation foncée sublime les teintes riches et chaudes.',
          'Ton teint foncé a une luminosité naturelle remarquable.',
          'Ta peau foncée offre une intensité très élégante.',
          'Ta carnation foncée capte la lumière avec beaucoup d\'éclat.',
          'Ton teint foncé dégage force et harmonie.',
        ],
      },
      undertone: {
        warm: [
          'Ton sous-ton chaud illumine naturellement ton visage.',
          'Les reflets dorés de ta peau apportent beaucoup de chaleur.',
          'Ton sous-ton doré réchauffe joliment ton teint.',
          'Les nuances pêchées de ta peau ressortent harmonieusement.',
          'Ton sous-ton chaud apporte une vraie élégance à ton visage.',
          'La chaleur de ton teint lui donne un bel éclat.',
          'Ton sous-ton doré met facilement le teint en valeur.',
        ],
        cool: [
          'Ton sous-ton froid apporte beaucoup d\'élégance à ton visage.',
          'Les reflets rosés de ta peau sont très lumineux.',
          'Ton sous-ton frais donne une belle clarté à ton teint.',
          'Les nuances délicates de ta peau apportent de la fraîcheur.',
          'Ton sous-ton froid donne un joli éclat lumineux au teint.',
          'Ton sous-ton apporte une vraie finesse à ton visage.',
        ],
        neutral: [
          'Ton sous-ton neutre apporte beaucoup d\'harmonie à ton visage.',
          'Ton teint équilibré te permet de porter presque toutes les teintes.',
          'Ton sous-ton neutre est un vrai atout polyvalence.',
          'Ta peau équilibrée s\'accorde avec une large palette de couleurs.',
          'Ton sous-ton neutre donne une belle élégance naturelle à ton teint.',
        ],
      },
      general: [
        'Ton teint présente déjà une belle harmonie globale.',
        'Ta carnation est lumineuse et facile à mettre en valeur.',
        'Ton teint a une jolie uniformité naturelle.',
        'Ta peau a une belle régularité de teint.',
        'Ton teint dégage une élégance discrète.',
        'Ta carnation a une vraie cohérence lumineuse.',
        'Ton teint a une jolie richesse naturelle.',
      ],
    },
    // 6. STRUCTURE DU VISAGE (par forme + général)
    structure: {
      shape: {
        oval: [
          'Les proportions de ton visage sont particulièrement harmonieuses.',
          'Ton visage s\'adapte facilement à tous les styles de maquillage.',
          'Tes traits sont naturellement équilibrés.',
          'La forme ovale de ton visage est très polyvalente.',
          'Ton visage a un équilibre naturel très élégant.',
        ],
        round: [
          'Ton visage dégage beaucoup de douceur.',
          'Tes traits apportent de la jeunesse et de la fraîcheur.',
          'Ton visage a une rondeur très harmonieuse.',
          'La douceur de tes traits adoucit joliment ton expression.',
          'Ton visage a un charme naturel très doux.',
        ],
        square: [
          'Les contours de ton visage apportent beaucoup de caractère.',
          'Tes traits sont bien définis et structurés.',
          'Ton visage dégage de l\'élégance et du caractère.',
          'La structure de ton visage a une vraie présence.',
          'Tes traits affirmés donnent beaucoup de personnalité.',
        ],
        heart: [
          'Le haut de ton visage met naturellement ton regard en valeur.',
          'Tes proportions attirent joliment l\'attention vers les yeux.',
          'Ton visage en cœur a beaucoup de charme.',
          'La finesse du bas de ton visage est très élégante.',
          'Tes traits ont une jolie délicatesse.',
        ],
        long: [
          'Les lignes de ton visage apportent beaucoup d\'élégance.',
          'Tes traits paraissent naturellement raffinés.',
          'Ton visage a une jolie finesse.',
          'La longueur de ton visage lui donne beaucoup de prestance.',
          'Tes traits allongés ont une vraie élégance.',
        ],
      },
      general: [
        'Tes traits se prêtent très bien à un maquillage naturel.',
        'La structure de ton visage est facile à mettre en valeur.',
        'Tes traits ont un bel équilibre naturel.',
        'Les volumes de ton visage sont harmonieux.',
        'Ton visage a une jolie cohérence d\'ensemble.',
        'Tes traits dégagent beaucoup d\'harmonie.',
      ],
    },
    // 7. POINTS FORTS MAKE-UP (par sous-ton + général)
    makeup: {
      undertone: {
        warm: [
          'Les teintes corail, pêche et dorées accompagneront très bien ta carnation.',
          'Un blush pêche pourrait sublimer naturellement tes pommettes.',
          'Les nuances chaudes mettront facilement ton teint en valeur.',
          'Un highlighter doré ferait ressortir ton éclat naturel.',
        ],
        cool: [
          'Les teintes rosées et prunées accompagneront très bien ta carnation.',
          'Un blush rosé pourrait sublimer naturellement tes pommettes.',
          'Les nuances froides donneront une belle clarté à ton teint.',
          'Un highlighter rosé ferait joliment ressortir ton éclat.',
        ],
        neutral: [
          'Les teintes nude et rosées accompagneront très bien ta carnation.',
          'Un blush nude pourrait sublimer naturellement tes pommettes.',
          'Presque toutes les teintes peuvent t\'accompagner — un vrai atout.',
          'Un highlighter champagne ferait ressortir ton éclat naturel.',
        ],
      },
      general: [
        'Ton regard peut être facilement mis en valeur avec très peu de maquillage.',
        'Une touche de blush suffirait à réveiller ton teint.',
        'Un soin léger révèlerait déjà beaucoup ton éclat.',
        'Tes traits demandent très peu pour être sublimés.',
        'Un maquillage léger suffirait à révéler tes points forts.',
        'Quelques touches ciblées suffiraient à intensifier ton regard.',
      ],
    },
    // 8. STYLE BEAUTÉ
    style: [
      'Ton visage se prête très bien à un effet glow naturel.',
      'Un maquillage léger peut suffire à révéler tes traits.',
      'Ton profil beauté correspond bien à une routine douce et lumineuse.',
      'Ton visage est fait pour un effet « bonne mine » naturel.',
      'Un style minimaliste mettrait joliment tes traits en valeur.',
      'Ton visage supporte aussi très bien un maquillage plus affirmé.',
      'Les contrastes naturels de ton visage offrent beaucoup de possibilités.',
      'Un look frais et lumineux te correspond particulièrement.',
      'Ton visage se prête à une beauté simple et élégante.',
      'Un effet peau nue sublimée te mettrait très en valeur.',
      'Ton profil se prête aussi bien au naturel qu\'au sophistiqué.',
      'Une routine douce révèlerait déjà beaucoup ton potentiel.',
    ],
  };

  function _pick(arr) {
    return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // ── B : la vision IA prime sur les pixels pour les signaux localisés ──
  // Si l'IA voit nettement des taches/imperfections que la métrique pixels
  // (globale, 5 zones) a ratées, on abaisse le score concerné pour le faire remonter.
  function _applyVisionSignals(result) {
    const v = result?.vision;
    const zones = result?.zones;
    if (!v || !zones) return;
    const cap = (metric, value) => {
      Object.values(zones).forEach(z => {
        if (typeof z[metric] === 'number') z[metric] = Math.min(z[metric], value);
      });
    };
    // Taches vues par l'IA (métrique 'taches' : haut = uniforme, bas = pire)
    // Valeurs calées pour franchir le seuil taches (50) : 100 - 40 = 60 > 50.
    const hasTacheZones = Array.isArray(v.taches_zones) && v.taches_zones.length > 0;
    if (v.taches === 'nombreuses')   cap('taches', 20);
    else if (v.taches === 'visibles') cap('taches', 30);
    else if (hasTacheZones)          cap('taches', 40); // l'IA a localisé une marque précise → on la mentionne
    // Imperfections visibles → on les fait remonter via 'taches' (seuil bas) plutôt que texture (seuil haut)
    if (v.imperfections?.presentes)  cap('taches', 38);
    // Rougeurs prononcées vues par l'IA → forcer au-dessus du seuil rougeurs (84)
    if (v.rougeurs?.niveau === 'prononcées') {
      Object.values(zones).forEach(z => {
        if (typeof z.redness === 'number') z.redness = Math.max(z.redness, 88);
      });
    }
  }

  // Construit 2-3 commentaires valorisants, catégories tirées au sort
  // selon les vraies données → deux visages ≈ jamais les mêmes phrases.
  function buildBeautyPortrait(result, answers = {}) {
    if (!result) return [];
    const ca = result.carnation?.type || 'medium';
    const ut = result.undertone?.type || 'neutral';
    const fs = result.faceShape?.shape || 'oval';
    const zones = result.zones || {};
    const vals = Object.values(zones);
    const avgEclat = vals.length ? avg(vals.map(z => z.eclat)) : 50;
    const cernesMarques = result.cernes?.detected && result.cernes?.intensity === 'marqués';

    const L = PORTRAIT_LIB;
    const getters = {
      eclat:    () => _pick(L.eclat),
      regard:   () => _pick(L.regard),
      sourcils: () => _pick(L.sourcils),
      levres:   () => _pick(L.levres),
      style:    () => _pick(L.style),
      teint: () => {
        const r = Math.random();
        if (r < 0.4)  return _pick(L.teint.carnation[ca] || L.teint.carnation.medium);
        if (r < 0.75) return _pick(L.teint.undertone[ut] || L.teint.undertone.neutral);
        return _pick(L.teint.general);
      },
      structure: () => Math.random() < 0.7
        ? _pick(L.structure.shape[fs] || L.structure.shape.oval)
        : _pick(L.structure.general),
      makeup: () => Math.random() < 0.6
        ? _pick(L.makeup.undertone[ut] || L.makeup.undertone.neutral)
        : _pick(L.makeup.general),
    };

    // Pondération selon les vraies données détectées
    const weights = [
      ['teint',     3],
      ['structure', 3],
      ['eclat',     avgEclat >= 56 ? 3 : 1.2],
      ['regard',    cernesMarques ? 0.6 : 2.5],
      ['makeup',    2],
      ['style',     2],
      ['sourcils',  1.4],
      ['levres',    1.4],
    ];

    // Tirage pondéré de 3 catégories distinctes
    const pool = weights.slice();
    const chosen = [];
    while (chosen.length < 3 && pool.length) {
      const total = pool.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total, i = 0;
      while (i < pool.length - 1 && r > pool[i][1]) { r -= pool[i][1]; i++; }
      chosen.push(pool[i][0]);
      pool.splice(i, 1);
    }

    const lines = chosen.map(k => getters[k]());
    return [...new Set(lines.filter(Boolean))];
  }

  // ══════════════════════════════════════════════════════════════
  // PRIORITÉS — bibliothèque ~200 + sélection dynamique
  // Remplace le score. "On ne note pas ta peau, on t'aide à la comprendre."
  // ══════════════════════════════════════════════════════════════

  const PRIORITY_LIB = {
    hydration: { emoji: '💧', pool: [
      'Hydratation des joues', 'Hydratation globale', 'Déshydratation localisée',
      'Maintenir l\'hydratation', 'Souplesse de la peau', 'Prévenir les tiraillements',
      'Équilibre hydrique', 'Confort cutané', 'Repulper la peau', 'Nourrir la peau en douceur',
      'Hydratation du contour des lèvres', 'Renforcer la barrière cutanée', 'Apporter du confort',
      'Peau plus souple', 'Hydratation en profondeur', 'Réconforter les zones sèches',
      'Maintenir la souplesse', 'Hydratation quotidienne',
    ]},
    redness: { emoji: '🌿', pool: [
      'Apaiser les rougeurs', 'Rougeurs diffuses', 'Rougeurs du nez', 'Sensibilité des joues',
      'Zones à apaiser', 'Réactivité localisée', 'Uniformiser les rougeurs', 'Calmer la peau',
      'Réduire les sensations d\'inconfort', 'Apaisement localisé', 'Renforcer la tolérance cutanée',
      'Atténuer les rougeurs visibles', 'Confort des peaux sensibles', 'Apaiser la zone des joues',
      'Réduire la réactivité', 'Douceur et apaisement',
    ]},
    imperfections: { emoji: '🌿', pool: [
      'Réduire les boutons visibles', 'Prévenir les imperfections', 'Marques résiduelles',
      'Réduire les imperfections', 'Équilibre cutané', 'Affiner le grain de peau',
      'Limiter les brillances et boutons', 'Purifier la peau', 'Atténuer les marques',
      'Prévenir les nouvelles imperfections', 'Réguler les zones à imperfections',
      'Peau plus nette', 'Désincruster les pores', 'Réduire les rougeurs post-bouton',
      'Assainir les zones concernées', 'Clarté de la peau',
    ]},
    pores_texture: { emoji: '🧴', pool: [
      'Pores visibles', 'Texture irrégulière', 'Affiner l\'apparence des pores',
      'Lisser la peau', 'Aspect plus uniforme', 'Grain de peau plus régulier',
      'Resserrer les pores', 'Adoucir la texture', 'Peau plus lisse au toucher',
      'Uniformiser le grain', 'Réduire les pores dilatés', 'Affiner le relief de la peau',
      'Texture plus homogène', 'Lissage du grain de peau',
    ]},
    eclat: { emoji: '✨', pool: [
      'Révéler l\'éclat du teint', 'Teint terne', 'Manque d\'éclat', 'Luminosité générale',
      'Glow naturel', 'Fraîcheur du teint', 'Uniformité du teint', 'Raviver le teint',
      'Teint plus lumineux', 'Coup d\'éclat', 'Réveiller la peau', 'Teint plus frais',
      'Éclat du visage', 'Lumière du teint', 'Redonner de la vitalité', 'Teint éclatant',
    ]},
    zoneT: { emoji: '✨', pool: [
      'Réduire les brillances', 'Brillance du front', 'Brillance du nez', 'Contrôle des brillances',
      'Équilibre de la zone T', 'Réguler l\'excès de sébum', 'Matifier la zone T',
      'Réguler le sébum', 'Zone T plus équilibrée', 'Limiter les brillances',
      'Fini plus mat', 'Équilibrer le centre du visage', 'Maîtriser les brillances',
    ]},
    regard: { emoji: '👁️', pool: [
      'Éclat du regard', 'Regard fatigué', 'Cernes visibles', 'Uniformité du contour des yeux',
      'Hydratation du contour des yeux', 'Réveiller le regard', 'Défatiguer le regard',
      'Illuminer le contour des yeux', 'Atténuer les cernes', 'Regard plus reposé',
      'Lisser le contour des yeux', 'Ouvrir le regard',
    ]},
    lips: { emoji: '💋', pool: [
      'Hydratation des lèvres', 'Confort des lèvres', 'Souplesse des lèvres', 'Lèvres plus douces',
      'Nourrir les lèvres', 'Réconforter les lèvres',
    ]},
    antiage: { emoji: '🌸', pool: [
      'Préserver la fermeté', 'Élasticité de la peau', 'Prévenir les ridules', 'Rebond cutané',
      'Qualité de peau', 'Préserver l\'éclat', 'Améliorer la fermeté', 'Lisser les ridules',
      'Tonus de la peau', 'Densité de la peau', 'Prévention du temps qui passe',
      'Raffermir les contours', 'Préserver la jeunesse de la peau',
    ]},
    protection: { emoji: '☀️', pool: [
      'Protection quotidienne', 'Protection UV', 'Prévenir les taches', 'Défense cutanée',
      'Préserver l\'éclat', 'Protéger du soleil', 'Prévention des taches solaires',
      'Bouclier anti-pollution', 'Protéger la peau au quotidien',
    ]},
  };

  function _priorityScores(result, answers = {}) {
    const zones = result.zones || {};
    const vals  = Object.values(zones);
    const a = (sel) => vals.length ? avg(vals.map(sel)) : 50;
    const gRed = a(z => z.redness), gEclat = a(z => z.eclat), gPores = a(z => z.pores), gTex = a(z => z.texture);
    const st   = result.skinType?.type || answers.skinType || 'normale';
    const conc = Array.isArray(answers.complexes) ? answers.complexes : (Array.isArray(answers.concerns) ? answers.concerns : []);
    const vision = result.vision || {};
    const age  = answers.ageGroup || answers.age || null;
    const is35 = age === '40+' || age === '30-40' || (parseInt(age) >= 35);
    const jit  = () => (Math.random() * 16 - 4); // -4 à +12 (favorise un peu la variété)

    // T-zone sébum
    const tz = [zones.forehead, zones.nose].filter(Boolean);
    const tPores = tz.length ? avg(tz.map(z => z.pores)) : gPores;

    return {
      hydration:    (st === 'seche' ? 55 : 20) + (conc.includes('secheresse') ? 35 : 0) + Math.max(0, 60 - gEclat) * 0.4 + (vision.eclat === 'terne' || vision.eclat === 'très_terne' ? 15 : 0) + jit(),
      redness:      gRed * 0.7 + (st === 'sensible' ? 25 : 0) + (conc.includes('rougeurs') ? 35 : 0) + (vision.rougeurs?.niveau === 'prononcées' ? 30 : vision.rougeurs?.niveau === 'légères' ? 15 : 0) + jit(),
      imperfections:(conc.includes('acne') ? 50 : 0) + (vision.imperfections?.presentes ? 40 : 0) + (st === 'grasse' ? 15 : 0) + jit(),
      pores_texture:Math.max(0, 60 - gPores) * 0.5 + Math.max(0, 60 - gTex) * 0.4 + (conc.includes('pores') ? 35 : 0) + jit(),
      eclat:        Math.max(0, 62 - gEclat) * 0.6 + (conc.includes('eclat') ? 35 : 0) + (vision.eclat === 'terne' ? 25 : vision.eclat === 'très_terne' ? 40 : 0) + jit(),
      zoneT:        Math.max(0, 55 - tPores) * 0.6 + (st === 'grasse' ? 35 : st === 'mixte' ? 28 : 0) + jit(),
      regard:       (result.cernes?.detected ? (result.cernes.intensity === 'marqués' ? 55 : 38) : 0) + (conc.includes('cernes') ? 35 : 0) + jit(),
      lips:         8 + (st === 'seche' ? 10 : 0) + jit(),
      antiage:      (is35 ? 45 : 0) + (conc.includes('rides') ? 45 : 0) + (answers.objectives === 'anti-age' ? 30 : 0) + jit(),
      protection:   28 + (conc.includes('taches') ? 30 : 0) + (is35 ? 10 : 0) + jit(),
    };
  }

  const PRIORITY_DESC = {
    hydration:     'Ta peau a besoin d\'un peu plus de confort et d\'hydratation.',
    redness:       'Quelques zones réagissent — on va les apaiser en douceur.',
    imperfections: 'On cible les imperfections pour une peau plus nette.',
    pores_texture: 'On affine le grain pour une peau plus lisse.',
    eclat:         'On réveille la lumière naturelle de ton teint.',
    zoneT:         'On équilibre les brillances de la zone T.',
    regard:        'On illumine et défatigue le contour des yeux.',
    lips:          'On apporte douceur et confort à tes lèvres.',
    antiage:       'On préserve la fermeté et la qualité de ta peau.',
    protection:    'On protège ta peau pour préserver son éclat.',
  };

  // Retourne 3 priorités { emoji, label, desc, family } sélectionnées dynamiquement
  function buildPriorities(result, answers = {}) {
    if (!result) return [];
    const scores = _priorityScores(result, answers);
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 3);
    return top.map(([family]) => ({
      emoji: PRIORITY_LIB[family].emoji,
      label: _pick(PRIORITY_LIB[family].pool),
      desc:  PRIORITY_DESC[family] || '',
      family,
    }));
  }

  // ══════════════════════════════════════════════════════════════
  // ANALYSE COLORIMÉTRIQUE — saison + palettes (la feature vedette)
  // Dérivée du sous-ton + carnation + contraste déjà détectés.
  // ══════════════════════════════════════════════════════════════

  const SEASON_LIB = {
    printemps: {
      label: 'Printemps Lumineux', emoji: '🌸',
      desc: 'Chaleur et clarté. Les couleurs vives et lumineuses illuminent ton teint.',
      palette: [
        ['Corail', '#FF7F50'], ['Pêche', '#FFB07C'], ['Jaune chaud', '#FFD966'],
        ['Vert pomme', '#9ACD32'], ['Turquoise', '#40E0D0'], ['Ivoire', '#FBF3E0'],
        ['Camel', '#C19A6B'], ['Rose corail', '#FF6F61'],
      ],
      avoid: [['Noir', '#1a1a1a'], ['Gris froid', '#708090'], ['Prune sombre', '#4A0E2E'], ['Bordeaux', '#5C0A2E']],
      makeup: [['Lèvres corail', '#FF6F61'], ['Blush pêche', '#FFB07C'], ['Fard doré', '#E6BE8A']],
      hair: [['Blond doré', '#D4A857'], ['Châtain doré', '#9C6B30'], ['Cuivré', '#B87333']],
    },
    ete: {
      label: 'Été Doux', emoji: '🌊',
      desc: 'Douceur et fraîcheur. Les teintes douces et froides subliment ta clarté.',
      palette: [
        ['Rose poudré', '#E8B4C8'], ['Bleu ciel', '#A7C7E7'], ['Lavande', '#C3B1E1'],
        ['Vert d\'eau', '#A8D5BA'], ['Gris perle', '#D3D3D3'], ['Bleu doux', '#6E8CA8'],
        ['Mauve', '#B784A7'], ['Framboise douce', '#C9648B'],
      ],
      avoid: [['Orange', '#FF8C00'], ['Jaune vif', '#FFD700'], ['Marron chaud', '#8B4513'], ['Camel', '#C19A6B']],
      makeup: [['Lèvres framboise', '#C9486B'], ['Blush rosé', '#E8A6B8'], ['Fard taupe', '#9A8593']],
      hair: [['Blond cendré', '#C2B280'], ['Châtain cendré', '#7A6A58'], ['Brun froid', '#4A3C30']],
    },
    automne: {
      label: 'Automne Profond', emoji: '🍂',
      desc: 'Richesse et profondeur. Les teintes chaudes et terreuses révèlent ton intensité.',
      palette: [
        ['Terracotta', '#C76B47'], ['Moutarde', '#D4A017'], ['Vert olive', '#708238'],
        ['Rouille', '#B7410E'], ['Kaki', '#83835C'], ['Crème', '#F5E6CA'],
        ['Bronze', '#CD7F32'], ['Prune chaude', '#7B3F2B'],
      ],
      avoid: [['Rose pastel', '#FFD1DC'], ['Bleu glacé', '#D6EAF8'], ['Gris froid', '#A9A9A9'], ['Fuchsia', '#E0218A']],
      makeup: [['Lèvres brique', '#A52A2A'], ['Blush terracotta', '#CC6B49'], ['Fard bronze', '#B08D57']],
      hair: [['Auburn', '#922724'], ['Châtain cuivré', '#8B4513'], ['Chocolat chaud', '#5C4033']],
    },
    hiver: {
      label: 'Hiver Intense', emoji: '❄️',
      desc: 'Contraste et éclat. Les couleurs franches et froides magnifient ton intensité.',
      palette: [
        ['Rouge vif', '#C8102E'], ['Bleu roi', '#1E3A8A'], ['Émeraude', '#046307'],
        ['Fuchsia', '#C71585'], ['Blanc pur', '#FCFCFC'], ['Noir', '#1a1a1a'],
        ['Argent', '#C0C0C0'], ['Prune', '#5D2A5C'],
      ],
      avoid: [['Orange', '#FF8C00'], ['Beige doré', '#E1C699'], ['Moutarde', '#D4A017'], ['Kaki', '#83835C']],
      makeup: [['Lèvres framboise', '#B0306A'], ['Blush rose froid', '#D87093'], ['Fard prune', '#6A2C70']],
      hair: [['Brun froid foncé', '#2C1B18'], ['Noir bleuté', '#1C1C2E'], ['Châtain froid', '#4A3C30']],
    },
  };

  // Détermine la saison depuis le sous-ton + la carnation (+ contraste si dispo)
  function buildColorimetry(result) {
    if (!result) return null;
    const ut = result.undertone?.type || 'neutral';
    const ca = result.carnation?.type || 'medium';   // clair | medium | fonce
    const contrast = result.eyeContrast?.level || result.eyeContrast || null; // 'fort'|'moyen'|'faible' si dispo
    const light = ca === 'clair';
    const deep  = ca === 'fonce';
    const highContrast = contrast === 'fort' || contrast === 'high';

    let season;
    if (ut === 'warm') {
      season = light ? 'printemps' : 'automne';
    } else if (ut === 'cool') {
      season = (deep || highContrast) ? 'hiver' : 'ete';
    } else { // neutre → on s'appuie sur la profondeur / le contraste
      if (light) season = highContrast ? 'printemps' : 'ete';
      else if (deep) season = 'hiver';
      else season = highContrast ? 'hiver' : 'automne';
    }

    const s = SEASON_LIB[season];
    return {
      season,
      label: s.label,
      emoji: s.emoji,
      desc: s.desc,
      undertone: result.undertone?.label || ut,
      carnation: result.carnation?.label || ca,
      palette: s.palette,
      avoid: s.avoid,
      makeup: s.makeup,
      hair: s.hair,
    };
  }

  function getTopInsights(result) {
    if (!result?.zones) return [];

    const baseline = _computeFaceBaseline(result.zones);
    if (!baseline) return [];

    // 1. Scorer TOUS les signaux de TOUTES les zones (pas de cascade)
    const groups = {};
    for (const [zoneKey, z] of Object.entries(result.zones)) {
      const signals = _scoreZoneSignals(z, baseline);
      for (const { key, severity } of signals) {
        if (severity < 35) continue; // gate bas : on collecte large, le tri fin se fait après
        if (!groups[key]) groups[key] = { key, zones: [], severity: 0 };
        groups[key].zones.push({ zoneKey, severity });
        groups[key].severity = Math.max(groups[key].severity, severity);
      }
    }
    // Trier les zones de chaque groupe par sévérité décroissante
    for (const g of Object.values(groups)) {
      g.zones.sort((a, b) => b.severity - a.severity);
    }

    // 2. Cernes (signal indépendant des zones cutanées)
    if (result.cernes?.detected) {
      const cerSev = result.cernes.intensity === 'marqués' ? 72 : 58;
      groups.cernes = { key: 'cernes', zones: [{ zoneKey: 'eyes', severity: cerSev }], severity: cerSev };
    }

    // 3. Seuil PROPRE À CHAQUE SIGNAL → garantit la variété.
    // Rougeurs & grain = barre très haute (ne sortent que si vraiment marqués) car
    // structurellement élevés pour tous. Taches/éclat/zone T/cernes = barre basse.
    const SIGNAL_MIN = {
      redness: 84,   // rare : seulement une vraie réactivité localisée
      texture: 74,   // rare : seulement un grain vraiment irrégulier
      taches:  50,   // facile à afficher
      terne:   52,
      sebum:   52,
      cernes:  55,
    };
    let ranked = Object.values(groups)
      .filter(g => g.severity >= (SIGNAL_MIN[g.key] ?? 52))
      .sort((a, b) => b.severity - a.severity);

    // 4. Anti-doublon : 2 signaux sur la même zone unique + sévérités proches → garder le + fort
    const kept = [];
    for (const g of ranked) {
      const gZone = g.zones[0]?.zoneKey;
      const dup = kept.find(k =>
        k.zones[0]?.zoneKey === gZone &&
        Math.abs(k.severity - g.severity) <= INSIGHT_TUNING.REDUNDANCY
      );
      if (!dup) kept.push(g);
    }

    // 5. Garder au plus MAX_ISSUES observations "à chouchouter"
    let selected = kept.slice(0, INSIGHT_TUNING.MAX_ISSUES);

    const mapped = selected.map((g, rank) => {
      const primaryZone = g.zones[0]?.zoneKey;
      const bothCheeks  = g.zones.length >= 2
        && g.zones.every(z => z.zoneKey === 'leftCheek' || z.zoneKey === 'rightCheek');
      const FIXED_SUMMARY = { sebum: 'Zone T', cernes: 'Yeux', terne: 'Joues & front' };
      const zoneSummary   = FIXED_SUMMARY[g.key]
        || (bothCheeks ? 'Joues' : (ZONE_REGIONS[primaryZone]?.label || ''));

      const { pillLabel, sentence, advice } = _generateInsightText(g.key, result, g);

      return {
        ...g,
        rank,
        zoneKey:   primaryZone,
        zoneLabel: ZONE_REGIONS[primaryZone]?.label || '',
        zoneSummary,
        pillLabel,
        sentence,
        advice,
      };
    });

    // 6. Toujours ajouter un point positif valorisant (jamais 100% négatif)
    if (INSIGHT_TUNING.ALWAYS_POSITIVE || mapped.length === 0) {
      const exclTypes = mapped.map(m => m.key);
      const positive = _buildPositiveNote(result.zones, baseline, exclTypes);
      if (positive) { positive.rank = mapped.length; mapped.push(positive); }
    }

    return mapped;
  }

  function renderFaceOverlay(target, photo, landmarks, result) {
    if (!photo || !landmarks?.length || !result?.zones) return;

    const NS = 'http://www.w3.org/2000/svg';
    // Exclure le point positif de l'overlay (pas de zone "problème" à dessiner)
    const insights = getTopInsights(result).filter(i => !i.positive && i.key !== 'positive').slice(0, 3);
    if (!insights.length) return;

    // Heatmap palette — issue-specific beauty colors
    const HEATMAP_CFG = {
      redness:  { r:215, g:120, b:130 },  // voile rosé translucide
      cernes:   { r:148, g:105, b:212 },  // halo lavande froid
      sebum:    { r:210, g:190, b:85  },  // glow champagne doré
      taches:   { r:185, g:148, b:100 },  // terre chaude
      terne:    { r:175, g:162, b:120 },  // lumière diffuse dorée
      texture:  { r:110, g:125, b:195 },  // grain bleuté lumineux
    };

    // Micro-zone anatomical landmark clusters (MediaPipe 478-point mesh)
    const MICRO_LM = {
      underEyeLeft:    [116,117,118,119,120,121,128,229,230,231,232],
      underEyeRight:   [345,346,347,348,349,350,357,449,450,451,452],
      noseWingLeft:    [49,64,102,129,203,48,115,220,45],
      noseWingRight:   [279,294,331,358,423,278,344,440,275],
      upperCheekLeft:  [116,123,147,213,192,214,210,204,50],
      upperCheekRight: [345,352,376,433,411,434,430,424,280],
      foreheadCenter:  [9,10,151,68,104,69,108,337,299,333],
      templeLeft:      [234,93,132,58,172,136],
      templeRight:     [454,323,361,288,397,365],
      chin:            [152,200,199,175,171,377,396,369,395,394],
      mouthContour:    [61,185,40,39,37,0,267,270,409,291,375,321,405,314,17,84,181,91,146],
    };

    // Analysis zone → micro-zone(s) for targeted heatmap rendering
    const ZONE_TO_MICRO = {
      leftCheek:  ['upperCheekLeft'],
      rightCheek: ['upperCheekRight'],
      forehead:   ['foreheadCenter'],
      nose:       ['noseWingLeft', 'noseWingRight'],
      eyes:       ['underEyeLeft', 'underEyeRight'],
      chin:       ['chin'],
    };

    const wrap = document.createElement('div');
    wrap.className = 'fo-wrap';
    target.appendChild(wrap);

    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'fo-media-wrap';
    wrap.appendChild(mediaWrap);

    const imgEl = document.createElement('img');
    imgEl.className = 'fo-photo';
    imgEl.alt = 'Analyse beauté';
    mediaWrap.appendChild(imgEl);

    imgEl.onload = () => {
      const W = imgEl.naturalWidth;
      const H = imgEl.naturalHeight;
      mediaWrap.style.aspectRatio = `${W} / ${H}`;

      const _ellipseFromLM = (lmIdx) => {
        const pts = lmIdx
          .map(i => landmarks[i] ? { x: landmarks[i].x * W, y: landmarks[i].y * H } : null)
          .filter(Boolean);
        if (pts.length < 3) return null;
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const rx = Math.min(pts.reduce((s, p) => s + Math.abs(p.x - cx), 0) / pts.length * 1.5, W * 0.13);
        const ry = Math.min(pts.reduce((s, p) => s + Math.abs(p.y - cy), 0) / pts.length * 1.5, H * 0.10);
        return { cx, cy, rx, ry };
      };

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'fo-svg');
      mediaWrap.appendChild(svg);

      const defs = document.createElementNS(NS, 'defs');
      svg.appendChild(defs);

      // Staggered reveal + multi-speed breathing
      const styleEl = document.createElementNS(NS, 'style');
      styleEl.textContent =
        '@keyframes fo-reveal{from{opacity:0}to{opacity:1}}' +
        '@keyframes fo-breathe{0%,100%{opacity:1}50%{opacity:.20}}' +
        '.fo-z0{animation:fo-reveal .9s ease-out forwards .6s;opacity:0}' +
        '.fo-z1{animation:fo-reveal .9s ease-out forwards 1.3s;opacity:0}' +
        '.fo-z2{animation:fo-reveal .9s ease-out forwards 2.0s;opacity:0}' +
        '.fo-b0{animation:fo-breathe 3.8s ease-in-out infinite}' +
        '.fo-b1{animation:fo-breathe 4.6s ease-in-out infinite 1.2s}' +
        '.fo-b2{animation:fo-breathe 5.2s ease-in-out infinite 2.1s}';
      defs.appendChild(styleEl);

      // Luminous scan line
      const scanGradId = 'fo-scan-g';
      const sg = document.createElementNS(NS, 'linearGradient');
      sg.setAttribute('id', scanGradId);
      sg.setAttribute('x1', '0'); sg.setAttribute('y1', '0');
      sg.setAttribute('x2', '0'); sg.setAttribute('y2', '1');
      [['0%','rgba(255,255,255,0)'],['42%','rgba(255,255,255,0)'],
       ['50%','rgba(255,255,255,0.45)'],['58%','rgba(255,255,255,0)'],['100%','rgba(255,255,255,0)']
      ].forEach(([off,col]) => {
        const s = document.createElementNS(NS,'stop');
        s.setAttribute('offset',off); s.setAttribute('stop-color',col);
        sg.appendChild(s);
      });
      defs.appendChild(sg);
      const scanRect = document.createElementNS(NS,'rect');
      scanRect.setAttribute('x','0'); scanRect.setAttribute('y',(-H*0.12).toFixed(0));
      scanRect.setAttribute('width',String(W)); scanRect.setAttribute('height',(H*1.24).toFixed(0));
      scanRect.setAttribute('fill',`url(#${scanGradId})`); scanRect.setAttribute('opacity','0.65');
      const sa = document.createElementNS(NS,'animate');
      sa.setAttribute('attributeName','y');
      sa.setAttribute('values',`${(-H*0.12).toFixed(0)};${(H*0.88).toFixed(0)}`);
      sa.setAttribute('dur','2.2s'); sa.setAttribute('begin','0.05s');
      sa.setAttribute('fill','freeze'); sa.setAttribute('calcMode','spline');
      sa.setAttribute('keySplines','0.4 0 0.6 1');
      scanRect.appendChild(sa); svg.appendChild(scanRect);

      // Severity → alpha: 0→0.08, 100→0.52
      const iAlpha = (sev) => 0.08 + (Math.min(sev, 100) / 100) * 0.44;

      const faceCx = landmarks[1].x * W;
      const LABEL_Y = [H * 0.17, H * 0.47, H * 0.73];

      insights.forEach(({ key, zones, rank, severity: groupSev, pillLabel }) => {
        const { r, g, b } = HEATMAP_CFG[key] || HEATMAP_CFG.redness;
        const isPri = rank === 0;
        const alpha = iAlpha(groupSev);

        // 5-stop outer gradient — true progressive diffusion (cloud → transparent)
        const outerGradId = `fo-og-${rank}`;
        const og = document.createElementNS(NS, 'radialGradient');
        og.setAttribute('id', outerGradId);
        og.setAttribute('cx','50%'); og.setAttribute('cy','50%'); og.setAttribute('r','50%');
        [
          ['0%',  (alpha * 0.42).toFixed(3)],
          ['25%', (alpha * 0.24).toFixed(3)],
          ['52%', (alpha * 0.09).toFixed(3)],
          ['80%', (alpha * 0.02).toFixed(3)],
          ['100%','0'],
        ].forEach(([off, op]) => {
          const s = document.createElementNS(NS,'stop');
          s.setAttribute('offset',off);
          s.setAttribute('stop-color',`rgb(${r},${g},${b})`);
          s.setAttribute('stop-opacity',op);
          og.appendChild(s);
        });
        defs.appendChild(og);

        // 4-stop inner gradient — dense hot center + breathing
        const innerGradId = `fo-ig-${rank}`;
        const ig = document.createElementNS(NS, 'radialGradient');
        ig.setAttribute('id', innerGradId);
        ig.setAttribute('cx','50%'); ig.setAttribute('cy','50%'); ig.setAttribute('r','50%');
        [
          ['0%',  alpha.toFixed(3)],
          ['36%', (alpha * 0.60).toFixed(3)],
          ['70%', (alpha * 0.18).toFixed(3)],
          ['100%','0'],
        ].forEach(([off, op]) => {
          const s = document.createElementNS(NS,'stop');
          s.setAttribute('offset',off);
          s.setAttribute('stop-color',`rgb(${r},${g},${b})`);
          s.setAttribute('stop-opacity',op);
          ig.appendChild(s);
        });
        defs.appendChild(ig);

        const zoneGroup = document.createElementNS(NS,'g');
        zoneGroup.setAttribute('class',`fo-z${rank}`);
        svg.appendChild(zoneGroup);

        let primaryEl = null;

        // Map analysis zones → anatomical micro-zones
        const microZones = zones.flatMap(({ zoneKey, severity }) =>
          (ZONE_TO_MICRO[zoneKey] || [zoneKey]).map(mk => ({ mk, severity }))
        );

        microZones.forEach(({ mk, severity: zoneSev }) => {
          const lmIdx = MICRO_LM[mk];
          if (!lmIdx) return;
          const el = _ellipseFromLM(lmIdx);
          if (!el) return;
          if (!primaryEl) primaryEl = el;
          const { cx, cy, rx, ry } = el;
          const zA = iAlpha(zoneSev);

          // Layer 1 — ambient cloud (5× — very wide, very faint)
          const cloud = document.createElementNS(NS,'ellipse');
          cloud.setAttribute('cx',cx.toFixed(1)); cloud.setAttribute('cy',cy.toFixed(1));
          cloud.setAttribute('rx',(rx*5.0).toFixed(1)); cloud.setAttribute('ry',(ry*4.5).toFixed(1));
          cloud.setAttribute('fill',`url(#${outerGradId})`); cloud.setAttribute('opacity','0.48');
          zoneGroup.appendChild(cloud);

          // Layer 2 — outer glow (3.2× — main diffusion)
          const outerGlow = document.createElementNS(NS,'ellipse');
          outerGlow.setAttribute('cx',cx.toFixed(1)); outerGlow.setAttribute('cy',cy.toFixed(1));
          outerGlow.setAttribute('rx',(rx*3.2).toFixed(1)); outerGlow.setAttribute('ry',(ry*3.0).toFixed(1));
          outerGlow.setAttribute('fill',`url(#${outerGradId})`);
          zoneGroup.appendChild(outerGlow);

          // Layer 3 — main halo, breathing (1.8× — hot zone)
          const halo = document.createElementNS(NS,'ellipse');
          halo.setAttribute('cx',cx.toFixed(1)); halo.setAttribute('cy',cy.toFixed(1));
          halo.setAttribute('rx',(rx*1.8).toFixed(1)); halo.setAttribute('ry',(ry*1.8).toFixed(1));
          halo.setAttribute('fill',`url(#${innerGradId})`);
          halo.setAttribute('class',`fo-b${rank}`);
          zoneGroup.appendChild(halo);

          // Layer 4 — contour ring (1× — anatomical boundary)
          const ring = document.createElementNS(NS,'ellipse');
          ring.setAttribute('cx',cx.toFixed(1)); ring.setAttribute('cy',cy.toFixed(1));
          ring.setAttribute('rx',rx.toFixed(1)); ring.setAttribute('ry',ry.toFixed(1));
          ring.setAttribute('fill','none');
          ring.setAttribute('stroke',`rgba(${r},${g},${b},${(zA*0.50).toFixed(2)})`);
          ring.setAttribute('stroke-width',Math.max(0.5,W*0.0012).toFixed(1));
          zoneGroup.appendChild(ring);

          // Layer 5 — hot spot pin (precise center)
          const pin = document.createElementNS(NS,'circle');
          pin.setAttribute('cx',cx.toFixed(1)); pin.setAttribute('cy',cy.toFixed(1));
          pin.setAttribute('r',(W*0.0028).toFixed(1));
          pin.setAttribute('fill',`rgba(${r},${g},${b},${(zA*0.92).toFixed(2)})`);
          zoneGroup.appendChild(pin);
        });

        if (!primaryEl) return;

        const { cx: zoneCx, cy: zoneCy } = primaryEl;
        const isCentral = Math.abs(zoneCx - faceCx) < W * 0.08;
        const onRight   = isCentral ? (rank % 2 === 0) : (zoneCx >= faceCx);

        const tagW  = isPri ? W * 0.190 : W * 0.160;
        const tagH  = W * 0.034;
        const tagCx = onRight ? W * 0.835 : W * 0.165;
        const tagCy = LABEL_Y[rank];
        const tagFs = isPri ? W * 0.019 : W * 0.016;

        // Dashed callout
        const lineEdgeX = onRight ? tagCx - tagW / 2 : tagCx + tagW / 2;
        const callout = document.createElementNS(NS,'line');
        callout.setAttribute('x1',zoneCx.toFixed(1)); callout.setAttribute('y1',zoneCy.toFixed(1));
        callout.setAttribute('x2',lineEdgeX.toFixed(1)); callout.setAttribute('y2',tagCy.toFixed(1));
        callout.setAttribute('stroke',`rgba(${r},${g},${b},${isPri?0.30:0.18})`);
        callout.setAttribute('stroke-width',Math.max(0.4,W*0.0008).toFixed(1));
        callout.setAttribute('stroke-linecap','round');
        callout.setAttribute('stroke-dasharray',`${(W*0.007).toFixed(1)} ${(W*0.004).toFixed(1)}`);
        zoneGroup.appendChild(callout);

        // Frosted micro-chip
        const chip = document.createElementNS(NS,'rect');
        chip.setAttribute('x',(tagCx-tagW/2).toFixed(1));
        chip.setAttribute('y',(tagCy-tagH/2).toFixed(1));
        chip.setAttribute('width',tagW.toFixed(1));
        chip.setAttribute('height',tagH.toFixed(1));
        chip.setAttribute('rx',(tagH/2).toFixed(1));
        chip.setAttribute('fill',`rgba(255,255,255,${isPri?0.86:0.72})`);
        chip.setAttribute('stroke',`rgba(${r},${g},${b},${isPri?0.20:0.12})`);
        chip.setAttribute('stroke-width','0.5');
        zoneGroup.appendChild(chip);

        // Micro-annotation label
        const txt = document.createElementNS(NS,'text');
        txt.setAttribute('x',tagCx.toFixed(1));
        txt.setAttribute('y',(tagCy+tagFs*0.38).toFixed(1));
        txt.setAttribute('text-anchor','middle');
        txt.setAttribute('fill',`rgba(30,22,40,${isPri?0.82:0.65})`);
        txt.setAttribute('font-size',tagFs.toFixed(1));
        txt.setAttribute('font-weight',isPri?'500':'400');
        txt.setAttribute('font-family','DM Sans, sans-serif');
        txt.setAttribute('letter-spacing','0.3');
        txt.textContent = pillLabel || key;
        zoneGroup.appendChild(txt);
      });
    };

    imgEl.src = photo;
  }

  // ─── Rapport principal ────────────────────────────────────────

  function renderReport(result, content) {
    const { zones, undertone, skinType, faceShape, globalScore, cernes, carnation, eyeContrast } = result;

    const ut  = undertone?.type  || 'neutral';
    const ca  = carnation?.type  || 'medium';
    const cer = cernes?.detected ? cernes.type : 'none';
    const ec  = eyeContrast?.level || 'moyen';
    const answers = AppState?.questionnaire?.answers || {};
    const mp  = ProductCatalog.getMaturityPreference(answers);
    const fromQuestionnaire = sessionStorage.getItem('glow_from_questionnaire') === '1';

    const skinTypeLbl = skinType?.type || 'normale';
    const cernesType  = cernes?.detected ? cernes.type : null;
    const cernesInt   = cernes?.detected ? cernes.intensity : null;

    // ─── Explication sous-ton enrichie (carnation + undertone) ────
    const UNDERTONE_EXPLAIN_CA = {
      warm: {
        clair:  'Ta peau claire a des reflets dorés et légèrement pêchés — les teintes chaudes comme le corail, l\'abricot et l\'or champagne t\'illuminent sans effet masque.',
        medium: 'Ta peau medium a des reflets dorés et bronzés — les teintes terracotta, pêche et cuivre s\'harmonisent parfaitement avec ta carnation.',
        fonce:  'Ta peau foncée a des reflets dorés très intenses — les teintes bronze, cuivré et miel subliment particulièrement bien tes nuances naturelles.'
      },
      cool: {
        clair:  'Ta peau claire a des reflets rosés et légèrement bleutés — les teintes froides comme le rose poudré, le lilas et le blanc rosé te donnent un éclat naturel.',
        medium: 'Ta peau medium a des reflets rosés et mauve — les teintes bordeaux, fuchsia et prune s\'harmonisent parfaitement avec tes sous-tons.',
        fonce:  'Ta peau foncée a des reflets bleutés profonds — les teintes prune intense, violet et framboise foncée créent un contraste sublime.'
      },
      neutral: {
        clair:  'Ta peau claire est équilibrée — ni trop dorée, ni trop rosée. Tu peux porter aussi bien des teintes chaudes que froides, ce qui te donne une flexibilité rare.',
        medium: 'Ta peau medium est parfaitement équilibrée — une grande polyvalence te permet de jouer avec toutes les palettes de couleurs sans risque d\'erreur.',
        fonce:  'Ta peau foncée est parfaitement équilibrée — les teintes terracotta, bordeaux et bronze fonctionnent toutes à merveille sur toi.'
      }
    };

    // ─── Conseil fond de teint (undertone + skin type) ────────────
    const FDT_SHADE = { warm: 'warm, W ou Y', cool: 'cool, C ou P', neutral: 'neutral ou N' };
    const FDT_AVOID = {
      warm:    'Évite les teintes C ou P (Cool/Pink) qui créent un effet grisâtre sur ta peau.',
      cool:    'Évite les teintes W ou Y (Warm/Yellow) qui peuvent paraître orangées sur toi.',
      neutral: 'Tu peux essayer les deux — mais les teintes N (Neutral) seront toujours ta valeur sûre.'
    };
    const FDT_TEXTURE = {
      grasse:   'Privilégie une formule <strong>matifiante, longue tenue</strong> pour contrôler les brillances.',
      mixte:    'Choisis une formule <strong>équilibrante</strong> — matifiante sur la zone T, hydratante sur les joues.',
      seche:    'Opte pour une formule <strong>hydratante et lumineuse</strong> pour éviter l\'effet écailleux.',
      sensible: 'Choisis une formule <strong>sans parfum, hypoallergénique</strong> pour éviter les réactions.',
      normale:  'Toutes les textures te conviennent — choisis selon le rendu que tu recherches.'
    };

    // ─── Conseil correcteur (cernes + undertone) ──────────────────
    function getConcealerTip() {
      if (!cernesType) return `Choisis un anti-cernes <strong>1 à 2 tons plus clair</strong> que ton fond de teint pour illuminer la zone sous l'œil.`;
      const correct = {
        bleu:   'pêche ou orangé',
        rouge:  'jaune ou beige',
        marron: 'saumon ou orangé'
      }[cernesType] || 'légèrement plus clair';
      const intensity = cernesInt === 'marqués' ? ' — tes cernes sont marqués, préfère une couvrance totale' : '';
      return `Tes cernes sont <strong>${cernesType}s${cernesInt ? ' · ' + cernesInt + 's' : ''}</strong>. Applique un correcteur <strong>${correct}</strong> avant ton anti-cernes pour neutraliser${intensity}.`;
    }

    // ─── Conseils yeux (undertone + eye contrast + skin type) ─────
    const EYE_COLORS = {
      warm: {
        fort:   'doré, bronze intense, marron fumé, terracotta profond',
        moyen:  'marron chaud, bronze doux, terracotta, cuivré',
        faible: 'nude doré, beige chaud, marron clair, champagne'
      },
      cool: {
        fort:   'prune intense, violet profond, gris anthracite, bordeaux',
        moyen:  'rose taupe, mauve, gris doux, prune',
        faible: 'rose pâle, lilas, taupe rosé, gris clair'
      },
      neutral: {
        fort:   'marron intense, kaki, gris chaud, terracotta foncé',
        moyen:  'marron naturel, taupe, gris chaud, nude',
        faible: 'nude, beige rosé, gris très clair, pêche doux'
      }
    };
    const EYE_WHY = {
      fort:   `Ton contraste naturel est <strong>fort</strong> — des teintes intenses accentuent l'intensité de ton regard sans surcharger.`,
      moyen:  `Ton contraste est <strong>moyen</strong> — des teintes équilibrées définissent ton regard tout en restant naturelles.`,
      faible: `Ton contraste est <strong>doux</strong> — des teintes légères créent de la profondeur sans alourdir.`
    };
    const MASCARA_TYPE = {
      fort:   'volumateur longue tenue',
      moyen:  'allongeant + volumateur',
      faible: 'allongeant effet sérum'
    };

    // ─── Conseils lèvres (undertone + carnation) ──────────────────
    const LIP_SHADES_FULL = {
      warm: {
        clair:  'nude pêche, corail clair, rose abricoté, rouge orangé doux',
        medium: 'corail, pêche intense, nude caramel, rouge brique',
        fonce:  'terracotta, miel, chocolat chaud, rouge orangé profond'
      },
      cool: {
        clair:  'rose pâle, mauve lilas, rouge vif, framboise légère',
        medium: 'rose fushia, framboise, bordeaux doux, prune',
        fonce:  'bordeaux intense, prune profond, violet, rouge à lèvres foncé'
      },
      neutral: {
        clair:  'nude rosé, beige léger, rose naturel, pêche clair',
        medium: 'nude universel, beige rosé, caramel léger, rouge classique',
        fonce:  'caramel, nude foncé, nude brun, terracotta medium'
      }
    };

    // Produits sélectionnés pour le budget (1 par catégorie)
    const routineCart = [];
    const cartCategories = new Set();

    // Plafond de prix selon le budget choisi
    const BUDGET_MAX = { 'petits-prix': 20, 'bon-rapport': 50, 'premium': Infinity };
    const budgetMax  = BUDGET_MAX[answers.budget] ?? Infinity;

    function getProductsHTML(categories, limit) {
      const catalog = AppState?.products?.catalog || [];

      // Catégories strictement interdites selon le contexte
      const LIP_CATS  = new Set(['lipstick','lipgloss','lipliner','lipprimer','lipplumper']);
      const EYE_CATS  = new Set(['mascara','eyeliner','eyeshadow','eyebrow']);
      const SKIN_CATS = new Set(['foundation','concealer','powder','blush','bronzer','highlighter']);

      function buildPool(filterUndertone, filterCarnation, filterBudget) {
        return catalog.filter(p => {
          if (!categories.includes(p.category)) return false;
          if (p.active === false) return false;
          if (!p.imageUrl) return false;
          if (LIP_CATS.has(categories[0]) && SKIN_CATS.has(p.category) && !LIP_CATS.has(p.category)) return false;
          if (EYE_CATS.has(categories[0]) && SKIN_CATS.has(p.category) && !EYE_CATS.has(p.category)) return false;
          if (filterUndertone && p.undertone && p.undertone !== 'neutral' && p.undertone !== filterUndertone) return false;
          if (filterCarnation && Array.isArray(p.carnation) && p.carnation.length && !p.carnation.includes(filterCarnation)) return false;
          if (filterBudget && p.price && p.price > budgetMax) return false;
          return true;
        });
      }

      // Essai 1 : filtre strict (sous-ton + carnation + budget)
      let pool = buildPool(ut, ca, true);
      // Essai 2 : relâcher la carnation
      if (pool.length < 2) pool = buildPool(ut, null, true);
      // Essai 3 : relâcher le sous-ton
      if (pool.length < 2) pool = buildPool(null, null, true);
      // Essai 4 : relâcher le budget (ne jamais afficher 0 produit)
      if (pool.length < 2) pool = buildPool(null, null, false);

      // Filtre maturité peau (soft — appliqué après, ne jamais vider)
      if (mp && mp !== 'all') {
        const matFiltered = pool.filter(p => !p.maturity || p.maturity === 'all' || p.maturity === mp);
        if (matFiltered.length >= (limit || 2)) pool = matFiltered;
      }

      // Calculer les besoins détectés (photo + questionnaire)
      const detectedNeeds = buildSkinProfile(result, answers).needs;

      // Trier : d'abord produits qui matchent un besoin détecté, puis featured, puis rating
      pool = pool.sort((a, b) => {
        const aMatch = (a.concernTags || []).some(t => detectedNeeds.includes(t)) ? 1 : 0;
        const bMatch = (b.concernTags || []).some(t => detectedNeeds.includes(t)) ? 1 : 0;
        if (bMatch !== aMatch) return bMatch - aMatch;
        if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
        return (b.rating || 0) - (a.rating || 0);
      });

      // Rotation : index de départ stocké par catégorie, incrémenté à chaque génération
      const rotKey   = 'mkr_rot_' + categories.join('_');
      const rotStart = parseInt(sessionStorage.getItem(rotKey) || '0', 10);

      // Shuffle déterministe basé sur l'index de rotation (pas aléatoire pur)
      // On décale le pool de rotStart positions pour garantir des produits différents
      const rotated = [...pool.slice(rotStart % pool.length), ...pool.slice(0, rotStart % pool.length)];

      // Puis shuffle aléatoire dans chaque moitié pour éviter la répétition
      const mid = Math.ceil(rotated.length / 2);
      for (let i = mid - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rotated[i], rotated[j]] = [rotated[j], rotated[i]];
      }

      // Sélectionner (limit) produits de marques différentes
      const usedBrands = new Set();
      const usedNames  = new Set();
      const selected   = [];
      for (const p of rotated) {
        const brand   = p.brand.toLowerCase().trim();
        const nameKey = (p.brand + p.name.slice(0, 22)).toLowerCase().replace(/\s+/g, '');
        if (usedBrands.has(brand)) continue;
        if (usedNames.has(nameKey)) continue;
        usedBrands.add(brand);
        usedNames.add(nameKey);
        selected.push(p);
        if (selected.length >= (limit || 2)) break;
      }
      pool = selected;

      // Avancer l'index de rotation pour la prochaine génération
      sessionStorage.setItem(rotKey, String((rotStart + (limit || 2)) % Math.max(rotated.length, 1)));

      // Mémoriser pour le budget (1 produit par catégorie)
      pool.forEach(p => {
        if (!cartCategories.has(p.category)) {
          cartCategories.add(p.category);
          routineCart.push(p);
        }
      });

      if (!pool.length) {
        return '<p class="mkr-reco-empty">Produits bientôt disponibles dans cette catégorie.</p>';
      }
      return pool.map(p => {
        const reason = buildProductReason(p, detectedNeeds, result);
        return `
        <div class="mkr-reco-card" onclick="ProductCatalog.openProductModal('${p.id}')">
          <div class="mkr-reco-img mkr-reco-img--makeup">
            <img src="${p.imageUrl}" alt="${p.name}" onerror="this.onerror=null;this.style.opacity='0'">
            ${p.colorHex ? `<span class="mkr-reco-dot" style="background:${p.colorHex}" title="${p.shadeName || ''}"></span>` : ''}
          </div>
          <div class="mkr-reco-body">
            <span class="mkr-reco-brand">${p.brand}</span>
            <p class="mkr-reco-name">${p.name}</p>
            ${p.shadeName ? `<span class="mkr-reco-shade">${p.shadeName}</span>` : ''}
            <span class="mkr-reco-price">${p.price ? p.price.toFixed(2) + ' €' : ''}</span>
            ${reason ? `<p class="mkr-reco-reason">${reason}</p>` : ''}
          </div>
          <a class="btn btn-amazon mkr-reco-buy"
             href="${p.amazonUrl}" target="_blank" rel="noopener nofollow sponsored"
             onclick="event.stopPropagation(); if(typeof Tracker!=='undefined') Tracker.trackBuyClick('${p.id}')">
            Acheter →
          </a>
        </div>`;
      }).join('');
    }

    const makeupWarn = AppState?.face?.hasMakeup
      ? '<div class="mkr-makeup-warn">⚠ Photo prise avec maquillage — le résultat peut être moins précis.</div>'
      : '';

    content.innerHTML = `
      <div class="makeup-report">

        <div class="mkr-header">
          <span class="section-tag">Analyse personnalisée</span>
          <h1>Ton profil maquillage</h1>
          <p class="mkr-header-sub">Résultat basé sur l'analyse colorimétrique de ta peau</p>
          ${makeupWarn}
        </div>

        <!-- PHASE 2 — Carte zones cutanées -->
        <div id="face-overlay-target"></div>

        <!-- BLOC 1 — RÉSULTAT -->
        <div class="mkr-bloc">
          <h2 class="mkr-bloc-title">✦ Ton profil</h2>
          <div class="mkr-chips">
            <div class="mkr-chip">
              <span class="mkr-chip-label">Carnation</span>
              <span class="mkr-chip-value">${carnation?.label || 'Medium'}</span>
            </div>
            <div class="mkr-chip mkr-chip--undertone" style="--chip-color:${undertone?.colorHex || '#C8A882'}">
              <span class="mkr-chip-label">Sous-ton</span>
              <span class="mkr-chip-value" style="color:${undertone?.colorHex || '#C8A882'}">${undertone?.label?.split('·')[0]?.trim() || 'Neutre'}</span>
            </div>
            <div class="mkr-chip">
              <span class="mkr-chip-label">Peau</span>
              <span class="mkr-chip-value">${skinType?.label || 'Normale'}</span>
            </div>
            ${cernes?.detected ? `
            <div class="mkr-chip">
              <span class="mkr-chip-label">Cernes</span>
              <span class="mkr-chip-value">${cernes.type}s · ${cernes.intensity}s</span>
            </div>` : ''}
            <div class="mkr-chip">
              <span class="mkr-chip-label">Contraste yeux</span>
              <span class="mkr-chip-value">${eyeContrast?.label || 'Moyen'}</span>
            </div>
          </div>
        </div>

        <!-- BLOC 2 — EXPLICATION SIMPLE -->
        <div class="mkr-bloc mkr-bloc-explain">
          <h2 class="mkr-bloc-title">💡 Ton profil colorimétrique</h2>
          <p class="mkr-explain-text">${(UNDERTONE_EXPLAIN_CA[ut] || UNDERTONE_EXPLAIN_CA.neutral)[ca] || ''}</p>
        </div>

        <!-- BLOC 3 — APPLICATION CONCRÈTE -->
        <div class="mkr-bloc">
          <h2 class="mkr-bloc-title">🎨 Tes conseils personnalisés</h2>
          <div class="mkr-apply-grid">
            <div class="mkr-apply-item">
              <span class="mkr-apply-label">Fond de teint</span>
              <p>Teinte <strong>${FDT_SHADE[ut]}</strong>. ${FDT_AVOID[ut]}</p>
              <p class="mkr-apply-sub">${FDT_TEXTURE[skinTypeLbl] || FDT_TEXTURE.normale}</p>
            </div>
            <div class="mkr-apply-item">
              <span class="mkr-apply-label">Anti-cernes</span>
              <p>${getConcealerTip()}</p>
            </div>
          </div>
        </div>

        <!-- BLOC 4 — ROUTINES PERSONNALISÉES -->
        <div class="mkr-bloc">
          <h2 class="mkr-bloc-title">✨ Tes teintes selon ta colorimétrie</h2>
          <div class="mkr-tabs">
            <button class="mkr-tab active" onclick="switchMkrTab(this,'teint')">Teint</button>
            <button class="mkr-tab" onclick="switchMkrTab(this,'yeux')">Yeux</button>
            <button class="mkr-tab" onclick="switchMkrTab(this,'levres')">Lèvres</button>
          </div>

          <div id="mkr-tab-teint" class="mkr-tab-panel active">
            <div class="mkr-zone-tip">
              <p>Carnation <strong>${carnation?.label || 'Medium'}</strong> · Sous-ton <strong>${undertone?.label?.split('·')[0]?.trim() || 'Neutre'}</strong> · Peau <strong>${skinType?.label || 'Normale'}</strong></p>
              <p>Teinte idéale : <strong>${FDT_SHADE[ut]}</strong>. ${FDT_AVOID[ut]}</p>
              <p class="mkr-why-note">${FDT_TEXTURE[skinTypeLbl] || FDT_TEXTURE.normale}</p>
              ${cernesType ? `<p class="mkr-cernes-note">◐ ${getConcealerTip()}</p>` : ''}
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['foundation', 'concealer'], 2)}
              ${getProductsHTML(['blush'], 1)}
            </div>
          </div>

          <div id="mkr-tab-yeux" class="mkr-tab-panel">
            <div class="mkr-zone-tip">
              <p>${EYE_WHY[ec]}</p>
              <p>Fards recommandés pour ton profil : <strong>${(EYE_COLORS[ut] || EYE_COLORS.neutral)[ec] || ''}</strong>.</p>
              <p>Mascara : <strong>${MASCARA_TYPE[ec]}</strong> — amplifie ton contraste naturel ${ec === 'fort' ? 'déjà intense' : ec === 'moyen' ? 'équilibré' : 'subtil'}.</p>
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['mascara', 'eyeshadow'], 2)}
            </div>
          </div>

          <div id="mkr-tab-levres" class="mkr-tab-panel">
            <div class="mkr-zone-tip">
              <p>Carnation <strong>${carnation?.label}</strong> + sous-ton <strong>${undertone?.label?.split('·')[0]?.trim()}</strong> — tes teintes signature :</p>
              <p><strong>${(LIP_SHADES_FULL[ut] || LIP_SHADES_FULL.neutral)[ca] || ''}</strong></p>
              <p class="mkr-why-note">Ces teintes sont sélectionnées à l'intersection de ta carnation et de tes reflets naturels — elles fondent sans contraste artificiel.</p>
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['lipliner'], 1)}
              ${getProductsHTML(['lipstick', 'lipgloss'], 1)}
            </div>
          </div>
        </div>

        <!-- BLOC BUDGET -->
        ${renderBudgetBloc(routineCart, budgetMax)}

        <!-- CTA -->
        <div class="diag-cta">
          ${fromQuestionnaire
            ? `<button class="btn btn-dark" onclick="Questionnaire.continueFromAnalysis()">
                 Continuer le questionnaire →
               </button>`
            : `<button class="btn btn-dark" onclick="Questionnaire.startSkincare()">
                 Créer ma routine soin ✦
               </button>`
          }
          <button class="btn btn-outline" onclick="AppState.face.skinAnalysis=null;showScreen('capture')" style="margin-top:10px">
            ← Refaire l'analyse
          </button>
        </div>

        <p class="diag-disclaimer">Analyse colorimétrique locale par MediaPipe — indicatif, non médical.</p>
      </div>`;

    // Phase 2 — overlay zones sur la photo
    const overlayTarget = content.querySelector('#face-overlay-target');
    if (overlayTarget && AppState.face?.photo && AppState.face?.landmarks?.length) {
      renderFaceOverlay(overlayTarget, AppState.face.photo, AppState.face.landmarks, result);
    }

    window.switchMkrTab = function(btn, tab) {
      document.querySelectorAll('.mkr-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mkr-tab-panel').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const el = document.getElementById('mkr-tab-' + tab);
      if (el) el.classList.add('active');
    };
  }

  // ─── Helpers mathématiques ────────────────────────────────────

  function laplacianVariance(data, w, h) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    let sum = 0, sumSq = 0, cnt = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const v = -4 * gray[y * w + x]
          + gray[(y - 1) * w + x] + gray[(y + 1) * w + x]
          + gray[y * w + x - 1]   + gray[y * w + x + 1];
        sum += v; sumSq += v * v; cnt++;
      }
    }
    if (!cnt) return 0;
    const m = sum / cnt;
    return sumSq / cnt - m * m;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h, s, l };
  }

  function rgbToLab(r, g, b) {
    let rL = r / 255, gL = g / 255, bL = b / 255;
    rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
    gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
    bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;
    const X = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
    const Y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
    const Z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;
    const fn = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const fy = fn(Y / 1.00000);
    return {
      L: 116 * fy - 16,
      a: 500 * (fn(X / 0.95047) - fy),
      b: 200 * (fy - fn(Z / 1.08883))
    };
  }

  function convexHull(points) {
    if (points.length <= 3) return points;
    const unique = Array.from(new Map(points.map(p => [`${p.x.toFixed(1)},${p.y.toFixed(1)}`, p])).values());
    if (unique.length <= 3) return unique;

    let start = unique.reduce((a, b) => b.x < a.x ? b : a);
    const hull = [];
    let cur    = start;

    do {
      hull.push(cur);
      let nxt = unique[0];
      for (let i = 1; i < unique.length; i++) {
        if (nxt === cur) { nxt = unique[i]; continue; }
        const cross = (nxt.x - cur.x) * (unique[i].y - cur.y) - (nxt.y - cur.y) * (unique[i].x - cur.x);
        if (cross < 0) nxt = unique[i];
      }
      cur = nxt;
    } while (cur !== start && hull.length < unique.length);

    return hull;
  }

  function avg(arr)              { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  function clamp(v, min, max)    { return Math.min(max, Math.max(min, v)); }

  // ─── Dérivation de patterns précis depuis les scores bruts ───────

  function buildPrecisionContext(result) {
    const zones  = result.zones || {};
    const zArr   = Object.entries(zones);
    const mean   = (key) => zArr.length ? zArr.reduce((s, [, z]) => s + (z[key] || 0), 0) / zArr.length : 50;

    // ── Redness pattern ───────────────────────────────────────────
    const RED_T  = 55;
    const redZ   = zArr
      .filter(([, z]) => z.redness > RED_T)
      .sort(([, a], [, b]) => b.redness - a.redness)
      .map(([k, z]) => ({ zone: k, score: Math.round(z.redness) }));
    const redKeys = redZ.map(r => r.zone);

    let rednessPattern = 'none';
    const rBothCheeks = redKeys.includes('leftCheek') && redKeys.includes('rightCheek');
    const rNose       = redKeys.includes('nose');
    const rForehead   = redKeys.includes('forehead');
    if      (redKeys.length >= 3 || (rBothCheeks && rNose)) rednessPattern = 'diffuse';
    else if (rBothCheeks && !rNose)                          rednessPattern = 'cheeks_bilateral';
    else if (rNose && !rBothCheeks)                          rednessPattern = 'nose_wings';
    else if ((redKeys.includes('leftCheek') || redKeys.includes('rightCheek')) && rNose)
                                                              rednessPattern = 'cheeks_and_nose';
    else if (rForehead)                                       rednessPattern = 'forehead';
    else if (redKeys.length === 1)                            rednessPattern = 'localized';

    // ── Sebum / pores dominant ────────────────────────────────────
    const PORE_T = 42;
    const sebZ   = zArr
      .filter(([, z]) => z.pores < PORE_T)
      .sort(([, a], [, b]) => a.pores - b.pores)
      .map(([k, z]) => ({ zone: k, score: Math.round(100 - z.pores) }));
    const sebKeys    = sebZ.map(s => s.zone);
    const zoneTHits  = ['forehead', 'nose', 'chin'].filter(z => sebKeys.includes(z));

    let sebumPattern  = 'none', sebumDominant = null;
    if (zoneTHits.length >= 2) { sebumPattern = 'zone_t'; sebumDominant = zoneTHits[0]; }
    else if (sebKeys.length)   { sebumPattern = 'localized'; sebumDominant = sebKeys[0]; }

    // Peau grasse + terne simultanément → brillante mais déshydratée
    const isOilyDehydrated = mean('pores') < 50 && mean('eclat') < 48;

    // ── Texture worst zone ────────────────────────────────────────
    let texWorst = null, texWorstScore = 100;
    for (const [k, z] of zArr) {
      if (z.texture < texWorstScore) { texWorstScore = z.texture; texWorst = k; }
    }

    // ── Éclat — zones les plus ternes ────────────────────────────
    const ECLAT_T = 46;
    const terneZ  = zArr
      .filter(([, z]) => z.eclat < ECLAT_T)
      .sort(([, a], [, b]) => a.eclat - b.eclat)
      .map(([k, z]) => ({ zone: k, score: Math.round(z.eclat) }));

    // ── Asymétrie joues (rougeur ou texture) ─────────────────────
    const leftR  = zones.leftCheek?.redness  || 0;
    const rightR = zones.rightCheek?.redness || 0;
    let cheekAsymmetry = null;
    if (Math.abs(leftR - rightR) > 12) {
      cheekAsymmetry = leftR > rightR ? 'left_more_red' : 'right_more_red';
    }

    const ZONE_FR_SHORT = {
      leftCheek: 'joue gauche', rightCheek: 'joue droite',
      forehead: 'front', nose: 'nez / ailes du nez', chin: 'menton', eyes: 'contour des yeux'
    };

    return {
      rednessPattern, redZones: redZ,
      sebumPattern, sebumDominant, sebumZones: sebZ, isOilyDehydrated,
      textureWorstZone: texWorstScore < 48 ? texWorst : null,
      textureWorstScore: Math.round(texWorstScore),
      terneZones: terneZ,
      cheekAsymmetry,
      ZONE_FR_SHORT,
      avgEclat: Math.round(mean('eclat')),
      avgRedness: Math.round(mean('redness')),
    };
  }

  // ─── API publique ─────────────────────────────────────────────

  return { initScreen, startLiveAnalysis, stopLiveAnalysis, analyzeFromPhoto, renderFaceOverlay, getTopInsights, buildPrecisionContext, buildBeautyPortrait, buildPriorities, buildColorimetry };

})();

window.SkinAnalysis = SkinAnalysis;
