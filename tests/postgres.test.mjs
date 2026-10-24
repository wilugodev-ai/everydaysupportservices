import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');

test('PostgreSQL isolates transactions, concurrent bookings, role protection, and password recovery', { skip: !process.env.TEST_POSTGRES_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL, max: 1 });
  const schema = 'test_' + randomBytes(8).toString('hex');
  await pool.query(`CREATE SCHEMA ${schema}`);
  const directory = await mkdtemp(join(tmpdir(), 'everyday-postgres-'));
  const url = new URL(process.env.TEST_POSTGRES_URL);
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], { env: { ...process.env, DATABASE_URL: url.toString(), DATABASE_SCHEMA: schema, DATA_DIRECTORY: directory, PORT: '4395', NODE_ENV: 'production', WEB_ORIGIN: 'https://care.example.com', WEB_ORIGIN_ALIASES: 'https://www.care.example.com' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
  async function request(path, method = 'GET', body, cookie = '', origin = 'https://care.example.com') {
    const response = await fetch('http://127.0.0.1:4395/v1/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) { try { if ((await request('health')).body.database === 'postgres') { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready, logs);
    const token = (await readFile(join(directory, 'admin-setup-token.txt'), 'utf8')).trim();
    const setup = await request('auth/setup', 'POST', { token, email: 'owner@example.com', password: 'postgres-password-123' });
    assert.equal(setup.status, 201, logs); assert.match(setup.cookie, /; Secure/);
    const cookie = setup.cookie.split(';')[0];
    const worker = await request('admin/workers', 'POST', { name: 'Concurrent Worker', bio: 'Temporary integration test profile.', credential: 'Test credential', expiry: '2099-12-31', verified: true, active: true, days: '0,1,2,3,4,5,6', start_hour: 8, end_hour: 18 }, cookie);
    assert.equal(worker.status, 201, logs);
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10);
    const visit = { name: 'Test Client', email: 'client@example.com', phone: '5551234567', address: '100 Test Street, Test City', service: 'Companionship', date: day, hour: 10, duration: 2, worker_id: worker.body.id };
    const bookings = await Promise.all(Array.from({ length: 8 }, () => request('bookings', 'POST', visit)));
    assert.equal(bookings.filter(b => b.status === 201).length, 1, JSON.stringify(bookings) + logs);
    assert.equal(bookings.filter(b => b.status === 409).length, 7);
    const dashboard = await request('admin', 'GET', undefined, cookie);
    assert.equal(dashboard.body.clients.length, 1); assert.equal(dashboard.body.bookings.length, 1);
    assert.equal((await request('bookings', 'POST', visit, '', 'https://foreign.example')).status, 401);
    assert.equal((await request('auth/logout', 'POST', {}, '', 'https://www.care.example.com')).status, 201);
    const second = await request('admin/users', 'POST', { name: 'Second Admin', email: 'second@example.com', password: 'second-password-123', role: 'admin' }, cookie);
    const changes = await Promise.all([setup.body.user.id, second.body.id].map(id => request('admin/users/' + id, 'PATCH', { role: 'client', active: true }, cookie)));
    assert.equal(changes.filter(c => c.status === 200).length, 1, JSON.stringify(changes) + logs);
    assert.equal(changes.filter(c => c.status === 409).length, 1);
    const remaining = await pool.query(`SELECT COUNT(*) total FROM ${schema}.users WHERE role='admin' AND active=1`);
    assert.equal(Number(remaining.rows[0].total), 1);
    const secondToken = (await readFile(join(directory, 'password-recovery', createHash('sha256').update(second.body.id).digest('hex') + '.txt'), 'utf8')).trim();
    const recovery = { email: 'second@example.com', token: secondToken, password: 'changed-password-123', confirmPassword: 'changed-password-123' };
    const resets = await Promise.all([request('auth/recover-password', 'POST', recovery), request('auth/recover-password', 'POST', recovery)]);
    assert.equal(resets.filter(r => r.status === 201).length, 1, JSON.stringify(resets) + logs);
    assert.equal(resets.filter(r => r.status === 401).length, 1);
  } finally {
    if (server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill(); await exited; }
    await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
