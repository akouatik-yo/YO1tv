# YO1tv

Télé personnelle : on l'allume, ça joue ; et quand on veut choisir, on peut. Page statique servie par GitHub Pages (https://akouatik-yo.github.io/YO1tv/), lecteur YouTube officiel (API IFrame).

**État (19 novembre 2026) : v2**. YO1tv est **indépendante de La Vigie** : elle ne lit plus son catalogue du jour. Une seule tâche planifiée, chaque dimanche soir, « YO1tv — programmation de la semaine » (consignes `yo1tv-semaine.md` du dépôt privé `akouatik-yo/Actualit-s-`), fabrique les playlists de la semaine. Décisions : `CAHIER-DES-CHARGES.md` §8.

## Ce qui marche

- **Télé** : 7 canaux, un par catégorie : YO1 **Rire** (uniquement de l'humour), **Culture** (toutes les interviews d'artistes, concerts, critique), **Savoir** (vidéastes de vulgarisation : sciences, histoire, économie, philosophie… ; 42 et C'est pas sorcier), **Découverte** (grands documentaires), **Divertissement** (vidéos étonnantes, magazines, courts-métrages, émissions-concepts), **Info** (analyses et entretiens de la semaine, 15 min et plus), **Direct** (expérimental). Chaque canal joue une **playlist de la semaine** (40 h au moins ; Info : ce qu'il y a eu dans la semaine) et **reprend, sur chaque appareil, à la vidéo qui suit la dernière vue** (ou au milieu de celle qu'on avait commencée). « Et ensuite », « Toute la playlist », ⏮ ⏭.
- **Programmation** : pépites (archives choisies dans l'histoire des chaînes) en avant, mêlées aux sorties de la semaine ; sources panachées (jamais la même chaîne dans quatre vidéos d'affilée, ni le même artiste dans trois) ; chaînes et artistes aimés favorisés ; rien de ce qui a été vu ou marqué « déjà vu » depuis trois mois.
- **À la carte** : tout le disponible de la semaine, classé selon les goûts et l'humeur ; catégories, recherche (titre, chaîne, artiste, thème), filtre par chaîne (toucher son nom) ; vues **🆕 Nouveautés**, **✨ Pépites**, **🎤 Artistes** (toucher un nom pour voir ses vidéos), **🎭 Spectacles**, « Plus tard », historique.
- **Lecteur** : sous-titres coupés par défaut, enchaînement automatique, vidéos non intégrables sautées et signalées (« Ouvrir sur YouTube »), vue à 80 % → ne revient plus, reprise là où on s'était arrêté.
- **Goûts** : **J'aime / Bof contenu** (la vidéo et, via les retours, ses artistes) ; **J'aime / Bof chaîne**, **cumulables de −3 à +3** (on renforce en revotant depuis n'importe quelle vidéo de la chaîne ; le compteur s'affiche sur le bouton ; à −3 la chaîne est retirée) ; **Retirer la chaîne** (un geste, annulable) ; **Déjà vu** (écartée trois mois) ; bouton **Source** (priorité, masquer, retirer, voir ses vidéos) ; **Catégorie** (corriger un classement) ; Plus tard, curseur d'humeur (À la carte), minuterie, export/import JSON.
- **Dodo** : minuterie, ou programme pour s'endormir : 2 ou 3 « 42 » (ARTE), 2 documentaires de 44 min et plus, puis Balade Mentale et documentaires en alternance (arrêt au bout de 3 h, alerte 5 min avant, prolonger, son qui baisse, écran noir).
- **Plein écran immersif** avec les commandes YO1tv ; paysage sur la tablette : deux colonnes. Liens `#v=ID1,ID2,…&t=Titre` (playlist), `#live=UC…` (direct), `#canal=rire`.

## Fichiers

- `index.html`, `app.js`, `app.css` : l'application. `manifest.webmanifest`, `logo.svg`, `icone*.{svg,png}` : installation en raccourci.
- `outils/yo1tv.py` : collecte, intégration au stock, reclassement, retours, programmation (Python, sans dépendance) ; aide complète en tête du fichier.
- `data/semaine.json` : programmes de la semaine (`canaux` : la playlist de chaque catégorie ; `dodo` ; `items` : les fiches des vidéos disponibles). `data/stock.json` : toutes les vidéos jugées et gardées (avec leur catégorie, qualité `q`, artistes `art`, marques `pep`, `dodo`, `sp`), les écartées (pour ne pas les réexaminer) et la rotation des chaînes. `data/sources-dodo.json` : listes du programme dodo. `data/directs.json` : chaînes du canal Direct.
- `stats.js` (GoatCounter, sans cookie) et `suivi.js` (événements d'usage : `clic/…`, `reglage/…`, `regarde/CANAL/CHAÎNE`) ; `test.html` : page de test du lecteur.
- Données privées (jamais ici) : dossier `yo1tv/` du dépôt privé : `sources.json` (les chaînes suivies, leur catégorie, leurs poids et votes), `humoristes.json` (les 100 humoristes cherchés sur YouTube), `artistes.json` (goûts par artiste), `vus.json` (vu ou « déjà vu », écarté 90 jours), `journal.json`.

## Circulation des données

- **Chaque dimanche à 19 h 53** : retours de la tablette appliqués (`yo1tv.py retours`) ; candidates (`collecter` : vidéos populaires des chaînes en rotation, sorties des 10 derniers jours, analyses et entretiens de la semaine, recherches sur les humoristes de la liste et les artistes aimés) ; jugement et classement par l'IA (sous-agents, puis contrôle des catégories par la session principale) ; `integrer`, `reclasser`, `dodo`, `programmer` → `data/semaine.json`.
- **Depuis la tablette** : Réglages → « Envoyer mes retours » : les retours sont copiés, puis la page GitHub de création du fichier `retours/yo1tv-….json` du dépôt privé s'ouvre ; coller si la zone est vide, puis « Commit changes ». Ils contiennent les vues des 90 derniers jours : sans eux, la page écarte quand même ce qui a été vu sur cet appareil, mais la programmation suivante ne le sait pas.

## Tester en local

`python3 -m http.server` dans le dossier, puis http://localhost:8000/. Dans un navigateur automatisé, beaucoup de vidéos répondent « erreur 150 » : c'est attendu (cf. `CONTEXTE.md` §2). Outils : `python3 outils/yo1tv.py collecter --depot COPIE --prive COPIE-PRIVE --sortie cand.json` sur des copies, jamais sur le dépôt.
