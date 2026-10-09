// Advantage Moving's own chat API. Cloudflare supplies compute and SQLite;
// no hosted chat provider receives the conversations.
const SITE_ORIGIN = "https://ponootis-blip.github.io";
const SESSION_SECONDS = 12 * 60 * 60;
const PUBLIC_ID = /^[A-Za-z0-9_-]{24,80}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const FILES = new Set(["login.html", "inbox.html", "login.js", "inbox.js", "login.css", "inbox.css"]);

const stamp = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now() / 1000);
const random = (length) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
const error = (status, message) => reply(status, { error: message });
function reply(status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY", ...extra,
  } });
}
function publicHeaders(request) {
  const origin = request.headers.get("Origin");
  return origin === SITE_ORIGIN ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
function publicReply(request, status, payload) { return reply(status, payload, publicHeaders(request)); }
function publicOriginAllowed(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === SITE_ORIGIN || origin === new URL(request.url).origin;
}
function ownOrigin(request) { return request.headers.get("Origin") === new URL(request.url).origin; }
function cookieToken(request) {
  const found = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)adv_chat_admin=([^;]*)/);
  return found ? found[1] : "";
}
function validId(id) { return typeof id === "string" && PUBLIC_ID.test(id); }
function validMessage(body, clientId) {
  return typeof body === "string" && body.trim().length >= 1 && body.trim().length <= 2000 &&
    typeof clientId === "string" && CLIENT_ID.test(clientId);
}
async function jsonBody(request) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) throw new Error("Use application/json");
  const raw = await request.text();
  if (!raw || raw.length > 8192) throw new Error("Request too large or empty");
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value;
}
async function rate(db, key, max, period) {
  const now = seconds(), start = now - period;
  await db.prepare(`INSERT INTO rate_limits(rate_key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(rate_key) DO UPDATE SET
    window_start=CASE WHEN window_start<=? THEN excluded.window_start ELSE window_start END,
    count=CASE WHEN window_start<=? THEN 1 ELSE count+1 END`).bind(key, now, start, start).run();
  const row = await db.prepare("SELECT count FROM rate_limits WHERE rate_key=?").bind(key).first();
  return row.count <= max;
}
async function visitor(db, id, token) {
  if (!validId(id) || typeof token !== "string" || !token || token.length > 160) return null;
  const row = await db.prepare("SELECT * FROM conversations WHERE public_id=?").bind(id).first();
  return row && equal(row.visitor_token_hash, await digest(token)) ? row : null;
}
async function agentSession(request, env) {
  const token = cookieToken(request);
  if (!token || token.length > 160 || !env.CHAT_ADMIN_PASSWORD) return null;
  return env.CHAT_DB.prepare("SELECT csrf FROM agent_sessions WHERE token_hash=? AND expires_at>?")
    .bind(await digest(token + ":" + env.CHAT_ADMIN_PASSWORD), seconds()).first();
}
async function authorizedAgent(request, env, mutate) {
  const session = await agentSession(request, env);
  if (!session) return { response: error(401, "Sign in required") };
  if (mutate && (!ownOrigin(request) || !equal(request.headers.get("X-CSRF-Token"), session.csrf)))
    return { response: error(403, "Invalid request") };
  return { session };
}
async function conversation(db, row, agent) {
  const result = await db.prepare("SELECT id,sender_type,body,created_at,read_at FROM messages WHERE conversation_id=? ORDER BY id").bind(row.id).all();
  return { public_id: row.public_id, visitor_name: row.visitor_name,
    visitor_email: agent ? row.visitor_email : "", status: row.status, messages: result.results };
}
async function existingMessage(db, row, sender, clientId) {
  return db.prepare("SELECT id,sender_type,body,created_at,read_at FROM messages WHERE conversation_id=? AND sender_type=? AND client_id=?")
    .bind(row.id, sender, clientId).first();
}
async function postMessage(db, row, sender, body, clientId) {
  const existing = await existingMessage(db, row, sender, clientId);
  if (existing) return existing;
  const time = stamp();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO messages(conversation_id,sender_type,body,client_id,created_at) VALUES(?,?,?,?,?)")
      .bind(row.id, sender, body.trim(), clientId, time),
    db.prepare("UPDATE conversations SET status='open',updated_at=?,last_message_at=? WHERE id=?")
      .bind(time, time, row.id),
  ]);
  return existingMessage(db, row, sender, clientId);
}
async function adminAsset(request, env, file) {
  if (!FILES.has(file)) return error(404, "Not found");
  const asset = await env.ASSETS.fetch(new Request(new URL("/" + file, request.url)));
  if (!asset.ok) return error(404, "Not found");
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'");
  return new Response(asset.body, { status: asset.status, headers });
}
async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname, db = env.CHAT_DB;
  if (!db) return error(503, "Chat storage unavailable");
  if (!env.CHAT_ADMIN_PASSWORD || env.CHAT_ADMIN_PASSWORD.length < 16)
    return path.startsWith("/api/chat/") ? publicReply(request, 503, { error: "Chat not configured" }) : error(503, "Chat not configured");
  if (request.method === "OPTIONS" && path.startsWith("/api/chat/")) {
    if (!publicOriginAllowed(request)) return error(403, "Origin not allowed");
    return new Response(null, { status: 204, headers: { ...publicHeaders(request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Chat-Token",
      "Access-Control-Max-Age": "600" } });
  }
  if (path.startsWith("/api/chat/") && !publicOriginAllowed(request)) return publicReply(request, 403, { error: "Origin not allowed" });
  if (request.method === "GET") {
    if (path === "/api/chat/health") return publicReply(request, 200, { ok: true, realtime: "poll" });
    if (path === "/admin/chat/login") return adminAsset(request, env, "login.html");
    if (path === "/admin/chat") {
      if (!await agentSession(request, env)) return Response.redirect(new URL("/admin/chat/login", url), 303);
      return adminAsset(request, env, "inbox.html");
    }
    if (path.startsWith("/chat-assets/")) {
      const file = path.slice("/chat-assets/".length);
      if (!/[\\/]/.test(file)) return adminAsset(request, env, file);
      return error(404, "Not found");
    }
    if (path === "/api/admin/chat/me") {
      const { response, session } = await authorizedAgent(request, env, false);
      return response || reply(200, { csrf: session.csrf, realtime: "poll" });
    }
    if (path === "/api/admin/chat/conversations") {
      const { response } = await authorizedAgent(request, env, false); if (response) return response;
      const rows = await db.prepare(`SELECT c.public_id,c.visitor_name,c.visitor_email,c.status,c.created_at,c.last_message_at,
        (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_body,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id AND sender_type='visitor' AND read_at IS NULL) AS unread
        FROM conversations c ORDER BY COALESCE(c.last_message_at,c.created_at) DESC`).all();
      return reply(200, { conversations: rows.results });
    }
    let match = path.match(/^\/api\/admin\/chat\/conversations\/([^/]+)$/);
    if (match) {
      const { response } = await authorizedAgent(request, env, false); if (response) return response;
      const row = validId(match[1]) ? await db.prepare("SELECT * FROM conversations WHERE public_id=?").bind(match[1]).first() : null;
      return row ? reply(200, await conversation(db, row, true)) : error(404, "Not found");
    }
    match = path.match(/^\/api\/chat\/conversation\/([^/]+)$/);
    if (match) {
      const row = await visitor(db, match[1], request.headers.get("X-Chat-Token"));
      return row ? publicReply(request, 200, await conversation(db, row, false)) : publicReply(request, 404, { error: "Conversation unavailable" });
    }
    return error(404, "Not found");
  }
  if (request.method !== "POST") return error(405, "Method not allowed");
  const isPublic = path.startsWith("/api/chat/");
  let body;
  try { body = await jsonBody(request); }
  catch (ex) { return isPublic ? publicReply(request, 400, { error: ex.message }) : error(400, ex.message); }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = await digest("ip:" + ip + ":" + (env.CHAT_ADMIN_PASSWORD || "chat"));
  if (path === "/api/chat/session") {
    if (!await rate(db, "new:" + ipKey, 12, 3600)) return publicReply(request, 429, { error: "Please try again later" });
    const id = random(24), token = random(32), time = stamp();
    await db.prepare("INSERT INTO conversations(public_id,visitor_token_hash,created_at,updated_at) VALUES(?,?,?,?)")
      .bind(id, await digest(token), time, time).run();
    return publicReply(request, 201, { public_id: id, token });
  }
  if (path === "/api/chat/message") {
    const row = await visitor(db, body.public_id, request.headers.get("X-Chat-Token"));
    if (!row) return publicReply(request, 404, { error: "Conversation unavailable" });
    if (!validMessage(body.body, body.client_id)) return publicReply(request, 400, { error: "Use 1–2000 characters" });
    const previous = await existingMessage(db, row, "visitor", body.client_id);
    if (previous) return publicReply(request, 201, { message: previous });
    if (!await rate(db, "visitor:" + row.public_id, 30, 60) || !await rate(db, "ip:" + ipKey, 120, 3600))
      return publicReply(request, 429, { error: "Please wait before sending again" });
    return publicReply(request, 201, { message: await postMessage(db, row, "visitor", body.body, body.client_id) });
  }
  if (path === "/api/admin/chat/login") {
    if (!ownOrigin(request)) return error(403, "Origin not allowed");
    if (!env.CHAT_ADMIN_PASSWORD || env.CHAT_ADMIN_PASSWORD.length < 16) return error(503, "Staff login not configured");
    if (!await rate(db, "login:" + ipKey, 6, 900)) return error(429, "Too many attempts; try later");
    if (!equal(body.password, env.CHAT_ADMIN_PASSWORD)) return error(401, "Incorrect password");
    const token = random(32), csrf = random(24);
    await db.prepare("INSERT INTO agent_sessions(token_hash,csrf,expires_at) VALUES(?,?,?)")
      .bind(await digest(token + ":" + env.CHAT_ADMIN_PASSWORD), csrf, seconds() + SESSION_SECONDS).run();
    return reply(200, { csrf }, { "Set-Cookie": `adv_chat_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}` });
  }
  if (path === "/api/admin/chat/logout") {
    const { response } = await authorizedAgent(request, env, true); if (response) return response;
    const token = cookieToken(request);
    await db.prepare("DELETE FROM agent_sessions WHERE token_hash=?").bind(await digest(token + ":" + env.CHAT_ADMIN_PASSWORD)).run();
    return reply(200, { ok: true }, { "Set-Cookie": "adv_chat_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }
  const match = path.match(/^\/api\/admin\/chat\/conversations\/([^/]+)\/(message|read|close)$/);
  if (match) {
    const { response } = await authorizedAgent(request, env, true); if (response) return response;
    const row = validId(match[1]) ? await db.prepare("SELECT * FROM conversations WHERE public_id=?").bind(match[1]).first() : null;
    if (!row) return error(404, "Not found");
    if (match[2] === "message") {
      if (!validMessage(body.body, body.client_id)) return error(400, "Use 1–2000 characters");
      return reply(201, { message: await postMessage(db, row, "agent", body.body, body.client_id) });
    }
    if (match[2] === "read") await db.prepare("UPDATE messages SET read_at=? WHERE conversation_id=? AND sender_type='visitor' AND read_at IS NULL").bind(stamp(), row.id).run();
    else await db.prepare("UPDATE conversations SET status='closed',updated_at=? WHERE id=?").bind(stamp(), row.id).run();
    return reply(200, { ok: true });
  }
  return error(404, "Not found");
}
export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (ex) { console.error("Chat API error", ex); return error(500, "Chat is temporarily unavailable"); }
  },
};
