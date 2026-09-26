// One looping, seekable Anime.js timeline for the whole plan -> building sequence.
// The loop opens and closes on the same resting plan pose, so the boundary is seamless.
import { createTimeline, stagger } from 'animejs';

// Natural length of one loop in ms; the `duration` option rescales every step.
export const BASE_DURATION = 21400;

// `loop: false` builds once and stops on the finished building (used for scroll
// sync); `loop: true` adds the teardown so autoplay can cycle seamlessly.
export function buildTimeline(model, { duration = BASE_DURATION, onRender, onUpdate, loop = true, autoplay = false } = {}) {
  const k = duration / BASE_DURATION;
  const T = (ms) => ms * k;
  const { storeys, roof, crown, steps } = model;
  // Tweens on the same property never overlap, so skip composition; this also
  // keeps backward seeks exact across the build and teardown tweens.
  const tl = createTimeline({ autoplay, loop, onRender, onUpdate, defaults: { composition: 'none' } });

  const scalesY = (objs) => objs.map((o) => o.scale);
  const positions = (objs) => objs.map((o) => o.position);

  // Walls extrude from their base while the crown rides the top edge. Both use
  // the same duration and ease, so the crown stays locked to the wall top.
  const rise = (level, at, dur, ease = 'inOutCubic') => {
    tl.add(level.shell.scale, { y: [level.s0, 1], duration: dur, ease }, at);
    tl.add(crown.position, {
      y: [level.wallBase + level.s0 * level.H, level.wallBase + level.H], duration: dur, ease,
    }, at);
  };
  const lower = (level, at, dur, ease = 'inOutCubic') => {
    tl.add(level.shell.scale, { y: [1, level.s0], duration: dur, ease }, at);
    tl.add(crown.position, {
      y: [level.wallBase + level.H, level.wallBase + level.s0 * level.H], duration: dur, ease,
    }, at);
  };
  const riseInterior = (s, at, dur) => {
    tl.add(scalesY(s.interior), { y: [s.s0, 1], duration: dur, ease: 'inOutCubic', delay: stagger(T(70)) }, at);
    tl.add(s.doors.scale, { y: [s.s0, 1], duration: dur * 0.8, ease: 'inOutCubic' }, at + T(300));
  };
  const lowerInterior = (s, at, dur) => {
    tl.add([...scalesY(s.interior), s.doors.scale], { y: [1, s.s0], duration: dur, ease: 'inOutCubic' }, at);
  };
  // Window units and balconies slide out of the wall along the facade normal.
  const fitDetails = (s, at) => {
    tl.add(positions(s.windows), { z: [-0.45, 0], duration: T(650), ease: 'outCubic', delay: stagger(T(55)) }, at);
    if (s.balconies.length) {
      tl.add(positions(s.balconies), {
        z: [-0.65, 0], duration: T(720), ease: 'outCubic', delay: stagger(T(60)),
      }, at + T(420));
    }
    if (s.extras.length) {
      tl.add(positions(s.extras), { z: [-0.6, 0], duration: T(600), ease: 'outCubic', delay: stagger(T(90)) }, at + T(300));
    }
  };
  // New floor: lift the crown clear, spread the slab under it, then extrude.
  const placeSlab = (level, from, at) => {
    const flatTop = level.wallBase + level.s0 * level.H;
    tl.add(crown.position, { y: [from, flatTop], duration: T(450), ease: 'inOutSine' }, at);
    tl.add(level.slab.scale, { x: [0.001, 1], z: [0.001, 1], duration: T(800), ease: 'outQuart' }, at + T(180));
  };
  const removeSlab = (level, to, at) => {
    const flatTop = level.wallBase + level.s0 * level.H;
    tl.add(level.slab.scale, { x: [1, 0.001], z: [1, 0.001], duration: T(420), ease: 'inOutQuad' }, at);
    tl.add(crown.position, { y: [flatTop, to], duration: T(350), ease: 'inOutSine' }, at + T(170));
  };

  // ---- Build -------------------------------------------------------------
  tl.label('plan', 0);
  const g = storeys[0];
  let t = T(700);
  rise(g, t, T(1600));
  riseInterior(g, t + T(110), T(1450));
  fitDetails(g, t + T(1350));
  tl.add(positions(steps), { z: [-1.4, 0], duration: T(650), ease: 'outCubic', delay: stagger(T(120)) }, t + T(1450));
  tl.label('ground', t + T(2300));

  t += T(2500);
  for (let i = 1; i < storeys.length; i++) {
    const s = storeys[i];
    placeSlab(s, storeys[i - 1].top, t);
    const up = t + T(850);
    rise(s, up, T(1300));
    riseInterior(s, up + T(110), T(1200));
    fitDetails(s, up + T(1050));
    if (i === 2) tl.label('storeys', up + T(1200));
    t += T(2300);
  }

  placeSlab(roof, storeys[3].top, t);
  rise(roof, t + T(850), T(900));
  tl.add(roof.block.scale, { y: [0.001, 1], duration: T(500), ease: 'outCubic' }, t + T(1650));
  const revealAt = t + T(2150);
  tl.label('complete', revealAt + T(400));

  if (!loop) {
    const end = revealAt + T(1500);
    tl.add({ duration: 1 }, end - 1);
    return { timeline: tl, labels: { ...tl.labels }, duration: end };
  }

  // ---- Return to the plan --------------------------------------------------
  let d = revealAt + T(2600);
  const upper = storeys.slice(1).reverse();
  tl.add(positions(upper.flatMap((s) => s.balconies)), {
    z: [0, -0.65], duration: T(380), ease: 'inQuad', delay: stagger(T(18)),
  }, d);
  tl.add(positions(storeys.slice().reverse().flatMap((s) => s.windows)), {
    z: [0, -0.45], duration: T(380), ease: 'inQuad', delay: stagger(T(12)),
  }, d + T(150));
  tl.add(positions(g.extras), { z: [0, -0.6], duration: T(420), ease: 'inQuad', delay: stagger(T(60)) }, d + T(300));
  tl.add(positions(steps.slice().reverse()), {
    z: [0, -1.4], duration: T(420), ease: 'inQuad', delay: stagger(T(60)),
  }, d + T(360));

  tl.add(roof.block.scale, { y: [1, 0.001], duration: T(300), ease: 'inQuad' }, d + T(500));
  lower(roof, d + T(650), T(500));
  removeSlab(roof, storeys[3].top, d + T(1150));

  let u = d + T(1700);
  for (const s of upper) {
    lower(s, u, T(550));
    lowerInterior(s, u, T(550));
    removeSlab(s, storeys[s.index - 1].top, u + T(550));
    u += T(1100);
  }
  lower(g, u, T(850));
  lowerInterior(g, u, T(850));
  const end = u + T(850) + T(700);
  tl.add({ duration: 1 }, end - 1);

  return { timeline: tl, labels: { ...tl.labels }, duration: end };
}

