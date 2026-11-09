#!/usr/bin/env python3
"""Native messaging host for the Profile Switcher extension.

One copy of this process runs per Chrome profile (each profile's extension
connects to it). Each copy:
  - answers "list": reads Chrome's Local State for all profiles + pictures
  - listens on a Unix socket named after its own profile, so other profiles
    can ask it to bring this profile's window to the front
  - answers "switch": pokes the target profile's socket; if nobody answers
    (profile not open / extension not running there), launches Chrome with
    --profile-directory, which opens a window in that profile.
Standard library only.
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import threading

CHROME_DIR = os.path.expanduser("~/Library/Application Support/Google/Chrome")
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SOCK_DIR = os.environ.get("CPS_SOCK_DIR") or os.path.expanduser("~/.chrome-profile-switcher/sockets")

_out_lock = threading.Lock()
_self_dir = None
_server = None


# ---------- native messaging framing ----------

def send(msg):
    data = json.dumps(msg).encode("utf-8")
    with _out_lock:
        sys.stdout.buffer.write(struct.pack("@I", len(data)))
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (n,) = struct.unpack("@I", raw)
    return json.loads(sys.stdin.buffer.read(n).decode("utf-8"))


# ---------- profiles ----------

def load_info_cache():
    with open(os.path.join(CHROME_DIR, "Local State"), encoding="utf-8") as f:
        state = json.load(f)
    prof = state.get("profile", {})
    return prof.get("info_cache", {}), prof.get("profiles_order") or []


def argb_to_css(v):
    if not isinstance(v, int):
        return None
    return "#%06x" % (v & 0xFFFFFF)


def picture_data_url(profile_dir, info):
    name = info.get("gaia_picture_file_name")
    if not name:
        return None
    path = os.path.join(CHROME_DIR, profile_dir, os.path.basename(name))
    try:
        with open(path, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    except OSError:
        return None


def list_profiles():
    cache, order = load_info_cache()
    dirs = [d for d in order if d in cache] + sorted(
        (d for d in cache if d not in order),
        key=lambda d: (len(d), d),
    )
    out = []
    for d in dirs:
        info = cache[d]
        out.append({
            "dir": d,
            "name": info.get("name") or d,
            "email": info.get("user_name") or "",
            "avatar": picture_data_url(d, info),
            "color": argb_to_css(info.get("profile_highlight_color") or info.get("default_avatar_fill_color")),
            "live": is_live(d),
        })
    return out


# ---------- cross-profile sockets ----------

def sock_path(profile_dir):
    return os.path.join(SOCK_DIR, profile_dir.replace("/", "_") + ".sock")


def poke(profile_dir, cmd):
    """Send a one-line command to another profile's host. True if it answered."""
    path = sock_path(profile_dir)
    if not os.path.exists(path):
        return False
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(0.5)
    try:
        s.connect(path)
        s.sendall((cmd + "\n").encode())
        return s.recv(16).startswith(b"ok")
    except OSError:
        # stale socket left by a crashed host
        try:
            os.unlink(path)
        except OSError:
            pass
        return False
    finally:
        s.close()


def is_live(profile_dir):
    return profile_dir == _self_dir or poke(profile_dir, "ping")


def serve(profile_dir):
    global _server
    os.makedirs(SOCK_DIR, mode=0o700, exist_ok=True)
    path = sock_path(profile_dir)
    try:
        os.unlink(path)
    except OSError:
        pass
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(path)
    os.chmod(path, 0o600)
    srv.listen(8)
    _server = (srv, path)

    def loop():
        while True:
            try:
                conn, _ = srv.accept()
            except OSError:
                return
            with conn:
                try:
                    conn.settimeout(0.5)
                    cmd = conn.recv(64).decode(errors="ignore").strip()
                    if cmd == "focus":
                        send({"type": "focus"})
                    conn.sendall(b"ok\n")
                except OSError:
                    pass

    threading.Thread(target=loop, daemon=True).start()


def cleanup():
    if _server:
        srv, path = _server
        srv.close()
        try:
            os.unlink(path)
        except OSError:
            pass


def switch_to(profile_dir):
    cache, _ = load_info_cache()
    if profile_dir not in cache:
        return {"error": "unknown profile %r" % profile_dir}
    if profile_dir == _self_dir:
        send({"type": "focus"})
        return {"ok": True, "mode": "self"}
    if poke(profile_dir, "focus"):
        return {"ok": True, "mode": "focused"}
    # Not running there: ask Chrome to open a window in that profile.
    # If Chrome is already running, this hands off to it and exits immediately.
    subprocess.Popen(
        [CHROME_BIN, "--profile-directory=" + profile_dir],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"ok": True, "mode": "launched"}


# ---------- main loop ----------

def handle(msg):
    global _self_dir
    t = msg.get("type")
    if t == "hello":
        d = msg.get("profileDir")
        if d and d != _self_dir:
            cleanup()
            _self_dir = None
            serve(d)
            _self_dir = d
        return {"ok": True}
    if t == "list":
        return {"profiles": list_profiles(), "self": _self_dir}
    if t == "identify":
        email = (msg.get("email") or "").lower()
        cache, _ = load_info_cache()
        return {"dirs": [d for d, i in cache.items() if email and (i.get("user_name") or "").lower() == email]}
    if t == "switch":
        return switch_to(msg.get("profileDir"))
    return {"error": "unknown message type %r" % t}


def main():
    try:
        while True:
            msg = read()
            if msg is None:
                break
            try:
                reply = handle(msg)
            except Exception as e:  # keep the host alive on bad input
                reply = {"error": "%s: %s" % (type(e).__name__, e)}
            reply["id"] = msg.get("id")
            send(reply)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
