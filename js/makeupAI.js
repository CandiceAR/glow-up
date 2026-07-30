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

  // Lèvres — matrice undertone × carnation
  // Règles : naturel, chic, sans métallisé ni paillettes
  const LIP_MATRIX = {
    warm: {
      // Sous-ton chaud → pêche, corail doux, beige chaud
      clair:  { best:'#EFB49A', naturelle:'#F2CDB8', cool:'#C8887A', soiree:'#C05858' },
      medium: { best:'#E8A888', naturelle:'#EABBA0', cool:'#C07868', soiree:'#B04848' },
      fonce:  { best:'#C87858', naturelle:'#C89878', cool:'#A86858', soiree:'#983838' }
    },
    cool: {
      // Sous-ton froid → rose froid, framboise, rosé bleuté léger
      clair:  { best:'#EEB8C8', naturelle:'#F0C8D0', cool:'#C888A8', soiree:'#B84870' },
      medium: { best:'#E0A0B8', naturelle:'#E8B8C0', cool:'#C07898', soiree:'#A03860' },
      fonce:  { best:'#C87890', naturelle:'#D09098', cool:'#A86080', soiree:'#882848' }
    },
    neutral: {
      // Sous-ton neutre → rose nude universel, équilibré
      clair:  { best:'#EDBAAA', naturelle:'#F0C8B8', cool:'#CC9090', soiree:'#B84858' },
      medium: { best:'#E0A090', naturelle:'#E8B8A8', cool:'#C08888', soiree:'#A03848' },
      fonce:  { best:'#C07868', naturelle:'#C89080', cool:'#A87070', soiree:'#8A3040' }
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

    // Fond noir (zone à préserver)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Zone maquillage en blanc (zone à modifier par l'IA)
    const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
    if (pts.length < 3) return c;

    ctx.fillStyle = '#FFFFFF';
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    for (const indices of [idxA, idxB]) {
      const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
      if (pts.length < 3) continue;
      ctx.fillStyle = '#FFFFFF';
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

  // ── Fallbacks canvas colorés (si API indisponible) ───────────

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function darkenHex(hex, f) {
    return '#' + [1,3,5].map(i => Math.round(parseInt(hex.slice(i,i+2),16)*(1-f)).toString(16).padStart(2,'0')).join('');
  }

  function buildLipFallback(sourceCanvas, landmarks, color, slot) {
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    const pts = LIPS_IDX.map(i => landmark(landmarks,i,w,h)).filter(Boolean);
    if (pts.length < 3) return cropZone(out, landmarks, LIPS_IDX, 0.06);

    const opacity = slot === 'soiree' ? 0.88 : slot === 'cool' ? 0.78 : slot === 'naturelle' ? 0.45 : 0.72;
    const linerOp = slot === 'soiree' ? 0.55 : slot === 'cool' ? 0.35 : slot === 'naturelle' ? 0 : 0.25;

    // Crayon contour
    if (linerOp > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = linerOp;
      ctx.strokeStyle = darkenHex(color, 0.28);
      ctx.lineWidth   = Math.max(w * 0.003, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    // Remplissage
    ctx.save();
    ctx.beginPath();
    pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.closePath(); ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = color;
    ctx.beginPath();
    pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.closePath(); ctx.fill();
    // Gloss pour naturelle
    if (slot === 'naturelle') {
      const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
      const top = Math.min(...pts.map(p=>p.y));
      const cy  = top + (pts.reduce((s,p)=>s+p.y,0)/pts.length - top)*0.35;
      const rx  = (Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)))*0.28;
      const ry  = (Math.max(...pts.map(p=>p.y))-top)*0.20;
      const g   = ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry));
      g.addColorStop(0,'rgba(255,255,255,0.5)'); g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    return cropZone(out, landmarks, LIPS_IDX, 0.06);
  }

  function buildEyeFallback(sourceCanvas, landmarks, slot) {
    const shadeColors = { naturel:'#C8B090', defini:'#8B6050', smoky:'#3A2828', soiree:'#1A0A18' };
    const opacities   = { naturel:0.25, defini:0.45, smoky:0.65, soiree:0.80 };
    const color   = shadeColors[slot] || '#8B6050';
    const opacity = opacities[slot]   || 0.40;
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    for (const indices of [EYE_LEFT_IDX, EYE_RIGHT_IDX]) {
      const pts = indices.map(i => landmark(landmarks,i,w,h)).filter(Boolean);
      if (pts.length < 3) continue;
      ctx.save();
      ctx.beginPath();
      pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath(); ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = opacity;
      ctx.fillStyle   = color;
      ctx.beginPath();
      pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    return cropZone(out, landmarks, [...EYE_LEFT_IDX, ...EYE_RIGHT_IDX], 0.10);
  }

  function buildBlushFallback(sourceCanvas, landmarks, color, slot) {
    const opacities = { nude:0.18, rosé:0.28, peche:0.35, coral:0.45 };
    const opacity   = opacities[slot] || 0.28;
    const w = sourceCanvas.width, h = sourceCanvas.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    for (const indices of [CHEEK_LEFT_IDX, CHEEK_RIGHT_IDX]) {
      const pts = indices.map(i => landmark(landmarks,i,w,h)).filter(Boolean);
      if (!pts.length) continue;
      const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
      const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
      const r  = Math.max(...pts.map(p=>Math.hypot(p.x-cx,p.y-cy)))*1.1;
      const g  = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0, hexToRgba(color, opacity));
      g.addColorStop(0.6, hexToRgba(color, opacity*0.4));
      g.addColorStop(1, hexToRgba(color, 0));
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    return out;
  }

  function landmark(lms, i, w, h) {
    return lms[i] ? { x: lms[i].x*w, y: lms[i].y*h } : null;
  }

  // ── Charge une URL image et croppe sur une zone de landmarks ─

  function cropUrlToZone(url, landmarks, indices, padRatio) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.width, h = img.height;
        const pts = indices.map(i => landmarks[i] ? { x: landmarks[i].x * w, y: landmarks[i].y * h } : null).filter(Boolean);
        if (!pts.length) { resolve(url); return; }
        const pad = w * (padRatio || 0.08);
        const x1  = Math.max(0, Math.min(...pts.map(p => p.x)) - pad);
        const y1  = Math.max(0, Math.min(...pts.map(p => p.y)) - pad * 1.5);
        const x2  = Math.min(w, Math.max(...pts.map(p => p.x)) + pad);
        const y2  = Math.min(h, Math.max(...pts.map(p => p.y)) + pad * 1.5);
        const cw  = x2 - x1, ch = y2 - y1;
        const c   = document.createElement('canvas');
        c.width = Math.round(cw); c.height = Math.round(ch);
        c.getContext('2d').drawImage(img, x1, y1, cw, ch, 0, 0, cw, ch);
        resolve(c.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  // ── Appel API avec retry sur 429 ────────────────────────────

  async function callMakeupRender(imageB64, maskB64, prompt, _retry) {
    const retry = _retry || 0;
    const res = await fetch(apiUrl('/api/makeupRender'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image:  `data:image/jpeg;base64,${imageB64}`,
        mask:   `data:image/png;base64,${maskB64}`,
        prompt
      })
    });

    if (res.status === 429 && retry < 3) {
      const wait = 5000 + retry * 3000; // 5s, 8s, 11s
      console.warn(`[MakeupAI] 429 — attente ${wait/1000}s avant retry ${retry+1}/3`);
      await new Promise(r => setTimeout(r, wait));
      return callMakeupRender(imageB64, maskB64, prompt, retry + 1);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.url;
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
      best:      `close-up lips with ${hexToColorName(colors.best)} lipstick, natural rosy nude tone, soft satin finish, no shimmer, no glitter, no metallic, elegant everyday makeup, photorealistic`,
      naturelle: `close-up lips with ${hexToColorName(colors.naturelle)} tinted lip balm, barely-there nude tone, enhanced natural lips, no color, no shimmer, matte soft finish, photorealistic`,
      cool:      `close-up lips with ${hexToColorName(colors.cool)} lip color, old rose tone, soft matte finish, no shimmer, no glitter, no metallic, chic understated makeup, photorealistic`,
      soiree:    `close-up lips with ${hexToColorName(colors.soiree)} lip color, soft raspberry or bordeaux tone, satin finish, no shimmer, no glitter, no metallic, elegant evening makeup, photorealistic`
    };

    for (const [slot, prompt] of Object.entries(PROMPTS)) {
      const color    = colors[slot];
      const fbCanvas = buildLipFallback(sourceCanvas, landmarks, color, slot);
      await callMakeupRender(imgB64, maskB64, prompt)
        .then(async url => {
          console.log('[MakeupAI] Lèvres', slot, 'OK');
          const cropped = await cropUrlToZone(url, landmarks, LIPS_IDX, 0.10);
          updateCard('mai-lips', slot, cropped, null);
        })
        .catch(err => { console.warn('[MakeupAI] Lèvres', slot, 'fallback —', err.message); updateCard('mai-lips', slot, null, fbCanvas); });
      if (slot !== 'soiree') await new Promise(r => setTimeout(r, 2000));
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
    const eyeMask   = buildCombinedMask(resized, scaledLm, EYE_LEFT_IDX, EYE_RIGHT_IDX, 8);
    const browMask  = buildCombinedMask(resized, scaledLm, BROW_LEFT_IDX, BROW_RIGHT_IDX, 5);

    // Masque combiné yeux + sourcils
    const combinedMask = document.createElement('canvas');
    combinedMask.width = 512; combinedMask.height = 512;
    const mCtx = combinedMask.getContext('2d');
    mCtx.drawImage(eyeMask, 0, 0);
    mCtx.globalCompositeOperation = 'screen';
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
      const fbCanvas = buildEyeFallback(sourceCanvas, landmarks, slot);
      await callMakeupRender(imgB64, maskB64, prompt)
        .then(url  => { console.log('[MakeupAI] Yeux', slot, 'OK'); updateCard('mai-eyes', slot, url, null); })
        .catch(err => { console.warn('[MakeupAI] Yeux', slot, 'fallback —', err.message); updateCard('mai-eyes', slot, null, fbCanvas); });
      if (slot !== 'soiree') await new Promise(r => setTimeout(r, 2000));
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
      const blushColor = BLUSH_COLORS[utK][slot] || '#F0A090';
      const fbCanvas   = buildBlushFallback(sourceCanvas, landmarks, blushColor, slot);
      await callMakeupRender(imgB64, maskB64, prompt)
        .then(url  => { console.log('[MakeupAI] Blush', slot, 'OK'); updateCard('mai-blush', slot, url, null); })
        .catch(err => { console.warn('[MakeupAI] Blush', slot, 'fallback —', err.message); updateCard('mai-blush', slot, null, fbCanvas); });
      if (slot !== 'coral') await new Promise(r => setTimeout(r, 2000));
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
      // warm clair
      '#EFB49A':'soft peach rose', '#F2CDB8':'warm nude beige', '#C8887A':'dusty rose warm', '#C05858':'soft warm red',
      // warm medium
      '#E8A888':'peach nude', '#EABBA0':'warm beige nude', '#C07868':'old rose warm', '#B04848':'muted raspberry warm',
      // warm fonce
      '#C87858':'deep peach nude', '#C89878':'warm nude deep', '#A86858':'dusty terracotta', '#983838':'soft bordeaux warm',
      // cool clair
      '#EEB8C8':'cool pink rose', '#F0C8D0':'rosy nude cool', '#C888A8':'old rose cool', '#B84870':'soft raspberry',
      // cool medium
      '#E0A0B8':'cool dusty rose', '#E8B8C0':'pink nude cool', '#C07898':'muted mauve rose', '#A03860':'deep raspberry cool',
      // cool fonce
      '#C87890':'deep rose cool', '#D09098':'dusty pink nude', '#A86080':'soft mauve', '#882848':'dark raspberry cool',
      // neutral clair
      '#EDBAAA':'rose nude', '#F0C8B8':'nude beige balanced', '#CC9090':'vieux rose', '#B84858':'soft red',
      // neutral medium
      '#E0A090':'universal rose nude', '#E8B8A8':'nude balanced', '#C08888':'dusty mauve rose', '#A03848':'soft framboise',
      // neutral fonce
      '#C07868':'deep nude rose', '#C89080':'warm nude deep balanced', '#A87070':'dusty mauve', '#8A3040':'soft bordeaux'
    };
    return MAP[hex] || 'natural nude lip color';
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

    // Sections séquentielles pour ne pas saturer le rate limit Replicate
    await generateLips(lipsEl,   sourceCanvas, landmarks, analysis);
    await generateEyes(eyesEl,   sourceCanvas, landmarks, analysis);
    await generateBlush(blushEl, sourceCanvas, landmarks, analysis);
  }

  window.MakeupAI = { generate };

  return { generate };

})();
