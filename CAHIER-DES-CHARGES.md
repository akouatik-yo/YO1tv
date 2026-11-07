# YO1tv — cahier des charges

*Rédigé le 1er novembre 2026, à la fin de la conversation « La Vigie v7 ». À coller (ou faire lire) au début de la conversation qui lancera le projet. Le contexte technique détaillé est dans [`CONTEXTE.md`](CONTEXTE.md).*

## 1. Objectif

Une **télé personnelle** construite sur le catalogue vidéo quotidien de La Vigie : on l'allume, ça joue, sans avoir à choisir ; et quand on veut choisir, on peut. Elle apprend des goûts de Yoann (j'aime / je n'aime pas, mises de côté, humeur) et ces goûts finissent par influencer la collecte elle-même.

Esprit : autant d'humour que d'information, pour s'informer sans déprimer.

## 2. Contexte d'usage (impératif)

- **Tablette Android, en portrait, dans Brave**, à 99 %. Raccourci sur l'écran d'accueil → ouverture plein écran.
- Brave apporte **pas de publicité, lecture en superposition (incrustation), lecture écran éteint** : **confirmé aussi pour le lecteur intégré sur GitHub Pages** (test du 1er novembre 2026). À ne pas casser.
- Un seul utilisateur, un seul appareil principal.

## 3. Contraintes déjà établies

| Constat | Conséquence |
|---|---|
| Un artefact claude.ai **interdit les iframes YouTube** (« Ce contenu est bloqué », testé le 1/11/2026 dans Brave ; déjà constaté en v4). | YO1tv ne peut pas être un onglet de la Vigie. |
| Une page ouverte depuis le disque (`file://`) → **erreur YouTube 153**. | Pas de page locale. |
| GitHub Pages fonctionne sur la tablette : lecteur piloté, enchaînement, boutons, sans pub, écran éteint, incrustation (test du 1/11/2026). | **GitHub Pages** sur ce dépôt public : https://akouatik-yo.github.io/YO1tv/ (attention à la casse). |
| Dépôt public = contenu public. | Le catalogue peut y être ; **les goûts de Yoann non** (navigateur, ou dépôt privé). |
| Respect des conditions de YouTube : lecteur officiel uniquement. | Pas de téléchargement, pas de suppression de pub par le code (Brave fait ce qu'il fait, côté navigateur). |

## 4. Fonctions

### Lot 0 — Test : ✅ réussi (1er novembre 2026)
Tout fonctionne sur la tablette (détail et journal dans `CONTEXTE.md` §2). Deux remarques de Yoann : **le son démarre bien activé, mais les sous-titres aussi** → les désactiver par défaut ; le démarrage en cours de vidéo du « direct simulé » de test **n'apporte rien** → à supprimer (voir lot 2 pour le vrai besoin).

### Lot 1 — Le lecteur (MVP)
- **Catalogue du jour** lu depuis `data/` (déposé chaque matin par la routine de la Vigie).
- **Lecteur en haut, file en dessous** (portrait) ; vignettes `i.ytimg.com`.
- **Sous-titres désactivés par défaut** (`cc_load_policy: 0` ne suffit pas toujours : après `onReady`/changement de vidéo, `player.unloadModule("captions")` ou `setOption("captions","track",{})` ; bouton pour les réactiver).
- **Enchaînement automatique** ; vidéos non intégrables (erreur 101/150) sautées et signalées, avec lien « Ouvrir sur YouTube ».
- **Catégories** de la Vigie : Actu, Débats et émissions, Découverte, Culture, Divertissement, Humour (+ formats courts : avec / sans / seulement).
- **Historique** : vidéo « vue » à 80 % → ne revient plus ; reprise là où on s'était arrêté.
- Compatibilité avec les liens existants de la Vigie (`#v=ID1,ID2,…&t=Titre`) pour que les boutons « Playlist » puissent ouvrir YO1tv.

### Lot 2 — La télé : diffusion continue (précisé par Yoann le 1/11/2026)
- **Chaque jour, une playlist d'environ 24 h par canal, qui démarre à minuit** (heure de Paris). Elle n'a pas à faire exactement 24 h.
- **En allumant à 14 h, on tombe sur la vidéo prévue à 14 h** — au début de cette vidéo, **pas au milieu** (le démarrage en cours de vidéo est explicitement écarté). Revenir plusieurs fois dans la journée ne fait donc pas repartir la playlist de zéro.
- **« Suivante » reste toujours possible** (et « précédente ») : on peut avancer dans la grille à son rythme. À décider par l'instance : après un saut, la grille suit-elle l'horloge au prochain allumage (télé) ou la position de Yoann (reprise) ? Proposer, choisir, documenter.
- **Remplissage** : catalogue du jour d'abord ; s'il ne suffit pas, puiser dans **l'historique des chaînes non liées à l'actualité** (Découverte, Culture, Humour, Divertissement : anciennes vidéos des chaînes suivies, par exemple via les flux `UULF…` complets ou la page `/videos`) ; ce stock alimente aussi les jours creux.
- **Report** : les vidéos **hors actualité non vues** peuvent être reprises dans la playlist du lendemain (et suivants) ; l'actualité (actu, débats) ne se reporte pas, elle périme.
- La grille doit être **stable pour la journée** (même résultat à chaque ouverture) : la calculer une fois par jour (côté routine dans un JSON, ou côté page avec une graine = date, puis la mémoriser), en tenant compte des vues.
- **Canaux** (proposition à valider) : *YO1 Mix*, *YO1 Rire* (humour + divertissement), *YO1 Info* (actu + débats), *YO1 Savoir* (découverte + culture) ; zapping entre canaux ; « Et ensuite » : les prochains programmes avec leur heure.
- Bascule **Télé** (grille) ↔ **À la carte** (on choisit dans la file).

### Lot 3 — Les goûts
- **J'aime / je n'aime pas** sur la vidéo en cours : modifie le poids de la **chaîne** et de la **catégorie** dans le choix des vidéos ; plusieurs « je n'aime pas » sur une chaîne → proposition de la masquer (jamais automatiquement sans le dire).
- **Mettre de côté** (« Plus tard ») : ce soir / demain / dans une semaine / choix libre ; la vidéo revient en tête de file à la date dite, avec une marque.
- **Curseur d'humeur** : proposition d'un seul curseur *« à plat » ↔ « curieux »* : à gauche plus d'humour et de formats courts, à droite plus de Découverte et de formats longs ; l'Actu dosée au milieu. À discuter : un second axe (durée disponible ?).
- Tout est stocké **dans le navigateur** (localStorage), avec export/import JSON de secours.

### Lot 4 — La boucle avec la Vigie
- Synchroniser les goûts vers le **dépôt privé** de la Vigie (fichier `retours/yo1tv.json`, jeton GitHub à portée minimale conservé dans Brave), pour que `collecteur.py` ajuste `poids` des chaînes et propose des sources proches de celles aimées.
- Option : un bouton dans la Vigie qui ouvre YO1tv sur la playlist d'un jour.

## 5. Interface

- Portrait d'abord. Paysage sur tablette : deux colonnes (lecteur et commandes à gauche, programmes à droite) — demandé par Yoann le 1/11/2026 après essai du plein écran ; plein écran par le bouton. Paysage sur téléphone : lecteur seul.
- Grandes cibles tactiles (≥ 44 px), gestes simples (glisser pour zapper : à tester, conflit possible avec le lecteur).
- Thème sombre par défaut (télé), clair disponible ; même famille visuelle que la Vigie sans la copier.
- Installable en raccourci (manifeste web, icône YO1tv).

## 6. Données et circulation

```
Routine Vigie (4 h 38, Paris) ──► catalogue du jour ──► dépôt public yo1tv/data/AAAA-MM-JJ.json (+ index.json des 7 derniers jours)
                                                         │
YO1tv (GitHub Pages) ◄───────────────────────────────────┘
   └─ goûts (localStorage) ──[lot 4, jeton]──► dépôt privé de la Vigie ──► collecteur.py (poids des chaînes)
```

Format des vidéos : voir `CONTEXTE.md` §3 (champs `i t c sid d o p du co`).

## 7. Critères de réussite

- Lot 0 : une vidéo se lit et la suivante s'enchaîne seule sur la tablette ; on sait ce qu'il en est de la pub, de la superposition et de l'écran éteint.
- Lot 1 : le catalogue du jour apparaît chaque matin sans intervention.
- Lot 2 : on allume, ça joue en moins de 3 s, et le programme ne se répète pas dans la journée.
- Lot 3 : après une semaine de votes, la part des chaînes aimées augmente visiblement.

## 8. Décisions et état (novembre 2026)

*Les §1 à 7 sont le cahier des charges d'origine. Ce qui suit résume ce qui a été décidé et construit ; le détail technique est dans `README.md`.*

| Sujet | Décision |
|---|---|
| Canaux | YO1 Mix (tout), YO1 Rire (humour + divertissement ; entretiens et podcasts d'humoristes classés en Culture), YO1 Info (actu + débats), YO1 Savoir (découverte + culture), YO1 Direct (directs YouTube, expérimental). |
| Grilles | Environ 24 h par canal, de minuit à minuit (Paris), calculées chaque matin par `outils/yo1tv.py` ; calcul de secours dans la page. On tombe au début du programme prévu à l'heure ; si on avait avancé plus loin dans la grille, on reprend là ; les vidéos vues (80 %) sont sautées. YO1 Mix de 10 h à 22 h : cycle de 9 cases (actu du jour et chroniques en tête), journal de 3 vidéos d'actu à 13 h et 20 h. Variété forcée (pas deux fois la même chaîne d'affilée), formats courts en blocs, rediffusion seulement si le contenu manque. Une grille ne s'épuise jamais : sous 4 h de programme jouable restant, la page la prolonge de 6 h (correctif du 1/11 au soir : « Suivante » répétés et fin de soirée menaient à « fin des programmes »). |
| Pépites | Stock d'archives (`data/stock.json`) : vidéos longues populaires des chaînes hors actualité, triées chaque dimanche par l'IA (qualité 1 à 3, échos à l'actualité de la semaine, priorité 7 jours) ; une pépite ne repasse pas avant 21 jours. Première collecte étendue le 1/11/2026 : 351 pépites. Archives des Guignols via `data/sources-pepites.json`. Spectacles entiers marqués `sp` (thème « spectacle », ou stand-up ≥ 40 min) : vue « 🎭 Spectacles » À la carte, tout en restant dans l'humour. |
| Goûts | J'aime / Bof **contenu** (vidéo, artistes : goûts par artiste tenus par la tâche du dimanche dans le dépôt privé) et J'aime / Bof **chaîne** (poids de la chaîne), Déjà vu (7 jours), masquer une chaîne (jamais sans le dire), Plus tard, curseur d'humeur à un axe (« à plat » ↔ « curieux »), catégorie corrigée (après 3 corrections concordantes, toute la chaîne suit). Tout dans le navigateur ; export/import JSON. |
| Boucle avec la Vigie | Sans jeton : « Envoyer mes retours » ouvre la page GitHub de création de fichier du dépôt privé (`retours/yo1tv-….json`), pré-remplie. La tâche du dimanche applique des ajustements bornés (poids ±1, catégorie d'une chaîne non mixte) aux sources de la Vigie et tient un journal. |
| Dodo | Minuterie, ou programme de documentaires calmes ≥ 20 min (fonds `dodo` : 42 d'ARTE, Balade Mentale, documentaires ARTE et ARTE Évasion, C'est pas sorcier ; titres violents ou angoissants exclus ; ordre : 2-3 « 42 », 2 documentaires ≥ 44 min, puis alternance Balade Mentale / documentaire ; file ≥ 6 h), arrêt au bout de 3 h par défaut même en cours de vidéo, alerte 5 min avant avec prolongation, son qui baisse, écran noir ; rien ne compte comme vu ; « Bof » retire du programme. |
| Interface | Portrait d'abord ; paysage sur tablette en deux colonnes ; plein écran immersif avec barre de commandes YO1tv (plein écran de YouTube masqué) ; sombre par défaut ; raccourci plein écran (manifeste) ; logo vectoriel d'après le dessin de Yoann. |
| Tâches planifiées | Catalogue, grilles, listes des chaînes et des directs : publiés chaque matin par la routine de la Vigie (dépôts Actualit-s-, YO1tv et Vigie attachés), à la fin de son travail ; la tâche « YO1tv — publication du matin » (5 h 41) est désactivée depuis le 5 novembre 2026. « YO1tv — pépites et retours » (dimanche 19 h 53, dépôts YO1tv et Actualit-s-), session neuve sur Sonnet. Dépôts attachés dans les réglages de chaque tâche (navigateur seulement, pas l'application). |

## 9. Pistes ouvertes

- Commandes de l'écran verrouillé (Media Session) : à tester sur la tablette avant de coder (lecture dans l'iframe de YouTube).
- Second axe d'humeur, rendez-vous supplémentaires dans les grilles : à voir après usage.
- Mode réveil : écarté (son automatique impossible sans geste).
- Service worker : inutile (rien ne se lit hors ligne).
