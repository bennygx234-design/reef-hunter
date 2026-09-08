// Game data: guns, reefs, fish species.

export const GUNS = [
  {
    id: 'wood', name: 'WOODEN SPEARGUN', power: 40, range: 12, speed: 26, reload: 0.8, maxKg: 12,
    reloadLabel: 'FAST', accent: '#e0a24a',
    blurb: 'Light and quick. Lands reef fish up to 12 kg.',
  },
  {
    id: 'carbon', name: 'CARBON SPEARGUN', power: 70, range: 18, speed: 36, reload: 1.4, maxKg: 30,
    reloadLabel: 'MEDIUM', accent: '#39e5ff',
    blurb: 'Balanced. Holds fish up to 30 kg.',
  },
  {
    id: 'pneu', name: 'PNEUMATIC CANNON', power: 95, range: 26, speed: 50, reload: 2.2, maxKg: 120,
    reloadLabel: 'SLOW', accent: '#6a7dff',
    blurb: 'Deep-water monster gun. Nothing tears off.',
  },
];

export const REEFS = [
  {
    id: 'cove', name: 'CORAL COVE', difficulty: 'Easy', depthLabel: '5-10 m', floorDepth: 9,
    kind: 'coral', fog: 0x1d8fb3, fogDensity: 0.030, sand: 0xd8c79c, sun: 1.35, diveTime: 150,
    fish: [['snapper', 22, true], ['angel', 12, true], ['parrot', 8, false], ['redgrouper', 6, false]],
    pin: { x: 22, y: 56 },
  },
  {
    id: 'kelp', name: 'KELP FOREST', difficulty: 'Medium', depthLabel: '10-15 m', floorDepth: 14,
    kind: 'kelp', fog: 0x0f5c4c, fogDensity: 0.036, sand: 0x8a8f6e, sun: 0.95, diveTime: 150,
    fish: [['sheepshead', 14, true], ['seabass', 9, false], ['kingfish', 7, false], ['halibut', 3, false]],
    pin: { x: 62, y: 24 },
  },
  {
    id: 'wreck', name: 'THE WRECK', difficulty: 'Hard', depthLabel: '25-30 m', floorDepth: 28,
    kind: 'wreck', fog: 0x072644, fogDensity: 0.032, sand: 0x5b6470, sun: 0.7, diveTime: 150,
    fish: [['jack', 16, true], ['amberjack', 8, true], ['giantgrouper', 3, false], ['tuna', 4, false], ['shark', 2, false]],
    pin: { x: 79, y: 74 },
  },
];

// kg: [min, max]. ptsPerKg: points per kilogram. speed in m/s. school: swims in groups.
export const SPECIES = {
  snapper:      { name: 'YELLOW SNAPPER',  kg: [0.6, 2.5],  ptsPerKg: 90,  color: 0xf2d24a, stripe: 0x3b6fd6, speed: 2.2, school: true },
  angel:        { name: 'ANGELFISH',       kg: [0.4, 1.2],  ptsPerKg: 140, color: 0x2b4cc9, stripe: 0xf5e663, speed: 1.8, school: true, tall: true },
  parrot:       { name: 'PARROTFISH',      kg: [2, 6],      ptsPerKg: 75,  color: 0x3fd0bf, stripe: 0xd95fa0, speed: 1.5 },
  redgrouper:   { name: 'RED GROUPER',     kg: [5, 20],     ptsPerKg: 50,  color: 0xc9463d, stripe: 0xe8a090, speed: 1.1, fat: true },
  sheepshead:   { name: 'SHEEPSHEAD',      kg: [1, 4],      ptsPerKg: 80,  color: 0xd8d8d8, stripe: 0x222222, speed: 1.5, school: true, tall: true },
  seabass:      { name: 'SEA BASS',        kg: [2, 8],      ptsPerKg: 65,  color: 0x5a6b5a, stripe: 0x8a9a7a, speed: 1.6 },
  kingfish:     { name: 'KINGFISH',        kg: [4, 15],     ptsPerKg: 65,  color: 0xc4ccd6, stripe: 0xe0c040, speed: 3.0 },
  halibut:      { name: 'HALIBUT',         kg: [8, 25],     ptsPerKg: 55,  color: 0x7a6a4a, stripe: 0x9a8a6a, speed: 0.9, flat: true },
  jack:         { name: 'HORSE-EYE JACK',  kg: [2, 6],      ptsPerKg: 70,  color: 0xb7bec4, stripe: 0x6a7278, speed: 2.6, school: true },
  amberjack:    { name: 'AMBERJACK',       kg: [8, 25],     ptsPerKg: 55,  color: 0x9aa4a8, stripe: 0xd9a730, speed: 2.8, school: true },
  giantgrouper: { name: 'GIANT GROUPER',   kg: [20, 60],    ptsPerKg: 45,  color: 0x5a5a4a, stripe: 0x3a3a2a, speed: 0.9, fat: true },
  tuna:         { name: 'BLUEFIN TUNA',    kg: [30, 90],    ptsPerKg: 40,  color: 0x2a3c6a, stripe: 0xb8c4d8, speed: 4.0 },
  shark:        { name: 'REEF SHARK',      kg: [40, 80],    ptsPerKg: 0,   color: 0x6d7b85, stripe: 0xe0e6ea, speed: 2.4, protected: true, penalty: 500 },
};

export function kgToLength(kg) {
  // Rough real-world fish size: 1 kg is about 45 cm, 60 kg about 1.75 m.
  return 0.45 * Math.cbrt(kg);
}
