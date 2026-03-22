/* ============================================================
   skinJourney.js — Suivi de progression de la peau sur 30 jours
   • 100% local — localStorage, aucune donnée envoyée
   • 100% gratuit — pas derrière le paywall
   ============================================================ */

'use strict';

const SkinJourney = (() => {

  const STORAGE_KEY  = 'glowup_journey_v1';
  const PROGRAM_DAYS = 30;

  const POINTS = {
    checkin_matin: 5,
    checkin_soir:  5,
    full_day:      3,   // bonus matin + soir le même jour
    new_analysis:  10,
    photo_taken:   5
  };

  const BADGES = [
    {
      id: 'first_step', icon: '🌟', name: 'Premier Pas',
      desc: 'Premier check-in effectué',
      condition: d => d.totalCheckins >= 1
    },
    {
      id: 'streak_3', icon: '🔥', name: '3 Jours de Suite',
      desc: '3 jours consécutifs de routine',
      condition: d => d.maxStreak >= 3
    },
    {
      id: 'streak_7', icon: '💪', name: 'Routine Master',
      desc: '7 jours consécutifs de routine',
      condition: d => d.maxStreak >= 7
    },
    {
      id: 'photo_compare', icon: '📸', name: 'Avant / Après',
      desc: 'Première comparaison photo enregistrée',
      condition: d => d.photos.length >= 2
    },
    {
      id: 'score_80', icon: '✨', name: 'Glow Score',
      desc: 'Skin Score ≥ 80 / 100',
      condition: d => d.skinScore >= 80
    },
    {
      id: 'full_program', icon: '🏆', name: 'Skin Transformation',
      desc: '30 jours de programme accomplis',
      condition: d => getCurrentDay(d) >= 30
    }
  ];

  // ─── Persistance localStorage ──────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[SkinJourney] localStorage plein:', e);
    }
  }

  function getToday() {
    return new Date().toISOString().split('T')[0];
  }

  function daysBetween(d1, d2) {
    return Math.floor((new Date(d2) - new Date(d1)) / 86400000);
  }

  function getCurrentDay(data) {
    return Math.min(PROGRAM_DAYS, daysBetween(data.startDate, getToday()) + 1);
  }

  // ─── Démarrer le programme ────────────────────────────────────

  function startJourney() {
    const today = getToday();
    const data = {
      startDate:      today,
      totalPoints:    0,
      totalCheckins:  0,
      currentStreak:  0,
      maxStreak:      0,
      lastCheckinDate: null,
      skinScore:      50,
      checkins:       {},
      photos:         [],
      analyses:       []
    };

    if (AppState.face.skinAnalysis) {
      data.skinScore = Math.max(50, AppState.face.skinAnalysis.globalScore || 50);
      data.analyses.push({
        day: 1, date: today,
        globalScore: AppState.face.skinAnalysis.globalScore,
        skinType: AppState.face.skinAnalysis.skinType?.type
      });
    }

    if (AppState.face.photo) {
      compressPhoto(AppState.face.photo, thumb => {
        data.photos.push({ day: 1, date: today, thumb });
        save(data);
      });
    }

    save(data);
    return data;
  }

  // ─── Compression photo avant stockage (320px, JPEG 50%) ───────

  function compressPhoto(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale  = Math.min(1, 320 / img.width);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = () => callback(null);
    img.src = dataUrl;
  }

  // ─── Étapes de routine (depuis AppState ou fallback) ──────────

  function getRoutineSteps() {
    const matin = AppState.routine?.matin || [];
    const soir  = AppState.routine?.soir  || [];

    const defaultMatin = [
      { step: 'cleanser',    label: 'Nettoyant' },
      { step: 'serum',       label: 'Sérum Vitamine C' },
      { step: 'moisturizer', label: 'Crème hydratante' },
      { step: 'spf',         label: 'SPF 50' }
    ];
    const defaultSoir = [
      { step: 'cleanser',    label: 'Nettoyant' },
      { step: 'treatment',   label: 'Sérum actif de nuit' },
      { step: 'moisturizer', label: 'Crème de nuit' }
    ];

    return {
      matin: matin.length ? matin : defaultMatin,
      soir:  soir.length  ? soir  : defaultSoir
    };
  }

  // ─── Check-in ─────────────────────────────────────────────────

  function getTodayCheckin(data) {
    return data.checkins[getToday()] || { matin: [], soir: [], matinDone: false, soirDone: false, points: 0 };
  }

  function toggleStep(period, stepId) {
    const data  = load();
    if (!data) return;
    const today = getToday();
    if (!data.checkins[today]) {
      data.checkins[today] = { matin: [], soir: [], matinDone: false, soirDone: false, points: 0 };
    }
    const arr = data.checkins[today][period];
    const idx = arr.indexOf(stepId);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(stepId);
    save(data);
    refreshCheckinBlock(data);
  }

  function completeCheckin(period) {
    const data  = load();
    if (!data) return;
    const today = getToday();
    if (!data.checkins[today]) {
      data.checkins[today] = { matin: [], soir: [], matinDone: false, soirDone: false, points: 0 };
    }
    const c = data.checkins[today];
    if (c[`${period}Done`]) return; // déjà validé

    const { matin, soir } = getRoutineSteps();
    c[period] = (period === 'matin' ? matin : soir).map(s => s.step);
    c[`${period}Done`] = true;

    let pts = POINTS[`checkin_${period}`];
    if (c.matinDone && c.soirDone) pts += POINTS.full_day;
    c.points = (c.points || 0) + pts;
    data.totalPoints += pts;
    data.totalCheckins++;

    // Streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (data.lastCheckinDate !== today) {
      data.currentStreak = data.lastCheckinDate === yesterday ? data.currentStreak + 1 : 1;
      data.maxStreak     = Math.max(data.maxStreak, data.currentStreak);
      data.lastCheckinDate = today;
    }

    data.skinScore = computeSkinScore(data);
    save(data);
    showToast(`+${pts} points Glow ✨`);
    renderJourneyScreen();
  }

  // ─── Skin Score ───────────────────────────────────────────────

  function computeSkinScore(data) {
    let score = 50;
    const daysWithCheckin = Object.values(data.checkins)
      .filter(c => c.matinDone || c.soirDone).length;
    score += Math.min(20, daysWithCheckin * 2);
    score += Math.min(10, data.currentStreak);
    if (data.analyses.length >= 2) {
      const delta = (data.analyses.at(-1).globalScore || 50) - (data.analyses[0].globalScore || 50);
      score += Math.min(20, Math.max(0, delta));
    } else if (data.analyses.length === 1) {
      score += Math.min(10, Math.max(0, (data.analyses[0].globalScore || 50) - 40));
    }
    return Math.min(100, Math.max(10, Math.round(score)));
  }

  // ─── Nouvelle analyse ─────────────────────────────────────────

  function addNewAnalysis() {
    const data = load();
    if (!data || !AppState.face.skinAnalysis) return;
    const day   = getCurrentDay(data);
    const today = getToday();

    data.analyses.push({
      day, date: today,
      globalScore: AppState.face.skinAnalysis.globalScore,
      skinType:    AppState.face.skinAnalysis.skinType?.type
    });
    data.totalPoints += POINTS.new_analysis;
    data.skinScore    = computeSkinScore(data);
    save(data);

    if (AppState.face.photo) {
      compressPhoto(AppState.face.photo, thumb => {
        if (!thumb) return;
        data.photos = data.photos.filter(p => p.day !== day);
        if (data.photos.length >= 5) data.photos.shift();
        data.photos.push({ day, date: today, thumb });
        data.totalPoints += POINTS.photo_taken;
        save(data);
        if (AppState.screen === 'journey') renderJourneyScreen();
      });
    }

    showToast('+10 points Glow — Analyse enregistrée ! 📊');
    if (AppState.screen === 'journey') renderJourneyScreen();
  }

  // ─── Toast feedback ───────────────────────────────────────────

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'glow-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 400);
    }, 2600);
  }

  // ─── Notifications ────────────────────────────────────────────

  function requestAndSchedule(hour, msg) {
    if (!('Notification' in window)) {
      showToast('Notifications non supportées sur ce navigateur');
      return;
    }
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        const key = `glowup_reminder_${hour}`;
        localStorage.setItem(key, msg);
        showToast('Rappel activé ! 🔔');
      } else {
        showToast('Permission refusée — active les notifications dans ton navigateur');
      }
    });
  }

  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const data = load();
    if (!data) return;
    const hour    = new Date().getHours();
    const dateKey = 'glowup_shown_' + getToday();
    if (localStorage.getItem(dateKey + '_' + hour)) return;

    [8, 21].forEach(h => {
      if (Math.abs(hour - h) <= 1) {
        const msg = localStorage.getItem(`glowup_reminder_${h}`);
        if (msg) {
          const day = getCurrentDay(data);
          new Notification('GLOW UP ✨', {
            body: msg.replace('{day}', day),
            icon: 'assets/icon-192.png'
          });
          localStorage.setItem(dateKey + '_' + hour, '1');
        }
      }
    });
  }

  // ─── Rendu principal ──────────────────────────────────────────

  function initScreen() {
    const content = document.getElementById('skinJourneyContent');
    if (!content) return;
    const data = load();
    if (!data) {
      renderStartScreen(content);
    } else if (getCurrentDay(data) >= PROGRAM_DAYS) {
      renderEndOfProgram(data);
    } else {
      renderJourneyScreen();
    }
    checkReminders();
  }

  function renderStartScreen(content) {
    const hasAnalysis = !!AppState.face.skinAnalysis;
    content.innerHTML = `
      <div class="journey-start">
        <div class="journey-start-badge">✦ 100% Gratuit</div>
        <h1>Ton Programme<br><em>Glow Up 30 jours</em></h1>
        <p class="journey-start-sub">Un coach beauté personnalisé qui suit l'évolution de ta peau et t'encourage chaque jour.</p>

        <div class="journey-perks">
          <div class="journey-perk"><span class="jp-icon">📅</span><div><strong>30 jours</strong><span>Programme complet guidé</span></div></div>
          <div class="journey-perk"><span class="jp-icon">☑️</span><div><strong>Check-in quotidien</strong><span>Valide tes étapes de routine</span></div></div>
          <div class="journey-perk"><span class="jp-icon">📊</span><div><strong>Skin Score</strong><span>Suivi d'évolution de ta peau</span></div></div>
          <div class="journey-perk"><span class="jp-icon">📸</span><div><strong>Avant / Après</strong><span>Comparaison photo tous les 7 jours</span></div></div>
          <div class="journey-perk"><span class="jp-icon">🏆</span><div><strong>Badges & Points</strong><span>Gamification pour rester motivée</span></div></div>
        </div>

        ${!hasAnalysis ? `
          <div class="journey-start-tip">
            💡 Effectue d'abord ton <strong>analyse de peau</strong> pour un suivi ultra-personnalisé.
            <button class="btn btn-outline" style="margin-top:12px" onclick="startGlowUp()">
              Faire mon analyse →
            </button>
          </div>` : `
          <div class="journey-start-tip journey-start-tip--green">
            ✓ Analyse de peau détectée — ton programme sera personnalisé à ton profil.
          </div>`}

        <button class="btn btn-dark journey-start-btn" onclick="SkinJourney.start()">
          Démarrer mon programme ✦
        </button>
        <p class="journey-free-note">Aucun compte requis · Données stockées localement</p>
      </div>`;
  }

  function renderJourneyScreen() {
    const content = document.getElementById('skinJourneyContent');
    if (!content) return;
    const data = load();
    if (!data) { renderStartScreen(content); return; }

    const currentDay = getCurrentDay(data);
    const progress   = Math.round((currentDay / PROGRAM_DAYS) * 100);
    const checkin    = getTodayCheckin(data);
    const { matin, soir } = getRoutineSteps();
    const earnedBadges    = BADGES.filter(b => b.condition(data));
    const needsNewPhoto   = currentDay > 1 && currentDay % 7 === 0 && !data.photos.find(p => p.day === currentDay);

    content.innerHTML = `
      <div class="journey-screen">

        <!-- Header -->
        <div class="journey-header">
          <span class="section-tag">Skin Journey · ${currentDay === 1 ? 'Jour de démarrage' : `Jour ${currentDay} sur ${PROGRAM_DAYS}`}</span>
          <h1>Ton Programme Glow Up</h1>
          <div class="journey-progress-wrap">
            <div class="journey-progress-track">
              <div class="journey-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="journey-progress-labels">
              <span>Jour 1</span>
              <span class="journey-day-badge">Jour ${currentDay} / ${PROGRAM_DAYS}</span>
              <span>Jour 30</span>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="journey-stats-row">
          <div class="journey-stat-card journey-stat-score">
            <div class="journey-score-ring">
              <svg viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="var(--sand)" stroke-width="5"/>
                <circle cx="28" cy="28" r="24" fill="none" stroke="var(--nude)" stroke-width="5"
                  stroke-dasharray="${2 * Math.PI * 24}"
                  stroke-dashoffset="${2 * Math.PI * 24 * (1 - data.skinScore / 100)}"
                  stroke-linecap="round" transform="rotate(-90 28 28)"/>
              </svg>
              <div class="journey-score-num">${data.skinScore}</div>
            </div>
            <div class="journey-stat-label">Skin Score</div>
            <div class="journey-stat-sub">/ 100</div>
          </div>
          <div class="journey-stat-card">
            <div class="journey-stat-val">${data.totalPoints}</div>
            <div class="journey-stat-label">Points Glow</div>
            <div class="journey-stat-sub">✨ cumulés</div>
          </div>
          <div class="journey-stat-card">
            <div class="journey-stat-val">${data.currentStreak}</div>
            <div class="journey-stat-label">Jours de suite</div>
            <div class="journey-stat-sub">🔥 streak actuel</div>
          </div>
        </div>

        ${needsNewPhoto ? `
          <div class="journey-photo-alert">
            📸 <strong>C'est le jour ${currentDay} !</strong> Prends ta photo de comparaison et vois les progrès de ta peau.
            <button class="btn btn-dark" style="margin-top:12px" onclick="SkinJourney.goTakePhoto()">
              Prendre ma photo →
            </button>
          </div>` : ''}

        <!-- Check-in -->
        <div class="journey-checkin-section" id="journeyCheckinSection">
          ${buildCheckinHTML(checkin, matin, soir, currentDay)}
        </div>

        <!-- Comparaison photos -->
        ${buildPhotoCompareHTML(data, currentDay)}

        <!-- Évolution Skin Score -->
        ${buildScoreEvolutionHTML(data)}

        <!-- Badges -->
        ${buildBadgesHTML(earnedBadges)}

        <!-- Rappels -->
        <div class="journey-reminders-section">
          <h2 class="journey-section-title">🔔 Rappels quotidiens</h2>
          <p>Ne rate plus jamais ta routine — active les rappels.</p>
          <div class="journey-reminder-btns">
            <button class="btn btn-outline" onclick="SkinJourney.reminder(8, '☀️ Routine du matin — Jour {day} de ton Glow Up ! Ta peau te remerciera.')">
              ☀️ Matin (8h00)
            </button>
            <button class="btn btn-outline" onclick="SkinJourney.reminder(21, '🌙 Il est l\\'heure de ta routine du soir. Ta peau mérite ce moment.')">
              🌙 Soir (21h00)
            </button>
          </div>
        </div>

        <!-- Reset -->
        <div style="text-align:center; margin-top:48px;">
          <button class="btn-ghost" onclick="SkinJourney.resetConfirm()" style="font-size:0.75rem; color:var(--muted);">
            Recommencer le programme
          </button>
        </div>

      </div>`;
  }

  // ─── Check-in HTML ────────────────────────────────────────────

  function buildCheckinHTML(checkin, matin, soir, currentDay) {
    const buildSteps = (steps, period, done) =>
      steps.map(s => {
        const checked = done || checkin[period]?.includes(s.step);
        return `
          <label class="journey-step-row ${checked ? 'is-checked' : ''}"
                 onclick="SkinJourney.toggle('${period}','${s.step}')">
            <span class="journey-checkbox">${checked ? '☑' : '☐'}</span>
            <span class="journey-step-label">${s.label || s.step}</span>
          </label>`;
      }).join('');

    return `
      <h2 class="journey-section-title">☑️ Routine du jour ${currentDay}</h2>

      <div class="journey-period-block ${checkin.matinDone ? 'is-done' : ''}">
        <div class="journey-period-header">
          <span>🌅 Routine du matin</span>
          ${checkin.matinDone ? '<span class="journey-done-pill">✓ Validée</span>' : '<span class="journey-pending-pill">En attente</span>'}
        </div>
        <div class="journey-steps">${buildSteps(matin, 'matin', checkin.matinDone)}</div>
        ${checkin.matinDone
          ? `<p class="journey-validated-msg">Super ! +5 points Glow ✨</p>`
          : `<button class="btn btn-dark journey-validate-btn" onclick="SkinJourney.complete('matin')">
               Valider ma routine du matin &nbsp;→&nbsp; +5 pts
             </button>`}
      </div>

      <div class="journey-period-block ${checkin.soirDone ? 'is-done' : ''}">
        <div class="journey-period-header">
          <span>🌙 Routine du soir</span>
          ${checkin.soirDone ? '<span class="journey-done-pill">✓ Validée</span>' : '<span class="journey-pending-pill">En attente</span>'}
        </div>
        <div class="journey-steps">${buildSteps(soir, 'soir', checkin.soirDone)}</div>
        ${checkin.soirDone
          ? `<p class="journey-validated-msg">Parfait ! +5 points Glow ✨</p>`
          : `<button class="btn btn-dark journey-validate-btn" onclick="SkinJourney.complete('soir')">
               Valider ma routine du soir &nbsp;→&nbsp; +5 pts
             </button>`}
      </div>`;
  }

  function refreshCheckin() {
    const el   = document.getElementById('journeyCheckinSection');
    if (!el) return;
    const data = load();
    if (!data) return;
    const { matin, soir } = getRoutineSteps();
    el.innerHTML = buildCheckinHTML(getTodayCheckin(data), matin, soir, getCurrentDay(data));
  }

  // ─── Photos Avant/Après ───────────────────────────────────────

  function buildPhotoCompareHTML(data, currentDay) {
    if (data.photos.length === 0) {
      return `
        <div class="journey-photos-section">
          <h2 class="journey-section-title">📸 Comparaison Avant / Après</h2>
          <div class="journey-photos-empty">
            <p>Prends ta première photo pour démarrer le suivi visuel de ta peau.</p>
            <button class="btn btn-outline" onclick="SkinJourney.goTakePhoto()">
              📸 Prendre ma photo Jour 1
            </button>
          </div>
        </div>`;
    }

    const first = data.photos[0];
    const last  = data.photos.at(-1);
    const sameDay = first.day === last.day;

    return `
      <div class="journey-photos-section">
        <h2 class="journey-section-title">📸 Comparaison Avant / Après</h2>
        ${sameDay
          ? `<p class="journey-photos-hint">Reviens le Jour 7 pour ta première comparaison !</p>`
          : ''}
        <div class="journey-photo-compare">
          <div class="journey-photo-slot">
            <img src="${first.thumb}" alt="Jour ${first.day}">
            <span class="journey-photo-day">Jour ${first.day}</span>
          </div>
          <div class="journey-photo-arrow">→</div>
          <div class="journey-photo-slot">
            <img src="${last.thumb}" alt="Jour ${last.day}">
            <span class="journey-photo-day">Jour ${last.day}</span>
          </div>
        </div>
        ${!sameDay && data.analyses.length >= 2 ? buildProgressInsights(data) : ''}
        ${currentDay % 7 === 0 ? `
          <button class="btn btn-outline" style="margin-top:16px" onclick="SkinJourney.goTakePhoto()">
            📸 Enregistrer ma photo Jour ${currentDay}
          </button>` : `
          <p class="journey-photos-hint" style="margin-top:12px;">
            Prochaine photo recommandée : Jour ${Math.ceil(currentDay / 7) * 7}
          </p>`}
      </div>`;
  }

  function buildProgressInsights(data) {
    const first = data.analyses[0];
    const last  = data.analyses.at(-1);
    const delta = (last.globalScore || 50) - (first.globalScore || 50);
    const insights = [];
    if (delta > 5)  insights.push('✨ Éclat amélioré');
    if (delta > 10) insights.push('💧 Hydratation renforcée');
    if (delta > 15) insights.push('🌟 Texture affinée');
    if (!insights.length && delta >= 0) insights.push('◇ Peau stabilisée — continue la routine !');
    if (delta < 0) insights.push('○ Skin Score en cours — la régularité paie après 2 semaines');

    return `
      <div class="journey-insights">
        <h4>Changements détectés</h4>
        ${insights.map(i => `<div class="journey-insight-item">${i}</div>`).join('')}
      </div>`;
  }

  // ─── Évolution Skin Score ─────────────────────────────────────

  function buildScoreEvolutionHTML(data) {
    if (data.analyses.length < 2) return '';
    const points = data.analyses.slice(-5); // 5 derniers max
    const max    = 100;
    const barH   = 60;

    const bars = points.map(p => {
      const h = Math.round((p.globalScore / max) * barH);
      return `
        <div class="journey-chart-bar-wrap">
          <div class="journey-chart-bar" style="height:${h}px" title="${p.globalScore}/100"></div>
          <span class="journey-chart-label">J${p.day}</span>
        </div>`;
    }).join('');

    return `
      <div class="journey-score-evolution">
        <h2 class="journey-section-title">📈 Évolution de ta peau</h2>
        <div class="journey-chart">${bars}</div>
        <p class="journey-chart-note">Score global · analyses successives</p>
        <button class="btn btn-outline" style="margin-top:16px" onclick="SkinJourney.goAnalyze()">
          Faire une nouvelle analyse →
        </button>
      </div>`;
  }

  // ─── Badges ───────────────────────────────────────────────────

  function buildBadgesHTML(earnedBadges) {
    const items = BADGES.map(b => {
      const earned = earnedBadges.find(e => e.id === b.id);
      return `
        <div class="journey-badge ${earned ? 'is-earned' : 'is-locked'}">
          <div class="journey-badge-icon">${earned ? b.icon : '🔒'}</div>
          <div class="journey-badge-name">${b.name}</div>
          <div class="journey-badge-desc">${b.desc}</div>
        </div>`;
    }).join('');

    return `
      <div class="journey-badges-section">
        <h2 class="journey-section-title">🏆 Badges & Récompenses</h2>
        <div class="journey-badges-grid">${items}</div>
      </div>`;
  }

  // ─── Actions publiques ────────────────────────────────────────

  function goTakePhoto() {
    _pendingPhoto = true;
    showScreen('capture');
  }

  function goAnalyze() {
    _pendingAnalysis = true;
    showScreen('capture');
  }

  function resetConfirm() {
    if (confirm('Recommencer le programme Glow Up ? Toutes tes données de suivi seront effacées.')) {
      localStorage.removeItem(STORAGE_KEY);
      initScreen();
    }
  }

  // ─── Flags pour capter retour depuis capture ──────────────────

  let _pendingPhoto    = false;
  let _pendingAnalysis = false;

  function onPhotoReady() {
    if (!_pendingPhoto && !_pendingAnalysis) return;
    const data = load();
    if (!data) return;

    if (AppState.face.photo) {
      const day   = getCurrentDay(data);
      const today = getToday();
      compressPhoto(AppState.face.photo, thumb => {
        if (!thumb) return;
        data.photos = data.photos.filter(p => p.day !== day);
        if (data.photos.length >= 5) data.photos.shift();
        data.photos.push({ day, date: today, thumb });
        data.totalPoints += POINTS.photo_taken;
        data.skinScore    = computeSkinScore(data);
        save(data);
        showToast('+5 points Glow — Photo enregistrée ! 📸');
        if (AppState.screen === 'journey') renderJourneyScreen();
      });
    }

    _pendingPhoto    = false;
    _pendingAnalysis = false;
  }

  // ─── Démarrage avec vérification auth ────────────────────────

  function startWithAuthCheck() {
    // Si déjà un programme en cours → aller directement
    if (load()) { showScreen('journey'); return; }

    // Vérifier connexion
    if (!AppState.user.isGuest) {
      // Connecté → démarrer directement
      startJourney();
      showScreen('journey');
      return;
    }

    // Invité → modal auth spécifique Journey
    if (typeof Auth !== 'undefined') {
      Auth.openJourneyAuthModal(() => {
        startJourney();
        showScreen('journey');
      });
    } else {
      // Fallback sans Firebase
      startJourney();
      showScreen('journey');
    }
  }

  // ─── Bilan fin de programme (Jour 30) ─────────────────────────

  function renderEndOfProgram(data) {
    const content = document.getElementById('skinJourneyContent');
    if (!content) return;

    const badge = BADGES.find(b => b.id === 'full_program');
    const bilan = buildFinalBilan(data);
    const hasPhotos = data.photos.length >= 2;
    const first = hasPhotos ? data.photos[0]     : null;
    const last  = hasPhotos ? data.photos.at(-1) : null;

    content.innerHTML = `
      <div class="journey-end">

        <!-- Badge Skin Transformation -->
        <div class="journey-end-badge-wrap">
          <div class="journey-end-badge-icon">${badge.icon}</div>
          <div class="journey-end-badge-name">${badge.name}</div>
          <p class="journey-end-badge-desc">Tu as complété 30 jours de programme — félicitations !</p>
        </div>

        <!-- Stats finales -->
        <div class="journey-end-stats">
          <div class="journey-end-stat">
            <div class="journey-end-stat-val">${data.skinScore}</div>
            <div class="journey-end-stat-label">Skin Score final</div>
          </div>
          <div class="journey-end-stat">
            <div class="journey-end-stat-val">${data.totalPoints}</div>
            <div class="journey-end-stat-label">Points Glow ✨</div>
          </div>
          <div class="journey-end-stat">
            <div class="journey-end-stat-val">${data.maxStreak}</div>
            <div class="journey-end-stat-label">Meilleur streak 🔥</div>
          </div>
        </div>

        <!-- Bilan -->
        <div class="journey-end-bilan">
          <h2 class="journey-section-title" style="text-align:center">📊 Bilan de ta transformation</h2>
          <p class="journey-end-bilan-text">${bilan}</p>
        </div>

        <!-- Avant / Après -->
        ${hasPhotos ? `
          <div class="journey-end-photos">
            <h3 class="journey-end-photos-title">Avant → Après</h3>
            <div class="journey-photo-compare">
              <div class="journey-photo-slot">
                <img src="${first.thumb}" alt="Avant">
                <span class="journey-photo-day">Jour ${first.day}</span>
              </div>
              <div class="journey-photo-arrow">→</div>
              <div class="journey-photo-slot">
                <img src="${last.thumb}" alt="Après">
                <span class="journey-photo-day">Jour ${last.day}</span>
              </div>
            </div>
          </div>` : ''}

        <!-- CTA -->
        <div class="journey-end-cta">
          <button class="btn btn-dark" onclick="SkinJourney.resetConfirm()">
            Recommencer un nouveau programme ✦
          </button>
          <button class="btn btn-outline" onclick="showScreen('shop')" style="margin-top:12px">
            Voir la boutique →
          </button>
        </div>

      </div>`;
  }

  function buildFinalBilan(data) {
    const daysChecked = Object.values(data.checkins).filter(c => c.matinDone || c.soirDone).length;
    const regularity  = Math.round((daysChecked / 30) * 100);
    const hasAnalysis = data.analyses.length >= 2;
    const scoreDelta  = hasAnalysis
      ? (data.analyses.at(-1).globalScore || 50) - (data.analyses[0].globalScore || 50)
      : 0;

    const parts = [];

    // Régularité
    if (regularity >= 80) {
      parts.push(`Tu as suivi ta routine ${regularity}% du temps — une régularité exemplaire qui se ressent sur la qualité de ta peau.`);
    } else if (regularity >= 50) {
      parts.push(`Tu as complété ta routine ${daysChecked} jours sur 30 — chaque geste compte et les effets s'accumulent dans le temps.`);
    } else {
      parts.push(`Tu as démarré ton programme Glow Up — les vrais résultats se construisent avec la régularité, continue !`);
    }

    // Améliorations détectées
    if (scoreDelta >= 15) {
      parts.push(`L'analyse de ta peau montre une nette amélioration : teint plus lumineux, hydratation renforcée et texture affinée.`);
    } else if (scoreDelta >= 5) {
      parts.push(`Ta peau est plus hydratée et ton teint plus uniforme — les actifs de ta routine commencent à agir en profondeur.`);
    } else if (data.skinScore >= 70) {
      parts.push(`Ton Skin Score atteint ${data.skinScore}/100 — ta peau est équilibrée et bien entretenue.`);
    }

    // Encouragement final
    if (data.maxStreak >= 7) {
      parts.push(`Avec un streak de ${data.maxStreak} jours consécutifs, tu as prouvé que la régularité est ta plus grande force beauté.`);
    }

    return parts.slice(0, 3).join(' ');
  }

  // ─── API publique ─────────────────────────────────────────────

  return {
    initScreen,
    start:         startWithAuthCheck,
    toggle:        toggleStep,
    complete:      completeCheckin,
    reminder:      requestAndSchedule,
    addAnalysis:   addNewAnalysis,
    goTakePhoto,
    goAnalyze,
    onPhotoReady,
    resetConfirm,
    isActive:      () => !!load()
  };

})();
