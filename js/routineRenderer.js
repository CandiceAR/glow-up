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
    lipbalm:     '💋 Appliquer sur les lèvres matin et soir, et dès que tu en ressens le besoin. Insister sur le contour.'
  };

  // Mapping étape routine → catégorie(s) catalogue (ordre de priorité)
  const STEP_TO_CATEGORIES = {
    cleanser:    ['cleanser'],
    toner:       ['serum', 'cleanser'],
    serum:       ['serum'],
    treatment:   ['serum', 'retinol', 'niacinamide'],
    eye:         ['eye'],
    moisturizer: ['cream'],
    oil:         ['cream'],
    exfoliant:   ['cleanser', 'serum'],
    spf:         ['spf'],
    lipbalm:     ['lipbalm']
  };

  // ─── Trouver le meilleur produit pour une étape ───────────────
  function findBestProductForStep(stepType) {
    const catalog  = AppState.products.catalog || [];
    if (!catalog.length) return null;

    // Skin type : analyse faciale en priorité, sinon questionnaire
    const skinType = AppState.face.skinAnalysis?.skinType?.type
                  || AppState.questionnaire.answers?.skinType
                  || null;

    // Concerns du questionnaire pour affiner (ex: acne → préférer niacinamide)
    const concerns = AppState.questionnaire.answers?.concerns || [];

    const categories = STEP_TO_CATEGORIES[stepType] || [stepType];

    let pool = [];
    for (const cat of categories) {
      const found = catalog.filter(p => p.category === cat);
      if (found.length > 0) { pool = found; break; }
    }
    if (!pool.length) return null;

    // Filtrer par skinTypeTags si disponible
    if (skinType) {
      const filtered = pool.filter(p =>
        !p.skinTypeTags || p.skinTypeTags.length === 0 ||
        p.skinTypeTags.includes(skinType)
      );
      if (filtered.length > 0) pool = filtered;
    }

    // Scorer : isFeatured +3, concernsTags correspondants +2, rating
    pool = pool.map(p => {
      let score = (p.rating || 0) * 10;
      if (p.isFeatured) score += 30;
      if (p.skinTypeTags && skinType && p.skinTypeTags.includes(skinType)) score += 20;
      return { ...p, _score: score };
    });

    pool.sort((a, b) => b._score - a._score);

    // Diversité : choisir aléatoirement parmi le top-3, seed par session
    const topN = pool.slice(0, Math.min(3, pool.length));
    const idx  = Math.floor(_seededRandom(stepType) * topN.length);
    return topN[idx] || null;
  }

  // ─── Mini carte produit inline dans la routine ────────────────
  function renderStepProduct(product) {
    if (!product) return '';
    const stars = '★'.repeat(Math.floor(product.rating || 0)) + (product.rating % 1 >= 0.5 ? '½' : '');
    return `
      <div class="step-product-card" onclick="event.stopPropagation(); ProductCatalog.openProductModal('${product.id}')">
        <img class="step-product-img"
             src="${product.imageUrl || 'assets/images/placeholder.jpg'}"
             alt="${product.name}"
             onerror="this.src='assets/images/placeholder.jpg'">
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
      </div>`;
  }

  // ─── Rendu principal ──────────────────────────────────────────
  function renderResults() {
    _refreshSeed(); // nouveau tirage produit à chaque génération
    const container = document.getElementById('resultsContent');
    if (!container) return;

    const { routine } = AppState;
    if (!routine.ruleApplied) {
      container.innerHTML = '<p class="empty-state">Complète le questionnaire pour voir ta routine.</p>';
      return;
    }

    const isLocked = AppState.premium.isLocked;

    container.innerHTML = `
      <div class="results-header">
        <span class="section-tag">Diagnostic personnalisé</span>
        <h1>${routine.ruleName || 'Ta Routine'}</h1>
        <p>Basée sur tes réponses et ton analyse de peau — routine adaptée à ton profil unique.</p>
      </div>

      ${renderWarnings(routine.warnings)}

      <!-- ✅ GRATUIT : Routine du matin complète -->
      <div class="free-section-label">
        <span class="free-badge">✦ Inclus gratuitement</span>
      </div>
      ${renderRoutineSection('Routine du matin', routine.matin, '🌅')}

      <!-- 🔒 PREMIUM : Routine du soir -->
      ${isLocked
        ? renderLockedSection('Routine du soir', routine.soir, '🌙')
        : renderRoutineSection('Routine du soir', routine.soir, '🌙')}

      <!-- CTA vers Make-up -->
      ${renderMakeupBridge()}

      <!-- ✦ SKIN JOURNEY — 100% gratuit, toujours visible -->
      ${renderSkinJourneyTeaser()}

      <!-- CTA paywall ou produits -->
      ${isLocked ? renderPaywallCTA() : renderProductsCTA()}

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
  function renderRoutineSection(title, steps, emoji) {
    if (!steps || steps.length === 0) return '';

    const stepsHtml = steps
      .sort((a, b) => a.order - b.order)
      .map((step, i) => {
        const product  = findBestProductForStep(step.step);
        const applyTip = STEP_APPLY_TIPS[step.step] || '';
        return `
          <div class="routine-step-block">
            <div class="routine-step">
              <div class="step-number">${i + 1}</div>
              <div class="step-icon">${STEP_ICONS[step.step] || STEP_ICONS.default}</div>
              <div class="step-info">
                <div class="step-label">${step.label}</div>
                ${step.note ? `<div class="step-note">${step.note}</div>` : ''}
              </div>
              <div class="step-type">${formatStepType(step.step)}</div>
            </div>
            ${renderStepProduct(product)}
            ${applyTip ? `
            <details class="step-tip-details">
              <summary class="step-tip-toggle">💡 Comment appliquer</summary>
              <div class="step-apply-tip">${applyTip}</div>
            </details>` : ''}
          </div>`;
      }).join('');

    return `
      <div class="routine-section">
        <div class="routine-section-header">
          <span class="routine-emoji">${emoji}</span>
          <h2>${title}</h2>
        </div>
        <div class="routine-steps">${stepsHtml}</div>
      </div>`;
  }

  // ─── Section verrouillée (soir) ───────────────────────────────
  function renderLockedSection(title, steps, emoji) {
    // Même si steps est vide, on affiche un preview générique
    const preview = (steps && steps.length > 0)
      ? steps.sort((a, b) => a.order - b.order).slice(0, 2)
      : [
          { step: 'cleanser',    label: 'Double nettoyage',          note: 'Huile + nettoyant doux' },
          { step: 'treatment',   label: 'Actif ciblé de nuit',       note: 'Rétinol ou AHA selon ton profil' }
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
        <p class="paywall-inline-note">7 jours gratuits · Annulable à tout moment</p>
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

  // ─── Avertissements ───────────────────────────────────────────
  function renderWarnings(warnings) {
    if (!warnings || warnings.length === 0) return '';
    return `
      <div class="routine-warnings">
        <h3>⚠️ Points importants</h3>
        <ul>
          ${warnings.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>`;
  }

  // ─── Pont discret vers Make-up (depuis les résultats Skincare) ─
  function renderMakeupBridge() {
    const isLocked = AppState.premium.isLocked;
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
      moisturizer: 'Hydratant',
      oil:         'Huile',
      exfoliant:   'Exfoliant',
      spf:         'Protection solaire'
    };
    return labels[step] || step;
  }

  return { renderResults };

})();
