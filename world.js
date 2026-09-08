// Builds one reef: seafloor, water surface, corals or kelp or a wreck, rocks, drifting particles.
import * as THREE from 'three';

export const WORLD_RADIUS = 70;

// Small, fast "value noise": smooth random bumps used for the seafloor shape.
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * zf;
}
export function fbm(x, z) {
  return noise2(x, z) * 0.6 + noise2(x * 2.1 + 5, z * 2.1 + 3) * 0.28 + noise2(x * 4.3 + 9, z * 4.3 + 7) * 0.12;
}

export function buildWorld(scene, reef) {
  const group = new THREE.Group();
  scene.add(group);
  const floorY = -reef.floorDepth;
  const amp = reef.kind === 'wreck' ? 3.2 : reef.kind === 'kelp' ? 2.2 : 1.6;

  const floorHeightAt = (x, z) => floorY + (fbm(x * 0.045, z * 0.045) - 0.5) * 2 * amp;

  // Fog and background colour are the same so the world fades into the water.
  scene.fog = new THREE.FogExp2(reef.fog, reef.fogDensity);
  scene.background = new THREE.Color(reef.fog);

  // Lights
  const hemi = new THREE.HemisphereLight(reef.fog, reef.sand, 0.9);
  const sun = new THREE.DirectionalLight(0xdff6ff, reef.sun);
  sun.position.set(20, 60, 10);
  const amb = new THREE.AmbientLight(0x88aacc, 0.35);
  group.add(hemi, sun, amb);

  // Seafloor
  const seg = 96;
  const floorGeo = new THREE.PlaneGeometry(WORLD_RADIUS * 2.6, WORLD_RADIUS * 2.6, seg, seg);
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i);
    fp.setY(i, floorHeightAt(x, z));
  }
  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: reef.sand }));
  group.add(floor);

  // Water surface, seen from below
  const surfGeo = new THREE.PlaneGeometry(WORLD_RADIUS * 3, WORLD_RADIUS * 3, 40, 40);
  surfGeo.rotateX(Math.PI / 2); // faces downward
  const surfMat = new THREE.MeshPhongMaterial({
    color: 0xbfefff, emissive: 0x6fd6ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.75,
    shininess: 120, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.y = 0;
  group.add(surface);
  const surfBase = surfGeo.attributes.position.array.slice();

  // Rocks everywhere
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: reef.kind === 'wreck' ? 0x3f4a55 : 0x6f6a5a });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 90);
  placeInstances(rocks, 90, floorHeightAt, (m, x, z, y) => {
    const s = 0.6 + Math.random() * 2.2;
    m.compose(new THREE.Vector3(x, y - s * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random())), new THREE.Vector3(s, s * 0.7, s));
  });
  group.add(rocks);

  const swayers = [];

  if (reef.kind === 'coral') {
    // Brain coral (squashed spheres)
    const brainGeo = new THREE.SphereGeometry(1, 10, 8);
    const brain = new THREE.InstancedMesh(brainGeo, new THREE.MeshLambertMaterial({ color: 0xf08a2a }), 70);
    placeInstances(brain, 70, floorHeightAt, (m, x, z, y) => {
      const s = 0.5 + Math.random() * 1.4;
      m.compose(new THREE.Vector3(x, y + s * 0.4, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s));
    });
    brain.instanceColor = null;
    group.add(brain);

    // Sea fans (flat discs)
    const fanGeo = new THREE.CircleGeometry(1, 12);
    const fan = new THREE.InstancedMesh(fanGeo, new THREE.MeshLambertMaterial({ color: 0x9a5fd6, side: THREE.DoubleSide }), 80);
    placeInstances(fan, 80, floorHeightAt, (m, x, z, y) => {
      const s = 0.8 + Math.random() * 1.6;
      m.compose(new THREE.Vector3(x, y + s * 0.9, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)), new THREE.Vector3(s, s, s));
    });
    group.add(fan);

    // Branch coral (thin cones)
    const branchGeo = new THREE.ConeGeometry(0.18, 1.6, 6);
    const branch = new THREE.InstancedMesh(branchGeo, new THREE.MeshLambertMaterial({ color: 0xe86a8a }), 220);
    placeInstances(branch, 220, floorHeightAt, (m, x, z, y) => {
      const s = 0.6 + Math.random() * 1.3;
      m.compose(new THREE.Vector3(x, y + 0.8 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), new THREE.Vector3(s, s, s));
    });
    group.add(branch);

    // Table coral
    const tableGeo = new THREE.CylinderGeometry(1.4, 0.3, 0.35, 10);
    const table = new THREE.InstancedMesh(tableGeo, new THREE.MeshLambertMaterial({ color: 0xc9b36a }), 30);
    placeInstances(table, 30, floorHeightAt, (m, x, z, y) => {
      const s = 0.7 + Math.random() * 1.3;
      m.compose(new THREE.Vector3(x, y + 0.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    });
    group.add(table);
  }

  if (reef.kind === 'kelp') {
    const n = 170;
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 5);
    stalkGeo.translate(0, 0.5, 0); // pivot at the base
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshLambertMaterial({ color: 0x4f7a2a }), n);
    const leafGeo = new THREE.PlaneGeometry(0.5, 1.6);
    leafGeo.translate(0, 0.8, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x6e9a2f, side: THREE.DoubleSide }), n * 3);
    const data = [];
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * WORLD_RADIUS * 0.95;
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = floorHeightAt(x, z);
      const h = Math.min(-y - 0.8, 7 + Math.random() * 9);
      data.push({ x, z, y, h, phase: Math.random() * 6.28, lean: Math.random() * 0.25 });
    }
    group.add(stalks, leaves);
    swayers.push((t) => {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
      data.forEach((k, i) => {
        const sway = Math.sin(t * 0.7 + k.phase) * 0.12 + k.lean;
        e.set(sway, k.phase, Math.cos(t * 0.5 + k.phase) * 0.08);
        q.setFromEuler(e);
        p.set(k.x, k.y, k.z); s.set(1, k.h, 1);
        m.compose(p, q, s); stalks.setMatrixAt(i, m);
        for (let j = 0; j < 3; j++) {
          const frac = 0.25 + j * 0.28;
          const ly = k.y + k.h * frac;
          const lx = k.x + Math.sin(sway) * k.h * frac;
          e.set(sway * 1.5, k.phase + j * 2.1 + Math.sin(t + k.phase + j) * 0.3, 0);
          q.setFromEuler(e);
          p.set(lx, ly, k.z); s.set(1 + (k.h / 12), 1 + (k.h / 12), 1);
          m.compose(p, q, s); leaves.setMatrixAt(i * 3 + j, m);
        }
      });
      stalks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
    });
    swayers[0](0);

    // Sea urchins
    const urchGeo = new THREE.IcosahedronGeometry(0.35, 1);
    const urch = new THREE.InstancedMesh(urchGeo, new THREE.MeshLambertMaterial({ color: 0x5a2d8a }), 80);
    placeInstances(urch, 80, floorHeightAt, (m, x, z, y) => {
      const s = 0.6 + Math.random();
      m.compose(new THREE.Vector3(x, y + 0.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    });
    group.add(urch);
  }

  if (reef.kind === 'wreck') {
    const hullMat = new THREE.MeshLambertMaterial({ color: 0x4a3f38 });
    const rustMat = new THREE.MeshLambertMaterial({ color: 0x6b4a34 });
    const wreck = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 10), hullMat);
    hull.position.y = 4.5;
    wreck.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4), hullMat);
    bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 1.8);
    bow.position.set(21, 4.5, 0);
    wreck.add(bow);
    const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 7), rustMat);
    deckhouse.position.set(-6, 11, 0);
    wreck.add(deckhouse);
    for (let i = 0; i < 2; i++) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 16, 6), rustMat);
      mast.position.set(6 - i * 18, 17, 0);
      wreck.add(mast);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(34, 0.15, 0.15), rustMat);
    rail.position.set(0, 10, 5); wreck.add(rail);
    const rail2 = rail.clone(); rail2.position.z = -5; wreck.add(rail2);
    for (let i = 0; i < 12; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), rustMat);
      post.position.set(-16 + i * 3, 9.5, 5); wreck.add(post);
      const post2 = post.clone(); post2.position.z = -5; wreck.add(post2);
    }
    // Coral growth on the hull
    const clumpGeo = new THREE.SphereGeometry(0.6, 6, 5);
    const clumps = new THREE.InstancedMesh(clumpGeo, new THREE.MeshLambertMaterial({ color: 0xb35a3a }), 60);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) {
      const x = -17 + Math.random() * 34, y = Math.random() * 9, z = Math.random() < 0.5 ? 5.1 : -5.1;
      const s = 0.5 + Math.random() * 1.2;
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s * 0.6));
      clumps.setMatrixAt(i, m);
    }
    wreck.add(clumps);
    wreck.position.set(-8, floorHeightAt(-8, 14) - 1.5, 14);
    wreck.rotation.set(0.12, 0.6, -0.18);
    group.add(wreck);
    // Deep-water sponges
    const spGeo = new THREE.CylinderGeometry(0.5, 0.35, 1.6, 7, 1, true);
    const sponges = new THREE.InstancedMesh(spGeo, new THREE.MeshLambertMaterial({ color: 0x8a4a6a, side: THREE.DoubleSide }), 60);
    placeInstances(sponges, 60, floorHeightAt, (mm, x, z, y) => {
      const s = 0.7 + Math.random() * 1.5;
      mm.compose(new THREE.Vector3(x, y + 0.8 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    });
    group.add(sponges);
  }

  // Drifting particles ("marine snow") around the player
  const pCount = 700;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 40;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 24;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xcfe9f5, size: 0.07, transparent: true, opacity: 0.55, sizeAttenuation: true }));
  group.add(particles);

  // Light shafts: a few tall faint planes that slowly rotate.
  const shafts = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: reef.kind === 'wreck' ? 0.035 : 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 14; i++) {
    const w = 1 + Math.random() * 3;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, reef.floorDepth + 4), shaftMat);
    sh.position.set((Math.random() - 0.5) * 70, -reef.floorDepth / 2, (Math.random() - 0.5) * 70);
    sh.rotation.y = Math.random() * Math.PI;
    sh.rotation.z = (Math.random() - 0.5) * 0.25;
    shafts.add(sh);
  }
  group.add(shafts);

  function update(t, dt, playerPos) {
    // Surface waves
    const arr = surfGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = surfBase[i], z = surfBase[i + 2];
      arr[i + 1] = Math.sin(x * 0.15 + t * 1.1) * 0.25 + Math.cos(z * 0.12 + t * 0.9) * 0.25;
    }
    surfGeo.attributes.position.needsUpdate = true;
    surface.position.x = playerPos.x; surface.position.z = playerPos.z;
    // Particles drift and follow the player
    particles.position.copy(playerPos);
    const pa = pGeo.attributes.position.array;
    for (let i = 0; i < pa.length; i += 3) {
      pa[i] += Math.sin(t * 0.3 + i) * 0.002;
      pa[i + 1] += 0.003;
      if (pa[i + 1] > 12) pa[i + 1] = -12;
    }
    pGeo.attributes.position.needsUpdate = true;
    shafts.rotation.y = t * 0.01;
    swayers.forEach((fn) => fn(t));
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach((mm) => mm.dispose()); else o.material.dispose(); }
    });
  }

  return { update, floorHeightAt, dispose, group };
}

function placeInstances(mesh, count, floorHeightAt, fn) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * WORLD_RADIUS * 0.95;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    fn(m, x, z, floorHeightAt(x, z));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
