// Loads the generated 3D models (GLB files) and normalises them so the game can use them
// without caring how big or which way round the generator made them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

// Per-model fixes. facing: which local axis the head/muzzle points to in the raw file.
// After normalise(), every model is centred, its longest horizontal axis lies along +x with the
// front at +x, and its length along x is exactly 1 unit.
export const MODEL_FIX = {
  default: {},
  shark: { flip: true },
};

export function loadGLB(name) {
  if (cache.has(name)) return cache.get(name);
  const p = new Promise((resolve, reject) => {
    loader.load(`./assets/models/${name}.glb`, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false; o.receiveShadow = false;
          if (o.material) { o.material.side = THREE.FrontSide; }
        }
      });
      resolve(root);
    }, undefined, reject);
  });
  cache.set(name, p);
  return p;
}

// Wrap a loaded scene in a group that is centred and scaled so its length along x is 1.
// opts.axis: 'x' (default, longest horizontal axis along x) or 'y' (upright things like kelp: height = 1).
// opts.flip: rotate 180° around y so the front ends up at +x.
// opts.rotY: extra rotation in radians applied before measuring.
export function normalise(root, opts = {}) {
  const wrap = new THREE.Group();
  const inner = root.clone(true);
  if (opts.rotY) inner.rotation.y = opts.rotY;
  wrap.add(inner);
  let box = new THREE.Box3().setFromObject(inner);
  let size = box.getSize(new THREE.Vector3());
  // Generated models often sit at an odd angle. Find the angle around y that makes the model
  // longest along x (tightest fit), then turn it so its long axis lies exactly on x.
  if (opts.axis !== 'y' && !opts.keepAngle) {
    const pts = samplePoints(inner, 1500);
    let best = 0, bestLen = -1;
    for (let a = 0; a < Math.PI; a += Math.PI / 180) {
      const c = Math.cos(a), s = Math.sin(a);
      let mn = Infinity, mx = -Infinity;
      for (const p of pts) { const x = p.x * c + p.z * s; if (x < mn) mn = x; if (x > mx) mx = x; }
      if (mx - mn > bestLen) { bestLen = mx - mn; best = a; }
    }
    inner.rotation.y += best;
    // Every reference picture showed the head or muzzle pointing LEFT (-x). After turning the
    // model by `best`, that original -x direction now has x = -cos(best). If it ended up on the
    // -x side, turn the model round so the front is at +x.
    // (The generator does not keep that reliably, so this is opt-in; MODEL_FIX carries per-model flips.)
    if (opts.front === 'left' && -Math.cos(best) < 0) inner.rotation.y += Math.PI;
    box = new THREE.Box3().setFromObject(inner);
    size = box.getSize(new THREE.Vector3());
  }
  if (opts.flip) {
    inner.rotation.y += Math.PI;
    box = new THREE.Box3().setFromObject(inner);
    size = box.getSize(new THREE.Vector3());
  }
  const center = box.getCenter(new THREE.Vector3());
  const len = opts.axis === 'y' ? size.y : size.x;
  const s = 1 / (len || 1);
  inner.position.sub(center);
  if (opts.axis === 'y') inner.position.y += size.y / 2; // base sits at y = 0
  wrap.scale.setScalar(s);
  wrap.userData.size = size.clone().multiplyScalar(s);
  return wrap;
}

function samplePoints(obj, max) {
  obj.updateMatrixWorld(true);
  const pts = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / max));
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(v.clone());
    }
  });
  return pts;
}

// Collect every mesh in a normalised model with its world matrix relative to the wrap.
export function meshParts(wrap) {
  wrap.updateMatrixWorld(true);
  const parts = [];
  const inv = new THREE.Matrix4().copy(wrap.matrixWorld).invert();
  wrap.traverse((o) => {
    if (o.isMesh) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      parts.push({ geometry: o.geometry, material: o.material, local: m });
    }
  });
  return parts;
}

// Make instanced copies of a normalised model. placeFn(i) must return a Matrix4 for instance i
// (position, rotation, scale in world units, applied to the 1-unit-long normalised model).
export function instanced(wrap, count, placeFn) {
  const parts = meshParts(wrap);
  const group = new THREE.Group();
  const meshes = parts.map((p) => {
    const im = new THREE.InstancedMesh(p.geometry, p.material, count);
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const world = placeFn(i);
    parts.forEach((p, j) => { m.multiplyMatrices(world, p.local); meshes[j].setMatrixAt(i, m); });
  }
  meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  group.userData.setAll = (placeFn2) => {
    for (let i = 0; i < count; i++) {
      const world = placeFn2(i);
      parts.forEach((p, j) => { m.multiplyMatrices(world, p.local); meshes[j].setMatrixAt(i, m); });
    }
    meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  };
  return group;
}

// A swimming shader: bends the body side to side along its length, stronger at the tail.
// Works on any material via onBeforeCompile. Front is +x, tail is -x (after normalise()).
export function makeSwimMaterial(src, phase) {
  const mat = src.clone();
  mat.userData.uniforms = { uTime: { value: 0 }, uPhase: { value: phase }, uAmp: { value: 0.06 }, uFreq: { value: 6 } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uPhase, uAmp, uFreq;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float tailW = clamp(0.5 - transformed.x, 0.0, 1.0);
        transformed.z += sin(transformed.x * uFreq - uTime * 9.0 + uPhase) * uAmp * (0.15 + tailW * tailW * 1.6);`);
  };
  mat.customProgramCacheKey = () => 'swim';
  return mat;
}

export function tint(material, hex) {
  const m = material.clone();
  if (m.color) m.color.multiply(new THREE.Color(hex));
  return m;
}
