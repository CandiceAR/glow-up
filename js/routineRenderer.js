/* ============================================================
   routineRenderer.js — Routine personnalisée + Paywall progressif
   Value-first : routine du matin gratuite,
                 routine du soir + maquillage verrouillés (Premium)
   GLOW UP
   ============================================================ */

'use strict';

const RoutineRenderer = (() => {

  // ─── Seed STABLE par routine ─────────────────────────────────
  // Les produits sont tirés de façon déterministe à partir du seed de
  // la routine → une routine affiche TOUJOURS les mêmes produits
  // (au re-rendu, au retour sur la page, à la reprise). Le seed est
  // persisté avec la routine (RoutineSaver), donc stable dans le temps.
  let _renderSeed = 'default';

  function newRoutineSeed() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function _refreshSeed() {
    const r = AppState.routine;
    if (r) {
      if (!r.seed) r.seed = newRoutineSeed();   // routine sans seed (legacy) → on en fige un
      _renderSeed = r.seed;
    } else {
      _renderSeed = 'default';
    }
    if (typeof SpfEngine !== 'undefined' && SpfEngine.setSeed) SpfEngine.setSeed(_renderSeed);
  }

  // ─── SPF : visuel de marque généré (fallback quand pas de vraie photo) ─
  // SVG dans la DA Glow Up : soleil + marque + SPF{protection}. Jamais vide.
  function _spfPlaceholder(brand, protection) {
    const b = String(brand || 'SPF').toUpperCase().slice(0, 18);
    const spf = protection ? ('SPF ' + protection) : 'SPF';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FBF7F2"/><stop offset="1" stop-color="#F1E2D4"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#g)"/>
      <g stroke="#F0913F" stroke-width="4" stroke-linecap="round">
        <line x1="160" y1="34" x2="160" y2="20"/><line x1="160" y1="94" x2="160" y2="108"/>
        <line x1="130" y1="64" x2="116" y2="64"/><line x1="190" y1="64" x2="204" y2="64"/>
        <line x1="139" y1="43" x2="129" y2="33"/><line x1="181" y1="43" x2="191" y2="33"/>
        <line x1="139" y1="85" x2="129" y2="95"/><line x1="181" y1="85" x2="191" y2="95"/></g>
      <circle cx="160" cy="64" r="20" fill="#F0913F"/>
      <text x="160" y="146" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="19" font-weight="600" fill="#2C2A27">${b}</text>
      <text x="160" y="174" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="14" letter-spacing="2" fill="#C9A98A">${spf}</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // ─── SPF : convertir une fiche spfProducts → format carte produit ─
  function _spfAsProduct(p, description) {
    if (!p) return null;
    let buyUrl = p.buyUrl;
    if (!buyUrl) {
      // Pas de lien direct → recherche Amazon affiliée (honnête, monétisée)
      buyUrl = `https://www.amazon.fr/s?k=${encodeURIComponent(p.brand + ' ' + p.name)}&tag=kan10ar-21`;
    }
    return {
      id: p.id, name: p.name, brand: p.brand,
      imageUrl: p.imageUrl && p.imageUrl.trim() ? p.imageUrl : _spfPlaceholder(p.brand, p.protection),
      amazonUrl: buyUrl,
      price: p.price ?? null,
      rating: null,
      description: description || ''
    };
  }

  // ─── SPF recommandé pour le profil courant (mémoïsé via SpfEngine) ─
  function _spfReco() {
    if (typeof SpfEngine === 'undefined') return null;
    if (!(AppState.products.spfCatalog || []).length) return null;
    try { return SpfEngine.getRecommendation(); } catch { return null; }
  }

  // ─── SPF : alternatives + recommandation corps sous la carte ──
  function _renderSpfExtras() {
    const reco = _spfReco();
    if (!reco) return '';

    const alts = (reco.alternatives || []).slice(0, 2);
    const altHtml = alts.length ? `
      <div class="spf-alts">
        <span class="spf-alts-label">✦ 2 alternatives selon tes envies</span>
        <div class="spf-alts-list">
          ${alts.map(p => {
            const compareUrl = `https://www.google.com/search?q=${encodeURIComponent(p.brand + ' ' + p.name)}&tbm=shop`;
            return `<a class="spf-alt-chip" href="${compareUrl}" target="_blank" rel="noopener">
              <span class="spf-alt-brand">${p.brand}</span>
              <span class="spf-alt-name">${p.name}</span>
            </a>`;
          }).join('')}
        </div>
      </div>` : '';

    const body = reco.body;
    const bodyHtml = body ? `
      <div class="spf-body-reco">
        <span class="spf-body-icon">🧴</span>
        <div class="spf-body-text">
          <strong>SPF corps recommandé · ${body.brand}</strong>
          <span>${body.name}</span>
          ${reco.bodyReason ? `<span class="spf-body-reason">${reco.bodyReason}</span>` : ''}
        </div>
        <a class="spf-body-cta"
           href="https://www.google.com/search?q=${encodeURIComponent(body.brand + ' ' + body.name)}&tbm=shop"
           target="_blank" rel="noopener">Voir →</a>
      </div>` : '';

    return (altHtml || bodyHtml) ? `<div class="spf-extras">${altHtml}${bodyHtml}</div>` : '';
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

    // ── SPF : sélection intelligente via la base SPF dédiée ──
    if (stepType === 'spf') {
      const reco = _spfReco();
      if (reco?.primary) return _spfAsProduct(reco.primary, reco.reason);
      // sinon fallback : ancien comportement (catégorie spf du catalogue)
    }

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
      // Variance DÉTERMINISTE (seed de la routine) — stable au re-rendu
      score += _seededRandom('jit_' + stepType + '_' + p.id) * 15;
      return { ...p, _score: score };
    });

    pool.sort((a, b) => b._score - a._score);

    // Choix stable parmi les top-10 (déterministe via le seed de la routine)
    const topN = pool.slice(0, Math.min(10, pool.length));
    return topN[Math.floor(_seededRandom('pick_' + stepType) * topN.length)] || null;
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

  // ─── Résumé diagnostic 2 lignes : analyse photo + réponses ────
  function _buildDiagnosisSummary() {
    const a  = AppState.questionnaire?.answers || {};
    const sa = AppState.face?.skinAnalysis || null;

    const SKIN_LBL = { normale:'normale', grasse:'grasse', seche:'sèche', mixte:'mixte', sensible:'sensible' };
    const skinType = sa?.skinType?.type || a.skinType;
    const skinLbl  = SKIN_LBL[skinType] || null;

    // Observation visuelle principale (hors point positif)
    let visualObs = '';
    if (sa && typeof SkinAnalysis !== 'undefined' && SkinAnalysis.getTopInsights) {
      try {
        const ins = SkinAnalysis.getTopInsights(sa).filter(i => !i.positive);
        if (ins.length) {
          const OBS = {
            redness: 'une légère rougeur localisée',
            sebum:   'une zone T plus brillante',
            taches:  'quelques irrégularités de teint',
            terne:   'un teint à raviver',
            texture: 'un grain de peau à lisser',
            cernes:  'un regard à défatiguer',
          };
          visualObs = OBS[ins[0].key] || '';
        }
      } catch {}
    }

    const undertoneLbl = sa?.undertone?.label
      ? sa.undertone.label.split('·')[0].trim().toLowerCase()
      : null;

    // Ligne 1 — analyse visuelle
    let l1;
    if (sa && skinLbl) {
      l1 = `Ton analyse photo révèle une peau <strong>${skinLbl}</strong>`
         + (undertoneLbl ? `, sous-ton ${undertoneLbl}` : '')
         + (visualObs ? ` — ${visualObs} a été repérée` : '') + '.';
    } else if (skinLbl) {
      l1 = `D'après tes réponses, ta peau est <strong>${skinLbl}</strong>.`;
    } else {
      l1 = `Voici ton profil beauté personnalisé.`;
    }

    // Ligne 2 — réponses au questionnaire
    const CONCERN_LBL = {
      acne:'imperfections', taches:'taches', rides:'rides', cernes:'cernes',
      pores:'pores', eclat:'éclat', secheresse:'sécheresse', rougeurs:'rougeurs',
    };
    const concerns = (a.complexes || []).map(c => CONCERN_LBL[c]).filter(Boolean);
    const l2 = concerns.length
      ? `Couplée à tes priorités (${concerns.slice(0, 2).join(', ')}), voici ta routine pensée sur-mesure.`
      : `Voici ta routine pensée pour ton profil unique.`;

    return `${l1}<br>${l2}`;
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
        <span class="results-ready-tag">✦ Ta routine personnalisée est prête</span>
        <span class="section-tag">Diagnostic personnalisé</span>
        <h1>${routine.ruleName || 'Ta Routine'}</h1>
        <p class="results-diagnosis-summary">${_buildDiagnosisSummary()}</p>
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

      <!-- Bannière sauvegarde — juste après la routine -->
      ${renderSaveBanner()}

      <!-- ✦ SKIN JOURNEY — skincare uniquement -->
      ${AppState.routineChoice !== 'makeup' ? renderSkinJourneyTeaser() : ''}

      <!-- Blocs conversion — après la routine, au pic d'engagement -->
      ${renderConversionBlocks(isLocked)}

      <!-- Produits recommandés -->
      ${renderProductsCTA()}

      ${renderDebugLog(routine.log)}
    `;
  }

  function renderSaveBanner() {
    const isGuest = AppState?.user?.isGuest !== false;

    // Invitée non connectée → créer un compte (et garder la routine)
    if (isGuest) {
      return `
        <div class="save-banner">
          <span class="save-banner-icon">✦</span>
          <div class="save-banner-text">
            <strong>Garde ta routine</strong>
            <span>Crée un compte pour la retrouver à chaque connexion, sur tous tes appareils.</span>
          </div>
          <button class="btn btn-outline save-banner-btn" onclick="openAuthModal()">Créer mon compte →</button>
        </div>`;
    }

    // Connectée (tout plan) → bouton "Enregistrer ma routine" PERMANENT
    return `
      <div class="save-banner save-banner--save" id="saveRoutineBanner">
        <span class="save-banner-icon">💾</span>
        <div class="save-banner-text">
          <strong>Enregistrer cette routine ?</strong>
          <span>Retrouve-la automatiquement à chaque connexion, sur tous tes appareils.</span>
        </div>
        <button class="btn-orange-cta save-banner-btn" onclick="RoutineRenderer.saveRoutineNow()">
          Enregistrer ma routine ✦
        </button>
      </div>`;
  }

  // Sauvegarde explicite (abonnées) + confirmation
  function saveRoutineNow() {
    if (typeof RoutineSaver !== 'undefined') RoutineSaver.save();
    const banner = document.getElementById('saveRoutineBanner');
    if (banner) {
      banner.classList.add('save-banner--done');
      banner.innerHTML = `
        <span class="save-banner-icon">✓</span>
        <div class="save-banner-text">
          <strong>Routine enregistrée ✦</strong>
          <span>Tu la retrouveras automatiquement à chaque connexion.</span>
        </div>`;
    }
    if (typeof showToast === 'function') showToast('Routine enregistrée ✦', 'success', 2500);
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

      const tip = applyTip || stepNote || '';
      const spfExtras = step.step === 'spf' ? _renderSpfExtras() : '';
      blocks.push(`
        <div class="cg-step">
          <div class="cg-step-meta">
            <span class="cg-step-num">${String(stepIndex).padStart(2, '0')}</span>
            <div class="cg-step-info">
              <h2 class="cg-step-title">${step.step === 'serum' ? 'Sérum' : step.label}</h2>
              ${tip ? `<p class="cg-step-tip">${tip}</p>` : ''}
            </div>
          </div>
          ${product ? `<div class="cg-step-card">${_renderPremiumProductCard(product)}</div>` : ''}
          ${product ? _renderWhyProduct(step, product) : ''}
          ${spfExtras}
        </div>`);
    }

    // Calcul total section
    const total = products.reduce((s, p) => s + (p.price || 0), 0);
    const totalHtml = total > 0 ? `
      <div class="cg-total">
        <span class="cg-total-label">Total routine (${stepIndex} produit${stepIndex > 1 ? 's' : ''})</span>
        <strong class="cg-total-amount">${total.toFixed(2)} €</strong>
      </div>` : '';

    return `
      <div class="routine-section">
        <div class="routine-section-header">
          <span class="routine-emoji">${emoji}</span>
          <h2>${title}</h2>
        </div>
        <div class="cg-steps">${blocks.join('')}</div>
        ${totalHtml}
      </div>`;
  }

  // ─── Carte produit premium (même rendu que la routine make-up) ──
  function _renderPremiumProductCard(product) {
    if (!product) return '';
    const { id, name, brand, imageUrl, amazonUrl, shopUrl, price, description, rating } = product;
    const url = amazonUrl || shopUrl || '#';
    const isAffiliate = !!amazonUrl;
    const compareUrl = `https://www.google.com/search?q=${encodeURIComponent((brand || '') + ' ' + (name || ''))}&tbm=shop`;
    return `
      <article class="premium-card" data-product-id="${id}">
        <a href="${url}" target="_blank" rel="noopener nofollow${isAffiliate ? ' sponsored' : ''}" class="premium-card-link"
           ${isAffiliate ? `onclick="trackAmazonClick('${id}')"` : ''}>
          <div class="premium-card-image-wrap">
            <div class="premium-card-glow"></div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${name}" class="premium-card-image" loading="lazy" onerror="this.onerror=null;this.style.display='none'">` : ''}
          </div>
          <div class="premium-card-content">
            <span class="premium-card-brand">${brand || ''}</span>
            <h3 class="premium-card-name">${name || ''}</h3>
            ${description ? `<p class="premium-card-desc">${description}</p>` : ''}
            ${rating ? `<div class="premium-card-rating">★ ${rating}</div>` : ''}
            <div class="premium-card-price-row">
              <span class="premium-card-price">${price != null ? price.toFixed(2) + ' €' : '—'}</span>
            </div>
            <p class="pc-value">✨ Glow Up compare les prix pour toi</p>
          </div>
        </a>
        ${_renderCardCtas(url, compareUrl, isAffiliate, id)}
      </article>`;
  }

  // ─── CTA partagés : Comparer (principal) + Acheter (secondaire) ─
  function _renderCardCtas(buyUrl, compareUrl, isAffiliate, id) {
    return `
      <div class="premium-card-ctas">
        <a class="pc-cta pc-cta--compare" href="${compareUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
          💰 Comparer les prix et économiser
        </a>
        <a class="pc-cta pc-cta--buy" href="${buyUrl}" target="_blank" rel="noopener nofollow${isAffiliate ? ' sponsored' : ''}"
           ${isAffiliate ? `onclick="event.stopPropagation(); trackAmazonClick('${id}')"` : 'onclick="event.stopPropagation()"'}>
          Acheter maintenant →
        </a>
      </div>`;
  }

  // ─── « Pourquoi ce produit ? » — explication personnalisée ────
  // Basée sur le diagnostic peau, les réponses, l'objectif, le budget,
  // les préférences et les ingrédients à éviter. Dispo aussi en gratuit.
  const _STEP_NOUN = {
    cleanser: 'ce nettoyant', toner: 'ce soin', serum: 'ce sérum', treatment: 'ce soin ciblé',
    eye: 'ce contour des yeux', eyepatch: 'ces patchs', moisturizer: 'cette crème',
    oil: 'cette huile', exfoliant: 'cet exfoliant', spf: 'ce SPF', lipbalm: 'ce baume'
  };
  const _AVOID_LABEL = { alcool: 'sans alcool', parfum: 'sans parfum', silicones: 'sans silicones', parabens: 'sans parabènes' };

  function _reasonProfile() {
    const a  = AppState.questionnaire?.answers || {};
    const sa = AppState.face?.skinAnalysis || null;
    return {
      skinType:   sa?.skinType?.type || a.skinType || null,
      complexes:  Array.isArray(a.complexes) ? a.complexes : [],
      objectives: a.objectives || null,
      budget:     _normBudget(),
      avoid:      Array.isArray(a.avoidIngredients) ? a.avoidIngredients : [],
      korean:     a.skincareStyle === 'korean',
      sensitive:  (sa?.skinType?.type === 'sensible') || a.skinType === 'sensible'
                    || (Array.isArray(a.complexes) && a.complexes.includes('rougeurs'))
                    || (typeof a.sensitivity === 'number' && a.sensitivity >= 6),
    };
  }

  function buildProductReason(step, product) {
    const u = _reasonProfile();
    const noun = _STEP_NOUN[step.step] || 'ce produit';
    const SKIN = { normale: 'normale', grasse: 'grasse', seche: 'sèche', mixte: 'mixte', sensible: 'sensible' };

    // SPF : réutiliser la raison personnalisée déjà calculée (description)
    let why;
    if (step.step === 'spf' && product.description) {
      why = product.description;
    } else {
      const c = u.complexes;
      if (u.sensitive)                                    why = `Nous avons choisi ${noun} car il est adapté à ta peau sensible et aide à limiter les rougeurs.`;
      else if (u.skinType === 'seche' || c.includes('secheresse')) why = `Nous avons choisi ${noun} car ta peau a tendance à la sécheresse et a besoin de confort et d'hydratation.`;
      else if (c.includes('acne') || c.includes('pores') || u.skinType === 'grasse') why = `Nous avons choisi ${noun} car il purifie et régule la zone T sans agresser ta peau.`;
      else if (c.includes('taches') || u.objectives === 'uniformisation') why = `Nous avons choisi ${noun} pour aider à unifier ton teint et estomper les taches.`;
      else if (c.includes('eclat') || u.objectives === 'eclat')       why = `Nous avons choisi ${noun} car ta peau manque un peu d'éclat — il ravive la luminosité.`;
      else if (c.includes('rides') || u.objectives === 'anti-age')    why = `Nous avons choisi ${noun} pour repulper la peau et prévenir les signes de l'âge.`;
      else if (u.objectives === 'hydratation')             why = `Nous avons choisi ${noun} pour une hydratation optimale, adaptée à tes besoins.`;
      else                                                 why = `Nous avons choisi ${noun} car il correspond à ton type de peau ${SKIN[u.skinType] || 'et à ton profil'}.`;
    }

    // « Pourquoi celui-ci plutôt qu'un autre ? »
    let vs;
    const avoidHit = u.avoid.find(x => _AVOID_LABEL[x]);
    if (avoidHit && (step.step !== 'spf'))            vs = `${_AVOID_LABEL[avoidHit].charAt(0).toUpperCase() + _AVOID_LABEL[avoidHit].slice(1)}, comme tu le souhaites.`;
    else if (u.sensitive)                             vs = `Plus doux et mieux toléré que les autres options pour ta peau sensible.`;
    else if (u.budget === 'low')                      vs = `Meilleur rapport qualité/prix parmi les options adaptées.`;
    else if (u.korean && product.isKorean)            vs = `Dans l'esprit K-Beauty que tu préfères.`;
    else if (u.objectives)                            vs = `Le plus cohérent avec ton objectif ${({'anti-age':'anti-âge','eclat':'éclat','hydratation':'hydratation','purification':'purification','uniformisation':'teint unifié','apaisement':'apaisement'})[u.objectives] || u.objectives}.`;
    else                                              vs = `Sélectionné parmi plusieurs options après comparaison, pour ta peau ${SKIN[u.skinType] || ''}.`.trim();

    return { why, vs };
  }

  function _renderWhyProduct(step, product) {
    if (!product) return '';
    const { why, vs } = buildProductReason(step, product);
    return `
      <div class="why-product">
        <div class="why-product-head"><span class="why-product-i">💡</span> Pourquoi ce produit ?</div>
        <p class="why-product-text">${why}</p>
        ${vs ? `<p class="why-product-vs"><strong>Pourquoi celui-ci plutôt qu'un autre&nbsp;?</strong> ${vs}</p>` : ''}
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
              <h3 class="locked-title">Débloque ta routine complète avec Glow Up</h3>
              <ul class="locked-benefits">
                <li>✨ Une routine pensée pour TOI</li>
                <li>✨ Des produits adaptés à TON budget</li>
                <li>✨ Les meilleurs prix du marché</li>
                <li>✨ Un coach beauté qui te connaît déjà</li>
                <li>✨ Le suivi de l'évolution de ta peau</li>
              </ul>
              <div class="locked-price">
                <span class="locked-price-main">39,99 €</span>
                <span class="locked-price-per">/ an</span>
                <span class="locked-price-sub">soit 3,33 € / mois · ou 4,99 €/mois</span>
              </div>
              <button class="btn-orange-cta locked-unlock-btn" onclick="Subscription.showPaywall('routine_second')">
                Débloquer Premium ✦
              </button>
              <p class="locked-note">Paiement annuel · Annulable à tout moment</p>
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
        <div class="cb-badge">✨ Glow Up Premium</div>
        <h3 class="cb-title">Débloque tout le potentiel de Glow Up ✨</h3>
        <p class="cb-lead">Votre peau évolue. Glow Up aussi. Débloquez le suivi photo, l'évolution de votre peau, les produits alternatifs, le comparateur de prix, votre historique beauté et bien plus encore.</p>
        <ul class="cb-list cb-list--2col">
          <li>✓ Skin Journey sur 30 jours</li>
          <li>✓ Photos J1 / J5 / J15 / J30</li>
          <li>✓ Jusqu'à 3 routines / mois</li>
          <li>✓ Skincare + Make-up</li>
          <li>✓ Produits alternatifs</li>
          <li>✓ Alternatives SPF</li>
          <li>✓ Comparateur de prix</li>
          <li>✓ Historique beauté</li>
          <li>✓ Profil beauté enregistré</li>
          <li>✓ Diagnostic IA conservé</li>
          <li>✓ Colorimétrie sauvegardée</li>
          <li>✓ Conseils avancés + gestes d'application</li>
        </ul>
        <div class="cb-price">
          <span class="cb-price-main">39,99 €</span>
          <span class="cb-price-period">/ an</span>
        </div>
        <p class="cb-price-sub">soit 3,33 € / mois · ou 4,99 €/mois</p>
        <button class="btn-orange-cta" onclick="Subscription.openCheckout('premium_yearly')">
          Débloquer Glow Up Premium
        </button>
        <button class="btn-ghost cb-see-all" onclick="showScreen('premium')">
          Voir tous les avantages →
        </button>
        <p class="cb-note">Formule annuelle la plus avantageuse · Sans engagement · Annulable à tout moment</p>
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

        <div class="cb-ambassador">
          <div class="cb-ambassador-head">✨ Deviens Ambassadrice Glow Up</div>
          <p class="cb-ambassador-text">Partage Glow Up avec tes amies et débloque des récompenses beauté exclusives.</p>
          <div class="cb-ambassador-reward">
            <span class="cb-ambassador-gift">🎁</span>
            <div>
              <strong>2 € de Crédit Beauté par filleul validé</strong>
              <span>quand tes amies s'abonnent grâce à ton lien · réservé aux membres Coach</span>
            </div>
          </div>
        </div>

        <div class="cb-price">
          <span class="cb-price-main">149,99 €</span>
          <span class="cb-price-period">/ an</span>
        </div>
        <p class="cb-price-sub">soit 12,50 € par mois · ou 15,99 €/mois</p>
        <button class="btn-orange-cta btn-orange-cta--coach" onclick="Subscription.showPaywall('coach')">
          Accéder à Glow Up Coach
        </button>
        <p class="cb-note">Annulable à tout moment</p>
      </div>`;
  }

  // ─── Étape 4 : Tableau comparatif ────────────────────────────
  function renderComparisonTable(plan) {
    const rows = [
      ['Prix',                                     '39,99 €/an<br><small>ou 4,99 €/mois</small>', '149,99 €/an<br><small>ou 15,99 €/mois</small>'],
      ['Routine skincare personnalisée',            '✅', '✅'],
      ['Routine make-up personnalisée',             '✅', '✅'],
      ['Skin Journey',                              '✅', '✅'],
      ['Recommandations produits personnalisées',   '✅', '✅'],
      ['Conseils avancés beauté',                   '❌', '✅'],
      ['Accompagnement beauté intelligent',         '❌', '✅'],
      ['Suivi prioritaire de tes objectifs',        '❌', '✅'],
      ['✨ Programme Ambassadrice Glow Up',          '❌', '✅'],
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
                <th class="${plan === 'glow' ? 'cb-th--active' : ''}">Glow Up Premium</th>
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
        <p class="cb-table-note">✨ <strong>Glow Up Premium</strong> : l'essentiel pour trouver tes routines idéales grâce à l'IA.</p>
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

  // ─── Skin Journey teaser (abonnés : actif / non-abonnés : découverte) ──
  function renderSkinJourneyTeaser() {
    const plan         = typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
    const isSubscriber = plan === 'glow' || plan === 'glowplus';
    const journeyActive = isSubscriber && typeof SkinJourney !== 'undefined' && SkinJourney.isActive();
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
            <span class="journey-free-pill">${isSubscriber ? '✦ Inclus dans ton abonnement' : '✨ Fonctionnalité Glow'}</span>
          </div>
          <h2 class="journey-teaser-title">SKIN JOURNEY</h2>
          <p class="journey-teaser-sub">Suis la transformation de ta peau dans le temps</p>

          ${isSubscriber ? `
          <div class="journey-teaser-day">
            <span class="journey-teaser-day-num">Jour ${currentDay}</span>
            <span class="journey-teaser-day-total">/ 30</span>
          </div>
          <div class="journey-teaser-bar-track">
            <div class="journey-teaser-bar-fill" style="width:${progress}%"></div>
          </div>
          <p class="journey-teaser-progress-label">${journeyActive ? `${progress}% du programme complété` : 'Programme non démarré'}</p>
          <button class="btn btn-dark journey-teaser-btn" onclick="goToSkinJourney()">
            ${journeyActive ? '▶ Reprendre mon suivi' : 'Commencer mon suivi ✦'}
          </button>` : `
          <p class="journey-teaser-desc-free">Historique de vos analyses · Évolution de vos indicateurs peau · Comparaison avant/après</p>
          <button class="btn-orange-cta journey-teaser-btn" onclick="Subscription.showSkinJourneyDetail()">
            Découvrir Skin Journey →
          </button>`}
          <p class="journey-teaser-note">${isSubscriber ? 'Inclus dans Glow Up Premium' : 'Inclus dans Glow Up Premium · dès 3,33 €/mois'}</p>
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

  function renderConversionBlocksMakeup(isLocked) {
    // Même blocs mais routineChoice = 'makeup' (montre le teaser skincare)
    const saved = AppState.routineChoice;
    AppState.routineChoice = 'makeup';
    const html = renderConversionBlocks(isLocked);
    AppState.routineChoice = saved;
    return html;
  }

  return { renderResults, renderConversionBlocksMakeup, saveRoutineNow };

})();
