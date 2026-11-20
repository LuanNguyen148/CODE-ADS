(() => {
  'use strict';
  const canvas = document.getElementById('xmas-snow');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let flakes = [], w = 0, h = 0, raf = 0, last = 0, paused = document.documentElement.classList.contains('no-snow');

  function resize() {
    w = innerWidth; h = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(170, Math.max(70, Math.round(w * h / 9000)));
    flakes = Array.from({ length: count }, () => {
      const d = Math.random();
      return { x: Math.random() * w, y: Math.random() * h, r: .7 + d * 2.1, v: 12 + d * 28,
               o: .25 + d * .55, p: Math.random() * 6.28, s: 3 + Math.random() * 8, dx: -1 + Math.random() * 4 };
    });
    paint(0, 0);
  }
  function paint(dt, t) {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.v * dt; f.x += f.dx * dt;
      if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
      if (f.x > w + 12) f.x = -12; else if (f.x < -12) f.x = w + 12;
      const x = f.x + Math.sin(t * .00035 + f.p) * f.s;
      ctx.beginPath();
      ctx.fillStyle = `rgba(249,253,255,${f.o})`;
      ctx.arc(x, f.y, f.r, 0, 6.2832);
      ctx.fill();
    }
  }
  function loop(t) {
    const dt = last ? Math.min((t - last) / 1000, .05) : 0;
    last = t; paint(dt, t); raf = requestAnimationFrame(loop);
  }
  function update() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (!document.hidden && !motion.matches && !paused) raf = requestAnimationFrame(loop); else paint(0, 0);
  }
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', update);
  motion.addEventListener('change', update);
  window.xmasSnow = { setPaused(v) { paused = !!v; update(); } };
  resize(); update();
})();
