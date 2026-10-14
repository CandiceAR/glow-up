/* ============================================================
   scripts/purge-scan-emails.js — Retire le champ « email » des anciens scans (Firestore).
   Les scans restent reliés au compte par leur uid ; seul l'e-mail est supprimé.

   Trois étapes, à lancer dans cet ordre (rien n'est modifié avant l'étape 3) :
     1) node scripts/purge-scan-emails.js <cle.json> compter      → compte les documents (lecture seule)
     2) node scripts/purge-scan-emails.js <cle.json> sauvegarder  → exporte la collection dans backups/ (lecture seule)
     3) node scripts/purge-scan-emails.js <cle.json> supprimer    → retire le champ email (exige une sauvegarde du jour)

   <cle.json> = clé de compte de service Firebase (à garder HORS du dépôt, jamais commitée).
   Collection par défaut : scannedProducts. Pour ajouter userProducts (même défaut, écrits par
   « ma routine actuelle » et l'analyse de routine) : ajouter  --avec-userProducts  en fin de commande.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const [keyPath, action] = process.argv.slice(2);
const COLLECTIONS = ['scannedProducts'];
if (process.argv.includes('--avec-userProducts')) COLLECTIONS.push('userProducts');

if (!keyPath || !['compter', 'sauvegarder', 'supprimer'].includes(action)) {
  console.log('Usage : node scripts/purge-scan-emails.js <cle.json> compter|sauvegarder|supprimer [--avec-userProducts]');
  process.exit(1);
}
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const today = () => new Date().toISOString().slice(0, 10);
const backupFile = c => path.join(BACKUP_DIR, `${c}-${today()}.json`);

async function readAll(coll) {
  const snap = await db.collection(coll).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}

(async () => {
  for (const coll of COLLECTIONS) {
    const docs = await readAll(coll);
    const withEmail = docs.filter(d => Object.prototype.hasOwnProperty.call(d.data, 'email'));
    const withEmailValue = withEmail.filter(d => d.data.email);
    console.log(`\n[${coll}] ${docs.length} documents au total · ${withEmail.length} ont un champ « email » (dont ${withEmailValue.length} avec une adresse renseignée)`);

    if (action === 'sauvegarder') {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.writeFileSync(backupFile(coll), JSON.stringify({ collection: coll, exportedAt: new Date().toISOString(), count: docs.length, docs }, null, 1));
      console.log(`  ✔ sauvegarde écrite : ${backupFile(coll)}`);
    }

    if (action === 'supprimer') {
      // Garde-fou : une sauvegarde du jour, complète, doit exister
      let ok = false;
      try { const b = JSON.parse(fs.readFileSync(backupFile(coll), 'utf8')); ok = b.count >= docs.length; } catch (e) {}
      if (!ok) { console.log('  ✖ aucune sauvegarde complète du jour : lance d\'abord « sauvegarder ». Rien n\'a été modifié.'); process.exit(2); }
      for (let i = 0; i < withEmail.length; i += 400) {
        const batch = db.batch();
        withEmail.slice(i, i + 400).forEach(d => batch.update(db.collection(coll).doc(d.id), { email: FieldValue.delete() }));
        await batch.commit();
      }
      const after = (await readAll(coll)).filter(d => Object.prototype.hasOwnProperty.call(d.data, 'email')).length;
      console.log(`  ✔ champ email retiré de ${withEmail.length} documents · restant avec email : ${after}`);
    }
  }
})().catch(e => { console.error('Erreur :', e.message); process.exit(3); });
