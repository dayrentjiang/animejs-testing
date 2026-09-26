// Labels that point at parts of the building. Each one is a DOM element pinned
// to a projected 3D anchor; its dot, leader line and text animate on the main
// timeline, so they scrub with scroll like everything else.
import * as THREE from 'three';

// `phase` picks the hold it appears in. On wide stages the label sits beside
// the building on `side`, `dy` px above/below its anchor; on narrow stages the
// phase's labels stack in two columns (by `side`) below the building.
// `highlight` names the tinted part.
export const DEFAULT_CALLOUTS = [
  { phase: 'ground', anchor: 'stair', title: 'Main stair', text: 'Ten steps to a half landing', side: 'left', dy: -70, highlight: 'stair' },
  { phase: 'ground', anchor: 'living', title: 'Living room', text: 'Corner room, windows on the street', side: 'left', dy: 50, highlight: 'living' },
  { phase: 'ground', anchor: 'hall', title: 'Entrance hall', text: 'Runs front to back', side: 'right', dy: -120, highlight: 'hall' },
  { phase: 'ground', anchor: 'baths', title: 'Bathrooms', text: 'Two per floor', side: 'right', dy: 30, highlight: 'baths' },
  { phase: 'storeys', anchor: 'apartments', title: 'Apartments', text: 'Three per floor, twelve in all', side: 'left', dy: 20, highlight: 'apartments' },
  { phase: 'storeys', anchor: 'balconies', title: 'Balconies', text: 'Wrought iron on every street bay', side: 'left', dy: -90, highlight: 'balconies' },
  { phase: 'complete', anchor: 'roof', title: 'Roof terrace', text: 'Behind a stone parapet', side: 'left', dy: -60, highlight: 'roof' },
  { phase: 'complete', anchor: 'cornice', title: 'Cornice', text: 'Pier caps above each pilaster', side: 'left', dy: 40 },
  { phase: 'complete', anchor: 'side', title: 'Side elevation', text: 'Plainer stone onto the side street', side: 'right', dy: 20 },
];

export function createCallouts(stageEl, model, defs = DEFAULT_CALLOUTS) {
  const layer = document.createElement('div');
  layer.className = 'ptb__callouts';
  layer.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(layer);

  // Narrow layout slots: column by side, row by order within the phase.
  const slot = new Map();
  for (const def of defs) {
    const same = defs.filter((d) => d.phase === def.phase && d.side === def.side);
    const rows = Math.max(...['left', 'right'].map((side) => defs.filter((d) => d.phase === def.phase && d.side === side).length));
    slot.set(def, { row: same.indexOf(def), rows });
  }

  const items = defs.map((def) => {
    const el = document.createElement('div');
    el.className = 'ptb-callout';
    el.innerHTML = `
      <span class="ptb-callout__dot"></span>
      <span class="ptb-callout__arm"><span class="ptb-callout__line"></span></span>
      <span class="ptb-callout__label"><span class="ptb-callout__text"><strong></strong><em></em></span></span>`;
    el.querySelector('strong').textContent = def.title;
    el.querySelector('em').textContent = def.text;
    layer.appendChild(el);
    return {
      def,
      el,
      anchor: model.anchors[def.anchor],
      dot: el.querySelector('.ptb-callout__dot'),
      arm: el.querySelector('.ptb-callout__arm'),
      line: el.querySelector('.ptb-callout__line'),
      label: el.querySelector('.ptb-callout__label'),
      text: el.querySelector('.ptb-callout__text'),
    };
  });

  const highlights = createHighlights(model);

  // Building silhouette extremes (world), used to park labels beside it.
  const edges = model.anchors.edges;
  const e = new THREE.Vector3();
  const spun = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const toScreen = (p, camera, width, height) => {
    e.copy(p).project(camera);
    return [((e.x + 1) / 2) * width, ((1 - e.y) / 2) * height];
  };

  function update(camera, width, height) {
    const wide = width >= 900;
    const turn = model.spin.rotation.y;
    const xs = edges.map((p) => toScreen(spun.copy(p).applyAxisAngle(Y, turn), camera, width, height)[0]);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    for (const item of items) {
      spun.copy(item.anchor).applyAxisAngle(Y, turn);
      const [x, y] = toScreen(spun, camera, width, height);
      let ex;
      let ey;
      let side;
      if (wide) {
        side = item.def.side;
        const gap = 56;
        // Park the label beside the building, but keep it on stage when zoomed in.
        const labelW = 230;
        const endX = side === 'left'
          ? Math.max(left - gap, labelW)
          : Math.min(right + gap, width - labelW);
        ex = endX - x;
        ey = item.def.dy;
      } else {
        const { row, rows } = slot.get(item.def);
        const rowH = 54;
        const slotY = height - 150 - (rows - 1 - row) * rowH;
        const slotX = item.def.side === 'left' ? 14 : width - 14;
        // Text grows away from the screen edge it is anchored to.
        side = item.def.side === 'left' ? 'right' : 'left';
        ex = slotX - x;
        ey = slotY - y;
      }
      // left/top rather than a transform, so the root doesn't form a stacking
      // context and every label can sit above every leader line.
      item.el.style.left = `${x.toFixed(1)}px`;
      item.el.style.top = `${y.toFixed(1)}px`;
      item.arm.style.width = `${Math.hypot(ex, ey).toFixed(1)}px`;
      item.arm.style.transform = `rotate(${Math.atan2(ey, ex)}rad)`;
      item.label.style.transform = `translate3d(${ex.toFixed(1)}px, ${ey.toFixed(1)}px, 0)`;
      item.label.dataset.side = side;
    }
  }

  // Adds each phase's in/out tweens. `marks[phase]` is the [start, end] hold.
  function addToTimeline(tl, marks, T) {
    const phases = [...new Set(items.map((i) => i.def.phase))];
    for (const phase of phases) {
      const hold = marks[phase];
      if (!hold) continue;
      const [a, b] = hold;
      const group = items.filter((i) => i.def.phase === phase);
      const stays = phase === 'complete';
      group.forEach((item, i) => {
        const at = a + T(150) + i * T(180);
        const hl = highlights[item.def.highlight];
        if (hl) hl.enter(tl, at, T(600));
        tl.add(item.dot, { scale: [0, 1], duration: T(380), ease: 'outCubic' }, at);
        tl.add(item.line, { scaleX: [0, 1], duration: T(520), ease: 'inOutCubic' }, at + T(120));
        tl.add(item.text, { opacity: [0, 1], translateY: [8, 0], duration: T(450), ease: 'outCubic' }, at + T(480));
        if (stays) return;
        const out = b - T(620) + i * T(40);
        tl.add(item.text, { opacity: [1, 0], translateY: [0, -6], duration: T(300), ease: 'inQuad' }, out);
        tl.add(item.line, { scaleX: [1, 0], duration: T(360), ease: 'inOutCubic' }, out + T(120));
        tl.add(item.dot, { scale: [1, 0], duration: T(260), ease: 'inQuad' }, out + T(300));
        if (hl) hl.exit(tl, out, T(500));
      });
    }
  }

  function destroy() {
    highlights.dispose();
    layer.remove();
  }

  return { update, addToTimeline, destroy };
}

// Tints for the labelled parts: room floors fade in, solid parts take the
// highlight colour through a cloned material.
function createHighlights(model) {
  const { storeys, patches, materials, palette } = model;
  const tint = new THREE.Color(palette.highlight);
  const clones = [];

  const tinted = (objects) => {
    const material = materials.surface.clone();
    clones.push(material);
    for (const obj of objects) {
      obj.traverse((o) => {
        if (o.isMesh && o.material === materials.surface) o.material = material;
      });
    }
    return {
      enter(tl, at, dur) {
        tl.add(material.color, { r: [1, tint.r], g: [1, tint.g], b: [1, tint.b], duration: dur, ease: 'inOutSine' }, at);
      },
      exit(tl, at, dur) {
        tl.add(material.color, { r: [tint.r, 1], g: [tint.g, 1], b: [tint.b, 1], duration: dur, ease: 'inOutSine' }, at);
      },
    };
  };
  const faded = (mesh, opacity = 0.75) => ({
    enter(tl, at, dur) {
      tl.add(mesh.material, { opacity: [0, opacity], duration: dur, ease: 'inOutSine' }, at);
    },
    exit(tl, at, dur) {
      tl.add(mesh.material, { opacity: [opacity, 0], duration: dur, ease: 'inOutSine' }, at);
    },
  });

  const ground = storeys[0];
  const byName = (list, name) => list.filter((o) => o.name === name);
  return {
    stair: tinted(byName(ground.interior, 'stair')),
    entrance: tinted([...byName(ground.windows, 'door'), ...model.steps]),
    apartments: tinted(byName(storeys[1].windows, 'window')),
    balconies: tinted(storeys[2].balconies),
    hall: faded(patches.hall),
    living: faded(patches.living),
    baths: faded(patches.baths),
    roof: faded(patches.roof, 0.55),
    dispose() {
      clones.forEach((m) => m.dispose());
      Object.values(patches).forEach((p) => p.material.dispose());
    },
  };
}
