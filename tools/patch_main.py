import io, sys
p = 'C:/Users/benny/reef-hunter/main.js'
s = open(p, encoding='utf-8').read()

# 1. imports
s = s.replace("import { buildWorld, WORLD_RADIUS } from './world.js';\nimport { FishManager } from './fish.js';",
              "import { buildWorld, WORLD_RADIUS, REEF_MODELS } from './world.js';\nimport { FishManager } from './fish.js';\nimport { loadGLB, normalise } from './assets.js';")

# 2. replace the whole gun view model section
start = s.index('// ---------- Gun view model')
end = s.index('// ---------- Input ----------')
gun_code = open('C:/Users/benny/reef-hunter/tools/gun_rig.js', encoding='utf-8').read()
s = s[:start] + gun_code + '\n' + s[end:]

# 3. shoot(): use rig instead of gunSpear
s = s.replace("  audio.shot(gun.power);\n  gunSpear.visible = false;", "  audio.shot(gun.power);\n  if (rig) { rig.snap = 0.5; rig.wish.copy(rig.relaxPos); }")
s = s.replace("  if (gunSpear) gunSpear.visible = state.reloadLeft <= 0;\n", "  updateRig(dt);\n")

# 4. gun bob uses gunModel -> rig.group
s = s.replace("""  if (gunModel) {
    gunModel.position.set(0.28 + Math.sin(state.bobT) * 0.01, -0.24 + Math.abs(Math.cos(state.bobT)) * 0.012 - state.shake * 0.02, -0.45 + state.shake * 0.12);
    gunModel.rotation.x = 0.02 + state.shake * 0.25;
  }""", """  if (rig) {
    rig.group.position.set(0.24 + Math.sin(state.bobT) * 0.008, -0.22 + Math.abs(Math.cos(state.bobT)) * 0.01 - state.shake * 0.02, -0.30 + state.shake * 0.1);
    rig.group.rotation.x = state.shake * 0.22;
  }""")

# 5. reeling: no tail mesh any more
s = s.replace("    f.mesh.rotation.z += Math.sin(f.reel * 25) * 0.15;\n    f.mesh.userData.tail.rotation.y = Math.sin(f.reel * 40) * 0.8;\n",
              "    f.mesh.rotation.z += Math.sin(f.reel * 25) * 0.15;\n")

# 6. startDive async with model loading
old_start = s[s.index('function startDive() {'):s.index('function pauseGame() {')]
new_start = open('C:/Users/benny/reef-hunter/tools/start_dive.js', encoding='utf-8').read() + '\n'
s = s.replace(old_start, new_start)

# 7. spear projectile looks: thinner, metallic
s = s.replace("const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), new THREE.MeshLambertMaterial({ color: 0xc8d0d6 }));",
              "const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xc8d0d6, metalness: 0.9, roughness: 0.3 }));")
open(p, 'w', encoding='utf-8').write(s)
print('gunModel refs left:', s.count('gunModel'), 'gunSpear refs left:', s.count('gunSpear'), 'startDive async:', 'async function startDive' in s)
