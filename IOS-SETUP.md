# Glow Up — Publication iOS (Capacitor + build cloud)

Guide pour publier Glow Up sur l'App Store **sans Mac**, via un service de build cloud (ex. Codemagic). L'app iOS est une **coquille Capacitor** qui charge le site de production (`server.url`) — app légère, mises à jour instantanées.

## Config figée
- **Nom d'affichage :** Glow Up
- **Bundle Identifier :** `app.glowupskin` (définitif — voir `capacitor.config.json`)
- **Framework :** Capacitor 6
- **Monétisation :** DÉSACTIVÉE (lancement 100% gratuit). Aucun IAP/StoreKit, aucun Stripe exposé. Voir `js/subscription.js` → `MONETIZATION_ENABLED = false`.

## Fichiers clés (déjà dans le repo)
- `capacitor.config.json` — appId, appName, server.url, splash.
- `scripts/build-web.js` — génère `www/` (page de secours hors-ligne + icônes).
- `resources/icon.png` (1024) + `resources/splash.png` (2732) — sources icône/splash.
- `package.json` → devDependencies Capacitor + scripts.

## Étapes de build (à faire tourner par Codemagic sur un runner macOS)
```bash
npm install
npm run build:web                 # génère www/
npx cap add ios                   # génère le projet natif ios/ (1re fois)
npx cap sync ios                  # synchronise config + plugins
npx @capacitor/assets generate --iconBackgroundColor '#F5ECE0' --splashBackgroundColor '#F5ECE0'   # icônes + splash depuis resources/
# puis build + signature + upload TestFlight (géré par Codemagic via clé API App Store Connect)
```

## Autorisations iOS à ajouter dans `ios/App/App/Info.plist`
> À insérer après `cap add ios` (ou via un script de post-build Codemagic).
```xml
<key>NSCameraUsageDescription</key>
<string>Glow Up utilise l'appareil photo pour analyser votre peau et personnaliser votre routine.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Glow Up accède à vos photos pour vous permettre de sélectionner une photo pour votre analyse.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Glow Up peut enregistrer une photo prise dans l'application si vous le choisissez.</string>
```

## Sign in with Apple (OBLIGATOIRE — la connexion Google est proposée)
Le code est prêt (`Auth.signInWithApple()` + boutons). Il reste la config :
1. **Firebase Console** → Authentication → Sign-in method → activer **Apple**.
2. **Apple Developer** → créer un **Services ID** + une **clé Sign in with Apple**, renseignés dans Firebase.
3. **Xcode/entitlements (via Codemagic)** → ajouter la capability **Sign In with Apple** au target iOS.

## Comportement « vraie app » (pas juste un webview)
- Splash screen natif (configuré) + status bar + icône native.
- (Recommandé v2) brancher le plugin natif **@capacitor/camera** pour la prise de photo, et bundler les assets, si Apple invoque la règle 4.2.

---

# ✅ À FAIRE MANUELLEMENT (toi) — Apple Developer & App Store Connect

### A. Apple Developer (developer.apple.com)
1. Compte **Apple Developer** actif (99€/an) — *en cours de validation*.
2. **Certificates, Identifiers & Profiles** → créer un **App ID** avec le Bundle ID **`app.glowupskin`**, capabilities : Sign in with Apple (+ Push si un jour).
3. Générer une **clé API App Store Connect** (Users and Access → Integrations/Keys) → à donner à Codemagic pour l'upload automatique (pas de Mac requis).

### B. App Store Connect (appstoreconnect.apple.com)
4. **Mes apps → + → Nouvelle app** : plateforme iOS, nom **Glow Up**, langue FR, Bundle ID **app.glowupskin**, SKU (ex. `glowup-ios`).
5. Remplir la **fiche** (voir `app-store/listing-fr.md`) : sous-titre, description, mots-clés, catégorie (Style de vie), URL confidentialité = **https://glowupskin.app/confidentialite/**.
6. Ajouter les **captures d'écran** (iPhone 6.7"). *(je peux te les générer)*
7. **App Privacy** : déclarer email, photos, données d'usage (voir la fiche).
8. **Compte de démo** pour la review Apple : créer un compte test (email + mot de passe) et le renseigner dans « App Review Information ».
9. ⚠️ **Ne créer AUCUN produit d'achat intégré / abonnement** (lancement gratuit).
10. Soumettre le build (arrivé via Codemagic) pour **review**.

### C. Codemagic (build cloud, une seule fois)
11. Créer un compte, connecter le repo GitHub `CandiceAR/glow-up`.
12. Workflow iOS : `npm install && npm run build:web && npx cap add ios && npx cap sync ios` puis build + signature automatique (clé API App Store Connect) + upload TestFlight.

> Note review Apple (règle 4.2) : Glow Up embarque de vraies fonctions (analyse peau, scan produit, suivi) → défendable. Si Apple demande « plus qu'un site », on passe en assets embarqués + caméra native (v2).
