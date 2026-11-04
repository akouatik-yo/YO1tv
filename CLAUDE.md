# YO1tv — consignes pour Claude

Télé personnelle de Yoann sur le catalogue vidéo de La Vigie. Page statique servie par GitHub Pages depuis `main` (racine) : https://akouatik-yo.github.io/YO1tv/. À lire d'abord : `README.md` (fonctions, fichiers, circulation des données), puis `CAHIER-DES-CHARGES.md` §8 (décisions) et `CONTEXTE.md` (leçons techniques).

Contraintes :
- **Dépôt public** : aucune donnée personnelle, aucune adresse de l'artefact de la Vigie, aucun identifiant de tâche planifiée, aucun jeton. Les goûts de Yoann restent dans le navigateur (localStorage) ; ses retours vont dans le dépôt privé `akouatik-yo/Actualit-s-`.
- Lecteur YouTube **officiel** uniquement (API IFrame) ; rien contre les conditions de YouTube.
- Usage réel : Brave, tablette Android, portrait (paysage en deux colonnes), raccourci plein écran ; ne pas casser la lecture écran éteint ni l'incrustation.
- La routine du matin de la Vigie (`diffuser.sh` du dépôt privé : `yo1tv.py jour … --sources …`) et la tâche « YO1tv — pépites et retours » dépendent de `outils/yo1tv.py` et des fichiers de `data/` : garder leurs formats compatibles (consignes dans `yo1tv-hebdo.md` du dépôt privé). `data/chaines.json` et `data/directs.json` sont recopiés chaque matin de la liste des sources de la Vigie : ne pas les modifier à la main.

Méthode : tester avant de pousser (serveur local + Playwright, portrait 800×1280 et paysage 1280×800, zéro erreur JavaScript ; les erreurs YouTube 150 du conteneur sont attendues ; `?heure=14:00` simule une heure). Pousser sur `main`.
