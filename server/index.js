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

  // Stream Probe Health Check Endpoint
  if (reqPath === '/api/probe' || reqPath.endsWith('/api/probe')) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'Missing url' }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    fetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Range': 'bytes=0-0',
      },
      signal: controller.signal,
    }).then(response => {
      clearTimeout(timeout);
      const isOnline = response.status >= 200 && response.status < 400;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ online: isOnline, status: response.status }));
    }).catch(err => {
      clearTimeout(timeout);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ online: false, error: err.message }));
    });
    return;
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

// Persistent Test Room 'TEST'
const testRoom = {
  id: 'TEST',
  hostId: null,
  url: null,
  mediaMeta: null,
  subtitles: [],
  player: { paused: true, time: 0, serverTime: Date.now() },
  clients: new Map(),
  tsMap: new Map(),
  seq: 0,
  countdownTimer: null,
  activeCountdown: null,
};
rooms.set('TEST', testRoom);

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
  if (ws && ws.readyState === WebSocket.OPEN) {
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
  return Array.from(room.clients.values()).map(u => ({
    id: u.id,
    name: u.name,
    color: u.color,
    isHost: u.id === room.hostId,
  }));
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

function startCountdown(room, action, targetTime, user) {
  if (!room) return;
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }

  const now = Date.now();
  const time = Math.max(0, typeof targetTime === 'number' ? targetTime : (room.player?.time || 0));
  const executeAt = now + 3000;

  room.activeCountdown = {
    action, // 'PLAY' | 'PAUSE' | 'SEEK'
    targetTime: time,
    executeAt,
    durationSec: 3,
    initiatedBy: user.id,
    initiatedByName: user.name,
  };

  logServer(`[Room ${room.id}] [Countdown] ${action} at ${formatTime(time)} in 3s (initiated by ${user.name})`);

  broadcastAll(room, 'room.countdown', room.activeCountdown);

  const actionText = action === 'PLAY' ? 'resume playback' : (action === 'PAUSE' ? 'pause' : `seek to ${formatTime(time)}`);
  broadcastSystemMessage(room, `${user.name} initiated 3s countdown to ${actionText}`);

  room.countdownTimer = setTimeout(() => {
    executeCountdown(room);
  }, 3000);
}

function executeCountdown(room) {
  if (!room || !room.activeCountdown) return;
  const { action, targetTime, initiatedByName, initiatedBy } = room.activeCountdown;
  room.activeCountdown = null;
  room.countdownTimer = null;

  room.seq = (room.seq || 0) + 1;
  const now = Date.now();

  if (action === 'PLAY') {
    room.player = {
      paused: false,
      time: targetTime,
      serverTime: now,
      seq: room.seq,
      authorId: initiatedBy,
      authorName: initiatedByName,
    };
    logServer(`[Room ${room.id}] [Countdown Executed] PLAY at ${formatTime(targetTime)}`);
  } else if (action === 'PAUSE') {
    room.player = {
      paused: true,
      time: targetTime,
      serverTime: now,
      seq: room.seq,
      authorId: initiatedBy,
      authorName: initiatedByName,
    };
    logServer(`[Room ${room.id}] [Countdown Executed] PAUSE at ${formatTime(targetTime)}`);
  } else if (action === 'SEEK') {
    room.player = {
      paused: room.player?.paused ?? true,
      time: targetTime,
      serverTime: now,
      seq: room.seq,
      authorId: initiatedBy,
      authorName: initiatedByName,
    };
    logServer(`[Room ${room.id}] [Countdown Executed] SEEK to ${formatTime(targetTime)}`);
  }

  broadcastAll(room, 'player.sync', room.player);
}

function cancelCountdown(room, user) {
  if (!room || !room.activeCountdown) return;
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }
  room.activeCountdown = null;
  logServer(`[Room ${room.id}] [Countdown Cancelled] by ${user.name}`);
  broadcastAll(room, 'room.countdown_cancelled', { cancelledBy: user.name });
  broadcastSystemMessage(room, `Countdown cancelled by ${user.name}`);
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  const userId = genRoomCode(10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  let user = { id: userId, name: `User${genRoomCode(4)}`, color };
  /** @type {any} */
  let room = null;

  logServer(`Client connected from ${ip} (Assigned ID: ${userId})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload = {} } = msg;

    switch (type) {
      // Room creation
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
            tsMap: new Map([[userId, { time: 0, buffering: false, ready: true, updatedAt: Date.now() }]]),
            seq: 0,
            countdownTimer: null,
            activeCountdown: null,
          };
          rooms.set(id, room);
        } else {
          room = rooms.get(id);
          if (!room.hostId || room.clients.size === 0) {
            room.hostId = userId;
          }
          room.clients.set(ws, user);
          if (!room.tsMap) room.tsMap = new Map();
          room.tsMap.set(userId, { time: room.player?.time || 0, buffering: false, ready: true, updatedAt: Date.now() });
        }
        logServer(`[Room ${id}] Created/Joined by ${user.name} (${userId}) - Host: ${room.hostId === userId}`);

        send(ws, 'room.joined', {
          roomId: id,
          isHost: room.hostId === userId,
          hostId: room.hostId,
          you: user,
          users: roomUsers(room),
          url: room.url,
          mediaMeta: room.mediaMeta,
          subtitles: room.subtitles,
          player: { ...room.player, serverTime: Date.now() },
          activeCountdown: room.activeCountdown,
        });
        broadcast(room, 'room.users', { users: roomUsers(room) }, ws);
        broadcastSystemMessage(room, `${user.name} entered the room`);
        break;
      }

      // Room joining
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
        const hostIsConnected = Array.from(room.clients.values()).some(u => u.id === room.hostId);
        if (!room.hostId || !hostIsConnected || room.clients.size === 0) {
          room.hostId = userId;
        }
        room.clients.set(ws, user);
        if (!room.tsMap) room.tsMap = new Map();
        room.tsMap.set(userId, { time: room.player?.time || 0, buffering: false, ready: true, updatedAt: Date.now() });
        const isHost = room.hostId === userId;
        logServer(`[Room ${id}] ${user.name} joined. Total users: ${room.clients.size} (Host: ${room.hostId} - isHost: ${isHost})`);

        send(ws, 'room.joined', {
          roomId: id,
          isHost,
          hostId: room.hostId,
          you: user,
          users: roomUsers(room),
          url: room.url,
          mediaMeta: room.mediaMeta || null,
          subtitles: room.subtitles || [],
          player: { ...room.player, serverTime: Date.now() },
          activeCountdown: room.activeCountdown,
        });

        broadcast(room, 'room.users', { users: roomUsers(room) }, ws);
        broadcastSystemMessage(room, `${user.name} joined the room`);
        break;
      }

      // User renaming
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

      // Transfer Host
      case 'room.set_host': {
        if (!room) break;
        const { newHostId } = payload;
        if (room.hostId !== userId && room.hostId !== null) {
          send(ws, 'error', { message: 'Only current host can transfer host permissions' });
          break;
        }
        const targetUser = Array.from(room.clients.values()).find(u => u.id === newHostId);
        if (!targetUser) break;
        room.hostId = newHostId;
        logServer(`[Room ${room.id}] Host transferred to ${targetUser.name} (${newHostId})`);
        broadcastAll(room, 'room.host', { hostId: room.hostId });
        broadcastAll(room, 'room.users', { users: roomUsers(room) });
        broadcastSystemMessage(room, `${targetUser.name} is now the room host`);
        break;
      }

      // Video URL & Metadata
      case 'player.url': {
        if (!room) break;
        const isHost = room.hostId === userId || room.clients.size === 1;
        if (!isHost) {
          send(ws, 'error', { message: 'Only the host can change the video stream' });
          break;
        }
        if (room.countdownTimer) {
          clearTimeout(room.countdownTimer);
          room.countdownTimer = null;
          room.activeCountdown = null;
          broadcastAll(room, 'room.countdown_cancelled', { cancelledBy: user.name });
        }

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
        break;
      }

      // Host Playback Action with 3s Countdown (PLAY, PAUSE, SEEK)
      case 'player.countdown_action': {
        if (!room) break;
        const isHost = room.hostId === userId || room.clients.size === 1;
        if (!isHost) {
          // If non-host sent this, convert to pause request if it was pause
          if (payload.action === 'PAUSE') {
            startCountdown(room, 'PAUSE', payload.time, user);
          } else {
            send(ws, 'error', { message: 'Only host can control playback' });
          }
          break;
        }
        const action = payload.action || (room.player?.paused ? 'PLAY' : 'PAUSE');
        const targetTime = typeof payload.time === 'number' ? payload.time : (room.player?.time || 0);
        startCountdown(room, action, targetTime, user);
        break;
      }

      // Viewer Requests Pause (triggers 3s countdown for all)
      case 'player.request_pause': {
        if (!room) break;
        const time = typeof payload.time === 'number' ? payload.time : (room.player?.time || 0);
        startCountdown(room, 'PAUSE', time, user);
        break;
      }

      // Viewer Requests Resume (triggers 3s countdown for all)
      case 'player.request_play': {
        if (!room) break;
        const time = typeof payload.time === 'number' ? payload.time : (room.player?.time || 0);
        startCountdown(room, 'PLAY', time, user);
        break;
      }

      // Cancel Countdown
      case 'player.cancel_countdown': {
        if (!room) break;
        cancelCountdown(room, user);
        break;
      }

      // Direct authoritative sync (Host manual seek or immediate command)
      case 'player.sync': {
        if (!room) break;
        const isHost = room.hostId === userId || room.clients.size === 1;
        if (!isHost) {
          // Ignore non-host direct sync
          break;
        }
        const { paused, time } = payload;
        const now = Date.now();
        const newTime = Math.max(0, parseFloat(time) || 0);

        room.seq = (room.seq || 0) + 1;
        room.player = {
          paused: !!paused,
          time: newTime,
          serverTime: now,
          seq: room.seq,
          authorId: userId,
          authorName: user.name,
        };

        logServer(`[Room ${room.id}] Direct sync from Host (${user.name}): ${paused ? 'PAUSED' : 'PLAYING'} at ${formatTime(newTime)}`);
        broadcast(room, 'player.sync', room.player, ws);
        break;
      }

      // Chat
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

      // Client timestamp heartbeat
      case 'player.ts': {
        if (!room) break;
        const { time, buffering } = payload;
        if (!room.tsMap) room.tsMap = new Map();
        room.tsMap.set(userId, {
          time: Math.max(0, parseFloat(time) || 0),
          buffering: !!buffering,
          updatedAt: Date.now(),
        });
        break;
      }

      // Telemetry log
      case 'player.diag': {
        if (!room) break;
        const { bufferAhead, pbr, drift, reason } = payload;
        const formattedBuffer = typeof bufferAhead === 'number' ? `${bufferAhead.toFixed(1)}s` : 'unknown';
        const formattedDrift = typeof drift === 'number' ? `${drift >= 0 ? '+' : ''}${drift.toFixed(2)}s` : '0s';
        if (reason === 'stall') {
          logServer(`[Room ${room.id}] Playback stall on ${user.name}: buffer ahead=${formattedBuffer}`);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    logServer(`Client disconnected: ${user.name} (${userId})`);
    if (!room) return;
    room.clients.delete(ws);
    if (room.tsMap) room.tsMap.delete(userId);
    broadcastSystemMessage(room, `${user.name} left the room`);

    if (room.clients.size === 0) {
      if (room.countdownTimer) {
        clearTimeout(room.countdownTimer);
        room.countdownTimer = null;
        room.activeCountdown = null;
      }
      if (room.id !== 'TEST' && room.id !== '000') {
        rooms.delete(room.id);
        logServer(`Room ${room.id} deleted (all users left)`);
      } else {
        room.hostId = null;
        logServer(`Test Room ${room.id} is now empty and standing by`);
      }
      return;
    }

    // Re-assign host if host left
    if (room.hostId === userId) {
      const [nextWs, nextUser] = room.clients.entries().next().value;
      room.hostId = nextUser.id;
      broadcastAll(room, 'room.host', { hostId: nextUser.id });
      broadcastAll(room, 'room.users', { users: roomUsers(room) });
      broadcastSystemMessage(room, `${nextUser.name} is now the room host`);
    } else {
      broadcastAll(room, 'room.users', { users: roomUsers(room) });
    }
  });

  ws.on('error', (err) => {
    logServer(`WS error for ${user.name}: ${err.message}`);
    ws.close();
  });
});

// Periodic Room Sync Heartbeat (1s)
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room || !room.clients || room.clients.size === 0 || !room.url) continue;

    // Prune stale client timestamp entries
    if (room.tsMap) {
      const activeUserIds = new Set(Array.from(room.clients.values()).map(u => u.id));
      for (const uid of room.tsMap.keys()) {
        if (!activeUserIds.has(uid)) {
          room.tsMap.delete(uid);
        }
      }
    }

    // Extrapolate room time if playing
    let currentRoomTime = room.player?.time || 0;
    if (room.player && !room.player.paused) {
      const elapsed = Math.max(0, (now - room.player.serverTime) / 1000);
      currentRoomTime += elapsed;
    }

    const tsMapObj = {};
    if (room.tsMap) {
      for (const [uid, val] of room.tsMap.entries()) {
        tsMapObj[uid] = val;
      }
    }

    broadcastAll(room, 'room.tsMap', {
      tsMap: tsMapObj,
      hostId: room.hostId,
      roomTime: currentRoomTime,
      paused: room.player?.paused ?? true,
      serverTime: now,
    });
  }
}, 1000);

server.listen(PORT, '0.0.0.0', () => {
  logServer(`HeartPeario server running on http://0.0.0.0:${PORT}`);
});
