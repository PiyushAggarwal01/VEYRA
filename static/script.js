(() => {
  'use strict';

  const EMOTIONS = {
    sadness:  { emoji: '😢', label: 'Sadness',  accent: '#5b7fd6', c: ['#b9c9f0', '#d3d9ee', '#c4e0ee'] },
    joy:      { emoji: '😄', label: 'Joy',      accent: '#f2b632', c: ['#ffe39a', '#ffd0a6', '#fff0c0'] },
    love:     { emoji: '❤️', label: 'Love',     accent: '#e8588b', c: ['#ffc2d6', '#f6c6e6', '#ffd9cc'] },
    anger:    { emoji: '😠', label: 'Anger',    accent: '#e04b3a', c: ['#ffb7a8', '#ffc9b0', '#f4aab4'] },
    fear:     { emoji: '😨', label: 'Fear',     accent: '#7a5bd0', c: ['#cbbcf2', '#b9c0ee', '#dcc9ee'] },
    surprise: { emoji: '😲', label: 'Surprise', accent: '#1fb8a6', c: ['#a6ebe0', '#bfeaf5', '#d4f2c4'] },
  };
  const NEUTRAL = { accent: '#8a94b0', c: ['#c9d2ea', '#e3d9f0', '#d4e8ee'] };
  const ORDER = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise'];
  const EXAMPLES = [
    'I miss the way things used to be.',
    'We got the job! I am over the moon!',
    'I would walk through fire for you.',
    'How dare you lie to my face again.',
    'Something is moving in the dark hallway.',
    'Wait, you flew in just to see me?',
  ];
  const MAX = 2000, TIMEOUT_MS = 15000, RING = 678.58;

  const $ = (id) => document.getElementById(id);
  const el = {
    text: $('text'), count: $('count'), go: $('go'), clear: $('clear'), error: $('error'),
    chips: $('chips'), orb: $('orb'), emoji: $('emoji'), ring: $('ring'), label: $('label'), sub: $('sub'),
    bars: $('bars'), status: $('status'), statusText: $('status-text'),
    histWrap: $('history-wrap'), hist: $('history'),
  };
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const history = [];
  let busy = false, listenTimer = null, healthTimer = null;

  /* ---------- Theme ---------- */
  function applyTheme(t) {
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--c1', t.c[0]);
    root.style.setProperty('--c2', t.c[1]);
    root.style.setProperty('--c3', t.c[2]);
  }

  /* ---------- Build static UI ---------- */
  EXAMPLES.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = s;
    b.addEventListener('click', () => { el.text.value = s; updateCount(); analyze(); });
    el.chips.appendChild(b);
  });

  const rows = {};
  ORDER.forEach((k) => {
    const e = EMOTIONS[k];
    const li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><div class="track"><i></i></div><span class="val">0.0%</span>';
    li.querySelector('.name').textContent = `${e.emoji} ${e.label}`;
    li.querySelector('i').style.setProperty('--bar', e.accent);
    el.bars.appendChild(li);
    rows[k] = { li, fill: li.querySelector('i'), val: li.querySelector('.val') };
  });

  /* ---------- Helpers ---------- */
  function updateCount() {
    const n = el.text.value.length;
    el.count.textContent = `${n} / ${MAX}`;
    el.count.classList.toggle('near', n > MAX * 0.9);
  }
  function showError(msg) { el.error.textContent = msg; el.error.hidden = !msg; }
  function setOrb(state) { el.orb.dataset.state = state; }
  function countUp(node, to, ms = 900) {
    if (reduceMotion) { node.textContent = to.toFixed(1) + '%'; return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min((now - t0) / ms, 1);
      node.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(1) + '%';
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Rendering ---------- */
  function render(result) {
    const key = result.predicted_emotion;
    const e = EMOTIONS[key] || { emoji: '🙂', label: key, ...NEUTRAL };
    const probs = result.all_probabilites || {};
    const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);

    applyTheme({ accent: e.accent, c: e.c });
    el.emoji.textContent = e.emoji;
    el.label.textContent = e.label;
    const pct = result.confidence * 100;
    let sub = `${pct.toFixed(1)}% confident.`;
    if (ranked.length > 1 && ranked[0][1] - ranked[1][1] < 0.15) {
      const second = EMOTIONS[ranked[1][0]];
      sub = `Close call with ${second ? second.label.toLowerCase() : ranked[1][0]}. ${sub}`;
    }
    el.sub.textContent = sub;
    el.ring.style.strokeDashoffset = RING * (1 - result.confidence);

    ORDER.forEach((k) => {
      const p = probs[k] || 0;
      rows[k].fill.style.transform = `scaleX(${Math.max(p, 0.004)})`;
      rows[k].li.classList.toggle('top', k === key);
      countUp(rows[k].val, p * 100);
    });

    el.orb.classList.remove('pop'); void el.orb.offsetWidth; el.orb.classList.add('pop');
    setOrb('idle');
  }

  function pushHistory(result) {
    history.unshift(result);
    if (history.length > 5) history.pop();
    el.hist.innerHTML = '';
    history.forEach((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span></span><span class="t"></span><span class="p"></span>';
      const [a, t, p] = b.children;
      a.textContent = (EMOTIONS[r.predicted_emotion] || {}).emoji || '🙂';
      t.textContent = r.text;
      p.textContent = (r.confidence * 100).toFixed(0) + '%';
      b.addEventListener('click', () => { el.text.value = r.text; updateCount(); render(r); });
      li.appendChild(b);
      el.hist.appendChild(li);
    });
    el.histWrap.hidden = false;
  }

  /* ---------- API ---------- */
  async function analyze() {
    const text = el.text.value.trim();
    if (busy) return;
    if (!text) { showError('Write a sentence first.'); el.text.focus(); return; }

    busy = true; showError('');
    el.go.disabled = true; el.go.classList.add('busy'); el.go.textContent = 'Analyzing';
    setOrb('thinking');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (res.status === 503) throw new Error('The model is still loading. Try again in a few seconds.');
      if (res.status === 422) throw new Error('That text was rejected. Use 1 to 2000 characters.');
      if (!res.ok) throw new Error(`The server returned an error (${res.status}). Try again.`);
      const data = await res.json();
      render(data);
      pushHistory(data);
    } catch (err) {
      setOrb('idle');
      showError(err.name === 'AbortError'
        ? 'The request timed out. Check the server and try again.'
        : (err instanceof TypeError ? 'Cannot reach the server. Check your connection and try again.' : err.message));
    } finally {
      clearTimeout(timer);
      busy = false;
      el.go.disabled = false; el.go.classList.remove('busy'); el.go.textContent = 'Analyze';
    }
  }

  async function checkHealth() {
    clearTimeout(healthTimer);
    let state = 'down', msg = 'Server unreachable';
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        state = d.model_loaded ? 'ready' : 'loading';
        msg = d.model_loaded ? 'Model ready' : 'Model loading…';
      }
    } catch (_) { /* keep defaults */ }
    el.status.dataset.state = state;
    el.statusText.textContent = msg;
    healthTimer = setTimeout(checkHealth, state === 'ready' ? 60000 : 4000);
  }

  /* ---------- Events ---------- */
  el.text.addEventListener('input', () => {
    updateCount();
    setOrb('listening');
    clearTimeout(listenTimer);
    listenTimer = setTimeout(() => { if (!busy) setOrb('idle'); }, 700);
  });
  el.text.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
  });
  el.go.addEventListener('click', analyze);
  el.clear.addEventListener('click', () => {
    el.text.value = ''; updateCount(); showError('');
    applyTheme(NEUTRAL);
    el.emoji.textContent = '🙂';
    el.label.textContent = 'Waiting for a sentence';
    el.sub.textContent = 'Results appear here.';
    el.ring.style.strokeDashoffset = RING;
    ORDER.forEach((k) => { rows[k].fill.style.transform = 'scaleX(0)'; rows[k].val.textContent = '0.0%'; rows[k].li.classList.remove('top'); });
    el.text.focus();
  });

  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      root.style.setProperty('--mx', (e.clientX / innerWidth - 0.5).toFixed(3));
      root.style.setProperty('--my', (e.clientY / innerHeight - 0.5).toFixed(3));
    }, { passive: true });
  }

  updateCount();
  checkHealth();
})();
