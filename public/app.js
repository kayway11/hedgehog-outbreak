const socket = io();

let state = null;
let myName = '';
let roomList = [];
let inGame = false;
let countdownInterval = null;

// ---------- DOM ----------
const homeEl = document.getElementById('home');
const gameEl = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const howToModal = document.getElementById('howToModal');
const publicModal = document.getElementById('publicModal');
const codeModal = document.getElementById('codeModal');
const createModal = document.getElementById('createModal');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNum = document.getElementById('countdownNum');

// ---------- MODALS ----------
function openModal(m) { m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); }
function closeAllModals() {
  [howToModal, publicModal, codeModal, createModal].forEach(closeModal);
}

document.getElementById('howToBtn').onclick = () => openModal(howToModal);
document.getElementById('howToClose').onclick = () => closeModal(howToModal);
document.getElementById('publicClose').onclick = () => closeModal(publicModal);
document.getElementById('codeClose').onclick = () => closeModal(codeModal);
document.getElementById('createClose').onclick = () => closeModal(createModal);

// Name is saved and restored
nameInput.oninput = () => {
  myName = nameInput.value;
  try { localStorage.setItem('hedgehog_name', myName); } catch (e) {}
};
try {
  const saved = localStorage.getItem('hedgehog_name');
  if (saved) { myName = saved; nameInput.value = saved; }
} catch (e) {}

// ---------- CREATE FLOW ----------
let createIsPublic = false;

document.getElementById('createBtn').onclick = () => {
  if (!myName.trim()) return alert('Enter a name first');
  openModal(createModal);
};

document.getElementById('privBtn').onclick = () => {
  createIsPublic = false;
  document.getElementById('privBtn').classList.add('active');
  document.getElementById('pubBtn').classList.remove('active');
  document.getElementById('visibilityHint').textContent = 'Only players with the code can join.';
};

document.getElementById('pubBtn').onclick = () => {
  createIsPublic = true;
  document.getElementById('pubBtn').classList.add('active');
  document.getElementById('privBtn').classList.remove('active');
  document.getElementById('visibilityHint').textContent = 'Anyone can find and join this room from the public list.';
};

document.getElementById('createConfirm').onclick = () => {
  closeModal(createModal);
  socket.emit('create_room', { name: myName.trim(), isPublic: createIsPublic }, (res) => {
    if (!res?.ok) alert(res?.error || 'Could not create room');
  });
};

// ---------- JOIN PUBLIC FLOW ----------
document.getElementById('joinPublicBtn').onclick = () => {
  if (!myName.trim()) return alert('Enter a name first');
  openModal(publicModal);
  socket.emit('request_rooms');
};

document.getElementById('publicRefresh').onclick = () => {
  socket.emit('request_rooms');
};

// ---------- JOIN CODE FLOW ----------
document.getElementById('joinCodeBtn').onclick = () => {
  if (!myName.trim()) return alert('Enter a name first');
  openModal(codeModal);
  setTimeout(() => document.getElementById('codeInput').focus(), 100);
};

document.getElementById('codeSubmit').onclick = () => {
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) return alert('Enter a 4-letter code');
  socket.emit('join_room', { code, name: myName.trim() }, (res) => {
    if (!res?.ok) alert(res.error || 'Could not join');
    else closeModal(codeModal);
  });
};

// ---------- SOCKET EVENTS ----------
socket.on('state', (s) => {
  state = s;

  // If we just entered the lobby, hide the home screen and show 3D
  if (!inGame) {
    inGame = true;
    homeEl.style.display = 'none';
    gameEl.style.display = 'block';
    import('/game.js').then((mod) => {
      mod.initGame(socket);
    });
  }
});

socket.on('room_list', (list) => {
  roomList = list || [];
  renderPublicList();
});

function renderPublicList() {
  const listEl = document.getElementById('publicList');
  if (!listEl) return;

  if (!roomList.length) {
    listEl.innerHTML = '<p class="muted center" style="padding:20px;">No public rooms right now.<br/>Create one and make it public!</p>';
    return;
  }

  listEl.innerHTML = roomList.map((r) => `
    <div class="room-item" data-code="${r.code}">
      <div>
        <div class="room-code">${r.code}</div>
        <div class="room-host">Host: ${escapeHtml(r.hostName)}</div>
      </div>
      <div class="room-count">${r.playerCount}/${r.maxPlayers}</div>
    </div>
  `).join('');

  listEl.querySelectorAll('.room-item').forEach((el) => {
    el.onclick = () => {
      const code = el.dataset.code;
      closeModal(publicModal);
      socket.emit('join_public', { code, name: myName.trim() }, (res) => {
        if (!res?.ok) alert(res.error || 'Could not join');
      });
    };
  });
}

// ---------- COUNTDOWN OVERLAY ----------
socket.on('state', () => {
  if (!state) return;
  updateCountdown();
});

function updateCountdown() {
  if (!state) return;
  if (state.phase === 'countdown' && state.countdownEndsAt) {
    countdownOverlay.classList.remove('hidden');
    if (!countdownInterval) {
      countdownInterval = setInterval(() => {
        if (!state || state.phase !== 'countdown') {
          countdownOverlay.classList.add('hidden');
          clearInterval(countdownInterval);
          countdownInterval = null;
          return;
        }
        const remaining = Math.max(0, Math.ceil((state.countdownEndsAt - Date.now()) / 1000));
        countdownNum.textContent = remaining;
      }, 100);
    }
  } else {
    countdownOverlay.classList.add('hidden');
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }
}

// Make sure we get a state update when the socket reconnects
socket.on('connect', () => {
  socket.emit('request_rooms');
});

// ---------- UTIL ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}