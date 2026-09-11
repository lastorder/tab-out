/**
 * ui/effects.ts — the sound and confetti that make closing tabs feel good.
 *
 * All effects fail silently: a browser without Web Audio, or a page where
 * autoplay is blocked, should never break the dashboard.
 */

/** Palette matching the dashboard's warm-paper theme. */
const CONFETTI_COLORS = [
  '#c8713a',
  '#e8a070',
  '#5a7a62',
  '#8aaa92',
  '#5a6b7a',
  '#8a9baa',
  '#d4b896',
  '#b35a5a',
];

const PARTICLE_COUNT = 17;

/**
 * Plays a short "swoosh": filtered white noise sweeping from high to low.
 * Synthesised with the Web Audio API, so the extension ships no audio files.
 */
export function playCloseSound(): void {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    const start = ctx.currentTime;
    const duration = 0.25;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Fast attack over the first 10%, then a smooth decay.
      const envelope = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(4000, start);
    filter.frequency.exponentialRampToValueAtTime(400, start + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(start);

    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    // No audio available — not worth surfacing.
  }
}

/** Fires a burst of confetti particles outward from a screen coordinate. */
export function shootConfetti(x: number, y: number): void {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    spawnParticle(x, y);
  }
}

function spawnParticle(x: number, y: number): void {
  const el = document.createElement('div');
  const isCircle = Math.random() > 0.5;
  const size = 5 + Math.random() * 6;
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

  el.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: ${size}px;
    height: ${size}px;
    background: ${color};
    border-radius: ${isCircle ? '50%' : '2px'};
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    opacity: 1;
  `;
  document.body.appendChild(el);

  // Simple projectile motion, biased upward so the burst reads as celebratory.
  const angle = Math.random() * Math.PI * 2;
  const speed = 60 + Math.random() * 120;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed - 80;
  const gravity = 200;

  const startTime = performance.now();
  const durationMs = 700 + Math.random() * 200;

  const frame = (now: number): void => {
    const elapsed = (now - startTime) / 1000;
    const progress = elapsed / (durationMs / 1000);
    if (progress >= 1) {
      el.remove();
      return;
    }

    const px = vx * elapsed;
    const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
    const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
    const rotate = isCircle ? 0 : elapsed * 200;

    el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
    el.style.opacity = String(opacity);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

/** Fires confetti from the centre of an element. */
export function burstFrom(el: Element): void {
  const rect = el.getBoundingClientRect();
  shootConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/** Fades and scales an element out, then removes it. Resolves when gone. */
export function fadeOut(el: HTMLElement, durationMs = 200): Promise<void> {
  return new Promise((resolve) => {
    el.style.transition = `opacity ${durationMs}ms, transform ${durationMs}ms`;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8)';
    window.setTimeout(() => {
      el.remove();
      resolve();
    }, durationMs);
  });
}

/** Confetti + the card's own closing animation, then removal. */
export function animateCardOut(card: HTMLElement, onDone?: () => void): void {
  burstFrom(card);
  card.classList.add('closing');
  window.setTimeout(() => {
    card.remove();
    onDone?.();
  }, 300);
}
