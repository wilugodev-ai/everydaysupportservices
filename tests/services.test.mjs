import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('every advertised service can be requested through the booking API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'everyday-services-'));
  const server = spawn(process.execPath, [resolve('apps/api/dist/main.js')], {
    env: { ...process.env, PORT: '4401', DATA_DIRECTORY: directory }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', value => { logs += value; });
  server.stderr.on('data', value => { logs += value; });
  const base = 'http://127.0.0.1:4401/v1/';
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(base + 'health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const source = await readFile('apps/web/app/lib/services.ts', 'utf8');
    const services = [...source.matchAll(/"title": "([^"]+)"/g)].map(match => match[1]);
    assert.equal(services.length, 8);
    for (const [index, service] of services.entries()) {
      const response = await fetch(base + 'bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Client', email: `service-${index}@example.com`, phone: '5551234567', address: '123 Test Street, Test City', service, worker_id: '', date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), hour: 10, duration: 2 }),
      });
      const result = await response.json();
      assert.equal(response.status, 201, `${service}: ${JSON.stringify(result)}`);
      assert.equal(result.status, 'pending');
    }
  } finally {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
