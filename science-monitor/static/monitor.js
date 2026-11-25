/* Famulus Science Monitor — page logic. No framework, no external script. The platform proxy does not stream, so the
   page polls: the live view every 30 s, the ticker every 60 s. All text from the record is escaped before it is shown. */
(function () {
  "use strict";
  var onSite = location.hostname === "famulus.lettre.ai";
  var API = onSite ? "https://lettre.ngrok.dev/science-monitor/api/" : "api/";
  var KIOSK = /[?&]kiosk=1/.test(location.search);
  var main = document.getElementById("main"), tip = document.getElementById("tip");
  var FIELD = { mathematics: "var(--f-mathematics)", physics: "var(--f-physics)", debate: "var(--f-debate)" };
  var topics = {}, timer = null, seen = {}, firstLoad = true;
  if (KIOSK) document.body.classList.add("kiosk");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function href(u) { return /^https?:\/\//i.test(u || "") ? esc(u) : "#"; }
  function num(n) { return n == null ? "–" : Number(n).toLocaleString("en-GB"); }
  function get(path) {
    return fetch(API + path).then(function (r) {          /* a plain GET: no preflight through the proxy */
      if (!r.ok) throw new Error(path + ": HTTP " + r.status);
      return r.json();
    });
  }
  function utc(s) { return s ? new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : s + "Z") : null; }
  function ago(s) {
    var d = utc(s); if (!d) return "";
    var m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 48 * 60) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + " d ago";
  }
  function day(s) { var d = utc(s); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : ""; }
  function hm(s) { var d = utc(s); return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : ""; }
  function tname(id) { var t = topics[id]; return t ? (t.titel_en || t.titel) : id; }

  /* ---------- tooltip ---------- */
  function showTip(ev, html) {
    tip.innerHTML = html; tip.hidden = false;
    var x = ev.clientX + 14, y = ev.clientY + 14, r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- charts (one hue for magnitude; columns anchored to the baseline; hover on every mark) ---------- */
  function spark(points, color) {
    if (!points.length) return '<svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"></svg>';
    var max = Math.max.apply(null, points.map(function (p) { return p[1]; })) || 1, n = points.length, w = 100 / n, out = "";
    points.forEach(function (p, i) {
      var h = Math.max(1, p[1] / max * 32);
      out += '<rect x="' + (i * w + w * 0.12).toFixed(2) + '" y="' + (34 - h).toFixed(2) + '" width="' + (w * 0.76).toFixed(2) +
        '" height="' + h.toFixed(2) + '" fill="' + color + '"/>';
    });
    return '<svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">' + out + "</svg>";
  }
  /* columns: data = [{x: label, y: number, t: tooltip label}], opts {h, color, marks: [{i, label, cls, id}]} */
  function columns(data, opts) {
    opts = opts || {};
    var W = 1000, H = opts.h || 220, L = 44, B = 24, T = opts.marks ? 26 : 8, n = data.length || 1;
    var max = Math.max.apply(null, data.map(function (d) { return d.y; }).concat([1]));
    var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;
    if (nice / step > 5) step *= 2;
    var bw = (W - L) / n, s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label || "chart") + '">';
    for (var g = 0; g <= nice; g += step) {
      var gy = H - B - g / nice * (H - B - T);
      s += '<line class="ax" x1="' + L + '" x2="' + W + '" y1="' + gy + '" y2="' + gy + '"/><text x="' + (L - 6) + '" y="' + (gy + 4) +
        '" text-anchor="end">' + num(g) + "</text>";
    }
    var every = Math.ceil(n / 9);
    data.forEach(function (d, i) {
      var h = d.y / nice * (H - B - T), x = L + i * bw;
      s += '<rect class="bar" data-i="' + i + '" x="' + (x + Math.min(1, bw * 0.1)).toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' +
        Math.max(1, bw - 2 * Math.min(1, bw * 0.1)).toFixed(1) + '" height="' + Math.max(d.y ? 1 : 0, h).toFixed(1) + '"' +
        (opts.color ? ' style="fill:' + opts.color + '"' : "") + "/>";
      s += '<rect class="hit" data-i="' + i + '" x="' + x.toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + (H - B - T) + '"/>';
      if (i % every === 0) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(d.x) + "</text>";
    });
    (opts.marks || []).forEach(function (m) {
      var x = L + (m.i + 0.5) * bw;
      s += '<line class="ev" x1="' + x + '" x2="' + x + '" y1="16" y2="' + (H - B) + '"/><circle class="evdot ' + (m.cls || "") +
        '" data-ev="' + esc(m.id) + '" data-label="' + esc(m.label) + '" cx="' + x + '" cy="10" r="6" tabindex="0"/>';
    });
    return { html: s + "</svg>", data: data };
  }
  function wire(root) {
    root.querySelectorAll("svg.chart").forEach(function (svg) {
      var data = svg._data;
      svg.addEventListener("mousemove", function (ev) {
        var t = ev.target;
        if (t.classList.contains("hit") && data) {
          var d = data[+t.getAttribute("data-i")];
          svg.querySelectorAll(".bar.h").forEach(function (b) { b.classList.remove("h"); });
          var b = svg.querySelector('.bar[data-i="' + t.getAttribute("data-i") + '"]'); if (b) b.classList.add("h");
          showTip(ev, esc(d.t || d.x) + " · <b>" + num(d.y) + "</b> acts");
        } else if (t.classList.contains("evdot")) { showTip(ev, esc(t.getAttribute("data-label")));
        } else hideTip();
      });
      svg.addEventListener("mouseleave", function () { hideTip(); svg.querySelectorAll(".bar.h").forEach(function (b) { b.classList.remove("h"); }); });
      svg.addEventListener("click", function (ev) {
        var id = ev.target.getAttribute && ev.target.getAttribute("data-ev"); if (id) location.hash = "#/event/" + id;
      });
    });
  }
  function put(html, charts) {
    main.innerHTML = html;
    (charts || []).forEach(function (c) { var el = main.querySelector(c.sel + " svg.chart"); if (el) el._data = c.data; });
    wire(main);
  }

  /* ---------- shared pieces ---------- */
  function actItem(a, fresh) {
    var th = (a.themen || []).slice(0, 4).map(function (t) { return '<a class="chip" href="#/topic/' + esc(t) + '">' + esc(tname(t)) + "</a>"; }).join("");
    return '<li' + (fresh ? ' class="new"' : "") + '><div class="meta"><span class="med">' + esc(a.medium) + '</span><span class="who">' +
      esc(a.akteur || "unnamed") + "</span><span title=\"" + esc(a.zeit) + ' UTC">' + esc(day(a.zeit)) + " " + esc(hm(a.zeit)) + " UTC · " + esc(ago(a.zeit)) +
      '</span><a href="' + href(a.url) + '" target="_blank" rel="noopener noreferrer">source ↗</a></div><p>' + esc(a.auszug) +
      '</p><div class="chips">' + th + "</div></li>";
  }
  function stream(list) { return list.length ? '<ul class="stream">' + list.map(function (a) { return actItem(a); }).join("") + "</ul>" : '<p class="wait">No acts recorded yet.</p>'; }
  function rows(list, key, val, link) {
    var max = Math.max.apply(null, list.map(function (r) { return r[val]; }).concat([1]));
    return '<ul class="rows">' + list.map(function (r) {
      var k = link ? '<a href="' + link(r) + '">' + esc(r[key]) + "</a>" : esc(r[key]);
      return '<li><span class="k">' + k + '</span><span class="bar" style="width:' + (r[val] / max * 100).toFixed(1) + '%"></span><span class="v">' + num(r[val]) + "</span></li>";
    }).join("") + "</ul>";
  }
  function topicCard(t) {
    /* a percentage needs a base: below 20 acts in the week before, say so instead of printing a huge number */
    var tr = "";
    if (t.akte_vorwoche >= 20) {
      var trend = Math.round((t.akte_7d - t.akte_vorwoche) / t.akte_vorwoche * 100);
      tr = '<span class="' + (trend >= 0 ? "up" : "down") + '">' + (trend >= 0 ? "▲ " : "▼ ") + Math.abs(trend) + " % vs. week before</span>";
    } else if (t.akte_7d >= 20) tr = '<span class="up">new this week</span>';
    return '<a class="topic" style="--fc:' + (FIELD[t.feld] || "var(--gold)") + '" href="#/topic/' + esc(t.id) + '"><div class="row"><span class="t">' +
      esc(t.titel_en || t.titel) + '</span><span class="c" title="acts in the last 24 hours">' + num(t.akte_24h) + "</span></div>" +
      spark(t.verlauf, FIELD[t.feld] || "var(--mark)") + '<div class="m"><span>' + num(t.akte) + " acts · 7 d: " + num(t.akte_7d) + "</span>" + tr + "</div></a>";
  }
  function loadTopics() {
    return get("felder").then(function (d) { d.themen.forEach(function (t) { topics[t.id] = t; }); return d.themen; });
  }
  function legend() {
    return '<p class="legend"><span><i style="background:var(--f-mathematics)"></i>Mathematics</span><span><i style="background:var(--f-physics)"></i>Physics</span>' +
      '<span><i style="background:var(--f-debate)"></i>AI in research</span><span>large number: acts in the last 24 h · columns: last 30 days</span></p>';
  }

  /* ---------- views ---------- */
  function viewLive() {
    return Promise.all([get("lage"), loadTopics(), get("ticker?limit=40"), get("erklaerungen"), get("schlagwoerter")]).then(function (r) {
      var L = r[0], k = L.kennzahlen, th = r[1], acts = r[2], letters = r[3].erklaerungen, terms = r[4].begriffe;
      var hours = [], now = new Date(); now.setUTCMinutes(0, 0, 0);
      var by = {}; L.stunden.forEach(function (h) { by[utc(h.stunde).getTime()] = h.akte; });
      for (var i = 71; i >= 0; i--) {
        var d = new Date(now - i * 3600000);
        hours.push({ x: d.getUTCHours() === 0 ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : ("0" + d.getUTCHours()).slice(-2) + "h",
          y: by[d.getTime()] || 0, t: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) + " " + ("0" + d.getUTCHours()).slice(-2) + ":00 UTC" });
      }
      var ch = columns(hours, { h: 200, label: "Acts per hour, last 72 hours" });
      var moving = th.slice().sort(function (a, b) { return b.akte_24h - a.akte_24h || b.akte_7d - a.akte_7d; }).slice(0, KIOSK ? 12 : 16);
      var fresh = acts.filter(function (a) { return !seen[a.id]; }).map(function (a) { return a.id; });
      var html = '<p class="eyebrow">Live · the open debate on AI in research</p>' +
        '<div class="grid stats">' +
        '<div class="stat"><div class="n">' + num(k.akte_24h) + '</div><div class="l">acts in the last 24 hours</div><div class="s">' + num(k.akte_7d) + " in 7 days</div></div>" +
        '<div class="stat"><div class="n">' + num(k.akteure_24h) + '</div><div class="l">voices in the last 24 hours</div><div class="s">' + num(k.akteure) + " in the record</div></div>" +
        '<div class="stat"><div class="n">' + num(k.themen_24h) + '</div><div class="l">topics in motion</div><div class="s">of ' + num(k.themen) + " followed</div></div>" +
        '<div class="stat"><div class="n">' + num(k.medien) + '</div><div class="l">media in the record</div><div class="s">' + num(k.briefe) + " open letters and statements</div></div>" +
        '<div class="stat"><div class="n">' + num(k.akte) + '</div><div class="l">acts recorded, at least</div><div class="s">since ' + esc(day(k.aeltester_akt)) + "</div></div></div>" +
        '<div class="grid cols-main"><div class="grid">' +
        '<div class="card" id="c-hours"><h2>Acts per hour, last 72 hours (UTC)</h2>' + ch.html + "</div>" +
        '<div class="card flat"><h2>Pulse by topic</h2>' + legend() + '<div class="grid pulse">' + moving.map(topicCard).join("") + "</div></div>" +
        '</div><div class="grid">' +
        '<div class="card"><h2>Rising terms</h2><p class="lede" style="margin-bottom:10px;font-size:14px">Phrases that mark this week against the rest of the record. Gold: taken into the search.</p><div class="chips">' +
        terms.slice(0, 18).map(function (t) { return '<span class="chip term' + (t.aktiv ? " on" : "") + '" title="' + num(t.akte) + " acts, " + num(t.akteure) + ' voices">' + esc(t.begriff) + "</span>"; }).join("") + "</div></div>" +
        '<div class="card"><h2>Open letters</h2><ul class="rows">' + letters.filter(function (l) { return l.unterzeichner; }).map(function (l) {
          return '<li style="grid-template-columns:1fr auto"><span class="k"><a href="#/letter/' + esc(l.id) + '">' + esc(l.titel) + '</a></span><span class="v">' + num(l.unterzeichner) + " signed</span></li>"; }).join("") +
        '</ul><p style="margin:10px 0 0"><a href="#/letters">All letters and statements →</a></p></div>' +
        '<div class="card"><h2>Latest acts</h2><ul class="stream">' + acts.slice(0, KIOSK ? 7 : 14).map(function (a) { return actItem(a, !firstLoad && fresh.indexOf(a.id) >= 0); }).join("") + "</ul></div>" +
        "</div></div>";
      put(html, [{ sel: "#c-hours", data: ch.data }]);
      acts.forEach(function (a) { seen[a.id] = 1; }); firstLoad = false;
      air(k);
    });
  }
  function viewFields() {
    return loadTopics().then(function (th) {
      var by = {}, order = [];
      th.forEach(function (t) { if (!by[t.feld]) { by[t.feld] = { titel: t.feld_titel, list: [] }; order.push(t.feld); } by[t.feld].list.push(t); });
      put("<h1>Fields</h1><p class=\"lede\">Open questions and the debate around them, by field. Each topic collects every act whose text names it, across all media of the record.</p>" + legend() +
        order.map(function (f) {
          return '<section class="sec"><h2 style="border-left:4px solid ' + FIELD[f] + ';padding-left:10px">' + esc(by[f].titel) + '</h2><div class="grid pulse">' + by[f].list.map(topicCard).join("") + "</div></section>";
        }).join(""));
    });
  }
  function dailySeries(tage, days) {
    var by = {}; tage.forEach(function (t) { by[t.tag] = t.akte; });
    var first = tage.length ? utc(tage[0].tag) : new Date(), end = new Date(); end.setUTCHours(0, 0, 0, 0);
    var start = new Date(Math.max(first, end - (days - 1) * 86400000)), out = [];
    for (var d = new Date(start); d <= end; d = new Date(+d + 86400000)) {
      var key = d.toISOString().slice(0, 10);
      out.push({ x: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), y: by[key] || 0, t: day(key), key: key });
    }
    return out;
  }
  function viewTopic(id) {
    return Promise.all([get("thema/" + encodeURIComponent(id)), loadTopics()]).then(function (r) {
      var d = r[0], t = d.thema, col = FIELD[t.feld] || "var(--mark)", total = d.tage.reduce(function (s, x) { return s + x.akte; }, 0);
      var ch = columns(dailySeries(d.tage, 90), { h: 240, color: col, label: "Acts per day" });
      put('<p class="eyebrow"><a href="#/fields">Fields</a> · ' + esc(t.feld_titel || "") + "</p><h1>" + esc((topics[id] || {}).titel_en || t.titel) + "</h1>" +
        '<p class="lede">At least ' + num(total) + " acts name this topic. Columns show acts per day over the last 90 days (UTC).</p>" +
        '<div class="grid cols-main"><div class="grid"><div class="card" id="c-days"><h2>Acts per day</h2>' + ch.html + "</div>" +
        '<div class="card"><h2>Latest acts</h2>' + stream(d.akte) + "</div></div><div class=\"grid\">" +
        '<div class="card"><h2>Where it is discussed</h2>' + rows(d.medien, "name", "akte") + "</div>" +
        '<div class="card"><h2>Most active voices</h2>' + rows(d.akteure, "akteur", "akte") + "</div>" +
        (d.verwandt.length ? '<div class="card"><h2>Named together with</h2>' + rows(d.verwandt, "titel", "akte", function (x) { return "#/topic/" + esc(x.id); }) + "</div>" : "") +
        "</div></div>", [{ sel: "#c-days", data: ch.data }]);
    });
  }
  function viewLetters() {
    return get("erklaerungen").then(function (d) {
      put("<h1>Open letters and statements</h1><p class=\"lede\">Declarations, open letters and recommendations on AI in research: what they say, what they ask, how many have signed, and where they are discussed. " +
        "Demands and reasons were extracted by a language model; only points whose quotation was found word for word in the stored text are shown.</p>" +
        '<div class="grid letters">' + d.erklaerungen.map(function (l) {
          return '<a class="card letter" href="#/letter/' + esc(l.id) + '"><h3>' + esc(l.titel) + "</h3>" +
            (l.unterzeichner ? '<div><span class="big">' + num(l.unterzeichner) + '</span> <span style="color:var(--ink-3)">signatories on ' + esc(day(l.unterzeichner_am)) + "</span></div>" : "") +
            "<p>" + esc(l.zusammenfassung || (l.hat_text ? "" : "Text not readable for the monitor.")) + '</p><div class="chips"><span class="chip">' + num(l.diskussion) +
            ' acts of discussion</span><span class="chip">' + num(l.punkte) + " points</span></div></a>";
        }).join("") + "</div>");
    });
  }
  function viewLetter(id) {
    return Promise.all([get("erklaerung/" + encodeURIComponent(id)), loadTopics()]).then(function (r) {
      var d = r[0], e = d.erklaerung, kinds = { forderung: "Demand", ziel: "Aim", begruendung: "Reason" };
      var ch = d.tage.length ? columns(dailySeries(d.tage, 90), { h: 180, color: "var(--f-debate)", label: "Discussion per day" }) : null;
      put('<p class="eyebrow"><a href="#/letters">Open letters</a></p><h1>' + esc(e.titel) + "</h1>" +
        '<p class="lede">' + esc(e.zusammenfassung || "") + "</p>" +
        '<div class="grid cols-main"><div class="grid">' +
        '<div class="card"><h2>What it asks, and why</h2>' + (d.punkte.length ? '<ul class="points">' + d.punkte.map(function (p) {
          return '<li><span class="kind">' + esc(kinds[p.art] || "Point") + "</span><div>" + esc(p.paraphrase) + "</div><blockquote>“" + esc(p.zitat) + "”</blockquote></li>"; }).join("") +
          '</ul><p style="color:var(--ink-3);font-size:13px;margin:10px 0 0">Extracted by a language model; each quotation checked against the stored text.</p>' : '<p class="wait">Not analysed yet.</p>') + "</div>" +
        (ch ? '<div class="card" id="c-disc"><h2>Discussion per day</h2>' + ch.html + "</div>" : "") +
        '<div class="card"><h2>Discussion</h2>' + stream(d.akte) + "</div>" +
        (e.volltext ? '<div class="card"><details><summary>Text as stored on ' + esc(day(e.abgelegt)) + (e.laenge > 12000 ? " (beginning)" : "") + '</summary><pre class="text">' + esc(e.volltext) + "</pre></details></div>" : "") +
        '</div><div class="grid"><div class="card"><dl class="kv">' +
        (e.unterzeichner ? "<dt>Signatories</dt><dd><b>" + num(e.unterzeichner) + "</b> on " + esc(day(e.unterzeichner_am)) + "</dd>" : "") +
        (e.adressat ? "<dt>Addressed to</dt><dd>" + esc(e.adressat) + "</dd>" : "") +
        (e.traeger ? "<dt>Issued by</dt><dd>" + esc(e.traeger) + "</dd>" : "") +
        '<dt>Source</dt><dd><a href="' + href(e.url) + '" target="_blank" rel="noopener noreferrer">' + esc((e.url || "").replace(/^https?:\/\//, "").slice(0, 46)) + " ↗</a></dd></dl>" +
        (e.eintragen ? '<p style="margin:14px 0 0"><a class="btn" href="' + href(e.eintragen) + '" target="_blank" rel="noopener noreferrer">Sign at the source ↗</a></p>' : "") + "</div>" +
        (d.reihe.length > 1 ? '<div class="card"><h2>Signatories over time</h2>' + rows(d.reihe.map(function (x) { return { k: day(x.tag), v: x.anzahl }; }), "k", "v") + "</div>" : "") +
        (d.vorfaelle.length ? '<div class="card"><h2>Incidents it names</h2><ul class="events">' + d.vorfaelle.map(evItem).join("") + "</ul></div>" : "") +
        "</div></div>", ch ? [{ sel: "#c-disc", data: ch.data }] : []);
    });
  }
  function evItem(e) {
    return '<li><time datetime="' + esc(e.datum) + '">' + esc(day(e.datum)) + '</time><span><a href="#/event/' + esc(e.id) + '">' + esc(e.titel) + "</a> " +
      (e.stand === "belegt" ? '<span class="badge ok">source read</span>' : '<span class="badge" title="taken from search results; still to be checked at the source">to be verified</span>') +
      '</span><span class="n">' + (e.akte != null ? num(e.akte) + " acts" : "") + "</span></li>";
  }
  function viewTimeline() {
    return get("chronik").then(function (d) {
      var weeks = d.wochen.filter(function (w) { return w.woche >= "2026-06-01"; });
      var data = weeks.map(function (w) { return { x: utc(w.woche).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), y: w.akte, t: "week of " + day(w.woche), key: w.woche }; });
      var marks = [];
      d.ereignisse.forEach(function (e) {
        for (var i = data.length - 1; i >= 0; i--) if (e.datum >= data[i].key) { if (e.datum >= data[0].key) marks.push({ i: i, id: e.id, label: day(e.datum) + " · " + e.titel, cls: e.stand === "belegt" ? "" : "cand" }); break; }
      });
      var ch = columns(data, { h: 260, marks: marks, label: "Acts per week with events" });
      put("<h1>Timeline</h1><p class=\"lede\">The debate did not begin with the Riemann announcement. The chronicle lists the earlier incidents, among them those named in the open letters, " +
        "and the weekly activity of the record. Rings mark events; open the discussion of an event by selecting it.</p>" +
        '<div class="card" id="c-weeks"><h2>Acts per week since June 2026</h2>' + ch.html + "</div>" +
        '<div class="card sec"><h2>Chronicle</h2><ul class="events">' + d.ereignisse.slice().reverse().map(evItem).join("") + "</ul></div>",
        [{ sel: "#c-weeks", data: ch.data }]);
    });
  }
  function viewEvent(id) {
    return Promise.all([get("ereignis/" + encodeURIComponent(id)), loadTopics()]).then(function (r) {
      var d = r[0], e = d.ereignis;
      put('<p class="eyebrow"><a href="#/timeline">Timeline</a> · ' + esc(day(e.datum)) + "</p><h1>" + esc(e.titel) + "</h1>" +
        '<p class="lede">' + (e.stand === "belegt" ? "Source read by the monitor. " : "Taken from search results; date and facts are still to be checked at the source. ") +
        (e.quelle ? '<a href="' + href(e.quelle) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>' : "") + "</p>" +
        (d.briefe.length ? '<p class="chips" style="margin-bottom:16px">Named in: ' + d.briefe.map(function (b) { return '<a class="chip" href="#/letter/' + esc(b.id) + '">' + esc(b.titel) + "</a>"; }).join("") + "</p>" : "") +
        '<div class="card"><h2>Acts around the event (two weeks before to three weeks after)</h2>' + stream(d.akte) + "</div>");
    });
  }
  function viewSources() {
    return get("quellen").then(function (d) {
      var reached = d.medien.filter(function (m) { return m.akte > 0; }), not = d.medien.filter(function (m) { return !m.akte; });
      put("<h1>Sources and gaps</h1><p class=\"lede\">The monitor harvests public communication every night and, for the fast media, every quarter of an hour. Raw files are kept unchanged with their SHA-256 and access route. " +
        "A count on this site says “at least”: it counts what could be reached. X is reached only through links from other media and the author’s own selection, not by search.</p>" +
        '<div class="grid cols-main"><div class="card scroll"><h2>Media in the record</h2><table class="t"><thead><tr><th>Medium</th><th>Kind</th><th>Login needed</th><th style="text-align:right">Acts</th><th>Latest act</th></tr></thead><tbody>' +
        reached.map(function (m) { return "<tr><td>" + esc(m.name) + "</td><td>" + esc(m.art || "") + "</td><td>" + esc(/^nein/.test(m.login_noetig || "") ? "no" : m.login_noetig ? "yes, in part" : "") + '</td><td class="num">' + num(m.akte) + "</td><td>" + esc(ago(m.zuletzt)) + "</td></tr>"; }).join("") +
        "</tbody></table></div><div class=\"grid\"><div class=\"card\"><h2>Not reached</h2><p style=\"color:var(--ink-2);margin:0 0 8px\">Registered, but without access or without acts so far:</p><div class=\"chips\">" +
        not.map(function (m) { return '<span class="chip">' + esc(m.name) + "</span>"; }).join("") + "</div></div>" +
        '<div class="card"><h2>Latest harvests</h2><ul class="rows">' + d.laeufe.slice(0, 14).map(function (l) {
          return '<li style="grid-template-columns:1fr auto"><span class="k">' + esc(l.fall) + " · " + esc(l.sammler) + '</span><span class="v">' + esc(ago(l.ende)) + "</span></li>"; }).join("") + "</ul></div></div></div>" +
        '<div class="card sec"><h2>Method</h2><p style="color:var(--ink-2);max-width:80ch;margin:0">Topics are assigned by stated patterns; an act can belong to several. Rising terms come from a comparison of this week’s acts with the rest of the record. ' +
        "The categories follow computational epistemology: sentence and proposition, trace and testimony, act of checking, dependence between witnesses. The monitor does not judge any claim. " +
        'Papers: <a href="https://famulus.lettre.ai/publications/">Famulus Fundamentals No. 15 and No. 16</a>.</p></div>');
    });
  }

  /* ---------- status, ticker, routing ---------- */
  function air(k) {
    var dot = document.getElementById("dot"), txt = document.getElementById("airtext");
    var last = utc(k.gebaut_am), min = last ? (Date.now() - last) / 60000 : 1e9;
    dot.className = "dot " + (min < 45 ? "live" : "stale");
    txt.textContent = (min < 45 ? "on air · " : "") + "last harvest " + ago(k.gebaut_am);
  }
  function tick() {
    var c = document.getElementById("clock");
    c.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
  }
  function loadTicker() {
    return get("ticker?limit=40").then(function (acts) {
      var one = acts.map(function (a) {
        return '<span class="tk"><time>' + esc(hm(a.zeit)) + '</time><span class="med">' + esc(a.medium) + "</span><b>" + esc(a.akteur || "") + '</b><a href="' + href(a.url) +
          '" target="_blank" rel="noopener noreferrer">' + esc((a.auszug || "").slice(0, 150)) + "</a></span>";
      }).join("");
      var track = document.getElementById("track");
      track.innerHTML = one + one;                       /* twice: the loop runs to -50 % */
      track.style.animationDuration = Math.max(60, acts.length * 9) + "s";
    }).catch(function () {});
  }
  var routes = [
    [/^#\/?$/, viewLive, "live"], [/^#\/fields$/, viewFields, "fields"], [/^#\/topic\/(.+)$/, viewTopic, "fields"],
    [/^#\/letters$/, viewLetters, "letters"], [/^#\/letter\/(.+)$/, viewLetter, "letters"],
    [/^#\/timeline$/, viewTimeline, "timeline"], [/^#\/event\/(.+)$/, viewEvent, "timeline"], [/^#\/sources$/, viewSources, "sources"]
  ];
  function route(keepScroll) {
    var h = location.hash || "#/", hit = null;
    routes.some(function (r) { var m = h.match(r[0]); if (m) { hit = [r, m]; return true; } return false; });
    if (!hit) hit = [routes[0], []];
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-v") === hit[0][2]); });
    clearInterval(timer);
    var run = function (silent) {
      return hit[0][1](hit[1][1] ? decodeURIComponent(hit[1][1]) : undefined).catch(function (e) {
        if (!silent) main.innerHTML = '<p class="wait">The record cannot be reached at the moment (' + esc(e.message) + "). The page tries again by itself.</p>";
        document.getElementById("dot").className = "dot stale";
      });
    };
    run().then(function () { if (!keepScroll) scrollTo(0, 0); });
    if (hit[0][2] !== "live") get("lage").then(function (d) { air(d.kennzahlen); }).catch(function () {});
    timer = setInterval(function () { if (!document.hidden) run(true); }, hit[0][2] === "live" ? 30000 : 120000);
  }
  /* Broadcast mode: rotate by itself through live, the two topics in motion, the letters and the timeline */
  function kiosk() {
    var bar = document.createElement("div"); bar.className = "progress"; document.body.appendChild(bar);
    var i = 0, DUR = 45000;
    function plan() {
      var th = Object.keys(topics).map(function (k) { return topics[k]; }).sort(function (a, b) { return b.akte_24h - a.akte_24h; });
      return ["#/", th[0] ? "#/topic/" + th[0].id : "#/fields", "#/letters", "#/", th[1] ? "#/topic/" + th[1].id : "#/fields", "#/timeline"];
    }
    function next() {
      var p = plan(); location.hash = p[i % p.length]; i++;
      bar.style.transition = "none"; bar.style.width = "0";
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transition = "width " + DUR + "ms linear"; bar.style.width = "100%"; }); });
    }
    setInterval(next, DUR); next();
  }

  window.addEventListener("hashchange", function () { route(); });
  tick(); setInterval(tick, 1000);
  loadTicker(); setInterval(function () { if (!document.hidden) loadTicker(); }, 60000);
  if (KIOSK) loadTopics().then(kiosk, kiosk); else route();
})();
