import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// ---------- config ----------
const GAME_TIME = 60;
const TARGET = 3000;
const UFO_H = 7.5;
const BOUNDS = { x: 15, zMin: -50, zMax: 32 };
const TYPES = {
  cow:   { value: 10, lift: 3.0, count: 7 },
  sheep: { value: 15, lift: 3.4, count: 8 },
  goose: { value: 12, lift: 3.8, count: 8 },
  pig:   { value: 20, lift: 3.2, count: 6 },
  car:   { value: 40, lift: 2.4, count: 5 },
  van:   { value: 60, lift: 1.8, count: 2 },
  crow:  { value: 20, lift: 5.0, count: 0 }, // flying; snatched straight out of the air
  ghost: { value: 35, lift: 4.5, count: 0 }, // hidden: only shows up when the UFO hovers close
  // fixed props: everything on the map can be taken; heavy things eat a lot of beam
  rock:      { value: 5, lift: 2.2, count: 0 },
  fence:     { value: 5, lift: 3.6, count: 0 },
  mailbox:   { value: 5, lift: 3.6, count: 0 },
  pumpkin:   { value: 8, lift: 3.6, count: 0 },
  tree:      { value: 10, lift: 2.0, count: 0 },
  tree_round: { value: 12, lift: 2.2, count: 0 },
  jack:      { value: 12, lift: 3.4, count: 0 },
  tombstone: { value: 15, lift: 2.6, count: 0 },
  tombcross: { value: 15, lift: 2.6, count: 0 },
  deadtree:  { value: 15, lift: 2.2, count: 0 },
  scarecrow: { value: 20, lift: 3.0, count: 0 },
  pole:      { value: 20, lift: 1.8, count: 0 },
  windmill:  { value: 30, lift: 1.6, count: 0 },
  hay:     { value: 15, lift: 3.2, count: 0 },
  lamp:    { value: 25, lift: 2.6, count: 0 },
  tractor: { value: 50, lift: 1.7, count: 0 },
  house:   { value: 100, lift: 1.3, count: 0, grab: 3.2 },
  silo:    { value: 80, lift: 1.0, count: 0, grab: 2.8 },
  barn:    { value: 150, lift: 0.8, count: 0, grab: 3.6 },
};
const FOG = new THREE.Color('#3b2d5a');
const roadX = (z) => Math.sin(z * 0.055) * 7 + Math.sin(z * 0.021 + 1) * 4;
const roadDX = (z) => Math.cos(z * 0.055) * 0.385 + Math.cos(z * 0.021 + 1) * 0.084;
// farmsteads and crop fields alternate along the road
const FARMS = [[-42, -1], [-16, 1], [8, -1], [30, 1]].map(([z, side]) => ({ z, side, x: roadX(z) + side * 13 }));
const FIELDS = [[-30, 1], [-4, -1], [20, 1], [-54, 1], [44, -1]].map(([z, side]) => ({ z, side, x: roadX(z) + side * 11, w: 9, d: 8 }));

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.015);
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 300);

scene.add(new THREE.HemisphereLight('#8c86e0', '#4a2848', 1.2));
const moon = new THREE.DirectionalLight('#b9b2ff', 1.3);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.bias = -0.0005;
Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
scene.add(moon, moon.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// soft defocus that only fades in while the UFO hovers still
const bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0, maxblur: 0.006 });
composer.addPass(bokeh);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.5, 0.8));
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// debug: render one clean landscape frame of the current scene and return it as a PNG data URL
window.__shot = (w = 1920, h = 1080) => {
  renderer.setPixelRatio(1); composer.setPixelRatio(1);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const u = ufo.position;
  camera.position.set(u.x, 13, u.z + 19); camera.lookAt(u.x, 5, u.z);
  bokeh.uniforms.focus.value = camera.position.distanceTo(new THREE.Vector3(u.x, 3, u.z));
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); composer.setPixelRatio(Math.min(devicePixelRatio, 2));
  resize();
  return url;
};

// ---------- ground & road ----------
const groundGeo = new THREE.PlaneGeometry(170, 200, 85, 100);
groundGeo.rotateX(-Math.PI / 2);
{
  const p = groundGeo.attributes.position, cols = [];
  const a = new THREE.Color('#6e3352'), b = new THREE.Color('#4e3a68'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - 10;
    if (Math.abs(x - roadX(z)) > 3.5) p.setY(i, Math.random() * 0.15);
    c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.11 + Math.cos(z * 0.09) * 2) * Math.random());
    cols.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
ground.position.z = -10; ground.receiveShadow = true;
scene.add(ground);

function ribbon(width, y, material) {
  const pos = [], idx = [];
  for (let z = -110, i = 0; z <= 90; z += 1, i++) {
    const x = roadX(z);
    pos.push(x - width / 2, y, z, x + width / 2, y, z);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true; scene.add(m);
}
ribbon(5, 0.03, new THREE.MeshStandardMaterial({ color: '#5f5677', roughness: 0.95 }));
ribbon(0.08, 0.05, new THREE.MeshBasicMaterial({ color: '#a59cc4' }));

// soft warm light pools (headlights, street lamps)
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,220,150,0.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const poolMat = (opacity) => new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity });
const flatPlane = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };
const carPoolGeo = flatPlane(4.5, 2.6), carPoolMat = poolMat(0.1);
const lampPoolGeo = flatPlane(4, 4), lampPoolMat = poolMat(0.18);

// ---------- beam ----------
const beamGeo = new THREE.CylinderGeometry(0.45, 2.3, UFO_H, 32, 1, true);
beamGeo.translate(0, -UFO_H / 2, 0);
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; uniform float uOn; varying vec2 vUv;
    void main(){ float bands = .8 + .2*sin(vUv.y*30. + uTime*7.);
      float a = (0.22 + 0.3*vUv.y) * bands * uOn;
      gl_FragColor = vec4(vec3(.6,1.,.88)*a, a); }`,
});
const beam = new THREE.Mesh(beamGeo, beamMat);
const beamLight = new THREE.SpotLight('#a8ffe4', 0, 20, 0.34, 0.5, 1.2);
beamLight.castShadow = true;
const underGlow = new THREE.PointLight('#9fffe0', 2.5, 12, 1.5);
underGlow.position.y = -1;

function makePoints(n, color, size, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}
const motes = makePoints(70, '#c8fff0', 0.12, 0);
const moteSeed = Array.from({ length: 70 }, () => [rand(0, 1), rand(0, Math.PI * 2), rand(0.3, 1)]);
const fireflies = makePoints(220, '#ffe08a', 0.13, 0.9);
const flySeed = Array.from({ length: 220 }, () => {
  const z = rand(-60, 45), side = Math.random() < .5 ? -1 : 1;
  return [roadX(z) + side * rand(4, 20), rand(0.4, 2.6), z, rand(0, 6.28)];
});
scene.add(fireflies);

// ---------- state ----------
const ufo = new THREE.Group(), ufoTilt = new THREE.Group(), ufoSpin = new THREE.Group();
ufo.add(ufoTilt); ufoTilt.add(ufoSpin);
const ufoVel = new THREE.Vector3();
const entities = [], pens = [], clearZones = [], statics = [], staticEnts = [], rotors = [], wires = [], swayFields = [], bats = [], crows = [];
const ONE = new THREE.Vector3(1, 1, 1);
const GRAVE = { x: roadX(-20) - 10, z: -20 }; // away from the UFO's start so it's a discovery
const game = { state: 'ready', score: 0, time: GAME_TIME, energy: 100, beamLock: false, counts: {}, history: [], best: +lsGet('ufoBest') || 0 };
const input = { tx: 0, ty: 0, beam: false, spin: 0, connected: false };
const keys = {};
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ---------- load models ----------
const proto = {};
const NAMES = ['ufo', 'cow', 'sheep', 'goose', 'pig', 'pole', 'windmill', 'windmill_rotor', 'mailbox', 'tractor', 'pumpkin', 'jack', 'car_red', 'car_blue', 'van', 'tree', 'tree_round', 'rock', 'house', 'barn', 'silo', 'hay', 'fence', 'lamp', 'scarecrow', 'tombstone', 'tombcross', 'deadtree', 'ghost'];
new GLTFLoader().load('assets/models.glb', (gltf) => {
  for (const name of NAMES) {
    const o = gltf.scene.getObjectByName(name);
    o.position.set(0, 0, 0);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      const mt = m.material;
      if (mt.emissive && mt.emissive.getHex()) {
        m.castShadow = false;
        const dim = { headlight: 0.15, taillight: 0.25, house_win: 0.6, loft_win: 0.7, lamp_bulb: 0.9, jack_glow: 0.55, ufo_under: 0.15, ufo_emit: 0.35, ufo_lamp_a: 1.4, ufo_lamp_b: 1.4, ufo_glass: 0.35, ghost_sheet: 0.45, bulb_orange: 1.4, bulb_purple: 1.4 }[mt.name];
        mt.emissiveIntensity = dim ?? Math.min(mt.emissiveIntensity, 2);
      }
      if (mt.name === 'ufo_glass') { mt.transparent = true; mt.opacity = 0.45; mt.depthWrite = false; m.castShadow = false; }
    });
    proto[name] = o;
  }
  buildWorld();
  window.__dbg = { ufo, entities, game };
  requestAnimationFrame(loop);
});

function place(name, x, z, ry = 0, s = 1) {
  const o = proto[name].clone();
  o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s);
  scene.add(o); return o;
}

function buildPen(cx, cz, nx, nz) {
  const hx = nx, hz = nz; // half sizes in metres (segments are 2 m)
  for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) {
    if (sz === 1 && i === Math.floor(nx / 2)) continue; // gate
    statics.push(['fence', cx - hx + 1 + i * 2, cz + sz * hz, 0]);
  }
  for (let i = 0; i < nz; i++) for (const sx of [-1, 1]) statics.push(['fence', cx + sx * hx, cz - hz + 1 + i * 2, Math.PI / 2]);
  pens.push({ cx, cz, hx: hx - 0.6, hz: hz - 0.6 });
}

function buildWorld() {
  const model = proto.ufo.clone();
  model.scale.setScalar(1.15);
  ufoSpin.add(model);
  joystick = model.getObjectByName('joystick');
  ufo.add(beam, beamLight, beamLight.target, underGlow, motes);
  beamLight.position.set(0, -0.3, 0); beamLight.target.position.set(0, -UFO_H, 0);
  ufo.position.set(roadX(0), UFO_H, 0);
  scene.add(ufo);

  // farmsteads: barn + silo + house + pen + hay + warm porch light
  for (const f of FARMS) {
    const s = f.side, face = s > 0 ? Math.PI : 0;
    statics.push(['barn', f.x, f.z, face]);
    statics.push(['silo', f.x + s * 1.2, f.z - 3.4, 0]);
    statics.push(['house', f.x + s * 0.5, f.z + 5, face]);
    buildPen(f.x - s * 5.5, f.z - 1.5, 3, 2);
    for (let i = 0; i < 4; i++) statics.push(['hay', f.x + s * rand(2.5, 4.5), f.z + rand(1.5, 3.5), rand(0, 6)]);
    statics.push(['tractor', f.x + s * 3.5, f.z - 2.5, rand(0, 6)]);
    statics.push(['mailbox', roadX(f.z + 3) + s * 3.3, f.z + 3, s > 0 ? Math.PI : 0]);
    statics.push(['windmill', f.x - s * 2, f.z - 7, -Math.PI / 2]);
    const porch = new THREE.PointLight('#ffb070', 10, 10, 1.6);
    porch.position.set(f.x - s * 1.2, 2, f.z + 5); scene.add(porch);
    clearZones.push({ x: f.x - s * 2, z: f.z, r: 10 });
  }
  // crop fields: furrowed patch + instanced plants
  const cropGeo = new THREE.ConeGeometry(0.06, 0.75, 4); cropGeo.translate(0, 0.375, 0);
  const crops = new THREE.InstancedMesh(cropGeo, new THREE.MeshStandardMaterial({ color: '#c8ad6a', flatShading: true }), 4000);
  const cropBase = [];
  const furrowMat = new THREE.MeshStandardMaterial({ color: '#4a2a3c', roughness: 1 });
  const mtx = new THREE.Matrix4(); let n = 0;
  for (const f of FIELDS) {
    const patch = new THREE.Mesh(flatPlane(f.w, f.d), furrowMat);
    patch.position.set(f.x, 0.18, f.z); patch.receiveShadow = true; scene.add(patch);
    for (let x = -f.w / 2 + 0.3; x < f.w / 2; x += 0.5) {
      for (let z = -f.d / 2 + 0.25; z < f.d / 2; z += 0.32) {
        if (n >= 4000) break;
        cropBase.push({ x: f.x + x + rand(-0.1, 0.1), y: 0.18, z: f.z + z + rand(-0.08, 0.08), s: rand(0.7, 1.15), ry: rand(0, 6) });
        n++;
      }
    }
    statics.push(['scarecrow', f.x + rand(-2, 2), f.z + rand(-1.5, 1.5), rand(0, 6)]);
    clearZones.push({ x: f.x, z: f.z, r: 6.5 });
  }
  crops.count = n; crops.castShadow = crops.receiveShadow = true; scene.add(crops);
  swayFields.push({ mesh: crops, base: cropBase, reach: 6 });

  // street lamps
  for (let z = -100, k = 0; z < 70; z += 16, k++) {
    const side = k % 2 ? 1 : -1;
    statics.push(['lamp', roadX(z) + side * 3.1, z, side > 0 ? Math.PI : 0]);
  }
  // utility poles + sagging wires along the east shoulder
  const wireMat = new THREE.LineBasicMaterial({ color: '#1e1830', transparent: true, opacity: 0.8 });
  let prev = null, prevIdx = -1;
  for (let z = -104; z < 72; z += 11) {
    const x = roadX(z) + 4.6, ry = Math.atan2(-1, roadDX(z)) + Math.PI / 2;
    const pi = statics.push(['pole', x, z, ry]) - 1;
    const tops = [-0.8, 0, 0.8].map((o) => new THREE.Vector3(x + Math.cos(ry) * o, 6.3, z - Math.sin(ry) * o));
    if (prev) tops.forEach((b, i) => {
      const a = prev[i], pts = [];
      for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3().lerpVectors(a, b, u).setY(6.3 - Math.sin(u * Math.PI) * 0.6)); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat);
      scene.add(line); wires.push({ line, a: prevIdx, b: pi });
    });
    prev = tops; prevIdx = pi;
  }
  // roadside homesteads, pumpkin patches
  for (const [z, side] of [[-58, -1], [-28, -1], [19, 1], [42, -1]]) {
    statics.push(['house', roadX(z) + side * 8.5, z, side > 0 ? Math.PI : 0]);
    statics.push(['mailbox', roadX(z + 2) + side * 3.3, z + 2, side > 0 ? Math.PI : 0]);
    for (let i = 0; i < 3; i++) statics.push(['tree_round', roadX(z) + side * rand(11, 13), z + rand(-3, 3), rand(0, 6), rand(0.9, 1.3)]);
    for (let i = 0; i < 2; i++) statics.push(['jack', roadX(z) + side * rand(5, 6.5), z + rand(-1.5, 1.5), side > 0 ? Math.PI : 0]);
    clearZones.push({ x: roadX(z) + side * 8.5, z, r: 3.5 });
  }
  for (const [z, side] of [[-6, 1], [26, -1], [-36, 1]]) {
    const cx = roadX(z) + side * 6.5;
    for (let i = 0; i < 9; i++) statics.push([i % 3 ? 'pumpkin' : 'jack', cx + rand(-2, 2), z + rand(-2, 2), rand(0, 6)]);
    clearZones.push({ x: cx, z, r: 3 });
  }
  // grass tufts so the valley floor never looks bare
  const tuftGeo = new THREE.ConeGeometry(0.08, 0.5, 3); tuftGeo.translate(0, 0.25, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: '#6b6a8a', flatShading: true }), 2400);
  const tuftBase = [];
  for (let i = 0; i < 2400; i++) {
    const z = rand(-80, 60), x = roadX(z) + (Math.random() < .5 ? -1 : 1) * rand(3.2, 24), sc = rand(0.6, 1.4);
    tuftBase.push({ x, y: 0.05, z, s: sc, ry: rand(0, 6) });
  }
  tufts.receiveShadow = true; scene.add(tufts);
  swayFields.push({ mesh: tufts, base: tuftBase, reach: 5 });

  // graveyard: tombstones, dead trees, eerie green glow; ghosts haunt it
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    statics.push([(i + j) % 3 ? 'tombstone' : 'tombcross', GRAVE.x - 2.4 + i * 1.6 + rand(-0.2, 0.2), GRAVE.z - 1.6 + j * 1.6 + rand(-0.2, 0.2), rand(-0.25, 0.25)]);
  }
  statics.push(['deadtree', GRAVE.x + 3.6, GRAVE.z - 2.2, rand(0, 6), 1.1], ['deadtree', GRAVE.x - 3.4, GRAVE.z + 2.4, rand(0, 6), 0.9]);
  for (let i = 0; i < 4; i++) statics.push(['jack', GRAVE.x + rand(-3.5, 3.5), GRAVE.z + rand(-3, 3), rand(0, 6)]);
  [[-1.6, -0.8], [0.8, 0.9], [2.4, -1.2], [-2.6, 1.6], [0.2, -2.4]].forEach(([gx, gz]) => statics.push(['ghost', GRAVE.x + gx, GRAVE.z + gz, Math.PI + rand(-0.5, 0.5)]));
  const graveGlow = new THREE.PointLight('#7dffb0', 9, 10, 1.6); graveGlow.position.set(GRAVE.x, 1.5, GRAVE.z); scene.add(graveGlow);
  clearZones.push({ x: GRAVE.x, z: GRAVE.z, r: 5.5 });
  // crows looping over the graveyard and farms (abductable mid-flight)
  const batMat = new THREE.MeshStandardMaterial({ color: '#17121f', side: THREE.DoubleSide, flatShading: true });
  const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.08), new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0.45, 0.05, -0.05)]);
  wingGeo.computeVertexNormals();
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), batMat);
    const wl = new THREE.Mesh(wingGeo, batMat), wr = new THREE.Mesh(wingGeo, batMat); wr.scale.x = -1;
    g.add(body, wl, wr); scene.add(g);
    const hub = i < 6 ? GRAVE : FARMS[i % FARMS.length];
    const b = { g, wl, wr, cx: hub.x, cz: hub.z, r: rand(3, 7), y: rand(2.8, 4.8), sp: rand(0.6, 1.1) * (i % 2 ? 1 : -1), ph: rand(0, 6) };
    b.e = { type: 'crow', obj: g, crow: b, state: 'idle', vy: 0, base: ONE };
    bats.push(b); crows.push(b.e);
  }

  // forest only at the valley edges, plus a few round-tree groves in the farmland
  for (let z = -110; z < 70; z += 1.8) {
    for (let x = -80; x < 80; x += 1.8) {
      const tx = x + rand(-0.8, 0.8), tz = z + rand(-0.8, 0.8);
      const off = Math.abs(tx - roadX(tz));
      if (off < 3.8 || clearZones.some((c) => Math.hypot(c.x - tx, c.z - tz) < c.r)) continue;
      if (off > 19 + 4 * Math.sin(tz * 0.1)) {
        if (Math.random() > 0.6) continue;
        const sc = rand(0.9, 1.5), size = [sc, sc * rand(1.2, 1.8), sc];
        if (off < BOUNDS.x + 4) statics.push(['tree', tx, tz, rand(0, 6), size]);
        else place('tree', tx, tz, rand(0, 6)).scale.set(...size);
      } else if (off > 5 && Math.sin(tx * 0.33) * Math.cos(tz * 0.29) > 0.8 && Math.random() < 0.5) {
        statics.push(['tree_round', tx, tz, rand(0, 6), rand(0.8, 1.3)]);
      }
    }
  }
  for (let i = 0; i < 18; i++) {
    const z = rand(-60, 40);
    statics.push(['rock', roadX(z) + (Math.random() < .5 ? -1 : 1) * rand(4, 16), z, rand(0, 6), rand(0.5, 1.1)]);
  }
  resetEntities();
}

// ---------- entities ----------
const isCar = (t) => t === 'car' || t === 'van';
function spawn(type, i) {
  const src = type === 'car' ? (i % 2 ? proto.car_red : proto.car_blue) : proto[type];
  const obj = src.clone();
  let pool = null;
  if (isCar(type)) { pool = new THREE.Mesh(carPoolGeo, carPoolMat); pool.position.set(3.2, 0.06, 0); obj.add(pool); }
  const e = { type, obj, pool, state: 'idle', vy: 0, heading: rand(0, 6.28), speed: 0, turnT: 0, barkT: 0 };
  if (type === 'pig' || type === 'goose') e.pen = pens[i % pens.length];
  if (type === 'sheep' && i < pens.length) e.pen = pens[i];
  placeEntity(e);
  scene.add(obj); entities.push(e);
}

function spawnStatic([type, x, z, ry, sc = 1]) {
  if (type === 'pumpkin' || type === 'jack') sc = rand(0.55, 1.5);
  if (type === 'ghost') sc = rand(0.7, 1.3);
  const obj = proto[type].clone();
  if (type === 'ghost') obj.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0; m.castShadow = false; } });
  if (type === 'windmill') { const rotor = proto.windmill_rotor.clone(); rotor.position.set(0.25, 3.72, 0); obj.add(rotor); rotors.push(rotor); }
  let pool = null;
  if (type === 'lamp') { pool = new THREE.Mesh(lampPoolGeo, lampPoolMat); pool.position.set(0.85, 0.07, 0); obj.add(pool); }
  const base = Array.isArray(sc) ? new THREE.Vector3(...sc) : new THREE.Vector3(sc, sc, sc);
  const e = { type, obj, pool, base, state: 'idle', vy: 0, fixed: { x, z, ry } };
  placeEntity(e);
  scene.add(obj); entities.push(e);
  return e;
}

function nearFarm(x, z) { return FARMS.some((f) => Math.hypot(f.x - x, f.z - z) < 7); }

function placeEntity(e) {
  const o = e.obj; o.visible = true; o.rotation.set(0, 0, 0); o.scale.copy(e.base || ONE);
  e.state = 'idle'; e.vy = 0;
  if (e.crow) return;
  if (e.fixed) { o.position.set(e.fixed.x, 0, e.fixed.z); o.rotation.y = e.fixed.ry; e.reveal = 0; e.booed = false; return; }
  if (isCar(e.type)) {
    e.dir = Math.random() < .5 ? 1 : -1; e.speed = e.cruise = rand(2.6, 3.2);
    // never spawn on top of another car in the same lane
    for (let k = 0; k < 20; k++) {
      o.position.z = e.dir > 0 ? rand(-95, -5) : rand(5, 75);
      if (!entities.some((c) => c !== e && isCar(c.type) && c.dir === e.dir && Math.abs(c.obj.position.z - o.position.z) < 7)) break;
    }
    o.position.x = roadX(o.position.z) - e.dir * 1.25;
    o.position.y = 0;
    return;
  }
  e.speed = e.type === 'goose' ? 0.5 : 0.35;
  if (e.pen) { o.position.set(e.pen.cx + rand(-e.pen.hx, e.pen.hx), 0, e.pen.cz + rand(-e.pen.hz, e.pen.hz)); return; }
  for (let k = 0; k < 8; k++) {
    const z = rand(BOUNDS.zMin + 4, BOUNDS.zMax - 4);
    e.side = Math.random() < .5 ? -1 : 1;
    o.position.set(roadX(z) + e.side * rand(4.5, 15), 0, z);
    if (!nearFarm(o.position.x, z)) break;
  }
}

function resetEntities() {
  for (const e of entities) scene.remove(e.obj);
  entities.length = 0;
  for (const [t, cfg] of Object.entries(TYPES)) for (let i = 0; i < cfg.count; i++) spawn(t, i);
  rotors.length = 0;
  statics.forEach((s, i) => { staticEnts[i] = spawnStatic(s); });
  crows.forEach((c) => { placeEntity(c); scene.add(c.obj); entities.push(c); });
}

// ---------- game flow ----------
function startGame() {
  if (game.state === 'play') { calibrate(); return; } // side button mid-game re-centres the controller
  calibrate();
  resetEntities();
  Object.assign(game, { state: 'play', score: 0, time: GAME_TIME, energy: 100, beamLock: false, history: [], counts: Object.fromEntries(Object.keys(TYPES).map((t) => [t, 0])) });
  ufo.position.set(roadX(0), UFO_H, 0); ufoVel.set(0, 0, 0);
  $('overlay').style.display = 'none';
  audio.init();
}

function endGame() {
  game.state = 'over';
  if (game.score > game.best) { game.best = game.score; lsSet('ufoBest', game.best); }
  const win = game.score >= TARGET;
  const rank = game.score >= TARGET * 2 ? 'Galactic Duck Captain' : win ? 'Mission complete' : game.score >= TARGET * 0.6 ? 'So close, quack' : 'Earth wins this time';
  $('oScore').textContent = `${game.score} / ${TARGET} — ${rank}`;
  $('overlay').style.display = 'flex';
}

function abduct(e) {
  e.state = 'gone'; e.obj.visible = false;
  const now = performance.now();
  game.combo = now - (game.lastGrab || 0) < 2500 ? (game.combo || 1) + 1 : 1;
  game.lastGrab = now;
  const mult = Math.min(game.combo, 5), v = TYPES[e.type].value * mult;
  game.score += v; game.counts[e.type]++;
  const lines = QUIPS[e.type];
  popup(`+${v}${mult > 1 ? `  x${mult} COMBO` : ''}`, ufo.position);
  if (lines && Math.random() < 0.7) popup(lines[Math.floor(Math.random() * lines.length)], ufo.position.clone().setY(ufo.position.y - 2), 'quip');
  if (TYPES[e.type].value >= 80) shake = 0.6;
  audio.blip(e.type); burst(ufo.position);
  stickSend(`G${TYPES[e.type].value},${mult}`);
  setTimeout(() => placeEntity(e), e.fixed ? 7000 : 3000);
}

const QUIPS = {
  cow: ['Moo?!', 'Udderly abducted', 'Not again...'], sheep: ['Baa-bye!', 'Wool be back'], goose: ['HONK!!', 'Honk honk?'],
  pig: ['Oink to the stars', 'Bacon goes to space'], ghost: ['Boo... wait, WHAT', 'Even ghosts get abducted'],
  tombstone: ['RIP (again)', 'Rest in space'], tombcross: ['Grave robbery!'], house: ['Mortgage: paid', 'Whole family, free trip'],
  barn: ['BARN-tastic!', 'Took the whole barn'], silo: ['Corn reserves secured'], car: ['Road trip!', 'Parking? Solved.'], van: ['Family vacation!'],
  tractor: ['Space farming begins'], scarecrow: ['Not so scary now'], jack: ['Spooky snack'], pumpkin: ['Pie for later'],
  crow: ['Caw?!', 'Nevermore... on Earth'],
  pole: ['Free Wi-Fi?'], lamp: ['Lights out!'], mailbox: ['You got mail... in space'], windmill: ['Wind power!'],
};
let shake = 0, joystick = null;

// ---------- effects ----------
const sparks = [];
const sparkGeo = new THREE.OctahedronGeometry(0.12);
const sparkMat = new THREE.MeshBasicMaterial({ color: '#b5fff0' });
function burst(pos) {
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.position.copy(pos).y -= 0.4;
    sparks.push({ m, v: new THREE.Vector3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).multiplyScalar(6), life: 0.8 });
    scene.add(m);
  }
}
function popup(text, pos, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  const p = pos.clone().project(camera);
  el.style.left = (p.x * .5 + .5) * innerWidth + rand(-40, 40) + 'px';
  el.style.top = (-p.y * .5 + .5) * innerHeight + 'px';
  stage.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-180%)'; el.style.opacity = 0; });
  setTimeout(() => el.remove(), 1000);
}

// ---------- audio ----------
const audio = {
  ctx: null, hum: null, gain: null,
  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.hum = this.ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 90;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
    this.hum.connect(f).connect(this.gain).connect(this.ctx.destination); this.hum.start();
  },
  setBeam(on, t) {
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.05);
    this.hum.frequency.setTargetAtTime(on ? 90 + 20 * Math.sin(t * 6) : 60, this.ctx.currentTime, 0.05);
  },
  tone(type, f0, f1, dur, vol) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  },
  blip(type) { this.tone('triangle', { cow: 520, sheep: 620, goose: 660, pig: 700, car: 880, van: 990 }[type] || 760, 1600, 0.3, 0.15); },
  bark() { this.tone('square', 420, 220, 0.12, 0.05); },
};

// ---------- serial (StickS3) ----------
let port, writer, lines = 0, stickBeam = -1;
const stickSend = (msg) => { if (writer) writer.write(new TextEncoder().encode(msg + '\n')).catch(() => {}); };
const raw = new THREE.Vector3(0, 0, 1);
const cal = { g: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, 1, 0) };
const smooth = { x: 0, y: 0 };
// remember how the stick is held right now; tilt is measured relative to this pose
function calibrate() {
  cal.g.copy(raw).normalize();
  cal.right.set(1, 0, 0).addScaledVector(cal.g, -cal.g.x);
  if (cal.right.lengthSq() < 0.05) cal.right.set(0, 1, 0).addScaledVector(cal.g, -cal.g.y);
  cal.right.normalize();
  cal.fwd.crossVectors(cal.g, cal.right);
}

document.querySelector('.start').onclick = () => startGame();
$('connect').onclick = async () => {
  const btn = $('connect');
  if (!('serial' in navigator)) {
    // no Web Serial here (e.g. an embedded preview): say so on the button instead of a blockable alert
    btn.textContent = 'Needs Chrome — opening…';
    window.open(location.href.replace('127.0.0.1', 'localhost'), '_blank');
    setTimeout(() => { btn.textContent = 'Open localhost:8765 in Chrome'; }, 1500);
    return;
  }
  try {
    port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
    await port.open({ baudRate: 115200 });
    writer = port.writable.getWriter();
    input.connected = true;
    $('connect').style.display = 'none';
    readLoop();
    setTimeout(calibrate, 400);
  } catch (err) {
    console.warn(err);
    btn.textContent = err.name === 'NotFoundError' ? '🎃 Connect StickS3' : 'Port busy — close Arduino IDE / other tabs';
  }
};

async function readLoop() {
  const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
}

let lastBtnB = 0;
function handleLine(line) {
  const v = line.split(',').map(Number);
  if (v.length < 8 || v.some(isNaN)) return;
  lines++;
  raw.set(v[0], v[1], v[2]);
  input.spin = v[5];
  input.beam = v[6] === 1;
  if (v[7] === 1 && performance.now() - lastBtnB > 500) { lastBtnB = performance.now(); startGame(); }
}
setInterval(() => { $('dRate').textContent = input.connected ? lines * 2 + ' Hz' : '—'; lines = 0; }, 500);

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Enter') startGame();
  if (e.code === 'KeyD') $('dash').classList.toggle('show');
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const gNow = new THREE.Vector3();
function readInput(dt) {
  let x, y;
  if (input.connected) {
    gNow.copy(raw).normalize().sub(cal.g);
    let dx = gNow.dot(cal.right), dy = gNow.dot(cal.fwd);
    if ($('swap').checked) [dx, dy] = [dy, dx];
    if ($('invX').checked) dx = -dx;
    if ($('invY').checked) dy = -dy;
    const dz = (v) => Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.32;
    x = clamp(dz(-dx), -1, 1);
    y = clamp(dz(dy), -1, 1);
  } else {
    x = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    y = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
  }
  const k = 1 - Math.exp(-dt * 8);
  smooth.x += (x - smooth.x) * k; smooth.y += (y - smooth.y) * k;
  input.tx = smooth.x; input.ty = smooth.y;
  return input.beam || !!keys.Space;
}

// ---------- HUD / dashboard ----------
const spark = $('spark').getContext('2d');
function drawUI(beamOn) {
  $('hScore').textContent = game.score;
  $('prog').firstElementChild.style.width = Math.min(100, game.score / TARGET * 100) + '%';
  $('scoreCard').classList.toggle('won', game.score >= TARGET);
  $('timeCard').classList.toggle('hurry', game.state === 'play' && game.time < 10);
  $('hTime').textContent = Math.ceil(game.time);
  const bar = $('energy').firstElementChild;
  bar.style.width = game.energy + '%';
  bar.style.background = game.beamLock ? '#ff8aa0' : '';
  if (!$('dash').classList.contains('show')) return;
  $('padDot').style.left = 31 + input.tx * 30 + 'px';
  $('padDot').style.top = 31 + input.ty * 30 + 'px';
  $('dTilt').textContent = `${input.tx.toFixed(2)} / ${input.ty.toFixed(2)}`;
  $('dBeam').textContent = beamOn ? 'on' : 'off';
  $('dCounts').textContent = Object.keys(TYPES).map((t) => game.counts[t] || 0).join(' · ');
  $('dBest').textContent = game.best;
  const W = 384, H = 72; spark.clearRect(0, 0, W, H);
  const hist = game.history; if (hist.length < 2) return;
  const max = Math.max(100, ...hist);
  spark.strokeStyle = '#ff8a2a'; spark.lineWidth = 2; spark.beginPath();
  hist.forEach((s, i) => { const px = i / (GAME_TIME * 2) * W, py = H - 3 - s / max * (H - 6); i ? spark.lineTo(px, py) : spark.moveTo(px, py); });
  spark.stroke();
}

// ---------- swaying wheat / grass: plants near the UFO lean in, and get pulled hard under the beam ----------
const sm = new THREE.Matrix4(), sq = new THREE.Quaternion(), sq2 = new THREE.Quaternion(), sv = new THREE.Vector3(), ss = new THREE.Vector3(), sAxis = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function updateSway(t, beam) {
  const ux = ufo.position.x, uz = ufo.position.z;
  for (const f of swayFields) {
    let dirty = !f.init;
    f.base.forEach((b, i) => {
      const dx = ux - b.x, dz = uz - b.z, d = Math.hypot(dx, dz);
      const near = d < f.reach;
      if (!near && !b.bent && f.init) return;
      const k = near ? 1 - d / f.reach : 0;
      const lean = k * (0.25 + beam * 0.9) + beam * Math.sin(t * 9 + i) * 0.08 * k;
      b.bent = near;
      sq2.setFromAxisAngle(UP, b.ry);
      if (lean && d > 0.01) sq.setFromAxisAngle(sAxis.set(dz / d, 0, -dx / d), lean).multiply(sq2); else sq.copy(sq2);
      sm.compose(sv.set(b.x, b.y, b.z), sq, ss.set(b.s, b.s * (1 + beam * 0.35 * k), b.s));
      f.mesh.setMatrixAt(i, sm); dirty = true;
    });
    f.init = true;
    if (dirty) f.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const camPos = new THREE.Vector3(), focusPt = new THREE.Vector3();
let histT = 0, dof = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const wantBeam = readInput(dt);
  const playing = game.state === 'play';

  // energy
  // the button always drives the light; only an empty tank (mid-game) cuts it
  let beamOn = wantBeam && !(playing && game.beamLock);
  if (beamOn && playing) { game.energy -= 7 * dt; if (game.energy <= 0) { game.energy = 0; game.beamLock = true; beamOn = false; } }
  else { game.energy = Math.min(100, game.energy + 18 * dt); if (game.energy > 15) game.beamLock = false; }

  // ufo: velocity follows tilt; soft walls push it back toward the valley
  const up = ufo.position;
  const maxV = beamOn ? 3.5 : 7;
  ufoVel.x += (input.tx * maxV - ufoVel.x) * Math.min(1, dt * 2.5);
  ufoVel.z += (input.ty * maxV - ufoVel.z) * Math.min(1, dt * 2.5);
  const offX = up.x - roadX(up.z);
  if (Math.abs(offX) > BOUNDS.x - 3) ufoVel.x -= Math.sign(offX) * (Math.abs(offX) - BOUNDS.x + 3) * 6 * dt;
  if (up.z < BOUNDS.zMin + 3) ufoVel.z += (BOUNDS.zMin + 3 - up.z) * 6 * dt;
  if (up.z > BOUNDS.zMax - 3) ufoVel.z -= (up.z - BOUNDS.zMax + 3) * 6 * dt;
  up.z = clamp(up.z + ufoVel.z * dt, BOUNDS.zMin, BOUNDS.zMax);
  up.x = clamp(up.x + ufoVel.x * dt, roadX(up.z) - BOUNDS.x, roadX(up.z) + BOUNDS.x);
  up.y = UFO_H + Math.sin(t * 2) * 0.2;
  // the saucer leans exactly the way the stick is tilted
  ufoTilt.rotation.z += (-input.tx * 0.35 - ufoTilt.rotation.z) * Math.min(1, dt * 8);
  ufoTilt.rotation.x += (input.ty * 0.35 - ufoTilt.rotation.x) * Math.min(1, dt * 8);
  ufoSpin.rotation.y += dt * (0.4 + input.spin * 0.01);
  for (const r of rotors) r.rotation.x += dt * 2.2;
  if (joystick) { joystick.rotation.z = -input.tx * 0.6; joystick.rotation.x = input.ty * 0.6; }
  for (const w of wires) { const a = staticEnts[w.a], b = staticEnts[w.b]; w.line.visible = a?.state === 'idle' && b?.state === 'idle'; }
  for (const b of bats) {
    if (b.e.state !== 'idle') { b.wl.rotation.z = Math.sin(t * 30) * 0.9; b.wr.rotation.z = -b.wl.rotation.z; continue; }
    const ang = b.ph + t * b.sp;
    b.g.position.set(b.cx + Math.cos(ang) * b.r, b.y + Math.sin(t * 2 + b.ph) * 0.4, b.cz + Math.sin(ang) * b.r);
    b.g.rotation.y = -ang - (b.sp > 0 ? 0 : Math.PI);
    const flap = Math.sin(t * 18 + b.ph) * 0.7; b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
  }

  // beam
  const on = beamMat.uniforms.uOn;
  on.value += ((beamOn ? 1 : 0) - on.value) * Math.min(1, dt * 12);
  beamMat.uniforms.uTime.value = t;
  beam.visible = on.value > 0.01;
  beamLight.intensity = on.value * 55;
  underGlow.intensity = 2.5 + on.value * 6;
  motes.material.opacity = on.value * 0.9;
  {
    const mp = motes.geometry.attributes.position;
    moteSeed.forEach(([h0, a, r], i) => {
      const h = (h0 + t * 0.25) % 1, y = -UFO_H + h * UFO_H, rad = (2.2 - h * 1.7) * r;
      mp.setXYZ(i, Math.cos(a + t) * rad, y, Math.sin(a + t) * rad);
    });
    mp.needsUpdate = true;
  }
  audio.setBeam(beamOn, t);
  // mirror the real beam on the stick: 1 = beaming, 2 = tank empty while held, 0 = off
  const sb = beamOn ? 1 : wantBeam ? 2 : 0;
  if (sb !== stickBeam) { stickBeam = sb; stickSend('B' + sb); }
  updateSway(t, on.value);

  // entities
  for (const e of entities) {
    if (e.state === 'gone') continue;
    const o = e.obj, p = o.position;
    const dx = up.x - p.x, dz = up.z - p.z, dist = Math.hypot(dx, dz);
    if (e.pool) e.pool.visible = e.state === 'idle';
    if (e.type === 'ghost' && e.state === 'idle') {
      // buried under its grave; only a beam right overhead drags it up out of the ground
      const want = beamOn && dist < 2.6 ? 1 : 0;
      const prev = e.reveal || 0;
      e.reveal = prev + (want - prev) * Math.min(1, dt * (want ? 1.4 : 2.5));
      if (prev < 0.5 && e.reveal >= 0.5 && !e.booed) { e.booed = true; popup('BOO!', p.clone().setY(2), 'quip'); }
      o.traverse((m) => { if (m.isMesh) m.material.opacity = Math.min(1, e.reveal * 1.6); });
      o.visible = e.reveal > 0.02;
      p.y = -1.8 + e.reveal * 2.4 + Math.sin(t * 1.6 + e.fixed.x) * 0.15 * e.reveal;
      if (e.reveal < 0.92) continue;
    }
    const grab = TYPES[e.type].grab || 2.3;
    if (beamOn && playing && dist < grab) e.state = 'lifted';
    if (e.state === 'lifted') {
      if (!beamOn || dist > grab + 0.9) { e.state = 'falling'; continue; }
      p.y += TYPES[e.type].lift * dt * (0.6 + p.y / UFO_H);
      p.x += dx * dt * 2; p.z += dz * dt * 2;
      o.rotation.y += dt * 2.5; o.rotation.z = Math.sin(t * 4 + p.x) * 0.3;
      o.scale.copy(e.base || ONE).multiplyScalar(Math.max(0.4, 1 - 0.5 * Math.max(0, (p.y - UFO_H + 3) / 3)));
      if (p.y > up.y - 0.9) abduct(e);
      continue;
    }
    if (e.state === 'falling' && e.crow) { e.state = 'idle'; o.scale.setScalar(1); o.rotation.set(0, 0, 0); continue; }
    if (e.state === 'falling') {
      e.vy -= 20 * dt; p.y += e.vy * dt;
      if (p.y <= 0 || (e.type === 'ghost' && p.y < 0.6)) { p.y = Math.max(0, p.y); e.vy = 0; e.state = 'idle'; o.rotation.set(0, o.rotation.y, 0); o.scale.copy(e.base || ONE); }
      continue;
    }
    if (e.fixed || e.crow) continue;
    if (isCar(e.type)) {
      // keep a safe gap to the car ahead in the same lane
      let gap = Infinity, leadSpeed = e.cruise;
      for (const c of entities) {
        if (c === e || !isCar(c.type) || c.dir !== e.dir || c.state === 'gone') continue;
        const d = (c.obj.position.z - p.z) * e.dir;
        if (d > 0 && d < gap) { gap = d; leadSpeed = c.speed; }
      }
      const want = gap < 3.5 ? 0 : gap < 7 ? Math.min(e.cruise, leadSpeed) : e.cruise;
      e.speed += (want - e.speed) * Math.min(1, dt * 3);
      p.z += e.dir * e.speed * dt;
      if (p.z > 80) p.z = -100; if (p.z < -100) p.z = 80;
      p.x += (roadX(p.z) - e.dir * 1.25 - p.x) * Math.min(1, dt * 4);
      o.rotation.set(Math.sin(t * 2.5 + p.z) * 0.012, Math.atan2(-e.dir, roadDX(p.z) * e.dir), Math.sin(t * 2 + p.z) * 0.01);
      p.y = (Math.sin(t * 3 + p.z) * 0.5 + 0.5) * 0.015;
      continue;
    }
    e.turnT -= dt;
    if (e.turnT <= 0) { e.turnT = rand(2, 5); e.heading += rand(-1.5, 1.5); e.moving = Math.random() < 0.5; }
    if (!e.moving) continue;
    p.x += Math.sin(e.heading) * e.speed * dt; p.z += Math.cos(e.heading) * e.speed * dt;
    o.rotation.y = e.heading - Math.PI / 2;
    p.y = Math.abs(Math.sin(t * 6 + p.x)) * 0.04;
    if (e.pen) {
      const q = e.pen;
      if (Math.abs(p.x - q.cx) > q.hx || Math.abs(p.z - q.cz) > q.hz) {
        e.heading += Math.PI;
        p.x = clamp(p.x, q.cx - q.hx, q.cx + q.hx); p.z = clamp(p.z, q.cz - q.hz, q.cz + q.hz);
      }
    } else {
      const off = (p.x - roadX(p.z)) * e.side;
      if (off < 4.2 || off > 16 || p.z < BOUNDS.zMin || p.z > BOUNDS.zMax || nearFarm(p.x, p.z)) {
        e.heading += Math.PI;
        p.x -= Math.sin(e.heading - Math.PI) * e.speed * dt * 2; p.z -= Math.cos(e.heading - Math.PI) * e.speed * dt * 2;
        p.x = roadX(p.z) + e.side * clamp(off, 4.2, 16); p.z = clamp(p.z, BOUNDS.zMin, BOUNDS.zMax);
      }
    }
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); s.m.scale.setScalar(Math.max(0, s.life));
    if (s.life <= 0) { scene.remove(s.m); sparks.splice(i, 1); }
  }
  {
    const fp = fireflies.geometry.attributes.position;
    flySeed.forEach(([x, y, z, ph], i) => fp.setXYZ(i, x + Math.sin(t * 0.5 + ph) * 0.8, y + Math.sin(t * 1.3 + ph * 2) * 0.3, z + Math.cos(t * 0.4 + ph) * 0.8));
    fp.needsUpdate = true;
    fireflies.material.opacity = 0.6 + 0.3 * Math.sin(t * 3);
  }

  if (playing) {
    game.time -= dt;
    histT += dt; if (histT > 0.5) { histT = 0; game.history.push(game.score); }
    if (game.time <= 0) { game.time = 0; endGame(); }
  }

  // camera: low enough to see the saucer's side; focus stays on the UFO and the ground around it
  const far = camera.aspect < 1 ? 1.5 : 1;
  camPos.set(up.x, 13 * far, up.z + 19 * far);
  if (!camera.userData.init) { camera.position.copy(camPos); camera.userData.init = true; }
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 2.5));
  if (shake > 0) { shake = Math.max(0, shake - dt); camera.position.x += (Math.random() - .5) * shake * 0.6; camera.position.y += (Math.random() - .5) * shake * 0.6; }
  camera.lookAt(camera.position.x, 5, camera.position.z - 19 * far);
  moon.position.set(up.x - 20, 35, up.z - 25); moon.target.position.set(up.x, 0, up.z);
  const still = Math.hypot(ufoVel.x, ufoVel.z) < 0.8 ? 1 : 0;
  dof += (still - dof) * Math.min(1, dt * 1.2);
  focusPt.set(up.x, 3, up.z);
  bokeh.uniforms.focus.value = camera.position.distanceTo(focusPt);
  bokeh.uniforms.aperture.value = 0.0006 + 0.0006 * dof; // light defocus while flying, a bit more when hovering

  drawUI(beamOn);
  composer.render();
}
