# ✅ VRAIE CONNEXION EPIC GAMES — MODE RÉEL (OAuth2 officiel)

Tu voulais du 100% réel : c'est maintenant codé. Le site utilise les VRAIES URLs Epic :
- Login : `https://www.epicgames.com/id/authorize?client_id=...&response_type=code&scope=basic_profile`
- Token : `POST https://api.epicgames.dev/epic/oauth/v2/token`
- Profil : `GET https://api.epicgames.dev/epic/oauth/v2/userInfo`

Fichiers réels :
- `server.py` = backend qui fait l'échange code → token (secret JAMAIS dans le front)
- `callback.html` = retour après login Epic
- `app.js` → `checkReel()` appelle `/api/me` + `/api/config`
- `epic_config.EXEMPLE.json` → modèle à remplir

## ÉTAPE 1 : créer ton app Epic (5 min, obligatoire, gratuit)

Sans ça, Epic refuse la connexion. C'est Epic qui l'exige, pas moi.

1. Va sur https://dev.epicgames.com/portal → Connecte-toi avec ton compte Epic
2. Crée un **Product** (nom: Lootcheck)
3. Va dans **Product Settings > Clients** → **New Client**
   - Type : `Server Client` (confidential) pour le mode réel sécurisé
   - Coche `Authorization Code`
   - Redirect URL : `http://localhost:8000/auth/callback`
     (en prod tu ajouteras `https://ton-domaine/auth/callback`)
   - Scopes : `basic_profile`
4. Copie ton **Client ID** + **Client Secret**

## ÉTAPE 2 : configurer en local

```
cd fortnite-checker
copy epic_config.EXEMPLE.json epic_config.json
```
Remplis `epic_config.json` :
```json
{
  "EPIC_CLIENT_ID": "xyza7891...",
  "EPIC_CLIENT_SECRET": "ton_secret...",
  "REDIRECT_URI": "http://localhost:8000/auth/callback",
  "SCOPE": "basic_profile"
}
```

## ÉTAPE 3 : lancer le RÉEL

```
cd /d "C:\Users\jaoua\Desktop\checkercasier"
python server.py
# ouvre http://localhost:8000
```
- Le bandeau doit passer en 🟢 **MODE RÉEL**
- Clique "Se connecter avec Epic Games" → LA VRAIE page `epicgames.com/id/authorize`
- Retour auto sur `/callback.html?ok=1` → dashboard avec ton **vrai displayName + vrai accountId**

## POUR QUE TOUT LE MONDE PUISSE SE CO (multi-utilisateurs, prod)

En local, seul ton PC peut logger. Pour ouvrir à tout le monde :
1. Héberge `server.py` sur Render/Railway/VPS (ex: `https://lootcheck.onrender.com`)
   - Variables d'env : `EPIC_CLIENT_ID`, `EPIC_CLIENT_SECRET`, `REDIRECT_URI=https://lootcheck.onrender.com/auth/callback`, `PORT=10000`
2. Dans dev.epicgames.com > ton Client > ajoute la Redirect URL prod EXACTE
3. Chaque visiteur loggue → session séparée (cookie HttpOnly, 2h). Testé multi-sessions.
4. Mets ton domaine en HTTPS (Epic refuse le HTTP en prod sauf localhost).

## VIDEO YOUTUBE (fix 2026-09-26)

L'ancien ID `JYIAwpbpe4g` est supprimé (oEmbed 404). Remplacé par le trailer officiel toujours valide :
`https://www.youtube-nocookie.com/embed/2gUtfBmw86Y` (Fortnite Battle Royale - Gameplay Trailer).
Si embed bloqué (adblock/privacy) : lien direct sous la vidéo.

## BOUTIQUE REELLE (fix 2026-09-26)

`GET https://fortnite-api.com/v2/shop` = 418 entrées dont 272 avec `brItems`.
Le code filtre maintenant `entries.filter(e => e.brItems?.length)` avant d'afficher 12 cartes (sinon grille vide).
Prix affichés = `finalPrice` V-Bucks réels + conversion € (1000 VB = 8,99€).

## Ce que le RÉEL donne (vérité technique)

✅ Réel : pseudo Epic, accountId, token d'accès (2h), preuve que c'est bien ton compte
❌ Impossible via API Epic (même officiel) : historique d'achats €, liste auto du casier, V-Bucks dépensés
→ C'est pour ça que le dashboard garde :
- Dépenses : saisie depuis https://www.epicgames.com/account/transactions (tes reçus réels)
- Casier : recherche via fortnite-api.com (vraie base prix boutique) → estimation € / V-Bucks

## Sécurité
- Ne demande JAMAIS le mot de passe Epic dans ton site. Toujours rediriger vers epicgames.com.
- `epic_config.json` reste en local, ne le push jamais sur GitHub.
- Tokens en mémoire serveur (7200s), cookie HttpOnly.

## Erreurs fréquentes
- `MODE DÉMO` → epic_config.json vide ou avec TON_CLIENT_ID_ICI
- `redirect_uri_mismatch` → l'URL dans le portail Epic doit être EXACTEMENT `http://localhost:8000/auth/callback`
- `token_failed` → mauvais secret, ou code réutilisé (1 seul usage, 5 min)
- `invalid_client` → type de client pas en Authorization Code
