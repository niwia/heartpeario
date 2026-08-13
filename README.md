# ❤️ HeartPeario

> Watch videos together — in sync, instantly. No installs, no accounts, no Stremio required.

**How it works:** Create a room → share the link → paste a direct video URL → everyone streams it independently and plays in sync.

---

## Quick Start

### 1. Start the server
```bash
cd server
npm install
npm start
# ❤️  HeartPeario server running on ws://localhost:8080
```

### 2. Start the client (new terminal)
```bash
cd client
npm install
npm run dev
# Open http://localhost:5173
```

---

## Usage

1. Open the app, set your name, click **Create Room**
2. Share the room link (click the room code to copy)
3. Friends open the link and join
4. Paste any direct video URL — works with:
   - TorBox download links
   - Direct MP4/WebM URLs
   - Any HTTP video stream
5. Everyone plays in sync — play/pause/seek broadcasts to all

### Keyboard shortcuts (in room)
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `F` | Toggle fullscreen |

---

## Deploy

### Server (Railway / Render free tier)
1. Push the `server/` folder to a GitHub repo
2. Deploy to [Railway](https://railway.app) — it picks up `npm start` automatically
3. Note your server's public URL (e.g. `wss://heartpeario-server.up.railway.app`)

### Client (Vercel / Netlify)
1. Set env variable: `VITE_WS_URL=wss://your-server-url`
2. Build: `npm run build` → deploy the `dist/` folder

---

## Architecture

```
Each user's browser  ←──── WebSocket ────→  Server (sync only)
       │                                         │
   <video src="">                          Room state
   (streams independently                  Play/pause/seek
    from the video URL)                    Chat relay
```

The server **never touches video data**. It only relays tiny sync messages (< 1KB each). The actual video comes directly from the URL to each viewer's browser.
