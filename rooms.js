const rooms = new Map();

const PUBLIC_ROOM_IDLE_MS = 1000 * 60 * 30;

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
    phase: 'lobby',
    countdownEndsAt: null,
    roundEndsAt: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    round: 0,
    meeting: null,
    patientZeroId: null,
    players: [
      makePlayer(hostId, hostName, 0),
    ],
  };
  rooms.set(code, room);
  return room;
}

function makePlayer(id, name, idx) {
  const angle = (idx / 8) * Math.PI * 2;
  const radius = 3;
  return {
    id,
    name,
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius,
    rotY: 0,
    connected: true,
    color: 'red',
    infected: false,
    downed: false,
    downedAt: null,
    downedBy: null,
    spectator: false,
    emergencyUsed: false,
    score: 0,
    infectionsCaused: 0,
  };
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

  room.players.push(makePlayer(playerId, playerName, room.players.length));
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

// ---------- GAME LOGIC ----------

const PLAYER_RADIUS = 2.0;      // infection touch distance
const REPORT_RADIUS = 3.0;      // body report distance
const BODY_DURATION_MS = 20000; // body downed time before rising

export function startGame(room) {
  room.round += 1;
  room.phase = 'play';
  room.roundEndsAt = Date.now() + 6 * 60 * 1000;
  room.meeting = null;

  room.players.forEach((p, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 3;
    p.x = Math.cos(angle) * radius;
    p.z = Math.sin(angle) * radius;
    p.rotY = 0;
    p.infected = false;
    p.downed = false;
    p.downedAt = null;
    p.downedBy = null;
    p.spectator = false;
    p.emergencyUsed = false;
    p.infectionsCaused = 0;
  });

  const active = room.players.filter((p) => p.connected);
  const patientZero = active[Math.floor(Math.random() * active.length)];
  if (patientZero) {
    patientZero.infected = true;
  }
  room.patientZeroId = patientZero?.id || null;
}

export function checkInfections(room) {
  if (room.phase !== 'play') return false;

  const now = Date.now();
  let changed = false;

  const infectedList = room.players.filter((p) => p.infected && !p.spectator && !p.downed && p.connected);
  const survivors = room.players.filter((p) => !p.infected && !p.spectator && !p.downed && p.connected);

  for (const inf of infectedList) {
    for (const sur of survivors) {
      const dx = inf.x - sur.x;
      const dz = inf.z - sur.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < PLAYER_RADIUS) {
        sur.downed = true;
        sur.downedAt = now;
        sur.downedBy = inf.id;
        inf.infectionsCaused += 1;
        changed = true;
      }
    }
  }

  room.players.forEach((p) => {
    if (p.downed && p.downedAt && now - p.downedAt >= BODY_DURATION_MS) {
      p.downed = false;
      p.downedAt = null;
      p.infected = true;
      changed = true;
    }
  });

  return changed;
}

export function checkWin(room) {
  if (room.phase !== 'play') return null;

  const alive = room.players.filter((p) => !p.spectator && p.connected);
  const survivors = alive.filter((p) => !p.infected);
  const infected = alive.filter((p) => p.infected);

  if (survivors.length === 0) return 'infected';
  if (survivors.length < 2 && infected.length >= 1) return 'infected';
  if (Date.now() >= room.roundEndsAt) return 'survivors_time';
  return null;
}

export function findReportableBody(room, playerId) {
  if (room.phase !== 'play') return null;
  const me = room.players.find((p) => p.id === playerId);
  if (!me || me.infected || me.spectator || me.downed) return null;

  let closest = null;
  let closestDist = REPORT_RADIUS;

  room.players.forEach((p) => {
    if (!p.downed) return;
    const dx = me.x - p.x;
    const dz = me.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closest = p.id;
    }
  });

  return closest;
}

export function callMeeting(room, byPlayerId, reportedBodyId) {
  if (room.phase !== 'play') return;
  room.phase = 'meeting';
  room.meeting = {
    startedAt: Date.now(),
    callBy: byPlayerId,
    reportedBodyId: reportedBodyId || null,
    discussionEndsAt: Date.now() + 60 * 1000,
    votingEndsAt: Date.now() + 90 * 1000,
    votes: {},
    resolved: false,
    result: null,
  };
}

export function castVote(room, playerId, targetId) {
  if (room.phase !== 'meeting' || !room.meeting) return;
  const me = room.players.find((p) => p.id === playerId);
  if (!me || me.spectator || me.downed) return;
  room.meeting.votes[playerId] = targetId;
}

export function resolveMeeting(room) {
  if (!room.meeting || room.meeting.resolved) return null;

  const m = room.meeting;
  m.resolved = true;

  const tally = {};
  Object.entries(m.votes).forEach(([voter, target]) => {
    tally[target] = (tally[target] || 0) + 1;
  });

  let maxVotes = 0;
  let topTarget = null;
  let tie = false;

  Object.entries(tally).forEach(([target, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      topTarget = target;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  if (tie) topTarget = null;

  const ejectedId = topTarget && topTarget !== 'skip' ? topTarget : null;
  const ejected = ejectedId ? room.players.find((p) => p.id === ejectedId) : null;

  const result = { ejected: null, skipped: !ejectedId };

  if (ejected) {
    ejected.spectator = true;
    result.ejected = { id: ejected.id, name: ejected.name, infected: ejected.infected };
    if (ejected.infected) {
      result.winner = 'survivors_vote';
      room.phase = 'ended';
    }
  }

  m.result = result;

  if (room.phase !== 'ended') {
    setTimeout(() => {
      if (room.phase === 'meeting') {
        room.phase = 'play';
        room.meeting = null;
      }
    }, 6000);
  }

  return result;
}

export function publicState(room, forPlayerId) {
  const me = room.players.find((p) => p.id === forPlayerId);
  const iAmInfected = me?.infected && !me?.spectator;

  return {
    code: room.code,
    hostId: room.hostId,
    isPublic: room.isPublic,
    phase: room.phase,
    round: room.round,
    countdownEndsAt: room.countdownEndsAt,
    roundEndsAt: room.roundEndsAt,
    patientZeroId: room.phase === 'ended' ? room.patientZeroId : null,
    meeting: room.meeting ? {
      startedAt: room.meeting.startedAt,
      discussionEndsAt: room.meeting.discussionEndsAt,
      votingEndsAt: room.meeting.votingEndsAt,
      resolved: room.meeting.resolved,
      callBy: room.meeting.callBy,
      votes: room.meeting.votes,
      reportedBodyId: room.meeting.reportedBodyId,
      result: room.meeting.result,
    } : null,
    players: room.players.map((p) => {
      const showInfected = iAmInfected && p.infected;
      return {
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        z: p.z,
        rotY: p.rotY,
        color: p.color,
        isYou: p.id === forPlayerId,
        infected: showInfected,
        youAreInfected: p.id === forPlayerId ? p.infected : undefined,
        downed: p.downed,
        spectator: p.spectator,
        emergencyUsed: p.emergencyUsed,
        score: p.score,
      };
    }),
    reportableBody: forPlayerId ? findReportableBody(room, forPlayerId) : null,
  };
}

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (now - room.lastActivity > PUBLIC_ROOM_IDLE_MS) {
      rooms.delete(code);
    }
  });
}, 60 * 1000);