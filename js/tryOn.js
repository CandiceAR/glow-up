/* ============================================================
   tryOn.js — Virtual Try-On avec MediaPipe Face Landmarker
   Support multi-produits simultanés (foundation + blush + lipstick)
   GLOW UP Phase 0
   ============================================================ */

'use strict';

const TryOn = (() => {

  // ─── État interne ─────────────────────────────────────────────
  let faceLandmarker  = null;
  let landmarks       = null;
  let canvas          = null;
  let ctx             = null;
  let sourceImage     = null;
  let initialized     = false;
  let loading         = false;

  // Produits actifs par couche
  const layers = {
    foundation: null,
    blush:      null,
    lipstick:   null
  };

  // ─── Indices landmarks MediaPipe 478 ─────────────────────────
  // Contour lèvres supérieures + inférieures
  const LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
                     375, 321, 405, 314, 17, 84, 181, 91, 146];
  const LIP_UPPER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
  const LIP_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];

  // Joues (blush)
  const CHEEK_LEFT  = [234, 116, 111, 117, 118, 50, 101, 205, 36, 203, 206, 187, 123];
  const CHEEK_RIGHT = [454, 323, 345, 346, 347, 280, 352, 411, 425, 266, 423, 426, 427];

  // Contour visage complet (fond de teint)
  const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
                     361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
                     176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
                     162, 21, 54, 103, 67, 109];

  // ─── Initialisation MediaPipe ─────────────────────────────────
  async function init() {
    if (initialized || loading) return;
    loading = true;

    try {
      showTryOnLoading(true, 'Chargement du moteur de reconnaissance faciale…');

      const { FaceLandmarker, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
      );

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: false,
        runningMode: 'IMAGE',
        numFaces: 1
      });

      initialized = true;
      console.log('[TryOn] MediaPipe initialisé');
    } catch (err) {
      console.error('[TryOn] Erreur initialisation MediaPipe:', err);
      showTryOnError('Impossible de charger le moteur de maquillage virtuel. Vérifie ta connexion.');
    } finally {
      loading = false;
      showTryOnLoading(false);
    }
  }

  // ─── Initialiser l'écran try-on ───────────────────────────────
  function initTryOnScreen() {
    canvas    = document.getElementById('tryOnCanvas');
    ctx       = canvas?.getContext('2d');
    sourceImage = document.getElementById('tryOnSource');

    if (!AppState.face.photo) {
      showTryOnError('Commence par prendre ou uploader une photo de ton visage.');
      return;
    }

    // Afficher la photo source
    sourceImage.src = AppState.face.photo;
    sourceImage.onload = async () => {
      canvas.width  = sourceImage.naturalWidth;
      canvas.height = sourceImage.naturalHeight;

      await init();
      if (initialized) {
        await detectAndRender();
      }
    };

    renderProductSelector();
  }

  // ─── Détection faciale + rendu ────────────────────────────────
  async function detectAndRender() {
    if (!faceLandmarker || !sourceImage) return;

    try {
      showTryOnLoading(true, 'Détection du visage…');
      const results = faceLandmarker.detect(sourceImage);

      if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
        showTryOnError('Aucun visage détecté. Essaie avec une photo plus claire, de face.');
        return;
      }

      landmarks = results.faceLandmarks[0];
      AppState.face.landmarks = landmarks;
      console.log('[TryOn] Visage détecté:', landmarks.length, 'landmarks');

      renderAllLayers();
    } catch (err) {
      console.error('[TryOn] Erreur détection:', err);
      showTryOnError('Erreur lors de l\'analyse faciale.');
    } finally {
      showTryOnLoading(false);
    }
  }

  // ─── Rendre toutes les couches actives ────────────────────────
  function renderAllLayers() {
    if (!ctx || !canvas || !landmarks) return;

    // Copier l'image source sur le canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0);

    // Appliquer dans l'ordre : fond → blush → lèvres
    if (layers.foundation) applyFoundation(layers.foundation);
    if (layers.blush)      applyBlush(layers.blush);
    if (layers.lipstick)   applyLipstick(layers.lipstick);
  }

  // ─── Fond de teint ────────────────────────────────────────────
  function applyFoundation(product) {
    if (!product || !landmarks) return;
    const color = product.colorHex || '#F5DEB3';
    const pts   = getLandmarkPoints(FACE_OVAL);

    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, 0.35);
    ctx.fill();
    ctx.restore();
  }

  // ─── Blush ────────────────────────────────────────────────────
  function applyBlush(product) {
    if (!product || !landmarks) return;
    const color = product.colorHex || '#FF9E80';

    [CHEEK_LEFT, CHEEK_RIGHT].forEach(cheekPts => {
      const pts    = getLandmarkPoints(cheekPts);
      const center = centroid(pts);
      const radius = getRadius(pts, center) * 1.1;

      ctx.save();
      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
      gradient.addColorStop(0,   hexToRgba(color, 0.45));
      gradient.addColorStop(0.6, hexToRgba(color, 0.2));
      gradient.addColorStop(1,   hexToRgba(color, 0));

      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radius, radius * 0.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    });
  }

  // ─── Rouge à lèvres ───────────────────────────────────────────
  function applyLipstick(product) {
    if (!product || !landmarks) return;
    const color  = product.colorHex || '#CC0000';
    const finish = product.finish   || 'mat';

    drawLipShape(LIP_UPPER, color, finish);
    drawLipShape(LIP_LOWER, color, finish);
  }

  function drawLipShape(indices, color, finish) {
    const pts = getLandmarkPoints(indices);
    if (pts.length < 3) return;

    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, finish === 'brillant' ? 0.75 : 0.85);
    ctx.fill();

    // Effet brillant
    if (finish === 'brillant' || finish === 'satin') {
      const center = centroid(pts);
      const gradient = ctx.createRadialGradient(
        center.x, center.y - 5, 2,
        center.x, center.y - 5, 25
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0.4)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── Gestion des produits actifs ──────────────────────────────
  function addProduct(productId) {
    const p = AppState.products.catalog.find(x => x.id === productId);
    if (!p) return;

    const category = p.category;
    if (!['lipstick', 'blush', 'foundation', 'mascara'].includes(category)) return;

    // Mascara non géré visuellement en Phase 0 (pas de landmark cil)
    if (category === 'mascara') {
      showToast('Le mascara n\'est pas encore disponible en try-on — bientôt !', 'info');
      return;
    }

    const layerKey = category === 'lipstick' ? 'lipstick'
      : category === 'blush'      ? 'blush'
      : category === 'foundation' ? 'foundation' : null;

    if (!layerKey) return;

    layers[layerKey] = p;

    // Mettre à jour AppState
    AppState.products.tryOnActive = Object.values(layers).filter(Boolean);

    // Si on est sur l'écran try-on, re-render
    if (AppState.screen === 'tryon') {
      renderAllLayers();
      renderActiveProducts();
    }

    showToast(`${p.name} appliqué ! ✦`, 'success');
  }

  function removeProduct(category) {
    const layerKey = category === 'lipstick' ? 'lipstick'
      : category === 'blush'      ? 'blush'
      : category === 'foundation' ? 'foundation' : null;

    if (!layerKey) return;
    layers[layerKey] = null;
    AppState.products.tryOnActive = Object.values(layers).filter(Boolean);

    if (AppState.screen === 'tryon') {
      renderAllLayers();
      renderActiveProducts();
    }
  }

  function resetAll() {
    layers.foundation = null;
    layers.blush      = null;
    layers.lipstick   = null;
    AppState.products.tryOnActive = [];
    if (ctx && canvas && sourceImage) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceImage, 0, 0);
    }
    renderActiveProducts();
    showToast('Maquillage retiré', 'info');
  }

  // ─── Sélecteur de produits dans le panneau try-on ─────────────
  function renderProductSelector() {
    const panel = document.getElementById('tryOnPanel');
    if (!panel) return;

    const categories = [
      { key: 'lipstick',   label: 'Rouge à lèvres',  icon: '💄' },
      { key: 'blush',      label: 'Blush',            icon: '🌸' },
      { key: 'foundation', label: 'Fond de teint',    icon: '✨' }
    ];

    panel.innerHTML = `
      <div class="tryon-panel-header">
        <h3>Essai virtuel</h3>
        <button class="btn-ghost" onclick="TryOn.resetAll()">Tout retirer</button>
      </div>

      <div id="tryOnActive" class="tryon-active"></div>

      <div class="tryon-categories">
        ${categories.map(cat => {
          const products = ProductCatalog.getByCategory(cat.key);
          return `
            <div class="tryon-cat">
              <div class="tryon-cat-title">${cat.icon} ${cat.label}</div>
              <div class="tryon-products-scroll">
                ${products.map(p => `
                  <div class="tryon-product-chip ${layers[cat.key]?.id === p.id ? 'active' : ''}"
                       onclick="TryOn.addProduct('${p.id}')"
                       title="${p.name}">
                    ${p.colorHex
                      ? `<span class="chip-color" style="background:${p.colorHex}"></span>`
                      : `<img class="chip-img" src="${p.imageUrl}" alt="${p.name}" onerror="this.style.display='none'">`
                    }
                    <span class="chip-label">${p.shadeName || p.brand}</span>
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>

      <div class="tryon-footer">
        <button class="btn btn-dark full-width" onclick="goToFinalResult()">
          Voir le résultat final & acheter →
        </button>
      </div>`;

    renderActiveProducts();
  }

  function renderActiveProducts() {
    const el = document.getElementById('tryOnActive');
    if (!el) return;
    const active = Object.values(layers).filter(Boolean);
    if (active.length === 0) {
      el.innerHTML = '<p class="tryon-empty">Sélectionne des produits ci-dessous</p>';
      return;
    }
    el.innerHTML = `
      <div class="active-products">
        ${active.map(p => `
          <div class="active-chip">
            ${p.colorHex ? `<span class="chip-color-sm" style="background:${p.colorHex}"></span>` : ''}
            <span>${p.brand} — ${p.shadeName || p.name}</span>
            <button onclick="TryOn.removeProduct('${p.category}')">×</button>
          </div>`).join('')}
      </div>`;
  }

  // ─── Aller à l'écran résultat final ───────────────────────────
  function goToFinalResult() {
    renderFinalResult();
    showScreen('final');
  }

  function renderFinalResult() {
    const container = document.getElementById('finalContent');
    if (!container) return;

    const active = Object.values(layers).filter(Boolean);
    const productsHtml = active.map(p => ProductCatalog.renderCard(p, { showBuyButton: true })).join('');

    container.innerHTML = `
      <div class="final-header">
        <span class="section-tag">Ton look final</span>
        <h1>Résultat de ton essai</h1>
        <p>Voici les produits qui t'ont séduite. Retrouve-les sur Amazon.</p>
      </div>

      <div class="final-canvas-wrap">
        <canvas id="finalCanvas"></canvas>
      </div>

      <div class="final-products">
        <h2>Produits utilisés dans ce look</h2>
        <div class="products-grid">${productsHtml || '<p>Aucun produit sélectionné.</p>'}</div>
      </div>

      <div class="final-disclaimer">
        <p>🔗 Les liens Amazon utilisent notre code affilié <strong>kand10ar-21</strong>. Le prix que tu paies ne change pas — nous recevons une petite commission au même taux pour tous les produits, sans favoritisme.</p>
      </div>`;

    // Copier le canvas du try-on dans le canvas final
    const finalCanvas = document.getElementById('finalCanvas');
    if (finalCanvas && canvas) {
      finalCanvas.width  = canvas.width;
      finalCanvas.height = canvas.height;
      finalCanvas.getContext('2d').drawImage(canvas, 0, 0);
    }
  }

  // ─── Photo / Camera ───────────────────────────────────────────
  function setupCapture() {
    const uploadInput  = document.getElementById('photoUpload');
    const cameraBtn    = document.getElementById('cameraBtn');
    const cameraStream = document.getElementById('cameraStream');
    const captureBtn   = document.getElementById('captureBtn');

    if (uploadInput) {
      uploadInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          AppState.face.photo = ev.target.result;
          showCapturePreview(ev.target.result);
        };
        reader.readAsDataURL(file);
      });
    }

    if (cameraBtn) {
      cameraBtn.addEventListener('click', async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
          cameraStream.srcObject = stream;
          cameraStream.style.display = 'block';
          captureBtn.style.display = 'block';
          cameraBtn.style.display = 'none';

          captureBtn.onclick = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width  = cameraStream.videoWidth;
            tempCanvas.height = cameraStream.videoHeight;
            tempCanvas.getContext('2d').drawImage(cameraStream, 0, 0);
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92);
            AppState.face.photo = dataUrl;
            stream.getTracks().forEach(t => t.stop());
            cameraStream.style.display = 'none';
            captureBtn.style.display = 'none';
            cameraBtn.style.display = 'block';
            showCapturePreview(dataUrl);
          };
        } catch (err) {
          showToast('Accès caméra refusé. Utilise l\'upload de photo.', 'error');
        }
      });
    }
  }

  function showCapturePreview(dataUrl) {
    const preview   = document.getElementById('capturePreview');
    const previewEl = document.getElementById('capturePreviewImg');
    const nextBtn   = document.getElementById('captureNextBtn');
    if (preview && previewEl) {
      previewEl.src         = dataUrl;
      preview.style.display = 'block';
    }
    if (nextBtn) nextBtn.style.display = 'block';
    showToast('Photo prête ! Continue le questionnaire.', 'success');
  }

  // ─── Helpers géométriques ─────────────────────────────────────
  function getLandmarkPoints(indices) {
    if (!landmarks || !canvas) return [];
    return indices.map(i => ({
      x: landmarks[i].x * canvas.width,
      y: landmarks[i].y * canvas.height
    }));
  }

  function centroid(pts) {
    const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }

  function getRadius(pts, center) {
    return Math.max(...pts.map(p => Math.hypot(p.x - center.x, p.y - center.y)));
  }

  function hexToRgba(hex, alpha) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(0,0,0,${alpha})`;
    return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${alpha})`;
  }

  // ─── UI helpers ───────────────────────────────────────────────
  function showTryOnLoading(show, msg = '') {
    const el = document.getElementById('tryOnLoading');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    if (msg) el.querySelector('.loading-msg').textContent = msg;
  }

  function showTryOnError(msg) {
    const el = document.getElementById('tryOnError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  return {
    init, initTryOnScreen, addProduct, removeProduct, resetAll,
    setupCapture, goToFinalResult, renderFinalResult
  };

})();

// ─── Alias globaux pour onclick inline ───────────────────────
function goToFinalResult() { TryOn.goToFinalResult(); }
