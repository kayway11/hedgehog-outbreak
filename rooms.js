const rooms = new Map();

const PUBLIC_ROOM_IDLE_MS = 1000 * 60 * 30; // 30 min inactivity → cleanup

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(hostId, hostName, isPublic = false) {
  const code = generateCode();
  const room = {
    code,
    hostId,
    isPublic: !!isPublic,
    phase: 'lobby',          // 'lobby' | 'countdown' | 'play' | 'ended'
    countdownEndsAt: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: [
      {
        id: hostId,
        name: hostName,
        x: 0,
        y: 0,
        z: 0,
        rotY: 0,
        connected: true,
        color: 'red',
      },
    ],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code);
}

export function touchRoom(room) {
  if (room) room.lastActivity = Date.now();
}

export function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.phase !== 'lobby') return { error: 'Game already started' };
  if (room.players.length >= 10) return { error: 'Room full' };
  if (room.players.find((p) => p.id === playerId)) return { room };

  const idx = room.players.length;
  const angle = (idx / 8) * Math.PI * 2;
  const radius = 3;

  room.players.push({
    id: playerId,
    name: playerName,
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
    rotY: 0,
    connected: true,
    color: 'red',
  });

  touchRoom(room);
  return { room };
}

export function removePlayer(code, playerId) {
  const room = rooms.get(code);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }
  touchRoom(room);
}

export function allRooms() {
  return rooms;
}

export function listPublicRooms() {
  const out = [];
  rooms.forEach((room) => {
    if (!room.isPublic) return;
    if (room.phase !== 'lobby') return;
    if (room.players.length === 0) return;
    out.push({
      code: room.code,
      hostName: room.players.find((p) => p.id === room.hostId)?.name || '?',
      playerCount: room.players.length,
      maxPlayers: 10,
    });
  });
  return out.sort((a, b) => b.playerCount - a.playerCount);
}

export function setRoomVisibility(code, isPublic) {
  const room = rooms.get(code);
  if (!room) return;
  room.isPublic = !!isPublic;
  touchRoom(room);
}

export function publicState(room, forPlayerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    isPublic: room.isPublic,
    phase: room.phase,
    countdownEndsAt: room.countdownEndsAt,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      color: p.color,
      isYou: p.id === forPlayerId,
    })),
  };
}

// --- Cleanup interval: remove idle rooms ---
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (now - room.lastActivity > PUBLIC_ROOM_IDLE_MS) {
      rooms.delete(code);
    }
  });
}, 60 * 1000);