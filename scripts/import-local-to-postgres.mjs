import { DatabaseSync, backup } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');

if (!process.argv.includes('--confirm-empty-target')) throw new Error('Use --confirm-empty-target after reviewing the target.');
const target = new URL(process.env.DATABASE_URL || '');
if (target.pathname !== '/everydaysupportservices') throw new Error('Target must be the separate everydaysupportservices database.');
mkdirSync('.data/cloud-run', { recursive: true });
const snapshot = resolve(`.data/cloud-run/local-import-${Date.now()}.sqlite`);
const source = new DatabaseSync(resolve('.data/content.sqlite'), { readOnly: true });
await backup(source, snapshot); source.close();
const local = new DatabaseSync(snapshot, { readOnly: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const connection = await pool.connect();
try {
  await connection.query('BEGIN');
  await connection.query('LOCK TABLE clients,workers,users,bookings IN ACCESS EXCLUSIVE MODE');
  const tables = ['clients', 'workers', 'users', 'bookings'];
  for (const table of tables) if (Number((await connection.query(`SELECT count(*) total FROM ${table}`)).rows[0].total)) throw new Error('Target is not empty. No records were imported.');
  const counts = {};
  for (const table of tables) {
    const rows = local.prepare(`SELECT * FROM ${table}`).all(); counts[table] = rows.length;
    for (const row of rows) {
      const columns = Object.keys(row);
      await connection.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(',')})`, columns.map(key => row[key]));
    }
  }
  await connection.query('COMMIT');
  console.log(JSON.stringify({ imported: counts, localSnapshot: snapshot, passwordsAndRolesPreserved: true, activeSessionsCopied: false }));
} catch (error) { await connection.query('ROLLBACK'); console.error('Import failed: ' + error.message); process.exitCode = 1; }
finally { local.close(); connection.release(); await pool.end(); }
