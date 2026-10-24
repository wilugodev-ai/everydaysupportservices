// Local operator fallback when no administrator can sign in.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/recovery-code.mjs account@example.com');
  process.exitCode = 1;
} else {
  let db;
  try {
    const directory = resolve(fileURLToPath(new URL('../.data/', import.meta.url)));
    db = new DatabaseSync(resolve(directory, 'content.sqlite'), { readOnly: true });
    const user = db.prepare('SELECT id FROM users WHERE email=? AND active=1').get(email);
    if (!user) throw new Error('No active account matches this email.');
    const filename = `${createHash('sha256').update(user.id).digest('hex')}.txt`;
    const token = readFileSync(resolve(directory, 'password-recovery', filename), 'utf8').trim();
    console.log(`Private recovery code for ${email}:\n${token}\nUse it at http://127.0.0.1:3300/recover-admin. Do not share it in chat.`);
  } catch (error) {
    console.error(error.code === 'ENOENT' ? 'Start the API once to initialize recovery codes, then try again.' : error.message);
    process.exitCode = 1;
  } finally { db?.close(); }
}
