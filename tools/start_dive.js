async function startDive() {
  audio.ensure(); audio.click();
  if (state.loading) return;
  state.loading = true;
  state.screen = 'loading'; show('screen-loading');
  const fishModels = [...new Set(state.reef.fish.map(([id]) => SPECIES[id].model || id))];
  const names = [...new Set([state.gun.id, ...REEF_MODELS[state.reef.kind], ...fishModels])];
  const loaded = {};
  let done = 0;
  const bar = $('#loading-bar'), txt = $('#loading-text');
  bar.style.width = '0%'; txt.textContent = 'Fetching 3D models…';
  try {
    await Promise.all(names.map(async (n) => {
      loaded[n] = await loadGLB(n);
      done++; bar.style.width = Math.round(done / names.length * 100) + '%';
      txt.textContent = 'Loaded ' + done + ' of ' + names.length + ' models';
    }));
  } catch (e) {
    state.loading = false;
    txt.textContent = 'A model failed to load. Check your connection and try again.';
    setTimeout(goGun, 2500);
    return;
  }
  state.loading = false;
  if (state.world) { state.world.dispose(); state.fishes.dispose(); }
  state.world = buildWorld(scene, state.reef, loaded);
  state.fishes = new FishManager(scene, state.reef, state.world, loaded);
  buildGunModel(state.gun, loaded[state.gun.id]);
  state.spears.forEach((s) => scene.remove(s.mesh)); state.spears = [];
  state.reeling = [];
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
