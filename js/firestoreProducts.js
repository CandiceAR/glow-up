/* ============================================================
   firestoreProducts.js — Catalogue produits sur Firestore
   Remplace la sauvegarde GitHub + les rebuilds Netlify
   ============================================================ */

'use strict';

const FirestoreProducts = (() => {

  const FIREBASE_CONFIG = {
    apiKey:        'AIzaSyDrpKPZf8qA_M86pOlChzBbOddGjGQoYiM',
    authDomain:    'glow-up-9f0d2.firebaseapp.com',
    projectId:     'glow-up-9f0d2',
    storageBucket: 'glow-up-9f0d2.firebasestorage.app'
  };

  function _db() {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    return firebase.firestore();
  }

  // ─── Charger tous les produits ────────────────────────────────
  async function loadAll() {
    const db = _db();
    if (!db) return null;
    try {
      const snap = await db.collection('products').get();
      if (snap.empty) return null;
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.warn('[FirestoreProducts] loadAll:', e.message);
      return null;
    }
  }

  // ─── Sauvegarder un produit ───────────────────────────────────
  async function save(product) {
    const db = _db();
    if (!db || !product?.id) return;
    try {
      await db.collection('products').doc(product.id).set(product);
      console.log('[FirestoreProducts] Produit sauvegardé ✓', product.id);
    } catch (e) {
      console.warn('[FirestoreProducts] save:', e.message);
    }
  }

  // ─── Supprimer un produit ─────────────────────────────────────
  async function remove(id) {
    const db = _db();
    if (!db || !id) return;
    try {
      await db.collection('products').doc(id).delete();
      console.log('[FirestoreProducts] Produit supprimé ✓', id);
    } catch (e) {
      console.warn('[FirestoreProducts] remove:', e.message);
    }
  }

  // ─── Migration one-time : importe le JSON existant ────────────
  async function migrateFromJSON(products) {
    const db = _db();
    if (!db || !products?.length) return;
    try {
      const batch = db.batch();
      products.forEach(p => {
        if (p.id) batch.set(db.collection('products').doc(p.id), p);
      });
      await batch.commit();
      console.log('[FirestoreProducts] Migration OK —', products.length, 'produits importés');
    } catch (e) {
      console.warn('[FirestoreProducts] migrateFromJSON:', e.message);
    }
  }

  return { loadAll, save, remove, migrateFromJSON };

})();
