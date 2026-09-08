// Reef Hunter: first-person spearfishing. Main loop, player, guns, HUD and menus.
import * as THREE from 'three';
import { GUNS, REEFS, SPECIES } from './data.js';
import { GameAudio } from './audio.js';
import { buildWorld, WORLD_RADIUS } from './world.js';
import { FishManager } from './fish.js';

const $ = (s) => document.querySelector(s);
const audio = new GameAudio();

// ---------- Renderer / scene ----------
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Game state ----------
const state = {
  screen: 'title',
  reef: REEFS[0], gun: GUNS[0],
  world: null, fishes: null,
  yaw: 0, pitch: 0,
  keys: {},
  score: 0, catches: [], o2: 100, timeLeft: 0,
  reloadLeft: 0, spears: [],
  bobT: 0, shake: 0,
  best: loadBest(),
  lastReef: 0, lastGun: 0,
};

function loadBest() {
  try { return JSON.parse(localStorage.getItem('reefhunter.best') || '{}'); } catch (e) { return {}; }
}
function saveBest() { try { localStorage.setItem('reefhunter.best', JSON.stringify(state.best)); } catch (e) {} }

// ---------- Gun view model (what you see in your hands) ----------
let gunModel = null;
let gunSpear = null;
function buildGunModel(gun) {
  if (gunModel) camera.remove(gunModel);
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const glove = new THREE.MeshLambertMaterial({ color: 0x1b2230 });
  const steel = new THREE.MeshLambertMaterial({ color: 0xb9c2c9 });
  let barrel;
  if (gun.id === 'wood') {
    barrel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.95), new THREE.MeshLambertMaterial({ color: 0x7a4b25 }));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), new THREE.MeshLambertMaterial({ color: 0x4a2c15 }));
    grip.position.set(0, -0.08, 0.38); g.add(grip);
    for (const s of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 6), black);
      band.rotation.x = Math.PI / 2; band.position.set(s * 0.035, 0.01, -0.02); g.add(band);
    }
  } else if (gun.id === 'carbon') {
    barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 1.05, 10), black);
    barrel.rotation.x = Math.PI / 2;
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), new THREE.MeshLambertMaterial({ color: 0xd42a2a }));
    trig.position.set(0, -0.05, 0.35); g.add(trig);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.045), black);
    grip.position.set(0, -0.09, 0.4); g.add(grip);
  } else {
    barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 1.15, 12), steel);
    barrel.rotation.x = Math.PI / 2;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 10), new THREE.MeshLambertMaterial({ color: 0x33393f }));
    tank.rotation.x = Math.PI / 2; tank.position.set(0, -0.08, 0.15); g.add(tank);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    gauge.rotation.z = Math.PI / 2; gauge.position.set(0.07, 0.03, 0.42); g.add(gauge);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.05), black);
    grip.position.set(0, -0.1, 0.48); g.add(grip);
  }
  g.add(barrel);
  gunSpear = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.35, 6), steel);
  gunSpear.rotation.x = Math.PI / 2; gunSpear.position.set(0, 0.035, -0.25);
  g.add(gunSpear);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 6), steel);
  tip.rotation.x = Math.PI; tip.position.set(0, -0.7, 0); gunSpear.add(tip);
  // Hands
  const handF = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.11), glove);
  handF.position.set(0, -0.045, -0.05); g.add(handF);
  const handB = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.1), glove);
  handB.position.set(0.01, -0.09, 0.42); g.add(handB);
  const armB = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), glove);
  armB.position.set(0.06, -0.16, 0.75); armB.rotation.x = -0.35; g.add(armB);
  g.position.set(0.28, -0.24, -0.45);
  g.rotation.set(0.02, 0.06, 0);
  camera.add(g);
  gunModel = g;
}

// ---------- Input ----------
function lockPointer() {
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}
window.addEventListener('keydown', (e) => {
  state.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (state.screen !== 'playing' || document.pointerLockElement !== canvas) return;
  const sens = 0.0022;
  state.yaw -= e.movementX * sens;
  state.pitch -= e.movementY * sens;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.45, 1.45);
});
canvas.addEventListener('mousedown', (e) => {
  if (state.screen !== 'playing') return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) shoot();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.screen === 'playing') pauseGame();
});

// ---------- Flow ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  if (id) $('#' + id).classList.add('active');
}

function goTitle() { state.screen = 'title'; show('screen-title'); $('#hud').classList.remove('active'); }

function goReef() {
  state.screen = 'reef'; show('screen-reef');
  REEFS.forEach((r, i) => {
    const el = $('#pin-' + r.id + ' .best');
    const b = state.best[r.id];
    el.textContent = b ? 'BEST ' + b.toLocaleString() : 'NOT DIVED YET';
  });
}

function goGun() {
  state.screen = 'gun'; show('screen-gun');
  $('#gun-reef-name').textContent = state.reef.name + ' · ' + state.reef.difficulty.toUpperCase() + ' · ' + state.reef.depthLabel;
  document.querySelectorAll('.guncard').forEach((c) => c.classList.toggle('selected', c.dataset.gun === state.gun.id));
}

function startDive() {
  audio.ensure(); audio.click();
  if (state.world) { state.world.dispose(); state.fishes.dispose(); }
  state.world = buildWorld(scene, state.reef);
  state.fishes = new FishManager(scene, state.reef, state.world);
  buildGunModel(state.gun);
  state.spears.forEach((s) => scene.remove(s.mesh)); state.spears = [];
  state.score = 0; state.catches = []; state.o2 = 100; state.timeLeft = state.reef.diveTime;
  state.reloadLeft = 0; state.yaw = 0; state.pitch = -0.1;
  camera.position.set(0, -2.2, 22);
  state.screen = 'playing';
  show(null);
  $('#hud').classList.add('active');
  $('#hud-reef').textContent = state.reef.name;
  $('#hud-gun').textContent = state.gun.name;
  $('#hud-power').textContent = state.gun.power + '%';
  $('#hud-power-bar').style.width = state.gun.power + '%';
  $('#hud-power-bar').style.background = state.gun.accent;
  hidePopup();
  lockPointer();
  audio.startAmbient(state.reef.floorDepth / 30);
  toast('Click to shoot. Bigger fish, more points.', 3200);
  lastTime = performance.now();
}

function pauseGame() {
  if (state.screen !== 'playing') return;
  state.screen = 'paused'; show('screen-pause');
  $('#pause-score').textContent = state.score.toLocaleString();
}
function resumeGame() {
  state.screen = 'playing'; show(null);
  lockPointer();
  lastTime = performance.now();
}

function endDive(reason) {
  state.screen = 'results';
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  audio.stopAmbient();
  $('#hud').classList.remove('active');
  hidePopup();
  const list = $('#results-list');
  list.innerHTML = '';
  if (!state.catches.length) list.innerHTML = '<li class="empty">No fish landed. Get closer and aim for the body.</li>';
  state.catches.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="fishname">${c.icon} ${c.name}${c.trophy ? ' <em>TROPHY</em>' : ''}</span><span class="kg">${c.kg.toFixed(1)} kg</span><span class="pts ${c.pts < 0 ? 'neg' : ''}">${c.pts >= 0 ? '+' : ''}${c.pts.toLocaleString()}</span>`;
    list.appendChild(li);
  });
  $('#results-total').textContent = state.score.toLocaleString();
  $('#results-reason').textContent = reason;
  const prev = state.best[state.reef.id] || 0;
  const isBest = state.score > prev && state.score > 0;
  if (isBest) { state.best[state.reef.id] = state.score; saveBest(); }
  $('#results-best').textContent = isBest ? 'NEW BEST SCORE FOR ' + state.reef.name + '!' : 'BEST ON THIS REEF: ' + (state.best[state.reef.id] || 0).toLocaleString();
  show('screen-results');
}

// ---------- Shooting ----------
function shoot() {
  if (state.reloadLeft > 0) { audio.click(); return; }
  const gun = state.gun;
  state.reloadLeft = gun.reload;
  state.shake = 1;
  audio.shot(gun.power);
  gunSpear.visible = false;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const start = camera.position.clone().addScaledVector(dir, 0.6);
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  start.addScaledVector(right, 0.22).y -= 0.15;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0xc8d0d6 }));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.position.copy(start);
  scene.add(mesh);
  state.spears.push({ mesh, pos: start, vel: dir.clone().multiplyScalar(gun.speed), dir: dir.clone(), travelled: 0, range: gun.range, alive: true });
  state.fishes.scare(start, 3);
}

function updateSpears(dt) {
  for (const s of state.spears) {
    if (!s.alive) continue;
    s.vel.y -= 1.2 * dt;
    s.vel.multiplyScalar(1 - 0.35 * dt); // water drag
    const step = s.vel.clone().multiplyScalar(dt);
    const dirN = s.vel.clone().normalize();
    // Sweep the tip along the whole step so fast spears cannot pass through a fish between frames.
    const prevTip = s.pos.clone().addScaledVector(dirN, 0.7);
    s.pos.add(step);
    s.travelled += step.length();
    s.mesh.position.copy(s.pos);
    s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN);
    const n = Math.max(1, Math.ceil(step.length() / 0.15));
    let f = null;
    for (let i = 1; i <= n && !f; i++) f = state.fishes.hitTest(prevTip.clone().addScaledVector(step, i / n));
    if (f) { onHit(f, s); continue; }
    const floor = state.world.floorHeightAt(s.pos.x, s.pos.z);
    if (s.travelled > s.range || s.pos.y < floor + 0.2 || s.pos.y > 0) {
      s.alive = false; scene.remove(s.mesh);
      if (s.travelled > s.range) toast('Out of range. Get closer.', 1400);
      state.fishes.scare(s.pos, 5);
    }
  }
  state.spears = state.spears.filter((s) => s.alive);
}

function onHit(f, spear) {
  spear.alive = false; scene.remove(spear.mesh);
  const sp = f.sp;
  audio.hit();
  if (sp.protected) {
    state.score -= sp.penalty;
    state.catches.push({ name: sp.name, kg: f.kg, pts: -sp.penalty, icon: '⚠' });
    popup('PROTECTED SPECIES', sp.name + ' · ' + f.kg.toFixed(1) + ' kg', '−' + sp.penalty + ' PTS', 'bad');
    audio.penalty();
    f.flee = 4; f.fleeFrom.copy(camera.position);
    state.fishes.scare(f.pos, 12);
    return;
  }
  if (f.kg > state.gun.maxKg) {
    popup('TOO BIG!', sp.name + ' · ' + f.kg.toFixed(1) + ' kg tore off', 'NEED MORE POWER', 'bad');
    audio.fail();
    f.flee = 4; f.fleeFrom.copy(camera.position);
    state.fishes.scare(f.pos, 8);
    return;
  }
  const range = sp.kg[1] - sp.kg[0];
  const trophy = f.kg >= sp.kg[0] + range * 0.85;
  let pts = Math.round(f.kg * sp.ptsPerKg);
  if (trophy) pts = Math.round(pts * 1.5);
  f.state = 'reeling'; f.reel = 0;
  state.reeling = state.reeling || [];
  state.reeling.push(f);
  state.score += pts;
  state.catches.push({ name: sp.name, kg: f.kg, pts, trophy, icon: '🐟' });
  popup(trophy ? 'TROPHY CATCH!' : 'GREAT CATCH!', sp.name + ' · ' + f.kg.toFixed(1) + ' kg', '+' + pts.toLocaleString() + ' PTS', trophy ? 'trophy' : 'good');
  if (trophy) audio.trophy(); else audio.catchChime();
  state.fishes.scare(f.pos, 6);
}

function updateReeling(dt) {
  if (!state.reeling) return;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const home = camera.position.clone().addScaledVector(dir, 1.2); home.y -= 0.4;
  for (const f of state.reeling.slice()) {
    f.reel += dt;
    const k = Math.min(1, f.reel / 1.3);
    f.pos.lerp(home, k * 0.15 + dt * 2);
    f.mesh.rotation.z += Math.sin(f.reel * 25) * 0.15;
    f.mesh.userData.tail.rotation.y = Math.sin(f.reel * 40) * 0.8;
    if (f.reel > 1.4) { state.fishes.remove(f); state.reeling.splice(state.reeling.indexOf(f), 1); }
  }
}

// ---------- Player ----------
const tmpDir = new THREE.Vector3(), tmpRight = new THREE.Vector3(), move = new THREE.Vector3();
function updatePlayer(dt) {
  const k = state.keys;
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  camera.getWorldDirection(tmpDir);
  tmpRight.crossVectors(tmpDir, new THREE.Vector3(0, 1, 0)).normalize();
  move.set(0, 0, 0);
  if (k.KeyW || k.ArrowUp) move.add(tmpDir);
  if (k.KeyS || k.ArrowDown) move.sub(tmpDir);
  if (k.KeyD || k.ArrowRight) move.add(tmpRight);
  if (k.KeyA || k.ArrowLeft) move.sub(tmpRight);
  if (k.Space) move.y += 1;
  if (k.KeyC || k.ControlLeft) move.y -= 1;
  const sprint = (k.ShiftLeft || k.ShiftRight) && move.lengthSq() > 0;
  const speed = sprint ? 6.5 : 3.8;
  const moving = move.lengthSq() > 0;
  if (moving) move.normalize().multiplyScalar(speed);
  state.vel = state.vel || new THREE.Vector3();
  state.vel.lerp(move, 1 - Math.exp(-dt * 5));
  camera.position.addScaledVector(state.vel, dt);
  // Bounds
  const floor = state.world.floorHeightAt(camera.position.x, camera.position.z) + 0.9;
  if (camera.position.y < floor) camera.position.y = floor;
  if (camera.position.y > -0.35) camera.position.y = -0.35;
  const r = Math.hypot(camera.position.x, camera.position.z);
  if (r > WORLD_RADIUS) { camera.position.x *= WORLD_RADIUS / r; camera.position.z *= WORLD_RADIUS / r; }
  // Gun bob and kick
  state.bobT += dt * (moving ? 6 : 2);
  state.shake = Math.max(0, state.shake - dt * 5);
  if (gunModel) {
    gunModel.position.set(0.28 + Math.sin(state.bobT) * 0.01, -0.24 + Math.abs(Math.cos(state.bobT)) * 0.012 - state.shake * 0.02, -0.45 + state.shake * 0.12);
    gunModel.rotation.x = 0.02 + state.shake * 0.25;
  }
  // Oxygen: drains underwater, refills at the surface
  const atSurface = camera.position.y > -1.0;
  if (atSurface) {
    state.o2 = Math.min(100, state.o2 + 28 * dt);
    if (state.o2 < 100 && !state.surfToast) { state.surfToast = true; toast('At the surface · refilling O2', 1500); audio.breath(); }
  } else {
    state.surfToast = false;
    state.o2 -= (sprint ? 2.4 : 1.25) * dt;
    if (state.o2 < 20 && Math.floor(state.o2) !== state.lastWarn) { state.lastWarn = Math.floor(state.o2); if (state.o2 < 20 && state.lastWarn % 5 === 0) audio.warn(); }
  }
  state.timeLeft -= dt;
  state.reloadLeft = Math.max(0, state.reloadLeft - dt);
  if (gunSpear) gunSpear.visible = state.reloadLeft <= 0;
  if (state.o2 <= 0) { state.o2 = 0; endDive('BLACKOUT · Out of oxygen'); }
  else if (state.timeLeft <= 0) { state.timeLeft = 0; endDive('DIVE TIME OVER'); }
}

// ---------- HUD ----------
const hud = {
  score: $('#hud-score'), depth: $('#hud-depth'), o2: $('#hud-o2-bar'), o2txt: $('#hud-o2'), time: $('#hud-time'),
  reload: $('#hud-reload'), cross: $('#crosshair'),
};
let hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
function updateHUD() {
  setText(hud.score, 'score', state.score.toLocaleString());
  setText(hud.depth, 'depth', Math.max(0, -camera.position.y).toFixed(0) + ' m');
  const o2 = Math.round(state.o2);
  setText(hud.o2txt, 'o2', o2 + '%');
  hud.o2.style.width = o2 + '%';
  hud.o2.classList.toggle('low', o2 < 30);
  const t = Math.ceil(state.timeLeft);
  setText(hud.time, 'time', Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'));
  const rl = state.reloadLeft / state.gun.reload;
  hud.reload.style.transform = `scaleX(${1 - rl})`;
  hud.cross.classList.toggle('reloading', state.reloadLeft > 0);
}

let popupTimer = null;
function popup(title, sub, pts, kind) {
  const p = $('#popup');
  p.className = 'show ' + kind;
  $('#popup-title').textContent = title;
  $('#popup-sub').textContent = sub;
  $('#popup-pts').textContent = pts;
  clearTimeout(popupTimer);
  popupTimer = setTimeout(hidePopup, 2600);
}
function hidePopup() { $('#popup').className = ''; }
let toastTimer = null;
function toast(msg, ms = 2000) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Main loop ----------
let lastTime = performance.now();
const clock = { t: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.screen === 'playing') {
    clock.t += dt;
    updatePlayer(dt);
    if (state.screen !== 'playing') return; // dive may have ended
    state.fishes.update(dt, clock.t, camera.position);
    updateSpears(dt);
    updateReeling(dt);
    state.world.update(clock.t, dt, camera.position);
    updateHUD();
    renderer.render(scene, camera);
  } else if (state.screen === 'paused' && state.world) {
    renderer.render(scene, camera);
  }
}
requestAnimationFrame(frame);

// ---------- Menu wiring ----------
$('#btn-start').addEventListener('click', () => { audio.ensure(); audio.click(); goReef(); });
document.querySelectorAll('.pin').forEach((p) => {
  p.addEventListener('click', () => {
    audio.click();
    state.reef = REEFS.find((r) => r.id === p.dataset.reef);
    goGun();
  });
});
document.querySelectorAll('.guncard').forEach((c) => {
  c.addEventListener('click', () => {
    audio.click();
    state.gun = GUNS.find((g) => g.id === c.dataset.gun);
    document.querySelectorAll('.guncard').forEach((x) => x.classList.toggle('selected', x === c));
  });
});
$('#btn-dive').addEventListener('click', startDive);
$('#btn-back-reef').addEventListener('click', () => { audio.click(); goReef(); });
$('#btn-resume').addEventListener('click', resumeGame);
$('#btn-end').addEventListener('click', () => endDive('DIVE ENDED EARLY'));
$('#btn-next-reef').addEventListener('click', () => { audio.click(); goReef(); });
$('#btn-change-gun').addEventListener('click', () => { audio.click(); goGun(); });
$('#btn-again').addEventListener('click', startDive);
$('#btn-title').addEventListener('click', () => { audio.click(); goTitle(); });

// Build the gun cards from data so the numbers always match the game.
const gunWrap = $('#guncards');
GUNS.forEach((g) => {
  const c = document.createElement('div');
  c.className = 'guncard' + (g === state.gun ? ' selected' : '');
  c.dataset.gun = g.id;
  c.style.setProperty('--accent', g.accent);
  c.innerHTML = `
    <h3>${g.name}</h3>
    <div class="gunart gun-${g.id}"><span class="shaft"></span><span class="body"></span><span class="grip"></span></div>
    <div class="stat"><span>POWER</span><b>${g.power}</b></div>
    <div class="bar"><i style="width:${g.power}%"></i></div>
    <div class="stat small"><span>RANGE</span><b>${g.range} m</b></div>
    <div class="stat small"><span>RELOAD</span><b>${g.reloadLabel}</b></div>
    <div class="stat small"><span>HOLDS UP TO</span><b>${g.maxKg} kg</b></div>
    <p>${g.blurb}</p>`;
  gunWrap.appendChild(c);
});
document.querySelectorAll('.guncard').forEach((c) => {
  c.addEventListener('click', () => {
    audio.click();
    state.gun = GUNS.find((g) => g.id === c.dataset.gun);
    document.querySelectorAll('.guncard').forEach((x) => x.classList.toggle('selected', x === c));
  });
});

// Reef pins from data
REEFS.forEach((r) => {
  const pin = $('#pin-' + r.id);
  pin.style.left = r.pin.x + '%'; pin.style.top = r.pin.y + '%';
});

if (!('onpointerlockchange' in document) || /Mobi|Android/i.test(navigator.userAgent)) {
  $('#mobile-note').hidden = false;
}

goTitle();

// Debug hooks for automated testing (harmless for players).
window.__rh = { state, camera, shoot, goTitle, goReef, goGun, startDive, endDive, THREE };
