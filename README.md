# YO1tv

Télé personnelle construite sur le catalogue vidéo quotidien de La Vigie : diffusion continue par canaux, j'aime / je n'aime pas, « plus tard », curseur d'humeur. Page statique servie par GitHub Pages, lecteur YouTube officiel.

**État (1er novembre 2026) : lot 0, test du lecteur.**

- [`CAHIER-DES-CHARGES.md`](CAHIER-DES-CHARGES.md) : objectifs, fonctions par lots, questions ouvertes.
- [`CONTEXTE.md`](CONTEXTE.md) : tout ce qui a été appris et construit côté Vigie (contraintes, format du catalogue, sources, tests).
- [`index.html`](index.html) : page de test du lecteur (à ouvrir sur la tablette une fois Pages activé).
- `data/` : catalogue d'exemple, chaînes, directs, catégories. `reference/` : premier lecteur externe de la Vigie.

## Lancer le test

1. Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
2. Ouvrir `https://akouatik-yo.github.io/yo1tv/` dans Brave sur la tablette.
3. Toucher une vidéo, puis vérifier : enchaînement, ⏮ ⏯ ⏭, 📡 direct simulé, plein écran, superposition, écran éteint, publicité.
4. Copier le journal technique (bas de page) dans la conversation avec Claude.
