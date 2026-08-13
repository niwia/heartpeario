const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { randomBytes } = require('crypto');

const PORT = process.env.PORT || 8080;
const DIST_DIR = path.resolve(__dirname, '../client/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=UTF-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('HeartPeario WebSocket Sync Server running.');
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath.startsWith('/watchpear2')) {
    reqPath = reqPath.slice('/watchpear2'.length) || '/';
  }
  let filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

// ── Persistent Test Room 'TEST' ───────────────────────────────────────────
const testRoom = {
  id: 'TEST',
  hostId: 'SYSTEM',
  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  mediaMeta: {
    title: 'Big Buck Bunny (Test Stream)',
    type: 'movie',
    year: '2026',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
  },
  subtitles: [],
  player: { paused: false, time: 0, serverTime: Date.now() },
  clients: new Map(),
};
rooms.set('TEST', testRoom);

/**
 * @typedef {{ id: string, name: string, color: string }} UserMeta
 * @typedef {{ id: string, hostId: string, url: string|null, mediaMeta: any, subtitles: Array, player: {paused:boolean,time:number,serverTime:number}, clients: Map<WebSocket, UserMeta> }} Room
 */

const COLORS = ['#e03d5a', '#5a7de0', '#3dbe7a', '#e0a83d', '#a03de0', '#e05a3d', '#3dbde0'];
const CLEAN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genRoomCode(len = 6) {
  const bytes = randomBytes(len);
  let result = '';
  for (let i = 0; i < len; i++) {
    result += CLEAN_ALPHABET[bytes[i] % CLEAN_ALPHABET.length];
  }
  return result;
}

function normalizeCode(code) {
  return (code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().trim();
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

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const h = Math.floor(m / 60);
  const remM = (m % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${remM}:${sec}` : `${m}:${sec}`;
}

function logServer(msg) {
  const ts = new Date().toTimeString().split(' ')[0];
  console.log(`[${ts}] ${msg}`);
}

function broadcastSystemMessage(room, text) {
  if (!room) return;
  logServer(`[Room ${room.id}] System: ${text}`);
  broadcastAll(room, 'room.message', {
    userId: 'system',
    name: 'System',
    color: '#7a7a8a',
    content: text,
    isSystem: true,
    ts: Date.now(),
  });
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const userId = genRoomCode(10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  let user = { id: userId, name: `User${genRoomCode(4)}`, color };
  /** @type {Room|null} */
  let room = null;

  logServer(`Client connected from ${ip} (Assigned ID: ${userId})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload = {} } = msg;

    switch (type) {
      // ── Room creation ───────────────────────────────────────────────────
      case 'room.create': {
        const id = 'TEST';
        if (!rooms.has(id)) {
          room = {
            id,
            hostId: userId,
            url: null,
            mediaMeta: null,
            subtitles: [],
            player: { paused: true, time: 0, serverTime: Date.now() },
            clients: new Map([[ws, user]]),
          };
          rooms.set(id, room);
        } else {
          room = rooms.get(id);
          room.clients.set(ws, user);
        }
        logServer(`[Room ${id}] Created/Joined by ${user.name} (${userId})`);

        send(ws, 'room.joined', {
          roomId: id,
          isHost: room.hostId === userId || room.hostId === 'SYSTEM',
          you: user,
          users: roomUsers(room),
          url: room.url,
          mediaMeta: room.mediaMeta,
          subtitles: room.subtitles,
          player: { ...room.player, serverTime: Date.now() },
        });
        broadcast(room, 'room.users', { users: roomUsers(room) }, ws);
        broadcastSystemMessage(room, `${user.name} entered the room`);
        break;
      }

      // ── Room joining ─────────────────────────────────────────────────────
      case 'room.join': {
        const rawCode = payload.roomId || '';
        let id = normalizeCode(rawCode);
        if (id === '000') id = 'TEST';

        logServer(`Join request: "${rawCode}" -> normalized: "${id}" by ${user.name}`);

        const target = rooms.get(id);
        if (!target) {
          logServer(`Join failed: Room "${id}" not found. Active rooms: [${Array.from(rooms.keys()).join(', ')}]`);
          send(ws, 'error', { message: 'Room not found', requestedCode: id });
          break;
        }

        // Leave previous room if any
        if (room && room !== target) {
          room.clients.delete(ws);
          broadcastAll(room, 'room.users', { users: roomUsers(room) });
        }

        room = target;
        room.clients.set(ws, user);
        const isHost = room.hostId === userId || room.hostId === 'SYSTEM';
        logServer(`[Room ${id}] ${user.name} joined. Total users: ${room.clients.size}`);

        send(ws, 'room.joined', {
          roomId: id,
          isHost,
          you: user,
          users: roomUsers(room),
          url: room.url,
          mediaMeta: room.mediaMeta || null,
          subtitles: room.subtitles || [],
          player: { ...room.player, serverTime: Date.now() },
        });

        broadcast(room, 'room.users', { users: roomUsers(room) }, ws);
        broadcastSystemMessage(room, `${user.name} joined the room`);
        break;
      }

      // ── User settings ────────────────────────────────────────────────────
      case 'user.name': {
        const name = (payload.name || '').trim().slice(0, 30);
        if (!name) break;
        const oldName = user.name;
        user = { ...user, name };
        logServer(`User ${userId} renamed: "${oldName}" -> "${name}"`);
        if (room) {
          room.clients.set(ws, user);
          broadcastAll(room, 'room.users', { users: roomUsers(room) });
          if (oldName !== name) {
            broadcastSystemMessage(room, `${oldName} changed name to ${name}`);
          }
        }
        break;
      }

      // ── Video URL & Metadata ─────────────────────────────────────────────
      case 'player.url': {
        if (!room) break;
        const url = (payload.url || '').trim();
        room.url = url || null;
        room.mediaMeta = payload.mediaMeta || null;
        room.subtitles = Array.isArray(payload.subtitles) ? payload.subtitles : [];
        room.player = { paused: true, time: 0, serverTime: Date.now() };

        logServer(`[Room ${room.id}] URL loaded by ${user.name}: ${url ? url.slice(0, 60) + '...' : 'none'}`);

        broadcastAll(room, 'player.url', {
          url: room.url,
          mediaMeta: room.mediaMeta,
          subtitles: room.subtitles,
        });

        const title = room.mediaMeta?.title ? `${room.mediaMeta.title} ${room.mediaMeta.episodeTitle || ''}` : 'direct video URL';
        broadcastSystemMessage(room, `${user.name} loaded: ${title}`);

        // Reset buffer readiness for all room clients
        room.readiness = new Map();
        room.waitingToPlay = room.clients.size > 1;
        room.pendingPlayTime = 0;
        broadcastAll(room, 'room.readiness', {
          readyCount: 0,
          totalCount: room.clients.size,
          waitingFor: Array.from(room.clients.values()).map(u => u.name),
          allReady: room.clients.size <= 1,
        });
        break;
      }

      // ── Client Buffer & Readiness Reporting ──────────────────────────────
      case 'player.readiness': {
        if (!room) break;
        const { ready, time } = payload;
        if (!room.readiness) room.readiness = new Map();
        room.readiness.set(userId, { ready: !!ready, name: user.name, time: parseFloat(time) || 0 });

        const totalUsers = room.clients.size;
        const readyCount = Array.from(room.readiness.values()).filter(r => r.ready).length;
        const waitingFor = Array.from(room.clients.values())
          .filter(u => !room.readiness.get(u.id)?.ready)
          .map(u => u.name);

        logServer(`[Room ${room.id}] Buffer readiness: ${readyCount}/${totalUsers} ready. (Waiting for: ${waitingFor.join(', ') || 'none'})`);

        broadcastAll(room, 'room.readiness', {
          readyCount,
          totalCount: totalUsers,
          waitingFor,
          allReady: readyCount >= totalUsers,
        });

        // If everyone is ready and room is waiting to unpause
        if (readyCount >= totalUsers && room.waitingToPlay) {
          clearTimeout(room.readinessSafetyTimer);
          room.waitingToPlay = false;
          room.seq = (room.seq || 0) + 1;
          const startTime = room.pendingPlayTime !== undefined ? room.pendingPlayTime : (room.player?.time || 0);
          room.player = {
            paused: false,
            time: startTime,
            serverTime: Date.now(),
            seq: room.seq,
            authorId: 'SYSTEM',
            authorName: 'System',
          };
          logServer(`[Room ${room.id}] 🍿 All ${totalUsers} viewers READY -> starting simultaneous playback at ${formatTime(startTime)}`);
          broadcastAll(room, 'player.sync', room.player);
          broadcastSystemMessage(room, `All viewers ready! Playing in sync 🍿`);
        }
        break;
      }

      // ── Client Buffering Pauses ──────────────────────────────────────────
      case 'player.buffering': {
        if (!room) break;
        const { buffering } = payload;
        if (buffering) {
          logServer(`[Room ${room.id}] Client buffering mid-stream: ${user.name}`);
          if (!room.player.paused && room.clients.size > 1) {
            room.waitingToPlay = true;
            room.pendingPlayTime = (room.player.time || 0) + Math.max(0, (Date.now() - (room.player.serverTime || Date.now())) / 1000);
            room.seq = (room.seq || 0) + 1;
            room.player = {
              paused: true,
              time: room.pendingPlayTime,
              serverTime: Date.now(),
              seq: room.seq,
              authorId: userId,
              authorName: user.name,
            };
            broadcastAll(room, 'player.sync', room.player);
            broadcastSystemMessage(room, `Buffering for ${user.name}... paused`);
          }
          if (room.readiness) {
            const entry = room.readiness.get(userId);
            if (entry) entry.ready = false;
          }
          broadcastAll(room, 'room.readiness', {
            readyCount: Array.from(room.readiness?.values() || []).filter(r => r.ready).length,
            totalCount: room.clients.size,
            waitingFor: [user.name],
            allReady: false,
          });
        }
        break;
      }

      // ── Host Force Play Override ─────────────────────────────────────────
      case 'room.force_play': {
        if (!room) break;
        clearTimeout(room.readinessSafetyTimer);
        room.waitingToPlay = false;
        room.seq = (room.seq || 0) + 1;
        room.player = {
          paused: false,
          time: room.player?.time || 0,
          serverTime: Date.now(),
          seq: room.seq,
          authorId: userId,
          authorName: user.name,
        };
        logServer(`[Room ${room.id}] Force play triggered by ${user.name}`);
        broadcastAll(room, 'player.sync', room.player);
        broadcastSystemMessage(room, `${user.name} started playback`);
        break;
      }

      // ── Playback sync ────────────────────────────────────────────────────
      case 'player.sync': {
        if (!room) break;
        const { paused, time } = payload;
        const now = Date.now();
        const prevPaused = room.player?.paused;
        const prevTime = room.player?.time || 0;
        const newTime = Math.max(0, parseFloat(time) || 0);

        // Safety backstop: Suppress identical echo within 350ms of last broadcast
        if (room.player &&
            room.player.paused === !!paused &&
            Math.abs(prevTime - newTime) < 0.5 &&
            now - room.player.serverTime < 350) {
          logServer(`[Room ${room.id}] Echo sync suppressed from ${user.name}`);
          break;
        }

        room.seq = (room.seq || 0) + 1;
        room.player = {
          paused: !!paused,
          time: newTime,
          serverTime: now,
          seq: room.seq,
          authorId: userId,
          authorName: user.name,
        };

        const timeDiff = (newTime - prevTime).toFixed(1);
        const actionType = prevPaused !== !!paused ? (paused ? 'PAUSE' : 'PLAY') : (Math.abs(prevTime - newTime) > 2 ? 'SEEK' : 'UPDATE');
        logServer(`[Room ${room.id}] Sync #${room.seq} [${actionType}] from ${user.name}: ${paused ? 'PAUSED' : 'PLAYING'} at ${formatTime(newTime)} (${newTime.toFixed(1)}s, Δ ${timeDiff >= 0 ? '+' : ''}${timeDiff}s)`);

        // Relay to everyone else with server timestamp and seq
        broadcast(room, 'player.sync', room.player, ws);

        // Chat log
        if (prevPaused !== !!paused) {
          if (paused) {
            broadcastSystemMessage(room, `${user.name} paused at ${formatTime(newTime)}`);
          } else {
            broadcastSystemMessage(room, `${user.name} played at ${formatTime(newTime)}`);
          }
        } else if (Math.abs(prevTime - newTime) > 2) {
          broadcastSystemMessage(room, `${user.name} seeked to ${formatTime(newTime)} (Δ ${timeDiff >= 0 ? '+' : ''}${timeDiff}s)`);
        }
        break;
      }

      // ── Chat ─────────────────────────────────────────────────────────────
      case 'room.message': {
        if (!room) break;
        const content = (payload.content || '').trim().slice(0, 300);
        if (!content) break;
        logServer(`[Room ${room.id}] Chat from ${user.name}: "${content}"`);
        broadcastAll(room, 'room.message', {
          userId,
          name: user.name,
          color: user.color,
          content,
          isSystem: false,
          ts: Date.now(),
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    logServer(`Client disconnected: ${user.name} (${userId})`);
    if (!room) return;
    room.clients.delete(ws);
    broadcastSystemMessage(room, `${user.name} left the room`);

    if (room.clients.size === 0) {
      if (room.id !== 'TEST' && room.id !== '000') {
        rooms.delete(room.id);
        logServer(`Room ${room.id} deleted (all users left)`);
      } else {
        logServer(`Test Room ${room.id} is now empty and standing by`);
      }
      return;
    }

    // Re-assign host if host left
    if (room.hostId === userId) {
      const [nextWs, nextUser] = room.clients.entries().next().value;
      room.hostId = nextUser.id;
      broadcastAll(room, 'room.host', { hostId: nextUser.id });
      broadcastSystemMessage(room, `${nextUser.name} is now the room host`);
    }
    broadcastAll(room, 'room.users', { users: roomUsers(room) });
  });

  ws.on('error', (err) => {
    logServer(`WS error for ${user.name}: ${err.message}`);
    ws.close();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  logServer(`❤️  HeartPeario server running on http://0.0.0.0:${PORT}`);
});
