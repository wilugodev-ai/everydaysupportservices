import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, scryptSync } from 'node:crypto';

test('legacy owner migration, private appointments, client accounts, and role management', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'everyday-accounts-'));
  const legacy = new DatabaseSync(join(directory, 'content.sqlite'));
  legacy.exec('CREATE TABLE admin (id INTEGER PRIMARY KEY, email TEXT, salt TEXT, hash TEXT); CREATE TABLE sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);');
  legacy.prepare('INSERT INTO admin VALUES (1,?,?,?)').run('owner@example.com', 'test-salt', scryptSync('owner-password-123', 'test-salt', 64).toString('hex'));
  legacy.prepare('INSERT INTO sessions VALUES (?,?)').run('old-session', Date.now() + 3600000);
  legacy.close();
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], { env: { ...process.env, PORT: '4398', DATA_DIRECTORY: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
  async function request(path, method = 'GET', body, cookie = '') {
    const response = await fetch(`http://127.0.0.1:4398/v1/${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await request('health')).status === 200) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready, logs);
    assert.equal((await request('auth')).body.setupRequired, false);
    assert.equal((await request('account')).status, 401);
    const ownerLogin = await request('auth/login', 'POST', { email: 'owner@example.com', password: 'owner-password-123' });
    assert.equal(ownerLogin.status, 201); assert.equal(ownerLogin.body.user.role, 'admin');
    const owner = ownerLogin.cookie, ownerId = ownerLogin.body.user.id;
    const a = await request('auth/register', 'POST', { name: 'Client Alpha', email: 'alpha@example.com', password: 'alpha-password-123', role: 'admin', client_id: 'legacy-owner' });
    const b = await request('auth/register', 'POST', { name: 'Client Bravo', email: 'bravo@example.com', password: 'bravo-password-123' });
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    assert.equal(a.body.user.role, 'client'); assert.notEqual(a.body.user.client_id, 'legacy-owner');
    assert.equal(a.body.user.hash, undefined);
    for (const [path, method, body] of [['admin', 'GET'], ['admin/users', 'POST', {}], ['admin/users/' + ownerId, 'PATCH', { role: 'client', active: false }], ['admin/clients', 'POST', {}], ['admin/workers', 'POST', {}]]) assert.equal((await request(path, method, body, a.cookie)).status, 403);
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10);
    const booking = { name: 'Client Alpha', email: 'alpha@example.com', phone: '5551234567', address: '100 Alpha Street, Test City', service: 'Companionship', date: day, hour: 10, duration: 2, worker_id: '', client_id: b.body.user.client_id };
    const visit = await request('bookings', 'POST', booking, a.cookie);
    assert.equal(visit.status, 201, logs);
    assert.equal((await request('bookings', 'POST', { ...booking, email: 'bravo@example.com' }, a.cookie)).status, 403);
    assert.equal((await request('bookings', 'POST', booking)).status, 409);
    const alphaAccount = (await request('account?client_id=' + b.body.user.client_id, 'GET', undefined, a.cookie)).body;
    assert.equal(alphaAccount.bookings.length, 1); assert.equal(alphaAccount.bookings[0].id, visit.body.reference);
    assert.equal(alphaAccount.profile.id, a.body.user.client_id);
    assert.equal((await request('account', 'GET', undefined, b.cookie)).body.bookings.length, 0);
    assert.equal((await request('account', 'PATCH', { name: 'Alpha Updated', phone: '5559876543', address: '200 New Alpha Street', client_id: b.body.user.client_id, role: 'admin', email: 'bravo@example.com' }, a.cookie)).status, 200);
    assert.equal((await request('account', 'GET', undefined, b.cookie)).body.profile.name, 'Client Bravo');
    const alphaAfter = (await request('account', 'GET', undefined, a.cookie)).body;
    assert.equal(alphaAfter.profile.name, 'Alpha Updated'); assert.equal(alphaAfter.user.email, 'alpha@example.com'); assert.equal(alphaAfter.user.role, 'client');
    assert.equal((await request('admin/bookings/' + visit.body.reference, 'PATCH', { worker_id: '', status: 'cancelled' }, owner)).status, 200);
    assert.equal((await request('account', 'GET', undefined, a.cookie)).body.bookings[0].status, 'cancelled');
    // An existing guest's history can only be linked by an administrator.
    const guest = { ...booking, name: 'Existing Guest', email: 'guest@example.com' };
    assert.equal((await request('bookings', 'POST', guest)).status, 201);
    assert.equal((await request('auth/register', 'POST', { name: 'Guest Claimer', email: 'guest@example.com', password: 'guest-password-123' })).status, 409);
    const directoryData = (await request('admin', 'GET', undefined, owner)).body;
    assert.ok(directoryData.users.every(u => !('salt' in u) && !('hash' in u)));
    const guestClient = directoryData.clients.find(c => c.email === 'guest@example.com');
    const guestUser = await request('admin/users', 'POST', { name: 'Existing Guest', email: 'guest@example.com', password: 'guest-password-123', role: 'client', client_id: guestClient.id }, owner);
    assert.equal(guestUser.status, 201);
    const guestLogin = await request('auth/login', 'POST', { email: 'guest@example.com', password: 'guest-password-123' });
    assert.equal((await request('account', 'GET', undefined, guestLogin.cookie)).body.bookings.length, 1);
    assert.equal((await request('admin/users/' + guestUser.body.id, 'PATCH', { role: 'client', active: false }, owner)).status, 200);
    assert.equal((await request('account', 'GET', undefined, guestLogin.cookie)).status, 401);
    assert.equal((await request('auth/login', 'POST', { email: 'guest@example.com', password: 'guest-password-123' })).status, 401);
    // Keep a usable owner and apply role changes to sessions immediately.
    assert.equal((await request('admin/users/' + ownerId, 'PATCH', { role: 'client', active: true }, owner)).status, 409);
    assert.equal((await request('admin/users/' + ownerId, 'PATCH', { role: 'admin', active: false }, owner)).status, 409);
    assert.equal((await request('admin/users/' + a.body.user.id, 'PATCH', { role: 'admin', active: true }, owner)).status, 200);
    assert.equal((await request('account', 'GET', undefined, a.cookie)).status, 401);
    const promoted = await request('auth/login', 'POST', { email: 'alpha@example.com', password: 'alpha-password-123' });
    assert.equal(promoted.body.user.role, 'admin');
    assert.equal((await request('admin', 'GET', undefined, promoted.cookie)).status, 200);
    assert.equal((await request('admin/users/' + a.body.user.id, 'PATCH', { role: 'client', active: true }, owner)).status, 200);
    assert.equal((await request('admin', 'GET', undefined, promoted.cookie)).status, 401);
    const beforeRecovery = (await request('admin', 'GET', undefined, owner)).body;
    const recoveryToken = (await readFile(join(directory, 'password-recovery', createHash('sha256').update(ownerId).digest('hex') + '.txt'), 'utf8')).trim();
    const recovery = { email: 'owner@example.com', token: recoveryToken, password: 'new-owner-password-123', confirmPassword: 'new-owner-password-123' };
    assert.equal((await request('auth/recover-password', 'POST', { ...recovery, token: 'incorrect-token' })).status, 401);
    assert.equal((await request('auth/recover-password', 'POST', { ...recovery, email: 'bravo@example.com' })).status, 401);
    assert.equal((await request('auth/recover-password', 'POST', { ...recovery, confirmPassword: 'different' })).status, 400);
    assert.equal((await request('auth/recover-password', 'POST', recovery)).status, 201);
    assert.equal((await request('admin', 'GET', undefined, owner)).status, 401);
    assert.equal((await request('auth/login', 'POST', { email: 'owner@example.com', password: 'owner-password-123' })).status, 401);
    const recovered = await request('auth/login', 'POST', { email: 'owner@example.com', password: recovery.password });
    assert.equal(recovered.status, 201);
    const afterRecovery = (await request('admin', 'GET', undefined, recovered.cookie)).body;
    assert.deepEqual(afterRecovery, beforeRecovery);
    assert.notEqual((await readFile(join(directory, 'password-recovery', createHash('sha256').update(ownerId).digest('hex') + '.txt'), 'utf8')).trim(), recoveryToken);
    assert.equal((await request('auth/recover-password', 'POST', recovery)).status, 401);
    assert.equal((await request('admin/users/' + b.body.user.id + '/recovery', 'POST', {}, b.cookie)).status, 403);
    const clientCode = await request('admin/users/' + b.body.user.id + '/recovery', 'POST', {}, recovered.cookie);
    assert.equal(clientCode.status, 503); // No provider configured in this isolated suite.
    const localClientCode = (await readFile(join(directory, 'password-recovery', createHash('sha256').update(b.body.user.id).digest('hex') + '.txt'), 'utf8')).trim();
    const clientRecovery = { email: 'bravo@example.com', token: localClientCode, password: 'new-bravo-password-123', confirmPassword: 'new-bravo-password-123' };
    assert.equal((await request('auth/recover-password', 'POST', { ...clientRecovery, email: 'guest@example.com' })).status, 401);
    assert.equal((await request('auth/recover-password', 'POST', clientRecovery)).status, 201);
    assert.equal((await request('account', 'GET', undefined, b.cookie)).status, 401);
    const clientLogin = await request('auth/login', 'POST', { email: 'bravo@example.com', password: clientRecovery.password });
    assert.equal(clientLogin.status, 201); assert.equal(clientLogin.body.user.role, 'client');
    assert.equal((await request('account', 'GET', undefined, clientLogin.cookie)).body.profile.id, b.body.user.client_id);
    assert.equal((await request('auth/recover-password', 'POST', clientRecovery)).status, 401);
  } finally {
    const exited = new Promise(r => server.once('exit', r)); server.kill(); await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
