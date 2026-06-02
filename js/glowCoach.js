/* ============================================================
   glowCoach.js — Glow Up Coach : chat IA beauté personnalisé
   Historique multi-conversations · Suggestions intelligentes
   GLOW UP
   ============================================================ */

'use strict';

const GlowCoach = (() => {

  // ─── Limites ──────────────────────────────────────────────────
  const LIMIT_FREE          = 10;
  const LIMIT_GLOW          = 20;
  const LIMIT_COACH_MONTHLY = 30;

  // ─── Clés localStorage ───────────────────────────────────────
  const CONVERSATIONS_KEY  = 'glow_coach_conversations';
  const CURRENT_CONV_KEY   = 'glow_coach_current_id';
  const MONTHLY_KEY_PREFIX = 'glow_coach_monthly_';
  const ENGAGEMENT_KEY     = 'glow_coach_engagement';

  // ─── Modèles ─────────────────────────────────────────────────
  const MODEL_HAIKU  = 'claude-haiku-4-5-20251001';
  const MODEL_SONNET = 'claude-sonnet-4-6';

  // ─── Session gap : 30 min → retour à l'accueil ──────────────
  const SESSION_GAP_MS    = 30 * 60 * 1000;
  const MAX_CONVERSATIONS = 15;

  // ─── État ────────────────────────────────────────────────────
  let _conversations = [];
  let _currentConv   = null;
  let _viewMode      = 'home'; // 'home' | 'chat'
  let _typing        = false;

  // ─── Fichiers data/ ──────────────────────────────────────────
  let _systemPromptBase = '';
  let _knowledge        = null;
  let _examples         = [];
  let _questions        = [];
  let _filesLoaded      = false;

  // ══════════════════════════════════════════════════════════════
  // PLAN & LIMITES
  // ══════════════════════════════════════════════════════════════

  function _getPlan() {
    return typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  }
  function _getModel() {
    return _getPlan() === 'free' ? MODEL_HAIKU : MODEL_SONNET;
  }
  function _monthKey() {
    return MONTHLY_KEY_PREFIX + new Date().toISOString().slice(0, 7);
  }
  function _getMonthlyCount() {
    try { return parseInt(localStorage.getItem(_monthKey()) || '0'); } catch { return 0; }
  }
  function _incrementMonthlyCount() {
    try { localStorage.setItem(_monthKey(), _getMonthlyCount() + 1); } catch {}
  }
  function _monthlyRemaining() {
    return Math.max(0, LIMIT_COACH_MONTHLY - _getMonthlyCount());
  }
  function _nextMonthLabel() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }
  function _getUserMessageCount() {
    return (_currentConv?.messages || []).filter(m => m.role === 'user').length;
  }
  function _getCurrentCount() {
    return _getPlan() === 'glowplus' ? _getMonthlyCount() : _getUserMessageCount();
  }
  function _getLimit() {
    const plan = _getPlan();
    if (plan === 'glowplus') return LIMIT_COACH_MONTHLY;
    if (plan === 'glow')     return LIMIT_GLOW;
    return LIMIT_FREE;
  }

  // ══════════════════════════════════════════════════════════════
  // CONVERSATIONS
  // ══════════════════════════════════════════════════════════════

  function _loadConversations() {
    try {
      _conversations = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
    } catch { _conversations = []; }
  }

  function _saveConversations() {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(_conversations.slice(0, MAX_CONVERSATIONS)));
    } catch {}
  }

  function _createConversation() {
    return {
      id:            'conv_' + Date.now(),
      title:         '',
      createdAt:     new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messages:      []
    };
  }

  function _autoSave() {
    if (!_currentConv) return;
    _currentConv.lastMessageAt = new Date().toISOString();
    if (!_currentConv.title) {
      const first = _currentConv.messages.find(m => m.role === 'user');
      if (first) _currentConv.title = first.content.slice(0, 50);
    }
    const idx = _conversations.findIndex(c => c.id === _currentConv.id);
    if (idx >= 0) _conversations[idx] = _currentConv;
    else          _conversations.unshift(_currentConv);
    _saveConversations();
    try { localStorage.setItem(CURRENT_CONV_KEY, _currentConv.id); } catch {}
  }

  function _shouldShowHome() {
    if (!_currentConv || _currentConv.messages.length === 0) return true;
    const last = new Date(_currentConv.lastMessageAt).getTime();
    return Date.now() - last > SESSION_GAP_MS;
  }

  function _formatDate(iso) {
    if (!iso) return '';
    const d    = new Date(iso);
    const diff = Date.now() - d;
    if (diff < 60000)    return 'À l\'instant';
    if (diff < 3600000)  return `Il y a ${Math.floor(diff/60000)} min`;
    if (diff < 86400000) return `Il y a ${Math.floor(diff/3600000)}h`;
    if (diff < 604800000) return `Il y a ${Math.floor(diff/86400000)} j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // ══════════════════════════════════════════════════════════════
  // FICHIERS DATA
  // ══════════════════════════════════════════════════════════════

  async function _loadCoachFiles() {
    if (_filesLoaded) return;
    try {
      const [pr, kr, er, qr] = await Promise.all([
        fetch('data/coachSystemPrompt.txt?v=' + Date.now()),
        fetch('data/coachKnowledge.json?v='   + Date.now()),
        fetch('data/coachExamples.json?v='    + Date.now()),
        fetch('data/coachQuestions.json?v='   + Date.now())
      ]);
      if (pr.ok) _systemPromptBase = await pr.text();
      if (kr.ok) _knowledge        = await kr.json();
      if (er.ok) _examples         = await er.json();
      if (qr.ok) _questions        = await qr.json();
    } catch (e) {
      console.warn('[GlowCoach] Fichiers data/ non chargés.', e);
    }
    _filesLoaded = true;
  }

  // ══════════════════════════════════════════════════════════════
  // SUGGESTIONS INTELLIGENTES
  // ══════════════════════════════════════════════════════════════

  function _loadEngagement() {
    try { return JSON.parse(localStorage.getItem(ENGAGEMENT_KEY) || '{}'); } catch { return {}; }
  }
  function _trackEngagement(category) {
    const eng = _loadEngagement();
    eng[category] = (eng[category] || 0) + 1;
    try { localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(eng)); } catch {}
  }

  function _buildUserProfile() {
    const answers = AppState.questionnaire?.answers || {};
    const face    = AppState.face?.skinAnalysis || null;
    const skinType = (face?.skinType?.type || answers.skinType || '').toLowerCase();
    const concerns = (answers.concerns || []).map(c => c.toLowerCase());
    const tags     = [...concerns];
    if (['brillante','très brillante'].includes(answers.oiliness)) tags.push('sébum','brillance');
    if (['sensible','très sensible'].includes(answers.sensitivity)) tags.push('sensibilité','réactivité');
    if (face?.zones?.redness > 0.3) tags.push('rougeurs');
    if (face?.zones?.pores   > 0.3) tags.push('pores');
    if (answers.age && parseInt(answers.age) >= 35) tags.push('anti-âge','rides');
    if (['acnéique','acne'].includes(skinType)) tags.push('acné','boutons');
    if (skinType === 'sèche')    tags.push('déshydratation','tiraillement');
    if (skinType === 'grasse')   tags.push('sébum','brillance','pores');
    if (skinType === 'sensible') tags.push('sensibilité','rougeurs');
    if (['petit','moins de 30€'].includes(answers.budget)) tags.push('budget');
    return { skinType, concerns, tags };
  }

  function _computeSuggestions() {
    if (!_questions.length) return _getDefaultSuggestions();
    const profile    = _buildUserProfile();
    const engagement = _loadEngagement();
    // Exclure questions déjà posées dans TOUTES les conversations
    const allAsked = new Set(
      _conversations.flatMap(c => c.messages.filter(m => m.role === 'user').map(m => m.content.trim()))
    );
    const scored = _questions.map(q => {
      let score = 0;
      if (profile.skinType && q.skin_profiles.includes(profile.skinType)) score += 4;
      q.concerns.forEach(c => {
        if (profile.concerns.includes(c)) score += 3;
        if (profile.tags.includes(c))     score += 1;
      });
      q.tags.forEach(t => { if (profile.tags.includes(t)) score += 1; });
      score += (engagement[q.category] || 0) * 0.5;
      score += Math.random() * 0.4;
      if (allAsked.has(q.question)) score = -999;
      return { ...q, score };
    });
    const results = scored.filter(q => q.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    return results.length >= 2 ? results : _getDefaultSuggestions();
  }

  function _getDefaultSuggestions() {
    return [
      { id:'D1', question:'Ma routine est-elle adaptée à mon type de peau ?', category:'routine'  },
      { id:'D2', question:'Quels actifs sont les plus utiles pour ma peau ?',  category:'produits' },
      { id:'D3', question:'Que devrais-je changer dans ma routine ?',          category:'coach'    },
      { id:'D4', question:'Est-ce que mes produits se combinent bien ?',       category:'produits' }
    ];
  }

  function _renderSuggestions() {
    const suggestions = _computeSuggestions();
    if (!suggestions.length) return '';
    return `
      <div class="coach-suggestions-wrap">
        <p class="coach-suggestions-label">Questions pour toi ✦</p>
        <div class="coach-suggestions">
          ${suggestions.map(s => `
            <button class="coach-suggestion" onclick="GlowCoach.selectSuggestion('${s.question.replace(/'/g, "\\'")}', '${s.category}')">
              ${s.question}
            </button>`).join('')}
        </div>
      </div>`;
  }

  function selectSuggestion(question, category) {
    _trackEngagement(category);
    sendMessage(question);
  }

  // ══════════════════════════════════════════════════════════════
  // PROMPT & API
  // ══════════════════════════════════════════════════════════════

  function _buildContext() {
    const answers  = AppState.questionnaire?.answers || {};
    const routine  = AppState.routine || {};
    const products = AppState.products?.recommended || [];
    const face     = AppState.face?.skinAnalysis || null;
    const premium  = !AppState.premium?.isLocked;
    let journeyDay = null;
    try {
      const jd = JSON.parse(localStorage.getItem('glowup_journey_v1') || 'null');
      if (jd?.startDate) journeyDay = Math.min(30, Math.floor((Date.now() - new Date(jd.startDate)) / 86400000) + 1);
    } catch {}
    const fmt = (steps) => (steps || []).map(s => s.label || s.step).join(', ') || 'Non renseignée';

    // Scores analyse photo
    const zones = face?.zones || null;
    const photoScores = zones
      ? `Pores: ${Math.round((zones.pores||0)*100)}% · Rougeurs: ${Math.round((zones.redness||0)*100)}% · Éclat: ${Math.round((zones.glow||0)*100)}%`
      : 'Non analysée';

    return {
      skinType:    face?.skinType?.type || answers.skinType || 'Non analysée',
      concerns:    (answers.concerns || []).join(', ') || 'Non renseignés',
      oiliness:    answers.oiliness     || 'Non renseignée',
      sensitivity: answers.sensitivity  || 'Non renseignée',
      age:         answers.age          || 'Non renseigné',
      undertone:   answers.undertone    || answers.carnation || 'Non renseigné',
      budget:      answers.budget       || 'Non renseigné',
      morning:     fmt(routine.matin),
      evening:     fmt(routine.soir),
      ruleName:    routine.ruleName || 'Non générée',
      products:    products.slice(0, 8).map(p => `${p.brand} ${p.name}`).join(', ') || 'Aucun',
      photoScores,
      journeyDay:  journeyDay ? `Jour ${journeyDay}/30` : 'Non démarré',
      premium:     premium ? 'Abonnée Premium' : 'Version gratuite',
      makeupUsed:  (answers.makeupUsed || []).join(', ') || 'Non renseigné',
      makeupFreq:  answers.makeupFrequency || 'Non renseignée'
    };
  }

  function _buildSystemPrompt(ctx) {
    const base = _systemPromptBase ||
      `Tu es Glow Up Coach, l'experte en skincare et maquillage personnalisé de l'application Glow Up. Tu es chaleureuse, experte, premium — jamais robotique ni médicale.`;
    let knowledgeBlock = '';
    if (_knowledge) {
      const mol = _knowledge.important_molecules || {};
      knowledgeBlock = `\n---\nBASE DE CONNAISSANCES GLOW UP :
Règles skincare : ${(_knowledge.skincare_rules || []).join(' | ')}
Molécules très bonnes : ${(mol.very_good || []).join(', ')}
Molécules bonnes : ${(mol.good || []).join(', ')}
Ingrédients à surveiller : ${(mol.watch_out || []).join(', ')}
Erreurs fréquentes : ${(_knowledge.common_skincare_errors || []).join(' | ')}
Conseils Glow Up : ${(_knowledge.glowup_advice || []).join(' | ')}`;
    }
    let examplesBlock = '';
    if (_examples.length) {
      examplesBlock = `\n\n---\nEXEMPLES DE TON ET STYLE :\n${_examples.map(e => `Utilisatrice : "${e.user}"\nCoach : "${e.assistant}"`).join('\n\n')}`;
    }
    const profileBlock = `\n---\nPROFIL DE L'UTILISATRICE :
• Type de peau : ${ctx.skinType}
• Sébum / brillance : ${ctx.oiliness}
• Sensibilité : ${ctx.sensitivity}
• Âge : ${ctx.age}
• Sous-ton / carnation : ${ctx.undertone}
• Budget : ${ctx.budget}
• Préoccupations : ${ctx.concerns}
• Analyse photo (zones) : ${ctx.photoScores}
• Routine matin : ${ctx.morning}
• Routine soir : ${ctx.evening}
• Diagnostic appliqué : ${ctx.ruleName}
• Produits recommandés : ${ctx.products}
• Maquillage utilisé : ${ctx.makeupUsed} (fréquence : ${ctx.makeupFreq})
• Skin Journey : ${ctx.journeyDay}
• Statut : ${ctx.premium}`;
    const rulesBlock = `\n---\nRÈGLES ABSOLUES :
1. Réponds TOUJOURS en français, de façon concise (100-150 mots max)
2. Référence le profil quand pertinent : "D'après ton analyse…", "Dans ta routine actuelle…"
3. Structure : Avis rapide → Ce qui est bien → Ce qu'il faut modifier → Conseil concret
4. Propose des actions : "✅ À garder · ⚠️ À limiter · ➕ À ajouter · 🔄 À remplacer"
5. Ne promets JAMAIS de résultats dermatologiques garantis
6. Si profil incomplet, suggère de faire le diagnostic d'abord
7. Ne réponds qu'aux questions liées à la beauté, skincare ou maquillage`;
    return base + knowledgeBlock + examplesBlock + profileBlock + rulesBlock;
  }

  async function _callClaude(messages) {
    try {
      const ctx = _buildContext();
      const res = await fetch('/api/coach', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:      _getModel(),
          max_tokens: 350,
          system:     _buildSystemPrompt(ctx),
          messages:   messages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.content?.[0]?.text || null;
    } catch { return null; }
  }

  function _fallbackResponse(userMsg) {
    const ctx  = _buildContext();
    const msg  = userMsg.toLowerCase();
    const skin = ctx.skinType;
    if (msg.includes('spf') || msg.includes('solaire'))
      return `☀️ La protection solaire est le geste anti-âge n°1.\n\nPour une peau ${skin}, un SPF50 léger chaque matin est non-négociable.\n\n✅ À garder : ta routine actuelle\n➕ À ajouter : SPF50 en dernière étape du matin`;
    if (msg.includes('rétinol') || msg.includes('retinol'))
      return `⚗️ Le rétinol est l'actif anti-âge le plus puissant.\n\nPour une peau ${skin}, commence à 0,025% le soir, 2x/semaine. Ne l'associe jamais à un AHA/BHA le même soir.\n\n⚠️ À éviter : rétinol + exfoliant le même soir`;
    if (msg.includes('niacinamide'))
      return `✨ La niacinamide est l'actif le plus polyvalent pour une peau ${skin} : réduit le sébum, les pores et les rougeurs à 5-10%, matin et soir.\n\n✅ Compatible avec presque tous les actifs`;
    if (msg.includes('routine') || msg.includes('produits'))
      return `D'après ton profil (peau ${skin}), ta routine mérite une analyse point par point. Les erreurs fréquentes : absence de SPF, rétinol + AHA ensemble, trop d'actifs irritants.\n\n💬 Dis-moi quels produits tu utilises pour une analyse précise !`;
    return `Bonjour ! Je suis Glow Up Coach ✦\n\nPose-moi une question sur ta routine, tes produits ou tes actifs ${skin !== 'Non analysée' ? `— ton profil peau ${skin} est chargé` : ''}.\n\n${skin === 'Non analysée' ? '💡 Fais ton diagnostic peau pour des conseils personnalisés.' : ''}`;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDU
  // ══════════════════════════════════════════════════════════════

  function _renderCounter() {
    const plan      = _getPlan();
    const remaining = plan === 'glowplus' ? _monthlyRemaining() : Math.max(0, _getLimit() - _getCurrentCount());
    if (plan === 'glowplus') {
      return `<div class="coach-counter"><span class="coach-counter-num">${remaining}</span><span class="coach-counter-label">échange${remaining !== 1 ? 's' : ''} ce mois</span></div>`;
    }
    return `<div class="coach-counter"><span class="coach-counter-num">${remaining}</span><span class="coach-counter-label">échange${remaining !== 1 ? 's' : ''} restant${remaining !== 1 ? 's' : ''}</span></div>`;
  }

  function _renderHome() {
    const prenom  = AppState?.user?.displayName?.split(' ')[0] || '';
    const ctx     = _buildContext();
    const skinLine = ctx.skinType !== 'Non analysée'
      ? `Profil peau <strong>${ctx.skinType}</strong> chargé ✦`
      : `<a href="#" onclick="startGlowUp(); return false;">Fais ton diagnostic peau</a> pour des conseils personnalisés.`;

    const recentConvs = _conversations.filter(c => c.messages.length > 0).slice(0, 5);
    const historyHtml = recentConvs.length > 0 ? `
      <div class="coach-history">
        <p class="coach-history-label">Conversations récentes</p>
        ${recentConvs.map(c => `
          <button class="coach-history-item" onclick="GlowCoach.loadConversation('${c.id}')">
            <span class="coach-history-icon">✦</span>
            <div class="coach-history-info">
              <span class="coach-history-title">${c.title || 'Conversation'}</span>
              <span class="coach-history-date">${_formatDate(c.lastMessageAt)}</span>
            </div>
            <span class="coach-history-arrow">›</span>
          </button>`).join('')}
      </div>` : '';

    return `
      <div class="coach-layout">
        <div class="coach-header">
          <div class="coach-header-left">
            <div class="coach-avatar">✦</div>
            <div>
              <h1 class="coach-title">Glow Up Coach</h1>
              <p class="coach-subtitle">${skinLine}</p>
            </div>
          </div>
          ${_renderCounter()}
        </div>
        <div class="coach-home" id="coachMessages">
          <div class="coach-home-greeting">
            <h2 class="coach-home-title">${prenom ? `Bonjour ${prenom} ✦` : 'Bonjour ✦'}</h2>
            <p class="coach-home-sub">Que veux-tu explorer aujourd'hui ?</p>
          </div>
          ${_renderSuggestions()}
          ${historyHtml}
        </div>
        <div class="coach-input-area" id="coachInputArea">
          <div class="coach-input-wrap">
            <textarea id="coachInput" class="coach-input"
              placeholder="Pose ta question à Glow Up Coach…"
              rows="1"
              onkeydown="GlowCoach.handleKey(event)"
              oninput="GlowCoach.autoResize(this)"></textarea>
            <button class="coach-send-btn" onclick="GlowCoach.submitInput()" aria-label="Envoyer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;
  }

  function _renderChat() {
    const count    = _getCurrentCount();
    const limit    = _getLimit();
    const messages = _currentConv?.messages || [];
    const lastRole = messages.length ? messages[messages.length - 1].role : null;

    return `
      <div class="coach-layout">
        <div class="coach-header">
          <div class="coach-header-left">
            <button class="coach-back-btn" onclick="GlowCoach.showHome()" title="Retour">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="coach-avatar">✦</div>
            <div>
              <h1 class="coach-title">Glow Up Coach</h1>
            </div>
          </div>
          ${_renderCounter()}
        </div>
        <div class="coach-messages" id="coachMessages">
          ${messages.map(m => _renderBubble(m.role, m.content)).join('')}
          ${_typing ? `<div class="coach-msg coach-msg--coach"><div class="coach-msg-avatar">✦</div><div class="coach-typing"><span></span><span></span><span></span></div></div>` : ''}
          ${!_typing && lastRole === 'assistant' ? _renderSuggestions() : ''}
        </div>
        <div class="coach-input-area" id="coachInputArea">
          ${count >= limit
            ? _renderPaywallInline()
            : `<div class="coach-input-wrap">
                <textarea id="coachInput" class="coach-input"
                  placeholder="Pose ta question…"
                  rows="1"
                  onkeydown="GlowCoach.handleKey(event)"
                  oninput="GlowCoach.autoResize(this)"></textarea>
                <button class="coach-send-btn" onclick="GlowCoach.submitInput()" aria-label="Envoyer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>`
          }
        </div>
      </div>`;
  }

  function _renderBubble(role, content) {
    const isUser    = role === 'user';
    const formatted = content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    return `
      <div class="coach-msg coach-msg--${isUser ? 'user' : 'coach'}">
        ${!isUser ? '<div class="coach-msg-avatar">✦</div>' : ''}
        <div class="coach-msg-bubble"><p>${formatted}</p></div>
      </div>`;
  }

  function _renderPaywallInline() {
    const plan = _getPlan();
    if (plan === 'glowplus') {
      return `
        <div class="coach-paywall">
          <p class="coach-paywall-title">Tu as utilisé tes 30 échanges ce mois-ci ✦</p>
          <p class="coach-paywall-sub">Ton compteur se réinitialise le ${_nextMonthLabel()}. À très vite !</p>
        </div>`;
    }
    return `
      <div class="coach-paywall">
        <p class="coach-paywall-title">Tu as utilisé tes ${plan === 'glow' ? LIMIT_GLOW : LIMIT_FREE} échanges gratuits.</p>
        <p class="coach-paywall-sub">Accède au Coach complet avec 30 échanges par mois.</p>
        <button class="btn btn-dark" onclick="Subscription.showPaywall('coach')">Accéder au Coach ✦</button>
        <button class="btn-ghost" onclick="GlowCoach.clearHistory(); GlowCoach.initScreen();">Recommencer (efface l'historique)</button>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // INIT & ACTIONS
  // ══════════════════════════════════════════════════════════════

  async function initScreen() {
    _loadConversations();

    // Restaurer la dernière conversation
    try {
      const savedId = localStorage.getItem(CURRENT_CONV_KEY);
      if (savedId) _currentConv = _conversations.find(c => c.id === savedId) || null;
    } catch {}

    // Accueil si retour après 30 min ou pas de conv
    _viewMode = _shouldShowHome() ? 'home' : 'chat';

    _render();
    await _loadCoachFiles();
    _render();
  }

  async function sendMessage(text) {
    text = text?.trim();
    if (!text || _typing) return;

    const count = _getCurrentCount();
    const limit = _getLimit();
    if (count >= limit) { _showPaywall(); return; }

    // Créer une nouvelle conversation si besoin
    if (!_currentConv) {
      _currentConv = _createConversation();
    }
    // Basculer en vue chat
    if (_viewMode === 'home') {
      _viewMode = 'chat';
      _render();
    }

    _currentConv.messages.push({ role: 'user', content: text });
    _typing = true;
    _renderMessages();

    let reply = await _callClaude(_currentConv.messages);
    if (!reply) reply = _fallbackResponse(text);

    _currentConv.messages.push({ role: 'assistant', content: reply });
    _typing = false;
    if (_getPlan() === 'glowplus') _incrementMonthlyCount();
    _autoSave();
    _renderMessages();
  }

  function _render() {
    const container = document.getElementById('glowCoachContent');
    if (!container) return;
    container.innerHTML = _viewMode === 'home' ? _renderHome() : _renderChat();
    _scrollBottom();
  }

  function _renderMessages() {
    const container = document.getElementById('coachMessages');
    if (!container) return;

    const messages = _currentConv?.messages || [];
    const count    = _getCurrentCount();
    const limit    = _getLimit();
    const lastRole = messages.length ? messages[messages.length - 1].role : null;

    container.innerHTML =
      messages.map(m => _renderBubble(m.role, m.content)).join('') +
      (_typing ? `<div class="coach-msg coach-msg--coach"><div class="coach-msg-avatar">✦</div><div class="coach-typing"><span></span><span></span><span></span></div></div>` : '') +
      (!_typing && lastRole === 'assistant' ? _renderSuggestions() : '');

    const inputArea = document.getElementById('coachInputArea');
    if (inputArea && count >= limit) inputArea.innerHTML = _renderPaywallInline();

    _scrollBottom();
  }

  function _showPaywall() {
    const inputArea = document.getElementById('coachInputArea');
    if (inputArea) inputArea.innerHTML = _renderPaywallInline();
  }

  function _scrollBottom() {
    setTimeout(() => {
      const el = document.getElementById('coachMessages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  // ══════════════════════════════════════════════════════════════
  // API PUBLIQUE
  // ══════════════════════════════════════════════════════════════

  function submitInput() {
    const input = document.getElementById('coachInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessage(text);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function clearHistory() {
    _conversations = [];
    _currentConv   = null;
    _viewMode      = 'home';
    try {
      localStorage.removeItem(CONVERSATIONS_KEY);
      localStorage.removeItem(CURRENT_CONV_KEY);
    } catch {}
  }

  function startNewConversation() {
    _currentConv = _createConversation();
    _viewMode    = 'chat';
    _render();
  }

  function loadConversation(id) {
    const conv = _conversations.find(c => c.id === id);
    if (!conv) return;
    _currentConv = conv;
    _viewMode    = 'chat';
    try { localStorage.setItem(CURRENT_CONV_KEY, id); } catch {}
    _render();
    _scrollBottom();
  }

  function showHome() {
    _viewMode = 'home';
    _render();
  }

  return { initScreen, sendMessage, submitInput, handleKey, autoResize, clearHistory, selectSuggestion, startNewConversation, loadConversation, showHome };

})();
