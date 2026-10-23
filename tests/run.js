// Lance tous les tests automatiques : npm test  (aucun réseau, aucune clé nécessaire)
const { spawnSync } = require('child_process');
const path = require('path');
const files = ['dupes.test.js', 'guard.test.js', 'admin.test.js', 'account.test.js', 'routes.test.js', 'scanmath.test.js'];
let bad = 0;
files.forEach(f => {
  console.log('\n════════ ' + f + ' ════════');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
});
console.log('\n' + (bad ? '❌ ' + bad + ' fichier(s) de tests en échec' : '✅ TOUS LES TESTS PASSENT'));
process.exit(bad ? 1 : 0);
