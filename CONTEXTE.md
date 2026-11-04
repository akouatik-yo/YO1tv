# YO1tv — contexte technique hérité de La Vigie

*Tout ce qui a été construit, testé ou décidé pour la partie vidéo de La Vigie (versions 4 à 7.2, octobre-novembre 2026) et qui sert à YO1tv. Niveau de confiance indiqué quand il n'est pas « testé ».*

> **Confidentialité.** Ce dépôt est public. L'adresse de l'artefact de la Vigie, l'identifiant de la routine et tout ce qui concerne les goûts de Yoann restent dans le dépôt privé `akouatik-yo/Actualit-s-` (README et A-FAIRE.md). Ne pas les recopier ici.

## 1. La Vigie en deux mots

- Quotidien numérique personnel (artefact claude.ai) : édition rédigée chaque matin, « mur » de liens, onglet Présidentielle, et une partie **Vidéos**.
- **Routine planifiée chaque jour à 4 h 38 (Paris)** : `collecteur.py` (sans IA) collecte flux, chaînes YouTube, météo… puis une IA rédige et publie dans la base de données de l'artefact.
- Dépôt privé `akouatik-yo/Actualit-s-` : `collecteur.py`, `la-vigie.html`, `routine-prompt.md`, `redaction.md`, `etat/sources.json` (liste de référence des sources), `README.md`, `A-FAIRE.md`.
- La page de la Vigie ne peut **ni intégrer d'iframe, ni charger d'images externes** (règles de sécurité de claude.ai, identiques dans l'application et dans le navigateur — déduit, et confirmé pour les iframes) : les vignettes y sont stockées en data URI dans la base (`vignettes/DATE-N`).

## 2. Tests du lecteur intégré (1er novembre 2026)

| Où | Résultat | Confiance |
|---|---|---|
| Onglet test dans l'artefact, Brave Android | « Ce contenu est bloqué » : iframe interdite par la page d'artefact ; aucune réponse du lecteur. | testé |
| Page ouverte depuis le disque (`file://`) | YouTube « Video player configuration error — Error 153 » (pas de référent). | testé |
| `http://localhost` (Chromium automatisé) | API IFrame chargée, lecteur prêt et piloté ; certaines vidéos en erreur 150, probablement à cause du navigateur automatisé/serveur. | testé / hypothèse pour les 150 |
| **GitHub Pages, Brave, tablette Android 10 en portrait** | **Tout fonctionne** : API chargée, lecteur piloté, enchaînement automatique (court terminé → suivante), boutons, « vue à 80 % », **sans publicité, lecture écran éteint, incrustation**. Son activé au démarrage, mais **sous-titres activés aussi** (à couper par défaut). | testé par Yoann |

Ce qu'on sait du lecteur officiel (API IFrame, https://developers.google.com/youtube/iframe_api_reference) :
- `loadVideoById({videoId, startSeconds})`, `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, `getDuration`, `getPlayerState`, volume, vitesse ; événements `onReady`, `onStateChange` (0 = terminée → enchaîner), `onError` (2, 5, 100, 101/150 = intégration interdite, 153 = référent manquant).
- Paramètres utiles : `playsinline=1`, `rel=0`, `origin=<location.origin>`, `<meta name="referrer" content="strict-origin-when-cross-origin">`.
- Journal du test sur tablette (extrait) : `Origine : https://akouatik-yo.github.io · Android 10` → `API IFrame chargée` → `Lecteur prêt` → `lecture` → `page masquée (écran éteint) · état lecteur : lecture` → `vue à 80 %` → `terminée` → `▶ 3/14` (enchaînement)… Démarrage d'une vidéo : 1 à 12 s entre « chargement » et « lecture ».
- Impossible par le code : supprimer la pub, lecture écran éteint, son automatique sans geste initial, lire les vidéos interdites d'intégration ou soumises à l'âge (≈ 5-10 % des vidéos : estimation). Brave le fait côté navigateur, **y compris pour le lecteur intégré sur Pages** (testé).
- Variante sans script externe (testée dans l'artefact, utile si un jour le script est bloqué) : iframe `…/embed/ID?enablejsapi=1` pilotée par `postMessage` (`{"event":"listening"}` puis `{"event":"command","func":"loadVideoById","args":[…]}`), réponses `infoDelivery` / `onStateChange` / `onError`. Code dans l'historique du dépôt privé (commit « onglet de test du lecteur YouTube intégré »).

## 3. Format du catalogue vidéo

Document `videos/AAAA-MM-JJ` dans la base de la Vigie, produit par `collecteur.py` (`catalogue_videos`, `completer_programme`). Exemple réel : [`data/catalogue-exemple.json`](data/catalogue-exemple.json) (298 vidéos du 1er novembre 2026 ; champs privés retirés).

| Champ | Sens |
|---|---|
| `i` | identifiant YouTube (11 caractères) |
| `t` | titre ; `tf` = titre traduit en français (chaînes étrangères) |
| `c` | nom de la chaîne ; `sid` = identifiant de la source (`yt-…`, cf. `data/chaines.json`) |
| `d` | date de publication ISO (UTC) |
| `o` | catégorie : `actu`, `analyse` (Débats et émissions), `decouverte`, `culture`, `divertissement`, `humour` |
| `p` | poids de la chaîne (1 à 3) |
| `du` | durée « h:mm:ss » ou « m:ss » (absente pour les formats courts) |
| `co` | 1 = format court (Short, < 1 min) |
| `sel` | 1 = choisie par la rédaction (IA) ce matin |
| `s` | score (`p×10 − âge en heures/3`) ; `b` = orientation de la chaîne (retiré ici) |

Règles du collecteur (constantes en tête de `collecteur.py`) :
- Fenêtre : **30 h** pour actu et débats, **7 jours** pour les autres catégories ; vidéos de moins de 75 s écartées sauf formats courts ; sport écarté.
- Au plus 6 vidéos par chaîne et par point de poids ; **4 formats courts par chaîne** (chaînes marquées `courts`, essentiellement l'humour) ; catalogue de **480 vidéos** au plus ; **90 par catégorie, 160 pour l'humour** ; au plus 4 par chaîne en tête de chaque catégorie.
- Flux YouTube lus par liste de lecture : `UULF<id>` = vidéos longues sans Shorts, `UULV` = directs, `UUSH` = Shorts (`https://www.youtube.com/feeds/videos.xml?playlist_id=…`) ; durées lues sur la page `/videos` de la chaîne.
- **Chaînes mixtes** (France Inter, RTL, Quotidien, Europe 1, Canal+…) : `mixte: true` ; seule une vidéo dont le titre contient le `motif` (noms de chroniqueurs/chroniques) va en humour, le reste va dans `sinon` ou est classé par mots-clés (culture, débat si entretien ou ≥ 25 min, actu).
- La page de la Vigie : 7 derniers jours chargés, chaque vidéo comptée au premier jour où elle apparaît ; playlists par jour et pour la semaine via `https://www.youtube.com/watch_videos?video_ids=ID1,ID2,…` (50 au plus, fonction non documentée).

## 4. Sources

- [`data/chaines.json`](data/chaines.json) : les **228 chaînes YouTube** suivies (104 en humour dont 102 avec formats courts), avec catégorie, poids, motifs des chaînes mixtes. Orientation politique retirée.
- [`data/directs.json`](data/directs.json) : les 13 directs TV/radio (franceinfo, France 24, Euronews…) ; `yt_chaine` → `https://www.youtube.com/embed/live_stream?channel=UC…` (utilisable par un canal « Direct » de YO1tv).
- Choix éditoriaux de Yoann : autant d'humour que d'information ; **exclus** : sport, défis, pranks, caméras cachées ; chaînes inactives gardées (« elles serviront plus tard ») ; certains créateurs ont volontairement deux chaînes.
- Chroniques radio/télé suivies par motifs (France Inter, RTL, Quotidien, C à vous, Quelle époque !, Europe 1, Canal+) : liste complète dans `data/chaines.json` (champ `motif`).

## 5. Où en est YO1tv

Voir `README.md` (fonctions, fichiers, circulation des données) et `CAHIER-DES-CHARGES.md` §8 (décisions). Leçons techniques à retenir :
- Une tâche planifiée (ex-routine) n'a accès qu'aux dépôts choisis dans ses réglages (claude.ai/code/routines dans un navigateur → Modifier → Paramètres avancés → Dépôt) ; l'outil `add_repo` n'y existe pas.
- Les listes YouTube publiques se lisent sans clé : `UULF…` (vidéos longues récentes), `UULP…` (vidéos longues populaires), `UUSH…` (Shorts) ; la page `https://www.youtube.com/playlist?list=…` donne une centaine de vidéos avec titre, durée, vues et âge (`lockupViewModel`). Les flux RSS n'en donnent que 15, sans durée.
- La base de la Vigie publie le catalogue du jour dans `videos/AAAA-MM-JJ` (même format que `out/videos_jour.json`, avec les champs privés `b` et `s` que `yo1tv.py` retire).

**Incrustation (PiP) automatique sur Android (4 novembre 2026)** : Brave ne bascule une vidéo en incrustation, quand on quitte l'appli, que si un élément qui la contient est en plein écran **et** que la vidéo remplit l'écran. La v1.1 mettait toute la page en plein écran (`document.documentElement`) : le son continuait, l'image disparaissait. Le plein écran immersif porte désormais sur `#ecran` (lecteur + barre), comme la v1 sur `#video` ; les calques (`#toast`, `#nuit`, `#alerteDodo`) y sont déplacés le temps du plein écran. Ne pas revenir au plein écran de la page entière.
