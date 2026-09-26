import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { createPlanToBuilding } from './components/plan-to-building/index.js';

const mount = document.querySelector('[data-plan-to-building]');
const hero = document.querySelector('[data-hero]');
const track = document.querySelector('[data-hero-track]');
const copy = document.querySelector('[data-hero-copy]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = () => window.innerWidth <= 900;

let lenis = null;
let building = null;
let copyExit = Infinity;

// Where the drawing sits: beside (or below) the copy at first, then centred.
const framing = {
  start(w, h) {
    if (!narrow()) return { x: w * 0.46, y: 84, w: w * 0.54 - 40, h: h - 84 - 96 };
    if (hero.dataset.mode === 'loop') return { x: 8, y: 8, w: w - 16, h: h - 76 };
    const top = copy.offsetTop + copy.offsetHeight + 12;
    return { x: 12, y: top, w: w - 24, h: Math.max(120, h - top - 84) };
  },
  focus(w, h) {
    if (!narrow()) return { x: w * 0.2, y: 64, w: w * 0.6, h: h - 64 - 104 };
    return { x: 10, y: 64, w: w - 20, h: h - 64 - 230 };
  },
};

function mountBuilding() {
  building?.destroy();
  lenis?.destroy();
  // Lenis smooths the scroll itself, so the timeline follows it 1:1 (sync: true).
  lenis = reducedMotion.matches ? null : new Lenis({ autoRaf: true, anchors: true, lerp: 0.09 });

  // Set before mounting: the framing reads it on the first render.
  hero.dataset.mode = reducedMotion.matches ? 'loop' : 'scroll';
  building = createPlanToBuilding(mount, {
    fill: true,
    framing,
    scroll: {
      target: track,
      enter: 'top top',
      leave: 'bottom bottom',
      sync: true,
      scrollTo: (y) => (lenis ? lenis.scrollTo(y, { duration: 1.6 }) : window.scrollTo({ top: y, behavior: 'smooth' })),
    },
    // The hero copy leaves while the camera moves the building to the centre.
    decorate(tl, { T }) {
      copyExit = T(1100);
      tl.add(copy, { opacity: [1, 0], translateY: [0, -36], duration: copyExit, ease: 'inQuad' }, 0);
    },
    onProgress(p) {
      hero.style.setProperty('--hero-progress', p.toFixed(4));
      // Once faded out, take the copy's links out of the click and tab order.
      const gone = building && p * building.duration >= copyExit;
      copy.style.visibility = gone ? 'hidden' : '';
    },
  });
  if (building.mode === 'loop') copy.removeAttribute('style');
  // Exposed for tinkering in the console.
  window.planToBuilding = building;
}

if (mount && track) {
  mountBuilding();
  // The component picks its mode once, so rebuild if the preference changes.
  reducedMotion.addEventListener('change', mountBuilding);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      reducedMotion.removeEventListener('change', mountBuilding);
      building?.destroy();
      lenis?.destroy();
    });
  }
}
