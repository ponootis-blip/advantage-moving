import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './src/index.js';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const statement = sqlite.prepare(sql);
      const bound = {
        bind(...values) { args = values; return bound; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { statement.run(...args); return { success: true }; },
      };
      return bound;
    },
    async batch(items) {
      sqlite.exec('BEGIN');
      try { for (const item of items) await item.run(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
const base = 'https://advantage-chat.ponootis.workers.dev';
const site = 'https://ponootis-blip.github.io';
const password = 'A-long-unique-test-password-42';
const env = { CHAT_DB: database(), CHAT_ADMIN_PASSWORD: password };
async function call(path, method = 'GET', body, headers = {}) {
  const request = new Request(base + path, { method, headers: {
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers,
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await worker.fetch(request, env);
  return { response, data: await response.json() };
}

test('visitor to agent to visitor with persistence, isolation, and authorization', async () => {
  const health = await call('/api/chat/health', 'GET', undefined, { Origin: site });
  assert.equal(health.data.realtime, 'poll');
  assert.equal(health.response.headers.get('Access-Control-Allow-Origin'), site);
  const session = await call('/api/chat/session', 'POST', {}, { Origin: site });
  assert.equal(session.response.status, 201);
  const { public_id: id, token } = session.data;
  const visitor = { Origin: site, 'X-Chat-Token': token };
  const first = await call('/api/chat/message', 'POST', { public_id: id, body: 'Hello', client_id: 'visitor-msg-1' }, visitor);
  assert.equal(first.response.status, 201);
  const duplicate = await call('/api/chat/message', 'POST', { public_id: id, body: 'Hello', client_id: 'visitor-msg-1' }, visitor);
  assert.equal(duplicate.data.message.id, first.data.message.id);
  assert.equal((await call('/api/chat/conversation/' + id, 'GET', undefined, { Origin: site, 'X-Chat-Token': 'wrong' })).response.status, 404);
  assert.equal((await call('/api/admin/chat/conversations')).response.status, 401);
  const badLogin = await call('/api/admin/chat/login', 'POST', { password: 'wrong' }, { Origin: base });
  assert.equal(badLogin.response.status, 401);
  const login = await call('/api/admin/chat/login', 'POST', { password }, { Origin: base });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('Set-Cookie').split(';')[0];
  assert.match(login.response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const staff = { Cookie: cookie, Origin: base, 'X-CSRF-Token': login.data.csrf };
  const list = await call('/api/admin/chat/conversations', 'GET', undefined, staff);
  assert.equal(list.data.conversations[0].unread, 1);
  assert.equal(list.data.conversations[0].last_body, 'Hello');
  assert.equal((await call('/api/admin/chat/conversations/' + id + '/message', 'POST', { body: 'No', client_id: 'agent-msg-no' }, { Cookie: cookie, Origin: base })).response.status, 403);
  const reply = await call('/api/admin/chat/conversations/' + id + '/message', 'POST', { body: 'Hi, how can I help?', client_id: 'agent-msg-1' }, staff);
  assert.equal(reply.response.status, 201);
  const thread = await call('/api/chat/conversation/' + id, 'GET', undefined, visitor);
  assert.deepEqual(thread.data.messages.map(m => m.body), ['Hello', 'Hi, how can I help?']);
  await call('/api/admin/chat/conversations/' + id + '/read', 'POST', {}, staff);
  assert.equal((await call('/api/admin/chat/conversations', 'GET', undefined, staff)).data.conversations[0].unread, 0);
  await call('/api/admin/chat/conversations/' + id + '/close', 'POST', {}, staff);
  assert.equal((await call('/api/chat/conversation/' + id, 'GET', undefined, visitor)).data.status, 'closed');
  await call('/api/chat/message', 'POST', { public_id: id, body: 'One more question', client_id: 'visitor-msg-2' }, visitor);
  assert.equal((await call('/api/chat/conversation/' + id, 'GET', undefined, visitor)).data.status, 'open');
  const another = await call('/api/chat/session', 'POST', {}, { Origin: site });
  assert.equal((await call('/api/chat/conversation/' + another.data.public_id, 'GET', undefined, visitor)).response.status, 404);
  assert.equal((await call('/api/chat/conversation/' + id, 'GET', undefined, { Origin: site, 'X-Chat-Token': another.data.token })).response.status, 404);
  assert.equal((await call('/api/chat/conversation/' + id, 'GET', undefined, visitor)).data.messages.length, 3);
  const logout = await call('/api/admin/chat/logout', 'POST', {}, staff);
  assert.equal(logout.response.status, 200);
  assert.equal((await call('/api/admin/chat/conversations', 'GET', undefined, staff)).response.status, 401);
});

test('origin and input checks', async () => {
  const denied = await call('/api/chat/session', 'POST', {}, { Origin: 'https://example.com' });
  assert.equal(denied.response.status, 403);
  const tooLong = await call('/api/chat/session', 'POST', { text: 'x'.repeat(9000) }, { Origin: site });
  assert.equal(tooLong.response.status, 400);
});

test('public chat stays offline until staff login is configured', async () => {
  const response = await worker.fetch(new Request(base + '/api/chat/health', { headers: { Origin: site } }), { CHAT_DB: database() });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), site);
});
