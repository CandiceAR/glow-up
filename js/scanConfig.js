/* ============================================================
   scanConfig.js — Tous les réglages du scan peau « Face ID » (un seul endroit à ajuster)
   Chaque seuil est commenté. Les valeurs marquées « À CALIBRER » sont des points de départ :
   la page /lab/scan.html affiche les mesures en direct pour les régler sur ton téléphone.
   ============================================================ */
window.ScanConfig = {

  // ─── Caméra ────────────────────────────────────────────────
  VIDEO: { width: 1920, height: 1080 },        // résolution demandée (un iPhone en portrait donne 1080×1920)

  // ─── Contrôle avant le scan (anneau rouge → orange → vert) ─
  CHECK: {
    sampleWidth: 160,         // largeur (px) de l'image réduite sur laquelle on mesure lumière et netteté
    faceWidthMin: 0.45,       // le visage doit occuper au moins 45 % de la largeur de l'image (sinon : « rapproche-toi »)
    faceWidthMax: 0.92,       // … et au plus 92 % (sinon : « recule »)
    centerMaxOffset: 0.18,    // décalage maximal du nez par rapport au centre (fraction de la largeur)
    tiltMaxDeg: 12,           // inclinaison maximale de la tête
    yawMaxDeg: 10,            // avant le scan, la tête doit regarder droit devant (± 10°)
    lumMin: 70,               // luminosité minimale du visage (0–255)                 — À CALIBRER
    lumMax: 205,              // luminosité maximale (au-delà : trop de lumière)       — À CALIBRER
    lrDiffMax: 0.22,          // écart max entre moitié gauche et droite (fraction)    — À CALIBRER
    sharpMin: 12,             // netteté minimale (variance du Laplacien, voir page)   — À CALIBRER
    greenScore: 80,           // score ≥ 80 et aucun défaut → anneau vert
    orangeScore: 50,          // score ≥ 50 → orange, en dessous → rouge
    holdMs: 1500,             // l'anneau doit rester vert 1,5 s avant le départ automatique
    timeoutMs: 15000          // sans anneau vert au bout de 15 s → message d'aide (« Réessayer » / « Continuer sans le scan »)
  },

  // ─── Capture (rotation de la tête) ─────────────────────────
  CAPTURE: {
    yawTargetDeg: 28,         // angle à atteindre de chaque côté (gauche puis droite)
    maxMs: 14000,             // durée maximale de la rotation
    maxYawSpeed: 100,         // vitesse max (°/s) : au-delà, on demande d'aller plus doucement
    partialMinDeg: 18,        // si le temps est écoulé : on accepte si chaque côté a atteint au moins 18°
    binDeg: 5,                // les images sont rangées par tranches de 5° d'angle
    binMaxDeg: 45,            // au-delà de ± 45°, on ne garde rien
    framesPerBin: 3,          // on garde les 3 images les plus nettes de chaque tranche
    faceCropMaxWidth: 900,    // largeur max (px) de l'image du visage gardée en mémoire (limite la mémoire)
    storeSharpMin: 6,         // netteté minimale pour garder une image                — À CALIBRER
    voiceEverySpeedMs: 4000,  // « un peu plus doucement » au plus toutes les 4 s
    maxRestarts: 1            // une relance automatique si la rotation est ratée
  },

  // ─── Choix des images et des gros plans ────────────────────
  ZONES_RULES: {
    outSize: 512,             // taille (px) des gros plans finaux
    evalSize: 192,            // taille (px) des gros plans servant à comparer les images (plus rapide)
    faceYawMax: 8,            // « image de face » = angle entre −8° et +8°
    rasanteMinAbsYaw: 10,     // « image rasante » = au moins 10° de rotation
    maxYaw: 35,               // une joue ou un sillon n'est pas utilisé quand la tête le cache (au-delà de 35°)
    minSkinFraction: 0.35,    // au moins 35 % de peau dans le gros plan
    lumRange: [40, 235],      // luminosité acceptable du gros plan
    rasanteBlurRatio: 0.5,    // l'image rasante doit être au moins 50 % aussi nette que la médiane (évite le flou de mouvement)
    averageFrames: 3,         // moyenne de 3 images voisines alignées (réduit le bruit de la caméra)
    averageYawTol: 6,         // « voisines » = à moins de 6° d'écart
    texFine: 1, texCoarse: 4  // rayons (px, à evalSize) des deux flous qui isolent les détails fins
  },

  // ─── Couleurs : blanc de l'œil comme référence ─────────────
  WB: {
    gainMin: 0.7, gainMax: 1.4,    // la correction ne dépasse jamais ×0,7 … ×1,4
    scleraLumMin: 140,             // un pixel « blanc de l'œil » est plus clair que 140…
    scleraLumMax: 248,             // … moins clair que 248 (exclut les reflets)
    scleraSatMax: 0.30,            // … et peu coloré
    scleraMinPixels: 20,           // moins de 20 pixels : on ne corrige pas
    lightWarmMax: 0.70,            // rapport bleu/rouge du blanc de l'œil < 0,70 → lumière artificielle chaude — À CALIBRER
    lightCoolMin: 1.10             // > 1,10 → lumière artificielle froide                                    — À CALIBRER
  },

  // ─── Voix ──────────────────────────────────────────────────
  VOICE_PREFERRED: ['Amélie', 'Audrey', 'Aurélie', 'Marie', 'Thomas'],   // ordre de préférence (sinon 1re voix française)

  // ─── Les 10 zones ──────────────────────────────────────────
  // « gauche / droite » = côté gauche / droit de l'IMAGE (comme dans le reste de l'appli).
  // at : repères MediaPipe dont on prend la moyenne · dx, dy : décalage (× largeur du visage) · size : côté du carré (× largeur du visage)
  // side : 'L' / 'R' = zone cachée quand la tête se tourne trop de ce côté.
  ZONES: [
    { key: 'front',      label: 'Front',              at: [10, 9],       dx: 0,     dy: 0,    size: 0.55 },
    { key: 'glabelle',   label: 'Entre les sourcils', at: [9, 8, 168],   dx: 0,     dy: 0,    size: 0.26 },
    { key: 'yeux_g',     label: 'Contour œil gauche', at: [33, 133, 159, 145],  dx: 0, dy: 0.05, size: 0.36, side: 'L' },
    { key: 'yeux_d',     label: 'Contour œil droit',  at: [263, 362, 386, 374], dx: 0, dy: 0.05, size: 0.36, side: 'R' },
    { key: 'joue_g',     label: 'Joue gauche',        at: [50, 205],     dx: 0.05,  dy: 0.03, size: 0.34, side: 'L' },
    { key: 'joue_d',     label: 'Joue droite',        at: [280, 425],    dx: -0.05, dy: 0.03, size: 0.34, side: 'R' },
    { key: 'nez',        label: 'Nez',                at: [6, 1],        dx: 0,     dy: 0,    size: 0.30 },
    { key: 'sillon_g',   label: 'Sillon gauche',      at: [129, 61],     dx: -0.05, dy: 0,    size: 0.26, side: 'L' },
    { key: 'sillon_d',   label: 'Sillon droit',       at: [358, 291],    dx: 0.05,  dy: 0,    size: 0.26, side: 'R' },
    { key: 'menton',     label: 'Menton',             at: [17, 152],     dx: 0,     dy: 0,    size: 0.34 }
  ],

  // ─── Repères MediaPipe (contours, dans l'ordre) pour exclure yeux, sourcils, lèvres, cheveux ──
  LM: {
    FACE_OVAL: [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
    LIPS_OUTER: [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146],
    EYE_L: [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
    EYE_R: [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],
    BROW_L: [70,63,105,66,107,55,65,52,53,46],
    BROW_R: [300,293,334,296,336,285,295,282,283,276]
  }
};
