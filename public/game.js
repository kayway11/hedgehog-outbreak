import * as THREE from 'three';

let scene, camera, renderer;
let localHedgehogGroup;
let remoteHedgehogs = {};
let socket;
let audioCtx;

let myName = '';
let hudInfoEl, hudRoomEl, startBtn;

const WORLD_SIZE = 60;
const MOVE_SPEED = 7;
const SPRINT_MULT = 1.6;
const EYE_HEIGHT = 1.0;
const TURN_SPEED = 2.5;

const keys = {};
let joystickInput = { x: 0, y: 0 };
let cameraYaw = 0;
let cameraPitch = 0;

let myPos = { x: 0, y: 0, z: 0 };
let myRotY = 0;
let footstepTimer = 0;

let latestState = null;

export function initGame(socketRef) {
  socket = socketRef;
  document.getElementById('home').style.display = 'none';
  document.getElementById('game').style.display = 'block';

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}

  // ---- Scene ----
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 25, 65);

  // ---- Camera ----
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  // ---- Renderer ----
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);

  // ---- Lighting ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x3d5c3d, 0.7);
  scene.add(hemi);

  // ---- Ground ----
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 60, 60);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
      pos.setZ(i, Math.sin(x * 0.4) * 0.15 + Math.cos(y * 0.5) * 0.15 + (Math.random() - 0.5) * 0.1);
    }
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x5aa85a,
    roughness: 0.95,
    flatShading: true,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Flowers (tiny colored dots scattered) ----
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.9;
    if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
    addFlower(x, z);
  }

  // ---- Trees ----
  const treePositions = [
    [-15, -15], [15, -15], [-20, 5], [20, 5],
    [-10, 20], [10, 20], [0, -20], [-22, -8],
    [22, -8], [-5, -22], [5, -22], [0, 22],
    [-18, 18], [18, 18], [-25, -20], [25, -20],
    [-25, 25], [25, 25], [-8, -25], [8, -25],
  ];
  treePositions.forEach(([x, z]) => addTree(x, z));

  // ---- Rocks ----
  const rockPositions = [
    [-5, -5], [5, -5], [-8, 8], [8, 8],
    [-14, 0], [14, 0], [0, 14], [0, -14],
    [-3, 10], [3, -10],
  ];
  rockPositions.forEach(([x, z]) => addRock(x, z));

  // ---- Bushes ----
  for (let i = 0; i < 25; i++) {
    const x = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    const z = (Math.random() - 0.5) * WORLD_SIZE * 0.85;
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
    addBush(x, z);
  }

  // ---- Walls ----
  addWall(0, 2, -WORLD_SIZE / 2, WORLD_SIZE, 4, 1);
  addWall(0, 2, WORLD_SIZE / 2, WORLD_SIZE, 4, 1);
  addWall(-WORLD_SIZE / 2, 2, 0, 1, 4, WORLD_SIZE);
  addWall(WORLD_SIZE / 2, 2, 0, 1, 4, WORLD_SIZE);

  // ---- Local hedgehog ----
  localHedgehogGroup = createHedgehogMesh(0xff4d6d);
  scene.add(localHedgehogGroup);

  // ---- HUD ----
  createHUD();
  createJoystick();
  createLookPad();

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
  window.addEventListener('resize', onResize);

  socket.on('world', (s) => {
    latestState = s;
    updateRemoteHedgehogs(s);
    updateHostButton(s);
  });

  socket.on('state', (s) => {
    latestState = s;
    updateHostButton(s);
  });

  startAmbient();
  animate();
}

// ------------------ DECORATIONS ------------------

function addFlower(x, z) {
  const colors = [0xff6b9d, 0xffe066, 0xffffff, 0xc084fc, 0xff8b3d];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const geo = new THREE.SphereGeometry(0.08, 5, 4);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
  const flower = new THREE.Mesh(geo, mat);
  flower.position.set(x, 0.15, z);
  scene.add(flower);
}

function addTree(x, z) {
  const group = new THREE.Group();

  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  group.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f8a2f, roughness: 0.85, flatShading: true });
  const sizes = [2.4, 1.8, 1.2];
  sizes.forEach((size, i) => {
    const leafGeo = new THREE.ConeGeometry(size, 2.4, 8);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 3.4 + i * 1.5;
    leaf.castShadow = true;
    group.add(leaf);
  });

  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);
}

function addRock(x, z) {
  const geo = new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a98, roughness: 1, flatShading: true });
  const rock = new THREE.Mesh(geo, mat);
  rock.position.set(x, 0.4, z);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

function addBush(x, z) {
  const geo = new THREE.SphereGeometry(0.5 + Math.random() * 0.35, 7, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f9a3f, roughness: 0.95, flatShading: true });
  const bush = new THREE.Mesh(geo, mat);
  bush.position.set(x, 0.35, z);
  bush.castShadow = true;
  scene.add(bush);
}

function addWall(x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createHedgehogMesh(color) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.5, 18, 14);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const spikeGeo = new THREE.ConeGeometry(0.13, 0.45, 5);
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    const angle = (i / 12) * Math.PI * 2;
    const r = 0.42;
    spike.position.set(Math.cos(angle) * r, 0.9 + Math.sin(i) * 0.05, Math.sin(angle) * r);
    spike.rotation.z = -Math.cos(angle) * 0.6;
    spike.rotation.x = Math.sin(angle) * 0.6;
    spike.castShadow = true;
    group.add(spike);
  }

  const noseGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.5, 0.52);
  group.add(nose);

  return group;
}

function updateRemoteHedgehogs(state) {
  const seen = new Set();

  state.players.forEach((p) => {
    if (p.isYou) return;
    seen.add(p.id);

    if (!remoteHedgehogs[p.id]) {
      const g = createHedgehogMesh(0x6d9cff);
      scene.add(g);
      remoteHedgehogs[p.id] = { group: g, target: { x: p.x, y: p.y, z: p.z, rotY: p.rotY } };
    }
    remoteHedgehogs[p.id].target = { x: p.x, y: p.y, z: p.z, rotY: p.rotY };
  });

  Object.keys(remoteHedgehogs).forEach((id) => {
    if (!seen.has(id)) {
      scene.remove(remoteHedgehogs[id].group);
      delete remoteHedgehogs[id];
    }
  });
}

// ------------------ HUD ------------------

function createHUD() {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="hud-room" id="hudRoom">Room: —</div>
    <div class="hud-top" id="hudInfo">Turn: drag right side · Move: joystick or WASD</div>
    <button class="fs-btn" id="fsBtn">⛶</button>
    <div class="crosshair"></div>
  `;
  document.body.appendChild(hud);

  hudRoomEl = document.getElementById('hudRoom');
  hudInfoEl = document.getElementById('hudInfo');

  document.getElementById('fsBtn').onclick = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el).catch?.(() => {});
    } else {
      document.exitFullscreen?.();
    }
  };
}

function updateHostButton(state) {
  if (!state) return;
  const me = state.players.find((p) => p.isYou);
  const isHost = me && me.id === state.hostId;

  if (hudRoomEl) hudRoomEl.textContent = 'Room: ' + state.code;

  if (isHost && state.phase === 'lobby') {
    if (!startBtn) {
      startBtn = document.createElement('button');
      startBtn.className = 'start-btn';
      startBtn.textContent = '▶ Start Game';
      startBtn.onclick = () => {
        socket.emit('start_game', { code: state.code }, (res) => {
          if (!res?.ok) alert(res?.error || 'Cannot start');
        });
      };
      document.body.appendChild(startBtn);
    }
  } else {
    if (startBtn) {
      startBtn.remove();
      startBtn = null;
    }
  }
}

// ------------------ JOYSTICK ------------------

function createJoystick() {
  const base = document.createElement('div');
  base.className = 'joystick-base';
  const stick = document.createElement('div');
  stick.className = 'joystick-stick';
  base.appendChild(stick);
  document.body.appendChild(base);

  let active = false;
  let centerX = 0;
  let centerY = 0;
  const maxDist = 40;

  const start = (e) => {
    active = true;
    const rect = base.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    move(e);
  };
  const move = (e) => {
    if (!active) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
    const angle = Math.atan2(dy, dx);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * dist;
    stick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    joystickInput.x = sx / maxDist;
    joystickInput.y = -sy / maxDist;
  };
  const end = () => {
    active = false;
    stick.style.transform = 'translate(-50%, -50%)';
    joystickInput.x = 0;
    joystickInput.y = 0;
  };

  base.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
  base.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  base.addEventListener('touchend', end);
  base.addEventListener('touchcancel', end);
  base.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
}

// ------------------ LOOK PAD ------------------

function createLookPad() {
  const pad = document.createElement('div');
  pad.className = 'look-pad';
  document.body.appendChild(pad);

  let lastX = null;
  let lastY = null;

  const start = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    lastX = touch.clientX;
    lastY = touch.clientY;
  };
  const move = (e) => {
    if (lastX === null) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    cameraYaw -= dx * 0.005;
    cameraPitch -= dy * 0.004;
    cameraPitch = Math.max(-1.2, Math.min(1.2, cameraPitch));
  };
  const end = () => { lastX = null; lastY = null; };

  pad.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
  pad.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  pad.addEventListener('touchend', end);
  pad.addEventListener('touchcancel', end);
  pad.addEventListener('mousedown', start);
  window.addEventListener('mousemove', (e) => { if (lastX !== null) move(e); });
  window.addEventListener('mouseup', end);

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement) {
      cameraYaw -= e.movementX * 0.002;
      cameraPitch -= e.movementY * 0.002;
      cameraPitch = Math.max(-1.2, Math.min(1.2, cameraPitch));
    }
  });
  renderer.domElement.addEventListener('click', () => {
    if (window.matchMedia('(pointer: fine)').matches) {
      renderer.domElement.requestPointerLock?.();
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ------------------ AUDIO ------------------

function playFootstep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 80 + Math.random() * 40;
  gain.gain.value = 0.03;
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

function startAmbient() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 55;
  gain.gain.value = 0.012;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
}

// ------------------ LOOP ------------------

let lastSend = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = 0.016;

  // --- MOVEMENT (independent of look) ---
  let moveX = 0;
  let moveZ = 0;

  moveX += joystickInput.x;
  moveZ += joystickInput.y;

  if (keys['w'] || keys['arrowup']) moveZ += 1;
  if (keys['s'] || keys['arrowdown']) moveZ -= 1;
  if (keys['a'] || keys['arrowleft']) moveX -= 1;
  if (keys['d'] || keys['arrowright']) moveX += 1;

  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  let moving = false;

  if (len > 0.01) {
    moveX /= len;
    moveZ /= len;

    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    const worldX = fwdX * moveZ + rightX * moveX;
    const worldZ = fwdZ * moveZ + rightZ * moveX;

    const speed = MOVE_SPEED * (keys['shift'] ? SPRINT_MULT : 1);
    myPos.x += worldX * speed * dt;
    myPos.z += worldZ * speed * dt;

    myRotY = Math.atan2(worldX, worldZ);
    moving = true;
  }

  // clamp
  const half = WORLD_SIZE / 2 - 1;
  myPos.x = Math.max(-half, Math.min(half, myPos.x));
  myPos.z = Math.max(-half, Math.min(half, myPos.z));

  localHedgehogGroup.position.set(myPos.x, 0, myPos.z);
  localHedgehogGroup.rotation.y = myRotY;
  localHedgehogGroup.visible = false;

  // camera at eye height, looking where we point
  camera.position.set(myPos.x, EYE_HEIGHT, myPos.z);
  const dirX = -Math.sin(cameraYaw) * Math.cos(cameraPitch);
  const dirY = Math.sin(cameraPitch);
  const dirZ = -Math.cos(cameraYaw) * Math.cos(cameraPitch);
  camera.lookAt(myPos.x + dirX, EYE_HEIGHT + dirY, myPos.z + dirZ);

  // footsteps
  if (moving) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      playFootstep();
      footstepTimer = keys['shift'] ? 0.28 : 0.42;
    }
  } else {
    footstepTimer = 0;
  }

  // interpolate remote
  Object.values(remoteHedgehogs).forEach((r) => {
    const g = r.group;
    const t = r.target;
    g.position.x += (t.x - g.position.x) * 0.25;
    g.position.z += (t.z - g.position.z) * 0.25;
    g.rotation.y += (t.rotY - g.rotation.y) * 0.25;
  });

  const now = performance.now();
  if (now - lastSend > 50) {
    lastSend = now;
    socket.emit('move', { x: myPos.x, y: myPos.y, z: myPos.z, rotY: myRotY });
  }

  renderer.render(scene, camera);
}