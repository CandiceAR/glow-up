/* ============================================================
   makeupRoutine.js — Routine Make-up
   UTILISE UNIQUEMENT LES PRODUITS DU CATALOGUE
   Aucun produit inventé - 100% cohérence image/texte/lien
   ============================================================ */

'use strict';

const MakeupRoutine = (() => {

  // ══════════════════════════════════════════════════════════════
  // CATALOGUE — Chargé depuis products-manual.json
  // ══════════════════════════════════════════════════════════════

  let catalogue = [];
  let isLoaded = false;

  async function loadCatalogue() {
    if (isLoaded) return catalogue;
    try {
      let allProducts = null;
      // 1. Firestore (source de vérité)
      if (typeof FirestoreProducts !== 'undefined') {
        allProducts = await FirestoreProducts.loadAll();
      }
      // 2. Fallback JSON statique
      if (!allProducts) {
        const res = await fetch('data/products-manual.json');
        const data = await res.json();
        allProducts = data.products || [];
      }
      // Garder UNIQUEMENT les produits maquillage — jamais de soin
      const SKINCARE_CATS = new Set([
        'cleanser', 'serum', 'eye', 'cream', 'spf', 'nightmask', 'demaquillant', 'lipbalm'
      ]);
      catalogue = allProducts.filter(p =>
        p.active !== false && !SKINCARE_CATS.has(p.category)
      );
      isLoaded = true;
      console.log('[MakeupRoutine] Catalogue chargé:', catalogue.length, 'produits maquillage');
    } catch (e) {
      console.error('[MakeupRoutine] Erreur chargement catalogue:', e);
      catalogue = [];
    }
    return catalogue;
  }

  // ══════════════════════════════════════════════════════════════
  // FILTRES PAR CATÉGORIE
  // ══════════════════════════════════════════════════════════════

  function getByCategory(cat) {
    return catalogue.filter(p => p.category === cat);
  }

  function getByCategories(cats) {
    return catalogue.filter(p => cats.includes(p.category));
  }

  function getById(id) {
    return catalogue.find(p => p.id === id);
  }

  // Mélange aléatoire d'un tableau (Fisher-Yates)
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Sélectionne N produits aléatoires parmi une liste
  function pickRandom(products, count = 2) {
    if (!products || !products.length) return [];
    return shuffle(products.filter(Boolean)).slice(0, count);
  }

  // ─── Filtre par budget ────────────────────────────────────────
  const BUDGET_MAX = { low: 20, medium: 50, high: 100, premium: Infinity };

  function filterByBudget(products, budget) {
    if (!budget || !products?.length) return products;
    const max = BUDGET_MAX[budget] ?? Infinity;
    if (max === Infinity) return products;
    const filtered = products.filter(p => !p.price || p.price <= max);
    return filtered.length >= 1 ? filtered : products; // fallback si trop restrictif
  }

  // ─── Conseil personnalisé pour zone évitée ───────────────────
  function getAvoidTip(zone, profile) {
    const { undertone, faceShape, eyeShape, carnation } = profile;

    const carLabel  = carnation === 'light' ? 'claire' : carnation === 'dark' ? 'foncée' : 'medium';
    const toneWarm  = 'dorés et terracotta';
    const toneCool  = 'mauves et gris fumé';
    const toneNutr  = 'nude et taupe';
    const toneLabel = undertone === 'warm' ? toneWarm : undertone === 'cool' ? toneCool : toneNutr;

    if (zone === 'yeux') {
      const eyeGoal = eyeShape === 'round' ? 'allonger et intensifier'
                    : eyeShape === 'narrow' ? 'ouvrir et agrandir'
                    : 'sublimer le galbe naturel';
      return `Même 30 secondes suffisent. Un trait de crayon nude en waterline et un mascara volumisant permettent d'${eyeGoal} sans effort. Les teintes ${toneLabel} sont naturelles et sans risque d'erreur.`;
    }
    if (zone === 'levres') {
      const shades = undertone === 'warm' ? 'pêche, corail ou nude caramel'
                   : undertone === 'cool' ? 'rose poudré, mauve ou berry'
                   : 'nude rosé ou brun doux';
      return `Un gloss ou baume teinté en ${shades} redonnes de l'éclat en 5 secondes — sans trait précis, sans contrainte. L'effet naturel est tout aussi élégant.`;
    }
    if (zone === 'teint') {
      return `Une BB crème fluide appliquée au doigt en 30 secondes unifie le teint sans effet masque. Avec ta carnation ${carLabel}, les textures légères donnent le rendu le plus naturel.`;
    }
    if (zone === 'joues') {
      const placement = faceShape === 'round'  ? 'en diagonale vers les tempes pour affiner'
                      : faceShape === 'square' ? 'sur les pommettes pour adoucir la mâchoire'
                      : 'sur les pommettes en sweep léger';
      return `Un voile de blush crème posé ${placement} apporte de la vie au teint en 5 secondes — sans pinceau, juste au doigt.`;
    }
    return '';
  }

  // ══════════════════════════════════════════════════════════════
  // SÉLECTION INTELLIGENTE DES PRODUITS
  // Basée sur le profil peau — retourne des produits du catalogue
  // ══════════════════════════════════════════════════════════════

  function selectFoundation(profile) {
    const foundations = getByCategory('foundation');
    if (!foundations.length) return null;

    const { skinType, undertone } = profile;
    let candidates = [];

    // Sélection basée sur le type de peau
    if (skinType === 'grasse' || skinType === 'mixte') {
      // Mats : Dermacol, Wet n Wild, NYX, Clinique
      candidates = ['m022', 'm016', 'm019', 'm015', 'm020'].map(getById).filter(Boolean);
    } else if (skinType === 'seche') {
      // Hydratants : By Terry, Charlotte Tilbury, Clinique, IT Cosmetics
      candidates = ['m017', 'm021', 'm015', 'm026', 'm027', 'm030'].map(getById).filter(Boolean);
    } else if (skinType === 'sensible') {
      // CC crèmes douces : IT Cosmetics (toutes teintes)
      candidates = ['m026', 'm027', 'm028', 'm029', 'm030'].map(getById).filter(Boolean);
    } else {
      // Peau normale - tous les fonds de teint
      candidates = foundations;
    }

    // Filtrer par sous-ton si possible
    if (undertone === 'warm') {
      const warm = candidates.filter(p =>
        p.name.toLowerCase().includes('warm') ||
        p.name.toLowerCase().includes('medium') ||
        p.id === 'm026' || p.id === 'm027'
      );
      if (warm.length >= 2) candidates = warm;
    } else if (undertone === 'cool') {
      const cool = candidates.filter(p =>
        p.name.toLowerCase().includes('neutral') ||
        p.name.toLowerCase().includes('fair') ||
        p.id === 'm028' || p.id === 'm029' || p.id === 'm030'
      );
      if (cool.length >= 2) candidates = cool;
    }

    return pickRandom(filterByBudget(candidates, profile.budget), 2);
  }

  function selectConcealer(profile) {
    const concealers = getByCategory('concealer');
    if (!concealers.length) return null;

    const { undertone, skinType } = profile;
    let selected = [];

    // Best-sellers universels
    const clinique = getById('m038'); // Clinique Anti-Cernes
    const maybelline = getById('m047'); // Maybelline Instant Anti-Age

    if (undertone === 'warm') {
      selected = [clinique, getById('m040'), maybelline].filter(Boolean); // Light Beige pour peaux chaudes
    } else if (undertone === 'cool') {
      selected = [maybelline, getById('m042'), clinique].filter(Boolean); // NYX Ivoire
    } else {
      selected = [maybelline, clinique, getById('m043')].filter(Boolean); // NYX Natural
    }

    // Peau sensible → privilégier Clinique
    if (skinType === 'sensible') {
      selected = [clinique, ...selected.filter(p => p?.id !== 'm038')];
    }

    return filterByBudget(selected, profile.budget).slice(0, 2);
  }

  function selectMascara(profile) {
    const mascaras = getByCategory('mascara');
    if (!mascaras.length) return null;

    const { eyeShape } = profile;
    let selected = [];

    // Sélection par forme des yeux
    if (eyeShape === 'round') {
      // Yeux ronds → allonger
      selected = [getById('m054'), getById('m051')].filter(Boolean); // Maybelline Lash Sensational, Clinique
    } else if (eyeShape === 'narrow') {
      // Yeux bridés/étroits → ouvrir le regard
      selected = [getById('m049'), getById('m055')].filter(Boolean); // Charlotte Tilbury Push Up, Maybelline Sky High
    } else {
      // Amande → volume
      selected = [getById('m055'), getById('m054')].filter(Boolean); // Maybelline Sky High, Lash Sensational
    }

    // Toujours proposer le best-seller
    const skyHigh = getById('m055');
    if (skyHigh && !selected.find(p => p?.id === 'm055')) {
      selected.push(skyHigh);
    }

    return selected.slice(0, 2);
  }

  function selectLips(profile) {
    // lipbalm = soin → jamais dans une routine maquillage
    const lips = getByCategories(['lipstick', 'lipgloss', 'lipliner']);
    if (!lips.length) return null;

    const { undertone, lipShape, carnation } = profile;
    let selected = [];

    // Sélection par sous-ton ET carnation
    if (undertone === 'warm') {
      if (carnation === 'dark') {
        // Peau foncée + sous-ton chaud → terracotta, brun cuivré, bordeaux chaud
        selected = [
          getById('m078'), // Summer Fridays Brown Sugar
          getById('m071'), // NYX Butter Gloss Cerise
          getById('m060')  // Clinique Chubby Stick
        ].filter(Boolean);
      } else if (carnation === 'light') {
        // Peau claire + sous-ton chaud → pêche, nude doré, corail léger
        selected = [
          getById('m060'), // Clinique Chubby Stick
          getById('m082'), // Burt's Bees
          getById('m071')  // NYX Butter Gloss
        ].filter(Boolean);
      } else {
        // Medium + chaud → nude pêche, corail
        selected = [
          getById('m060'), // Clinique Chubby Stick
          getById('m071'), // NYX Butter Gloss Cerise
          getById('m078')  // Summer Fridays Brown Sugar
        ].filter(Boolean);
      }
    } else if (undertone === 'cool') {
      if (carnation === 'dark') {
        // Peau foncée + sous-ton froid → prune profond, berry, framboise
        selected = [
          getById('m072'), // Elizabeth Arden
          getById('m064'), // Clinique Pink Honey
          getById('m077')  // Summer Fridays Pink Sugar
        ].filter(Boolean);
      } else if (carnation === 'light') {
        // Peau claire + sous-ton froid → rose pâle, lilas, mauve
        selected = [
          getById('m077'), // Summer Fridays Pink Sugar
          getById('m064'), // Clinique Pink Honey
          getById('m072')  // Elizabeth Arden
        ].filter(Boolean);
      } else {
        // Medium + froid → rose, berry
        selected = [
          getById('m064'), // Clinique Pink Honey
          getById('m077'), // Summer Fridays Pink Sugar
          getById('m072')  // Elizabeth Arden
        ].filter(Boolean);
      }
    } else {
      // Sous-ton neutre → universels adaptés à la carnation
      if (carnation === 'dark') {
        selected = [
          getById('m078'), // Summer Fridays Brown Sugar
          getById('m011'), // Clinique Almost Lipstick
          getById('m072')  // Elizabeth Arden
        ].filter(Boolean);
      } else if (carnation === 'light') {
        selected = [
          getById('m082'), // Burt's Bees
          getById('m011'), // Clinique Almost Lipstick
          getById('m060')  // Clinique Chubby Stick
        ].filter(Boolean);
      } else {
        selected = [
          getById('m011'), // Clinique Almost Lipstick (Black Honey)
          getById('m060'), // Clinique Chubby Stick
          getById('m082')  // Burt's Bees
        ].filter(Boolean);
      }
    }

    // Lèvres fines → produit repulpant en priorité
    if (lipShape === 'thin') {
      const plumping = getById('m068'); // NYX Lip Liner Repulpant
      if (plumping) selected = [plumping, ...selected];
    }

    // Filet de sécurité : exclure tout lipbalm qui aurait pu glisser via getById
    selected = selected.filter(p => p && p.category !== 'lipbalm');
    return filterByBudget(selected, profile.budget).slice(0, 2);
  }

  function selectEyeliner(profile) {
    const eyeliners = getByCategory('eyeliner');
    if (!eyeliners.length) return null;

    const { undertone } = profile;
    let selected;

    if (undertone === 'warm') {
      selected = getById('m033'); // Terre Cuite
    } else if (undertone === 'cool') {
      selected = getById('m031'); // Mauve
    } else {
      selected = getById('m036'); // Éclair de Nuit (noir)
    }

    const result = selected ? [selected] : [eyeliners[0]];
    return filterByBudget(result, profile.budget).slice(0, 1);
  }

  function selectBronzer(profile) {
    const bronzers = getByCategory('bronzer');
    if (!bronzers.length) return null;

    const pool = [getById('m093'), getById('m089')].filter(Boolean);
    return filterByBudget(pool, profile.budget).slice(0, 1);
  }

  function selectBlush(profile) {
    const products = getByCategory('blush');
    if (!products.length) return null;

    const { undertone, budget } = profile;
    let pool = products.filter(p =>
      !p.undertone || p.undertone === 'neutral' || p.undertone === undertone
    );
    if (pool.length < 1) pool = products;
    return pickRandom(filterByBudget(pool, budget), 2);
  }

  function selectHighlighter(profile) {
    const products = getByCategory('highlighter');
    if (!products.length) return null;

    const { undertone, budget } = profile;
    let pool = products.filter(p =>
      !p.undertone || p.undertone === 'neutral' || p.undertone === undertone
    );
    if (pool.length < 1) pool = products;
    return pickRandom(filterByBudget(pool, budget), 1);
  }

  function selectEyeshadow(profile) {
    const products = getByCategory('eyeshadow');
    if (!products.length) return null;

    const { undertone, budget } = profile;
    let pool = products.filter(p =>
      !p.undertone || p.undertone === 'neutral' || p.undertone === undertone
    );
    if (pool.length < 1) pool = products;
    return pickRandom(filterByBudget(pool, budget), 2);
  }

  function selectPowder(profile) {
    const products = getByCategory('powder');
    if (!products.length) return null;
    return pickRandom(filterByBudget(products, profile.budget), 1);
  }

  // ══════════════════════════════════════════════════════════════
  // TIPS CONTEXTUELS
  // ══════════════════════════════════════════════════════════════

  function getTip(category, profile) {
    const tips = {
      foundation: {
        grasse: 'Applique par petites touches. Fixe avec une poudre légère.',
        mixte: 'Concentre le produit sur la zone T.',
        seche: 'Hydrate bien avant. Applique du centre vers l\'extérieur.',
        sensible: 'Teste d\'abord sur le cou. Évite de frotter.',
        normale: 'Estompe au pinceau ou éponge humide.'
      },
      concealer: 'Tapote doucement sous les yeux en triangle inversé.',
      mascara: 'Zigzague la brosse de la racine vers les pointes.',
      lips: 'Applique au doigt pour un effet naturel, ou au pinceau pour plus de précision.',
      eyeliner: 'Trace près des cils. Estompe pour un effet smoky.',
      bronzer: 'Applique en 3 : tempes, pommettes, mâchoire.',
      blush: 'Souris légèrement et applique sur les rondeurs des joues vers les tempes.',
      highlighter: 'Dépose sur le haut des pommettes, la pointe du nez et l\'arc de Cupidon.',
      eyeshadow: 'Commence par la paupière mobile, estompe vers l\'arcade sourcilière.',
      powder: 'Applique en tapotant sur la zone T pour fixer et matifier.'
    };

    if (category === 'foundation') {
      return tips.foundation[profile.skinType] || tips.foundation.normale;
    }
    return tips[category] || '';
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU CARTE PRODUIT
  // ══════════════════════════════════════════════════════════════

  function renderCard(product, index) {
    if (!product) return '';

    const { id, name, brand, imageUrl, amazonUrl, price, description, rating } = product;

    return `
      <article class="premium-card" style="animation-delay:${index * 0.08}s" data-product-id="${id}">
        <a href="${amazonUrl}" target="_blank" rel="noopener nofollow sponsored" class="premium-card-link">

          <div class="premium-card-image-wrap">
            <div class="premium-card-glow"></div>
            <img src="${imageUrl}" alt="${name}" class="premium-card-image" loading="lazy"
                 onerror="this.src='assets/placeholder.jpg'">
          </div>

          <div class="premium-card-content">
            <span class="premium-card-brand">${brand}</span>
            <h3 class="premium-card-name">${name}</h3>

            <p class="premium-card-desc">${description}</p>

            ${rating ? `<div class="premium-card-rating">★ ${rating}</div>` : ''}

            <div class="premium-card-footer">
              <span class="premium-card-price">${price.toFixed(2)} €</span>
              <span class="premium-card-cta">Acheter →</span>
            </div>
          </div>

        </a>
      </article>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU SECTION
  // ══════════════════════════════════════════════════════════════

  function renderSection(title, icon, tip, products) {
    if (!products || !products.length) return '';

    const cardsHtml = products.map((p, i) => renderCard(p, i)).join('');

    return `
      <section class="premium-section">
        <div class="premium-section-header">
          <span class="premium-section-icon">${icon}</span>
          <div>
            <h2 class="premium-section-title">${title}</h2>
            ${tip ? `<p class="premium-section-subtitle">${tip}</p>` : ''}
          </div>
        </div>
        <div class="premium-cards-grid">
          ${cardsHtml}
        </div>
      </section>`;
  }

  // ══════════════════════════════════════════════════════════════
  // PROFIL SIMPLIFIÉ
  // ══════════════════════════════════════════════════════════════

  function renderProfile(profile) {
    const labels = {
      faceShape:  { oval: 'Ovale', round: 'Rond', square: 'Carré', heart: 'Cœur', long: 'Allongé' },
      undertone:  { warm: 'Chaud', cool: 'Froid', neutral: 'Neutre' },
      skinType:   { grasse: 'Grasse', mixte: 'Mixte', seche: 'Sèche', sensible: 'Sensible', normale: 'Normale' },
      carnation:  { light: 'Claire', medium: 'Medium', dark: 'Foncée' }
    };

    return `
      <div class="premium-profile">
        <div class="premium-profile-item">
          <span class="premium-profile-label">Visage</span>
          <span class="premium-profile-value">${labels.faceShape[profile.faceShape] || 'Ovale'}</span>
        </div>
        <div class="premium-profile-item">
          <span class="premium-profile-label">Sous-ton</span>
          <span class="premium-profile-value">${labels.undertone[profile.undertone] || 'Neutre'}</span>
        </div>
        <div class="premium-profile-item">
          <span class="premium-profile-label">Peau</span>
          <span class="premium-profile-value">${labels.skinType[profile.skinType] || 'Normale'}</span>
        </div>
        <div class="premium-profile-item">
          <span class="premium-profile-label">Carnation</span>
          <span class="premium-profile-value">${labels.carnation[profile.carnation] || 'Medium'}</span>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════

  function render(container, profile) {
    const foundations   = selectFoundation(profile);
    const concealers    = selectConcealer(profile);
    const powders       = selectPowder(profile);
    const blushes       = selectBlush(profile);
    const bronzers      = selectBronzer(profile);
    const highlighters  = selectHighlighter(profile);
    const eyeshadows    = selectEyeshadow(profile);
    const eyeliners     = selectEyeliner(profile);
    const mascaras      = selectMascara(profile);
    const lips          = selectLips(profile);

    const hasProducts = foundations?.length || concealers?.length || mascaras?.length || lips?.length;

    if (!hasProducts) {
      container.innerHTML = `
        <div class="premium-routine">
          <div class="premium-empty">
            <span class="premium-empty-icon">💄</span>
            <p class="premium-empty-text">Aucun produit disponible.</p>
          </div>
        </div>`;
      return;
    }

    // ─── Groupes de sections par zone ──────────────────────────
    const { makeupFocus, makeupAvoid } = profile;

    // Tip enrichi pour la zone évitée (conseil personnalisé bienveillant)
    function tipForZone(zone, cat, defaultTip) {
      if (makeupAvoid && makeupAvoid !== 'aucune' && zoneOf(cat) === makeupAvoid) {
        const avoidTip = getAvoidTip(makeupAvoid, profile);
        return avoidTip
          ? `<span class="avoid-zone-badge">💛 On t'aide à apprivoiser cette zone</span> ${avoidTip}`
          : defaultTip;
      }
      return defaultTip;
    }

    function zoneOf(cat) {
      if (['foundation','concealer','powder'].includes(cat)) return 'teint';
      if (['blush','bronzer','highlighter'].includes(cat))   return 'joues';
      if (['eyeshadow','eyeliner','mascara'].includes(cat))  return 'yeux';
      if (['lips','lipstick','lipgloss','lipliner'].includes(cat)) return 'levres';
      return null;
    }

    // Toutes les sections dans l'ordre par défaut
    const allSections = [
      { zone:'teint',   html: renderSection('Teint',             '◇', tipForZone('teint',   'foundation',  getTip('foundation',  profile)), foundations)  },
      { zone:'teint',   html: renderSection('Anti-cernes',       '◉', tipForZone('teint',   'concealer',   getTip('concealer',   profile)), concealers)   },
      { zone:'teint',   html: renderSection('Poudre',            '○', tipForZone('teint',   'powder',      getTip('powder',      profile)), powders)      },
      { zone:'joues',   html: renderSection('Blush & Joues',     '❋', tipForZone('joues',   'blush',       getTip('blush',       profile)), blushes)      },
      { zone:'joues',   html: renderSection('Bronzer',           '☀', tipForZone('joues',   'bronzer',     getTip('bronzer',     profile)), bronzers)     },
      { zone:'joues',   html: renderSection('Enlumineur',        '✦', tipForZone('joues',   'highlighter', getTip('highlighter', profile)), highlighters) },
      { zone:'yeux',    html: renderSection('Fard à paupières',  '◈', tipForZone('yeux',    'eyeshadow',   getTip('eyeshadow',   profile)), eyeshadows)   },
      { zone:'yeux',    html: renderSection('Liner',             '◈', tipForZone('yeux',    'eyeliner',    getTip('eyeliner',    profile)), eyeliners)    },
      { zone:'yeux',    html: renderSection('Mascara',           '○', tipForZone('yeux',    'mascara',     getTip('mascara',     profile)), mascaras)     },
      { zone:'levres',  html: renderSection('Lèvres',            '❋', tipForZone('levres',  'lips',        getTip('lips',        profile)), lips)         }
    ];

    // Zone évitée : mise en avant en premier (avec conseil)
    // Zone préférée : toujours en dernier (comme une signature)
    const avoidZone = (makeupAvoid && makeupAvoid !== 'aucune') ? makeupAvoid : null;
    const focusZone = makeupFocus || null;

    const avoidSections  = avoidZone  ? allSections.filter(s => s.zone === avoidZone)  : [];
    const focusSections  = focusZone  ? allSections.filter(s => s.zone === focusZone)  : [];
    const middleSections = allSections.filter(s =>
      s.zone !== avoidZone && s.zone !== focusZone
    );

    const ordered = [...avoidSections, ...middleSections, ...focusSections];
    const sectionsHtml = ordered.map(s => s.html).join('');

    container.innerHTML = `
      <div class="premium-routine">

        <header class="premium-header">
          <span class="premium-tag">Ta sélection personnalisée</span>
          <h1 class="premium-title">Routine Make-up</h1>
          <p class="premium-subtitle">Produits sélectionnés selon ton profil et ton analyse</p>
        </header>

        ${renderProfile(profile)}

        ${sectionsHtml}

        <footer class="premium-footer">
          <p>Liens affiliés Amazon · Même commission sur tous les produits</p>
        </footer>

      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  async function initScreen() {
    const container = document.getElementById('makeupRoutineContent');
    if (!container) return;

    container.innerHTML = `
      <div class="premium-loading">
        <div class="premium-loading-spinner"></div>
        <p>Chargement...</p>
      </div>`;

    await loadCatalogue();

    if (!catalogue.length) {
      container.innerHTML = `
        <div class="premium-routine">
          <div class="premium-empty">
            <span class="premium-empty-icon">⚠️</span>
            <p class="premium-empty-text">Impossible de charger le catalogue.</p>
          </div>
        </div>`;
      return;
    }

    const analysis      = AppState?.face?.skinAnalysis;
    const questionnaire = AppState?.questionnaire?.answers || {};

    // Carnation : analyse photo en priorité, sinon questionnaire skinTone
    const carnationRaw = analysis?.carnation?.type || questionnaire?.skinTone || 'medium';
    const carnationMap = { light: 'light', clair: 'light', medium: 'medium', fonce: 'dark', dark: 'dark' };
    const carnation    = carnationMap[carnationRaw] || 'medium';

    const profile = {
      // ── Analyse visuelle (priorité) ──
      faceShape:    analysis?.faceShape?.shape  || 'oval',
      skinType:     analysis?.skinType?.type    || questionnaire?.skinType  || 'normale',
      undertone:    analysis?.undertone?.type   || 'neutral',
      eyeShape:     analysis?.eyeShape          || 'almond',
      lipShape:     analysis?.lipShape          || 'medium',
      carnation,
      // ── Questionnaire ──
      budget:       questionnaire?.budget       || null,
      ageGroup:     questionnaire?.ageGroup     || null,
      skinMaturity: questionnaire?.skinMaturity || null,
      makeupFocus:  questionnaire?.makeupFocus  || null,
      makeupAvoid:  questionnaire?.makeupAvoid  || null
    };

    console.log('[MakeupRoutine] Profil:', profile);
    render(container, profile);
  }

  return {
    initScreen,
    loadCatalogue,
    getByCategory,
    getById
  };

})();
