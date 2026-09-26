// Mounts a Three.js canvas driven by one Anime.js timeline and cleans everything
// up on destroy(). Two modes:
//  - scroll: the build is synced to the scroll position of `scroll.target`
//  - loop:   the build plays on its own, with play/pause + scrubbing
// Reduced-motion users always get the loop mode, paused on the finished building.
import * as THREE from 'three';
import { onScroll } from 'animejs';
import { createModel } from './model.js';
import { buildTimeline, BASE_DURATION } from './timeline.js';
import './plan-to-building.css';

const STAGES = [
  ['plan', 'Plan'],
  ['ground', 'Ground'],
  ['storeys', 'Storeys'],
  ['complete', 'Complete'],
];
const ELEVATION = THREE.MathUtils.degToRad(30);
const ICONS = {
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="0.6"/><rect x="9.5" y="2.5" width="3" height="11" rx="0.6"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/></svg>',
};

export function createPlanToBuilding(container, options = {}) {
  const {
    duration = BASE_DURATION,
    autoplay = true,
    controls = true,
    colors,
    maxPixelRatio = 2,
    scroll = null, // { target, enter = 'top top', leave = 'bottom bottom', sync = 0.4 }
    onProgress = null,
    label = 'Axonometric drawing of a floor plan rising, storey by storey, into a four-storey corner apartment building.',
  } = options;

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollMode = Boolean(scroll?.target) && !reducedQuery.matches;

  const el = document.createElement('div');
  el.className = 'ptb';
  el.dataset.state = 'loading';
  el.dataset.mode = scrollMode ? 'scroll' : 'loop';
  const stageButtons = STAGES.map(([key, text]) => `<button type="button" class="ptb__stage-btn" data-label="${key}">${text}</button>`).join('');
  el.innerHTML = `
    <div class="ptb__stage">
      <canvas class="ptb__canvas" role="img"></canvas>
      <p class="ptb__fallback" hidden>This animation needs WebGL, which isn't available in this browser.</p>
    </div>
    ${!controls ? '' : scrollMode ? `
    <div class="ptb__controls">
      <div class="ptb__track">
        <div class="ptb__progress" role="progressbar" aria-label="Construction progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
        <div class="ptb__stages">${stageButtons}</div>
      </div>
    </div>` : `
    <div class="ptb__controls">
      <button type="button" class="ptb__play"></button>
      <div class="ptb__track">
        <input type="range" class="ptb__scrub" min="0" max="1000" step="1" value="0" aria-label="Animation progress">
        <div class="ptb__stages">${stageButtons}</div>
      </div>
    </div>`}`;
  container.appendChild(el);

  const stage = el.querySelector('.ptb__stage');
  const canvas = el.querySelector('.ptb__canvas');
  canvas.setAttribute('aria-label', label);
  const playBtn = el.querySelector('.ptb__play');
  const scrub = el.querySelector('.ptb__scrub');
  const progressBar = el.querySelector('.ptb__progress');
  const progressFill = progressBar?.querySelector('span');
  const stageBtns = [...el.querySelectorAll('.ptb__stage-btn')];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    el.dataset.state = 'error';
    el.querySelector('.ptb__fallback').hidden = false;
    return { play() {}, pause() {}, seek() {}, destroy: () => el.remove(), timeline: null };
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const model = createModel(colors);
  scene.add(model.root);
  scene.add(new THREE.AmbientLight(0xffffff, 2.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.25);
  sun.position.set(-0.55, 1, 0.8);
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 400);
  const target = new THREE.Vector3(0, 10, 0);
  camera.position.copy(target).add(new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(150));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const view = new THREE.Box2();
  for (const p of model.boundsPoints) {
    const v = p.clone().applyMatrix4(camera.matrixWorldInverse);
    view.expandByPoint(new THREE.Vector2(v.x, v.y));
  }

  // Facade parts wait inside the wall until it has risen; hide them while they
  // are fully tucked in so they don't float above the flat plan pose.
  const tucked = [
    ...model.storeys.flatMap((s) => [
      ...s.windows.map((o) => [o, -0.45]),
      ...s.balconies.map((o) => [o, -0.65]),
      ...s.extras.map((o) => [o, -0.6]),
    ]),
    ...model.steps.map((o) => [o, -1.4]),
  ];
  function syncVisibility() {
    for (const [obj, hiddenZ] of tucked) obj.visible = obj.position.z > hiddenZ + 0.002;
    for (const level of [...model.storeys, model.roof]) {
      if (!level.slab) continue;
      const s = level.slab.scale.x;
      level.group.visible = s > 0.002;
      level.body.visible = s > 0.995;
    }
    model.roof.block.visible = model.roof.block.scale.y > 0.002;
  }
  function render() {
    syncVisibility();
    renderer.render(scene, camera);
  }

  const { timeline: tl, labels, duration: loopDuration } = buildTimeline(model, {
    duration,
    loop: !scrollMode,
    // onRender fires only when a value changes; onUpdate also covers the holds.
    onRender: render,
    onUpdate: () => updateControls(),
  });

  // In scroll mode Anime's ScrollObserver owns playback: it maps the target's
  // scroll range onto the timeline and eases towards it (`sync` smoothing).
  const observer = scrollMode
    ? onScroll({
      target: scroll.target,
      enter: scroll.enter ?? 'top top',
      leave: scroll.leave ?? 'bottom bottom',
      sync: scroll.sync ?? 0.4,
    })
    : null;
  observer?.link(tl);

  function fit() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const cap = w < 640 ? Math.min(1.5, maxPixelRatio) : maxPixelRatio;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false);
    const pad = 1.04;
    const bw = (view.max.x - view.min.x) * pad;
    const bh = (view.max.y - view.min.y) * pad;
    const cx = (view.max.x + view.min.x) / 2;
    const cy = (view.max.y + view.min.y) / 2;
    let halfW = bw / 2;
    let halfH = bh / 2;
    if (bw / bh > w / h) halfH = halfW / (w / h);
    else halfW = halfH * (w / h);
    Object.assign(camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH });
    camera.updateProjectionMatrix();
    render();
  }

  // ---- Playback state (loop mode) -------------------------------------------
  let wantPlay = !scrollMode && autoplay && !reducedQuery.matches;
  let inView = true;
  let scrubbing = false;
  let destroyed = false;

  function applyPlayback() {
    if (destroyed || scrollMode) return;
    const run = wantPlay && inView && !scrubbing && !document.hidden;
    if (run && tl.paused) tl.play();
    else if (!run && !tl.paused) tl.pause();
    if (playBtn) {
      playBtn.innerHTML = wantPlay ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', wantPlay ? 'Pause animation' : 'Play animation');
      playBtn.setAttribute('aria-pressed', String(wantPlay));
    }
    el.dataset.playing = String(wantPlay);
  }

  let lastProgress = -1;
  function updateControls() {
    const t = tl.iterationCurrentTime;
    const progress = t / loopDuration;
    if (progress !== lastProgress) {
      lastProgress = progress;
      onProgress?.(progress);
    }
    if (scrub && !scrubbing) scrub.value = String(Math.round(progress * 1000));
    if (progressFill) {
      progressFill.style.transform = `scaleX(${progress})`;
      progressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    }
    let active = STAGES[0][0];
    for (const [key] of STAGES) if (t >= labels[key] - 1) active = key;
    if (!scrollMode && t > labels.complete + 3000) active = null;
    for (const b of stageBtns) b.classList.toggle('is-active', b.dataset.label === active);
  }
  function seekTo(ms) {
    tl.seek(Math.max(0, Math.min(loopDuration - 1, ms)));
    render();
    updateControls();
  }

  const onPlayClick = () => {
    wantPlay = !wantPlay;
    applyPlayback();
  };
  const onScrubInput = () => {
    scrubbing = true;
    applyPlayback();
    seekTo((Number(scrub.value) / 1000) * loopDuration);
  };
  const onScrubEnd = () => {
    scrubbing = false;
    applyPlayback();
  };
  const onStageClick = (e) => {
    const time = labels[e.currentTarget.dataset.label];
    if (!scrollMode) {
      seekTo(time);
      return;
    }
    // Scroll to the point in the track that maps to this stage.
    const top = observer.offsetStart + (time / loopDuration) * observer.distance;
    window.scrollTo({ top, behavior: 'smooth' });
  };
  const onReducedChange = () => {
    if (reducedQuery.matches && !scrollMode) {
      wantPlay = false;
      seekTo(labels.complete);
    }
    applyPlayback();
  };
  const onVisibility = () => applyPlayback();

  playBtn?.addEventListener('click', onPlayClick);
  scrub?.addEventListener('input', onScrubInput);
  scrub?.addEventListener('change', onScrubEnd);
  scrub?.addEventListener('pointerup', onScrubEnd);
  stageBtns.forEach((b) => b.addEventListener('click', onStageClick));
  reducedQuery.addEventListener('change', onReducedChange);
  document.addEventListener('visibilitychange', onVisibility);

  const resizeObserver = new ResizeObserver(() => {
    fit();
    observer?.refresh();
  });
  resizeObserver.observe(stage);
  const intersectionObserver = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    applyPlayback();
  });
  intersectionObserver.observe(el);

  const onContextLost = (e) => {
    e.preventDefault();
    tl.pause();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // Everything is procedural and built synchronously above, so the first frame
  // shows the complete object; reveal the canvas only once it has rendered.
  fit();
  if (!scrollMode) seekTo(reducedQuery.matches || !autoplay ? labels.complete : 0);
  requestAnimationFrame(() => {
    if (destroyed) return;
    render();
    updateControls();
    el.dataset.state = 'ready';
    applyPlayback();
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer?.revert();
    tl.revert();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    reducedQuery.removeEventListener('change', onReducedChange);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    scene.traverse((obj) => obj.geometry?.dispose());
    Object.values(model.materials).forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    el.remove();
  }

  return {
    mode: scrollMode ? 'scroll' : 'loop',
    timeline: tl,
    observer,
    labels,
    duration: loopDuration,
    play() {
      wantPlay = true;
      applyPlayback();
    },
    pause() {
      wantPlay = false;
      applyPlayback();
    },
    /** Seek to a 0..1 progress value or a stage label ('plan' | 'ground' | 'storeys' | 'complete'). */
    seek(to) {
      seekTo(typeof to === 'string' ? labels[to] : to * loopDuration);
    },
    destroy,
  };
}
