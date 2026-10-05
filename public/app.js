const socket = io();

let state = null;
let myName = '';
let myCode = '';
let inGame = false;

const app = document.getElementById('app');

socket.on('state', (s) => {
  state = s;
  if (!myCode && s.code) myCode = s.code;

  if (s.phase === 'play' && !inGame) {
    inGame = true;
    import('/game.js').then((mod) => {
      mod.initGame(socket, socket.id);
      const hudRoom = document.getElementById('hudRoom');
      if (hudRoom) hudRoom.textContent = 'Room: ' + s.code;
    });
    return;
  }

  if (!inGame) renderHome();
});

renderHome();

function renderHome() {
  app.style.display = 'block';
  document.getElementById('game').style.display = 'none';

  if (!state) {
    app.innerHTML = `
      <div style="text-align:center;margin-top:40px;margin-bottom:24px;">
        <h1 style="font-size:32px;color:#ff4d6d;margin-bottom:8px;">🦔 OUTBREAK</h1>
        <p class="muted">3D infection party game</p>
      </div>
      <div class="panel">
        <label class="muted">Your name</label>
        <input class="input" id="nameInput" maxlength="16" placeholder="Enter name" />
        <button class="btn btn-primary" id="createBtn" style="margin-bottom:12px;">Create room</button>
        <div style="text-align:center;opacity:.5;font-size:12px;margin:12px 0;">— or join —</div>
        <input class="input" id="codeInput" maxlength="4" placeholder="CODE" style="text-transform:uppercase;text-align:center;font-family:monospace;font-size:20px;letter-spacing:4px;" />
        <button class="btn btn-ghost" id="joinBtn" style="width:100%;">Join</button>
      </div>
    `;
    document.getElementById('nameInput').oninput = (e) => (myName = e.target.value);
    document.getElementById('createBtn').onclick = () => {
      if (!myName.trim()) return alert('Enter a name');
      socket.emit('create_room', { name: myName.trim() });
    };
    document.getElementById('joinBtn').onclick = () => {
      const code = document.getElementById('codeInput').value.trim().toUpperCase();
      if (!myName.trim()) return alert('Enter a name');
      if (code.length !== 4) return alert('4-letter code required');
      socket.emit('join_room', { code, name: myName.trim() }, (res) => {
        if (!res.ok) alert(res.error || 'Could not join');
      });
    };
    return;
  }

  if (state.phase === 'lobby') return renderLobby();
  app.innerHTML = `<p class="center muted">Loading…</p>`;
}

function renderLobby() {
  const me = state.players.find((p) => p.isYou);
  const isHost = me && me.id === state.hostId;
  const canStart = state.players.length >= 1;

  app.innerHTML = `
    <div class="panel center">
      <p class="muted">Share this code</p>
      <div class="code-display">${state.code}</div>
      <p class="muted">${state.players.length}/10 players</p>
    </div>
    <div class="panel">
      <h3>Players</h3>
      <ul class="player-list">
        ${state.players.map((p) => `
          <li class="${p.isYou ? 'you' : ''}">
            <span>${escapeHtml(p.name)}${p.id === state.hostId ? '<span class="badge host">HOST</span>' : ''}</span>
            ${p.isYou ? '<span class="muted">you</span>' : ''}
          </li>
        `).join('')}
      </ul>
    </div>
    ${isHost
      ? `<button class="btn btn-primary" id="startBtn" ${!canStart ? 'disabled' : ''}>${canStart ? 'Start game' : 'Need 1+ players'}</button>`
      : `<p class="center muted">Waiting for host…</p>`}
  `;

  if (isHost) {
    document.getElementById('startBtn').onclick = () => {
      socket.emit('start_game', { code: state.code }, (res) => {
        if (!res?.ok) alert(res?.error || 'Cannot start');
      });
    };
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}