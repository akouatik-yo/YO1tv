# YO1tv

Télé personnelle construite sur le catalogue vidéo quotidien de La Vigie : on l'allume, ça joue ; et quand on veut choisir, on peut. Page statique servie par GitHub Pages (https://akouatik-yo.github.io/YO1tv/), lecteur YouTube officiel (API IFrame).

**État (1er novembre 2026) : v1 en ligne** — lots 1, 2 et 3 (goûts stockés dans le navigateur). Lot 4 (synchronisation vers la Vigie) et publication quotidienne automatique du catalogue : pas encore.

## Ce qui marche (v1)

- **Télé** : 5 canaux — YO1 Mix, YO1 Rire, YO1 Info, YO1 Savoir, YO1 Direct (expérimental). Chaque jour, une grille d'environ 24 h par canal démarre à minuit (heure de Paris) ; en allumant à 14 h on tombe sur le programme de 14 h, **au début**. Grille stable pour la journée, mémorisée dans le navigateur. « Et ensuite » avec les horaires, « Toute la grille », ⏮ ⏭ toujours possibles.
- **À la carte** : catalogue classé selon les goûts et l'humeur, catégories, formats courts (avec / sans / seulement), recherche, filtre par chaîne (toucher le nom de la chaîne), « Plus tard », historique.
- **Lecteur** : sous-titres coupés par défaut (bouton pour les remettre), enchaînement automatique, vidéos non intégrables sautées et signalées avec lien « Ouvrir sur YouTube », vue à 80 % → ne revient plus, reprise là où on s'était arrêté.
- **Goûts** : J'aime / Bof (pèse sur la chaîne et la catégorie ; « Bof » passe à la suivante ; proposition de masquer une chaîne après plusieurs « Bof »), Plus tard (ce soir, demain, une semaine, date libre), curseur d'humeur « à plat » ↔ « curieux », minuterie de sommeil, export/import JSON.
- **Liens de la Vigie** compatibles : `#v=ID1,ID2,…&t=Titre` (playlist), `#live=UC…` (direct). Aussi : `#canal=rire`.
- Paysage sur la tablette : le lecteur occupe tout l'écran. Raccourcis clavier dans les réglages.

Choix de conception et questions tranchées : [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) §8 et §8 bis.

## Fichiers

- `index.html`, `app.js`, `app.css` : l'application. `manifest.webmanifest`, `logo.svg`, `icone.svg`, `icone-*.png` : installation en raccourci.
- `test.html` : page de test du lecteur (lot 0), avec journal technique — utile pour diagnostiquer.
- `data/index.json` + `data/AAAA-MM-JJ.json` : catalogues quotidiens. `data/chaines.json`, `data/directs.json`, `data/categories.json` : sources. `data/catalogue-exemple.json` : catalogue de secours.
- [`CONTEXTE.md`](CONTEXTE.md) : ce qui a été appris côté Vigie. `reference/` : premier lecteur externe de la Vigie.

## Publier le catalogue du jour (à brancher sur la routine de la Vigie)

1. Copier `out/videos_jour.json` (sans les champs privés, comme `data/catalogue-exemple.json`) vers `data/AAAA-MM-JJ.json` (date de Paris).
2. Mettre à jour `data/index.json` : `{"jours":["AAAA-MM-JJ", …]}` (les plus récents ; la page en lit 7 au plus et ignore les dates futures).
3. Supprimer les fichiers de plus de 8 jours, pousser sur `main`.

Sans nouveau catalogue, YO1tv fonctionne avec le dernier disponible et l'indique par un bandeau.

## Ce qui reste

- Brancher la publication quotidienne (ci-dessus) — c'est le seul manque visible au quotidien : aujourd'hui le catalogue s'arrête au 1er novembre.
- Lot 4 : retours de goûts vers `collecteur.py`.
- Stock d'archives des chaînes hors actualité (YO1 Savoir manque de contenu → beaucoup de rediffusions).
- À vérifier sur la tablette : sous-titres bien coupés, canal Direct, bouton « Allumer », glisser pour zapper, minuterie écran éteint.

## Tester en local

`python3 -m http.server` dans le dossier, puis http://localhost:8000/ (ajouter `?heure=14:00` pour simuler une heure). Dans un navigateur automatisé, beaucoup de vidéos répondent « erreur 150 » : c'est attendu (cf. `CONTEXTE.md` §2).
