const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function createRoom(hostId, hostName) {
  const code = generateCode();
  const room = {
    code,
    hostId,
    players: [
      {
        id: hostId,
        name: hostName,
        x: 0,
        y: 0,
        z: 0,
        rotY: 0,
        connected: true,
      },
    ],
    phase: 'lobby',
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code);
}

export function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
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
  });
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
}

export function allRooms() {
  return rooms;
}

export function publicState(room, forPlayerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      isYou: p.id === forPlayerId,
    })),
  };
}