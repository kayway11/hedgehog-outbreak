import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  allRooms,
  listPublicRooms,
  setRoomVisibility,
  publicState,
  touchRoom,
} from './rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath,.code;
    'index.html'));
 if});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const COUNTDOWN_SECONDS = 15;
const countdownTimers = new Map(); // code -> setTimeout id

function broadcast(room) {
  room.players.forEach((p) => {
    io.to(p.id).emit('state', publicState(room, p.id));
  });
}

function broadcastWorld(room) {
  room.players.forEach((p) => {
    io.to(p.id).emit('world', publicState(room, p.id));
  });
}

function broadcastRoomList() {
  io.emit('room_list', listPublicRooms());
}

io.on('connection', (socket) => {
  // Send initial public room list to this socket
  socket.emit('room_list', listPublicRooms());

  // --- Create room ---
  socket.on('create_room', ({ name, isPublic }, cb) => {
    const room = createRoom(socket.id, name || 'Hedgehog', isPublic);
    socket.join(socket.id);
    socket.data.code = room.code;
    cb?.({ ok: true, code: room.code });
    broadcast(room);
    broadcastRoomList();
  });

  // --- Join by code ---
  socket.on('join_room', ({ code, name }, cb) => {
    const result = joinRoom(code?.toUpperCase(), socket.id, name || 'Hedgehog');
    if (result.error) return cb?.({ ok: false, error: result.error });
    socket.join(socket.id);
    socket.data.code = result.room.code;
    touchRoom(result.room);
    cb?.({ ok: true, code: result.room.code });
    broadcast(result.room);
    broadcastRoomList();
  });

  // --- Join public room from list ---
  socket.on('join_public', ({ code, name }, cb) => {
    const result = joinRoom(code?.toUpperCase(), socket.id, name || 'Hedgehog');
    if (result.error) return cb?.({ ok: false, error: result.error });
    socket.join(socket.id);
    socket.data.code = result.room.code;
    touchRoom(result.room);
    cb?.({ ok: true, code: result.room.code });
    broadcast(result.room);
    broadcastRoomList();
  });

  // --- Toggle room visibility ---
  socket.on('set_visibility', ({ code, isPublic }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false });
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Not host' });
    setRoomVisibility(code, isPublic);
    cb?.({ ok: true });
    broadcast(room);
    broadcastRoomList();
  });

  // --- Request room list ---
  socket.on('request_rooms', () => {
    socket.emit('room_list', listPublicRooms());
  });

  // --- Start game (host) ---
  socket.on('start_game', ({ code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Not host' });
    if (room.players.length < 1) return cb?.({ ok: false, error: 'Need players' });
    if (room.phase !== 'lobby') return cb?.({ ok: false, error: 'Already starting' });

    room.phase = 'countdown';
    room.countdownEndsAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    cb?.({ ok: true });
    broadcast(room);
    broadcastWorld(room);
    broadcastRoomList();

    // after countdown → play
    const timer = setTimeout(() => {
      const r = getRoom(code);
      if (!r) return;
      r.phase = 'play';
      r.countdownEndsAt = null;
      broadcast(r);
      broadcastWorld(r);
      broadcastRoomList();
      countdownTimers.delete(code);
    }, COUNTDOWN_SECONDS * 1000);

    countdownTimers.set(code, timer);
  });

  // --- Cancel countdown (host changed mind) ---
  socket.on('cancel_start', ({ code }) => {
    const room = getRoom(code);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    const t = countdownTimers.get(code);
    if (t) clearTimeout(t);
    countdownTimers.delete(code);
    room.phase = 'lobby';
    room.countdownEndsAt = null;
    broadcast(room);
    broadcastWorld(room);
    broadcastRoomList();
  });

  // --- Movement ---
  socket.on('move', ({ x, y, z, rotY }) => {
    const code = socket.data (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.x = x;
    player.y = y;
    player.z = z;
    player.rotY = rotY;
    broadcastWorld(room);
  });

  // --- Leave room ---
  socket.on('leave_room', () => {
    const code = socket.data.code;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const wasHost = room.hostId === socket.id;
    removePlayer(code, socket.id);
    socket.data.code = null;
    const updated = getRoom(code);
    if (updated) {
      broadcast(updated);
      broadcastWorld(updated);
    }
    broadcastRoomList();
    if (wasHost && !updated) {
      // room gone
    }
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    allRooms().forEach((room) => {
      if (room.players.find((p) => p.id === socket.id)) {
        removePlayer(room.code, socket.id);
        const updated = getRoom(room.code);
        if (updated) {
          broadcast(updated);
          broadcastWorld(updated);
        }
      }
    });
    broadcastRoomList();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));