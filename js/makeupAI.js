/* ============================================================
   makeupAI.js — Rendu maquillage IA via Replicate (FLUX Fill)
   Génère des cartes visuelles photoréalistes par zone :
   - Lèvres (4 teintes)
   - Yeux (4 styles)
   - Blush (4 teintes)
   ============================================================ */

'use strict';

const MakeupAI = (() => {

  // ── Landmarks MediaPipe pour les masques ──────────────────────
  const LIPS_IDX = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
  const EYE_LEFT_IDX  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,226,247,30,29,27,28,56,190,243,112,26,22,23,24,110,25];
  const EYE_RIGHT_IDX = [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249,446,467,260,259,257,258,286,414,463,341,256,252,253,254,339,255];
  const BROW_LEFT_IDX  = [46,53,52,65,55,70,63,105,66,107,336,296,334,293,300];
  const BROW_RIGHT_IDX = [276,283,282,295,285,336,296,334,293,300,107,66,105,63,70];
  const CHEEK_LEFT_IDX  = [234,116,111,117,118,50,205,36,203,206,187,147,123,116,93,132,58,172,136,150,149,176,148,152];
  const CHEEK_RIGHT_IDX = [454,340,346,347,280,425,266,423,426,411,352,345,340,323,401,361,288,397,365,379,378,400,377,152];

  // ── Palettes teintes par slot ─────────────────────────────────

  // Lèvres — matrice undertone × carnation (identique à lookGenerator)
  const LIP_MATRIX = {
    warm: {
      clair:  { best:'#E28C6A', naturelle:'#E3B7A0', cool:'#C06A8E', soiree:'#A94438' },
      medium: { best:'#D89A7A', naturelle:'#C8A58A', cool:'#A57C8C', soiree:'#D94A2F' },
      fonce:  { best:'#A66A4F', naturelle:'#8B5A4A', cool:'#8E4B5A', soiree:'#C0392B' }
    },
    cool: {
      clair:  { best:'#CFA5A5', naturelle:'#E4A3A3', cool:'#D94F70', soiree:'#7B1E3A' },
      medium: { best:'#D98C8C', naturelle:'#CFA5A5', cool:'#D92B72', soiree:'#6E1E2A' },
      fonce:  { best:'#9F5F65', naturelle:'#D98C8C', cool:'#FF4F7B', soiree:'#5C2C2C' }
    },
    neutral: {
      clair:  { best:'#E9967A', naturelle:'#FFC1A1', cool:'#D98C8C', soiree:'#FF6347' },
      medium: { best:'#FFA07A', naturelle:'#C8A58A', cool:'#CFA5A5', soiree:'#A94438' },
      fonce:  { best:'#8E5C58', naturelle:'#5A3A34', cool:'#9B6A7E', soiree:'#8E4B5A' }
    }
  };

  // Yeux — matrice undertone × eyeContrast
  const EYE_MATRIX = {
    warm: {
      fort:   { naturel:'taupe doré', defini:'marron fumé', smoky:'bronze profond', soiree:'noir et or' },
      moyen:  { naturel:'nude doré',  defini:'marron chaud', smoky:'terracotta fumé', soiree:'bronze intense' },
      faible: { naturel:'beige rosé', defini:'caramel nude', smoky:'marron doux', soiree:'cuivré profond' }
    },
    cool: {
      fort:   { naturel:'gris rosé',  defini:'prune doux', smoky:'gris ardoise', soiree:'violet prune' },
      moyen:  { naturel:'rose taupe', defini:'mauve gris',  smoky:'gris mauve',   soiree:'bordeaux prune' },
      faible: { naturel:'rose pâle',  defini:'lilas doux',  smoky:'mauve soft',   soiree:'prune violet' }
    },
    neutral: {
      fort:   { naturel:'taupe nude', defini:'marron kaki', smoky:'gris chaud',   soiree:'noir mat' },
      moyen:  { naturel:'nude beige', defini:'marron nude', smoky:'taupe fumé',   soiree:'marron intense' },
      faible: { naturel:'ivoire',     defini:'nude rosé',   smoky:'gris doux',    soiree:'prune nude' }
    }
  };

  // Blush — matrice undertone
  const BLUSH_MATRIX = {
    warm:    { nude:'blush pêche nude',  rosé:'blush abricot rosé', peche:'blush corail pêche', coral:'blush terracotta' },
    cool:    { nude:'blush rose pâle',   rosé:'blush rose framboise', peche:'blush mauve rosé', coral:'blush rose fuchsia' },
    neutral: { nude:'blush beige rosé',  rosé:'blush rose naturel', peche:'blush pêche équilibré', coral:'blush corail nude' }
  };

  const BLUSH_COLORS = {
    warm:    { nude:'#F5C4A8', rosé:'#EEA090', peche:'#F08070', coral:'#D46A50' },
    cool:    { nude:'#F0C0C0', rosé:'#E090A8', peche:'#C880A0', coral:'#D04880' },
    neutral: { nude:'#F0C0A8', rosé:'#E0A0A0', peche:'#F09080', coral:'#E07060' }
  };

  // Méta slots
  const LIP_SLOTS  = { best:'★ BEST', naturelle:'◌ NATURELLE', cool:'◈ COOL', soiree:'◆ SOIRÉE' };
  const EYE_SLOTS  = { naturel:'🌿 NATUREL', defini:'◈ DÉFINI', smoky:'◉ SMOKY', soiree:'🌙 SOIRÉE' };
  const BLUSH_SLOTS = { nude:'◌ NUDE', rosé:'🌸 ROSÉ', peche:'🍑 PÊCHE', coral:'🌺 CORAIL' };

  // ── Utilitaires canvas / masque ───────────────────────────────

  // Crée un canvas blanc avec la zone des landmarks remplie en noir (masque inpainting)
  function buildMaskCanvas(sourceCanvas, landmarks, indices, dilate) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const c = document.createElement('canvas');
    c.width  = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // Fond blanc (zone à préserver)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Zone maquillage en noir (zone à modifier)
    const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
    if (pts.length < 3) return c;

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();

    if (dilate > 0) {
      ctx.filter = `blur(${dilate}px)`;
      ctx.fill();
      ctx.filter = 'none';
    } else {
      ctx.fill();
    }

    return c;
  }

  // Combine masques (yeux gauche + droit, ou joues gauche + droite)
  function buildCombinedMask(sourceCanvas, landmarks, idxA, idxB, dilate) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    for (const indices of [idxA, idxB]) {
      const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
      if (pts.length < 3) continue;
      ctx.fillStyle = '#000000';
      if (dilate > 0) ctx.filter = `blur(${dilate}px)`;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.filter = 'none';
    }
    return c;
  }

  // Redimensionne un canvas à 512×512 (requis par FLUX Fill)
  function resizeTo512(canvas) {
    const out = document.createElement('canvas');
    out.width = 512; out.height = 512;
    out.getContext('2d').drawImage(canvas, 0, 0, 512, 512);
    return out;
  }

  function canvasToBase64(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality || 0.92).split(',')[1];
  }

  function canvasToBase64PNG(canvas) {
    return canvas.toDataURL('image/png').split(',')[1];
  }

  // Crop autour d'une zone (pour l'affichage des cartes)
  function cropZone(sourceCanvas, landmarks, indices, padRatio) {
    const w   = sourceCanvas.width;
    const h   = sourceCanvas.height;
    const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
    if (!pts.length) return sourceCanvas;
    const pad = w * (padRatio || 0.06);
    const x1  = Math.max(0, Math.min(...pts.map(p => p.x)) - pad);
    const y1  = Math.max(0, Math.min(...pts.map(p => p.y)) - pad * 1.3);
    const x2  = Math.min(w, Math.max(...pts.map(p => p.x)) + pad);
    const y2  = Math.min(h, Math.max(...pts.map(p => p.y)) + pad * 1.3);
    const cw  = x2 - x1, ch = y2 - y1;
    const out = document.createElement('canvas');
    out.width  = Math.round(cw);
    out.height = Math.round(ch);
    out.getContext('2d').drawImage(sourceCanvas, x1, y1, cw, ch, 0, 0, cw, ch);
    return out;
  }

  // ── Appel API ─────────────────────────────────────────────────

  async function callMakeupRender(imageB64, maskB64, prompt) {
    const res = await fetch('/api/makeupRender', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image:  `data:image/jpeg;base64,${imageB64}`,
        mask:   `data:image/png;base64,${maskB64}`,
        prompt
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.url; // URL de l'image générée
  }

  // ── Rendu HTML d'une grille de cartes ─────────────────────────

  function renderLoadingGrid(container, title, subtitle, slots) {
    const slotKeys = Object.keys(slots);
    container.innerHTML = `
      <div class="mai-section">
        <div class="mai-header">
          <h2 class="mai-title">${title}</h2>
          <p class="mai-sub">${subtitle}</p>
        </div>
        <div class="mai-grid">
          ${slotKeys.map(key => `
            <div class="mai-card" id="mai-card-${container.id}-${key}">
              <div class="mai-card-img-wrap mai-loading">
                <div class="mai-spinner"></div>
              </div>
              <div class="mai-card-info">
                <span class="mai-card-badge mai-badge--${key}">${slots[key]}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function updateCard(containerId, key, imgUrl, fallbackCanvas) {
    const card = document.getElementById(`mai-card-${containerId}-${key}`);
    if (!card) return;
    const wrap = card.querySelector('.mai-card-img-wrap');
    if (imgUrl) {
      wrap.classList.remove('mai-loading');
      wrap.innerHTML = `<img src="${imgUrl}" alt="${key}" class="mai-card-img" crossorigin="anonymous">`;
    } else if (fallbackCanvas) {
      wrap.classList.remove('mai-loading');
      wrap.innerHTML = `<img src="${fallbackCanvas.toDataURL('image/jpeg',0.9)}" alt="${key}" class="mai-card-img">`;
    } else {
      wrap.innerHTML = `<div class="mai-error">Indisponible</div>`;
    }
  }

  // ── LÈVRES ────────────────────────────────────────────────────

  async function generateLips(container, sourceCanvas, landmarks, analysis) {
    const ut  = analysis.undertone?.type || 'neutral';
    const ca  = analysis.carnation?.type || 'medium';
    const utK = ['warm','cool','neutral'].includes(ut) ? ut : 'neutral';
    const caK = ['clair','medium','fonce'].includes(ca) ? ca : 'medium';
    const colors = LIP_MATRIX[utK][caK];
    const utL = analysis.undertone?.label?.split('·')[0]?.trim() || 'Neutre';
    const caL = analysis.carnation?.label || 'Medium';

    container.id = 'mai-lips';
    renderLoadingGrid(container, '💋 Tes lèvres', `Profil ${utL} · ${caL}`, LIP_SLOTS);

    // Préparer image + masque redimensionnés
    const resized = resizeTo512(sourceCanvas);
    const mask    = buildMaskCanvas(resized, scaleToCanvas(landmarks, sourceCanvas, resized), LIPS_IDX, 3);
    const imgB64  = canvasToBase64(resized, 0.92);
    const maskB64 = canvasToBase64PNG(mask);

    // Crop aperçu fallback
    const lipCrop = cropZone(sourceCanvas, landmarks, LIPS_IDX, 0.06);

    const PROMPTS = {
      best:      `a woman wearing ${hexToColorName(colors.best)} lipstick, natural lighting, realistic, photorealistic makeup, high quality portrait`,
      naturelle: `a woman wearing sheer nude lip gloss ${hexToColorName(colors.naturelle)}, barely-there natural look, glossy finish, photorealistic`,
      cool:      `a woman wearing ${hexToColorName(colors.cool)} bold lip color, editorial makeup look, photorealistic portrait`,
      soiree:    `a woman wearing ${hexToColorName(colors.soiree)} evening lip color, elegant dinner party makeup, photorealistic`
    };

    for (const [slot, prompt] of Object.entries(PROMPTS)) {
      callMakeupRender(imgB64, maskB64, prompt)
        .then(url => updateCard('mai-lips', slot, url, null))
        .catch(() => updateCard('mai-lips', slot, null, lipCrop));
    }
  }

  // ── YEUX ──────────────────────────────────────────────────────

  async function generateEyes(container, sourceCanvas, landmarks, analysis) {
    const ut  = analysis.undertone?.type    || 'neutral';
    const ec  = analysis.eyeContrast?.level || 'moyen';
    const utK = ['warm','cool','neutral'].includes(ut) ? ut : 'neutral';
    const ecK = ['fort','moyen','faible'].includes(ec) ? ec : 'moyen';
    const shades = EYE_MATRIX[utK][ecK];
    const utL = analysis.undertone?.label?.split('·')[0]?.trim() || 'Neutre';

    container.id = 'mai-eyes';
    renderLoadingGrid(container, '👁 Tes yeux', `Sous-ton ${utL} · Contraste ${ec}`, EYE_SLOTS);

    const resized   = resizeTo512(sourceCanvas);
    const scaledLm  = scaleToCanvas(landmarks, sourceCanvas, resized);
    const eyeMask   = buildCombinedMask(resized, scaledLm, EYE_LEFT_IDX, EYE_RIGHT_IDX, 4);
    const browMask  = buildCombinedMask(resized, scaledLm, BROW_LEFT_IDX, BROW_RIGHT_IDX, 2);

    // Masque combiné yeux + sourcils
    const combinedMask = document.createElement('canvas');
    combinedMask.width = 512; combinedMask.height = 512;
    const mCtx = combinedMask.getContext('2d');
    mCtx.drawImage(eyeMask, 0, 0);
    mCtx.globalCompositeOperation = 'multiply';
    mCtx.drawImage(browMask, 0, 0);

    const imgB64  = canvasToBase64(resized, 0.92);
    const maskB64 = canvasToBase64PNG(combinedMask);
    const eyeCrop = cropZone(sourceCanvas, landmarks, [...EYE_LEFT_IDX, ...EYE_RIGHT_IDX], 0.10);

    const PROMPTS = {
      naturel: `a woman wearing subtle ${shades.naturel} eyeshadow, no liner, natural everyday makeup look, photorealistic portrait`,
      defini:  `a woman wearing defined ${shades.defini} eye makeup with thin eyeliner, polished professional look, photorealistic`,
      smoky:   `a woman wearing a ${shades.smoky} smoky eye makeup, blended eyeshadow, sultry look, photorealistic portrait`,
      soiree:  `a woman wearing dramatic ${shades.soiree} evening eye makeup, intense eyeliner, glamorous night out, photorealistic`
    };

    for (const [slot, prompt] of Object.entries(PROMPTS)) {
      callMakeupRender(imgB64, maskB64, prompt)
        .then(url => updateCard('mai-eyes', slot, url, null))
        .catch(() => updateCard('mai-eyes', slot, null, eyeCrop));
    }
  }

  // ── BLUSH ─────────────────────────────────────────────────────

  async function generateBlush(container, sourceCanvas, landmarks, analysis) {
    const ut  = analysis.undertone?.type || 'neutral';
    const utK = ['warm','cool','neutral'].includes(ut) ? ut : 'neutral';
    const shades = BLUSH_MATRIX[utK];
    const utL = analysis.undertone?.label?.split('·')[0]?.trim() || 'Neutre';

    container.id = 'mai-blush';
    renderLoadingGrid(container, '🌸 Ton blush', `Sélectionné pour ton sous-ton ${utL}`, BLUSH_SLOTS);

    const resized  = resizeTo512(sourceCanvas);
    const scaledLm = scaleToCanvas(landmarks, sourceCanvas, resized);
    const blushMask = buildCombinedMask(resized, scaledLm, CHEEK_LEFT_IDX, CHEEK_RIGHT_IDX, 8);

    const imgB64  = canvasToBase64(resized, 0.92);
    const maskB64 = canvasToBase64PNG(blushMask);
    const cheekCrop = cropZone(sourceCanvas, landmarks, [...CHEEK_LEFT_IDX, ...CHEEK_RIGHT_IDX], 0.15);

    const PROMPTS = {
      nude:   `a woman wearing subtle ${shades.nude} blush, barely-there natural flush, photorealistic portrait`,
      rosé:   `a woman wearing ${shades.rosé} blush on cheekbones, fresh rosy glow, photorealistic portrait`,
      peche:  `a woman wearing ${shades.peche} blush, warm healthy glow, soft placement on cheeks, photorealistic`,
      coral:  `a woman wearing bold ${shades.coral} blush, vibrant statement cheek color, editorial look, photorealistic`
    };

    for (const [slot, prompt] of Object.entries(PROMPTS)) {
      callMakeupRender(imgB64, maskB64, prompt)
        .then(url => updateCard('mai-blush', slot, url, null))
        .catch(() => updateCard('mai-blush', slot, null, cheekCrop));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  // Recalcule les landmarks pour un canvas redimensionné
  function scaleToCanvas(landmarks, srcCanvas, dstCanvas) {
    const sx = dstCanvas.width  / srcCanvas.width;
    const sy = dstCanvas.height / srcCanvas.height;
    return landmarks.map(lm => lm ? { x: lm.x, y: lm.y, z: lm.z } : null);
    // Les landmarks sont normalisés 0-1 donc pas besoin de reéchellonner
  }

  // Convertit hex en nom de couleur pour le prompt
  function hexToColorName(hex) {
    const MAP = {
      '#E28C6A':'warm peach coral', '#E3B7A0':'light nude beige', '#C06A8E':'cool orchid pink', '#A94438':'brick red',
      '#D89A7A':'terracotta nude',  '#C8A58A':'warm nude beige',  '#A57C8C':'muted mauve',       '#D94A2F':'warm red orange',
      '#A66A4F':'brown nude',       '#8B5A4A':'warm brown',       '#8E4B5A':'dark plum',          '#C0392B':'classic red',
      '#CFA5A5':'soft cool pink',   '#E4A3A3':'pale pink nude',   '#D94F70':'raspberry pink',     '#7B1E3A':'deep burgundy',
      '#D98C8C':'dusty rose',       '#D92B72':'fuchsia pink',     '#6E1E2A':'deep wine',
      '#9F5F65':'mauve rose',       '#FF4F7B':'hot pink',         '#5C2C2C':'dark plum brown',
      '#E9967A':'coral rose',       '#FFC1A1':'peachy nude gloss',  '#FF6347':'tomato red',
      '#FFA07A':'light coral',      '#CFA5A5':'dusty pink',       '#A94438':'brick red',
      '#8E5C58':'warm brown nude',  '#5A3A34':'deep nude brown',  '#9B6A7E':'mauve violet',       '#8E4B5A':'plum'
    };
    return MAP[hex] || 'natural lip color';
  }

  // ── Point d'entrée public ─────────────────────────────────────

  async function generate(parentContainer, sourceCanvas, landmarks, analysis) {
    if (!parentContainer || !sourceCanvas || !landmarks || !analysis) return;

    // Créer les 3 sections dans l'ordre
    const lipsEl  = document.createElement('div');
    const eyesEl  = document.createElement('div');
    const blushEl = document.createElement('div');

    parentContainer.appendChild(lipsEl);
    parentContainer.appendChild(eyesEl);
    parentContainer.appendChild(blushEl);

    // Lancer en parallèle (les requêtes se font indépendamment)
    generateLips(lipsEl,   sourceCanvas, landmarks, analysis);
    generateEyes(eyesEl,   sourceCanvas, landmarks, analysis);
    generateBlush(blushEl, sourceCanvas, landmarks, analysis);
  }

  window.MakeupAI = { generate };

  return { generate };

})();
