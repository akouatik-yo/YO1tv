/* YO1tv v1 — télé personnelle sur le catalogue vidéo de La Vigie.
   Lecteur YouTube officiel (API IFrame). Tous les goûts restent dans ce navigateur (localStorage).
   Données : data/index.json → {"jours":["AAAA-MM-JJ", …]} ; data/AAAA-MM-JJ.json (format : CONTEXTE.md §3).
   Choix de conception documentés dans CAHIER-DES-CHARGES.md, section « Pistes ajoutées par Claude ». */
"use strict";
const VERSION = "1.0";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ytUrl = id => "https://www.youtube.com/watch?v=" + id;
const vignette = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const enSec = d => String(d || "").split(":").reduce((s, x) => s * 60 + (+x || 0), 0);
const DUREE_COURT = 40, DUREE_INCONNUE = 600, JOUR_S = 86400;
const duree = x => x.co ? DUREE_COURT : (enSec(x.du) || DUREE_INCONNUE);
const deux = n => String(n).padStart(2, "0");
const hhmm = s => { s = Math.floor(s) % JOUR_S; return deux(s / 3600 | 0) + ":" + deux((s % 3600) / 60 | 0); };
const fmtDuree = s => s >= 3600 ? `${s / 3600 | 0} h ${deux((s % 3600) / 60 | 0)}` : `${Math.max(1, Math.round(s / 60))} min`;
const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const titreDe = x => x.tf || x.t || "Vidéo " + x.i;

const CATS = { actu: "Actu", analyse: "Débats et émissions", decouverte: "Découverte", culture: "Culture", divertissement: "Divertissement", humour: "Humour" };
const PERISSABLE = new Set(["actu", "analyse"]);   // l'actualité ne se reporte pas d'un jour sur l'autre
const CANAUX = [
  { id: "mix", nom: "YO1 Mix", cats: Object.keys(CATS), courts: [6, 2] },          // courts: [toutes les N vidéos, bloc de M courts]
  { id: "rire", nom: "YO1 Rire", cats: ["humour", "divertissement"], courts: [3, 3] },
  { id: "info", nom: "YO1 Info", cats: ["actu", "analyse"] },
  { id: "savoir", nom: "YO1 Savoir", cats: ["decouverte", "culture"] },
  { id: "direct", nom: "YO1 Direct", direct: true }
];
const CANAL = Object.fromEntries(CANAUX.map(c => [c.id, c]));
const MIX_CAT = { humour: 1.4, actu: 1, analyse: .7, decouverte: 1.1, culture: 1, divertissement: 1.1 };

/* ---------- Horloge (Paris) ---------- */
// ?heure=14:00 (tests) décale l'horloge interne pour simuler une autre heure de la journée.
let DECALAGE = 0;
const maintenant = () => Date.now() + DECALAGE;
const FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function paris(t = maintenant()) {
  const p = {}; for (const x of FMT.formatToParts(new Date(t))) p[x.type] = x.value;
  return { jour: `${p.year}-${p.month}-${p.day}`, s: +p.hour * 3600 + +p.minute * 60 + +p.second };
}
const jourPlus = (j, n) => { const d = new Date(j + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function epochParis(j, s) { const p = paris(); return maintenant() + ((Date.parse(j + "T00:00:00Z") - Date.parse(p.jour + "T00:00:00Z")) / 1000 + s - p.s) * 1000; }
const joliJour = j => new Date(j + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const joliMoment = t => new Date(t).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
{ const h = new URLSearchParams(location.search).get("heure"); if (/^\d{1,2}:\d{2}$/.test(h || "")) { const [a, b] = h.split(":"); DECALAGE = ((+a * 3600 + +b * 60) - paris(Date.now()).s) * 1000; } }

/* ---------- Mémoire locale ---------- */
const CLE = "yo1tv.v1";
const defaut = () => ({
  v: 1, vus: {}, hist: [], prog: {}, votes: {}, gouts: { ch: {}, cat: {} }, masquees: [], noms: {}, plusTard: [], bloquees: {},
  humeur: 50, cc: false, theme: "sombre", canal: "mix", mode: "tele", format: "avec", courtsTele: true, cacherVues: true,
  direct: 0, grilles: {}, pos: {}, corr: {}, modif: 0, envoi: 0, dodoVus: {}, dodoNon: {}, dodoDuree: 180, dodoNoir: false, dodoFondu: true
});
function lireStock() {
  let s; try { s = Object.assign(defaut(), JSON.parse(localStorage.getItem(CLE)) || {}); } catch { s = defaut(); }
  const t = Date.now(), j = paris().jour;
  for (const [id, ts] of Object.entries(s.vus)) if (t - ts > 90 * 864e5) delete s.vus[id];
  for (const [id, ts] of Object.entries(s.bloquees)) if (t - ts > 7 * 864e5) delete s.bloquees[id];
  for (const k of Object.keys(s.grilles)) if (k !== j) delete s.grilles[k];
  for (const k of Object.keys(s.pos)) if (k !== j) delete s.pos[k];
  const p = Object.keys(s.prog); p.slice(0, Math.max(0, p.length - 300)).forEach(k => delete s.prog[k]);
  const v = Object.keys(s.votes); v.slice(0, Math.max(0, v.length - 1500)).forEach(k => delete s.votes[k]);
  s.hist = s.hist.slice(0, 150);
  return s;
}
let S = lireStock(), tSauve = 0;
function sauver(tout) {
  clearTimeout(tSauve);
  const f = () => { try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) { console.warn("Mémoire pleine ?", e); } };
  tout ? f() : (tSauve = setTimeout(f, 250));
}
addEventListener("pagehide", () => sauver(true));
const mini = x => ({ i: x.i, t: x.t, tf: x.tf, c: x.c, sid: x.sid, o: x.o, du: x.du, co: x.co, d: x.d, p: x.p, pep: x.pep, q: x.q, th: x.th });

/* ---------- Catalogues ---------- */
let CAT = new Map(), DERNIER = null, JOURS = [], DIRECTS = [], SECOURS = false, GRILLES_SERVEUR = null, NB_PEPITES = 0;
async function lireJson(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(url + " : " + r.status); return r.json(); }
async function chargerCatalogues() {
  const auj = paris().jour;
  let jours = [];
  try { jours = (await lireJson("data/index.json", { cache: "no-cache" })).jours || []; } catch (e) { console.warn(e); }
  jours = [...new Set(jours)].filter(j => /^\d{4}-\d{2}-\d{2}$/.test(j) && j <= auj).sort().reverse().slice(0, 7);
  let cats = await Promise.all(jours.map((j, k) => lireJson(`data/${j}.json`, k ? {} : { cache: "no-cache" }).catch(() => null)));
  cats = cats.map((c, k) => c && { ...c, date: c.date || jours[k] }).filter(c => c && Array.isArray(c.items));
  if (!cats.length) { SECOURS = true; try { cats = [await lireJson("data/catalogue-exemple.json")]; } catch { cats = []; } }
  DERNIER = cats[0]?.date || null; JOURS = cats.map(c => c.date);
  // Le plus récent d'abord : chaque vidéo garde la fiche la plus récente ; les jours précédents n'apportent que le hors-actualité (report).
  for (const [k, c] of cats.entries()) for (const x of c.items) {
    if (!x || !/^[\w-]{11}$/.test(x.i) || CAT.has(x.i) || !CATS[x.o]) continue;
    if (k > 0 && PERISSABLE.has(x.o)) continue;
    x._j = c.date; CAT.set(x.i, x);
  }
  // Pépites : archives choisies chaque dimanche par la routine hebdomadaire (data/stock.json).
  try { for (const x of (await lireJson("data/stock.json", { cache: "no-cache" })).items || []) if (/^[\w-]{11}$/.test(x.i) && CATS[x.o] && !CAT.has(x.i)) { x._j = "stock"; x.pep = 1; CAT.set(x.i, x); NB_PEPITES++; } } catch { }
  // Grilles du jour préparées par la routine de la Vigie (data/grilles/AAAA-MM-JJ.json) ; sinon, calcul dans la page.
  try { GRILLES_SERVEUR = (await lireJson(`data/grilles/${auj}.json`, { cache: "no-cache" })).canaux || null; } catch { GRILLES_SERVEUR = null; }
  appliquerCorrections();
  try { DIRECTS = (await lireJson("data/directs.json")).filter(d => /^UC[\w-]{22}$/.test(d.yt_chaine || "")).sort((a, b) => (b.poids || 1) - (a.poids || 1)); } catch { DIRECTS = []; }
}

/* ---------- Goûts, humeur, poids ---------- */
const fGout = x => clamp(1.25 ** (S.gouts.ch[x.sid] || 0), .25, 4) * clamp(1.15 ** (S.gouts.cat[x.o] || 0), .5, 2);
function fHumeur(x) {
  const h = (S.humeur - 50) / 50, d = duree(x); let f = 1;   // h : −1 = « à plat », +1 = « curieux »
  if (x.o === "humour") f *= 1 - .45 * h;
  if (x.o === "divertissement") f *= 1 - .25 * h;
  if (x.o === "decouverte" || x.o === "culture") f *= 1 + .6 * h;
  if (PERISSABLE.has(x.o)) f *= 1 - .3 * Math.abs(h);       // l'actu dosée : un peu moins aux extrêmes
  if (x.co) f *= 1 - .5 * h; else if (d >= 1500) f *= 1 + .5 * h; else if (d < 600) f *= 1 - .2 * h;
  return Math.max(f, .05);
}
function poids(x, canal) {
  let w = (x.pep ? .9 * (x.q || 2) : (x.p || 1)) * fGout(x) * fHumeur(x) * (x.sel ? 1.5 : 1);
  if (canal === "mix") { w *= MIX_CAT[x.o] || 1; if (duree(x) > 5400) w *= .4; }
  if (x._j !== DERNIER) w *= .7;
  return w;
}
const masquee = x => S.masquees.includes(x.sid);
const jouable = (x, souple) => !!x && !S.bloquees[x.i] && !masquee(x) && (souple || !S.vus[x.i]);

/* ---------- Grille du jour (télé) ---------- */
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Tirage pondéré sans remise (Efraimidis–Spirakis) : clé = u^(1/poids).
const tirage = (items, canal, rnd) => items.map(x => [Math.pow(rnd() || 1e-9, 1 / poids(x, canal)), x]).sort((a, b) => b[0] - a[0]).map(a => a[1]);
function varier(seq) {   // évite deux fois la même chaîne d'affilée et trois fois la même catégorie
  const out = [], reste = seq.slice();
  while (reste.length) {
    const a = out[out.length - 1], b = out[out.length - 2]; let k = 0;
    for (let j = 0; j < Math.min(reste.length, 10); j++) { const x = reste[j]; if (a && x.sid === a.sid) continue; if (a && b && x.o === a.o && x.o === b.o) continue; k = j; break; }
    out.push(reste.splice(k, 1)[0]);
  }
  return out;
}
function passe(longs, courts, c) {
  const out = []; let ci = 0;
  longs.forEach((x, k) => { out.push(x); if (c.courts && (k + 1) % c.courts[0] === 0) for (let j = 0; j < c.courts[1] && ci < courts.length; j++) out.push(courts[ci++]); });
  if (!longs.length) out.push(...courts);
  return out;
}
// garder : début de grille déjà diffusé (conservé tel quel). Retourne [[id, durée, rediffusion?], …] couvrant ≥ 24 h.
function construire(canal, garder = [], gen = 0) {
  const c = CANAL[canal], gardes = new Set(garder.map(g => g[0]));
  const pool = [...CAT.values()].filter(x => c.cats.includes(x.o) && !gardes.has(x.i) && jouable(x) && (!x.co || (c.courts && S.courtsTele)));
  const rnd = mulberry(hash(paris().jour + "|" + canal + "|" + gen));
  const items = garder.slice(); let t = items.reduce((s, g) => s + g[1], 0);
  const longs = pool.filter(x => !x.co), courts = pool.filter(x => x.co);
  for (let r = 0; t < JOUR_S && r < 8 && pool.length; r++) {   // r > 0 : rediffusion (catalogue plus court que 24 h)
    for (const x of passe(varier(tirage(longs, canal, rnd)), tirage(courts, canal, rnd), c)) {
      items.push(r ? [x.i, duree(x), 1] : [x.i, duree(x)]); t += duree(x); if (t >= JOUR_S) break;
    }
  }
  return items;
}
const indexA = (deb, s) => { let k = 0; while (k < deb.length - 1 && deb[k + 1] <= s) k++; return k; };
const debuts = items => { let t = 0; return items.map(g => { const d = t; t += g[1]; return d; }); };
function grille(canal) {
  const j = paris().jour; S.grilles[j] ||= {};
  let g = S.grilles[j][canal];
  const srv = (GRILLES_SERVEUR?.[canal] || []).filter(e => CAT.has(e[0]));
  if (srv.length && !g?.srv) {   // grille de la routine (arrivée éventuellement après une première ouverture dans la journée)
    g = S.grilles[j][canal] = { cat: DERNIER, gen: 0, items: srv, srv: 1 };
    if (S.pos[j]) delete S.pos[j][canal];
    sauver();
  }
  else if (!g) { g = S.grilles[j][canal] = { cat: DERNIER, gen: 0, items: construire(canal) }; sauver(); }
  else if (g.cat !== DERNIER) refaire(canal);   // nouveau catalogue dans la journée : on garde le passé, on refait la suite
  return S.grilles[j][canal];
}
function refaire(canal) {
  const j = paris().jour, g = S.grilles[j]?.[canal]; if (!g) return;
  const k = Math.max(indexA(debuts(g.items), paris().s), S.pos[j]?.[canal] ?? -1);
  g.gen++; g.cat = DERNIER; g.items = construire(canal, g.items.slice(0, k + 1), g.gen); sauver();
  if (cour.src === "tele" && cour.canal === canal) { cour.file = fileDe(g); rendreListe(); }
}
const refaireTout = () => Object.keys(S.grilles[paris().jour] || {}).forEach(refaire);
const fileDe = g => { const deb = debuts(g.items); return g.items.map(([id, d, r], k) => ({ x: CAT.get(id) || null, deb: deb[k], d, r })); };

/* ---------- Lecteur YouTube ---------- */
let API = false, L = null, pret = false, enDirect = false, demande = null, etatL = -1, ccFait = null, tAllumer = 0, nbErr = 0, tProg = 0;
let cour = { src: null, file: [], k: -1, x: null };
const dodo = { fin: 0, finVideo: false, alerte: false, volume: null };
function placeLecteur() {
  const v = $("#video"); v.querySelector("#lecteur")?.remove();
  const d = document.createElement("div"); d.id = "lecteur"; v.prepend(d);
}
function charger(dem) {
  demande = dem;
  if (dem.live) { creerDirect(dem.live); return; }
  if (!API) return;                                   // le lecteur sera créé à l'arrivée de l'API
  if (!L || enDirect) { creerLecteur(dem); return; }
  if (pret) { L.loadVideoById({ videoId: dem.id, startSeconds: dem.debut || 0 }); demande = null; }
}
function creerLecteur(dem) {
  if (L) { try { L.destroy(); } catch { } }
  placeLecteur(); pret = false; enDirect = false; demande = null;
  L = new YT.Player("lecteur", {
    videoId: dem.id,
    playerVars: { playsinline: 1, rel: 0, autoplay: 1, start: dem.debut || 0, cc_load_policy: S.cc ? 1 : 0, iv_load_policy: 3, fs: 0, hl: "fr", origin: location.origin },
    events: {
      onReady: () => { pret = true; appliquerCC(); if (demande) charger(demande); else try { L.playVideo(); } catch { } },
      onStateChange: e => etatChange(e.data),
      onError: e => erreur(e.data)
    }
  });
}
// Direct : simple iframe officielle « live_stream » (sans pilotage), comme le lecteur v4 de la Vigie.
function creerDirect(uc) {
  if (L) { try { L.destroy(); } catch { } L = null; }
  placeLecteur(); enDirect = true; pret = false; demande = null;
  $("#lecteur").innerHTML = `<iframe src="https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(uc)}&autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Direct" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  $("#allumer").hidden = true;
}
function appliquerCC() {
  if (!L?.setOption || enDirect) return;
  try {
    if (S.cc) { L.loadModule?.("captions"); L.setOption("captions", "track", { languageCode: "fr" }); }
    else { L.setOption("captions", "track", {}); L.unloadModule?.("captions"); }
  } catch { }
}
function etatChange(s) {
  etatL = s;
  if (s === 1) {
    nbErr = 0; $("#allumer").hidden = true;
    const id = cour.x?.i; if (ccFait !== id) { ccFait = id; appliquerCC(); setTimeout(appliquerCC, 1500); }
  }
  if (s === 0 && cour.x) {
    marquerVu(cour.x);
    if (dodo.finVideo) { finDodo(); return; }
    suivant(1);
  }
  majPause();
}
function erreur(code) {
  const x = cour.x; nbErr++;
  if (x && [2, 100, 101, 150].includes(code)) S.bloquees[x.i] = Date.now();
  sauver();
  if (x) toast(`« ${court(titreDe(x))} » ne peut pas être lue ici (erreur ${code}).`, { lien: ytUrl(x.i), texte: "Ouvrir sur YouTube" });
  if (nbErr >= 8) { annonce("Plusieurs vidéos d'affilée refusent de se lire. Vérifie la connexion, puis touche « Suivante »."); nbErr = 0; return; }
  setTimeout(() => suivant(1), 1500);
}
function surveillerDemarrage() {
  clearTimeout(tAllumer);
  tAllumer = setTimeout(() => {
    if (enDirect || document.hidden) return;
    const s = L?.getPlayerState?.();
    if (s === -1 || s === 5 || s === undefined && API) $("#allumer").hidden = false;   // lecture automatique bloquée : il faut un geste
  }, 4000);
}
function marquerVu(x) {
  if (x && cour.src === "dodo") { S.dodoVus[x.i] = Date.now(); sauver(); return; }   // en s'endormant, rien ne compte comme « vu »
  if (!x || S.vus[x.i]) return;
  S.vus[x.i] = Date.now(); delete S.prog[x.i];
  S.hist = [{ ...mini(x), vu: Date.now() }, ...S.hist.filter(h => h.i !== x.i)].slice(0, 150);
  S.plusTard = S.plusTard.filter(p => p.x.i !== x.i);
  sauver(); rendreListe();
}
setInterval(() => {
  majHorloge(); verifDodo();
  if (!L?.getPlayerState || enDirect || !cour.x) return;
  let t, d; try { if (L.getPlayerState() !== 1) return; t = L.getCurrentTime(); d = L.getDuration() || duree(cour.x); } catch { return; }
  const x = cour.x; if (!(d > 0)) return;
  $("#progres").style.width = clamp(100 * t / d, 0, 100) + "%";
  if (t / d >= .8) marquerVu(x);
  else if (cour.src !== "dodo" && !S.vus[x.i] && t > 15 && Date.now() - tProg > 10000) { S.prog[x.i] = Math.floor(t); tProg = Date.now(); sauver(); }
}, 2000);

/* ---------- Navigation dans les files ---------- */
function jouer(x) {
  cour.x = x; ccFait = null; $("#annonce").hidden = true; $("#progres").style.width = "0";
  const pr = S.prog[x.i] || 0, debut = pr > 15 && pr < duree(x) * .9 - 10 ? Math.floor(pr) : 0;   // reprise là où on s'était arrêté
  charger({ id: x.i, debut });
  afficher(); surveillerDemarrage();
}
function aller(k, dir = 1, souple = false) {
  const f = cour.file;
  const okCourt = e => !(cour.src === "tele" && !S.courtsTele && e.x?.co);
  while (k >= 0 && k < f.length && !(jouable(f[k].x, souple || cour.souple) && okCourt(f[k]))) k += dir;
  if (k < 0 || k >= f.length) {
    if (dir < 0) return toast("Pas de vidéo avant celle-ci.");
    if (cour.src === "dodo") { finDodo(); return; }
    if (cour.src === "carte") { toast("Fin de la liste. Retour à la télé."); return demarrerTele(S.canal); }
    annonce("Fin des programmes de ce canal pour aujourd'hui. Zappe sur un autre canal !"); return;
  }
  cour.k = k;
  if (cour.src === "tele") { (S.pos[cour.jour] ||= {})[cour.canal] = k; sauver(); }
  jouer(f[k].x);
}
function suivant(dir = 1) {
  if (cour.src === "direct") return zapDirect(dir);
  if (cour.src === "tele" && paris().jour !== cour.jour) return demarrerTele(cour.canal);   // minuit est passé : nouvelle grille
  if (!cour.src) return demarrerTele(S.canal);
  aller(cour.k + dir, dir, dir < 0);
}
function demarrerTele(canal = S.canal) {
  if (!CANAL[canal]) canal = "mix";
  S.canal = canal; sauver(); majCanaux();
  if (CANAL[canal].direct) return demarrerDirect(S.direct);
  const g = grille(canal), j = paris().jour, file = fileDe(g);
  if (!file.length) { cour = { src: "tele", canal, jour: j, file, k: -1, x: null }; afficher(); annonce("Rien à diffuser sur ce canal pour l'instant (catalogue vide ou tout est déjà vu)."); return; }
  // On tombe sur la vidéo prévue à cette heure, au début ; si on avait déjà avancé plus loin dans la grille, on reprend là.
  const k = Math.min(Math.max(indexA(file.map(e => e.deb), paris().s), S.pos[j]?.[canal] ?? -1), file.length - 1);
  cour = { src: "tele", canal, jour: j, file, k: -1, x: null };
  aller(k, 1);
}
function demarrerDirect(k = 0) {
  if (!DIRECTS.length) { annonce("Aucun direct YouTube dans data/directs.json."); return; }
  k = ((k % DIRECTS.length) + DIRECTS.length) % DIRECTS.length; S.direct = k; S.canal = "direct"; sauver();
  cour = { src: "direct", canal: "direct", file: DIRECTS, k, x: null };
  charger({ live: DIRECTS[k].yt_chaine }); afficher(); majCanaux();
}
const zapDirect = dir => demarrerDirect(cour.k + dir);
function zapper(dir) {
  const k = CANAUX.findIndex(c => c.id === S.canal), c = CANAUX[(k + dir + CANAUX.length) % CANAUX.length];
  demarrerTele(c.id); toast(c.nom);
}
function jouerListe(liste, k, souple) {
  cour = { src: "carte", file: liste.map(x => ({ x })), k: -1, x: null, souple };
  aller(k, 1, true);
}

/* ---------- Affichage ---------- */
const court = (s, n = 60) => s.length > n ? s.slice(0, n - 1) + "…" : s;
function annonce(t) { const a = $("#annonce"); a.textContent = t; a.hidden = false; }
function majHorloge() { const s = paris().s; $("#horloge").textContent = hhmm(s); }
function majCanaux() {
  $("#canaux").innerHTML = CANAUX.map((c, k) => `<button role="tab" data-canal="${c.id}" aria-selected="${(cour.src === "tele" || cour.src === "direct") && S.canal === c.id}"><b>${k + 1}</b>${esc(c.nom)}</button>`).join("");
}
function majPause() {
  const lecture = etatL === 1 || etatL === 3;
  $("#icoPause").setAttribute("href", lecture ? "#i-pause" : "#i-lecture"); $("#txtPause").textContent = lecture ? "Pause" : "Lecture";
  $("#icoImPause").setAttribute("href", lecture ? "#i-pause" : "#i-lecture");
}
function majVotes() {
  const v = cour.x ? S.votes[cour.x.i] || 0 : 0;
  for (const s of ["#bAime", "#imAime"]) $(s).setAttribute("aria-pressed", v === 1);
  for (const s of ["#bBof", "#imBof"]) $(s).setAttribute("aria-pressed", v === -1);
}
function metaDe(x, e) {
  const bits = [CATS[x.o] || ""];
  if (x.pep) bits.push("pépite" + (x.th ? " · " + x.th : ""));
  bits.push(x.co ? "format court" : x.du ? fmtDuree(enSec(x.du)) : "durée inconnue");
  if (x.d) { const h = (Date.now() - Date.parse(x.d)) / 36e5; if (h >= 0) bits.push(h < 1 ? "il y a moins d'une heure" : h < 48 ? `il y a ${Math.round(h)} h` : `il y a ${Math.round(h / 24)} j`); }
  return bits.filter(Boolean).join(" · ");
}
function afficher() {
  const dir = cour.src === "direct";
  for (const id of ["#bAime", "#bBof", "#bTard", "#bCC", "#bCat", "#imAime", "#imBof", "#imTard", "#imCat"]) $(id).disabled = dir;
  majCanaux(); majPause(); majVotes(); majDodo();
  $("#bCC").setAttribute("aria-pressed", S.cc);
  if (dir) {
    const d = cour.file[cour.k];
    $("#surtitre").textContent = "YO1 Direct · " + (cour.k + 1) + "/" + cour.file.length; $("#badges").innerHTML = `<span class="badge chaud">EN DIRECT</span>`;
    $("#titre").textContent = d.nom; $("#chaine").textContent = ""; $("#meta").textContent = "Expérimental : si rien ne s'affiche, la chaîne n'est pas en direct. Suivante = autre direct.";
    rendreListe(); majIm(); return;
  }
  const x = cour.x;
  if (!x) { $("#titre").textContent = "Rien à l'antenne"; $("#chaine").textContent = ""; $("#meta").textContent = ""; $("#surtitre").textContent = ""; $("#badges").innerHTML = ""; rendreListe(); return; }
  const e = cour.file[cour.k] || {};
  $("#surtitre").textContent = cour.src === "dodo" ? `🌙 Programme dodo · ${cour.k + 1}/${cour.file.length}${dodo.fin ? " · arrêt vers " + hhmm(paris(dodo.fin).s) : ""}` : cour.src === "tele" ? `${CANAL[cour.canal].nom} · ${hhmm(e.deb)} – ${hhmm(e.deb + e.d)}` : (F.vue === "playlist" && PLAYLIST.titre ? "Playlist · " + PLAYLIST.titre : "À la carte · " + (cour.k + 1) + "/" + cour.file.length);
  const b = [];
  if (e.r) b.push(`<span class="badge">rediffusion</span>`);
  if (S.vus[x.i]) b.push(`<span class="badge">déjà vue</span>`);
  if (S.prog[x.i] > 15) b.push(`<span class="badge">reprise</span>`);
  if (x.sel) b.push(`<span class="badge chaud">choix de la Vigie</span>`);
  if (x.pep) b.push(`<span class="badge chaud">✨ pépite</span>`);
  if (x.echo && (x.echo_fin || "") >= paris().jour) b.push(`<span class="badge" title="${esc(x.echo)}">écho de l'actu</span>`);
  if (x._o0) b.push(`<span class="badge">reclassée</span>`);
  if (x._j && x._j !== DERNIER && x._j !== "stock") b.push(`<span class="badge">du ${esc(joliJour(x._j).replace(/^\w+ /, ""))}</span>`);
  $("#badges").innerHTML = b.join("");
  $("#titre").textContent = titreDe(x); $("#titre").title = x.tf ? x.t : "";
  $("#chaine").textContent = x.c || ""; $("#meta").textContent = metaDe(x);
  document.title = court(titreDe(x), 50) + " · YO1tv";
  majIm();
  rendreListe();
}
function ligne(x, o = {}) {
  const m = [];
  if (o.tard) m.push(`<span class="marque">⏰ ${esc(o.tard)}</span>`);
  if (o.r) m.push(`<span class="marque discret">rediff</span>`);
  if (o.vu) m.push(`<span class="marque discret">vu</span>`);
  if (x.sel) m.push(`<span class="marque">★</span>`);
  if (x.pep) m.push(`<span class="marque">✨</span>`);
  return `<li><button type="button" ${o.data || ""} aria-current="${!!o.cur}" class="${o.vu ? "vu" : ""}"><img src="${vignette(x.i)}" alt="" loading="lazy" decoding="async"><span><span class="t">${m.join("")}${esc(titreDe(x))}</span><small>${o.heure ? `<span class="h">${o.heure}</span>` : ""}${esc(x.c || "")}${x.c ? " · " : ""}${esc(metaDe(x))}</small></span></button></li>`;
}
function rendreListe() { if (S.mode === "tele") rendreTele(); else rendreCarte(); }
function rendreTele() {
  const el = $("#ensuite");
  if (cour.src === "direct") {
    $("#vueTele .titre-section span").textContent = "Directs disponibles";
    el.innerHTML = DIRECTS.map((d, k) => `<li><button type="button" data-direct="${k}" aria-current="${k === cour.k}"><span><span class="t">${esc(d.nom)}</span><small>YouTube · en direct si la chaîne diffuse</small></span></button></li>`).join("");
    el.querySelectorAll("button").forEach(b => b.style.gridTemplateColumns = "1fr");
    return;
  }
  $("#vueTele .titre-section span").textContent = cour.src === "tele" ? "Et ensuite sur " + CANAL[cour.canal].nom : cour.src === "dodo" ? "Programme dodo" : "Et ensuite (à la carte)";
  const f = cour.file || [], out = [];
  for (let j = Math.max(cour.k, 0); j < f.length && out.length < 14; j++) {
    const e = f[j]; if (!e.x || S.bloquees[e.x.i] || masquee(e.x)) continue;
    const vu = j !== cour.k && !!S.vus[e.x.i];
    if (vu && out.length > 0 && cour.src === "tele") continue;
    out.push(ligne(e.x, { heure: cour.src === "tele" ? hhmm(e.deb) : "", cur: j === cour.k, vu, r: e.r, data: `data-j="${j}"` }));
  }
  el.innerHTML = out.join("") || `<li class="vide">Rien de prévu.</li>`;
}

/* ---------- À la carte ---------- */
const F = { vue: "liste", cat: "tout", q: "", chaine: null, n: 120 };
let PLAYLIST = [];
function scoreCarte(x) { const h = x.d ? Math.max(0, (Date.now() - Date.parse(x.d)) / 36e5) : 48; return poids(x, "carte") / (1 + h / 72); }
function filtreFormat(x) { return S.format === "avec" || (S.format === "sans" ? !x.co : !!x.co); }
function listeCarte() {
  const t = maintenant();
  if (F.vue === "tard") return S.plusTard.slice().sort((a, b) => a.q - b.q).map(p => ({ x: CAT.get(p.x.i) || p.x, tard: p.q }));
  if (F.vue === "hist") return S.hist.map(h => ({ x: CAT.get(h.i) || h }));
  if (F.vue === "playlist") return PLAYLIST.map(x => ({ x }));
  if (F.vue === "pep") return [...CAT.values()].filter(x => x.pep && jouable(x, !S.cacherVues) && (F.cat === "tout" || x.o === F.cat))
    .sort((a, b) => ((b.echo_fin || "") >= paris().jour) - ((a.echo_fin || "") >= paris().jour) || poids(b, "carte") - poids(a, "carte")).map(x => ({ x }));
  const q = sansAccent(F.q);
  const ok = x => !x.pep && (F.cat === "tout" || x.o === F.cat) && filtreFormat(x) && (!F.chaine || x.sid === F.chaine) && !S.bloquees[x.i] && !masquee(x)
    && (!S.cacherVues || !S.vus[x.i]) && (!q || sansAccent(x.t + " " + (x.tf || "") + " " + x.c).includes(q));
  const dus = S.plusTard.filter(p => p.q <= t).map(p => ({ x: CAT.get(p.x.i) || p.x, tard: p.q })).filter(e => ok(e.x));
  const pris = new Set(dus.map(e => e.x.i));
  return [...dus, ...[...CAT.values()].filter(x => ok(x) && !pris.has(x.i)).sort((a, b) => scoreCarte(b) - scoreCarte(a)).map(x => ({ x }))];
}
let LISTE = [];
function rendreCarte() {
  const vues = [["liste", "Catalogue"], ...(NB_PEPITES ? [["pep", "✨ Pépites"]] : []), ["tard", `⏰ Plus tard${S.plusTard.length ? " (" + S.plusTard.length + ")" : ""}`], ["hist", "Historique"]];
  if (PLAYLIST.length) vues.unshift(["playlist", "Playlist" + (PLAYLIST.titre ? " · " + court(PLAYLIST.titre, 24) : "")]);
  $("#pucesVue").innerHTML = vues.map(([v, n]) => `<button type="button" data-vue="${v}" aria-pressed="${F.vue === v}">${esc(n)}</button>`).join("")
    + (F.chaine ? `<button type="button" data-chaine="" aria-pressed="true">✕ ${esc(S.noms[F.chaine] || [...CAT.values()].find(x => x.sid === F.chaine)?.c || F.chaine)}</button>` : "");
  const cat = F.vue === "liste";
  $("#pucesFormat").hidden = $("#recherche").hidden = !cat; $("#pucesCat").hidden = !(cat || F.vue === "pep");
  if (cat || F.vue === "pep") $("#pucesCat").innerHTML = [["tout", "Tout"], ...Object.entries(CATS).filter(([k]) => cat || !PERISSABLE.has(k))].map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${F.cat === k}">${esc(n)}</button>`).join("");
  if (cat) {
    $("#pucesFormat").innerHTML = [["avec", "Avec formats courts"], ["sans", "Sans formats courts"], ["seul", "Seulement les courts"]].map(([k, n]) => `<button type="button" data-format="${k}" aria-pressed="${S.format === k}">${n}</button>`).join("")
      + `<button type="button" data-vues="1" aria-pressed="${!S.cacherVues}">Montrer les vues</button>`;
  }
  LISTE = listeCarte();
  const now = maintenant(), curId = cour.src === "carte" ? cour.x?.i : null;
  $("#noteCarte").textContent = F.vue === "tard" ? (LISTE.length ? "Les vidéos mises de côté reviennent en tête du catalogue à la date dite." : "")
    : F.vue === "hist" ? (LISTE.length ? "Les 150 dernières vidéos vues (à 80 %)." : "")
    : F.vue === "pep" ? `${LISTE.length} pépites tirées de l'historique des chaînes, choisies chaque dimanche ; celles qui font écho à l'actualité d'abord.` : F.vue === "liste" ? `${LISTE.length} vidéo${LISTE.length > 1 ? "s" : ""}, classées selon tes goûts et ton humeur.` : "";
  $("#carte").innerHTML = LISTE.slice(0, F.n).map((e, k) => ligne(e.x, {
    data: `data-k="${k}"`, cur: e.x.i === curId, vu: F.vue !== "hist" && !!S.vus[e.x.i],
    tard: e.tard ? (e.tard <= now ? "à voir" : new Date(e.tard).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })) : ""
  })).join("") || `<li class="vide">${F.vue === "tard" ? "Rien de mis de côté. Le bouton « Plus tard » sert à ça." : F.vue === "hist" ? "Aucune vidéo vue pour l'instant." : "Aucune vidéo ne correspond."}</li>`;
  $("#bPlus").hidden = LISTE.length <= F.n;
}
function vue(m) {
  S.mode = m; sauver();
  $("#mTele").setAttribute("aria-pressed", m === "tele"); $("#mCarte").setAttribute("aria-pressed", m === "carte");
  $("#vueTele").hidden = m !== "tele"; $("#vueCarte").hidden = m !== "carte";
  rendreListe();
}

/* ---------- Toast ---------- */
let tToast = 0;
function toast(txt, o = {}) {
  $("#toastTxt").textContent = txt;
  const a = $("#toastAct"); a.innerHTML = "";
  if (o.lien) { const l = document.createElement("a"); l.href = o.lien; l.target = "_blank"; l.rel = "noopener"; l.textContent = o.texte || "Ouvrir"; a.append(l); }
  if (o.action) { const b = document.createElement("button"); b.type = "button"; b.textContent = o.action; b.onclick = () => { $("#toast").hidden = true; o.fn(); }; a.append(b); }
  $("#toast").hidden = false; clearTimeout(tToast); tToast = setTimeout(() => $("#toast").hidden = true, o.action || o.lien ? 7000 : 3500);
}

/* ---------- Goûts : j'aime / bof / masquer ---------- */
function voter(v, x = cour.x, silencieux) {
  if (!x || cour.src === "direct" && x === cour.x) return;
  const avant = S.votes[x.i] || 0, nv = avant === v ? 0 : v, delta = nv - avant;
  if (nv) S.votes[x.i] = nv; else delete S.votes[x.i];
  S.gouts.ch[x.sid] = (S.gouts.ch[x.sid] || 0) + delta;
  S.gouts.cat[x.o] = (S.gouts.cat[x.o] || 0) + delta * .5;
  if (x.sid) S.noms[x.sid] = x.c;
  S.modif = Date.now(); sauver(); majVotes();
  if (silencieux) return;
  if (nv === 1) toast(`Noté : un peu plus de ${x.c || "cette chaîne"} et de ${CATS[x.o] || "ce genre"}.`);
  else if (nv === -1) {
    if ((S.gouts.ch[x.sid] || 0) <= -3 && x.sid && !masquee(x)) toast(`Plusieurs « bof » pour ${x.c}. La masquer ?`, { action: "Masquer", fn: () => masquer(x) });
    else toast(`Noté : moins de ${x.c || "cette chaîne"}.`, { action: "Annuler", fn: () => voter(-1, x, true) });
    if (cour.src === "dodo" && x === cour.x) { S.dodoNon[x.i] = 1; sauver(); toast("Retirée du programme dodo.", { action: "Annuler", fn: () => { delete S.dodoNon[x.i]; voter(-1, x, true); sauver(); } }); }
    if (x === cour.x) suivant(1);
  }
}
function masquer(x) {
  if (!x.sid || masquee(x)) return;
  S.masquees.push(x.sid); S.noms[x.sid] = x.c; S.modif = Date.now(); sauver();
  toast(`${x.c} est masquée. Réglages → Chaînes masquées pour la réafficher.`);
  if (cour.x?.sid === x.sid) suivant(1); else rendreListe();
}

/* ---------- Feuilles ---------- */
function feuille(html, init) { $("#dlgCorps").innerHTML = html; init?.($("#dlgCorps")); $("#dlg").showModal(); }
const fermer = () => $("#dlg").close();

function feuilleTard() {
  const x = cour.x; if (!x || cour.src === "direct") return;
  const p = paris(), demain = jourPlus(p.jour, 1);
  feuille(`<h2>Mettre de côté</h2><p>« ${esc(court(titreDe(x), 80))} » reviendra en tête du catalogue (À la carte), avec une marque ⏰.</p>
    <div class="choix">
      <button type="button" data-q="soir">Ce soir<br><small>${p.s < 19 * 3600 ? "19 h" : "demain 19 h"}</small></button>
      <button type="button" data-q="demain">Demain matin<br><small>8 h</small></button>
      <button type="button" data-q="semaine">Dans une semaine<br><small>${esc(joliJour(jourPlus(p.jour, 7)))}</small></button>
    </div>
    <div class="ligne"><input type="date" id="tardJour" value="${demain}" min="${p.jour}" aria-label="Jour"><input type="time" id="tardHeure" value="20:00" aria-label="Heure"><button type="button" data-q="libre">Ce jour-là</button></div>`,
    el => el.onclick = e => {
      const b = e.target.closest("[data-q]"); if (!b) return;
      const q = b.dataset.q; let t;
      if (q === "soir") t = p.s < 19 * 3600 ? epochParis(p.jour, 19 * 3600) : epochParis(demain, 19 * 3600);
      else if (q === "demain") t = epochParis(demain, 8 * 3600);
      else if (q === "semaine") t = epochParis(jourPlus(p.jour, 7), 8 * 3600);
      else { const j = $("#tardJour").value, [h, m] = ($("#tardHeure").value || "20:00").split(":"); if (!j) return; t = epochParis(j, +h * 3600 + +m * 60); }
      mettreDeCote(x, t); fermer();
    });
}
function mettreDeCote(x, q) {
  try { const t = L?.getCurrentTime?.(); if (t > 15) S.prog[x.i] = Math.floor(t); } catch { }
  S.plusTard = [...S.plusTard.filter(p => p.x.i !== x.i), { x: mini(x), q }]; sauver();
  toast(`⏰ Mise de côté jusqu'à ${joliMoment(q)}.`);
  if (x === cour.x) suivant(1);
}
const emoHumeur = () => S.humeur < 30 ? "à plat" : S.humeur > 70 ? "curieux" : "entre deux";
function texteHumeur() {
  return S.humeur < 30 ? "Plus d'humour et de formats courts, moins de formats longs. L'actu reste là, en petite dose."
    : S.humeur > 70 ? "Plus de Découverte et de Culture, plus de formats longs ; l'humour reste présent."
      : "Équilibre : autant d'humour que d'information.";
}
function feuilleHumeur() {
  feuille(`<h2>Humeur du moment</h2><p>Ce curseur pèse sur le choix des vidéos : la suite de la grille télé (le passé ne bouge pas) et l'ordre du catalogue À la carte.</p>
    <input class="curseur" type="range" min="0" max="100" step="5" value="${S.humeur}" id="curHumeur" aria-label="Humeur, de à plat à curieux">
    <div class="bornes"><span>😴 À plat</span><span>🤓 Curieux</span></div><p id="txtCur">${texteHumeur()}</p>`,
    el => {
      const c = el.querySelector("#curHumeur");
      c.oninput = () => { S.humeur = +c.value; $("#txtCur").textContent = texteHumeur(); };
      c.onchange = () => { S.humeur = +c.value; sauver(); refaireTout(); majHumeur(); rendreListe(); toast("Humeur prise en compte pour la suite des programmes."); };
    });
}
const majHumeur = () => $("#txtHumeur").textContent = S.humeur < 30 ? "À plat" : S.humeur > 70 ? "Curieux" : "Humeur";
/* ---------- Dodo : minuterie et programme pour s'endormir ----------
   Programme dodo : documentaires calmes de 20 min et plus (marque « dodo » du stock : 42 d'ARTE, Balade Mentale,
   documentaires ARTE…), au moins 6 h de file pour pouvoir passer ce qui ne convient pas, arrêt au bout de la durée choisie
   (3 h par défaut) même en cours de vidéo. Alerte 5 min avant avec « Prolonger », son qui baisse doucement sur les
   2 dernières minutes, écran noir facultatif. Ce qu'on regarde en s'endormant ne compte pas comme « vu » (rotation à part),
   et « Bof » en mode dodo retire la vidéo du programme. Écran éteint, le navigateur ralentit les minuteries : l'arrêt
   peut alors avoir jusqu'à une minute de retard. */
const DODO_MIN_S = 1200, DODO_FILE_S = 6 * 3600, FONDU_S = 120, ALERTE_S = 300;
const dureeDodoDefaut = () => S.dodoDuree || 180;
function fmtMin(m) { m = Math.max(0, Math.round(m)); return m >= 60 ? `${m / 60 | 0} h${m % 60 ? " " + deux(m % 60) : ""}` : `${m} min`; }
function feuilleDodo() {
  const reste = dodo.fin ? (dodo.fin - maintenant()) / 60000 : 0, enCours = dodo.fin || dodo.finVideo;
  const n = poolDodo().length;
  feuille(`<h2>Dodo</h2>
    <p>${enCours ? (dodo.fin ? `Arrêt dans ${fmtMin(reste)} (vers ${hhmm(paris(dodo.fin).s)}).` : "Arrêt à la fin de la vidéo en cours.") : "Pour s'endormir devant la télé sans la laisser tourner toute la nuit."}</p>
    <h3>Programme pour s'endormir</h3>
    <p>Documentaires calmes de 20 min et plus (42 d'ARTE, Balade Mentale, documentaires ARTE…), au moins 6 h de programme pour pouvoir passer ceux qui ne conviennent pas. ${n} vidéos disponibles.</p>
    <div class="choix">${[90, 120, 180, 240].map(m => `<button type="button" data-prog="${m}" aria-pressed="${m === dureeDodoDefaut()}">Arrêt après ${fmtMin(m)}</button>`).join("")}</div>
    <div class="choix"><button type="button" data-opt="dodoNoir" aria-pressed="${!!S.dodoNoir}">Écran noir (le son continue)</button><button type="button" data-opt="dodoFondu" aria-pressed="${S.dodoFondu !== false}">Baisse progressive du son</button></div>
    <h3>Minuterie seule (le programme en cours continue)</h3>
    <div class="choix">${[15, 30, 45, 60, 90].map(m => `<button type="button" data-m="${m}">${m} min</button>`).join("")}<button type="button" data-m="fin">Fin de cette vidéo</button>${enCours ? `<button type="button" data-m="0">Désactiver</button>` : ""}</div>`,
    el => el.onclick = e => {
      const o = e.target.closest("[data-opt]");
      if (o) { const k = o.dataset.opt; S[k] = k === "dodoFondu" ? S[k] === false : !S[k]; sauver(); o.setAttribute("aria-pressed", k === "dodoFondu" ? S[k] !== false : S[k]); return; }
      const p = e.target.closest("[data-prog]");
      if (p) { S.dodoDuree = +p.dataset.prog; sauver(); fermer(); lancerDodo(+p.dataset.prog); return; }
      const b = e.target.closest("[data-m]"); if (!b) return; const m = b.dataset.m;
      reglerDodo(m === "fin" ? "fin" : +m * 60000); fermer();
      toast(+m ? `🌙 Pause dans ${m} min.` : m === "fin" ? "🌙 Pause à la fin de cette vidéo." : "Minuterie désactivée.");
    });
}
function reglerDodo(ms) {
  restaurerVolume();
  dodo.fin = 0; dodo.finVideo = false; dodo.alerte = false;
  if (ms === "fin") dodo.finVideo = true; else if (ms > 0) dodo.fin = maintenant() + ms;
  $("#alerteDodo").hidden = true; majDodo();
}
function poolDodo() {
  return [...CAT.values()].filter(x => x.dodo && duree(x) >= DODO_MIN_S && !S.bloquees[x.i] && !masquee(x) && !S.dodoNon[x.i]);
}
function lancerDodo(minutes = dureeDodoDefaut()) {
  let pool = poolDodo();
  if (pool.reduce((a, x) => a + duree(x), 0) < DODO_FILE_S)   // secours : documentaires longs du catalogue
    pool = pool.concat([...CAT.values()].filter(x => !x.dodo && x.o === "decouverte" && !x.co && duree(x) >= DODO_MIN_S && duree(x) <= 5400 && !S.bloquees[x.i] && !masquee(x) && !S.dodoNon[x.i]));
  if (!pool.length) return toast("Pas encore de documentaires pour le programme dodo.");
  // Jamais passées en dodo d'abord, puis les plus anciennement passées ; à égalité, tirage pondéré (priorité 42 et Balade Mentale).
  const rnd = mulberry(hash("dodo|" + paris().jour + "|" + Date.now()));
  const cle = x => (S.dodoVus[x.i] || 0) - Math.pow(rnd(), 1 / ((x.q || 2) * (x.dodo_prio ? 1.3 : 1))) * 864e5;
  const tri = varier(pool.sort((a, b) => cle(a) - cle(b)));
  const file = []; let t = 0;
  for (const x of tri) { file.push({ x }); t += duree(x); if (t >= DODO_FILE_S) break; }
  cour = { src: "dodo", file, k: -1, x: null, souple: true };
  reglerDodo(minutes * 60000);
  if (S.dodoNoir) ecranNoir(true);
  aller(0, 1, true);
  toast(`🌙 Programme dodo : ${file.length} documentaires (${fmtDuree(t)}), arrêt vers ${hhmm(paris(dodo.fin).s)}.`);
}
function ecranNoir(on) { $("#nuit").hidden = !on; if (on) majNuit(); }
function majNuit() { if (!$("#nuit").hidden) $("#nuitHeure").textContent = hhmm(paris().s) + (dodo.fin ? ` · arrêt vers ${hhmm(paris(dodo.fin).s)}` : ""); }
function majDodo() {
  const on = !!(dodo.fin || dodo.finVideo); $("#bDodo").setAttribute("aria-pressed", on);
  $("#txtDodo").textContent = dodo.fin ? `Dodo ${fmtMin((dodo.fin - maintenant()) / 60000)}` : dodo.finVideo ? "Dodo : fin" : "Dodo";
}
function prolonger(min) {
  if (!dodo.fin) return;
  restaurerVolume();
  dodo.fin = Math.max(dodo.fin, maintenant()) + min * 60000; dodo.alerte = false;
  $("#alerteDodo").hidden = true; majDodo(); majNuit();
  toast(`🌙 Prolongé : arrêt vers ${hhmm(paris(dodo.fin).s)}.`);
}
function restaurerVolume() { if (dodo.volume != null) { try { L?.setVolume?.(dodo.volume); } catch { } dodo.volume = null; } }
function verifDodo() {
  if (!dodo.fin) return;
  const reste = (dodo.fin - maintenant()) / 1000;
  if (reste <= 0) return finDodo();
  if (reste <= ALERTE_S && !dodo.alerte) {
    dodo.alerte = true; $("#alerteDodo").hidden = false;
    $("#alerteTxt").textContent = `🌙 Arrêt dans ${Math.ceil(reste / 60)} min`;
  } else if (dodo.alerte) $("#alerteTxt").textContent = `🌙 Arrêt dans ${Math.ceil(reste / 60)} min`;
  if (reste <= FONDU_S && S.dodoFondu !== false && L?.setVolume) {   // le son baisse doucement
    try { if (dodo.volume == null) dodo.volume = L.getVolume?.() ?? 100; L.setVolume(Math.round(dodo.volume * Math.max(.05, reste / FONDU_S))); } catch { }
  }
  majDodo(); majNuit();
}
function finDodo() {
  try { L?.pauseVideo?.(); } catch { }
  setTimeout(restaurerVolume, 800);   // le volume revient à la normale pour la prochaine fois, une fois en pause
  dodo.fin = 0; dodo.finVideo = false; dodo.alerte = false;
  $("#alerteDodo").hidden = true; majDodo(); majNuit();
  toast("🌙 Bonne nuit. Touche Lecture pour reprendre.");
}

function feuilleGrille() {
  if (cour.src !== "tele") return toast("La grille n'existe qu'en mode Télé, sur un canal.");
  const f = cour.file;
  feuille(`<h2>${esc(CANAL[cour.canal].nom)} · ${esc(joliJour(cour.jour))}</h2><p>${f.length} programmes, de minuit à minuit (heure de Paris). Toucher un programme pour y aller.</p>
    <ol class="grille-liste">${f.map((e, j) => e.x ? `<li class="${j === cour.k ? "en-cours" : ""}"><button type="button" data-j="${j}"><span class="h">${hhmm(e.deb)}</span><span>${e.r ? "<span class='marque discret'>rediff</span>" : ""}${S.vus[e.x.i] ? "<span class='marque discret'>vu</span>" : ""}${esc(titreDe(e.x))}<small>${esc(e.x.c || "")} · ${esc(CATS[e.x.o] || "")}</small></span></button></li>` : "").join("")}</ol>`,
    el => {
      el.querySelector(".en-cours")?.scrollIntoView({ block: "center" });
      el.onclick = e => { const b = e.target.closest("[data-j]"); if (b) { fermer(); aller(+b.dataset.j, 1, true); } };
    });
}
function feuilleReglages() {
  const masq = S.masquees.map(sid => `<li><span>${esc(S.noms[sid] || sid)}</span><button type="button" class="petit" data-demasquer="${esc(sid)}">Réafficher</button></li>`).join("");
  const bloq = Object.keys(S.bloquees).map(id => { const x = CAT.get(id); return `<li><span>${esc(x ? court(titreDe(x), 70) : id)}</span><a class="petit" href="${ytUrl(id)}" target="_blank" rel="noopener">YouTube</a></li>`; }).join("");
  const gch = Object.entries(S.gouts.ch).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const goutsTxt = gch.length ? gch.slice(0, 6).map(([sid, v]) => `${esc(S.noms[sid] || sid)} (${v > 0 ? "+" : ""}${v})`).join(", ") + (gch.length > 6 ? "…" : "") : "aucun vote pour l'instant";
  feuille(`<h2>Réglages</h2>
    <h3>Affichage</h3><div class="choix">${[["sombre", "Sombre"], ["clair", "Clair"], ["auto", "Comme l'appareil"]].map(([k, n]) => `<button type="button" data-theme="${k}" aria-pressed="${S.theme === k}">${n}</button>`).join("")}</div>
    <h3>Lecture</h3><div class="choix">
      <button type="button" data-opt="cc" aria-pressed="${S.cc}">Sous-titres au démarrage</button>
      <button type="button" data-opt="courtsTele" aria-pressed="${S.courtsTele}">Formats courts dans la télé</button>
      <button type="button" data-opt="cacherVues" aria-pressed="${S.cacherVues}">Cacher les vues (À la carte)</button></div>
    <h3>Ta semaine</h3>${bilanSemaine()}
    <h3>Retours vers la Vigie</h3><p>Tes votes, chaînes masquées et catégories corrigées peuvent partir vers le dépôt privé de la Vigie : la routine du dimanche soir en tient compte (poids des chaînes, classement). Dernier envoi : ${S.envoi ? esc(joliMoment(S.envoi)) : "jamais"}${S.modif > S.envoi ? " — des changements attendent" : ""}.</p>
    <div class="choix"><button type="button" data-act="envoyer">Envoyer mes retours (GitHub)</button><button type="button" data-act="copier">Copier les retours</button></div>
    <h3>Tes goûts</h3><p>Chaînes votées : ${goutsTxt}. ${Object.keys(S.vus).length} vidéos vues, ${S.plusTard.length} mises de côté, ${Object.keys(S.corr).length} catégorie(s) corrigée(s).</p>
    <div class="masquees"><p><b>Chaînes masquées</b>${masq ? "" : " : aucune."}</p><ul>${masq}</ul></div>
    <div class="bloquees"><p><b>Vidéos non intégrables</b> (sautées pendant 7 jours)${bloq ? "" : " : aucune."}</p><ul>${bloq}</ul></div>
    <h3>Sauvegarde</h3><p>Tout est gardé dans ce navigateur. Exporte de temps en temps : un nettoyage des données de Brave effacerait tout.</p>
    <div class="choix"><button type="button" data-act="export">Exporter (JSON)</button><label>Importer…<input type="file" accept="application/json,.json" id="fImport" hidden></label>
      <button type="button" data-act="hist">Oublier l'historique</button><button type="button" data-act="tout">Tout effacer</button></div>
    <h3>Raccourcis</h3><p><kbd>Échap</kbd> quitter le plein écran · <kbd>Espace</kbd> lecture/pause · <kbd>→</kbd> <kbd>←</kbd> suivante/précédente · <kbd>↑</kbd> <kbd>↓</kbd> ou <kbd>1</kbd>…<kbd>5</kbd> canaux · <kbd>+</kbd> j'aime · <kbd>-</kbd> bof · <kbd>T</kbd> télé / à la carte · <kbd>S</kbd> sous-titres · <kbd>F</kbd> plein écran. Sur la tablette : glisser à gauche/droite sur le bandeau sous l'image pour zapper.</p>
    <h3>À propos</h3><p>YO1tv ${VERSION} · catalogue ${DERNIER ? "du " + esc(joliJour(DERNIER)) : "absent"}${SECOURS ? " (exemple)" : ""}${JOURS.length > 1 ? ` + ${JOURS.length - 1} jour(s) précédent(s) pour le report` : ""} · ${CAT.size} vidéos · <a href="test.html">page de test du lecteur</a></p>`,
    el => {
      el.onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.theme) { S.theme = b.dataset.theme; theme(); sauver(); el.querySelectorAll("[data-theme]").forEach(x => x.setAttribute("aria-pressed", x === b)); }
        if (b.dataset.opt) {
          const k = b.dataset.opt; S[k] = !S[k]; sauver(); b.setAttribute("aria-pressed", S[k]);
          if (k === "cc") { appliquerCC(); afficher(); } if (k === "courtsTele") refaireTout(); if (k === "cacherVues") rendreListe();
        }
        if (b.dataset.demasquer) { S.masquees = S.masquees.filter(s => s !== b.dataset.demasquer); sauver(); b.closest("li").remove(); rendreListe(); }
        if (b.dataset.act === "export") exporter();
        if (b.dataset.act === "envoyer") envoyerRetours();
        if (b.dataset.act === "copier") navigator.clipboard?.writeText(JSON.stringify(retours(), null, 1)).then(() => toast("Retours copiés."), () => toast("Copie impossible."));
        if (b.dataset.act === "hist" && confirm("Oublier les vidéos vues et les reprises ? (les votes restent)")) { S.vus = {}; S.hist = []; S.prog = {}; sauver(true); location.reload(); }
        if (b.dataset.act === "tout" && confirm("Effacer tous tes goûts, votes, historique et réglages de YO1tv dans ce navigateur ?")) { localStorage.removeItem(CLE); S = defaut(); location.reload(); }
      };
      el.querySelector("#fImport").onchange = async ev => {
        try { const o = JSON.parse(await ev.target.files[0].text()); if (!o || typeof o !== "object" || !o.gouts) throw new Error("fichier non reconnu"); S = Object.assign(defaut(), o, { grilles: {}, pos: {} }); sauver(true); location.reload(); }
        catch (e) { toast("Import impossible : " + e.message); }
      };
    });
}
function exporter() {
  const { grilles, pos, ...o } = S;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...o, exporte: new Date().toISOString(), version: VERSION }, null, 1)], { type: "application/json" }));
  a.download = `yo1tv-gouts-${paris().jour}.json`; document.body.append(a); a.click(); a.remove();
}
function theme() {
  document.documentElement.dataset.theme = S.theme;
  const clair = S.theme === "clair" || S.theme === "auto" && matchMedia("(prefers-color-scheme: light)").matches;
  document.querySelector('meta[name="theme-color"]').content = clair ? "#FBF8F2" : "#0f1115";
}

/* ---------- Catégories corrigées ---------- */
// Une correction vaut tout de suite pour la vidéo ; après 3 corrections dans le même sens pour une chaîne (et au moins 75 %
// de ses corrections), les autres vidéos de cette chaîne rangées dans la même catégorie suivent.
function appliquerCorrections() {
  const parCh = {};
  for (const c of Object.values(S.corr)) { const k = c.sid; (parCh[k] ||= {}); const p = c.de + ">" + c.vers; parCh[k][p] = (parCh[k][p] || 0) + 1; }
  const regle = {};
  for (const [sid, m] of Object.entries(parCh)) {
    const tot = Object.values(m).reduce((a, b) => a + b, 0), [p, n] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (n >= 3 && n / tot >= .75) { const [de, vers] = p.split(">"); regle[sid] = { de, vers }; }
  }
  for (const x of CAT.values()) {
    const o0 = x._o0 || x.o, c = S.corr[x.i], r = regle[x.sid];
    const o = c ? c.vers : r && o0 === r.de ? r.vers : o0;
    if (o !== o0) { x._o0 = o0; x.o = o; } else if (x._o0) { x.o = x._o0; delete x._o0; }
  }
}
function feuilleCat() {
  const x = cour.x; if (!x || cour.src === "direct") return;
  feuille(`<h2>Mal classée ?</h2><p>« ${esc(court(titreDe(x), 80))} »${x.c ? ` (${esc(x.c)})` : ""} est rangée en <b>${esc(CATS[x.o])}</b>${x._o0 ? ` (classement d'origine : ${esc(CATS[x._o0])})` : ""}. Quelle catégorie serait juste ?</p>
    <div class="choix">${Object.entries(CATS).map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${k === x.o}">${esc(n)}</button>`).join("")}</div>
    <p>YO1tv s'en souvient tout de suite pour cette vidéo ; après trois corrections dans le même sens pour une chaîne, ses autres vidéos suivent. Les corrections partent vers la Vigie avec « Envoyer mes retours » (Réglages).</p>`,
    el => el.onclick = e => { const b = e.target.closest("[data-cat]"); if (b) { corriger(x, b.dataset.cat); fermer(); } });
}
function corriger(x, vers) {
  const de = x._o0 || x.o;
  if (vers === de) delete S.corr[x.i];
  else S.corr[x.i] = { de, vers, sid: x.sid || "", c: x.c || "", t: String(x.t || "").slice(0, 90), le: paris().jour };
  S.modif = Date.now(); sauver(); appliquerCorrections(); afficher();
  toast(vers === de ? "Classement d'origine rétabli." : `Noté : ${CATS[vers]} plutôt que ${CATS[de]}.`);
}

/* ---------- Retours vers la Vigie (lot 4 sans jeton) ---------- */
// Pas de jeton stocké : on ouvre la page GitHub de création de fichier du dépôt privé, pré-remplie ; il suffit de valider.
const DEPOT_VIGIE = "akouatik-yo/Actualit-s-";
function retours() {
  const t = Date.now(), vus = {};
  for (const h of S.hist) if (t - h.vu < 30 * 864e5) vus[h.o] = (vus[h.o] || 0) + 1;
  return {
    yo1tv: VERSION, date: paris().jour, genere: new Date().toISOString(),
    votes: Object.fromEntries(Object.entries(S.gouts.ch).filter(([, v]) => v)), categories_gout: S.gouts.cat,
    noms: S.noms, masquees: S.masquees,
    corrections: Object.entries(S.corr).map(([i, c]) => ({ i, ...c })),
    vus_30_jours: vus, pepites_vues_30_jours: S.hist.filter(h => h.pep && t - h.vu < 30 * 864e5).length
  };
}
function envoyerRetours() {
  const p = paris(), nom = `retours/yo1tv-${p.jour}-${hhmm(p.s).replace(":", "h")}.json`;
  const url = `https://github.com/${DEPOT_VIGIE}/new/main?filename=${encodeURIComponent(nom)}&value=${encodeURIComponent(JSON.stringify(retours(), null, 1))}`;
  open(url, "_blank", "noopener");
  S.envoi = Date.now(); sauver();
  toast("Page GitHub ouverte : vérifie puis « Commit changes ».");
}
function bilanSemaine() {
  const t = Date.now(), h = S.hist.filter(x => t - x.vu < 7 * 864e5);
  if (!h.length) return "<p>Pas encore de vidéo vue cette semaine.</p>";
  const parCat = {}, parCh = {}; let s = 0;
  for (const x of h) { parCat[x.o] = (parCat[x.o] || 0) + 1; parCh[x.c] = (parCh[x.c] || 0) + 1; s += duree(x); }
  const top = Object.entries(parCh).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${esc(c)} (${n})`).join(", ");
  return `<p>${h.length} vidéos vues, environ ${fmtDuree(s)}. ${Object.entries(parCat).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${esc(CATS[o] || o)} ${Math.round(100 * n / h.length)} %`).join(" · ")}. Chaînes les plus vues : ${top}. Pépites : ${h.filter(x => x.pep).length}.</p>`;
}

/* ---------- Commandes ---------- */
function pause() { if (enDirect) return; try { etatL === 1 ? L.pauseVideo() : L.playVideo(); } catch { } }
function basculerCC() { S.cc = !S.cc; sauver(); appliquerCC(); $("#bCC").setAttribute("aria-pressed", S.cc); toast(S.cc ? "Sous-titres activés." : "Sous-titres coupés."); }
/* Plein écran « immersif » : toute la page passe en plein écran, mais n'affiche que la vidéo et une barre de commandes
   YO1tv (suivante, j'aime, bof, plus tard, catégorie…). Si le navigateur refuse le vrai plein écran (ou dans le raccourci
   déjà en plein écran), la même mise en page sert de « faux plein écran ». La barre se replie en une petite poignée. */
let fsParNous = false;
function pleinEcran() { immersif(!document.body.classList.contains("immersif")); }
function immersif(on) {
  document.body.classList.toggle("immersif", on); document.body.classList.remove("reduit");
  const d = document.documentElement;
  if (on && !document.fullscreenElement) {
    const p = (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d, { navigationUI: "hide" });
    fsParNous = false; p?.then?.(() => { fsParNous = true; }).catch?.(() => { });
  } else if (!on && document.fullscreenElement && fsParNous) document.exitFullscreen?.().catch?.(() => { });
  $("#bPlein").setAttribute("aria-pressed", on); majIm();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && fsParNous && document.body.classList.contains("immersif")) { fsParNous = false; immersif(false); } });
function majIm() {
  const x = cour.x, dir = cour.src === "direct";
  $("#imCanal").textContent = dir ? "YO1 Direct" : cour.src === "dodo" ? "🌙 Dodo" + (dodo.fin ? " · " + hhmm(paris(dodo.fin).s) : "") : cour.src === "tele" ? CANAL[cour.canal]?.nom || "" : "À la carte";
  $("#imTitre").textContent = dir ? cour.file[cour.k]?.nom || "" : x ? titreDe(x) + (x.c ? " · " + x.c : "") : "";
}
$("#bPrec").onclick = () => suivant(-1);
$("#bSuiv").onclick = () => suivant(1);
$("#bPause").onclick = pause;
$("#bAime").onclick = () => voter(1);
$("#bBof").onclick = () => voter(-1);
$("#bTard").onclick = feuilleTard;
$("#bHumeur").onclick = feuilleHumeur;
$("#bDodo").onclick = feuilleDodo;
$("#bCC").onclick = basculerCC;
$("#bPlein").onclick = pleinEcran;
$("#bCat").onclick = feuilleCat;
$("#barreIm").onclick = e => {
  const b = e.target.closest("[data-cmd]"); if (!b || b.disabled) return;
  ({ prec: () => suivant(-1), pause, suiv: () => suivant(1), aime: () => voter(1), bof: () => voter(-1), tard: feuilleTard, cat: feuilleCat, dodo: feuilleDodo,
    canal: () => cour.src === "carte" ? suivant(1) : zapper(1), reduire: () => document.body.classList.add("reduit"), sortir: () => immersif(false) })[b.dataset.cmd]?.();
};
$("#alerteDodo").onclick = e => { const b = e.target.closest("[data-plus]"); if (!b) return; +b.dataset.plus ? prolonger(+b.dataset.plus) : finDodo(); };
$("#nuit").onclick = () => ecranNoir(false);
$("#imOuvrir").onclick = () => document.body.classList.remove("reduit");
$("#bReglages").onclick = feuilleReglages;
$("#bGrille").onclick = feuilleGrille;
$("#allumer").onclick = () => { $("#allumer").hidden = true; try { L.playVideo(); } catch { } };
$("#mTele").onclick = () => { vue("tele"); if (cour.src !== "tele" && cour.src !== "direct") demarrerTele(S.canal); };
$("#mCarte").onclick = () => vue("carte");
$("#chaine").onclick = () => { const x = cour.x; if (!x?.sid) return; S.noms[x.sid] = x.c; F.chaine = x.sid; F.vue = "liste"; F.cat = "tout"; F.n = 120; vue("carte"); scrollTo({ top: 0 }); };
$("#canaux").onclick = e => { const b = e.target.closest("[data-canal]"); if (b) { vue("tele"); demarrerTele(b.dataset.canal); } };
$("#ensuite").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.direct) return demarrerDirect(+b.dataset.direct);
  if (b.dataset.j) aller(+b.dataset.j, 1, true);
};
$("#vueCarte").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.vue) { F.vue = b.dataset.vue; F.n = 120; }
  else if (b.dataset.cat) { F.cat = b.dataset.cat; F.n = 120; }
  else if (b.dataset.format) { S.format = b.dataset.format; sauver(); }
  else if (b.dataset.vues) { S.cacherVues = !S.cacherVues; sauver(); }
  else if (b.dataset.chaine !== undefined && b.closest("#pucesVue")) { F.chaine = null; }
  else if (b.dataset.k) return jouerListe(LISTE.map(e => e.x), +b.dataset.k, F.vue !== "liste");
  else if (b.id === "bPlus") { F.n += 120; }
  else return;
  rendreCarte();
};
let tRech = 0;
$("#recherche").oninput = e => { clearTimeout(tRech); tRech = setTimeout(() => { F.q = e.target.value; F.n = 120; rendreCarte(); }, 200); };
$("#dlg").addEventListener("click", e => { if (e.target === $("#dlg")) fermer(); });   // toucher le fond ferme la feuille

// Glisser sur le bandeau (pas sur le lecteur, pour ne pas gêner ses propres gestes) : zapper.
{ let x0 = 0, y0 = 0, t0 = 0;
  const b = $("#infos");
  b.addEventListener("touchstart", e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });
  b.addEventListener("touchend", e => {
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dy) > 50 || e.target.closest(".canaux")) return;
    const dir = dx < 0 ? 1 : -1;
    cour.src === "carte" ? suivant(dir) : zapper(dir);
  }, { passive: true });
}
addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey || $("#dlg").open) return;
  if (e.key === "Escape" && document.body.classList.contains("immersif")) { immersif(false); return; }
  const k = e.key, actions = {
    " ": pause, ArrowRight: () => suivant(1), ArrowLeft: () => suivant(-1), ArrowUp: () => zapper(-1), ArrowDown: () => zapper(1),
    "+": () => voter(1), "-": () => voter(-1), t: () => $(S.mode === "tele" ? "#mCarte" : "#mTele").click(), s: basculerCC, f: pleinEcran
  };
  if (/^[1-5]$/.test(k)) { vue("tele"); demarrerTele(CANAUX[+k - 1].id); e.preventDefault(); return; }
  const f = actions[k] || actions[k.toLowerCase()]; if (f) { f(); e.preventDefault(); }
});

/* ---------- Démarrage ---------- */
window.onYouTubeIframeAPIReady = () => { API = true; if (demande) charger(demande); };
async function hashPlaylist() {
  const p = new URLSearchParams(location.hash.slice(1));
  const ids = [...new Set((p.get("v") || "").split(",").filter(x => /^[\w-]{11}$/.test(x)))].slice(0, 200);
  const live = p.get("live"), canal = p.get("canal");
  if (canal && CANAL[canal]) S.canal = canal;
  if (live && /^UC[\w-]{22}$/.test(live)) {
    let k = DIRECTS.findIndex(d => d.yt_chaine === live);
    if (k < 0) { DIRECTS.unshift({ nom: "Direct", yt_chaine: live }); k = 0; }
    vue("tele"); demarrerDirect(k); return true;
  }
  if (!ids.length) return false;
  PLAYLIST = ids.map(id => CAT.get(id) || { i: id, t: "Vidéo " + id, c: "", o: "", sid: "" });
  PLAYLIST.titre = p.get("t") || "";
  F.vue = "playlist"; vue("carte"); jouerListe(PLAYLIST, 0, true);
  // Titres des vidéos absentes du catalogue (oEmbed officiel), sans bloquer la lecture.
  for (const x of PLAYLIST.filter(x => !x.c).slice(0, 60)) {
    try {
      const j = await lireJson("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(ytUrl(x.i)));
      x.t = j.title; x.c = j.author_name; if (cour.x === x) afficher(); else if (S.mode === "carte") rendreCarte();
    } catch { }
  }
  return true;
}
(async () => {
  theme(); majHorloge(); majHumeur(); majCanaux();
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => annonce("Le lecteur YouTube n'a pas pu être chargé (connexion ou bloqueur).");
  document.head.append(s);
  await chargerCatalogues();
  if (!CAT.size) { annonce("Aucun catalogue disponible dans data/."); $("#titre").textContent = "Pas de catalogue"; return; }
  const auj = paris().jour, ban = $("#banniere");
  if (SECOURS) { ban.hidden = false; ban.textContent = "Catalogue d'exemple (data/index.json absent ou vide)."; }
  else if (DERNIER !== auj) { ban.hidden = false; ban.textContent = `Pas encore de catalogue aujourd'hui : programmes faits avec celui du ${joliJour(DERNIER)}.`; }
  vue(S.mode === "carte" ? "carte" : "tele");
  if (!(await hashPlaylist())) demarrerTele(S.canal);
  // Le dimanche avant la routine de 20 h : rappel d'envoyer les retours s'il y a du nouveau.
  if (new Date(auj + "T12:00:00Z").getUTCDay() === 0 && paris().s < 19 * 3600 + 45 * 60 && S.modif > S.envoi)
    setTimeout(() => toast("Des retours attendent : la routine du dimanche soir peut en tenir compte.", { action: "Envoyer", fn: envoyerRetours }), 6000);
})();
