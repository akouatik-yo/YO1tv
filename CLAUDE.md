# YO1tv — consignes pour Claude

Télé personnelle de Yoann, indépendante de La Vigie depuis le 19 novembre 2026 (playlists de la semaine par canal). Page statique servie par GitHub Pages depuis `main` (racine) : https://akouatik-yo.github.io/YO1tv/. À lire d'abord : `README.md` (fonctions, fichiers, circulation des données), puis `CAHIER-DES-CHARGES.md` §8 (décisions) et `CONTEXTE.md` (leçons techniques).

Contraintes :
- **Dépôt public** : aucune donnée personnelle (seule exception, voulue par Yoann : l'adresse de contact du pied de page, assemblée par `app.js`), aucune adresse de l'artefact de la Vigie, aucun identifiant de tâche planifiée, aucun jeton. Les goûts de Yoann restent dans le navigateur (localStorage) ; ses retours vont dans le dépôt privé `akouatik-yo/Actualit-s-`.
- Lecteur YouTube **officiel** uniquement (API IFrame) ; rien contre les conditions de YouTube.
- Usage réel : Brave, tablette Android, portrait (paysage en deux colonnes), raccourci plein écran ; ne pas casser la lecture écran éteint ni l'incrustation.
- La tâche « YO1tv — programmation de la semaine » (dimanche 19 h 53, consignes `yo1tv-semaine.md` du dépôt privé) dépend de `outils/yo1tv.py` et des fichiers de `data/` : garder leurs formats compatibles. Les chaînes suivies, les goûts et les vues sont dans `yo1tv/` du dépôt privé, jamais ici.

Méthode : tester avant de pousser (serveur local + Playwright, portrait 800×1280 et paysage 1280×800, zéro erreur JavaScript ; les erreurs YouTube 150 du conteneur sont attendues ; outils testés sur des copies avec `--depot` et `--prive`). Pousser sur `main`.
