/* ============================================================
   lib/scanMath.js — Calculs du scan peau « Face ID » (sans écran, testables dans Node)
   Angle de la tête, netteté, contraste de texture, équilibre des blancs, géométrie des zones.
   Les repères du visage (landmarks MediaPipe) peuvent être :
     • un tableau d'objets { x, y, z }  (sortie de MediaPipe)
     • un Float32Array [x0, y0, z0, x1, y1, z1, …]  (copie compacte gardée en mémoire)
   x et y sont normalisés (0–1) ; z est à peu près à la même échelle que x.
   ============================================================ */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScanMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const deg = r => r * 180 / Math.PI;

  // Lit le repère i, quel que soit le format
  function P(lm, i) {
    return (typeof lm[0] === 'number') ? { x: lm[i * 3], y: lm[i * 3 + 1], z: lm[i * 3 + 2] } : lm[i];
  }

  // ─── Pose de la tête ─────────────────────────────────────────
  // Lacet (yaw) en degrés. Positif = tête tournée vers SA gauche (le nez part vers la droite de l'image brute).
  // Mesure : les deux bords du visage (repères 234 et 454) n'ont pas la même profondeur quand la tête tourne.
  function yawDeg(lm, imgW) {
    const a = P(lm, 234), b = P(lm, 454), nose = P(lm, 1);
    const dx = Math.abs(b.x - a.x) * imgW;
    const dz = Math.abs(b.z - a.z) * imgW;
    const mag = deg(Math.atan2(dz, dx));
    return (nose.x >= (a.x + b.x) / 2 ? 1 : -1) * mag;
  }

  // Inclinaison de la tête (roulis) en degrés, d'après la ligne des yeux. Positif = sens horaire à l'écran.
  function rollDeg(lm, imgW, imgH) {
    const a = P(lm, 33), b = P(lm, 263);
    return deg(Math.atan2((b.y - a.y) * imgH, (b.x - a.x) * imgW));
  }

  // ─── Images ──────────────────────────────────────────────────
  // RGBA → gris, et masque des pixels « valides » (alpha ≥ 128)
  function toGray(rgba, w, h) {
    const n = w * h, gray = new Float32Array(n), valid = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
      valid[i] = rgba[p + 3] >= 128 ? 1 : 0;
    }
    return { gray, valid };
  }

  function meanLum(gray, valid) {
    let s = 0, c = 0;
    for (let i = 0; i < gray.length; i++) { if (valid && !valid[i]) continue; s += gray[i]; c++; }
    return c ? s / c : 0;
  }

  // Netteté : variance du Laplacien (plus c'est grand, plus l'image est nette). null si trop peu de pixels.
  function laplacianVariance(gray, w, h, valid) {
    let s = 0, s2 = 0, c = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (valid && !(valid[i] && valid[i - 1] && valid[i + 1] && valid[i - w] && valid[i + w])) continue;
        const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        s += l; s2 += l * l; c++;
      }
    }
    if (c < 50) return null;
    const m = s / c;
    return s2 / c - m * m;
  }

  // Flou « boîte » rapide (image intégrale) de rayon r
  function boxBlur(gray, w, h, r) {
    const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
        const sum = I[(y1 + 1) * W1 + x1 + 1] - I[y0 * W1 + x1 + 1] - I[(y1 + 1) * W1 + x0] + I[y0 * W1 + x0];
        out[y * w + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      }
    }
    return out;
  }

  // Contraste de texture : énergie des détails fins (ridules, pores, relief) = flou léger − flou fort,
  // rapportée à la luminosité moyenne. Sert à repérer la frame où le relief ressort le plus (lumière rasante).
  function textureContrast(gray, w, h, valid, rFine, rCoarse) {
    const a = boxBlur(gray, w, h, rFine), b = boxBlur(gray, w, h, rCoarse);
    let s2 = 0, sg = 0, c = 0;
    for (let i = 0; i < w * h; i++) {
      if (valid && !valid[i]) continue;
      const d = a[i] - b[i];
      s2 += d * d; sg += gray[i]; c++;
    }
    if (c < 50) return null;
    const m = sg / c;
    return m < 1 ? null : Math.sqrt(s2 / c) / m;
  }

  // ─── Couleurs ────────────────────────────────────────────────
  // Gains R/G/B qui rendent le blanc de l'œil neutre. Bornés pour ne jamais sur-corriger.
  function whiteBalanceGains(sclera, limits) {
    if (!sclera || !(sclera.r > 0 && sclera.g > 0 && sclera.b > 0)) return null;
    const cl = v => Math.min(limits.max, Math.max(limits.min, v));
    return { r: cl(sclera.g / sclera.r), g: 1, b: cl(sclera.g / sclera.b) };
  }

  // Type de lumière d'après le rapport bleu/rouge du blanc de l'œil (avant correction)
  function classifyLight(sclera, th) {
    if (!sclera || !(sclera.r > 0)) return { type: 'inconnue', ratioBR: null };
    const ratio = sclera.b / sclera.r;
    let type = 'jour';
    if (ratio < th.warmMax) type = 'artificielle_chaude';
    else if (ratio > th.coolMin) type = 'artificielle_froide';
    return { type, ratioBR: ratio };
  }

  // ─── Rangement des images par angle de tête ──────────────────
  function binOf(yaw, binDeg, maxAbs) {
    return Math.round(Math.max(-maxAbs, Math.min(maxAbs, yaw)) / binDeg);
  }

  // Garde les `max` meilleurs éléments (clé `key`, plus grand = meilleur).
  // Retourne null si ajouté sans rien éjecter, sinon l'élément éjecté (ou refusé) — à libérer par l'appelant.
  function insertTop(list, item, max, key) {
    if (list.length < max) { list.push(item); return null; }
    let wi = 0;
    for (let i = 1; i < list.length; i++) if (list[i][key] < list[wi][key]) wi = i;
    if (list[wi][key] >= item[key]) return item;
    const out = list[wi];
    list[wi] = item;
    return out;
  }

  // ─── Géométrie d'une zone ────────────────────────────────────
  // Carré centré sur la moyenne des repères def.at, décalé de (dx, dy) × largeur du visage dans le repère du
  // visage, de côté def.size × largeur du visage. Retourne aussi le roulis (radians) pour redresser le gros plan.
  function zoneBox(lm, W, H, def) {
    const a = P(lm, 234), b = P(lm, 454);
    const U = Math.hypot((b.x - a.x) * W, (b.y - a.y) * H);
    let cx = 0, cy = 0;
    def.at.forEach(i => { const p = P(lm, i); cx += p.x * W; cy += p.y * H; });
    cx /= def.at.length; cy /= def.at.length;
    const roll = rollDeg(lm, W, H) * Math.PI / 180, cs = Math.cos(roll), sn = Math.sin(roll);
    const ox = (def.dx || 0) * U, oy = (def.dy || 0) * U;
    return { cx: cx + ox * cs - oy * sn, cy: cy + ox * sn + oy * cs, side: def.size * U, roll, U };
  }

  return { P, yawDeg, rollDeg, toGray, meanLum, laplacianVariance, boxBlur, textureContrast,
           whiteBalanceGains, classifyLight, binOf, insertTop, zoneBox };
});
