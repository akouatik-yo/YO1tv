#!/usr/bin/env python3
"""YO1tv — collecte et programmation de la semaine, sans IA (bibliothèque standard de Python seulement).

YO1tv est indépendante de La Vigie depuis le 19 novembre 2026. Une seule tâche planifiée, chaque dimanche soir
(« YO1tv — programmation de la semaine », consignes yo1tv-semaine.md du dépôt privé), appelle ces commandes ;
l'IA ne fait que juger et classer les candidates.

Deux dossiers : --depot (racine du dépôt public YO1tv, par défaut le parent de ce script) et --prive (dossier yo1tv/
du dépôt privé : sources.json, humoristes.json, artistes.json, vus.json, journal.json). Rien de privé n'est écrit
dans le dépôt public.

Commandes :
  collecter [--etendue] [--sortie F]
                     candidates de la semaine, une ligne par vidéo (id | sorte | chaîne | catégorie de la chaîne | durée |
                     vues | âge | titre [artiste]) et le détail dans F (JSON). Sortes : pop (vidéos populaires de l'histoire
                     d'une chaîne, rotation), neuf (sorties des 10 derniers jours), info (analyses et entretiens de 15 min
                     et plus des 8 derniers jours), hum (recherche YouTube d'un humoriste de la liste), art (artiste aimé).
                     --etendue : toutes les chaînes et tous les humoristes d'un coup, plus de vidéos par chaîne.
  integrer DECISIONS CANDIDATS
                     verse au stock (data/stock.json) les vidéos gardées, avec leur catégorie ; les autres sont écartées.
  stock [--o CAT] [--sans-art] [--depuis AAAA-MM-JJ]
                     liste le stock (id | catégorie | chaîne | durée | q | thème | artiste | titre), pour un reclassement.
  reclasser FICHIER  applique {"ID": {"o": …, "q": …, "th": …, "art": …, "dodo": 0|1, "sp": 0|1} | "retirer"} au stock.
  retours FICHIER    applique la partie mécanique d'un fichier de retours de la tablette (vues, déjà vu, votes chaîne,
                     priorités, chaînes retirées ou masquées, corrections de catégorie, goûts par artiste quand l'artiste
                     est connu) ; affiche ce qui reste à juger (contenus notés sans artiste connu).
  programmer [--date AAAA-MM-JJ]
                     playlists de la semaine (data/semaine.json) : 40 h au moins par canal, pépites en avant, sources
                     panachées, rien de ce qui a été vu ou marqué « déjà vu » depuis 90 jours ; canal Info : les analyses
                     et entretiens de la semaine.
  dodo               fonds du programme dodo (listes de data/sources-dodo.json), versé au stock avec la marque dodo.
  exclure FICHIER [--jours 0]
                     ajoute à vus.json une liste d'identifiants (JSON), datés d'aujourd'hui (moins --jours).
  adopter ANCIEN NOUVEAU
                     rattache au nouvel identifiant de source les vidéos d'une chaîne hors liste (ext-UC…).
"""
import concurrent.futures as cf
import hashlib
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
DEPOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Catégories = canaux de YO1tv (même ordre que dans la page).
CATS = ("humour", "culture", "savoir", "decouverte", "divertissement", "info")
ANCIENNES = {"analyse": "info", "actu": "info", "politique": "info"}   # catégories d'avant le 19 novembre 2026
DUREE_INCONNUE = 600
DUREE_MIN = {"humour": 120, "info": 900}   # en secondes ; 240 pour les autres catégories
DUREE_MIN_DEFAUT = 240
PAR_CHAINE, PAR_CHAINE_ETENDUE = 12, 20       # vidéos populaires examinées par chaîne et par passage
NEUF_JOURS, NEUF_PAR = 10, 4                  # sorties récentes : âge maximal, nombre par chaîne
INFO_JOURS, INFO_PAR = 8, 8
HUMORISTES_SEMAINE, PAR_HUMORISTE, PAR_HUMORISTE_ETENDUE = 25, 6, 8
ARTISTES_MAX = 12
VUS_JOURS = 90                                # vu ou « déjà vu » : pas reproposé pendant 3 mois
CIBLE_S, PLAFOND_S = 40 * 3600, 46 * 3600     # durée d'une playlist de canal
INFO_FRAICHEUR = 8                            # jours
STOCK_MAX, ECARTES_MAX = 6000, 40000
Q_POIDS = {1: 1.0, 2: 1.8, 3: 3.0}
PEPITE_BONUS = 1.5                            # archives choisies : plus de poids que les sorties de la semaine
VOTE_CHAINE = {-3: 0, -2: .35, -1: .6, 0: 1, 1: 1.5, 2: 2, 3: 2.6}   # « J'aime / Bof chaîne » cumulés (−3 = retirée)
# Jeu vidéo : écarté (choix de Yoann), sauf les bandes-annonces.
JEU_MOTS = re.compile(r"\b(gameplay|let'?s ?play|walkthrough|playthrough|speedrun|soluce|let'?s ?test|en live sur twitch|stream|streamer|"
                      r"e-?sports?|minecraft|fortnite|roblox|among us|gta ?(v|5|6|rp|online)|league of legends|valorant|call of duty|"
                      r"warzone|apex legends|counter-?strike|elden ring|zelda|pok[ée]mon|super mario|mario kart|fifa ?\d\d|ea sports fc|"
                      r"ps[45]|playstation|xbox|nintendo|switch 2|steam|twitch|fnaf|trackmania|line rider race|crouton game show|deathrun|"
                      r"(mon|son|ton|nouveau|propre) skin|five nights at freddy|doki doki|undertale|gamer|manette|"
                      r"jeux?[ -]vidéos?|video ?games?|gaming)\b", re.I)
BANDE_ANNONCE = re.compile(r"\b(bande[ -]annonce|trailer|teaser)\b", re.I)
est_jeu = lambda titre: bool(JEU_MOTS.search(titre or "")) and not BANDE_ANNONCE.search(titre or "")
DIRECT = re.compile(r"🔴|\ben direct\b|\blive\b|\bREPLAY\b", re.I)


def arg(nom, defaut=None):
    if nom in sys.argv:
        k = sys.argv.index(nom)
        v = sys.argv[k + 1] if k + 1 < len(sys.argv) and not sys.argv[k + 1].startswith("--") else True
        del sys.argv[k:k + (2 if v is not True else 1)]
        return v
    return defaut


def lire(chemin, defaut=None):
    try:
        with open(chemin, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defaut


def ecrire(chemin, obj, compact=True, indent=1):
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    with open(chemin + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else indent)
        if not compact:
            f.write("\n")
    os.replace(chemin + ".tmp", chemin)


def secondes(du):
    s = 0
    for p in str(du or "").split(":"):
        s = s * 60 + (int(p) if p.isdigit() else 0)
    return s


def duree(x):
    return secondes(x.get("du")) or DUREE_INCONNUE


def fmt_du(s):
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def alea(*cles):
    """Nombre pseudo-aléatoire stable dans (0, 1) : mêmes clés, même résultat."""
    return (int(hashlib.sha1("|".join(map(str, cles)).encode()).hexdigest()[:8], 16) + 1) / 0x100000002


def aujourdhui():
    return datetime.now(PARIS).date()


def sans_accent(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s).lower()) if unicodedata.category(c) != "Mn")


def slug(s):
    return re.sub(r"[^a-z0-9]", "", sans_accent(s))[:24] or "chaine"


# ---------------------------------------------------------------- YouTube (pages publiques, sans clé)
ENTETES = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
           "Accept-Language": "fr-FR,fr;q=0.9"}


def telecharger(url, essais=2):
    for k in range(essais):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=ENTETES), timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 — réseau : on réessaie une fois, puis on abandonne cette chaîne
            err = e
    raise err


def donnees_initiales(html):
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    return json.loads(m.group(1)) if m else {}


def parcourir(o, cle):
    if isinstance(o, dict):
        if cle in o:
            yield o[cle]
        for v in o.values():
            yield from parcourir(v, cle)
    elif isinstance(o, list):
        for v in o:
            yield from parcourir(v, cle)


def nombre_vues(txt):
    m = re.fullmatch(r"\s*([\d\s,.]+?)\s*(k|M|Md)?\s*(?:de\s+)?(?:vues?)?\s*", (txt or "").replace("\xa0", " ").replace("\u202f", " "))
    if not m or not re.search(r"\d", m.group(1)):
        return 0
    n = float(m.group(1).replace(" ", "").replace("\xa0", "").replace(" ", "").replace(",", ".") or 0)
    return int(n * {"k": 1e3, "M": 1e6, "Md": 1e9}.get(m.group(2), 1))


def age_jours(txt):
    m = re.search(r"il y a (\d+)\s*(mois|sem|an|a|j|h|min)", (txt or "").replace("\xa0", " "))
    if not m:
        return None
    return int(m.group(1)) * {"an": 365, "a": 365, "mois": 30, "sem": 7, "j": 1, "h": 0, "min": 0}[m.group(2)]


def liste_youtube(pl):
    """Vidéos d'une liste de lecture publique (première page, ~50 à 100 vidéos) : id, titre, durée, vues, âge."""
    d = donnees_initiales(telecharger(f"https://www.youtube.com/playlist?list={pl}"))
    out = []
    for v in parcourir(d, "lockupViewModel"):
        i = v.get("contentId")
        if not i or not re.fullmatch(r"[\w-]{11}", i):
            continue
        md = (v.get("metadata") or {}).get("lockupMetadataViewModel") or {}
        titre = ((md.get("title") or {}).get("content") or "").strip()
        badges = [b.get("text", "") for b in parcourir(v.get("contentImage"), "thumbnailBadgeViewModel")]
        du = next((secondes(b) for b in badges if re.fullmatch(r"\d+(:\d\d){1,2}", b)), 0)
        textes = [p.get("content", "") for p in parcourir(md.get("metadata"), "text") if isinstance(p, dict)]
        vues = next((nombre_vues(t) for t in textes if nombre_vues(t)), 0)
        age = next((age_jours(t) for t in textes if "il y a" in t), None)
        out.append({"i": i, "t": titre, "du_s": du, "vues": vues, "age": age})
    for v in parcourir(d, "playlistVideoRenderer"):   # ancien format, au cas où
        i = v.get("videoId")
        if i:
            out.append({"i": i, "t": "".join(r.get("text", "") for r in (v.get("title") or {}).get("runs", [])),
                        "du_s": int(v.get("lengthSeconds") or 0), "vues": 0, "age": None})
    return out


def identifiant_chaine(src, cache):
    if src.get("chaine_id"):
        return src["chaine_id"]
    if src["id"] in cache:
        return cache[src["id"]]
    html = telecharger(src["url"])
    m = re.search(r'"externalId":"(UC[\w-]{22})"', html) or re.search(r'itemprop="identifier" content="(UC[\w-]{22})"', html) \
        or re.search(r'"channelId":"(UC[\w-]{22})"', html)
    if m:
        cache[src["id"]] = m.group(1)
        return m.group(1)
    return None




def recherche_youtube(q):
    """Vidéos d'une recherche YouTube (première page) : id, titre, durée, vues, âge, chaîne et son identifiant."""
    d = donnees_initiales(telecharger("https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": q, "sp": "EgIQAQ%3D%3D", "hl": "fr", "gl": "FR"})))
    out = []
    txt = lambda o: (o or {}).get("simpleText") or "".join(r.get("text", "") for r in (o or {}).get("runs", []))
    for v in parcourir(d, "videoRenderer"):
        i = v.get("videoId")
        if not i or not re.fullmatch(r"[\w-]{11}", i):
            continue
        owner = ((v.get("ownerText") or {}).get("runs") or [{}])[0]
        uc = ((owner.get("navigationEndpoint") or {}).get("browseEndpoint") or {}).get("browseId", "")
        out.append({"i": i, "t": txt(v.get("title")), "du_s": secondes(txt(v.get("lengthText"))), "vues": nombre_vues(txt(v.get("viewCountText"))),
                    "age": age_jours(txt(v.get("publishedTimeText"))), "chaine": owner.get("text", ""), "uc": uc})
    return out


# ---------------------------------------------------------------- données
def charger_stock(depot):
    s = lire(f"{depot}/data/stock.json", {}) or {}
    for k, v in (("items", []), ("ecartes", []), ("rotation", {}), ("ids", {})):
        s.setdefault(k, v)
    return s


def ecrire_stock(depot, stock):
    stock["maj"] = aujourdhui().isoformat()
    ecrire(f"{depot}/data/stock.json", stock)


def prive_(chemin):
    if not chemin or not os.path.isdir(chemin):
        sys.exit("--prive DOSSIER (yo1tv/ du dépôt privé) est obligatoire pour cette commande")
    return chemin


def charger_sources(prive):
    return {s["id"]: s for s in lire(f"{prive}/sources.json", []) or []}


def ecrire_sources(prive, srcs):
    ecrire(f"{prive}/sources.json", sorted(srcs.values(), key=lambda s: (s.get("cat", ""), s["id"])), compact=False)


def vus_recents(prive, jour=None):
    jour = jour or aujourdhui()
    limite = (jour - timedelta(days=VUS_JOURS)).isoformat()
    return {i for i, d in (lire(f"{prive}/vus.json", {}) or {}).items() if d >= limite}


def poids_source(src):
    """Poids effectif d'une chaîne (0 = exclue) : priorité choisie, sinon poids de la liste, puis votes « chaîne » cumulés."""
    if not src:
        return 1.0
    if src.get("actif") is False or src.get("masquee"):
        return 0.0
    v = max(-3, min(3, int(src.get("vote") or 0)))
    base = float(src.get("prio") or src.get("poids") or 1)
    return base * VOTE_CHAINE[v] * 1.06 ** max(-5, min(5, float(src.get("votes_contenus") or 0)))


def motifs_artistes(prive):
    """[(nom, motif, score)] tirés de artistes.json ({"Nom": {"score": n, "alias": [...], "o": "humour"}}), plus les
    humoristes de humoristes.json (score 0 tant qu'aucun vote ne les concerne) pour reconnaître les artistes des contenus notés."""
    out = []
    arts = dict(lire(f"{prive}/artistes.json", {}) or {})
    for h in (lire(f"{prive}/humoristes.json", {}) or {}).get("liste", []):
        if h["nom"] not in arts:
            arts[h["nom"]] = {"score": 0, "alias": h.get("alias") or []}
    for nom, a in arts.items():
        a = a if isinstance(a, dict) else {"score": a}
        noms = [n for n in [nom, *(a.get("alias") or [])] if len(sans_accent(n).strip()) >= 4]
        if noms:
            out.append((nom, re.compile(r"\b(" + "|".join(re.escape(sans_accent(n).strip()) for n in noms) + r")\b"), float(a.get("score") or 0)))
    return out


def score_artiste(x, motifs):
    """Somme des scores des artistes nommés dans le champ art ou le titre (None si aucun n'est connu)."""
    texte = sans_accent((x.get("art") or "") + " | " + (x.get("t") or ""))
    sc = [s for _, m, s in motifs if m.search(texte)]
    return sum(sc) if sc else None


def ligne_age(age):
    return f"{age // 365} an(s)" if age and age >= 365 else (f"{age} j" if age is not None else "?")


def ligne_vues(v):
    return f"{v / 1e6:.1f} M" if v >= 1e6 else f"{v // 1000} k"


# ---------------------------------------------------------------- collecte
def cmd_collecter(depot, prive):
    etendue, sortie = bool(arg("--etendue", False)), arg("--sortie", "/tmp/yo1tv-candidats.json")
    n_rot = int(arg("--n", 45))
    stock, srcs, jour = charger_stock(depot), charger_sources(prive), aujourdhui()
    connus = {x["i"] for x in stock["items"]} | set(stock["ecartes"]) | vus_recents(prive, jour)
    par_uc = {s.get("chaine_id"): s for s in srcs.values() if s.get("chaine_id")}
    suivies = [s for s in srcs.values() if s.get("actif", True) and s.get("suivie", True) and poids_source(s) > 0 and s.get("chaine_id")]
    hors_info = [s for s in suivies if s.get("cat") != "info"]
    info = [s for s in suivies if s.get("cat") == "info" or s.get("motif")]
    rot = sorted(hors_info, key=lambda s: (rotation_avancee(stock["rotation"].get(s["id"]), poids_source(s)), -poids_source(s), s["id"]))
    rot = rot if etendue else rot[:n_rot]
    par = PAR_CHAINE_ETENDUE if etendue else PAR_CHAINE
    taches = [("pop", s, "UULP" + s["chaine_id"][2:]) for s in rot]
    taches += [("neuf", s, "UU" + s["chaine_id"][2:]) for s in hors_info if not s.get("archives")]
    taches += [("info", s, "UU" + s["chaine_id"][2:]) for s in info]
    # humoristes de la liste (rotation) et artistes aimés : recherche YouTube
    hum = lire(f"{prive}/humoristes.json", {}) or {}
    hrot = hum.setdefault("rotation", {})
    noms = sorted(hum.get("liste", []), key=lambda h: (hrot.get(h["nom"], ""), h["nom"]))
    noms = noms if etendue else noms[:HUMORISTES_SEMAINE]
    arts = [(n, a) for n, a in (lire(f"{prive}/artistes.json", {}) or {}).items() if isinstance(a, dict) and float(a.get("score") or 0) >= 1]
    arts = sorted(arts, key=lambda na: -float(na[1].get("score") or 0))[:ARTISTES_MAX]
    deja = {sans_accent(h["nom"]) for h in noms}
    rech = [("hum", h["nom"], h.get("alias") or [], "humour") for h in noms]
    rech += [("art", n, a.get("alias") or [], a.get("o") or "humour") for n, a in arts if sans_accent(n) not in deja]

    def liste(t):
        sorte, s, pl = t
        try:
            return t, liste_youtube(pl), None
        except Exception as e:  # noqa: BLE001 — réseau : on note et on continue
            return t, [], str(e)[:80]

    def cherche(r):
        try:
            return r, recherche_youtube(r[1]), None
        except Exception as e:  # noqa: BLE001
            return r, [], str(e)[:80]

    cands, erreurs, vus_ici = [], [], set()

    def ajouter(v, sorte, src, o, art=None, chaine=None, sid=None):
        if v["i"] in connus or v["i"] in vus_ici or est_jeu(v.get("t")):
            return False
        vus_ici.add(v["i"])
        c = {**{k: v[k] for k in ("i", "t", "du_s", "vues", "age")}, "k": sorte, "c": chaine or src["nom"], "sid": sid or src["id"], "o": o,
             "mixte": bool(src and src.get("mixte"))}
        if art:
            c["art"] = art
        cands.append(c)
        return True

    with cf.ThreadPoolExecutor(8) as ex:
        res_l = list(ex.map(liste, taches))
        res_r = list(ex.map(cherche, rech))
    motif_de = {s["id"]: re.compile(s["motif"], re.I) for s in srcs.values() if s.get("motif")}
    for (sorte, s, _), vids, err in res_l:
        if err:
            erreurs.append(f"{s['nom']} ({sorte}) : {err}")
            continue
        cat, pris = s.get("cat", "humour"), 0
        if sorte == "pop":
            stock["rotation"][s["id"]] = jour.isoformat()
            lim = par + 4 * int(max(0, min(2, poids_source(s) - 1)))
            for v in vids:
                if pris < lim and v["du_s"] >= DUREE_MIN.get(cat, DUREE_MIN_DEFAUT) and ajouter(v, "pop", s, cat):
                    pris += 1
        elif sorte == "neuf":
            for v in vids:
                if pris < NEUF_PAR and v["age"] is not None and v["age"] <= NEUF_JOURS and v["du_s"] >= DUREE_MIN.get(cat, DUREE_MIN_DEFAUT) \
                        and not DIRECT.search(v["t"]) and ajouter(v, "neuf", s, cat):
                    pris += 1
        else:   # info : analyses et entretiens de la semaine ; chroniques d'humour des chaînes mixtes (motif)
            m = motif_de.get(s["id"])
            for v in vids:
                if pris >= INFO_PAR + 4 or v["age"] is None or v["age"] > INFO_JOURS:
                    continue
                if s.get("cat") == "info" and v["du_s"] >= DUREE_MIN["info"] and not DIRECT.search(v["t"]) and ajouter(v, "info", s, "info"):
                    pris += 1
                elif m and m.search(v["t"]) and 90 <= v["du_s"] < 1800 and ajouter(v, "neuf", s, "humour"):
                    pris += 1
    for (sorte, nom, alias, o), vids, err in res_r:
        if err:
            erreurs.append(f"{nom} ({sorte}) : {err}")
            continue
        if sorte == "hum":
            hrot[nom] = jour.isoformat()
        motifs = [sans_accent(n) for n in [nom, *alias]]
        pris, lim = 0, (PAR_HUMORISTE_ETENDUE if etendue else PAR_HUMORISTE)
        for v in vids:
            if pris >= lim or v["du_s"] < 120 or not v["uc"].startswith("UC") or not any(m in sans_accent(v["t"]) for m in motifs):
                continue
            src = par_uc.get(v["uc"])
            if src and poids_source(src) == 0:
                continue
            if ajouter(v, sorte, src, (src or {}).get("cat") if src and src.get("cat") != "info" else o, art=nom,
                       chaine=src["nom"] if src else v["chaine"], sid=src["id"] if src else "ext-" + v["uc"]):
                pris += 1
    ecrire(sortie, cands)
    ecrire_stock(depot, stock)
    if hum.get("liste"):
        ecrire(f"{prive}/humoristes.json", hum, compact=False)
    par_sorte = {}
    for c in cands:
        par_sorte[c["k"]] = par_sorte.get(c["k"], 0) + 1
    print(f"# {len(cands)} candidates {par_sorte} ; {len(taches)} listes, {len(rech)} recherches, {len(erreurs)} erreurs ; détail : {sortie}")
    print("# id | sorte | chaîne | catégorie de la chaîne | durée | vues | âge | titre  [artiste cherché]")
    try:
        for c in sorted(cands, key=lambda c: (c["k"], c["sid"])):
            print(f"{c['i']} | {c['k']} | {c['c']}{' (hors liste)' if c['sid'].startswith('ext-') else ''} | {c['o']}{' (mixte)' if c['mixte'] else ''} | "
                  f"{fmt_du(c['du_s'])} | {ligne_vues(c['vues'])} | {ligne_age(c['age'])} | {c['t']}" + (f"  [{c['art']}]" if c.get("art") else ""))
        for e in erreurs:
            print("# erreur :", e)
    except BrokenPipeError:
        pass


def rotation_avancee(jour, poids):
    """Date de dernière exploration, avancée de deux semaines par point de poids au-dessus de 1 : une chaîne aimée revient plus souvent."""
    if not jour:
        return ""
    try:
        return (date.fromisoformat(jour) - timedelta(days=int(14 * (max(1, min(3, poids)) - 1)))).isoformat()
    except ValueError:
        return jour


def cmd_integrer(depot, decisions, candidats):
    dec, cands = lire(decisions, {}) or {}, {c["i"]: c for c in lire(candidats, []) or []}
    stock, jour = charger_stock(depot), aujourdhui()
    dans = {x["i"] for x in stock["items"]}
    gardes, par = 0, {}
    for g in dec.get("garder", []):
        c = cands.get(g.get("i"))
        if not c or c["i"] in dans:
            continue
        o = ANCIENNES.get(g.get("o"), g.get("o"))
        o = o if o in CATS else c["o"] if c["o"] in CATS else "divertissement"
        x = {"i": c["i"], "t": c["t"], "c": c["c"], "sid": c["sid"], "o": o, "du": fmt_du(c["du_s"]),
             "q": max(1, min(3, int(g.get("q", 2)))), "vues": c["vues"], "ajoute": jour.isoformat()}
        if c["k"] in ("pop", "hum", "art") and (c["age"] is None or c["age"] > 30):
            x["pep"] = 1          # archive choisie (pépite) ; les sorties récentes n'ont pas la marque
        if c["age"] is not None:
            x["d"] = (jour - timedelta(days=c["age"])).isoformat()
        for k, n in (("th", 60), ("art", 80)):
            if g.get(k):
                x[k] = str(g[k])[:n]
        if g.get("dodo") and c["du_s"] >= DODO_MIN:
            x["dodo"] = 1
        if g.get("sp"):
            x["sp"], x["th"] = 1, x.get("th") or "spectacle"
        if str(c["sid"]).startswith("ext-"):
            x["ext"] = 1
        if g.get("echo"):
            x["echo"], x["echo_fin"] = str(g["echo"])[:120], (jour + timedelta(days=int(g.get("echo_jours", 7)))).isoformat()
        stock["items"].append(x)
        dans.add(x["i"])
        gardes += 1
        par[o] = par.get(o, 0) + 1
    stock["ecartes"] = (stock["ecartes"] + [i for i in cands if i not in dans])[-ECARTES_MAX:]
    elaguer(stock, jour)
    ecrire_stock(depot, stock)
    print(f"{gardes} vidéos ajoutées {par} ; {resume_stock(stock)} ; écartées connues : {len(stock['ecartes'])}")


def elaguer(stock, jour):
    """L'info vieillit : retirée du stock après 21 jours. Puis, au-delà de STOCK_MAX, les moins bonnes et les plus anciennes."""
    lim = (jour - timedelta(days=21)).isoformat()
    stock["items"] = [x for x in stock["items"] if x["o"] != "info" or (x.get("d") or x.get("ajoute", "")) >= lim]
    if len(stock["items"]) > STOCK_MAX:
        stock["items"].sort(key=lambda x: x.get("ajoute", ""), reverse=True)
        stock["items"].sort(key=lambda x: -x.get("q", 1))
        stock["items"] = stock["items"][:STOCK_MAX]


def resume_stock(stock):
    par = {}
    for x in stock["items"]:
        n, h = par.get(x["o"], (0, 0))
        par[x["o"]] = (n + 1, h + duree(x) / 3600)
    return "stock : " + ", ".join(f"{o} {n} ({h:.0f} h)" for o, (n, h) in sorted(par.items()))


def cmd_stock(depot):
    o, sans_art, depuis = arg("--o"), bool(arg("--sans-art", False)), arg("--depuis")
    stock = charger_stock(depot)
    print("# id | catégorie | chaîne | durée | q | thème | artiste | titre")
    try:
        for x in sorted(stock["items"], key=lambda x: (x["o"], x.get("sid", ""))):
            if (o and x["o"] != o) or (sans_art and x.get("art")) or (depuis and x.get("ajoute", "") < depuis):
                continue
            print(f"{x['i']} | {x['o']}{' dodo' if x.get('dodo') else ''}{' sp' if x.get('sp') else ''} | {x.get('c', '')} | {x.get('du', '?')} | "
                  f"{x.get('q', 2)} | {x.get('th', '')} | {x.get('art', '')} | {x.get('t', '')}")
    except BrokenPipeError:
        pass


def cmd_reclasser(depot, fichier):
    dec, stock = lire(fichier, {}) or {}, charger_stock(depot)
    n = r = 0
    garder = []
    for x in stock["items"]:
        d = dec.get(x["i"])
        if d == "retirer":
            stock["ecartes"].append(x["i"])
            r += 1
            continue
        if isinstance(d, dict):
            o = ANCIENNES.get(d.get("o"), d.get("o"))
            if o in CATS:
                x["o"] = o
            if d.get("q") in (1, 2, 3):
                x["q"] = d["q"]
            for k in ("th", "art"):
                if d.get(k):
                    x[k] = str(d[k])[:80]
            for k in ("dodo", "sp"):
                if k in d:
                    if d[k]:
                        x[k] = 1
                    else:
                        x.pop(k, None)
            n += 1
        garder.append(x)
    stock["items"] = garder
    for x in stock["items"]:   # anciennes catégories encore présentes
        x["o"] = ANCIENNES.get(x["o"], x["o"])
        if x["o"] not in CATS:
            x["o"] = "divertissement"
    ecrire_stock(depot, stock)
    print(f"{n} vidéos reclassées, {r} retirées ; {resume_stock(stock)}")


# ---------------------------------------------------------------- retours de la tablette
def cmd_retours(depot, prive, fichier):
    """État cumulé envoyé par la tablette : on le rejoue en entier (idempotent), sauf les vues, qui s'accumulent."""
    r = lire(fichier, {}) or {}
    if not r:
        sys.exit(f"retours illisibles : {fichier}")
    srcs, stock, jour = charger_sources(prive), charger_stock(depot), aujourdhui()
    par_id = {x["i"]: x for x in stock["items"]}
    vus = lire(f"{prive}/vus.json", {}) or {}
    journal = lire(f"{prive}/journal.json", {}) or {}
    noms, faits, a_juger = r.get("noms") or {}, [], []
    # 1. vues et « déjà vu » (90 jours), contenus « bof » (90 jours aussi)
    n0 = len(vus)
    for e in r.get("vus") or []:
        i, d = (e[0], e[1]) if isinstance(e, list) else (e, r.get("date") or jour.isoformat())
        if re.fullmatch(r"[\w-]{11}", str(i)) and d > vus.get(i, ""):
            vus[i] = d
    for i in r.get("deja_vu") or []:
        vus[i] = max(vus.get(i, ""), r.get("date") or jour.isoformat())
    for c in r.get("contenus") or []:
        if c.get("v", 0) < 0:
            vus[c["i"]] = max(vus.get(c["i"], ""), r.get("date") or jour.isoformat())
    faits.append(f"{len(vus) - n0} vues nouvelles")

    def source(sid):
        if sid in srcs:
            return srcs[sid]
        if sid.startswith("ext-UC"):   # chaîne hors liste (recherche par artiste) : suivie seulement si elle est aimée
            srcs[sid] = {"id": sid, "nom": noms.get(sid) or next((x["c"] for x in stock["items"] if x.get("sid") == sid), sid),
                         "chaine_id": sid[4:], "url": f"https://www.youtube.com/channel/{sid[4:]}", "suivie": False, "poids": 1}
            return srcs[sid]
        return None
    # 2. votes « chaîne » cumulés (−3 … +3), priorités, chaînes retirées et masquées : l'état envoyé fait foi
    for s in srcs.values():
        s.pop("masquee", None)
    for sid, v in (r.get("chaines_vote") or {}).items():
        s = source(sid)
        if s is not None and s.get("vote") != v:
            s["vote"] = max(-3, min(3, int(v)))
            faits.append(f"{s['nom']} : vote chaîne {v:+d}")
    for sid, v in (r.get("votes") or {}).items():
        s = source(sid)
        if s is not None:
            s["votes_contenus"] = v
    for sid, p in (r.get("priorites") or {}).items():
        s = source(sid)
        if s is not None and s.get("prio") != p:
            s["prio"] = p
            faits.append(f"{s['nom']} : priorité {p}")
    for sid in r.get("masquees") or []:
        s = source(sid)
        if s is not None:
            s["masquee"] = True
    avant = set(journal.get("supprimees", []))
    maint = set(r.get("supprimees") or [])
    for sid in maint - avant:
        s = source(sid)
        if s is not None:
            s["actif"], s["note"] = False, f"retirée depuis YO1tv le {jour.isoformat()}"
            faits.append(f"{s['nom']} retirée")
    for sid in avant - maint:
        s = srcs.get(sid)
        if s is not None:
            s["actif"] = True
            s.pop("note", None)
            faits.append(f"{s['nom']} rétablie")
    journal["supprimees"] = sorted(maint)
    # une chaîne hors liste aimée entre dans les chaînes suivies
    for s in srcs.values():
        if s.get("suivie") is False and int(s.get("vote") or 0) >= 1:
            s["suivie"], s["ajoutee"] = True, jour.isoformat()
            cats = [x["o"] for x in stock["items"] if x.get("sid") == s["id"]]
            s["cat"] = max(set(cats), key=cats.count) if cats else "humour"
            faits.append(f"{s['nom']} ajoutée aux chaînes suivies ({s['cat']})")
    # 3. corrections de catégorie : la vidéo tout de suite ; la catégorie de la chaîne après 3 corrections dans le même sens
    sens = {}
    for c in r.get("corrections") or []:
        vers = ANCIENNES.get(c.get("vers"), c.get("vers"))
        x = par_id.get(c.get("i"))
        if vers in CATS and x and x["o"] != vers:
            x["o"] = vers
            faits.append(f"« {x['t'][:40]} » → {vers}")
        if vers in CATS and c.get("sid"):
            sens.setdefault(c["sid"], []).append(vers)
    for sid, l in sens.items():
        s, top = srcs.get(sid), max(set(l), key=l.count)
        if s and not s.get("mixte") and l.count(top) >= 3 and l.count(top) / len(l) >= .75 and s.get("cat") != top:
            faits.append(f"{s['nom']} : catégorie {s.get('cat')} → {top}")
            s["cat"] = top
    # 4. goûts par artiste : recalculés depuis l'état cumulé quand l'artiste du contenu est connu
    arts = lire(f"{prive}/artistes.json", {}) or {}
    motifs = motifs_artistes(prive)
    somme = {}
    for c in r.get("contenus") or []:
        x = par_id.get(c.get("i")) or {"t": c.get("t", "")}
        texte = sans_accent((x.get("art") or "") + " | " + (x.get("t") or c.get("t", "")))
        trouves = [nom for nom, m, _ in motifs if m.search(texte)] or [a.strip() for a in (x.get("art") or "").split(",") if a.strip()]
        if not trouves:
            a_juger.append(c)
        for nom in trouves:
            somme[nom] = somme.get(nom, 0) + (1 if c.get("v", 0) > 0 else -1)
    for nom, sc in somme.items():
        if nom not in arts and sc == 0:
            continue
        a = arts.get(nom)
        if not isinstance(a, dict):
            a = arts[nom] = {"score": a or 0, "o": "humour"}
        nv = max(-3, min(5, sc))
        if a.get("score") != nv:
            a["score"], a["maj"] = nv, jour.isoformat()
            faits.append(f"artiste {nom} : {nv:+g}")
    ecrire(f"{prive}/artistes.json", arts, compact=False)
    ecrire(f"{prive}/vus.json", dict(sorted(vus.items())))
    ecrire_sources(prive, srcs)
    ecrire_stock(depot, stock)
    journal["dernier"] = os.path.basename(fichier)
    journal.setdefault("historique", []).append({"date": jour.isoformat(), "fichier": os.path.basename(fichier), "resume": " ; ".join(faits)[:1500]})
    journal["historique"] = journal["historique"][-60:]
    ecrire(f"{prive}/journal.json", journal, compact=False)
    print("Retours :", " ; ".join(faits) or "rien de nouveau")
    if a_juger:
        print(f"# {len(a_juger)} contenus notés sans artiste connu (à juger : artiste(s) dans artistes.json) :")
        for c in a_juger:
            print(f"{c.get('i')} | {'+1' if c.get('v', 0) > 0 else '-1'} | {c.get('c', '')} | {c.get('o', '')} | {c.get('t', '')}")


# ---------------------------------------------------------------- programmation de la semaine
CHAMPS_PAGE = ("t", "c", "sid", "o", "du", "q", "pep", "th", "art", "sp", "dodo", "d", "echo", "echo_fin", "ext")


def artistes_de(x):
    return [sans_accent(a.strip()) for a in (x.get("art") or "").split(",") if a.strip()]


def panacher(seq, ecart_src=4, ecart_art=3, regard=30):
    """Ordre final : on suit l'ordre pondéré, mais jamais la même chaîne dans les `ecart_src` dernières vidéos
    ni le même artiste dans les `ecart_art` dernières (quand c'est possible dans les `regard` suivantes)."""
    out, reste = [], list(seq)
    while reste:
        s_rec = {x["sid"] for x in out[-ecart_src:]}
        a_rec = {a for x in out[-ecart_art:] for a in artistes_de(x)}
        k = next((j for j, x in enumerate(reste[:regard]) if x["sid"] not in s_rec and not (set(artistes_de(x)) & a_rec)), None)
        if k is None:
            k = next((j for j, x in enumerate(reste[:regard]) if x["sid"] != (out[-1]["sid"] if out else None)), 0)
        out.append(reste.pop(k))
    return out


def cmd_programmer(depot, prive):
    jour = date.fromisoformat(arg("--date") or aujourdhui().isoformat())
    stock, srcs = charger_stock(depot), charger_sources(prive)
    exclus, motifs = vus_recents(prive, jour), motifs_artistes(prive)
    canaux, total, details = {}, {}, {}
    dispo = []
    for x in stock["items"]:
        if x["i"] in exclus or x["o"] not in CATS:
            continue
        ps = poids_source(srcs.get(x.get("sid")))
        sa = score_artiste(x, motifs)
        if ps == 0 or (sa is not None and sa <= -2):
            continue
        w = Q_POIDS.get(x.get("q", 2), 1.8) * ps * (PEPITE_BONUS if x.get("pep") else 1) * (1.25 ** max(-1, min(4, sa or 0)))
        if x.get("echo") and (x.get("echo_fin") or "") >= jour.isoformat():
            w *= 2
        if x.get("sp"):
            w *= .6          # spectacles entiers : un de temps en temps au milieu des sketchs
        if x["o"] == "info":
            age = (jour - date.fromisoformat(x.get("d") or x.get("ajoute") or jour.isoformat())).days
            if age > INFO_FRAICHEUR:
                continue
            w /= 1 + max(0, age) / 4
        dispo.append((x, w))
    for o in CATS:
        pool = sorted(((alea(jour, o, x["i"]) ** (1 / w), x) for x, w in dispo if x["o"] == o), key=lambda kx: -kx[0])
        pris, t = [], 0
        for _, x in pool:
            if o != "info" and t >= CIBLE_S:
                break
            if o != "info" and t + duree(x) > PLAFOND_S:
                continue
            pris.append(x)
            t += duree(x)
        canaux[o] = [x["i"] for x in panacher(pris)]
        total[o] = round(t / 3600, 1)
        details[o] = (len(pris), sum(1 for x in pris if x.get("pep")), len(pool))
    dodo = [x["i"] for x in stock["items"] if x.get("dodo") and poids_source(srcs.get(x.get("sid"))) > 0]
    # À la carte : tout ce qui est disponible (pas seulement les playlists), plus le fonds dodo
    ids = {x["i"] for x, _ in dispo} | set(dodo)
    semaine_avant = (jour - timedelta(days=7)).isoformat()
    items = {}
    for x in stock["items"]:
        if x["i"] in ids:
            e = {k: x[k] for k in CHAMPS_PAGE if x.get(k) not in (None, "", 0)}
            if x.get("ajoute", "") > semaine_avant:
                e["n"] = 1   # nouveau cette semaine
            items[x["i"]] = e
    out = {"semaine": jour.isoformat(), "genere": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "heures": total, "canaux": canaux, "dodo": dodo, "items": items}
    ecrire(f"{depot}/data/semaine.json", out)
    for o in CATS:
        n, p, d = details[o]
        print(f"{o:15} {total[o]:5.1f} h  {n:4} vidéos (dont {p} pépites) sur {d} disponibles" + ("  ← moins de 40 h" if o != "info" and total[o] < 40 else ""))
    print(f"dodo : {len(dodo)} ; à la carte : {len(items)} vidéos ; exclues (vues depuis {VUS_JOURS} j) : {len(exclus)}")


# ---------------------------------------------------------------- dodo, exclusions, adoption
DODO_MIN = 1200   # 20 min
SPECTACLE_MIN = 2400   # 40 min
# Titres à écarter du programme dodo (sujets violents ou angoissants), même dans les listes choisies.
DODO_EXCLU = re.compile(r"guerre|crime|criminel|meurtr|tueur|mafia|attentat|terroris|nazi|hitler|staline|génocide|massacre|catastrophe"
                        r"|horreur|terreur|prison|drogue|enquête|choc|démon|cancer|maladie|amiante|épave|élection|replay live|🔴", re.I)


def marquer_spectacles(stock):
    """Spectacles entiers (catégorie à part dans YO1tv, en plus de l'humour) : thème « spectacle », ou stand-up de 40 min et plus."""
    for x in stock["items"]:
        th = (x.get("th") or "").lower()
        if not x.get("sp") and x["o"] in ("humour", "divertissement") and secondes(x.get("du")) >= SPECTACLE_MIN \
                and (th == "spectacle" or th == "stand-up"):
            x["sp"] = 1


def cmd_dodo(depot):
    """Les listes de sources-dodo.json sont déjà choisies par leurs éditeurs : pas de tri par IA, seulement la durée."""
    stock, jour = charger_stock(depot), datetime.now(PARIS).date().isoformat()
    par_id = {x["i"]: x for x in stock["items"]}
    ajout = marque = 0
    srcs = lire(f"{depot}/data/sources-dodo.json", []) or []
    with cf.ThreadPoolExecutor(5) as ex:
        res = list(ex.map(lambda s: (s, liste_youtube(s["liste"])), srcs))
    for src, vids in res:
        for v in vids:
            if v["du_s"] < src.get("min", DODO_MIN) or DODO_EXCLU.search(v["t"]):
                continue
            x = par_id.get(v["i"])
            if x:
                if not x.get("dodo"):
                    x["dodo"], marque = 1, marque + 1
                continue
            x = {"i": v["i"], "t": v["t"], "c": src["nom"], "sid": src["sid"], "o": src.get("o", "decouverte"), "du": fmt_du(v["du_s"]),
                 "q": 2, "vues": v["vues"], "ajoute": jour, "pep": 1, "dodo": 1, "th": src["th"]}
            if src.get("prio", 1) > 1:
                x["dodo_prio"] = 1
            stock["items"].append(x)
            par_id[x["i"]] = x
            ajout += 1
    # pépites déjà en stock qui conviennent : découverte de 20 min et plus des sources « dodo »
    sids = {s["sid"] for s in srcs}
    for x in stock["items"]:
        if not x.get("dodo") and x.get("sid") in sids and x["o"] in ("decouverte", "savoir") and secondes(x.get("du")) >= DODO_MIN \
                and x.get("th") not in ("reportage", "enquête", "géopolitique") and not DODO_EXCLU.search(x["t"]):
            x["dodo"], marque = 1, marque + 1
    for x in stock["items"]:   # retrait des sujets angoissants marqués auparavant
        if x.get("dodo") and DODO_EXCLU.search(x["t"]):
            del x["dodo"]
            x.pop("dodo_prio", None)
    marquer_spectacles(stock)
    ecrire(f"{depot}/data/stock.json", stock)
    d = [x for x in stock["items"] if x.get("dodo")]
def cmd_exclure(prive, fichier):
    ids, jours = lire(fichier, []) or [], int(arg("--jours", 0))
    vus, d = lire(f"{prive}/vus.json", {}) or {}, (aujourdhui() - timedelta(days=jours)).isoformat()
    n = 0
    for i in ids:
        if re.fullmatch(r"[\w-]{11}", str(i)) and vus.get(i, "") < d:
            vus[i], n = d, n + 1
    ecrire(f"{prive}/vus.json", dict(sorted(vus.items())))
    print(f"{n} identifiants exclus jusqu'au {(date.fromisoformat(d) + timedelta(days=VUS_JOURS)).isoformat()} ; vus.json : {len(vus)}")


def cmd_adopter(depot, ancien, nouveau):
    """Une chaîne hors liste (ext-UC…) vient d'être ajoutée aux sources sous l'identifiant `nouveau` : ses vidéos le prennent."""
    stock, n = charger_stock(depot), 0
    for x in stock["items"]:
        if x.get("sid") == ancien:
            x["sid"] = nouveau
            x.pop("ext", None)
            n += 1
    ecrire_stock(depot, stock)
    print(f"{n} vidéos de {ancien} rattachées à {nouveau}")


def main():
    depot, prive = arg("--depot", DEPOT), arg("--prive")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    c, a = sys.argv[1], sys.argv[2:]
    if c == "collecter":
        cmd_collecter(depot, prive_(prive))
    elif c == "integrer" and len(a) == 2:
        cmd_integrer(depot, *a)
    elif c == "stock":
        cmd_stock(depot)
    elif c == "reclasser" and len(a) == 1:
        cmd_reclasser(depot, a[0])
    elif c == "retours" and len(a) == 1:
        cmd_retours(depot, prive_(prive), a[0])
    elif c == "programmer":
        cmd_programmer(depot, prive_(prive))
    elif c == "dodo":
        cmd_dodo(depot)
    elif c == "exclure" and len(a) == 1:
        cmd_exclure(prive_(prive), a[0])
    elif c == "adopter" and len(a) == 2:
        cmd_adopter(depot, *a)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
