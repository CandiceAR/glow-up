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

  // ─── Analyse en temps réel (caméra) ──────────────────────────

  async function startLiveAnalysis(videoEl, overlayEl) {
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
              drawLiveZones(ctx, res.faceLandmarks[0], w, h, ts);
            } else {
              drawFaceGuide(ctx, w, h);
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
    const cx = w * 0.5, cy = h * 0.48;
    const rx = w * 0.27, ry = h * 0.36;
    ctx.save();
    ctx.strokeStyle = 'rgba(201,169,138,0.55)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(201,169,138,0.75)';
    ctx.font      = '13px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Centre ton visage ici', cx, cy + ry + 22);
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

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width  = w;
    sourceCanvas.height = h;
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(img, 0, 0);

    let landmarks = AppState.face.landmarks;
    if (!landmarks) {
      const detector = await getOrInitDetector();
      if (!detector) return null;
      const results = detector.detect(img);
      if (!results.faceLandmarks?.length) return null;
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

    const undertone   = detectUndertone(allSkinPixels);
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

    // Carnation (clair / medium / foncé) depuis luminosité LAB
    const skinLabs  = allSkinPixels.slice(0, 500).map(p => rgbToLab(p.r ?? p[0] ?? 180, p.g ?? p[1] ?? 140, p.b ?? p[2] ?? 120));
    const skinMeanL = avg(skinLabs.map(l => l.L));
    const carnation = detectCarnation(skinMeanL);

    // Contraste yeux
    const skinLumNorm = allSkinPixels.length
      ? avg(allSkinPixels.slice(0, 200).map(p => 0.299 * (p.r ?? p[0] ?? 180) / 255 + 0.587 * (p.g ?? p[1] ?? 140) / 255 + 0.114 * (p.b ?? p[2] ?? 120) / 255))
      : 0.5;
    const eyeContrast = detectEyeContrast(sourceCanvas, landmarks, w, h, skinLumNorm);

    return { zones: zoneResults, undertone, skinType, globalScore, faceShape, cernes, carnation, eyeContrast };
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
    return Math.round(clamp(avg(reds) * 580, 0, 100));
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
    const darkFraction = lums.filter(l => l < mean - 2.0 * std).length / lums.length;
    return Math.round(clamp(100 - darkFraction * 450, 5, 100));
  }

  function detectUndertone(pixels) {
    if (!pixels.length) return { type: 'neutral', label: 'Neutre', colorHex: '#D4B896', desc: 'Sous-tons équilibrés — l\'or et l\'argent te conviennent également.' };

    const labs  = pixels.slice(0, 500).map(p => rgbToLab(p.r, p.g, p.b));
    const meanA = avg(labs.map(l => l.a));
    const meanB = avg(labs.map(l => l.b));
    const meanL = avg(labs.map(l => l.L));

    const fitzpatrick = meanL > 72 ? 'I-II'
                      : meanL > 60 ? 'II-III'
                      : meanL > 50 ? 'III-IV'
                      : meanL > 40 ? 'IV-V'
                      : 'V-VI';

    if (meanB > meanA + 4 && meanB > 9) {
      return { type: 'warm', label: 'Chaud · Doré / Pêche', colorHex: '#E8A87C',
               desc: 'Sous-tons dorés et pêchés — l\'or, le cuivre et le corail te subliment naturellement.', fitzpatrick };
    }
    if (meanA > meanB + 3 && meanA > 6) {
      return { type: 'cool', label: 'Froid · Rosé / Bleuté', colorHex: '#C9A8C8',
               desc: 'Sous-tons rosés et bleutés — l\'argent, le bleu givré et le violet bordeaux t\'illuminent.', fitzpatrick };
    }
    return { type: 'neutral', label: 'Neutre · Équilibré', colorHex: '#C8A882',
             desc: 'Sous-tons équilibrés — une grande polyvalence, l\'or, l\'argent et les tons terreux te vont tous.', fitzpatrick };
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
  function detectCarnation(meanL) {
    if (meanL > 62) return { type: 'clair',  label: 'Claire'  };
    if (meanL > 46) return { type: 'medium', label: 'Medium'  };
    return           { type: 'fonce',  label: 'Foncée'  };
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
          <button class="btn btn-outline" onclick="showScreen('routine-choice')" style="margin-top:8px">
            Passer cette étape
          </button>
        </div>`;
      return;
    }

    if (AppState.face.skinAnalysis) {
      renderReport(AppState.face.skinAnalysis, content);
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
          Détection des zones · Analyse colorimétrique · Calcul des métriques
        </p>
      </div>`;

    try {
      const result = await analyzeFromPhoto(AppState.face.photo);

      if (!result) {
        content.innerHTML = `
          <div class="skin-empty-state">
            <span class="skin-empty-icon">○</span>
            <h2>Visage non détecté</h2>
            <p>Essaie avec une photo de face, bien éclairée, sans lunettes de soleil.</p>
            <button class="btn btn-dark" onclick="showScreen('capture')">Reprendre une photo</button>
            <button class="btn btn-outline" onclick="showScreen('routine-choice')" style="margin-top:8px">
              Continuer sans analyse →
            </button>
          </div>`;
        return;
      }

      AppState.face.skinAnalysis = result;
      renderReport(result, content);
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
          <button class="btn btn-dark" onclick="showScreen('routine-choice')">
            Continuer sans analyse →
          </button>
          <button class="btn btn-outline" onclick="showScreen('capture')" style="margin-top:10px">
            ← Réessayer avec une autre photo
          </button>
        </div>`;
    }
  }

  function renderReport(result, content) {
    const { zones, undertone, skinType, faceShape, globalScore, cernes, carnation, eyeContrast } = result;

    const ut  = undertone?.type  || 'neutral';
    const ca  = carnation?.type  || 'medium';
    const cer = cernes?.detected ? cernes.type : 'none';
    const ec  = eyeContrast?.level || 'moyen';

    const UNDERTONE_EXPLAIN = {
      warm:    'Ta peau a des reflets dorés et légèrement pêchés — c\'est ce qu\'on appelle un sous-ton chaud. Les teintes chaudes comme l\'or et le corail te subliment naturellement.',
      cool:    'Ta peau a des reflets rosés ou légèrement bleutés — c\'est ce qu\'on appelle un sous-ton froid. Les teintes froides comme le mauve et l\'argent te mettent en valeur.',
      neutral: 'Ta peau n\'est ni très rosée ni très dorée — elle est neutre. Tu as la chance de pouvoir porter aussi bien les teintes chaudes que les teintes froides.'
    };

    const FOUNDATION_TIP = {
      warm:    { shade: 'warm ou W',    note: 'Évite les teintes C ou P (Cool/Pink) qui donneraient un effet grisâtre.' },
      cool:    { shade: 'cool ou C',    note: 'Évite les teintes W ou Y (Warm/Yellow) qui peuvent paraître orangées.' },
      neutral: { shade: 'neutral ou N', note: 'Les teintes N (Neutral) sont faites pour toi — polyvalence maximale.' }
    };

    const CONCEALER_TIP = {
      bleu:   'Applique un correcteur <strong>pêche ou orangé</strong> avant ton anti-cernes pour neutraliser le bleu.',
      rouge:  'Applique un correcteur <strong>jaune</strong> pour neutraliser les rougeurs sous l\'œil.',
      marron: 'Un anti-cernes <strong>légèrement plus clair</strong> que ton teint atténue efficacement.',
      none:   'Choisis un anti-cernes <strong>1 à 2 tons plus clair</strong> que ton fond de teint pour illuminer.'
    };

    const EYE_TIPS = {
      warm:    { colors: 'doré, bronze, marron chaud, terracotta',              why: 'Ces couleurs chaudes renforcent tes reflets naturels et réchauffent ton regard.' },
      cool:    { colors: 'rose, taupe, prune, violet doux',                     why: 'Ces teintes s\'harmonisent avec tes sous-tons rosés pour un look lumineux.' },
      neutral: { colors: 'marron naturel, gris chaud, nude, terracotta',        why: 'Ta polyvalence te permet de jouer aussi bien avec des tons chauds que froids.' }
    };

    const MASCARA_TIP = {
      fort:   { type: 'volumateur',             why: 'Ton contraste naturel est fort — un mascara volumateur accentue encore plus l\'intensité de ton regard.' },
      moyen:  { type: 'allongeant + volumateur', why: 'Avec un contraste moyen, associe longueur et volume pour un regard équilibré.' },
      faible: { type: 'allongeant',              why: 'Un mascara allongeant crée une illusion de profondeur pour un regard plus défini.' }
    };

    const LIP_TIPS = {
      warm:    { shades: 'pêche, corail, nude doré, rouge orangé',  why: 'Ces teintes chaudes sont alignées avec tes sous-tons et réchauffent ton sourire.' },
      cool:    { shades: 'rose, framboise, rouge vif, mauve',        why: 'Ces teintes froides s\'harmonisent avec tes reflets rosés.' },
      neutral: { shades: 'nude rosé, beige, nude pêche',             why: 'Les nudes polyvalents s\'adaptent à toutes les occasions.' }
    };

    function getProductsHTML(categories, limit) {
      const catalog = AppState?.products?.catalog || [];

      function buildPool(filterUndertone, filterCarnation) {
        return catalog.filter(p => {
          if (!categories.includes(p.category)) return false;
          if (p.active === false) return false;
          if (!p.imageUrl) return false;
          if (filterUndertone && p.undertone && p.undertone !== 'neutral' && p.undertone !== filterUndertone) return false;
          if (filterCarnation && Array.isArray(p.carnation) && p.carnation.length && !p.carnation.includes(filterCarnation)) return false;
          return true;
        });
      }

      // Essai 1 : filtre strict (sous-ton + carnation)
      let pool = buildPool(ut, ca);
      // Essai 2 : si moins de 2 résultats, relâcher la carnation
      if (pool.length < 2) pool = buildPool(ut, null);
      // Essai 3 : si toujours moins de 2, relâcher le sous-ton aussi
      if (pool.length < 2) pool = buildPool(null, null);

      pool = pool
        .sort((a, b) => {
          if (b.isFeatured !== a.isFeatured) return b.isFeatured ? 1 : -1;
          return (b.rating || 0) - (a.rating || 0);
        })
        .slice(0, 8);
      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool = pool.slice(0, limit || 2);

      if (!pool.length) {
        return '<p class="mkr-reco-empty">Produits bientôt disponibles dans cette catégorie.</p>';
      }
      return pool.map(p => `
        <div class="mkr-reco-card" onclick="ProductCatalog.openProductModal('${p.id}')">
          <div class="mkr-reco-img">
            <img src="${p.imageUrl}" alt="${p.name}" onerror="this.onerror=null;this.style.opacity='0'">
            ${p.colorHex ? `<span class="mkr-reco-dot" style="background:${p.colorHex}" title="${p.shadeName || ''}"></span>` : ''}
          </div>
          <div class="mkr-reco-body">
            <span class="mkr-reco-brand">${p.brand}</span>
            <p class="mkr-reco-name">${p.name}</p>
            ${p.shadeName ? `<span class="mkr-reco-shade">${p.shadeName}</span>` : ''}
            <span class="mkr-reco-price">${p.price ? p.price.toFixed(2) + ' €' : ''}</span>
          </div>
          <a class="btn btn-amazon mkr-reco-buy"
             href="${p.amazonUrl}" target="_blank" rel="noopener nofollow sponsored"
             onclick="event.stopPropagation(); if(typeof Tracker!=='undefined') Tracker.trackBuyClick('${p.id}')">
            Acheter →
          </a>
        </div>`).join('');
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
          <h2 class="mkr-bloc-title">💡 Pourquoi ce sous-ton ?</h2>
          <p class="mkr-explain-text">${UNDERTONE_EXPLAIN[ut]}</p>
        </div>

        <!-- BLOC 3 — APPLICATION CONCRÈTE -->
        <div class="mkr-bloc">
          <h2 class="mkr-bloc-title">🎨 Comment l'appliquer</h2>
          <div class="mkr-apply-grid">
            <div class="mkr-apply-item">
              <span class="mkr-apply-label">Fond de teint</span>
              <p>Choisis une teinte <strong>${FOUNDATION_TIP[ut].shade}</strong>. ${FOUNDATION_TIP[ut].note}</p>
            </div>
            <div class="mkr-apply-item">
              <span class="mkr-apply-label">Anti-cernes</span>
              <p>${CONCEALER_TIP[cer]}</p>
            </div>
          </div>
        </div>

        <!-- BLOC 4 — ROUTINES PERSONNALISÉES -->
        <div class="mkr-bloc">
          <h2 class="mkr-bloc-title">✨ Tes routines personnalisées</h2>
          <div class="mkr-tabs">
            <button class="mkr-tab active" onclick="switchMkrTab(this,'teint')">Teint</button>
            <button class="mkr-tab" onclick="switchMkrTab(this,'yeux')">Yeux</button>
            <button class="mkr-tab" onclick="switchMkrTab(this,'levres')">Lèvres</button>
          </div>

          <div id="mkr-tab-teint" class="mkr-tab-panel active">
            <div class="mkr-zone-tip">
              <p>Pour ton teint <strong>${carnation?.label}</strong> avec sous-ton <strong>${undertone?.label?.split('·')[0]?.trim()}</strong>,
              un fond de teint <strong>${FOUNDATION_TIP[ut].shade}</strong> t'offrira le rendu le plus naturel.</p>
              ${cernes?.detected ? `<p class="mkr-cernes-note">◐ Cernes <strong>${cernes.type}s</strong> : ${CONCEALER_TIP[cer]}</p>` : ''}
              <p class="mkr-why-note">Ce produit correspond à ton sous-ton et ta carnation — il fondra naturellement sur ta peau.</p>
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['foundation', 'eye'], 2)}
            </div>
          </div>

          <div id="mkr-tab-yeux" class="mkr-tab-panel">
            <div class="mkr-zone-tip">
              <p>Avec un sous-ton <strong>${undertone?.label?.split('·')[0]?.trim()}</strong>, mise sur : <strong>${EYE_TIPS[ut].colors}</strong>.</p>
              <p>${EYE_TIPS[ut].why}</p>
              <p>Mascara recommandé : <strong>${MASCARA_TIP[ec].type}</strong>. ${MASCARA_TIP[ec].why}</p>
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['mascara', 'blush'], 2)}
            </div>
          </div>

          <div id="mkr-tab-levres" class="mkr-tab-panel">
            <div class="mkr-zone-tip">
              <p>Pour ton sous-ton <strong>${undertone?.label?.split('·')[0]?.trim()}</strong>, les teintes <strong>${LIP_TIPS[ut].shades}</strong> sont tes meilleures alliées.</p>
              <p>${LIP_TIPS[ut].why}</p>
            </div>
            <div class="mkr-reco-grid">
              ${getProductsHTML(['lipstick', 'lipbalm'], 2)}
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="diag-cta">
          <button class="btn btn-dark" onclick="showScreen('routine-choice')">
            Créer ma routine soin ✦
          </button>
          <button class="btn btn-outline" onclick="showScreen('capture')" style="margin-top:10px">
            ← Refaire l'analyse
          </button>
        </div>

        <p class="diag-disclaimer">Analyse colorimétrique locale par MediaPipe — indicatif, non médical.</p>
      </div>`;

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

  // ─── API publique ─────────────────────────────────────────────

  return { initScreen, startLiveAnalysis, stopLiveAnalysis };

})();
