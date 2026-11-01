# YO1tv — cahier des charges

*Rédigé le 1er novembre 2026, à la fin de la conversation « La Vigie v7 ». À coller (ou faire lire) au début de la conversation qui lancera le projet. Le contexte technique détaillé est dans [`CONTEXTE.md`](CONTEXTE.md).*

## 1. Objectif

Une **télé personnelle** construite sur le catalogue vidéo quotidien de La Vigie : on l'allume, ça joue, sans avoir à choisir ; et quand on veut choisir, on peut. Elle apprend des goûts de Yoann (j'aime / je n'aime pas, mises de côté, humeur) et ces goûts finissent par influencer la collecte elle-même.

Esprit : autant d'humour que d'information, pour s'informer sans déprimer.

## 2. Contexte d'usage (impératif)

- **Tablette Android, en portrait, dans Brave**, à 99 %. Raccourci sur l'écran d'accueil → ouverture plein écran.
- Brave apporte aujourd'hui, sur youtube.com : **pas de publicité, lecture en superposition, lecture écran éteint**. À préserver si possible ; **inconnu** pour un lecteur intégré (c'est l'objet de l'étape 0).
- Un seul utilisateur, un seul appareil principal.

## 3. Contraintes déjà établies

| Constat | Conséquence |
|---|---|
| Un artefact claude.ai **interdit les iframes YouTube** (« Ce contenu est bloqué », testé le 1/11/2026 dans Brave ; déjà constaté en v4). | YO1tv ne peut pas être un onglet de la Vigie. |
| Une page ouverte depuis le disque (`file://`) → **erreur YouTube 153**. | Pas de page locale. |
| Une vraie adresse https fonctionne (API IFrame chargée, lecteur piloté, testé sur localhost). | **GitHub Pages** sur ce dépôt public. |
| Dépôt public = contenu public. | Le catalogue peut y être ; **les goûts de Yoann non** (navigateur, ou dépôt privé). |
| Respect des conditions de YouTube : lecteur officiel uniquement. | Pas de téléchargement, pas de suppression de pub par le code (Brave fait ce qu'il fait, côté navigateur). |

## 4. Fonctions

### Lot 0 — Test (déjà prêt : `index.html`)
Vérifier sur la tablette : lecture, enchaînement automatique, ⏮ ⏯ ⏭, direct simulé, plein écran, superposition, écran éteint, publicité. Le journal en bas de page se copie pour Claude.

### Lot 1 — Le lecteur (MVP)
- **Catalogue du jour** lu depuis `data/` (déposé chaque matin par la routine de la Vigie, cf. §6).
- **Lecteur en haut, file en dessous** (portrait) ; vignettes `i.ytimg.com`.
- **Enchaînement automatique** ; vidéos non intégrables (erreur 101/150) sautées et signalées, avec lien « Ouvrir sur YouTube ».
- **Catégories** de la Vigie : Actu, Débats et émissions, Découverte, Culture, Divertissement, Humour (+ formats courts : avec / sans / seulement).
- **Historique** : vidéo « vue » à 80 % → ne revient plus ; reprise là où on s'était arrêté.
- Compatibilité avec les liens existants de la Vigie (`#v=ID1,ID2,…&t=Titre`) pour que les boutons « Playlist » puissent ouvrir YO1tv.

### Lot 2 — La télé : diffusion continue
- **Canaux** (proposition) : *YO1 Mix* (tout), *YO1 Rire* (humour + divertissement), *YO1 Info* (actu + débats), *YO1 Savoir* (découverte + culture). Liste à valider.
- **Grille de 24 h déterministe** : calculée à partir de la date (graine) et du catalogue des 7 derniers jours, sans les vues ; en ouvrant, on tombe **au milieu** du programme en cours, comme à la télé. Rouvrir 10 min plus tard = 10 min plus loin.
- Zapping entre canaux (gestes ou boutons) ; « Et ensuite » : les 3 prochains programmes.
- Bascule **Télé** (on subit la grille) ↔ **À la carte** (on choisit dans la file).

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

## 8. Questions ouvertes (à trancher par Yoann)

1. Les résultats du test de l'étape 0 (bloquant pour la suite).
2. Liste et noms des canaux du lot 2.
3. Un ou deux axes pour le curseur d'humeur.
4. Faut-il un mode « réveil » / « avant de dormir » (programme fixe à une heure donnée) ?
5. Lot 4 : accepter un jeton GitHub stocké dans Brave (risque faible, mais réel).

## 9. Méthode proposée

- Nouvelle conversation **Claude Code** avec deux dépôts : `akouatik-yo/yo1tv` (public) et `akouatik-yo/Actualit-s-` (privé, pour la routine et le collecteur).
- Avancer lot par lot, chaque lot testé sur la tablette avant le suivant.
- Signaler les tâches lourdes avant de les lancer (préférence de Yoann).
