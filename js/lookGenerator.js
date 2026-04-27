/* ============================================================
   lookGenerator.js — Génération de looks maquillage visuels
   Dessine directement sur la photo via Canvas 2D + landmarks
   ============================================================ */

'use strict';

const LookGenerator = (() => {

  // ══════════════════════════════════════════════════════════════
  // LANDMARKS MEDIAPIPE — zones de dessin
  // ══════════════════════════════════════════════════════════════

  const LIPS_OUTER = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const LIPS_UPPER = [61,185,40,39,37,0,267,269,270,409,291,308,415,310,311,312,13,82,81,80,191,78];
  const LIPS_LOWER = [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78];

  const EYE_LEFT_LID  = [246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
  const EYE_RIGHT_LID = [466,388,387,386,385,384,398,362,382,381,380,374,373,390,249];

  const EYE_LEFT_LOWER  = [33,7,163,144,145,153,154,155,133];
  const EYE_RIGHT_LOWER = [263,249,390,373,374,380,381,382,362];

  const BROW_LEFT  = [70,63,105,66,107,55,65,52,53,46];
  const BROW_RIGHT = [300,293,334,296,336,285,295,282,283,276];

  const CHEEK_LEFT  = [234,116,111,117,118,50,205,36,203,206,187,147,123,116];
  const CHEEK_RIGHT = [454,340,346,347,280,425,266,423,426,411,352,345,340];

  const HIGHLIGHTER_LEFT  = [234,227,116,123,147,187,206,203,36,50,118,117,111];
  const HIGHLIGHTER_RIGHT = [454,447,340,352,376,411,423,266,280,347,346,340];
  const HIGHLIGHTER_NOSE  = [5,4,1,19,94,2,164,0,11,12,13];

  const FOREHEAD_IDX = [10,338,297,332,284,251,389,356,109,67,103,54,21,162,127,151,9,8];

  // ══════════════════════════════════════════════════════════════
  // PALETTES — couleurs par profil (undertone × carnation)
  // ══════════════════════════════════════════════════════════════

  function buildPalette(ut, ca, look) {
    // Lip colors
    const lips = {
      warm: { clair: { naturel:'#D4836A', glow:'#C8704A', sophistique:'#A8503A', soiree:'#8B3A2A', minimaliste:'#E8A890' },
              medium:{ naturel:'#C07050', glow:'#B85A35', sophistique:'#9A4030', soiree:'#7A2820', minimaliste:'#D4906A' },
              fonce: { naturel:'#8A4030', glow:'#7A3020', sophistique:'#602010', soiree:'#4A1808', minimaliste:'#A05A40' } },
      cool: { clair: { naturel:'#D4909C', glow:'#C87080', sophistique:'#A85070', soiree:'#803060', minimaliste:'#E8B0B8' },
              medium:{ naturel:'#C06070', glow:'#B04060', sophistique:'#903050', soiree:'#702040', minimaliste:'#D48090' },
              fonce: { naturel:'#903060', glow:'#802050', sophistique:'#601040', soiree:'#500030', minimaliste:'#A86080' } },
      neutral:{ clair:{ naturel:'#D4988A', glow:'#C87860', sophistique:'#A86050', soiree:'#884040', minimaliste:'#E8B8A8' },
                medium:{ naturel:'#C07860', glow:'#B06040', sophistique:'#9A5035', soiree:'#7A3828', minimaliste:'#D49880' },
                fonce: { naturel:'#904838', glow:'#803020', sophistique:'#682015', soiree:'#501008', minimaliste:'#A86848' } }
    };

    // Blush colors
    const blush = {
      warm:    { naturel:'#F0A898', glow:'#F08868', sophistique:'#D06848', soiree:'#B05030', minimaliste:'#F8C8B8' },
      cool:    { naturel:'#F0A8B8', glow:'#E88098', sophistique:'#D06080', soiree:'#B04068', minimaliste:'#F8C8D8' },
      neutral: { naturel:'#F0A898', glow:'#F09078', sophistique:'#D07058', soiree:'#B05040', minimaliste:'#F8C8B0' }
    };

    // Eyeshadow colors
    const eyeshadow = {
      warm:    { naturel:'#C8A888', glow:'#C09060', sophistique:'#A07040', soiree:'#785030', minimaliste:'#E0C8A8' },
      cool:    { naturel:'#C0A8B8', glow:'#B08898', sophistique:'#907880', soiree:'#685868', minimaliste:'#D8C0D0' },
      neutral: { naturel:'#C0A890', glow:'#B08870', sophistique:'#907058', soiree:'#705040', minimaliste:'#D8C0A8' }
    };

    // Highlighter colors
    const highlight = {
      warm:    { glow:'#FFE8A0', sophistique:'#F8D888', soiree:'#F0C870', naturel:'#FFF0C0', minimaliste:'#FFFAE0' },
      cool:    { glow:'#F0E8FF', sophistique:'#E0D0F8', soiree:'#C8B8E8', naturel:'#F8F0FF', minimaliste:'#FFFAFF' },
      neutral: { glow:'#FFEEC0', sophistique:'#F8DDA0', soiree:'#F0CC80', naturel:'#FFF8D8', minimaliste:'#FFFDEE' }
    };

    // Foundation tint (voile léger unifiant)
    const foundation = {
      clair:  '#F0E0D0',
      medium: '#D4A882',
      fonce:  '#8B5E3C'
    };

    const caKey = ca === 'clair' ? 'clair' : ca === 'fonce' ? 'fonce' : 'medium';

    return {
      lips:        (lips[ut]?.[caKey]?.[look])        || '#C87060',
      blush:       (blush[ut]?.[look])                 || '#F0A898',
      eyeshadow:   (eyeshadow[ut]?.[look])             || '#C0A888',
      highlighter: (highlight[ut]?.[look])             || '#FFE8A0',
      foundation:  foundation[caKey]                   || '#D4A882'
    };
  }

  // ══════════════════════════════════════════════════════════════
  // DÉFINITION DES 5 LOOKS
  // ══════════════════════════════════════════════════════════════

  const LOOKS = [
    {
      id:    'naturel',
      label: 'Naturel',
      icon:  '🌿',
      desc:  'Peau nette, teint unifié, lèvres douces',
      layers: [
        { zone:'foundation',  opacity:0.12, blend:'overlay'    },
        { zone:'blush',       opacity:0.18, blend:'soft-light' },
        { zone:'eyeshadow',   opacity:0.15, blend:'multiply'   },
        { zone:'lips',        opacity:0.45, blend:'multiply'   }
      ]
    },
    {
      id:    'glow',
      label: 'Glow',
      icon:  '✨',
      desc:  'Éclat lumineux, teint radieux, lèvres dorées',
      layers: [
        { zone:'foundation',  opacity:0.15, blend:'overlay'    },
        { zone:'blush',       opacity:0.28, blend:'soft-light' },
        { zone:'highlighter', opacity:0.55, blend:'screen'     },
        { zone:'eyeshadow',   opacity:0.22, blend:'multiply'   },
        { zone:'lips',        opacity:0.60, blend:'multiply'   }
      ]
    },
    {
      id:    'sophistique',
      label: 'Sophistiqué',
      icon:  '💎',
      desc:  'Look structuré, sourcils définis, lèvres intenses',
      layers: [
        { zone:'foundation',  opacity:0.18, blend:'overlay'    },
        { zone:'blush',       opacity:0.22, blend:'multiply'   },
        { zone:'eyeshadow',   opacity:0.40, blend:'multiply'   },
        { zone:'brows',       opacity:0.50, blend:'darken'     },
        { zone:'lips',        opacity:0.75, blend:'multiply'   }
      ]
    },
    {
      id:    'soiree',
      label: 'Soirée',
      icon:  '🌙',
      desc:  'Intensité maximale, smoky, lèvres profondes',
      layers: [
        { zone:'foundation',  opacity:0.20, blend:'overlay'    },
        { zone:'blush',       opacity:0.25, blend:'multiply'   },
        { zone:'eyeshadow',   opacity:0.60, blend:'multiply'   },
        { zone:'brows',       opacity:0.60, blend:'darken'     },
        { zone:'highlighter', opacity:0.35, blend:'screen'     },
        { zone:'lips',        opacity:0.85, blend:'multiply'   }
      ]
    },
    {
      id:    'minimaliste',
      label: 'Minimaliste',
      icon:  '○',
      desc:  'Baume teinté, teint zéro défaut, effet peau nue',
      layers: [
        { zone:'foundation',  opacity:0.08, blend:'overlay'    },
        { zone:'blush',       opacity:0.12, blend:'soft-light' },
        { zone:'lips',        opacity:0.30, blend:'soft-light' }
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════════
  // SCORE — calcule le classement BEST / GOOD / LESS
  // ══════════════════════════════════════════════════════════════

  function scoreLook(look, analysis) {
    const { undertone, eyeContrast, skinType, carnation } = analysis;
    const ut = undertone?.type || 'neutral';
    const ec = eyeContrast?.level || 'moyen';
    const st = skinType?.type || 'normale';
    const ca = carnation?.type || 'medium';
    let score = 50;

    // Alignement sous-ton
    if (look.id === 'glow' && ut === 'warm')           score += 20;
    if (look.id === 'glow' && ut === 'cool')           score += 15;
    if (look.id === 'sophistique' && ut !== 'neutral') score += 15;
    if (look.id === 'soiree' && ec === 'fort')         score += 20;
    if (look.id === 'soiree' && ec === 'faible')       score -= 15;
    if (look.id === 'naturel' && st === 'sensible')    score += 15;
    if (look.id === 'naturel' && st === 'seche')       score += 10;
    if (look.id === 'minimaliste' && st === 'sensible')score += 10;
    if (look.id === 'minimaliste' && ec === 'fort')    score -= 10;

    // Carnation foncée → couleurs intenses plus flatteuses
    if (ca === 'fonce' && look.id === 'soiree')        score += 15;
    if (ca === 'fonce' && look.id === 'glow')          score += 10;

    // Carnation claire → look naturel/glow plus flatteur
    if (ca === 'clair' && look.id === 'naturel')       score += 12;
    if (ca === 'clair' && look.id === 'soiree')        score -= 8;

    return Math.min(100, Math.max(0, score));
  }

  function getRank(score, scores) {
    const sorted = [...scores].sort((a, b) => b - a);
    const rank   = sorted.indexOf(score);
    if (rank === 0)  return { label: 'BEST LOOK', class: 'rank-best' };
    if (rank <= 2)   return { label: 'GOOD',      class: 'rank-good' };
    return               { label: 'LESS FLATTERING', class: 'rank-less' };
  }

  // ══════════════════════════════════════════════════════════════
  // DESSIN — fonctions canvas
  // ══════════════════════════════════════════════════════════════

  function lmPt(lm, idx, w, h) {
    return { x: lm[idx].x * w, y: lm[idx].y * h };
  }

  function drawPolygon(ctx, lm, indices, w, h, color, opacity, blend) {
    if (!indices || !lm) return;
    const pts = indices.map(i => lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null).filter(Boolean);
    if (pts.length < 3) return;

    ctx.save();
    ctx.globalCompositeOperation = blend || 'multiply';
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBlushGradient(ctx, lm, indices, w, h, color, opacity) {
    if (!indices || !lm) return;
    const pts = indices.map(i => lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null).filter(Boolean);
    if (!pts.length) return;

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const r  = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.1;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   hexToRgba(color, opacity));
    grad.addColorStop(0.5, hexToRgba(color, opacity * 0.5));
    grad.addColorStop(1,   hexToRgba(color, 0));

    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 1;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHighlighter(ctx, lm, indices, w, h, color, opacity) {
    if (!indices || !lm) return;
    const pts = indices.map(i => lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null).filter(Boolean);
    if (!pts.length) return;

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const r  = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) * 0.9;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   hexToRgba(color, opacity));
    grad.addColorStop(0.6, hexToRgba(color, opacity * 0.3));
    grad.addColorStop(1,   hexToRgba(color, 0));

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEyeshadowGradient(ctx, lm, indices, w, h, color, opacity) {
    if (!indices || !lm) return;
    const pts = indices.map(i => lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null).filter(Boolean);
    if (pts.length < 3) return;

    const cx  = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy  = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const top = Math.min(...pts.map(p => p.y));
    const r   = (cy - top) * 2.2;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,   hexToRgba(color, opacity));
    grad.addColorStop(0.7, hexToRgba(color, opacity * 0.4));
    grad.addColorStop(1,   hexToRgba(color, 0));

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;

    // Clip sur la zone paupière seulement
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFoundationVeil(ctx, lm, w, h, color, opacity) {
    if (!lm || lm.length < 400) return;
    const pts = FOREHEAD_IDX.map(i => lm[i] ? { x: lm[i].x * w, y: lm[i].y * h } : null).filter(Boolean);
    if (pts.length < 6) return;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = color;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU D'UN LOOK SUR CANVAS
  // ══════════════════════════════════════════════════════════════

  function renderLookOnCanvas(sourceCanvas, landmarks, palette, look) {
    const w   = sourceCanvas.width;
    const h   = sourceCanvas.height;
    const out = document.createElement('canvas');
    out.width  = w;
    out.height = h;
    const ctx  = out.getContext('2d');

    // Copie la photo source
    ctx.drawImage(sourceCanvas, 0, 0);

    const lm = landmarks;

    for (const layer of look.layers) {
      const color = palette[layer.zone] || palette.lips;

      switch (layer.zone) {
        case 'lips':
          drawPolygon(ctx, lm, LIPS_UPPER, w, h, color, layer.opacity * 0.9, layer.blend);
          drawPolygon(ctx, lm, LIPS_LOWER, w, h, color, layer.opacity, layer.blend);
          break;

        case 'blush':
          drawBlushGradient(ctx, lm, CHEEK_LEFT,  w, h, color, layer.opacity);
          drawBlushGradient(ctx, lm, CHEEK_RIGHT, w, h, color, layer.opacity);
          break;

        case 'eyeshadow':
          drawEyeshadowGradient(ctx, lm, EYE_LEFT_LID,  w, h, color, layer.opacity);
          drawEyeshadowGradient(ctx, lm, EYE_RIGHT_LID, w, h, color, layer.opacity);
          break;

        case 'highlighter':
          drawHighlighter(ctx, lm, HIGHLIGHTER_LEFT,  w, h, color, layer.opacity);
          drawHighlighter(ctx, lm, HIGHLIGHTER_RIGHT, w, h, color, layer.opacity);
          drawHighlighter(ctx, lm, HIGHLIGHTER_NOSE,  w, h, color, layer.opacity * 0.5);
          break;

        case 'foundation':
          drawFoundationVeil(ctx, lm, w, h, color, layer.opacity);
          break;

        case 'brows':
          drawPolygon(ctx, lm, BROW_LEFT,  w, h, '#2A1A0A', layer.opacity, layer.blend);
          drawPolygon(ctx, lm, BROW_RIGHT, w, h, '#2A1A0A', layer.opacity, layer.blend);
          break;
      }
    }

    return out;
  }

  // ══════════════════════════════════════════════════════════════
  // HELPER hex → rgba string
  // ══════════════════════════════════════════════════════════════

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ══════════════════════════════════════════════════════════════
  // TEXTES PERSONNALISÉS PAR LOOK × PROFIL
  // ══════════════════════════════════════════════════════════════

  function getLookExplanation(lookId, analysis) {
    const ut  = analysis.undertone?.type   || 'neutral';
    const ca  = analysis.carnation?.type   || 'medium';
    const ec  = analysis.eyeContrast?.level || 'moyen';
    const st  = analysis.skinType?.type    || 'normale';
    const utL = analysis.undertone?.label?.split('·')[0]?.trim() || 'Neutre';
    const caL = analysis.carnation?.label || 'Medium';

    const tips = {
      naturel: {
        why: `Ton teint ${caL} avec sous-ton ${utL} rayonne avec une base légère. Ce look mise sur ta peau naturelle, juste améliorée.`,
        details: {
          teint:    'Voile couvrant léger — fini naturel',
          yeux:     'Fard nude adapté à ton sous-ton — regard ouvert',
          levres:   `Teinte proche de ta lèvre naturelle — effet baume teinté`,
          blush:    'Touche légère sur les pommettes — bonne mine instantanée'
        }
      },
      glow: {
        why: `Ton sous-ton ${utL} est idéal pour ce look lumineux. Le highlighter et le blush chaud amplifient tes reflets naturels.`,
        details: {
          teint:    'Base lumineuse — fini satiné, effet peau parfaite',
          yeux:     'Fard doré ou rose selon ton profil — regard intense',
          levres:   `Teinte chaude à ton sous-ton — boost d'éclat`,
          blush:    'Blush vif — posé haut sur les pommettes',
          highlight:'Highlighter ciblé — pommettes, nez, arc de Cupidon'
        }
      },
      sophistique: {
        why: `Ton contraste ${ec} appelle des couleurs structurées. Ce look définit et sculpte sans surcharger.`,
        details: {
          teint:    'Fond de teint couvrant — fini mat ou satiné',
          yeux:     'Fard moyen ton + sourcils définis — regard cadré',
          levres:   `Teinte intense coordonnée à ton sous-ton`,
          blush:    'Blush placé en diagonale — effet sculptant',
          sourcils: 'Sourcils remplis et fixés — structure le visage'
        }
      },
      soiree: {
        why: `Ton contraste ${ec === 'fort' ? 'fort' : ec === 'moyen' ? 'moyen' : 'subtil'} supporte l'intensité de ce look. Les teintes profondes créent un rendu dramatique.`,
        details: {
          teint:    'Fond de teint longue tenue — tenue toute la nuit',
          yeux:     'Fard intense + effet smoky — regard magnétique',
          levres:   `Lèvres profondes — rouge, prune ou bordeaux`,
          blush:    'Blush intense sur les pommettes — relief accentué',
          highlight:'Highlighter fort sur les os du visage',
          sourcils: 'Sourcils très définis — encadrement fort'
        }
      },
      minimaliste: {
        why: `Parfait pour ${st === 'sensible' ? 'ta peau sensible' : 'une routine rapide'} — le minimum pour le maximum d'effet naturel.`,
        details: {
          teint:    'Voile unificateur ou BB crème — zéro défaut visible',
          levres:   'Baume teinté — couleur fondue dans la lèvre',
          blush:    'Touche légère à peine perceptible — effet bonne mine'
        }
      }
    };

    return tips[lookId] || tips.naturel;
  }

  // ══════════════════════════════════════════════════════════════
  // POINT D'ENTRÉE — génère les 5 looks et affiche le carousel
  // ══════════════════════════════════════════════════════════════

  async function generate(container, sourceCanvas, landmarks, analysis) {
    if (!container || !sourceCanvas || !landmarks || !analysis) return;

    const ut = analysis.undertone?.type || 'neutral';
    const ca = analysis.carnation?.type || 'medium';

    // Calcul des scores
    const scores = LOOKS.map(look => scoreLook(look, analysis));

    // Générer les canvases
    const rendered = LOOKS.map((look, i) => {
      const palette  = buildPalette(ut, ca, look.id);
      const canvas   = renderLookOnCanvas(sourceCanvas, landmarks, palette, look);
      const score    = scores[i];
      const rank     = getRank(score, scores);
      const expl     = getLookExplanation(look.id, analysis);
      return { look, canvas, score, rank, expl, palette };
    });

    // Trier : BEST LOOK en premier
    rendered.sort((a, b) => b.score - a.score);

    // Rendu HTML
    container.innerHTML = `
      <div class="looks-section">
        <div class="looks-header">
          <span class="section-tag">Créés spécialement pour toi</span>
          <h2 class="looks-title">Tes looks personnalisés</h2>
          <p class="looks-subtitle">Basés sur ton analyse : carnation ${analysis.carnation?.label || 'Medium'} · sous-ton ${analysis.undertone?.label?.split('·')[0]?.trim() || 'Neutre'} · contraste ${analysis.eyeContrast?.label || 'Moyen'}</p>
        </div>

        <div class="looks-carousel">
          ${rendered.map((r, i) => `
            <div class="look-card ${i === 0 ? 'look-card--active' : ''}" data-look="${r.look.id}" onclick="LookGenerator.selectLook('${r.look.id}')">
              <div class="look-card-img-wrap">
                <img class="look-card-img" src="${r.canvas.toDataURL('image/jpeg', 0.85)}" alt="${r.look.label}">
                <div class="look-rank-badge ${r.rank.class}">${r.rank.label}</div>
              </div>
              <div class="look-card-info">
                <span class="look-icon">${r.look.icon}</span>
                <span class="look-label">${r.look.label}</span>
              </div>
            </div>`).join('')}
        </div>

        <div class="look-detail" id="lookDetail">
          ${renderLookDetail(rendered[0])}
        </div>
      </div>`;

    // Stocker pour la sélection
    window._glowLooks = rendered;
  }

  function renderLookDetail(r) {
    if (!r) return '';
    const { look, expl, palette, rank } = r;

    const detailItems = Object.entries(expl.details || {}).map(([key, val]) => {
      const icons = { teint:'◇', yeux:'◉', levres:'💋', blush:'❋', highlight:'✦', sourcils:'〜' };
      return `<div class="look-detail-item">
        <span class="look-detail-icon">${icons[key] || '·'}</span>
        <div>
          <span class="look-detail-label">${key.charAt(0).toUpperCase() + key.slice(1)}</span>
          <p class="look-detail-val">${val}</p>
        </div>
      </div>`;
    }).join('');

    const swatches = Object.entries(palette).map(([zone, color]) => {
      const labels = { lips:'Lèvres', blush:'Blush', eyeshadow:'Fard', highlighter:'Highlight', foundation:'Fond de teint' };
      return `<div class="look-swatch" title="${labels[zone] || zone}">
        <div class="look-swatch-color" style="background:${color}"></div>
        <span class="look-swatch-label">${labels[zone] || zone}</span>
      </div>`;
    }).join('');

    return `
      <div class="look-detail-inner">
        <div class="look-detail-header">
          <span class="look-detail-icon-lg">${look.icon}</span>
          <div>
            <h3 class="look-detail-title">${look.label}</h3>
            <p class="look-detail-desc">${look.desc}</p>
          </div>
          <span class="look-rank-badge ${rank.class}">${rank.label}</span>
        </div>

        <p class="look-detail-why">${expl.why}</p>

        <div class="look-swatches">${swatches}</div>

        <div class="look-detail-steps">${detailItems}</div>
      </div>`;
  }

  // Sélection d'un look dans le carousel
  window.LookGenerator = window.LookGenerator || {};
  window.LookGenerator.selectLook = function(lookId) {
    document.querySelectorAll('.look-card').forEach(c => {
      c.classList.toggle('look-card--active', c.dataset.look === lookId);
    });
    const found = (window._glowLooks || []).find(r => r.look.id === lookId);
    if (found) {
      document.getElementById('lookDetail').innerHTML = renderLookDetail(found);
    }
  };

  return { generate };

})();
