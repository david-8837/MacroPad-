/** A short, bounded canvas effect. It does not snapshot or transmit the UI. */
export function startWelcomeParticles(canvas: HTMLCanvasElement, card: HTMLElement, done: () => void): () => void {
  const context = canvas.getContext('2d');
  if (!context) { done(); return () => {}; }
  const rect = card.getBoundingClientRect();
  const art = card.querySelector<HTMLElement>('.welcome-art')?.getBoundingClientRect();
  const dark = document.documentElement.dataset.theme === 'dark';
  const width = window.innerWidth, height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  context.scale(ratio, ratio);
  let seed = 712369;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const particles: { x: number; y: number; dx: number; dy: number; size: number; color: string; delay: number }[] = [];
  const gap = 14;
  for (let y = rect.top + gap / 2; y < rect.bottom; y += gap) {
    for (let x = rect.left + gap / 2; x < rect.right; x += gap) {
      const inArt = art && y < art.bottom;
      const shade = rand();
      const color = inArt ? (shade < .12 ? '#5689d1' : shade < .36 ? '#d5d4d0' : '#383b40')
        : (shade < .08 ? '#5183c7' : dark ? (shade < .4 ? '#aeb7c4' : '#38414f') : (shade < .2 ? '#8b8b87' : '#e9e8e4'));
      const spreadX = (x - (rect.left + rect.width / 2)) / Math.max(rect.width / 2, 1);
      const spreadY = (y - (rect.top + rect.height / 2)) / Math.max(rect.height / 2, 1);
      particles.push({ x: x + (rand() - .5) * 5, y: y + (rand() - .5) * 5,
        dx: spreadX * 62 + (rand() - .5) * 92, dy: spreadY * 38 - 30 + (rand() - .5) * 88,
        size: 2 + rand() * 4, color, delay: rand() * .18 });
    }
  }
  const duration = 850;
  let frame = 0, stopped = false, started: number | undefined;
  const draw = (now: number) => {
    if (stopped) return;
    started ??= now;
    const t = Math.min(1, (now - started) / duration);
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      const p = Math.max(0, Math.min(1, (t - particle.delay) / (1 - particle.delay)));
      const ease = 1 - (1 - p) ** 2;
      context.globalAlpha = (1 - p) * Math.min(1, t * 8);
      context.fillStyle = particle.color;
      context.fillRect(particle.x + particle.dx * ease, particle.y + particle.dy * ease, particle.size * (1 - p * .45), particle.size * (1 - p * .45));
    }
    context.globalAlpha = 1;
    if (t < 1) frame = requestAnimationFrame(draw);
    else { stopped = true; done(); }
  };
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
