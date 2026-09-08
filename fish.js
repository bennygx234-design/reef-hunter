// Fish: real 3D models that swim with a body wave, wander, school and flee.
import * as THREE from 'three';
import { SPECIES, kgToLength } from './data.js';
import { WORLD_RADIUS } from './world.js';
import { normalise, makeSwimMaterial, tint, MODEL_FIX } from './assets.js';

export class FishManager {
  // models: map of model name -> raw loaded GLB scene
  constructor(scene, reef, world, models) {
    this.scene = scene; this.reef = reef; this.world = world;
    this.fish = [];
    this.schools = {};
    this.templates = {};
    reef.fish.forEach(([id, count, school]) => {
      const sp = SPECIES[id];
      const modelName = sp.model || id;
      if (!this.templates[modelName]) {
        const fix = MODEL_FIX[modelName] || MODEL_FIX.default;
        this.templates[modelName] = normalise(models[modelName], fix);
      }
      let center = null;
      if (school) {
        center = this.randomPoint(10);
        this.schools[id] = { center, target: this.randomPoint(10), speed: sp.speed * 0.6 };
      }
      for (let i = 0; i < count; i++) this.spawn(id, sp, center, this.templates[modelName]);
    });
  }

  randomPoint(margin = 6) {
    const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - margin);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const floor = this.world.floorHeightAt(x, z);
    const y = floor + 1.2 + Math.random() * Math.max(0.5, -1.5 - floor - 1.2);
    return new THREE.Vector3(x, y, z);
  }

  spawn(id, sp, center, template) {
    const kg = +(sp.kg[0] + Math.random() * (sp.kg[1] - sp.kg[0])).toFixed(1);
    const len = kgToLength(kg) * (sp.lengthScale || 1);
    const phase = Math.random() * Math.PI * 2;
    const mesh = new THREE.Group();
    const body = template.clone(true);
    const mats = [];
    body.traverse((o) => {
      if (o.isMesh) {
        let m = o.material;
        if (sp.tint) m = tint(m, sp.tint);
        m = makeSwimMaterial(m, phase);
        o.material = m; mats.push(m);
        o.frustumCulled = false;
      }
    });
    mesh.add(body);
    mesh.scale.setScalar(len);
    const pos = center ? center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8)) : this.randomPoint();
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const f = {
      id, sp, kg, len, mesh, mats, pos: mesh.position,
      vel: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(sp.speed * 0.5),
      target: this.randomPoint(), timer: 2 + Math.random() * 4,
      state: 'swim', flee: 0, fleeFrom: new THREE.Vector3(), phase,
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
    for (const id in this.schools) {
      const s = this.schools[id];
      if (s.center.distanceTo(s.target) < 3) s.target = this.randomPoint(10);
      const d = s.target.clone().sub(s.center).normalize().multiplyScalar(s.speed * dt);
      s.center.add(d);
    }
    const desired = new THREE.Vector3();
    for (const f of this.fish) {
      if (f.state === 'reeling') { this.setSwim(f, t, 3); continue; }
      const sp = f.sp;
      const dPlayer = f.pos.distanceTo(playerPos);
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
      const floor = this.world.floorHeightAt(f.pos.x, f.pos.z) + (sp.flat ? 0.25 : 0.8 + f.len * 0.4);
      if (f.pos.y < floor) desired.y += (floor - f.pos.y) * 3;
      if (sp.flat && f.pos.y > floor + 1.5) desired.y -= 1.5; // flatfish hug the bottom
      if (f.pos.y > -0.8 - f.len * 0.4) desired.y -= 2;
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r > WORLD_RADIUS - 4) { desired.x -= f.pos.x / r * 4; desired.z -= f.pos.z / r * 4; }

      const k = 1 - Math.exp(-dt * (f.flee > 0 ? 4 : 1.4));
      f.vel.lerp(desired, k);
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < floor - 0.5) f.pos.y = floor - 0.5;

      const hs = Math.hypot(f.vel.x, f.vel.z);
      if (hs > 0.01) {
        const yaw = Math.atan2(-f.vel.z, f.vel.x);
        const pitch = Math.atan2(f.vel.y, hs);
        f.mesh.rotation.set(0, yaw, THREE.MathUtils.clamp(pitch, -0.6, 0.6), 'YZX');
      }
      this.setSwim(f, t, f.vel.length());
    }
  }

  // Drive the body-wave shader: faster and wider when the fish swims faster.
  setSwim(f, t, speed) {
    const rel = speed / f.sp.speed;
    for (const m of f.mats) {
      const u = m.userData.uniforms;
      u.uTime.value = t * (0.8 + rel * 0.9);
      u.uAmp.value = f.sp.flat ? 0.03 : 0.035 + Math.min(0.09, rel * 0.045);
    }
  }

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
