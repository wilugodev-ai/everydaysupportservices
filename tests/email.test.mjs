import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

test('email recovery sends only to registered users and uses expiring single-use codes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'everyday-email-'));
  const log = join(dir, 'mail.jsonl'), mode = join(dir, 'mode');
  await writeFile(log, ''); await writeFile(mode, 'ok');
  const server = spawn(process.execPath, ['--import', pathToFileURL(resolve('tests/email-provider.mjs')).href, resolve('apps/api/dist/main.js')], { env: { ...process.env, PORT: '4397', DATA_DIRECTORY: dir, RESEND_API_KEY: 'test-key', RECOVERY_EMAIL_FROM: 'care@example.com', TEST_EMAIL_LOG: log, TEST_EMAIL_MODE: mode }, stdio: 'ignore' });
  async function request(path, body) {
    const response = await fetch('http://127.0.0.1:4397/v1/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    return { status: response.status, body: await response.json() };
  }
  const messages = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const codeFrom = mail => /code is: (\d{6})/.exec(mail.text)[1];
  const recovery = (email, token) => ({ email, token, password: 'new-password-12345', confirmPassword: 'new-password-12345' });
  let db;
  try {
    let ready = false;
    for (let i=0;i<100;i++) { try { if ((await request('health')).status===200) { ready=true; break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready);
    const a = await request('auth/register', { name: 'Email Client', email: 'first@example.com', password: 'old-password-12345' });
    await request('auth/register', { name: 'Second Client', email: 'second@example.com', password: 'old-password-12345' });
    db = new DatabaseSync(join(dir, 'content.sqlite'));
    const known = await request('auth/request-recovery', { email: 'first@example.com', to: 'attacker@example.com' });
    const unknown = await request('auth/request-recovery', { email: 'unknown@example.com' });
    assert.deepEqual(known, unknown);
    let mail = await messages(); assert.equal(mail.length, 1); assert.deepEqual(mail[0].to, ['first@example.com']);
    const code = codeFrom(mail[0]); assert.equal(JSON.stringify(known.body).includes(code), false);
    assert.notEqual(db.prepare('SELECT digest FROM password_codes WHERE user_id=?').get(a.body.user.id).digest, code);
    assert.equal((await request('auth/recover-password', recovery('second@example.com', code))).status, 401);
    assert.equal((await request('auth/recover-password', recovery('first@example.com', code))).status, 201);
    assert.equal((await request('auth/recover-password', recovery('first@example.com', code))).status, 401);
    assert.equal((await request('auth/login', { email: 'first@example.com', password: 'new-password-12345' })).status, 201);
    await request('auth/request-recovery', { email: 'second@example.com' });
    mail = await messages(); const expiredCode = codeFrom(mail.at(-1));
    db.prepare('UPDATE password_codes SET expires=0').run();
    assert.equal((await request('auth/recover-password', recovery('second@example.com', expiredCode))).status, 401);
    await request('auth/request-recovery', { email: 'second@example.com' });
    mail = await messages(); const newCode = codeFrom(mail.at(-1));
    db.prepare('UPDATE password_codes SET attempts=5').run();
    assert.equal((await request('auth/recover-password', recovery('second@example.com', newCode))).status, 401);
    await writeFile(mode, 'fail');
    assert.equal((await request('auth/request-recovery', { email: 'first@example.com' })).status, 201);
    assert.equal(db.prepare('SELECT user_id FROM password_codes WHERE user_id=?').get(a.body.user.id), undefined);
  } finally {
    db?.close(); if (server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill(); await exited; }
    await rm(dir, { recursive: true, force: true });
  }
});
