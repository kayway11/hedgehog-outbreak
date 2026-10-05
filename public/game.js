import * as THREE from 'three';

let scene, camera, renderer;
let localHedgehogGroup;
let remoteHedgehogs = {};
let socket;

const WORLD_SIZE = 60;
const MOVE_SPEED = 8;
const TURN_SPEED = 2.5;

const keys = {};
let joystickInput = { x: 0, y: 0 };
let cameraYaw = 0;

let myPos = { x: 0, y: 0, z: 0 };
let myRotY = 0;

export function initGame(socketRef, myId) {
  socket = socketRef;
  document.getElementById('game').style.display = 'block';
  document.getElementById('app').style.display = 'none';

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f0f14);
  scene.fog = new THREE.Fog(0x0f0f14, 20, 55);

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('game').appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(20, 30, 10);
  scene.add(sun);

  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a3d1a });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(WORLD_SIZE, 30, 0x2a5d2a, 0x1e4a1e);
  scene.add(grid);

  addBox(-8, 1, -8, 4, 2, 4);
  addBox(8, 1, -8, 4, 2, 4);
  addBox(0, 1, 10, 6, 2, 2);
  addBox(-12, 1, 8, 2, 2, 6);
  addBox(12, 1, 8, 2, 2, 6);

  addBox(0, 2, -WORLD_SIZE / 2, WORLD_SIZE, 4, 1);
  addBox(0, 2, WORLD_SIZE / 2, WORLD_SIZE, 4, 1);
  addBox(-WORLD_SIZE / 2, 2, 0, 1, 4, WORLD_SIZE);
  addBox(WORLD_SIZE / 2, 2, 0, 1, 4, WORLD_SIZE);

  localHedgehogGroup = createHedgehogMesh(0xff4d6d);
  scene.add(localHedgehogGroup);

  createHUD();
  createJoystick();
  createLookPad();

  window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
  window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
  window.addEventListener('resize', onResize);

  socket.on('world', (state) => {
    updateRemoteHedgehogs(state);
  });

  animate();
}

function addBox(x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a5a });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

function createHedgehogMesh(color) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.7, 16, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  group.add(body);

  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a });
  for (let i = 0; i < 8; i++) {
    const spikeGeo = new THREE.ConeGeometry(0.15, 0.5, 6);
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    const angle = (i / 8) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.6, 1.1, Math.sin(angle) * 0.6);
    spike.rotation.z = -Math.cos(angle) * 0.5;
    spike.rotation.x = Math.sin(angle) * 0.5;
    group.add(spike);
  }

  const noseGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.7, 0.75);
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

function createHUD() {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="hud-room" id="hudRoom">Room: —</div>
    <div class="hud-top" id="hudInfo">Move with joystick or WASD</div>
    <button class="fs-btn" id="fsBtn">⛶ Fullscreen</button>
  `;
  document.body.appendChild(hud);

  const fsBtn = document.getElementById('fsBtn');
  fsBtn.onclick = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else {
        alert('Fullscreen not supported in this browser. On iPhone, try tapping aA → Request Desktop Website, or rotate your phone to landscape.');
      }
    } else {
      document.exitFullscreen?.();
    }
  };
}

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
    joystickInput.y = sy / maxDist;
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
  base.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
}

function createLookPad() {
  const pad = document.createElement('div');
  pad.className = 'look-pad';
  document.body.appendChild(pad);

  let lastX = null;
  const start = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    lastX = touch.clientX;
  };
  const move = (e) => {
    if (lastX === null) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - lastX;
    lastX = touch.clientX;
    cameraYaw -= dx * 0.005;
  };
  const end = () => (lastX = null);

  pad.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
  pad.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  pad.addEventListener('touchend', end);
  pad.addEventListener('mousedown', start);
  window.addEventListener('mousemove', (e) => { if (lastX !== null) move(e); });
  window.addEventListener('mouseup', end);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let lastSend = 0;
function animate() {
  requestAnimationFrame(animate);

  const dt = 0.016;

  let moveX = 0;
  let moveZ = 0;

  moveX += joystickInput.x;
  moveZ += joystickInput.y;

  if (keys['w'] || keys['arrowup']) moveZ -= 1;
  if (keys['s'] || keys['arrowdown']) moveZ += 1;
  if (keys['a'] || keys['arrowleft']) moveX -= 1;
  if (keys['d'] || keys['arrowright']) moveX += 1;

  if (keys['q']) cameraYaw += TURN_SPEED * dt;
  if (keys['e']) cameraYaw -= TURN_SPEED * dt;

  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;

    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const worldX = moveX * cos - moveZ * sin;
    const worldZ = moveX * sin + moveZ * cos;

    myPos.x += worldX * MOVE_SPEED * dt;
    myPos.z += worldZ * MOVE_SPEED * dt;

    myRotY = Math.atan2(worldX, worldZ);
  }

  const half = WORLD_SIZE / 2 - 1;
  myPos.x = Math.max(-half, Math.min(half, myPos.x));
  myPos.z = Math.max(-half, Math.min(half, myPos.z));

  localHedgehogGroup.position.set(myPos.x, 0, myPos.z);
  localHedgehogGroup.rotation.y = myRotY;

  const camDist = 8;
  const camHeight = 6;
  camera.position.set(
    myPos.x - Math.sin(cameraYaw) * camDist,
    camHeight,
    myPos.z - Math.cos(cameraYaw) * camDist
  );
  camera.lookAt(myPos.x, 1, myPos.z);

  Object.values(remoteHedgehogs).forEach((r) => {
    const g = r.group;
    const t = r.target;
    g.position.x += (t.x - g.position.x) * 0.2;
    g.position.z += (t.z - g.position.z) * 0.2;
    g.rotation.y += (t.rotY - g.rotation.y) * 0.2;
  });

  const now = performance.now();
  if (now - lastSend > 50) {
    lastSend = now;
    socket.emit('move', { x: myPos.x, y: myPos.y, z: myPos.z, rotY: myRotY });
  }

  renderer.render(scene, camera);
}