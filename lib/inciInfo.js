/* ============================================================
   lib/inciInfo.js — D'où vient une liste INCI, et à quelle date : texte affiché sous « Compositions comparées ».
   On enregistre l'adresse exacte et la date (fiche catalogue : inciSourceUrl + inciLastVerifiedAt ; produit scanné :
   sourceUrl + retrievedAt) ; à l'écran on dit la NATURE de la source et la date, sans nommer le site tiers
   (nos sources restent chez nous), sauf l'adresse officielle de la marque.
   ============================================================ */
'use strict';

const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * { source, sourceUrl, date, brand, photo } -> { label, date, official }
 *   photo    : la liste a été lue sur la photo de l'utilisatrice
 *   official : l'adresse enregistrée est celle du site de la marque
 */
function describe(o) {
  o = o || {};
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(o.date || '')) ? String(o.date).slice(0, 10) : '';
  if (o.photo || o.source === 'photo') return { label: 'liste lue sur la photo', date, official: false };
  let host = '';
  try { host = new URL(o.sourceUrl).hostname.replace(/^www\./, ''); } catch (e) { /* pas d'adresse enregistrée */ }
  const b = slug(o.brand);
  const official = !!(host && b.length >= 3 && slug(host.split('.')[0]).includes(b.slice(0, Math.min(b.length, 8))));
  if (official) return { label: 'site officiel de la marque', date, official: true };
  if (host || o.source) return { label: 'fiche produit trouvée en ligne', date, official: false };
  return { label: 'source non enregistrée', date, official: false };
}

module.exports = { describe };
