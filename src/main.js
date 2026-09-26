import { createPlanToBuilding } from './components/plan-to-building/index.js';

const mount = document.querySelector('[data-plan-to-building]');
const hero = document.querySelector('[data-hero]');
const track = document.querySelector('[data-hero-track]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let building = null;

function mountBuilding() {
  building?.destroy();
  building = createPlanToBuilding(mount, {
    // Scroll through the track to build; reduced-motion users get a static
    // finished building with a play button instead (handled by the component).
    scroll: { target: track, enter: 'top top', leave: 'bottom bottom', sync: 0.4 },
    onProgress: (p) => hero.style.setProperty('--hero-progress', p.toFixed(4)),
  });
  hero.dataset.mode = building.mode;
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
    });
  }
}
