# Fiche App Store — Glow Up (FR)

> Brouillon à valider par Candice. Ces textes se collent dans App Store Connect.

## Identité
- **Nom de l'app** (max 30) : `Glow Up : routine skincare IA`
- **Sous-titre** (max 30) : `Ton agent IA skincare`
- **Bundle ID (appId)** : `app.glowupskin`
- **Catégorie principale** : Style de vie (Lifestyle)
- **Catégorie secondaire** : Forme et santé
- **Classification d'âge** : à déterminer avec le questionnaire d'Apple. Probablement **12+** : l'appli donne des conseils sur la peau (« informations médicales ou de traitement : peu fréquentes ») et propose un coach IA. Répondre honnêtement ; 4+ risque d'être refusé.

## Texte promotionnel (max 170)
Analyse ta peau en photo, obtiens une routine faite pour toi et compare les prix pour payer le juste prix — sans jamais pousser une marque plutôt qu'une autre.

## Description (max 4000)
**Glow Up, c'est ton assistant beauté personnel — guidé par les besoins réels de ta peau, jamais par une marque.**

Fini les routines copiées sur les autres : Glow Up analyse TA peau et te construit une routine sur-mesure, étape par étape, à ton budget.

**✨ Ce que tu peux faire avec Glow Up :**

• **Analyse de peau par photo** — En quelques secondes, découvre ton type de peau, tes besoins (hydratation, éclat, rougeurs, texture) et ton niveau de sensibilité.

• **Ta routine personnalisée** — Une routine matin/soir pensée pour ta peau, avec les bonnes étapes et les bons actifs, jamais plus que nécessaire.

• **Comparateur de prix** — Pour chaque produit recommandé, compare les offres du marché et paie le juste prix.

• **Trouver un dupe** — Prends un produit en photo : Glow Up compare les compositions et te propose une alternative qui partage le même actif principal et coûte moins cher au millilitre, quand c'est vérifié.

• **Analyse de ta routine actuelle** — Tes produits actuels sont-ils faits pour ta peau ? Obtiens un score et des conseils clairs.

• **Suivi dans le temps (Skin Journey)** — Reprends une photo tous les 4 jours et vois l'évolution réelle de ta peau.

• **Coach beauté IA** — Pose tes questions skincare et reçois des réponses personnalisées.

**🤍 Notre promesse :** des recommandations guidées par tes besoins et tes envies — jamais par une marque. La beauté, en toute transparence.

Glow Up fournit des indicateurs cosmétiques à titre informatif. L'application n'est pas un dispositif médical, ne pose aucun diagnostic et ne remplace pas l'avis d'un médecin ou d'un dermatologue.

Analyse, comprends, rayonne. ✦

## Mots-clés (max 100 caractères, séparés par des virgules)
skincare,routine,peau,analyse,soin,visage,dupe,beauté,sérum,crème,acné,hydratation,anti-âge,IA,teint

## URLs
- **URL marketing** : https://www.glowupskin.app
- **URL d'assistance** : https://www.glowupskin.app/contact/  ✅ (page en ligne)
- **Politique de confidentialité** : https://www.glowupskin.app/confidentialite/  ✅ (page en ligne)

## Confidentialité (App Privacy — à saisir dans App Store Connect → « Confidentialité de l'app »)
Mis à jour le 22 oct. 2026 d'après le code. Pour chaque ligne : « collectée », « liée à l'identité de l'utilisatrice », « utilisée pour le suivi (tracking) ». Réponse au suivi pour TOUT : **non** (aucune publicité, aucun courtier de données).

| Catégorie Apple | Type | Collectée ? | Liée à l'utilisatrice ? | Finalité | D'où ça vient |
|---|---|---|---|---|---|
| Coordonnées | Adresse e-mail | Oui | Oui | Fonctionnement de l'app | Compte (Firebase Auth) |
| Coordonnées | Nom | Oui | Oui | Fonctionnement de l'app | Connexion Google/Apple (prénom affiché) |
| Contenu utilisateur | Photos ou vidéos | Oui | Oui | Fonctionnement de l'app | Photo envoyée à l'IA pour l'analyse (avec accord) ; miniatures du suivi sur le compte |
| Contenu utilisateur | Autre contenu utilisateur | Oui | Oui | Fonctionnement de l'app | Réponses au questionnaire, routine, produits scannés/ajoutés |
| Santé et forme physique | Santé | Oui (prudence) | Oui | Fonctionnement de l'app | Le questionnaire propose « grossesse » et des sensibilités de peau. Mieux vaut déclarer : déclarer en trop est sans risque, l'inverse non |
| Identifiants | ID utilisateur | Oui | Oui | Fonctionnement de l'app | Identifiant du compte, rattaché aux scans |
| Données d'utilisation | Interaction avec le produit | Oui | Non | Analyses | Google Analytics, uniquement après acceptation des cookies |

**Ne PAS cocher** : Achats (aucun abonnement n'est vendu), Localisation, Contacts, Historique de navigation, Données financières, Diagnostics.
**À re-vérifier avant chaque ajout** : si on ajoute des notifications, des achats intégrés ou le scan en vidéo, ce tableau change.
**Photos du visage — précision à donner à Apple** : la photo est envoyée à un prestataire d'IA (Anthropic) pour produire l'analyse, après accord explicite de l'utilisatrice ; elle n'est pas stockée par nos serveurs.

## Captures d'écran requises
- iPhone 6.7" (1290 x 2796) — 3 à 10 visuels. **Pas d'iPad** : l'app est iPhone uniquement (réglé dans le build).
- Faites : 01 accueil, 02 analyse photo, 03 diagnostic, 05 dupes (dans `captures-app-store/finales`).
- Manquent (à faire sur ton iPhone) : routine, scan produit 🟢, scan « Veux-tu le remplacer ? ». Minimum Apple = 3, donc déjà suffisant ; 7 au total serait mieux.

## Notes pour l'équipe de validation Apple (App Review Information → Notes) — à coller en anglais
> Glow Up is a skincare companion app (cosmetic advice only, not a medical device; a disclaimer is shown under every analysis result).
> Native features: the native camera (Capacitor Camera plugin) for the skin photo and the product scan; an AI-consent screen before any photo is sent for analysis; in-app account deletion (More → My account → "Supprimer mon compte et mes données").
> The app is free. There are no in-app purchases or subscriptions.
> Face photos are sent to a third-party AI provider (Anthropic) for analysis only after the user's explicit consent, and are not stored by our servers.
> Demo account: e-mail ______ / password ______ (à remplir par Candice dans App Store Connect — ne jamais l'écrire dans ce fichier).
> Support: https://www.glowupskin.app/contact/

## À NE PAS oublier pour la validation Apple
- L'app doit se sentir « app » (pas juste un site) → caméra native + fonctions réelles : c'est le point de risque n°1 (règle 4.2). Plan B si refus : ajouter des notifications de rappel de routine.
- Compte de test (identifiants) à fournir à Apple pour la review (email + mot de passe d'un compte démo).
- Politique de confidentialité en ligne (URL obligatoire) : mise à jour le 22 oct. 2026.
- « Se connecter avec Apple » : tant que c'est proposé, l'appli doit le gérer parfaitement. À tester sur TestFlight avant d'écrire sa mention dans les notes.
- Suppression de compte : à tester avec un compte jetable avant l'envoi ; la révocation Apple (clé « Sign in with Apple ») reste à ajouter.
