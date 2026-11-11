// Scroll-driven lotus bloom: 72 frames drawn to a canvas.
// Smoothness comes from three things: every frame is decoded before it is needed,
// neighbouring frames are cross-faded so there are no visible steps, and the
// position follows the scroll with a short, frame-rate independent ease.
(function () {
  const COUNT = 72;
  const BLOOM_END = 0.84;   // the flower is fully open before the title arrives
  const EASE_MS = 110;      // how quickly the picture catches up with the scroll
  const section = document.getElementById('bloom');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const lines = [...document.querySelectorAll('.line')];
  const hint = document.getElementById('hint');
  const loader = document.getElementById('loader');
  const bar = document.querySelector('.bar');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames = new Array(COUNT);
  const src = (i) => 'frames/f' + String(i).padStart(3, '0') + '.webp';

  let target = reduced ? 1 : 0, current = target, drawnAt = -1;
  let running = false, last = 0, lastTick = 0, loaded = 0;

  function load(i) {
    if (frames[i]) return Promise.resolve(frames[i]);
    return new Promise((res) => {
      const img = new Image();
      img.decoding = 'async';
      const done = (ok) => {
        if (ok) frames[i] = img;
        loaded++;
        if (loader) loader.style.transform = 'scaleX(' + loaded / COUNT + ')';
        if (loaded >= COUNT && loader) loader.classList.add('done');
        res(ok ? img : null);
      };
      img.onload = () => {
        done(true);
        // Decoding ahead of time keeps the first paint of each frame off the scroll path.
        if (img.decode) img.decode().catch(() => {});
      };
      img.onerror = () => done(false);
      img.src = src(i);
    });
  }

  // Take the page colours from the artwork so the sections around it join without a seam.
  function sampleColours(img) {
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 64, 36);
      const px = (sx, sy) => { const d = x.getImageData(sx, sy, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
      const root = document.documentElement.style;
      root.setProperty('--paper', px(2, 2));
      root.setProperty('--water', px(2, 35));
    } catch (e) { /* keep the CSS defaults */ }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    drawnAt = -1;
    render();
  }

  function nearest(i) {
    for (let d = 0; d < COUNT; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  // "Cover" fit, anchored to the bottom so the water line always meets the next section.
  function paint(img, alpha, zoom) {
    const s = Math.max(canvas.width / img.width, canvas.height / img.height) * zoom;
    const dw = img.width * s, dh = img.height * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (canvas.width - dw) / 2, canvas.height - dh, dw, dh);
  }

  function draw(p) {
    const pos = p * (COUNT - 1);
    if (Math.abs(pos - drawnAt) < 0.004) return;
    const i0 = Math.floor(pos), mix = pos - i0;
    const a = frames[i0] || nearest(i0);
    if (!a) return;
    const zoom = 1.07 - 0.07 * p;           // a slow pull-back while the flower opens
    paint(a, 1, zoom);
    const b = frames[i0 + 1];
    if (b && mix > 0.01 && a === frames[i0]) paint(b, mix, zoom);
    ctx.globalAlpha = 1;
    drawnAt = pos;
  }

  function text(p) {
    for (const el of lines) {
      const a = +el.dataset.from, b = +el.dataset.to, fade = 0.07;
      let o = 0;
      if (p >= a && p <= b) o = Math.min(1, (p - a) / fade, (b - p) / fade);
      if (a === 0) o = p <= b ? Math.min(1, (b - p) / fade) : 0; // first line is visible on arrival
      o = Math.max(0, o);
      const e = o * o * (3 - 2 * o);
      el.style.opacity = e.toFixed(3);
      el.style.transform = `translate3d(0,${((1 - e) * 18).toFixed(1)}px,0)`;
      el.style.visibility = o > 0 ? 'visible' : 'hidden';
    }
    if (hint) hint.style.opacity = p > 0.02 ? 0 : 0.85;
  }

  function render() {
    draw(Math.min(1, current / BLOOM_END));
    text(current);
  }

  function tick(now) {
    const dt = Math.min(64, now - last || 16);
    last = lastTick = now;
    const k = 1 - Math.exp(-dt / EASE_MS);
    current += (target - current) * k;
    if (Math.abs(target - current) < 0.0004) current = target;
    render();
    if (current !== target) requestAnimationFrame(tick);
    else running = false;
  }
  function wake() {
    if (running) return;
    running = true; last = 0; lastTick = performance.now();
    requestAnimationFrame(tick);
    // If animation frames are paused (a background tab), settle on the scroll position directly.
    clearTimeout(settle);
    settle = setTimeout(function check() {
      if (!running) return;
      if (performance.now() - lastTick > 300) { current = target; running = false; drawnAt = -1; render(); }
      else settle = setTimeout(check, 350);
    }, 350);
  }
  let settle = 0;
  canvas.addEventListener('contextrestored', () => { drawnAt = -1; render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { drawnAt = -1; render(); } });

  let heroEnd = 0;
  function measure() { heroEnd = section.offsetTop + section.offsetHeight; }

  function onScroll() {
    const y = window.scrollY;
    if (bar) bar.classList.toggle('solid', y > heroEnd - 70);
    if (reduced) return;
    const span = section.offsetHeight - window.innerHeight;
    target = Math.min(1, Math.max(0, (y - section.offsetTop) / span));
    if (target !== current) wake();
  }

  measure();
  addEventListener('resize', () => { measure(); resize(); onScroll(); });
  addEventListener('scroll', onScroll, { passive: true });

  const first = reduced ? COUNT - 1 : 0;
  load(first).then((img) => {
    if (img) sampleColours(img);
    resize();
    onScroll();
    document.documentElement.classList.add('ready');
    // Load the rest in scroll order, a few at a time.
    let next = 0;
    const pump = () => {
      if (next >= COUNT) return;
      const i = next++;
      load(i).then(() => { drawnAt = -1; render(); pump(); });
    };
    for (let k = 0; k < 8; k++) pump();
  });

  // Gentle reveal for the sections below.
  const targets = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));
  } else {
    targets.forEach((el) => el.classList.add('in'));
  }
})();
