/* ============================================================
   lib/accountDelete.js — Suppression d'un compte (Apple 5.1.1) : ce que fait le SERVEUR.
   Appelé par api/createCheckout.js avec { mode: 'deleteAccount', idToken }.
   - Vérifie l'identité (jeton Firebase), jamais un uid envoyé par le navigateur.
   - Scans (scannedProducts) et produits ajoutés (userProducts) : le lien avec la personne est retiré
     (uid → null, e-mail supprimé s'il existe). Les informations produit (marque, nom…) restent : sans lien avec une
     personne, elles ne sont plus personnelles.
   - Profil, routine, suivi et miniatures (users/{uid}) et compteurs d'usage (usage/{uid}) : SUPPRIMÉS ici.
     L'appli ne peut pas le faire elle-même : les règles Firestore autorisent lire / créer / modifier un profil, pas le
     supprimer (le serveur n'est pas soumis à ces règles).
   - Le compte de connexion (Firebase Auth) est supprimé ensuite par l'appli.
   Idempotent : on peut le relancer sans risque.
   ============================================================ */
'use strict';

const fb = require('./fb.js');

const COLLECTIONS = ['scannedProducts', 'userProducts'];
const BATCH_SIZE  = 400;

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

  const db = fb.getDb(), auth = fb.getAuth(), FieldValue = fb.getFV();
  if (!db || !auth || !FieldValue) return { status: 503, json: { error: 'Service indisponible' } };

  let decoded;
  try { decoded = await auth.verifyIdToken(idToken); }
  catch (e) { return { status: 401, json: { error: 'Identité non vérifiée' } }; }

  try {
    let detached = 0;
    for (const coll of COLLECTIONS) {
      detached += await _detach(db, FieldValue, coll, 'uid', decoded.uid);
      // Anciens documents (avant que l'uid soit enregistré) : retrouvés par l'e-mail du compte
      if (decoded.email) detached += await _detach(db, FieldValue, coll, 'email', decoded.email);
    }
    // Jeu concours : la participation et le pseudo réservé sont effacés avec le compte
    try {
      const ce = await db.collection('contestEntries').doc(decoded.uid).get();
      if (ce.exists) {
        const h = String((ce.data() || {}).instagram_handle || '').replace(/^@/, '');
        if (h) await db.collection('contestHandles').doc(h).delete();
        await db.collection('contestEntries').doc(decoded.uid).delete();
      }
    } catch (e) { console.error('[accountDelete] concours :', e.message); }
    // Suppression du profil et des compteurs (le serveur ignore les règles Firestore)
    await db.collection('users').doc(decoded.uid).delete();
    await db.collection('usage').doc(decoded.uid).delete();
    return { status: 200, json: { ok: true, detached, profileDeleted: true } };
  } catch (e) {
    console.error('[accountDelete] échec:', e.message);
    return { status: 500, json: { error: 'Suppression incomplète' } };
  }
}

module.exports = { handle };
