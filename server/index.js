const WebSocket = require('ws');
const { randomBytes } = require('crypto');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ id: string, name: string, color: string }} UserMeta
 * @typedef {{ id: string, hostId: string, url: string|null, player: {paused:boolean,time:number,serverTime:number}, clients: Map<WebSocket, UserMeta> }} Room
 */

const COLORS = ['#e03d5a', '#5a7de0', '#3dbe7a', '#e0a83d', '#a03de0', '#e05a3d', '#3dbde0'];

function genId(len = 6) {
  return randomBytes(8).toString('base64url').slice(0, len).toUpperCase();
}

function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(room, type, payload, exclude = null) {
  for (const [ws] of room.clients) {
    if (ws !== exclude) send(ws, type, payload);
  }
}

function broadcastAll(room, type, payload) {
  for (const [ws] of room.clients) send(ws, type, payload);
}

function roomUsers(room) {
  return Array.from(room.clients.values()).map(u => ({ id: u.id, name: u.name, color: u.color }));
}

wss.on('connection', (ws) => {
  const userId = genId(12);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  let user = { id: userId, name: `User${genId(4)}`, color };
  /** @type {Room|null} */
  let room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload = {} } = msg;

    switch (type) {
      // ── Room management ─────────────────────────────────────────────────
      case 'room.create': {
        const id = genId();
        room = {
          id,
          hostId: userId,
          url: null,
          player: { paused: true, time: 0, serverTime: Date.now() },
          clients: new Map([[ws, user]]),
        };
        rooms.set(id, room);
        send(ws, 'room.joined', {
          roomId: id,
          isHost: true,
          you: user,
          users: roomUsers(room),
          url: null,
          player: room.player,
        });
        break;
      }

      case 'room.join': {
        const id = (payload.roomId || '').toUpperCase().trim();
        const target = rooms.get(id);
        if (!target) { send(ws, 'error', { message: 'Room not found' }); break; }
        room = target;
        room.clients.set(ws, user);
        const isHost = room.hostId === userId;
        send(ws, 'room.joined', {
          roomId: id,
          isHost,
          you: user,
          users: roomUsers(room),
          url: room.url,
          player: { ...room.player, serverTime: Date.now() },
        });
        broadcast(room, 'room.users', { users: roomUsers(room) }, ws);
        break;
      }

      // ── User settings ────────────────────────────────────────────────────
      case 'user.name': {
        const name = (payload.name || '').trim().slice(0, 30);
        if (!name) break;
        user = { ...user, name };
        if (room) {
          room.clients.set(ws, user);
          broadcastAll(room, 'room.users', { users: roomUsers(room) });
        }
        break;
      }

      // ── Video URL ────────────────────────────────────────────────────────
      case 'player.url': {
        if (!room) break;
        const url = (payload.url || '').trim();
        room.url = url || null;
        // reset player state when URL changes
        room.player = { paused: true, time: 0, serverTime: Date.now() };
        broadcastAll(room, 'player.url', { url: room.url });
        break;
      }

      // ── Playback sync ────────────────────────────────────────────────────
      case 'player.sync': {
        if (!room) break;
        const { paused, time } = payload;
        room.player = { paused: !!paused, time: parseFloat(time) || 0, serverTime: Date.now() };
        // Relay to everyone else with the server timestamp for compensation
        broadcast(room, 'player.sync', room.player, ws);
        break;
      }

      // ── Chat ─────────────────────────────────────────────────────────────
      case 'room.message': {
        if (!room) break;
        const content = (payload.content || '').trim().slice(0, 300);
        if (!content) break;
        broadcastAll(room, 'room.message', {
          userId,
          name: user.name,
          color: user.color,
          content,
          ts: Date.now(),
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(ws);
    if (room.clients.size === 0) {
      rooms.delete(room.id);
      console.log(`Room ${room.id} closed (empty)`);
      return;
    }
    // Re-assign host if host left
    if (room.hostId === userId) {
      const [nextWs, nextUser] = room.clients.entries().next().value;
      room.hostId = nextUser.id;
      broadcastAll(room, 'room.host', { hostId: nextUser.id });
    }
    broadcastAll(room, 'room.users', { users: roomUsers(room) });
  });

  ws.on('error', () => ws.close());
});

console.log(`❤️  HeartPeario server running on ws://localhost:${PORT}`);
