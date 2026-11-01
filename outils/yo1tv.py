#!/usr/bin/env python3
"""YO1tv — collecte et programmation, sans IA (bibliothèque standard de Python seulement).

Commandes (toutes acceptent --depot DOSSIER, racine du dépôt YO1tv, par défaut le dossier parent de ce script) :
  jour CATALOGUE DATE      catalogue du jour de la Vigie (document videos/DATE de sa base) → data/DATE.json, data/index.json,
                           puis grilles data/grilles/DATE.json. Appelée chaque matin par la tâche « YO1tv — publication du matin ».
  grilles DATE             recalcule seulement les grilles du jour.
  candidats [--n 45 | --toutes] [--par 12] [--sortie F]
                           pépites possibles : vidéos longues les plus populaires (liste YouTube « UULP ») des chaînes
                           hors actualité ; affiche une ligne par candidate et écrit le détail dans F (JSON).
  dodo                     fonds « dodo » : documentaires calmes de 20 min ou plus tirés des listes de data/sources-dodo.json
                           (42 d'ARTE, Balade Mentale, documentaires ARTE), versés au stock avec la marque dodo (sans IA).
  contexte                 titres d'actualité des 7 derniers catalogues (pour repérer les archives qui y font écho).
  integrer DECISIONS CANDIDATS
                           ajoute au stock (data/stock.json) les pépites retenues ; les autres candidates sont écartées
                           pour ne pas être réexaminées.
Format des grilles : {"date", "genere", "canaux": {"mix": [[id, durée_s, drapeau?], …], …}} ; drapeau 1 = rediffusion.
"""
import concurrent.futures as cf
import glob
import hashlib
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
DEPOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NON_ACTU = ("decouverte", "culture", "humour", "divertissement")
PERISSABLE = ("actu", "analyse")
JOUR_S = 86400
DUREE_COURT, DUREE_INCONNUE = 40, 600
DUREE_MIN_PEPITE = 240          # « formats longs » : on écarte Shorts et extraits de moins de 4 min
PAR_CHAINE = 12                 # candidates examinées par chaîne et par passage
STOCK_MAX, ECARTES_MAX = 2500, 30000
REPOS_STOCK = 21                # une pépite ne repasse pas avant 21 jours
CHAMPS_PRIVES = ("b", "s")      # orientation politique, score interne


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


def ecrire(chemin, obj, compact=True):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 1)
    os.replace(chemin + ".tmp", chemin)


def secondes(du):
    s = 0
    for p in str(du or "").split(":"):
        s = s * 60 + (int(p) if p.isdigit() else 0)
    return s


def duree(x):
    return DUREE_COURT if x.get("co") else (secondes(x.get("du")) or DUREE_INCONNUE)


def fmt_du(s):
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def alea(*cles):
    """Nombre pseudo-aléatoire stable dans [0, 1) : même date, même résultat."""
    return int(hashlib.sha1("|".join(map(str, cles)).encode()).hexdigest()[:8], 16) / 0x100000000


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


# ---------------------------------------------------------------- stock de pépites
def charger_stock(depot):
    s = lire(f"{depot}/data/stock.json", {}) or {}
    for k, v in (("items", []), ("ecartes", []), ("rotation", {}), ("ids", {})):
        s.setdefault(k, v)
    return s


def sources_pepites(depot):
    chaines = [c for c in lire(f"{depot}/data/chaines.json", []) if c.get("onglet") in NON_ACTU and c.get("actif", True)]
    return chaines + (lire(f"{depot}/data/sources-pepites.json", []) or [])


def cmd_candidats(depot):
    n, toutes, sortie = int(arg("--n", 45)), bool(arg("--toutes", False)), arg("--sortie", "/tmp/yo1tv-candidats.json")
    par_chaine = int(arg("--par", PAR_CHAINE))
    stock = charger_stock(depot)
    connus = {x["i"] for x in stock["items"]} | set(stock["ecartes"])
    srcs = sources_pepites(depot)
    if not toutes:   # rotation : les chaînes les moins récemment explorées d'abord, les plus importantes en premier
        srcs.sort(key=lambda c: (stock["rotation"].get(c["id"], ""), -c.get("poids", 1), c["id"]))
        srcs = srcs[:n]

    def une(src):
        try:
            uc = identifiant_chaine(src, stock["ids"])
            if not uc:
                return src, [], "identifiant introuvable"
            return src, liste_youtube("UULP" + uc[2:]), None
        except Exception as e:  # noqa: BLE001
            return src, [], str(e)[:80]

    cands, erreurs, jour = [], [], datetime.now(PARIS).date().isoformat()
    with cf.ThreadPoolExecutor(6) as ex:
        for src, vids, err in ex.map(une, srcs):
            if err:
                erreurs.append(f"{src['nom']} : {err}")
                continue
            stock["rotation"][src["id"]] = jour
            pris = 0
            for v in vids:
                if v["i"] in connus or v["du_s"] < DUREE_MIN_PEPITE or pris >= par_chaine:
                    continue
                connus.add(v["i"])
                pris += 1
                cands.append({**v, "c": src["nom"], "sid": src["id"], "o": src.get("onglet", "humour"), "p": src.get("poids", 1),
                              "mixte": bool(src.get("mixte"))})
    ecrire(sortie, cands)
    ecrire(f"{depot}/data/stock.json", stock)
    print(f"# {len(cands)} candidates, {len(srcs)} chaînes explorées, {len(erreurs)} en erreur ; détail : {sortie}")
    print("# id | chaîne | catégorie de la chaîne | durée | vues | âge | titre")
    for c in cands:
        age = f"{c['age'] // 365} an(s)" if c["age"] and c["age"] >= 365 else (f"{c['age']} j" if c["age"] is not None else "?")
        vues = f"{c['vues'] / 1e6:.1f} M" if c["vues"] >= 1e6 else f"{c['vues'] // 1000} k"
        print(f"{c['i']} | {c['c']} | {c['o']}{' (mixte)' if c['mixte'] else ''} | {fmt_du(c['du_s'])} | {vues} | {age} | {c['t']}")
    for e in erreurs:
        print("# erreur :", e)


def cmd_integrer(depot, decisions, candidats):
    dec, cands = lire(decisions, {}), {c["i"]: c for c in lire(candidats, [])}
    stock, jour = charger_stock(depot), datetime.now(PARIS).date()
    dans = {x["i"] for x in stock["items"]}
    gardes = 0
    for g in dec.get("garder", []):
        c = cands.get(g.get("i"))
        if not c or c["i"] in dans:
            continue
        o = g.get("o") if g.get("o") in NON_ACTU else c["o"]
        x = {"i": c["i"], "t": c["t"], "c": c["c"], "sid": c["sid"], "o": o, "du": fmt_du(c["du_s"]),
             "q": max(1, min(3, int(g.get("q", 2)))), "vues": c["vues"], "ajoute": jour.isoformat(), "pep": 1}
        if g.get("th"):
            x["th"] = str(g["th"])[:60]
        if g.get("dodo") and c["du_s"] >= DODO_MIN:
            x["dodo"] = 1
        if g.get("sp"):
            x["sp"] = 1
        if g.get("echo"):
            x["echo"], x["echo_fin"] = str(g["echo"])[:120], (jour + timedelta(days=int(g.get("echo_jours", 7)))).isoformat()
        stock["items"].append(x)
        dans.add(x["i"])
        gardes += 1
    marquer_spectacles(stock)
    stock["ecartes"] = (stock["ecartes"] + [i for i in cands if i not in dans])[-ECARTES_MAX:]
    if len(stock["items"]) > STOCK_MAX:   # on garde les meilleures, puis les plus récentes
        stock["items"].sort(key=lambda x: x.get("ajoute", ""), reverse=True)
        stock["items"].sort(key=lambda x: -x.get("q", 1))
        stock["items"] = stock["items"][:STOCK_MAX]
    stock["maj"] = jour.isoformat()
    ecrire(f"{depot}/data/stock.json", stock)
    par = {}
    for x in stock["items"]:
        par[x["o"]] = par.get(x["o"], 0) + 1
    print(f"{gardes} pépites ajoutées ; stock : {len(stock['items'])} ({par}) ; écartées connues : {len(stock['ecartes'])}")


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
            x = {"i": v["i"], "t": v["t"], "c": src["nom"], "sid": src["sid"], "o": "decouverte", "du": fmt_du(v["du_s"]),
                 "q": 2, "vues": v["vues"], "ajoute": jour, "pep": 1, "dodo": 1, "th": src["th"]}
            if src.get("prio", 1) > 1:
                x["dodo_prio"] = 1
            stock["items"].append(x)
            par_id[x["i"]] = x
            ajout += 1
    # pépites déjà en stock qui conviennent : découverte de 20 min et plus des sources « dodo »
    sids = {s["sid"] for s in srcs}
    for x in stock["items"]:
        if not x.get("dodo") and x.get("sid") in sids and x["o"] == "decouverte" and secondes(x.get("du")) >= DODO_MIN \
                and x.get("th") not in ("reportage", "enquête", "géopolitique") and not DODO_EXCLU.search(x["t"]):
            x["dodo"], marque = 1, marque + 1
    for x in stock["items"]:   # retrait des sujets angoissants marqués auparavant
        if x.get("dodo") and DODO_EXCLU.search(x["t"]):
            del x["dodo"]
            x.pop("dodo_prio", None)
    marquer_spectacles(stock)
    ecrire(f"{depot}/data/stock.json", stock)
    d = [x for x in stock["items"] if x.get("dodo")]
    print(f"Dodo : {ajout} ajoutées, {marque} marquées ; fonds dodo : {len(d)} vidéos, {sum(secondes(x['du']) for x in d) / 3600:.1f} h")


def cmd_contexte(depot):
    idx = (lire(f"{depot}/data/index.json", {}) or {}).get("jours", [])[:7]
    vus, lignes = set(), []
    for j in idx:
        for x in (lire(f"{depot}/data/{j}.json", {}) or {}).get("items", []):
            if x.get("o") in PERISSABLE and x["i"] not in vus:
                vus.add(x["i"])
                lignes.append((-(x.get("p", 1) + 2 * x.get("sel", 0)), j, x["t"]))
    try:
        for _, j, t in sorted(lignes)[:70]:
            print(j, "|", t)
    except BrokenPipeError:
        pass


# ---------------------------------------------------------------- publication du jour
def cmd_jour(depot, catalogue, jour):
    cat = lire(catalogue)
    if not cat or not isinstance(cat.get("items"), list):
        sys.exit(f"Catalogue illisible : {catalogue}")
    items = [{k: v for k, v in x.items() if k not in CHAMPS_PRIVES} for x in cat["items"] if re.fullmatch(r"[\w-]{11}", x.get("i", ""))]
    ecrire(f"{depot}/data/{jour}.json", {"date": jour, "genere": cat.get("genere"), "n": len(items), "items": items})
    idx = lire(f"{depot}/data/index.json", {}) or {}
    jours = sorted({*idx.get("jours", []), jour}, reverse=True)[:8]
    ecrire(f"{depot}/data/index.json", {"jours": jours}, compact=False)
    for f in glob.glob(f"{depot}/data/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json"):
        if os.path.basename(f)[:10] not in jours:
            os.remove(f)
    print(f"Catalogue {jour} : {len(items)} vidéos ; index : {', '.join(jours)}")
    cmd_grilles(depot, jour)


def cmd_grilles(depot, jour):
    G = Grilles(depot, jour)
    canaux = {c: G.construire(c) for c in ("mix", "rire", "info", "savoir")}
    ecrire(f"{depot}/data/grilles/{jour}.json", {"date": jour, "genere": datetime.now(timezone.utc).isoformat(timespec="minutes"), "canaux": canaux})
    G.memoriser(canaux)
    garde = set((lire(f"{depot}/data/index.json", {}) or {}).get("jours", []))
    for f in glob.glob(f"{depot}/data/grilles/*.json"):
        if os.path.basename(f)[:10] not in garde and os.path.basename(f)[:10] != jour:
            os.remove(f)
    for c, l in canaux.items():
        tot = sum(x[1] for x in l)
        print(f"  {c:7s} {len(l):4d} programmes, {tot / 3600:4.1f} h, rediffusions {sum(1 for x in l if len(x) > 2)}, "
              f"pépites {sum(1 for x in l if G.fiche.get(x[0], {}).get('pep'))}")


class Grilles:
    """Grilles d'environ 24 h par canal, de minuit à minuit (Paris). YO1 Mix suit un rythme par tranche horaire :
    nuit calme ; matinale d'actu et de chroniques ; de 10 h à 22 h, un cycle équilibré (actu du jour et chroniques en tête,
    découverte, culture, divertissement, humour, pépites, formats courts) avec un « journal » à 13 h et à 20 h ; soirée de
    débats et de formats longs."""

    def __init__(self, depot, jour):
        self.depot, self.jour = depot, jour
        self.j = date.fromisoformat(jour)
        chaines = {c["id"]: c for c in lire(f"{depot}/data/chaines.json", [])}
        self.mixtes = {sid for sid, c in chaines.items() if c.get("mixte")}
        self.diffusions = lire(f"{depot}/data/diffusions.json", {}) or {}
        self.fiche, self.score = {}, {}
        idx = sorted((lire(f"{depot}/data/index.json", {}) or {}).get("jours", []), reverse=True)
        idx = [d for d in idx if d <= jour][:7]
        maintenant = datetime.combine(self.j, datetime.min.time(), PARIS) + timedelta(hours=6)
        for k, d in enumerate(idx):
            for x in (lire(f"{depot}/data/{d}.json", {}) or {}).get("items", []):
                if x["i"] in self.fiche or (k > 0 and x.get("o") in PERISSABLE) or x.get("o") not in PERISSABLE + NON_ACTU:
                    continue
                self.fiche[x["i"]] = x
                try:
                    age_h = (maintenant - datetime.fromisoformat(x["d"])).total_seconds() / 3600
                except (KeyError, ValueError):
                    age_h = 48
                s = x.get("p", 1) + 1.5 * x.get("sel", 0) + max(0.0, 1 - max(age_h, 0) / 48) - (0.5 if k else 0)
                if x["i"] in self.diffusions and self.diffusions[x["i"]] < jour:
                    s -= 1.5       # déjà programmée un jour précédent
                self.score[x["i"]] = s + 0.4 * alea(jour, x["i"])
        for x in charger_stock(depot)["items"]:
            der = self.diffusions.get(x["i"])
            if x["i"] in self.fiche or (der and der < jour and (self.j - date.fromisoformat(der)).days < REPOS_STOCK):
                continue
            self.fiche[x["i"]] = x
            echo = x.get("echo") and x.get("echo_fin", "") >= jour
            self.score[x["i"]] = 1.1 * x.get("q", 2) + (1.2 if echo else 0) + 0.4 * alea(jour, x["i"])

    # ---- réserves (une vidéo n'est prise qu'une fois par canal)
    def reserve(self, nom):
        f = self.fiche.values()
        frais = lambda x: not x.get("pep")
        tests = {
            "actu": lambda x: frais(x) and x["o"] == "actu",
            "analyse": lambda x: frais(x) and x["o"] == "analyse",
            "analyse_court": lambda x: frais(x) and x["o"] == "analyse" and duree(x) <= 1800,
            "chron": lambda x: frais(x) and x["o"] == "humour" and x.get("sid") in self.mixtes and not x.get("co"),
            "humour": lambda x: frais(x) and x["o"] == "humour" and not x.get("co"),
            "courts": lambda x: x["o"] == "humour" and x.get("co"),
            "decouverte": lambda x: frais(x) and x["o"] == "decouverte",
            "culture": lambda x: frais(x) and x["o"] == "culture",
            "divertissement": lambda x: frais(x) and x["o"] == "divertissement",
            "pep": lambda x: x.get("pep"),
            "pep_rire": lambda x: x.get("pep") and x["o"] in ("humour", "divertissement"),
            "pep_savoir": lambda x: x.get("pep") and x["o"] in ("decouverte", "culture"),
            "tout": lambda x: x["o"] in NON_ACTU,
        }
        return sorted((x for x in f if tests[nom](x)), key=lambda x: -self.score[x["i"]])

    SECOURS = {
        "actu": ["analyse_court", "chron", "humour"], "analyse": ["analyse_court", "decouverte", "pep"],
        "analyse_court": ["actu", "analyse", "chron"], "chron": ["humour", "pep_rire"], "humour": ["pep_rire", "divertissement", "chron"],
        "courts": ["humour"], "decouverte": ["pep_savoir", "culture", "pep"], "culture": ["pep_savoir", "decouverte", "pep"],
        "divertissement": ["pep_rire", "humour", "pep"], "pep": ["decouverte", "culture", "humour", "divertissement"],
        "pep_rire": ["humour", "divertissement"], "pep_savoir": ["decouverte", "culture"], "tout": [],
    }
    CANAUX = {
        "mix": ("mix", None), "rire": ("rire", ("humour", "divertissement")),
        "info": ("info", PERISSABLE), "savoir": ("savoir", ("decouverte", "culture")),
    }

    def programme_mix(self, h, k):
        if h < 6:
            return ["pep", "decouverte", "humour", "culture", "pep", "divertissement"][k % 6], 3600
        if h < 10:
            return ["actu", "chron", "actu", "humour", "actu", "courts", "decouverte", "chron"][k % 8], 1200
        if h < 22:
            x = ["decouverte", "culture", "divertissement", "humour", "pep"][(k // 9) % 5]
            return ["actu", "chron", x, "actu", "analyse_court", "humour", "pep", "chron", "courts"][k % 9], 2100
        return ["analyse", "humour", "pep", "decouverte"][k % 4], 7200

    def programme(self, canal, h, k):
        if canal == "mix":
            return self.programme_mix(h, k)
        if canal == "rire":
            jour_ = ["chron", "humour", "pep_rire", "divertissement", "humour", "courts", "chron", "humour", "pep_rire"]
            nuit = ["pep_rire", "humour", "divertissement", "pep_rire", "humour"]
            return (jour_ if 7 <= h < 23 else nuit)[k % (9 if 7 <= h < 23 else 5)], 2700
        if canal == "info":
            if 6 <= h < 10 or 12 <= h < 14 or 18 <= h < 21:
                return ["actu", "actu", "analyse_court"][k % 3], 3600
            return ["analyse", "actu"][k % 2], 10800
        return ["decouverte", "pep_savoir", "culture", "pep_savoir", "decouverte", "pep_savoir"][k % 6], 7200   # savoir

    def construire(self, canal):
        pris, grille, t, k = set(), [], 0, 0
        reserves, permises = {}, self.CANAUX[canal][1]
        avant = None
        journaux = [12 * 3600 + 58 * 60, 19 * 3600 + 58 * 60] if canal == "mix" else []

        def prendre(nom, plafond, profondeur=0):
            r = reserves.setdefault(nom, self.reserve(nom))
            for x in r:
                if x["i"] in pris or duree(x) > plafond or (avant and x.get("sid") == avant) or (permises and x["o"] not in permises):
                    continue
                return x
            if profondeur < 2:
                for s in self.SECOURS.get(nom, []):
                    x = prendre(s, plafond, profondeur + 1)
                    if x:
                        return x
            return None

        def poser(x):
            nonlocal t, avant
            pris.add(x["i"])
            grille.append([x["i"], duree(x)])
            t += duree(x)
            avant = x.get("sid")

        vides = 0
        while t < JOUR_S and vides < 6:
            if journaux and t >= journaux[0]:          # journal de 13 h et de 20 h : trois vidéos d'actu du jour
                journaux.pop(0)
                for _ in range(3):
                    x = prendre("actu", 900)
                    if x:
                        poser(x)
                continue
            nom, plafond = self.programme(canal, int(t // 3600), k)
            k += 1
            if nom == "courts":
                bloc = 3 if canal == "rire" else 2
                xs = [x for x in reserves.setdefault("courts", self.reserve("courts")) if x["i"] not in pris][:bloc]
                for x in xs:
                    poser(x)
                vides = 0 if xs else vides + 1
                continue
            x = prendre(nom, plafond) or prendre(nom, JOUR_S)
            if x:
                poser(x)
                vides = 0
            else:
                vides += 1
        # rediffusion si les réserves ne suffisent pas à couvrir 24 h
        base = [g[:2] for g in grille]
        while t < JOUR_S and base:
            for g in base:
                grille.append([g[0], g[1], 1])
                t += g[1]
                if t >= JOUR_S:
                    break
        return grille

    def memoriser(self, canaux):
        d = {i: j for i, j in self.diffusions.items() if (self.j - date.fromisoformat(j)).days <= 30}
        for l in canaux.values():
            for g in l:
                if len(g) == 2:
                    d[g[0]] = self.jour
        ecrire(f"{self.depot}/data/diffusions.json", d)


def main():
    depot = arg("--depot", DEPOT)
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    c, a = sys.argv[1], sys.argv[2:]
    if c == "jour" and len(a) == 2:
        cmd_jour(depot, a[0], a[1])
    elif c == "grilles" and len(a) == 1:
        cmd_grilles(depot, a[0])
    elif c == "candidats":
        cmd_candidats(depot)
    elif c == "dodo":
        cmd_dodo(depot)
    elif c == "contexte":
        cmd_contexte(depot)
    elif c == "integrer" and len(a) == 2:
        cmd_integrer(depot, a[0], a[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
