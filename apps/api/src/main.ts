import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Module, Param, Patch, Post, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const dir = resolve(process.env.DATA_DIRECTORY || resolve(__dirname, '../../../.data'));
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(resolve(dir, 'content.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT NOT NULL, credential TEXT NOT NULL, expiry TEXT NOT NULL, verified INTEGER NOT NULL, active INTEGER NOT NULL, days TEXT NOT NULL, start_hour INTEGER NOT NULL, end_hour INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, address TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), worker_id TEXT REFERENCES workers(id), service TEXT NOT NULL, date TEXT NOT NULL, hour INTEGER NOT NULL, duration INTEGER NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS password_codes (user_id TEXT PRIMARY KEY, digest TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
`);
// Preserve existing owner credentials and records; old anonymous sessions expire.
db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','client')), active INTEGER NOT NULL DEFAULT 1, client_id TEXT UNIQUE REFERENCES clients(id));`);
if (!(db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).some(c => c.name === 'user_id')) db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id)');
const legacy = db.prepare('SELECT * FROM admin WHERE id=1').get() as Record<string, string> | undefined;
if (legacy && !db.prepare('SELECT id FROM users WHERE id=?').get('legacy-owner')) {
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run('legacy-owner', 'Administrator', legacy.email.toLowerCase(), legacy.salt, legacy.hash, 'admin', 1, null);
}
const setupFile = resolve(dir, 'admin-setup-token.txt');
const recoveryDirectory = resolve(dir, 'password-recovery');
mkdirSync(recoveryDirectory, { recursive: true });
const recoveryFileFor = (id: string) => resolve(recoveryDirectory, `${hash(id)}.txt`);
function issueRecovery(id: string) {
  const token = randomBytes(32).toString('hex');
  writeFileSync(recoveryFileFor(id), token, { mode: 0o600 });
  return token;
}
if (!db.prepare("SELECT id FROM users WHERE role='admin'").get() && !existsSync(setupFile)) writeFileSync(setupFile, randomBytes(24).toString('hex'), { mode: 0o600 });
const services = ['Personal care', 'Companionship', 'Respite care', 'Everyday home support'];
type Input = Record<string, any>;
type Request = { headers: Record<string, string | undefined>; ip?: string };
type Response = { setHeader(name: string, value: string): void };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
for (const user of db.prepare('SELECT id FROM users').all() as { id: string }[]) {
  if (!existsSync(recoveryFileFor(user.id))) issueRecovery(user.id);
}
function text(value: unknown, name: string, min = 1, max = 200): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new BadRequestException(`${name} must contain ${min}–${max} characters.`);
  return value.trim();
}
function integer(value: unknown, name: string, min: number, max: number) {
  const n = Number(value);
  if (!['string', 'number'].includes(typeof value) || value === '' || !Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${name} must be ${min}–${max}.`);
  return n;
}
function email(value: unknown) {
  const result = text(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new BadRequestException('Enter a valid email address.');
  return result;
}
function date(value: unknown) {
  const result = text(value, 'Date', 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new BadRequestException('Enter a valid date.');
  return result;
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
const attempts = new Map<string, { count: number; until: number }>();
function limit(key: string, max: number) {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
  entry.count++; attempts.set(key, entry);
  if (entry.count > max) throw new BadRequestException('Too many attempts. Please try again in 15 minutes.');
}
function origin(req: Request) {
  const source = req.headers.origin;
  if (source && !['http://127.0.0.1:3300', 'http://localhost:3300'].includes(source)) throw new UnauthorizedException('Unrecognized request origin.');
}
function currentUser(req: Request): Input | undefined {
  const token = /(?:^|;\s*)ess_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (!token) return;
  return db.prepare('SELECT u.id,u.name,u.email,u.role,u.active,u.client_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hash(token), Date.now()) as Input | undefined;
}
function signedIn(req: Request) {
  const user = currentUser(req);
  if (!user) throw new UnauthorizedException('Please sign in.');
  return user;
}
function authorize(req: Request) {
  const user = signedIn(req);
  if (user.role !== 'admin') throw new ForbiddenException('Administrator access is required.');
  return user;
}
function workerInput(b: Input) {
  const days = text(b.days, 'Working days', 1, 13);
  if (!/^[0-6](,[0-6])*$/.test(days)) throw new BadRequestException('Choose working days.');
  const start = integer(b.start_hour, 'Start hour', 0, 22), end = integer(b.end_hour, 'End hour', 1, 23);
  if (end <= start) throw new BadRequestException('End time must follow start time.');
  return [text(b.name, 'Name', 2, 100), text(b.bio, 'Bio', 10, 700), text(b.credential, 'Credential', 2, 150), date(b.expiry), b.verified === true ? 1 : 0, b.active === true ? 1 : 0, days, start, end];
}
function checkSlot(workerId: string, day: string, hour: number, duration: number, excluding = '') {
  const w = db.prepare('SELECT * FROM workers WHERE id=?').get(workerId) as Input | undefined;
  if (!w || !w.active || !w.verified || w.expiry < day) throw new ConflictException('This worker is not available with current verified credentials.');
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (!w.days.split(',').includes(String(weekday)) || hour < w.start_hour || hour + duration > w.end_hour) throw new ConflictException('This time is outside the worker’s schedule.');
  if (db.prepare("SELECT id FROM bookings WHERE worker_id=? AND date=? AND status IN ('pending','confirmed') AND id<>? AND hour < ? AND hour+duration > ?").get(workerId, day, excluding, hour + duration, hour)) throw new ConflictException('This time has just been reserved. Choose another time.');
}

@Controller('v1')
class AppController {
  @Get('health') health() { db.prepare('SELECT 1').get(); return { status: 'ok', service: 'everydaysupportservices-api', database: 'sqlite' }; }
  @Get('workers') workers() { return db.prepare('SELECT id,name,bio,credential,expiry,days,start_hour,end_hour FROM workers WHERE active=1 AND verified=1 AND expiry>=? ORDER BY name').all(today()); }
  @Get('team') team() {
    return db.prepare('SELECT id,name,bio,credential,expiry,days,start_hour,end_hour,CASE WHEN verified=1 AND expiry>=? THEN 1 ELSE 0 END verified FROM workers WHERE active=1 ORDER BY name').all(today());
  }
  @Get('availability/:id/:date/:duration') availability(@Param('id') id: string, @Param('date') day: string, @Param('duration') d: string) {
    day = date(day); const duration = integer(d, 'Duration', 1, 8);
    const slots = [];
    for (let hour = 0; hour <= 23; hour++) { try { checkSlot(id, day, hour, duration); if (day > today()) slots.push(hour); } catch {} }
    return slots;
  }
  @Post('bookings') book(@Body() b: Input, @Req() req: Request) {
    origin(req); limit(`booking:${req.ip}`, 15);
    const user = currentUser(req);
    if (user?.role === 'client' && email(b.email) !== user.email) throw new ForbiddenException('Use your account email when booking care.');
    const name = text(b.name, 'Name', 2, 100), contact = email(b.email), phone = text(b.phone, 'Phone', 7, 30), address = text(b.address, 'Visit address', 5, 250);
    if (!user && db.prepare('SELECT id FROM users WHERE email=?').get(contact)) throw new ConflictException('Please sign in to book with this email.');
    const service = text(b.service, 'Service'); if (!services.includes(service)) throw new BadRequestException('Choose a service.');
    const day = date(b.date), hour = integer(b.hour, 'Start hour', 0, 23), duration = integer(b.duration, 'Duration', 1, 8);
    if (day <= today() || day > new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10) || hour + duration > 24) throw new BadRequestException('Choose a time from tomorrow through the next 180 days.');
    const workerId = b.worker_id ? text(b.worker_id, 'Worker') : null;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (workerId) checkSlot(workerId, day, hour, duration);
      let client = user?.role === 'client' ? db.prepare('SELECT id FROM clients WHERE id=?').get(user.client_id) as Input | undefined : db.prepare('SELECT id FROM clients WHERE email=?').get(contact) as Input | undefined;
      if (user?.role === 'client' && !client) throw new ConflictException('Contact your administrator to restore your client profile.');
      if (!client) { client = { id: randomUUID() }; db.prepare('INSERT INTO clients VALUES (?,?,?,?,?)').run(client.id, name, contact, phone, address); }
      else if (user?.role === 'client') db.prepare('UPDATE clients SET name=?,phone=?,address=? WHERE id=?').run(name, phone, address, client.id);
      else {
        const current = db.prepare('SELECT * FROM clients WHERE id=?').get(client.id) as Input;
        if (current.name !== name || current.phone !== phone || current.address !== address) throw new ConflictException('This email already has a client profile. Contact your care coordinator to update its details.');
      }
      const id = randomUUID();
      db.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?)').run(id, client.id, workerId, service, day, hour, duration, 'pending', new Date().toISOString());
      db.exec('COMMIT'); return { reference: id, status: 'pending' };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  @Get('auth') auth(@Req() req: Request) {
    const user = currentUser(req);
    return { authenticated: !!user, user: user || null, setupRequired: !db.prepare("SELECT id FROM users WHERE role='admin'").get() };
  }
  @Post('auth/setup') setup(@Body() b: Input, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    origin(req); limit(`auth:${req.ip}`, 10);
    if (db.prepare("SELECT id FROM users WHERE role='admin'").get()) throw new ConflictException('Administrator already configured.');
    if (typeof b.token !== 'string' || hash(b.token) !== hash(readFileSync(setupFile, 'utf8').trim())) throw new UnauthorizedException('Invalid setup token.');
    const contact = email(b.email), password = text(b.password, 'Password', 12, 128), salt = randomBytes(16).toString('hex');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(contact) || db.prepare('SELECT id FROM clients WHERE email=?').get(contact)) throw new ConflictException('This email is already in use. Choose another owner email.');
    const id = randomUUID();
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(id, 'Administrator', contact, salt, scryptSync(password, salt, 64).toString('hex'), 'admin', 1, null);
    issueRecovery(id);
    return this.session(res, id);
  }
  @Post('auth/login') login(@Body() b: Input, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    origin(req); limit(`auth:${req.ip}`, 10);
    const contact = email(b.email), password = text(b.password, 'Password', 1, 128);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(contact) as Input | undefined;
    const actual = scryptSync(password, user?.salt ?? 'dummy-salt', 64);
    if (!user || !user.active || !timingSafeEqual(actual, Buffer.from(user.hash, 'hex'))) throw new UnauthorizedException('Email or password is incorrect.');
    return this.session(res, user.id);
  }
  @Post(['auth/recover-password', 'auth/recover-admin']) recoverPassword(@Body() b: Input, @Req() req: Request) {
    origin(req); limit(`recover-ip:${req.ip}`, 20);
    const contact = email(b.email), password = text(b.password, 'New password', 12, 128);
    limit(`recover:${req.ip}:${contact}`, 5);
    if (b.confirmPassword !== b.password) throw new BadRequestException('The new passwords do not match.');
    const token = typeof b.token === 'string' ? b.token.trim() : '';
    const user = db.prepare('SELECT id FROM users WHERE email=? AND active=1').get(contact) as Input | undefined;
    let validToken = false;
    if (/^\d{6}$/.test(token) && user) {
      const code = db.prepare('SELECT * FROM password_codes WHERE user_id=?').get(user.id) as Input | undefined;
      if (code && code.expires > Date.now() && code.attempts < 5) {
        db.prepare('UPDATE password_codes SET attempts=attempts+1 WHERE user_id=?').run(user.id);
        validToken = timingSafeEqual(Buffer.from(hash(`${user.id}:${token}`), 'hex'), Buffer.from(code.digest, 'hex'));
      }
    } else if (user && /^[a-f0-9]{64}$/.test(token)) {
      // Private local operator fallback; never sent through public request responses.
      const stored = existsSync(recoveryFileFor(user.id)) ? readFileSync(recoveryFileFor(user.id), 'utf8').trim() : '';
      validToken = !!stored && timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(hash(stored), 'hex'));
    }
    if (!user || !validToken) throw new UnauthorizedException('The code is incorrect or expired. Request a new code and try again.');
    const salt = randomBytes(16).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt, scryptSync(password, salt, 64).toString('hex'), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      db.prepare('DELETE FROM password_codes WHERE user_id=?').run(user.id);
      // Reading the current private file is required for every recovery.
      issueRecovery(user.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    attempts.delete(`auth:${req.ip}`);
    return { ok: true };
  }
  @Post('auth/request-recovery') async requestRecovery(@Body() b: Input, @Req() req: Request) {
    origin(req); limit(`email-recovery-ip:${req.ip}`, 20);
    const contact = email(b.email);
    limit(`email-recovery:${contact}`, 3);
    if (!process.env.RESEND_API_KEY || !process.env.RECOVERY_EMAIL_FROM) throw new ServiceUnavailableException('Password recovery email is not configured yet. Please contact your care administrator.');
    const result = { message: 'If this email belongs to an active registered account, a recovery code will be sent. Check your inbox and spam folder.' };
    const user = db.prepare('SELECT id,email FROM users WHERE email=? AND active=1').get(contact) as Input | undefined;
    if (!user) return result;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const digest = hash(`${user.id}:${code}`);
    db.prepare('INSERT INTO password_codes VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET digest=excluded.digest,expires=excluded.expires,attempts=0').run(user.id, digest, Date.now() + 10 * 60_000);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.RECOVERY_EMAIL_FROM, to: [user.email], subject: 'Your Everyday Support Services recovery code', text: `Your password recovery code is: ${code}\n\nThis code expires in 10 minutes and can be used once. Enter it on the password recovery page to choose a new password.\n\nIf you did not request this, ignore this email. Your password has not changed.` }),
      });
      const delivery = await response.json() as { id?: string };
      if (!response.ok || !delivery.id) throw new Error('Provider rejected email');
    } catch {
      db.prepare('DELETE FROM password_codes WHERE user_id=? AND digest=?').run(user.id, digest);
      // Same public response as unregistered addresses; do not reveal account existence.
      console.error('Password recovery email delivery failed. Check provider configuration.');
    }
    return result;
  }
  @Post('auth/register') register(@Body() b: Input, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    origin(req); limit(`register:${req.ip}`, 10);
    const contact = email(b.email), name = text(b.name, 'Name', 2, 100), password = text(b.password, 'Password', 12, 128);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(contact) || db.prepare('SELECT id FROM clients WHERE email=?').get(contact)) throw new ConflictException('This email cannot be registered. Sign in or ask your care administrator to arrange account access.');
    const id = randomUUID(), clientId = randomUUID(), salt = randomBytes(16).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO clients VALUES (?,?,?,?,?)').run(clientId, name, contact, '', '');
      // Public registration always grants the client role, regardless of supplied fields.
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(id, name, contact, salt, scryptSync(password, salt, 64).toString('hex'), 'client', 1, clientId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    issueRecovery(id);
    return this.session(res, id);
  }
  session(res: Response, userId: string) {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token,expires,user_id) VALUES (?,?,?)').run(hash(token), Date.now() + 8 * 3600_000, userId);
    res.setHeader('Set-Cookie', `ess_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
    return { authenticated: true, user: db.prepare('SELECT id,name,email,role,client_id FROM users WHERE id=?').get(userId) };
  }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    origin(req);
    const token = /(?:^|;\s*)ess_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
    res.setHeader('Set-Cookie', 'ess_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return { ok: true };
  }
  @Get('admin') dashboard(@Req() req: Request) {
    authorize(req);
    return { users: db.prepare('SELECT id,name,email,role,active,client_id FROM users ORDER BY name').all(), workers: db.prepare('SELECT * FROM workers ORDER BY name').all(), clients: db.prepare('SELECT * FROM clients ORDER BY name').all(), bookings: db.prepare('SELECT b.*,c.name client_name,c.email,c.phone,c.address,w.name worker_name FROM bookings b JOIN clients c ON c.id=b.client_id LEFT JOIN workers w ON w.id=b.worker_id ORDER BY b.date,b.hour').all() };
  }
  @Get('account') account(@Req() req: Request) {
    const user = signedIn(req);
    return { user, profile: user.client_id ? db.prepare('SELECT * FROM clients WHERE id=?').get(user.client_id) : null, bookings: user.client_id ? db.prepare('SELECT b.*,w.name worker_name FROM bookings b LEFT JOIN workers w ON w.id=b.worker_id WHERE b.client_id=? ORDER BY b.date DESC,b.hour DESC').all(user.client_id) : [] };
  }
  @Patch('account') updateAccount(@Body() b: Input, @Req() req: Request) {
    origin(req); const user = signedIn(req);
    if (!user.client_id) throw new BadRequestException('This account has no client profile.');
    const name = text(b.name, 'Name', 2, 100), phone = text(b.phone, 'Phone', 7, 30), address = text(b.address, 'Address', 5, 250);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE clients SET name=?,phone=?,address=? WHERE id=?').run(name, phone, address, user.client_id);
      db.prepare('UPDATE users SET name=? WHERE id=?').run(name, user.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  }
  @Post('admin/users') addUser(@Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req);
    const contact = email(b.email), name = text(b.name, 'Name', 2, 100), password = text(b.password, 'Password', 12, 128);
    if (!['admin', 'client'].includes(b.role)) throw new BadRequestException('Choose the client or admin role.');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(contact)) throw new ConflictException('An account already uses this email.');
    let clientId: string | null = b.client_id ? text(b.client_id, 'Client') : null;
    if (clientId) {
      const client = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId) as Input | undefined;
      if (!client || client.email.toLowerCase() !== contact) throw new BadRequestException('The selected client must have the same email as the account.');
      if (db.prepare('SELECT id FROM users WHERE client_id=?').get(clientId)) throw new ConflictException('That client already has an account.');
    } else if (db.prepare('SELECT id FROM clients WHERE email=?').get(contact)) throw new ConflictException('Select the existing client profile to grant access to its appointments.');
    const id = randomUUID(), salt = randomBytes(16).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (b.role === 'client' && !clientId) { clientId = randomUUID(); db.prepare('INSERT INTO clients VALUES (?,?,?,?,?)').run(clientId, name, contact, '', ''); }
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(id, name, contact, salt, scryptSync(password, salt, 64).toString('hex'), b.role, 1, clientId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    issueRecovery(id);
    return { id };
  }
  @Post('admin/users/:id/recovery') async issueUserRecovery(@Param('id') id: string, @Req() req: Request) {
    origin(req); authorize(req);
    const user = db.prepare('SELECT id,email FROM users WHERE id=? AND active=1').get(id) as Input | undefined;
    if (!user) throw new BadRequestException('Choose an active account.');
    return this.requestRecovery({ email: user.email }, req);
  }
  @Patch('admin/users/:id') updateUser(@Param('id') id: string, @Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Input | undefined;
    if (!user) throw new BadRequestException('User not found.');
    if (!['admin', 'client'].includes(b.role) || typeof b.active !== 'boolean') throw new BadRequestException('Choose a valid role and account status.');
    if (user.role === 'admin' && user.active && (b.role !== 'admin' || !b.active) && Number((db.prepare("SELECT COUNT(*) total FROM users WHERE role='admin' AND active=1").get() as Input).total) <= 1) throw new ConflictException('Keep at least one active administrator.');
    db.exec('BEGIN IMMEDIATE');
    try {
      let clientId = user.client_id;
      if (b.role === 'client' && !clientId) {
        if (db.prepare('SELECT id FROM clients WHERE email=?').get(user.email)) throw new ConflictException('A separate client profile already uses this email. Contact the owner to resolve it.');
        clientId = randomUUID(); db.prepare('INSERT INTO clients VALUES (?,?,?,?,?)').run(clientId, user.name, user.email, '', '');
      }
      db.prepare('UPDATE users SET role=?,active=?,client_id=? WHERE id=?').run(b.role, b.active ? 1 : 0, clientId, id);
      if (user.role !== b.role || !!user.active !== b.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  }
  @Post('admin/workers') addWorker(@Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req); const id = randomUUID(); db.prepare('INSERT INTO workers VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, ...workerInput(b)); return { id };
  }
  @Patch('admin/workers/:id') updateWorker(@Param('id') id: string, @Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req);
    if (!db.prepare('SELECT id FROM workers WHERE id=?').get(id)) throw new BadRequestException('Worker not found.');
    db.prepare('UPDATE workers SET name=?,bio=?,credential=?,expiry=?,verified=?,active=?,days=?,start_hour=?,end_hour=? WHERE id=?').run(...workerInput(b), id); return { ok: true };
  }
  @Delete('admin/workers/:id') archiveWorker(@Param('id') id: string, @Req() req: Request) {
    origin(req); authorize(req); db.prepare('UPDATE workers SET active=0 WHERE id=?').run(id); return { ok: true };
  }
  @Post('admin/clients') addClient(@Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req); const contact = email(b.email);
    if (db.prepare('SELECT id FROM clients WHERE email=?').get(contact)) throw new ConflictException('A client already uses this email.');
    const id = randomUUID(); db.prepare('INSERT INTO clients VALUES (?,?,?,?,?)').run(id, text(b.name, 'Name', 2, 100), contact, text(b.phone, 'Phone', 7, 30), text(b.address, 'Address', 5, 250)); return { id };
  }
  @Patch('admin/clients/:id') updateClient(@Param('id') id: string, @Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req); const contact = email(b.email);
    const linked = db.prepare('SELECT email FROM users WHERE client_id=?').get(id) as Input | undefined;
    if (linked && linked.email !== contact) throw new ConflictException('A linked client must keep the account email.');
    if (db.prepare('SELECT id FROM clients WHERE email=? AND id<>?').get(contact, id)) throw new ConflictException('A client already uses this email.');
    if (!db.prepare('SELECT id FROM clients WHERE id=?').get(id)) throw new BadRequestException('Client not found.');
    db.prepare('UPDATE clients SET name=?,email=?,phone=?,address=? WHERE id=?').run(text(b.name, 'Name', 2, 100), contact, text(b.phone, 'Phone', 7, 30), text(b.address, 'Address', 5, 250), id); return { ok: true };
  }
  @Patch('admin/bookings/:id') updateBooking(@Param('id') id: string, @Body() b: Input, @Req() req: Request) {
    origin(req); authorize(req);
    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(id) as Input | undefined;
    if (!booking) throw new BadRequestException('Booking not found.');
    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(b.status)) throw new BadRequestException('Invalid booking status.');
    const workerId = b.worker_id || null;
    if (['confirmed', 'completed'].includes(b.status) && !workerId) throw new BadRequestException('Assign a worker first.');
    if (workerId && ['pending', 'confirmed'].includes(b.status)) checkSlot(workerId, booking.date, booking.hour, booking.duration, id);
    if (workerId && !db.prepare('SELECT id FROM workers WHERE id=?').get(workerId)) throw new BadRequestException('Worker not found.');
    db.prepare('UPDATE bookings SET worker_id=?,status=? WHERE id=?').run(workerId, b.status, id); return { ok: true };
  }
}
@Module({ controllers: [AppController] }) class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes({ transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === 'body' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new BadRequestException('A JSON object is required.');
    return value;
  } });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4300), '127.0.0.1');
}
bootstrap().catch((error) => { console.error(error); process.exitCode = 1; });
