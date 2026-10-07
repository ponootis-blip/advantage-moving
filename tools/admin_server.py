#!/usr/bin/env python3
"""Local preview server for the site admin.

Serves this folder and lets /admin/ save rebuilt files straight to disk, so the
site can be edited and previewed without GitHub. Listens on localhost only.

    python3 tools/admin_server.py            # http://localhost:8123/admin/
    python3 tools/admin_server.py --port 9000
"""
import argparse
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Only files the admin builder owns may be written.
ALLOWED = re.compile(r"^(?:[a-z0-9-]+\.html|sitemap\.xml|robots\.txt|data/site\.json)$")
MAX_BYTES = 5 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/__admin/ping":
            return self._json(200, {"ok": True})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/__admin/save":
            return self._json(404, {"error": "Not found"})
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return self._json(403, {"error": "Local requests only"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BYTES:
            return self._json(413, {"error": "Too large"})
        try:
            files = json.loads(self.rfile.read(length))["files"]
        except (ValueError, KeyError):
            return self._json(400, {"error": "Expected {\"files\": {path: content}}"})
        bad = [p for p in files if not ALLOWED.match(p)]
        if bad:
            return self._json(400, {"error": "Not allowed: " + ", ".join(bad)})
        for path, content in files.items():
            target = ROOT / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        self.log_message("admin saved %d files: %s", len(files), ", ".join(files))
        return self._json(200, {"saved": sorted(files)})


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8123)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(ROOT)))
    print(f"Admin preview: http://localhost:{args.port}/admin/  (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()
