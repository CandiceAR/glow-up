/* ============================================================
   scanZones.js — Scan peau « Face ID » : gros plans par zone (étape 2)
   À partir des images gardées par scanCapture.js :
     • pour chacune des 10 zones, choisit
         - « frame_face »    : l'image la plus nette de face (±8°)        → servira à l'analyse des COULEURS
         - « frame_rasante » : l'image où le contraste de texture est max → servira à l'analyse du RELIEF
     • recadre chaque zone en gros plan 512×512, redressé (roulis) et aligné par les repères du visage,
       moyenne de 3 images voisines (réduit le bruit de la caméra frontale)
     • exclut yeux, sourcils, lèvres et cheveux (peints en gris neutre)
     • corrige les couleurs avec le blanc de l'œil (sclère) et estime le type de lumière
   Tout se passe sur l'appareil. Rien n'est envoyé.
   Dépend de : window.ScanConfig, window.ScanMath.
   ============================================================ */
'use strict';

const ScanZones = (() => {
  const C = () => window.ScanConfig;
  const M = () => window.ScanMath;
  const tick = () => new Promise(r => setTimeout(r, 0));          // rend la main à l'écran entre deux zones

  // Trace un contour (liste de repères) en pixels de la vidéo
  function tracePath(g, rec, idx) {
    g.beginPath();
    idx.forEach((i, k) => {
      const x = rec.lm[i * 3] * rec.W, y = rec.lm[i * 3 + 1] * rec.H;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath();
  }

  // Dessine le gros plan d'une zone : carré centré sur la zone, redressé du roulis, de côté `size` px.
  // mask = 'alpha' : tout ce qui n'est pas de la peau devient transparent (pour les mesures)
  function renderZone(rec, def, size, mask) {
    const box = M().zoneBox(rec.lm, rec.W, rec.H, def);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate(-box.roll);
    g.scale(size / box.side, size / box.side);
    g.translate(-box.cx, -box.cy);                                 // à partir d'ici : coordonnées de la vidéo
    g.imageSmoothingQuality = 'high';
    g.drawImage(rec.canvas, 0, 0, rec.canvas.width, rec.canvas.height,
                rec.sx, rec.sy, rec.canvas.width / rec.s, rec.canvas.height / rec.s);
    if (mask === 'alpha') {
      const L = C().LM;
      g.globalCompositeOperation = 'destination-in';              // on ne garde que l'intérieur du visage…
      tracePath(g, rec, L.FACE_OVAL); g.fillStyle = '#000'; g.fill();
      g.globalCompositeOperation = 'destination-out';             // … moins les yeux, sourcils et lèvres
      [L.EYE_L, L.EYE_R, L.BROW_L, L.BROW_R, L.LIPS_OUTER].forEach(idx => { tracePath(g, rec, idx); g.fill(); });
    }
    g.restore();
    return c;
  }

  // La zone est-elle exploitable sur cette image ? (visible, dans l'image, pas cachée par la rotation)
  function eligible(rec, def, box) {
    const R = C().ZONES_RULES;
    if (def.side === 'L' && rec.yaw < -R.maxYaw) return false;
    if (def.side === 'R' && rec.yaw > R.maxYaw) return false;
    const cx = (box.cx - rec.sx) * rec.s, cy = (box.cy - rec.sy) * rec.s, m = box.side * rec.s * 0.3;
    return cx > m && cy > m && cx < rec.canvas.width - m && cy < rec.canvas.height - m;
  }

  // Mesures d'une zone sur une image : netteté (normalisée par la luminosité), contraste de texture, part de peau
  function measure(rec, def) {
    const R = C().ZONES_RULES, E = R.evalSize;
    const c = renderZone(rec, def, E, 'alpha');
    const d = c.getContext('2d').getImageData(0, 0, E, E).data;
    const { gray, valid } = M().toGray(d, E, E);
    let nValid = 0; for (let i = 0; i < valid.length; i++) nValid += valid[i];
    const lum = M().meanLum(gray, valid);
    const lap = M().laplacianVariance(gray, E, E, valid);
    const tex = M().textureContrast(gray, E, E, valid, R.texFine, R.texCoarse);
    if (lap == null || tex == null || lum < 1) return null;
    return { lapN: lap / (lum * lum), tex, lum, skin: nValid / (E * E) };
  }

  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  // ─── Blanc de l'œil (sclère) ───────────────────────────────
  function inPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function scleraAverage(rec) {
    const W = C().WB, g = rec.canvas.getContext('2d', { willReadFrequently: true });
    let sr = 0, sg = 0, sb = 0, n = 0;
    [C().LM.EYE_L, C().LM.EYE_R].forEach(idx => {
      const pts = idx.map(i => ({ x: (rec.lm[i * 3] * rec.W - rec.sx) * rec.s, y: (rec.lm[i * 3 + 1] * rec.H - rec.sy) * rec.s }));
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.x)))), x1 = Math.min(rec.canvas.width - 1, Math.ceil(Math.max(...pts.map(p => p.x))));
      const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p.y)))), y1 = Math.min(rec.canvas.height - 1, Math.ceil(Math.max(...pts.map(p => p.y))));
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w < 4 || h < 3) return;
      const d = g.getImageData(x0, y0, w, h).data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!inPoly(x0 + x + 0.5, y0 + y + 0.5, pts)) continue;
          const p = (y * w + x) * 4, r = d[p], gg = d[p + 1], b = d[p + 2];
          const lum = 0.299 * r + 0.587 * gg + 0.114 * b, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (lum < W.scleraLumMin || lum > W.scleraLumMax || (mx - mn) / mx > W.scleraSatMax) continue;
          sr += r; sg += gg; sb += b; n++;
        }
      }
    });
    return n >= W.scleraMinPixels ? { r: sr / n, g: sg / n, b: sb / n, n } : { n };
  }

  // ─── Gros plan final : moyenne de plusieurs images alignées + couleurs corrigées + masque ──
  function finalCrop(group, def, gains) {
    const S = C().ZONES_RULES.outSize, n = group.length;
    const acc = new Float32Array(S * S * 4);
    group.forEach(rec => {
      const d = renderZone(rec, def, S, null).getContext('2d').getImageData(0, 0, S, S).data;
      for (let i = 0; i < acc.length; i++) acc[i] += d[i];
    });
    const alpha = renderZone(group[0], def, S, 'alpha').getContext('2d').getImageData(0, 0, S, S).data;
    const out = document.createElement('canvas');
    out.width = S; out.height = S;
    const g = out.getContext('2d');
    const img = g.createImageData(S, S);
    const gr = gains ? gains.r : 1, gg = gains ? gains.g : 1, gb = gains ? gains.b : 1;
    for (let p = 0; p < S * S * 4; p += 4) {
      if (alpha[p + 3] < 128) { img.data[p] = img.data[p + 1] = img.data[p + 2] = 128; }     // hors peau : gris neutre
      else {
        img.data[p]     = Math.min(255, acc[p] / n * gr);
        img.data[p + 1] = Math.min(255, acc[p + 1] / n * gg);
        img.data[p + 2] = Math.min(255, acc[p + 2] / n * gb);
      }
      img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return out;
  }

  // Images voisines (même zone) à moyenner avec l'image choisie
  function neighbours(chosen, cands) {
    const R = C().ZONES_RULES;
    return cands
      .filter(c => c.rec !== chosen.rec && Math.abs(c.rec.yaw - chosen.rec.yaw) <= R.averageYawTol && c.m.lapN >= chosen.m.lapN * 0.5)
      .sort((a, b) => Math.abs(a.rec.yaw - chosen.rec.yaw) - Math.abs(b.rec.yaw - chosen.rec.yaw))
      .slice(0, R.averageFrames - 1);
  }

  // Vue d'ensemble : image de face + cadre de chaque zone (pour vérifier que les zones tombent au bon endroit)
  function overview(rec) {
    const u = 420 / rec.canvas.width, c = document.createElement('canvas');
    c.width = Math.round(rec.canvas.width * u); c.height = Math.round(rec.canvas.height * u);
    const g = c.getContext('2d');
    g.drawImage(rec.canvas, 0, 0, c.width, c.height);
    g.lineWidth = 2; g.font = '11px sans-serif';
    C().ZONES.forEach(def => {
      const b = M().zoneBox(rec.lm, rec.W, rec.H, def);
      g.save();
      g.translate((b.cx - rec.sx) * rec.s * u, (b.cy - rec.sy) * rec.s * u);
      g.rotate(b.roll);
      const half = b.side * rec.s * u / 2;
      g.strokeStyle = '#B4482E'; g.strokeRect(-half, -half, half * 2, half * 2);
      g.restore();
    });
    return c;
  }

  // ─── Traitement complet ────────────────────────────────────
  // capture : résultat de ScanCapture ; opts.onProgress(texte, 0..1)
  async function process(capture, opts) {
    const onProgress = (opts && opts.onProgress) || function () {};
    const R = C().ZONES_RULES, frames = capture.frames;
    if (!frames.length) return { ok: false, message: 'Aucune image exploitable n\'a été gardée.' };

    // Image de référence : la plus nette quasi de face
    const frontal = frames.filter(r => Math.abs(r.yaw) <= R.faceYawMax);
    const ref = (frontal.length ? frontal : frames.slice().sort((a, b) => Math.abs(a.yaw) - Math.abs(b.yaw)).slice(0, 3))
      .slice().sort((a, b) => b.sharp - a.sharp)[0];

    // Couleurs : blanc de l'œil de l'image de référence
    onProgress('Lecture de ton teint…', 0.05);
    await tick();
    const sclera = scleraAverage(ref);
    const hasWB = sclera.n >= C().WB.scleraMinPixels;
    const gains = hasWB ? M().whiteBalanceGains(sclera, { min: C().WB.gainMin, max: C().WB.gainMax }) : null;
    const light = hasWB
      ? M().classifyLight(sclera, { warmMax: C().WB.lightWarmMax, coolMin: C().WB.lightCoolMin })
      : { type: 'inconnue', ratioBR: null };

    // Zones
    const zones = {};
    const defs = C().ZONES;
    for (let zi = 0; zi < defs.length; zi++) {
      const def = defs[zi];
      onProgress('Analyse de ta texture… ' + def.label, 0.1 + 0.85 * zi / defs.length);
      await tick();

      const cands = [];
      frames.forEach(rec => {
        const box = M().zoneBox(rec.lm, rec.W, rec.H, def);
        if (!eligible(rec, def, box)) return;
        const m = measure(rec, def);
        if (!m || m.skin < R.minSkinFraction || m.lum < R.lumRange[0] || m.lum > R.lumRange[1]) return;
        cands.push({ rec, m });
      });
      const flags = [];

      // « de face » : la plus nette dans ±8°
      let faceC = cands.filter(c => Math.abs(c.rec.yaw) <= R.faceYawMax).sort((a, b) => b.m.lapN - a.m.lapN)[0];
      if (!faceC && cands.length) {
        faceC = cands.slice().sort((a, b) => Math.abs(a.rec.yaw) - Math.abs(b.rec.yaw) || b.m.lapN - a.m.lapN)[0];
        flags.push('face_approx');
      }
      // « rasante » : contraste de texture maximal, à condition de ne pas être floue
      const med = median(cands.map(c => c.m.lapN));
      let rasC = cands.filter(c => Math.abs(c.rec.yaw) >= R.rasanteMinAbsYaw && c.m.lapN >= med * R.rasanteBlurRatio)
        .sort((a, b) => b.m.tex - a.m.tex)[0];
      if (!rasC) { rasC = faceC; flags.push('pas_de_rasante'); }

      if (!faceC) { zones[def.key] = { key: def.key, label: def.label, missing: true }; continue; }

      const mk = (chosen) => ({
        canvas: finalCrop([chosen.rec].concat(neighbours(chosen, cands).map(n => n.rec)), def, gains),
        yaw: Math.round(chosen.rec.yaw * 10) / 10, lapN: chosen.m.lapN, tex: chosen.m.tex, lum: Math.round(chosen.m.lum),
        averaged: 1 + neighbours(chosen, cands).length
      });
      zones[def.key] = { key: def.key, label: def.label, face: mk(faceC), rasante: mk(rasC), flags };
      await tick();
    }

    onProgress('Presque fini…', 0.97);
    const result = {
      ok: true, zones, light: { type: light.type, ratioBR: light.ratioBR, gains, scleraPixels: sclera.n, corrected: !!gains },
      overview: overview(ref), frames: frames.length, coverage: capture.coverage, durationMs: capture.durationMs,
      restarts: capture.restarts, speedWarnings: capture.speedWarnings, partial: !!capture.partial
    };
    onProgress('Terminé', 1);
    return result;
  }

  return { process };
})();

window.ScanZones = ScanZones;
