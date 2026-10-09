"""Focused HTTP, persistence, isolation, and realtime tests for the chat server."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from chat_server.app import ChatHTTP, Store


class ChatFlow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "chat.sqlite3"
        self.server = ChatHTTP(("127.0.0.1", 0), Store(self.database), "test-password-at-least-sixteen", [], False)
        self.port = self.server.server_address[1]
        self.origin = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def call(self, method, path, data=None, token=None, cookie=None, csrf=None, origin=None, forwarded=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Origin": origin or self.origin}
        if data is not None:
            data = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["X-Chat-Token"] = token
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-CSRF-Token"] = csrf
        if forwarded:
            headers["X-Forwarded-For"] = forwarded
        conn.request(method, path, body=data, headers=headers)
        response = conn.getresponse()
        payload = response.read()
        result = (response.status, json.loads(payload) if payload else {}, dict(response.getheaders()))
        conn.close()
        return result

    def test_public_to_agent_reply_persists_and_isolated(self):
        a = self.call("POST", "/api/chat/session", {})[1]
        b = self.call("POST", "/api/chat/session", {})[1]
        text = "<script>alert('x')</script> Hello"
        sent = self.call("POST", "/api/chat/message", {"public_id": a["public_id"], "body": text,
                "client_id": "visitor-first"}, token=a["token"])
        self.assertEqual(sent[0], 201)
        self.assertEqual(sent[1]["message"]["body"], text)
        duplicate = self.call("POST", "/api/chat/message", {"public_id": a["public_id"], "body": text,
                "client_id": "visitor-first"}, token=a["token"])
        self.assertEqual(duplicate[1]["message"]["id"], sent[1]["message"]["id"])
        self.assertEqual(self.call("GET", f"/api/chat/conversation/{a['public_id']}", token=b["token"])[0], 404)
        self.assertEqual(self.call("GET", f"/api/chat/conversation/{a['public_id']}")[0], 404)
        self.assertEqual(self.call("GET", "/api/admin/chat/conversations")[0], 401)
        self.assertEqual(self.call("GET", "/admin/chat")[0], 303)
        self.assertEqual(self.call("POST", "/api/admin/chat/login", {"password": "wrong"})[0], 401)
        login = self.call("POST", "/api/admin/chat/login", {"password": "test-password-at-least-sixteen"})
        self.assertEqual(login[0], 200)
        cookie = login[2]["Set-Cookie"].split(";", 1)[0]
        self.assertIn("HttpOnly", login[2]["Set-Cookie"])
        csrf = login[1]["csrf"]
        self.assertEqual(self.call("POST", f"/api/admin/chat/conversations/{a['public_id']}/read", {}, cookie=cookie)[0], 403)
        listing = self.call("GET", "/api/admin/chat/conversations", cookie=cookie)[1]["conversations"]
        self.assertEqual(next(c for c in listing if c["public_id"] == a["public_id"])["unread"], 1)
        self.assertEqual(self.call("GET", f"/api/admin/chat/conversations/{a['public_id']}", cookie=cookie)[1]["messages"][0]["body"], text)
        self.assertEqual(self.call("POST", f"/api/admin/chat/conversations/{a['public_id']}/read", {}, cookie=cookie, csrf=csrf)[0], 200)
        listing = self.call("GET", "/api/admin/chat/conversations", cookie=cookie)[1]["conversations"]
        self.assertEqual(next(c for c in listing if c["public_id"] == a["public_id"])["unread"], 0)
        reply = self.call("POST", f"/api/admin/chat/conversations/{a['public_id']}/message",
                          {"body": "Hi, how can I help?", "client_id": "agent-first"}, cookie=cookie, csrf=csrf)
        self.assertEqual(reply[0], 201)
        restored = self.call("GET", f"/api/chat/conversation/{a['public_id']}", token=a["token"])[1]
        self.assertEqual([m["body"] for m in restored["messages"]], [text, "Hi, how can I help?"])
        self.assertEqual(self.call("POST", f"/api/admin/chat/conversations/{a['public_id']}/close", {}, cookie=cookie, csrf=csrf)[0], 200)
        self.assertEqual(self.call("GET", f"/api/chat/conversation/{a['public_id']}", token=a["token"])[1]["status"], "closed")
        self.call("POST", "/api/chat/message", {"public_id": a["public_id"], "body": "One more thing", "client_id": "visitor-second"}, token=a["token"])
        self.assertEqual(self.call("GET", f"/api/chat/conversation/{a['public_id']}", token=a["token"])[1]["status"], "open")
        # A fresh database connection after the HTTP exchange sees all messages.
        reopened = Store(self.database)
        self.assertEqual(len(reopened.conversation(a["public_id"], a["token"])["messages"]), 3)
        self.assertEqual(reopened.conversation(b["public_id"], b["token"])["messages"], [])

    def test_sse_change_and_reconnect_history(self):
        visitor = self.call("POST", "/api/chat/session", {})[1]
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/api/chat/events?public_id=" + visitor["public_id"], headers={"X-Chat-Token": visitor["token"], "Origin": self.origin})
        response = conn.getresponse()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.readline(), b": connected\n")
        self.assertEqual(response.readline(), b"\n")
        self.call("POST", "/api/chat/message", {"public_id": visitor["public_id"], "body": "Hello", "client_id": "visitor-first"}, token=visitor["token"])
        self.assertEqual(response.readline(), b"event: changed\n")
        conn.close()
        self.assertEqual(self.call("GET", f"/api/chat/conversation/{visitor['public_id']}", token=visitor["token"])[1]["messages"][0]["body"], "Hello")

    def test_validation_origin_and_static_guard(self):
        visitor = self.call("POST", "/api/chat/session", {})[1]
        self.assertEqual(self.call("POST", "/api/chat/message", {"public_id": visitor["public_id"], "body": "x" * 2001, "client_id": "too-long"}, token=visitor["token"])[0], 400)
        self.assertEqual(self.call("POST", "/api/chat/session", {}, origin="https://untrusted.invalid")[0], 403)
        self.assertEqual(self.call("GET", "/chat_server/app.py")[0], 404)
        self.assertEqual(self.call("GET", "/chat-assets/%2e%2e/chat_server/app.py")[0], 404)

    def test_restart_keeps_conversations_but_ends_staff_sessions(self):
        visitor = self.call("POST", "/api/chat/session", {})[1]
        self.call("POST", "/api/chat/message", {"public_id": visitor["public_id"], "body": "Still here",
                  "client_id": "restart-message"}, token=visitor["token"])
        login = self.call("POST", "/api/admin/chat/login", {"password": "test-password-at-least-sixteen"})
        cookie = login[2]["Set-Cookie"].split(";", 1)[0]
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.server = ChatHTTP(("127.0.0.1", 0), Store(self.database), "test-password-at-least-sixteen", [], False)
        self.port = self.server.server_address[1]
        self.origin = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        restored = self.call("GET", f"/api/chat/conversation/{visitor['public_id']}", token=visitor["token"])
        self.assertEqual(restored[1]["messages"][0]["body"], "Still here")
        self.assertEqual(self.call("GET", "/api/admin/chat/conversations", cookie=cookie)[0], 401)

    def test_proxy_visitors_have_independent_rate_limits(self):
        for _ in range(12):
            self.assertEqual(self.call("POST", "/api/chat/session", {}, forwarded="198.51.100.10")[0], 201)
        self.assertEqual(self.call("POST", "/api/chat/session", {}, forwarded="198.51.100.10")[0], 429)
        self.assertEqual(self.call("POST", "/api/chat/session", {}, forwarded="198.51.100.11")[0], 201)


if __name__ == "__main__":
    unittest.main()
