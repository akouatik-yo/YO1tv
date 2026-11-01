# YO1tv

Télé personnelle construite sur le catalogue vidéo quotidien de La Vigie : on l'allume, ça joue ; et quand on veut choisir, on peut. Page statique servie par GitHub Pages (https://akouatik-yo.github.io/YO1tv/), lecteur YouTube officiel (API IFrame).

**État (1er novembre 2026, soir) : v1.1** — lots 1 à 4. Catalogue et grilles publiés chaque matin par la routine de la Vigie ; pépites d'archives choisies chaque dimanche par la routine « YO1tv — pépites et retours » ; retours de goûts envoyés vers le dépôt privé sans jeton. Détail : `CAHIER-DES-CHARGES.md` §8 ter.

## Ce qui marche (v1)

- **Télé** : 5 canaux — YO1 Mix, YO1 Rire, YO1 Info, YO1 Savoir, YO1 Direct (expérimental). Chaque jour, une grille d'environ 24 h par canal démarre à minuit (heure de Paris) ; en allumant à 14 h on tombe sur le programme de 14 h, **au début**. Grille stable pour la journée, mémorisée dans le navigateur. « Et ensuite » avec les horaires, « Toute la grille », ⏮ ⏭ toujours possibles.
- **À la carte** : catalogue classé selon les goûts et l'humeur, catégories, formats courts (avec / sans / seulement), recherche, filtre par chaîne (toucher le nom de la chaîne), « Plus tard », historique.
- **Lecteur** : sous-titres coupés par défaut (bouton pour les remettre), enchaînement automatique, vidéos non intégrables sautées et signalées avec lien « Ouvrir sur YouTube », vue à 80 % → ne revient plus, reprise là où on s'était arrêté.
- **Goûts** : J'aime / Bof (pèse sur la chaîne et la catégorie ; « Bof » passe à la suivante ; proposition de masquer une chaîne après plusieurs « Bof »), Plus tard (ce soir, demain, une semaine, date libre), curseur d'humeur « à plat » ↔ « curieux », minuterie de sommeil, export/import JSON.
- **Liens de la Vigie** compatibles : `#v=ID1,ID2,…&t=Titre` (playlist), `#live=UC…` (direct). Aussi : `#canal=rire`.
- **Plein écran immersif** avec les commandes YO1tv (barre repliable) ; bouton **Catégorie** pour corriger un classement ; **✨ Pépites** À la carte ; **Ta semaine** et **Envoyer mes retours** dans les réglages.
- Paysage sur la tablette : deux colonnes (lecteur et commandes à gauche, programmes à droite) ; bouton « Plein écran » pour l'image seule. Raccourcis clavier dans les réglages.

Choix de conception et questions tranchées : [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §8 et §8 bis.

## Fichiers

- `index.html`, `app.js`, `app.css` : l'application. `outils/yo1tv.py` : publication du jour, grilles, pépites (Python, sans dépendance). `manifest.webmanifest`, `logo.svg`, `icone.svg`, `icone-*.png` : installation en raccourci.
- `test.html` : page de test du lecteur (lot 0), avec journal technique — utile pour diagnostiquer.
- `data/index.json` + `data/AAAA-MM-JJ.json` : catalogues quotidiens. `data/chaines.json`, `data/directs.json`, `data/categories.json` : sources. `data/catalogue-exemple.json` : catalogue de secours.
- [`CONTEXTE.md`](CONTEXTE.md) : ce qui a été appris côté Vigie. `reference/` : premier lecteur externe de la Vigie.

## Circulation des données

- **Chaque matin** (routine de la Vigie, étape 7 bis, sans IA) : `python3 outils/yo1tv.py jour out/videos_jour.json DATE` → `data/DATE.json` (champs privés retirés), `data/index.json` (8 jours), `data/grilles/DATE.json` (grilles des 4 canaux), `data/diffusions.json` (ce qui est passé, pour ne pas répéter).
- **Chaque dimanche soir** (routine « YO1tv — pépites et retours », prompt dans le dépôt privé) : `candidats` (listes « vidéos populaires » des chaînes hors actu, rotation de 45 chaînes) → choix par l'IA → `integrer` → `data/stock.json` ; puis traitement des retours de goûts.
- **Depuis la tablette** : Réglages → « Envoyer mes retours » → fichier `retours/yo1tv-….json` dans le dépôt privé (page GitHub pré-remplie, à valider).

Sans grilles du jour, la page les calcule elle-même ; sans nouveau catalogue, elle reprend le dernier et l'indique par un bandeau.

## Ce qui reste

- Vérifier après la première nuit que la routine de la Vigie a bien pu attacher ce dépôt et pousser (sinon : grilles calculées dans la page, catalogue figé).
- Média Session (commandes de l'écran verrouillé) : à tester sur la tablette avant de coder.
- À vérifier sur la tablette : sous-titres bien coupés, canal Direct, bouton « Allumer », glisser pour zapper, minuterie écran éteint.

## Tester en local

`python3 -m http.server` dans le dossier, puis http://localhost:8000/ (ajouter `?heure=14:00` pour simuler une heure). Dans un navigateur automatisé, beaucoup de vidéos répondent « erreur 150 » : c'est attendu (cf. `CONTEXTE.md` §2).
