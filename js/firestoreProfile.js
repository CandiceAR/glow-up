/* ============================================================
   firestoreProfile.js — Sauvegarde du profil utilisateur sur Firestore
   Permet la synchronisation cross-device (téléphone ↔ ordi)
   ============================================================ */

'use strict';

const FirestoreProfile = (() => {

  let db = null;

  function init(firestoreInstance) {
    db = firestoreInstance;
    console.log('[FirestoreProfile] Firestore initialisé ✓');
  }

  // ─── Sauvegarder le profil sur Firestore ─────────────────────
  async function save(uid, profileData) {
    if (!db || !uid) return;
    try {
      await db.collection('users').doc(uid).set({
        profile:   profileData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('[FirestoreProfile] Profil sauvegardé sur Firestore ✓');
    } catch (e) {
      console.warn('[FirestoreProfile] Erreur save:', e.message);
    }
  }

  // ─── Charger le profil depuis Firestore ──────────────────────
  async function load(uid) {
    if (!db || !uid) return null;
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists && doc.data().profile) {
        console.log('[FirestoreProfile] Profil chargé depuis Firestore ✓');
        return doc.data().profile;
      }
      return null;
    } catch (e) {
      console.warn('[FirestoreProfile] Erreur load:', e.message);
      return null;
    }
  }

  return { init, save, load };

})();
