/* ============================================================
   makeupRoutine.js — Routine Make-up Premium
   Design Sephora/Glossier - Cartes produits avec images
   ============================================================ */

'use strict';

const MakeupRoutine = (() => {

  // ══════════════════════════════════════════════════════════════
  // BASE DE PRODUITS AVEC IMAGES ET BÉNÉFICES
  // ══════════════════════════════════════════════════════════════

  const DB = {

    // ── TEINT ──────────────────────────────────────────────────
    bb: {
      name: 'IT Cosmetics CC+ Cream SPF 50',
      brand: 'IT Cosmetics',
      type: 'cc',
      price: 42,
      image: 'assets/ITCOSMETIC-CCCREmemedium.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=IT+Cosmetics+CC+Cream+SPF50',
      shade: 'Choisir selon ta carnation',
      benefits: ['Couvre les imperfections', 'Protège du soleil SPF 50', 'Hydrate toute la journée'],
      dupe: { name: 'L\'Oréal BB Cream Accord Parfait', brand: 'L\'Oréal', price: 10,
              image: 'assets/NYX-Fonddeteint.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=loreal+BB+cream+accord+parfait',
              benefits: ['Unifie le teint', 'Texture légère', 'Prix mini'] }
    },
    cc: {
      name: 'Charlotte Tilbury Magic Foundation',
      brand: 'Charlotte Tilbury',
      type: 'cc',
      price: 47,
      image: 'assets/CHARLOTTETILBURY-FDTtravelsize.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Magic+Foundation',
      shade: 'Medium pour peaux claires à moyennes',
      benefits: ['Effet peau parfaite', 'Longue tenue 12h', 'Fini lumineux naturel'],
      dupe: { name: 'Erborian CC Crème SPF 25', brand: 'Erborian', price: 16,
              image: 'assets/NYX-Fonddeteint.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=Erborian+CC+creme+SPF25',
              benefits: ['Corrige le teint', 'Texture fondante', 'SPF 25'] }
    },
    fdt_matte: {
      name: 'MAC Studio Fix Fluid SPF 15',
      brand: 'MAC',
      type: 'fdt',
      price: 40,
      image: 'assets/CLINIQUE-fonddeteint.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=MAC+Studio+Fix+Fluid+Foundation',
      shade: 'NC/NW selon tes sous-tons',
      benefits: ['Contrôle le sébum', 'Couvrance modulable', 'Tenue 24h'],
      dupe: { name: 'L\'Oréal Infaillible 32H Mat', brand: 'L\'Oréal', price: 14,
              image: 'assets/NYX-Fonddeteint.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=loreal+infaillible+32H+mat',
              benefits: ['Ultra longue tenue', 'Fini mat', 'Anti-transfert'] }
    },
    fdt_dewy: {
      name: 'Lancôme Teint Idôle Ultra Wear Glow',
      brand: 'Lancôme',
      type: 'fdt',
      price: 50,
      image: 'assets/BYTERRY-fonddeteintsoinspfhyaluronic.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=Lancome+Teint+Idole+Ultra+Wear+Glow',
      shade: 'Beige Doré pour sous-tons chauds',
      benefits: ['Éclat naturel', 'Hydratation 24h', 'Effet bonne mine'],
      dupe: { name: 'Maybelline Fit Me Dewy', brand: 'Maybelline', price: 11,
              image: 'assets/MAYBELLINE-correcteurrougeurs.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Fit+Me+Dewy+Smooth',
              benefits: ['Fini glowy', 'Léger', 'Petit prix'] }
    },
    poudre: {
      name: 'NARS Light Reflecting Powder',
      brand: 'NARS',
      type: 'poudre',
      price: 44,
      image: 'assets/SUNLOVER-POUDRE.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=NARS+Light+Reflecting+Setting+Powder',
      shade: 'Translucide universel',
      benefits: ['Fixe le maquillage', 'Effet flouteur', 'Zéro effet carton'],
      dupe: { name: 'Rimmel Stay Matte', brand: 'Rimmel', price: 7,
              image: 'assets/SUNLOVER-POUDRE.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=Rimmel+Stay+Matte+poudre',
              benefits: ['Matifie', 'Longue tenue', 'Prix mini'] }
    },

    // ── LÈVRES ─────────────────────────────────────────────────
    lips: {
      warm_full: {
        name: 'Charlotte Tilbury Pillow Talk',
        brand: 'Charlotte Tilbury',
        price: 38,
        image: 'assets/CHARLOTTETILBURY-pillowtalkcoffret.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Matte+Revolution+Pillow+Talk',
        shade: 'Nude rosé universel',
        benefits: ['Couleur iconique', 'Tenue longue durée', 'Effet lèvres pulpeuses'],
        dupe: { name: 'Bourjois Rouge Velvet', brand: 'Bourjois', price: 9,
                image: 'assets/KIKOMILANO-ROUGEàlèvres1.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Bourjois+Rouge+Velvet+nude',
                benefits: ['Fini velours', 'Non desséchant', 'Prix doux'] }
      },
      warm_thin: {
        name: 'Charlotte Tilbury Lip Cheat + Gloss',
        brand: 'Charlotte Tilbury',
        price: 24,
        image: 'assets/SACHEU-Lipliner.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Lip+Cheat',
        shade: 'Pillow Talk pour repulper',
        benefits: ['Redessine les lèvres', 'Effet volume', 'Tenue parfaite'],
        dupe: { name: 'NYX Line Loud + Butter Gloss', brand: 'NYX', price: 10,
                image: 'assets/NYX-GLOSSCerise.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=NYX+Line+Loud+Lip',
                benefits: ['Duo liner + gloss', 'Pigmenté', 'Prix mini'] }
      },
      warm_medium: {
        name: 'MAC Velvet Teddy',
        brand: 'MAC',
        price: 23,
        image: 'assets/KIKOMILANO-ROUGEàlèvres2.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lipstick+Velvet+Teddy',
        shade: 'Nude beige mat',
        benefits: ['Nude parfait', 'Fini mat crémeux', 'Classique intemporel'],
        dupe: { name: 'Maybelline Color Sensational', brand: 'Maybelline', price: 10,
                image: 'assets/KIKOMILANO-ROUGEàlèvres3.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Color+Sensational+nude',
                benefits: ['Hydratant', 'Couleur intense', 'Petit prix'] }
      },
      cool_full: {
        name: 'MAC Rebel',
        brand: 'MAC',
        price: 23,
        image: 'assets/CLINIQUE-rougeàlèvres.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lipstick+Rebel',
        shade: 'Berry profond',
        benefits: ['Couleur intense', 'Sublime les peaux claires', 'Fini satiné'],
        dupe: { name: 'Maybelline SuperStay Matte Ink', brand: 'Maybelline', price: 12,
                image: 'assets/NYX-FEUTRELEVRESSTEAMY.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+SuperStay+Matte+Ink+berry',
                benefits: ['Tenue 16h', 'Ultra pigmenté', 'Sans transfert'] }
      },
      cool_thin: {
        name: 'Charlotte Tilbury Hyaluronic Happikiss',
        brand: 'Charlotte Tilbury',
        price: 33,
        image: 'assets/SUMMERFRIDAYS-LIPS-pinksugar.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Hyaluronic+Happikiss',
        shade: 'Romance Kiss rosé',
        benefits: ['Repulpe les lèvres', 'Acide hyaluronique', 'Brillance glamour'],
        dupe: { name: 'NYX Plump Right Back', brand: 'NYX', price: 12,
                image: 'assets/NYX-Crayonlèvrerepulpant.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=NYX+Plump+Right+Back',
                benefits: ['Effet repulpant', 'Brillant', 'Prix accessible'] }
      },
      cool_medium: {
        name: 'Dior Rouge Baume Satin',
        brand: 'Dior',
        price: 42,
        image: 'assets/ELIZABETHARDEN-rougealevrebaume.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Dior+Rouge+Dior+Baume+Satin',
        shade: 'Rose des Vents',
        benefits: ['Soin + couleur', 'Fini satiné luxe', 'Hydratation 24h'],
        dupe: { name: 'Maybelline Lifter Gloss', brand: 'Maybelline', price: 11,
                image: 'assets/NYX-GLOSSCerise.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Lifter+Gloss+rose',
                benefits: ['Effet glossy', 'Acide hyaluronique', 'Prix doux'] }
      },
      neutral_full: {
        name: 'Charlotte Tilbury Lip Gloss',
        brand: 'Charlotte Tilbury',
        price: 30,
        image: 'assets/SUMMERFRIDAYS-LIPS-sucrebrun.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Charlotte+Tilbury+Beautiful+Colour+Lip+Gloss',
        shade: 'Nude neutre brillant',
        benefits: ['Brillance miroir', 'Non collant', 'Effet lèvres glossy'],
        dupe: { name: 'NYX Butter Gloss', brand: 'NYX', price: 8,
                image: 'assets/NYX-GLOSSCerise.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=NYX+Butter+Gloss',
                benefits: ['Texture beurre', 'Hydratant', 'Prix mini'] }
      },
      neutral_thin: {
        name: 'MAC Lip Pencil + Lipstick',
        brand: 'MAC',
        price: 36,
        image: 'assets/SACHEU-Lipliner.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=MAC+Lip+Pencil+amplified',
        shade: 'Spice + Velvet Teddy',
        benefits: ['Duo liner + rouge', 'Tenue parfaite', 'Lèvres redessinées'],
        dupe: { name: 'Catrice Lip Liner + Serum', brand: 'Catrice', price: 10,
                image: 'assets/NYX-Crayonlèvrerepulpant.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Catrice+lip+liner+serum',
                benefits: ['Duo économique', 'Effet repulpant', 'Bonne tenue'] }
      },
      neutral_medium: {
        name: 'NARS Sheer Lipstick Istanbul',
        brand: 'NARS',
        price: 30,
        image: 'assets/KIKOMILANO-ROUGEàlèvres1.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=NARS+Sheer+Lipstick+Istanbul',
        shade: 'Rose nude sheer',
        benefits: ['Couleur buildable', 'Fini naturel', 'Confortable'],
        dupe: { name: 'Rimmel Lasting Finish', brand: 'Rimmel', price: 9,
                image: 'assets/KIKOMILANO-ROUGEàlèvres3.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Rimmel+Lasting+Finish+Kate',
                benefits: ['Longue tenue', 'Pigmenté', 'Prix accessible'] }
      }
    },

    // ── YEUX ───────────────────────────────────────────────────
    mascara: {
      opening: {
        name: 'Benefit Roller Lash',
        brand: 'Benefit',
        price: 29,
        image: 'assets/CHARLOTTETILBURY-mascara1.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Benefit+Roller+Lash+Mascara',
        shade: 'Noir intense',
        benefits: ['Courbe les cils', 'Ouvre le regard', 'Tenue 12h'],
        dupe: { name: 'Bourjois Volume Glamour', brand: 'Bourjois', price: 11,
                image: 'assets/MAYBELLINE-mascaralashsensational.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Bourjois+Volume+Glamour+Max',
                benefits: ['Volume XXL', 'Brosse courbée', 'Prix doux'] }
      },
      lengthening: {
        name: 'Lancôme Lash Idôle',
        brand: 'Lancôme',
        price: 35,
        image: 'assets/CHARLOTTETILBURY-mascara2.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Lancome+Lash+Idole+Mascara',
        shade: 'Noir profond',
        benefits: ['Allonge les cils', 'Effet faux-cils', 'Sans paquets'],
        dupe: { name: 'L\'Oréal Telescopic', brand: 'L\'Oréal', price: 13,
                image: 'assets/MAYBELLINE-mascaraSKY.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=loreal+telescopic+mascara',
                benefits: ['Longueur extrême', 'Précision', 'Classique'] }
      },
      volumizing: {
        name: 'Maybelline Sky High',
        brand: 'Maybelline',
        price: 14,
        image: 'assets/MAYBELLINE-mascaraSKY.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Sky+High+Mascara',
        shade: 'Noir',
        benefits: ['Volume spectaculaire', 'Fibres allongeantes', 'Viral sur TikTok'],
        dupe: { name: 'Essence Lash Princess', brand: 'Essence', price: 5,
                image: 'assets/MINA-Mascara1.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=essence+lash+princess+mascara',
                benefits: ['Volume fou', 'Prix imbattable', 'Culte'] }
      }
    },
    liner: {
      name: 'Stila Stay All Day Liner',
      brand: 'Stila',
      price: 28,
      image: 'assets/NYX-FEUTRELEVRESALLNIGHT10.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=Stila+Stay+All+Day+Waterproof+Liner',
      shade: 'Noir intense',
      benefits: ['Waterproof', 'Trait ultra précis', 'Tenue 12h'],
      dupe: { name: 'NYX Epic Ink Liner', brand: 'NYX', price: 10,
              image: 'assets/NYX-FEUTRELEVRESALLNIGHT10.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=NYX+Epic+Ink+Liner',
              benefits: ['Pointe feutre', 'Noir intense', 'Best-seller'] }
    },

    // ── SOURCILS ────────────────────────────────────────────────
    brow: {
      pencil: {
        name: 'Anastasia Brow Wiz',
        brand: 'Anastasia Beverly Hills',
        price: 26,
        image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Anastasia+Beverly+Hills+Brow+Wiz',
        shade: 'Selon ta couleur de cheveux',
        benefits: ['Ultra précis', 'Effet poil par poil', 'Avec goupillon'],
        dupe: { name: 'NYX Micro Brow Pencil', brand: 'NYX', price: 10,
                image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=NYX+Micro+Brow+Pencil',
                benefits: ['Mine fine', 'Naturel', 'Prix doux'] }
      },
      gel: {
        name: 'Benefit Gimme Brow+',
        brand: 'Benefit',
        price: 29,
        image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Benefit+Gimme+Brow+Volumizing',
        shade: 'Adapté à ta teinte',
        benefits: ['Volume naturel', 'Microfibres', 'Application rapide'],
        dupe: { name: 'Essence Make Me Brow', brand: 'Essence', price: 4,
                image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Essence+Make+Me+Brow',
                benefits: ['Gel teinté', 'Naturel', 'Prix mini'] }
      },
      pomade: {
        name: 'Anastasia Dipbrow Pomade',
        brand: 'Anastasia Beverly Hills',
        price: 24,
        image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
        amazonUrl: 'https://www.amazon.fr/s?k=Anastasia+Beverly+Hills+Dipbrow+Pomade',
        shade: 'Selon ta couleur naturelle',
        benefits: ['Tenue waterproof', 'Effet tatoué', 'Ultra précis'],
        dupe: { name: 'Catrice Eye Brow Stylist', brand: 'Catrice', price: 4,
                image: 'assets/CHARLOTTETILBURY-pinceau.jpg',
                amazonUrl: 'https://www.amazon.fr/s?k=Catrice+Eye+Brow+Stylist',
                benefits: ['Facile', 'Bonne tenue', 'Prix imbattable'] }
      }
    },

    // ── ANTI-CERNES ─────────────────────────────────────────────
    concealer: {
      name: 'NARS Radiant Creamy Concealer',
      brand: 'NARS',
      price: 32,
      image: 'assets/CLINIQUE-anticerne.jpg',
      amazonUrl: 'https://www.amazon.fr/s?k=NARS+Radiant+Creamy+Concealer',
      shade: 'Vanilla pour peaux claires',
      benefits: ['Couvre les cernes', 'Effet lumineux', 'Ne marque pas'],
      dupe: { name: 'Maybelline Instant Anti-Age', brand: 'Maybelline', price: 11,
              image: 'assets/NYX-camoufflercernes.jpg',
              amazonUrl: 'https://www.amazon.fr/s?k=Maybelline+Instant+Anti+Age+Eraser',
              benefits: ['Éponge pratique', 'Couvrance', 'Best-seller'] }
    }
  };

  // ══════════════════════════════════════════════════════════════
  // DÉTECTION MORPHOLOGIQUE (simplifié)
  // ══════════════════════════════════════════════════════════════

  function detectEyeShape(landmarks, w, h) {
    if (!landmarks || landmarks.length < 478) return 'almond';
    const pt = i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wL = dist(pt(33), pt(133));
    const hL = dist(pt(159), pt(145));
    const ratio = wL / (hL || 1);
    if (ratio > 3.8) return 'narrow';
    if (ratio < 2.4) return 'round';
    return 'almond';
  }

  function detectLipShape(landmarks, w, h) {
    if (!landmarks || landmarks.length < 478) return 'medium';
    const pt = i => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const lipW = dist(pt(61), pt(291));
    const lipH = dist(pt(0), pt(17));
    const faceW = dist(pt(234), pt(454));
    const wRatio = lipW / (faceW || 1);
    const hRatio = lipH / (lipW || 1);
    if (wRatio > 0.48 && hRatio > 0.30) return 'full';
    if (hRatio < 0.20 || wRatio < 0.36) return 'thin';
    return 'medium';
  }

  // ══════════════════════════════════════════════════════════════
  // SÉLECTION DES PRODUITS
  // ══════════════════════════════════════════════════════════════

  function selectTeint(profile) {
    const { skinType, redness, pores } = profile;
    const products = [];
    let tip = '';

    if (skinType === 'sensible' || redness > 48) {
      products.push({ ...DB.cc, _key: 'cc' });
      tip = 'Ta peau a besoin de douceur. Cette CC crème corrige et apaise.';
    } else if (skinType === 'grasse' || skinType === 'mixte') {
      products.push({ ...DB.fdt_matte, _key: 'fdt_matte' });
      tip = 'Fond de teint mat pour contrôler les brillances.';
      if (pores < 48) {
        products.push({ ...DB.poudre, _key: 'poudre' });
      }
    } else if (skinType === 'seche') {
      products.push({ ...DB.fdt_dewy, _key: 'fdt_dewy' });
      tip = 'Fond de teint lumineux pour booster ton éclat.';
    } else {
      products.push({ ...DB.bb, _key: 'bb' });
      tip = 'Ta peau est belle ! Une CC crème légère suffit.';
    }

    return { products, tip };
  }

  function selectLevres(profile) {
    const key = `${profile.undertone}_${profile.lipShape}`;
    const product = DB.lips[key] || DB.lips[`${profile.undertone}_medium`] || DB.lips.neutral_medium;

    const tips = {
      full: 'Applique directement. Tes lèvres sont parfaites !',
      thin: 'Utilise le liner pour redessiner le contour.',
      medium: 'Application directe pour un rendu naturel.'
    };

    return {
      products: [product],
      tip: tips[profile.lipShape] || tips.medium
    };
  }

  function selectYeux(profile) {
    const { eyeShape } = profile;
    const products = [];
    let tip = '';

    let mascaraKey = eyeShape === 'round' ? 'lengthening'
                   : eyeShape === 'narrow' ? 'opening'
                   : 'volumizing';

    products.push({ ...DB.mascara[mascaraKey], _mascType: mascaraKey });

    if (eyeShape === 'narrow' || eyeShape === 'round') {
      products.push({ ...DB.liner });
      tip = 'L\'eyeliner va agrandir ton regard.';
    } else {
      tip = 'Mascara seul pour un look naturel.';
    }

    return { products, tip };
  }

  function selectSourcils(profile) {
    const { faceShape } = profile;

    const shapes = {
      round: { p: DB.brow.pencil, tip: 'Dessine un arc doux pour allonger le visage.' },
      square: { p: DB.brow.gel, tip: 'Gel pour un effet naturel qui adoucit.' },
      heart: { p: DB.brow.pencil, tip: 'Sourcils peu arqués pour équilibrer.' },
      long: { p: DB.brow.pomade, tip: 'Sourcils droits pour créer de la largeur.' },
      oval: { p: DB.brow.gel, tip: 'Gel naturel, ton visage est polyvalent !' }
    };

    const entry = shapes[faceShape] || shapes.oval;
    return { products: [entry.p], tip: entry.tip };
  }

  function selectAnticerne(profile) {
    if (!profile.cernes?.detected) return null;
    return { products: [DB.concealer], tip: 'Tapote délicatement sous les yeux.' };
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU CARTE PRODUIT PREMIUM
  // ══════════════════════════════════════════════════════════════

  function renderCard(product, index) {
    if (!product) return '';

    const buyUrl = product.amazonUrl || `https://www.amazon.fr/s?k=${encodeURIComponent(product.brand + ' ' + product.name)}`;
    const dupeUrl = product.dupe?.amazonUrl || '';
    const image = product.image || 'assets/placeholder.jpg';
    const dupeImage = product.dupe?.image || 'assets/placeholder.jpg';

    return `
      <article class="premium-card" style="animation-delay:${index * 0.08}s">
        <a href="${buyUrl}" target="_blank" rel="noopener nofollow sponsored" class="premium-card-link">

          <div class="premium-card-image-wrap">
            <div class="premium-card-glow"></div>
            <img src="${image}" alt="${product.name}" class="premium-card-image" loading="lazy">
          </div>

          <div class="premium-card-content">
            <span class="premium-card-brand">${product.brand}</span>
            <h3 class="premium-card-name">${product.name}</h3>

            ${product.shade ? `<p class="premium-card-shade">✦ ${product.shade}</p>` : ''}

            <ul class="premium-card-benefits">
              ${(product.benefits || []).map(b => `<li>${b}</li>`).join('')}
            </ul>

            <div class="premium-card-footer">
              <span class="premium-card-price">${product.price} €</span>
              <span class="premium-card-cta">Acheter sur Amazon →</span>
            </div>
          </div>

        </a>

        ${product.dupe ? `
        <div class="premium-dupe">
          <button class="premium-dupe-toggle" onclick="MakeupRoutine.toggleDupe(this); event.preventDefault(); event.stopPropagation();">
            💡 Alternative à ${product.dupe.price} €
          </button>
          <div class="premium-dupe-panel" style="display:none;">
            <a href="${dupeUrl}" target="_blank" rel="noopener nofollow sponsored" class="premium-dupe-link">
              <img src="${dupeImage}" alt="${product.dupe.name}" class="premium-dupe-image">
              <div class="premium-dupe-info">
                <span class="premium-dupe-brand">${product.dupe.brand}</span>
                <span class="premium-dupe-name">${product.dupe.name}</span>
                <ul class="premium-dupe-benefits">
                  ${(product.dupe.benefits || []).map(b => `<li>${b}</li>`).join('')}
                </ul>
                <span class="premium-dupe-price">${product.dupe.price} € →</span>
              </div>
            </a>
          </div>
        </div>` : ''}
      </article>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU SECTION
  // ══════════════════════════════════════════════════════════════

  function renderSection(title, icon, tip, productsHtml) {
    return `
      <section class="premium-section">
        <div class="premium-section-header">
          <span class="premium-section-icon">${icon}</span>
          <h2 class="premium-section-title">${title}</h2>
        </div>
        ${tip ? `<p class="premium-section-tip">${tip}</p>` : ''}
        <div class="premium-cards-grid">
          ${productsHtml}
        </div>
      </section>`;
  }

  // ══════════════════════════════════════════════════════════════
  // PROFIL SIMPLIFIÉ
  // ══════════════════════════════════════════════════════════════

  function renderProfile(profile) {
    const labels = {
      faceShape: { oval: 'Ovale', round: 'Rond', square: 'Carré', heart: 'Cœur', long: 'Allongé' },
      undertone: { warm: 'Chaud', cool: 'Froid', neutral: 'Neutre' },
      skinType: { grasse: 'Grasse', mixte: 'Mixte', seche: 'Sèche', sensible: 'Sensible', normale: 'Normale' }
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
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════

  function render(container, profile) {
    const anticerne = selectAnticerne(profile);
    const teint = selectTeint(profile);
    const levres = selectLevres(profile);
    const yeux = selectYeux(profile);
    const sourcils = selectSourcils(profile);

    const teintCards = teint.products.map((p, i) => renderCard(p, i)).join('');
    const levresCards = levres.products.map((p, i) => renderCard(p, i)).join('');
    const yeuxCards = yeux.products.map((p, i) => renderCard(p, i)).join('');
    const sourcilsCards = sourcils.products.map((p, i) => renderCard(p, i)).join('');
    const anticerneCards = anticerne ? anticerne.products.map((p, i) => renderCard(p, i)).join('') : '';

    container.innerHTML = `
      <div class="premium-routine">

        <header class="premium-header">
          <span class="premium-tag">Ta sélection personnalisée</span>
          <h1 class="premium-title">Routine Make-up</h1>
          <p class="premium-subtitle">Produits choisis selon ton visage et tes couleurs</p>
        </header>

        ${renderProfile(profile)}

        ${anticerne ? renderSection('Anti-cernes', '◉', anticerne.tip, anticerneCards) : ''}
        ${renderSection('Teint', '◇', teint.tip, teintCards)}
        ${renderSection('Lèvres', '❋', levres.tip, levresCards)}
        ${renderSection('Yeux', '○', yeux.tip, yeuxCards)}
        ${renderSection('Sourcils', '⬡', sourcils.tip, sourcilsCards)}

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

    const photo = AppState.face.photo;
    let analysis = AppState.face.skinAnalysis;

    if (!analysis && photo) {
      container.innerHTML = `
        <div class="premium-loading">
          <div class="premium-loading-spinner"></div>
          <p>Analyse en cours...</p>
        </div>`;

      try {
        if (window._glowFaceLandmarker) {
          const img = new Image();
          img.src = photo;
          await new Promise(r => { img.onload = r; });
          const result = window._glowFaceLandmarker.detect(img);
          if (result?.faceLandmarks?.length) {
            AppState.face.landmarks = result.faceLandmarks[0];
          }
        }
        analysis = AppState.face.skinAnalysis;
      } catch (e) {
        console.warn('[MakeupRoutine] Analyse:', e);
      }
    }

    const lm = AppState.face.landmarks;
    const W = 640, H = 480;

    const zones = analysis?.zones || {};
    const zoneVals = Object.values(zones);
    const avg = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 60;

    const profile = {
      faceShape: analysis?.faceShape?.shape || 'oval',
      skinType: analysis?.skinType?.type || AppState.questionnaire.answers?.skinType || 'normale',
      undertone: analysis?.undertone?.type || 'neutral',
      eyeShape: lm ? detectEyeShape(lm, W, H) : 'almond',
      lipShape: lm ? detectLipShape(lm, W, H) : 'medium',
      cernes: analysis?.cernes || null,
      redness: avg(zoneVals.map(z => z.redness || 50)),
      pores: avg(zoneVals.map(z => z.pores || 60))
    };

    render(container, profile);
  }

  function toggleDupe(btn) {
    const card = btn.closest('.premium-card') || btn.closest('.premium-dupe');
    const panel = card.querySelector('.premium-dupe-panel');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? `💡 Alternative à ${btn.dataset.price || ''} €` : '✕ Fermer';
  }

  return { initScreen, toggleDupe };

})();
