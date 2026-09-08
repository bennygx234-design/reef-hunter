// ---------- Gun rig (what you see in your hands) ----------
// The rig's forward is -z. The real gun model is normalised (front at +x) then turned to face -z.
// Rubber bands, the spear and the hands are our own so they can animate: bands snap forward on
// the shot, then a hand pulls them back to the notch while reloading.
let rig = null;
const GUN_LEN = { wood: 1.15, carbon: 1.25, pneu: 0.95 };
function buildGunModel(gun, rawModel) {
  if (rig) camera.remove(rig.group);
  const g = new THREE.Group();
  const L = GUN_LEN[gun.id];
  const model = normalise(rawModel, {});
  model.rotation.y = Math.PI / 2; // +x front -> -z front
  model.scale.multiplyScalar(L);
  g.add(model);
  const sz = model.userData.size; // normalised size (x = 1)
  const top = sz.y * L * 0.5;      // approx top of the barrel
  const muzzleZ = -L / 2, gripZ = L / 2;

  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c2c9, metalness: 0.9, roughness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.95 });

  // Spear: shaft with a flopper tip, lying in the groove on top of the barrel.
  const spear = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, L + 0.45, 8), steel);
  shaft.rotation.x = Math.PI / 2; spear.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.06, 8), steel);
  tip.rotation.x = -Math.PI / 2; tip.position.z = -(L + 0.45) / 2 - 0.03; spear.add(tip);
  const barb = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.05), steel);
  barb.position.set(0, 0.008, -(L + 0.45) / 2 + 0.1); barb.rotation.x = 0.35; spear.add(barb);
  spear.position.set(0, top + 0.006, -0.18);
  g.add(spear);

  // Bands (two rubbers from the muzzle to a wishbone that hooks into the spear notch)
  const bands = [];
  const anchors = [new THREE.Vector3(-0.028, top - 0.012, muzzleZ + 0.03), new THREE.Vector3(0.028, top - 0.012, muzzleZ + 0.03)];
  const notchPos = new THREE.Vector3(0, top + 0.012, gripZ - 0.32);
  const relaxPos = new THREE.Vector3(0, top - 0.03, muzzleZ + 0.44);
  const wish = new THREE.Vector3().copy(notchPos);
  if (gun.id !== 'pneu') {
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1, 8), rubber);
      g.add(b); bands.push(b);
    }
  }
  const wishbone = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), steel);
  wishbone.visible = gun.id !== 'pneu';
  g.add(wishbone);

  // Hands: back hand on the grip, front hand under the barrel (this one does the loading).
  const handB = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.1), glove);
  handB.position.set(0.01, -sz.y * L * 0.35, gripZ - 0.08); g.add(handB);
  const armB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), glove);
  armB.position.set(0.06, -sz.y * L * 0.45, gripZ + 0.22); armB.rotation.x = -0.35; g.add(armB);
  const handF = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.11), glove); handF.add(palm);
  for (let i = 0; i < 4; i++) {
    const fg = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.02), glove);
    fg.position.set(-0.03 + i * 0.02, 0.045, 0.0); fg.rotation.x = -0.3; handF.add(fg);
  }
  const armF = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.45), glove);
  armF.position.set(-0.04, -0.06, 0.2); armF.rotation.x = -0.15; handF.add(armF);
  const holdPos = new THREE.Vector3(0, -sz.y * L * 0.25 - 0.02, muzzleZ + L * 0.45);
  handF.position.copy(holdPos);
  g.add(handF);

  g.position.set(0.24, -0.22, -0.30);
  g.rotation.set(0.0, 0.05, 0);
  camera.add(g);
  rig = { group: g, gun, L, spear, bands, wishbone, wish, anchors, notchPos, relaxPos, handF, holdPos, top, muzzleZ, gripZ, snap: 0, spearHome: spear.position.clone() };
  updateRig(0);
}

const _dir = new THREE.Vector3(), _mid = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function layBand(mesh, a, b) {
  _dir.subVectors(b, a); const len = _dir.length();
  _mid.addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(_mid);
  mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
  mesh.scale.set(1, len, 1);
}
const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
// Drives the reload animation. progress = 0 right after the shot, 1 when ready.
function updateRig(dt) {
  if (!rig) return;
  const gun = rig.gun;
  const loaded = state.reloadLeft <= 0;
  const progress = loaded ? 1 : 1 - state.reloadLeft / gun.reload;
  rig.snap = Math.max(0, rig.snap - dt);
  const handTarget = new THREE.Vector3().copy(rig.holdPos);
  if (gun.id === 'pneu') {
    // The spear is pushed into the barrel from the front during the whole reload.
    const k = ease(progress);
    rig.spear.visible = true;
    rig.spear.position.copy(rig.spearHome); rig.spear.position.z -= (1 - k) * 0.9;
    if (!loaded) { handTarget.set(0.02, rig.top + 0.01, rig.spear.position.z - rig.L / 2 - 0.2); }
  } else {
    // Phase A (first 35%): slide the spear into the groove. Phase B: pull the bands back.
    const a = ease(Math.min(1, progress / 0.35));
    const b = progress < 0.35 ? 0 : ease((progress - 0.35) / 0.65);
    rig.spear.visible = true;
    rig.spear.position.copy(rig.spearHome); rig.spear.position.z -= (1 - a) * 0.6;
    rig.wish.lerpVectors(rig.relaxPos, rig.notchPos, b);
    // Right after the shot the loose bands bounce a little.
    if (rig.snap > 0) { rig.wish.z += Math.sin(rig.snap * 40) * 0.03 * rig.snap; rig.wish.y -= 0.01 * Math.sin(rig.snap * 25); }
    if (!loaded && progress >= 0.35) {
      // Hand grabs the wishbone and hauls it back, shaking slightly with the effort.
      handTarget.set(0.01, rig.wish.y - 0.03, rig.wish.z + 0.04);
      handTarget.x += Math.sin(clock.t * 60) * 0.003 * b;
    }
    rig.wishbone.position.copy(rig.wish);
    rig.wishbone.rotation.set(Math.PI / 2, 0, 0);
    rig.bands.forEach((m, i) => layBand(m, rig.anchors[i], rig.wish));
    // Bands get thinner the more they stretch.
    const stretch = rig.wish.distanceTo(rig.anchors[0]);
    rig.bands.forEach((m) => { m.scale.x = m.scale.z = THREE.MathUtils.clamp(1.35 - stretch * 0.6, 0.55, 1.35); });
  }
  rig.handF.position.lerp(handTarget, 1 - Math.exp(-dt * 14));
}
