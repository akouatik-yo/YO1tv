# YO1tv — consignes pour Claude

État : **v1 construite et poussée le 1er novembre 2026** (voir README et CAHIER-DES-CHARGES.md §8 bis). Mission initiale (pour mémoire) : construire et pousser la v1 de YO1tv en autonomie, sans intervention de Yoann, puis lui rendre compte.

1. Lire `CAHIER-DES-CHARGES.md` en entier (surtout le §9, consignes) puis `CONTEXTE.md`.
2. Compléter le cahier des charges par ta propre réflexion (section « Pistes ajoutées par Claude ») : fonctions, interface, ergonomie — ce qui améliorerait au mieux YO1tv.
3. Trancher toi-même les questions ouvertes pour la v1, documenter les choix.
4. Coder, tester (Playwright, serveur local, portrait 800×1280, zéro erreur JS), pousser sur `main` (GitHub Pages sert `main` à la racine : https://akouatik-yo.github.io/YO1tv/).

Contraintes :
- **Dépôt public** : aucune donnée personnelle, aucune adresse de l'artefact de la Vigie, aucun identifiant de routine, aucun jeton. Les goûts de Yoann restent dans le navigateur (localStorage).
- Lecteur YouTube **officiel** uniquement (API IFrame) ; ne rien faire contre les conditions de YouTube.
- Le dépôt privé `akouatik-yo/Actualit-s-` (La Vigie : `collecteur.py`, routine) n'est pas à modifier pour la v1 ; s'il est attaché à ta session, tu peux le lire.
- Usage réel : Brave, tablette Android en portrait, raccourci plein écran.
