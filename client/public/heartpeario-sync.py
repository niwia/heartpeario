#!/usr/bin/env python3
"""
HeartPeario External Player Sync (mpv & VLC)
Zero-dependency synchronized playback companion for HeartPeario.
Enables native playback of 4K REMUX, MKV, and Dolby Atmos/TrueHD streams.

Usage:
  python3 heartpeario-sync.py --room TEST
  python3 heartpeario-sync.py --room TEST --player mpv
  python3 heartpeario-sync.py --room TEST --player vlc --name "Alex (VLC)"
"""

import argparse
import base64
import json
import os
import re
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse

# ─── Pure-Python RFC 6455 WebSocket Client ───────────────────────────────────

def _encode_frame(text):
    data = text.encode('utf-8')
    length = len(data)
    frame = bytearray([0x81])  # FIN + Text Opcode
    mask = os.urandom(4)
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(struct.pack('!H', length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack('!Q', length))
    frame.extend(mask)
    frame.extend(bytearray(data[i] ^ mask[i % 4] for i in range(length)))
    return bytes(frame)


class SimpleWebSocketClient:
    def __init__(self, ws_url):
        parsed = urlparse(ws_url)
        self.host = parsed.hostname or 'localhost'
        self.port = parsed.port or (443 if parsed.scheme in ('wss', 'https') else 80)
        self.path = parsed.path or '/'
        if not self.path.endswith('/ws'):
            self.path = (self.path.rstrip('/') + '/ws') if self.path != '/' else '/ws'
        self.secure = parsed.scheme in ('wss', 'https')
        self.sock = None
        self.buf = bytearray()
        self.connected = False

    def connect(self):
        ctx = ssl.create_default_context() if self.secure else None
        raw_sock = socket.create_connection((self.host, self.port), timeout=10)
        self.sock = ctx.wrap_socket(raw_sock, server_hostname=self.host) if self.secure else raw_sock
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode('ascii'))
        self.buf = bytearray()
        while b'\r\n\r\n' not in self.buf:
            chunk = self.sock.recv(2048)
            if not chunk:
                raise ConnectionResetError("Server closed connection during handshake")
            self.buf.extend(chunk)

        idx = self.buf.index(b'\r\n\r\n') + 4
        self.buf = self.buf[idx:]
        self.connected = True
        self.sock.settimeout(None)

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionResetError("Socket closed")
            self.buf.extend(chunk)
        res = bytes(self.buf[:n])
        self.buf = self.buf[n:]
        return res

    def recv(self):
        while self.connected:
            b1, b2 = self._recv_exact(2)
            opcode = b1 & 0x0F
            is_masked = bool(b2 & 0x80)
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack('!H', self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', self._recv_exact(8))[0]
            mask = self._recv_exact(4) if is_masked else None
            payload = self._recv_exact(length)
            if mask:
                payload = bytes(payload[i] ^ mask[i % 4] for i in range(length))

            if opcode == 9:  # Ping -> reply Pong
                pong = bytearray([0x8A, 0x80]) + os.urandom(4)
                self.sock.sendall(pong)
                continue
            if opcode == 8:  # Close
                self.connected = False
                return None
            if opcode in (1, 2):
                return payload.decode('utf-8', errors='replace')
        return None

    def send(self, text):
        if self.connected and self.sock:
            self.sock.sendall(_encode_frame(text))

    def close(self):
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass


# ─── Player Controllers (mpv & VLC) ─────────────────────────────────────────

class MpvController:
    """Controls mpv via local JSON IPC socket."""
    def __init__(self, ipc_path="/tmp/heartpeario-mpv.sock", on_status=None):
        self.ipc_path = ipc_path
        self.on_status = on_status
        self.proc = None
        self.sock = None
        self.is_paused = True
        self.current_url = None
        self.current_title = None
        self.running = False
        self.listener_thread = None

    def start(self, initial_url=None):
        if os.path.exists(self.ipc_path):
            try:
                os.remove(self.ipc_path)
            except Exception:
                pass

        cmd = [
            "mpv",
            f"--input-ipc-server={self.ipc_path}",
            "--idle=yes",
            "--force-window=immediate",
            "--title=HeartPeario Synced Player (mpv)",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]
        if initial_url:
            cmd.append(initial_url)
            self.current_url = initial_url

        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Wait for IPC socket
        for _ in range(30):
            time.sleep(0.1)
            if os.path.exists(self.ipc_path):
                break

        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.ipc_path)
        self.running = True
        self.listener_thread = threading.Thread(target=self._read_events, daemon=True)
        self.listener_thread.start()

        # Observe properties for live status and duration reporting
        self.send_cmd(["observe_property", 1, "duration"])
        self.send_cmd(["observe_property", 2, "pause"])

    def _read_events(self):
        buf = ""
        while self.running and self.sock:
            try:
                data = self.sock.recv(4096)
                if not data:
                    break
                buf += data.decode("utf-8", errors="ignore")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        ev = json.loads(line)
                        event_name = ev.get("event")
                        if event_name in ("file-loaded", "playback-restart"):
                            print_log("PLAYER", f"▶ mpv stream ready: {self.current_title or 'Video'}", "\033[92m")
                            if self.on_status:
                                self.on_status("playing", {"title": self.current_title})
                        elif event_name == "property-change":
                            p_name = ev.get("name")
                            p_data = ev.get("data")
                            if p_name == "duration" and p_data and self.on_status:
                                try:
                                    self.on_status("playing", {"duration": float(p_data)})
                                except Exception:
                                    pass
                        elif event_name == "pause":
                            if self.on_status:
                                self.on_status("paused", {})
                        elif event_name == "unpause":
                            if self.on_status:
                                self.on_status("playing", {})
                        elif event_name == "end-file":
                            reason = ev.get("reason")
                            if reason == "error":
                                print_log("ERROR", "mpv could not open stream: HTTP 404 / expired link / forbidden by host.", "\033[91m")
                                print_log("HINT", "Please select another source in the HeartPeario web room.", "\033[93m")
                                if self.on_status:
                                    self.on_status("error", {"reason": "Stream link 404 or unsupported"})
                    except Exception:
                        pass
            except Exception:
                break

    def send_cmd(self, cmd_array):
        if not self.sock:
            return None
        payload = json.dumps({"command": cmd_array}) + "\n"
        try:
            self.sock.sendall(payload.encode('utf-8'))
        except Exception:
            pass

    def load_url(self, url, title=None):
        self.current_url = url
        self.current_title = title or "Video Stream"
        self.send_cmd(["loadfile", url, "replace"])
        if title:
            self.send_cmd(["set_property", "force-media-title", title])
        self.send_cmd(["set_property", "pause", self.is_paused])

    def set_pause(self, paused):
        self.is_paused = paused
        self.send_cmd(["set_property", "pause", paused])

    def seek(self, seconds):
        self.send_cmd(["seek", max(0, seconds), "absolute"])

    def get_time(self):
        return 0

    def close(self):
        self.running = False
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass
        try:
            if self.proc:
                self.proc.terminate()
        except Exception:
            pass
        if os.path.exists(self.ipc_path):
            try:
                os.remove(self.ipc_path)
            except Exception:
                pass


class VlcController:
    """Controls VLC via RC (Remote Control) TCP interface."""
    def __init__(self, port=4212):
        self.port = port
        self.proc = None
        self.sock = None
        self.is_paused = True
        self.current_url = None

    def start(self, initial_url=None):
        cmd = [
            "vlc",
            "--extraintf", "rc",
            "--rc-host", f"127.0.0.1:{self.port}",
            "--rc-quiet",
        ]
        if initial_url:
            cmd.append(initial_url)
            self.current_url = initial_url

        self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        for _ in range(30):
            time.sleep(0.1)
            try:
                self.sock = socket.create_connection(("127.0.0.1", self.port), timeout=1)
                break
            except Exception:
                pass

    def send_cmd(self, line):
        if not self.sock:
            return
        try:
            self.sock.sendall((line.strip() + "\n").encode('utf-8'))
        except Exception:
            pass

    def load_url(self, url, title=None):
        self.current_url = url
        self.send_cmd(f"add {url}")
        self.set_pause(True)

    def set_pause(self, paused):
        # VLC RC command 'pause' toggles pause state
        if self.is_paused != paused:
            self.send_cmd("pause")
            self.is_paused = paused

    def seek(self, seconds):
        self.send_cmd(f"seek {int(max(0, seconds))}")

    def close(self):
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass
        try:
            if self.proc:
                self.proc.terminate()
        except Exception:
            pass


# ─── HeartPeario Sync Engine ────────────────────────────────────────────────

def print_log(tag, msg, color="\033[94m"):
    reset = "\033[0m"
    print(f"{color}[{tag}]{reset} {msg}")


def main():
    parser = argparse.ArgumentParser(description="HeartPeario External Player Sync (mpv / VLC)")
    parser.add_argument("--room", "-r", default="TEST", help="HeartPeario Room Code (e.g. TEST)")
    parser.add_argument("--url", "-u", default="https://steamddon.dedyn.io/watchpear2/", help="HeartPeario Web App URL")
    parser.add_argument("--player", "-p", choices=["mpv", "vlc", "auto"], default="auto", help="External player to use")
    parser.add_argument("--name", "-n", default=None, help="Your display name in the room")
    args = parser.parse_args()

    # Detect player
    player_choice = args.player
    if player_choice == "auto":
        if shutil.which("mpv"):
            player_choice = "mpv"
        elif shutil.which("vlc"):
            player_choice = "vlc"
        else:
            print("\033[91m[ERROR]\033[0m Neither 'mpv' nor 'vlc' was found in your PATH.")
            print("Please install mpv (recommended: sudo apt install mpv / brew install mpv) or VLC.")
            sys.exit(1)

    display_name = args.name or f"Player ({player_choice.upper()})"

    print("═" * 65)
    print(f" ❤️  HeartPeario External Player Sync")
    print(f" 📺 Player  : \033[92m{player_choice.upper()}\033[0m")
    print(f" 🚪 Room    : \033[93m{args.room.upper()}\033[0m")
    print(f" 🌐 Host    : {args.url}")
    print(f" 👤 User    : {display_name}")
    print("═" * 65)

    # Connect WebSocket
    ws = SimpleWebSocketClient(args.url)
    try:
        print_log("NETWORK", f"Connecting to HeartPeario WebSocket...", "\033[94m")
        ws.connect()
    except Exception as e:
        print_log("ERROR", f"Failed to connect to {args.url}: {e}", "\033[91m")
        sys.exit(1)

    def handle_player_status(state, details=None):
        payload = {"state": state, "player": player_choice}
        if details:
            payload.update(details)
        try:
            ws.send(json.dumps({"type": "external_player.status", "payload": payload}))
        except Exception:
            pass

    # Initialize Player Controller
    if player_choice == "mpv":
        player = MpvController(on_status=handle_player_status)
    else:
        player = VlcController()

    print_log("LAUNCH", f"Starting local {player_choice.upper()} instance...", "\033[96m")
    try:
        player.start()
    except Exception as e:
        print_log("ERROR", f"Failed to start player: {e}", "\033[91m")
        ws.close()
        sys.exit(1)

    # Send User Name and Join
    ws.send(json.dumps({"type": "user.name", "payload": {"name": display_name}}))
    ws.send(json.dumps({
        "type": "room.join",
        "payload": {
            "roomId": args.room.upper(),
            "isExternalPlayer": True,
            "playerType": player_choice,
        }
    }))
    handle_player_status("connected")

    print_log("SYNC", f"Connected & synchronized with Room '{args.room.upper()}'!", "\033[92m")
    print_log("INFO", "Stream changes, play/pause, and seeks in HeartPeario will control your player automatically.", "\033[90m")
    print_log("INFO", "Press Ctrl+C anytime to disconnect.\n", "\033[90m")

    # Main Event Loop
    try:
        while ws.connected:
            raw = ws.recv()
            if not raw:
                break
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = msg.get("type")
            payload = msg.get("payload") or {}

            # Initial room join
            if msg_type == "room.joined":
                url = payload.get("url")
                meta = payload.get("mediaMeta") or {}
                title = meta.get("title") or "Video Stream"
                player_state = payload.get("player") or {}
                if url:
                    print_log("STREAM", f"Loading room stream: {title}", "\033[95m")
                    player.load_url(url, title)
                    time_pos = player_state.get("time") or 0
                    if time_pos > 0:
                        player.seek(time_pos)
                    player.set_pause(player_state.get("paused", True))
                else:
                    print_log("INFO", "Room is open. Waiting for host to select a movie/stream...", "\033[90m")

            # Stream URL changed
            elif msg_type == "player.url":
                url = payload.get("url")
                meta = payload.get("mediaMeta") or {}
                title = meta.get("title") or "Video Stream"
                if url:
                    print_log("STREAM", f"Loaded new stream: {title}", "\033[95m")
                    player.load_url(url, title)
                else:
                    print_log("STREAM", "Stream unloaded by host", "\033[93m")
                    player.set_pause(True)

            # Synchronized countdown started by room
            elif msg_type == "room.countdown":
                action = payload.get("action", "PLAY")
                target_time = payload.get("targetTime", 0)
                initiator = payload.get("initiatedByName") or "Host"
                action_text = "▶ PLAY" if action == "PLAY" else ("⏸ PAUSE" if action == "PAUSE" else f"SEEK to {int(target_time)}s")
                print_log("COUNTDOWN", f"{action_text} in 3s (initiated by {initiator})", "\033[96m")

            # Synchronized playback state packet (after countdown or direct seek)
            elif msg_type == "player.sync":
                is_paused = payload.get("paused", True)
                target_time = payload.get("time", 0)
                author = payload.get("authorName") or "Room"
                if is_paused:
                    print_log("ACTION", f"⏸ PAUSE at {int(target_time)}s ({author})", "\033[93m")
                else:
                    print_log("ACTION", f"▶ PLAY at {int(target_time)}s ({author})", "\033[92m")
                player.seek(target_time)
                player.set_pause(is_paused)

            elif msg_type == "room.countdown_cancelled":
                cancelled_by = payload.get("cancelledBy") or "User"
                print_log("ACTION", f"Countdown cancelled by {cancelled_by}", "\033[90m")

    except KeyboardInterrupt:
        print("\n" + "─" * 45)
        print_log("EXIT", "Shutting down sync companion...", "\033[93m")
    finally:
        ws.close()
        player.close()
        print_log("DONE", "Disconnected safely. Goodbye!", "\033[92m")


if __name__ == "__main__":
    main()
