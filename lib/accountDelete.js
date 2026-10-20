/* ============================================================
   lib/accountDelete.js — Détache un compte de ses données (suppression de compte).
   Appelé par api/createCheckout.js avec { mode: 'deleteAccount', idToken }.
   - Vérifie l'identité (jeton Firebase), jamais un uid envoyé par le navigateur.
   - Scans (scannedProducts) et produits ajoutés (userProducts) : le lien avec la personne
     est retiré (uid → null, e-mail supprimé s'il existe). Les informations produit
     (marque, nom…) restent : sans lien avec une personne, elles ne sont plus personnelles.
   - Le profil (users/{uid}) et le compte de connexion sont supprimés par l'appli ensuite.
   Idempotent : on peut le relancer sans risque.
   ============================================================ */
'use strict';

const COLLECTIONS = ['scannedProducts', 'userProducts'];
const BATCH_SIZE  = 400;

function _init() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;
  const { initializeApp, getApps, cert } = require('firebase-admin/app');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return {
    db:   require('firebase-admin/firestore').getFirestore(),
    auth: require('firebase-admin/auth').getAuth(),
    FieldValue: require('firebase-admin/firestore').FieldValue
  };
}

// Détache tous les documents d'une collection pour un champ donné (uid ou email)
async function _detach(db, FieldValue, coll, field, value) {
  let total = 0;
  for (;;) {
    const snap = await db.collection(coll).where(field, '==', value).limit(BATCH_SIZE).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { uid: null, email: FieldValue.delete() }));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_SIZE) return total;
  }
}

async function handle(body) {
  const idToken = body && body.idToken;
  if (!idToken || typeof idToken !== 'string') return { status: 400, json: { error: 'Jeton manquant' } };

  const fb = _init();
  if (!fb) return { status: 503, json: { error: 'Service indisponible' } };

  let decoded;
  try { decoded = await fb.auth.verifyIdToken(idToken); }
  catch (e) { return { status: 401, json: { error: 'Identité non vérifiée' } }; }

  try {
    let detached = 0;
    for (const coll of COLLECTIONS) {
      detached += await _detach(fb.db, fb.FieldValue, coll, 'uid', decoded.uid);
      // Anciens documents (avant que l'uid soit enregistré) : retrouvés par l'e-mail du compte
      if (decoded.email) detached += await _detach(fb.db, fb.FieldValue, coll, 'email', decoded.email);
    }
    return { status: 200, json: { ok: true, detached } };
  } catch (e) {
    console.error('[accountDelete] échec:', e.message);
    return { status: 500, json: { error: 'Suppression incomplète' } };
  }
}

module.exports = { handle };
