/* Famulus Universum: the map of the first screen and the miniatures of the chapters.

   The map is drawn from window.UNIVERSUM (data/universum.<lang>.js, written by build_universum.py): the core, six
   chapters on a ring in the order of the path of a statement, and one mark per component around its chapter
   (filled = in use or built, ringed = draft, dashed = future work, pale = an entry of a register without a state).
   Every position is a pure function of the time since the page opened (`draw(t)`), so the same code plays the
   entrance, holds a still for a photograph and stands still under reduced motion:

     ?static        nothing moves; the map is shown complete
     ?t=<seconds>   the map as it is at that instant, held
     ?scene=<name>&t=<seconds>[&d=<seconds>][&phase=<n>]
                    one drawn scene of the film (universum-scenes.js) filling the window, held at t of d seconds

   With prefers-reduced-motion the page behaves as with ?static. */
(function () {
  'use strict';
  const U = window.UNIVERSUM;
  if (!U || !window.d3) return;
  const d3 = window.d3;
  const Q = new URLSearchParams(location.search);
  const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEEK = Q.has('t') ? Math.max(0, parseFloat(Q.get('t')) || 0) : null;
  const STATIC = RM || Q.has('static');
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ one scene filling the window (photographs) */
  if (Q.has('scene')) {
    const name = Q.get('scene'), make = (window.GuideScenes || {})[name];
    const box = document.createElement('div');
    box.className = 'gp-slide gp-scene on gp-now uv-scene-test';
    box.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#00152e;opacity:1';
    document.body.append(box);
    document.documentElement.style.overflow = 'hidden';
    if (make) {
      const d = parseFloat(Q.get('d')) || 12;
      const sc = make(box, { data: { phase: Q.has('phase') ? +Q.get('phase') : undefined } },
        { lang: U.lang, duration: d * 1000, still: true, w: box.clientWidth, h: box.clientHeight, data: U });
      sc.frame(clamp((SEEK == null ? d : SEEK) / d), (SEEK == null ? d : SEEK) * 1000);
      box.dataset.ink = '1';
    } else box.textContent = 'unknown scene ' + name;
    return;
  }

  /* ------------------------------------------------------------------ the map */
  const stage = document.querySelector('.uv-map-stage');
  const info = document.querySelector('.uv-map-info');
  if (stage) {
    const R = 222, CORE = 50, NODE = 33, RING = [57, 75], CAP = 12;
    const svg = d3.select(stage).append('svg').attr('viewBox', '-360 -360 720 720').attr('aria-hidden', 'true').attr('focusable', 'false');
    const ch = U.chapters.map((c, i) => {
      const a = -Math.PI / 2 + i * TAU / U.chapters.length;
      return Object.assign({}, c, { i, a, x: R * Math.cos(a), y: R * Math.sin(a) });
    });
    // the marks of the components: up to CAP on the inner ring, the rest on the outer one
    ch.forEach(c => {
      const n = c.items.length, inner = Math.min(n, n > CAP ? Math.ceil(n / 2) : n);
      c.sats = c.items.map((it, k) => {
        const onInner = k < inner, m = onInner ? inner : n - inner, j = onInner ? k : k - inner;
        return { it, r: RING[onInner ? 0 : 1], a0: (j / m) * TAU + (onInner ? 0 : Math.PI / m), dir: onInner ? 1 : -1 };
      });
    });

    svg.append('circle').attr('class', 'uv-orbit').attr('r', R);
    const gLinks = svg.append('g'), gPath = svg.append('g'), gSats = svg.append('g'), gPulse = svg.append('g'), gNodes = svg.append('g'), gCore = svg.append('g');

    const links = gLinks.selectAll('line').data(ch).join('line').attr('class', 'uv-link');
    // the path of a statement: along the ring from chapter I to the last one, with a head
    const a0 = ch[0].a, a1 = ch[ch.length - 1].a, PATH_R = R;
    const arc = t => { const a = a0 + (a1 - a0) * t; return [PATH_R * Math.cos(a), PATH_R * Math.sin(a), a]; };
    const path = gPath.append('path').attr('class', 'uv-path');
    const head = gPath.append('path').attr('class', 'uv-path-head').attr('d', 'M0,-7 L13,0 L0,7 Z');

    const satG = gSats.selectAll('g').data(ch).join('g');
    const sats = satG.selectAll('circle').data(c => c.sats.map(s => Object.assign({ c }, s))).join('circle')
      .attr('class', s => 'uv-sat s-' + (s.it.s || 'none')).attr('r', s => (s.it.p === 'public' ? 4.6 : 3.7));
    const pulses = gPulse.selectAll('circle').data(ch).join('circle').attr('class', 'uv-pulse').attr('r', 3.4);

    const nodes = gNodes.selectAll('a').data(ch).join('a').attr('class', 'uv-node').attr('href', c => c.href)
      .attr('aria-label', c => U.t.chapter + ' ' + c.num + ': ' + c.name + ', ' + c.total + ' ' + U.t.components);
    nodes.append('circle').attr('r', NODE);
    nodes.append('text').attr('class', 'num').attr('dy', '0.36em').text(c => c.num);
    const names = nodes.append('text').attr('class', 'name').text(c => c.name);

    gCore.append('circle').attr('class', 'uv-core-glow').attr('r', CORE + 26);
    gCore.append('circle').attr('class', 'uv-core').attr('r', CORE);
    const coreText = gCore.append('text').attr('class', 'uv-core-t');
    const words = U.core.split(' '), half = Math.ceil(words.length / 2);
    [words.slice(0, half).join(' '), words.slice(half).join(' ')].forEach((line, k) =>
      coreText.append('tspan').attr('x', 0).attr('dy', k ? '1.15em' : '-0.2em').text(line));

    // text sizes in user units follow the rendered width: never below 12 px on the screen
    const fit = () => {
      const w = stage.clientWidth || 620, k = 720 / w, narrow = w < 520;
      names.attr('font-size', Math.max(15, 13 * k)).style('display', narrow ? 'none' : null)
        .attr('x', c => (RING[1] + 24) * Math.cos(c.a)).attr('y', c => (RING[1] + 24) * Math.sin(c.a))
        .attr('dy', c => (Math.sin(c.a) > 0.3 ? '0.9em' : Math.sin(c.a) < -0.3 ? '-0.2em' : '0.35em'))
        .attr('text-anchor', c => (Math.cos(c.a) > 0.3 ? 'start' : Math.cos(c.a) < -0.3 ? 'end' : 'middle'));
      nodes.selectAll('text.num').attr('font-size', Math.max(24, 15 * k));
      coreText.attr('font-size', Math.max(12.5, 12 * k)).style('display', narrow ? 'none' : null);
    };
    fit();
    window.addEventListener('resize', fit);

    /* the entrance (seconds): core 0–0.7 · path and chapters 0.6–3.4 · components follow their chapter · then the
       steady motion: the components circle their chapter, and evidence travels from every chapter to the core */
    const T_NODE = i => 0.7 + i * 0.5, T_END = T_NODE(ch.length - 1) + 1.2;
    function draw(t) {
      const done = t >= T_END + 2 || STATIC && SEEK == null;
      const tt = done && STATIC ? 1e6 : t;
      gCore.attr('transform', `scale(${ease(tt / 0.7)})`);
      const p = clamp((tt - 0.6) / (T_NODE(ch.length - 1) - 0.4));
      const steps = 80, pts = d3.range(0, Math.max(1, Math.round(steps * p)) + 1).map(k => arc(k / steps));
      path.attr('d', p > 0 ? 'M' + pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') : null);
      const tip = arc(p);
      head.attr('transform', `translate(${tip[0]},${tip[1]}) rotate(${(tip[2] + Math.PI / 2) * 180 / Math.PI})`).attr('opacity', p > 0.02 ? 1 : 0);
      nodes.attr('transform', c => `translate(${c.x},${c.y}) scale(${ease((tt - T_NODE(c.i)) / 0.5)})`);
      links.attr('x1', 0).attr('y1', 0).attr('x2', c => c.x * ease((tt - T_NODE(c.i) + 0.3) / 0.6)).attr('y2', c => c.y * ease((tt - T_NODE(c.i) + 0.3) / 0.6));
      const spin = STATIC ? 0 : tt * 0.045;
      sats.attr('cx', s => s.c.x + s.r * Math.cos(s.a0 + s.dir * spin)).attr('cy', s => s.c.y + s.r * Math.sin(s.a0 + s.dir * spin))
        .attr('opacity', (s, k) => ease((tt - T_NODE(s.c.i) - 0.35 - (k % s.c.sats.length) * 0.03) / 0.5));
      // evidence travels inward: from the edge of a chapter to the edge of the core
      const S0 = (R - NODE - 4) / R, S1 = (CORE + 4) / R;
      pulses.each(function (c) {
        const on = !STATIC && tt > T_END + c.i * 0.55;
        const u = on ? ((tt - T_END - c.i * 0.55) / 3.3) % 1 : 0, k = S0 + (S1 - S0) * u;
        d3.select(this).attr('cx', c.x * k).attr('cy', c.y * k).attr('opacity', on ? Math.sin(Math.PI * u) * 0.9 : 0);
      });
    }
    if (SEEK != null || STATIC) draw(SEEK != null ? SEEK : 1e6);
    else {
      const t0 = performance.now();
      let seen = true;
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { seen = es[0].isIntersecting; }).observe(stage);
      const loop = now => { if (seen) draw((now - t0) / 1000); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    stage.dataset.ink = '1';

    // what a chapter holds, said below the map when the pointer or the focus is on it
    const say = c => {
      if (!info) return;
      if (!c) { info.innerHTML = '<b>' + U.path + '</b>: ' + ch.map(x => x.num + ' ' + x.name).join(' → '); return; }
      const parts = Object.keys(U.states).filter(k => c.counts[k]).map(k => c.counts[k] + ' ' + U.states[k]);
      info.innerHTML = '<b>' + U.t.chapter + ' ' + c.num + ' · ' + c.name + '</b> — ' + c.total + ' ' + U.t.components + (parts.length ? ': ' + parts.join(', ') : '');
    };
    nodes.on('mouseenter focus', (e, c) => say(c)).on('mouseleave blur', () => say(null));
    say(null);

    const legend = document.createElement('ul');
    legend.className = 'uv-map-legend';
    const L = U.states;
    legend.innerHTML = `<li class="l-on"><i></i>${L.laeuft} · ${L.gebaut}</li><li class="l-draft"><i></i>${L.entwurf}</li>` +
      `<li class="l-out"><i></i>${L.ausbau} · ${L.perspektive}</li><li class="l-reg"><i></i>${U.lang === 'de' ? 'Eintrag eines Registers' : 'entry of a register'}</li>`;
    stage.parentNode.append(legend);
  }

  /* ------------------------------------------------------------------ the miniatures of the chapters */
  const scenes = window.GuideScenes || {};
  document.querySelectorAll('.uv-mini[data-scene]').forEach(el => {
    const make = scenes[el.dataset.scene];
    if (!make) return;
    const D = 9000;
    el.classList.add('on');                               // shown and filled before it is measured: an empty miniature
    el.append(document.createElement('i'));               // has no width, and its column exists only once it has content
    const sc = make(el, { data: { mini: true } }, { lang: U.lang, duration: D, still: STATIC, w: el.clientWidth, h: el.clientHeight, data: U, mini: true });
    sc.frame(1, D);
    if (STATIC) return;
    let raf = 0, played = false;
    const play = () => {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const f = now => { const p = clamp((now - t0) / D); sc.frame(p, now - t0); if (p < 1) raf = requestAnimationFrame(f); };
      raf = requestAnimationFrame(f);
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { if (es[0].intersectionRatio > 0.6 && !played) { played = true; play(); } }, { threshold: [0.6] }).observe(el);
    }
  });

  /* ------------------------------------------------------------------ the film: the keys reach the player */
  document.querySelectorAll('[data-guide-start]').forEach(a => a.addEventListener('click', () => {
    const root = document.querySelector('.gp[data-guide="tour"]');
    if (root) setTimeout(() => { root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); }, 60);
  }));
})();
