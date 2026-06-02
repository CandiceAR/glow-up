/* ============================================================
   glowCoach.js — Glow Up Coach : chat IA beauté personnalisé
   Utilise Claude API (haiku) + contexte AppState de l'utilisatrice
   GLOW UP
   ============================================================ */

'use strict';

const GlowCoach = (() => {

  const LIMIT_FREE          = 10;   // Haiku, cumulatif
  const LIMIT_GLOW          = 20;   // Sonnet, cumulatif
  const LIMIT_COACH_MONTHLY = 30;   // Sonnet, réinitialisation mensuelle
  const HISTORY_KEY         = 'glow_coach_history';
  const API_KEY_STORE       = 'glow_coach_key';
  const MONTHLY_KEY_PREFIX  = 'glow_coach_monthly_';
  const MODEL_HAIKU         = 'claude-haiku-4-5-20251001';
  const MODEL_SONNET        = 'claude-sonnet-4-6';

  function _getPlan() {
    return typeof Subscription !== 'undefined' ? Subscription.getPlan() : 'free';
  }

  function _getModel() {
    return _getPlan() === 'free' ? MODEL_HAIKU : MODEL_SONNET;
  }

  // ─── Compteur mensuel (glowplus) ─────────────────────────────
  function _monthKey() {
    return MONTHLY_KEY_PREFIX + new Date().toISOString().slice(0, 7); // YYYY-MM
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

  function _getCurrentCount() {
    return _getPlan() === 'glowplus' ? _getMonthlyCount() : _getUserMessageCount();
  }

  function _getLimit() {
    const plan = _getPlan();
    if (plan === 'glowplus') return LIMIT_COACH_MONTHLY;
    if (plan === 'glow')     return LIMIT_GLOW;
    return LIMIT_FREE;
  }

  function _canUseCoach() {
    return _getCurrentCount() < _getLimit();
  }

  let _history = [];   // { role: 'user'|'assistant', content: string }
  let _typing  = false;

  // ─── Données chargées depuis data/ ───────────────────────────
  let _systemPromptBase = '';
  let _knowledge        = null;
  let _examples         = [];
  let _filesLoaded      = false;

  // ─── Suggestions intelligentes ────────────────────────────────
  let _questions        = [];  // coachQuestions.json
  const ENGAGEMENT_KEY  = 'glow_coach_engagement';
  const SHOWN_KEY       = 'glow_coach_shown_suggestions';

  // ─── Chargement unique des 3 fichiers ─────────────────────────
  async function _loadCoachFiles() {
    if (_filesLoaded) return;
    try {
      const [promptRes, knowledgeRes, examplesRes, questionsRes] = await Promise.all([
        fetch('data/coachSystemPrompt.txt?v=' + Date.now()),
        fetch('data/coachKnowledge.json?v='   + Date.now()),
        fetch('data/coachExamples.json?v='    + Date.now()),
        fetch('data/coachQuestions.json?v='   + Date.now())
      ]);
      if (promptRes.ok)    _systemPromptBase = await promptRes.text();
      if (knowledgeRes.ok) _knowledge        = await knowledgeRes.json();
      if (examplesRes.ok)  _examples         = await examplesRes.json();
      if (questionsRes.ok) _questions        = await questionsRes.json();
    } catch (e) {
      console.warn('[GlowCoach] Fichiers data/ non chargés, fallback prompt interne.', e);
    }
    _filesLoaded = true;
  }

  // ─── Engagement : apprentissage par catégorie ─────────────────
  function _loadEngagement() {
    try { return JSON.parse(localStorage.getItem(ENGAGEMENT_KEY) || '{}'); } catch { return {}; }
  }
  function _trackEngagement(category) {
    const eng = _loadEngagement();
    eng[category] = (eng[category] || 0) + 1;
    try { localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(eng)); } catch {}
  }

  // ─── Profil utilisatrice pour le scoring ─────────────────────
  function _buildUserProfile() {
    const answers = AppState.questionnaire?.answers || {};
    const face    = AppState.face?.skinAnalysis || null;

    const skinType = (face?.skinType?.type || answers.skinType || '').toLowerCase();
    const concerns = (answers.concerns || []).map(c => c.toLowerCase());
    const tags     = [...concerns];

    if (['brillante','très brillante'].includes(answers.oiliness)) tags.push('sébum','brillance');
    if (['sensible','très sensible'].includes(answers.sensitivity))  tags.push('sensibilité','réactivité');
    if (face?.zones?.redness > 0.3)  tags.push('rougeurs');
    if (face?.zones?.pores   > 0.3)  tags.push('pores');
    if (answers.age && parseInt(answers.age) >= 35) tags.push('anti-âge','rides');
    if (skinType === 'acnéique' || skinType === 'acne') tags.push('acné','boutons');
    if (skinType === 'sèche')   tags.push('déshydratation','tiraillement');
    if (skinType === 'grasse')  tags.push('sébum','brillance','pores');
    if (skinType === 'sensible') tags.push('sensibilité','rougeurs');
    if (answers.budget === 'petit' || answers.budget === 'moins de 30€') tags.push('budget');

    return { skinType, concerns, tags };
  }

  // ─── Calcul des meilleures suggestions ───────────────────────
  function _computeSuggestions() {
    if (!_questions.length) return _getDefaultSuggestions();

    const profile    = _buildUserProfile();
    const engagement = _loadEngagement();
    const askedSet   = new Set(_history.filter(m => m.role === 'user').map(m => m.content.trim()));

    const scored = _questions.map(q => {
      let score = 0;

      // Correspondance type de peau (poids fort)
      if (profile.skinType && q.skin_profiles.includes(profile.skinType)) score += 4;

      // Correspondance concerns
      q.concerns.forEach(c => {
        if (profile.concerns.includes(c)) score += 3;
        if (profile.tags.includes(c))     score += 1;
      });

      // Correspondance tags
      q.tags.forEach(t => {
        if (profile.tags.includes(t)) score += 1;
      });

      // Boost catégories déjà explorées (apprentissage)
      score += (engagement[q.category] || 0) * 0.5;

      // Légère variance pour la diversité
      score += Math.random() * 0.4;

      // Déjà posée → exclure
      if (askedSet.has(q.question)) score = -999;

      return { ...q, score };
    });

    const results = scored
      .filter(q => q.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    return results.length >= 2 ? results : _getDefaultSuggestions();
  }

  function _getDefaultSuggestions() {
    return [
      { id:'D1', question:'Ma routine est-elle adaptée à mon type de peau ?', category:'routine' },
      { id:'D2', question:'Quels actifs sont les plus utiles pour ma peau ?',   category:'produits' },
      { id:'D3', question:'Que devrais-je changer dans ma routine ?',           category:'coach' },
      { id:'D4', question:'Est-ce que mes produits se combinent bien ?',        category:'produits' }
    ];
  }

  // ─── Rendu des suggestions ────────────────────────────────────
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

  // ─── Construire le contexte utilisatrice ──────────────────────
  function _buildContext() {
    const answers  = AppState.questionnaire?.answers || {};
    const routine  = AppState.routine || {};
    const products = AppState.products?.recommended || [];
    const face     = AppState.face?.skinAnalysis || null;
    const premium  = !AppState.premium?.isLocked;

    // Journey
    let journeyDay = null;
    try {
      const jd = JSON.parse(localStorage.getItem('glowup_journey_v1') || 'null');
      if (jd?.startDate) {
        journeyDay = Math.min(30, Math.floor((Date.now() - new Date(jd.startDate)) / 86400000) + 1);
      }
    } catch {}

    // Routine steps
    const formatSteps = (steps) =>
      (steps || []).map(s => s.label || s.step).join(', ') || 'Non renseignée';

    // Produits recommandés
    const prodNames = products.slice(0, 6).map(p => `${p.brand} ${p.name}`).join(', ') || 'Aucun';

    return {
      skinType:      face?.skinType?.type || answers.skinType || 'Non analysée',
      concerns:      (answers.concerns || []).join(', ') || 'Non renseignés',
      morning:       formatSteps(routine.matin),
      evening:       formatSteps(routine.soir),
      ruleName:      routine.ruleName || 'Non générée',
      products:      prodNames,
      journeyDay:    journeyDay ? `Jour ${journeyDay}/30` : 'Non démarré',
      premium:       premium ? 'Abonnée Premium' : 'Version gratuite',
      makeupUsed:    (answers.makeupUsed || []).join(', ') || 'Non renseigné',
      makeupFreq:    answers.makeupFrequency || 'Non renseignée'
    };
  }

  // ─── Prompt système (fichiers + contexte dynamique) ──────────
  function _buildSystemPrompt(ctx) {
    // 1. Base : coachSystemPrompt.txt (ou prompt interne si fichier absent)
    const base = _systemPromptBase ||
      `Tu es Glow Up Coach, l'experte en skincare et maquillage personnalisé de l'application Glow Up. Tu es chaleureuse, experte, premium — jamais robotique ni médicale.`;

    // 2. Base de connaissances : coachKnowledge.json
    let knowledgeBlock = '';
    if (_knowledge) {
      const mol = _knowledge.important_molecules || {};
      knowledgeBlock = `
\n---\nBASE DE CONNAISSANCES GLOW UP :
Règles skincare : ${(_knowledge.skincare_rules || []).join(' | ')}
Molécules très bonnes : ${(mol.very_good || []).join(', ')}
Molécules bonnes : ${(mol.good || []).join(', ')}
Ingrédients à surveiller : ${(mol.watch_out || []).join(', ')}
Erreurs fréquentes à détecter : ${(_knowledge.common_skincare_errors || []).join(' | ')}
Conseils Glow Up : ${(_knowledge.glowup_advice || []).join(' | ')}`;
    }

    // 3. Exemples de style : coachExamples.json (few-shot)
    let examplesBlock = '';
    if (_examples.length > 0) {
      const formatted = _examples.map(e =>
        `Utilisatrice : "${e.user}"\nCoach : "${e.assistant}"`
      ).join('\n\n');
      examplesBlock = `\n\n---\nEXEMPLES DE TON ET STYLE ATTENDUS :\n${formatted}`;
    }

    // 4. Profil dynamique de l'utilisatrice (AppState)
    const profileBlock = `
\n---\nPROFIL DE L'UTILISATRICE :
• Type de peau : ${ctx.skinType}
• Préoccupations : ${ctx.concerns}
• Routine matin : ${ctx.morning}
• Routine soir : ${ctx.evening}
• Diagnostic appliqué : ${ctx.ruleName}
• Produits recommandés : ${ctx.products}
• Maquillage utilisé : ${ctx.makeupUsed} (fréquence : ${ctx.makeupFreq})
• Skin Journey : ${ctx.journeyDay}
• Statut : ${ctx.premium}`;

    // 5. Règles non-négociables (toujours en dernier pour priorité maximale)
    const rulesBlock = `
\n---\nRÈGLES ABSOLUES :
1. Réponds TOUJOURS en français, de façon concise (100-150 mots max)
2. Référence le profil quand c'est pertinent : "D'après ton analyse…", "Dans ta routine actuelle…"
3. Structure : Avis rapide → Ce qui est bien → Ce qu'il faut éviter/modifier → Conseil concret
4. Propose des actions si pertinent : "✅ À garder · ⚠️ À limiter · ➕ À ajouter · 🔄 À remplacer"
5. Ne promets JAMAIS de guérison, résultats dermatologiques garantis ou teinte parfaite
6. Si profil incomplet, suggère de faire le diagnostic avant de répondre
7. Ne réponds qu'aux questions liées à la beauté, skincare ou maquillage`;

    return base + knowledgeBlock + examplesBlock + profileBlock + rulesBlock;
  }

  // ─── Appel Claude API via proxy Netlify ───────────────────────
  async function _callClaude(messages) {
    try {
      const ctx = _buildContext();
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: _getModel(),
          max_tokens: 350,
          system: _buildSystemPrompt(ctx),
          messages: messages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.content?.[0]?.text || null;
    } catch {
      return null;
    }
  }

  // ─── Réponses de secours (si pas de clé API) ─────────────────
  function _fallbackResponse(userMsg) {
    const ctx  = _buildContext();
    const msg  = userMsg.toLowerCase();
    const skin = ctx.skinType;

    if (msg.includes('spf') || msg.includes('solaire') || msg.includes('protection')) {
      return `☀️ La protection solaire est le geste anti-âge n°1 — et souvent le plus négligé !\n\nPour une peau ${skin}, un SPF50 léger (gel ou fluide) chaque matin est non-négociable, même par temps nuageux. Il potentialise l'action de ta Vitamine C et prévient les nouvelles taches.\n\n✅ À garder : ta routine actuelle\n➕ À ajouter : SPF50 en dernière étape du matin`;
    }
    if (msg.includes('rétinol') || msg.includes('retinol')) {
      return `⚗️ Le rétinol est l'actif anti-âge le plus puissant — mais il demande de la méthode.\n\nPour une peau ${skin}, commence à 0,025% le soir, 2x/semaine maximum. Ne l'associe jamais à un AHA/BHA le même soir.\n\n⚠️ À éviter : rétinol + exfoliant le même soir\n✅ À faire : SPF50 obligatoire le matin suivant`;
    }
    if (msg.includes('niacinamide')) {
      return `✨ Excellente question sur la niacinamide !\n\nPour une peau ${skin}, c'est l'actif le plus polyvalent : réduit le sébum, les pores et les rougeurs. À 5-10%, elle s'utilise matin et soir sans problème, et se combine bien avec presque tous les actifs.\n\n✅ À garder : niacinamide dans ta routine\n➕ À ajouter : l'associer à du Zinc PCA pour booster l'effet sébo-régulateur`;
    }
    if (msg.includes('routine') || msg.includes('produits') || msg.includes('ensemble')) {
      const morning = ctx.morning !== 'Non renseignée' ? `\n\nTa routine matin (${ctx.morning}) est ${ctx.morning.includes('spf') || ctx.morning.includes('SPF') ? 'bien construite avec protection solaire ✅' : 'à compléter — il manque un SPF ⚠️'}.` : '';
      return `D'après ton profil (peau ${skin}), ta routine actuelle mérite une analyse point par point.${morning}\n\nLes erreurs les plus fréquentes : absence de SPF, rétinol + AHA ensemble, ou trop d'actifs irritants combinés. Pour une réponse vraiment personnalisée, dis-moi quels produits tu utilises précisément.\n\n💬 Colle ta routine et je l'analyse étape par étape !`;
    }
    if (msg.includes('peau grasse') || msg.includes('brillant') || msg.includes('pores') || msg.includes('sébum')) {
      return `Pour une peau ${skin} avec excès de sébum, voici les actifs clés :\n\n✅ À garder : Niacinamide (régule le sébum), Zinc PCA (antibactérien doux), Acide Salicylique 2% (désobstrue les pores)\n⚠️ À éviter : crèmes trop riches, huiles comédogènes (coco, lin)\n➕ À ajouter : SPF gel ou fluide mat le matin`;
    }
    if (msg.includes('sèche') || msg.includes('tiraillement') || msg.includes('déshydraté')) {
      return `Pour une peau ${skin} déshydratée, la priorité est de restaurer la barrière cutanée :\n\n✅ À garder : Acide Hyaluronique (appliquer sur peau humide), Céramides\n➕ À ajouter : une crème riche le soir, occlusif léger (squalane)\n⚠️ À éviter : alcool dénaturé dans les formules, exfoliants trop fréquents`;
    }

    return `Bonjour ! Je suis Glow Up Coach, ton experte beauté personnalisée 💫\n\nD'après ton profil (peau ${skin !== 'Non analysée' ? skin : 'à analyser'}), je peux t'aider à optimiser ta routine skincare et maquillage.\n\nPose-moi une question précise sur tes produits, tes actifs, ou ce que tu voudrais améliorer dans ta routine — je t'analyserai ça en détail !\n\n${skin === 'Non analysée' ? '💡 Conseil : commence par faire ton diagnostic peau pour des conseils vraiment personnalisés.' : ''}`;
  }

  // ─── Compter les messages utilisatrice ───────────────────────
  function _getUserMessageCount() {
    return _history.filter(m => m.role === 'user').length;
  }

  // ─── Charger l'historique depuis localStorage ─────────────────
  function _loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      _history = raw ? JSON.parse(raw) : [];
    } catch { _history = []; }
  }

  // ─── Sauvegarder l'historique ─────────────────────────────────
  function _saveHistory() {
    try {
      // Garder uniquement les 40 derniers messages
      const trimmed = _history.slice(-40);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch {}
  }

  // ─── Initialiser l'écran ──────────────────────────────────────
  async function initScreen() {
    _loadHistory();
    _render(); // afficher immédiatement (skeleton)
    await _loadCoachFiles(); // charger les fichiers data/ en arrière-plan
    _render(); // re-rendre avec contexte complet si besoin
  }

  // ─── Envoyer un message ───────────────────────────────────────
  async function sendMessage(text) {
    text = text?.trim();
    if (!text || _typing) return;

    const count = _getCurrentCount();
    const limit = _getLimit();

    if (count >= limit) {
      _showPaywall();
      return;
    }

    _history.push({ role: 'user', content: text });
    _typing = true;
    _renderMessages();
    _showTyping();

    let reply = await _callClaude(_history);
    if (!reply) reply = _fallbackResponse(text);

    _history.push({ role: 'assistant', content: reply });
    _typing = false;
    if (_getPlan() === 'glowplus') _incrementMonthlyCount();
    _saveHistory();
    _renderMessages();
  }

  // ─── Rendu principal ──────────────────────────────────────────
  function _render() {
    const container = document.getElementById('glowCoachContent');
    if (!container) return;

    const count     = _getCurrentCount();
    const limit     = _getLimit();
    const remaining = _getPlan() === 'glowplus' ? _monthlyRemaining() : Math.max(0, limit - count);

    container.innerHTML = `
      <div class="coach-layout">

        <div class="coach-header">
          <div class="coach-header-left">
            <div class="coach-avatar">✦</div>
            <div>
              <h1 class="coach-title">Glow Up Coach</h1>
              <p class="coach-subtitle">Ton experte beauté personnalisée</p>
            </div>
          </div>
          ${_getPlan() === 'glowplus' ? `
          <div class="coach-counter">
            <span class="coach-counter-num">${remaining}</span>
            <span class="coach-counter-label">échange${remaining !== 1 ? 's' : ''} ce mois</span>
          </div>` : remaining !== null ? `
          <div class="coach-counter">
            <span class="coach-counter-num">${remaining}</span>
            <span class="coach-counter-label">échange${remaining !== 1 ? 's' : ''} restant${remaining !== 1 ? 's' : ''}</span>
          </div>` : ''}
        </div>

        <div class="coach-messages" id="coachMessages">
          ${_history.length === 0 ? _renderWelcome() : ''}
          ${_renderAllMessages()}
        </div>

        <div class="coach-input-area" id="coachInputArea">
          ${count >= limit
            ? _renderPaywallInline()
            : `<div class="coach-input-wrap">
                <textarea
                  id="coachInput"
                  class="coach-input"
                  placeholder="Pose ta question à Glow Up Coach…"
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

    _scrollBottom();
  }

  function _renderWelcome() {
    const ctx = _buildContext();
    const skinLine = ctx.skinType !== 'Non analysée'
      ? `Ton profil peau <strong>${ctx.skinType}</strong> est chargé — mes conseils sont personnalisés pour toi.`
      : `Commence par faire ton <a href="#" onclick="startGlowUp(); return false;">diagnostic peau</a> pour des conseils vraiment personnalisés.`;

    return `
      <div class="coach-welcome">
        <div class="coach-welcome-bubble">
          <p>Bonjour ! Je suis <strong>Glow Up Coach</strong>, ton experte beauté personnalisée ✦</p>
          <p>${skinLine}</p>
          <p>Pose-moi une question ou choisis un sujet ci-dessous.</p>
        </div>
        ${_renderSuggestions()}
      </div>`;
  }

  function _renderAllMessages() {
    return _history.map(m => _renderBubble(m.role, m.content)).join('');
  }

  function _renderBubble(role, content) {
    const isUser = role === 'user';
    // Formater les lignes avec retours à la ligne
    const formatted = content
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
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

  function _renderMessages() {
    const container = document.getElementById('coachMessages');
    if (!container) return;
    const count = _getUserMessageCount();
    const limit = _getLimit();

    const lastRole = _history.length ? _history[_history.length - 1].role : null;
    container.innerHTML =
      (_history.length === 0 ? _renderWelcome() : '') +
      _renderAllMessages() +
      (_typing ? `<div class="coach-msg coach-msg--coach"><div class="coach-msg-avatar">✦</div><div class="coach-typing"><span></span><span></span><span></span></div></div>` : '') +
      (!_typing && lastRole === 'assistant' ? _renderSuggestions() : '');

    const inputArea = document.getElementById('coachInputArea');
    if (inputArea && count >= limit) {
      inputArea.innerHTML = _renderPaywallInline();
    }

    // Mettre à jour le compteur
    const counter = document.querySelector('.coach-counter-num');
    if (counter) counter.textContent = Math.max(0, FREE_LIMIT - count);

    _scrollBottom();
  }

  function _showTyping() {
    _renderMessages();
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

  // ─── Actions UI ──────────────────────────────────────────────
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitInput();
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function clearHistory() {
    _history = [];
    localStorage.removeItem(HISTORY_KEY);
  }

  return { initScreen, sendMessage, submitInput, handleKey, autoResize, clearHistory, selectSuggestion };

})();
