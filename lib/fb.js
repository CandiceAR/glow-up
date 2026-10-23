/* ============================================================
   lib/fb.js — Accès serveur à Firebase (Firestore + Authentification), une seule fois par instance.
   Utilise la clé de compte de service FIREBASE_SERVICE_ACCOUNT (variable Vercel). Sans clé : tout est null,
   et les protections décrites dans lib/aiGuard.js passent en « mode dégradé » (jamais de crash).
   Les tests Node injectent une fausse base avec _set().
   ============================================================ */
'use strict';

let _state = null;

function init() {
  if (_state) return _state;
  _state = { db: null, auth: null, FieldValue: null };
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const { initializeApp, getApps, cert } = require('firebase-admin/app');
      if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
      const fs = require('firebase-admin/firestore');
      _state = { db: fs.getFirestore(), auth: require('firebase-admin/auth').getAuth(), FieldValue: fs.FieldValue };
    }
  } catch (e) { console.error('[fb] initialisation impossible :', e.message); }
  return _state;
}

module.exports = {
  getDb:  () => init().db,
  getAuth: () => init().auth,
  getFV:  () => init().FieldValue,
  _set(state) { _state = state; }     // tests uniquement
};
