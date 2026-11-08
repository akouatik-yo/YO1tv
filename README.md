# YO1tv

Télé personnelle construite sur le catalogue vidéo quotidien de La Vigie : on l'allume, ça joue ; et quand on veut choisir, on peut. Page statique servie par GitHub Pages (https://akouatik-yo.github.io/YO1tv/), lecteur YouTube officiel (API IFrame).

**État (4 novembre 2026) : v1.2**. Projet géré avec la Vigie depuis le dépôt privé `akouatik-yo/Actualit-s-` (README et CLAUDE.md communs) — lots 1 à 4 et mode dodo. Catalogue et grilles publiés chaque matin par la routine de la Vigie (depuis le 5 novembre 2026) ; pépites d'archives et retours traités chaque dimanche par « YO1tv — pépites et retours ». Décisions : `CAHIER-DES-CHARGES.md` §8.

## Ce qui marche (v1)

- **Télé** : 5 canaux — YO1 Mix, YO1 Rire, YO1 Info, YO1 Savoir, YO1 Direct (expérimental). Chaque jour, une grille d'environ 24 h par canal démarre à minuit (heure de Paris) ; en allumant à 14 h on tombe sur le programme de 14 h, **au début**. Grille stable pour la journée, mémorisée dans le navigateur. « Et ensuite » avec les horaires, « Toute la grille », ⏮ ⏭ toujours possibles.
- **À la carte** : catalogue classé selon les goûts et l'humeur, catégories, formats courts (avec / sans / seulement), recherche, filtre par chaîne (toucher le nom de la chaîne), « Plus tard », historique.
- **Lecteur** : sous-titres coupés par défaut (bouton pour les remettre), enchaînement automatique, vidéos non intégrables sautées et signalées avec lien « Ouvrir sur YouTube », vue à 80 % → ne revient plus, reprise là où on s'était arrêté.
- **Goûts** : **J'aime / Bof contenu** (la vidéo et, via les retours, ses artistes : la tâche du dimanche en tire des goûts par artiste, qui pondèrent les grilles, et cherche leurs autres vidéos, hors des chaînes suivies comprises) ; **J'aime / Bof chaîne** (toute la chaîne ; sur une chaîne hors liste, propose son ajout aux sources) ; « Bof » passe à la suivante ; **Déjà vu** (écartée 7 jours, même si la grille la reprogramme) ; Plus tard (ce soir, demain, une semaine, date libre), curseur d'humeur « à plat » ↔ « curieux », minuterie de sommeil, export/import JSON.
- **Liens de la Vigie** compatibles : `#v=ID1,ID2,…&t=Titre` (playlist), `#live=UC…` (direct). Aussi : `#canal=rire`.
- **Dodo** : minuterie, ou programme pour s'endormir : 2 ou 3 « 42 » (ARTE), 2 documentaires de 44 min et plus, puis Balade Mentale et documentaires (ARTE, ARTE Évasion, C'est pas sorcier) en alternance (arrêt au bout de 3 h, alerte 5 min avant, prolonger, son qui baisse, écran noir).
- **Grilles sans fin** : quand il reste moins de 4 h de programme jouable sur un canal (fin de soirée, « Suivante » répétés, vidéos déjà vues), la grille se prolonge de 6 h.
- **Plein écran immersif** avec les commandes YO1tv (barre repliable) ; bouton **Catégorie** pour corriger un classement ; bouton **Source** : priorité de la chaîne, masquer, supprimer des sources, voir ses vidéos ; effet immédiat dans le navigateur, puis report dans la liste de la Vigie par « Envoyer mes retours » ; **✨ Pépites** et **🎭 Spectacles** (spectacles entiers, aussi classés humour) À la carte ; **Ta semaine** et **Envoyer mes retours** dans les réglages.
- Paysage sur la tablette : deux colonnes (lecteur et commandes à gauche, programmes à droite) ; bouton « Plein écran » pour l'image seule. Raccourcis clavier dans les réglages.

Choix de conception et questions tranchées : [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §8 et §8 bis.

## Fichiers

- `index.html`, `app.js`, `app.css` : l'application. `outils/yo1tv.py` : publication du jour, grilles, pépites (Python, sans dépendance). `manifest.webmanifest`, `logo.svg`, `icone.svg`, `icone-*.png` : installation en raccourci.
- `stats.js` : mesure d'audience GoatCounter (script officiel, licence ISC, hébergé ici), sans cookie, chargé par `index.html` ; tableau de bord privé de Yoann (site « yo1tv »). Les visites en localhost et des navigateurs automatisés ne sont pas comptées.
- `test.html` : page de test du lecteur (lot 0), avec journal technique — utile pour diagnostiquer.
- `data/index.json` + `data/AAAA-MM-JJ.json` : catalogues quotidiens. `data/chaines.json`, `data/directs.json`, `data/categories.json` : sources. `data/catalogue-exemple.json` : catalogue de secours.
- [`CONTEXTE.md`](CONTEXTE.md) : ce qui a été appris côté Vigie.

## Circulation des données

- **Chaque matin, à la fin de la routine de la Vigie** (lancée à 4 h 38 ; depuis le 5 novembre 2026, à la place de la tâche « YO1tv — publication du matin ») : `python3 outils/yo1tv.py jour catalogue.json DATE --sources …` → `data/chaines.json` et `data/directs.json` (recopiés de la liste de référence des sources de la Vigie, sans l'orientation politique), `data/DATE.json` (champs privés retirés), `data/index.json` (8 jours), `data/grilles/DATE.json` (grilles des 4 canaux), `data/diffusions.json` (ce qui est passé, pour ne pas répéter).
- **Chaque dimanche à 19 h 53** (tâche « YO1tv — pépites et retours », consignes dans `yo1tv-hebdo.md` du dépôt privé) : `dodo` (fonds du programme dodo), `candidats` (listes « vidéos populaires » des chaînes hors actu, rotation de 45 chaînes, les chaînes aimées — poids 2 ou 3, réglé par « J'aime chaîne » — revenant plus souvent avec plus de candidates) → choix par l'IA → `integrer` → `data/stock.json` ; puis traitement des retours de goûts ; une chaîne hors liste aimée entre dans les sources suivies (`adopter` y rattache ses pépites).
- **Depuis la tablette** : Réglages → « Envoyer mes retours » → fichier `retours/yo1tv-….json` dans le dépôt privé (page GitHub pré-remplie, à valider).

Sans grilles du jour, la page les calcule elle-même ; sans nouveau catalogue, elle reprend le dernier et l'indique par un bandeau.

## Ce qui reste

- Média Session (commandes de l'écran verrouillé) : à tester sur la tablette avant de coder.
- À vérifier sur la tablette : sous-titres bien coupés, canal Direct, bouton « Allumer », glisser pour zapper, minuterie écran éteint.

## Tester en local

`python3 -m http.server` dans le dossier, puis http://localhost:8000/ (ajouter `?heure=14:00` pour simuler une heure). Dans un navigateur automatisé, beaucoup de vidéos répondent « erreur 150 » : c'est attendu (cf. `CONTEXTE.md` §2).
