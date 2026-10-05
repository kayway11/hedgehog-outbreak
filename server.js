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
  publicState,
} from './rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }, cb) => {
    const room = createRoom(socket.id, name || 'Hedgehog');
    socket.join(socket.id);
    socket.data.code = room.code;
    cb?.({ ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    const result = joinRoom(code?.toUpperCase(), socket.id, name || 'Hedgehog');
    if (result.error) return cb?.({ ok: false, error: result.error });
    socket.join(socket.id);
    socket.data.code = result.room.code;
    cb?.({ ok: true, code: result.room.code });
    broadcast(result.room);
  });

  socket.on('start_game', ({ code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: 'No room' });
    if (room.hostId !== socket.id) return cb?.({ ok: false, error: 'Not host' });
    if (room.players.length < 1) return cb?.({ ok: false, error: 'Need players' });
    room.phase = 'play';
    cb?.({ ok: true });
    broadcast(room);
    broadcastWorld(room);
  });

  socket.on('move', ({ x, y, z, rotY }) => {
    const code = socket.data.code;
    if (!code) return;
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

  socket.on('disconnect', () => {
    allRooms().forEach((room) => {
      if (room.players.find((p) => p.id === socket.id)) {
        removePlayer(room.code, socket.id);
        if (room.players.length > 0) broadcast(room);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on :${PORT}`));