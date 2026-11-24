// Szenen des Film-Decks: SVG-Bühnen als Funktion des Fortschritts p in [0,1] – die eine Quelle für das Deck (deck.js)
// und die Publikation (szenen.mjs). Klassisch ladbar (<script src>) und als Modul importierbar: setzt
// globalThis.FamulusSzenen = { SZENEN, starte, fmt }.
//
//   starte(el, { basis, standbild, facts, dauer })  → Promise der Szene
//     basis      Präfix der Datenpfade (fetch 'assets/…'), Standard el.dataset.basis oder '' (Ordner des Decks)
//     standbild  Endzustand p = 1 ohne Animation; Standard el.dataset.standbild ('1'/'0'), sonst ?print-pdf in der URL
//     facts      Datenobjekt statt window.FACTS (facts.js)
//     dauer      ms, Standard el.dataset.dauer bzw. die Dauer der Szene, sonst 6000
//   el.dataset.szene  Name der Szene (SZENEN), el.dataset.luecken = '1' für die Zeitleiste mit den Lücken
// Daten: window.FACTS (facts.py, read-only aus den DuckDBs); stapel lädt assets/riemann/*, division assets/kepler/dc.json.
(function () {
  'use strict';
  const DRUCK = typeof location !== 'undefined' && /print-pdf/.test(location.search);
  const F = (opt = {}) => opt.facts || window.FACTS || {};
  const NS = 'http://www.w3.org/2000/svg';
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const seg = (p, a, b) => clamp((p - a) / (b - a));         // Teilfortschritt im Intervall [a, b]
  const fmt = n => Math.round(n).toLocaleString('de-DE');
  const GOLD = '#e3c766', GOLD2 = '#c9a227', HELL = '#9ec3e6', GRAU = '#5d6f88', PAPIER = '#fff6da', ROT = '#ff8f80';

  function svg(el, w, h) {
    el.innerHTML = '';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    el.appendChild(s);
    return s;
  }
  function add(parent, tag, attrs = {}, text) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  }

  // ---- die Briefe der Geschichte (Kurztitel; Daten, Absender und Adressen kommen aus FACTS.geschichte)
  const KURZ = {
    '11-12_gilles_august_1929_1962_i/25': 'Müller: Entlassungen an der Hochschule',
    '13-31_hopf_ludwig_1928_1940/9': 'Hopf: beurlaubt, „als Jude entfernt“',
    '13-8_he_miscellaneous_ii/23': 'Heisenberg empfiehlt Embden und Goldstein',
    '109-11_patents_propellers_general_correspondence/45': 'Fraenkel: als „non-Aryan“ gestrichen',
    '10-6_fromm_carl_1921_1937/29': 'Fromm fragt nach den Aachener Freunden',
    '10-6_fromm_carl_1921_1937/35': 'Kármán: Aachen „quite unchanged“',
    '13-31_hopf_ludwig_1928_1940/10': 'Kármán: „mein Einfluss sehr gering“',
    '13-31_hopf_ludwig_1928_1940/13': 'Hopf bittet die Guggenheim-Stiftung',
    '13-31_hopf_ludwig_1928_1940/16': 'Kármán: „eine andere Quelle finden“',
    '13-31_hopf_ludwig_1928_1940/17': 'Kármán kondoliert Alice Hopf',
    '13-31_hopf_ludwig_1928_1940/18': 'Alice Hopf antwortet aus Dublin',
  };
  const briefe = (opt = {}) => (F(opt).geschichte || []).filter(b => b.datum).map(b => ({
    ...b, kurz: KURZ[`${b.doc}/${b.nr}`] || b.regest.slice(0, 40), vonKarman: /^Kármán/.test(b.von || ''),
  })).sort((a, b) => a.datum.localeCompare(b.datum));
  const jahr = d => { const [y, m = '6', t = '15'] = d.split('-'); return +y + (+m - 1) / 12 + (+t - 1) / 365; };

  // ---- Szene: Zeitleiste 1933–1940 (optional mit den Lücken des Nachlasses)
  function zeitleiste(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H);
    const x0 = 70, x1 = 960, yA = opt.yAchse || 540, j0 = 1933, j1 = 1940.6;
    const X = j => x0 + (j - j0) / (j1 - j0) * (x1 - x0);
    const achse = add(s, 'line', { x1: x0, x2: x0, y1: yA, y2: yA, stroke: GRAU, 'stroke-width': 2 });
    const jahre = [];
    for (let j = 1933; j <= 1940; j++) {
      const g = add(s, 'g', { opacity: 0 });
      add(g, 'line', { x1: X(j), x2: X(j), y1: yA - 6, y2: yA + 6, stroke: GRAU, 'stroke-width': 2 });
      add(g, 'text', { x: X(j), y: yA + 30, fill: GRAU, 'font-size': 18, 'text-anchor': 'middle' }, j);
      jahre.push(g);
    }
    const B = briefe(opt), hoch = opt.hoch || 40, oben = yA - 70;
    const items = B.map((b, i) => {
      const x = X(jahr(b.datum)), y = oben - i * hoch;
      const g = add(s, 'g', { opacity: 0 });
      const farbe = b.vonKarman ? GOLD : HELL;
      const lin = add(g, 'line', { x1: x, x2: x, y1: yA, y2: yA, stroke: farbe, 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: .7 });
      add(g, 'circle', { cx: x, cy: yA, r: 7, fill: farbe });
      const rechts = x > 640;
      const t = add(g, 'text', { x: rechts ? x - 10 : x + 10, y: y + 5, fill: PAPIER, 'font-size': 17, 'text-anchor': rechts ? 'end' : 'start' });
      add(t, 'tspan', { fill: farbe, 'font-weight': 600 }, b.datum.split('-').reverse().join('.') + '  ');
      add(t, 'tspan', {}, b.kurz);
      return { g, lin, x, y };
    });
    // Legende
    const leg = add(s, 'g', { opacity: 0 });
    add(leg, 'circle', { cx: 80, cy: 28, r: 6, fill: HELL }); add(leg, 'text', { x: 92, y: 34, fill: GRAU, 'font-size': 16 }, 'an Kármán');
    add(leg, 'circle', { cx: 190, cy: 28, r: 6, fill: GOLD }); add(leg, 'text', { x: 202, y: 34, fill: GRAU, 'font-size': 16 }, 'von Kármán');
    let luecke = null;
    if (opt.luecken) {
      luecke = add(s, 'g', { opacity: 0 });
      const lx = X(1933.0) - 20, ly = 56;
      add(luecke, 'rect', { x: lx, y: ly, width: 320, height: 150, rx: 8, fill: 'rgba(255,143,128,.07)', stroke: ROT, 'stroke-dasharray': '6 5', 'stroke-width': 1.6 });
      add(luecke, 'text', { x: lx + 16, y: ly + 32, fill: ROT, 'font-size': 17, 'font-weight': 600 }, 'Nicht im Nachlass belegt');
      ['Was wurde aus Reissner, Blumenthal?', 'Schrieb Hopf an Courant?', 'Wer finanzierte den „Ausflug“?']
        .forEach((q, i) => add(luecke, 'text', { x: lx + 16, y: ly + 64 + i * 28, fill: PAPIER, 'font-size': 16 }, q));
    }
    return {
      frame(p) {
        const a = ease(seg(p, 0, .15));
        achse.setAttribute('x2', x0 + a * (x1 - x0));
        jahre.forEach((g, i) => g.setAttribute('opacity', seg(p, .03 + i * .015, .12 + i * .015)));
        leg.setAttribute('opacity', seg(p, .1, .2));
        const n = items.length, span = opt.luecken ? .6 : .82;
        items.forEach((it, i) => {
          const q = ease(seg(p, .15 + i * span / n, .15 + (i + 1.2) * span / n));
          it.g.setAttribute('opacity', q);
          it.lin.setAttribute('y2', yA + (it.y - yA) * q);
        });
        if (luecke) luecke.setAttribute('opacity', ease(seg(p, .82, .97)));
      },
    };
  }

  // ---- Szene: die 157 Boxen des Nachlasses; im Bestand, die Boxen der Geschichte leuchten
  function boxenLayout(x0, y0, w, h) {
    const cols = 16, rows = 10, gx = w / cols, gy = h / rows;
    return n => ({ x: x0 + ((n - 1) % cols) * gx, y: y0 + Math.floor((n - 1) / cols) * gy, w: gx - 4, h: gy - 4 });
  }
  const BOXTEXT = { 10: 'Box 10 · Fromm', 11: 'Box 11 · Müller', 13: 'Box 13 · Hopf, Heisenberg', 109: 'Box 109 · Patente: Fraenkel' };
  function boxen(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H);
    const L = boxenLayout(40, opt.oben || 70, 920, opt.hoehe || 430);
    const im = new Set(F(opt).boxen_im_bestand || []), story = new Set(briefe(opt).map(b => b.box));
    const zellen = [];
    for (let n = 1; n <= 157; n++) {
      const r = L(n);
      const rect = add(s, 'rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 3, fill: '#0f1b2c', stroke: '#22334c', opacity: 0 });
      const t = add(s, 'text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 5, fill: '#3b4d66', 'font-size': 12, 'text-anchor': 'middle', opacity: 0 }, n);
      zellen.push({ n, rect, t, r });
    }
    const labels = [...story].sort((a, b) => a - b).map((n, i) => {
      const r = L(n);
      const g = add(s, 'g', { opacity: 0 });
      const ly = (opt.oben || 70) + (opt.hoehe || 430) + 40 + (i % 2) * 30, lx = 60 + i * 230;
      add(g, 'line', { x1: r.x + r.w / 2, y1: r.y + r.h, x2: lx + 10, y2: ly - 16, stroke: GOLD, 'stroke-width': 1.2, opacity: .7 });
      add(g, 'text', { x: lx, y: ly, fill: GOLD, 'font-size': 17, 'font-weight': 600 }, BOXTEXT[n] || `Box ${n}`);
      return g;
    });
    const titel = add(s, 'text', { x: 40, y: 40, fill: '#7f8ea4', 'font-size': 18, opacity: 0 }, '157 Boxen · 4.215 Mappen · Caltech Archives');
    const leg = add(s, 'text', { x: 960, y: 40, fill: '#7f8ea4', 'font-size': 16, 'text-anchor': 'end', opacity: 0 }, `■ digital erschlossen: ${im.size} Boxen`);
    return {
      L, zellen, story, frame(p) {
        titel.setAttribute('opacity', seg(p, 0, .1));
        zellen.forEach(({ n, rect, t }) => {
          const a = seg(p, n / 157 * .3, n / 157 * .3 + .08);
          rect.setAttribute('opacity', a); t.setAttribute('opacity', a);
          const b = seg(p, .4, .55);
          if (im.has(n)) rect.setAttribute('fill', b > .5 ? '#1d3352' : '#0f1b2c');
          if (story.has(n)) {
            const c = seg(p, .6, .75);
            rect.setAttribute('fill', c > .5 ? '#3d3216' : (im.has(n) && b > .5 ? '#1d3352' : '#0f1b2c'));
            rect.setAttribute('stroke', c > .5 ? GOLD : '#22334c');
            t.setAttribute('fill', c > .5 ? GOLD : '#3b4d66');
          }
        });
        leg.setAttribute('opacity', seg(p, .42, .55));
        labels.forEach((g, i) => g.setAttribute('opacity', ease(seg(p, .7 + i * .06, .82 + i * .06))));
      },
    };
  }

  // ---- Szene: der Vorgang setzt sich zusammen – die Belege fliegen aus ihren Boxen auf die Zeitleiste
  function vorgang(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H);
    const L = boxenLayout(160, 30, 680, 180), story = new Set(briefe(opt).map(b => b.box));
    for (let n = 1; n <= 157; n++) {
      const r = L(n);
      add(s, 'rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 2, fill: story.has(n) ? '#3d3216' : '#0f1b2c', stroke: story.has(n) ? GOLD : '#1c2b42' });
    }
    add(s, 'text', { x: 500, y: 232, fill: '#7f8ea4', 'font-size': 15, 'text-anchor': 'middle' }, 'verstreut über vier Boxen');
    const x0 = 70, x1 = 960, yA = 560, j0 = 1933, j1 = 1940.6, X = j => x0 + (j - j0) / (j1 - j0) * (x1 - x0);
    add(s, 'line', { x1: x0, x2: x1, y1: yA, y2: yA, stroke: GRAU, 'stroke-width': 2 });
    for (let j = 1933; j <= 1940; j++) add(s, 'text', { x: X(j), y: yA + 28, fill: GRAU, 'font-size': 16, 'text-anchor': 'middle' }, j);
    const B = briefe(opt);
    const flieger = B.map((b, i) => {
      const r = L(b.box), sx = r.x + r.w / 2, sy = r.y + r.h / 2, tx = X(jahr(b.datum)), ty = yA, ly = 520 - i * 25;
      const farbe = b.vonKarman ? GOLD : HELL;
      const pfad = add(s, 'path', { d: `M${sx},${sy} Q${(sx + tx) / 2},${(sy + ty) / 2 - 80} ${tx},${ty}`, fill: 'none', stroke: farbe, 'stroke-width': 1, opacity: 0, 'stroke-dasharray': '2 4' });
      const dot = add(s, 'circle', { cx: sx, cy: sy, r: 6, fill: farbe, opacity: 0 });
      const t = add(s, 'text', { x: tx > 640 ? tx - 9 : tx + 9, y: ly, fill: PAPIER, 'font-size': 14, opacity: 0, 'text-anchor': tx > 640 ? 'end' : 'start' }, b.kurz);
      const stiel = add(s, 'line', { x1: tx, x2: tx, y1: yA, y2: ly + 4, stroke: farbe, 'stroke-width': .8, opacity: 0, 'stroke-dasharray': '2 3' });
      return { pfad, dot, t, stiel, len: 0 };
    });
    return {
      frame(p) {
        const n = flieger.length;
        flieger.forEach((f, i) => {
          const q = ease(seg(p, .05 + i * .6 / n, .05 + i * .6 / n + .25));
          if (!f.len) f.len = f.pfad.getTotalLength();
          const pt = f.pfad.getPointAtLength(f.len * q);
          f.dot.setAttribute('cx', pt.x); f.dot.setAttribute('cy', pt.y); f.dot.setAttribute('opacity', q > 0 ? 1 : 0);
          f.pfad.setAttribute('opacity', q > 0 && q < 1 ? .5 : (q >= 1 ? .12 : 0));
          const z = seg(q, .9, 1);
          f.t.setAttribute('opacity', z); f.stiel.setAttribute('opacity', z * .7);
        });
      },
    };
  }

  // ---- Szene: der Evidenzraum wächst – ein Netz registrierter Referenzknoten
  function netz(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H), f = F(opt);
    const cx = 500, cy = 300;
    const moeglich = [
      { name: 'Deutsches Museum', sub: 'Archiv · Objekte', a: -150 },
      { name: 'Hochschularchiv', sub: 'RWTH Aachen', a: -100 },
      { name: 'Nachlass Courant', sub: 'Briefpartner', a: -40 },
      { name: 'Hilfskomitees', sub: 'Akten der Emigration', a: 20 },
      { name: 'Caltech Archives', sub: 'Originale', a: 80 },
      { name: 'Bibliotheken', sub: 'Drucke, Berichte', a: 140 },
    ].map(k => ({ ...k, x: cx + Math.cos(k.a * Math.PI / 180) * 360, y: cy + Math.sin(k.a * Math.PI / 180) * 230 }));
    const links = moeglich.map(k => add(s, 'line', { x1: cx, y1: cy, x2: cx, y2: cy, stroke: '#3a5170', 'stroke-width': 1.5, 'stroke-dasharray': '5 6' }));
    const knoten = moeglich.map(k => {
      const g = add(s, 'g', { opacity: 0 });
      add(g, 'circle', { cx: k.x, cy: k.y, r: 46, fill: '#0c1830', stroke: HELL, 'stroke-dasharray': '5 5', 'stroke-width': 1.5 });
      add(g, 'text', { x: k.x, y: k.y - 2, fill: PAPIER, 'font-size': 15, 'text-anchor': 'middle', 'font-weight': 600 }, k.name);
      add(g, 'text', { x: k.x, y: k.y + 17, fill: '#7f8ea4', 'font-size': 12, 'text-anchor': 'middle' }, k.sub);
      return g;
    });
    // der reale Knoten mit den beiden Sammlungen
    const mitte = add(s, 'g', { opacity: 0 });
    add(mitte, 'circle', { cx, cy, r: 118, fill: '#0e1d33', stroke: GOLD, 'stroke-width': 2.5 });
    add(mitte, 'circle', { cx: cx - 44, cy: cy + 8, r: 58, fill: '#1d3352', stroke: GOLD2 });
    add(mitte, 'text', { x: cx - 44, y: cy + 2, fill: PAPIER, 'font-size': 14, 'text-anchor': 'middle', 'font-weight': 600 }, 'Nachlass');
    add(mitte, 'text', { x: cx - 44, y: cy + 20, fill: '#9fb0c6', 'font-size': 12, 'text-anchor': 'middle' }, `${fmt(f.einheiten || 0)} Stücke`);
    const kontext = add(mitte, 'g', { opacity: 0 });
    add(kontext, 'circle', { cx: cx + 54, cy: cy + 8, r: 46, fill: '#2a2a18', stroke: GOLD2 });
    add(kontext, 'text', { x: cx + 54, y: cy + 2, fill: PAPIER, 'font-size': 13, 'text-anchor': 'middle', 'font-weight': 600 }, 'Kontext');
    add(kontext, 'text', { x: cx + 54, y: cy + 19, fill: '#9fb0c6', 'font-size': 11, 'text-anchor': 'middle' }, `AGARD · ${(f.kontext || {}).dokumente || 0} Dok.`);
    add(mitte, 'text', { x: cx, y: cy - 78, fill: GOLD, 'font-size': 14, 'text-anchor': 'middle', 'font-weight': 600 }, 'HU Berlin');
    add(mitte, 'text', { x: cx, y: cy - 60, fill: '#7f8ea4', 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'Menlo, monospace' }, 'fr-xyfxite6dhhdqnt4pe5r');
    const legende = add(s, 'g', { opacity: 0 });
    add(legende, 'circle', { cx: 40, cy: 570, r: 7, fill: 'none', stroke: GOLD, 'stroke-width': 2 });
    add(legende, 'text', { x: 54, y: 575, fill: '#9fb0c6', 'font-size': 14 }, 'läuft');
    add(legende, 'circle', { cx: 120, cy: 570, r: 7, fill: 'none', stroke: HELL, 'stroke-dasharray': '3 3' });
    add(legende, 'text', { x: 134, y: 575, fill: '#9fb0c6', 'font-size': 14 }, 'möglicher Knoten – registriert bei Famulus Reference, an seinem eigenen Ort');
    const wellen = [0, 1, 2].map(() => add(s, 'circle', { cx, cy, r: 120, fill: 'none', stroke: GOLD, 'stroke-width': 2, opacity: 0 }));
    const belege = moeglich.map(k => add(s, 'circle', { cx: k.x, cy: k.y, r: 5, fill: GOLD, opacity: 0 }));
    return {
      loop: true,
      frame(p, t) {
        mitte.setAttribute('opacity', ease(seg(p, 0, .15)));
        kontext.setAttribute('opacity', ease(seg(p, .15, .3)));
        moeglich.forEach((k, i) => {
          const q = ease(seg(p, .3 + i * .05, .45 + i * .05));
          links[i].setAttribute('x2', cx + (k.x - cx) * q); links[i].setAttribute('y2', cy + (k.y - cy) * q);
          knoten[i].setAttribute('opacity', q);
        });
        legende.setAttribute('opacity', seg(p, .6, .7));
        // Anfrage strahlt aus, Belege kehren mit ihrer Adresse zurück (im Lauf wiederholt)
        const zyklus = opt.standbild ? .55 : ((t || 0) / 3200) % 1, an = p >= .7 ? 1 : 0;
        wellen.forEach((w, i) => {
          const z = (zyklus + i / 3) % 1;
          w.setAttribute('r', 120 + z * 300); w.setAttribute('opacity', an * (1 - z) * .45);
        });
        belege.forEach((b, i) => {
          const k = moeglich[i], z = (zyklus + i / moeglich.length) % 1;
          b.setAttribute('cx', k.x + (cx - k.x) * z); b.setAttribute('cy', k.y + (cy - k.y) * z);
          b.setAttribute('opacity', an * Math.sin(z * Math.PI));
        });
      },
    };
  }


  // ---- Szene: Famuli arbeiten zu, der Gelehrte steuert, urteilt und vertritt
  function famuli(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H), cx = 500, cy = 300;
    const aufgaben = ['Transkribieren', 'Übersetzen', 'Erläutern', 'Suchen', 'Nachrechnen', 'Belege ablegen'];
    const pos = aufgaben.map((a, i) => { const w = (-90 + i * 60) * Math.PI / 180; return { a, x: cx + Math.cos(w) * 330, y: cy + Math.sin(w) * 220 }; });
    const auftrag = pos.map(k => add(s, 'line', { x1: cx, y1: cy, x2: cx, y2: cy, stroke: HELL, 'stroke-width': 1.5, 'stroke-dasharray': '5 6', opacity: 0 }));
    const zu = pos.map(k => add(s, 'circle', { cx: k.x, cy: k.y, r: 6, fill: GOLD, opacity: 0 }));
    const knoten = pos.map(k => {
      const g = add(s, 'g', { opacity: 0 });
      add(g, 'rect', { x: k.x - 92, y: k.y - 24, width: 184, height: 48, rx: 24, fill: '#0e1d33', stroke: GOLD2 });
      add(g, 'text', { x: k.x, y: k.y + 6, fill: PAPIER, 'font-size': 18, 'text-anchor': 'middle' }, k.a);
      return g;
    });
    const mitte = add(s, 'g', { opacity: 0 });
    add(mitte, 'circle', { cx, cy, r: 104, fill: '#1d3352', stroke: GOLD, 'stroke-width': 3 });
    add(mitte, 'text', { x: cx, y: cy - 22, fill: GOLD, 'font-size': 22, 'text-anchor': 'middle', 'font-weight': 600 }, 'Der Gelehrte');
    ['steuert', 'urteilt', 'vertritt'].forEach((w, i) => add(mitte, 'text', { x: cx, y: cy + 10 + i * 24, fill: PAPIER, 'font-size': 18, 'text-anchor': 'middle' }, w));
    const titel = add(s, 'text', { x: 30, y: 40, fill: '#7f8ea4', 'font-size': 16, opacity: 0 }, 'famuli – Gehilfen, die zuarbeiten, ohne zu urteilen');
    return {
      loop: true,
      frame(p, t) {
        mitte.setAttribute('opacity', ease(seg(p, 0, .15)));
        titel.setAttribute('opacity', seg(p, .05, .2));
        pos.forEach((k, i) => {
          const q = ease(seg(p, .15 + i * .07, .3 + i * .07));
          knoten[i].setAttribute('opacity', q);
          auftrag[i].setAttribute('x2', cx + (k.x - cx) * q); auftrag[i].setAttribute('y2', cy + (k.y - cy) * q);
          auftrag[i].setAttribute('opacity', q * .8);
        });
        // Zuarbeit: Ergebnisse wandern zum Gelehrten (im Lauf wiederholt)
        const an = p >= .7 ? 1 : 0, z0 = opt.standbild ? .5 : ((t || 0) / 2600) % 1;
        zu.forEach((d, i) => {
          const k = pos[i], z = (z0 + i / pos.length) % 1, r = .55;
          d.setAttribute('cx', k.x + (cx - k.x) * z * r / .55 * .72); d.setAttribute('cy', k.y + (cy - k.y) * z * .72);
          d.setAttribute('opacity', an * Math.sin(z * Math.PI));
        });
      },
    };
  }


  // ---- Szene: neben dem Findbuch – Mappen nach Sachgebiet links, jedes Stück nach Art rechts
  const SACH_DE = { 'Correspondence': 'Korrespondenz', 'Papers by Other Writers': 'Schriften anderer', 'Manuscripts & Notes (Technical)': 'Manuskripte, technisch',
    'Bridges (Suspension)': 'Hängebrücken', 'Patents': 'Patente', 'Wind Turbines': 'Windturbinen', 'Hydraulics': 'Hydraulik' };
  const ART_DE = { letter: 'Briefe', note: 'Notizen', report: 'Berichte', enclosure: 'Beilagen', telegram: 'Telegramme', memo: 'Memos' };
  function klassen(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H), f = F(opt);
    const links = (f.sachgebiete || []).filter(x => SACH_DE[x.name]).map(x => ({ t: SACH_DE[x.name], n: x.count, pat: x.name === 'Patents' }));
    const rechts = Object.entries(f.typen || {}).filter(([k]) => ART_DE[k]).map(([k, n]) => ({ t: ART_DE[k], n }));
    const kopf = (x, a, b) => { const g = add(s, 'g', { opacity: 0 }); add(g, 'text', { x, y: 42, fill: GOLD, 'font-size': 19, 'font-weight': 600 }, a); add(g, 'text', { x, y: 64, fill: '#7f8ea4', 'font-size': 14 }, b); return g; };
    const k1 = kopf(40, 'Findbuch', 'Mappen nach Sachgebiet'), k2 = kopf(530, 'Famulus', 'jedes Stück nach seiner Art');
    const balken = (liste, x0, breite, max, farbe) => liste.map((e, i) => {
      const y = 92 + i * 46, g = add(s, 'g', { opacity: 0 });
      add(g, 'text', { x: x0, y: y + 15, fill: PAPIER, 'font-size': 16 }, e.t);
      const r = add(g, 'rect', { x: x0 + 175, y, width: 0, height: 20, rx: 3, fill: e.pat ? GOLD : farbe });
      const z = add(g, 'text', { x: x0 + 180, y: y + 15, fill: '#9fb0c6', 'font-size': 14 }, fmt(e.n));
      return { g, r, z, w: Math.max(4, e.n / max * breite), x0, n: e.n };
    });
    const L = balken(links, 40, 200, 250, '#3a5170'), R = balken(rechts, 530, 220, 6000, HELL);
    const kl = (f.messung || {}).klassen || {}, pa = kl.patente || {};
    const fazit = add(s, 'g', { opacity: 0 });
    add(fazit, 'rect', { x: 40, y: 410, width: 920, height: 150, rx: 8, fill: 'rgba(227,199,102,.07)', stroke: GOLD2 });
    add(fazit, 'text', { x: 64, y: 448, fill: GOLD, 'font-size': 19, 'font-weight': 600 }, `Patente: ${pa.mappen_namens || '?'} Mappen im Findbuch – ${fmt(pa.stuecke || 0)} Stücke zum Thema bei Famulus,`);
    add(fazit, 'text', { x: 64, y: 476, fill: GOLD, 'font-size': 19, 'font-weight': 600 }, `${pa.ausserhalb || '?'} davon in ${pa.in_mappen || '?'} anderen Mappen.`);
    add(fazit, 'text', { x: 64, y: 516, fill: PAPIER, 'font-size': 16 }, `${kl.themen || '?'} Themen · ${fmt(kl.personen || 0)} Personen · ${fmt(kl.institutionen || 0)} Institutionen · ${fmt(kl.orte || 0)} Orte · ${fmt(kl.nennungen || 0)} Nennungen`);
    add(fazit, 'text', { x: 64, y: 542, fill: '#9fb0c6', 'font-size': 15 }, `${fmt(kl.dossiers || 0)} Dossiers mit ${fmt(kl.fakten || 0)} Fakten und ${fmt(kl.belege || 0)} Belegen`);
    return {
      frame(p) {
        k1.setAttribute('opacity', seg(p, 0, .1)); k2.setAttribute('opacity', seg(p, .3, .4));
        L.forEach((b, i) => { const q = ease(seg(p, .02 + i * .04, .2 + i * .04)); b.g.setAttribute('opacity', q > 0 ? 1 : 0); b.r.setAttribute('width', b.w * q); b.r.setAttribute('x', b.x0 + 175); b.z.setAttribute('x', b.x0 + 182 + b.w * q); });
        R.forEach((b, i) => { const q = ease(seg(p, .32 + i * .04, .5 + i * .04)); b.g.setAttribute('opacity', q > 0 ? 1 : 0); b.r.setAttribute('width', b.w * q); b.r.setAttribute('x', b.x0 + 175); b.z.setAttribute('x', b.x0 + 182 + b.w * q); });
        fazit.setAttribute('opacity', ease(seg(p, .72, .9)));
      },
    };
  }

  // ---- Szene: Tempo – gemessene Antwortzeiten (messung.py), Balken auf einer Skala bis 15 ms
  function tempo(el, opt = {}) {
    const W = 1000, H = 600, s = svg(el, W, H), m = (F(opt).messung || {}), u = m.umfang || {};
    const zeilen = [
      { t: 'Volltext (BM25)', d: `„Guggenheim“ in ${fmt(u.saetze || 0)} Sätzen`, r: m.volltext_guggenheim, top: true },
      { t: 'Lemma', d: `„beurlauben“ in ${fmt(u.tokens || 0)} Wörtern`, r: m.lemma_beurlauben },
      { t: 'Personen-ID', d: 'Ludwig Hopf (P001292) → alle Stücke', r: m.person_hopf },
      { t: 'Dossier', d: 'Ludwig Hopf → alle Fakten mit Belegen', r: m.dossier_hopf },
    ].filter(z => z.r);
    const x0 = 300, x1 = 900, skala = 15, X = ms => x0 + Math.min(ms, skala) / skala * (x1 - x0);
    const achse = add(s, 'g', { opacity: 0 });
    [0, 5, 10, 15].forEach(v => { add(achse, 'line', { x1: X(v), x2: X(v), y1: 70, y2: 470, stroke: '#1c2b42' }); add(achse, 'text', { x: X(v), y: 495, fill: '#7f8ea4', 'font-size': 14, 'text-anchor': 'middle' }, v + ' ms'); });
    const reihen = zeilen.map((z, i) => {
      const y = 90 + i * 98, g = add(s, 'g', { opacity: 0 });
      add(g, 'text', { x: 40, y: y + 18, fill: GOLD, 'font-size': 20, 'font-weight': 600 }, z.t);
      add(g, 'text', { x: 40, y: y + 44, fill: '#9fb0c6', 'font-size': 14 }, z.d);
      const r = add(g, 'rect', { x: x0, y, width: 0, height: 34, rx: 4, fill: HELL });
      const t = add(g, 'text', { x: x0 + 8, y: y + 24, fill: PAPIER, 'font-size': 18, 'font-weight': 600 }, '');
      return { g, r, t, z };
    });
    const fuss = add(s, 'text', { x: 40, y: 560, fill: '#7f8ea4', 'font-size': 14, opacity: 0 },
      `gemessen ${m.datum || ''}: lesender Zugriff auf die DuckDB-Indizes, warm, Median aus 15 Läufen`);
    return {
      frame(p) {
        achse.setAttribute('opacity', seg(p, 0, .1));
        reihen.forEach((e, i) => {
          const q = ease(seg(p, .1 + i * .15, .3 + i * .15)), ms = e.z.r.median_ms;
          e.g.setAttribute('opacity', q > 0 ? 1 : 0);
          e.r.setAttribute('width', Math.max(3, (X(ms) - x0) * q));
          e.t.setAttribute('x', x0 + Math.max(3, (X(ms) - x0) * q) + 10);
          e.t.textContent = q >= 1 ? `${String(ms).replace('.', ',')} ms · ${e.z.top ? 'beste ' + e.z.r.treffer + ' nach Rang' : fmt(e.z.r.treffer) + ' Treffer'}` : '';
        });
        fuss.setAttribute('opacity', seg(p, .8, .95));
      },
    };
  }


  // ---- Szene: die Kommunikationsakte der Riemann-Kommunikation als wachsende Kartenstapel (assets/riemann/*.json,
  // erzeugt von riemann_prozess.py aus der laufenden Erhebung, nur lesend). Zeit 16.11. 00:00 → letzter Akt, nichtlinear
  // gerafft; je Stunde fliegen Karten im Verhältnis der echten Zahlen auf ihre Stapel; die Zähler zählen die echten Werte.
  const STUFEN = [
    { k: 'ankuendigung', t: 'Ankündigung', f: '#e3c766' },
    { k: 'famulus', t: 'Famulus-Zuarbeit', u: 'Lean, gekennzeichnet', f: '#c9a227' },
    { k: 'verstehen', t: 'Verstehen', u: 'Fragen und Zweifel', f: '#9ec3e6' },
    { k: 'pruefen', t: 'Prüfen', u: 'laufend, teilweise, gescheitert', f: '#ff9b8e' },
    { k: 'validieren', t: 'Validieren', u: 'bestanden: Kernel, comparator', f: '#8fd19e' },
    { k: 'veroeffentlichen', t: 'Veröffentlichen', u: 'Presse, Blogs, arXiv', f: '#d9dee6' },
  ];
  const KANAL = { github: 'GitHub', zulip: 'Lean-Zulip', hn: 'Hacker News', x: 'X', bluesky: 'Bluesky', mastodon: 'Mastodon',
    presse: 'Presse', blog: 'Blog', medium: 'Medium', arxiv: 'arXiv', wikipedia: 'Wikipedia', lemmy: 'Lemmy',
    stackexchange: 'StackExchange', pruefung: 'Prüfakt', youtube: 'YouTube' };
  const esc = t => String(t || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  async function stapel(el, opt = {}) {
    const DRUCK = !!opt.standbild, basis = opt.basis || '';
    const [P, SEITEN] = await Promise.all([fetch(basis + 'assets/riemann/prozess.json').then(r => r.json()), fetch(basis + 'assets/riemann/seiten.json').then(r => r.json())]);
    el.innerHTML = '';
    const W = 1180, H = 520, N = STUFEN.length, breite = W / N, A = P.ankuendigung_stunde, E = P.stunden;
    const buehne = document.createElement('div'); buehne.className = 'st-buehne' + (DRUCK ? ' st-standbild' : ''); el.appendChild(buehne);
    const add_ = (cls, html, parent = buehne) => { const d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; parent.appendChild(d); return d; };
    const echoLage = add_('st-echo');
    const echoZahl = add_('st-echo-zahl', '<b>0</b><span>Echo: Hacker News, X, Bluesky, Mastodon, Wikipedia …</span>');
    const kopf = STUFEN.map((s, i) => add_('st-kopf', `<b style="color:${s.f}">${s.t}</b>${s.u ? `<span>${s.u}</span>` : ''}`));
    kopf.forEach((d, i) => { d.style.left = (i * breite + 8) + 'px'; d.style.width = (breite - 16) + 'px'; });
    const zahl = STUFEN.map((s, i) => { const d = add_('st-zahl', '0'); d.style.left = (i * breite) + 'px'; d.style.width = breite + 'px'; d.style.color = s.f; return d; });
    const pfeile = add_('st-pfeile', STUFEN.slice(1).map((s, i) => `<i style="left:${(i + 1) * breite - 9}px"></i>`).join(''));
    const leiste = add_('st-leiste', '<div class="st-zeiger"></div><div class="st-uhr"></div>');
    for (let d = 0; d <= 6; d++) { const m = add_('st-tag', `${16 + d}.11.`, leiste); m.style.left = (zeitX(d * 24) / W * 100) + '%'; }
    const uhr = leiste.querySelector('.st-uhr'), zeiger = leiste.querySelector('.st-zeiger');
    const fazit = add_('st-fazit', `Alle erfassten Kanäle: <b>${fmt(P.akte)}</b> Kommunikationsakte · <b>${fmt(P.pruefakte)}</b> Prüfakte, davon <b>${fmt(P.summe.validieren)}</b> bestanden · <b>${fmt(P.summe.famulus)}</b> ausdrücklich gekennzeichnete Famulus-Beiträge`);
    const fuss = add_('st-fuss', `Famulus-Erhebung riemann-kommunikation, Stand ${esc(P.stand)} UTC; Untergrenzen der erfassten Kanäle; Stufenregeln: riemann_prozess.py`);
    // Zeit → x (nichtlinear: 16.–20.11. bis zur Ankündigung eng, danach weit)
    function zeitX(h) { const a = Math.min(h, A) / A * 0.22, b = Math.max(0, h - A) / (E - A) * 0.78; return (a + b) * W; }
    // Inhalt einer Karte
    const bilder = {}; SEITEN.forEach(s => (bilder[s.stufe] = bilder[s.stufe] || []).push(s));
    const kartenHTML = c => `<div class="st-k-kopf"><b>${esc(c.wer)}</b><span>${esc(KANAL[c.kanal] || c.kanal)} · ${esc(c.zeit)}</span></div><div class="st-k-text">${esc(c.text)}</div>`;
    const stapelHoehe = {};
    function lege(stufe, inhalt, istBild, vonMitte) {
      const i = STUFEN.findIndex(s => s.k === stufe), n = (stapelHoehe[stufe] = (stapelHoehe[stufe] || 0) + 1);
      const k = add_('st-karte' + (istBild ? ' st-bild' : ''), inhalt);
      k.style.borderTopColor = STUFEN[i].f;
      const x = i * breite + breite / 2, y = 365 - Math.min(n, 24) * 4.2, rot = ((n * 37) % 13) - 6;
      const ziel = `translate(${x}px, ${y}px) translate(-50%, -100%) rotate(${rot}deg)`;
      if (DRUCK || !vonMitte) { k.style.transform = ziel; k.style.opacity = 1; }
      else {
        k.style.transform = `translate(${W / 2}px, 40px) translate(-50%, -100%) scale(.6) rotate(${-rot}deg)`; k.style.opacity = 0;
        requestAnimationFrame(() => requestAnimationFrame(() => { k.style.transform = ziel; k.style.opacity = 1; }));
      }
      const alle = buehne.querySelectorAll(`.st-karte[data-s="${stufe}"]`); k.dataset.s = stufe;
      if (alle.length > 22) alle[0].remove();
      return k;
    }
    // Heldenkarten treten nacheinander auf (Warteschlange), nie zwei zugleich
    let heldFrei = 0;
    function held(stufe, inhalt, istBild, danach) {
      const jetzt = performance.now(), warte = Math.max(0, heldFrei - jetzt);
      heldFrei = Math.max(jetzt, heldFrei) + 2500;
      setTimeout(() => { heldZeigen(stufe, inhalt, istBild); if (danach) setTimeout(danach, 1700); }, warte);
    }
    function heldZeigen(stufe, inhalt, istBild) {
      const h = add_('st-held' + (istBild ? ' st-bild' : ''), inhalt);
      h.style.borderColor = STUFEN.find(s => s.k === stufe).f;
      requestAnimationFrame(() => h.classList.add('an'));
      setTimeout(() => { h.classList.remove('an'); h.classList.add('weg'); }, 1900);
      setTimeout(() => h.remove(), 2600);
    }
    const kum = h => STUFEN.map(s => P.reihe[s.k].slice(0, Math.max(0, Math.floor(h) + 1)).reduce((a, b) => a + b, 0) + (P.vor_dem_fenster[s.k] || 0));
    const echoKum = h => P.reihe.echo.slice(0, Math.max(0, Math.floor(h) + 1)).reduce((a, b) => a + b, 0) + (P.vor_dem_fenster.echo || 0);
    let ki = {}; const naechste = st => { const l = P.karten[st] || []; ki[st] = ((ki[st] || 0) + 1) % Math.max(1, l.length); return l[ki[st]]; };
    let bi = {}; const naechstesBild = st => { const l = bilder[st] || []; if (!l.length) return null; bi[st] = ((bi[st] || -1) + 1) % l.length; return l[bi[st]]; };
    const bildHTML = s => `<img src="${basis + s.bild}" alt=""><div class="st-b-titel">${esc(s.titel)}</div>`;
    function echoKarte(n) {
      if (echoLage.childElementCount > 140) echoLage.firstChild.remove();
      const c = naechste('echo'); if (!c) return;
      const d = document.createElement('div'); d.className = 'st-echo-karte'; d.textContent = c.text;
      d.style.left = ((n * 211) % 1100) + 'px'; d.style.top = (60 + (n * 97) % 240) + 'px'; d.style.transform = `rotate(${((n * 29) % 17) - 8}deg)`;
      echoLage.appendChild(d);
    }
    // Endzustand (Druck): alles liegt, alle Zähler stehen
    function endzustand() {
      STUFEN.forEach(s => {
        (bilder[s.k] || []).forEach(b => lege(s.k, bildHTML(b), true, false));
        (P.karten[s.k] || []).slice(0, s.k === 'ankuendigung' ? 0 : 10).forEach(c => lege(s.k, kartenHTML(c), false, false));
      });
      for (let n = 0; n < 120; n++) echoKarte(n);
      kum(E).forEach((v, i) => (zahl[i].textContent = fmt(v)));
      echoZahl.querySelector('b').textContent = fmt(echoKum(E));
      zeiger.style.left = '100%'; uhr.textContent = `${P.ende.slice(8, 10)}.${P.ende.slice(5, 7)}. ${P.ende.slice(11, 16)} UTC`;
      pfeile.classList.add('an'); fazit.classList.add('an');
    }
    if (DRUCK) { endzustand(); return { frame() {} }; }
    // Lauf: 32 s; die ruhigen Tage 6 s, die Explosion 26 s
    const DAUER = 32000;
    const stundeBei = p => (p < 6 / 32 ? (p / (6 / 32)) * A : A + (p - 6 / 32) / (26 / 32) * (E - A));
    let letzte = -1, echoN = 0, heldGezeigt = {};
    return {
      dauer: DAUER,
      frame(p) {
        const h = stundeBei(p);
        zeiger.style.left = (zeitX(h) / W * 100) + '%';
        const d = new Date(new Date(P.start + 'Z').getTime() + h * 3600e3);
        uhr.textContent = `${d.getUTCDate()}.11. ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
        const ganz = Math.floor(h);
        for (let s = letzte + 1; s <= ganz && s < E; s++) {
          if (s === Math.floor(A) && !heldGezeigt.ankuendigung) {
            heldGezeigt.ankuendigung = 1;
            held('ankuendigung', bildHTML(bilder.ankuendigung[0]), true,
              () => (bilder.ankuendigung || []).forEach((b, i) => setTimeout(() => lege('ankuendigung', bildHTML(b), true, true), i * 260)));
          }
          STUFEN.slice(1).forEach(st => {
            const n = P.reihe[st.k][s] || 0; if (!n) return;
            if (!heldGezeigt[st.k] && P.helden[st.k] && s >= A) { heldGezeigt[st.k] = 1; held(st.k, kartenHTML(P.helden[st.k]), false); }
            const sichtbar = Math.min(3, Math.ceil(Math.log2(n + 1)));
            for (let j = 0; j < sichtbar; j++) {
              const bild = (st.k !== 'famulus' && st.k !== 'pruefen' && (stapelHoehe[st.k] || 0) % 4 === 1) ? naechstesBild(st.k) : null;
              setTimeout(() => (bild ? lege(st.k, bildHTML(bild), true, true) : lege(st.k, kartenHTML(naechste(st.k) || {}), false, true)), j * 120);
            }
          });
          const e = P.reihe.echo[s] || 0; for (let j = 0; j < Math.min(5, Math.ceil(e / 25)); j++) echoKarte(echoN++);
        }
        letzte = Math.max(letzte, ganz);
        kum(h).forEach((v, i) => (zahl[i].textContent = fmt(v)));
        echoZahl.querySelector('b').textContent = fmt(echoKum(h));
        if (p >= 1) { pfeile.classList.add('an'); fazit.classList.add('an'); }
      },
    };
  }


  // ---- Szene: Keplers Division, rekonstruiert (assets/kepler/dc.json aus dem Rechenfall des Famulus-Calculators):
  // Teildividend, Quotientenziffer, Abzug, Rest – Schritt für Schritt; am Ende Ergebnis neben dem gedruckten Wert.
  async function division(el, opt = {}) {
    const D = await fetch((opt.basis || '') + 'assets/kepler/dc.json').then(r => r.json());
    const W = 1000, H = 600, s = svg(el, W, H), dv = D.division, st = dv.steps;
    const mono = { 'font-family': 'Menlo, "SF Mono", monospace', 'font-size': 30 };
    const x0 = 120, y0 = 90, cw = 21;   // Zeichenbreite der Mono-Schrift bei 30 px
    add(s, 'text', { x: x0, y: y0, fill: PAPIER, ...mono }, String(dv.dividend));
    add(s, 'text', { x: x0 + String(dv.dividend).length * cw + 14, y: y0, fill: '#9fb0c6', ...mono }, `: ${dv.divisor} =`);
    const q = add(s, 'text', { x: x0 + (String(dv.dividend).length + String(dv.divisor).length + 4) * cw + 14, y: y0, fill: GOLD, ...mono, 'font-weight': 700 }, '');
    const zeilen = st.map((z, i) => {
      const g = add(s, 'g', { opacity: 0 });
      const off = i * cw, y = y0 + 58 + i * 82;
      add(g, 'text', { x: x0 + off, y, fill: PAPIER, ...mono }, String(z.partial_dividend));
      add(g, 'text', { x: x0 + off, y: y + 34, fill: '#ff9b8e', ...mono }, '−' + String(z.subtracted).padStart(String(z.partial_dividend).length, ' '));
      add(g, 'line', { x1: x0 + off, x2: x0 + off + String(z.partial_dividend).length * cw, y1: y + 44, y2: y + 44, stroke: GRAU });
      add(g, 'text', { x: x0 + off + String(z.partial_dividend).length * cw + 18, y: y + 16, fill: '#7f8ea4', 'font-size': 18 }, `→ Ziffer ${z.quotient_digit}, Rest ${z.remainder}`);
      return g;
    });
    const ende = add(s, 'g', { opacity: 0 });
    add(ende, 'rect', { x: 600, y: 470, width: 340, height: 96, rx: 8, fill: 'rgba(227,199,102,.08)', stroke: GOLD2 });
    add(ende, 'text', { x: 620, y: 508, fill: GOLD, 'font-size': 24, 'font-weight': 600 }, `nachgerechnet ${D.ergebnis}`);
    add(ende, 'text', { x: 620, y: 546, fill: PAPIER, 'font-size': 24 }, `gedruckt ${D.gedruckt}`);
    return {
      frame(p) {
        const n = st.length, k = Math.floor(seg(p, .05, .85) * n + (p >= .85 ? 1 : 0));
        zeilen.forEach((g, i) => g.setAttribute('opacity', i < k ? 1 : 0));
        q.textContent = st.slice(0, Math.min(k, n)).map(z => z.quotient_digit).join('');
        ende.setAttribute('opacity', ease(seg(p, .88, 1)));
      },
    };
  }

  const SZENEN = { zeitleiste, boxen, vorgang, netz, famuli, klassen, tempo, stapel, division };

  // ---- Lauf: eine Szene spielt ab (im Deck, wenn ihre Folie erscheint; in der Publikation beim Einscrollen)
  const laeufe = new WeakMap();
  function stoppe(el) { const alt = laeufe.get(el); if (alt) cancelAnimationFrame(alt); laeufe.delete(el); }
  function starte(el, cfg = {}) {
    const ds = el.dataset, name = ds.szene, mk = SZENEN[name];
    if (!mk) return Promise.resolve(null);
    const standbild = cfg.standbild != null ? !!cfg.standbild : (ds.standbild != null ? ds.standbild !== '0' : DRUCK);
    const opt = { luecken: ds.luecken === '1', standbild, basis: cfg.basis != null ? cfg.basis : (ds.basis || ''), facts: cfg.facts };
    const lauf = (sc, dauer) => {
      stoppe(el);
      if (standbild) { sc.frame(1, 0); return sc; }
      const t0 = performance.now();
      const tick = now => {
        const p = clamp((now - t0) / dauer);
        sc.frame(p, now - t0);
        if (p < 1 || sc.loop) laeufe.set(el, requestAnimationFrame(tick));
      };
      laeufe.set(el, requestAnimationFrame(tick));
      return sc;
    };
    const r = mk(el, opt);
    if (r && typeof r.then === 'function') return r.then(sc => lauf(sc, +(cfg.dauer || sc.dauer || ds.dauer || 6000)));
    return Promise.resolve(lauf(r, +(cfg.dauer || ds.dauer || 6000)));
  }

  globalThis.FamulusSzenen = { SZENEN, starte, stoppe, fmt };
})();
