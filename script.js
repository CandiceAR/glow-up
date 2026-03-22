/* ============================================================
   GLOW UP — App Logic
   ============================================================ */

// ===== CATALOGUE =====

const PRODUCTS = [];

// ===== STATE =====

let cart = JSON.parse(localStorage.getItem('glowup_cart') || '[]');
let currentFilter = 'all';
const selectedFormats = {};
PRODUCTS.forEach(p => { selectedFormats[p.id] = p.defaultSize; });

// ===== NAVIGATION =====

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById('view-' + id);
  if (view) view.classList.add('active');

  const link = document.querySelector(`.nav-link[onclick*="${id}"]`);
  if (link) link.classList.add('active');

  document.getElementById('navLinks')?.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (id === 'shop') renderShop();
}

// Hamburger
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('navLinks')?.classList.toggle('open');
});

// ===== RENDER CARD =====

function renderCard(p) {
  return `
    <div class="product-card" onclick="openProduct(${p.id})">
      <div class="card-img">
        <div class="card-img-inner" style="background:${p.bg}">${p.emoji}</div>
        ${p.badge ? `<div class="card-badge">${p.badge}</div>` : ''}
      </div>
      <div class="card-body">
        <div class="card-cat">${p.catLabel}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-desc">${p.desc}</div>
        <div class="card-footer">
          <div class="card-price">${p.price} €</div>
          <button class="card-add" onclick="event.stopPropagation(); quickAdd(${p.id})" title="Ajouter au panier" aria-label="Ajouter ${p.name} au panier">+</button>
        </div>
      </div>
    </div>
  `;
}

// ===== HOME FEATURED =====

function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  grid.innerHTML = PRODUCTS.filter(p => p.featured).map(renderCard).join('');
}

// ===== SHOP =====

function renderShop() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  const list = currentFilter === 'all'
    ? PRODUCTS
    : PRODUCTS.filter(p => p.cat === currentFilter);

  if (!list.length) {
    grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:48px 0; color:var(--muted)">Aucun produit dans cette catégorie.</p>`;
    return;
  }
  grid.innerHTML = list.map(renderCard).join('');
}

function filterShop(cat) {
  currentFilter = cat;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  renderShop();
}

document.getElementById('filterTabs')?.addEventListener('click', e => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;
  filterShop(tab.dataset.cat);
});

// ===== PRODUCT MODAL =====

function openProduct(id) {
  const p = PRODUCTS.find(p => p.id === id);
  if (!p) return;

  const starsStr = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));

  document.getElementById('productModalBody').innerHTML = `
    <div class="modal-img" style="background:${p.bg}">${p.emoji}</div>
    <div class="modal-info">
      <div class="modal-cat">${p.catLabel}</div>
      <h2 class="modal-name">${p.name}</h2>
      <div class="modal-rating">
        <span class="stars">${starsStr}</span>
        <span class="rating-meta">${p.rating} · ${p.reviews} avis</span>
      </div>
      <p class="modal-desc">${p.desc}</p>
      <div class="modal-divider"></div>

      ${p.sizes.length > 1 ? `
        <div class="format-label">Format</div>
        <div class="format-options" id="modalFormats">
          ${p.sizes.map(s => `
            <button class="format-btn ${s === selectedFormats[p.id] ? 'selected' : ''}"
              onclick="selectFormat(${p.id}, '${s}', this)">${s}</button>
          `).join('')}
        </div>
      ` : `<p style="font-size:0.84rem;color:var(--muted);margin-bottom:24px">${p.defaultSize}</p>`}

      <div class="modal-price-row">
        <div class="modal-price">${p.price} €</div>
      </div>
      <button class="btn-modal-add" id="modalAddBtn" onclick="addToCart(${p.id}); feedbackAdded(this)">
        Ajouter au panier
      </button>

      <div class="ingredients-row">
        <div class="ingredients-toggle" onclick="toggleIngredients(this)">
          <span>Composition INCI</span>
          <span>+</span>
        </div>
        <div class="ingredients-body">${p.ingredients}</div>
      </div>
    </div>
  `;

  document.getElementById('productOverlay').classList.add('open');
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProduct() {
  document.getElementById('productOverlay').classList.remove('open');
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
}

function selectFormat(productId, size, btn) {
  selectedFormats[productId] = size;
  document.querySelectorAll('#modalFormats .format-btn')
    .forEach(b => b.classList.toggle('selected', b === btn));
}

function toggleIngredients(el) {
  const body = el.nextElementSibling;
  body.classList.toggle('open');
  el.querySelector('span:last-child').textContent = body.classList.contains('open') ? '−' : '+';
}

function feedbackAdded(btn) {
  btn.textContent = '✓ Ajouté !';
  btn.classList.add('added');
  setTimeout(() => {
    btn.textContent = 'Ajouter au panier';
    btn.classList.remove('added');
  }, 1800);
}

// ===== CART =====

function addToCart(productId) {
  const p = PRODUCTS.find(p => p.id === productId);
  if (!p) return;

  const size = selectedFormats[productId] || p.defaultSize;
  const idx = cart.findIndex(i => i.productId === productId && i.size === size);

  if (idx >= 0) {
    cart[idx].qty += 1;
  } else {
    cart.push({ productId, size, qty: 1 });
  }

  saveCart();
  updateBadge();
  openCart();
}

function quickAdd(productId) {
  addToCart(productId);
}

function removeFromCart(productId, size) {
  cart = cart.filter(i => !(i.productId === productId && i.size === size));
  saveCart();
  renderCartItems();
  updateBadge();
}

function changeQty(productId, size, delta) {
  const item = cart.find(i => i.productId === productId && i.size === size);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(productId, size);
    return;
  }
  saveCart();
  renderCartItems();
  updateBadge();
}

function saveCart() {
  localStorage.setItem('glowup_cart', JSON.stringify(cart));
}

function updateBadge() {
  const total = cart.reduce((n, i) => n + i.qty, 0);
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
}

function openCart() {
  renderCartItems();
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartDrawer').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  const foot = document.getElementById('cartFoot');

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛍️</div>
        <p>Ton panier est vide.<br>Découvre nos produits !</p>
        <button class="btn btn-outline" onclick="closeCart(); showView('shop')" style="margin-top:8px; font-size:0.82rem; padding:10px 22px">
          Voir la boutique
        </button>
      </div>
    `;
    foot.innerHTML = '';
    return;
  }

  container.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(p => p.id === item.productId);
    if (!p) return '';
    const lineTotal = (p.price * item.qty).toFixed(0);
    return `
      <div class="cart-item">
        <div class="cart-thumb" style="background:${p.bg}">${p.emoji}</div>
        <div class="cart-info">
          <div class="cart-item-cat">${p.catLabel}</div>
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-size">${item.size}</div>
          <button class="cart-remove" onclick="removeFromCart(${item.productId}, '${item.size}')">Retirer</button>
        </div>
        <div class="cart-right">
          <div class="cart-line-price">${lineTotal} €</div>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="changeQty(${item.productId}, '${item.size}', -1)" aria-label="Diminuer">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" onclick="changeQty(${item.productId}, '${item.size}', 1)" aria-label="Augmenter">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const subtotal = cart.reduce((sum, i) => {
    const p = PRODUCTS.find(p => p.id === i.productId);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);

  const freeShipping = subtotal >= 60;

  foot.innerHTML = `
    <div class="cart-subtotal">
      <span>Sous-total</span>
      <strong>${subtotal.toFixed(0)} €</strong>
    </div>
    <div class="cart-ship-note">
      ${freeShipping
        ? '✓ Livraison offerte !'
        : `Plus que ${(60 - subtotal).toFixed(0)} € pour la livraison offerte`}
    </div>
    <button class="btn-checkout" onclick="checkout()">Finaliser la commande →</button>
  `;
}

function checkout() {
  alert('Paiement sécurisé — Connexion Stripe en cours d\'intégration.');
}

// ===== INIT =====

function init() {
  renderFeatured();
  updateBadge();
}

init();
