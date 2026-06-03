/* ============================================================
   routineRenderer.js — Routine personnalisée + Paywall progressif
   Value-first : routine du matin gratuite,
                 routine du soir + maquillage verrouillés (Premium)
   GLOW UP
   ============================================================ */

'use strict';

const RoutineRenderer = (() => {

  // ─── Seed renouvelé à chaque génération de routine ───────────
  let _renderSeed = Math.random().toString(36).slice(2);

  function _refreshSeed() {
    _renderSeed = Math.random().toString(36).slice(2);
  }

  // Hash déterministe seed + clé → float [0, 1)
  function _seededRandom(key) {
    const str = _renderSeed + key;
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return (h >>> 0) / 4294967296;
  }

  const STEP_ICONS = {
    cleanser:    '🫧',
    toner:       '💧',
    serum:       '✨',
    treatment:   '⚗️',
    eye:         '👁️',
    eyepatch:    '🩹',
    moisturizer: '🌿',
    oil:         '🌸',
    exfoliant:   '🔬',
    spf:         '☀️',
    lipbalm:     '💋',
    default:     '◇'
  };

  // Conseils d'application par étape — comment & où
  const STEP_APPLY_TIPS = {
    cleanser:    '💧 Masser en douceur sur visage humide (30 sec), en insistant sur la zone T. Rincer à l\'eau tiède.',
    toner:       '🤲 Verser sur un coton ou dans les paumes. Tapoter sur le visage juste après le nettoyage.',
    serum:       '✨ 3 à 4 gouttes dans les paumes réchauffées. Presser doucement sur le visage du centre vers l\'extérieur.',
    treatment:   '⚗️ Fine couche sur les zones ciblées uniquement. Éviter le contour des yeux. Laisser pénétrer avant la crème.',
    eye:         '👁️ 1 point de produit par œil. Tapoter très délicatement avec l\'annulaire, du coin interne vers le tempe.',
    moisturizer: '🌿 Appliquer sur visage et cou avec des mouvements ascendants. Insister sur les joues et le contour des lèvres.',
    oil:         '🌸 2 à 3 gouttes à réchauffer entre les paumes. Presser sur le visage en dernier, après la crème.',
    exfoliant:   '🔬 2 fois par semaine, le soir sur peau sèche. Éviter le contour des yeux. Rincer après 10 min.',
    spf:         '☀️ Dernière étape du matin, sur visage, cou et oreilles. Quantité généreuse — environ 1/4 de cuillère à café.',
    lipbalm:     '💋 Appliquer sur les lèvres matin et soir, et dès que tu en ressens le besoin. Insister sur le contour.',
    eyepatch_matin: '🧊 Place les patchs froids (conserve-les au réfrigérateur pour un effet anti-poches décuplé) directement sous les yeux. Laisse poser 10 à 15 minutes — le temps de ton café. Retire délicatement et tapote le résidu de sérum avec l\'annulaire sans rincer. ✦ Bienfaits : effet décongestionnant immédiat, regard reposé et lumineux.',
    eyepatch_soir:  '🌙 Applique les patchs après ton démaquillage, avant le sérum et la crème. Laisse poser 15 à 20 minutes (certains patchs peuvent rester jusqu\'à 30 min). La peau se régénère la nuit, les actifs pénètrent 2x mieux le soir. ✦ Bienfaits selon le produit : acide hyaluronique → hydratation profonde · caféine → drainage · rétinol → anti-rides · vitamine C → éclat.'
  };

  // Mapping étape routine → catégorie(s) catalogue (ordre de priorité)
  const STEP_TO_CATEGORIES = {
    cleanser:    ['cleanser'],
    toner:       ['serum'],
    serum:       ['serum'],
    treatment:   ['serum'],
    eye:         ['eye'],
    eyepatch:    ['eye'],
    moisturizer: ['moisturizer'],
    oil:         ['moisturizer'],
    exfoliant:   ['serum'],
    spf:         ['spf'],
    lipbalm:     ['lipbalm']
  };

  // ─── Budget utilisateur ───────────────────────────────────────
  // Normalise les valeurs de budget (questionnaire: low/medium/high, ancien: petits-prix/bon-rapport/premium)
  function _normBudget() {
    const b = AppState.questionnaire.answers?.budget;
    if (b === 'low'    || b === 'petits-prix') return 'low';
    if (b === 'medium' || b === 'bon-rapport') return 'medium';
    if (b === 'high'   || b === 'premium')     return 'high';
    return b;
  }

  function _isLowBudget()    { return _normBudget() === 'low'; }
  function _isBudgetUnder40(){ const b = _normBudget(); return b === 'low' || b === 'medium'; }

  // ─── Routine réduite pour petit budget (3 étapes max) ─────────
  // cleanser + moisturizer + spf, produits ≤ prix plafond
  const LOW_BUDGET_PRICE_CAPS = {
    cleanser:    15,
    moisturizer: 20,
    spf:         17
  };

  // ─── Trouver le meilleur produit pour une étape ───────────────
  // excludeIds : Set de product.id déjà utilisés dans la même section (évite les doublons)
  function findBestProductForStep(stepType, excludeIds = null) {
    const catalog  = AppState.products.catalog || [];
    if (!catalog.length) return null;

    // Skin type : analyse faciale en priorité, sinon questionnaire
    const skinType = AppState.face.skinAnalysis?.skinType?.type
                  || AppState.questionnaire.answers?.skinType
                  || null;

    const categories = STEP_TO_CATEGORIES[stepType] || [stepType];

    let pool = [];
    for (const cat of categories) {
      const found = catalog.filter(p => p.category === cat);
      if (found.length > 0) { pool = found; break; }
    }
    if (!pool.length) return null;

    // Exclure les produits déjà assignés à d'autres étapes (évite les doublons)
    if (excludeIds && excludeIds.size > 0) {
      const deduped = pool.filter(p => !excludeIds.has(p.id));
      if (deduped.length > 0) pool = deduped;
      // Si tous exclus → on garde le pool complet (fallback, mieux que rien)
    }

    // Filtrer par prix plafond si petit budget
    if (_isLowBudget() && LOW_BUDGET_PRICE_CAPS[stepType]) {
      const cheap = pool.filter(p => p.price > 0 && p.price <= LOW_BUDGET_PRICE_CAPS[stepType]);
      if (cheap.length > 0) pool = cheap;
    }

    // Filtrer par skinTypeTags si disponible
    if (skinType) {
      const filtered = pool.filter(p =>
        !p.skinTypeTags || p.skinTypeTags.length === 0 ||
        p.skinTypeTags.includes(skinType)
      );
      if (filtered.length > 0) pool = filtered;
    }

    // Scorer : skinType match +20, rating ×10, isFeatured +10 (réduit pour ne pas dominer)
    pool = pool.map(p => {
      let score = (p.rating || 0) * 10;
      if (p.isFeatured) score += 10;
      if (p.skinTypeTags && skinType && p.skinTypeTags.includes(skinType)) score += 20;
      if (_isLowBudget() && p.price > 0) score += (20 - Math.min(20, p.price)) * 2;
      if (_isBudgetUnder40() && stepType === 'moisturizer' && p.includesSPF) score += 60;
      // Variance aléatoire pour la diversité entre sessions
      score += Math.random() * 15;
      return { ...p, _score: score };
    });

    pool.sort((a, b) => b._score - a._score);

    // Choisir aléatoirement parmi les top-10 produits éligibles
    const topN = pool.slice(0, Math.min(10, pool.length));
    return topN[Math.floor(Math.random() * topN.length)] || null;
  }

  // ─── Routine matin réduite pour petit budget (dynamique) ────────
  // Si la crème choisie inclut SPF → 2 étapes (pas de SPF séparé)
  function _buildLowBudgetRoutine() {
    const moisturizer = findBestProductForStep('moisturizer');
    if (moisturizer?.includesSPF) {
      return [
        { order: 1, step: 'cleanser',    label: 'Nettoyant doux',            note: 'Matin et soir' },
        { order: 2, step: 'moisturizer', label: 'Crème hydratante + SPF 50', note: 'Hydrate et protège en une étape' }
      ];
    }
    return [
      { order: 1, step: 'cleanser',    label: 'Nettoyant doux',     note: 'Matin et soir' },
      { order: 2, step: 'moisturizer', label: 'Crème hydratante',   note: 'Légère et efficace' },
      { order: 3, step: 'spf',         label: 'Protection solaire', note: 'SPF 50 — indispensable' }
    ];
  }

  // ─── Filtrer SPF d'une routine si la crème hydratante l'inclut ─
  function _filterSpfIfIncluded(steps) {
    if (!_isBudgetUnder40()) return steps;
    const moisturizer = findBestProductForStep('moisturizer');
    if (!moisturizer?.includesSPF) return steps;
    // Supprimer l'étape SPF et renommer l'étape moisturizer
    return steps
      .filter(s => s.step !== 'spf')
      .map(s => s.step === 'moisturizer'
        ? { ...s, label: s.label.includes('SPF') ? s.label : s.label + ' + SPF 50', note: 'Hydrate et protège en une étape' }
        : s
      );
  }

  // ─── Mini carte produit inline dans la routine ────────────────
  function renderStepProduct(product) {
    if (!product) return '';
    const stars = '★'.repeat(Math.floor(product.rating || 0)) + (product.rating % 1 >= 0.5 ? '½' : '');
    return `
      <div class="step-product-card" onclick="event.stopPropagation(); ProductCatalog.openProductModal('${product.id}')">
        ${product.imageUrl ? `<img class="step-product-img" src="${product.imageUrl}" alt="${product.name}" onerror="this.onerror=null;this.style.display='none'">` : ''}
        <div class="step-product-info">
          <div class="step-product-brand">${product.brand}</div>
          <div class="step-product-name">${product.name}</div>
          <div class="step-product-meta">
            <span class="step-product-stars">${stars}</span>
            <span class="step-product-price">${product.price ? product.price.toFixed(2) + ' €' : ''}</span>
          </div>
        </div>
        <a class="btn-step-buy"
           href="${product.amazonUrl}"
           target="_blank"
           rel="noopener nofollow sponsored"
           onclick="event.stopPropagation(); trackAmazonClick('${product.id}')">
          🛒 Ajouter au panier
        </a>
        <a class="btn-compare-price"
           href="https://www.google.com/search?q=${encodeURIComponent((product.brand || '') + ' ' + (product.name || ''))}&tbm=shop"
           target="_blank"
           rel="noopener"
           onclick="event.stopPropagation()">
          Comparer les prix →
        </a>
      </div>`;
  }

  // ─── Rendu principal ──────────────────────────────────────────
  // ─── Durée estimée par type de produit ───────────────────────
  // Basé sur usage quotidien, volumes moyens du marché
  const STEP_DURATION_MONTHS = {
    cleanser:    2,   // 150ml, 2x/jour
    toner:       2,   // 150ml, 1x/jour
    serum:       3,   // 30ml, 1-2 pompes/jour
    treatment:   3,   // 30ml, usage ciblé
    eye:         4,   // 15ml, usage délicat
    eyepatch:    3,   // boîte 60 patchs, 3-4x/semaine
    moisturizer: 3,   // 50ml, 2x/jour
    oil:         4,   // 30ml, quelques gouttes/jour
    exfoliant:   4,   // 2-3x/semaine
    spf:         2,   // 50ml, 1x/jour, dose généreuse
    lipbalm:     3
  };

  // ─── Calcul du total global + durée estimée ──────────────────
  function _computeGlobalTotal(routine) {
    const allSteps = [...(routine.matin || []), ...(routine.soir || [])];
    let total = 0;
    let minDuration = Infinity;
    const seen = new Set();      // dédup pour le prix (ne compter qu'une fois par produit)
    const usedIds = new Set();   // dédup pour le choix (même logique que renderRoutineSection)

    for (const step of allSteps) {
      const p = findBestProductForStep(step.step, usedIds);
      if (p) {
        usedIds.add(p.id);
        if (p.price && !seen.has(p.id)) {
          total += p.price;
          seen.add(p.id);
        }
      }
      const dur = STEP_DURATION_MONTHS[step.step];
      if (dur && dur < minDuration) minDuration = dur;
    }

    // Patchs yeux
    const hasEye = allSteps.some(s => s.step === 'eye');
    if (hasEye) {
      const patch = findBestProductForStep('eyepatch', usedIds);
      if (patch?.price && !seen.has(patch.id)) total += patch.price;
      const dur = STEP_DURATION_MONTHS.eyepatch;
      if (dur < minDuration) minDuration = dur;
    }

    const duration = minDuration === Infinity ? 3 : minDuration;
    return { total, duration };
  }

  function _durationLabel(months) {
    if (months <= 1) return '1 mois';
    if (months <= 2) return '2 mois';
    if (months <= 3) return '3 mois';
    if (months <= 4) return '4 mois';
    if (months <= 6) return '6 mois';
    return months + ' mois';
  }

  function renderGlobalTotal(routine, isLocked) {
    const { total, duration } = _computeGlobalTotal(routine);
    if (total <= 0) return '';

    const perMonth   = (total / duration).toFixed(0);
    const durLabel   = _durationLabel(duration);
    const routineNote = isLocked
      ? 'Routine du matin uniquement'
      : 'Routine matin + soir complète';

    return `
      <div class="routine-global-total">
        <div>
          <div class="routine-global-total-label">Budget routine estimé</div>
          <div class="routine-global-total-price">${total.toFixed(2)} €</div>
          <div class="routine-global-total-duration">≈ ${perMonth} €/mois · Dure environ ${durLabel}</div>
          <div class="routine-global-total-note">${routineNote}</div>
        </div>
        <span style="font-size:2rem;opacity:0.35;">🛒</span>
      </div>`;
  }

  function renderResults() {
    _refreshSeed(); // nouveau tirage produit à chaque génération
    const container = document.getElementById('resultsContent');
    if (!container) return;

    const { routine } = AppState;
    if (!routine.ruleApplied) {
      container.innerHTML = '<p class="empty-state">Complète le questionnaire pour voir ta routine.</p>';
      return;
    }

    const isLocked   = typeof Subscription !== 'undefined' ? !Subscription.canAccess('routine_second') : true;
    const lowBudget  = _isLowBudget();
    const matnSteps  = lowBudget
      ? _buildLowBudgetRoutine()
      : _filterSpfIfIncluded(routine.matin || []);
    const hasRetinol = _routineHasRetinol({ matin: matnSteps, soir: routine.soir });

    container.innerHTML = `
      <div class="results-header">
        <span class="section-tag">Diagnostic personnalisé</span>
        <h1>${routine.ruleName || 'Ta Routine'}</h1>
        <p>Basée sur tes réponses et ton analyse de peau — routine adaptée à ton profil unique.</p>
      </div>

      ${lowBudget ? `<div class="routine-budget-notice">🌱 Routine essentielle · Budget serré · Max ~40 € pour les 3 produits</div>` : ''}

      ${renderWarnings(routine.warnings, hasRetinol)}

      <!-- Total global -->
      ${renderGlobalTotal({ ...routine, matin: matnSteps }, isLocked)}

      <!-- ✅ GRATUIT : Routine du matin complète -->
      <div class="free-section-label">
        <span class="free-badge">✦ Inclus gratuitement</span>
      </div>
      ${renderRoutineSection('Routine du matin', matnSteps, '🌅', hasRetinol)}

      <!-- 🔒 PREMIUM : Routine du soir -->
      ${lowBudget
        ? renderLowBudgetSoir()
        : isLocked
          ? renderLockedSection('Routine du soir', routine.soir, '🌙')
          : renderRoutineSection('Routine du soir', routine.soir, '🌙', hasRetinol)}


      <!-- ✦ SKIN JOURNEY — 100% gratuit, toujours visible -->
      ${renderSkinJourneyTeaser()}

      <!-- Blocs conversion + produits -->
      ${renderConversionBlocks(isLocked)}

      ${renderDebugLog(routine.log)}

      <!-- Bannière sauvegarde -->
      ${renderSaveBanner()}
    `;
  }

  function renderSaveBanner() {
    const hasSave  = typeof RoutineSaver !== 'undefined' && RoutineSaver.hasCompletedProfile();
    const hasPhoto = !!AppState?.face?.skinAnalysis;
    const parts    = [];
    if (hasPhoto) parts.push('Analyse photo');
    parts.push('Questionnaire');
    parts.push('Routine');
    return `
      <div class="save-banner">
        <span class="save-banner-icon">✓</span>
        <div class="save-banner-text">
          <strong>${parts.join(' · ')} enregistrés</strong>
          <span>${AppState.user.isGuest ? 'Crée un compte pour retrouver ton profil sur tous tes appareils.' : 'Retrouve ton profil dans <strong>Mon compte</strong>.'}</span>
        </div>
        ${AppState.user.isGuest ? `<button class="btn btn-outline save-banner-btn" onclick="openAuthModal()">Créer mon compte →</button>` : ''}
      </div>`;
  }

  // ─── Section libre ────────────────────────────────────────────
  function renderRoutineSection(title, steps, emoji, hasRetinol) {
    if (!steps || steps.length === 0) return '';

    const isMatin      = title.toLowerCase().includes('matin');
    const patchTipKey  = isMatin ? 'eyepatch_matin' : 'eyepatch_soir';
    const patchProduct = findBestProductForStep('eyepatch');

    const sortedSteps    = [...steps].sort((a, b) => a.order - b.order);
    let stepIndex = 0;
    const blocks    = [];
    const products  = []; // pour le total
    const usedProductIds = new Set(); // dédup : pas le même produit pour deux étapes différentes

    for (const step of sortedSteps) {
      const product  = findBestProductForStep(step.step, usedProductIds);
      if (product) usedProductIds.add(product.id);
      const applyTip = STEP_APPLY_TIPS[step.step] || '';
      stepIndex++;
      if (product?.price) products.push(product);

      // Nettoyer les mentions rétinol dans les notes si non applicable
      let stepNote = step.note || '';
      if (!hasRetinol && stepNote) {
        // Retirer "· rétinol" ou "rétinol ·" ou "rétinol," patterns en liste
        stepNote = stepNote.replace(/·?\s*r[eé]tinol\s*(·|,|$)/gi, '').trim();
        // Retirer les mentions standalone restantes
        stepNote = stepNote.replace(/\br[eé]tinol\b/gi, '').replace(/\s{2,}/g, ' ').trim();
        // Nettoyer virgules/points orphelins
        stepNote = stepNote.replace(/^[,·\s]+|[,·\s]+$/g, '').trim();
      }

      blocks.push(`
        <div class="routine-step-block">
          <div class="routine-step">
            <div class="step-number">${stepIndex}</div>
            <div class="step-icon">${STEP_ICONS[step.step] || STEP_ICONS.default}</div>
            <div class="step-info">
              <div class="step-label">${step.label}</div>
              ${stepNote ? `<div class="step-note">${stepNote}</div>` : ''}
            </div>
            <div class="step-type">${formatStepType(step.step)}</div>
          </div>
          ${renderStepProduct(product)}
          ${applyTip ? `
          <details class="step-tip-details">
            <summary class="step-tip-toggle">💡 Comment appliquer</summary>
            <div class="step-apply-tip">${applyTip}</div>
          </details>` : ''}
        </div>`);

      // Injecter les patchs yeux juste après l'étape contour des yeux
      if (step.step === 'eye' && patchProduct && !usedProductIds.has(patchProduct.id)) {
        usedProductIds.add(patchProduct.id);
        stepIndex++;
        if (patchProduct?.price) products.push(patchProduct);
        blocks.push(`
          <div class="routine-step-block eyepatch-block">
            <div class="routine-step">
              <div class="step-number">${stepIndex}</div>
              <div class="step-icon">${STEP_ICONS.eyepatch}</div>
              <div class="step-info">
                <div class="step-label">Patchs yeux</div>
                <div class="step-note">${isMatin ? '10-15 min · Anti-poches · Regard frais' : '15-20 min · Hydratation · Anti-rides'}</div>
              </div>
              <div class="step-type">Patchs yeux</div>
            </div>
            ${renderStepProduct(patchProduct)}
            <details class="step-tip-details">
              <summary class="step-tip-toggle">💡 Quand et comment les poser</summary>
              <div class="step-apply-tip">${STEP_APPLY_TIPS[patchTipKey]}</div>
            </details>
          </div>`);
      }
    }

    // Calcul total section
    const total = products.reduce((s, p) => s + (p.price || 0), 0);
    const totalHtml = total > 0 ? `
      <div class="routine-section-total">
        <span class="routine-section-total-label">${stepIndex} produit${stepIndex > 1 ? 's' : ''} · Budget estimé</span>
        <span class="routine-section-total-price">${total.toFixed(2)} €</span>
      </div>` : '';

    return `
      <div class="routine-section">
        <div class="routine-section-header">
          <span class="routine-emoji">${emoji}</span>
          <h2>${title}</h2>
        </div>
        <div class="routine-steps">${blocks.join('')}</div>
        ${totalHtml}
      </div>`;
  }

  // ─── Section verrouillée (soir) ───────────────────────────────
  function renderLockedSection(title, steps, emoji) {
    // Même si steps est vide, on affiche un preview générique
    const preview = (steps && steps.length > 0)
      ? steps.sort((a, b) => a.order - b.order).slice(0, 2)
      : [
          { step: 'cleanser',    label: 'Double nettoyage',          note: 'Huile + nettoyant doux' },
          { step: 'treatment',   label: 'Actif ciblé de nuit',       note: 'Actif de nuit selon ton profil' }
        ];

    const remainCount = steps && steps.length > 2 ? steps.length - 2 : 2;

    const previewHtml = preview.map((step, i) => `
      <div class="routine-step">
        <div class="step-number">${i + 1}</div>
        <div class="step-icon">${STEP_ICONS[step.step] || STEP_ICONS.default}</div>
        <div class="step-info">
          <div class="step-label">${step.label}</div>
          ${step.note ? `<div class="step-note">${step.note}</div>` : ''}
        </div>
        <div class="step-type">${formatStepType(step.step)}</div>
      </div>`).join('');

    return `
      <div class="routine-section locked-section">
        <div class="routine-section-header">
          <span class="routine-emoji">${emoji}</span>
          <h2>${title}</h2>
          <span class="lock-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Premium
          </span>
        </div>
        <div class="locked-content-wrap">
          <div class="locked-blur" aria-hidden="true">
            <div class="routine-steps">${previewHtml}</div>
            <p class="locked-more">+ ${remainCount} étape${remainCount > 1 ? 's' : ''} personnalisée${remainCount > 1 ? 's' : ''} selon ton profil</p>
          </div>
          <div class="locked-overlay">
            <div class="locked-overlay-inner">
              <svg class="lock-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <button class="btn btn-dark locked-unlock-btn" onclick="openPaywallModal()">
                Débloquer la routine du soir
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ─── Section maquillage (locked ou non → même teaser IA) ────
  function renderLockedMakeup(tips) {
    return renderMakeupTips(tips);
  }

  // ─── CTA Paywall principal ────────────────────────────────────
  function renderPaywallCTA() {
    return `
      <div class="paywall-inline-cta">
        <div class="paywall-inline-icon">✦</div>
        <h2>Ta routine complète personnalisée est prête</h2>
        <p>
          Débloque ta routine du soir, tes recommandations maquillage et les
          produits adaptés à ton analyse de peau — sélectionnés sans favoritisme.
        </p>
        <div class="paywall-inline-perks">
          <span>🌙 Routine du soir</span>
          <span>💄 Conseils maquillage</span>
          <span>✦ Produits recommandés</span>
          <span>◇ Try-on virtuel</span>
        </div>
        <button class="btn btn-dark paywall-main-btn" onclick="openPaywallModal()">
          Débloquer mon Beauty Plan
        </button>
        <p class="paywall-inline-note">Paiement annuel · Annulable à tout moment</p>
      </div>`;
  }

  // ─── Bloc conversion complet (remplace l'ancien paywall) ────────
  function renderConversionBlocks(isLocked) {
    const plan          = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
    const routineChoice = AppState.routineChoice || 'skincare';
    const isCoach       = plan === 'glowplus';

    const parts = [];

    // ÉTAPE 1 — Routine complémentaire verrouillée
    if (isLocked) {
      parts.push(renderLockedRoutineTeaser(routineChoice));
    }

    // ÉTAPE 2 — Offre Glow Up (pour free seulement)
    if (isLocked) {
      parts.push(renderGlowUpOffer());
    }

    // ÉTAPE 3 — Coach (pour free ET glow — pas pour glowplus)
    if (!isCoach) {
      parts.push(renderCoachOffer());
    }

    // ÉTAPE 4 — Tableau comparatif (pour free et glow)
    if (!isCoach) {
      parts.push(renderComparisonTable(plan));
    }

    // Produits recommandés (toujours)
    parts.push(renderProductsCTA());

    return parts.join('');
  }

  // ─── Étape 1 : Routine complémentaire verrouillée ────────────
  function renderLockedRoutineTeaser(routineChoice) {
    const isSkincare = routineChoice === 'skincare';
    const title   = isSkincare
      ? '🔒 Débloque aussi ta routine Make-up personnalisée'
      : '🔒 Débloque aussi ta routine Skincare personnalisée';
    const items = isSkincare
      ? ['Ta carnation & ton sous-ton', 'La forme de ton visage', 'Tes objectifs beauté', 'Produits maquillage adaptés']
      : ['Ton type de peau', 'Tes problématiques détectées', 'Ton budget', 'Tes objectifs beauté'];
    return `
      <div class="conversion-block conversion-block--lock">
        <div class="cb-header">
          <span class="cb-lock-icon">🔒</span>
          <h3 class="cb-title">${isSkincare ? 'Débloque aussi ta routine Make-up personnalisée' : 'Débloque aussi ta routine Skincare personnalisée'}</h3>
        </div>
        <p class="cb-desc">${isSkincare ? 'Découvre les produits adaptés à :' : 'Découvre la routine idéale adaptée à :'}</p>
        <ul class="cb-list">
          ${items.map(i => `<li>✓ ${i}</li>`).join('')}
        </ul>
        <button class="btn-orange-cta" onclick="Subscription.showPaywall('routine_second')">
          Débloquer ma routine complète
        </button>
      </div>`;
  }

  // ─── Étape 2 : Offre Glow Up ─────────────────────────────────
  function renderGlowUpOffer() {
    return `
      <div class="conversion-block conversion-block--glow">
        <div class="cb-badge">✨ Offre Glow Up</div>
        <h3 class="cb-title">Débloque tout l'univers Glow Up</h3>
        <ul class="cb-list">
          <li>✓ Routine skincare complète</li>
          <li>✓ Routine make-up complète</li>
          <li>✓ Analyses photo IA</li>
          <li>✓ Recommandations produits personnalisées</li>
          <li>✓ Nouveaux conseils adaptés à ton profil</li>
        </ul>
        <div class="cb-price">
          <span class="cb-price-main">15,99 €</span>
          <span class="cb-price-period">/ an</span>
        </div>
        <p class="cb-price-sub">Soit seulement 1,33 € par mois</p>
        <button class="btn-orange-cta" onclick="Subscription.openCheckout('glow_year')">
          Débloquer Glow Up
        </button>
        <p class="cb-note">Paiement annuel · Annulable à tout moment</p>
      </div>`;
  }

  // ─── Étape 3 : Glow Up Coach ─────────────────────────────────
  function renderCoachOffer() {
    return `
      <div class="conversion-block conversion-block--coach">
        <div class="cb-badge cb-badge--coach">⭐ Glow Up Coach</div>
        <h3 class="cb-title">Teste Glow Up Coach gratuitement</h3>
        <p class="cb-desc">Glow Up Coach va plus loin que les recommandations classiques. Il prend en compte :</p>
        <ul class="cb-list">
          <li>✓ Tes habitudes beauté & ton budget</li>
          <li>✓ Tes objectifs & ton style de vie</li>
          <li>✓ Tes préférences & contraintes personnelles</li>
          <li>✓ La seule vendeuse beauté qui te connaît déjà</li>
        </ul>
        <div class="cb-price">
          <span class="cb-price-main">49,99 €</span>
          <span class="cb-price-period">/ an</span>
        </div>
        <p class="cb-price-sub">Soit seulement 4,17 € par mois</p>
        <button class="btn-orange-cta btn-orange-cta--coach" onclick="Subscription.showPaywall('coach')">
          Tester Glow Up Coach gratuitement
        </button>
        <p class="cb-note">Paiement annuel · Annulable à tout moment</p>
      </div>`;
  }

  // ─── Étape 4 : Tableau comparatif ────────────────────────────
  function renderComparisonTable(plan) {
    const rows = [
      ['Prix',                                     '15,99 €/an', '49,99 €/an'],
      ['Routine skincare personnalisée',            '✅', '✅'],
      ['Routine make-up personnalisée',             '✅', '✅'],
      ['Analyses photo IA',                         '✅', '✅'],
      ['Recommandations produits personnalisées',   '✅', '✅'],
      ['Conseils avancés et approfondis',           '❌', '✅'],
      ['Accompagnement beauté renforcé',            '❌', '✅'],
      ['Priorité sur les nouveautés',               '❌', '✅'],
      ['Parrainage (bons dès 5 filleuls)',          '❌', '✅'],
    ];
    return `
      <div class="conversion-block conversion-block--table">
        <div class="cb-badge">Comparer les offres</div>
        <h3 class="cb-title">Ce qui est inclus</h3>
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th></th>
                <th class="${plan === 'glow' ? 'cb-th--active' : ''}">Glow Up</th>
                <th class="${plan === 'glowplus' ? 'cb-th--active' : ''}">Glow Up Coach</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(([feat, glow, coach]) => `
                <tr>
                  <td>${feat}</td>
                  <td class="cb-td-center">${glow}</td>
                  <td class="cb-td-center">${coach}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="cb-table-note">✨ <strong>Glow Up</strong> : l'essentiel pour trouver tes routines idéales grâce à l'IA.</p>
        <p class="cb-table-note">⭐ <strong>Glow Up Coach</strong> : l'expérience beauté la plus complète avec accompagnement renforcé et programme de parrainage.</p>
      </div>`;
  }

  // ─── CTA produits (utilisateurs premium) ─────────────────────
  function renderProductsCTA() {
    const products = AppState.products.recommended || [];
    const top = products.slice(0, 6);

    const gridHtml = top.length > 0
      ? `<div class="products-grid results-inline-grid">
          ${top.map(p => ProductCatalog.renderCard(p, { showBuyButton: true })).join('')}
         </div>`
      : '';

    return `
      <div class="results-products-section">
        <div class="results-products-header">
          <span class="section-tag">Sélectionnés pour toi</span>
          <h2>Produits Recommandés</h2>
          <p>Choisis selon ton type de peau et ta routine — liens affiliés Amazon, même commission sur tous.</p>
        </div>
        ${gridHtml}
        <div class="results-cta">
          <button class="btn btn-outline" onclick="showScreen('products')">
            Voir tous les produits →
          </button>
          <button class="btn btn-outline" onclick="showScreen('tryon')" style="margin-top:12px">
            Essayer virtuellement ✦
          </button>
        </div>
      </div>`;
  }

  // ─── Routine du soir simplifiée pour petit budget ─────────────
  function renderLowBudgetSoir() {
    return `
      <div class="routine-section">
        <div class="routine-section-header">
          <span class="routine-emoji">🌙</span>
          <h2>Routine du soir</h2>
        </div>
        <div class="routine-budget-soir-tip">
          <p>💡 <strong>Le soir avec un petit budget :</strong> utilise ton nettoyant + ta crème du matin. C'est tout ce dont tu as besoin — la constance prime sur le nombre de produits.</p>
          <p style="margin-top:8px;font-size:0.8rem;color:var(--muted);">Quand tu es prête à investir davantage, une routine du soir dédiée peut inclure un sérum actif ciblé.</p>
        </div>
      </div>`;
  }

  // ─── Retinol présent dans la routine ? ───────────────────────
  function _routineHasRetinol(routine) {
    const allSteps = [...(routine.matin || []), ...(routine.soir || [])];
    return allSteps.some(step => {
      const text = ((step.label || '') + ' ' + (step.note || '')).toLowerCase();
      return text.includes('rétinol') || text.includes('retinol');
    });
  }

  // ─── Avertissements ───────────────────────────────────────────
  function renderWarnings(warnings, hasRetinol) {
    if (!warnings || warnings.length === 0) return '';
    const filtered = hasRetinol
      ? warnings
      : warnings.filter(w => {
          const lc = w.toLowerCase();
          return !lc.includes('rétinol') && !lc.includes('retinol');
        });
    if (filtered.length === 0) return '';
    return `
      <div class="routine-warnings">
        <h3>⚠️ Points importants</h3>
        <ul>
          ${filtered.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>`;
  }

  // ─── Pont discret vers Make-up (depuis les résultats Skincare) ─
  function renderMakeupBridge() {
    const isLocked = typeof Subscription !== 'undefined' ? !Subscription.canAccess('routine_second') : true;
    return `
      <div class="makeup-bridge">
        <div class="makeup-bridge-inner">
          <span class="makeup-bridge-icon">✦</span>
          <div class="makeup-bridge-text">
            <strong>Et pour le maquillage ?</strong>
            <p>Découvre ta routine make-up personnalisée selon ta morphologie de visage.</p>
          </div>
          <button class="btn btn-outline makeup-bridge-btn"
                  onclick="${isLocked ? 'openPaywallModal()' : "showScreen('makeup')"}">
            ${isLocked ? 'Débloquer la routine make-up' : 'Voir ma routine make-up →'}
          </button>
        </div>
      </div>`;
  }
  function renderMakeupTips()    { return ''; }
  function renderLockedMakeup()  { return ''; }

  // ─── Skin Journey teaser (toujours visible, 100% gratuit) ────
  function renderSkinJourneyTeaser() {
    const journeyActive = typeof SkinJourney !== 'undefined' && SkinJourney.isActive();
    const currentDay    = journeyActive
      ? (() => {
          try {
            const d = JSON.parse(localStorage.getItem('glowup_journey_v1') || 'null');
            if (!d) return 1;
            return Math.min(30, Math.floor((new Date() - new Date(d.startDate)) / 86400000) + 1);
          } catch { return 1; }
        })()
      : 1;
    const progress = Math.round((currentDay / 30) * 100);

    return `
      <div class="journey-teaser">
        <div class="journey-teaser-left">
          <div class="journey-teaser-tag">
            <span class="journey-free-pill">✦ 100% Gratuit</span>
          </div>
          <h2 class="journey-teaser-title">SKIN JOURNEY</h2>
          <p class="journey-teaser-sub">Suis la transformation de ta peau</p>

          <div class="journey-teaser-day">
            <span class="journey-teaser-day-num">Jour ${currentDay}</span>
            <span class="journey-teaser-day-total">/ 30</span>
          </div>

          <div class="journey-teaser-bar-track">
            <div class="journey-teaser-bar-fill" style="width:${progress}%"></div>
          </div>
          <p class="journey-teaser-progress-label">${journeyActive ? `${progress}% du programme complété` : 'Programme non démarré'}</p>

          <button class="btn btn-dark journey-teaser-btn"
                  onclick="${journeyActive ? "showScreen('journey')" : 'SkinJourney.start()'}">
            ${journeyActive ? '▶ Reprendre mon suivi' : 'Commencer mon suivi ✦'}
          </button>
          <p class="journey-teaser-note">Suivi de peau 100% gratuit · Aucun compte requis</p>
        </div>

        <div class="journey-teaser-right" aria-hidden="true">
          <div class="journey-teaser-circle">
            <svg viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(201,169,138,0.2)" stroke-width="6"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--nude)" stroke-width="6"
                stroke-dasharray="${2 * Math.PI * 34}"
                stroke-dashoffset="${2 * Math.PI * 34 * (1 - progress / 100)}"
                stroke-linecap="round" transform="rotate(-90 40 40)"/>
            </svg>
            <div class="journey-teaser-circle-inner">
              <span class="journey-teaser-pct">${progress}%</span>
              <span class="journey-teaser-pct-label">complété</span>
            </div>
          </div>
          <div class="journey-teaser-perks">
            <div class="journey-teaser-perk">📅 30 jours</div>
            <div class="journey-teaser-perk">☑️ Check-in quotidien</div>
            <div class="journey-teaser-perk">📸 Avant / Après</div>
            <div class="journey-teaser-perk">🏆 Badges & Points</div>
          </div>
        </div>
      </div>`;
  }

  // ─── Debug log ────────────────────────────────────────────────
  function renderDebugLog(log) {
    if (!log || log.length === 0) return '';
    if (!window.location.search.includes('debug')) return '';
    return `
      <details class="debug-log">
        <summary>🔍 Log du moteur de règles</summary>
        <pre>${log.map(e => `[${e.type}] ${e.message}`).join('\n')}</pre>
      </details>`;
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function formatStepType(step) {
    const labels = {
      cleanser:    'Nettoyant',
      toner:       'Tonique',
      serum:       'Sérum',
      treatment:   'Traitement',
      eye:         'Contour yeux',
      eyepatch:    'Patchs yeux',
      moisturizer: 'Hydratant',
      oil:         'Huile',
      exfoliant:   'Exfoliant',
      spf:         'Protection solaire'
    };
    return labels[step] || step;
  }

  return { renderResults };

})();
