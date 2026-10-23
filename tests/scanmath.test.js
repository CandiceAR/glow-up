// tests/scanmath.test.js — calculs du scan peau (angle de la tête, netteté, texture, couleurs, zones)
const M = require('../lib/scanMath.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'OK  ' : 'ECHEC ') + name + (extra ? '  → ' + extra : '')); };

// ── Angle de la tête : visage fabriqué tourné de θ degrés ──
function fakeFace(thetaDeg, W) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const th = thetaDeg * Math.PI / 180, half = 0.2;           // demi-largeur du visage = 0,2 de l'image
  // le bord 234 (gauche image) et 454 (droit image) tournent autour de l'axe vertical
  lm[234] = { x: 0.5 - half * Math.cos(th), y: 0.5, z: -half * Math.sin(th) };
  lm[454] = { x: 0.5 + half * Math.cos(th), y: 0.5, z: half * Math.sin(th) };
  lm[1]   = { x: 0.5 + 0.1 * Math.sin(th), y: 0.55, z: -0.1 * Math.cos(th) };   // nez : part vers la droite si th > 0
  lm[33]  = { x: 0.4, y: 0.45, z: 0 }; lm[263] = { x: 0.6, y: 0.45, z: 0 };
  return lm;
}
for (const t of [0, 15, 30, -30, 40]) {
  const y = M.yawDeg(fakeFace(t, 1080), 1080);
  ok('angle de la tête ' + t + '°', Math.abs(y - t) < 1.5, 'mesuré ' + y.toFixed(1) + '°');
}
// Float32Array compact : même résultat
const f = fakeFace(25, 1080), arr = new Float32Array(478 * 3);
f.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
ok('format compact identique', Math.abs(M.yawDeg(arr, 1080) - M.yawDeg(f, 1080)) < 1e-4);
ok('roulis 0° quand les yeux sont alignés', Math.abs(M.rollDeg(f, 1080, 1920)) < 0.01);

// ── Netteté et texture ──
const N = 96, rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function img(fn) { const g = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = fn(x, y); return g; }
const flat = img(() => 128);
const grain = img(() => 128 + (rnd() - 0.5) * 30);                       // peau avec détails fins
const blurry = M.boxBlur(grain, N, N, 3);                                 // même peau, floue
const lapFlat = M.laplacianVariance(flat, N, N), lapGrain = M.laplacianVariance(grain, N, N), lapBlur = M.laplacianVariance(blurry, N, N);
ok('image plate = netteté ~0', lapFlat < 1e-6, lapFlat.toFixed(4));
ok('image nette > image floue', lapGrain > lapBlur * 5, lapGrain.toFixed(1) + ' vs ' + lapBlur.toFixed(1));
const tG = M.textureContrast(grain, N, N, null, 1, 4), tB = M.textureContrast(blurry, N, N, null, 1, 4), tF = M.textureContrast(flat, N, N, null, 1, 4);
ok('texture : grain > flou > plat', tG > tB && tB >= tF, [tG, tB, tF].map(v => v.toFixed(4)).join(' > '));
// le masque « valid » exclut des pixels
const valid = new Uint8Array(N * N).fill(1); for (let i = 0; i < N * 30; i++) valid[i] = 0;
ok('masque : fonctionne', M.laplacianVariance(grain, N, N, valid) !== null);
// flou boîte : image constante inchangée
const bb = M.boxBlur(flat, N, N, 4); ok('flou boîte : constante conservée', Math.abs(bb[500] - 128) < 1e-3 && Math.abs(bb[0] - 128) < 1e-3);
// meanLum + toGray
const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 0]);
const gv = M.toGray(rgba, 3, 1);
ok('gris : rouge/vert + alpha', Math.abs(gv.gray[0] - 76.245) < 0.1 && gv.valid[2] === 0 && Math.abs(M.meanLum(gv.gray, gv.valid) - (76.245 + 149.685) / 2) < 0.1);

// ── Couleurs ──
const lim = { min: 0.7, max: 1.4 };
const warm = { r: 220, g: 200, b: 150 };                                   // blanc de l'œil jauni par une lampe chaude
const g = M.whiteBalanceGains(warm, lim);
ok('gains : le bleu est remonté, le rouge baissé', g.b > 1.2 && g.r < 1 && g.g === 1, JSON.stringify(g));
const after = { r: warm.r * g.r, g: warm.g * g.g, b: warm.b * g.b };
ok('gains : blanc devient neutre', Math.abs(after.r - after.g) < 1 && Math.abs(after.b - after.g) < 1);
ok('gains bornés', M.whiteBalanceGains({ r: 100, g: 200, b: 50 }, lim).r === 1.4 && M.whiteBalanceGains({ r: 100, g: 200, b: 50 }, lim).b === 1.4);
const th = { warmMax: 0.70, coolMin: 1.10 };
ok('lumière chaude', M.classifyLight({ r: 220, g: 180, b: 130 }, th).type === 'artificielle_chaude');
ok('lumière du jour', M.classifyLight({ r: 200, g: 195, b: 180 }, th).type === 'jour');
ok('lumière froide', M.classifyLight({ r: 180, g: 195, b: 215 }, th).type === 'artificielle_froide');

// ── Rangement par angle ──
ok('tranche 0° / 12° / −27° / 80°', M.binOf(0, 5, 45) === 0 && M.binOf(12, 5, 45) === 2 && M.binOf(-27, 5, 45) === -5 && M.binOf(80, 5, 45) === 9);
const list = [];
const r = (s) => ({ sharp: s });
ok('ajout 1', M.insertTop(list, r(5), 3, 'sharp') === null);
M.insertTop(list, r(9), 3, 'sharp'); M.insertTop(list, r(7), 3, 'sharp');
const ev = M.insertTop(list, r(8), 3, 'sharp');
ok('éjecte le moins net (5)', ev && ev.sharp === 5 && list.map(x => x.sharp).sort().join() === '7,8,9');
const rej = M.insertTop(list, r(1), 3, 'sharp');
ok('refuse une image trop floue', rej && rej.sharp === 1 && list.length === 3);

// ── Géométrie d'une zone ──
const face = fakeFace(0, 1080);
face[9] = { x: 0.5, y: 0.35, z: 0 }; face[10] = { x: 0.5, y: 0.2, z: 0 };
const box = M.zoneBox(face, 1000, 1000, { at: [10, 9], dx: 0, dy: 0, size: 0.55 });
ok('zone front : centre au milieu des repères, côté = 0,55 × largeur du visage', Math.abs(box.cx - 500) < 1 && Math.abs(box.cy - 275) < 1 && Math.abs(box.side - 0.55 * 400) < 1,
   JSON.stringify({ cx: box.cx, cy: box.cy, side: box.side }));
const box2 = M.zoneBox(face, 1000, 1000, { at: [10, 9], dx: 0.1, dy: 0, size: 0.5 });
ok('décalage dx vers la droite', Math.abs(box2.cx - 540) < 1);

console.log(fails ? '\n' + fails + ' ÉCHEC(S)' : '\nTout est OK');
process.exit(fails ? 1 : 0);
