import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// All records and credentials live in a disposable directory, never .data.
test('care booking, credential checks, administration, and session access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'everyday-test-'));
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], {
    env: { ...process.env, PORT: '4399', DATA_DIRECTORY: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; server.stdout.on('data', d => { logs += d; }); server.stderr.on('data', d => { logs += d; });
  let cookie = '';
  async function request(path, method = 'GET', body, signed = false, origin) {
    const response = await fetch(`http://127.0.0.1:4399/v1/${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(signed ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await request('health')).status === 200) { ready = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(ready, logs);
    assert.equal((await request('admin')).status, 401);
    assert.deepEqual((await request('workers')).body, []);
    assert.equal((await request('auth/setup', 'POST', { token: 'wrong', email: 'owner@example.com', password: 'a-test-password-123' })).status, 401);
    const token = (await readFile(join(directory, 'admin-setup-token.txt'), 'utf8')).trim();
    const setup = await request('auth/setup', 'POST', { token, email: 'owner@example.com', password: 'a-test-password-123' });
    assert.equal(setup.status, 201); assert.match(setup.cookie, /HttpOnly/); assert.match(setup.cookie, /SameSite=Strict/);
    cookie = setup.cookie.split(';')[0];
    assert.equal((await request('admin', 'GET', undefined, true)).status, 200);
    const worker = { name: 'Test Care Professional', bio: 'A fictional profile for automated checks only.', credential: 'Test qualification', expiry: '2099-12-31', verified: false, active: true, days: '0,1,2,3,4,5,6', start_hour: 8, end_hour: 18 };
    const workerId = (await request('admin/workers', 'POST', worker, true)).body.id;
    assert.ok(workerId);
    assert.deepEqual((await request('workers')).body, []);
    assert.equal((await request('team')).body[0].name, worker.name);
    assert.equal((await request('team')).body[0].verified, 0);
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const booking = { name: 'Test Client', email: 'client@example.com', phone: '5551234567', address: '123 Test Street, Test City', service: 'Companionship', date: day, hour: 10, duration: 2, worker_id: workerId };
    assert.equal((await request('bookings', 'POST', booking)).status, 409);
    assert.equal((await request('admin/workers/' + workerId, 'PATCH', { ...worker, verified: true }, true)).status, 200);
    const publicWorker = (await request('workers')).body[0];
    assert.equal(publicWorker.id, workerId); assert.equal(publicWorker.verified, undefined);
    assert.ok((await request(`availability/${workerId}/${day}/2`)).body.includes(10));
    assert.equal((await request('bookings', 'POST', { ...booking, hour: 17 })).status, 409);
    const first = await request('bookings', 'POST', booking);
    assert.equal(first.status, 201, logs); assert.equal(first.body.status, 'pending');
    assert.equal((await request('bookings', 'POST', { ...booking, hour: 11 })).status, 409);
    assert.ok(!(await request(`availability/${workerId}/${day}/2`)).body.includes(10));
    assert.equal((await request('admin/bookings/' + first.body.reference, 'PATCH', { status: 'confirmed', worker_id: workerId }, true)).status, 200);
    assert.equal((await request('admin/bookings/' + first.body.reference, 'PATCH', { status: 'cancelled', worker_id: workerId }, true)).status, 200);
    assert.ok((await request(`availability/${workerId}/${day}/2`)).body.includes(10));
    const unassigned = await request('bookings', 'POST', { ...booking, worker_id: '' });
    assert.equal(unassigned.status, 201);
    assert.equal((await request('admin/bookings/' + unassigned.body.reference, 'PATCH', { status: 'confirmed', worker_id: '' }, true)).status, 400);
    const dashboard = (await request('admin', 'GET', undefined, true)).body;
    assert.equal(dashboard.clients.length, 1); assert.equal(dashboard.bookings.length, 2);
    assert.equal((await request('bookings', 'POST', { ...booking, name: 'Overwrite attempt', worker_id: '' })).status, 409);
    assert.equal((await request('admin/clients/' + dashboard.clients[0].id, 'PATCH', { ...dashboard.clients[0], phone: '5559998888' }, true)).status, 200);
    assert.equal((await request('admin/workers/' + workerId, 'PATCH', { ...worker, verified: true, expiry: '2020-01-01' }, true)).status, 200);
    assert.deepEqual((await request('workers')).body, []);
    assert.equal((await request('bookings', 'POST', { ...booking, email: 'another@example.com' })).status, 409);
    assert.equal((await request('admin/workers/' + workerId, 'DELETE', undefined, true)).status, 200);
    assert.deepEqual((await request('team')).body, []);
    assert.equal((await request('bookings', 'POST', booking, false, 'https://untrusted.example')).status, 401);
    assert.equal((await request('bookings', 'POST', { ...booking, date: '2030-02-30' })).status, 400);
    assert.equal((await request('auth/logout', 'POST', {}, true)).status, 201);
    assert.equal((await request('admin', 'GET', undefined, true)).status, 401);
    const login = await request('auth/login', 'POST', { email: 'owner@example.com', password: 'a-test-password-123' });
    assert.equal(login.status, 201);
    assert.equal((await request('auth/login', 'POST', { email: 'owner@example.com', password: 'incorrect' })).status, 401);
  } finally {
    const exit = new Promise(r => server.once('exit', r));
    server.kill(); await exit;
    await rm(directory, { recursive: true, force: true });
  }
});
