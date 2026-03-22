/* ============================================================
   makeupRoutine.js — Routine Make-up en 4 zones
   Sections : Teint · Lèvres · Yeux · Sourcils
   L'IA décide, zone par zone, du nombre et du type de produits
   selon l'analyse faciale (morphologie, peau, sous-tons).
   ============================================================ */

'use strict';

const MakeupRoutine = (() => {

  // ══════════════════════════════════════════════════════════════
  // BASE DE PRODUITS
  // ══════════════════════════════════════════════════════════════

  const DB = {

    // ── TEINT ──────────────────────────────────────────────────
    bb: {
      name: 'IT Cosmetics Your Skin But Better CC+ Cream SPF 50',
      brand: 'IT Cosmetics',
      type: 'cc',   // ce produit est à la frontière BB/CC
      price: 42,
      amazonUrl: 'https://www.amazon.fr/s?k=IT+Cosmetics+CC+Cream+SPF50',
      dupe: { name: 'L\'Oréal Paris BB Cream Accord Parfait', brand: 'L\'Oréal Paris', price: 10,
              amazonUrl: 'https://www.amazon.fr/s?k=loreal+BB+cream+accord+parfait' }
    },
    cc: {
      name: 'Charlotte Tilbury Magic Foundation Hydrating CC Cream',
      brand: 'Charlotte Tilbury',
      type: 'cc',
      price: 47,
      amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Magic+Foundation',
      dupe: { name: 'Erborian CC Crème SPF 25', brand: 'Erborian', price: 16,
              amazonUrl: 'https://www.amazon.fr/s?k=Erborian+CC+creme+SPF25' }
    },
    fdt_matte: {
      name: 'MAC Studio Fix Fluid Foundation SPF 15',
      brand: 'MAC',
      type: 'fdt',
      price: 40,
      amazonUrl: 'https://www.amazon.fr/s?k=MAC+Studio+Fix+Fluid+Foundation',
      dupe: { name: 'L\'Oréal Infaillible 32H Mat', brand: 'L\'Oréal Paris', price: 14,
              amazonUrl: 'https://www.amazon.fr/s?k=loreal+infaillible+32H+mat' }
    },
    fdt_dewy: {
      name: 'Lancôme Teint Idôle Ultra Wear Glow Foundation',
      brand: 'Lancôme',
      type: 'fdt',
      price: 50,
      amazonUrl: 'https://www.amazon.fr/s?k=Lancome+Teint+Idole+Ultra+Wear+Glow',
      dupe: { name: 'Maybelline Fit Me Dewy + Smooth', brand: 'Maybelline', price: 11,
              amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Fit+Me+Dewy+Smooth' }
    },
    fdt_mineral: {
      name: 'bareMinerals ORIGINAL Loose Powder Foundation SPF 15',
      brand: 'bareMinerals',
      type: 'fdt',
      price: 42,
      amazonUrl: 'https://www.amazon.fr/s?k=bareMinerals+Original+Loose+Powder+Foundation',
      dupe: { name: 'Max Factor Facefinity All Day Flawless', brand: 'Max Factor', price: 13,
              amazonUrl: 'https://www.amazon.fr/s?k=Max+Factor+Facefinity+All+Day+Flawless' }
    },
    poudre: {
      name: 'NARS Light Reflecting Loose Setting Powder',
      brand: 'NARS',
      type: 'poudre',
      price: 44,
      amazonUrl: 'https://www.amazon.fr/s?k=NARS+Light+Reflecting+Setting+Powder',
      dupe: { name: 'Rimmel Stay Matte Poudre Libre', brand: 'Rimmel', price: 7,
              amazonUrl: 'https://www.amazon.fr/s?k=Rimmel+Stay+Matte+poudre' }
    },

    // ── LÈVRES ─────────────────────────────────────────────────
    lips: {
      warm_full:    { name: 'Charlotte Tilbury Matte Revolution Pillow Talk Original', brand: 'Charlotte Tilbury', price: 38,
                     amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Matte+Revolution+Pillow+Talk',
                     dupe: { name: 'Bourjois Rouge Velvet Nude', brand: 'Bourjois', price: 9,
                             amazonUrl: 'https://www.amazon.fr/s?k=Bourjois+Rouge+Velvet+nude' } },
      warm_thin:    { name: 'Charlotte Tilbury Lip Cheat Liner + Pillow Talk Gloss', brand: 'Charlotte Tilbury', price: 24,
                     amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Lip+Cheat',
                     dupe: { name: 'NYX Line Loud Lip Liner + Butter Gloss', brand: 'NYX', price: 10,
                             amazonUrl: 'https://www.amazon.fr/s?k=NYX+Line+Loud+Lip' } },
      warm_medium:  { name: 'MAC Lipstick Velvet Teddy', brand: 'MAC', price: 23,
                     amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lipstick+Velvet+Teddy',
                     dupe: { name: 'Maybelline Color Sensational Nude', brand: 'Maybelline', price: 10,
                             amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Color+Sensational+nude' } },
      cool_full:    { name: 'MAC Lipstick Rebel', brand: 'MAC', price: 23,
                     amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lipstick+Rebel',
                     dupe: { name: 'Maybelline SuperStay Matte Ink Berry', brand: 'Maybelline', price: 12,
                             amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+SuperStay+Matte+Ink+berry' } },
      cool_thin:    { name: 'Charlotte Tilbury Hyaluronic Happikiss', brand: 'Charlotte Tilbury', price: 33,
                     amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Hyaluronic+Happikiss',
                     dupe: { name: 'NYX Plump Right Back Plumping Lip Serum', brand: 'NYX', price: 12,
                             amazonUrl: 'https://www.amazon.fr/s?k=NYX+Plump+Right+Back' } },
      cool_medium:  { name: 'Dior Rouge Dior Baume Satin Rose des Vents', brand: 'Dior', price: 42,
                     amazonUrl: 'https://www.amazon.fr/s?k=Dior+Rouge+Dior+Baume+Satin',
                     dupe: { name: 'Maybelline Lifter Gloss Rose', brand: 'Maybelline', price: 11,
                             amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Lifter+Gloss+rose' } },
      neutral_full:   { name: 'Charlotte Tilbury Beautiful Colour Lip Gloss', brand: 'Charlotte Tilbury', price: 30,
                       amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Beautiful+Colour+Lip+Gloss',
                       dupe: { name: 'NYX Butter Gloss Praline', brand: 'NYX', price: 8,
                               amazonUrl: 'https://www.amazon.fr/s?k=NYX+Butter+Gloss' } },
      neutral_thin:   { name: 'MAC Lip Pencil + Amplified Lipstick', brand: 'MAC', price: 36,
                       amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lip+Pencil+amplified',
                       dupe: { name: 'Catrice Lip Liner + Volumizing Lip Serum', brand: 'Catrice', price: 10,
                               amazonUrl: 'https://www.amazon.fr/s?k=Catrice+lip+liner+serum' } },
      neutral_medium: { name: 'NARS Sheer Lipstick Istanbul', brand: 'NARS', price: 30,
                       amazonUrl: 'https://www.amazon.fr/s?k=NARS+Sheer+Lipstick+Istanbul',
                       dupe: { name: 'Rimmel Lasting Finish by Kate', brand: 'Rimmel', price: 9,
                               amazonUrl: 'https://www.amazon.fr/s?k=Rimmel+Lasting+Finish+Kate' } }
    },

    // ── YEUX ───────────────────────────────────────────────────
    mascara: {
      opening: { name: 'Benefit Roller Lash Curling & Lifting Mascara', brand: 'Benefit', price: 29,
                 amazonUrl: 'https://www.amazon.fr/s?k=Benefit+Roller+Lash+Mascara',
                 dupe: { name: 'Bourjois Volume Glamour Max Définition', brand: 'Bourjois', price: 11,
                         amazonUrl: 'https://www.amazon.fr/s?k=Bourjois+Volume+Glamour+Max' } },
      lengthening: { name: 'Lancôme Lash Idôle Mascara', brand: 'Lancôme', price: 35,
                     amazonUrl: 'https://www.amazon.fr/s?k=Lancome+Lash+Idole+Mascara',
                     dupe: { name: 'L\'Oréal Telescopic Original Mascara', brand: 'L\'Oréal', price: 13,
                             amazonUrl: 'https://www.amazon.fr/s?k=loreal+telescopic+mascara' } },
      volumizing: { name: 'Maybelline Sky High Mascara', brand: 'Maybelline', price: 14,
                    amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Sky+High+Mascara',
                    dupe: { name: 'Essence Lash Princess False Lash Effect', brand: 'Essence', price: 5,
                            amazonUrl: 'https://www.amazon.fr/s?k=essence+lash+princess+mascara' } }
    },
    liner: {
      name: 'Stila Stay All Day Waterproof Liquid Liner', brand: 'Stila', price: 28,
      amazonUrl: 'https://www.amazon.fr/s?k=Stila+Stay+All+Day+Waterproof+Liner',
      dupe: { name: 'NYX Epic Ink Liner', brand: 'NYX', price: 10,
              amazonUrl: 'https://www.amazon.fr/s?k=NYX+Epic+Ink+Liner' }
    },

    // ── SOURCILS ────────────────────────────────────────────────
    brow: {
      pencil: { name: 'Anastasia Beverly Hills Brow Wiz Ultra-Slim', brand: 'Anastasia Beverly Hills', price: 26,
                amazonUrl: 'https://www.amazon.fr/s?k=Anastasia+Beverly+Hills+Brow+Wiz',
                dupe: { name: 'NYX Professional Makeup Micro Brow Pencil', brand: 'NYX', price: 10,
                        amazonUrl: 'https://www.amazon.fr/s?k=NYX+Micro+Brow+Pencil' } },
      gel:    { name: 'Benefit Gimme Brow+ Volumizing Eyebrow Gel', brand: 'Benefit', price: 29,
                amazonUrl: 'https://www.amazon.fr/s?k=Benefit+Gimme+Brow+Volumizing',
                dupe: { name: 'Essence Make Me Brow Eyebrow Fibre Gel', brand: 'Essence', price: 4,
                        amazonUrl: 'https://www.amazon.fr/s?k=Essence+Make+Me+Brow' } },
      pomade: { name: 'Anastasia Beverly Hills Dipbrow Pomade', brand: 'Anastasia Beverly Hills', price: 24,
                amazonUrl: 'https://www.amazon.fr/s?k=Anastasia+Beverly+Hills+Dipbrow+Pomade',
                dupe: { name: 'Catrice Eye Brow Stylist', brand: 'Catrice', price: 4,
                        amazonUrl: 'https://www.amazon.fr/s?k=Catrice+Eye+Brow+Stylist' } }
    }
  };

  // ══════════════════════════════════════════════════════════════
  // ANTI-CERNES — sélection depuis le catalogue
  // ══════════════════════════════════════════════════════════════

  function selectAnticerne(profile) {
    const cernes = profile.cernes;
    if (!cernes || !cernes.detected) return null;

    const catalog = AppState.products.catalog || [];
    const concealers = catalog.filter(p =>
      p.category === 'foundation' && p.concealerDepth && p.active
    );
    if (!concealers.length) return null;

    // Profondeur selon Fitzpatrick
    const fitz = profile.fitzpatrick || 'III-IV';
    const targetDepth = (fitz === 'I-II' || fitz === 'II-III') ? 'clair'
                      : (fitz === 'V-VI')                      ? 'fonce'
                      : 'medium';

    // Sous-ton selon type de cernes :
    // bleus → correcteur chaud (jaune/pêche neutralise le bleu)
    // rouges → correcteur neutre (évite d'aggraver la rougeur)
    // marron → correcteur neutre ou légèrement chaud
    const targetTone = cernes.type === 'bleu' ? 'warm' : 'neutral';

    const best =
      concealers.find(p => p.concealerDepth === targetDepth && p.concealerTone === targetTone) ||
      concealers.find(p => p.concealerDepth === targetDepth) ||
      concealers.find(p => p.concealerTone  === targetTone)  ||
      concealers[0];

    return { product: best, targetDepth, targetTone };
  }

  function renderCernesPedago(cernes, concealerInfo) {
    if (!cernes || !cernes.detected) return '';

    const TYPE_INFO = {
      bleu:   {
        emoji: '🔵',
        label: 'Bleus / Violets',
        detected: 'Tes cernes ont une teinte bleutée ou violacée — souvent due à la fine épaisseur de la peau sous les yeux qui laisse transparaître les vaisseaux sanguins.',
        correction: 'Un anti-cernes chaud (sous-ton jaune ou pêche) neutralise le bleu par effet d\u2019opposition des couleurs — c\u2019est le principe de la roue chromatique.'
      },
      rouge:  {
        emoji: '🔴',
        label: 'Rouges / Rosés',
        detected: 'Tes cernes présentent une teinte rouge ou rosée, souvent liée à des rougeurs cutanées ou à une peau réactive autour du regard.',
        correction: 'Un anti-cernes à sous-ton neutre ou froid unifie la zone sans amplifier la rougeur déjà présente.'
      },
      marron: {
        emoji: '🟤',
        label: 'Marron / Pigmentés',
        detected: 'Tes cernes sont de couleur brune — il s\u2019agit d\u2019une hyperpigmentation localisée sous les yeux, très fréquente et sans danger.',
        correction: 'Un anti-cernes neutre ou légèrement chaud corrige la pigmentation sans créer de contraste visible avec le reste du teint.'
      }
    };

    const DEPTH_LABELS = { clair: 'teinte claire', medium: 'teinte medium', fonce: 'teinte foncée' };
    const TONE_LABELS  = { warm: 'sous-ton chaud — jaune ou pêche', cool: 'sous-ton froid — rosé', neutral: 'sous-ton neutre' };
    const INTENSITY_LABELS = { léger: 'légère présence', modéré: 'présence modérée', marqué: 'présence marquée' };

    const info = TYPE_INFO[cernes.type] || TYPE_INFO.marron;

    return `
      <div class="cernes-pedago">
        <div class="cernes-pedago-header">
          <span class="cernes-type-badge">${info.emoji} Cernes ${info.label} · ${INTENSITY_LABELS[cernes.intensity] || ''}</span>
        </div>
        <div class="cernes-pedago-body">
          <p><strong>Ce qui a été détecté :</strong> ${info.detected}</p>
          <p><strong>Comment le corriger :</strong> ${info.correction}</p>
          ${concealerInfo ? `
          <div class="cernes-choice">
            <span class="cernes-choice-label">✦ Ce qu'il te faut</span>
            <p>Un anti-cernes en <strong>${DEPTH_LABELS[concealerInfo.targetDepth]}</strong> avec un <strong>${TONE_LABELS[concealerInfo.targetTone]}</strong>.</p>
            <p class="cernes-tip">💡 Pour un effet lumineux et un regard agrandi, choisis une teinte légèrement plus claire que ta carnation — c'est la technique des maquilleurs professionnels.</p>
          </div>` : ''}
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // DÉTECTION MORPHOLOGIQUE
  // ══════════════════════════════════════════════════════════════

  function detectEyeShape(landmarks, w, h) {
    if (!landmarks || landmarks.length < 478) return 'almond';
    const pt   = i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wL   = dist(pt(33), pt(133));
    const hL   = dist(pt(159), pt(145));
    const ratio = wL / (hL || 1);
    const cornerDiff = (pt(33).y - pt(133).y) / (hL || 1);
    if (ratio > 3.8)      return 'narrow';
    if (ratio < 2.4)      return 'round';
    if (cornerDiff < -0.3) return 'upturned';
    return 'almond';
  }

  function detectLipShape(landmarks, w, h) {
    if (!landmarks || landmarks.length < 478) return 'medium';
    const pt   = i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const lipW  = dist(pt(61), pt(291));
    const lipH  = dist(pt(0),  pt(17));
    const faceW = dist(pt(234), pt(454));
    const wRatio = lipW / (faceW || 1);
    const hRatio = lipH / (lipW  || 1);
    if (wRatio > 0.48 && hRatio > 0.30) return 'full';
    if (hRatio < 0.20 || wRatio < 0.36) return 'thin';
    return 'medium';
  }

  // ══════════════════════════════════════════════════════════════
  // LOGIQUE DE SÉLECTION PAR ZONE
  // ══════════════════════════════════════════════════════════════

  // ── TEINT : 1 ou 2 produits selon la peau ────────────────────
  function selectTeint(profile) {
    const { skinType, undertone, globalScore, redness, taches, pores } = profile;
    const products = [];
    let fdtType = null;
    let reasoning = '';

    // Peau sensible ou rougeurs marquées → CC crème
    if (skinType === 'sensible' || redness > 48) {
      products.push({ ...DB.cc, _key: 'cc' });
      fdtType = 'cc';
      reasoning = `Ta peau est ${redness > 48 ? 'sujette aux rougeurs' : 'sensible'} — la CC crème corrige les irrégularités de teint tout en apaisant.`;

    // Peau grasse ou mixte → FdT mat
    } else if (skinType === 'grasse' || skinType === 'mixte') {
      products.push({ ...DB.fdt_matte, _key: 'fdt_matte' });
      fdtType = 'fdt';
      reasoning = `Ta peau ${skinType} nécessite une bonne tenue — le fond de teint mat contrôle le sébum sans alourdir.`;
      // Pores très dilatés → ajouter poudre libre
      if (pores < 48) {
        products.push({ ...DB.poudre, _key: 'poudre' });
        reasoning += ` Une poudre libre est ajoutée pour fixer et matifier durablement la zone T.`;
      }

    // Peau avec taches marquées → CC crème + FdT
    } else if (taches < 50) {
      products.push({ ...DB.cc, _key: 'cc' });
      products.push({ ...DB.fdt_dewy, _key: 'fdt_dewy' });
      fdtType = 'both';
      reasoning = `Des irrégularités de pigmentation sont détectées — la CC crème corrige en base, puis le fond de teint finalise et uniformise.`;

    // Peau sèche → FdT lumineux
    } else if (skinType === 'seche') {
      products.push({ ...DB.fdt_dewy, _key: 'fdt_dewy' });
      fdtType = 'fdt';
      reasoning = `Ta peau sèche bénéficie d'un fond de teint à fini lumineux qui amplifie l'éclat naturel sans accentuer les zones sèches.`;

    // Peau normale avec bon score → BB / CC légère
    } else if (globalScore >= 65) {
      products.push({ ...DB.bb, _key: 'bb' });
      fdtType = 'bb';
      reasoning = `Ta peau est en bonne santé — une BB/CC crème légère suffit pour unifier le teint tout en le laissant respirer.`;

    // Cas par défaut → FdT lumineux
    } else {
      products.push({ ...DB.fdt_dewy, _key: 'fdt_dewy' });
      fdtType = 'fdt';
      reasoning = `Un fond de teint à couvrance modulable s'adapte à tous les profils et te permet d'ajuster selon l'occasion.`;
    }

    return { products, fdtType, reasoning };
  }

  // ── LÈVRES : 1 produit selon sous-tons + morphologie ─────────
  function selectLevres(profile) {
    const key = `${profile.undertone}_${profile.lipShape}`;
    const product = DB.lips[key] || DB.lips[`${profile.undertone}_medium`] || DB.lips.neutral_medium;
    const reasons = {
      full:   `Tes lèvres pulpeuses sont mises en valeur avec une teinte qui en accentue le volume naturel.`,
      thin:   `La combinaison liner + couleur redessine visuellement tes lèvres et crée l'illusion d'un contour plus prononcé.`,
      medium: `Tes lèvres bien proportionnées s'adaptent à de nombreuses teintes — ce choix est calibré sur tes sous-tons ${profile.undertone === 'warm' ? 'chauds' : profile.undertone === 'cool' ? 'froids' : 'neutres'}.`
    };
    const tips = {
      full:   `Application directe depuis le tube. Pour les lèvres très pulpeuses, tu peux légèrement dépasser le contour sur les coins.`,
      thin:   `Dessine d'abord le contour avec le liner, puis remplis. Un touche de gloss au centre amplifie l'effet volume.`,
      medium: `Application directe. Un lip liner de la même teinte suffit pour affiner le contour.`
    };
    return {
      products: [product],
      reasoning: reasons[profile.lipShape] || reasons.medium,
      tip: tips[profile.lipShape] || tips.medium
    };
  }

  // ── YEUX : mascara toujours + liner si yeux étroits ──────────
  function selectYeux(profile) {
    const { eyeShape } = profile;
    const products = [];
    const tips = [];
    let reasoning = '';

    // Mascara : type selon forme des yeux
    let mascaraKey;
    if (eyeShape === 'round')    mascaraKey = 'lengthening';
    else if (eyeShape === 'narrow') mascaraKey = 'opening';
    else mascaraKey = 'volumizing';
    products.push({ ...DB.mascara[mascaraKey], _mascType: mascaraKey });

    const mascaraReasons = {
      lengthening: `Tes yeux ronds gagnent en intensité avec un mascara allongeant — l'effet est naturel et ouvre le regard sans l'alourdir.`,
      opening:     `Un mascara courbant est essentiel pour tes yeux étroits : il ouvre et agrandit le regard de manière visible.`,
      volumizing:  `Tes yeux en amande sont polyvalents — un mascara volumisant amplifie leur forme naturelle sans artifice.`
    };
    const mascaraTips = {
      lengthening: `Insiste sur les cils du coin externe avec un zigzag à la racine. Évite d'alourdir les cils inférieurs.`,
      opening:     `Recourbe d'abord les cils 30 sec avec un recourbe-cils. Applique le mascara à la racine en remontant. Ne charge pas le coin interne.`,
      volumizing:  `Zigzag à la racine pour épaissir, puis peigne vers le haut. Cils inférieurs : une touche légère suffit.`
    };
    reasoning = mascaraReasons[mascaraKey];
    tips.push(mascaraTips[mascaraKey]);

    // Liner : recommandé pour yeux étroits ou ronds
    if (eyeShape === 'narrow' || eyeShape === 'round') {
      products.push({ ...DB.liner });
      const linerR = eyeShape === 'narrow'
        ? `Un trait d'eye-liner fin sur la paupière supérieure agrandit et définit tes yeux — technique essentielle pour ton type de regard.`
        : `Un eye-liner fin sur la ligne des cils extérieurs allonge visuellement tes yeux ronds et leur donne une forme plus amande.`;
      reasoning += ` ${linerR}`;
      tips.push(eyeShape === 'narrow'
        ? `Trace un trait fin et précis le plus près possible de la racine des cils, du coin interne vers l'externe. Pas besoin d'un trait épais.`
        : `Applique uniquement sur le tiers externe de la paupière supérieure pour l'effet allongeant. Estompe légèrement avec un coton-tige.`);
    }

    return { products, reasoning, tips };
  }

  // ── SOURCILS : type selon forme du visage ────────────────────
  function selectSourcils(profile) {
    const { faceShape } = profile;
    let product, reasoning, tip, importance;

    const shapes = {
      round: {
        p: DB.brow.pencil,
        r: `Ton visage rond bénéficie de sourcils légèrement arqués et bien définis — ils allongent visuellement les proportions.`,
        t: `Dessine un arc doux mais visible. Commence fin à la tête du sourcil, monte vers l'arc, puis descends en affinant. Remplis les zones clairsemées avec de petits traits.`,
        i: 'essentiel'
      },
      square: {
        p: DB.brow.gel,
        r: `Ton visage carré gagne à avoir des sourcils plus doux et moins angulaires — le gel gomme l'aspect structuré de façon naturelle.`,
        t: `Brosse les poils vers le haut. Évite les arcs trop prononcés qui renforcerait l'effet angulaire. L'objectif est un sourcil naturel et arrondi.`,
        i: 'recommandé'
      },
      heart: {
        p: DB.brow.pencil,
        r: `Ton visage en cœur (front large, menton fin) est équilibré par des sourcils légèrement aplatis qui diminuent visuellement la largeur du front.`,
        t: `Dessine un sourcil peu arqué, presque droit et horizontal. Remplis doucement les zones clairsemées.`,
        i: 'recommandé'
      },
      long: {
        p: DB.brow.pomade,
        r: `Ton visage allongé est harmonisé par des sourcils droits et horizontaux — ils créent de la largeur et raccourcissent visuellement les proportions.`,
        t: `Dessine un sourcil le plus droit et horizontal possible. Évite les arcs qui allongent davantage. La pomade offre une précision idéale.`,
        i: 'recommandé'
      },
      oval: {
        p: DB.brow.gel,
        r: `Ton visage ovale est polyvalent — un gel sourcils naturel suffit pour définir et discipliner sans surcharger.`,
        t: `Brosse vers le haut et l'extérieur. Le gel fixe les poils dans la bonne direction. Ajoute un léger trait de crayon si tu as des zones clairsemées.`,
        i: 'optionnel'
      }
    };

    const entry = shapes[faceShape] || shapes.oval;
    return {
      products: [entry.p],
      reasoning: entry.r,
      tip: entry.t,
      importance: entry.i
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ENCART PÉDAGOGIQUE TEINT (affiché une seule fois)
  // ══════════════════════════════════════════════════════════════

  function renderTeintPedago(fdtType, reasoning) {
    const defs = `
      <div class="teint-pedago-defs">
        <div class="teint-def-item">
          <span class="teint-def-title">BB crème</span>
          <span class="teint-def-text">Hydratation + légère couvrance + SPF. Idéale pour les peaux en bonne santé qui veulent juste unifier.</span>
        </div>
        <div class="teint-def-item">
          <span class="teint-def-title">CC crème</span>
          <span class="teint-def-text">Color Correcting. Corrige les rougeurs et imperfections de teint avec plus de couvrance qu'une BB, tout en restant légère.</span>
        </div>
        <div class="teint-def-item">
          <span class="teint-def-title">Fond de teint</span>
          <span class="teint-def-text">Couvrance modulable de naturelle à intense. Existe en fini mat (peaux grasses), lumineux (peaux sèches) ou minéral (peaux sensibles).</span>
        </div>
      </div>`;

    const choiceReasons = {
      bb:   `<p class="teint-choice-reason">✦ Pour toi : la BB/CC crème légère est suffisante — ta peau est équilibrée et n'a pas besoin d'une couvrance lourde.</p>`,
      cc:   `<p class="teint-choice-reason">✦ Pour toi : la CC crème est recommandée — elle corrige les irrégularités de teint tout en restant douce et adaptée à ta sensibilité.</p>`,
      fdt:  `<p class="teint-choice-reason">✦ Pour toi : le fond de teint est le plus adapté — il offre la tenue et la couvrance nécessaires selon ton profil de peau.</p>`,
      both: `<p class="teint-choice-reason">✦ Pour toi : la combinaison CC crème + fond de teint est recommandée — la CC corrige d'abord les irrégularités, puis le fond de teint unifie et fixe.</p>`,
      poudre: `<p class="teint-choice-reason">✦ La poudre libre fixe et matifie en complément du fond de teint pour une tenue longue durée sur ta peau mixte à grasse.</p>`
    };

    return `
      <div class="teint-pedago">
        <div class="teint-pedago-header">
          <span class="teint-pedago-label">BB crème · CC crème · Fond de teint — quelle différence ?</span>
        </div>
        ${defs}
        ${choiceReasons[fdtType] || ''}
        <p class="teint-pedago-analysis">${reasoning}</p>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU CARTE PRODUIT
  // ══════════════════════════════════════════════════════════════

  function renderCard(product, reason, tip, index, catId) {
    if (!product) return '';
    const buyUrl  = product.amazonUrl || `https://www.amazon.fr/s?k=${encodeURIComponent((product.brand||'') + ' ' + (product.name||''))}`;
    const dupeUrl = product.dupe?.amazonUrl || `https://www.amazon.fr/s?k=${encodeURIComponent((product.dupe?.brand||'') + ' ' + (product.dupe?.name||''))}`;

    return `
      <div class="makeup-card" style="animation-delay:${index * 0.07}s">
        <div class="makeup-card-product">
          <span class="makeup-card-brand">${product.brand || ''}</span>
          <h3 class="makeup-card-name">${product.name || ''}</h3>
          <span class="makeup-card-price">${product.price ? product.price + ' €' : ''}</span>
        </div>
        ${reason ? `<p class="makeup-card-reason">${reason}</p>` : ''}
        ${tip ? `
          <div class="makeup-card-tip">
            <span class="makeup-tip-label">Conseil d'application</span>
            <p>${tip}</p>
          </div>` : ''}
        <div class="makeup-card-actions">
          <a class="btn btn-dark makeup-btn-buy"
             href="${buyUrl}" target="_blank" rel="noopener nofollow sponsored"
             onclick="trackAmazonClick('makeup-${catId}')">Acheter</a>
          ${product.dupe ? `
          <button class="btn btn-outline makeup-btn-dupe" onclick="MakeupRoutine.toggleDupe(this)">
            Dupe ↓
          </button>` : ''}
        </div>
        ${product.dupe ? `
        <div class="makeup-dupe-panel" style="display:none">
          <div class="makeup-dupe-header">Alternative moins chère</div>
          <div class="makeup-dupe-content">
            <span class="makeup-card-brand">${product.dupe.brand}</span>
            <span class="makeup-dupe-name">${product.dupe.name}</span>
            <span class="makeup-dupe-price">${product.dupe.price} €</span>
          </div>
          <a class="btn btn-outline makeup-dupe-buy" href="${dupeUrl}"
             target="_blank" rel="noopener nofollow sponsored">
            Acheter l'alternative →
          </a>
        </div>` : ''}
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU SECTION
  // ══════════════════════════════════════════════════════════════

  function renderSection(title, icon, importance, content) {
    const badge = importance === 'essentiel'
      ? `<span class="zone-badge zone-badge--essential">Essentiel</span>`
      : importance === 'optionnel'
      ? `<span class="zone-badge zone-badge--optional">Optionnel</span>`
      : '';
    return `
      <div class="makeup-zone-section">
        <div class="makeup-zone-header">
          <span class="makeup-zone-icon">${icon}</span>
          <h2 class="makeup-zone-title">${title}</h2>
          ${badge}
        </div>
        <div class="makeup-zone-body">${content}</div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // PROFIL MORPHO
  // ══════════════════════════════════════════════════════════════

  function renderMorphoProfile(profile) {
    const SHAPE  = { oval: 'Ovale', round: 'Rond', square: 'Carré', heart: 'Cœur', long: 'Allongé' };
    const TONE   = { warm: 'Chauds · Dorés', cool: 'Froids · Rosés', neutral: 'Neutres' };
    const EYE    = { almond: 'Amande', round: 'Ronds', narrow: 'Étroits', upturned: 'Relevés' };
    const LIP    = { full: 'Pulpeuses', medium: 'Proportionnées', thin: 'Fines' };
    const SKIN   = { grasse: 'Grasse', mixte: 'Mixte', seche: 'Sèche', sensible: 'Sensible', normale: 'Normale' };
    const CERNES = { bleu: 'Bleus/Violets', rouge: 'Rouges/Rosés', marron: 'Marron' };
    const cernesVal = profile.cernes?.detected
      ? (CERNES[profile.cernes.type] || '—') + ' · ' + (profile.cernes.intensity || '')
      : 'Non détectés';
    const items = [
      { label: 'Visage',      value: SHAPE[profile.faceShape] || '—' },
      { label: 'Sous-tons',   value: TONE[profile.undertone]  || '—' },
      { label: 'Peau',        value: SKIN[profile.skinType]   || '—' },
      { label: 'Yeux',        value: EYE[profile.eyeShape]    || '—' },
      { label: 'Lèvres',      value: LIP[profile.lipShape]    || '—' },
      { label: 'Cernes',      value: cernesVal }
    ];
    return `<div class="makeup-profile-banner">
      ${items.map(i => `
        <div class="makeup-profile-item">
          <span class="makeup-profile-label">${i.label}</span>
          <span class="makeup-profile-value">${i.value}</span>
        </div>`).join('')}
    </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════

  function render(container, profile, hasPhoto) {
    const anticerne = selectAnticerne(profile);
    const teint    = selectTeint(profile);
    const levres   = selectLevres(profile);
    const yeux     = selectYeux(profile);
    const sourcils = selectSourcils(profile);

    // ── Section Teint ──
    const teintContent =
      renderTeintPedago(teint.fdtType, teint.reasoning) +
      teint.products.map((p, i) => {
        // Pour le 2e produit (poudre ou 2e FdT), pas de reason répétée
        const r = i === 0 ? '' : (p._key === 'poudre' ? 'La poudre libre fixe et finalise le teint.' : 'En complément pour uniformiser et couvrir davantage.');
        const t = p._key === 'poudre'
          ? `Applique en tampon sur la zone T avec un gros pinceau. Evite les joues si ta peau est sèche à cet endroit.`
          : `Applique avec une éponge humide en tapotant du centre vers les bords. Commence léger, tu peux toujours en ajouter.`;
        return renderCard(p, r, t, i, 'teint');
      }).join('');

    // ── Section Lèvres ──
    const levresContent = levres.products.map((p, i) =>
      renderCard(p, i === 0 ? levres.reasoning : '', levres.tip, i, 'levres')).join('');

    // ── Section Yeux ──
    const yeuxContent = yeux.products.map((p, i) =>
      renderCard(p, i === 0 ? yeux.reasoning : '', yeux.tips[i] || '', i, 'yeux')).join('');

    // ── Section Sourcils ──
    const sourcilsContent = renderCard(
      sourcils.products[0], sourcils.reasoning, sourcils.tip, 0, 'sourcils');

    const intentionIntro = (typeof getIntentionIntro === 'function') ? getIntentionIntro('makeup') : null;
    const intentionBanner = intentionIntro ? `
      <div class="intention-routine-banner">
        <span class="intention-routine-emoji">${AppState.intention?.emoji || '✦'}</span>
        <p>${intentionIntro}</p>
      </div>` : '';

    container.innerHTML = `
      <div class="makeup-routine-wrap">

        <div class="diag-header">
          <span class="section-tag">Coach Beauté · IA Morphologique</span>
          <h1>Ta Routine Make-up</h1>
          <p>Sélection personnalisée selon ta morphologie, ton type de peau et tes sous-tons.</p>
        </div>
        ${intentionBanner}

        ${renderMorphoProfile(profile)}

        ${anticerne ? renderSection('Anti-cernes', '◉', 'essentiel',
            renderCernesPedago(profile.cernes, anticerne) +
            renderCard(anticerne.product,
              '',
              'Tapoter très délicatement avec l\u2019annulaire sous les yeux, du coin interne vers le tempe. Ne jamais frotter — la peau sous les yeux est extrêmement fine.',
              0, 'anticerne')
          ) : ''}

        ${renderSection('Teint',    '◇', 'essentiel',   teintContent)}
        ${renderSection('Lèvres',   '❋', 'essentiel',   levresContent)}
        ${renderSection('Yeux',     '○', yeux.products.length > 1 ? 'essentiel' : 'recommandé', yeuxContent)}
        ${renderSection('Sourcils', '⬡', sourcils.importance, sourcilsContent)}

        <div class="makeup-disclaimer">
          <p>
            ○ Les teintes exactes sont difficiles à déterminer sans essai en boutique.
            Ces recommandations sont basées sur ta morphologie et tes sous-tons — considère-les comme un point de départ.
            Liens Amazon affiliés — même commission sur tous les produits.
          </p>
        </div>

      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT ÉCRAN
  // ══════════════════════════════════════════════════════════════

  async function initScreen() {
    const container = document.getElementById('makeupRoutineContent');
    if (!container) return;

    const photo    = AppState.face.photo;
    let analysis   = AppState.face.skinAnalysis;

    if (!analysis && photo) {
      container.innerHTML = `
        <div class="skin-loading-screen">
          <div class="skin-scan-anim">
            <div class="skin-scan-face"><div class="skin-scan-line"></div></div>
          </div>
          <p class="skin-loading-title">Analyse morphologique en cours…</p>
          <p class="skin-loading-sub">Forme du visage · Yeux · Lèvres · Type de peau</p>
        </div>`;
      try {
        if (window._glowFaceLandmarker) {
          const img = new Image();
          img.src = photo;
          await new Promise(r => { img.onload = r; });
          const result = window._glowFaceLandmarker.detect(img);
          if (result?.faceLandmarks?.length) AppState.face.landmarks = result.faceLandmarks[0];
        }
        analysis = AppState.face.skinAnalysis;
      } catch (e) {
        console.warn('[MakeupRoutine] Analyse:', e);
      }
    }

    const lm = AppState.face.landmarks;
    const W = 640, H = 480;

    // Extraire les métriques de peau pour la sélection teint
    const zones       = analysis?.zones || {};
    const zoneVals    = Object.values(zones);
    const avg         = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 60;
    const globalScore = analysis?.globalScore || 60;
    const redness     = avg(zoneVals.map(z => z.redness || 50));
    const taches      = avg(zoneVals.map(z => z.taches  || 60));
    const pores       = avg(zoneVals.map(z => z.pores   || 60));

    const profile = {
      faceShape:   analysis?.faceShape?.shape || null,
      skinType:    analysis?.skinType?.type || AppState.questionnaire.answers?.skinType || 'normale',
      undertone:   analysis?.undertone?.type || 'neutral',
      fitzpatrick: analysis?.undertone?.fitzpatrick || 'III-IV',
      eyeShape:    lm ? detectEyeShape(lm, W, H) : 'almond',
      lipShape:    lm ? detectLipShape(lm, W, H) : 'medium',
      cernes:      analysis?.cernes || null,
      globalScore, redness, taches, pores
    };

    render(container, profile, !!photo);
  }

  // ── Toggle dupe ───────────────────────────────────────────────
  function toggleDupe(btn) {
    const card  = btn.closest('.makeup-card');
    const panel = card.querySelector('.makeup-dupe-panel');
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    btn.textContent = open ? 'Dupe ↓' : 'Masquer ↑';
  }

  return { initScreen, toggleDupe };

})();
