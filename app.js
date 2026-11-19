/* YO1tv v2 — télé personnelle : des playlists de la semaine par canal, reprises là où on les a laissées.
   Lecteur YouTube officiel (API IFrame). Tous les goûts restent dans ce navigateur (localStorage).
   Données : data/semaine.json, préparé chaque dimanche soir (outils/yo1tv.py programmer) :
   {"semaine", "genere", "heures", "canaux": {cat: [id, …]}, "dodo": [id, …], "items": {id: {t, c, sid, o, du, q, pep, …}}}.
   Choix de conception documentés dans CAHIER-DES-CHARGES.md. */
"use strict";
const VERSION = "2.0";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ytUrl = id => "https://www.youtube.com/watch?v=" + id;
const vignette = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const enSec = d => String(d || "").split(":").reduce((s, x) => s * 60 + (+x || 0), 0);
const DUREE_COURT = 40, DUREE_INCONNUE = 600, JOUR_S = 86400;
const duree = x => enSec(x.du) || DUREE_INCONNUE;
const deux = n => String(n).padStart(2, "0");
const hhmm = s => { s = Math.floor(s) % JOUR_S; return deux(s / 3600 | 0) + ":" + deux((s % 3600) / 60 | 0); };
const fmtDuree = s => s >= 3600 ? `${s / 3600 | 0} h ${deux((s % 3600) / 60 | 0)}` : `${Math.max(1, Math.round(s / 60))} min`;
const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const titreDe = x => x.tf || x.t || "Vidéo " + x.i;

const CATS = { humour: "Humour", culture: "Culture", savoir: "Savoir", decouverte: "Découverte", divertissement: "Divertissement", info: "Info" };
const ANCIENNES = { analyse: "info", actu: "info" };   // catégories d'avant la v2 (corrections enregistrées)
// Un canal = une catégorie = une playlist de la semaine (40 h au moins ; Info : les analyses et entretiens de la semaine).
const CANAUX = [
  { id: "rire", nom: "Rire", cat: "humour" },
  { id: "culture", nom: "Culture", cat: "culture" },
  { id: "savoir", nom: "Savoir", cat: "savoir" },
  { id: "decouverte", nom: "Découverte", cat: "decouverte" },
  { id: "divertissement", nom: "Divertissement", cat: "divertissement" },
  { id: "info", nom: "Info", cat: "info" },
  { id: "direct", nom: "Direct", direct: true }
];
const CANAL = Object.fromEntries(CANAUX.map(c => [c.id, c]));
const nomCanal = c => "YO1 " + (CANAL[c]?.nom || "");
const VUS_J = 90;   // vu ou « déjà vu » : écarté 3 mois (la routine du dimanche fait de même avec les retours)

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
  humeur: 50, cc: false, theme: "sombre", canal: "rire", mode: "tele", cacherVues: true,
  direct: 0, pl: {}, corr: {}, prio: {}, suppr: [], chv: {}, contenus: {}, dejaVu: {}, modif: 0, envoi: 0, dodoVus: {}, dodoNon: {}, dodoDuree: 180, dodoNoir: false, dodoFondu: true
});
function lireStock() {
  let s; try { s = Object.assign(defaut(), JSON.parse(localStorage.getItem(CLE)) || {}); } catch { s = defaut(); }
  const t = Date.now(), j = paris().jour;
  for (const [id, ts] of Object.entries(s.vus)) if (t - ts > VUS_J * 864e5) delete s.vus[id];
  for (const [id, ts] of Object.entries(s.bloquees)) if (t - ts > 7 * 864e5) delete s.bloquees[id];
  for (const [id, ts] of Object.entries(s.dejaVu || {})) if (t - ts > VUS_J * 864e5) delete s.dejaVu[id];
  const cs = Object.keys(s.contenus || {}); cs.slice(0, Math.max(0, cs.length - 400)).forEach(k => delete s.contenus[k]);
  delete s.grilles; delete s.pos; delete s.courtsTele; delete s.format;   // grilles de 24 h de la v1
  if (!CANAL[s.canal]) s.canal = "rire";
  for (const c of Object.values(s.corr || {})) { c.de = ANCIENNES[c.de] || c.de; c.vers = ANCIENNES[c.vers] || c.vers; }
  for (const [sid, v] of Object.entries(s.chv || {})) s.chv[sid] = clamp(Math.round(v) || 0, -3, 3);
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
const mini = x => ({ i: x.i, t: x.t, c: x.c, sid: x.sid, o: x.o, du: x.du, d: x.d, pep: x.pep, q: x.q, th: x.th, sp: x.sp, art: x.art });

/* ---------- Catalogues ---------- */
let CAT = new Map(), SEM = null, PL = {}, DODO = [], DIRECTS = [], NB_PEPITES = 0;
async function lireJson(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(url + " : " + r.status); return r.json(); }
async function chargerSemaine() {
  try {
    const d = await lireJson("data/semaine.json", { cache: "no-cache" });
    SEM = { semaine: d.semaine, genere: d.genere, heures: d.heures || {} };
    for (const [i, x] of Object.entries(d.items || {})) if (/^[\w-]{11}$/.test(i) && CATS[x.o]) { x.i = i; CAT.set(i, x); if (x.pep) NB_PEPITES++; }
    for (const [o, ids] of Object.entries(d.canaux || {})) PL[o] = ids.filter(i => CAT.has(i));
    DODO = (d.dodo || []).filter(i => CAT.has(i));
  } catch (e) { console.warn(e); }
  appliquerCorrections();
  try { DIRECTS = (await lireJson("data/directs.json")).filter(d => /^UC[\w-]{22}$/.test(d.yt_chaine || "")).sort((a, b) => (b.poids || 1) - (a.poids || 1)); } catch { DIRECTS = []; }
}

/* ---------- Goûts, humeur, poids ---------- */
// Goût pour une chaîne : votes « chaîne » cumulés (−3 … +3, 3 points chacun) plus les votes « contenu » de la chaîne ; goût par catégorie.
const fGout = x => clamp(1.25 ** ((S.gouts.ch[x.sid] || 0) + 3 * (S.chv[x.sid] || 0)), .25, 4) * clamp(1.15 ** (S.gouts.cat[x.o] || 0), .5, 2)
  * (S.votes[x.i] === 1 ? 1.3 : 1);
function fHumeur(x) {
  const h = (S.humeur - 50) / 50, d = duree(x); let f = 1;   // h : −1 = « à plat », +1 = « curieux »
  if (x.o === "humour") f *= 1 - .45 * h;
  if (x.o === "divertissement") f *= 1 - .25 * h;
  if (x.o === "decouverte" || x.o === "culture") f *= 1 + .6 * h;
  if (x.o === "info") f *= 1 - .3 * Math.abs(h);            // l'actu dosée : un peu moins aux extrêmes
  if (d >= 1500) f *= 1 + .5 * h; else if (d < 600) f *= 1 - .2 * h;
  return Math.max(f, .05);
}
const Q_POIDS = { 1: 1, 2: 1.8, 3: 3 };
function poids(x) {
  let w = (Q_POIDS[x.q] || 1.8) * (x.pep ? 1.5 : 1) * fGout(x) * fHumeur(x) * (x.n ? 1.2 : 1);
  if (S.prio[x.sid]) w *= S.prio[x.sid];   // priorité choisie avec le bouton Source
  if (x.o === "info" && x.d) w /= 1 + Math.max(0, (Date.now() - Date.parse(x.d)) / 864e5) / 4;
  return w;
}
const masquee = x => S.masquees.includes(x.sid);
// Spectacles entiers : marque « sp » du stock, ou long format d'humour annoncé comme tel. Ils restent aussi dans l'humour.
const retiree = x => S.suppr.includes(x.sid) || (S.chv[x.sid] || 0) <= -3;   // chaîne retirée (bouton ou trois « Bof chaîne »)
const estSpectacle = x => !!x.sp || x.o === "humour" && duree(x) >= 2400 && /spectacle|one.?(wo)?man.?show/i.test(x.t || "");
const vuRecemment = x => S.vus[x.i] && Date.now() - S.vus[x.i] < 3 * 864e5;
const jouable = (x, souple) => !!x && !S.bloquees[x.i] && !S.dejaVu[x.i] && S.votes[x.i] !== -1 && !masquee(x) && !retiree(x) && (!S.vus[x.i] || souple && !vuRecemment(x));

/* ---------- Playlists de la semaine (télé) ---------- */
// Chaque canal joue la playlist de la semaine de sa catégorie. On reprend, sur cet appareil, à la vidéo qui suit la dernière
// vue (ou au milieu de celle qu'on avait commencée). Une nouvelle semaine repart du début de la nouvelle playlist, sans ce qui a été vu.
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const fileCanal = canal => (PL[CANAL[canal]?.cat] || []).map(i => ({ x: CAT.get(i) }));
function reprise(canal, file) {
  const p = S.pl[canal]; if (!p || p.s !== SEM?.semaine) return 0;
  const k = file.findIndex(e => e.x.i === p.i);
  if (k < 0) return Math.min(p.k || 0, Math.max(file.length - 1, 0));
  return S.vus[p.i] || S.dejaVu[p.i] ? k + 1 : k;
}
const resteDe = (file, k) => { let n = 0, t = 0; for (let j = Math.max(k, 0); j < file.length; j++) if (jouable(file[j].x)) { n++; t += duree(file[j].x); } return { n, t }; };

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
    playerVars: { playsinline: 1, rel: 0, autoplay: 1, start: dem.debut || 0, cc_load_policy: S.cc ? 1 : 0, iv_load_policy: 3, fs: 1, hl: "fr", origin: location.origin },
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
  const suiviCh = `regarde/${cour.src === "tele" ? cour.canal : cour.src}/${x.sid || "?"}`;   // mesure d'audience : chaîne regardée 30 s au moins
  setTimeout(() => { if (cour.x === x) window.suivi?.(suiviCh, x.c || x.sid); }, 30000);
}
function aller(k, dir = 1, souple = false) {
  const f = cour.file;
  while (k >= 0 && k < f.length && !jouable(f[k].x, souple || cour.souple)) k += dir;
  if (k < 0 || k >= f.length) {
    if (dir < 0) return toast("Pas de vidéo avant celle-ci.");
    if (cour.src === "dodo") { finDodo(); return; }
    if (cour.src === "carte") { toast("Fin de la liste. Retour à la télé."); return demarrerTele(S.canal); }
    annonce("Fin de la playlist de la semaine sur ce canal. Zappe sur un autre canal, ou va voir À la carte !"); return;
  }
  cour.k = k;
  if (cour.src === "tele") { S.pl[cour.canal] = { s: SEM?.semaine, i: f[k].x.i, k }; sauver(); }
  jouer(f[k].x);
}
function suivant(dir = 1) {
  if (cour.src === "direct") return zapDirect(dir);
  if (!cour.src) return demarrerTele(S.canal);
  aller(cour.k + dir, dir, dir < 0);
}
function demarrerTele(canal = S.canal) {
  if (!CANAL[canal]) canal = "rire";
  S.canal = canal; sauver(); majCanaux();
  if (CANAL[canal].direct) return demarrerDirect(S.direct);
  const file = fileCanal(canal);
  cour = { src: "tele", canal, file, k: -1, x: null };
  if (!file.length) { afficher(); annonce(SEM ? "Rien sur ce canal cette semaine." : "Pas de programme : data/semaine.json est absent."); return; }
  aller(Math.min(reprise(canal, file), file.length), 1);
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
  $("#canaux [aria-selected=true]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
function majPause() {
  const lecture = etatL === 1 || etatL === 3;
  $("#icoPause").setAttribute("href", lecture ? "#i-pause" : "#i-lecture"); $("#txtPause").textContent = lecture ? "Pause" : "Lecture";
  $("#icoImPause").setAttribute("href", lecture ? "#i-pause" : "#i-lecture");
}
function majVotes() {
  const v = cour.x ? S.votes[cour.x.i] || 0 : 0, c = cour.x?.sid ? S.chv[cour.x.sid] || 0 : 0;
  for (const s of ["#bAime", "#imAime"]) $(s).setAttribute("aria-pressed", v === 1);
  for (const s of ["#bBof", "#imBof"]) $(s).setAttribute("aria-pressed", v === -1);
  for (const s of ["#bAimeCh", "#imAimeCh"]) $(s).setAttribute("aria-pressed", c > 0);
  for (const s of ["#bBofCh", "#imBofCh"]) $(s).setAttribute("aria-pressed", c < 0);
  // votes « chaîne » cumulés : le compteur s'affiche sur le bouton (« chaîne +2 », « ch. −1 »)
  const n = k => k ? (k > 0 ? "+" : "−") + Math.abs(k) : "";
  $("#bAimeCh small").textContent = "chaîne" + (c > 0 ? " " + n(c) : ""); $("#bBofCh small").textContent = "chaîne" + (c < 0 ? " " + n(c) : "");
  $("#imAimeCh i").textContent = "ch." + (c > 0 ? n(c) : ""); $("#imBofCh i").textContent = "ch." + (c < 0 ? n(c) : "");
}
function metaDe(x, e) {
  const bits = [CATS[x.o] || ""];
  if (x.th) bits.push(x.th);
  if (estSpectacle(x) && !/spectacle/i.test(x.th || "")) bits.push("spectacle");
  bits.push(x.du ? fmtDuree(enSec(x.du)) : "durée inconnue");
  if (x.d) {   // date de mise en ligne (la routine la déduit de l'âge affiché par YouTube : au jour près)
    const j = Math.round((Date.parse(paris().jour) - Date.parse(x.d)) / 864e5);
    if (j >= 0) bits.push(j === 0 ? "aujourd'hui" : j === 1 ? "hier" : j < 60 ? `il y a ${j} j` : j < 730 ? `il y a ${Math.round(j / 30)} mois` : `il y a ${Math.round(j / 365)} ans`);
  }
  return bits.filter(Boolean).join(" · ");
}
function afficher() {
  const dir = cour.src === "direct";
  for (const id of ["#bAime", "#bBof", "#bAimeCh", "#bBofCh", "#bRetirer", "#bVu", "#bTard", "#bCC", "#bCat", "#bSource", "#imAime", "#imBof", "#imAimeCh", "#imBofCh", "#imRetirer", "#imVu", "#imTard", "#imCat", "#imSource"]) $(id).disabled = dir;
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
  const reste = cour.src === "tele" ? resteDe(cour.file, cour.k) : null;
  $("#surtitre").textContent = cour.src === "dodo" ? `🌙 Programme dodo · ${cour.k + 1}/${cour.file.length}${dodo.fin ? " · arrêt vers " + hhmm(paris(dodo.fin).s) : ""}` : cour.src === "tele" ? `${nomCanal(cour.canal)} · ${cour.k + 1}/${cour.file.length} · encore ${fmtDuree(reste.t)}` : (F.vue === "playlist" && PLAYLIST.titre ? "Playlist · " + PLAYLIST.titre : "À la carte · " + (cour.k + 1) + "/" + cour.file.length);
  const b = [];
  if (S.vus[x.i]) b.push(`<span class="badge">déjà vue</span>`);
  if (S.prog[x.i] > 15) b.push(`<span class="badge">reprise</span>`);
  if (x.pep) b.push(`<span class="badge chaud">✨ pépite</span>`);
  if (x.n && !x.pep) b.push(`<span class="badge chaud">nouveau</span>`);
  if (x.echo && (x.echo_fin || "") >= paris().jour) b.push(`<span class="badge" title="${esc(x.echo)}">écho de l'actu</span>`);
  if (x._o0) b.push(`<span class="badge">reclassée</span>`);
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
  if (o.vu) m.push(`<span class="marque discret">vu</span>`);
  if (x.pep) m.push(`<span class="marque">✨</span>`);
  else if (x.n) m.push(`<span class="marque">nouveau</span>`);
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
  $("#vueTele .titre-section span").textContent = cour.src === "tele" ? "Et ensuite sur " + nomCanal(cour.canal) : cour.src === "dodo" ? "Programme dodo" : "Et ensuite (à la carte)";
  const f = cour.file || [], out = [];
  for (let j = Math.max(cour.k, 0); j < f.length && out.length < 14; j++) {
    const e = f[j]; if (!e.x) continue;
    if (j !== cour.k && !jouable(e.x, cour.src !== "tele")) continue;
    out.push(ligne(e.x, { cur: j === cour.k, data: `data-j="${j}"` }));
  }
  el.innerHTML = out.join("") || `<li class="vide">Rien de prévu.</li>`;
}

/* ---------- À la carte ---------- */
const F = { vue: "liste", cat: "tout", q: "", chaine: null, art: null, n: 120 };
let PLAYLIST = [];
const artistesDe = x => String(x.art || "").split(",").map(a => a.trim()).filter(Boolean);
function listeCarte() {
  const t = maintenant(), j = paris().jour, souple = !S.cacherVues;
  const tri = l => l.sort((a, b) => poids(b) - poids(a)).map(x => ({ x }));
  if (F.vue === "tard") return S.plusTard.slice().sort((a, b) => a.q - b.q).map(p => ({ x: CAT.get(p.x.i) || p.x, tard: p.q }));
  if (F.vue === "hist") return S.hist.map(h => ({ x: CAT.get(h.i) || h }));
  if (F.vue === "playlist") return PLAYLIST.map(x => ({ x }));
  if (F.vue === "art" && !F.art) return [];
  const q = sansAccent(F.q);
  const ok = x => (F.cat === "tout" || x.o === F.cat) && (!F.chaine || x.sid === F.chaine) && (!F.art || artistesDe(x).includes(F.art))
    && !S.bloquees[x.i] && !masquee(x) && !retiree(x) && (!S.cacherVues || !S.vus[x.i]) && (!S.dejaVu[x.i] || souple)
    && (!q || sansAccent([x.t, x.c, x.art, x.th].join(" ")).includes(q));
  const tous = [...CAT.values()].filter(ok);
  if (F.vue === "spec") return tri(tous.filter(estSpectacle));
  if (F.vue === "neuf") return tous.filter(x => x.n).sort((a, b) => (b.d || "").localeCompare(a.d || "") || poids(b) - poids(a)).map(x => ({ x }));
  if (F.vue === "pep") return tous.filter(x => x.pep).sort((a, b) => ((b.echo_fin || "") >= j) - ((a.echo_fin || "") >= j) || poids(b) - poids(a)).map(x => ({ x }));
  if (F.vue === "art") return tri(tous);
  const dus = S.plusTard.filter(p => p.q <= t).map(p => ({ x: CAT.get(p.x.i) || p.x, tard: p.q })).filter(e => ok(e.x));
  const pris = new Set(dus.map(e => e.x.i));
  return [...dus, ...tri(tous.filter(x => !pris.has(x.i)))];
}
// Artistes du catalogue (champ « art » donné par la routine), les plus fournis d'abord ; les aimés devant.
function artistesCatalogue() {
  const n = new Map();
  for (const x of CAT.values()) if (!S.vus[x.i] && !retiree(x)) for (const a of artistesDe(x)) n.set(a, (n.get(a) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
}
let LISTE = [];
function rendreCarte() {
  const vues = [["liste", "Catalogue"], ["neuf", "🆕 Nouveautés"], ...(NB_PEPITES ? [["pep", "✨ Pépites"]] : []), ["art", "🎤 Artistes"], ...([...CAT.values()].some(estSpectacle) ? [["spec", "🎭 Spectacles"]] : []), ["tard", `⏰ Plus tard${S.plusTard.length ? " (" + S.plusTard.length + ")" : ""}`], ["hist", "Historique"]];
  if (PLAYLIST.length) vues.unshift(["playlist", "Playlist" + (PLAYLIST.titre ? " · " + court(PLAYLIST.titre, 24) : "")]);
  $("#pucesVue").innerHTML = vues.map(([v, n]) => `<button type="button" data-vue="${v}" aria-pressed="${F.vue === v}">${esc(n)}</button>`).join("")
    + (F.chaine ? `<button type="button" data-chaine="" aria-pressed="true">✕ ${esc(S.noms[F.chaine] || [...CAT.values()].find(x => x.sid === F.chaine)?.c || F.chaine)}</button>` : "");
  const filtres = ["liste", "neuf", "pep", "spec", "art"].includes(F.vue);
  $("#recherche").hidden = !filtres; $("#pucesCat").hidden = !filtres || F.vue === "art" && !F.art;
  if (filtres) $("#pucesCat").innerHTML = [["tout", "Tout"], ...Object.entries(CATS)].map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${F.cat === k}">${esc(n)}</button>`).join("");
  $("#pucesFormat").hidden = F.vue !== "art";
  if (F.vue === "art") {
    const arts = artistesCatalogue();
    $("#pucesFormat").innerHTML = F.art ? `<button type="button" data-art="" aria-pressed="true">✕ ${esc(F.art)}</button>`
      : arts.slice(0, 80).map(([a, n]) => `<button type="button" data-art="${esc(a)}" aria-pressed="false">${esc(a)} <small>${n}</small></button>`).join("") || "<p>Pas encore d'artistes repérés.</p>";
  } else $("#pucesFormat").innerHTML = filtres ? `<button type="button" data-vues="1" aria-pressed="${!S.cacherVues}">Montrer les vues</button>` : "";
  if (filtres && F.vue !== "art") $("#pucesFormat").hidden = false;
  LISTE = listeCarte();
  const now = maintenant(), curId = cour.src === "carte" ? cour.x?.i : null;
  $("#noteCarte").textContent = F.vue === "tard" ? (LISTE.length ? "Les vidéos mises de côté reviennent en tête du catalogue à la date dite." : "")
    : F.vue === "hist" ? (LISTE.length ? "Les 150 dernières vidéos vues (à 80 %)." : "")
    : F.vue === "spec" ? `${LISTE.length} spectacle${LISTE.length > 1 ? "s" : ""} en entier (ils passent aussi sur YO1 Rire).`
    : F.vue === "neuf" ? `${LISTE.length} vidéo${LISTE.length > 1 ? "s" : ""} entrée${LISTE.length > 1 ? "s" : ""} cette semaine, les plus récentes d'abord.`
    : F.vue === "art" ? (F.art ? `${LISTE.length} vidéo${LISTE.length > 1 ? "s" : ""} avec ${F.art}.` : "Toucher un nom pour voir ses vidéos (le nombre de vidéos disponibles est indiqué).")
    : F.vue === "pep" ? `${LISTE.length} pépites tirées de l'histoire des chaînes, choisies chaque dimanche ; celles qui font écho à l'actualité d'abord.` : F.vue === "liste" ? `${LISTE.length} vidéo${LISTE.length > 1 ? "s" : ""} cette semaine, classées selon tes goûts et ton humeur.` : "";
  $("#carte").innerHTML = LISTE.slice(0, F.n).map((e, k) => ligne(e.x, {
    data: `data-k="${k}"`, cur: e.x.i === curId, vu: F.vue !== "hist" && !!S.vus[e.x.i],
    tard: e.tard ? (e.tard <= now ? "à voir" : new Date(e.tard).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })) : ""
  })).join("") || (F.vue === "art" && !F.art ? "" : `<li class="vide">${F.vue === "tard" ? "Rien de mis de côté. Le bouton « Plus tard » sert à ça." : F.vue === "hist" ? "Aucune vidéo vue pour l'instant." : "Aucune vidéo ne correspond."}</li>`);
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
  $("#toast").hidden = false; clearTimeout(tToast); tToast = setTimeout(() => $("#toast").hidden = true, o.duree || (o.action || o.lien ? 7000 : 3500));
}

/* ---------- Goûts : j'aime / bof / masquer ---------- */
// « J'aime / Bof contenu » : la vidéo elle-même (et, via les retours, son artiste : la tâche du dimanche en tire les goûts
// par artiste et cherche ses autres vidéos, hors des chaînes suivies comprises). Touche aussi un peu la catégorie.
function voter(v, x = cour.x, silencieux) {
  if (!x || cour.src === "direct" && x === cour.x) return;
  const avant = S.votes[x.i] || 0, nv = avant === v ? 0 : v, delta = nv - avant;
  if (nv) { S.votes[x.i] = nv; S.contenus[x.i] = { v: nv, t: String(x.t || "").slice(0, 120), c: x.c || "", sid: x.sid || "", o: x.o || "", le: paris().jour }; }
  else { delete S.votes[x.i]; delete S.contenus[x.i]; }
  S.gouts.cat[x.o] = (S.gouts.cat[x.o] || 0) + delta * .5;
  if (x.sid) S.noms[x.sid] = x.c;
  S.modif = Date.now(); sauver(); majVotes();
  if (silencieux) return;
  if (nv === 1) toast(`Noté : ce contenu te plaît. Ses artistes compteront dès les prochains retours.`);
  else if (nv === -1) {
    toast(`Noté : pas ce contenu.`, { action: "Annuler", fn: () => voter(-1, x, true) });
    if (cour.src === "dodo" && x === cour.x) { S.dodoNon[x.i] = 1; sauver(); }
    if (x === cour.x) suivant(1);
  } else toast("Vote retiré.");
}
// « J'aime / Bof chaîne » : votes cumulés, de −3 à +3 ; on renforce en revotant, depuis n'importe quelle vidéo de la chaîne.
// Effet dans ce navigateur tout de suite ; dans les playlists de la semaine suivante par les retours. À −3, la chaîne est retirée.
// Pour une chaîne hors de la liste (vidéo trouvée par artiste), « J'aime chaîne » l'ajoute aux chaînes suivies.
function voterCh(v, x = cour.x) {
  if (!x?.sid || cour.src === "direct" && x === cour.x) return;
  const avant = S.chv[x.sid] || 0, nv = clamp(avant + v, -3, 3);
  if (nv === avant) return toast(nv > 0 ? `${x.c} : déjà au maximum (+3).` : `${x.c} : déjà retirée (−3).`, { action: "Remettre à zéro", fn: () => { delete S.chv[x.sid]; S.modif = Date.now(); sauver(); majVotes(); } });
  if (nv) S.chv[x.sid] = nv; else delete S.chv[x.sid];
  S.noms[x.sid] = x.c; S.modif = Date.now(); sauver(); majVotes();
  const annuler = { action: "Annuler", fn: () => { if (avant) S.chv[x.sid] = avant; else delete S.chv[x.sid]; S.modif = Date.now(); sauver(); majVotes(); rendreListe(); } };
  const ext = String(x.sid).startsWith("ext-"), sg = k => (k > 0 ? "+" : "−") + Math.abs(k);
  if (nv <= -3) { toast(`${x.c} retirée de YO1tv (trois « Bof chaîne »).`, annuler); if (x === cour.x) suivant(1); else rendreListe(); return; }
  if (v > 0) toast(ext && avant <= 0 ? `${x.c} : chaîne hors de la liste, elle rejoindra les chaînes suivies (${sg(nv)}).` : `Plus de ${x.c} (${sg(nv)}).`, annuler);
  else { toast(`Moins de ${x.c} (${nv ? sg(nv) : "neutre"}).`, annuler); if (x === cour.x && nv < 0) suivant(1); }
}
// « Retirer la chaîne » : plus aucune de ses vidéos ici, et elle sort des chaînes suivies au prochain dimanche (retours).
function retirerChaine(x = cour.x) {
  if (!x?.sid || cour.src === "direct" && x === cour.x) return;
  if (!S.suppr.includes(x.sid)) S.suppr.push(x.sid);
  S.noms[x.sid] = x.c; S.modif = Date.now(); sauver();
  toast(`${x.c} est retirée de YO1tv.`, { action: "Annuler", fn: () => { S.suppr = S.suppr.filter(s => s !== x.sid); S.modif = Date.now(); sauver(); rendreListe(); } });
  if (cour.x?.sid === x.sid) suivant(1); else rendreListe();
}
// « Déjà vu » : écartée trois mois (dans ce navigateur, et dans les playlists suivantes par les retours).
function dejaVu(x = cour.x) {
  if (!x || cour.src === "direct" && x === cour.x) return;
  S.dejaVu[x.i] = Date.now(); marquerVu(x); S.modif = Date.now(); sauver();
  toast("Déjà vue : écartée pendant trois mois.", { action: "Annuler", fn: () => { delete S.dejaVu[x.i]; sauver(); } });
  if (x === cour.x) suivant(1);
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
  feuille(`<h2>Humeur du moment</h2><p>Ce curseur pèse sur l'ordre du catalogue À la carte (les playlists de la télé, elles, restent celles de la semaine).</p>
    <input class="curseur" type="range" min="0" max="100" step="5" value="${S.humeur}" id="curHumeur" aria-label="Humeur, de à plat à curieux">
    <div class="bornes"><span>😴 À plat</span><span>🤓 Curieux</span></div><p id="txtCur">${texteHumeur()}</p>`,
    el => {
      const c = el.querySelector("#curHumeur");
      c.oninput = () => { S.humeur = +c.value; $("#txtCur").textContent = texteHumeur(); };
      c.onchange = () => { S.humeur = +c.value; sauver(); majHumeur(); rendreListe(); toast("Humeur prise en compte À la carte."); };
    });
}
const majHumeur = () => $("#txtHumeur").textContent = S.humeur < 30 ? "À plat" : S.humeur > 70 ? "Curieux" : "Humeur";
/* ---------- Dodo : minuterie et programme pour s'endormir ----------
   Programme dodo : documentaires calmes de 20 min et plus (marque « dodo » du stock : 42 d'ARTE, Balade Mentale,
   documentaires ARTE et ARTE Évasion, C'est pas sorcier), dans cet ordre : 2 ou 3 « 42 », 2 documentaires de 44 min et plus,
   puis Balade Mentale et documentaires en alternance ; au moins 6 h de file pour pouvoir passer ce qui ne convient pas, arrêt au bout de la durée choisie
   (3 h par défaut) même en cours de vidéo. Alerte 5 min avant avec « Prolonger », son qui baisse doucement sur les
   2 dernières minutes, écran noir facultatif. Ce qu'on regarde en s'endormant ne compte pas comme « vu » (rotation à part),
   et « Bof » en mode dodo retire la vidéo du programme. Écran éteint, le navigateur ralentit les minuteries : l'arrêt
   peut alors avoir jusqu'à une minute de retard. */
const DODO_MIN_S = 1200, DODO_LONG_S = 2640, DODO_FILE_S = 6 * 3600, FONDU_S = 120, ALERTE_S = 300;
const DODO_FACTEUR = { "yt-cestpassorcier": .6 };   // C'est pas sorcier : un peu moins souvent que les documentaires ARTE
const genreDodo = x => x.sid === "yt-balade" ? "balade" : x.th === "42 (ARTE)" || /\b42\b.{0,4}(la )?réponse/i.test(x.t || "") ? "42" : "doc";
const dureeDodoDefaut = () => S.dodoDuree || 180;
function fmtMin(m) { m = Math.max(0, Math.round(m)); return m >= 60 ? `${m / 60 | 0} h${m % 60 ? " " + deux(m % 60) : ""}` : `${m} min`; }
function feuilleDodo() {
  const reste = dodo.fin ? (dodo.fin - maintenant()) / 60000 : 0, enCours = dodo.fin || dodo.finVideo;
  const n = poolDodo().length;
  feuille(`<h2>Dodo</h2>
    <p>${enCours ? (dodo.fin ? `Arrêt dans ${fmtMin(reste)} (vers ${hhmm(paris(dodo.fin).s)}).` : "Arrêt à la fin de la vidéo en cours.") : "Pour s'endormir devant la télé sans la laisser tourner toute la nuit."}</p>
    <h3>Programme pour s'endormir</h3>
    <p>Deux ou trois épisodes de 42 (ARTE) pour commencer, deux documentaires longs, puis Balade Mentale et documentaires en alternance (ARTE, ARTE Évasion, C'est pas sorcier), tous de 20 min et plus. Au moins 6 h de programme, pour pouvoir passer ce qui ne convient pas. ${n} vidéos disponibles.</p>
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
    pool = pool.concat([...CAT.values()].filter(x => !x.dodo && x.o === "decouverte" && duree(x) >= DODO_MIN_S && duree(x) <= 5400 && !S.bloquees[x.i] && !masquee(x) && !S.dodoNon[x.i]));
  if (!pool.length) return toast("Pas encore de documentaires pour le programme dodo.");
  // Dans chaque genre : jamais passées en dodo d'abord, puis les plus anciennement passées ; à égalité, tirage pondéré.
  const rnd = mulberry(hash("dodo|" + paris().jour + "|" + Date.now()));
  const cle = x => (S.dodoVus[x.i] || 0) - Math.pow(rnd(), 1 / ((x.q || 2) * (DODO_FACTEUR[x.sid] || 1))) * 864e5;
  const tas = { "42": [], balade: [], doc: [] };
  for (const x of pool.sort((a, b) => cle(a) - cle(b))) tas[genreDodo(x)].push(x);
  const pris = new Set(), file = []; let t = 0;
  const prendre = (genre, filtre = () => true) => tas[genre].find(x => !pris.has(x.i) && filtre(x)) || null;
  const poser = x => { if (!x) return false; pris.add(x.i); file.push({ x }); t += duree(x); return true; };
  // Ordre voulu : deux ou trois 42 pour commencer, deux documentaires longs (44 min et plus), puis Balade Mentale et documentaires en alternance.
  for (let n = 2 + (rnd() < .5); n > 0; n--) poser(prendre("42"));
  for (let n = 2; n > 0; n--) poser(prendre("doc", x => duree(x) >= DODO_LONG_S)) || poser(prendre("doc")) || poser(prendre("balade"));
  for (let tour = 0; t < DODO_FILE_S; tour++) {
    const voulu = tour % 2 ? "doc" : "balade", autre = tour % 2 ? "balade" : "doc";
    if (!(poser(prendre(voulu)) || poser(prendre(autre)) || poser(prendre("42")))) break;
  }
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
  if (cour.src !== "tele") return toast("La playlist n'existe qu'en mode Télé, sur un canal.");
  const f = cour.file, r = resteDe(f, cour.k);
  feuille(`<h2>${esc(nomCanal(cour.canal))} · semaine du ${esc(joliJour(SEM.semaine))}</h2><p>${f.length} vidéos (${fmtDuree(SEM.heures?.[CANAL[cour.canal].cat] * 3600 || 0)}) ; il en reste ${r.n} à voir, environ ${fmtDuree(r.t)}. Sur cet appareil, le canal reprend toujours après la dernière vidéo vue. Toucher une vidéo pour y aller.</p>
    <ol class="grille-liste">${f.map((e, j) => `<li class="${j === cour.k ? "en-cours" : ""}"><button type="button" data-j="${j}"><span class="h">${j + 1}</span><span>${S.vus[e.x.i] || S.dejaVu[e.x.i] ? "<span class='marque discret'>vu</span>" : ""}${e.x.pep ? "<span class='marque'>✨</span>" : ""}${esc(titreDe(e.x))}<small>${esc(e.x.c || "")} · ${esc(metaDe(e.x))}</small></span></button></li>`).join("")}</ol>`,
    el => {
      el.querySelector(".en-cours")?.scrollIntoView({ block: "center" });
      el.onclick = e => { const b = e.target.closest("[data-j]"); if (b) { fermer(); aller(+b.dataset.j, 1, true); } };
    });
}
function feuilleReglages() {
  const masq = S.masquees.map(sid => `<li><span>${esc(S.noms[sid] || sid)}${S.suppr.includes(sid) ? " (suppression demandée)" : ""}</span><button type="button" class="petit" data-demasquer="${esc(sid)}">Réafficher</button></li>`).join("");
  const bloq = Object.keys(S.bloquees).map(id => { const x = CAT.get(id); return `<li><span>${esc(x ? court(titreDe(x), 70) : id)}</span><a class="petit" href="${ytUrl(id)}" target="_blank" rel="noopener">YouTube</a></li>`; }).join("");
  const gch = [...new Set([...Object.keys(S.gouts.ch), ...Object.keys(S.chv)])].map(sid => [sid, (S.gouts.ch[sid] || 0) + 3 * (S.chv[sid] || 0)]).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
  const goutsTxt = gch.length ? gch.slice(0, 6).map(([sid, v]) => `${esc(S.noms[sid] || sid)} (${v > 0 ? "+" : ""}${v})`).join(", ") + (gch.length > 6 ? "…" : "") : "aucun vote pour l'instant";
  feuille(`<h2>Réglages</h2>
    <h3>Affichage</h3><div class="choix">${[["sombre", "Sombre"], ["clair", "Clair"], ["auto", "Comme l'appareil"]].map(([k, n]) => `<button type="button" data-theme="${k}" aria-pressed="${S.theme === k}">${n}</button>`).join("")}</div>
    <h3>Lecture</h3><div class="choix">
      <button type="button" data-opt="cc" aria-pressed="${S.cc}">Sous-titres au démarrage</button>
      <button type="button" data-opt="cacherVues" aria-pressed="${S.cacherVues}">Cacher les vues (À la carte)</button></div>
    <h3>Ta semaine</h3>${bilanSemaine()}
    <h3>Retours pour la programmation du dimanche</h3><p>Tes votes, vidéos vues et « déjà vu », chaînes retirées et catégories corrigées partent vers le dépôt privé : la routine du dimanche soir (19 h 53) en tient compte pour les playlists de la semaine suivante. Dernier envoi : ${S.envoi ? esc(joliMoment(S.envoi)) : "jamais"}${S.modif > S.envoi ? " — des changements attendent" : ""}.</p>
    <p>« Envoyer » copie les retours puis ouvre la page GitHub de création du fichier : s'il est vide, <b>coller</b> (appui long dans la zone de texte), puis « Commit changes ».</p>
    <div class="choix"><button type="button" data-act="envoyer">Envoyer mes retours (GitHub)</button><button type="button" data-act="copier">Copier seulement</button></div>
    <h3>Tes goûts</h3><p>Chaînes votées : ${goutsTxt}. ${Object.keys(S.contenus).length} contenu(s) noté(s) (j'aime / bof contenu), ${Object.keys(S.vus).length} vidéos vues et ${Object.keys(S.dejaVu).length} « déjà vu » (trois mois), ${S.plusTard.length} mises de côté, ${Object.keys(S.corr).length} catégorie(s) corrigée(s).</p>
    <div class="masquees"><p><b>Chaînes masquées</b>${masq ? "" : " : aucune."}</p><ul>${masq}</ul></div>
    <div class="bloquees"><p><b>Vidéos non intégrables</b> (sautées pendant 7 jours)${bloq ? "" : " : aucune."}</p><ul>${bloq}</ul></div>
    <h3>Sauvegarde</h3><p>Tout est gardé dans ce navigateur. Exporte de temps en temps : un nettoyage des données de Brave effacerait tout.</p>
    <div class="choix"><button type="button" data-act="export">Exporter (JSON)</button><label>Importer…<input type="file" accept="application/json,.json" id="fImport" hidden></label>
      <button type="button" data-act="hist">Oublier l'historique</button><button type="button" data-act="tout">Tout effacer</button></div>
    <h3>Raccourcis</h3><p><kbd>Échap</kbd> quitter le plein écran · <kbd>Espace</kbd> lecture/pause · <kbd>→</kbd> <kbd>←</kbd> suivante/précédente · <kbd>↑</kbd> <kbd>↓</kbd> ou <kbd>1</kbd>…<kbd>7</kbd> canaux · <kbd>+</kbd> j'aime (contenu) · <kbd>-</kbd> bof (contenu) · <kbd>V</kbd> déjà vu · <kbd>T</kbd> télé / à la carte · <kbd>S</kbd> sous-titres · <kbd>F</kbd> plein écran. Sur la tablette : glisser à gauche/droite sur le bandeau sous l'image pour zapper.</p>
    <h3>À propos</h3><p>YO1tv ${VERSION} · programmes de la semaine du ${SEM ? esc(joliJour(SEM.semaine)) : "?"} · ${CAT.size} vidéos (${NB_PEPITES} pépites) · <a href="test.html">page de test du lecteur</a></p>`,
    el => {
      el.onclick = e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.theme) { S.theme = b.dataset.theme; theme(); sauver(); el.querySelectorAll("[data-theme]").forEach(x => x.setAttribute("aria-pressed", x === b)); }
        if (b.dataset.opt) {
          const k = b.dataset.opt; S[k] = !S[k]; sauver(); b.setAttribute("aria-pressed", S[k]);
          if (k === "cc") { appliquerCC(); afficher(); } if (k === "cacherVues") rendreListe();
        }
        if (b.dataset.demasquer) { const sid = b.dataset.demasquer; S.masquees = S.masquees.filter(s => s !== sid); S.suppr = S.suppr.filter(s => s !== sid); S.modif = Date.now(); sauver(); b.closest("li").remove(); rendreListe(); }
        if (b.dataset.act === "export") exporter();
        if (b.dataset.act === "envoyer") envoyerRetours();
        if (b.dataset.act === "copier") navigator.clipboard?.writeText(JSON.stringify(retours(), null, 1)).then(() => toast("Retours copiés."), () => toast("Copie impossible."));
        if (b.dataset.act === "hist" && confirm("Oublier les vidéos vues et les reprises ? (les votes restent)")) { S.vus = {}; S.hist = []; S.prog = {}; sauver(true); location.reload(); }
        if (b.dataset.act === "tout" && confirm("Effacer tous tes goûts, votes, historique et réglages de YO1tv dans ce navigateur ?")) { localStorage.removeItem(CLE); S = defaut(); location.reload(); }
      };
      el.querySelector("#fImport").onchange = async ev => {
        try { const o = JSON.parse(await ev.target.files[0].text()); if (!o || typeof o !== "object" || !o.gouts) throw new Error("fichier non reconnu"); S = Object.assign(defaut(), o); sauver(true); location.reload(); }
        catch (e) { toast("Import impossible : " + e.message); }
      };
    });
}
function exporter() {
  const { ...o } = S;
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
    <p>YO1tv s'en souvient tout de suite pour cette vidéo ; après trois corrections dans le même sens pour une chaîne, ses autres vidéos suivent. Les corrections partent avec « Envoyer mes retours » (Réglages) : la vidéo change de canal dès la semaine suivante.</p>`,
    el => el.onclick = e => { const b = e.target.closest("[data-cat]"); if (b) { corriger(x, b.dataset.cat); fermer(); } });
}
/* ---------- Source : priorité, masquer, retirer, voir (effet dans ce navigateur, puis dans les playlists par les retours) ---------- */
const PRIOS = [[.5, "Basse"], [1, "Normale"], [2, "Haute"], [3, "Très haute"]];   // poids de la chaîne (1 pour la plupart)
function feuilleSource() {
  const x = cour.x; if (!x?.sid || cour.src === "direct") return;
  const actuelle = S.prio[x.sid] || 1, suppr = S.suppr.includes(x.sid), v = S.chv[x.sid] || 0;
  feuille(`<h2>Source : ${esc(x.c || x.sid)}</h2><p>Catégorie de cette vidéo : <b>${esc(CATS[x.o] || x.o || "?")}</b> · priorité ${S.prio[x.sid] ? "choisie" : "normale"} : <b>${esc(PRIOS.find(p => p[0] === actuelle)?.[1] || "poids " + actuelle)}</b> · votes « chaîne » : <b>${v ? (v > 0 ? "+" : "−") + Math.abs(v) : "aucun"}</b>.</p>
    <h3>Priorité</h3><div class="choix">${PRIOS.map(([v, n]) => `<button type="button" data-prio="${v}" aria-pressed="${actuelle === v}">${n}</button>`).join("")}</div>
    <h3>Retirer</h3><div class="choix"><button type="button" data-src="masquer">Masquer ici seulement</button><button type="button" data-src="suppr" aria-pressed="${suppr}">${suppr ? "Annuler le retrait" : "Retirer de YO1tv"}</button></div>
    ${String(x.sid).startsWith("ext-") ? `<h3>Hors de la liste</h3><p>Cette vidéo a été trouvée en cherchant un artiste que tu aimes ; sa chaîne n'est pas suivie.</p><div class="choix"><button type="button" data-src="ajouter" aria-pressed="${S.chv[x.sid] === 1}">Proposer d'ajouter la chaîne</button></div>` : ""}
    <h3>Voir</h3><div class="choix"><button type="button" data-src="videos">Ses vidéos (À la carte)</button></div>
    <p>Effet immédiat dans ce navigateur. Les chaînes suivies et les playlists suivent au prochain « Envoyer mes retours » (traités le dimanche soir).</p>`,
    el => el.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      S.noms[x.sid] = x.c;
      if (b.dataset.prio) {
        const v = +b.dataset.prio;
        if (v === 1) delete S.prio[x.sid]; else S.prio[x.sid] = v;
        toast(`Priorité ${PRIOS.find(p => p[0] === v)[1].toLowerCase()} pour ${x.c}.`);
      } else if (b.dataset.src === "masquer") { fermer(); masquer(x); }
      else if (b.dataset.src === "suppr") {
        if (suppr) { S.suppr = S.suppr.filter(s => s !== x.sid); S.masquees = S.masquees.filter(s => s !== x.sid); toast(`${x.c} est conservée.`); rendreListe(); }
        else { fermer(); retirerChaine(x); return; }
      } else if (b.dataset.src === "videos") { fermer(); $("#chaine").click(); return; }
      else if (b.dataset.src === "ajouter") { fermer(); if (S.chv[x.sid] !== 1) voterCh(1, x); return; }
      S.modif = Date.now(); sauver(); fermer();
    });
}
function corriger(x, vers) {
  const de = x._o0 || x.o;
  S.modif = Date.now();
  if (vers === de) delete S.corr[x.i];
  else S.corr[x.i] = { de, vers, sid: x.sid || "", c: x.c || "", t: String(x.t || "").slice(0, 90), le: paris().jour };
  S.modif = Date.now(); sauver(); appliquerCorrections(); afficher();
  toast(vers === de ? "Classement d'origine rétabli." : `Noté : ${CATS[vers]} plutôt que ${CATS[de]}.`);
}

/* ---------- Retours pour la routine du dimanche (sans jeton) ---------- */
// Pas de jeton stocké : on copie les retours, puis on ouvre la page GitHub de création de fichier du dépôt privé.
// Avant la v2, le contenu voyageait dans l'adresse de la page : au-delà de quelques Ko, GitHub ouvrait une page vide.
const DEPOT_RETOURS = "akouatik-yo/Actualit-s-", URL_MAX = 6000;
const jourDe = ts => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
function retours() {
  const t = Date.now(), vus = {};
  for (const h of S.hist) if (t - h.vu < 30 * 864e5) vus[h.o] = (vus[h.o] || 0) + 1;
  const votes = Object.fromEntries(Object.entries(S.gouts.ch).filter(([, v]) => v));
  const sids = new Set([...Object.keys(votes), ...Object.keys(S.chv), ...S.masquees, ...Object.keys(S.prio), ...S.suppr]);
  const contenus = Object.entries(S.contenus).sort((a, b) => (b[1].le || "").localeCompare(a[1].le || "")).slice(0, 150)
    .map(([i, c]) => ({ i, v: c.v, t: String(c.t || "").slice(0, 80), c: c.c, sid: c.sid, o: c.o }));
  for (const c of contenus) if (c.sid) sids.add(c.sid);
  return {
    yo1tv: VERSION, date: paris().jour, genere: new Date().toISOString(),
    votes, categories_gout: S.gouts.cat, chaines_vote: S.chv,
    noms: Object.fromEntries([...sids].filter(s => S.noms[s]).map(s => [s, S.noms[s]])),
    masquees: S.masquees, priorites: S.prio, supprimees: S.suppr,
    contenus, deja_vu: Object.keys(S.dejaVu),
    vus: Object.entries(S.vus).filter(([, ts]) => t - ts < VUS_J * 864e5).map(([i, ts]) => [i, jourDe(ts)]),
    corrections: Object.entries(S.corr).slice(-80).map(([i, c]) => ({ i, ...c })),
    vus_30_jours: vus, pepites_vues_30_jours: S.hist.filter(h => h.pep && t - h.vu < 30 * 864e5).length
  };
}
async function envoyerRetours() {
  const p = paris(), nom = `retours/yo1tv-${p.jour}-${hhmm(p.s).replace(":", "h")}.json`, json = JSON.stringify(retours());
  let url = `https://github.com/${DEPOT_RETOURS}/new/main?filename=${encodeURIComponent(nom)}`;
  const long = url.length + encodeURIComponent(json).length + 7 > URL_MAX;
  if (!long) url += "&value=" + encodeURIComponent(json);
  const fen = open("about:blank", "_blank");   // ouverte tout de suite (geste de l'utilisateur), remplie après la copie
  let copie = false;
  try { await navigator.clipboard.writeText(json); copie = true; } catch { }
  if (fen) fen.location = url; else open(url, "_blank", "noopener");
  S.envoi = Date.now(); sauver();
  toast(long ? (copie ? "Retours copiés. Sur GitHub : colle-les dans la zone de texte, puis « Commit changes »." : "Copie refusée par le navigateur : utilise « Copier seulement », puis colle sur GitHub.")
    : "Page GitHub ouverte : vérifie puis « Commit changes ».", { duree: 9000 });
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
$("#bAimeCh").onclick = () => voterCh(1);
$("#bBofCh").onclick = () => voterCh(-1);
$("#bVu").onclick = () => dejaVu();
$("#bRetirer").onclick = () => retirerChaine();
$("#bTard").onclick = feuilleTard;
$("#bHumeur").onclick = feuilleHumeur;
$("#bDodo").onclick = feuilleDodo;
$("#bCC").onclick = basculerCC;
$("#bPlein").onclick = pleinEcran;
$("#bCat").onclick = feuilleCat;
$("#bSource").onclick = feuilleSource;
$("#barreIm").onclick = e => {
  const b = e.target.closest("[data-cmd]"); if (!b || b.disabled) return;
  ({ prec: () => suivant(-1), pause, suiv: () => suivant(1), aime: () => voter(1), bof: () => voter(-1), aimeCh: () => voterCh(1), bofCh: () => voterCh(-1), retirer: () => retirerChaine(), vu: () => dejaVu(), tard: feuilleTard, cat: feuilleCat, source: feuilleSource, dodo: feuilleDodo,
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
  if (b.dataset.vue) { F.vue = b.dataset.vue; F.n = 120; if (F.vue !== "art") F.art = null; }
  else if (b.dataset.cat) { F.cat = b.dataset.cat; F.n = 120; }
  else if (b.dataset.art !== undefined) { F.art = b.dataset.art || null; F.n = 120; scrollTo({ top: 0 }); }
  else if (b.dataset.vues) { S.cacherVues = !S.cacherVues; sauver(); }
  else if (b.dataset.chaine !== undefined && b.closest("#pucesVue")) { F.chaine = null; }
  else if (b.dataset.k) return jouerListe(LISTE.map(e => e.x), +b.dataset.k, true);
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
    "+": () => voter(1), "-": () => voter(-1), v: () => dejaVu(), t: () => $(S.mode === "tele" ? "#mCarte" : "#mTele").click(), s: basculerCC, f: pleinEcran
  };
  if (/^[1-7]$/.test(k)) { vue("tele"); demarrerTele(CANAUX[+k - 1].id); e.preventDefault(); return; }
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
  { const c = $("#contact"), m = c.dataset.a + "@" + c.dataset.b; c.textContent = m; c.href = "mailto:" + m; }
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => annonce("Le lecteur YouTube n'a pas pu être chargé (connexion ou bloqueur).");
  document.head.append(s);
  await chargerSemaine();
  if (!CAT.size) { annonce("Pas de programme : data/semaine.json est absent ou vide."); $("#titre").textContent = "Pas de programme"; return; }
  const auj = paris().jour, ban = $("#banniere");
  if ((Date.parse(auj) - Date.parse(SEM.semaine)) / 864e5 > 8) { ban.hidden = false; ban.textContent = `Programmes de la semaine du ${joliJour(SEM.semaine)} : la routine du dimanche n'a pas tourné depuis.`; }
  vue(S.mode === "carte" ? "carte" : "tele");
  if (!(await hashPlaylist())) demarrerTele(S.canal);
  // Le dimanche avant la routine de 19 h 53 : rappel d'envoyer les retours s'il y a du nouveau.
  if (new Date(auj + "T12:00:00Z").getUTCDay() === 0 && paris().s < 19 * 3600 + 45 * 60 && S.modif > S.envoi)
    setTimeout(() => toast("Des retours attendent : la routine du dimanche soir peut en tenir compte.", { action: "Envoyer", fn: envoyerRetours }), 6000);
})();
