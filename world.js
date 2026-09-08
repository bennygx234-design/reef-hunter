// Builds one reef from real 3D models: seafloor with sand and light ripples, water surface,
// corals / kelp / shipwreck, rocks, drifting particles and light shafts.
import * as THREE from 'three';
import { normalise, instanced } from './assets.js';

export const WORLD_RADIUS = 70;

function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
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

// Models each reef needs (besides fish).
export const REEF_MODELS = {
  coral: ['brain', 'fan', 'staghorn', 'table', 'rock'],
  kelp: ['kelp', 'rock', 'urchin'],
  wreck: ['wreck', 'rock', 'sponge', 'fan'],
};

let sandTex = null, causticTex = null;
function makeSandTexture() {
  if (sandTex) return sandTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const x = (i / 4) % 512, y = Math.floor(i / 4 / 512);
    const n = noise2(x * 0.08, y * 0.08) * 0.5 + noise2(x * 0.3, y * 0.3) * 0.3 + Math.random() * 0.2;
    const v = 190 + n * 60;
    img.data[i] = v; img.data[i + 1] = v * 0.96; img.data[i + 2] = v * 0.86; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  sandTex = new THREE.CanvasTexture(c);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(40, 40);
  sandTex.colorSpace = THREE.SRGBColorSpace;
  return sandTex;
}
// Wobbly bright lines like sunlight through the surface.
function makeCausticTexture() {
  if (causticTex) return causticTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.lineCap = 'round';
  g.filter = 'blur(1.5px)';
  for (let i = 0; i < 90; i++) {
    g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    g.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      const nx = x + (Math.random() - 0.5) * 120, ny = y + (Math.random() - 0.5) * 120;
      g.quadraticCurveTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60, nx, ny);
      x = nx; y = ny;
    }
    g.stroke();
  }
  causticTex = new THREE.CanvasTexture(c);
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  causticTex.repeat.set(18, 18);
  return causticTex;
}

export function buildWorld(scene, reef, models) {
  const group = new THREE.Group();
  scene.add(group);
  const floorY = -reef.floorDepth;
  const amp = reef.kind === 'wreck' ? 3.2 : reef.kind === 'kelp' ? 2.2 : 1.6;
  const floorHeightAt = (x, z) => floorY + (fbm(x * 0.045, z * 0.045) - 0.5) * 2 * amp;

  scene.fog = new THREE.FogExp2(reef.fog, reef.fogDensity);
  scene.background = new THREE.Color(reef.fog);

  const hemi = new THREE.HemisphereLight(0xbfe9ff, reef.sand, 1.1);
  const sun = new THREE.DirectionalLight(0xe8f8ff, reef.sun * 1.6);
  sun.position.set(20, 60, 10);
  const fill = new THREE.DirectionalLight(0x6fb4d8, 0.5);
  fill.position.set(-30, 20, -20);
  const amb = new THREE.AmbientLight(0x6f9fc0, 0.5);
  group.add(hemi, sun, fill, amb);

  // Seafloor
  const seg = 110;
  const floorGeo = new THREE.PlaneGeometry(WORLD_RADIUS * 2.6, WORLD_RADIUS * 2.6, seg, seg);
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, floorHeightAt(fp.getX(i), fp.getZ(i)));
  floorGeo.computeVertexNormals();
  const caustics = makeCausticTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    color: reef.sand, map: makeSandTexture(), roughness: 1, metalness: 0,
    emissive: 0xbfe9ff, emissiveMap: caustics, emissiveIntensity: reef.kind === 'wreck' ? 0.12 : reef.kind === 'kelp' ? 0.14 : 0.26,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  group.add(floor);

  // Water surface seen from below
  const surfGeo = new THREE.PlaneGeometry(WORLD_RADIUS * 3, WORLD_RADIUS * 3, 40, 40);
  surfGeo.rotateX(Math.PI / 2);
  const surfMat = new THREE.MeshPhongMaterial({
    color: 0xbfefff, emissive: 0x6fd6ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.75,
    shininess: 120, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  group.add(surface);
  const surfBase = surfGeo.attributes.position.array.slice();

  const swayers = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const scatter = (margin = 0.95) => {
    const r = Math.sqrt(Math.random()) * WORLD_RADIUS * margin;
    const a = Math.random() * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  // Place a ground model: sits on the floor, random yaw, given size in metres (length along x).
  const groundPlacer = (wrap, sizeRange, sink = 0.08) => () => {
    const [x, z] = scatter();
    const s = rnd(sizeRange[0], sizeRange[1]);
    const y = floorHeightAt(x, z) + wrap.userData.size.y * s * 0.5 - sink * s;
    E.set(0, Math.random() * Math.PI * 2, 0); Q.setFromEuler(E);
    P.set(x, y, z); S.set(s, s, s);
    return new THREE.Matrix4().compose(P, Q, S);
  };

  const rockWrap = normalise(models.rock, {});
  group.add(instanced(rockWrap, reef.kind === 'wreck' ? 70 : 50, groundPlacer(rockWrap, [0.8, 3.2], 0.25)));

  if (reef.kind === 'coral') {
    const brain = normalise(models.brain, {});
    group.add(instanced(brain, 60, groundPlacer(brain, [0.8, 2.2])));
    const fan = normalise(models.fan, {});
    group.add(instanced(fan, 80, groundPlacer(fan, [1.2, 2.6], 0.05)));
    const stag = normalise(models.staghorn, {});
    group.add(instanced(stag, 90, groundPlacer(stag, [1.0, 2.8])));
    const table = normalise(models.table, {});
    group.add(instanced(table, 40, groundPlacer(table, [1.5, 3.5])));
  }

  if (reef.kind === 'kelp') {
    const kelp = normalise(models.kelp, { axis: 'y' });
    const n = 190;
    const data = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = scatter();
      const y = floorHeightAt(x, z);
      const h = Math.min(-y - 1.0, rnd(7, 15));
      data.push({ x, z, y, h, phase: Math.random() * 6.28, yaw: Math.random() * 6.28, lean: rnd(0, 0.18) });
    }
    const kelpInst = instanced(kelp, n, (i) => {
      const k = data[i];
      E.set(k.lean, k.yaw, 0); Q.setFromEuler(E); P.set(k.x, k.y - 0.2, k.z); S.set(k.h * 0.35, k.h, k.h * 0.35);
      return new THREE.Matrix4().compose(P, Q, S);
    });
    group.add(kelpInst);
    swayers.push((t) => {
      kelpInst.userData.setAll((i) => {
        const k = data[i];
        E.set(k.lean + Math.sin(t * 0.6 + k.phase) * 0.09, k.yaw, Math.cos(t * 0.45 + k.phase) * 0.07);
        Q.setFromEuler(E); P.set(k.x, k.y - 0.2, k.z); S.set(k.h * 0.35, k.h, k.h * 0.35);
        return M.compose(P, Q, S);
      });
    });
    const urch = normalise(models.urchin, {});
    group.add(instanced(urch, 70, groundPlacer(urch, [0.25, 0.5], 0.05)));
  }

  if (reef.kind === 'wreck') {
    const wreck = normalise(models.wreck, {});
    const L = 46; // metres long
    wreck.scale.multiplyScalar(L);
    const wx = -8, wz = 14;
    wreck.position.set(wx, floorHeightAt(wx, wz) + wreck.userData.size.y * L * 0.42, wz);
    wreck.rotation.set(0.08, 0.6, -0.14);
    group.add(wreck);
    const sponge = normalise(models.sponge, { axis: 'y' });
    group.add(instanced(sponge, 45, () => {
      const [x, z] = scatter();
      const s = rnd(0.8, 1.8);
      E.set(0, Math.random() * 6.28, 0); Q.setFromEuler(E); P.set(x, floorHeightAt(x, z) - 0.1, z); S.set(s, s, s);
      return new THREE.Matrix4().compose(P, Q, S);
    }));
    const fan = normalise(models.fan, {});
    group.add(instanced(fan, 30, groundPlacer(fan, [1.0, 2.4], 0.05)));
  }

  // Drifting particles ("marine snow") around the player
  const pCount = 700;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 40; pPos[i * 3 + 1] = (Math.random() - 0.5) * 24; pPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xcfe9f5, size: 0.06, transparent: true, opacity: 0.5, sizeAttenuation: true }));
  group.add(particles);

  // Light shafts
  const shafts = new THREE.Group();
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: reef.kind === 'wreck' ? 0.03 : 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 14; i++) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1 + Math.random() * 3, reef.floorDepth + 4), shaftMat);
    sh.position.set((Math.random() - 0.5) * 70, -reef.floorDepth / 2, (Math.random() - 0.5) * 70);
    sh.rotation.y = Math.random() * Math.PI; sh.rotation.z = (Math.random() - 0.5) * 0.25;
    shafts.add(sh);
  }
  group.add(shafts);

  function update(t, dt, playerPos) {
    const arr = surfGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = surfBase[i], z = surfBase[i + 2];
      arr[i + 1] = Math.sin(x * 0.15 + t * 1.1) * 0.25 + Math.cos(z * 0.12 + t * 0.9) * 0.25;
    }
    surfGeo.attributes.position.needsUpdate = true;
    surface.position.x = playerPos.x; surface.position.z = playerPos.z;
    particles.position.copy(playerPos);
    const pa = pGeo.attributes.position.array;
    for (let i = 0; i < pa.length; i += 3) { pa[i] += Math.sin(t * 0.3 + i) * 0.002; pa[i + 1] += 0.003; if (pa[i + 1] > 12) pa[i + 1] = -12; }
    pGeo.attributes.position.needsUpdate = true;
    caustics.offset.set(t * 0.012, t * 0.009);
    floorMat.emissiveIntensity = (reef.kind === 'wreck' ? 0.12 : reef.kind === 'kelp' ? 0.14 : 0.26) * (0.85 + 0.15 * Math.sin(t * 1.7));
    shafts.rotation.y = t * 0.01;
    swayers.forEach((fn) => fn(t));
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
  }

  return { update, floorHeightAt, dispose, group };
}
