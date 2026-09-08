// Fish: how they look, how they swim, how they react.
import * as THREE from 'three';
import { SPECIES, kgToLength } from './data.js';
import { WORLD_RADIUS } from './world.js';

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

const bodyGeo = new THREE.SphereGeometry(0.5, 14, 10);
const tailGeo = new THREE.PlaneGeometry(0.34, 0.4);
tailGeo.translate(-0.17, 0, 0);
const dorsalGeo = new THREE.PlaneGeometry(0.4, 0.18);
dorsalGeo.translate(0, 0.09, 0);
const finGeo = new THREE.PlaneGeometry(0.2, 0.12);
const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const stripeGeo = new THREE.BoxGeometry(0.16, 0.5, 0.31);

// A fish points along +x in its own space. Body length is 1 before scaling.
export function makeFishMesh(sp) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, mat(sp.color));
  const h = sp.tall ? 0.62 : sp.fat ? 0.5 : 0.42;
  const w = sp.flat ? 0.9 : sp.fat ? 0.32 : 0.24;
  body.scale.set(1, sp.flat ? 0.14 : h, w);
  g.add(body);
  const tail = new THREE.Mesh(tailGeo, new THREE.MeshLambertMaterial({ color: sp.stripe || sp.color, side: THREE.DoubleSide }));
  tail.position.x = -0.48;
  tail.scale.set(1, sp.flat ? 0.5 : 1, 1);
  g.add(tail);
  if (!sp.flat) {
    const dorsal = new THREE.Mesh(dorsalGeo, new THREE.MeshLambertMaterial({ color: sp.stripe || sp.color, side: THREE.DoubleSide }));
    dorsal.position.set(0.02, h * 0.5 - 0.02, 0);
    if (sp.protected) { dorsal.scale.set(0.9, 1.9, 1); }
    g.add(dorsal);
    const finL = new THREE.Mesh(finGeo, new THREE.MeshLambertMaterial({ color: sp.stripe || sp.color, side: THREE.DoubleSide }));
    finL.position.set(0.12, -0.05, w * 0.5); finL.rotation.set(0.6, -0.5, 0);
    const finR = finL.clone(); finR.position.z = -w * 0.5; finR.rotation.set(-0.6, 0.5, 0);
    g.add(finL, finR);
    if (sp.stripe && !sp.protected) {
      const stripe = new THREE.Mesh(stripeGeo, mat(sp.stripe));
      stripe.scale.set(1, h * 0.9, w * 0.95);
      stripe.position.x = 0.05;
      g.add(stripe);
    }
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.36, 0.06, w * 0.42);
    const eyeR = eyeL.clone(); eyeR.position.z = -w * 0.42;
    g.add(eyeL, eyeR);
  }
  g.userData.tail = tail;
  return g;
}

export class FishManager {
  constructor(scene, reef, world) {
    this.scene = scene; this.reef = reef; this.world = world;
    this.fish = [];
    this.schools = {};
    reef.fish.forEach(([id, count, school]) => {
      const sp = SPECIES[id];
      let center = null;
      if (school) {
        center = this.randomPoint(10);
        this.schools[id] = { center, target: this.randomPoint(10), speed: sp.speed * 0.6 };
      }
      for (let i = 0; i < count; i++) this.spawn(id, sp, center);
    });
  }

  randomPoint(margin = 6) {
    const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - margin);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const floor = this.world.floorHeightAt(x, z);
    const y = floor + 1.2 + Math.random() * (-1.5 - floor - 1.2);
    return new THREE.Vector3(x, y, z);
  }

  spawn(id, sp, center) {
    const kg = +(sp.kg[0] + Math.random() * (sp.kg[1] - sp.kg[0])).toFixed(1);
    const len = kgToLength(kg);
    const mesh = makeFishMesh(sp);
    mesh.scale.setScalar(len);
    const pos = center ? center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8)) : this.randomPoint();
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const f = {
      id, sp, kg, len, mesh, pos: mesh.position,
      vel: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(sp.speed * 0.5),
      target: this.randomPoint(), timer: 2 + Math.random() * 4,
      state: 'swim', flee: 0, fleeFrom: new THREE.Vector3(), phase: Math.random() * 6.28,
      hitRadius: len * 0.5 + 0.12,
    };
    this.fish.push(f);
    return f;
  }

  scare(point, radius) {
    this.fish.forEach((f) => {
      if (f.state !== 'swim') return;
      if (f.pos.distanceTo(point) < radius) { f.flee = 2.5 + Math.random(); f.fleeFrom.copy(point); }
    });
  }

  update(dt, t, playerPos) {
    // Schools drift as a group
    for (const id in this.schools) {
      const s = this.schools[id];
      if (s.center.distanceTo(s.target) < 3) s.target = this.randomPoint(10);
      const d = s.target.clone().sub(s.center).normalize().multiplyScalar(s.speed * dt);
      s.center.add(d);
    }
    const desired = new THREE.Vector3();
    for (const f of this.fish) {
      if (f.state === 'reeling') continue;
      const sp = f.sp;
      const dPlayer = f.pos.distanceTo(playerPos);
      // Spook if the player gets close
      const spookDist = sp.protected ? 1.5 : sp.speed < 1.2 ? 2.8 : 5;
      if (f.flee <= 0 && dPlayer < spookDist) { f.flee = 1.5 + Math.random(); f.fleeFrom.copy(playerPos); }

      if (f.flee > 0) {
        f.flee -= dt;
        desired.copy(f.pos).sub(f.fleeFrom).normalize();
        desired.y *= 0.3;
        desired.multiplyScalar(sp.speed * 2.4);
      } else {
        f.timer -= dt;
        if (f.timer <= 0 || f.pos.distanceTo(f.target) < 2.5) {
          const school = this.schools[f.id];
          f.target = school
            ? school.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 10))
            : this.randomPoint();
          f.timer = 3 + Math.random() * 5;
        }
        desired.copy(f.target).sub(f.pos).normalize().multiplyScalar(sp.speed * (0.7 + 0.3 * Math.sin(t * 0.5 + f.phase)));
      }
      // Stay above the floor and below the surface
      const floor = this.world.floorHeightAt(f.pos.x, f.pos.z) + 0.8 + f.len * 0.4;
      if (f.pos.y < floor) desired.y += (floor - f.pos.y) * 3;
      if (f.pos.y > -0.8 - f.len * 0.4) desired.y -= 2;
      // Stay in the world
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r > WORLD_RADIUS - 4) { desired.x -= f.pos.x / r * 4; desired.z -= f.pos.z / r * 4; }

      const k = 1 - Math.exp(-dt * (f.flee > 0 ? 4 : 1.4));
      f.vel.lerp(desired, k);
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < floor - 0.5) f.pos.y = floor - 0.5;

      // Face the way it is swimming
      const hs = Math.hypot(f.vel.x, f.vel.z);
      if (hs > 0.01) {
        const yaw = Math.atan2(-f.vel.z, f.vel.x);
        const pitch = Math.atan2(f.vel.y, hs);
        f.mesh.rotation.set(0, yaw, THREE.MathUtils.clamp(pitch, -0.6, 0.6), 'YZX');
      }
      // Tail beat: faster when swimming faster
      const speed = f.vel.length();
      f.mesh.userData.tail.rotation.y = Math.sin(t * (4 + speed * 3) + f.phase) * 0.55;
    }
  }

  // Returns the first fish whose body is within reach of a point.
  hitTest(point) {
    for (const f of this.fish) {
      if (f.state !== 'swim') continue;
      if (f.pos.distanceTo(point) < f.hitRadius) return f;
    }
    return null;
  }

  remove(f) {
    this.scene.remove(f.mesh);
    const i = this.fish.indexOf(f);
    if (i >= 0) this.fish.splice(i, 1);
  }

  dispose() {
    this.fish.forEach((f) => this.scene.remove(f.mesh));
    this.fish = [];
  }
}
