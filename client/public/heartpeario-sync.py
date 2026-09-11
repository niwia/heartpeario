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
    def __init__(self, ipc_path="/tmp/heartpeario-mpv.sock"):
        self.ipc_path = ipc_path
        self.proc = None
        self.sock = None
        self.is_paused = True
        self.current_url = None

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
        self.sock.settimeout(2.0)

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
        self.send_cmd(["loadfile", url, "replace"])
        if title:
            self.send_cmd(["set_property", "force-media-title", title])
        self.set_pause(True)

    def set_pause(self, paused):
        self.is_paused = paused
        self.send_cmd(["set_property", "pause", paused])

    def seek(self, seconds):
        self.send_cmd(["seek", max(0, seconds), "absolute"])

    def get_time(self):
        try:
            self.send_cmd(["get_property", "time-pos"])
            # Reading response could block, handled if needed
        except Exception:
            pass
        return 0

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

    # Initialize Player Controller
    if player_choice == "mpv":
        player = MpvController()
    else:
        player = VlcController()

    print_log("LAUNCH", f"Starting local {player_choice.upper()} instance...", "\033[96m")
    try:
        player.start()
    except Exception as e:
        print_log("ERROR", f"Failed to start player: {e}", "\033[91m")
        sys.exit(1)

    # Connect WebSocket
    ws = SimpleWebSocketClient(args.url)
    try:
        print_log("NETWORK", f"Connecting to HeartPeario WebSocket...", "\033[94m")
        ws.connect()
    except Exception as e:
        print_log("ERROR", f"Failed to connect to {args.url}: {e}", "\033[91m")
        player.close()
        sys.exit(1)

    # Send Join
    ws.send(json.dumps({"type": "user.rename", "payload": {"name": display_name}}))
    ws.send(json.dumps({
        "type": "room.join",
        "payload": {
            "roomId": args.room.upper(),
            "isExternalPlayer": True,
            "playerType": player_choice,
        }
    }))

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

            # Synchronized countdown action (PLAY / PAUSE / SEEK)
            elif msg_type == "player.countdown_action":
                action = payload.get("action")
                target_time = payload.get("time") or 0
                initiator = payload.get("initiator") or "Host"

                if action == "PLAY":
                    print_log("ACTION", f"▶ PLAY at {int(target_time)}s (by {initiator})", "\033[92m")
                    player.seek(target_time)
                    player.set_pause(False)
                elif action == "PAUSE":
                    print_log("ACTION", f"⏸ PAUSE at {int(target_time)}s (by {initiator})", "\033[93m")
                    player.seek(target_time)
                    player.set_pause(True)

            # Instant sync packet
            elif msg_type == "player.sync":
                is_paused = payload.get("paused", True)
                target_time = payload.get("time", 0)
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
