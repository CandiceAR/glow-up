/* ============================================================
   skinpedia.js — Dictionnaire pédagogique des ingrédients actifs
   GLOW UP
   ============================================================ */

'use strict';

const Skinpedia = (() => {

  // ─── Base de données des molécules ───────────────────────────
  const DATA = [

    /* ══ TRÈS BONNES ══════════════════════════════════════════ */
    {
      id: 'retinol',
      name: 'Rétinol',
      tier: 'excellent',
      icon: '⚗️',
      tagline: "L'actif anti-âge n°1",
      aka: ['Rétinol', 'Rétinyl Palmitate', 'Rétinaldéhyde', 'Vitamin A'],
      definition: "Dérivé de la vitamine A, le rétinol est l'un des actifs les mieux documentés de la cosmétologie. Il agit en se convertissant en acide rétinoïque dans la peau.",
      role: "Accélère le renouvellement cellulaire, stimule la production de collagène et inhibe la mélanine responsable des taches brunes.",
      skinImprovement: "Après 4–8 semaines, la peau devient visiblement plus lisse, plus ferme, et le teint plus uniforme. Les ridules superficielles s'atténuent, les pores se resserrent et les imperfections diminuent. À 3 mois, la texture est transformée : plus dense, plus rebondie.",
      benefits: [
        'Lisse les rides et ridules en profondeur',
        'Unifie et éclaire le teint',
        'Réduit les imperfections et points noirs',
        'Stimule le collagène naturel',
        'Améliore la texture globale de la peau'
      ],
      tip: "À utiliser le soir uniquement, jamais avant une exposition solaire. Commencer à 0,025–0,1% et augmenter progressivement. Associer à un SPF chaque matin, sans exception.",
      keywords: ['rétinol', 'retinol', 'rétinyl', 'retinyl', 'rétinoïde', 'retinoid', 'vitamin a', 'vitamine a', 'retinaldehyde', 'rétinaldéhyde']
    },
    {
      id: 'niacinamide',
      name: 'Niacinamide',
      tier: 'excellent',
      icon: '✨',
      tagline: "La vitamine universelle de la peau",
      aka: ['Vitamine B3', 'Nicotinamide', 'Vitamin B3'],
      definition: "Forme de vitamine B3, la niacinamide est un actif polyvalent qui agit simultanément sur de nombreuses problématiques cutanées, du sébum aux taches.",
      role: "Régule la production de sébum, renforce la barrière cutanée, réduit la visibilité des pores et atténue les hyperpigmentations.",
      skinImprovement: "En 2–4 semaines, le brillant diminue et le teint paraît plus uniforme. En 6–8 semaines, les pores semblent visuellement réduits, les taches rouges post-acné s'estompent et la peau tolère mieux le froid, le stress et les changements de température.",
      benefits: [
        'Réduit les pores dilatés et le brillant',
        'Atténue les taches et rougeurs',
        'Renforce la barrière cutanée',
        'Anti-inflammatoire doux',
        'Compatible avec pratiquement tous les actifs'
      ],
      tip: "Très bien toléré. Efficace à 5–10% de concentration. Convient à tous les types de peau, y compris peaux sensibles. Utiliser matin et/ou soir.",
      keywords: ['niacinamide', 'nicotinamide', 'vitamine b3', 'vitamin b3', 'niacin']
    },
    {
      id: 'hyaluronic-acid',
      name: 'Acide Hyaluronique',
      tier: 'excellent',
      icon: '💧',
      tagline: "Le champion de l'hydratation",
      aka: ['Hyaluronate de Sodium', 'Sodium Hyaluronate', 'HA'],
      definition: "Molécule naturellement présente dans la peau, les articulations et les yeux. Elle peut retenir jusqu'à 1 000 fois son propre poids en eau.",
      role: "Attire et retient l'eau dans les couches superficielles et profondes de la peau, la maintenant repulpée, rebondie et confortable.",
      skinImprovement: "Dès la première application, la peau paraît plus douce et plus confortable. En 1–2 semaines, les ridules de déshydratation s'effacent, le teint est plus lisse et lumineux. La peau rebondit mieux sous les doigts — l'effet 'glass skin' coréen commence à se former.",
      benefits: [
        'Hydratation intense et durable',
        'Effet repulpant immédiat',
        'Réduit les rides de déshydratation',
        'Compatible avec tous les types de peau',
        'Non irritant, non comédogène'
      ],
      tip: "Appliquer sur peau légèrement humide pour maximiser l'absorption. Les petites molécules (poids moléculaire faible) pénètrent plus profond ; les grandes agissent en surface.",
      keywords: ['acide hyaluronique', 'hyaluronique', 'hyaluronate', 'sodium hyaluronate', 'hyaluronic', 'hyaluronique']
    },
    {
      id: 'vitamin-c',
      name: 'Vitamine C',
      tier: 'excellent',
      icon: '🍊',
      tagline: "L'antioxydant éclat par excellence",
      aka: ['Acide Ascorbique', 'Ascorbic Acid', 'Ascorbyl', '3-O-Ethyl Ascorbic Acid'],
      definition: "Antioxydant puissant, la vitamine C neutralise les radicaux libres générés par les UV et la pollution avant qu'ils n'endommagent les cellules cutanées.",
      role: "Protège la peau du stress oxydatif, inhibe la mélanogenèse (formation de taches) et stimule la synthèse de collagène.",
      skinImprovement: "Après 3–4 semaines, le teint gagne en luminosité — le 'gris' de fatigue disparaît. En 6–8 semaines, les taches brunes superficielles s'éclaircissent visiblement. À 3 mois, la peau paraît plus ferme et les nouvelles taches sont prévenues activement.",
      benefits: [
        'Teint lumineux et éclatant',
        'Atténue les taches brunes et hyperpigmentations',
        'Protection antioxydante contre la pollution',
        'Anti-âge et effet fermeté',
        'Potentialise l\u2019action du SPF'
      ],
      tip: "Utiliser le matin avant le SPF pour un bouclier antioxydant maximal. Choisir des formules stables (Tétraisopalmitate d'Ascorbyle ou 3-O-Éthyl Ascorbique) qui résistent à l'oxydation.",
      keywords: ['vitamine c', 'vitamin c', 'acide ascorbique', 'ascorbic acid', 'ascorbyl', 'ascorbate', 'tétraisopalmitate', 'tetrahexyldecyl']
    },
    {
      id: 'peptides',
      name: 'Peptides',
      tier: 'excellent',
      icon: '🔬',
      tagline: "Les messagers de la jeunesse",
      aka: ['Matrixyl', 'Argireline', 'Palmitoyl', 'Copper Peptides'],
      definition: "Courtes chaînes d'acides aminés (les briques du collagène) qui agissent comme des messagers chimiques pour la peau.",
      role: "Signalent à la peau de produire plus de collagène et d'élastine, améliorant la fermeté et réduisant visiblement les rides d'expression.",
      skinImprovement: "En 4–6 semaines, la peau retrouve un rebondi perdu avec le temps. En 3 mois d'utilisation régulière, les rides d'expression sont visiblement atténuées et l'ovale du visage semble plus défini. L'effet est progressif mais durable — contrairement aux fillers, le collagène est produit naturellement.",
      benefits: [
        'Stimulent la production naturelle de collagène',
        'Améliorent la fermeté et l\u2019élasticité',
        'Réduisent les rides d\u2019expression',
        'Doux, tolérés par les peaux sensibles',
        'Résultats visibles sur la durée'
      ],
      tip: "Efficaces en sérum ou crème. Ne pas mélanger directement avec des AHA forts (les acides dégradent les peptides). Résultats visibles après 4–8 semaines d'utilisation régulière.",
      keywords: ['peptide', 'peptides', 'matrixyl', 'argireline', 'palmitoyl', 'copper peptide', 'tripeptide', 'hexapeptide']
    },

    /* ══ BONNES ════════════════════════════════════════════════ */
    {
      id: 'salicylic-acid',
      name: 'Acide Salicylique',
      tier: 'good',
      icon: '🧴',
      tagline: "L'exfoliant anti-pores",
      aka: ['BHA', 'Beta Hydroxy Acid', 'Salicylic Acid'],
      definition: "Acide bêta-hydroxy (BHA) liposoluble : contrairement aux AHA, il pénètre à l'intérieur du pore pour désobstruer en profondeur.",
      role: "Exfolie à l'intérieur du pore, dissout les bouchons de sébum responsables des points noirs, comédons et imperfections.",
      skinImprovement: "En 2–3 semaines, les points noirs sont moins visibles et la peau est plus mate. En 4–6 semaines, les pores semblent réduits car ils ne sont plus dilatés par les bouchons de sébum. La texture est plus lisse et les nouvelles imperfections sont moins fréquentes.",
      benefits: [
        'Désobstrue les pores en profondeur',
        'Élimine les points noirs et comédons',
        'Propriétés anti-inflammatoires',
        'Idéal pour peaux grasses et mixtes',
        'Prévient les nouvelles imperfections'
      ],
      tip: "À utiliser 2–3 fois par semaine max. Concentration recommandée : 0,5–2%. Toujours suivre d'un SPF le matin. Peut assécher si utilisé trop souvent.",
      keywords: ['acide salicylique', 'salicylic acid', 'bha', 'beta hydroxy', 'salicylate']
    },
    {
      id: 'aha',
      name: 'AHA',
      tier: 'good',
      icon: '⚡',
      tagline: "Les exfoliants chimiques de surface",
      aka: ['Acide Glycolique', 'Acide Lactique', 'Glycolic Acid', 'Lactic Acid', 'Mandelic Acid'],
      definition: "Acides alpha-hydroxy d'origine naturelle (canne à sucre, lait, fruits) qui exfolient la couche superficielle de la peau en dissolvant les liaisons entre cellules mortes.",
      role: "Accélèrent le renouvellement cellulaire, lissent la texture, réduisent les taches et révèlent un teint plus lumineux.",
      skinImprovement: "Dès les premières utilisations, la peau paraît plus lisse au toucher et le teint plus éclatant (les cellules mortes ternes sont éliminées). En 3–4 semaines, la texture est sensiblement améliorée, les pores moins visibles et les taches commencent à pâlir.",
      benefits: [
        'Exfoliation douce et efficace',
        'Lisse la texture et resserre les pores',
        'Eclat et teint unifié',
        'Stimule le renouvellement cellulaire',
        'Réduit les taches superficielles'
      ],
      tip: "Utiliser le soir uniquement — les AHA augmentent la photosensibilité. L'acide lactique est plus doux (idéal peaux sensibles), l'acide glycolique plus puissant (peaux résistantes).",
      keywords: ['aha', 'acide glycolique', 'glycolic acid', 'acide lactique', 'lactic acid', 'acide mandélique', 'mandelic acid', 'alpha hydroxy', 'alpha-hydroxy']
    },
    {
      id: 'zinc-pca',
      name: 'Zinc PCA',
      tier: 'good',
      icon: '🔩',
      tagline: "Le régulateur de sébum",
      aka: ['Zinc', 'Zinc Pyrrolidone Carboxylate'],
      definition: "Sel de zinc associé à l'acide pyrrolidone carboxylique (PCA), un humectant naturellement présent dans le facteur naturel d'hydratation de la peau.",
      role: "Régule la production excessive de sébum et exerce une action antibactérienne douce contre les bactéries responsables des boutons.",
      skinImprovement: "En 1–2 semaines, le brillant de la zone T diminue et le maquillage tient plus longtemps. En 4–6 semaines, les imperfections apparaissent moins fréquemment, la peau est plus équilibrée et confortable — ni trop grasse, ni asséchée.",
      benefits: [
        'Réduit l\u2019excès de sébum et le brillant',
        'Propriétés antibactériennes douces',
        'Anti-inflammatoire',
        'Parfait pour peaux grasses et acnéiques',
        'Non irritant'
      ],
      tip: "Très bien toléré, s'utilise matin et/ou soir. Souvent associé à la niacinamide pour un effet sébo-régulateur renforcé. Chercher 'Zinc PCA' dans la liste INCI.",
      keywords: ['zinc', 'zinc pca', 'pyrrolidone', 'zinc pca']
    },
    {
      id: 'ceramides',
      name: 'Céramides',
      tier: 'good',
      icon: '🛡️',
      tagline: "Les gardiens de la barrière cutanée",
      aka: ['Ceramide NP', 'Ceramide AP', 'Phytosphingosine', 'Sphingosine'],
      definition: "Lipides naturellement présents dans la peau, constituant près de 50% de la barrière cutanée. Leur taux diminue avec l'âge et le stress.",
      role: "Maintiennent l'intégrité de la barrière cutanée, préviennent la perte insensible en eau (TEWL) et protègent des agressions extérieures.",
      skinImprovement: "Dès la première semaine, les tiraillements et inconforts diminuent. En 2–3 semaines, la peau résiste mieux au froid, au vent et aux savons agressifs. À 4–6 semaines, la barrière est restaurée : la peau retient mieux son eau naturelle et les rougeurs réactives s'apaisent.",
      benefits: [
        'Restaurent et renforcent la barrière cutanée',
        'Préviennent la déshydratation',
        'Apaisent les peaux sensibles et irritées',
        'Renforcent la peau sur le long terme',
        'Efficaces contre l\u2019eczéma et la sécheresse'
      ],
      tip: "Idéaux pour peaux sèches, sensibles, eczémateuses ou fragilisées. S'associent parfaitement à l'acide hyaluronique et au cholestérol pour une barrière optimale.",
      keywords: ['céramide', 'ceramide', 'ceramides', 'phytosphingosine', 'sphingosine', 'ceramide np', 'ceramide ap']
    },

    /* ══ MOINS RECOMMANDÉES ════════════════════════════════════ */
    {
      id: 'denat-alcohol',
      name: 'Alcool Dénaturé',
      tier: 'caution',
      icon: '⚠️',
      tagline: "Assèche et fragilise la barrière cutanée",
      aka: ['Alcohol Denat.', 'Ethanol', 'SD Alcohol', 'Isopropyl Alcohol'],
      definition: "Alcool éthylique traité pour le rendre impropre à la consommation. Très volatile, il est utilisé comme solvant, conservateur ou agent de texture légère.",
      role: "En faible dose : aide à la pénétration des actifs et donne une texture légère. En forte concentration : détruit les lipides de la barrière cutanée.",
      benefits: [],
      tip: "À éviter si tu as la peau sèche, sensible ou réactive. Acceptable en tout dernier ingrédient de la liste INCI (= infime concentration). Problématique quand il figure dans les 5 premiers ingrédients.",
      keywords: ['alcohol denat', 'alcool dénaturé', 'sd alcohol', 'isopropyl alcohol', 'denatured alcohol', 'ethanol']
    },
    {
      id: 'parfum',
      name: 'Parfum & Fragrance',
      tier: 'caution',
      icon: '⚠️',
      tagline: "Premier allergène cosmétique en Europe",
      aka: ['Fragrance', 'Parfum', 'Linalool', 'Limonene', 'Eugenol'],
      definition: "Mélange de molécules aromatiques (naturelles ou synthétiques) ajoutées pour masquer l'odeur des formules ou enrichir l'expérience sensorielle. Aucun bénéfice pour la peau.",
      role: "Purement esthétique. Premier responsable d'allergies de contact et d'irritations cutanées, selon la Commission Européenne.",
      benefits: [],
      tip: "À éviter pour les peaux sensibles, rosacées ou eczémateuses. Rechercher les mentions 'fragrance-free' ou 'sans parfum'. Attention : les parfums naturels (huiles essentielles) peuvent être aussi irritants.",
      keywords: ['parfum', 'fragrance', 'linalool', 'limonene', 'eugenol', 'citronellol', 'geraniol', 'coumarin', 'cinnamal']
    },
    {
      id: 'comedogenic-oils',
      name: 'Huiles Comédogènes',
      tier: 'caution',
      icon: '⚠️',
      tagline: "Peuvent obstruer les pores des peaux grasses",
      aka: ['Huile de Coco', 'Isopropyl Myristate', 'Coconut Oil', 'Huile de Lin'],
      definition: "Certains corps gras ont un indice comédogène élevé (4–5/5), ce qui signifie qu'ils tendent à obstruer les follicules pileux et favoriser les imperfections.",
      role: "Offrent une hydratation occlusive puissante — excellents pour peaux très sèches, mais problématiques pour les peaux grasses ou acnéiques.",
      benefits: [],
      tip: "Pas universellement mauvaises : indispensables pour les peaux très sèches. À éviter si tu as tendance aux boutons. Préférer des huiles légères : jojoba (indice 2/5), rosehip (1/5) ou squalane (0/5).",
      keywords: ['huile de coco', 'coconut oil', 'isopropyl myristate', 'isopropyl palmitate', 'huile de lin', 'linseed oil', 'cocoa butter', 'beurre de cacao']
    }
  ];

  // ─── Helpers ─────────────────────────────────────────────────
  const TIER_META = {
    excellent: { label: 'Très bonnes molécules', emoji: '⭐', cls: 'tier-excellent' },
    good:      { label: 'Bonnes molécules',       emoji: '👍', cls: 'tier-good'      },
    caution:   { label: 'À limiter',              emoji: '⚠️', cls: 'tier-caution'   }
  };

  function getMolecule(id) {
    return DATA.find(m => m.id === id) || null;
  }

  // ─── Détecter les molécules présentes dans un texte ──────────
  function detectInText(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    const found = [];
    DATA.forEach(mol => {
      if (mol.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        found.push(mol);
      }
    });
    return found;
  }

  // ─── Rendu chips pour les cartes produit de la routine ───────
  function renderMoleculeChips(product, stepType) {
    if (!product) return '';
    const searchText = `${product.name} ${product.description || ''} ${(product.ingredients || []).join(' ')}`;
    let mols = detectInText(searchText);

    // Fallback sur la map étape si rien détecté
    if (mols.length === 0 && stepType && STEP_MOLECULES[stepType]) {
      mols = STEP_MOLECULES[stepType]
        .map(id => DATA.find(m => m.id === id))
        .filter(Boolean);
    }

    if (mols.length === 0) return '';

    const chips = mols.slice(0, 3).map(m => `
      <button class="mol-chip mol-chip--${m.tier}"
              onclick="event.stopPropagation(); Skinpedia.openModal('${m.id}')">
        ${m.icon} ${m.name}
      </button>`).join('');

    return `<div class="mol-chips-row">${chips}</div>`;
  }

  // ─── Modal détail d'une molécule ─────────────────────────────
  function openModal(id) {
    const m = getMolecule(id);
    if (!m) return;
    const meta = TIER_META[m.tier];

    const benefitsHtml = m.benefits.length
      ? `<ul class="mol-benefits-list">${m.benefits.map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';

    const akaHtml = m.aka.length
      ? `<p class="mol-aka"><span>Aussi appelé :</span> ${m.aka.join(', ')}</p>`
      : '';

    const html = `
      <button class="modal-close" onclick="closeModal()">×</button>
      <div class="mol-modal">
        <div class="mol-modal-header mol-modal-header--${m.tier}">
          <span class="mol-modal-icon">${m.icon}</span>
          <div>
            <span class="mol-tier-badge ${meta.cls}">${meta.emoji} ${meta.label}</span>
            <h2>${m.name}</h2>
            <p class="mol-tagline">${m.tagline}</p>
          </div>
        </div>
        <div class="mol-modal-body">
          ${akaHtml}
          <div class="mol-section">
            <h4>Qu'est-ce que c'est ?</h4>
            <p>${m.definition}</p>
          </div>
          <div class="mol-section">
            <h4>Son rôle pour la peau</h4>
            <p>${m.role}</p>
          </div>
          ${benefitsHtml ? `<div class="mol-section"><h4>Bénéfices principaux</h4>${benefitsHtml}</div>` : ''}
          ${m.skinImprovement ? `
          <div class="mol-section mol-section--improvement">
            <h4>📈 Ce que tu verras sur ta peau</h4>
            <p>${m.skinImprovement}</p>
          </div>` : ''}
          ${m.tier === 'caution' ? `
            <div class="mol-section mol-section--caution">
              <h4>⚠️ Pourquoi la limiter ?</h4>
              <p>${m.tip}</p>
            </div>` : `
          <div class="mol-section mol-section--tip">
            <h4>💡 Conseils d'utilisation</h4>
            <p>${m.tip}</p>
          </div>`}
          <button class="btn btn-outline full-width" style="margin-top:24px"
                  onclick="closeModal(); showScreen('skinpedia');">
            Voir toutes les molécules →
          </button>
        </div>
      </div>`;
    openModal(html);
  }

  // ─── Initialiser l'écran Skinpedia ───────────────────────────
  let _searchQuery = '';

  function initScreen() {
    _searchQuery = '';
    _render();
  }

  function _render() {
    const container = document.getElementById('skinpediaContent');
    if (!container) return;

    const query = _searchQuery.trim().toLowerCase();
    const filtered = query
      ? DATA.filter(m =>
          m.name.toLowerCase().includes(query) ||
          m.tagline.toLowerCase().includes(query) ||
          m.definition.toLowerCase().includes(query) ||
          m.aka.some(a => a.toLowerCase().includes(query))
        )
      : DATA;

    const sections = ['excellent', 'good', 'caution'].map(tier => {
      const mols = filtered.filter(m => m.tier === tier);
      if (mols.length === 0) return '';
      const meta = TIER_META[tier];
      return `
        <div class="skinpedia-section">
          <div class="skinpedia-section-header skinpedia-section-header--${tier}">
            <span class="skinpedia-section-emoji">${meta.emoji}</span>
            <h2>${meta.label}</h2>
          </div>
          <div class="skinpedia-grid">
            ${mols.map(m => _renderCard(m)).join('')}
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="skinpedia-header">
        <span class="section-tag">Ingrédients actifs</span>
        <h1>Skinpedia</h1>
        <p>Comprends ce que tu appliques sur ta peau — chaque actif expliqué simplement.</p>
        <div class="skinpedia-search-wrap">
          <input type="search"
                 id="skinpediaSearch"
                 class="skinpedia-search"
                 placeholder="Rechercher un ingrédient…"
                 value="${_searchQuery}"
                 oninput="Skinpedia.search(this.value)">
          <span class="skinpedia-search-icon">🔍</span>
        </div>
      </div>
      <div class="skinpedia-sections">
        ${sections || '<p class="empty-state">Aucun ingrédient trouvé.</p>'}
      </div>`;
  }

  function _renderCard(m) {
    const meta = TIER_META[m.tier];
    return `
      <div class="skinpedia-card skinpedia-card--${m.tier}"
           onclick="Skinpedia.openModal('${m.id}')">
        <div class="skinpedia-card-top">
          <span class="skinpedia-card-icon">${m.icon}</span>
          <span class="mol-tier-badge mol-tier-badge--sm ${meta.cls}">${meta.emoji}</span>
        </div>
        <h3 class="skinpedia-card-name">${m.name}</h3>
        <p class="skinpedia-card-tagline">${m.tagline}</p>
        ${m.aka.length ? `<p class="skinpedia-card-aka">${m.aka.slice(0, 2).join(' · ')}</p>` : ''}
        <button class="skinpedia-card-btn">En savoir plus →</button>
      </div>`;
  }

  function search(query) {
    _searchQuery = query;
    _render();
  }

  // ─── Molécules clés associées à chaque type d'étape ─────────
  const STEP_MOLECULES = {
    cleanser:    ['ceramides', 'hyaluronic-acid'],
    toner:       ['niacinamide', 'hyaluronic-acid'],
    serum:       ['vitamin-c', 'niacinamide', 'hyaluronic-acid'],
    treatment:   ['retinol', 'niacinamide', 'aha'],
    eye:         ['peptides', 'hyaluronic-acid', 'ceramides'],
    moisturizer: ['ceramides', 'hyaluronic-acid', 'peptides'],
    oil:         ['peptides', 'ceramides'],
    exfoliant:   ['aha', 'salicylic-acid'],
    spf:         ['vitamin-c', 'ceramides'],
    lipbalm:     ['ceramides', 'hyaluronic-acid']
  };

  // ─── Bloc "Ce que tu verras" pour les étapes de routine ──────
  function renderRoutineImprovement(product, stepType, molIdx) {
    if (!product) return '';

    // 1. Détection depuis la description produit
    const searchText = `${product.name} ${product.description || ''}`;
    let mols = detectInText(searchText).filter(m => m.skinImprovement && m.tier !== 'caution');

    // 2. Fallback : map étape → molécules clés
    if (mols.length === 0 && stepType && STEP_MOLECULES[stepType]) {
      mols = STEP_MOLECULES[stepType]
        .map(id => DATA.find(m => m.id === id))
        .filter(m => m && m.skinImprovement);
    }

    if (mols.length === 0) return '';

    // Rotation via seed : molécule différente à chaque génération
    const m = mols[(molIdx || 0) % mols.length];

    return `
      <div class="step-improvement" onclick="event.stopPropagation(); Skinpedia.openModal('${m.id}')">
        <span class="step-improvement-icon">📈</span>
        <div class="step-improvement-text">
          <strong>${m.name}</strong> — ${m.skinImprovement}
        </div>
        <span class="step-improvement-more">Skinpedia →</span>
      </div>`;
  }

  return { initScreen, search, openModal, renderMoleculeChips, renderRoutineImprovement, detectInText };

})();
