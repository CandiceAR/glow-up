/* ============================================================
   intentionScreen.js — Moment émotionnel avant la routine
   • Question différente à chaque session (rotation toutes les 6h)
   • Réponse stockée dans AppState.intention
   • Influence légèrement le ton des conseils dans la routine
   ============================================================ */

'use strict';

const IntentionScreen = (() => {

  // ── Banque de questions ────────────────────────────────────────
  // Chaque question a ses propres réponses, chacune mappée à une intention

  const QUESTIONS = [

    // ── 1-10 : Humeur du moment ────────────────────────────────
    {
      q: "Quand tu te regardes dans le miroir, qu'aimerais-tu voir en premier ?",
      answers: [
        { label: "Un éclat naturel",             key: 'rayonnante' },
        { label: "Une peau apaisée",             key: 'apaisee'    },
        { label: "De la confiance",              key: 'confiante'  },
        { label: "Quelque chose d'audacieux",    key: 'audacieuse' }
      ]
    },
    {
      q: "Quelle version de toi veux-tu révéler aujourd'hui ?",
      answers: [
        { label: "La version lumineuse",         key: 'rayonnante' },
        { label: "La version naturelle",         key: 'naturelle'  },
        { label: "La version confiante",         key: 'confiante'  },
        { label: "La version audacieuse",        key: 'audacieuse' },
        { label: "La version sereine",           key: 'apaisee'    }
      ]
    },
    {
      q: "Comment veux-tu te sentir en te regardant dans le miroir ?",
      answers: [
        { label: "Rayonnante",                   key: 'rayonnante' },
        { label: "Apaisée",                      key: 'apaisee'    },
        { label: "Fraîche",                      key: 'fraiche'    },
        { label: "Confiante",                    key: 'confiante'  },
        { label: "Audacieuse",                   key: 'audacieuse' }
      ]
    },
    {
      q: "Ce moment de soin, tu le vis comment ?",
      answers: [
        { label: "Comme un rituel doux pour moi",                   key: 'apaisee'    },
        { label: "Comme une armure avant d'affronter la journée",   key: 'confiante'  },
        { label: "Comme un plaisir simple et naturel",              key: 'naturelle'  },
        { label: "Comme une envie d'oser quelque chose de nouveau", key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta peau pouvait te dire une chose ce matin, ce serait…",
      answers: [
        { label: "\"Laisse-moi briller\"",       key: 'rayonnante' },
        { label: "\"Prends soin de moi\"",       key: 'apaisee'    },
        { label: "\"Garde-moi simple\"",         key: 'naturelle'  },
        { label: "\"J'ai envie d'éclat\"",       key: 'fraiche'    }
      ]
    },
    {
      q: "Quelle énergie veux-tu dégager aujourd'hui ?",
      answers: [
        { label: "Douce et lumineuse",           key: 'rayonnante' },
        { label: "Calme et posée",               key: 'apaisee'    },
        { label: "Fraîche et légère",            key: 'fraiche'    },
        { label: "Forte et confiante",           key: 'confiante'  },
        { label: "Audacieuse et libre",          key: 'audacieuse' }
      ]
    },
    {
      q: "En ce moment, prendre soin de toi c'est avant tout…",
      answers: [
        { label: "Me sentir belle naturellement", key: 'naturelle'  },
        { label: "Retrouver de l'éclat",          key: 'rayonnante' },
        { label: "Me ressourcer",                 key: 'apaisee'    },
        { label: "Prendre confiance",             key: 'confiante'  }
      ]
    },
    {
      q: "Ce matin, ta priorité c'est…",
      answers: [
        { label: "Un teint frais et reposé",         key: 'fraiche'    },
        { label: "Une peau douce et hydratée",        key: 'apaisee'    },
        { label: "Un glow naturel",                   key: 'rayonnante' },
        { label: "Me sentir parfaitement moi",        key: 'naturelle'  },
        { label: "Oser un regard ou une couleur",     key: 'audacieuse' }
      ]
    },
    {
      q: "Quel mot te parle le plus en ce moment ?",
      answers: [
        { label: "Lumière",                      key: 'rayonnante' },
        { label: "Douceur",                      key: 'apaisee'    },
        { label: "Liberté",                      key: 'audacieuse' },
        { label: "Authenticité",                 key: 'naturelle'  },
        { label: "Fraîcheur",                    key: 'fraiche'    }
      ]
    },
    {
      q: "La beauté, pour toi c'est d'abord…",
      answers: [
        { label: "Se sentir bien dans sa peau",      key: 'naturelle'  },
        { label: "Rayonner sans effort",              key: 'rayonnante' },
        { label: "Se transformer pour le plaisir",   key: 'audacieuse' },
        { label: "Prendre soin de soi en douceur",   key: 'apaisee'    }
      ]
    },

    // ── 11-20 : Émotion & ambiance ──────────────────────────────
    {
      q: "Aujourd'hui tu veux te sentir…",
      answers: [
        { label: "Légère et fraîche",            key: 'fraiche'    },
        { label: "Belle sans y penser",          key: 'naturelle'  },
        { label: "Lumineuse",                    key: 'rayonnante' },
        { label: "Prête à tout",                 key: 'confiante'  },
        { label: "Différente, en mieux",         key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu devais offrir quelque chose à ta peau aujourd'hui, ce serait…",
      answers: [
        { label: "De la légèreté",               key: 'fraiche'    },
        { label: "De la douceur",                key: 'apaisee'    },
        { label: "De l'éclat",                   key: 'rayonnante' },
        { label: "De la confiance",              key: 'confiante'  }
      ]
    },
    {
      q: "Si ta journée était une lumière, elle serait…",
      answers: [
        { label: "Un rayon de soleil doux",      key: 'rayonnante' },
        { label: "Une bougie calme le soir",     key: 'apaisee'    },
        { label: "La lumière naturelle du matin", key: 'naturelle' },
        { label: "Un néon vif et décidé",        key: 'confiante'  },
        { label: "Un feu d'artifice discret",    key: 'audacieuse' }
      ]
    },
    {
      q: "Ce soin est une parenthèse. Dans cette parenthèse, tu veux…",
      answers: [
        { label: "Te reposer",                   key: 'apaisee'    },
        { label: "Te préparer",                  key: 'confiante'  },
        { label: "Te retrouver",                 key: 'naturelle'  },
        { label: "T'émerveiller",                key: 'audacieuse' },
        { label: "T'illuminer",                  key: 'rayonnante' }
      ]
    },
    {
      q: "Quand tu fermes les yeux et penses à toi à ton meilleur, tu te vois…",
      answers: [
        { label: "Rayonnante dans la lumière",   key: 'rayonnante' },
        { label: "Sereine et posée",             key: 'apaisee'    },
        { label: "Authentique et libre",         key: 'naturelle'  },
        { label: "Confiante, le regard haut",    key: 'confiante'  },
        { label: "Osant quelque chose de fort",  key: 'audacieuse' }
      ]
    },
    {
      q: "Aujourd'hui tu traverses ta journée…",
      answers: [
        { label: "Avec légèreté",                key: 'fraiche'    },
        { label: "Avec sérénité",                key: 'apaisee'    },
        { label: "Avec assurance",               key: 'confiante'  },
        { label: "Avec discrétion",              key: 'naturelle'  },
        { label: "Avec caractère",               key: 'audacieuse' }
      ]
    },
    {
      q: "Ta beauté aujourd'hui, c'est un peu comme…",
      answers: [
        { label: "Une fleur qui s'ouvre au soleil", key: 'rayonnante' },
        { label: "Un lac calme au petit matin",      key: 'apaisee'    },
        { label: "Un jardin sauvage et sincère",     key: 'naturelle'  },
        { label: "Un roc solide et élégant",         key: 'confiante'  },
        { label: "Un orage qui approche",            key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu pouvais choisir ton état d'esprit pour les prochaines heures, ce serait…",
      answers: [
        { label: "Pétillante",                   key: 'rayonnante' },
        { label: "Tranquille",                   key: 'apaisee'    },
        { label: "Vive et fraîche",              key: 'fraiche'    },
        { label: "Déterminée",                   key: 'confiante'  },
        { label: "Surprenante",                  key: 'audacieuse' }
      ]
    },
    {
      q: "Ce matin tu as envie de…",
      answers: [
        { label: "Briller sans forcer",          key: 'rayonnante' },
        { label: "Me sentir douce et posée",     key: 'apaisee'    },
        { label: "Rester moi, simplement",       key: 'naturelle'  },
        { label: "Aller de l'avant avec fierté", key: 'confiante'  },
        { label: "Tenter quelque chose de neuf", key: 'audacieuse' }
      ]
    },
    {
      q: "L'image que tu veux renvoyer aujourd'hui, c'est…",
      answers: [
        { label: "Quelqu'un de lumineux",        key: 'rayonnante' },
        { label: "Quelqu'un de serein",          key: 'apaisee'    },
        { label: "Quelqu'un d'authentique",      key: 'naturelle'  },
        { label: "Quelqu'un de sûr de lui",      key: 'confiante'  },
        { label: "Quelqu'un d'inattendu",        key: 'audacieuse' }
      ]
    },

    // ── 21-30 : Rapport au soin ──────────────────────────────────
    {
      q: "Ce rituel de soin, c'est pour toi…",
      answers: [
        { label: "Un moment de grâce",           key: 'rayonnante' },
        { label: "Un câlin que je me fais",      key: 'apaisee'    },
        { label: "Un acte de fidélité à moi-même", key: 'naturelle' },
        { label: "Un investissement dans ma confiance", key: 'confiante' },
        { label: "Un terrain d'expérience",      key: 'audacieuse' }
      ]
    },
    {
      q: "Quand tu appliques ta crème, tu penses à…",
      answers: [
        { label: "La journée qui va briller",    key: 'rayonnante' },
        { label: "Le calme que tu portes",       key: 'apaisee'    },
        { label: "Rien — juste être là",         key: 'naturelle'  },
        { label: "Ce que tu vas accomplir",      key: 'confiante'  },
        { label: "L'envie d'essayer quelque chose", key: 'audacieuse' }
      ]
    },
    {
      q: "Ton rapport à ta peau en ce moment, c'est…",
      answers: [
        { label: "Je veux qu'elle rayonne",      key: 'rayonnante' },
        { label: "Je veux qu'elle soit apaisée", key: 'apaisee'    },
        { label: "Je l'accepte telle qu'elle est", key: 'naturelle' },
        { label: "Je veux lui faire confiance",  key: 'confiante'  },
        { label: "Je veux la transformer",       key: 'audacieuse' }
      ]
    },
    {
      q: "Prendre soin de ta peau te donne avant tout…",
      answers: [
        { label: "De l'éclat",                   key: 'rayonnante' },
        { label: "De la paix intérieure",        key: 'apaisee'    },
        { label: "Un sentiment de naturalité",   key: 'naturelle'  },
        { label: "De l'assurance",               key: 'confiante'  },
        { label: "De la créativité",             key: 'audacieuse' }
      ]
    },
    {
      q: "La routine parfaite pour toi, c'est une routine…",
      answers: [
        { label: "Qui me donne de l'éclat",      key: 'rayonnante' },
        { label: "Qui apaise ma peau",           key: 'apaisee'    },
        { label: "Courte et efficace",           key: 'naturelle'  },
        { label: "Qui tient tout au long du jour", key: 'confiante' },
        { label: "Qui ose les actifs puissants", key: 'audacieuse' }
      ]
    },
    {
      q: "Tu appliquerais un masque ce soir si…",
      answers: [
        { label: "Tu veux briller demain",       key: 'rayonnante' },
        { label: "Tu as besoin de décompresser", key: 'apaisee'    },
        { label: "Ta peau le réclame vraiment",  key: 'naturelle'  },
        { label: "Tu as une journée importante", key: 'confiante'  },
        { label: "Tu veux tester quelque chose", key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu attends d'un produit de soin, c'est qu'il…",
      answers: [
        { label: "Illumine ton teint",           key: 'rayonnante' },
        { label: "Apaise ta peau sensible",      key: 'apaisee'    },
        { label: "Soit honnête et minimal",      key: 'naturelle'  },
        { label: "Soit prouvé et fiable",        key: 'confiante'  },
        { label: "Te fasse voir une différence", key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta routine skincare était une playlist, elle serait…",
      answers: [
        { label: "Pop solaire et lumineuse",     key: 'rayonnante' },
        { label: "Lo-fi calme et posée",         key: 'apaisee'    },
        { label: "Acoustique sans fioritures",   key: 'naturelle'  },
        { label: "Jazz élégant et maîtrisé",     key: 'confiante'  },
        { label: "Électro intense et inattendu", key: 'audacieuse' }
      ]
    },
    {
      q: "Ton meilleur soin, c'est celui qui…",
      answers: [
        { label: "Me laisse avec de l'éclat",    key: 'rayonnante' },
        { label: "Me calme et me détend",        key: 'apaisee'    },
        { label: "Ne se remarque pas — juste moi", key: 'naturelle' },
        { label: "Fait vraiment une différence visible", key: 'confiante' },
        { label: "Me surprend à chaque utilisation", key: 'audacieuse' }
      ]
    },
    {
      q: "Dans quelle pièce tu imagines ta routine idéale ?",
      answers: [
        { label: "Une salle de bain baignée de lumière", key: 'rayonnante' },
        { label: "Un bain chaud aux bougies",     key: 'apaisee'    },
        { label: "Une fenêtre ouverte sur le jardin", key: 'naturelle' },
        { label: "Un dressing bien organisé",    key: 'confiante'  },
        { label: "Un studio créatif et coloré",  key: 'audacieuse' }
      ]
    },

    // ── 31-40 : Identité & philosophie ──────────────────────────
    {
      q: "Pour toi, une belle journée commence par…",
      answers: [
        { label: "Un visage lumineux",           key: 'rayonnante' },
        { label: "Un moment de calme",           key: 'apaisee'    },
        { label: "Rester naturelle",             key: 'naturelle'  },
        { label: "Me sentir prête",              key: 'confiante'  },
        { label: "Une idée de quelque chose d'osé", key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu pouvais te décrire en un mot ce matin, ce serait…",
      answers: [
        { label: "Soleil",                       key: 'rayonnante' },
        { label: "Sérénité",                     key: 'apaisee'    },
        { label: "Brume",                        key: 'naturelle'  },
        { label: "Granite",                      key: 'confiante'  },
        { label: "Flamme",                       key: 'audacieuse' }
      ]
    },
    {
      q: "La beauté sans effort, pour toi c'est…",
      answers: [
        { label: "Une peau qui brille naturellement", key: 'rayonnante' },
        { label: "Une peau calme et confortable",     key: 'apaisee'    },
        { label: "Aucun produit visible — juste moi", key: 'naturelle'  },
        { label: "Une routine qui fait le travail",   key: 'confiante'  }
      ]
    },
    {
      q: "Tu te sens la plus toi-même quand tu es…",
      answers: [
        { label: "Rayonnante et vivante",        key: 'rayonnante' },
        { label: "Calme et centrée",             key: 'apaisee'    },
        { label: "Au naturel, sans artifice",    key: 'naturelle'  },
        { label: "Sûre de toi et ancrée",        key: 'confiante'  },
        { label: "En train d'explorer",          key: 'audacieuse' }
      ]
    },
    {
      q: "Ta beauté t'appartient. Aujourd'hui tu la portes…",
      answers: [
        { label: "Avec légèreté et lumière",     key: 'rayonnante' },
        { label: "Avec douceur et patience",     key: 'apaisee'    },
        { label: "Avec simplicité",              key: 'naturelle'  },
        { label: "Avec assurance",               key: 'confiante'  },
        { label: "Avec audace",                  key: 'audacieuse' }
      ]
    },
    {
      q: "Qu'est-ce que tu veux que les autres ressentent en te voyant ?",
      answers: [
        { label: "De la chaleur et de l'éclat",  key: 'rayonnante' },
        { label: "Du calme et de la sérénité",   key: 'apaisee'    },
        { label: "De l'authenticité",            key: 'naturelle'  },
        { label: "De la force et du respect",    key: 'confiante'  },
        { label: "De la curiosité",              key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu ne veux surtout pas ressentir aujourd'hui, c'est…",
      answers: [
        { label: "Être terne",                   key: 'rayonnante' },
        { label: "Être tendue ou stressée",      key: 'apaisee'    },
        { label: "Être artificielle",            key: 'naturelle'  },
        { label: "Être invisible",               key: 'confiante'  },
        { label: "Être banale",                  key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu offrais ta routine à une amie, tu lui dirais que c'est…",
      answers: [
        { label: "La routine du glow",           key: 'rayonnante' },
        { label: "La routine qui apaise",        key: 'apaisee'    },
        { label: "La routine du naturel",        key: 'naturelle'  },
        { label: "La routine qui tient promesse", key: 'confiante' },
        { label: "La routine qui ose",           key: 'audacieuse' }
      ]
    },
    {
      q: "Ta relation avec ton reflet ce matin, c'est…",
      answers: [
        { label: "On s'aime, on brille",           key: 'rayonnante' },
        { label: "On prend soin l'une de l'autre", key: 'apaisee'    },
        { label: "On se voit telle qu'on est",     key: 'naturelle'  },
        { label: "On avance ensemble",             key: 'confiante'  },
        { label: "On veut se surprendre",          key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta peau était un paysage, ce serait…",
      answers: [
        { label: "Un lever de soleil sur la mer", key: 'rayonnante' },
        { label: "Une forêt après la pluie",      key: 'apaisee'    },
        { label: "Une lande sauvage et sincère",  key: 'naturelle'  },
        { label: "Une montagne stable et claire", key: 'confiante'  },
        { label: "Un volcan discret",             key: 'audacieuse' }
      ]
    },

    // ── 41-50 : Occasion & contexte ─────────────────────────────
    {
      q: "Aujourd'hui tu as…",
      answers: [
        { label: "Une journée à briller",        key: 'rayonnante' },
        { label: "Besoin de calme absolu",       key: 'apaisee'    },
        { label: "Envie de rester dans mon élan", key: 'naturelle' },
        { label: "Un rendez-vous important",     key: 'confiante'  },
        { label: "L'envie de marquer les esprits", key: 'audacieuse' }
      ]
    },
    {
      q: "Ce matin, la journée qui t'attend ressemble à…",
      answers: [
        { label: "Une belle promenade ensoleillée",  key: 'rayonnante' },
        { label: "Un dimanche tranquille",           key: 'apaisee'    },
        { label: "Une balade dans la nature",        key: 'naturelle'  },
        { label: "Une réunion que tu vas maîtriser", key: 'confiante'  },
        { label: "Une soirée où tu vas surprendre",  key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu rates ta routine ce matin, qu'est-ce qui te manquerait le plus ?",
      answers: [
        { label: "Mon éclat naturel",            key: 'rayonnante' },
        { label: "Mon moment de calme",          key: 'apaisee'    },
        { label: "Juste me sentir moi",          key: 'naturelle'  },
        { label: "Ma confiance du matin",        key: 'confiante'  },
        { label: "L'envie d'oser quelque chose", key: 'audacieuse' }
      ]
    },
    {
      q: "Tu as un événement ce soir. Tu veux que ta peau dise…",
      answers: [
        { label: "\"Je brille naturellement\"",    key: 'rayonnante' },
        { label: "\"Je suis fraîche et reposée\"", key: 'fraiche'    },
        { label: "\"Je suis moi, sans masque\"",   key: 'naturelle'  },
        { label: "\"Je suis prête à tout\"",       key: 'confiante'  },
        { label: "\"Je suis inoubliable\"",        key: 'audacieuse' }
      ]
    },
    {
      q: "Ce week-end, tu te vois…",
      answers: [
        { label: "Lumineuse et détendue",        key: 'rayonnante' },
        { label: "Dans ton cocon, au calme",     key: 'apaisee'    },
        { label: "Sans une couche de produit",   key: 'naturelle'  },
        { label: "Active et efficace",           key: 'confiante'  },
        { label: "Avec un look audacieux",       key: 'audacieuse' }
      ]
    },
    {
      q: "En vacances, ta routine de beauté c'est…",
      answers: [
        { label: "Crème solaire + glow naturel",     key: 'rayonnante' },
        { label: "Le minimum pour ma peau sensible", key: 'apaisee'    },
        { label: "Eau, soleil, rien d'autre",        key: 'naturelle'  },
        { label: "Maquillage longue tenue",          key: 'confiante'  },
        { label: "Un look différent chaque jour",    key: 'audacieuse' }
      ]
    },
    {
      q: "Aujourd'hui il pleut. Ta routine s'adapte. Tu choisis…",
      answers: [
        { label: "Un sérum hydratant pour rayonner", key: 'rayonnante' },
        { label: "Une crème cocooning très douce",   key: 'apaisee'    },
        { label: "L'essentiel, ni plus ni moins",    key: 'naturelle'  },
        { label: "Une base de teint longue tenue",   key: 'confiante'  },
        { label: "Un regard dramatique pour le fun", key: 'audacieuse' }
      ]
    },
    {
      q: "Tu prépares ta peau pour une photo. Tu veux qu'elle soit…",
      answers: [
        { label: "Éclatante et lumineuse",       key: 'rayonnante' },
        { label: "Apaisée et sans rougeur",      key: 'apaisee'    },
        { label: "Naturelle, sans filtre",       key: 'naturelle'  },
        { label: "Parfaite et nette",            key: 'confiante'  },
        { label: "Marquante et originale",       key: 'audacieuse' }
      ]
    },
    {
      q: "Après une nuit difficile, tu veux que ta peau raconte…",
      answers: [
        { label: "\"J'ai quand même de l'éclat\"",     key: 'rayonnante' },
        { label: "\"Je suis calme et reposée\"",        key: 'apaisee'    },
        { label: "\"Je suis honnête sur ma fatigue\"",  key: 'naturelle'  },
        { label: "\"Rien ne me fait plier\"",           key: 'confiante'  },
        { label: "\"Regardez-moi quand même\"",         key: 'audacieuse' }
      ]
    },
    {
      q: "Ce matin tu te prépares vite. Ce que tu gardes en premier, c'est…",
      answers: [
        { label: "Mon sérum éclat",              key: 'rayonnante' },
        { label: "Ma crème apaisante",           key: 'apaisee'    },
        { label: "Juste nettoyer + hydrater",    key: 'naturelle'  },
        { label: "Ma protection solaire",        key: 'confiante'  },
        { label: "Mon rouge à lèvres",           key: 'audacieuse' }
      ]
    },

    // ── 51-60 : Saisons & sensations ────────────────────────────
    {
      q: "Quel élément naturel tu associes à ta peau en ce moment ?",
      answers: [
        { label: "Le soleil",                    key: 'rayonnante' },
        { label: "L'eau calme",                  key: 'apaisee'    },
        { label: "La terre",                     key: 'naturelle'  },
        { label: "Le vent",                      key: 'fraiche'    },
        { label: "Le feu",                       key: 'audacieuse' }
      ]
    },
    {
      q: "Ta peau ce matin, c'est plutôt…",
      answers: [
        { label: "Miel et lumière",              key: 'rayonnante' },
        { label: "Lait et lavande",              key: 'apaisee'    },
        { label: "Eau de source",                key: 'fraiche'    },
        { label: "Argile et minéral",            key: 'naturelle'  },
        { label: "Épices et intensité",          key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta routine avait une saison, ce serait…",
      answers: [
        { label: "L'été — lumineuse et chaleureuse",    key: 'rayonnante' },
        { label: "L'automne — douce et introspective",  key: 'apaisee'    },
        { label: "Le printemps — naturelle et légère",  key: 'naturelle'  },
        { label: "L'hiver — protectrice et efficace",   key: 'confiante'  }
      ]
    },
    {
      q: "Le toucher que tu aimes pour ta peau, c'est…",
      answers: [
        { label: "Soyeux et légèrement lumineux", key: 'rayonnante' },
        { label: "Doux comme de la soie",         key: 'apaisee'    },
        { label: "Propre et naturel",             key: 'naturelle'  },
        { label: "Lisse et sans pore visible",    key: 'confiante'  },
        { label: "Velouté et intense",            key: 'audacieuse' }
      ]
    },
    {
      q: "L'odeur de ta routine idéale, c'est…",
      answers: [
        { label: "Fleuri et doux",               key: 'rayonnante' },
        { label: "Lavande et camomille",         key: 'apaisee'    },
        { label: "Sans parfum, neutre",          key: 'naturelle'  },
        { label: "Propre et frais",              key: 'fraiche'    },
        { label: "Boisé et puissant",            key: 'audacieuse' }
      ]
    },
    {
      q: "La texture que tu préfères appliquer sur ta peau, c'est…",
      answers: [
        { label: "Un sérum fluide qui glisse",        key: 'rayonnante' },
        { label: "Une crème épaisse et enveloppante", key: 'apaisee'    },
        { label: "Une eau légère",                    key: 'fraiche'    },
        { label: "Une crème mate qui tient",          key: 'confiante'  },
        { label: "Un gel pétillant ou inhabituel",    key: 'audacieuse' }
      ]
    },
    {
      q: "La couleur qui décrit ta peau aujourd'hui, c'est…",
      answers: [
        { label: "Or doux et lumineux",          key: 'rayonnante' },
        { label: "Lavande et rose pâle",         key: 'apaisee'    },
        { label: "Beige naturel sans fard",      key: 'naturelle'  },
        { label: "Blanc minéral et net",         key: 'fraiche'    },
        { label: "Bordeaux profond",             key: 'audacieuse' }
      ]
    },
    {
      q: "Ton soin du soir idéal, c'est…",
      answers: [
        { label: "Un masque éclat pour briller demain", key: 'rayonnante' },
        { label: "Une crème de nuit ultra douce",       key: 'apaisee'    },
        { label: "Juste nettoyer et laisser respirer",  key: 'naturelle'  },
        { label: "Un actif ciblé pour des résultats",   key: 'confiante'  },
        { label: "Un soin expérimental que j'essaie",   key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta peau était un tissu, elle serait…",
      answers: [
        { label: "De la soie illuminée",         key: 'rayonnante' },
        { label: "Du velours doux et apaisant",  key: 'apaisee'    },
        { label: "Du lin naturel et brut",       key: 'naturelle'  },
        { label: "Du coton solide et fiable",    key: 'confiante'  },
        { label: "Du cuir décalé",               key: 'audacieuse' }
      ]
    },
    {
      q: "Ta peau a besoin de toi ce matin. Tu lui réponds…",
      answers: [
        { label: "\"Je te fais briller\"",              key: 'rayonnante' },
        { label: "\"Je te calme et te protège\"",       key: 'apaisee'    },
        { label: "\"Je te laisse être toi\"",           key: 'naturelle'  },
        { label: "\"Je te prépare au mieux\"",          key: 'confiante'  },
        { label: "\"Je te fais vivre quelque chose\"",  key: 'audacieuse' }
      ]
    },

    // ── 61-70 : Maquillage & expression ─────────────────────────
    {
      q: "Le maquillage pour toi, c'est…",
      answers: [
        { label: "Un supplément de lumière",          key: 'rayonnante' },
        { label: "Une façon de me sentir bien",       key: 'apaisee'    },
        { label: "Optionnel — je préfère le naturel", key: 'naturelle'  },
        { label: "Mon outil de confiance",            key: 'confiante'  },
        { label: "Un terrain de jeu créatif",         key: 'audacieuse' }
      ]
    },
    {
      q: "Ton produit de maquillage indispensable, c'est…",
      answers: [
        { label: "Un highlighter subtil",              key: 'rayonnante' },
        { label: "Un fond de teint couvrant doux",     key: 'apaisee'    },
        { label: "Du baume à lèvres et rien d'autre",  key: 'naturelle'  },
        { label: "Un mascara longue tenue",            key: 'confiante'  },
        { label: "Un rouge à lèvres intense",          key: 'audacieuse' }
      ]
    },
    {
      q: "Yeux ou lèvres — ce matin tu mets l'accent sur…",
      answers: [
        { label: "Les deux — le glow avant tout",         key: 'rayonnante' },
        { label: "Ni l'un ni l'autre — juste la peau",    key: 'apaisee'    },
        { label: "Rien — naturelle au maximum",           key: 'naturelle'  },
        { label: "Les yeux — regard direct",              key: 'confiante'  },
        { label: "Les lèvres — couleur forte",            key: 'audacieuse' }
      ]
    },
    {
      q: "Ta palette de teintes idéale en ce moment, c'est…",
      answers: [
        { label: "Dorés et pêche",               key: 'rayonnante' },
        { label: "Rosés et mauves doux",         key: 'apaisee'    },
        { label: "Neutres et beiges",            key: 'naturelle'  },
        { label: "Bruns terreux et profonds",    key: 'confiante'  },
        { label: "Rouges, bordeaux ou noir",     key: 'audacieuse' }
      ]
    },
    {
      q: "Ton idée du \"no-makeup makeup\", c'est…",
      answers: [
        { label: "Peau lumineuse + mascara",     key: 'rayonnante' },
        { label: "BB crème + baume",             key: 'apaisee'    },
        { label: "Vraiment aucun produit",       key: 'naturelle'  },
        { label: "Base + cils + sourcils",       key: 'confiante'  },
        { label: "Ça n'existe pas pour moi",     key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu devais résumer ton make-up en une icône mode, ce serait…",
      answers: [
        { label: "Brigitte Bardot — lumière naturelle",  key: 'rayonnante' },
        { label: "Audrey Hepburn — élégance douce",      key: 'apaisee'    },
        { label: "Gwyneth Paltrow — minimalisme clean",  key: 'naturelle'  },
        { label: "Cate Blanchett — assurance totale",    key: 'confiante'  },
        { label: "Rihanna — créativité sans limite",     key: 'audacieuse' }
      ]
    },
    {
      q: "Quand tu choisis ton fond de teint, tu veux…",
      answers: [
        { label: "Un effet bonne mine naturel",     key: 'rayonnante' },
        { label: "Quelque chose qui n'irrite pas",  key: 'apaisee'    },
        { label: "Le moins de couverture possible", key: 'naturelle'  },
        { label: "Une tenue longue durée",          key: 'confiante'  },
        { label: "Un fini brillant et dramatique",  key: 'audacieuse' }
      ]
    },
    {
      q: "Le rouge à lèvres parfait pour toi ce matin, c'est…",
      answers: [
        { label: "Rose pêche légèrement brillant",           key: 'rayonnante' },
        { label: "Rose nude très discret",                   key: 'apaisee'    },
        { label: "Du baume transparent",                     key: 'naturelle'  },
        { label: "Rouge mat classique",                      key: 'confiante'  },
        { label: "Bordeaux foncé ou couleur inattendue",     key: 'audacieuse' }
      ]
    },
    {
      q: "Ton trait d'eye-liner en ce moment, il est…",
      answers: [
        { label: "Doré ou cuivré, subtil",       key: 'rayonnante' },
        { label: "Absent — je n'en mets pas",    key: 'apaisee'    },
        { label: "Vraiment inexistant",          key: 'naturelle'  },
        { label: "Noir, précis, net",            key: 'confiante'  },
        { label: "Graphique ou coloré",          key: 'audacieuse' }
      ]
    },
    {
      q: "Tes sourcils ce matin, tu les veux…",
      answers: [
        { label: "Naturels et légèrement mis en valeur", key: 'rayonnante' },
        { label: "Discrets et brossés",                  key: 'apaisee'    },
        { label: "Intouchés comme ils sont",             key: 'naturelle'  },
        { label: "Définis et architecturés",             key: 'confiante'  },
        { label: "Épais et marquants",                   key: 'audacieuse' }
      ]
    },

    // ── 71-80 : Questionnements profonds ────────────────────────
    {
      q: "Si tu pouvais effacer une insécurité liée à ta peau, laquelle ?",
      answers: [
        { label: "Mon manque d'éclat",           key: 'rayonnante' },
        { label: "Mes rougeurs ou sensibilités", key: 'apaisee'    },
        { label: "Me comparer aux autres",       key: 'naturelle'  },
        { label: "Mes imperfections visibles",   key: 'confiante'  },
        { label: "Avoir peur d'oser",            key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu te dirais si tu étais ta meilleure amie ce matin…",
      answers: [
        { label: "\"Tu rayonnes, tu ne le vois pas assez\"",  key: 'rayonnante' },
        { label: "\"Prends soin de toi aujourd'hui\"",        key: 'apaisee'    },
        { label: "\"Tu es belle comme tu es\"",               key: 'naturelle'  },
        { label: "\"Tu es capable de tout\"",                 key: 'confiante'  },
        { label: "\"Ose ce que tu n'as pas encore osé\"",     key: 'audacieuse' }
      ]
    },
    {
      q: "Ta peau a une mémoire. Ce dont elle se souvient en ce moment, c'est…",
      answers: [
        { label: "Des jours où elle brillait",       key: 'rayonnante' },
        { label: "Des jours de stress ou fatigue",   key: 'apaisee'    },
        { label: "Des jours au grand air",           key: 'naturelle'  },
        { label: "Des jours où elle était au top",   key: 'confiante'  },
        { label: "Des expériences surprenantes",     key: 'audacieuse' }
      ]
    },
    {
      q: "Dans 10 ans, tu veux que ta peau raconte…",
      answers: [
        { label: "Qu'elle a toujours été soignée avec amour",  key: 'rayonnante' },
        { label: "Qu'elle a été protégée et respectée",        key: 'apaisee'    },
        { label: "Une belle vie vécue naturellement",          key: 'naturelle'  },
        { label: "Une femme qui s'est toujours tenue droite",  key: 'confiante'  },
        { label: "Mille aventures et transformations",         key: 'audacieuse' }
      ]
    },
    {
      q: "La chose dont ta peau a le plus besoin ce matin, c'est…",
      answers: [
        { label: "Du soleil et de la vie",       key: 'rayonnante' },
        { label: "Du repos et de la paix",       key: 'apaisee'    },
        { label: "De l'air pur",                 key: 'naturelle'  },
        { label: "De la constance",              key: 'confiante'  },
        { label: "De l'aventure",                key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu n'acceptes plus concernant ta peau…",
      answers: [
        { label: "Être terne et sans vie",           key: 'rayonnante' },
        { label: "Les irritations que j'ignore",     key: 'apaisee'    },
        { label: "Les produits inutiles",            key: 'naturelle'  },
        { label: "Ne pas être constante",            key: 'confiante'  },
        { label: "Me conformer aux standards",       key: 'audacieuse' }
      ]
    },
    {
      q: "La meilleure chose que tu aies faite pour ta peau, c'est…",
      answers: [
        { label: "Adopter un sérum éclat",           key: 'rayonnante' },
        { label: "Arrêter les produits agressifs",   key: 'apaisee'    },
        { label: "Simplifier ma routine",            key: 'naturelle'  },
        { label: "Être plus régulière",              key: 'confiante'  },
        { label: "Oser un actif fort",               key: 'audacieuse' }
      ]
    },
    {
      q: "Qu'est-ce qui te manque dans ta routine actuelle ?",
      answers: [
        { label: "Un produit qui illumine vraiment", key: 'rayonnante' },
        { label: "Un soin plus apaisant",            key: 'apaisee'    },
        { label: "Moins de produits",                key: 'naturelle'  },
        { label: "Plus de régularité",               key: 'confiante'  },
        { label: "Quelque chose de nouveau",         key: 'audacieuse' }
      ]
    },
    {
      q: "La beauté qui t'inspire en ce moment, c'est celle de…",
      answers: [
        { label: "Quelqu'un de lumineux et solaire",     key: 'rayonnante' },
        { label: "Quelqu'un de serein et bienveillant",  key: 'apaisee'    },
        { label: "Quelqu'un de naturel et authentique",  key: 'naturelle'  },
        { label: "Quelqu'un de sûr de lui",              key: 'confiante'  },
        { label: "Quelqu'un d'unique et décalé",         key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu pouvais te voir comme te voient ceux qui t'aiment, tu verrais…",
      answers: [
        { label: "Une personne lumineuse",           key: 'rayonnante' },
        { label: "Quelqu'un de doux et rassurant",   key: 'apaisee'    },
        { label: "Quelqu'un de vrai",                key: 'naturelle'  },
        { label: "Quelqu'un de fort",                key: 'confiante'  },
        { label: "Quelqu'un d'unique",               key: 'audacieuse' }
      ]
    },

    // ── 81-90 : Légèreté & fun ───────────────────────────────────
    {
      q: "Si ta routine était un film, ce serait…",
      answers: [
        { label: "Amélie Poulain — lumière et poésie",        key: 'rayonnante' },
        { label: "Lost in Translation — calme et mélancolie", key: 'apaisee'    },
        { label: "Into the Wild — brut et authentique",       key: 'naturelle'  },
        { label: "The Devil Wears Prada — assurance totale",  key: 'confiante'  },
        { label: "Moulin Rouge — couleurs et extravagance",   key: 'audacieuse' }
      ]
    },
    {
      q: "Ta routine de beauté, c'est un peu comme cuisiner. Tu fais…",
      answers: [
        { label: "Une salade colorée et fraîche",     key: 'rayonnante' },
        { label: "Une soupe douce et réconfortante",  key: 'apaisee'    },
        { label: "Du pain maison sans recette",       key: 'naturelle'  },
        { label: "Un plat préparé à la perfection",   key: 'confiante'  },
        { label: "Une expérience fusion inattendue",  key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu avais 5 minutes de plus ce matin, tu les utiliserais pour…",
      answers: [
        { label: "Ajouter un sérum éclat",                        key: 'rayonnante' },
        { label: "Un massage du visage relaxant",                  key: 'apaisee'    },
        { label: "Rien — je préfère dormir 5 de plus",            key: 'naturelle'  },
        { label: "Peaufiner mon maquillage",                      key: 'confiante'  },
        { label: "Essayer un produit que je n'ai jamais testé",   key: 'audacieuse' }
      ]
    },
    {
      q: "Ta routine, c'est plutôt…",
      answers: [
        { label: "5 étapes avec intention",          key: 'rayonnante' },
        { label: "3 étapes douces, sans stress",     key: 'apaisee'    },
        { label: "2 étapes max, efficace",           key: 'naturelle'  },
        { label: "6 étapes précises et méthodiques", key: 'confiante'  },
        { label: "Ça dépend de l'humeur",            key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu pouvais avoir un super pouvoir beauté, ce serait…",
      answers: [
        { label: "Un glow permanent",                key: 'rayonnante' },
        { label: "Une peau jamais irritée",          key: 'apaisee'    },
        { label: "Une peau parfaite sans rien",      key: 'naturelle'  },
        { label: "Des résultats instantanés",        key: 'confiante'  },
        { label: "Changer de look à volonté",        key: 'audacieuse' }
      ]
    },
    {
      q: "Le compliment sur ta peau qui te ferait le plus plaisir, c'est…",
      answers: [
        { label: "\"Tu as un teint incroyable\"",         key: 'rayonnante' },
        { label: "\"Ta peau a l'air douce\"",             key: 'apaisee'    },
        { label: "\"Tu n'as rien sur le visage ?\"",      key: 'naturelle'  },
        { label: "\"Tu es parfaitement présentée\"",      key: 'confiante'  },
        { label: "\"Ton look est ouf\"",                  key: 'audacieuse' }
      ]
    },
    {
      q: "Tu choisis un nouveau produit. Ce qui t'attire en premier…",
      answers: [
        { label: "La promesse d'éclat",              key: 'rayonnante' },
        { label: "La formule douce et clean",        key: 'apaisee'    },
        { label: "Peu d'ingrédients, efficaces",     key: 'naturelle'  },
        { label: "Les études cliniques",             key: 'confiante'  },
        { label: "Le packaging ou la nouveauté",     key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu mettrais dans ta trousse de beauté idéale ce matin…",
      answers: [
        { label: "Highlighter + sérum hydratant",          key: 'rayonnante' },
        { label: "Crème douce + brume apaisante",          key: 'apaisee'    },
        { label: "Baume + crème légère, c'est tout",       key: 'naturelle'  },
        { label: "Base + SPF + mascara parfait",           key: 'confiante'  },
        { label: "Rouge à lèvres fort + eye-liner décalé", key: 'audacieuse' }
      ]
    },
    {
      q: "Ta salle de bain idéale ressemble à…",
      answers: [
        { label: "Un spa lumineux et chaleureux",         key: 'rayonnante' },
        { label: "Un cocon zen avec des plantes",         key: 'apaisee'    },
        { label: "Minimaliste, propre, épurée",           key: 'naturelle'  },
        { label: "Organisée, rangée, efficace",           key: 'confiante'  },
        { label: "Colorée, pleine de trucs à tester",     key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu pouvais ajouter un ingrédient à tous tes produits, ce serait…",
      answers: [
        { label: "De la vitamine C",             key: 'rayonnante' },
        { label: "De l'aloe vera",               key: 'apaisee'    },
        { label: "Rien — les formules sont déjà bonnes", key: 'naturelle' },
        { label: "De la niacinamide",            key: 'confiante'  },
        { label: "Du rétinol",                   key: 'audacieuse' }
      ]
    },

    // ── 91-100 : Clôture & intention pure ───────────────────────
    {
      q: "La promesse que tu fais à ta peau ce matin…",
      answers: [
        { label: "Je te fais briller chaque jour",     key: 'rayonnante' },
        { label: "Je prends soin de toi en douceur",   key: 'apaisee'    },
        { label: "Je te laisse être toi-même",         key: 'naturelle'  },
        { label: "Je suis constante et régulière",     key: 'confiante'  },
        { label: "Je n'ai pas peur d'essayer",         key: 'audacieuse' }
      ]
    },
    {
      q: "Si tu écrivais une lettre d'amour à ta peau, tu commencerais par…",
      answers: [
        { label: "\"Tu es ma lumière\"",                          key: 'rayonnante' },
        { label: "\"Je t'entends quand tu souffres\"",            key: 'apaisee'    },
        { label: "\"Tu n'as pas besoin de te cacher\"",           key: 'naturelle'  },
        { label: "\"Je promets de ne jamais te négliger\"",       key: 'confiante'  },
        { label: "\"On n'a pas fini d'explorer ensemble\"",       key: 'audacieuse' }
      ]
    },
    {
      q: "Ton intention pour les prochains 30 jours de soin, c'est…",
      answers: [
        { label: "Retrouver mon éclat naturel",                    key: 'rayonnante' },
        { label: "Apaiser enfin ma peau sensible",                 key: 'apaisee'    },
        { label: "Simplifier et écouter ma peau",                  key: 'naturelle'  },
        { label: "Être régulière et mesurer les progrès",          key: 'confiante'  },
        { label: "Tester de nouvelles choses courageusement",      key: 'audacieuse' }
      ]
    },
    {
      q: "Le mot de fin à toi-même avant de commencer ta routine…",
      answers: [
        { label: "\"Brille\"",                   key: 'rayonnante' },
        { label: "\"Respire\"",                  key: 'apaisee'    },
        { label: "\"Sois toi\"",                 key: 'naturelle'  },
        { label: "\"Go\"",                       key: 'confiante'  },
        { label: "\"Ose\"",                      key: 'audacieuse' }
      ]
    },
    {
      q: "Si ta routine était une lettre à toi-même, elle commencerait par…",
      answers: [
        { label: "\"Tu mérites de briller\"",                        key: 'rayonnante' },
        { label: "\"Prends le temps\"",                              key: 'apaisee'    },
        { label: "\"Reste authentique\"",                            key: 'naturelle'  },
        { label: "\"Tu es plus forte que tu ne le penses\"",         key: 'confiante'  },
        { label: "\"Casse les règles\"",                             key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que ce soin va t'apporter aujourd'hui, c'est…",
      answers: [
        { label: "Un teint frais et vivant",     key: 'rayonnante' },
        { label: "Un moment pour moi seule",     key: 'apaisee'    },
        { label: "Juste me sentir propre et légère", key: 'fraiche' },
        { label: "La confiance de me montrer",   key: 'confiante'  },
        { label: "L'envie de m'exprimer",        key: 'audacieuse' }
      ]
    },
    {
      q: "Le geste de soin que tu fais avec le plus d'amour, c'est…",
      answers: [
        { label: "Appliquer mon sérum éclat",         key: 'rayonnante' },
        { label: "Le massage de ma crème",            key: 'apaisee'    },
        { label: "Me laver le visage à l'eau froide", key: 'fraiche'    },
        { label: "Appliquer mon SPF",                 key: 'confiante'  },
        { label: "Poser mon rouge à lèvres",          key: 'audacieuse' }
      ]
    },
    {
      q: "Ce que tu ressens quand ta routine est terminée, c'est…",
      answers: [
        { label: "Je brille — je suis prête",           key: 'rayonnante' },
        { label: "Je suis apaisée et centrée",          key: 'apaisee'    },
        { label: "Je suis moi — c'est suffisant",       key: 'naturelle'  },
        { label: "Je suis prête à affronter tout",      key: 'confiante'  },
        { label: "J'ai envie que les autres me voient", key: 'audacieuse' }
      ]
    },
    {
      q: "La dernière chose que tu veux voir en posant ta trousse ce matin, c'est…",
      answers: [
        { label: "Un visage qui brille doucement",    key: 'rayonnante' },
        { label: "Une peau calme et reposée",         key: 'apaisee'    },
        { label: "Moi, sans artifice",                key: 'naturelle'  },
        { label: "Une femme prête",                   key: 'confiante'  },
        { label: "Un look qui me ressemble à 100%",   key: 'audacieuse' }
      ]
    },
    {
      q: "Aujourd'hui, tu choisis d'être…",
      answers: [
        { label: "Rayonnante",                   key: 'rayonnante' },
        { label: "Apaisée",                      key: 'apaisee'    },
        { label: "Fraîche",                      key: 'fraiche'    },
        { label: "Naturelle",                    key: 'naturelle'  },
        { label: "Confiante",                    key: 'confiante'  },
        { label: "Audacieuse",                   key: 'audacieuse' }
      ]
    }
  ];

  // ── Mapping intention → textes de personnalisation ────────────

  const INTENTION_META = {
    rayonnante: {
      label:  'Rayonnante',
      emoji:  '✦',
      tone:   'éclat et luminosité',
      skincareIntro: 'Ta routine est orientée éclat — chaque étape amplifie la luminosité naturelle de ta peau.',
      makeupIntro:   'Ta routine mise sur le glow et la fraîcheur — des produits qui laissent ta peau parler d\'elle-même.',
      color:  '#E8A87C'
    },
    confiante: {
      label:  'Confiante',
      emoji:  '◈',
      tone:   'tenue et efficacité',
      skincareIntro: 'Ta routine est construite pour durer — des actifs ciblés et une peau qui te soutient tout au long de la journée.',
      makeupIntro:   'Ta routine mise sur la définition et la tenue — pour affronter la journée avec assurance.',
      color:  '#8B7355'
    },
    naturelle: {
      label:  'Naturelle',
      emoji:  '○',
      tone:   'légèreté et simplicité',
      skincareIntro: 'Ta routine est épurée et essentielle — les bons gestes, les bons actifs, sans surcharger ta peau.',
      makeupIntro:   'Ta routine est minimaliste — des produits légers qui révèlent ta beauté sans la couvrir.',
      color:  '#A89070'
    },
    audacieuse: {
      label:  'Audacieuse',
      emoji:  '◆',
      tone:   'caractère et intensité',
      skincareIntro: 'Ta routine prépare une base parfaite — pour que ton maquillage ou ta peau nue s\'expriment sans limite.',
      makeupIntro:   'Ta routine ose la définition et l\'intensité — pour un regard et une bouche qui s\'affirment.',
      color:  '#C47A5A'
    },
    apaisee: {
      label:  'Apaisée',
      emoji:  '◇',
      tone:   'douceur et sérénité',
      skincareIntro: 'Ta routine est axée sur le confort et la douceur — apaiser, hydrater, protéger. Pas besoin de plus.',
      makeupIntro:   'Ta routine privilégie les textures légères et les teintes douces — pour un résultat apaisant et cohérent.',
      color:  '#C9A8C8'
    },
    fraiche: {
      label:  'Fraîche',
      emoji:  '◉',
      tone:   'légèreté et fraîcheur',
      skincareIntro: 'Ta routine est légère et hydratante — pour une peau fraîche, comme si tu venais de te réveiller.',
      makeupIntro:   'Ta routine mise sur la fraîcheur — des produits hydratants et des teintes naturelles pour un effet \"no-makeup makeup\".',
      color:  '#7ABFCC'
    }
  };

  // ── Sélection de la question du jour ──────────────────────────
  // Rotation toutes les 6h (≈ 4 questions différentes par jour)
  // + variation légère par jour de la semaine pour plus d'imprévisibilité

  function getSessionQuestion() {
    const slot    = Math.floor(Date.now() / (1000 * 60 * 60 * 6));
    const dayOfW  = new Date().getDay();
    const idx     = (slot + dayOfW * 3) % QUESTIONS.length;
    return QUESTIONS[idx];
  }

  // ── Rendu de l'écran ──────────────────────────────────────────

  function initScreen() {
    const container = document.getElementById('intentionContent');
    if (!container) return;

    const question = getSessionQuestion();

    container.innerHTML = `
      <div class="intention-wrap">

        <div class="intention-header">
          <span class="section-tag">Avant ta routine</span>
          <p class="intention-eyebrow">Une question, juste pour toi.</p>
        </div>

        <h1 class="intention-question">${question.q}</h1>

        <div class="intention-answers" id="intentionAnswers">
          ${question.answers.map((a, i) => `
            <button
              class="intention-answer-btn"
              style="animation-delay:${0.1 + i * 0.07}s"
              onclick="IntentionScreen.pick('${a.key}', this)">
              <span class="intention-answer-label">${a.label}</span>
            </button>`).join('')}
        </div>

        <div class="intention-confirmation" id="intentionConfirm" style="display:none">
          <div class="intention-confirm-inner" id="intentionConfirmInner"></div>
          <button class="btn btn-dark intention-continue-btn" id="intentionContinueBtn">
            Voir ma routine →
          </button>
        </div>

        <div class="intention-skip">
          <button class="btn-ghost" onclick="IntentionScreen.skip()">
            Passer cette étape →
          </button>
        </div>

      </div>`;
  }

  // ── Sélection d'une réponse ────────────────────────────────────

  function pick(key, btn) {
    const meta = INTENTION_META[key] || INTENTION_META.naturelle;

    // Marquer la sélection visuellement
    document.querySelectorAll('.intention-answer-btn').forEach(b => {
      b.classList.remove('selected');
      b.disabled = true;
    });
    btn.classList.add('selected');

    // Stocker dans AppState
    AppState.intention = { key, ...meta };

    // Afficher le message de confirmation
    const confirm = document.getElementById('intentionConfirm');
    const inner   = document.getElementById('intentionConfirmInner');
    const contBtn = document.getElementById('intentionContinueBtn');

    inner.innerHTML = `
      <span class="intention-confirm-emoji" style="color:${meta.color}">${meta.emoji}</span>
      <p class="intention-confirm-text">
        <strong>${meta.label}.</strong>
        Ta routine est personnalisée autour de la <em>${meta.tone}</em>.
      </p>`;

    confirm.style.display = 'block';

    // Navigation au clic ou auto après 2.8s
    contBtn.onclick = () => navigateNext();
    setTimeout(() => {
      if (AppState.intention?.key === key) navigateNext();
    }, 2800);
  }

  function skip() {
    AppState.intention = null;
    navigateNext();
  }

  function navigateNext() {
    const dest = AppState.pendingRoute || 'questionnaire';
    AppState.pendingRoute = null;
    showScreen(dest);
  }

  // ── API publique ───────────────────────────────────────────────
  return { initScreen, pick, skip };

})();

// ── Accesseurs globaux pour les routines ──────────────────────────

function getIntentionMeta() {
  return AppState.intention || null;
}

function getIntentionIntro(type) {
  const m = AppState.intention;
  if (!m) return null;
  return type === 'makeup' ? m.makeupIntro : m.skincareIntro;
}
