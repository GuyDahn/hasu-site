// Scroll-driven lotus bloom: 72 frames drawn to a canvas, eased toward the scroll position.
(function () {
  const COUNT = 72;
  const section = document.getElementById('bloom');
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const lines = [...document.querySelectorAll('.line')];
  const hint = document.getElementById('hint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames = new Array(COUNT);
  const src = (i) => 'frames/f' + String(i).padStart(3, '0') + '.webp';

  let target = reduced ? 1 : 0, current = target, drawn = -1, w = 0, h = 0;

  function load(i) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { frames[i] = img; res(img); };
      img.onerror = () => res(null);
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
      document.documentElement.style.setProperty('--paper', px(2, 2));
      document.documentElement.style.setProperty('--water', px(2, 35));
    } catch (e) { /* keep the CSS defaults */ }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    drawn = -1;
  }

  function nearest(i) { // nearest frame that has finished loading
    for (let d = 0; d < COUNT; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  function draw(p) {
    const idx = Math.round(p * (COUNT - 1));
    if (idx === drawn) return;
    const img = nearest(idx);
    if (!img) return;
    drawn = idx;
    // "Cover" fit, anchored to the bottom so the water line always meets the next section.
    const s = Math.max(canvas.width / img.width, canvas.height / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (canvas.width - dw) / 2, canvas.height - dh, dw, dh);
  }

  function text(p) {
    for (const el of lines) {
      const a = +el.dataset.from, b = +el.dataset.to, fade = 0.06;
      let o = 0;
      if (p >= a && p <= b) o = Math.min(1, (p - a) / fade, (b - p) / fade);
      if (a === 0) o = p <= b ? Math.min(1, (b - p) / fade) : 0; // first line is visible on arrival
      o = Math.max(0, o);
      el.style.opacity = o;
      el.style.transform = `translateY(${(1 - o) * 14}px)`;
    }
    hint.style.opacity = p > 0.03 ? 0 : 0.85;
  }

  function onScroll() {
    if (reduced) return;
    const r = section.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    target = Math.min(1, Math.max(0, -r.top / span));
    direct();
  }

  let lastTick = 0;
  function render() {
    draw(Math.min(1, current / 0.86)); // the flower is fully open before the title arrives
    text(current);
  }
  function tick(now) {
    lastTick = now || performance.now();
    current += (target - current) * 0.09; // easing gives the motion its calm, weighted feel
    if (Math.abs(target - current) < 0.0005) current = target;
    render();
    requestAnimationFrame(tick);
  }
  // If animation frames are paused (a background tab), follow the scroll position directly.
  function direct() {
    if (performance.now() - lastTick > 250) { current = target; render(); }
  }

  resize();
  addEventListener('resize', resize);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const first = reduced ? COUNT - 1 : 0;
  load(first).then((img) => {
    if (img) sampleColours(img);
    render();
    requestAnimationFrame(tick);
    // Load the rest in scroll order, a few at a time.
    let next = 0;
    const pump = () => { if (next < COUNT) { const i = next++; (frames[i] ? Promise.resolve() : load(i)).then(() => { drawn = -1; direct(); pump(); }); } };
    for (let k = 0; k < 6; k++) pump();
  });

  // Gentle reveal for the sections below.
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 }) : null;
  document.querySelectorAll('.intro, .cols article, .shots img, .close').forEach((el, i) => {
    if (!io) return;
    el.classList.add('reveal'); el.style.transitionDelay = (i % 3) * 120 + 'ms'; io.observe(el);
  });
})();
