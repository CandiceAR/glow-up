/* ============================================================
   tracker.js — Tracking comportement utilisateur (Phase 0)
   Stockage : localStorage 'glow_events'
   Structure event : { type, pid?, name?, ts }
   Types : 'session' | 'screen' | 'view' | 'buy' | 'tryon'
   ============================================================ */

'use strict';

const Tracker = (() => {

  const KEY        = 'glow_events';
  const MAX_EVENTS = 8000;  // ~8000 events max en localStorage

  // ─── Lecture / écriture ───────────────────────────────────────
  function _load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function _save(events) {
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    try { localStorage.setItem(KEY, JSON.stringify(events)); } catch {}
  }

  function _push(event) {
    const events = _load();
    events.push({ ...event, ts: Date.now() });
    _save(events);
  }

  // ─── API publique — émettre des events ────────────────────────
  function trackSession() {
    _push({ type: 'session' });
  }

  function trackScreen(screenName) {
    _push({ type: 'screen', name: screenName });
  }

  function trackView(productId) {
    if (!productId) return;
    _push({ type: 'view', pid: productId });
  }

  function trackBuyClick(productId) {
    if (!productId) return;
    _push({ type: 'buy', pid: productId });
  }

  function trackTryOn(productId) {
    if (!productId) return;
    _push({ type: 'tryon', pid: productId });
  }

  // ─── API publique — lire les stats ────────────────────────────
  function getEvents() {
    return _load();
  }

  function getStats(dayRange = 30) {
    const events = _load();
    const since  = Date.now() - dayRange * 86400000;
    const recent = events.filter(e => e.ts >= since);

    // Compteurs globaux
    const sessions = recent.filter(e => e.type === 'session').length;
    const views    = recent.filter(e => e.type === 'view').length;
    const buys     = recent.filter(e => e.type === 'buy').length;
    const tryons   = recent.filter(e => e.type === 'tryon').length;

    // Top produits (vues)
    const viewMap = {};
    recent.filter(e => e.type === 'view').forEach(e => {
      viewMap[e.pid] = (viewMap[e.pid] || 0) + 1;
    });
    const topViews = Object.entries(viewMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Top produits (achats)
    const buyMap = {};
    recent.filter(e => e.type === 'buy').forEach(e => {
      buyMap[e.pid] = (buyMap[e.pid] || 0) + 1;
    });
    const topBuys = Object.entries(buyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Top écrans
    const screenMap = {};
    recent.filter(e => e.type === 'screen').forEach(e => {
      if (e.name) screenMap[e.name] = (screenMap[e.name] || 0) + 1;
    });
    const topScreens = Object.entries(screenMap)
      .sort((a, b) => b[1] - a[1]);

    // Timeline par jour (7 derniers jours)
    const timeline = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const daySessions = events.filter(e => e.type === 'session' && e.ts >= dayStart.getTime() && e.ts < dayEnd.getTime()).length;
      const dayBuys     = events.filter(e => e.type === 'buy'     && e.ts >= dayStart.getTime() && e.ts < dayEnd.getTime()).length;
      const dayViews    = events.filter(e => e.type === 'view'    && e.ts >= dayStart.getTime() && e.ts < dayEnd.getTime()).length;

      const label = dayStart.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      timeline.push({ label, sessions: daySessions, buys: dayBuys, views: dayViews });
    }

    // Taux de conversion view → buy (sur les produits ayant des vues)
    const convRate = views > 0 ? Math.round((buys / views) * 100) : 0;

    // Produits vus mais jamais cliqués (cold products)
    const coldProducts = Object.keys(viewMap)
      .filter(pid => !buyMap[pid] && viewMap[pid] >= 2)
      .map(pid => ({ pid, views: viewMap[pid] }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    return { sessions, views, buys, tryons, topViews, topBuys, topScreens, timeline, convRate, coldProducts };
  }

  function clearAll() {
    localStorage.removeItem(KEY);
  }

  // ─── Export CSV ───────────────────────────────────────────────
  function exportCSV() {
    const events = _load();
    const rows   = [['type', 'productId', 'screen', 'date', 'heure']];
    events.forEach(e => {
      const d = new Date(e.ts);
      rows.push([
        e.type,
        e.pid  || '',
        e.name || '',
        d.toLocaleDateString('fr-FR'),
        d.toLocaleTimeString('fr-FR')
      ]);
    });
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `glow-up-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ─── Initialisation automatique : session au chargement ───────
  window.addEventListener('DOMContentLoaded', () => {
    // Evite de compter plusieurs fois si rechargement rapide (< 30 min)
    const lastSession = parseInt(localStorage.getItem('glow_last_session') || '0');
    if (Date.now() - lastSession > 30 * 60 * 1000) {
      trackSession();
      localStorage.setItem('glow_last_session', String(Date.now()));
    }
  });

  return { trackSession, trackScreen, trackView, trackBuyClick, trackTryOn, getEvents, getStats, clearAll, exportCSV };

})();
