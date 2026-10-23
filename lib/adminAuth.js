/* ============================================================
   lib/adminAuth.js — Accès ADMINISTRATRICE aux routes sensibles (modifier le catalogue, déposer des images…).
   Principe : la personne s'identifie avec son compte Firebase (Google ou e-mail), l'appli envoie son jeton dans
   le corps de la demande (idToken), et le SERVEUR vérifie :
     1. le jeton est authentique (signé par Firebase) ;
     2. l'adresse e-mail est confirmée (email_verified) ;
     3. cette adresse figure dans la variable Vercel ADMIN_EMAILS (séparées par des virgules).
   Le mot de passe écrit dans le code ne protège rien : le dépôt est public. Ici, rien de secret dans le code.
   Si ADMIN_EMAILS n'est pas configurée : tout est refusé (503), jamais ouvert par défaut.
   Une limite par IP s'applique avant tout (lib/aiGuard.js).
   ============================================================ */
'use strict';

const fb = require('./fb.js');
const AI = require('./aiGuard.js');

const adminEmails = () => String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Retourne { email } si la demande vient de l'administratrice ; sinon répond (401 / 403 / 429 / 503) et retourne null.
async function requireAdmin(req, res) {
  if (!(await AI.guard(req, res, 'admin', {}))) return null;
  const allowed = adminEmails();
  if (!allowed.length) {
    res.status(503).json({ error: 'admin-not-configured', message: 'Accès administrateur non configuré (variable ADMIN_EMAILS manquante côté serveur).' });
    return null;
  }
  const token = req.body && req.body.idToken;
  const auth = fb.getAuth();
  if (!auth || !token || typeof token !== 'string' || token.length > 4000) {
    res.status(401).json({ error: 'login', message: 'Connecte-toi avec ton compte administrateur.' });
    return null;
  }
  let d;
  try { d = await auth.verifyIdToken(token); }
  catch (e) { res.status(401).json({ error: 'login', message: 'Connexion expirée : reconnecte-toi.' }); return null; }
  const email = String(d.email || '').toLowerCase();
  if (!d.email_verified || !email || allowed.indexOf(email) < 0) {
    res.status(403).json({ error: 'forbidden', message: 'Ce compte n\'a pas accès à l\'administration.' });
    return null;
  }
  return { email };
}

module.exports = { requireAdmin, _adminEmails: adminEmails };
