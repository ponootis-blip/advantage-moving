# Self-hosted customer chat

The quote form still uses Formspree. Chat is a separate application owned by Advantage Moving; no hosted chat vendor handles conversations. There are two deployment options: the Cloudflare Worker with D1 storage, or the original Python/SQLite server described below.

## Cloudflare free-tier deployment

`chat_worker/` contains the Worker API and `schema.sql`. The Cloudflare account's `advantage-chat` D1 database holds conversations, messages, staff sessions, and rate limits. The GitHub Pages site remains static. The Worker serves the private inbox at `/admin/chat`, and both visitor and staff clients automatically check for new messages (7 and 5 seconds respectively). This is near-live polling, not SSE; the Python option below retains SSE.

In Cloudflare Workers & Pages, connect only `ponootis-blip/advantage-moving` and create the `advantage-chat` Worker with root path `/chat_worker/`, build command `npm run build`, and deploy command `npx wrangler deploy`. Its `wrangler.jsonc` binds D1 as `CHAT_DB`; `chat_server/ui` is deployed as Worker static assets for the staff inbox. Import `chat_worker/schema.sql` into D1 once before accepting traffic.

Set `CHAT_ADMIN_PASSWORD` as a **Worker secret** in Cloudflare's Worker settings, never as a build variable, committed file, or website JavaScript. It must be a unique password of at least 16 characters. Until it is set, the Worker intentionally returns HTTP 503 and the public chat launcher remains hidden. The password is needed at `https://advantage-chat.ponootis.workers.dev/admin/chat`. Rotating it invalidates existing staff cookies.

Only after a visitor-to-staff-to-visitor test succeeds, set `window.ADVANTAGE_CHAT_API` in `chat-config.js` to `https://advantage-chat.ponootis.workers.dev` and publish the site. The Worker allows the `https://ponootis-blip.github.io` origin, so add a future custom domain to its allowlist before switching the site. Cloudflare's free-tier request and D1 limits apply; monitor usage in the dashboard. No automatic email/SMS alert exists yet, so staff must keep the inbox open to see unread messages.

Worker tests: `node --test chat_worker/test_worker.mjs`. The test uses an in-memory SQLite stand-in for D1 and does not access production data. Also run the live browser acceptance flow before enabling the widget.

## Original Python deployment

## What runs where

- GitHub Pages continues to serve the static website.
- For the Python option, a company-controlled HTTPS server runs `chat_server.app`. It owns the API, message database, staff sessions, and the private inbox at `/admin/chat`.
- `nav.js` loads `chat-config.js`. The widget loads only when that file contains an HTTPS chat server origin, or when the site itself is being served locally by the chat server. If the API health check fails, the launcher is not shown.
- The old `/admin/` static site editor uses a browser-side password and a GitHub token. It is **not** the chat inbox and does not authenticate chat staff.

GitHub Pages cannot run Python or SQLite. The public chat button must stay disabled until one HTTPS backend is operating and its address is added to `chat-config.js`.

## Local end-to-end test

From the repository root, set a strong test-only password and start the server:

```sh
CHAT_ADMIN_PASSWORD='a-unique-local-test-password' python3 -m chat_server.app --port 8124
```

The database defaults to the current user's private `~/.local/share/advantage-chat/chat.sqlite3`. Set `CHAT_DB_PATH` to an explicit private path for an isolated test database. Open `http://127.0.0.1:8124/index.html` for the website and `http://127.0.0.1:8124/admin/chat` for the staff inbox. Local HTTP is for development only. The configured staff password must be at least 16 characters. There is no default production password.

Run checks:

```sh
python3 -m unittest chat_server.test_chat -v
node tests/site.test.js
node tests/quote-logic.test.js
```

The HTTP tests use a temporary SQLite database and a test-only password. They do not submit a quote or contact a real customer.

## Public deployment

Use an HTTPS reverse proxy on a host the company controls. Keep the Python process bound to `127.0.0.1` behind it. Preserve the public `Host` header, set `X-Forwarded-For` to the actual client IP (overwriting any visitor-supplied value), turn off response buffering for `text/event-stream`, and permit streams longer than 50 seconds. Run the process under a service manager so it restarts after a machine reboot. Back up the database file and restrict access to its directory.

Provide these environment variables to the service manager, not to website JavaScript or a committed file:

| Variable | Purpose |
| --- | --- |
| `CHAT_ADMIN_PASSWORD` | A unique staff password, 16 characters minimum. Required. |
| `CHAT_DB_PATH` | Persistent SQLite location outside the public web root. |
| `CHAT_COOKIE_SECURE=1` | Required for public use behind HTTPS. |
| `CHAT_ALLOWED_ORIGINS` | Comma-separated website origins permitted to use the public API, such as `https://ponootis-blip.github.io` and the eventual custom domain. |

After the HTTPS API is reachable, set the public server origin in `chat-config.js`, for example `https://chat.example.com` (no trailing path). Publish the static site. Verify that the widget opens, a visitor message reaches the inbox, and a CSR reply appears in the visitor panel. The staff inbox is `https://chat.example.com/admin/chat`. Do not point the public site at a localhost address.

The API has no automatic email or phone notifications in this version. Keep the inbox open to see its live unread count. Chat messages are retained in SQLite until the company deletes them; there is no automatic retention purge. The site's privacy policy now describes chat storage and the browser's anonymous session key; confirm that policy with the company before activation.

## API and security

Public routes: `POST /api/chat/session`, `POST /api/chat/message`, `GET /api/chat/conversation/{public_id}`, `GET /api/chat/events`, and `GET /api/chat/health`. Each visitor receives an opaque conversation ID and a separate secret token kept in that browser's local storage. The token is required to retrieve or send messages. The SSE stream carries change notices; messages are fetched through the authenticated conversation route.

Staff routes: `POST /api/admin/chat/login`, `POST /api/admin/chat/logout`, `GET /api/admin/chat/me`, `GET /api/admin/chat/conversations`, `GET /api/admin/chat/conversations/{public_id}`, `POST /api/admin/chat/conversations/{public_id}/message`, `/read`, `/close`, and `GET /api/admin/chat/events`. Staff sessions use an HttpOnly, SameSite cookie; state-changing requests also require the session's CSRF token and same origin. A visitor's token does not authorize staff routes.

The server limits message length and request rates, uses parameterized SQLite queries, and never renders visitor text as HTML. The database, password, and staff cookies are never included in the public website bundle. Retry IDs prevent duplicate messages if a response is lost.

This server runs as one Python process. If future traffic requires multiple application processes, the in-memory SSE event notifier and rate limiter need a shared mechanism first; SQLite persistence alone does not provide cross-process event broadcasts.
