/* Suivi d'usage (événements GoatCounter, sans cookie) : onglets, boutons, réglages et liens utilisés.
   Jamais de texte saisi ni d'identifiant de personne ; rien n'est envoyé si stats.js est bloqué ou absent.
   Même fichier dans les dépôts YO1tv et Vigie. Usage direct : window.suivi("chemin", "titre"). */
(function () {
  "use strict";
  var n = 0, dernier = "", t0 = 0, MAX = 400;          // au plus 400 événements par visite ; doublons rapprochés ignorés
  function envoyer(chemin, titre) {
    var gc = window.goatcounter, now = Date.now();
    if (!gc || typeof gc.count !== "function" || n >= MAX) return;
    if (chemin === dernier && now - t0 < 1500) return;
    dernier = chemin; t0 = now; n++;
    try { gc.count({ path: String(chemin).slice(0, 150), title: String(titre || chemin).slice(0, 100), event: true }); } catch (e) { /* rien */ }
  }
  window.suivi = envoyer;
  var IGNORES = /^data-(a|b|goatcounter)$/;
  var propre = function (s) { return String(s || "").trim().replace(/\s+/g, " "); };
  function etiquette(el) {
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf("data-") === 0 && !IGNORES.test(a.name)) return a.name.slice(5) + (a.value && a.value.length <= 40 ? "=" + a.value : "");
    }
    if (el.id) return el.id;
    if (el.tagName === "A") {
      var h = el.getAttribute("href") || "";
      if (h.charAt(0) === "#") return "ancre" + h;
      try { var u = new URL(h, location.href); if (u.origin !== location.origin) return "lien-sortant/" + u.hostname.replace(/^www\./, ""); } catch (e) { /* rien */ }
      return "lien";
    }
    var t = propre(el.getAttribute("aria-label") || el.textContent);
    return t ? "texte/" + t.slice(0, 40) : "";
  }
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("button,a,[role=tab],[role=button],summary");
    if (!el) return;
    var lab = etiquette(el);
    if (lab) envoyer("clic/" + lab, propre(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent).slice(0, 80) || lab);
  }, true);
  document.addEventListener("change", function (e) {
    var el = e.target;
    if (!el || !el.matches || !el.matches("select,input[type=checkbox],input[type=radio],input[type=range]")) return;
    var lab = el.id || el.name;
    if (!lab) return;
    var v = el.type === "checkbox" ? String(el.checked) : String(el.value).slice(0, 30);
    envoyer("reglage/" + lab + "=" + v, lab);
  }, true);
})();
