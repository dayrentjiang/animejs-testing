// Procedural model of the reference building: a corner apartment block on a
// square plinth. Plan coordinates are metres; x runs across the building, z runs
// from the rear wall (0) towards the entrance (+z). Heights are y.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEFAULT_COLORS = {
  accent: '#c0592f',
  highlight: '#f5ddd0',
  surface: '#ffffff',
  glass: '#e3e5e7',
  door: '#ebebe8',
  ink: '#2a2c31',
  fine: '#b7babe',
  floor: '#a7aaaf',
};

// ---------------------------------------------------------------------------
// Plan geometry

// Outer face of the exterior walls, walked clockwise when seen from above.
const OUTLINE = [
  [-7, 0], [7, 0], [7, 7], [12.5, 7], [12.5, 14], [15, 14], [15, 21.5],
  [5.5, 31], [3, 28.5], [-3, 28.5], [-5.5, 31],
  [-15, 21.5], [-15, 14], [-12.5, 14], [-12.5, 7], [-7, 7],
];
const EXT_WALL = 0.7;
const PLAN_CENTER = [0, 16];

// Street-facing elevations. `a -> b` is chosen so the outward normal is (-uz, ux).
const FACADES = {
  leftDiag: { a: [-15, 21.5], b: [-5.5, 31] },
  leftReturn: { a: [-5.5, 31], b: [-3, 28.5] },
  entrance: { a: [-3, 28.5], b: [3, 28.5] },
  rightReturn: { a: [3, 28.5], b: [5.5, 31] },
  rightDiag: { a: [5.5, 31], b: [15, 21.5] },
};
// Inner face of the rear wall, used for the two windows seen from inside.
const REAR_INNER = { a: [-6.3, EXT_WALL], b: [6.3, EXT_WALL] };

export const LEVELS = {
  podium: 0.5,
  groundH: 6.8,
  slab: 0.3,
  upperH: 5.9,
  roofSlab: 0.35,
  parapetH: 1.4,
  flat: 0.1, // wall height in the plan pose
};

// Interior partitions as [x1, z1, x2, z2] rectangles, grouped so each cluster
// can rise on its own stagger.
const PARTITIONS = {
  rear: [[-6.3, 7.4, -5.6, 7.7], [-4.6, 7.4, 4.6, 7.7], [5.6, 7.4, 6.3, 7.7]],
  corridor: [
    [-3.45, 7.7, -3.15, 9.6], [-3.45, 10.6, -3.15, 18.2], [-3.45, 19.2, -3.15, 24.8], [-3.45, 25.8, -3.15, 27.95],
    [3.15, 7.7, 3.45, 11], [3.15, 12, 3.45, 17.6], [3.15, 18.6, 3.45, 24.8], [3.15, 25.8, 3.45, 27.95],
  ],
  left: [
    [-6.3, 7.7, -6, 11.5], [-6.3, 12.5, -6, 23.3],
    [-14.3, 15.3, -8.5, 15.6], [-7.5, 15.3, -3.45, 15.6],
    [-6, 23, -3.45, 23.3],
  ],
  right: [
    [6, 7.7, 6.3, 9], [6, 10, 6.3, 15.3],
    [3.45, 15.3, 4.3, 15.6], [5.3, 15.3, 14.3, 15.6],
    [7.7, 15.6, 8, 22.8], [10.3, 15.6, 10.6, 22.8],
    [7.7, 22.8, 8.4, 23.1], [9.4, 22.8, 10.6, 23.1],
    [8, 19, 10.3, 19.2], [3.45, 22.8, 7.7, 23.1],
  ],
};
const PIERS = [[-3.3, 7.55], [3.3, 7.55], [-3.3, 15.45], [3.3, 15.45], [-3.3, 23.1], [3.3, 23.1]];

// Door leaves: hinge point, direction of the closed leaf, direction when open.
const DOORS = [
  { h: [-5.6, 7.55], closed: [1, 0], open: [0, 1] },
  { h: [5.6, 7.55], closed: [-1, 0], open: [0, 1] },
  { h: [-3.3, 9.6], closed: [0, 1], open: [-1, 0] },
  { h: [-3.3, 18.2], closed: [0, 1], open: [-1, 0] },
  { h: [-3.3, 24.8], closed: [0, 1], open: [-1, 0] },
  { h: [3.3, 11], closed: [0, 1], open: [1, 0] },
  { h: [3.3, 17.6], closed: [0, 1], open: [1, 0] },
  { h: [3.3, 24.8], closed: [0, 1], open: [1, 0] },
  { h: [-6.15, 11.5], closed: [0, 1], open: [1, 0] },
  { h: [-8.5, 15.45], closed: [1, 0], open: [0, 1] },
  { h: [6.15, 9], closed: [0, 1], open: [-1, 0] },
  { h: [5.3, 15.45], closed: [-1, 0], open: [0, 1] },
  { h: [8.4, 22.95], closed: [1, 0], open: [0, -1] },
  { h: [-1.2, 27.8], closed: [1, 0], open: [0, -1], w: 1.15 },
  { h: [1.2, 27.8], closed: [-1, 0], open: [0, -1], w: 1.15 },
];

// ---------------------------------------------------------------------------
// Small geometry helpers

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

// Mitred offset of a simple polygon; positive `d` grows it outwards.
function offsetPolygon(pts, d) {
  const s = signedArea(pts) > 0 ? 1 : -1;
  const n = pts.length;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    return { p: [a[0] + (s * dz / len) * d, a[1] + (-s * dx / len) * d], d: [dx, dz] };
  });
  return lines.map((l2, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const cross = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(cross) < 1e-9) return l2.p;
    const qx = l2.p[0] - l1.p[0];
    const qz = l2.p[1] - l1.p[1];
    const t = (qx * l2.d[1] - qz * l2.d[0]) / cross;
    return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t];
  });
}

const toShapePts = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, -z));

// Vertical prism from a plan polygon (with optional holes), y0..y0+h.
function prism(outer, holes, y0, h) {
  const shape = new THREE.Shape(toShapePts(outer));
  for (const hole of holes) shape.holes.push(new THREE.Path(toShapePts(hole)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}

function box(x0, y0, z0, x1, y1, z1) {
  const geo = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}

function facadeFrame(f) {
  const ux = f.b[0] - f.a[0];
  const uz = f.b[1] - f.a[1];
  const length = Math.hypot(ux, uz);
  const u = [ux / length, uz / length];
  const n = [-u[1], u[0]];
  return { ...f, length, u, n, rotY: Math.atan2(n[0], n[1]) };
}
const FRAMES = Object.fromEntries(Object.entries(FACADES).map(([k, f]) => [k, facadeFrame(f)]));
const REAR_FRAME = facadeFrame(REAR_INNER);

// Matrix that maps facade-local coords (x along, y up, z out of the wall) to plan.
function facadeMatrix(frame, s, y = 0) {
  const m = new THREE.Matrix4().makeRotationY(frame.rotY);
  m.setPosition(frame.a[0] + frame.u[0] * s, y, frame.a[1] + frame.u[1] * s);
  return m;
}

// Collects meshes and line work for one moving component and turns it into a
// Group with a single mesh and a single line object per line colour.
class Part {
  constructor(ctx) {
    this.ctx = ctx;
    this.geos = [];
    this.ink = [];
    this.fine = [];
    this.dashed = [];
  }
  mesh(geo, color = 'surface') {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    const c = this.ctx.linear[color];
    const count = g.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
    return this;
  }
  line(kind, a, b) {
    this[kind].push(a[0], a[1], a[2], b[0], b[1], b[2]);
    return this;
  }
  // Transform everything added from `start` onwards (used for facade-local work).
  transformFrom(start, matrix) {
    for (let i = start.geos; i < this.geos.length; i++) this.geos[i].applyMatrix4(matrix);
    const v = new THREE.Vector3();
    for (const kind of ['ink', 'fine', 'dashed']) {
      const arr = this[kind];
      for (let i = start[kind]; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(matrix);
        arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
      }
    }
  }
  mark() {
    return { geos: this.geos.length, ink: this.ink.length, fine: this.fine.length, dashed: this.dashed.length };
  }
  build(name) {
    const { materials } = this.ctx;
    const group = new THREE.Group();
    group.name = name;
    let ink = this.ink;
    if (this.geos.length) {
      const merged = this.geos.length === 1 ? this.geos[0] : mergeGeometries(this.geos, false);
      if (merged !== this.geos[0]) this.geos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(merged, materials.surface));
      const edges = new THREE.EdgesGeometry(merged, 24);
      ink = [...edges.attributes.position.array, ...ink];
      edges.dispose();
    }
    const addLines = (arr, material, dashed) => {
      if (!arr.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const lines = new THREE.LineSegments(geo, material);
      if (dashed) lines.computeLineDistances();
      group.add(lines);
    };
    addLines(ink, materials.ink);
    addLines(this.fine, materials.fine);
    addLines(this.dashed, materials.dashed, true);
    return group;
  }
}

// ---------------------------------------------------------------------------
// Facade components, all built in facade-local coordinates

function windowFrame(p, w, h, border = 0.2, depth = 0.14) {
  const shape = new THREE.Shape([
    new THREE.Vector2(-w / 2 - border, -0.05), new THREE.Vector2(w / 2 + border, -0.05),
    new THREE.Vector2(w / 2 + border, h + border), new THREE.Vector2(-w / 2 - border, h + border),
  ]);
  shape.holes.push(new THREE.Path([
    new THREE.Vector2(-w / 2, 0), new THREE.Vector2(-w / 2, h),
    new THREE.Vector2(w / 2, h), new THREE.Vector2(w / 2, 0),
  ]));
  p.mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }));
  p.mesh(box(-w / 2, 0, 0, w / 2, h, 0.04), 'glass');
}

function glazingBars(p, w, h, rows) {
  const z = 0.045;
  p.line('ink', [0, 0, z], [0, h, z]);
  for (const r of rows) p.line('ink', [-w / 2, h * r, z], [w / 2, h * r, z]);
}

const WINDOW_TYPES = {
  french(p) {
    const w = 1.5, h = 3.5;
    windowFrame(p, w, h);
    p.mesh(box(-w / 2 - 0.38, h + 0.28, 0, w / 2 + 0.38, h + 0.5, 0.3));
    p.mesh(box(-w / 2 - 0.2, h + 0.2, 0, w / 2 + 0.2, h + 0.28, 0.2));
    glazingBars(p, w, h, [0.26, 0.5, 0.74]);
  },
  frenchWide(p) {
    const w = 1.7, h = 3.6;
    windowFrame(p, w, h, 0.24);
    p.mesh(box(-w / 2 - 0.5, h + 0.32, 0, w / 2 + 0.5, h + 0.56, 0.34));
    glazingBars(p, w, h, [0.26, 0.5, 0.74]);
  },
  ground(p) {
    const w = 1.4, h = 2.6;
    windowFrame(p, w, h);
    p.mesh(box(-w / 2 - 0.3, -0.2, 0, w / 2 + 0.3, -0.04, 0.3));
    p.mesh(box(-0.2, h, 0, 0.2, h + 0.45, 0.22));
    glazingBars(p, w, h, [0.36, 0.7]);
  },
  basement(p) {
    const w = 1.1, h = 0.8;
    windowFrame(p, w, h, 0.16, 0.12);
    for (const x of [-0.3, 0, 0.3]) p.line('ink', [x, 0, 0.045], [x, h, 0.045]);
  },
  rear(p) {
    const w = 1.3, h = 2.4;
    windowFrame(p, w, h, 0.16, 0.1);
    glazingBars(p, w, h, [0.5]);
  },
  entranceDoor(p) {
    const r = 1.2, spring = 3.2, band = 0.32;
    const surround = new THREE.Shape();
    surround.moveTo(-r - band, 0);
    surround.lineTo(-r - band, spring);
    surround.absarc(0, spring, r + band, Math.PI, 0, true);
    surround.lineTo(r + band, 0);
    surround.lineTo(r, 0);
    surround.lineTo(r, spring);
    surround.absarc(0, spring, r, 0, Math.PI, false);
    surround.lineTo(-r, 0);
    p.mesh(new THREE.ExtrudeGeometry(surround, { depth: 0.2, bevelEnabled: false, curveSegments: 18 }));
    const leaf = new THREE.Shape();
    leaf.moveTo(-r, 0);
    leaf.lineTo(r, 0);
    leaf.lineTo(r, spring);
    leaf.absarc(0, spring, r, 0, Math.PI, false);
    leaf.lineTo(-r, 0);
    p.mesh(new THREE.ExtrudeGeometry(leaf, { depth: 0.04, bevelEnabled: false, curveSegments: 18 }), 'door');
    p.mesh(box(-0.28, spring + r - 0.1, 0, 0.28, spring + r + band + 0.18, 0.28));
    const z = 0.05;
    p.line('ink', [0, 0, z], [0, spring, z]);
    p.line('ink', [-r, spring, z], [r, spring, z]);
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.2, x1 = sx * (r - 0.2);
      for (const [y0, y1] of [[0.35, 1.45], [1.75, 2.95]]) {
        p.line('ink', [x0, y0, z], [x1, y0, z]).line('ink', [x1, y0, z], [x1, y1, z])
          .line('ink', [x1, y1, z], [x0, y1, z]).line('ink', [x0, y1, z], [x0, y0, z]);
      }
    }
    for (let i = 1; i < 6; i++) {
      const a = Math.PI * (i / 6);
      p.line('ink', [0, spring, z], [Math.cos(a) * r, spring + Math.sin(a) * r, z]);
    }
  },
  lamp(p) {
    p.mesh(box(-0.05, 0.62, 0, 0.05, 0.7, 0.34));
    p.mesh(box(-0.17, 0.05, 0.2, 0.17, 0.62, 0.54), 'glass');
    p.mesh(box(-0.21, 0.62, 0.16, 0.21, 0.72, 0.58));
    p.mesh(box(-0.12, 0, 0.26, 0.12, 0.06, 0.48));
  },
};

function balcony(p, width, depth) {
  const railH = 1.0, rz = depth - 0.05, hw = width / 2;
  p.mesh(box(-hw, -0.16, 0, hw, 0, depth));
  for (const x of [-hw + 0.3, hw - 0.3]) p.mesh(box(x - 0.08, -0.46, 0, x + 0.08, -0.16, depth * 0.75));
  p.mesh(box(-hw, railH - 0.05, rz - 0.035, hw, railH + 0.02, rz + 0.035));
  for (const sx of [-1, 1]) p.mesh(box(sx * hw - 0.035, railH - 0.05, 0, sx * hw + 0.035, railH + 0.02, rz));
  const step = 0.11;
  for (let x = -hw; x <= hw + 1e-6; x += step) p.line('ink', [x, 0, rz], [x, railH - 0.05, rz]);
  for (let z = 0.1; z < rz; z += step) {
    for (const sx of [-1, 1]) p.line('ink', [sx * hw, 0, z], [sx * hw, railH - 0.05, z]);
  }
  for (const y of [0.14, railH - 0.2]) {
    p.line('ink', [-hw, y, rz], [hw, y, rz]);
    for (const sx of [-1, 1]) p.line('ink', [sx * hw, y, 0], [sx * hw, y, rz]);
  }
}

// ---------------------------------------------------------------------------
// Model assembly

function facadeWork(p, frame, H, kind) {
  const L = frame.length;
  const start = p.mark();
  const pilasters = frame === FRAMES.leftDiag || frame === FRAMES.rightDiag
    ? [0.4, L / 3, (2 * L) / 3, L - 0.4]
    : frame === FRAMES.entrance ? [0.4, L - 0.4] : [];
  for (const s of pilasters) p.mesh(box(s - 0.4, 0, 0, s + 0.4, H, 0.16));

  const z = 0.004;
  if (kind === 'ground') {
    p.mesh(box(0, 0, -0.02, L, 0.35, 0.12));
    p.mesh(box(0, 1.9, -0.02, L, 2.2, 0.1));
    for (let y = 0.35 + 0.52; y < 1.9; y += 0.52) p.line('fine', [0, y, z], [L, y, z]);
    for (let y = 2.2 + 0.8; y < H - 0.2; y += 0.8) p.line('fine', [0, y, z], [L, y, z]);
    let row = 0;
    for (let y = 0.35; y < 1.85; y += 0.52, row++) {
      for (let s = (row % 2) * 0.6 + 0.6; s < L; s += 1.2) p.line('fine', [s, y, z], [s, Math.min(y + 0.52, 1.9), z]);
    }
  } else if (kind === 'upper') {
    for (let y = 0.74; y < H - 0.2; y += 0.74) p.line('fine', [0, y, z], [L, y, z]);
  } else {
    p.line('fine', [0, H * 0.45, z], [L, H * 0.45, z]);
  }
  p.transformFrom(start, facadeMatrix(frame, 0, 0));
}

function buildShell(ctx, H, kind) {
  const p = new Part(ctx);
  const inner = offsetPolygon(OUTLINE, kind === 'parapet' ? -0.45 : -EXT_WALL);
  p.mesh(prism(OUTLINE, [inner], 0, H));
  for (const frame of Object.values(FRAMES)) facadeWork(p, frame, H, kind);
  const shell = p.build('shell');
  return shell;
}

function buildInterior(ctx, H) {
  const clusters = [];
  for (const [name, rects] of Object.entries(PARTITIONS)) {
    const p = new Part(ctx);
    for (const [x1, z1, x2, z2] of rects) p.mesh(box(x1, 0, z1, x2, H, z2));
    if (name === 'right') {
      for (const z of [17.2, 20.9]) {
        const wc = new THREE.CylinderGeometry(0.28, 0.24, 0.45, 12);
        wc.translate(9.1, 0.225, z);
        p.mesh(wc);
        p.mesh(box(8.75, 0, z - 1.05, 9.45, 0.9, z - 0.6));
      }
    }
    clusters.push(p.build(`interior-${name}`));
  }
  const piers = new Part(ctx);
  for (const [x, z] of PIERS) piers.mesh(box(x - 0.35, 0, z - 0.35, x + 0.35, H, z + 0.35));
  clusters.push(piers.build('piers'));

  // Dog-leg stair: one flight up to a half landing.
  const stair = new Part(ctx);
  const landing = H * 0.45;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const zTop = 15.3 - 0.45 * i;
    stair.mesh(box(-11.8, 0, zTop - 0.45, -9.3, (landing * (i + 1)) / (steps + 1), zTop));
  }
  stair.mesh(box(-11.8, 0, 7.7, -6.3, landing, 15.3 - 0.45 * steps));
  clusters.push(stair.build('stair'));
  return clusters;
}

function buildDoors(ctx, doorH) {
  const p = new Part(ctx);
  for (const d of DOORS) {
    const w = d.w ?? 1;
    const [hx, hz] = d.h;
    const [ox, oz] = d.open;
    const len = w - 0.05;
    const x0 = hx, x1 = hx + ox * len, z0 = hz, z1 = hz + oz * len;
    const t = 0.03;
    p.mesh(box(
      Math.min(x0, x1) - (ox === 0 ? t : 0), 0, Math.min(z0, z1) - (oz === 0 ? t : 0),
      Math.max(x0, x1) + (ox === 0 ? t : 0), doorH, Math.max(z0, z1) + (oz === 0 ? t : 0),
    ), 'door');
  }
  return p.build('doors');
}

// Door swings and ceiling-beam dashes drawn on the floor, as in the plan.
function buildFloorMarks(ctx) {
  const p = new Part(ctx);
  const y = 0.012;
  for (const d of DOORS) {
    const w = d.w ?? 1;
    const a0 = Math.atan2(d.closed[1], d.closed[0]);
    let a1 = Math.atan2(d.open[1], d.open[0]);
    let delta = a1 - a0;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (delta * i) / seg;
      const t1 = a0 + (delta * (i + 1)) / seg;
      p.line('fine', [d.h[0] + Math.cos(t0) * w, y, d.h[1] + Math.sin(t0) * w],
        [d.h[0] + Math.cos(t1) * w, y, d.h[1] + Math.sin(t1) * w]);
    }
  }
  p.line('dashed', [0, y, 7.7], [0, y, 27.8]);
  for (const z of [15.45, 23.1]) p.line('dashed', [-3.15, y, z], [3.15, y, z]);
  p.line('dashed', [-14.2, y, 21.4], [-6.3, y, 21.4]);
  return p.build('floor-marks');
}

function mountOn(ctx, frame, s, y, buildFn, name) {
  const mount = new THREE.Group();
  mount.applyMatrix4(facadeMatrix(frame, s, y));
  const p = new Part(ctx);
  buildFn(p);
  const part = p.build(name);
  mount.add(part);
  return { mount, part, x: frame.a[0] + frame.u[0] * s };
}

function buildFacadeDetails(ctx, kind) {
  const windows = [];
  const balconies = [];
  const extras = [];
  const diag = [FRAMES.leftDiag, FRAMES.rightDiag];
  const ent = FRAMES.entrance;
  for (const frame of diag) {
    for (const i of [0, 1, 2]) {
      const s = (frame.length * (2 * i + 1)) / 6;
      if (kind === 'ground') {
        windows.push(mountOn(ctx, frame, s, 2.7, WINDOW_TYPES.ground, 'window'));
        windows.push(mountOn(ctx, frame, s, 0.62, WINDOW_TYPES.basement, 'window'));
      } else {
        windows.push(mountOn(ctx, frame, s, 0.55, WINDOW_TYPES.french, 'window'));
        balconies.push(mountOn(ctx, frame, s, 0.55, (p) => balcony(p, 2.3, 0.55), 'balcony'));
      }
    }
  }
  if (kind === 'ground') {
    windows.push(mountOn(ctx, ent, ent.length / 2, 0, WINDOW_TYPES.entranceDoor, 'door'));
    for (const dx of [-2.05, 2.05]) {
      extras.push(mountOn(ctx, ent, ent.length / 2 + dx, 3.0, WINDOW_TYPES.lamp, 'lamp'));
    }
  } else {
    windows.push(mountOn(ctx, ent, ent.length / 2, 0.55, WINDOW_TYPES.frenchWide, 'window'));
    balconies.push(mountOn(ctx, ent, ent.length / 2, 0.55, (p) => balcony(p, 4.9, 0.8), 'balcony'));
  }
  const rearY = kind === 'ground' ? 2.6 : 0.8;
  for (const s of [REAR_FRAME.length * 0.3, REAR_FRAME.length * 0.7]) {
    windows.push(mountOn(ctx, REAR_FRAME, s, rearY, WINDOW_TYPES.rear, 'window'));
  }
  const byX = (a, b) => a.x - b.x;
  return { windows: windows.sort(byX), balconies: balconies.sort(byX), extras };
}

function centredSlab(ctx, outline, thickness, name) {
  // Pivot at the plan centre so the slab can spread outwards.
  const p = new Part(ctx);
  const shifted = outline.map(([x, z]) => [x - PLAN_CENTER[0], z - PLAN_CENTER[1]]);
  p.mesh(prism(shifted, [], -thickness, thickness));
  const slab = p.build(name);
  slab.position.set(PLAN_CENTER[0], 0, PLAN_CENTER[1]);
  return slab;
}

function buildStorey(ctx, index) {
  const ground = index === 0;
  const H = ground ? LEVELS.groundH : LEVELS.upperH;
  const wallBase = ground
    ? LEVELS.podium
    : LEVELS.podium + LEVELS.groundH + (index - 1) * (LEVELS.slab + LEVELS.upperH) + LEVELS.slab;
  const group = new THREE.Group();
  group.name = `storey-${index}`;
  group.position.y = wallBase;

  const slab = ground ? null : centredSlab(ctx, offsetPolygon(OUTLINE, 0.15), LEVELS.slab, 'slab');
  if (slab) group.add(slab);

  // Everything that sits on this floor; hidden until the slab has landed.
  const body = new THREE.Group();
  group.add(body);
  const shell = buildShell(ctx, H, ground ? 'ground' : 'upper');
  const interior = buildInterior(ctx, H);
  const doors = buildDoors(ctx, ground ? 3.2 : 3.0);
  body.add(shell, ...interior, doors, buildFloorMarks(ctx));
  const details = buildFacadeDetails(ctx, ground ? 'ground' : 'upper');
  for (const d of [...details.windows, ...details.balconies, ...details.extras]) body.add(d.mount);

  const s0 = LEVELS.flat / H;
  shell.scale.y = s0;
  doors.scale.y = s0;
  interior.forEach((c) => (c.scale.y = s0));
  details.windows.forEach((w) => (w.part.position.z = -0.45));
  details.balconies.forEach((b) => (b.part.position.z = -0.65));
  details.extras.forEach((e) => (e.part.position.z = -0.6));
  if (slab) slab.scale.set(0.001, 1, 0.001);

  return {
    index, group, body, slab, shell, interior, doors, H, s0, wallBase,
    top: wallBase + H,
    windows: details.windows.map((w) => w.part),
    balconies: details.balconies.map((b) => b.part),
    extras: details.extras.map((e) => e.part),
  };
}

function buildRoof(ctx, base) {
  const group = new THREE.Group();
  group.name = 'roof';
  group.position.y = base;
  const slab = centredSlab(ctx, offsetPolygon(OUTLINE, 0.35), LEVELS.roofSlab, 'roof-slab');
  slab.position.y = LEVELS.roofSlab;
  group.add(slab);
  const body = new THREE.Group();
  body.position.y = LEVELS.roofSlab;
  group.add(body);
  const H = LEVELS.parapetH;
  const parapet = buildShell(ctx, H, 'parapet');
  const s0 = LEVELS.flat / H;
  parapet.scale.y = s0;
  body.add(parapet);
  const bp = new Part(ctx);
  bp.mesh(box(-3.8, 0, 0.05, 3.8, 0.55, 0.62));
  bp.mesh(box(-4, 0.55, -0.02, 4, 0.7, 0.7));
  const block = bp.build('roof-block');
  block.position.y = H + 0.22;
  block.scale.y = 0.001;
  body.add(block);
  slab.scale.set(0.001, 1, 0.001);
  return { group, body, slab, shell: parapet, block, H, s0, wallBase: base + LEVELS.roofSlab };
}

// Coping ring and pier caps that ride on top of whichever wall is being built.
function buildCrown(ctx) {
  const p = new Part(ctx);
  p.mesh(prism(offsetPolygon(OUTLINE, 0.12), [offsetPolygon(OUTLINE, -0.75)], 0, 0.22));
  for (const frame of [FRAMES.leftDiag, FRAMES.rightDiag, FRAMES.entrance]) {
    const L = frame.length;
    const caps = frame === FRAMES.entrance ? [0.4, L - 0.4] : [0.4, L / 3, (2 * L) / 3, L - 0.4];
    for (const s of caps) {
      const start = p.mark();
      p.mesh(box(-0.55, 0, -0.78, 0.55, 0.48, 0.46));
      p.mesh(box(-0.62, 0.48, -0.82, 0.62, 0.56, 0.52));
      p.transformFrom(start, facadeMatrix(frame, s, 0));
    }
  }
  // Caps on the square corners of the rear and side walls.
  const inner = offsetPolygon(OUTLINE, -EXT_WALL);
  const s = signedArea(OUTLINE) > 0 ? 1 : -1;
  OUTLINE.forEach((c, i) => {
    const prev = OUTLINE[(i - 1 + OUTLINE.length) % OUTLINE.length];
    const next = OUTLINE[(i + 1) % OUTLINE.length];
    const e1 = [c[0] - prev[0], c[1] - prev[1]];
    const e2 = [next[0] - c[0], next[1] - c[1]];
    const axisAligned = (e) => Math.abs(e[0]) < 1e-6 || Math.abs(e[1]) < 1e-6;
    const convex = s * (e1[0] * e2[1] - e1[1] * e2[0]) > 0;
    if (!convex || !axisAligned(e1) || !axisAligned(e2)) return;
    const cx = c[0] + (inner[i][0] - c[0]) * 0.4;
    const cz = c[1] + (inner[i][1] - c[1]) * 0.4;
    p.mesh(box(cx - 0.6, 0, cz - 0.6, cx + 0.6, 0.48, cz + 0.6));
  });
  return p.build('crown');
}

function buildSite(ctx) {
  const p = new Part(ctx);
  const [cx, cz] = [0, 16];
  const r = 24;
  const diamond = [[cx, cz - r], [cx + r, cz], [cx, cz + r], [cx - r, cz]];
  p.mesh(prism(diamond, [], -1.1, 1.1));
  p.mesh(prism(offsetPolygon(OUTLINE, 0.4), [], 0, LEVELS.podium));
  // Entrance stoop, one piece per step so they can slide out in turn.
  const steps = [0, 1, 2].map((j) => {
    const sp = new Part(ctx);
    const z0 = 28.9 + 0.45 * j;
    sp.mesh(box(-2.1 - 0.12 * j, 0, z0, 2.1 + 0.12 * j, (LEVELS.podium * (3 - j)) / 3, z0 + 0.45));
    const step = sp.build('step');
    step.position.z = -1.4;
    return step;
  });
  const site = p.build('site');
  return { site, steps, corners: diamond };
}

export function createModel(colors = {}) {
  const palette = { ...DEFAULT_COLORS, ...colors };
  const linear = {};
  for (const [k, v] of Object.entries(palette)) {
    const c = new THREE.Color(v);
    linear[k] = [c.r, c.g, c.b];
  }
  const materials = {
    surface: new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    ink: new THREE.LineBasicMaterial({ color: palette.ink }),
    fine: new THREE.LineBasicMaterial({ color: palette.fine }),
    dashed: new THREE.LineDashedMaterial({ color: palette.floor, dashSize: 0.4, gapSize: 0.28 }),
  };
  const ctx = { linear, materials };

  const root = new THREE.Group();
  root.position.set(-PLAN_CENTER[0], 0, -PLAN_CENTER[1]);

  const { site, steps, corners } = buildSite(ctx);
  root.add(site, ...steps);

  const storeys = [0, 1, 2, 3].map((i) => buildStorey(ctx, i));
  storeys.forEach((s) => root.add(s.group));
  const roof = buildRoof(ctx, storeys[3].top);
  root.add(roof.group);
  const crown = buildCrown(ctx);
  crown.position.y = storeys[0].wallBase + storeys[0].s0 * storeys[0].H;
  root.add(crown);

  // Tinted floor areas for room callouts; each has its own fading material.
  const patch = (parent, pts, y) => {
    const material = new THREE.MeshBasicMaterial({
      color: palette.highlight, transparent: true, opacity: 0, depthWrite: false,
    });
    const mesh = new THREE.Mesh(prism(pts, [], y, 0.01), material);
    mesh.renderOrder = 1;
    parent.add(mesh);
    return mesh;
  };
  const patches = {
    hall: patch(storeys[0].body, [[-3.15, 7.7], [3.15, 7.7], [3.15, 27.8], [-3.15, 27.8]], 0.02),
    living: patch(storeys[0].body, [[-14.3, 15.6], [-6.3, 15.6], [-6.3, 29.2], [-14.3, 21.2]], 0.02),
    baths: patch(storeys[0].body, [[8, 15.6], [10.3, 15.6], [10.3, 22.8], [8, 22.8]], 0.02),
    roof: patch(roof.body, offsetPolygon(OUTLINE, -0.45), 0.01),
  };

  // Callout anchor points in world space.
  const w = (x, y, z) => new THREE.Vector3(x - PLAN_CENTER[0], y, z - PLAN_CENTER[1]);
  const onFacade = (frame, s, y, out) => w(
    frame.a[0] + frame.u[0] * s + frame.n[0] * out, y, frame.a[1] + frame.u[1] * s + frame.n[1] * out,
  );
  const [, s1, s2] = storeys;
  const crownTop = roof.wallBase + roof.H + 0.5;
  const anchors = {
    // Rooms near the facade have floors hidden behind it from this camera, so
    // their anchors float at wall-top height over the room instead.
    hall: w(0, LEVELS.podium + 0.05, 12.5),
    stair: w(-10.5, LEVELS.podium + LEVELS.groundH * 0.45, 9.6),
    living: w(-10.4, LEVELS.podium + LEVELS.groundH - 0.2, 19.2),
    baths: w(9.15, LEVELS.podium + LEVELS.groundH - 0.2, 19.2),
    apartments: onFacade(FRAMES.leftDiag, FRAMES.leftDiag.length / 2, s1.wallBase + 2.3, 0.1),
    balconies: onFacade(FRAMES.rightDiag, FRAMES.rightDiag.length / 2, s2.wallBase + 1.55, 0.5),
    roof: w(0, roof.wallBase + 0.02, 11),
    cornice: onFacade(FRAMES.leftDiag, FRAMES.leftDiag.length / 3, crownTop, 0.3),
    entrance: onFacade(FRAMES.entrance, FRAMES.entrance.length / 2, LEVELS.podium + 3.2, 0.2),
    // Outer corners of the facade, top and bottom, for placing labels beside it.
    edges: [[-15, 21.5], [15, 21.5]].flatMap(([x, z]) => [w(x, 0, z), w(x, crownTop, z)]),
  };

  const topY = roof.wallBase + roof.H + 1;
  const boundsPoints = [
    ...corners.flatMap(([x, z]) => [[x, 0, z], [x, -1.1, z]]),
    ...OUTLINE.map(([x, z]) => [x, topY, z]),
  ].map(([x, y, z]) => new THREE.Vector3(x - PLAN_CENTER[0], y, z - PLAN_CENTER[1]));

  return { root, storeys, roof, crown, steps, materials, boundsPoints, palette, patches, anchors };
}
