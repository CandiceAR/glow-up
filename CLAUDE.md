# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Glow Up** is a French-language beauty PWA — a single-page application for personalized skincare and makeup routines, with virtual try-on (MediaPipe), an AI beauty coach (Claude Haiku), and Amazon affiliate product recommendations. Deployed on Netlify (primary) with some serverless functions also on Vercel.

## No Build Step

This is a **vanilla JS static site** — no bundler, no transpilation, no `npm run build`. Files are served directly. To work locally, serve the project root over HTTP (e.g. `npx serve .` or any static server). Opening `index.html` as a `file://` URL will fail due to CORS on `fetch()` calls.

## Deployment

- **Netlify** (primary): static site at `glowupskin.app`, Netlify Functions in `netlify/functions/` handle Stripe webhooks and checkout session creation
- **Vercel**: `api/` directory handles the Anthropic proxy (`coach.js`), image upload, makeup render, and product save
- Config files: `netlify.toml` (Netlify), `vercel.json` (Vercel, with 60s timeout on `makeupRender`)

Required environment variables (set in Netlify/Vercel dashboards):
- `STRIPE_SECRET_KEY` — `sk_test_...` for test mode, `sk_live_...` for production
- `ANTHROPIC_API_KEY` — for the Glow Coach AI feature

## Architecture

### Frontend SPA

The entire UI lives in `index.html`. Navigation is screen-based: each feature is a `<div class="screen" id="screen-{name}">`. The router is `showScreen(name)` in `js/app.js`, which activates the target screen and calls the appropriate module's `initScreen()`.

Global state lives in `AppState` (defined in `app.js`) with namespaces:
- `AppState.face` — uploaded photo, MediaPipe landmarks
- `AppState.questionnaire` — answers, progress
- `AppState.routine` — rule applied, morning/evening steps
- `AppState.products` — full catalog, recommended list, try-on selections
- `AppState.user` — uid, email, plan (`free` | `glow` | `glowplus`)
- `AppState.premium` — legacy lock flag (now superseded by `AppState.user.plan`)

### Script Loading Order (index.html)

Scripts are loaded in dependency order — **order matters**:
1. `lookGenerator.js`, `makeupAI.js`, `skinAnalysis.js` — photo/face utilities
2. `rulesEngine.js` — loads `data/rules.json`, matches questionnaire answers to a skincare rule
3. `catalogue.js` — static product array (JS const `CATALOGUE`)
4. `productCatalog.js` — merges `CATALOGUE` + `data/products-manual.json` + Firestore into `AppState.products.catalog`
5. `questionnaire.js`, `routineRenderer.js`, `tryOn.js` — core flow screens
6. `auth.js`, `firestoreProfile.js`, `firestoreProducts.js` — Firebase layer
7. `subscription.js`, `routineSaver.js` — plan gating + local/Firestore persistence
8. `app.js` — router, `AppState`, `initApp()` entry point (last)

When adding a new JS module, insert its `<script>` tag before `app.js` and after any modules it depends on. Bump the `?v=N` query param on all script and CSS tags when deploying changes (currently `v=50`).

### Product Catalog Data Flow

Products come from three sources, merged in priority order (highest first):
1. `data/products-manual.json` — primary source of truth for curated products
2. Firestore `products` collection — admin-uploaded products
3. `js/catalogue.js` (`CATALOGUE` const) — legacy static fallback

All Amazon URLs must go through `ProductCatalog.ensureTag()` which injects the affiliate tag `kan10ar-21`. Never hardcode Amazon URLs without the tag.

### Subscription / Feature Gating

Plans: `free` → `glow` → `glowplus`. Check access with `Subscription.canAccess(feature)`:
- `routine_second` — second routine (makeup if skincare chosen first, or vice versa) — requires `glow`
- `skinpedia_ai` — AI answers in Skinpedia — requires `glow`
- `recommendations_adv` — advanced recommendations — requires `glow`
- `coach` — Glow Coach AI chat — requires `glowplus`

The user plan is stored in Firestore under `users/{uid}/subscription.plan` and loaded into `AppState.user.plan` on auth.

### Rules Engine

`js/rulesEngine.js` loads `data/rules.json` and applies a deterministic rule to questionnaire answers (no AI). Rules are matched by `skinType`, `oiliness`, `sensitivity`, `complexes`, etc. If a face photo was analyzed, `_enrichFromPhoto()` supplements missing questionnaire answers with MediaPipe-derived values before rule matching.

### Firebase

Auth supports Google Sign-In and email/password. Firebase config is hardcoded in `js/auth.js`. Firestore collections:
- `users/{uid}` — profile, questionnaire answers, saved routine, subscription plan
- `products/` — admin-managed product overrides

### AI Features

- **Glow Coach** (`js/glowCoach.js`): calls `/api/coach` (Vercel proxy) → Anthropic `claude-haiku-4-5-20251001`. Context files in `data/`: `coachSystemPrompt.txt`, `coachKnowledge.json`, `coachExamples.json`.
- **Makeup AI** (`js/makeupAI.js`): calls `/api/makeupRender` for AI-generated makeup looks.
- **Skin Analysis** (`js/skinAnalysis.js`): local MediaPipe face mesh (no server call) — returns skin zones with pore/redness scores.

### Admin Panel

`admin.html` + `js/adminPanel.js` — password-protected product management UI. Products saved via `/api/saveProducts` to Firestore.
