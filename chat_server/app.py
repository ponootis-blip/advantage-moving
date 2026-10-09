"""Small SQLite-backed HTTP and SSE chat server. No third-party dependencies.

Run from the repository root with:
    CHAT_ADMIN_PASSWORD='a long unique password' python3 -m chat_server.app

Place behind an HTTPS reverse proxy for public use. The old static editor's
browser-only sign-in is intentionally unrelated to this authenticated inbox.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ASSETS = Path(__file__).resolve().parent / "ui"
PUBLIC_ID = re.compile(r"^[A-Za-z0-9_-]{24,80}$")
CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{8,80}$")
MAX_BODY = 8192
SESSION_SECONDS = 12 * 60 * 60


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Limit:
    def __init__(self):
        self.lock = threading.Lock()
        self.hits = defaultdict(deque)
        self.calls = 0

    def allow(self, key: tuple, max_hits: int, period: int) -> bool:
        t = time.monotonic()
        with self.lock:
            values = self.hits[key]
            while values and values[0] <= t - period:
                values.popleft()
            if len(values) >= max_hits:
                return False
            values.append(t)
            self.calls += 1
            if self.calls % 1024 == 0:
                for old_key, old_values in list(self.hits.items()):
                    if not old_values or old_values[-1] < t - 3600:
                        del self.hits[old_key]
            return True


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        self.change = threading.Condition(self.lock)
        self.version = 0
        with self.conn() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY,
                    public_id TEXT NOT NULL UNIQUE,
                    visitor_token_hash TEXT NOT NULL,
                    visitor_name TEXT NOT NULL DEFAULT '',
                    visitor_email TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_message_at TEXT
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY,
                    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
                    sender_type TEXT NOT NULL CHECK(sender_type IN ('visitor','agent')),
                    body TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    read_at TEXT,
                    UNIQUE(conversation_id, sender_type, client_id)
                );
                CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id,id);
                CREATE TABLE IF NOT EXISTS agent_sessions (
                    token_hash TEXT PRIMARY KEY,
                    csrf TEXT NOT NULL,
                    expires_at INTEGER NOT NULL
                );
            """)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    @contextmanager
    def conn(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        try:
            with db:
                yield db
        finally:
            db.close()

    def changed(self):
        with self.change:
            self.version += 1
            self.change.notify_all()

    @staticmethod
    def safe_message(row):
        return {key: row[key] for key in ("id", "sender_type", "body", "created_at", "read_at")}

    def create(self):
        public_id, token = secrets.token_urlsafe(24), secrets.token_urlsafe(32)
        stamp = now()
        with self.lock, self.conn() as db:
            db.execute("INSERT INTO conversations (public_id,visitor_token_hash,created_at,updated_at) VALUES (?,?,?,?)",
                       (public_id, digest(token), stamp, stamp))
        self.changed()
        return public_id, token

    def visitor(self, public_id, token):
        if not PUBLIC_ID.fullmatch(public_id or "") or not token or len(token) > 160:
            return None
        with self.conn() as db:
            row = db.execute("SELECT * FROM conversations WHERE public_id=?", (public_id,)).fetchone()
        if row is None or not hmac.compare_digest(row["visitor_token_hash"], digest(token)):
            return None
        return row

    def conversation(self, public_id, token=None, agent=False):
        row = self.visitor(public_id, token) if not agent else self.agent_conversation(public_id)
        if row is None:
            return None
        with self.conn() as db:
            messages = db.execute("SELECT id,sender_type,body,created_at,read_at FROM messages WHERE conversation_id=? ORDER BY id",
                                  (row["id"],)).fetchall()
        return {"public_id": row["public_id"], "visitor_name": row["visitor_name"],
                "visitor_email": row["visitor_email"] if agent else "",
                "status": row["status"], "messages": [self.safe_message(m) for m in messages]}

    def agent_conversation(self, public_id):
        if not PUBLIC_ID.fullmatch(public_id or ""):
            return None
        with self.conn() as db:
            return db.execute("SELECT * FROM conversations WHERE public_id=?", (public_id,)).fetchone()

    def post(self, public_id, sender, body, client_id, token=None):
        row = self.visitor(public_id, token) if sender == "visitor" else self.agent_conversation(public_id)
        if row is None:
            return None
        with self.lock, self.conn() as db:
            existing = db.execute("SELECT id,sender_type,body,created_at,read_at FROM messages WHERE conversation_id=? AND sender_type=? AND client_id=?",
                                  (row["id"], sender, client_id)).fetchone()
            if existing is not None:
                return self.safe_message(existing)
            stamp = now()
            cursor = db.execute("INSERT INTO messages (conversation_id,sender_type,body,client_id,created_at) VALUES (?,?,?,?,?)",
                                (row["id"], sender, body, client_id, stamp))
            db.execute("UPDATE conversations SET status='open',updated_at=?,last_message_at=? WHERE id=?",
                       (stamp, stamp, row["id"]))
            item = db.execute("SELECT id,sender_type,body,created_at,read_at FROM messages WHERE id=?", (cursor.lastrowid,)).fetchone()
        self.changed()
        return self.safe_message(item)

    def list_conversations(self):
        with self.conn() as db:
            rows = db.execute("""SELECT c.public_id,c.visitor_name,c.visitor_email,c.status,c.created_at,c.last_message_at,
               (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) last_body,
               (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND sender_type='visitor' AND read_at IS NULL) unread
               FROM conversations c ORDER BY COALESCE(c.last_message_at,c.created_at) DESC""").fetchall()
        return [dict(row) for row in rows]

    def mark_read(self, public_id):
        row = self.agent_conversation(public_id)
        if row is None:
            return False
        with self.lock, self.conn() as db:
            updated = db.execute("UPDATE messages SET read_at=? WHERE conversation_id=? AND sender_type='visitor' AND read_at IS NULL",
                                 (now(), row["id"])).rowcount
        if updated:
            self.changed()
        return True

    def close(self, public_id):
        row = self.agent_conversation(public_id)
        if row is None:
            return False
        with self.lock, self.conn() as db:
            db.execute("UPDATE conversations SET status='closed',updated_at=? WHERE id=?", (now(), row["id"]))
        self.changed()
        return True

    def login(self):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
        expiry = int(time.time()) + SESSION_SECONDS
        with self.conn() as db:
            db.execute("DELETE FROM agent_sessions WHERE expires_at<?", (int(time.time()),))
            db.execute("INSERT INTO agent_sessions VALUES (?,?,?)", (digest(token), csrf, expiry))
        return token, csrf

    def session(self, token):
        if not token or len(token) > 160:
            return None
        with self.conn() as db:
            return db.execute("SELECT csrf,expires_at FROM agent_sessions WHERE token_hash=? AND expires_at>?",
                              (digest(token), int(time.time()))).fetchone()

    def logout(self, token):
        with self.conn() as db:
            db.execute("DELETE FROM agent_sessions WHERE token_hash=?", (digest(token),))


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class ChatHTTP(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, store, password, origins, cookie_secure):
        self.store = store
        self.password = password
        self.origins = set(origins)
        self.cookie_secure = cookie_secure
        self.limits = Limit()
        # A restart or password rotation ends previous staff sessions.
        with store.conn() as db:
            db.execute("DELETE FROM agent_sessions")
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server: ChatHTTP
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_request(self, code="-", size="-"):
        # BaseHTTPRequestHandler otherwise logs the full path, including query data.
        self.log_message("%s %s", self.command, code)

    def log_message(self, fmt, *args):
        # Paths may contain visitor identifiers; never log URL query values.
        print(f"[{now()}] {self.client_address[0]} {fmt % args}")

    def _origin(self):
        return self.headers.get("Origin", "")

    def _client_ip(self):
        # The public server normally listens only on loopback behind a reverse
        # proxy. Use its forwarded client address for fair per-visitor limits.
        peer = self.client_address[0]
        if peer in ("127.0.0.1", "::1"):
            forwarded = self.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
            try:
                return str(ipaddress.ip_address(forwarded))
            except ValueError:
                pass
        return peer

    def _public_origin_ok(self):
        origin = self._origin()
        return not origin or origin in self.server.origins or origin == self._self_origin()

    def _self_origin(self):
        host = self.headers.get("Host", "")
        scheme = "https" if self.server.cookie_secure else "http"
        return f"{scheme}://{host}"

    def _agent_origin_ok(self):
        return self._origin() == self._self_origin()

    def _headers(self, status, kind="application/json; charset=utf-8", length=0, cookie=None, cors=False, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        if urlsplit(self.path).path.startswith(("/admin/chat", "/chat-assets/")):
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'")
        if cors and self._origin() in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", self._origin())
            self.send_header("Vary", "Origin")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()

    def _json(self, status, payload, cors=False, cookie=None):
        data = json.dumps(payload, separators=(",", ":")).encode()
        self._headers(status, length=len(data), cors=cors, cookie=cookie)
        self.wfile.write(data)

    def _read_json(self):
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            raise ValueError("Use application/json")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid content length")
        if length < 1 or length > MAX_BODY:
            raise ValueError("Request too large or empty")
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeError, json.JSONDecodeError):
            raise ValueError("Invalid JSON")
        if not isinstance(value, dict):
            raise ValueError("Expected an object")
        return value

    def _cookie_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            return cookie["adv_chat_admin"].value if "adv_chat_admin" in cookie else ""
        except Exception:
            return ""

    def _agent(self, mutate=False):
        session = self.server.store.session(self._cookie_token())
        if session is None:
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "Sign in required"})
            return False
        if mutate and (not self._agent_origin_ok() or not hmac.compare_digest(
                self.headers.get("X-CSRF-Token", ""), session["csrf"])):
            self._json(HTTPStatus.FORBIDDEN, {"error": "Invalid request"})
            return False
        return True

    def _visitor(self, public_id):
        token = self.headers.get("X-Chat-Token", "")
        if self.server.store.visitor(public_id, token) is None:
            self._json(HTTPStatus.NOT_FOUND, {"error": "Conversation unavailable"}, cors=True)
            return None
        return token

    def _send_file(self, file):
        data = file.read_bytes()
        kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        if kind.startswith("text/") or kind in ("application/javascript", "application/json"):
            kind += "; charset=utf-8"
        self._headers(200, kind, len(data), extra={"Cache-Control": "private, max-age=300"})
        self.wfile.write(data)

    def do_OPTIONS(self):
        path = urlsplit(self.path).path
        if not path.startswith("/api/chat/") or not self._public_origin_ok():
            return self._json(403, {"error": "Origin not allowed"})
        self.send_response(204)
        origin = self._origin()
        if origin in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Chat-Token")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/chat/health":
            return self._json(200, {"ok": True}, cors=True)
        if path == "/admin/chat/login":
            return self._send_file(ASSETS / "login.html")
        if path == "/admin/chat":
            if self.server.store.session(self._cookie_token()) is None:
                self.send_response(303)
                self.send_header("Location", "/admin/chat/login")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            return self._send_file(ASSETS / "inbox.html")
        if path.startswith("/chat-assets/"):
            file = (ASSETS / unquote(path.removeprefix("/chat-assets/"))).resolve()
            if file.parent == ASSETS and file.name in ("inbox.js", "inbox.css", "login.js", "login.css") and file.is_file():
                return self._send_file(file)
            return self._json(404, {"error": "Not found"})
        if path == "/api/admin/chat/me":
            if not self._agent(): return
            return self._json(200, {"csrf": self.server.store.session(self._cookie_token())["csrf"]})
        if path == "/api/admin/chat/conversations":
            if not self._agent(): return
            return self._json(200, {"conversations": self.server.store.list_conversations()})
        match = re.fullmatch(r"/api/admin/chat/conversations/([^/]+)", path)
        if match:
            if not self._agent(): return
            item = self.server.store.conversation(match[1], agent=True)
            return self._json(200, item) if item else self._json(404, {"error": "Not found"})
        match = re.fullmatch(r"/api/chat/conversation/([^/]+)", path)
        if match:
            if not self._public_origin_ok(): return self._json(403, {"error": "Origin not allowed"}, cors=True)
            token = self._visitor(match[1])
            if token is None: return
            return self._json(200, self.server.store.conversation(match[1], token), cors=True)
        if path == "/api/chat/events":
            return self._events(agent=False)
        if path == "/api/admin/chat/events":
            return self._events(agent=True)
        if path == "/" or path.endswith(".html") or path.endswith((".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".txt", ".xml")):
            relative = unquote(path.lstrip("/") or "index.html")
            file = (ROOT / relative).resolve()
            if ROOT not in file.parents or not file.is_file() or relative.startswith(("admin/", "chat_server/", "tools/", "tests/", "data/", ".")):
                return self._json(404, {"error": "Not found"})
            return self._send_file(file)
        return self._json(404, {"error": "Not found"})

    def _events(self, agent):
        if agent:
            if not self._agent(): return
            public_id = None
            agent_token = self._cookie_token()
        else:
            if not self._public_origin_ok(): return self._json(403, {"error": "Origin not allowed"}, cors=True)
            public_id = parse_qs(urlsplit(self.path).query).get("public_id", [""])[0]
            if self._visitor(public_id) is None: return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        if not agent and self._origin() in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", self._origin())
            self.send_header("Vary", "Origin")
        self.end_headers()
        store = self.server.store
        seen = store.version
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            until = time.monotonic() + 50
            while time.monotonic() < until:
                if agent and store.session(agent_token) is None:
                    break
                with store.change:
                    if store.version == seen:
                        store.change.wait(timeout=12)
                    changed = store.version != seen
                    seen = store.version
                # Never send message bodies in broadcast events. Clients fetch under authorization.
                self.wfile.write(b"event: changed\ndata: {}\n\n" if changed else b": keepalive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def do_POST(self):
        path = urlsplit(self.path).path
        cors = path.startswith("/api/chat/")
        if cors and not self._public_origin_ok():
            self.close_connection = True
            return self._json(403, {"error": "Origin not allowed"}, cors=True)
        try:
            payload = self._read_json()
        except ValueError as exc:
            # An unread or malformed request body must not become the next
            # request on a persistent HTTP connection.
            self.close_connection = True
            return self._json(400, {"error": str(exc)}, cors=cors)
        ip = self._client_ip()
        store = self.server.store
        if path == "/api/chat/session":
            if not self.server.limits.allow(("new", ip), 12, 3600):
                return self._json(429, {"error": "Please try again later"}, cors=True)
            public_id, token = store.create()
            return self._json(201, {"public_id": public_id, "token": token}, cors=True)
        if path == "/api/chat/message":
            public_id, token = payload.get("public_id"), self.headers.get("X-Chat-Token", "")
            if store.visitor(public_id, token) is None:
                return self._json(404, {"error": "Conversation unavailable"}, cors=True)
            if not self.server.limits.allow(("visitor", public_id), 30, 60) or not self.server.limits.allow(("ip", ip), 120, 3600):
                return self._json(429, {"error": "Please wait before sending again"}, cors=True)
            body, client_id = payload.get("body"), payload.get("client_id")
            if not isinstance(body, str) or not 1 <= len(body.strip()) <= 2000 or not CLIENT_ID.fullmatch(client_id or ""):
                return self._json(400, {"error": "Use 1–2000 characters"}, cors=True)
            item = store.post(public_id, "visitor", body.strip(), client_id, token)
            return self._json(201, {"message": item}, cors=True)
        if path == "/api/admin/chat/login":
            if not self._agent_origin_ok(): return self._json(403, {"error": "Origin not allowed"})
            if not self.server.limits.allow(("login", ip), 6, 900):
                return self._json(429, {"error": "Too many attempts; try later"})
            password = payload.get("password")
            if not isinstance(password, str) or not hmac.compare_digest(password, self.server.password):
                return self._json(401, {"error": "Incorrect password"})
            token, csrf = store.login()
            secure = "; Secure" if self.server.cookie_secure else ""
            cookie = f"adv_chat_admin={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_SECONDS}{secure}"
            return self._json(200, {"csrf": csrf}, cookie=cookie)
        if path == "/api/admin/chat/logout":
            if not self._agent(mutate=True): return
            store.logout(self._cookie_token())
            secure = "; Secure" if self.server.cookie_secure else ""
            return self._json(200, {"ok": True}, cookie=f"adv_chat_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0{secure}")
        match = re.fullmatch(r"/api/admin/chat/conversations/([^/]+)/(message|read|close)", path)
        if match:
            if not self._agent(mutate=True): return
            public_id, action = match.groups()
            if store.agent_conversation(public_id) is None:
                return self._json(404, {"error": "Not found"})
            if action == "message":
                body, client_id = payload.get("body"), payload.get("client_id")
                if not isinstance(body, str) or not 1 <= len(body.strip()) <= 2000 or not CLIENT_ID.fullmatch(client_id or ""):
                    return self._json(400, {"error": "Use 1–2000 characters"})
                item = store.post(public_id, "agent", body.strip(), client_id)
                return self._json(201, {"message": item})
            ok = store.mark_read(public_id) if action == "read" else store.close(public_id)
            return self._json(200 if ok else 404, {"ok": ok})
        return self._json(404, {"error": "Not found"}, cors=cors)


def main():
    parser = argparse.ArgumentParser(description="Self-hosted Advantage Moving chat")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8124)
    args = parser.parse_args()
    password = os.environ.get("CHAT_ADMIN_PASSWORD", "")
    if len(password) < 16:
        parser.error("CHAT_ADMIN_PASSWORD must be a unique password of at least 16 characters")
    data_path = Path(os.environ.get("CHAT_DB_PATH", str(Path.home() / ".local/share/advantage-chat/chat.sqlite3")))
    origins = [item.strip() for item in os.environ.get("CHAT_ALLOWED_ORIGINS", "https://ponootis-blip.github.io").split(",") if item.strip()]
    secure = os.environ.get("CHAT_COOKIE_SECURE", "0") == "1"
    if args.host not in ("127.0.0.1", "::1", "localhost") and not secure:
        parser.error("Public binding requires CHAT_COOKIE_SECURE=1 and an HTTPS reverse proxy")
    server = ChatHTTP((args.host, args.port), Store(data_path), password, origins, secure)
    print(f"Chat server: http://{args.host}:{args.port} | inbox: /admin/chat", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
