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
- **Catalogue du jour** lu depuis `data/` (déposé chaque matin par la routine de la Vigie, cf. §6).
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

- Portrait d'abord ; paysage = lecteur plein écran.
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

## 8. Questions ouvertes — tranchées pour la v1 (1er novembre 2026, par Claude ; tout est réversible)

1. ~~Résultats du test de l'étape 0~~ : réussi.
2. **Canaux** : *YO1 Mix* (tout), *YO1 Rire* (humour + divertissement), *YO1 Info* (actu + débats), *YO1 Savoir* (découverte + culture), plus *YO1 Direct* (les 6 directs YouTube de `data/directs.json`, expérimental). Définis dans `CANAUX` en tête de `app.js` : renommer ou regrouper = une ligne.
3. **Un seul axe d'humeur** (« à plat » ↔ « curieux ») pour la v1 : un second axe « durée disponible » ferait doublon avec la minuterie de sommeil et le « Plus tard », et deux curseurs se règlent moins vite qu'un. À revoir après usage.
4. **Mode réveil : non** (le navigateur interdit de lancer le son sans geste et la tablette dort) ; **« avant de dormir » : oui**, sous forme de minuterie de sommeil (15 à 90 min, ou fin de la vidéo en cours).
5. **Jeton GitHub** : repoussé avec le lot 4. Le jour venu : jeton « fine-grained » limité au seul dépôt privé, permission *Contents : read and write*, expiration courte ; en attendant, export/import JSON manuel.
6. *(question du lot 2)* **Après un saut dans la grille** : la grille suit l'horloge, **sauf si tu avais avancé plus loin** — on reprend alors là où tu étais, pour ne jamais revoir ce que tu as zappé ; les vidéos déjà vues (80 %) sont sautées. C'est le compromis télé/reprise le plus simple ; la règle tient en une ligne de `demarrerTele()`.

## 8 bis. Pistes ajoutées par Claude (v1 du 1er novembre 2026)

### Mises dans la v1

| Piste | Pourquoi |
|---|---|
| **Grille calculée dans la page** (graine = date + canal, tirage pondéré sans remise), mémorisée pour la journée dans le navigateur | Pas besoin de toucher la routine ; même résultat à chaque ouverture. Si un nouveau catalogue arrive dans la journée, ou si l'humeur change, seule la **suite** de la grille est recalculée : le passé ne bouge pas. |
| **Rediffusion** quand un canal a moins de 24 h de contenu (marque « rediff ») | Mieux qu'un écran noir. Limite connue : YO1 Savoir n'a qu'environ 9 h de contenu par jour → beaucoup de rediffusions tant que le stock d'archives (lot 2, `UULF…`) n'existe pas. |
| **Variété forcée** : jamais deux fois la même chaîne d'affilée, jamais trois fois la même catégorie ; formats courts **en blocs** (3 tous les 3 programmes sur Rire, 2 tous les 6 sur Mix) | Une télé qui enchaîne quatre franceinfo de suite, ou des Shorts isolés au milieu de documentaires, ça se zappe. |
| **Report** : les vidéos hors actualité des 7 derniers catalogues restent candidates (poids × 0,7) ; l'actu et les débats non | Demandé au lot 2 ; « l'actualité périme ». |
| **Reprise** dans une vidéo (au-delà de 15 s, avant 90 %) + marque « reprise » | Lot 1. À ne pas confondre avec le démarrage en cours de vidéo de la grille, qui reste écarté. |
| **Bouton « Allumer »** si le navigateur bloque la lecture automatique | Le son au démarrage marche dans Brave d'après le test, mais pas garanti partout. |
| **Glisser sur le bandeau** (sous l'image, pas sur le lecteur) pour zapper ; numéros de canal 1 à 5 | Geste « télécommande » sans conflit avec les gestes du lecteur YouTube. |
| **Minuterie de sommeil** | Usage du soir ; réponse à la question 4. |
| **« Bof » = passer à la suivante** + toast « Annuler » ; proposition de masquer une chaîne à −3 | Voter sans subir la suite ; rien n'est masqué sans le dire. |
| **Toucher le nom de la chaîne** → toutes ses vidéos À la carte ; recherche plein texte (sans accents) | Découverte par chaîne, peu coûteux. |
| **Historique** (150 dernières vues) et **liste « Plus tard »** visibles À la carte | Retrouver ce qu'on a vu ou mis de côté. |
| **Vidéos non intégrables** mémorisées 7 jours (sautées, liste avec lien YouTube dans les réglages) | Ne pas retomber dessus à chaque zapping ; 7 jours au cas où l'erreur serait passagère. |
| **Raccourcis clavier**, **thème clair**, **manifeste plein écran**, logo vectoriel | Confort ; installation en raccourci. |
| **Paramètre de test `?heure=14:00`** | Vérifier la grille à n'importe quelle heure sans attendre. |

### Gardées pour plus tard

| Piste | Raison du report |
|---|---|
| Rendez-vous fixes dans la grille (« journal » de 2 vidéos d'actu à 7 h, 13 h, 20 h sur YO1 Mix) | Joli, mais à régler après avoir vu ce que donne la grille actuelle. |
| Stock d'archives des chaînes hors actu (flux `UULF…` complets) | À faire côté `collecteur.py` (le navigateur ne peut pas lire ces flux : CORS). C'est ce qui réglera les rediffusions de YO1 Savoir. |
| Média Session (commandes sur l'écran verrouillé) | La lecture se fait dans l'iframe de YouTube : effet incertain, à tester sur la tablette avant de coder. |
| Service worker (ouverture hors ligne) | Peu utile (rien ne se lit hors ligne) et risque de servir une vieille version ; le manifeste suffit pour le raccourci. |
| Statistiques de goûts (« ta semaine ») | Utile pour vérifier le critère du lot 3 ; quand il y aura une semaine de votes. |
| Deuxième axe d'humeur, mode réveil | Voir §8. |
| Lot 4 (synchronisation vers le dépôt privé) et publication quotidienne du catalogue | Hors v1 comme prévu ; format prêt : `data/AAAA-MM-JJ.json` + `data/index.json` (`{"jours":[…]}`), cf. README. |

## 9. Consignes pour l'instance qui reprend YO1tv

Yoann veut une **première version poussée sans autre intervention de sa part**, sur laquelle on itérera ensuite. Donc :

1. **Compléter ce cahier des charges par ta propre réflexion** : autres fonctions, idées d'interface, d'ergonomie tactile en portrait, de découverte de contenus, de confort (minuterie de sommeil, reprise, raccourcis, accessibilité…) qui amélioreraient au mieux YO1tv. Les écrire dans une section « Pistes ajoutées par Claude » de ce fichier, en distinguant ce que tu mets dans la v1 et ce que tu gardes pour plus tard, avec la raison.
2. **Trancher toi-même** les questions ouvertes du §8 pour la v1 (choix raisonnables, documentés, faciles à changer) au lieu d'attendre Yoann.
3. **Construire et pousser la v1** : lots 1 et 2 au minimum, lot 3 si possible (stockage local) ; le lot 4 (synchronisation vers le dépôt privé) et la publication quotidienne automatique du catalogue par la routine de la Vigie peuvent attendre — dans ce cas, travailler avec les données de `data/` et le prévoir proprement (format `data/AAAA-MM-JJ.json` + `data/index.json`).
4. **Tester** avant de pousser (Playwright sur un serveur local ; les erreurs YouTube 150 dans le conteneur sont attendues, cf. `CONTEXTE.md` §2), vérifier la mise en page à 800×1280 (portrait tablette) sans erreur JavaScript.
5. La page servie est la branche **`main`** à la racine : la v1 doit y arriver pour que Yoann la voie à https://akouatik-yo.github.io/YO1tv/.
6. Mettre à jour `README.md` (état, ce qui marche, ce qui reste) et laisser un compte rendu clair à Yoann.

Préférences de Yoann à respecter : français, honnêteté sans superlatifs, niveaux de confiance explicites, signaler les tâches lourdes.
